use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;

use dbx_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::helpers::{bad, err};

const PLUGIN_ID: &str = "io.github.aili0617.toolbox";
const PREFS_VERSION: u32 = 3;
const DEFAULT_VAULT_AUTO_LOCK_MINUTES: u32 = 15;
static PREFS_LOCK: Mutex<()> = Mutex::new(());

const KNOWN_TOOL_IDS: &[&str] = &[
    "data-convert",
    "spreadsheet",
    "image-process",
    "image-generate",
    "json",
    "base-convert",
    "network-calc",
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
    "jwk",
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
    #[serde(rename = "favoriteToolIds", default)]
    favorite_tool_ids: Vec<String>,
    #[serde(rename = "enabledToolIds")]
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    enabled_tool_ids: Vec<String>,
    #[serde(
        rename = "vaultAutoLockMinutes",
        default = "default_vault_auto_lock_minutes"
    )]
    vault_auto_lock_minutes: u32,
}

fn default_vault_auto_lock_minutes() -> u32 {
    DEFAULT_VAULT_AUTO_LOCK_MINUTES
}

fn sanitize_vault_auto_lock_minutes(value: u32) -> u32 {
    match value {
        0 | 5 | 15 | 30 | 60 => value,
        _ => DEFAULT_VAULT_AUTO_LOCK_MINUTES,
    }
}

fn known_ids() -> HashSet<&'static str> {
    KNOWN_TOOL_IDS.iter().copied().collect()
}

fn default_ids() -> Vec<String> {
    DEFAULT_ENABLED.iter().map(|id| (*id).to_string()).collect()
}

fn canonical_id(id: String) -> String {
    match id.as_str() {
        "json-yaml" | "json-csv" | "json-xml" | "json-toml" | "json-sql" | "json-ts"
        | "json-convert" | "jsonpath" => "json".to_string(),
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
        "naming" | "case" | "stats" | "slugify" | "strip-html" | "lines" => {
            "whitespace".to_string()
        }
        _ => id,
    }
}

fn filter_known(ids: Vec<String>) -> Vec<String> {
    let split_old_json_tools =
        ids.iter().any(|id| id == "json-convert") && ids.iter().any(|id| id == "json");
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

fn read_preferences() -> Result<(Vec<String>, u32), PluginError> {
    let path = prefs_path()?;
    if !path.exists() {
        let backup = path.with_extension("json.bak");
        return if backup.exists() {
            read_preferences_file(&backup)
        } else {
            Ok((default_ids(), DEFAULT_VAULT_AUTO_LOCK_MINUTES))
        };
    }
    match read_preferences_file(&path) {
        Ok(preferences) => Ok(preferences),
        Err(primary_error) => {
            read_preferences_file(&path.with_extension("json.bak")).or(Err(primary_error))
        }
    }
}

fn read_preferences_file(path: &Path) -> Result<(Vec<String>, u32), PluginError> {
    let text =
        fs::read_to_string(path).map_err(|error| err(format!("Failed to read prefs: {error}")))?;
    let parsed: PrefsFile =
        serde_json::from_str(&text).map_err(|error| err(format!("Invalid prefs.json: {error}")))?;
    let auto_lock_minutes = sanitize_vault_auto_lock_minutes(parsed.vault_auto_lock_minutes);
    Ok((ids_from_file(parsed), auto_lock_minutes))
}

fn ids_from_file(parsed: PrefsFile) -> Vec<String> {
    let ids = if parsed.version >= 2 {
        parsed.favorite_tool_ids
    } else {
        parsed.enabled_tool_ids
    };
    filter_known(ids)
}

fn write_preferences(
    ids: Vec<String>,
    vault_auto_lock_minutes: u32,
) -> Result<(Vec<String>, u32), PluginError> {
    let cleaned = filter_known(ids);
    let auto_lock_minutes = sanitize_vault_auto_lock_minutes(vault_auto_lock_minutes);
    let path = prefs_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| err(format!("Failed to create prefs directory: {error}")))?;
    }
    let payload = PrefsFile {
        version: PREFS_VERSION,
        favorite_tool_ids: cleaned.clone(),
        enabled_tool_ids: Vec::new(),
        vault_auto_lock_minutes: auto_lock_minutes,
    };
    let text = serde_json::to_string_pretty(&payload).map_err(|error| err(error.to_string()))?;
    persist_preferences(&path, text.as_bytes())?;
    Ok((cleaned, auto_lock_minutes))
}

fn persist_preferences(path: &Path, bytes: &[u8]) -> Result<(), PluginError> {
    let temp = path.with_extension(format!("json.tmp-{}", Uuid::new_v4()));
    let backup = path.with_extension("json.bak");
    let write_result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);

        if path.exists() {
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(path, &backup)?;
        }
        if let Err(error) = fs::rename(&temp, path) {
            if backup.exists() && !path.exists() {
                let _ = fs::rename(&backup, path);
            }
            return Err(error);
        }
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    write_result.map_err(|error| err(format!("Failed to write prefs: {error}")))
}

