use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use dbx_plugin_sdk::PluginError;
use lopdf::encryption::crypt_filters::{Aes256CryptFilter, CryptFilter};
use lopdf::{Document, Object, ObjectId, Permissions};
use lopdf::{EncryptionState, EncryptionVersion};
use rand::RngCore;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::fsutil;
use crate::helpers::{bad, err, opt_str, str_param};

const CHANNEL_PREFIX: &str = "toolbox/pdf/";
const CHUNK_BYTES: usize = 4 * 1024 * 1024;
const MAX_CHUNK_BYTES: usize = 8 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_FILES: usize = 20;
const MAX_PAGES: usize = 5_000;
const SESSION_TTL: Duration = Duration::from_secs(30 * 60);

pub struct PdfService {
    sessions: Mutex<HashMap<String, PdfSession>>,
}

impl Default for PdfService {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

struct PdfSession {
    directory: PathBuf,
    files: Vec<UploadFile>,
    output: Option<OutputFile>,
    processing: bool,
    control: Arc<PdfControl>,
    result: Option<Value>,
    failure: Option<PluginError>,
    last_updated: Instant,
}

#[derive(Default)]
struct PdfControl {
    cancelled: AtomicBool,
    progress: Mutex<Value>,
}

impl PdfControl {
    fn check(&self) -> Result<(), PluginError> {
        if self.cancelled.load(Ordering::Acquire) {
            Err(PluginError::new(-32800, "PDF processing was cancelled"))
        } else {
            Ok(())
        }
    }

    fn update(&self, stage: &str, completed: usize, total: usize) -> Result<(), PluginError> {
        self.check()?;
        if let Ok(mut progress) = self.progress.lock() {
            *progress = json!({"stage": stage, "completed": completed, "total": total});
        }
        Ok(())
    }
}

struct PdfWork {
    paths: Vec<PathBuf>,
    directory: PathBuf,
    control: Arc<PdfControl>,
}

struct UploadFile {
    path: PathBuf,
    expected_bytes: u64,
    expected_chunks: u32,
    received_bytes: u64,
    received_chunks: u32,
    received_map: Vec<bool>,
    file: File,
}

struct OutputFile {
    path: PathBuf,
    name: String,
    size: u64,
}

impl Drop for PdfSession {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}

impl PdfService {
    pub fn handle(&self, method: &str, params: Value) -> Result<Value, PluginError> {
        match method {
            "toolbox/pdf/begin" => self.begin(params),
            "toolbox/pdf/status" => self.status(params),
            "toolbox/pdf/inspect" => self.inspect(params),
            "toolbox/pdf/process" => self.process(params),
            "toolbox/pdf/save" => self.save(params),
            "toolbox/pdf/cancel" => self.cancel(params),
            _ => Err(PluginError::method_not_found(method)),
        }
    }

    pub fn handle_binary(&self, channel: &str, data: Vec<u8>) -> Result<(), PluginError> {
        let suffix = channel
            .strip_prefix(CHANNEL_PREFIX)
            .ok_or_else(|| bad("Unknown PDF binary channel"))?;
        let mut parts = suffix.rsplitn(3, '/');
        let chunk_index = parts
            .next()
            .and_then(|v| v.parse::<u32>().ok())
            .ok_or_else(|| bad("Invalid PDF chunk index"))?;
        let file_index = parts
            .next()
            .and_then(|v| v.parse::<usize>().ok())
            .ok_or_else(|| bad("Invalid PDF file index"))?;
        let session_id = parts
            .next()
            .ok_or_else(|| bad("Invalid PDF binary channel"))?;
        if data.is_empty() || data.len() > MAX_CHUNK_BYTES {
            return Err(bad("Invalid PDF chunk size"));
        }

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        let session = sessions
            .get_mut(session_id)
            .ok_or_else(|| bad("PDF session was not found"))?;
        if session.processing {
            return Err(bad("PDF session is processing"));
        }
        let upload = session
            .files
            .get_mut(file_index)
            .ok_or_else(|| bad("PDF file index is outside the declared range"))?;
        if chunk_index >= upload.expected_chunks {
            return Err(bad("PDF chunk index is outside the declared range"));
        }
        if upload.received_map[chunk_index as usize] {
            return Err(bad("PDF chunk was already uploaded"));
        }
        let offset = (chunk_index as u64)
            .checked_mul(CHUNK_BYTES as u64)
            .ok_or_else(|| bad("PDF upload is too large"))?;
        let expected = upload
            .expected_bytes
            .saturating_sub(offset)
            .min(CHUNK_BYTES as u64) as usize;
        if data.len() != expected {
            return Err(bad("Invalid PDF chunk size"));
        }
        let next = upload
            .received_bytes
            .checked_add(data.len() as u64)
            .ok_or_else(|| bad("PDF upload is too large"))?;
        if next > upload.expected_bytes {
            return Err(bad("PDF upload exceeds its declared size"));
        }
        upload
            .file
            .seek(SeekFrom::Start(offset))
            .map_err(|e| err(format!("Could not seek PDF upload: {e}")))?;
        upload
            .file
            .write_all(&data)
            .map_err(|e| err(format!("Could not write PDF upload: {e}")))?;
        upload.received_bytes = next;
        upload.received_chunks += 1;
        upload.received_map[chunk_index as usize] = true;
        session.last_updated = Instant::now();
        Ok(())
    }

