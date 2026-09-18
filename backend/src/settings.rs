use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use dbx_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::helpers::{bad, err};

const PLUGIN_ID: &str = "io.github.aili0617.toolbox";
const PREFS_VERSION: u32 = 1;

const KNOWN_TOOL_IDS: &[&str] = &[
    "json",
    "jsonpath",
    "base-convert",
    "timestamp",
    "color",
    "cron",
    "base64",
    "url",
    "html-entities",
    "punycode",
    "data-uri",
    "quoted-printable",
    "jwt",
    "aes",
    "hmac-sha256",
    "xor",
    "rsa",
    "cert",
    "code-format",
    "hash",
    "uuid",
    "password",
    "qrcode",
    "lorem",
    "totp",
    "whitespace",
    "case",
    "stats",
    "regex",
    "diff",
    "markdown",
    "slugify",
    "strip-html",
    "sql-escape",
    "unicode-inspect",
    "symmetric-key",
    "key-pair",
];

const DEFAULT_ENABLED: &[&str] = &["json", "base64", "code-format", "hash", "uuid", "color"];

#[derive(Serialize, Deserialize)]
struct PrefsFile {
    version: u32,
    #[serde(rename = "enabledToolIds")]
    enabled_tool_ids: Vec<String>,
}

fn known_ids() -> HashSet<&'static str> {
    KNOWN_TOOL_IDS.iter().copied().collect()
}

fn default_ids() -> Vec<String> {
    DEFAULT_ENABLED.iter().map(|id| (*id).to_string()).collect()
}

fn canonical_id(id: String) -> String {
    match id.as_str() {
        "json-yaml" | "json-csv" | "json-xml" | "json-toml" | "json-sql" | "json-ts" | "json-convert" => {
            "json".to_string()
        }
        "duration" => "timestamp".to_string(),
        "hex" | "base32" | "base58" => "base64".to_string(),
        "unicode" => "html-entities".to_string(),
        "sm4" => "aes".to_string(),
        "hmac-sm3" => "hmac-sha256".to_string(),
        "sm2" => "rsa".to_string(),
        "ssh-fingerprint" => "cert".to_string(),
        "sql" | "xml" | "yaml" | "html" | "css" => "code-format".to_string(),
        "ulid" | "nanoid" => "uuid".to_string(),
        "random-bytes" => "password".to_string(),
        "crc32" => "hash".to_string(),
        "naming" => "case".to_string(),
        "lines" => "whitespace".to_string(),
        _ => id,
    }
}

fn filter_known(ids: Vec<String>) -> Vec<String> {
    let split_old_json_tools = ids.iter().any(|id| id == "json-convert") && ids.iter().any(|id| id == "json");
    let known = known_ids();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids {
        let id = canonical_id(id);
        if known.contains(id.as_str()) && seen.insert(id.clone()) {
            out.push(id);
        }
    }
    if split_old_json_tools && seen.insert("code-format".to_string()) {
        match out.iter().position(|id| id == "json") {
            Some(at) => out.insert(at + 1, "code-format".to_string()),
            None => out.push("code-format".to_string()),
        }
    }
    out
}

fn prefs_path() -> Result<PathBuf, PluginError> {
    let base = dirs::data_dir().ok_or_else(|| err("Cannot resolve user data directory"))?;
    Ok(base.join(PLUGIN_ID).join("prefs.json"))
}

fn read_ids() -> Result<Vec<String>, PluginError> {
    let path = prefs_path()?;
    if !path.exists() {
        return Ok(default_ids());
    }
    let text = fs::read_to_string(&path).map_err(|error| err(format!("Failed to read prefs: {error}")))?;
    let parsed: PrefsFile = serde_json::from_str(&text).map_err(|error| err(format!("Invalid prefs.json: {error}")))?;
    let cleaned = filter_known(parsed.enabled_tool_ids);
    Ok(if cleaned.is_empty() { default_ids() } else { cleaned })
}

fn write_ids(ids: Vec<String>) -> Result<Vec<String>, PluginError> {
    let cleaned = filter_known(ids);
    if cleaned.is_empty() {
        return Err(bad("Keep at least one known tool"));
    }
    let path = prefs_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| err(format!("Failed to create prefs directory: {error}")))?;
    }
    let payload = PrefsFile {
        version: PREFS_VERSION,
        enabled_tool_ids: cleaned.clone(),
    };
    let text = serde_json::to_string_pretty(&payload).map_err(|error| err(error.to_string()))?;
    fs::write(&path, text).map_err(|error| err(format!("Failed to write prefs: {error}")))?;
    let _ = fs::remove_file(path.with_extension("json.tmp"));
    Ok(cleaned)
}

fn ids_from_params(params: &Value) -> Result<Vec<String>, PluginError> {
    let raw = params
        .get("enabledToolIds")
        .and_then(Value::as_array)
        .ok_or_else(|| bad("enabledToolIds must be an array"))?;
    let mut ids = Vec::new();
    for item in raw {
        let id = item.as_str().ok_or_else(|| bad("enabledToolIds must be strings"))?;
        if id.is_empty() || id.len() > 64 {
            return Err(bad("Invalid tool id"));
        }
        ids.push(id.to_string());
    }
    Ok(ids)
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    match method {
        "toolbox/prefs/get" => {
            let ids = read_ids()?;
            Ok(json!({ "version": PREFS_VERSION, "enabledToolIds": ids }))
        }
        "toolbox/prefs/set" => {
            let ids = write_ids(ids_from_params(&params)?)?;
            Ok(json!({ "version": PREFS_VERSION, "enabledToolIds": ids }))
        }
        _ => Err(PluginError::method_not_found(method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_known_and_unique() {
        let known = known_ids();
        let mut seen = HashSet::new();
        for id in DEFAULT_ENABLED {
            assert!(known.contains(id), "unknown default id {id}");
            assert!(seen.insert(*id), "duplicate default id {id}");
        }
    }

    #[test]
    fn filter_known_drops_unknown_and_dedupes() {
        let cleaned = filter_known(vec![
            "json".into(),
            "missing-tool".into(),
            "json".into(),
            "uuid".into(),
            "".into(),
        ]);
        assert_eq!(cleaned, vec!["json".to_string(), "uuid".to_string()]);
    }

    #[test]
    fn remaps_legacy_json_convert_ids() {
        let cleaned = filter_known(vec!["json-yaml".into(), "json-csv".into(), "jsonpath".into()]);
        assert_eq!(cleaned, vec!["json".to_string(), "jsonpath".to_string()]);
    }

    #[test]
    fn remaps_legacy_code_format_ids() {
        let cleaned = filter_known(vec!["sql".into(), "xml".into(), "json-convert".into()]);
        assert_eq!(cleaned, vec!["code-format".to_string(), "json".to_string()]);
    }

    #[test]
    fn keeps_code_format_when_old_json_pair_enabled() {
        let cleaned = filter_known(vec![
            "json-convert".into(),
            "base64".into(),
            "json".into(),
            "hash".into(),
        ]);
        assert_eq!(
            cleaned,
            vec![
                "json".to_string(),
                "code-format".to_string(),
                "base64".to_string(),
                "hash".to_string(),
            ]
        );
    }
}
