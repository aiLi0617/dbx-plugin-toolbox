mod documents;
mod patch;
mod tables;

pub(super) use documents::{sql_analyze, sql_format, xml_format};
pub(super) use patch::json_patch;
pub(super) use tables::{csv, dotenv, json_to_insert, table_transform, tsv};

use std::collections::BTreeMap;

use dbx_plugin_sdk::PluginError;
use num_bigint::BigInt;
use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::{json as value, value::RawValue, Value};

use super::{append, text_result, Args, ToolResult, MAX_RESULT_BYTES, RESULT_LIMIT};
use crate::helpers::bad;

const MAX_DEPTH: usize = 127;
const JSON_SPACE: &[char] = &[' ', '\n', '\r', '\t'];

struct JsonError {
    message: String,
    line: usize,
    column: usize,
}

impl From<serde_json::Error> for JsonError {
    fn from(error: serde_json::Error) -> Self {
        Self {
            line: error.line(),
            column: error.column(),
            message: error.to_string(),
        }
    }
}

impl JsonError {
    fn at(source: &str, offset: usize, message: &str) -> Self {
        let prefix = &source[..offset];
        let line = 1 + prefix.bytes().filter(|&byte| byte == b'\n').count();
        let column = 1 + prefix.rsplit('\n').next().unwrap_or("").len();
        Self {
            message: format!("{message} at line {line} column {column}"),
            line,
            column,
        }
    }
}

struct Tokens<'a>(&'a str);

impl<'a> Iterator for Tokens<'a> {
    type Item = &'a str;

    fn next(&mut self) -> Option<Self::Item> {
        let rest = self.0.trim_start_matches(JSON_SPACE);
        let first = *rest.as_bytes().first()?;
        let len = match first {
            b'"' => {
                let mut escaped = false;
                let end = rest
                    .as_bytes()
                    .iter()
                    .enumerate()
                    .skip(1)
                    .find_map(|(i, &byte)| {
                        if escaped {
                            escaped = false;
                        } else if byte == b'\\' {
                            escaped = true;
                        } else if byte == b'"' {
                            return Some(i + 1);
                        }
                        None
                    });
                end.expect("string in validated JSON")
            }
            b'{' | b'}' | b'[' | b']' | b',' | b':' => 1,
            _ => rest
                .find(&[' ', '\n', '\r', '\t', ',', '}', ']'][..])
                .unwrap_or(rest.len()),
        };
        let (token, remaining) = rest.split_at(len);
        self.0 = remaining;
        Some(token)
    }
}

fn parse(source: &str) -> Result<&RawValue, JsonError> {
    // RawValue verifies the complete document without converting any numeric token.
    let raw: &RawValue = serde_json::from_str(source)?;
    let mut depth = 0;
    for token in Tokens(raw.get()) {
        let error = match token {
            "{" | "[" => {
                depth += 1;
                (depth > MAX_DEPTH).then_some("JSON nesting exceeds 127 levels")
            }
            "}" | "]" => {
                depth -= 1;
                None
            }
            string if string.starts_with('"') && string.contains("\\u") => {
                serde_json::from_str::<String>(string)
                    .is_err()
                    .then_some("Invalid Unicode escape")
            }
            _ => None,
        };
        if let Some(message) = error {
            let offset = token.as_ptr() as usize - source.as_ptr() as usize;
            return Err(JsonError::at(source, offset, message));
        }
    }
    Ok(raw)
}

pub(super) fn read_json(source: &str) -> Result<&RawValue, PluginError> {
    parse(source).map_err(|error| bad(error.message))
}

pub(super) fn require_unique_json(source: &str) -> Result<(), PluginError> {
    let mut remaining = vec![read_json(source)?];
    while let Some(value) = remaining.pop() {
        match value.get().as_bytes().first() {
            Some(b'{') => remaining.extend(unique_object(value)?.into_values()),
            Some(b'[') => remaining.extend(items(value)?),
            _ => {}
        }
    }
    Ok(())
}

pub(super) fn json(args: Args) -> ToolResult {
    let action = args.text("action");
    let parsed = parse(args.text("text"));
    if action == "validate" {
        return Ok(match parsed {
            Ok(_) => value!({ "ok": true, "message": "Valid JSON" }),
            Err(error) => {
                value!({ "ok": false, "message": error.message, "line": error.line, "column": error.column })
            }
        });
    }
    let raw = parsed.map_err(|error| bad(error.message))?;
    let indent = (action == "format").then(|| args.number("indent"));
    Ok(value!({ "ok": true, "text": render(raw, indent)? }))
}