    fn begin(&self, params: Value) -> Result<Value, PluginError> {
        let declared = params
            .get("files")
            .and_then(Value::as_array)
            .ok_or_else(|| bad("Missing PDF files"))?;
        if declared.is_empty() || declared.len() > MAX_FILES {
            return Err(bad("Use between 1 and 20 PDF files"));
        }
        let mut total = 0u64;
        let specs = declared
            .iter()
            .map(|item| {
                let size = item
                    .get("size")
                    .and_then(Value::as_u64)
                    .filter(|v| *v > 0 && *v <= MAX_FILE_BYTES)
                    .ok_or_else(|| bad("PDF file size is invalid or exceeds 512 MB"))?;
                let chunks = item
                    .get("chunkCount")
                    .and_then(Value::as_u64)
                    .and_then(|v| u32::try_from(v).ok())
                    .filter(|v| {
                        *v > 0 && (*v as usize) <= (MAX_FILE_BYTES as usize).div_ceil(CHUNK_BYTES)
                    })
                    .ok_or_else(|| bad("PDF chunk count is invalid"))?;
                total = total
                    .checked_add(size)
                    .ok_or_else(|| bad("PDF input is too large"))?;
                Ok((size, chunks))
            })
            .collect::<Result<Vec<_>, PluginError>>()?;
        if total > MAX_TOTAL_BYTES {
            return Err(bad("PDF input exceeds the 1 GB total limit"));
        }

        let session_id = Uuid::new_v4().simple().to_string();
        let directory = std::env::temp_dir()
            .join("dbx-toolbox-pdf")
            .join(&session_id);
        fs::create_dir_all(&directory)
            .map_err(|e| err(format!("Could not create PDF temporary directory: {e}")))?;
        let mut candidate = PdfSession {
            directory,
            files: Vec::with_capacity(specs.len()),
            output: None,
            processing: false,
            control: Arc::default(),
            result: None,
            failure: None,
            last_updated: Instant::now(),
        };
        for (index, (size, chunks)) in specs.into_iter().enumerate() {
            let path = candidate.directory.join(format!("input-{index}.pdf"));
            let file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&path)
                .map_err(|e| err(format!("Could not create PDF temporary file: {e}")))?;
            candidate.files.push(UploadFile {
                path,
                expected_bytes: size,
                expected_chunks: chunks,
                received_bytes: 0,
                received_chunks: 0,
                received_map: vec![false; chunks as usize],
                file,
            });
        }
        // Build the candidate before locking so every early return still drops it and
        // removes its temporary directory.
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        sessions.retain(|_, value| value.processing || value.last_updated.elapsed() < SESSION_TTL);
        if sessions.len() >= 4 {
            return Err(err("Too many PDF sessions are active"));
        }
        sessions.insert(session_id.clone(), candidate);
        Ok(
            json!({ "sessionId": session_id, "channel": format!("{CHANNEL_PREFIX}{session_id}"), "chunkBytes": CHUNK_BYTES }),
        )
    }

