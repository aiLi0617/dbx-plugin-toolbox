use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dbx_plugin_sdk::{PluginEmitter, PluginError};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use url::Url;

use crate::data_dir;

pub const MODEL_VERSION: &str = "v1";
const RELEASE_BASE: &str =
    "https://github.com/aiLi0617/dbx-plugin-toolbox/releases/download/ocr-models-v1";
const EVENT: &str = "toolbox/ocr/models/progress";
const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ModelTier {
    Base,
    Accurate,
}

impl ModelTier {
    fn as_str(self) -> &'static str {
        match self {
            Self::Base => "base",
            Self::Accurate => "accurate",
        }
    }
}

#[derive(Clone, Copy)]
struct ModelSpec {
    name: &'static str,
    size: u64,
    sha256: &'static str,
}

const DETECTION: ModelSpec = ModelSpec {
    name: "detection-ppocrv5.rten",
    size: 4_877_120,
    sha256: "06ceb2a0cf56bcd340ace6bf5ac8eea90377fbed931e4ee80b99eb75ef2d090a",
};
const FAST: ModelSpec = ModelSpec {
    name: "recognition-mobile-opset13.rten",
    size: 16_555_844,
    sha256: "19369953e95c4f376fb5310b2740c711b40a1fba6e311c6bb58baed949a85ba6",
};
const ACCURATE: ModelSpec = ModelSpec {
    name: "recognition-server-opset13.rten",
    size: 84_552_004,
    sha256: "5dad41c89a41ae468a626affb91867b36fe067b54d032138862e61f50c312f6b",
};
const BASE_MODELS: &[ModelSpec] = &[DETECTION, FAST];
const ACCURATE_MODELS: &[ModelSpec] = &[DETECTION, FAST, ACCURATE];

#[derive(Clone)]
pub struct OcrModelManager {
    state: Arc<Mutex<DownloadState>>,
}

#[derive(Default)]
struct DownloadState {
    active: Option<ActiveDownload>,
}

struct ActiveDownload {
    session_id: String,
    tier: ModelTier,
    cancelled: Arc<AtomicBool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TierRequest {
    tier: ModelTier,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CancelRequest {
    session_id: String,
}

impl Default for OcrModelManager {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(DownloadState::default())),
        }
    }
}

impl OcrModelManager {
    pub fn status(&self) -> Result<Value, PluginError> {
        let directory = model_directory()?;
        let base_installed = verify_specs(&directory, BASE_MODELS).is_ok();
        let accurate_model_installed =
            verify_model(&directory.join(ACCURATE.name), &ACCURATE).is_ok();
        let base_present = BASE_MODELS
            .iter()
            .any(|model| directory.join(model.name).exists());
        let accurate_present = directory.join(ACCURATE.name).exists();
        let active = self
            .state
            .lock()
            .map_err(|_| internal("OCR model download lock is poisoned"))?
            .active
            .as_ref()
            .map(|download| {
                json!({ "sessionId": download.session_id, "tier": download.tier.as_str() })
            });
        Ok(json!({
            "version": MODEL_VERSION,
            "source": "GitHub Release · aiLi0617/dbx-plugin-toolbox",
            "license": "Apache-2.0",
            "base": {
                "installed": base_installed,
                "updateRequired": base_present && !base_installed,
                "size": BASE_MODELS.iter().map(|model| model.size).sum::<u64>(),
            },
            "accurate": {
                "installed": base_installed && accurate_model_installed,
                "updateRequired": accurate_present && !accurate_model_installed,
                "size": ACCURATE.size,
                "requiresBase": true,
            },
            "active": active,
        }))
    }

