use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::ErrorKind;
use std::path::Path;

use dbx_plugin_sdk::PluginError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::data_dir::data_dir;
use crate::fsutil::write_atomic;
use crate::helpers::{bad, err, str_param};

const LIMIT: usize = 10;
const VERSION: u32 = 1;
const DUPLICATE: i32 = -32120;
const FULL: i32 = -32121;
const MISSING: i32 = -32122;

#[derive(Serialize, Deserialize)]
struct Store {
    version: u32,
    presets: Vec<Preset>,
}

#[derive(Serialize, Deserialize)]
struct Preset {
    id: String,
    name: String,
    config: Config,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Config {
    fields: Vec<Field>,
    count: u32,
    format: String,
    seed: String,
    reference_date: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Field {
    name: String,
    #[serde(rename = "type")]
    kind: String,
    options: Map<String, Value>,
}

fn config(params: &Value) -> Result<Config, PluginError> {
    let value = params
        .get("config")
        .ok_or_else(|| bad("Check the form configuration."))?;
    let config: Config =
        serde_json::from_value(value.clone()).map_err(|_| bad("Check the form configuration."))?;
    let mut names = HashSet::new();
    if !(1..=1000).contains(&config.count)
        || !(1..=50).contains(&config.fields.len())
        || !matches!(config.format.as_str(), "json" | "csv" | "tsv" | "ndjson")
        || config.fields.iter().any(|field| {
            field.name.trim().is_empty()
                || field.kind.trim().is_empty()
                || !names.insert(field.name.trim())
        })
    {
        return Err(bad("Check the form configuration."));
    }
    Ok(config)
}

fn read_store(path: &Path) -> Result<Store, PluginError> {
    let store: Store = match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|error| err(format!("Invalid saved fake data forms: {error}")))?,
        Err(error) if error.kind() == ErrorKind::NotFound => Store {
            version: VERSION,
            presets: Vec::new(),
        },
        Err(error) => return Err(err(error.to_string())),
    };
    if store.version != VERSION || store.presets.len() > LIMIT {
        return Err(err("Could not access saved forms."));
    }
    Ok(store)
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    handle_at(&data_dir()?, method, params)
}

