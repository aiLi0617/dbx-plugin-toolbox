use std::fs;
#[cfg(target_os = "windows")]
use std::num::NonZeroIsize;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use dbx_plugin_sdk::PluginError;
use serde_json::{json, Value};

use crate::helpers::{bad, err, opt_str, str_param};

const MAX_BYTES: usize = 10 * 1024 * 1024;
const MAX_BASE64_BYTES: usize = MAX_BYTES.div_ceil(3) * 4;
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[derive(Clone, Copy)]
struct ImageFormat {
    mime: &'static str,
    extension: &'static str,
    label: &'static str,
}

const PNG_FORMAT: ImageFormat = ImageFormat {
    mime: "image/png",
    extension: "png",
    label: "PNG",
};
const JPEG_FORMAT: ImageFormat = ImageFormat {
    mime: "image/jpeg",
    extension: "jpg",
    label: "JPEG",
};
const WEBP_FORMAT: ImageFormat = ImageFormat {
    mime: "image/webp",
    extension: "webp",
    label: "WebP",
};
const GIF_FORMAT: ImageFormat = ImageFormat {
    mime: "image/gif",
    extension: "gif",
    label: "GIF",
};
const BMP_FORMAT: ImageFormat = ImageFormat {
    mime: "image/bmp",
    extension: "bmp",
    label: "BMP",
};
const SVG_FORMAT: ImageFormat = ImageFormat {
    mime: "image/svg+xml",
    extension: "svg",
    label: "SVG",
};

static LAST_SAVED: Mutex<Option<PathBuf>> = Mutex::new(None);

#[cfg(target_os = "windows")]
struct DialogParent(NonZeroIsize);

#[cfg(target_os = "windows")]
impl raw_window_handle::HasWindowHandle for DialogParent {
    fn window_handle(
        &self,
    ) -> Result<raw_window_handle::WindowHandle<'_>, raw_window_handle::HandleError> {
        let handle = raw_window_handle::Win32WindowHandle::new(self.0);
        // SAFETY: The HWND comes from GetForegroundWindow, is checked with IsWindow, and is only
        // borrowed long enough for rfd to copy it into the native dialog configuration.
        Ok(unsafe {
            raw_window_handle::WindowHandle::borrow_raw(raw_window_handle::RawWindowHandle::Win32(
                handle,
            ))
        })
    }
}

#[cfg(target_os = "windows")]
impl raw_window_handle::HasDisplayHandle for DialogParent {
    fn display_handle(
        &self,
    ) -> Result<raw_window_handle::DisplayHandle<'_>, raw_window_handle::HandleError> {
        Ok(raw_window_handle::DisplayHandle::windows())
    }
}

#[cfg(target_os = "windows")]
fn attach_dialog_to_foreground(dialog: rfd::FileDialog) -> rfd::FileDialog {
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> isize;
        fn IsWindow(window: isize) -> i32;
    }

    let window = unsafe { GetForegroundWindow() };
    if window == 0 || unsafe { IsWindow(window) } == 0 {
        return dialog;
    }
    let Some(window) = NonZeroIsize::new(window) else {
        return dialog;
    };
    dialog.set_parent(&DialogParent(window))
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn attach_dialog_to_foreground(dialog: rfd::FileDialog) -> rfd::FileDialog {
    dialog
}

/// Show a native save panel on Windows/Linux via rfd.
#[cfg(not(target_os = "macos"))]
fn run_save_dialog(dialog: rfd::FileDialog) -> Option<PathBuf> {
    let worker = std::thread::Builder::new()
        .name("save-dialog".into())
        .spawn(move || dialog.save_file())
        .ok()?;
    worker.join().ok()?
}

/// macOS sidecars run handlers off the AppKit main thread; rfd panels then
/// silently no-op. `osascript` launches a separate UI process that always can
/// present "choose file name".
#[cfg(target_os = "macos")]
fn pick_save_path_via_osascript(
    title: &str,
    name: &str,
    start_dir: Option<&Path>,
) -> Option<PathBuf> {
    let mut script = format!(
        "POSIX path of (choose file name with prompt \"{}\" default name \"{}\"",
        escape_applescript(title),
        escape_applescript(name),
    );
    if let Some(dir) = start_dir {
        script.push_str(&format!(
            " default location (POSIX file \"{}\")",
            escape_applescript(&dir.to_string_lossy()),
        ));
    }
    script.push(')');

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    Some(PathBuf::from(path))
}