    pub fn install(&self, params: Value, emitter: &PluginEmitter) -> Result<Value, PluginError> {
        let request: TierRequest = parse(params)?;
        let directory = model_directory()?;
        if verify_specs(&directory, specs_for_tier(request.tier)).is_ok() {
            return Ok(json!({ "installed": true, "tier": request.tier.as_str() }));
        }

        let mut state = self
            .state
            .lock()
            .map_err(|_| internal("OCR model download lock is poisoned"))?;
        if let Some(active) = &state.active {
            if active.tier == request.tier {
                return Ok(json!({
                    "started": false,
                    "sessionId": active.session_id,
                    "tier": active.tier.as_str(),
                }));
            }
            return Err(PluginError::new(
                -32022,
                "Another OCR model download is active",
            ));
        }

        let session_id = uuid::Uuid::new_v4().simple().to_string();
        let cancelled = Arc::new(AtomicBool::new(false));
        state.active = Some(ActiveDownload {
            session_id: session_id.clone(),
            tier: request.tier,
            cancelled: cancelled.clone(),
        });
        drop(state);

        let manager = self.clone();
        let session_for_thread = session_id.clone();
        let emitter = emitter.clone();
        std::thread::spawn(move || {
            let result = download_tier(request.tier, &session_for_thread, &cancelled, &emitter);
            let (stage, error) = match result {
                Ok(()) => ("complete", None),
                Err(_error) if cancelled.load(Ordering::Relaxed) => ("cancelled", None),
                Err(error) => ("error", Some(error.message)),
            };
            if let Ok(mut state) = manager.state.lock() {
                if state
                    .active
                    .as_ref()
                    .is_some_and(|active| active.session_id == session_for_thread)
                {
                    state.active = None;
                }
            }
            let _ = emitter.event(
                EVENT,
                json!({
                    "sessionId": session_for_thread,
                    "tier": request.tier.as_str(),
                    "stage": stage,
                    "error": error,
                }),
            );
        });

        Ok(json!({
            "started": true,
            "sessionId": session_id,
            "tier": request.tier.as_str(),
        }))
    }

    pub fn cancel(&self, params: Value) -> Result<Value, PluginError> {
        let request: CancelRequest = parse(params)?;
        let state = self
            .state
            .lock()
            .map_err(|_| internal("OCR model download lock is poisoned"))?;
        let Some(active) = state.active.as_ref() else {
            return Ok(json!({ "cancelled": false, "alreadyFinished": true }));
        };
        if active.session_id != request.session_id {
            return Ok(json!({ "cancelled": false, "stale": true }));
        }
        active.cancelled.store(true, Ordering::Relaxed);
        Ok(json!({ "cancelled": true }))
    }

    pub fn remove(&self, params: Value) -> Result<Value, PluginError> {
        let request: TierRequest = parse(params)?;
        if self
            .state
            .lock()
            .map_err(|_| internal("OCR model download lock is poisoned"))?
            .active
            .is_some()
        {
            return Err(PluginError::new(
                -32022,
                "Cannot remove OCR models while a download is active",
            ));
        }
        let directory = model_directory()?;
        match request.tier {
            ModelTier::Accurate => remove_regular_file(&directory.join(ACCURATE.name))?,
            ModelTier::Base => {
                for spec in ACCURATE_MODELS {
                    remove_regular_file(&directory.join(spec.name))?;
                }
            }
        }
        Ok(json!({ "removed": true, "tier": request.tier.as_str() }))
    }

    pub fn model_paths(&self, tier: ModelTier) -> Result<(PathBuf, PathBuf), PluginError> {
        let directory = model_directory()?;
        verify_specs(&directory, specs_for_tier(tier))?;
        let recognition = match tier {
            ModelTier::Base => FAST.name,
            ModelTier::Accurate => ACCURATE.name,
        };
        Ok((directory.join(DETECTION.name), directory.join(recognition)))
    }

    pub fn is_installed(&self, tier: ModelTier) -> bool {
        model_directory()
            .and_then(|directory| verify_specs(&directory, specs_for_tier(tier)))
            .is_ok()
    }
}

fn specs_for_tier(tier: ModelTier) -> &'static [ModelSpec] {
    match tier {
        ModelTier::Base => BASE_MODELS,
        ModelTier::Accurate => ACCURATE_MODELS,
    }
}

fn model_directory() -> Result<PathBuf, PluginError> {
    Ok(data_dir::data_dir()?
        .join("models")
        .join("ocr")
        .join(MODEL_VERSION))
}

