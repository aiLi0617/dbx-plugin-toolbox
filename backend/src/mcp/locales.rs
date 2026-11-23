use std::{collections::HashMap, sync::OnceLock};

use serde_json::Value;

#[derive(Clone, Copy)]
pub(super) enum Locale {
    English,
    Simplified,
    Traditional,
    Bilingual,
}

impl Locale {
    pub(super) fn from_params(params: &Value) -> Self {
        let requested = params.get("locale").and_then(Value::as_str);
        let configured = std::env::var("DBX_TOOLBOX_MCP_LOCALE").ok();
        let locale = requested
            .or(configured.as_deref())
            .unwrap_or("")
            .trim()
            .to_ascii_lowercase()
            .replace('_', "-");
        match locale.as_str() {
            "zh" | "zh-cn" | "zh-sg" | "zh-hans" => Self::Simplified,
            "zh-tw" | "zh-hk" | "zh-mo" | "zh-hant" => Self::Traditional,
            "en" | "en-us" | "en-gb" => Self::English,
            _ => Self::Bilingual,
        }
    }

    pub(super) fn description(self, name: &str, english: &str) -> String {
        static DESCRIPTIONS: OnceLock<HashMap<String, [String; 2]>> = OnceLock::new();
        let descriptions = DESCRIPTIONS.get_or_init(|| {
            serde_json::from_str(include_str!("descriptions.json"))
                .expect("embedded MCP descriptions")
        });
        let Some([simplified, traditional]) = descriptions.get(name) else {
            return english.to_owned();
        };
        match self {
            Self::English => english.to_owned(),
            Self::Simplified => simplified.to_owned(),
            Self::Traditional => traditional.to_owned(),
            Self::Bilingual => format!("{simplified}\n{english}"),
        }
    }
}