fn escape_applescript(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    match method {
        "toolbox/save-file" => save_file(params),
        "toolbox/reveal-file" => reveal_file(params),
        "toolbox/copy-image" => copy_image(params),
        _ => Err(PluginError::method_not_found(method)),
    }
}

fn copy_image(params: Value) -> Result<Value, PluginError> {
    let bytes = decode_data(str_param(&params, "data")?)?;
    validate_png(&bytes)?;
    copy_png_to_clipboard(&bytes)?;
    Ok(json!({ "ok": true }))
}

#[cfg(target_os = "windows")]
fn copy_png_to_clipboard(bytes: &[u8]) -> Result<(), PluginError> {
    use std::ffi::c_void;
    use std::ptr;
    use std::thread;
    use std::time::Duration;

    type Handle = isize;
    const GMEM_MOVEABLE: u32 = 0x0002;

    #[link(name = "user32")]
    extern "system" {
        fn OpenClipboard(owner: Handle) -> i32;
        fn EmptyClipboard() -> i32;
        fn CloseClipboard() -> i32;
        fn SetClipboardData(format: u32, memory: Handle) -> Handle;
        fn RegisterClipboardFormatW(name: *const u16) -> u32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GlobalAlloc(flags: u32, bytes: usize) -> Handle;
        fn GlobalLock(memory: Handle) -> *mut c_void;
        fn GlobalUnlock(memory: Handle) -> i32;
        fn GlobalFree(memory: Handle) -> Handle;
    }

    let format_name: Vec<u16> = "PNG\0".encode_utf16().collect();
    let format = unsafe { RegisterClipboardFormatW(format_name.as_ptr()) };
    if format == 0 {
        return Err(err("Failed to register PNG clipboard format"));
    }

    let mut opened = false;
    for _ in 0..10 {
        if unsafe { OpenClipboard(0) } != 0 {
            opened = true;
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }
    if !opened {
        return Err(err("Clipboard is busy"));
    }

    let result = unsafe {
        if EmptyClipboard() == 0 {
            Err(err("Failed to clear clipboard"))
        } else {
            let memory = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
            if memory == 0 {
                Err(err("Failed to allocate clipboard memory"))
            } else {
                let target = GlobalLock(memory) as *mut u8;
                if target.is_null() {
                    GlobalFree(memory);
                    Err(err("Failed to lock clipboard memory"))
                } else {
                    ptr::copy_nonoverlapping(bytes.as_ptr(), target, bytes.len());
                    GlobalUnlock(memory);
                    if SetClipboardData(format, memory) == 0 {
                        GlobalFree(memory);
                        Err(err("Failed to write PNG to clipboard"))
                    } else {
                        Ok(())
                    }
                }
            }
        }
    };
    unsafe { CloseClipboard() };
    result
}

#[cfg(not(target_os = "windows"))]
fn copy_png_to_clipboard(_bytes: &[u8]) -> Result<(), PluginError> {
    Err(err(
        "Native image clipboard is not available on this platform",
    ))
}

fn save_file(params: Value) -> Result<Value, PluginError> {
    let bytes = decode_data(str_param(&params, "data")?)?;
    let binary = params
        .get("binary")
        .and_then(|value| value.as_bool())
        .unwrap_or(false);

    if binary {
        return save_binary_file(params, bytes);
    }

    let format = image_format(opt_str(&params, "mimeType").unwrap_or(PNG_FORMAT.mime))?;
    let name = sanitize_file_name(
        str_param(&params, "fileName").unwrap_or("barcode"),
        format.extension,
    );
    let title = opt_str(&params, "title").unwrap_or("Save image");
    validate_image(&bytes, format)?;
    let start_dir = download_dir().ok();
    let Some(mut path) = pick_save_path(title, &name, start_dir.as_deref(), format) else {
        return Ok(json!({ "cancelled": true }));
    };
    path = ensure_extension(path, format.extension);
    write_saved_file(&path, &bytes)?;
    Ok(json!({
        "cancelled": false,
        "path": path.to_string_lossy(),
        "fileName": path.file_name().and_then(|value| value.to_str()).unwrap_or(&name),
    }))
}

fn save_binary_file(params: Value, bytes: Vec<u8>) -> Result<Value, PluginError> {
    let mime = opt_str(&params, "mimeType").unwrap_or("application/octet-stream");
    let raw_name = str_param(&params, "fileName").unwrap_or("download");
    let extension = resolve_save_extension(opt_str(&params, "extension"), raw_name, mime);
    let name = sanitize_file_name(raw_name, &extension);
    let title = opt_str(&params, "title").unwrap_or("Save file");
    let start_dir = download_dir().ok();
    let Some(mut path) = pick_save_path_binary(title, &name, start_dir.as_deref(), &extension)
    else {
        return Ok(json!({ "cancelled": true }));
    };
    path = ensure_extension(path, &extension);
    write_saved_file(&path, &bytes)?;
    Ok(json!({
        "cancelled": false,
        "path": path.to_string_lossy(),
        "fileName": path.file_name().and_then(|value| value.to_str()).unwrap_or(&name),
    }))
}

fn write_saved_file(path: &Path, bytes: &[u8]) -> Result<(), PluginError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| err(format!("Failed to create folder: {error}")))?;
    }
    fs::write(path, bytes).map_err(|error| err(format!("Failed to save file: {error}")))?;
    if let Ok(mut last) = LAST_SAVED.lock() {
        *last = Some(path.to_path_buf());
    }
    Ok(())
}