fn render(raw: &RawValue, indent: Option<usize>) -> Result<String, PluginError> {
    let mut result = String::with_capacity(raw.get().len());
    let mut tokens = Tokens(raw.get()).peekable();
    let mut depth = 0;
    let mut previous = "";
    let newline = |out: &mut String, depth| {
        if let Some(spaces) = indent {
            append(out, "\n")?;
            append(out, &" ".repeat(spaces * depth))?;
        }
        Ok(())
    };
    while let Some(token) = tokens.next() {
        match token {
            "{" | "[" => {
                append(&mut result, token)?;
                depth += 1;
                if !matches!(tokens.peek(), Some(&("}" | "]"))) {
                    newline(&mut result, depth)?;
                }
            }
            "}" | "]" => {
                depth -= 1;
                if !matches!(previous, "{" | "[") {
                    newline(&mut result, depth)?;
                }
                append(&mut result, token)?;
            }
            "," => {
                append(&mut result, token)?;
                newline(&mut result, depth)?;
            }
            ":" if indent.is_some() => append(&mut result, ": ")?,
            _ => append(&mut result, token)?,
        }
        previous = token;
    }
    Ok(result)
}

struct Members<'a>(Vec<(String, &'a RawValue)>);

impl<'de> Deserialize<'de> for Members<'de> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ObjectVisitor;
        impl<'de> Visitor<'de> for ObjectVisitor {
            type Value = Members<'de>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("a JSON object")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
                let mut pairs = Vec::new();
                while let Some(pair) = map.next_entry()? {
                    pairs.push(pair);
                }
                Ok(Members(pairs))
            }
        }
        deserializer.deserialize_map(ObjectVisitor)
    }
}

fn members(raw: &RawValue) -> Result<Vec<(String, &RawValue)>, PluginError> {
    serde_json::from_str::<Members<'_>>(raw.get())
        .map(|value| value.0)
        .map_err(|error| bad(error.to_string()))
}

fn items(raw: &RawValue) -> Result<Vec<&RawValue>, PluginError> {
    serde_json::from_str(raw.get()).map_err(|error| bad(error.to_string()))
}

fn pointer_token(token: &str) -> Result<String, PluginError> {
    let mut result = String::new();
    let mut chars = token.chars();
    while let Some(ch) = chars.next() {
        result.push(if ch == '~' {
            match chars.next() {
                Some('0') => '~',
                Some('1') => '/',
                _ => return Err(bad("Invalid JSON Pointer escape")),
            }
        } else {
            ch
        });
    }
    Ok(result)
}

pub(super) fn json_pointer(args: Args) -> ToolResult {
    let mut current = read_json(args.text("text"))?;
    let pointer = args.text("pointer");
    if pointer.is_empty() {
        return text_result(current.get());
    }
    let path = pointer
        .strip_prefix('/')
        .ok_or_else(|| bad("JSON Pointer must begin with /"))?;
    for token in path.split('/') {
        let token = pointer_token(token)?;
        let next = match current.get().as_bytes()[0] {
            b'{' => {
                let entries = members(current)?;
                let mut matching = entries.into_iter().filter(|(name, _)| name == &token);
                let found = matching.next().map(|(_, value)| value);
                if matching.next().is_some() {
                    return Err(bad("JSON Pointer matches a duplicate key"));
                }
                found
            }
            b'[' => {
                if token.is_empty()
                    || !token.bytes().all(|byte| byte.is_ascii_digit())
                    || (token.starts_with('0') && token.len() > 1)
                {
                    return Err(bad("Invalid JSON Pointer array index"));
                }
                let array = items(current)?;
                token
                    .parse::<usize>()
                    .ok()
                    .and_then(|index| array.get(index).copied())
            }
            _ => None,
        };
        current = next.ok_or_else(|| bad("JSON Pointer target does not exist"))?;
    }
    text_result(current.get())
}

fn unique_object(raw: &RawValue) -> Result<BTreeMap<String, &RawValue>, PluginError> {
    let mut result = BTreeMap::new();
    for (name, child) in members(raw)? {
        if result.insert(name, child).is_some() {
            return Err(bad("JSON comparison requires unique object keys"));
        }
    }
    Ok(result)
}

fn canonical_number(text: &str) -> (bool, String, BigInt) {
    let (mantissa, power) = text.split_once(['e', 'E']).unwrap_or((text, "0"));
    let (negative, magnitude) = mantissa
        .strip_prefix('-')
        .map_or((false, mantissa), |rest| (true, rest));
    let (whole, fraction) = magnitude.split_once('.').unwrap_or((magnitude, ""));
    let digits = format!("{whole}{fraction}");
    let significand = digits.trim_start_matches('0');
    if significand.is_empty() {
        return (false, "0".into(), BigInt::from(0));
    }
    let trimmed = significand.trim_end_matches('0');
    let exponent = BigInt::parse_bytes(power.as_bytes(), 10).expect("validated JSON exponent")
        - fraction.len()
        + (significand.len() - trimmed.len());
    (negative, trimmed.into(), exponent)
}

