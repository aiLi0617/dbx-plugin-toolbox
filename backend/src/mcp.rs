mod data;
mod developer;
mod extended;
mod extra_tools;
mod inspect;
mod javascript;
mod locales;
mod math;
mod security;
mod text_tools;

use dbx_plugin_sdk::PluginError;
use serde_json::{json, Map, Value};

use crate::helpers::bad;
use extra_tools::EXTRA_TOOLS;

const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_RESULT_BYTES: usize = 128 * 1024;
const RESULT_LIMIT: &str = "Result exceeds 128 KiB. Use a smaller input.";

type ToolResult = Result<Value, PluginError>;

#[derive(Clone, Copy)]
enum FieldType {
    Text(&'static str, bool),
    Choice(&'static [&'static str], Option<&'static str>),
    Integer(i64, i64, Option<i64>, &'static str),
}

struct Field {
    name: &'static str,
    kind: FieldType,
}

const fn text(name: &'static str, description: &'static str) -> Field {
    Field {
        name,
        kind: FieldType::Text(description, true),
    }
}

const fn optional_text(name: &'static str, description: &'static str) -> Field {
    Field {
        name,
        kind: FieldType::Text(description, false),
    }
}

const fn choice(name: &'static str, choices: &'static [&'static str]) -> Field {
    Field {
        name,
        kind: FieldType::Choice(choices, None),
    }
}

const fn optional_choice(
    name: &'static str,
    choices: &'static [&'static str],
    default: &'static str,
) -> Field {
    Field {
        name,
        kind: FieldType::Choice(choices, Some(default)),
    }
}

const fn integer(name: &'static str, min: i64, max: i64, description: &'static str) -> Field {
    Field {
        name,
        kind: FieldType::Integer(min, max, None, description),
    }
}

const fn optional_integer(
    name: &'static str,
    min: i64,
    max: i64,
    default: i64,
    description: &'static str,
) -> Field {
    Field {
        name,
        kind: FieldType::Integer(min, max, Some(default), description),
    }
}

impl Field {
    fn required(&self) -> bool {
        !matches!(self.kind, FieldType::Text(_, false)) && self.default_value().is_none()
    }

    fn default_value(&self) -> Option<Value> {
        match self.kind {
            FieldType::Choice(_, Some(value)) => Some(json!(value)),
            FieldType::Integer(_, _, Some(value), _) => Some(json!(value)),
            _ => None,
        }
    }

    fn schema(&self) -> Value {
        let mut schema = match self.kind {
            FieldType::Text(description, _) => json!({
                "type": "string", "maxLength": MAX_INPUT_BYTES,
                "description": format!("{description} At most 64 KiB of UTF-8 input.")
            }),
            FieldType::Choice(choices, _) => json!({ "type": "string", "enum": choices }),
            FieldType::Integer(min, max, _, description) => json!({
                "type": "integer", "minimum": min, "maximum": max, "description": description
            }),
        };
        if let Some(default) = self.default_value() {
            schema["default"] = default;
        }
        schema
    }

    fn validate(&self, value: &Value) -> Result<(), PluginError> {
        let name = self.name;
        match self.kind {
            FieldType::Text(_, _) => {
                let input = value
                    .as_str()
                    .ok_or_else(|| bad(format!("{name} must be a string")))?;
                if input.len() > MAX_INPUT_BYTES {
                    return Err(bad(format!("{name} exceeds 64 KiB")));
                }
            }
            FieldType::Choice(choices, _) => {
                if !value.as_str().is_some_and(|item| choices.contains(&item)) {
                    return Err(bad(format!("{name} must be one of {}", choices.join(", "))));
                }
            }
            FieldType::Integer(min, max, _, _) => {
                if !value
                    .as_i64()
                    .is_some_and(|item| (min..=max).contains(&item))
                {
                    return Err(bad(format!(
                        "{name} must be an integer from {min} to {max}"
                    )));
                }
            }
        }
        Ok(())
    }
}

struct Args(Map<String, Value>);

impl Args {
    fn optional(&self, name: &str) -> Option<&str> {
        self.0.get(name).and_then(Value::as_str)
    }

    fn text(&self, name: &str) -> &str {
        self.0[name].as_str().expect("validated string argument")
    }

    fn number(&self, name: &str) -> usize {
        self.0[name]
            .as_u64()
            .expect("validated nonnegative integer argument") as usize
    }
}

struct Tool {
    name: &'static str,
    description: &'static str,
    fields: &'static [Field],
    run: fn(Args) -> ToolResult,
    idempotent: bool,
}

impl Tool {
    fn definition(&self, locale: locales::Locale) -> Value {
        let properties = self
            .fields
            .iter()
            .map(|field| (field.name.to_owned(), field.schema()))
            .collect::<Map<_, _>>();
        let required = self
            .fields
            .iter()
            .filter(|field| field.required())
            .map(|field| field.name)
            .collect::<Vec<_>>();
        json!({
            "name": self.name, "description": locale.description(self.name, self.description),
            "inputSchema": {
                "type": "object", "properties": properties, "required": required, "additionalProperties": false
            },
            "annotations": {
                "readOnlyHint": true, "destructiveHint": false,
                "idempotentHint": self.idempotent, "openWorldHint": false
            }
        })
    }

    fn invoke(&self, mut arguments: Map<String, Value>) -> ToolResult {
        if arguments
            .keys()
            .any(|name| !self.fields.iter().any(|field| field.name == name))
        {
            return Err(bad("Unexpected tool argument"));
        }
        for field in self.fields {
            if let Some(value) = arguments.get(field.name) {
                field.validate(value)?;
            } else if let Some(default) = field.default_value() {
                arguments.insert(field.name.to_owned(), default);
            } else if field.required() {
                return Err(bad(format!("Missing {}", field.name)));
            }
        }
        (self.run)(Args(arguments))
    }
}

const TOOLS: &[Tool] = &[
    Tool { name: "json_patch", description: "Apply RFC 6902 JSON Patch or RFC 7396 Merge Patch without rounding numeric values.", fields: &[optional_choice("action", &["patch", "merge"], "patch"), text("text", "Original JSON source."), text("patch", "JSON Patch operation array or JSON Merge Patch document as text.")], run: data::json_patch, idempotent: true },
    Tool { name: "table_transform", description: "Select columns, filter exact text, deduplicate, sort lexically, or join CSV/TSV tables while keeping every cell as a string.", fields: &[choice("action", &["select", "filter", "deduplicate", "sort", "join_inner", "join_left"]), optional_choice("format", &["csv", "tsv"], "csv"), text("text", "Left or input table including a header row."), optional_text("columns", "JSON array of column names for select or the deduplication key."), optional_text("column", "Filter, sort, or left join key column."), optional_text("value", "Exact filter cell value, including empty text."), optional_text("other", "Right table for a join, using the same delimiter."), optional_text("otherColumn", "Right join key. Defaults to the left key's header."), optional_choice("order", &["ascending", "descending"], "ascending")], run: data::table_transform, idempotent: true },
    Tool { name: "sql_analyze", description: "Parse SQL text and report statement kinds, CTE counts, bind placeholders, and original numeric lexemes.", fields: &[text("text", "SQL source text."), optional_choice("dialect", &["sql", "postgresql", "sqlserver"], "sql")], run: data::sql_analyze, idempotent: true },
    Tool { name: "json", description: "Validate, format, or minify JSON while preserving every number, key, and string as written.", fields: &[choice("action", &["validate", "format", "minify"]), text("text", "JSON source text."), optional_integer("indent", 0, 8, 2, "Spaces per level for format.")], run: data::json, idempotent: true },
    Tool { name: "json_pointer", description: "Read a JSON value using an RFC 6901 JSON Pointer.", fields: &[text("text", "JSON source text."), text("pointer", "JSON Pointer using slash-separated tokens. An empty string selects the root.")], run: data::json_pointer, idempotent: true },
    Tool { name: "json_diff", description: "Compare JSON structurally with exact number comparisons and return changes at JSON Pointer paths.", fields: &[text("left", "Original JSON source text."), text("right", "Updated JSON source text.")], run: data::json_diff, idempotent: true },
    Tool { name: "csv", description: "Convert CSV with headers and JSON text. CSV cells are read as strings.", fields: &[choice("action", &["csv_to_json", "json_to_csv"]), text("text", "CSV or JSON source text.")], run: data::csv, idempotent: true },
    Tool { name: "tsv", description: "Convert TSV with headers and JSON text. TSV cells are read as strings.", fields: &[choice("action", &["tsv_to_json", "json_to_tsv"]), text("text", "TSV or JSON source text.")], run: data::tsv, idempotent: true },
    Tool { name: "ndjson", description: "Convert newline-delimited JSON to a JSON array or emit one JSON value per line.", fields: &[choice("action", &["ndjson_to_json", "json_to_ndjson"]), text("text", "NDJSON or JSON source text.")], run: data::ndjson, idempotent: true },
    Tool { name: "dotenv", description: "Convert .env text and JSON. Variable references remain literal.", fields: &[choice("action", &["env_to_json", "json_to_env"]), text("text", ".env or JSON source text.")], run: data::dotenv, idempotent: true },
    Tool { name: "json_to_insert", description: "Generate standard SQL INSERT text from a JSON object or an array of matching scalar rows.", fields: &[text("text", "JSON row or array of rows."), text("table", "Table name, optionally qualified with dots between identifiers.")], run: data::json_to_insert, idempotent: true },
    Tool { name: "sql_format", description: "Format SQL text and preserve its literals, placeholders, and keyword case.", fields: &[text("text", "SQL source text."), optional_choice("dialect", &["sql", "postgresql", "sqlserver"], "sql"), optional_integer("indent", 0, 8, 2, "Spaces per level.")], run: data::sql_format, idempotent: true },
    Tool { name: "xml_format", description: "Format element-only XML while preserving mixed content, CDATA and xml:space.", fields: &[text("text", "XML document."), optional_integer("indent", 0, 8, 2, "Spaces per level.")], run: data::xml_format, idempotent: true },
    Tool { name: "hash", description: "Compute a hexadecimal hash or checksum of UTF-8 text or Base64-encoded bytes.", fields: &[choice("algorithm", &["sha256", "sha384", "sha512", "sha3-256", "sm3", "sha1", "sha224", "md5", "crc32"]), text("text", "Data to hash."), optional_choice("encoding", &["utf8", "base64"], "utf8")], run: text_tools::hash, idempotent: true },
    Tool { name: "url", description: "Encode or decode a URL component, or parse an absolute URL and list its query parameters.", fields: &[choice("action", &["encode", "decode", "parse"]), text("text", "URL component or absolute URL.")], run: text_tools::url, idempotent: true },
    Tool { name: "gzip", description: "Compress UTF-8 text to Base64 gzip or decompress Base64 gzip to UTF-8 text.", fields: &[choice("action", &["compress", "decompress"]), text("text", "UTF-8 text or standard padded Base64 gzip.")], run: text_tools::gzip, idempotent: true },
    Tool { name: "escape", description: "Escape or unescape HTML special characters or a JSON string literal.", fields: &[choice("action", &["encode", "decode"]), choice("format", &["html", "json"]), text("text", "Input text. JSON decode expects a complete quoted JSON string.")], run: text_tools::escape, idempotent: true },
    Tool { name: "regex", description: "Find up to 100 regex matches with byte offsets. Supports Rust regex syntax.", fields: &[text("text", "UTF-8 input text."), text("pattern", "Regex pattern. Inline flags such as (?i) are supported.")], run: text_tools::regex, idempotent: true },
    Tool { name: "text_diff", description: "Generate a unified line diff from two text inputs.", fields: &[text("left", "Original text."), text("right", "Updated text.")], run: text_tools::text_diff, idempotent: true },
    Tool { name: "unicode_inspect", description: "List Unicode code points and the UTF-8 bytes for each character.", fields: &[text("text", "Text to inspect.")], run: text_tools::unicode_inspect, idempotent: true },
    Tool { name: "file_signature", description: "Identify a common file format from Base64-encoded header bytes.", fields: &[text("text", "Standard padded Base64 of the first bytes of a file.")], run: text_tools::file_signature, idempotent: true },
    Tool { name: "timestamp", description: "Convert exact Unix timestamps and RFC 3339 datetimes. Timestamps are decimal strings.", fields: &[choice("action", &["to_rfc3339", "from_rfc3339"]), text("text", "Signed integer timestamp or RFC 3339 datetime with an explicit offset."), optional_choice("unit", &["s", "ms", "us", "ns"], "s")], run: developer::timestamp, idempotent: true },
    Tool { name: "cron", description: "Calculate the next UTC occurrences of a five-field cron expression.", fields: &[text("expression", "Five-field cron expression."), text("after", "RFC 3339 start time. Only later occurrences are returned."), optional_integer("count", 1, 10, 1, "Number of occurrences.")], run: developer::cron, idempotent: true },
    Tool { name: "cidr", description: "Calculate an IPv4 or IPv6 subnet and its exact address count.", fields: &[text("text", "IPv4 or IPv6 address with explicit slash prefix.")], run: developer::cidr, idempotent: true },
    Tool { name: "ipv4_range", description: "Summarize an inclusive IPv4 address range with the minimum set of CIDR blocks.", fields: &[text("start", "First IPv4 address."), text("end", "Last IPv4 address.")], run: developer::ipv4_range, idempotent: true },
    Tool { name: "semver", description: "Compare two semantic versions or test a version against a SemVer requirement.", fields: &[choice("action", &["compare", "matches"]), text("version", "Semantic version."), text("other", "Second version for compare, or a Cargo-style SemVer requirement for matches.")], run: developer::semver, idempotent: true },
    Tool { name: "radix", description: "Convert signed integers exactly between bases 2 and 36. Returns lowercase digits.", fields: &[text("text", "Signed digit string without a base prefix, up to 4,096 digits."), integer("from", 2, 36, "Source base."), integer("to", 2, 36, "Target base.")], run: math::radix, idempotent: true },
    Tool { name: "unit_convert", description: "Convert length, mass, or storage units using exact decimal or fraction results.", fields: &[text("value", "Signed decimal string."), text("from", "Source unit, such as m, lb, MB, or MiB."), text("to", "Target unit in the same category.")], run: math::unit_convert, idempotent: true },
    Tool { name: "percentage", description: "Calculate percentage of, share, and percentage change using exact arithmetic.", fields: &[text("x", "First signed decimal string."), text("y", "Second signed decimal string.")], run: math::percentage, idempotent: true },
    Tool { name: "cert", description: "Inspect one PEM X.509 certificate or one OpenSSH public key.", fields: &[text("pem", "PEM X.509 certificate or OpenSSH public key line.")], run: inspect::cert, idempotent: true },
    Tool { name: "jwt_decode", description: "Decode the header and payload of a compact JWT as exact JSON text. No signature verification is performed.", fields: &[text("text", "Three-section compact JWT.")], run: inspect::jwt_decode, idempotent: true },
    Tool { name: "iban", description: "Validate an IBAN's country format and MOD-97 checksum.", fields: &[text("text", "IBAN, with optional spaces.")], run: inspect::iban, idempotent: true },
];

pub fn list_tools(params: &Value) -> Value {
    let locale = locales::Locale::from_params(params);
    json!({ "tools": TOOLS.iter().chain(EXTRA_TOOLS).map(|tool| tool.definition(locale)).collect::<Vec<_>>() })
}

pub fn call_tool(mut params: Value) -> ToolResult {
    let name = params
        .get("tool")
        .and_then(Value::as_str)
        .ok_or_else(|| bad("tool must be a string"))?;
    let Some(tool) = TOOLS
        .iter()
        .chain(EXTRA_TOOLS)
        .find(|tool| tool.name == name)
    else {
        return Ok(tool_error("Unknown DBX Toolbox tool"));
    };
    let Some(Value::Object(arguments)) = params
        .as_object_mut()
        .and_then(|object| object.remove("arguments"))
    else {
        return Ok(tool_error("arguments must be an object"));
    };
    match tool.invoke(arguments) {
        Ok(result) => {
            let content = result.to_string();
            if content.len() > MAX_RESULT_BYTES {
                return Ok(tool_error(RESULT_LIMIT));
            }
            Ok(json!({
                "content": [{ "type": "text", "text": content }],
                "structuredContent": result,
                "isError": false
            }))
        }
        Err(error) => Ok(tool_error(&error.message)),
    }
}

fn tool_error(message: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": message }], "isError": true })
}

fn text_result(text: impl Into<String>) -> ToolResult {
    Ok(json!({ "text": text.into() }))
}

fn append(output: &mut String, text: &str) -> Result<(), PluginError> {
    if output.len() + text.len() > MAX_RESULT_BYTES {
        return Err(bad(RESULT_LIMIT));
    }
    output.push_str(text);
    Ok(())
}
