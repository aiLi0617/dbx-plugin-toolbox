use std::io::{Read, Write};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine};
use dbx_plugin_sdk::PluginError;
use flate2::{read::MultiGzDecoder, write::GzEncoder, Compression};
use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde_json::json;

use super::{text_result, Args, ToolResult, MAX_INPUT_BYTES, MAX_RESULT_BYTES, RESULT_LIMIT};
use crate::{crypto, helpers::bad};

pub(super) fn decode_base64(text: &str) -> Result<Vec<u8>, PluginError> {
    STANDARD
        .decode(text)
        .map_err(|_| bad("Input must be standard padded Base64"))
}

fn decoded_text(bytes: Vec<u8>) -> Result<String, PluginError> {
    String::from_utf8(bytes).map_err(|_| bad("Decoded data is not valid UTF-8"))
}

pub(super) fn hash(args: Args) -> ToolResult {
    if args.text("encoding") == "base64" {
        crypto::hash_op(
            json!({ "algorithm": args.text("algorithm"), "dataBase64": args.text("text") }),
        )
    } else {
        crypto::hash_op(json!({ "algorithm": args.text("algorithm"), "text": args.text("text") }))
    }
}

const URL_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

fn percent_decode(input: &str) -> Result<String, PluginError> {
    for (index, byte) in input.bytes().enumerate() {
        if byte == b'%'
            && !input
                .as_bytes()
                .get(index + 1..index + 3)
                .is_some_and(|bytes| bytes.iter().all(u8::is_ascii_hexdigit))
        {
            return Err(bad("Invalid URL percent escape"));
        }
    }
    percent_decode_str(input)
        .decode_utf8()
        .map(|text| text.into_owned())
        .map_err(|_| bad("Decoded URL component is not valid UTF-8"))
}

pub(super) fn url(args: Args) -> ToolResult {
    let text = args.text("text");
    match args.text("action") {
        "encode" => text_result(utf8_percent_encode(text, URL_COMPONENT).to_string()),
        "decode" => text_result(percent_decode(text)?),
        _ => {
            let url = url::Url::parse(text).map_err(|_| bad("Expected an absolute URL"))?;
            let mut query = Vec::new();
            for parameter in url
                .query()
                .unwrap_or("")
                .split('&')
                .filter(|value| !value.is_empty())
            {
                let (name, value) = parameter.split_once('=').unwrap_or((parameter, ""));
                let decode = |raw: &str| percent_decode(&raw.replace('+', " "));
                query.push([decode(name)?, decode(value)?]);
            }
            Ok(json!({
                "scheme": url.scheme(), "host": url.host_str(), "port": url.port(), "path": url.path(),
                "query": query, "fragment": url.fragment()
            }))
        }
    }
}

pub(super) fn gzip(args: Args) -> ToolResult {
    let text = args.text("text");
    let gzip_error = |error| bad(format!("Gzip processing failed: {error}"));
    if args.text("action") == "compress" {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(text.as_bytes()).map_err(gzip_error)?;
        return text_result(STANDARD.encode(encoder.finish().map_err(gzip_error)?));
    }
    let compressed = decode_base64(text)?;
    if compressed.is_empty() {
        return Err(bad("Expected a gzip stream"));
    }
    let mut output = Vec::new();
    MultiGzDecoder::new(compressed.as_slice())
        .take((MAX_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut output)
        .map_err(gzip_error)?;
    if output.len() > MAX_INPUT_BYTES {
        return Err(bad("Expanded gzip exceeds 64 KiB"));
    }
    text_result(decoded_text(output)?)
}

fn html_escape(input: &str) -> String {
    let mut output = String::new();
    for ch in input.chars() {
        let escaped = match ch {
            '&' => "&amp;",
            '<' => "&lt;",
            '>' => "&gt;",
            '"' => "&quot;",
            '\'' => "&#39;",
            _ => {
                output.push(ch);
                continue;
            }
        };
        output.push_str(escaped);
    }
    output
}

fn html_entity(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => {
            let digits = name.strip_prefix('#')?;
            let value = if let Some(hex) = digits.strip_prefix(['x', 'X']) {
                u32::from_str_radix(hex, 16).ok()?
            } else {
                digits.parse().ok()?
            };
            char::from_u32(value)
        }
    }
}

fn html_unescape(mut input: &str) -> String {
    let mut output = String::new();
    while let Some(index) = input.find('&') {
        output.push_str(&input[..index]);
        input = &input[index + 1..];
        let mut end = input.len().min(16);
        while !input.is_char_boundary(end) {
            end -= 1;
        }
        let next = &input[..end];
        if let Some((name, value)) = next
            .find(';')
            .and_then(|end| html_entity(&next[..end]).map(|value| (end, value)))
        {
            output.push(value);
            input = &input[name + 1..];
        } else {
            output.push('&');
        }
    }
    output.push_str(input);
    output
}