    fn status(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "sessionId")?;
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        let session = sessions
            .get(id)
            .ok_or_else(|| bad("PDF session was not found"))?;
        Ok(json!({
            "files": session.files.iter().map(|f| json!({"receivedBytes": f.received_bytes, "receivedChunks": f.received_chunks})).collect::<Vec<_>>(),
            "processing": session.processing,
            "cancelling": session.control.cancelled.load(Ordering::Acquire),
            "progress": session.control.progress.lock().ok().map(|value| value.clone()),
            "result": session.result,
            "error": session.failure,
            "output": session.output.as_ref().map(|o| json!({"name": o.name, "size": o.size})),
        }))
    }

    fn start_work(&self, id: &str) -> Result<PdfWork, PluginError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| bad("PDF session was not found"))?;
        if session.processing {
            return Err(bad("PDF session is already processing"));
        }
        if session
            .files
            .iter()
            .any(|f| f.received_bytes != f.expected_bytes || f.received_chunks != f.expected_chunks)
        {
            return Err(bad("PDF upload is incomplete"));
        }
        session.processing = true;
        session.result = None;
        session.failure = None;
        session.control = Arc::default();
        Ok(PdfWork {
            paths: session.files.iter().map(|f| f.path.clone()).collect(),
            directory: session.directory.clone(),
            control: session.control.clone(),
        })
    }

    fn finish_work(
        &self,
        id: &str,
        result: Result<Value, PluginError>,
        output: Option<OutputFile>,
    ) -> Result<Value, PluginError> {
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        let session = sessions
            .get_mut(id)
            .ok_or_else(|| bad("PDF session was not found"))?;
        session.processing = false;
        session.last_updated = Instant::now();
        if let Err(cancelled) = session.control.check() {
            sessions.remove(id);
            return Err(cancelled);
        }
        session.output = output;
        match &result {
            Ok(value) => session.result = Some(value.clone()),
            Err(error) => session.failure = Some(error.clone()),
        }
        result
    }

    fn inspect(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "sessionId")?;
        let password = opt_str(&params, "password").unwrap_or("");
        let work = self.start_work(id)?;
        let result = (|| {
            let mut files = Vec::new();
            let mut total_pages = 0usize;
            for (index, path) in work.paths.iter().enumerate() {
                work.control.update("inspect", index, work.paths.len())?;
                let doc = load_document(path, password)?;
                work.control.check()?;
                let pages = document_pages(&doc)?;
                total_pages += pages.len();
                if total_pages > MAX_PAGES {
                    return Err(bad("PDF page limit is 5000"));
                }
                files.push(json!({ "count": pages.len(), "pages": pages, "signed": document_has_signature(&doc) }));
            }
            Ok(json!({ "files": files, "count": total_pages }))
        })();
        self.finish_work(id, result, None)
    }

    fn process(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "sessionId")?.to_string();
        let operation = str_param(&params, "operation")?.to_string();
        let password = opt_str(&params, "password").unwrap_or("").to_string();
        let work = self.start_work(&id)?;
        let result = process_documents(
            &work.directory,
            &work.paths,
            &operation,
            &password,
            &params,
            &work.control,
        );
        match result {
            Ok(output) => {
                let response = json!({ "name": output.name, "size": output.size });
                self.finish_work(&id, Ok(response), Some(output))
            }
            Err(error) => self.finish_work(&id, Err(error), None),
        }
    }

    fn save(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "sessionId")?;
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        let session = sessions
            .get(id)
            .ok_or_else(|| bad("PDF session was not found"))?;
        let output = session
            .output
            .as_ref()
            .ok_or_else(|| bad("PDF output is not ready"))?;
        let name = opt_str(&params, "fileName").unwrap_or(&output.name);
        fsutil::save_existing_file(&output.path, name, "Save PDF result")
    }

    fn cancel(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "sessionId")?;
        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| err("PDF session lock is poisoned"))?;
        if let Some(session) = sessions.get(id) {
            if session.processing {
                session.control.cancelled.store(true, Ordering::Release);
                return Ok(json!({ "cancelled": false, "cancelling": true }));
            }
        }
        sessions.remove(id);
        Ok(json!({ "cancelled": true }))
    }
}

fn load_document(path: &Path, password: &str) -> Result<Document, PluginError> {
    Document::load_with_password(path, password)
        .map_err(|e| bad(format!("Could not open PDF: {e}")))
}

fn inherited(doc: &Document, page_id: ObjectId, key: &[u8]) -> Option<Object> {
    let mut current = page_id;
    for _ in 0..64 {
        let dict = doc.get_object(current).ok()?.as_dict().ok()?;
        if let Ok(value) = dict.get(key) {
            return Some(value.clone());
        }
        current = dict.get(b"Parent").ok()?.as_reference().ok()?;
    }
    None
}

fn resolved_array<'a>(doc: &'a Document, value: &'a Object) -> Option<&'a Vec<Object>> {
    doc.dereference(value).ok()?.1.as_array().ok()
}

fn page_box(doc: &Document, page_id: ObjectId) -> [f32; 4] {
    let value =
        inherited(doc, page_id, b"CropBox").or_else(|| inherited(doc, page_id, b"MediaBox"));
    let Some(values) = value.as_ref().and_then(|v| resolved_array(doc, v)) else {
        return [0.0, 0.0, 612.0, 792.0];
    };
    if values.len() != 4 {
        return [0.0, 0.0, 612.0, 792.0];
    }
    let nums = values
        .iter()
        .map(|v| doc.dereference(v).ok().and_then(|(_, x)| x.as_float().ok()))
        .collect::<Option<Vec<_>>>();
    nums.map(|v| [v[0], v[1], v[2], v[3]])
        .unwrap_or([0.0, 0.0, 612.0, 792.0])
}

fn document_pages(doc: &Document) -> Result<Vec<Value>, PluginError> {
    Ok(doc.get_pages().into_values().map(|id| {
        let b = page_box(doc, id);
        let rotation = inherited(doc, id, b"Rotate").and_then(|v| v.as_i64().ok()).unwrap_or(0);
        json!({ "width": (b[2] - b[0]).abs(), "height": (b[3] - b[1]).abs(), "rotation": rotation })
    }).collect())
}

