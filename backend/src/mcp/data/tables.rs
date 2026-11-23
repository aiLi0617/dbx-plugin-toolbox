use std::collections::{BTreeMap, HashMap, HashSet};

use dbx_plugin_sdk::PluginError;
use serde_json::{json, value::RawValue};

use super::{items, members, read_json, render};
use crate::helpers::bad;
use crate::mcp::{append, text_result, Args, ToolResult};

pub(in crate::mcp) fn csv(args: Args) -> ToolResult {
    let text = args.text("text");
    text_result(if args.text("action") == "csv_to_json" {
        delimited_to_json(text, ',')?
    } else {
        json_to_delimited(text, ',')?
    })
}

pub(in crate::mcp) fn tsv(args: Args) -> ToolResult {
    let text = args.text("text");
    text_result(if args.text("action") == "tsv_to_json" {
        delimited_to_json(text, '\t')?
    } else {
        json_to_delimited(text, '\t')?
    })
}

struct Table {
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
}

impl Table {
    fn parse(source: &str, delimiter: char) -> Result<Self, PluginError> {
        let mut records = delimited_rows(source, delimiter)?.into_iter();
        let headers = records
            .next()
            .ok_or_else(|| bad("Table requires a header row"))?;
        if headers.iter().any(|name| name.is_empty()) {
            return Err(bad("Table header names must not be empty"));
        }
        if headers.iter().collect::<HashSet<_>>().len() != headers.len() {
            return Err(bad("Table headers must be unique"));
        }
        let rows: Vec<_> = records.collect();
        for (index, row) in rows.iter().enumerate() {
            if row.len() != headers.len() {
                return Err(bad(format!(
                    "Row {} must have the same number of fields as the header",
                    index + 2
                )));
            }
        }
        Ok(Self { headers, rows })
    }

    fn column(&self, name: &str) -> Result<usize, PluginError> {
        self.headers
            .iter()
            .position(|header| header == name)
            .ok_or_else(|| bad(format!("Unknown column {name}")))
    }
}

struct TableOutput {
    separator: char,
    header_written: bool,
    rows: usize,
    text: String,
}

impl TableOutput {
    fn write<'a>(&mut self, columns: impl IntoIterator<Item = &'a str>) -> Result<(), PluginError> {
        if self.header_written {
            if self.rows == 8192 {
                return Err(bad("Table result exceeds 8,192 data rows"));
            }
            self.rows += 1;
            append(&mut self.text, "\n")?;
        } else {
            self.header_written = true;
        }
        for (index, field) in columns.into_iter().enumerate() {
            if index != 0 {
                let mut separator = [0; 4];
                append(&mut self.text, self.separator.encode_utf8(&mut separator))?;
            }
            write_field(&mut self.text, field, self.separator)?;
        }
        Ok(())
    }
}

fn table_columns(
    table: &Table,
    value: Option<&str>,
    required: bool,
) -> Result<Vec<usize>, PluginError> {
    let Some(text) = value else {
        return if required {
            Err(bad("Supply columns as a JSON array of header names"))
        } else {
            Ok((0..table.headers.len()).collect())
        };
    };
    super::read_json(text)?;
    let names: Vec<String> = serde_json::from_str(text)
        .map_err(|_| bad("Columns must be a JSON array of header names"))?;
    if names.is_empty() || names.iter().collect::<HashSet<_>>().len() != names.len() {
        return Err(bad("Select at least one column and use each name once"));
    }
    names.iter().map(|name| table.column(name)).collect()
}

fn join_tables(
    left: &Table,
    right: &Table,
    left_key: usize,
    right_key: usize,
    include_unmatched: bool,
    output: &mut TableOutput,
) -> Result<(), PluginError> {
    let additional: Vec<_> = (0..right.headers.len())
        .filter(|&index| index != right_key)
        .collect();
    let names: Vec<_> = additional
        .iter()
        .map(|&index| format!("right_{}", right.headers[index]))
        .collect();
    if names.iter().any(|name| left.headers.contains(name)) {
        return Err(bad("A right_ column conflicts with a left table header"));
    }
    output.write(left.headers.iter().chain(&names).map(String::as_str))?;

    let mut matches: HashMap<&str, Vec<&Vec<String>>> = HashMap::new();
    for row in &right.rows {
        matches.entry(&row[right_key]).or_default().push(row);
    }
    for row in &left.rows {
        if let Some(found) = matches.get(row[left_key].as_str()) {
            for right in found {
                output.write(
                    row.iter()
                        .map(String::as_str)
                        .chain(additional.iter().map(|&index| right[index].as_str())),
                )?;
            }
        } else if include_unmatched {
            output.write(
                row.iter()
                    .map(String::as_str)
                    .chain(std::iter::repeat_n("", additional.len())),
            )?;
        }
    }
    Ok(())
}

