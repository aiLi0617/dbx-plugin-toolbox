use dbx_plugin_sdk::PluginError;
use quick_xml::{
    events::{BytesStart, Event},
    Reader,
};
use sqlformat::{Dialect, FormatOptions, Indent, QueryParams};
use sqlparser::{
    ast::{SetExpr, Statement},
    dialect::{Dialect as LexerDialect, GenericDialect, MsSqlDialect, PostgreSqlDialect},
    parser::Parser,
    tokenizer::{Location, Token, TokenWithSpan, Tokenizer, Whitespace},
};
use std::collections::BTreeMap;

use crate::helpers::bad;
use crate::mcp::{append, text_result, Args, ToolResult};

fn sql_dialect(name: &str) -> (Dialect, &'static dyn LexerDialect) {
    match name {
        "postgresql" => (Dialect::PostgreSql, &PostgreSqlDialect {}),
        "sqlserver" => (Dialect::SQLServer, &MsSqlDialect {}),
        _ => (Dialect::Generic, &GenericDialect {}),
    }
}

pub(in crate::mcp) fn sql_format(args: Args) -> ToolResult {
    let input = args.text("text");
    let (dialect, lexer) = sql_dialect(args.text("dialect"));
    let options = FormatOptions {
        dialect,
        indent: Indent::Spaces(args.number("indent") as u8),
        ..FormatOptions::default()
    };
    let original = sql_tokens(lexer, input)?;
    check_sql_nesting(&original)?;
    let formatted = format_sql_literals(input, &original, &options)?;
    let formatted_tokens = sql_tokens(lexer, &formatted)?;
    if !significant_sql_tokens(&original).eq(significant_sql_tokens(&formatted_tokens)) {
        return Err(bad(
            "SQL could not be formatted without changing its tokens",
        ));
    }
    text_result(formatted)
}

fn check_sql_nesting(tokens: &[TokenWithSpan]) -> Result<(), PluginError> {
    let mut depth = 0_usize;
    for item in tokens {
        match item.token {
            Token::LParen | Token::LBracket => {
                depth += 1;
                if depth > super::MAX_DEPTH {
                    return Err(bad("SQL nesting exceeds 127 levels"));
                }
            }
            Token::RParen | Token::RBracket => depth = depth.saturating_sub(1),
            _ => {}
        }
    }
    Ok(())
}

pub(in crate::mcp) fn sql_analyze(args: Args) -> ToolResult {
    let input = args.text("text");
    let (_, dialect) = sql_dialect(args.text("dialect"));
    let tokens = sql_tokens(dialect, input)?;
    check_sql_nesting(&tokens)?;
    if tokens
        .iter()
        .filter(|item| !matches!(item.token, Token::Whitespace(_)))
        .take(2049)
        .count()
        > 2048
    {
        return Err(bad(
            "SQL analysis supports at most 2,048 non-whitespace tokens",
        ));
    }
    let statements =
        Parser::parse_sql(dialect, input).map_err(|error| bad(format!("Invalid SQL: {error}")))?;
    if statements.is_empty() || statements.len() > 256 {
        return Err(bad("SQL must contain 1 to 256 statements"));
    }
    let kinds = statements
        .iter()
        .map(summarize_statement)
        .collect::<Vec<_>>();
    let mut parameters: BTreeMap<&str, usize> = BTreeMap::new();
    let mut numbers = Vec::new();
    let mut numeric_count = 0;
    let offsets = sql_offsets(input);
    for item in &tokens {
        match &item.token {
            Token::Placeholder(name) => *parameters.entry(name).or_default() += 1,
            Token::Number(_, _) => {
                numeric_count += 1;
                if numbers.len() < 128 {
                    let start = sql_offset(&offsets, item.span.start)?;
                    let end = sql_offset(&offsets, item.span.end)?;
                    let raw = input
                        .get(start..end)
                        .ok_or_else(|| bad("Invalid SQL token range"))?;
                    numbers.push(raw);
                }
            }
            _ => {}
        }
    }
    Ok(serde_json::json!({
        "statementCount": statements.len(), "statements": kinds, "parameters": parameters,
        "numericLiterals": numbers, "numericLiteralCount": numeric_count
    }))
}