fn resolve_save_extension(explicit: Option<&str>, file_name: &str, mime: &str) -> String {
    if let Some(ext) = explicit
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_start_matches('.').to_ascii_lowercase())
        .filter(|value| !value.is_empty())
    {
        return ext;
    }
    if let Some(ext) = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
    {
        return ext;
    }
    extension_for_mime(mime).to_string()
}

fn extension_for_mime(mime: &str) -> &'static str {
    match mime
        .split(';')
        .next()
        .unwrap_or(mime)
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "image/png" => "png",
        "image/jpeg" | "image/jpg" => "jpg",
        "image/gif" => "gif",
        "image/webp" => "webp",
        "image/bmp" | "image/x-ms-bmp" => "bmp",
        "image/svg+xml" => "svg",
        "image/x-icon" | "image/vnd.microsoft.icon" => "ico",
        "image/tiff" | "image/tif" => "tiff",
        "image/avif" => "avif",
        "text/plain" => "txt",
        "text/csv" => "csv",
        "text/tab-separated-values" => "tsv",
        "text/html" => "html",
        "text/css" => "css",
        "text/javascript" | "application/javascript" => "js",
        "application/json" => "json",
        "application/xml" | "text/xml" => "xml",
        "application/pdf" => "pdf",
        "application/zip" => "zip",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" => "xlsx",
        _ => "bin",
    }
}

fn pick_save_path_binary(
    title: &str,
    name: &str,
    start_dir: Option<&Path>,
    extension: &str,
) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = extension;
        return pick_save_path_via_osascript(title, name, start_dir);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let title = title.to_string();
        let name = name.to_string();
        let start_dir = start_dir.map(Path::to_path_buf);
        let extension = extension.to_string();
        let mut dialog = attach_dialog_to_foreground(
            rfd::FileDialog::new()
                .set_title(&title)
                .set_file_name(&name)
                .add_filter("File", &[&extension])
                .add_filter("All files", &["*"]),
        );
        if let Some(dir) = start_dir.as_deref() {
            dialog = dialog.set_directory(dir);
        }
        run_save_dialog(dialog)
    }
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

fn pick_save_path(
    title: &str,
    name: &str,
    start_dir: Option<&Path>,
    format: ImageFormat,
) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        let _ = format;
        return pick_save_path_via_osascript(title, name, start_dir);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let title = title.to_string();
        let name = name.to_string();
        let start_dir = start_dir.map(Path::to_path_buf);
        let mut dialog = attach_dialog_to_foreground(
            rfd::FileDialog::new()
                .set_title(&title)
                .set_file_name(&name)
                .add_filter(format.label, &[format.extension]),
        );
        if let Some(dir) = start_dir.as_deref() {
            dialog = dialog.set_directory(dir);
        }
        run_save_dialog(dialog)
    }
}