pub(in crate::mcp) fn table_transform(args: Args) -> ToolResult {
    let separator = if args.text("format") == "tsv" {
        '\t'
    } else {
        ','
    };
    let mut table = Table::parse(args.text("text"), separator)?;
    let mut output = TableOutput {
        separator,
        header_written: false,
        rows: 0,
        text: String::new(),
    };
    let action = args.text("action");
    let column = || {
        args.optional("column")
            .ok_or_else(|| bad("Supply a column name"))
    };
    if matches!(action, "join_inner" | "join_left") {
        let left_key = column()?;
        let right = Table::parse(
            args.optional("other")
                .ok_or_else(|| bad("Supply the right table"))?,
            separator,
        )?;
        let right_key = right.column(args.optional("otherColumn").unwrap_or(left_key))?;
        join_tables(
            &table,
            &right,
            table.column(left_key)?,
            right_key,
            action == "join_left",
            &mut output,
        )?;
    } else {
        let projection = if action == "select" {
            table_columns(&table, args.optional("columns"), true)?
        } else {
            (0..table.headers.len()).collect()
        };
        match action {
            "filter" => {
                let key = table.column(column()?)?;
                let value = args
                    .optional("value")
                    .ok_or_else(|| bad("Supply the exact filter value"))?;
                table.rows.retain(|row| row[key] == value);
            }
            "deduplicate" => {
                let keys = table_columns(&table, args.optional("columns"), false)?;
                let mut seen = HashSet::new();
                table.rows.retain(|row| {
                    seen.insert(
                        keys.iter()
                            .map(|&index| row[index].clone())
                            .collect::<Vec<_>>(),
                    )
                });
            }
            "sort" => {
                let key = table.column(column()?)?;
                let descending = args.text("order") == "descending";
                table.rows.sort_by(|left, right| {
                    let order = left[key].cmp(&right[key]);
                    if descending {
                        order.reverse()
                    } else {
                        order
                    }
                });
            }
            _ => {}
        }
        output.write(
            projection
                .iter()
                .map(|&index| table.headers[index].as_str()),
        )?;
        for row in &table.rows {
            output.write(projection.iter().map(|&index| row[index].as_str()))?;
        }
    }
    Ok(json!({ "text": output.text, "rows": output.rows }))
}

enum FieldState {
    Unquoted,
    Quoted,
    Closed,
}

fn delimited_rows(source: &str, separator: char) -> Result<Vec<Vec<String>>, PluginError> {
    let mut chars = source
        .strip_prefix('\u{feff}')
        .unwrap_or(source)
        .chars()
        .peekable();
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut state = FieldState::Unquoted;
    while let Some(ch) = chars.next() {
        if matches!(state, FieldState::Quoted) {
            if ch == '"' {
                if chars.next_if_eq(&'"').is_some() {
                    cell.push('"');
                } else {
                    state = FieldState::Closed;
                }
            } else {
                cell.push(ch);
            }
        } else if ch == separator {
            row.push(std::mem::take(&mut cell));
            state = FieldState::Unquoted;
        } else if ch == '\r' || ch == '\n' {
            if ch == '\r' {
                chars.next_if_eq(&'\n');
            }
            row.push(std::mem::take(&mut cell));
            rows.push(std::mem::take(&mut row));
            state = FieldState::Unquoted;
        } else if matches!(state, FieldState::Closed) {
            return Err(bad(format!(
                "Unexpected character after quoted field in row {}",
                rows.len() + 1
            )));
        } else if ch == '"' {
            if !cell.is_empty() {
                return Err(bad(format!("Unexpected quote in row {}", rows.len() + 1)));
            }
            state = FieldState::Quoted;
        } else {
            cell.push(ch);
        }
    }
    if matches!(state, FieldState::Quoted) {
        return Err(bad(format!(
            "Unclosed quoted field in row {}",
            rows.len() + 1
        )));
    }
    if !row.is_empty() || !cell.is_empty() || matches!(state, FieldState::Closed) {
        row.push(cell);
        rows.push(row);
    }
    Ok(rows)
}

fn delimited_to_json(source: &str, separator: char) -> Result<String, PluginError> {
    let mut rows = delimited_rows(source, separator)?.into_iter();
    let Some(headers) = rows.next() else {
        return Ok("[]".into());
    };
    if headers.iter().collect::<HashSet<_>>().len() != headers.len() {
        return Err(bad("Table headers must be unique"));
    }
    let mut output = String::from("[");
    for (index, cells) in rows.enumerate() {
        if cells.len() != headers.len() {
            return Err(bad(format!(
                "Row {} must have the same number of fields as the header",
                index + 2
            )));
        }
        if index != 0 {
            append(&mut output, ",")?;
        }
        // Build one JSON object at a time so repeated headers cannot blow up memory.
        let row = headers.iter().zip(cells.iter()).collect::<BTreeMap<_, _>>();
        let serialized = serde_json::to_string(&row).map_err(|error| bad(error.to_string()))?;
        append(&mut output, &serialized)?;
    }
    append(&mut output, "]")?;
    Ok(output)
}

