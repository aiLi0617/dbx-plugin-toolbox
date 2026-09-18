use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use dbx_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::helpers::{bad, err, opt_str, str_param};

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

const MAX_EXPORT_BYTES: usize = 8 * 1024 * 1024;
static LAST_SAVED: Mutex<Option<PathBuf>> = Mutex::new(None);

fn save_file(params: Value) -> Result<Value, PluginError> {
    let name = sanitize_export_name(str_param(&params, "fileName").unwrap_or("barcode.png"));
    let title = opt_str(&params, "title").unwrap_or("Save PNG");
    let bytes = decode_export_data(str_param(&params, "data")?)?;
    let start_dir = dirs::download_dir().or_else(dirs::home_dir);
    let Some(mut path) = pick_save_path(title, &name, start_dir.as_deref()) else {
        return Ok(json!({ "cancelled": true }));
    };
    path = ensure_png(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| err(format!("Failed to create folder: {error}")))?;
    }
    fs::write(&path, bytes).map_err(|error| err(format!("Failed to save file: {error}")))?;
    if let Ok(mut last) = LAST_SAVED.lock() {
        *last = Some(path.clone());
    }
    Ok(json!({
        "cancelled": false,
        "path": path.to_string_lossy(),
        "fileName": path.file_name().and_then(|value| value.to_str()).unwrap_or(&name),
    }))
}

fn reveal_file(params: Value) -> Result<Value, PluginError> {
    let requested = PathBuf::from(str_param(&params, "path")?);
    let last = LAST_SAVED.lock().ok().and_then(|guard| guard.clone());
    let Some(path) = last.filter(|saved| export_paths_match(saved, &requested)) else {
        return Err(bad("File not found"));
    };
    if !path.is_file() {
        return Err(bad("File not found"));
    }
    open_in_folder(&path)?;
    Ok(json!({ "ok": true }))
}

fn pick_save_path(title: &str, name: &str, start_dir: Option<&Path>) -> Option<PathBuf> {
    let title = title.to_string();
    let name = name.to_string();
    let start_dir = start_dir.map(Path::to_path_buf);
    let worker = std::thread::Builder::new()
        .name("save-dialog".into())
        .spawn(move || {
            let mut dialog = rfd::FileDialog::new();
            dialog = dialog.set_title(&title).set_file_name(&name).add_filter("PNG", &["png"]);
            if let Some(dir) = start_dir.as_deref() {
                dialog = dialog.set_directory(dir);
            }
            dialog.save_file()
        })
        .ok()?;
    worker.join().ok()?
}

fn decode_export_data(data: &str) -> Result<Vec<u8>, PluginError> {
    let raw = data.split(',').next_back().unwrap_or(data).trim();
    let bytes = B64.decode(raw).map_err(|_| bad("Invalid file data"))?;
    if bytes.is_empty() {
        return Err(bad("File is empty"));
    }
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(bad("File is too large"));
    }
    Ok(bytes)
}

fn sanitize_export_name(raw: &str) -> String {
    let base = Path::new(raw)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("barcode.png");
    let cleaned: String = base
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0' => '_',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .trim_start_matches('.')
        .chars()
        .take(120)
        .collect();
    if cleaned.is_empty() {
        return "barcode.png".into();
    }
    if cleaned.to_ascii_lowercase().ends_with(".png") {
        cleaned
    } else {
        format!("{cleaned}.png")
    }
}

fn ensure_png(path: PathBuf) -> PathBuf {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("png") => path,
        _ => path.with_extension("png"),
    }
}

fn export_paths_match(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn open_in_folder(path: &Path) -> Result<(), PluginError> {
    let result = {
        #[cfg(target_os = "windows")]
        {
            Command::new("explorer").arg(format!("/select,{}", path.display())).spawn()
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open").args(["-R", &path.to_string_lossy()]).spawn()
        }
        #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
        {
            let folder = path.parent().unwrap_or(path);
            Command::new("xdg-open").arg(folder).spawn()
        }
    };
    result.map_err(|error| err(format!("Failed to open folder: {error}")))?;
    Ok(())
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
        "toolbox/save-file" => save_file(params),
        "toolbox/reveal-file" => reveal_file(params),
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
