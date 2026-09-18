use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use dbx_plugin_sdk::PluginError;
use serde_json::{json, Value};

use crate::helpers::{bad, err, opt_str, str_param};

const MAX_BYTES: usize = 8 * 1024 * 1024;

static LAST_SAVED: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    match method {
        "toolbox/save-file" => save_file(params),
        "toolbox/reveal-file" => reveal_file(params),
        _ => Err(PluginError::method_not_found(method)),
    }
}

fn save_file(params: Value) -> Result<Value, PluginError> {
    let name = sanitize_file_name(str_param(&params, "fileName").unwrap_or("barcode.png"));
    let title = opt_str(&params, "title").unwrap_or("Save PNG");
    let bytes = decode_data(str_param(&params, "data")?)?;
    let start_dir = download_dir().ok();
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
    let Some(path) = last.filter(|saved| paths_match(saved, &requested)) else {
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

fn download_dir() -> Result<PathBuf, PluginError> {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| err("Downloads folder not found"))
}

fn decode_data(data: &str) -> Result<Vec<u8>, PluginError> {
    let raw = data.split(',').next_back().unwrap_or(data).trim();
    let bytes = B64.decode(raw).map_err(|_| bad("Invalid file data"))?;
    if bytes.is_empty() {
        return Err(bad("File is empty"));
    }
    if bytes.len() > MAX_BYTES {
        return Err(bad("File is too large"));
    }
    Ok(bytes)
}

fn sanitize_file_name(raw: &str) -> String {
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

fn paths_match(left: &Path, right: &Path) -> bool {
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