pub(super) fn escape(args: Args) -> ToolResult {
    let text = args.text("text");
    text_result(match (args.text("format"), args.text("action")) {
        ("json", "encode") => json!(text).to_string(),
        ("json", _) => serde_json::from_str::<String>(text)
            .map_err(|_| bad("Expected a valid quoted JSON string"))?,
        (_, "encode") => html_escape(text),
        _ => html_unescape(text),
    })
}

pub(super) fn regex(args: Args) -> ToolResult {
    let pattern = args.text("pattern");
    if pattern.len() > 4096 {
        return Err(bad("Regex pattern exceeds 4 KiB"));
    }
    let regex = regex::RegexBuilder::new(pattern)
        .size_limit(256 * 1024)
        .dfa_size_limit(256 * 1024)
        .nest_limit(64)
        .build()
        .map_err(|_| bad("Invalid, unsupported, or excessively complex regex"))?;
    let mut matches = regex
        .find_iter(args.text("text"))
        .take(101)
        .map(|found| json!({ "start": found.start(), "end": found.end(), "text": found.as_str() }))
        .collect::<Vec<_>>();
    let truncated = matches.len() == 101;
    matches.truncate(100);
    Ok(json!({ "matches": matches, "truncated": truncated }))
}

pub(super) fn text_diff(args: Args) -> ToolResult {
    let left = args.text("left");
    let right = args.text("right");
    let diff = similar::TextDiff::configure()
        .timeout(Duration::from_millis(250))
        .diff_lines(left, right);
    text_result(diff.unified_diff().header("before", "after").to_string())
}

pub(super) fn unicode_inspect(args: Args) -> ToolResult {
    let mut chars = Vec::new();
    let mut bytes = 0;
    for (offset, ch) in args.text("text").char_indices() {
        let mut encoded = [0; 4];
        let item = json!({
            "offset": offset, "char": ch.to_string(),
            "codePoint": format!("U+{:04X}", u32::from(ch)),
            "utf8Hex": hex::encode(ch.encode_utf8(&mut encoded))
        });
        bytes += item.to_string().len() + 1;
        if bytes > MAX_RESULT_BYTES {
            return Err(bad(RESULT_LIMIT));
        }
        chars.push(item);
    }
    Ok(json!({ "characters": chars }))
}

const FILE_TYPES: &[(&[u8], &str, &str)] = &[
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"\xff\xd8\xff", "jpeg", "image/jpeg"),
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
    (b"BM", "bmp", "image/bmp"),
    (b"II*\0", "tiff", "image/tiff"),
    (b"MM\0*", "tiff", "image/tiff"),
    (b"%PDF-", "pdf", "application/pdf"),
    (b"PK\x03\x04", "zip", "application/zip"),
    (b"PK\x05\x06", "zip", "application/zip"),
    (b"PK\x07\x08", "zip", "application/zip"),
    (b"Rar!\x1a\x07", "rar", "application/vnd.rar"),
    (b"7z\xbc\xaf\x27\x1c", "7z", "application/x-7z-compressed"),
    (b"\x1f\x8b", "gz", "application/gzip"),
    (b"BZh", "bz2", "application/x-bzip2"),
    (b"\xfd7zXZ\0", "xz", "application/x-xz"),
    (b"\0asm", "wasm", "application/wasm"),
    (b"SQLite format 3\0", "sqlite", "application/vnd.sqlite3"),
    (b"\x7fELF", "elf", "application/x-elf"),
    (
        b"MZ",
        "exe",
        "application/vnd.microsoft.portable-executable",
    ),
    (b"fLaC", "flac", "audio/flac"),
    (b"OggS", "ogg", "application/ogg"),
    (b"ID3", "mp3", "audio/mpeg"),
];

pub(super) fn file_signature(args: Args) -> ToolResult {
    let bytes = decode_base64(args.text("text"))?;
    let known = if bytes.starts_with(b"RIFF") {
        match bytes.get(8..12) {
            Some(b"WEBP") => Some(("webp", "image/webp")),
            Some(b"WAVE") => Some(("wav", "audio/wav")),
            _ => None,
        }
    } else if bytes.get(4..8) == Some(b"ftyp") {
        match bytes.get(8..12) {
            Some(b"avif" | b"avis") => Some(("avif", "image/avif")),
            Some(b"qt  ") => Some(("mov", "video/quicktime")),
            Some(_) => Some(("mp4", "video/mp4")),
            None => None,
        }
    } else {
        FILE_TYPES
            .iter()
            .find(|(signature, _, _)| bytes.starts_with(signature))
            .map(|&(_, extension, mime)| (extension, mime))
    };
    let (extension, mime) = known.unwrap_or(("unknown", "application/octet-stream"));
    Ok(json!({ "known": known.is_some(), "extension": extension, "mime": mime }))
}