fn summarize_statement(statement: &Statement) -> serde_json::Value {
    let (kind, ctes) = match statement {
        Statement::Query(query) => {
            let kind = match query.body.as_ref() {
                SetExpr::Select(_) => "SELECT",
                SetExpr::Values(_) => "VALUES",
                SetExpr::SetOperation { .. } => "SET_OPERATION",
                _ => "QUERY",
            };
            (
                kind,
                query.with.as_ref().map_or(0, |with| with.cte_tables.len()),
            )
        }
        Statement::Insert(_) => ("INSERT", 0),
        Statement::Update(_) => ("UPDATE", 0),
        Statement::Delete(_) => ("DELETE", 0),
        Statement::CreateTable(_) => ("CREATE_TABLE", 0),
        Statement::Drop { .. } => ("DROP", 0),
        Statement::Truncate(_) => ("TRUNCATE", 0),
        Statement::StartTransaction { .. } => ("BEGIN", 0),
        Statement::Commit { .. } => ("COMMIT", 0),
        Statement::Rollback { .. } => ("ROLLBACK", 0),
        _ => ("OTHER", 0),
    };
    let first = statement.to_string();
    let leading_keyword = first
        .split(|character: char| !character.is_ascii_alphabetic())
        .find(|part| !part.is_empty())
        .unwrap_or("")
        .to_ascii_uppercase();
    serde_json::json!({ "kind": kind, "leadingKeyword": leading_keyword, "cteCount": ctes })
}

fn sql_tokens(dialect: &dyn LexerDialect, input: &str) -> Result<Vec<TokenWithSpan>, PluginError> {
    Tokenizer::new(dialect, input)
        .with_unescape(false)
        .tokenize_with_location()
        .map_err(|error| bad(format!("Invalid SQL: {error}")))
}

fn significant_sql_tokens(tokens: &[TokenWithSpan]) -> impl Iterator<Item = &Token> {
    tokens.iter().map(|item| &item.token).filter(|token| {
        !matches!(
            token,
            Token::Whitespace(Whitespace::Space | Whitespace::Newline | Whitespace::Tab)
        )
    })
}