fn ids_from_params(params: &Value) -> Result<Option<Vec<String>>, PluginError> {
    let Some(raw) = params
        .get("favoriteToolIds")
        .or_else(|| params.get("enabledToolIds"))
    else {
        return Ok(None);
    };
    let raw = raw
        .as_array()
        .ok_or_else(|| bad("favoriteToolIds must be an array"))?;
    let mut ids = Vec::new();
    for item in raw {
        let id = item
            .as_str()
            .ok_or_else(|| bad("favoriteToolIds must be strings"))?;
        if id.is_empty() || id.len() > 64 {
            return Err(bad("Invalid tool id"));
        }
        ids.push(id.to_string());
    }
    Ok(Some(ids))
}

fn auto_lock_from_params(params: &Value) -> Result<Option<u32>, PluginError> {
    let Some(raw) = params.get("vaultAutoLockMinutes") else {
        return Ok(None);
    };
    let value = raw
        .as_u64()
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| bad("vaultAutoLockMinutes must be a non-negative integer"))?;
    if !matches!(value, 0 | 5 | 15 | 30 | 60) {
        return Err(bad("Unsupported vault auto-lock interval"));
    }
    Ok(Some(value))
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    let _guard = PREFS_LOCK
        .lock()
        .map_err(|_| err("Preferences lock is poisoned"))?;
    match method {
        "toolbox/prefs/get" => {
            let (ids, auto_lock_minutes) = read_preferences()?;
            Ok(json!({
                "version": PREFS_VERSION,
                "favoriteToolIds": ids,
                "vaultAutoLockMinutes": auto_lock_minutes,
            }))
        }
        "toolbox/prefs/set" => {
            let (current_ids, current_auto_lock_minutes) = read_preferences()?;
            let ids = ids_from_params(&params)?.unwrap_or(current_ids);
            let auto_lock_minutes =
                auto_lock_from_params(&params)?.unwrap_or(current_auto_lock_minutes);
            let (ids, auto_lock_minutes) = write_preferences(ids, auto_lock_minutes)?;
            Ok(json!({
                "version": PREFS_VERSION,
                "favoriteToolIds": ids,
                "vaultAutoLockMinutes": auto_lock_minutes,
            }))
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
    fn keeps_image_generate_favorites() {
        let cleaned = filter_known(vec![
            "hash".into(),
            "image-generate".into(),
            "image-process".into(),
        ]);
        assert_eq!(
            cleaned,
            vec![
                "hash".to_string(),
                "image-generate".to_string(),
                "image-process".to_string(),
            ]
        );
    }

    #[test]
    fn empty_selection_stays_empty() {
        assert!(filter_known(Vec::new()).is_empty());
    }

    #[test]
    fn remaps_legacy_json_convert_ids() {
        let cleaned = filter_known(vec![
            "json-yaml".into(),
            "json-csv".into(),
            "jsonpath".into(),
        ]);
        assert_eq!(cleaned, vec!["json".to_string()]);
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

    #[test]
    fn migrates_v1_enabled_tools_to_v2_favorites() {
        let parsed: PrefsFile = serde_json::from_str(
            r#"{"version":1,"enabledToolIds":["hash","json-yaml","stats","case","missing-tool"]}"#,
        )
        .unwrap();
        assert_eq!(
            ids_from_file(parsed),
            vec![
                "hash".to_string(),
                "json".to_string(),
                "whitespace".to_string()
            ]
        );
    }

    #[test]
    fn v2_empty_favorites_do_not_fall_back_to_legacy_field() {
        let parsed: PrefsFile =
            serde_json::from_str(r#"{"version":2,"favoriteToolIds":[],"enabledToolIds":["hash"]}"#)
                .unwrap();
        assert!(ids_from_file(parsed).is_empty());
    }

    #[test]
    fn auto_lock_defaults_and_rejects_unsupported_intervals() {
        let parsed: PrefsFile =
            serde_json::from_str(r#"{"version":2,"favoriteToolIds":["hash"]}"#).unwrap();
        assert_eq!(
            parsed.vault_auto_lock_minutes,
            DEFAULT_VAULT_AUTO_LOCK_MINUTES
        );
        assert_eq!(
            auto_lock_from_params(&json!({ "vaultAutoLockMinutes": 30 })).unwrap(),
            Some(30)
        );
        assert!(auto_lock_from_params(&json!({ "vaultAutoLockMinutes": 10 })).is_err());
    }

    #[test]
    fn preference_writes_keep_the_previous_file_as_backup() {
        let directory = std::env::temp_dir().join(format!("toolbox-prefs-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("prefs.json");

        persist_preferences(&path, b"first").unwrap();
        persist_preferences(&path, b"second").unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"second");
        assert_eq!(fs::read(path.with_extension("json.bak")).unwrap(), b"first");
        fs::remove_dir_all(directory).unwrap();
    }
}
