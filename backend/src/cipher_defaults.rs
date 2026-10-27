use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use dbx_plugin_sdk::PluginError;
use serde_json::{json, Map, Value};

use crate::data_dir::data_dir;
use crate::helpers::{bad, err};

static LOCK: Mutex<()> = Mutex::new(());

fn path() -> Result<PathBuf, PluginError> {
    Ok(data_dir()?.join("cipher-defaults.json"))
}

fn read_file() -> Result<Map<String, Value>, PluginError> {
    let file = path()?;
    if !file.try_exists().map_err(|e| err(e.to_string()))? {
        return Ok(Map::new());
    }
    let raw = fs::read_to_string(file).map_err(|e| err(e.to_string()))?;
    serde_json::from_str(&raw).map_err(|e| err(format!("Invalid cipher defaults: {e}")))
}

fn write_file(values: &Map<String, Value>) -> Result<(), PluginError> {
    let file = path()?;
    let parent = file
        .parent()
        .ok_or_else(|| err("Invalid cipher defaults path"))?;
    fs::create_dir_all(parent).map_err(|e| err(e.to_string()))?;
    let temp = file.with_extension("json.tmp");
    let raw = serde_json::to_vec_pretty(values).map_err(|e| err(e.to_string()))?;
    fs::write(&temp, raw).map_err(|e| err(e.to_string()))?;
    fs::rename(temp, file).map_err(|e| err(e.to_string()))
}

fn key(params: &Value) -> Result<String, PluginError> {
    let kind = params
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| bad("kind must be a string"))?;
    let tool_id = params.get("toolId").and_then(Value::as_str).unwrap_or(kind);
    if kind.len() > 64 || tool_id.len() > 128 || !kind.is_ascii() || !tool_id.is_ascii() {
        return Err(bad("Invalid cipher defaults key"));
    }
    Ok(format!("{kind}.{tool_id}"))
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    let _guard = LOCK
        .lock()
        .map_err(|_| err("Cipher defaults lock is poisoned"))?;
    let key = key(&params)?;
    let mut values = read_file()?;
    match method {
        "toolbox/cipher-defaults/get" => {
            Ok(json!({ "options": values.remove(&key).unwrap_or_else(|| json!({})) }))
        }
        "toolbox/cipher-defaults/set" => {
            let options = params
                .get("options")
                .cloned()
                .ok_or_else(|| bad("options are required"))?;
            if !options.is_object()
                || serde_json::to_vec(&options)
                    .map_err(|e| err(e.to_string()))?
                    .len()
                    > 16 * 1024
            {
                return Err(bad("Invalid cipher defaults options"));
            }
            values.insert(key, options.clone());
            write_file(&values)?;
            Ok(json!({ "options": options }))
        }
        "toolbox/cipher-defaults/clear" => {
            values.remove(&key);
            write_file(&values)?;
            Ok(json!({ "options": {} }))
        }
        _ => Err(PluginError::method_not_found(method)),
    }
}