fn format_sql_literals(
    input: &str,
    tokens: &[TokenWithSpan],
    options: &FormatOptions<'_>,
) -> Result<String, PluginError> {
    // The formatter's dialect tokenizer does not recognize every spelling of a
    // numeric or quoted literal. Give it opaque placeholders, then restore the
    // original bytes before comparing the final token sequence.
    let prefix = (0..)
        .map(|salt| format!("__DBX_SQL{salt}_"))
        .find(|prefix| !input.contains(prefix))
        .expect("finite input cannot contain every marker prefix");
    let offsets = sql_offsets(input);
    let mut masked = String::new();
    let mut literals = Vec::new();
    let mut previous = 0;
    for (index, item) in tokens.iter().enumerate() {
        if matches!(item.token, Token::Whitespace(_)) {
            continue;
        }
        let mut start = sql_offset(&offsets, item.span.start)?;
        let end = sql_offset(&offsets, item.span.end)?;
        let raw = input
            .get(start..end)
            .ok_or_else(|| bad("Invalid SQL token range"))?;
        if matches!(
            item.token,
            Token::Number(..) | Token::DollarQuotedString(_) | Token::Placeholder(_)
        ) || raw.contains(['\'', '"', '\x60'])
            || matches!(&item.token, Token::Word(word) if word.quote_style.is_some())
        {
            // SQL lexers typically treat a sign as a separate token. Keep an
            // adjacent sign attached so formatting also preserves -0 or +1.
            if matches!(item.token, Token::Number(..)) {
                if let Some(previous) = index.checked_sub(1).and_then(|index| tokens.get(index)) {
                    if matches!(previous.token, Token::Minus | Token::Plus)
                        && previous.span.end == item.span.start
                    {
                        start = sql_offset(&offsets, previous.span.start)?;
                    }
                }
            }
            let unmodified = input
                .get(previous..start)
                .ok_or_else(|| bad("Overlapping SQL token ranges"))?;
            masked.push_str(unmodified);
            masked.push_str(&format!(" '{prefix}{}' ", literals.len()));
            literals.push(&input[start..end]);
            previous = end;
        }
    }
    masked.push_str(&input[previous..]);
    let formatted = sqlformat::format(&masked, &QueryParams::None, options);
    let marker = regex::Regex::new(&format!("'{prefix}([0-9]+)'"))
        .map_err(|_| bad("SQL literal markers exceed formatter limits"))?;
    let mut output = String::new();
    let mut previous = 0;
    let mut restored = 0;
    for captures in marker.captures_iter(&formatted) {
        let whole = captures.get(0).expect("marker match");
        let index = captures[1]
            .parse::<usize>()
            .map_err(|_| bad("Invalid SQL literal marker"))?;
        if index != restored {
            return Err(bad("SQL literal order changed during formatting"));
        }
        append(&mut output, &formatted[previous..whole.start()])?;
        append(
            &mut output,
            literals
                .get(index)
                .ok_or_else(|| bad("Unexpected SQL literal marker"))?,
        )?;
        previous = whole.end();
        restored += 1;
    }
    if restored != literals.len() {
        return Err(bad("SQL formatter did not preserve every literal"));
    }
    append(&mut output, &formatted[previous..])?;
    Ok(output)
}

fn sql_offsets(input: &str) -> Vec<Vec<usize>> {
    let mut lines = Vec::new();
    let mut columns = Vec::new();
    for (offset, ch) in input.char_indices() {
        columns.push(offset);
        if ch == '\n' {
            lines.push(std::mem::take(&mut columns));
        }
    }
    columns.push(input.len());
    lines.push(columns);
    lines
}

fn sql_offset(offsets: &[Vec<usize>], location: Location) -> Result<usize, PluginError> {
    offsets
        .get((location.line as usize).wrapping_sub(1))
        .and_then(|line| line.get((location.column as usize).wrapping_sub(1)))
        .copied()
        .ok_or_else(|| bad("Invalid SQL token location"))
}

struct Element<'a> {
    opening: &'a str,
    start: usize,
    children: Vec<XmlNode<'a>>,
    preserve: bool,
}

enum XmlNode<'a> {
    Leaf(&'a str),
    Text(&'a str),
    Element {
        whole: &'a str,
        opening: &'a str,
        closing: &'a str,
        children: Vec<XmlNode<'a>>,
        preserve: bool,
    },
}

impl XmlNode<'_> {
    fn write(&self, output: &mut String, indent: usize, depth: usize) -> Result<(), PluginError> {
        match self {
            Self::Leaf(raw) | Self::Text(raw) => append(output, raw),
            Self::Element {
                whole,
                opening,
                closing,
                children,
                preserve,
            } => {
                let has_elements = children
                    .iter()
                    .any(|node| matches!(node, Self::Element { .. }));
                let has_text = children
                    .iter()
                    .any(|node| matches!(node, Self::Text(raw) if !xml_whitespace(raw)));
                if *preserve || has_text || !has_elements {
                    return append(output, whole);
                }
                append(output, opening)?;
                for child in children {
                    if matches!(child, Self::Text(raw) if xml_whitespace(raw)) {
                        continue;
                    }
                    append(output, "\n")?;
                    append(output, &" ".repeat((depth + 1) * indent))?;
                    child.write(output, indent, depth + 1)?;
                }
                append(output, "\n")?;
                append(output, &" ".repeat(depth * indent))?;
                append(output, closing)
            }
        }
    }
}