fn download_dir() -> Result<PathBuf, PluginError> {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .ok_or_else(|| err("Downloads folder not found"))
}

fn decode_data(data: &str) -> Result<Vec<u8>, PluginError> {
    let raw = data.split(',').next_back().unwrap_or(data).trim();
    if raw.len() > MAX_BASE64_BYTES {
        return Err(bad("File is too large"));
    }
    let bytes = B64.decode(raw).map_err(|_| bad("Invalid file data"))?;
    if bytes.is_empty() {
        return Err(bad("File is empty"));
    }
    if bytes.len() > MAX_BYTES {
        return Err(bad("File is too large"));
    }
    Ok(bytes)
}

fn validate_png(bytes: &[u8]) -> Result<(), PluginError> {
    validate_image(bytes, PNG_FORMAT)
}

fn image_format(mime: &str) -> Result<ImageFormat, PluginError> {
    match mime.trim().to_ascii_lowercase().as_str() {
        "image/png" => Ok(PNG_FORMAT),
        "image/jpeg" | "image/jpg" => Ok(JPEG_FORMAT),
        "image/webp" => Ok(WEBP_FORMAT),
        "image/gif" => Ok(GIF_FORMAT),
        "image/bmp" | "image/x-ms-bmp" => Ok(BMP_FORMAT),
        "image/svg+xml" => Ok(SVG_FORMAT),
        _ => Err(bad("Unsupported image format")),
    }
}

fn validate_image(bytes: &[u8], format: ImageFormat) -> Result<(), PluginError> {
    let valid = match format.mime {
        "image/png" => bytes.starts_with(PNG_SIGNATURE),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/webp" => bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "image/gif" => {
            bytes.len() >= 14
                && (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"))
                && bytes.last() == Some(&0x3b)
        }
        "image/bmp" => {
            bytes.len() >= 26
                && bytes.starts_with(b"BM")
                && u32::from_le_bytes([bytes[2], bytes[3], bytes[4], bytes[5]]) as usize
                    == bytes.len()
                && u32::from_le_bytes([bytes[10], bytes[11], bytes[12], bytes[13]]) as usize >= 14
        }
        "image/svg+xml" => validate_svg(bytes),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(bad(format!("Image data is not valid {}", format.label)))
    }
}

fn validate_svg(bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else {
        return false;
    };
    let lower = text.to_ascii_lowercase();
    let trimmed = lower.trim_start();
    let starts_as_svg = trimmed.starts_with("<svg") || trimmed.starts_with("<?xml");
    starts_as_svg
        && lower.contains("<svg")
        && lower.contains("</svg")
        && !lower.contains("<script")
        && !lower.contains("javascript:")
        && !lower.contains("<foreignobject")
        && !lower.contains("<iframe")
        && !lower.contains("<object")
        && !lower.contains("<embed")
        && !lower.contains("<use")
        && !lower.contains(" xlink:href=")
        && !lower.contains(" href=\"http:")
        && !lower.contains(" href=\"https:")
        && !lower.contains(" href=\"//")
        && !lower.contains(" href=\"javascript:")
        && !lower
            .split(|ch: char| !ch.is_ascii_alphanumeric())
            .any(|token| token.starts_with("on") && token.len() > 2)
}

fn sanitize_file_name(raw: &str, extension: &str) -> String {
    let base = Path::new(raw)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("barcode");
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
        return format!("barcode.{extension}");
    }
    let suffix = format!(".{extension}");
    if cleaned.to_ascii_lowercase().ends_with(&suffix) {
        cleaned
    } else {
        format!("{cleaned}{suffix}")
    }
}

