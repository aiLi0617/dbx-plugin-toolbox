use dbx_plugin_sdk::PluginError;
use serde_json::Value;

pub fn err(message: impl Into<String>) -> PluginError {
    PluginError::new(-32000, message)
}

pub fn bad(message: impl Into<String>) -> PluginError {
    PluginError::new(-32602, message)
}

pub fn str_param<'a>(params: &'a Value, key: &str) -> Result<&'a str, PluginError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| bad(format!("Missing {key}")))
}

pub fn opt_str<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

pub fn bool_param(params: &Value, key: &str, default: bool) -> bool {
    params.get(key).and_then(Value::as_bool).unwrap_or(default)
}

pub fn u32_param(params: &Value, key: &str, default: u32) -> u32 {
    params
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as u32)
        .unwrap_or(default)
}