type Row<'a> = Vec<(String, &'a RawValue)>;

fn json_rows(source: &str, wrap_scalars: bool) -> Result<Vec<Row<'_>>, PluginError> {
    let root = read_json(source)?;
    let rows = if root.get().starts_with('[') {
        items(root)?
    } else {
        vec![root]
    };
    rows.into_iter()
        .map(|row| {
            let entries = if row.get().starts_with('{') {
                members(row)?
            } else if wrap_scalars {
                vec![("value".into(), row)]
            } else {
                return Err(bad("Expected a JSON object for each row"));
            };
            if entries
                .iter()
                .map(|(key, _)| key)
                .collect::<HashSet<_>>()
                .len()
                != entries.len()
            {
                return Err(bad("JSON row contains duplicate column names"));
            }
            Ok(entries)
        })
        .collect()
}

fn cell_text(raw: &RawValue) -> Result<String, PluginError> {
    match raw.get() {
        "null" => Ok(String::new()),
        text if text.starts_with('"') => {
            serde_json::from_str(text).map_err(|error| bad(error.to_string()))
        }
        _ => render(raw, None),
    }
}

fn write_field(output: &mut String, field: &str, separator: char) -> Result<(), PluginError> {
    if field.is_empty() || field.contains([separator, '"', '\n', '\r']) {
        append(output, "\"")?;
        append(output, &field.replace('"', "\"\""))?;
        append(output, "\"")
    } else {
        append(output, field)
    }
}

fn json_to_delimited(source: &str, separator: char) -> Result<String, PluginError> {
    let rows = json_rows(source, true)?;
    let mut output = String::new();
    let mut seen = HashSet::new();
    let columns: Vec<_> = rows
        .iter()
        .flatten()
        .filter_map(|(name, _)| seen.insert(name).then_some(name))
        .collect();
    if columns.is_empty() {
        return Ok(output);
    }
    let delimiter = separator.to_string();
    for (index, column) in columns.iter().enumerate() {
        if index != 0 {
            append(&mut output, &delimiter)?;
        }
        write_field(&mut output, column, separator)?;
    }
    for row in &rows {
        append(&mut output, "\n")?;
        let fields = row
            .iter()
            .map(|(key, value)| (key, *value))
            .collect::<HashMap<_, _>>();
        for (index, column) in columns.iter().enumerate() {
            if index != 0 {
                append(&mut output, &delimiter)?;
            }
            let value = fields
                .get(column)
                .map(|raw| cell_text(raw))
                .transpose()?
                .unwrap_or_default();
            write_field(&mut output, &value, separator)?;
        }
    }
    Ok(output)
}

fn sql_identifier(name: &str) -> Result<String, PluginError> {
    if name.is_empty() || name.chars().any(char::is_control) {
        return Err(bad(
            "SQL identifiers must be nonempty and contain no control characters",
        ));
    }
    Ok(format!("\"{}\"", name.replace('"', "\"\"")))
}

fn sql_literal(raw: &RawValue) -> Result<String, PluginError> {
    match raw.get() {
        "null" => Ok("NULL".into()),
        "true" => Ok("TRUE".into()),
        "false" => Ok("FALSE".into()),
        text if text.starts_with(['{', '[']) => Err(bad("SQL INSERT values must be JSON scalars")),
        text if text.starts_with('"') => {
            let text = cell_text(raw)?;
            if text.contains('\0') {
                return Err(bad("SQL string literals cannot contain NUL"));
            }
            Ok(format!("'{}'", text.replace('\'', "''")))
        }
        number => Ok(number.into()),
    }
}