fn same_scalar(left: &str, right: &str) -> Result<bool, PluginError> {
    if left == right {
        return Ok(true);
    }
    let start = (left.as_bytes()[0], right.as_bytes()[0]);
    if matches!(start, (b'"', b'"')) {
        let unpack =
            |text| serde_json::from_str::<String>(text).map_err(|error| bad(error.to_string()));
        return Ok(unpack(left)? == unpack(right)?);
    }
    if matches!(start, (b'-' | b'0'..=b'9', b'-' | b'0'..=b'9')) {
        return Ok(canonical_number(left) == canonical_number(right));
    }
    Ok(false)
}

struct Changes {
    items: Vec<Value>,
    bytes: usize,
}

impl Changes {
    fn push(
        &mut self,
        path: &str,
        left: Option<&RawValue>,
        right: Option<&RawValue>,
    ) -> Result<(), PluginError> {
        let action = match (left, right) {
            (None, _) => "add",
            (_, None) => "remove",
            _ => "replace",
        };
        let item = value!({ "path": path, "action": action, "left": left.map(RawValue::get), "right": right.map(RawValue::get) });
        self.bytes += item.to_string().len() + 1;
        if self.bytes > MAX_RESULT_BYTES {
            return Err(bad(RESULT_LIMIT));
        }
        self.items.push(item);
        Ok(())
    }

    fn compare(
        &mut self,
        path: &mut String,
        left: Option<&RawValue>,
        right: Option<&RawValue>,
    ) -> Result<(), PluginError> {
        let (Some(left), Some(right)) = (left, right) else {
            return self.push(path, left, right);
        };
        let parent_length = path.len();
        match (left.get().as_bytes()[0], right.get().as_bytes()[0]) {
            (b'{', b'{') => {
                let left = unique_object(left)?;
                let mut right = unique_object(right)?;
                for (name, child) in left {
                    path.push('/');
                    path.push_str(&name.replace('~', "~0").replace('/', "~1"));
                    self.compare(path, Some(child), right.remove(&name))?;
                    path.truncate(parent_length);
                }
                for (name, child) in right {
                    path.push('/');
                    path.push_str(&name.replace('~', "~0").replace('/', "~1"));
                    self.push(path, None, Some(child))?;
                    path.truncate(parent_length);
                }
            }
            (b'[', b'[') => {
                let left = items(left)?;
                let right = items(right)?;
                for index in 0..left.len().max(right.len()) {
                    path.push('/');
                    path.push_str(&index.to_string());
                    self.compare(path, left.get(index).copied(), right.get(index).copied())?;
                    path.truncate(parent_length);
                }
            }
            _ if !same_scalar(left.get(), right.get())? => {
                self.push(path, Some(left), Some(right))?
            }
            _ => {}
        }
        Ok(())
    }
}

pub(super) fn json_diff(args: Args) -> ToolResult {
    let left = read_json(args.text("left"))?;
    let right = read_json(args.text("right"))?;
    let mut changes = Changes {
        items: Vec::new(),
        bytes: 0,
    };
    changes.compare(&mut String::new(), Some(left), Some(right))?;
    Ok(value!({ "equal": changes.items.is_empty(), "changes": changes.items }))
}

pub(super) fn ndjson(args: Args) -> ToolResult {
    let source = args.text("text");
    let mut result = String::new();
    if args.text("action") == "ndjson_to_json" {
        result.push('[');
        let mut first = true;
        for (index, line) in source
            .strip_prefix('\u{feff}')
            .unwrap_or(source)
            .lines()
            .enumerate()
        {
            if line.trim_matches(JSON_SPACE).is_empty() {
                continue;
            }
            let raw = read_json(line).map_err(|error| {
                bad(format!(
                    "Invalid NDJSON at line {}: {}",
                    index + 1,
                    error.message
                ))
            })?;
            if !first {
                append(&mut result, ",")?;
            }
            first = false;
            append(&mut result, raw.get())?;
        }
        append(&mut result, "]")?;
    } else {
        let raw = read_json(source)?;
        let rows = if raw.get().starts_with('[') {
            items(raw)?
        } else {
            vec![raw]
        };
        for (index, row) in rows.into_iter().enumerate() {
            if index != 0 {
                append(&mut result, "\n")?;
            }
            append(&mut result, &render(row, None)?)?;
        }
    }
    text_result(result)
}
