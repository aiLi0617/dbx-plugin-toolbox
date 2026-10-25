use std::collections::{BTreeMap, HashSet};
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

const PREFS_VERSION: u32 = 7;
const DEFAULT_VAULT_AUTO_LOCK_MINUTES: u32 = 15;
const DEFAULT_RECENT_TOOL_LIMIT: usize = 10;
static PREFS_LOCK: Mutex<()> = Mutex::new(());

// A first-run install starts with no favorites. Users choose the tools they want.
const DEFAULT_ENABLED: &[&str] = &[];

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
    #[serde(rename = "recentToolIds", default)]
    recent_tool_ids: Vec<String>,
    #[serde(rename = "recentToolLimit", default = "default_recent_tool_limit")]
    recent_tool_limit: usize,
    #[serde(rename = "sidebarCollapsed", default)]
    sidebar_collapsed: bool,
    #[serde(rename = "recentCollapsed", default)]
    recent_collapsed: bool,
    #[serde(default = "default_shortcuts")]
    shortcuts: BTreeMap<String, String>,
}

type Preferences = (
    Vec<String>,
    u32,
    Vec<String>,
    bool,
    bool,
    BTreeMap<String, String>,
    usize,
);

const SHORTCUT_ACTIONS: &[&str] = &[
    "search",
    "home",
    "catalog",
    "vault",
    "toggleSidebar",
    "previousTool",
    "nextTool",
    "closeTool",
    "toggleFavorite",
    "loadDemo",
    "settings",
];

fn default_shortcuts() -> BTreeMap<String, String> {
    [
        ("search", "Mod+KeyK"),
        ("home", "Mod+Digit1"),
        ("catalog", "Mod+Digit2"),
        ("vault", "Mod+Digit3"),
        ("toggleSidebar", "Mod+KeyB"),
        ("previousTool", "Mod+Shift+BracketLeft"),
        ("nextTool", "Mod+Shift+BracketRight"),
        ("closeTool", "Mod+KeyW"),
        ("toggleFavorite", "Mod+Shift+KeyF"),
        ("loadDemo", "Mod+Shift+KeyD"),
        ("settings", "Mod+Comma"),
    ]
    .into_iter()
    .map(|(action, shortcut)| (action.to_string(), shortcut.to_string()))
    .collect()
}

fn sanitize_shortcuts(value: BTreeMap<String, String>) -> BTreeMap<String, String> {
    let defaults = default_shortcuts();
    let mut cleaned: BTreeMap<String, String> = SHORTCUT_ACTIONS
        .iter()
        .map(|action| {
            let value = value
                .get(*action)
                .filter(|shortcut| {
                    shortcut.len() <= 64
                        && shortcut.is_ascii()
                        && !shortcut.contains(char::is_whitespace)
                })
                .cloned()
                .unwrap_or_else(|| defaults.get(*action).cloned().unwrap_or_default());
            ((*action).to_string(), value)
        })
        .collect();
    for (action, shortcut) in value.into_iter().take(128) {
        let Some(tool_id) = action.strip_prefix("tool:") else {
            continue;
        };
        let valid_tool_id = !tool_id.is_empty()
            && tool_id.len() <= 80
            && tool_id.as_bytes()[0].is_ascii_alphanumeric()
            && tool_id.bytes().all(|ch| {
                ch.is_ascii_lowercase()
                    || ch.is_ascii_digit()
                    || ch == b'-'
                    || ch == b'_'
                    || ch == b'.'
            });
        if valid_tool_id
            && !shortcut.is_empty()
            && shortcut.len() <= 64
            && shortcut.is_ascii()
            && !shortcut.contains(char::is_whitespace)
        {
            cleaned.insert(action, shortcut);
        }
    }
    cleaned
}

fn default_vault_auto_lock_minutes() -> u32 {
    DEFAULT_VAULT_AUTO_LOCK_MINUTES
}

fn default_recent_tool_limit() -> usize {
    DEFAULT_RECENT_TOOL_LIMIT
}