fn xml_whitespace(text: &str) -> bool {
    text.bytes()
        .all(|byte| matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
}

fn xml_error(error: impl std::fmt::Display) -> PluginError {
    bad(format!("Invalid XML: {error}"))
}

fn validate_attributes(tag: &BytesStart<'_>, inherited: bool) -> Result<bool, PluginError> {
    let mut preserve = inherited;
    for attribute in tag.attributes() {
        let attribute = attribute.map_err(xml_error)?;
        let value = attribute.unescape_value().map_err(xml_error)?;
        if attribute.key.as_ref() == b"xml:space" {
            preserve = match value.as_ref() {
                "preserve" => true,
                "default" => false,
                _ => return Err(bad("xml:space must be default or preserve")),
            };
        }
    }
    Ok(preserve)
}

pub(in crate::mcp) fn xml_format(args: Args) -> ToolResult {
    let source = args
        .text("text")
        .strip_prefix('\u{feff}')
        .unwrap_or(args.text("text"));
    let mut reader = Reader::from_str(source);
    reader.config_mut().check_comments = true;
    let mut nodes = Vec::new();
    let mut stack: Vec<Element<'_>> = Vec::new();
    let mut root_seen = false;
    loop {
        let start = reader.buffer_position() as usize;
        let event = reader.read_event().map_err(xml_error)?;
        let end = reader.buffer_position() as usize;
        let raw = &source[start..end];
        let node = match event {
            Event::Eof => break,
            Event::DocType(_) => return Err(bad("XML doctype declarations are unsupported")),
            Event::Start(tag) | Event::Empty(tag) => {
                let preserve =
                    validate_attributes(&tag, stack.last().is_some_and(|frame| frame.preserve))?;
                if stack.is_empty() && std::mem::replace(&mut root_seen, true) {
                    return Err(bad("XML must contain exactly one root element"));
                }
                if raw.ends_with("/>") {
                    XmlNode::Element {
                        whole: raw,
                        opening: raw,
                        closing: "",
                        children: Vec::new(),
                        preserve,
                    }
                } else {
                    if stack.len() == super::MAX_DEPTH {
                        return Err(bad("XML nesting exceeds 127 levels"));
                    }
                    stack.push(Element {
                        opening: raw,
                        start,
                        children: Vec::new(),
                        preserve,
                    });
                    continue;
                }
            }
            Event::End(_) => {
                let frame = stack.pop().ok_or_else(|| bad("Unexpected XML end tag"))?;
                XmlNode::Element {
                    whole: &source[frame.start..end],
                    opening: frame.opening,
                    closing: raw,
                    children: frame.children,
                    preserve: frame.preserve,
                }
            }
            Event::Text(_) if stack.is_empty() && xml_whitespace(raw) => continue,
            Event::Text(_) | Event::CData(_) | Event::GeneralRef(_) if stack.is_empty() => {
                return Err(bad("Unexpected content outside the XML root"));
            }
            Event::GeneralRef(reference) => {
                if reference.resolve_char_ref().map_err(xml_error)?.is_none()
                    && !matches!(&*reference, b"lt" | b"gt" | b"amp" | b"apos" | b"quot")
                {
                    return Err(bad("Unknown XML entity"));
                }
                XmlNode::Text(raw)
            }
            Event::Text(_) | Event::CData(_) => XmlNode::Text(raw),
            Event::Decl(_) if start != 0 => return Err(bad("The XML declaration must come first")),
            Event::Comment(_) | Event::Decl(_) | Event::PI(_) => XmlNode::Leaf(raw),
        };
        if let Some(parent) = stack.last_mut() {
            parent.children.push(node);
        } else {
            nodes.push(node);
        }
    }
    if !root_seen || !stack.is_empty() {
        return Err(bad("XML must contain a complete root element"));
    }
    let mut output = String::new();
    for (index, node) in nodes.iter().enumerate() {
        if index != 0 {
            append(&mut output, "\n")?;
        }
        node.write(&mut output, args.number("indent"), 0)?;
    }
    text_result(output)
}