fn handle_at(dir: &Path, method: &str, params: Value) -> Result<Value, PluginError> {
    let operation = method.strip_prefix("toolbox/fake-data-presets/");
    if !matches!(operation, Some("list" | "create" | "update" | "delete")) {
        return Err(PluginError::method_not_found(method));
    }
    let path = dir.join("fake-data-presets.json");
    // Hold the same lock across reading and replacing the file, including across sidecars.
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(dir.join("fake-data-presets.lock"))
        .map_err(|error| err(error.to_string()))?;
    lock.lock().map_err(|error| err(error.to_string()))?;
    let mut store = read_store(&path)?;
    let saved_id = match operation {
        Some("list") => return Ok(json!({ "presets": store.presets })),
        Some("create") => {
            let name = str_param(&params, "name")?.trim();
            if name.is_empty() {
                return Err(bad("Enter a form name."));
            }
            if store.presets.iter().any(|preset| preset.name == name) {
                return Err(PluginError::new(
                    DUPLICATE,
                    "A form with this name already exists",
                ));
            }
            if store.presets.len() == LIMIT {
                return Err(PluginError::new(FULL, "Saved form limit reached"));
            }
            let id = Uuid::new_v4().to_string();
            store.presets.push(Preset {
                id: id.clone(),
                name: name.to_owned(),
                config: config(&params)?,
            });
            Some(id)
        }
        Some("update" | "delete") => {
            let id = str_param(&params, "id")?;
            let index = store
                .presets
                .iter()
                .position(|preset| preset.id == id)
                .ok_or_else(|| PluginError::new(MISSING, "Saved form no longer exists"))?;
            if operation == Some("update") {
                store.presets[index].config = config(&params)?;
            } else {
                store.presets.remove(index);
            }
            None
        }
        _ => unreachable!(),
    };
    let bytes = serde_json::to_vec(&store).map_err(|error| err(error.to_string()))?;
    write_atomic(&path, &bytes)
        .map_err(|error| err(format!("Failed to save fake data forms: {error}")))?;
    Ok(json!({ "presets": store.presets, "id": saved_id }))
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestStore(std::path::PathBuf);

    impl TestStore {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("toolbox-fake-data-{}", Uuid::new_v4()));
            fs::create_dir(&dir).unwrap();
            Self(dir)
        }

        fn call(&self, method: &str, params: Value) -> Result<Value, PluginError> {
            handle_at(
                &self.0,
                &format!("toolbox/fake-data-presets/{method}"),
                params,
            )
        }
    }

    impl Drop for TestStore {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn sample(count: u32) -> Value {
        json!({
            "fields": [
                { "name": "联系电话", "type": "phone", "options": { "region": "JP", "format": "international" } },
                { "name": "入职日期", "type": "date", "options": { "format": "YYYY/MM/DD" } }
            ],
            "count": count,
            "format": "csv",
            "seed": "团队样例",
            "referenceDate": "2025-02-28"
        })
    }

    #[test]
    fn stores_complete_configs_and_enforces_limit_without_overwriting() {
        let store = TestStore::new();
        assert_eq!(store.call("list", json!({})).unwrap()["presets"], json!([]));
        let mut id = String::new();
        for index in 0..LIMIT {
            let result = store
                .call(
                    "create",
                    json!({ "name": format!(" 表单{index} "), "config": sample(3) }),
                )
                .unwrap();
            if index == 0 {
                id = result["id"].as_str().unwrap().to_owned();
            }
        }
        let original = store.call("list", json!({})).unwrap();
        assert_eq!(original["presets"].as_array().unwrap().len(), LIMIT);
        assert_eq!(
            original["presets"][0],
            json!({ "id": id, "name": "表单0", "config": sample(3) })
        );
        assert_eq!(
            store
                .call("create", json!({ "name": "表单0", "config": sample(5) }))
                .unwrap_err()
                .code,
            DUPLICATE
        );
        assert_eq!(
            store
                .call("create", json!({ "name": "额外表单", "config": sample(5) }))
                .unwrap_err()
                .code,
            FULL
        );
        assert!(store
            .call("update", json!({ "id": id, "config": sample(0) }))
            .is_err());
        assert_eq!(store.call("list", json!({})).unwrap(), original);
        let updated = store
            .call("update", json!({ "id": id, "config": sample(8) }))
            .unwrap();
        assert_eq!(updated["presets"][0]["config"], sample(8));
        store.call("delete", json!({ "id": id })).unwrap();
        assert_eq!(
            store
                .call("update", json!({ "id": id, "config": sample(9) }))
                .unwrap_err()
                .code,
            MISSING
        );
        let added = store
            .call("create", json!({ "name": "新表单", "config": sample(1) }))
            .unwrap();
        assert_eq!(added["presets"].as_array().unwrap().len(), LIMIT);
        assert_ne!(added["id"], id);
    }

    #[test]
    fn competing_creates_share_the_same_limit() {
        let store = TestStore::new();
        let writes = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..=LIMIT)
                .map(|index| {
                    let store = &store;
                    scope.spawn(move || {
                        store.call(
                            "create",
                            json!({
                                "name": format!("form {index}"),
                                "config": sample(1),
                            }),
                        )
                    })
                })
                .collect();
            handles
                .into_iter()
                .map(|handle| handle.join().unwrap())
                .collect::<Vec<_>>()
        });
        assert_eq!(writes.iter().filter(|result| result.is_ok()).count(), LIMIT);
        assert_eq!(writes.into_iter().find_map(Result::err).unwrap().code, FULL);
    }

    #[test]
    fn a_read_failure_does_not_replace_saved_data() {
        let store = TestStore::new();
        let path = store.0.join("fake-data-presets.json");
        fs::write(&path, b"unsupported store").unwrap();
        assert!(store
            .call("create", json!({ "name": "new", "config": sample(1) }))
            .is_err());
        assert_eq!(fs::read(path).unwrap(), b"unsupported store");
    }
}