fn sanitize_recent_tool_limit(value: usize) -> usize {
    match value {
        5 | 8 | 10 | 15 | 20 => value,
        _ => DEFAULT_RECENT_TOOL_LIMIT,
    }
}

fn sanitize_vault_auto_lock_minutes(value: u32) -> u32 {
    match value {
        0 | 5 | 15 | 30 | 60 => value,
        _ => DEFAULT_VAULT_AUTO_LOCK_MINUTES,
    }
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
        "hmac-sm3" => "hmac-sha256".to_string(),
        "ssh-fingerprint" => "cert".to_string(),
        "sql" | "xml" | "yaml" | "html" | "css" => "code-format".to_string(),
        "ulid" | "nanoid" => "uuid".to_string(),
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
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids.into_iter().take(256) {
        let id = canonical_id(id);
        let valid = !id.is_empty()
            && id.len() <= 80
            && id.as_bytes()[0].is_ascii_alphanumeric()
            && id.bytes().all(|ch| {
                ch.is_ascii_lowercase()
                    || ch.is_ascii_digit()
                    || ch == b'-'
                    || ch == b'_'
                    || ch == b'.'
            });
        if valid && seen.insert(id.clone()) {
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
    Ok(crate::data_dir::data_dir()?.join("prefs.json"))
}

fn read_preferences() -> Result<Preferences, PluginError> {
    let path = prefs_path()?;
    read_preferences_at(&path)
}

fn read_preferences_at(path: &Path) -> Result<Preferences, PluginError> {
    if !path
        .try_exists()
        .map_err(|error| err(format!("Failed to access prefs: {error}")))?
    {
        let backup = path.with_extension("json.bak");
        return if backup
            .try_exists()
            .map_err(|error| err(format!("Failed to access prefs backup: {error}")))?
        {
            read_preferences_file(&backup)
        } else {
            Ok((
                default_ids(),
                DEFAULT_VAULT_AUTO_LOCK_MINUTES,
                Vec::new(),
                false,
                false,
                default_shortcuts(),
                DEFAULT_RECENT_TOOL_LIMIT,
            ))
        };
    }
    match read_preferences_file(path) {
        Ok(preferences) => Ok(preferences),
        Err(primary_error) => {
            read_preferences_file(&path.with_extension("json.bak")).or(Err(primary_error))
        }
    }
}

fn read_preferences_file(path: &Path) -> Result<Preferences, PluginError> {
    let text =
        fs::read_to_string(path).map_err(|error| err(format!("Failed to read prefs: {error}")))?;
    let parsed: PrefsFile =
        serde_json::from_str(&text).map_err(|error| err(format!("Invalid prefs.json: {error}")))?;
    let auto_lock_minutes = sanitize_vault_auto_lock_minutes(parsed.vault_auto_lock_minutes);
    let favorite_tool_ids = ids_from_file(&parsed);
    let recent_tool_limit = sanitize_recent_tool_limit(parsed.recent_tool_limit);
    let recent_tool_ids = filter_known(parsed.recent_tool_ids)
        .into_iter()
        .take(recent_tool_limit)
        .collect();
    Ok((
        favorite_tool_ids,
        auto_lock_minutes,
        recent_tool_ids,
        parsed.sidebar_collapsed,
        parsed.recent_collapsed,
        sanitize_shortcuts(parsed.shortcuts),
        recent_tool_limit,
    ))
}

fn ids_from_file(parsed: &PrefsFile) -> Vec<String> {
    let ids = if parsed.version >= 2 {
        parsed.favorite_tool_ids.clone()
    } else {
        parsed.enabled_tool_ids.clone()
    };
    filter_known(ids)
}

fn write_preferences(
    ids: Vec<String>,
    vault_auto_lock_minutes: u32,
    recent_tool_ids: Vec<String>,
    sidebar_collapsed: bool,
    recent_collapsed: bool,
    shortcuts: BTreeMap<String, String>,
    recent_tool_limit: usize,
) -> Result<Preferences, PluginError> {
    let cleaned = filter_known(ids);
    let auto_lock_minutes = sanitize_vault_auto_lock_minutes(vault_auto_lock_minutes);
    let recent_tool_limit = sanitize_recent_tool_limit(recent_tool_limit);
    let recent_tool_ids: Vec<String> = filter_known(recent_tool_ids)
        .into_iter()
        .take(recent_tool_limit)
        .collect();
    let shortcuts = sanitize_shortcuts(shortcuts);
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
        recent_tool_ids: recent_tool_ids.clone(),
        recent_tool_limit,
        sidebar_collapsed,
        recent_collapsed,
        shortcuts: shortcuts.clone(),
    };
    let text = serde_json::to_string_pretty(&payload).map_err(|error| err(error.to_string()))?;
    persist_preferences(&path, text.as_bytes())?;
    Ok((
        cleaned,
        auto_lock_minutes,
        recent_tool_ids,
        sidebar_collapsed,
        recent_collapsed,
        shortcuts,
        recent_tool_limit,
    ))
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

fn recent_from_params(params: &Value) -> Result<Option<Vec<String>>, PluginError> {
    let Some(raw) = params.get("recentToolIds") else {
        return Ok(None);
    };
    let raw = raw
        .as_array()
        .ok_or_else(|| bad("recentToolIds must be an array"))?;
    let mut ids = Vec::new();
    for item in raw.iter().take(20) {
        let id = item
            .as_str()
            .ok_or_else(|| bad("recentToolIds must be strings"))?;
        ids.push(id.to_string());
    }
    Ok(Some(filter_known(ids).into_iter().take(20).collect()))
}

fn recent_limit_from_params(params: &Value) -> Result<Option<usize>, PluginError> {
    let Some(raw) = params.get("recentToolLimit") else {
        return Ok(None);
    };
    let value = raw
        .as_u64()
        .and_then(|v| usize::try_from(v).ok())
        .ok_or_else(|| bad("recentToolLimit must be a positive integer"))?;
    if !matches!(value, 5 | 8 | 10 | 15 | 20) {
        return Err(bad("Unsupported recent tool limit"));
    }
    Ok(Some(value))
}

fn sidebar_from_params(params: &Value) -> Result<Option<bool>, PluginError> {
    let Some(raw) = params.get("sidebarCollapsed") else {
        return Ok(None);
    };
    raw.as_bool()
        .map(Some)
        .ok_or_else(|| bad("sidebarCollapsed must be a boolean"))
}

fn recent_collapsed_from_params(params: &Value) -> Result<Option<bool>, PluginError> {
    let Some(raw) = params.get("recentCollapsed") else {
        return Ok(None);
    };
    raw.as_bool()
        .map(Some)
        .ok_or_else(|| bad("recentCollapsed must be a boolean"))
}

fn shortcuts_from_params(params: &Value) -> Result<Option<BTreeMap<String, String>>, PluginError> {
    let Some(raw) = params.get("shortcuts") else {
        return Ok(None);
    };
    let raw = raw
        .as_object()
        .ok_or_else(|| bad("shortcuts must be an object"))?;
    let mut shortcuts = BTreeMap::new();
    for (action, raw_value) in raw.iter().take(128) {
        if !SHORTCUT_ACTIONS.contains(&action.as_str()) && !action.starts_with("tool:") {
            continue;
        }
        let value = raw_value
            .as_str()
            .ok_or_else(|| bad("shortcut values must be strings"))?;
        if value.len() > 64 || !value.is_ascii() || value.contains(char::is_whitespace) {
            return Err(bad("Invalid shortcut"));
        }
        shortcuts.insert(action.to_string(), value.to_string());
    }
    Ok(Some(sanitize_shortcuts(shortcuts)))
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    let _guard = PREFS_LOCK
        .lock()
        .map_err(|_| err("Preferences lock is poisoned"))?;
    match method {
        "toolbox/prefs/get" => {
            let (
                ids,
                auto_lock_minutes,
                recent_tool_ids,
                sidebar_collapsed,
                recent_collapsed,
                shortcuts,
                recent_tool_limit,
            ) = read_preferences()?;
            Ok(json!({
                "version": PREFS_VERSION,
                "favoriteToolIds": ids,
                "vaultAutoLockMinutes": auto_lock_minutes,
                "recentToolIds": recent_tool_ids,
                "sidebarCollapsed": sidebar_collapsed,
                "recentCollapsed": recent_collapsed,
                "shortcuts": shortcuts,
                "recentToolLimit": recent_tool_limit,
            }))
        }
        "toolbox/prefs/set" => {
            let (
                current_ids,
                current_auto_lock_minutes,
                current_recent,
                current_sidebar,
                current_recent_collapsed,
                current_shortcuts,
                current_recent_limit,
            ) = read_preferences()?;
            let ids = ids_from_params(&params)?.unwrap_or(current_ids);
            let auto_lock_minutes =
                auto_lock_from_params(&params)?.unwrap_or(current_auto_lock_minutes);
            let recent_tool_ids = recent_from_params(&params)?.unwrap_or(current_recent);
            let sidebar_collapsed = sidebar_from_params(&params)?.unwrap_or(current_sidebar);
            let recent_collapsed = recent_collapsed_from_params(&params)?
                .unwrap_or(current_recent_collapsed);
            let shortcuts = shortcuts_from_params(&params)?.unwrap_or(current_shortcuts);
            let recent_tool_limit =
                recent_limit_from_params(&params)?.unwrap_or(current_recent_limit);
            let (
                ids,
                auto_lock_minutes,
                recent_tool_ids,
                sidebar_collapsed,
                recent_collapsed,
                shortcuts,
                recent_tool_limit,
            ) = write_preferences(
                ids,
                auto_lock_minutes,
                recent_tool_ids,
                sidebar_collapsed,
                recent_collapsed,
                shortcuts,
                recent_tool_limit,
            )?;
            Ok(json!({
                "version": PREFS_VERSION,
                "favoriteToolIds": ids,
                "vaultAutoLockMinutes": auto_lock_minutes,
                "recentToolIds": recent_tool_ids,
                "sidebarCollapsed": sidebar_collapsed,
                "recentCollapsed": recent_collapsed,
                "shortcuts": shortcuts,
                "recentToolLimit": recent_tool_limit,
            }))
        }
        _ => Err(PluginError::method_not_found(method)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_tool_limit_is_versioned_validated_and_defaults_for_old_files() {
        for value in [5, 8, 10, 15, 20] {
            assert_eq!(
                recent_limit_from_params(&json!({"recentToolLimit": value})).unwrap(),
                Some(value)
            );
        }
        for value in [json!(0), json!(100), json!("10"), json!(null), json!(-1)] {
            assert!(recent_limit_from_params(&json!({"recentToolLimit": value})).is_err());
        }
        assert_eq!(recent_limit_from_params(&json!({})).unwrap(), None);
        let old: PrefsFile = serde_json::from_str(r#"{"version":6}"#).unwrap();
        assert_eq!(old.recent_tool_limit, DEFAULT_RECENT_TOOL_LIMIT);
        let directory =
            std::env::temp_dir().join(format!("toolbox-recent-limit-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("prefs.json");
        fs::write(&path, serde_json::to_vec(&json!({"version":7,"recentToolLimit":20,"recentToolIds":(0..20).map(|i| format!("tool-{i}")).collect::<Vec<_>>()})).unwrap()).unwrap();
        let prefs = read_preferences_at(&path).unwrap();
        assert_eq!(prefs.2.len(), 20);
        assert_eq!(prefs.5, 20);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn missing_preferences_default_and_corrupt_primary_uses_backup() {
        let directory =
            std::env::temp_dir().join(format!("toolbox-prefs-recovery-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("prefs.json");
        assert_eq!(
            read_preferences_at(&path).unwrap(),
            (
                default_ids(),
                DEFAULT_VAULT_AUTO_LOCK_MINUTES,
                Vec::new(),
                false,
                default_shortcuts(),
                DEFAULT_RECENT_TOOL_LIMIT,
            )
        );
        let backup = path.with_extension("json.bak");
        fs::write(
            &backup,
            r#"{"version":3,"favoriteToolIds":["hash"],"vaultAutoLockMinutes":30}"#,
        )
        .unwrap();
        assert_eq!(
            read_preferences_at(&path).unwrap(),
            (
                vec!["hash".to_string()],
                30,
                Vec::new(),
                false,
                default_shortcuts(),
                DEFAULT_RECENT_TOOL_LIMIT,
            )
        );
        fs::write(&path, b"broken json").unwrap();
        assert_eq!(
            read_preferences_at(&path).unwrap(),
            (
                vec!["hash".to_string()],
                30,
                Vec::new(),
                false,
                default_shortcuts(),
                DEFAULT_RECENT_TOOL_LIMIT,
            )
        );
        fs::write(&backup, b"also broken").unwrap();
        assert!(read_preferences_at(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"broken json");
        fs::remove_file(&path).unwrap();
        fs::remove_file(&backup).unwrap();
        fs::remove_dir(&directory).unwrap();
    }

    #[test]
    fn defaults_are_known_and_unique() {
        let mut seen = HashSet::new();
        for id in DEFAULT_ENABLED {
            assert_eq!(
                filter_known(vec![(*id).to_string()]),
                vec![(*id).to_string()]
            );
            assert!(seen.insert(*id), "duplicate default id {id}");
        }
    }

    #[test]
    fn filter_known_keeps_forward_compatible_ids_and_dedupes() {
        let cleaned = filter_known(vec![
            "json".into(),
            "missing-tool".into(),
            "json".into(),
            "uuid".into(),
            "".into(),
        ]);
        assert_eq!(
            cleaned,
            vec![
                "json".to_string(),
                "missing-tool".to_string(),
                "uuid".to_string()
            ]
        );
    }

    #[test]
    fn current_sm4_and_sm2_tool_ids_are_not_collapsed_into_legacy_ids() {
        assert_eq!(filter_known(vec!["sm4".into(), "sm2".into()]), vec!["sm4", "sm2"]);
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
    fn keeps_password_and_random_bytes_as_distinct_tools() {
        assert_eq!(
            filter_known(vec!["password".into(), "random-bytes".into()]),
            vec!["password".to_string(), "random-bytes".to_string()]
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
            ids_from_file(&parsed),
            vec![
                "hash".to_string(),
                "json".to_string(),
                "whitespace".to_string(),
                "missing-tool".to_string()
            ]
        );
    }

    #[test]
    fn v2_empty_favorites_do_not_fall_back_to_legacy_field() {
        let parsed: PrefsFile =
            serde_json::from_str(r#"{"version":2,"favoriteToolIds":[],"enabledToolIds":["hash"]}"#)
                .unwrap();
        assert!(ids_from_file(&parsed).is_empty());
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
    fn shortcut_preferences_keep_valid_tool_bindings() {
        let shortcuts = shortcuts_from_params(&json!({
            "shortcuts": {
                "search": "Alt+KeyP",
                "tool:json": "Mod+Shift+KeyJ",
                "tool:../secret": "Mod+KeyX",
                "unknown": "Mod+KeyY"
            }
        }))
        .unwrap()
        .unwrap();
        assert_eq!(
            shortcuts.get("search").map(String::as_str),
            Some("Alt+KeyP")
        );
        assert_eq!(
            shortcuts.get("tool:json").map(String::as_str),
            Some("Mod+Shift+KeyJ")
        );
        assert!(!shortcuts.contains_key("tool:../secret"));
        assert!(!shortcuts.contains_key("unknown"));
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