fn document_has_signature(doc: &Document) -> bool {
    doc.objects
        .values()
        .any(|value| value.as_dict().is_ok_and(|dict| dict.has(b"ByteRange")))
}

fn selected_pages(source: &str, count: usize) -> Result<Vec<u32>, PluginError> {
    if source.trim().is_empty() {
        return Ok((1..=count as u32).collect());
    }
    let mut out = Vec::new();
    for part in source.split(',') {
        let pair = part.trim().split_once('-');
        let (start, end) = match pair {
            Some((a, b)) => (a.trim().parse::<u32>().ok(), b.trim().parse::<u32>().ok()),
            None => {
                let n = part.trim().parse::<u32>().ok();
                (n, n)
            }
        };
        let (Some(start), Some(end)) = (start, end) else {
            return Err(bad("Invalid page range"));
        };
        if start == 0 || end < start || end as usize > count {
            return Err(bad("Page range is out of bounds"));
        }
        out.extend(start..=end);
        if out.len() > MAX_PAGES {
            return Err(bad("Too many selected pages"));
        }
    }
    out.sort_unstable();
    out.dedup();
    Ok(out)
}

fn materialize_page(doc: &mut Document, page_id: ObjectId) {
    for key in [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"] {
        let value = inherited(doc, page_id, key);
        if let Some(value) = value {
            if let Ok(dict) = doc.get_object_mut(page_id).and_then(Object::as_dict_mut) {
                if !dict.has(key) {
                    dict.set(key, value);
                }
            }
        }
    }
}

fn pages_root(doc: &Document) -> Result<ObjectId, PluginError> {
    doc.catalog()
        .and_then(|c| c.get(b"Pages"))
        .and_then(Object::as_reference)
        .map_err(|e| err(format!("PDF pages root is invalid: {e}")))
}