fn ensure_extension(path: PathBuf, extension: &str) -> PathBuf {
    match path.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case(extension) => path,
        _ => path.with_extension(extension),
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
            Command::new("explorer")
                .arg(format!("/select,{}", path.display()))
                .spawn()
        }
        #[cfg(target_os = "macos")]
        {
            Command::new("open")
                .args(["-R", &path.to_string_lossy()])
                .spawn()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_png_and_oversized_base64_before_decoding() {
        assert!(validate_png(b"not a png").is_err());
        let mut png = PNG_SIGNATURE.to_vec();
        png.extend_from_slice(b"payload");
        assert!(validate_png(&png).is_ok());
        assert!(decode_data(&"A".repeat(MAX_BASE64_BYTES + 1)).is_err());
    }

    #[test]
    fn validates_supported_image_formats() {
        assert_eq!(image_format("image/png").unwrap().extension, "png");
        assert_eq!(image_format("image/jpeg").unwrap().extension, "jpg");
        assert_eq!(image_format("image/webp").unwrap().extension, "webp");
        assert_eq!(image_format("image/gif").unwrap().extension, "gif");
        assert_eq!(image_format("image/bmp").unwrap().extension, "bmp");
        assert_eq!(image_format("image/x-ms-bmp").unwrap().extension, "bmp");
        assert!(validate_image(&[0xff, 0xd8, 0xff, 0xe0], JPEG_FORMAT).is_ok());
        assert!(validate_image(b"RIFF1234WEBP", WEBP_FORMAT).is_ok());
        assert!(validate_image(b"not an image", WEBP_FORMAT).is_err());
        assert!(validate_image(b"GIF89a1234567;", GIF_FORMAT).is_ok());
        assert!(validate_image(b"GIF89a1234567", GIF_FORMAT).is_err());
        let mut bmp = vec![0_u8; 26];
        bmp[..2].copy_from_slice(b"BM");
        let bmp_size = bmp.len() as u32;
        bmp[2..6].copy_from_slice(&bmp_size.to_le_bytes());
        bmp[10..14].copy_from_slice(&14_u32.to_le_bytes());
        assert!(validate_image(&bmp, BMP_FORMAT).is_ok());
        bmp[2] = 0;
        assert!(validate_image(&bmp, BMP_FORMAT).is_err());
        assert!(validate_image(
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
            SVG_FORMAT
        )
        .is_ok());
        assert!(validate_image(b"<svg><script>alert(1)</script></svg>", SVG_FORMAT).is_err());
        assert!(validate_image(b"<svg onmouseover=\"alert(1)\"></svg>", SVG_FORMAT).is_err());
        assert!(validate_image(b"<svg><foreignObject></foreignObject></svg>", SVG_FORMAT).is_err());
        assert!(validate_image(
            b"<svg><image href=\"https://example.com/x\"/></svg>",
            SVG_FORMAT
        )
        .is_err());
        assert!(image_format("image/svg+xml").is_ok());
        assert_eq!(sanitize_file_name("code.svg", "svg"), "code.svg");
    }

    #[test]
    fn sanitizes_export_names() {
        assert_eq!(sanitize_file_name("../bad:name", "jpg"), "bad_name.jpg");
        assert_eq!(sanitize_file_name("...", "png"), "barcode.png");
        assert_eq!(sanitize_file_name("code.PNG", "png"), "code.PNG");
    }

    #[test]
    fn resolves_save_extension_from_file_name_before_mime_fallback() {
        assert_eq!(
            resolve_save_extension(None, "Sheet1.csv", "application/octet-stream"),
            "csv"
        );
        assert_eq!(
            resolve_save_extension(None, "Sheet1.tsv", "text/plain"),
            "tsv"
        );
        assert_eq!(
            resolve_save_extension(None, "table.xlsx", "application/octet-stream"),
            "xlsx"
        );
        assert_eq!(
            resolve_save_extension(Some("CSV"), "download", "application/octet-stream"),
            "csv"
        );
        assert_eq!(extension_for_mime("text/csv"), "csv");
        assert_eq!(
            extension_for_mime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            "xlsx"
        );
        assert_eq!(sanitize_file_name("Sheet1.csv", "csv"), "Sheet1.csv");
        assert_ne!(sanitize_file_name("Sheet1.csv", "bin"), "Sheet1.csv");
    }

    #[test]
    fn escapes_applescript_string_literals() {
        assert_eq!(escape_applescript(r#"a"b\c"#), r#"a\"b\\c"#);
    }
}