pub(in crate::mcp) fn json_to_insert(args: Args) -> ToolResult {
    let table = args
        .text("table")
        .split('.')
        .map(sql_identifier)
        .collect::<Result<Vec<_>, _>>()?
        .join(".");
    let rows = json_rows(args.text("text"), false)?;
    let first = rows
        .first()
        .filter(|row| !row.is_empty())
        .ok_or_else(|| bad("Provide at least one nonempty JSON row"))?;
    let columns = first.iter().map(|(key, _)| key).collect::<Vec<_>>();
    let names = columns
        .iter()
        .map(|key| sql_identifier(key))
        .collect::<Result<Vec<_>, _>>()?
        .join(", ");
    let mut output = String::new();
    append(
        &mut output,
        &format!("INSERT INTO {table} ({names}) VALUES\n"),
    )?;
    for (index, row) in rows.iter().enumerate() {
        let fields = row
            .iter()
            .map(|(key, value)| (key, *value))
            .collect::<HashMap<_, _>>();
        if fields.len() != columns.len() {
            return Err(bad("All INSERT rows must have the same columns"));
        }
        if index != 0 {
            append(&mut output, ",\n")?;
        }
        append(&mut output, "(")?;
        for (column_index, key) in columns.iter().enumerate() {
            if column_index != 0 {
                append(&mut output, ", ")?;
            }
            let raw = fields
                .get(key)
                .ok_or_else(|| bad("All INSERT rows must have the same columns"))?;
            append(&mut output, &sql_literal(raw)?)?;
        }
        append(&mut output, ")")?;
    }
    append(&mut output, ";")?;
    text_result(output)
}

fn valid_variable(key: &str) -> bool {
    let mut bytes = key.bytes();
    matches!(bytes.next(), Some(b'A'..=b'Z' | b'a'..=b'z' | b'_'))
        && bytes.all(|ch| ch.is_ascii_alphanumeric() || ch == b'_')
}

fn read_env_value<'a>(
    mut value: &'a str,
    lines: &mut std::iter::Enumerate<std::str::Lines<'a>>,
) -> Result<String, PluginError> {
    let Some(quote @ ('\'' | '"')) = value.chars().next() else {
        let end = value
            .char_indices()
            .find_map(|(i, ch)| {
                (ch == '#' && (i == 0 || value[..i].ends_with(char::is_whitespace))).then_some(i)
            })
            .unwrap_or(value.len());
        return Ok(value[..end].trim_end().to_owned());
    };
    value = &value[1..];
    let mut output = String::new();
    loop {
        let mut chars = value.char_indices();
        while let Some((index, ch)) = chars.next() {
            if ch == quote {
                let trailing = value[index + 1..].trim_start();
                if !trailing.is_empty() && !trailing.starts_with('#') {
                    return Err(bad("Unexpected text after quoted .env value"));
                }
                return Ok(output);
            }
            if ch == '\\' && quote == '"' {
                match chars.next().map(|(_, next)| next) {
                    Some('n') => output.push('\n'),
                    Some('r') => output.push('\r'),
                    Some('t') => output.push('\t'),
                    Some(next @ ('\\' | '"')) => output.push(next),
                    Some(other) => {
                        output.push('\\');
                        output.push(other);
                    }
                    None => output.push('\\'),
                }
            } else {
                output.push(ch);
            }
        }
        let (_, next) = lines
            .next()
            .ok_or_else(|| bad("Unclosed quoted .env value"))?;
        output.push('\n');
        value = next;
    }
}

pub(in crate::mcp) fn dotenv(args: Args) -> ToolResult {
    let source = args.text("text");
    let mut output = String::new();
    if args.text("action") == "env_to_json" {
        let mut variables = BTreeMap::new();
        let mut lines = source
            .strip_prefix('\u{feff}')
            .unwrap_or(source)
            .lines()
            .enumerate();
        while let Some((index, line)) = lines.next() {
            let line = line.trim_start();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let invalid = || bad(format!("Invalid .env declaration on line {}", index + 1));
            let (key, value) = line.split_once('=').ok_or_else(invalid)?;
            let key = key
                .strip_prefix("export")
                .filter(|rest| rest.starts_with(char::is_whitespace))
                .map_or(key, str::trim_start)
                .trim_end();
            if !valid_variable(key) {
                return Err(invalid());
            }
            let value = read_env_value(value.trim_start(), &mut lines)
                .map_err(|error| bad(format!("Line {}: {}", index + 1, error.message)))?;
            if variables.insert(key, value).is_some() {
                return Err(bad(format!(
                    "Duplicate .env variable on line {}",
                    index + 1
                )));
            }
        }
        output = json!(variables).to_string();
    } else {
        let raw = read_json(source)?;
        let mut seen = HashSet::new();
        for (name, raw) in members(raw)? {
            if !valid_variable(&name) || !seen.insert(name.clone()) {
                return Err(bad("JSON keys must be unique valid .env variable names"));
            }
            if raw.get().starts_with(['{', '[']) {
                return Err(bad(".env variables must be JSON scalars"));
            }
            if !output.is_empty() {
                append(&mut output, "\n")?;
            }
            let text = cell_text(raw)?;
            let escaped = text
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\r', "\\r")
                .replace('\t', "\\t");
            append(&mut output, &format!("{name}=\"{escaped}\""))?;
        }
    }
    text_result(output)
}