fn set_page_order(doc: &mut Document, order: &[u32]) -> Result<(), PluginError> {
    let pages = doc.get_pages();
    if order.is_empty() {
        return Err(bad("At least one page is required"));
    }
    let ids = order
        .iter()
        .map(|number| {
            pages
                .get(number)
                .copied()
                .ok_or_else(|| bad("Page order is out of bounds"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let root = pages_root(doc)?;
    for id in &ids {
        materialize_page(doc, *id);
        doc.get_object_mut(*id)
            .and_then(Object::as_dict_mut)
            .map_err(|e| err(format!("PDF page is invalid: {e}")))?
            .set("Parent", root);
    }
    let root_dict = doc
        .get_object_mut(root)
        .and_then(Object::as_dict_mut)
        .map_err(|e| err(format!("PDF pages root is invalid: {e}")))?;
    root_dict.set(
        "Kids",
        ids.iter()
            .copied()
            .map(Object::Reference)
            .collect::<Vec<_>>(),
    );
    root_dict.set("Count", ids.len() as i64);
    doc.prune_objects();
    Ok(())
}

fn merge_documents(
    paths: &[PathBuf],
    password: &str,
    control: &PdfControl,
) -> Result<Document, PluginError> {
    control.update("process", 0, paths.len())?;
    let mut iter = paths.iter();
    let mut output = load_document(iter.next().ok_or_else(|| bad("PDF required"))?, password)?;
    let root = pages_root(&output)?;
    let initial: Vec<u32> = (1..=output.get_pages().len() as u32).collect();
    if initial.len() > MAX_PAGES {
        return Err(bad("PDF page limit is 5000"));
    }
    set_page_order(&mut output, &initial)?;
    for (index, path) in iter.enumerate() {
        control.update("process", index + 1, paths.len())?;
        let mut next = load_document(path, password)?;
        next.renumber_objects_with(output.max_id + 1);
        let ids: Vec<ObjectId> = next.get_pages().into_values().collect();
        control.check()?;
        if output.get_pages().len() + ids.len() > MAX_PAGES {
            return Err(bad("PDF page limit is 5000"));
        }
        for id in &ids {
            control.check()?;
            materialize_page(&mut next, *id);
        }
        output.max_id = output.max_id.max(next.max_id);
        output.objects.extend(next.objects);
        for id in &ids {
            output
                .get_object_mut(*id)
                .and_then(Object::as_dict_mut)
                .map_err(|e| err(format!("PDF page is invalid: {e}")))?
                .set("Parent", root);
        }
        let root_dict = output
            .get_object_mut(root)
            .and_then(Object::as_dict_mut)
            .map_err(|e| err(format!("PDF pages root is invalid: {e}")))?;
        let count = {
            let kids = root_dict
                .get_mut(b"Kids")
                .and_then(Object::as_array_mut)
                .map_err(|e| err(format!("PDF page tree is invalid: {e}")))?;
            kids.extend(ids.iter().copied().map(Object::Reference));
            kids.len()
        };
        root_dict.set("Count", count as i64);
    }
    output.prune_objects();
    Ok(output)
}

fn process_documents(
    directory: &Path,
    paths: &[PathBuf],
    operation: &str,
    password: &str,
    params: &Value,
    control: &PdfControl,
) -> Result<OutputFile, PluginError> {
    control.update("process", 0, 0)?;
    let output_path = directory.join(if operation == "split" {
        "split-pdfs.zip"
    } else {
        "result.pdf"
    });
    let name = if operation == "merge" {
        "merged.pdf"
    } else if operation == "split" {
        "split-pdfs.zip"
    } else {
        "result.pdf"
    }
    .to_string();
    if operation == "merge" {
        let mut doc = merge_documents(paths, password, control)?;
        control.update("write", 0, 0)?;
        doc.save_modern(
            &mut File::create(&output_path)
                .map_err(|e| err(format!("Could not create PDF output: {e}")))?,
        )
        .map_err(|e| err(format!("Could not save PDF: {e}")))?;
    } else {
        let mut doc = load_document(paths.first().ok_or_else(|| bad("PDF required"))?, password)?;
        control.check()?;
        let count = doc.get_pages().len();
        if count > MAX_PAGES {
            return Err(bad("PDF page limit is 5000"));
        }
        let pages = selected_pages(opt_str(params, "pages").unwrap_or(""), count)?;
        match operation {
            "extract" => set_page_order(&mut doc, &pages)?,
            "delete" => {
                if opt_str(params, "pages").unwrap_or("").trim().is_empty() {
                    return Err(bad("Specify pages to delete"));
                }
                if pages.len() >= count {
                    return Err(bad("Cannot delete all pages"));
                }
                doc.delete_pages(&pages);
                doc.prune_objects();
            }
            "organize" => {
                let order = params
                    .get("order")
                    .and_then(Value::as_array)
                    .ok_or_else(|| bad("Invalid page order"))?
                    .iter()
                    .map(|v| {
                        v.as_u64()
                            .and_then(|n| u32::try_from(n + 1).ok())
                            .ok_or_else(|| bad("Invalid page order"))
                    })
                    .collect::<Result<Vec<_>, _>>()?;
                if order.len() != count {
                    return Err(bad("Invalid page order"));
                }
                set_page_order(&mut doc, &order)?;
            }
            "rotate" => {
                let angle = params
                    .get("angle")
                    .and_then(Value::as_i64)
                    .filter(|v| [90, 180, 270].contains(v))
                    .ok_or_else(|| bad("Rotation must be 90, 180, or 270"))?;
                let map = doc.get_pages();
                for number in pages {
                    control.check()?;
                    let id = *map
                        .get(&number)
                        .ok_or_else(|| bad("Page is out of bounds"))?;
                    let current = inherited(&doc, id, b"Rotate")
                        .and_then(|v| v.as_i64().ok())
                        .unwrap_or(0);
                    doc.get_object_mut(id)
                        .and_then(Object::as_dict_mut)
                        .map_err(|e| err(e.to_string()))?
                        .set("Rotate", (current + angle).rem_euclid(360));
                }
            }
            "crop" => {
                let margins = ["left", "bottom", "right", "top"]
                    .map(|key| {
                        params
                            .get(key)
                            .and_then(Value::as_f64)
                            .filter(|v| v.is_finite() && *v >= 0.0)
                            .map(|v| v as f32)
                            .ok_or_else(|| bad("Invalid crop margins"))
                    })
                    .into_iter()
                    .collect::<Result<Vec<_>, _>>()?;
                let map = doc.get_pages();
                for number in pages {
                    control.check()?;
                    let id = *map
                        .get(&number)
                        .ok_or_else(|| bad("Page is out of bounds"))?;
                    let b = page_box(&doc, id);
                    if margins[0] + margins[2] >= b[2] - b[0]
                        || margins[1] + margins[3] >= b[3] - b[1]
                    {
                        return Err(bad("Crop removes the entire page"));
                    }
                    doc.get_object_mut(id)
                        .and_then(Object::as_dict_mut)
                        .map_err(|e| err(e.to_string()))?
                        .set(
                            "CropBox",
                            vec![
                                (b[0] + margins[0]).into(),
                                (b[1] + margins[1]).into(),
                                (b[2] - margins[2]).into(),
                                (b[3] - margins[3]).into(),
                            ],
                        );
                }
            }
            "compress" => {
                doc.trailer.remove(b"Info");
                for value in doc.objects.values_mut() {
                    if let Ok(dict) = value.as_dict_mut() {
                        dict.remove(b"Metadata");
                        dict.remove(b"Thumb");
                    }
                }
                doc.prune_objects();
                doc.compress();
            }
            "decrypt" => {
                if doc.is_encrypted() {
                    doc.decrypt(password)
                        .map_err(|e| bad(format!("Could not decrypt PDF: {e}")))?;
                }
            }
            "encrypt" => {
                let new_password = str_param(params, "newPassword")?;
                if new_password.is_empty() || new_password.len() > 127 {
                    return Err(bad("Use an opening password of 1 to 127 characters"));
                }
                let owner = Uuid::new_v4().simple().to_string();
                let mut key = [0u8; 32];
                rand::thread_rng().fill_bytes(&mut key);
                let filter: Arc<dyn CryptFilter> = Arc::new(Aes256CryptFilter);
                let state = EncryptionState::try_from(EncryptionVersion::V5 {
                    encrypt_metadata: true,
                    crypt_filters: std::collections::BTreeMap::from([(b"StdCF".to_vec(), filter)]),
                    file_encryption_key: &key,
                    stream_filter: b"StdCF".to_vec(),
                    string_filter: b"StdCF".to_vec(),
                    owner_password: &owner,
                    user_password: new_password,
                    permissions: Permissions::all(),
                })
                .map_err(|e| err(format!("Could not configure PDF encryption: {e}")))?;
                doc.encrypt(&state)
                    .map_err(|e| err(format!("Could not encrypt PDF: {e}")))?;
            }
            "split" => {
                let groups = if opt_str(params, "pages").unwrap_or("").trim().is_empty() {
                    (1..=count as u32).map(|n| vec![n]).collect::<Vec<_>>()
                } else {
                    opt_str(params, "pages")
                        .unwrap()
                        .split(',')
                        .map(|part| selected_pages(part, count))
                        .collect::<Result<Vec<_>, _>>()?
                };
                let mut entries = Vec::new();
                for (index, group) in groups.iter().enumerate() {
                    control.update("process", index, groups.len())?;
                    let part_path = directory.join(format!("split-part-{index}.pdf"));
                    let mut part = doc.clone();
                    set_page_order(&mut part, group)?;
                    part.save_modern(
                        &mut File::create(&part_path)
                            .map_err(|e| err(format!("Could not create split PDF: {e}")))?,
                    )
                    .map_err(|e| err(format!("Could not save split PDF: {e}")))?;
                    entries.push((format!("part-{}.pdf", index + 1), part_path));
                }
                let zip_result = write_store_zip_files(&output_path, &entries, control);
                for (_, path) in &entries {
                    let _ = fs::remove_file(path);
                }
                zip_result?;
                control.check()?;
                return output_file(output_path, name);
            }
            _ => return Err(bad("PDF operation is not supported by the Sidecar")),
        }
        control.update("write", 0, 0)?;
        doc.save_modern(
            &mut File::create(&output_path)
                .map_err(|e| err(format!("Could not create PDF output: {e}")))?,
        )
        .map_err(|e| err(format!("Could not save PDF: {e}")))?;
    }
    control.check()?;
    output_file(output_path, name)
}

fn output_file(path: PathBuf, name: String) -> Result<OutputFile, PluginError> {
    let size = fs::metadata(&path)
        .map_err(|e| err(format!("Could not inspect PDF output: {e}")))?
        .len();
    Ok(OutputFile { path, name, size })
}

fn write_store_zip_files(
    path: &Path,
    entries: &[(String, PathBuf)],
    control: &PdfControl,
) -> Result<(), PluginError> {
    let mut out =
        File::create(path).map_err(|e| err(format!("Could not create ZIP output: {e}")))?;
    let mut central = Vec::new();
    let mut offset = 0u32;
    for (entry_index, (name, source_path)) in entries.iter().enumerate() {
        control.update("write", entry_index, entries.len())?;
        let name_bytes = name.as_bytes();
        let size = u32::try_from(
            fs::metadata(source_path)
                .map_err(|e| err(format!("Could not inspect split PDF: {e}")))?
                .len(),
        )
        .map_err(|_| bad("Split output is too large"))?;
        let mut source =
            File::open(source_path).map_err(|e| err(format!("Could not open split PDF: {e}")))?;
        let mut hasher = crc32fast::Hasher::new();
        let mut buffer = vec![0u8; 1024 * 1024];
        loop {
            control.check()?;
            let read = source
                .read(&mut buffer)
                .map_err(|e| err(format!("Could not read split PDF: {e}")))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        let crc = hasher.finalize();
        let name_len =
            u16::try_from(name_bytes.len()).map_err(|_| bad("Split file name is too long"))?;
        let mut local = Vec::new();
        local.extend_from_slice(&0x04034b50u32.to_le_bytes());
        local.extend_from_slice(&20u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(&crc.to_le_bytes());
        local.extend_from_slice(&size.to_le_bytes());
        local.extend_from_slice(&size.to_le_bytes());
        local.extend_from_slice(&name_len.to_le_bytes());
        local.extend_from_slice(&0u16.to_le_bytes());
        local.extend_from_slice(name_bytes);
        out.write_all(&local)
            .map_err(|e| err(format!("Could not write ZIP output: {e}")))?;
        let mut source =
            File::open(source_path).map_err(|e| err(format!("Could not open split PDF: {e}")))?;
        std::io::copy(&mut source, &mut out)
            .map_err(|e| err(format!("Could not write ZIP output: {e}")))?;
        central.push((name_bytes.to_vec(), crc, size, offset));
        offset = offset
            .checked_add(local.len() as u32)
            .and_then(|v| v.checked_add(size))
            .ok_or_else(|| bad("Split output is too large"))?;
    }
    let central_offset = offset;
    let mut central_size = 0u32;
    for (name, crc, size, local_offset) in &central {
        let mut record = Vec::new();
        record.extend_from_slice(&0x02014b50u32.to_le_bytes());
        record.extend_from_slice(&20u16.to_le_bytes());
        record.extend_from_slice(&20u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&crc.to_le_bytes());
        record.extend_from_slice(&size.to_le_bytes());
        record.extend_from_slice(&size.to_le_bytes());
        record.extend_from_slice(&(name.len() as u16).to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u16.to_le_bytes());
        record.extend_from_slice(&0u32.to_le_bytes());
        record.extend_from_slice(&local_offset.to_le_bytes());
        record.extend_from_slice(name);
        out.write_all(&record)
            .map_err(|e| err(format!("Could not write ZIP directory: {e}")))?;
        central_size += record.len() as u32;
    }
    let count = u16::try_from(central.len()).map_err(|_| bad("Too many split outputs"))?;
    let mut end = Vec::new();
    end.extend_from_slice(&0x06054b50u32.to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    end.extend_from_slice(&count.to_le_bytes());
    end.extend_from_slice(&count.to_le_bytes());
    end.extend_from_slice(&central_size.to_le_bytes());
    end.extend_from_slice(&central_offset.to_le_bytes());
    end.extend_from_slice(&0u16.to_le_bytes());
    out.write_all(&end)
        .map_err(|e| err(format!("Could not finalize ZIP output: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use lopdf::dictionary;

    fn sample_pdf(count: usize) -> Vec<u8> {
        let mut doc = Document::with_version("1.5");
        let root = doc.new_object_id();
        let mut kids = Vec::new();
        for _ in 0..count {
            let content = doc.add_object(lopdf::Stream::new(lopdf::dictionary! {}, Vec::new()));
            let page = doc.add_object(lopdf::dictionary! {
                "Type" => "Page", "Parent" => root,
                "MediaBox" => vec![0.into(), 0.into(), 300.into(), 400.into()],
                "Resources" => lopdf::dictionary! {}, "Contents" => content,
            });
            kids.push(Object::Reference(page));
        }
        doc.objects.insert(
            root,
            lopdf::dictionary! {"Type" => "Pages", "Kids" => kids, "Count" => count as i64}.into(),
        );
        let catalog = doc.add_object(lopdf::dictionary! {"Type" => "Catalog", "Pages" => root});
        doc.trailer.set("Root", catalog);
        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).unwrap();
        bytes
    }

    fn upload(service: &PdfService, files: &[Vec<u8>]) -> (String, PathBuf) {
        let begin = service.begin(json!({"files": files.iter().map(|bytes| json!({"size": bytes.len(), "chunkCount": bytes.len().div_ceil(CHUNK_BYTES)})).collect::<Vec<_>>()})).unwrap();
        let id = begin["sessionId"].as_str().unwrap().to_string();
        for (file_index, bytes) in files.iter().enumerate() {
            for (index, chunk) in bytes.chunks(CHUNK_BYTES).enumerate() {
                service
                    .handle_binary(
                        &format!("{CHANNEL_PREFIX}{id}/{file_index}/{index}"),
                        chunk.to_vec(),
                    )
                    .unwrap();
            }
        }
        let directory = service.sessions.lock().unwrap()[&id].directory.clone();
        (id, directory)
    }

    #[test]
    fn native_pdf_operations_cross_upload_inspect_process_and_cleanup() {
        for operation in [
            "merge", "split", "rotate", "delete", "extract", "crop", "compress", "encrypt",
            "decrypt",
        ] {
            let service = PdfService::default();
            let files = if operation == "merge" {
                vec![sample_pdf(3), sample_pdf(3)]
            } else {
                vec![sample_pdf(3)]
            };
            let (id, directory) = upload(&service, &files);
            let inspected = service.inspect(json!({"sessionId": id})).unwrap();
            assert_eq!(inspected["count"], if operation == "merge" { 6 } else { 3 });
            let result = service.process(json!({"sessionId": id, "operation": operation, "pages": "1-2", "angle": 90, "left": 5, "right": 5, "top": 5, "bottom": 5, "newPassword": "test-secret"})).unwrap();
            assert!(result["size"].as_u64().unwrap() > 0);
            assert_eq!(
                service.status(json!({"sessionId": id})).unwrap()["result"],
                result
            );
            if operation != "split" {
                let path = directory.join("result.pdf");
                let doc = load_document(
                    &path,
                    if operation == "encrypt" {
                        "test-secret"
                    } else {
                        ""
                    },
                )
                .unwrap();
                assert_eq!(
                    doc.get_pages().len(),
                    match operation {
                        "merge" => 6,
                        "delete" => 1,
                        "extract" => 2,
                        _ => 3,
                    }
                );
                if operation == "encrypt" {
                    assert!(load_document(&path, "wrong-password").is_err());
                    let (encrypted_id, encrypted_directory) =
                        upload(&service, &[fs::read(path).unwrap()]);
                    service.process(json!({"sessionId": encrypted_id, "operation": "decrypt", "password": "test-secret"})).unwrap();
                    assert_eq!(
                        load_document(&encrypted_directory.join("result.pdf"), "")
                            .unwrap()
                            .get_pages()
                            .len(),
                        3
                    );
                    service.cancel(json!({"sessionId": encrypted_id})).unwrap();
                }
            } else {
                assert!(fs::read(directory.join("split-pdfs.zip"))
                    .unwrap()
                    .starts_with(b"PK"));
            }
            service.cancel(json!({"sessionId": id})).unwrap();
            assert!(!directory.exists());
        }
    }

    #[test]
    fn cancellation_waits_for_work_to_stop_before_removing_files() {
        let service = PdfService::default();
        let (id, directory) = upload(&service, &[sample_pdf(1)]);
        let work = service.start_work(&id).unwrap();
        assert!(service.start_work(&id).is_err());
        assert!(service
            .handle_binary(&format!("{CHANNEL_PREFIX}{id}/0/0"), vec![1])
            .is_err());
        let response = service.cancel(json!({"sessionId": id})).unwrap();
        assert_eq!(response["cancelling"], true);
        assert!(directory.exists());
        assert_eq!(work.control.check().unwrap_err().code, -32800);
        assert_eq!(
            service
                .finish_work(&id, Ok(json!({})), None)
                .unwrap_err()
                .code,
            -32800
        );
        assert!(!directory.exists());
        assert!(service.status(json!({"sessionId": id})).is_err());
    }

    #[test]
    fn failed_inspection_releases_processing_state_for_retry_and_cleanup() {
        let service = PdfService::default();
        let (id, directory) = upload(&service, &[b"invalid-pdf".to_vec()]);
        assert!(service.inspect(json!({"sessionId": id})).is_err());
        let status = service.status(json!({"sessionId": id})).unwrap();
        assert_eq!(status["processing"], false);
        assert!(status["error"].is_object());
        service.cancel(json!({"sessionId": id})).unwrap();
        assert!(!directory.exists());
    }

    #[test]
    fn parses_ranges_and_deduplicates_pages() {
        assert_eq!(selected_pages("3,1-2,3", 3).unwrap(), vec![1, 2, 3]);
        assert!(selected_pages("0", 3).is_err());
        assert!(selected_pages("4", 3).is_err());
        assert!(selected_pages("3-2", 3).is_err());
    }

    #[test]
    fn store_zip_has_local_and_end_records() {
        let dir =
            std::env::temp_dir().join(format!("toolbox-pdf-zip-test-{}", Uuid::new_v4().simple()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("parts.zip");
        let part = dir.join("part-1.pdf");
        fs::write(&part, b"%PDF-test").unwrap();
        write_store_zip_files(
            &path,
            &[("part-1.pdf".into(), part)],
            &PdfControl::default(),
        )
        .unwrap();
        let bytes = fs::read(&path).unwrap();
        assert_eq!(&bytes[..4], &0x04034b50u32.to_le_bytes());
        assert!(bytes
            .windows(4)
            .any(|value| value == 0x06054b50u32.to_le_bytes()));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn binary_chunks_can_arrive_out_of_order() {
        let service = PdfService::default();
        let started = service
            .begin(json!({
                "files": [{ "name": "input.pdf", "size": CHUNK_BYTES + 3, "chunkCount": 2 }]
            }))
            .unwrap();
        let id = started["sessionId"].as_str().unwrap();
        service
            .handle_binary(&format!("{CHANNEL_PREFIX}{id}/0/1"), vec![7, 8, 9])
            .unwrap();
        service
            .handle_binary(&format!("{CHANNEL_PREFIX}{id}/0/0"), vec![1; CHUNK_BYTES])
            .unwrap();
        let path = service.sessions.lock().unwrap()[id].files[0].path.clone();
        let bytes = fs::read(path).unwrap();
        assert_eq!(bytes.len(), CHUNK_BYTES + 3);
        assert_eq!(&bytes[..2], &[1, 1]);
        assert_eq!(&bytes[CHUNK_BYTES..], &[7, 8, 9]);
    }
}