fn download_tier(
    tier: ModelTier,
    session_id: &str,
    cancelled: &AtomicBool,
    emitter: &PluginEmitter,
) -> Result<(), PluginError> {
    let directory = model_directory()?;
    fs::create_dir_all(&directory)
        .map_err(|error| internal(format!("Could not create the OCR model directory: {error}")))?;
    cleanup_partial_files(&directory)?;
    let specs = specs_for_tier(tier);
    let total = specs.iter().map(|spec| spec.size).sum::<u64>();
    let mut completed = 0u64;
    for spec in specs {
        if verify_model(&directory.join(spec.name), spec).is_ok() {
            completed += spec.size;
            continue;
        }
        download_model(
            spec, &directory, session_id, tier, completed, total, cancelled, emitter,
        )?;
        completed += spec.size;
    }
    verify_specs(&directory, specs)
}

#[allow(clippy::too_many_arguments)]
fn download_model(
    spec: &ModelSpec,
    directory: &Path,
    session_id: &str,
    tier: ModelTier,
    completed: u64,
    total: u64,
    cancelled: &AtomicBool,
    emitter: &PluginEmitter,
) -> Result<(), PluginError> {
    let destination = directory.join(spec.name);
    let temporary = directory.join(format!(".{}.{}.part", spec.name, session_id));
    let _ = fs::remove_file(&temporary);
    let result = (|| {
        let response = open_release_asset(&format!("{RELEASE_BASE}/{}", spec.name))?;
        if let Some(length) = response.header("Content-Length") {
            let length = length
                .parse::<u64>()
                .map_err(|_| asset_error("OCR model response has an invalid Content-Length"))?;
            if length != spec.size {
                return Err(asset_error(
                    "OCR model response size does not match the signed registry",
                ));
            }
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| {
                internal(format!("Could not create the OCR model download: {error}"))
            })?;
        let mut reader = response.into_reader();
        let mut hasher = Sha256::new();
        let mut downloaded = 0u64;
        let mut prefix = Vec::with_capacity(4);
        let mut buffer = [0u8; 64 * 1024];
        let mut last_event = Instant::now() - Duration::from_secs(1);
        loop {
            if cancelled.load(Ordering::Relaxed) {
                return Err(PluginError::new(-32800, "OCR model download was cancelled"));
            }
            let count = reader.read(&mut buffer).map_err(|error| {
                asset_error(format!("Could not read the OCR model response: {error}"))
            })?;
            if count == 0 {
                break;
            }
            downloaded = downloaded
                .checked_add(count as u64)
                .filter(|value| *value <= spec.size)
                .ok_or_else(|| asset_error("OCR model response exceeds the signed size"))?;
            if prefix.len() < 4 {
                let take = (4 - prefix.len()).min(count);
                prefix.extend_from_slice(&buffer[..take]);
            }
            hasher.update(&buffer[..count]);
            output
                .write_all(&buffer[..count])
                .map_err(|error| internal(format!("Could not write the OCR model: {error}")))?;
            if last_event.elapsed() >= Duration::from_millis(120) {
                emit_progress(
                    emitter,
                    session_id,
                    tier,
                    spec.name,
                    completed + downloaded,
                    total,
                )?;
                last_event = Instant::now();
            }
        }
        if downloaded != spec.size || prefix.as_slice() != b"RTEN" {
            return Err(asset_error(
                "Downloaded OCR model has an invalid size or RTEN header",
            ));
        }
        let digest = hex::encode(hasher.finalize());
        if digest != spec.sha256 {
            return Err(asset_error(
                "Downloaded OCR model failed SHA-256 verification",
            ));
        }
        output
            .flush()
            .and_then(|_| output.sync_all())
            .map_err(|error| internal(format!("Could not flush the OCR model: {error}")))?;
        if destination.exists() {
            remove_regular_file(&destination)?;
        }
        fs::rename(&temporary, &destination)
            .map_err(|error| internal(format!("Could not publish the OCR model: {error}")))?;
        emit_progress(
            emitter,
            session_id,
            tier,
            spec.name,
            completed + downloaded,
            total,
        )
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

fn open_release_asset(url: &str) -> Result<ureq::Response, PluginError> {
    let agent = ureq::AgentBuilder::new()
        .redirects(0)
        .timeout_connect(Duration::from_secs(20))
        .timeout_read(Duration::from_secs(45))
        .build();
    let mut current = Url::parse(url).map_err(|_| asset_error("OCR model URL is invalid"))?;
    for _ in 0..=MAX_REDIRECTS {
        validate_download_url(&current)?;
        let response = match agent.get(current.as_str()).call() {
            Ok(response) => response,
            Err(ureq::Error::Status(_, response)) => response,
            Err(error) => {
                return Err(asset_error(format!(
                    "Could not download OCR model: {error}"
                )))
            }
        };
        if (300..400).contains(&response.status()) {
            let location = response
                .header("Location")
                .ok_or_else(|| asset_error("OCR model redirect is missing a Location header"))?;
            current = current
                .join(location)
                .map_err(|_| asset_error("OCR model redirect URL is invalid"))?;
            continue;
        }
        if response.status() != 200 {
            return Err(asset_error(format!(
                "OCR model server returned HTTP {}",
                response.status()
            )));
        }
        return Ok(response);
    }
    Err(asset_error(
        "OCR model download exceeded the redirect limit",
    ))
}

fn validate_download_url(url: &Url) -> Result<(), PluginError> {
    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    let allowed = host == "github.com"
        || host == "objects.githubusercontent.com"
        || host.ends_with(".githubusercontent.com");
    if url.scheme() != "https" || !allowed || !url.username().is_empty() || url.password().is_some()
    {
        return Err(asset_error(
            "OCR model download was redirected to an untrusted origin",
        ));
    }
    Ok(())
}

fn emit_progress(
    emitter: &PluginEmitter,
    session_id: &str,
    tier: ModelTier,
    file: &str,
    downloaded: u64,
    total: u64,
) -> Result<(), PluginError> {
    emitter.event(
        EVENT,
        json!({
            "sessionId": session_id,
            "tier": tier.as_str(),
            "stage": "download",
            "file": file,
            "downloadedBytes": downloaded,
            "totalBytes": total,
            "progress": if total == 0 { 0.0 } else { downloaded as f64 / total as f64 },
        }),
    )
}

fn verify_specs(directory: &Path, specs: &[ModelSpec]) -> Result<(), PluginError> {
    for spec in specs {
        verify_model(&directory.join(spec.name), spec)?;
    }
    Ok(())
}

fn verify_model(path: &Path, spec: &ModelSpec) -> Result<(), PluginError> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|_| asset_error(format!("OCR model {} is not installed", spec.name)))?;
    if !metadata.file_type().is_file() || metadata.len() != spec.size {
        return Err(asset_error(format!(
            "OCR model {} has an invalid file type or size",
            spec.name
        )));
    }
    let mut file = File::open(path)
        .map_err(|error| asset_error(format!("Could not open OCR model {}: {error}", spec.name)))?;
    let mut hasher = Sha256::new();
    let mut prefix = [0u8; 4];
    file.read_exact(&mut prefix)
        .map_err(|error| asset_error(format!("Could not read OCR model {}: {error}", spec.name)))?;
    if &prefix != b"RTEN" {
        return Err(asset_error(format!(
            "OCR model {} has an invalid RTEN header",
            spec.name
        )));
    }
    hasher.update(prefix);
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|error| {
            asset_error(format!("Could not verify OCR model {}: {error}", spec.name))
        })?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if hex::encode(hasher.finalize()) != spec.sha256 {
        return Err(asset_error(format!(
            "OCR model {} failed SHA-256 verification",
            spec.name
        )));
    }
    Ok(())
}

fn cleanup_partial_files(directory: &Path) -> Result<(), PluginError> {
    for entry in fs::read_dir(directory).map_err(|error| {
        internal(format!(
            "Could not inspect the OCR model directory: {error}"
        ))
    })? {
        let entry = entry
            .map_err(|error| internal(format!("Could not inspect OCR model data: {error}")))?;
        if entry.file_name().to_string_lossy().ends_with(".part") {
            remove_regular_file(&entry.path())?;
        }
    }
    Ok(())
}

fn remove_regular_file(path: &Path) -> Result<(), PluginError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => fs::remove_file(path).map_err(|error| {
            internal(format!(
                "Could not remove OCR model {}: {error}",
                path.display()
            ))
        }),
        Ok(_) => Err(internal(format!(
            "Refusing to remove non-file OCR model path: {}",
            path.display()
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(internal(format!(
            "Could not inspect OCR model {}: {error}",
            path.display()
        ))),
    }
}

fn parse<T: for<'de> Deserialize<'de>>(params: Value) -> Result<T, PluginError> {
    serde_json::from_value(params)
        .map_err(|error| bad(format!("Invalid OCR model parameters: {error}")))
}

fn bad(message: impl Into<String>) -> PluginError {
    PluginError::new(-32602, message)
}

fn internal(message: impl Into<String>) -> PluginError {
    PluginError::new(-32000, message)
}

fn asset_error(message: impl Into<String>) -> PluginError {
    PluginError::new(-32021, message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn registry_matches_the_reviewed_model_bytes() {
        assert_eq!(
            BASE_MODELS.iter().map(|model| model.size).sum::<u64>(),
            21_432_964
        );
        assert_eq!(ACCURATE.size, 84_552_004);
        assert!(DETECTION.sha256.starts_with("06ceb2"));
        assert!(FAST.sha256.starts_with("193699"));
        assert!(ACCURATE.sha256.starts_with("5dad41"));
    }

    #[test]
    fn download_urls_are_https_and_restricted_to_github_assets() {
        validate_download_url(&Url::parse("https://github.com/example/release").unwrap()).unwrap();
        validate_download_url(
            &Url::parse("https://release-assets.githubusercontent.com/file").unwrap(),
        )
        .unwrap();
        assert!(validate_download_url(&Url::parse("http://github.com/file").unwrap()).is_err());
        assert!(validate_download_url(&Url::parse("https://example.com/file").unwrap()).is_err());
        assert!(
            validate_download_url(&Url::parse("https://github.com@example.com/file").unwrap())
                .is_err()
        );
    }

    #[test]
    fn cancellation_is_session_scoped_and_shared_across_manager_clones() {
        let manager = OcrModelManager::default();
        let cancelled = Arc::new(AtomicBool::new(false));
        manager.state.lock().unwrap().active = Some(ActiveDownload {
            session_id: "active-session".into(),
            tier: ModelTier::Base,
            cancelled: cancelled.clone(),
        });
        let stale = manager
            .cancel(json!({ "sessionId": "other-session" }))
            .unwrap();
        assert_eq!(stale["cancelled"], false);
        assert_eq!(stale["stale"], true);
        assert!(!cancelled.load(Ordering::Relaxed));
        manager
            .clone()
            .cancel(json!({ "sessionId": "active-session" }))
            .unwrap();
        assert!(cancelled.load(Ordering::Relaxed));
    }

    #[test]
    fn cancelling_an_already_finished_download_is_idempotent() {
        let result = OcrModelManager::default()
            .cancel(json!({ "sessionId": "finished-session" }))
            .unwrap();
        assert_eq!(result["cancelled"], false);
        assert_eq!(result["alreadyFinished"], true);
    }

    #[test]
    fn invalid_models_and_stale_partial_files_never_become_loadable() {
        let directory = std::env::temp_dir().join(format!("dbx-ocr-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let invalid = directory.join(DETECTION.name);
        fs::write(&invalid, b"RTENwrong").unwrap();
        assert!(verify_model(&invalid, &DETECTION).is_err());
        let partial = directory.join(".detection.test.part");
        fs::write(&partial, b"partial").unwrap();
        cleanup_partial_files(&directory).unwrap();
        assert!(!partial.exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
