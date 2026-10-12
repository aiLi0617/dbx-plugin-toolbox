use std::collections::{BTreeMap, HashMap};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use dbx_plugin_sdk::{PluginEmitter, PluginError};
use image::GenericImageView;
use ocrs_cjk::{ImageSource, OcrEngine, OcrEngineParams, OcrInput, TextDetectorParams, TextItem};
use rten_imageproc::RotatedRect;
use serde::Deserialize;
use serde_json::{json, Value};

const CHANNEL_PREFIX: &str = "toolbox/ocr/";
const MAX_IMAGE_BYTES: usize = 20_000_000;
const MAX_CHUNK_BYTES: usize = 8 * 1024 * 1024;
const OCR_UPLOAD_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const MAX_IMAGE_SIDE: u32 = 16_384;
const MAX_IMAGE_PIXELS: u64 = 60_000_000;
const SESSION_TTL: Duration = Duration::from_secs(10 * 60);
const DETECTION_MODEL: &[u8] = include_bytes!("../models/detection-ppocrv5.rten");
const RECOGNITION_FAST_MODEL: &[u8] = include_bytes!("../models/recognition-mobile-opset13.rten");
const RECOGNITION_ACCURATE_MODEL: &[u8] =
    include_bytes!("../models/recognition-server-opset13.rten");

#[derive(Default)]
pub struct OcrService {
    uploads: Mutex<HashMap<String, Upload>>,
    engines: Mutex<EngineCache>,
}

#[derive(Default)]
struct EngineCache {
    fast: Option<OcrEngine>,
    accurate: Option<OcrEngine>,
}

impl EngineCache {
    fn get(&mut self, quality: OcrQuality) -> Result<&OcrEngine, PluginError> {
        let slot = match quality {
            OcrQuality::Fast => &mut self.fast,
            OcrQuality::Accurate => &mut self.accurate,
            OcrQuality::Auto => &mut self.fast,
        };
        if slot.is_none() {
            *slot = Some(load_engine(quality)?);
        }
        Ok(slot.as_ref().expect("OCR engine was initialized"))
    }
}

struct Upload {
    expected_bytes: usize,
    expected_chunks: u32,
    chunks: BTreeMap<u32, Vec<u8>>,
    cancelled: Arc<AtomicBool>,
    processing: bool,
    created_at: Instant,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BeginRequest {
    byte_length: usize,
    chunk_count: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionRequest {
    session_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecognizeRequest {
    session_id: String,
    region: Option<Region>,
    #[serde(default)]
    quality: OcrQuality,
    #[serde(default)]
    enhance: bool,
    #[serde(default = "default_true")]
    layout: bool,
    #[serde(default = "default_true")]
    smart_correction: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "lowercase")]
enum OcrQuality {
    Fast,
    Accurate,
    #[default]
    Auto,
}

impl OcrQuality {
    fn max_side(self) -> u32 {
        match self {
            Self::Fast => 2_048,
            Self::Accurate => 3_072,
            Self::Auto => 2_560,
        }
    }
}

#[derive(Clone, Copy, Deserialize)]
struct Region {
    left: u32,
    top: u32,
    width: u32,
    height: u32,
}

impl OcrService {
    pub fn handle(
        &self,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        match method {
            "toolbox/ocr/begin" => self.begin(params),
            "toolbox/ocr/status" => self.status(params),
            "toolbox/ocr/recognize" => self.recognize(params, emitter),
            "toolbox/ocr/cancel" => self.cancel(params),
            _ => Err(PluginError::method_not_found(method)),
        }
    }

    pub fn handle_binary(&self, channel: &str, data: Vec<u8>) -> Result<(), PluginError> {
        let suffix = channel
            .strip_prefix(CHANNEL_PREFIX)
            .ok_or_else(|| bad("Unknown OCR binary channel"))?;
        let (session_id, chunk_index) = suffix
            .rsplit_once('/')
            .ok_or_else(|| bad("OCR binary channel must contain a chunk index"))?;
        let chunk_index = chunk_index
            .parse::<u32>()
            .map_err(|_| bad("OCR chunk index is invalid"))?;
        if data.is_empty() || data.len() > MAX_CHUNK_BYTES {
            return Err(bad("OCR chunk has an invalid size"));
        }

        let mut uploads = self
            .uploads
            .lock()
            .map_err(|_| internal("OCR upload lock is poisoned"))?;
        let upload = uploads
            .get_mut(session_id)
            .ok_or_else(|| bad("OCR upload session was not found"))?;
        if upload.processing || upload.cancelled.load(Ordering::Relaxed) {
            return Err(bad("OCR upload session is no longer accepting data"));
        }
        if chunk_index >= upload.expected_chunks {
            return Err(bad("OCR chunk index is outside the declared range"));
        }
        let existing = upload.chunks.get(&chunk_index).map_or(0, Vec::len);
        let received = upload.chunks.values().map(Vec::len).sum::<usize>() - existing + data.len();
        if received > upload.expected_bytes {
            return Err(bad("OCR upload exceeds its declared size"));
        }
        upload.chunks.insert(chunk_index, data);
        Ok(())
    }

    fn begin(&self, params: Value) -> Result<Value, PluginError> {
        let request: BeginRequest = parse(params)?;
        if request.byte_length == 0 || request.byte_length > MAX_IMAGE_BYTES {
            return Err(bad("OCR image must be between 1 byte and 20 MB"));
        }
        let maximum_chunks = MAX_IMAGE_BYTES.div_ceil(OCR_UPLOAD_CHUNK_BYTES) as u32;
        if request.chunk_count == 0 || request.chunk_count > maximum_chunks {
            return Err(bad("OCR chunk count is invalid"));
        }

        let mut uploads = self
            .uploads
            .lock()
            .map_err(|_| internal("OCR upload lock is poisoned"))?;
        uploads.retain(|_, upload| {
            upload.created_at.elapsed() < SESSION_TTL && !upload.cancelled.load(Ordering::Relaxed)
        });
        if uploads.len() >= 4 {
            return Err(PluginError::new(-32020, "Too many OCR uploads are active"));
        }
        let session_id = uuid::Uuid::new_v4().simple().to_string();
        uploads.insert(
            session_id.clone(),
            Upload {
                expected_bytes: request.byte_length,
                expected_chunks: request.chunk_count,
                chunks: BTreeMap::new(),
                cancelled: Arc::new(AtomicBool::new(false)),
                processing: false,
                created_at: Instant::now(),
            },
        );
        Ok(json!({ "sessionId": session_id, "channel": format!("{CHANNEL_PREFIX}{session_id}") }))
    }

    fn status(&self, params: Value) -> Result<Value, PluginError> {
        let request: SessionRequest = parse(params)?;
        let uploads = self
            .uploads
            .lock()
            .map_err(|_| internal("OCR upload lock is poisoned"))?;
        let upload = uploads
            .get(&request.session_id)
            .ok_or_else(|| bad("OCR upload session was not found"))?;
        Ok(json!({
            "receivedChunks": upload.chunks.len(),
            "receivedBytes": upload.chunks.values().map(Vec::len).sum::<usize>(),
        }))
    }

    fn cancel(&self, params: Value) -> Result<Value, PluginError> {
        let request: SessionRequest = parse(params)?;
        let mut uploads = self
            .uploads
            .lock()
            .map_err(|_| internal("OCR upload lock is poisoned"))?;
        let remove = uploads
            .get(&request.session_id)
            .is_some_and(|upload| !upload.processing);
        if remove {
            uploads.remove(&request.session_id);
        } else if let Some(upload) = uploads.get(&request.session_id) {
            upload.cancelled.store(true, Ordering::Relaxed);
        }
        Ok(json!({ "cancelled": true }))
    }

    fn recognize(&self, params: Value, emitter: &PluginEmitter) -> Result<Value, PluginError> {
        let request: RecognizeRequest = parse(params)?;
        let (bytes, cancelled) = {
            let mut uploads = self
                .uploads
                .lock()
                .map_err(|_| internal("OCR upload lock is poisoned"))?;
            let upload = uploads
                .get_mut(&request.session_id)
                .ok_or_else(|| bad("OCR upload session was not found"))?;
            let received = upload.chunks.values().map(Vec::len).sum::<usize>();
            if upload.chunks.len() != upload.expected_chunks as usize
                || received != upload.expected_bytes
            {
                return Err(bad("OCR image upload is incomplete"));
            }
            upload.processing = true;
            let mut bytes = Vec::with_capacity(upload.expected_bytes);
            for index in 0..upload.expected_chunks {
                bytes.extend_from_slice(
                    upload
                        .chunks
                        .get(&index)
                        .ok_or_else(|| bad("OCR image upload is missing a chunk"))?,
                );
            }
            (bytes, upload.cancelled.clone())
        };

        let result = self.run_ocr(
            &request.session_id,
            bytes,
            request.region,
            request.quality,
            request.enhance,
            request.layout,
            request.smart_correction,
            &cancelled,
            emitter,
        );
        if let Ok(mut uploads) = self.uploads.lock() {
            uploads.remove(&request.session_id);
        }
        result
    }

    fn run_ocr(
        &self,
        session_id: &str,
        bytes: Vec<u8>,
        region: Option<Region>,
        quality: OcrQuality,
        enhance: bool,
        layout: bool,
        smart_correction: bool,
        cancelled: &AtomicBool,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        progress(emitter, session_id, "decode", 0.03)?;
        check_cancelled(cancelled)?;
        let mut reader = image::ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|error| bad(format!("Could not identify the OCR image: {error}")))?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(MAX_IMAGE_SIDE);
        limits.max_image_height = Some(MAX_IMAGE_SIDE);
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);
        let image = reader
            .decode()
            .map_err(|error| bad(format!("Could not decode the OCR image: {error}")))?;
        let (original_width, original_height) = image.dimensions();
        validate_dimensions(original_width, original_height)?;
        if let Some(region) = region {
            if region.width == 0
                || region.height == 0
                || region
                    .left
                    .checked_add(region.width)
                    .is_none_or(|right| right > original_width)
                || region
                    .top
                    .checked_add(region.height)
                    .is_none_or(|bottom| bottom > original_height)
            {
                return Err(bad("OCR region is outside the image"));
            }
        }
        progress(emitter, session_id, "preprocess", 0.08)?;
        check_cancelled(cancelled)?;
        let image = resize_for_ocr(image, quality.max_side());
        let (resized_width, resized_height) = image.dimensions();
        let selected_region = region.map(|region| {
            scale_region(
                region,
                original_width,
                original_height,
                resized_width,
                resized_height,
            )
        });
        let enhanced_image = enhance.then(|| enhance_document(image.clone()));
        let original_image = image.into_rgb8();

        progress(emitter, session_id, "queue", 0.12)?;
        check_cancelled(cancelled)?;
        let mut engines = self
            .engines
            .lock()
            .map_err(|_| internal("OCR engine lock is poisoned"))?;
        progress(emitter, session_id, "models", 0.18)?;
        check_cancelled(cancelled)?;
        let ocr_image = enhanced_image.as_ref().unwrap_or(&original_image);
        let pass = match quality {
            OcrQuality::Fast | OcrQuality::Accurate => {
                let engine = engines.get(quality)?;
                progress(emitter, session_id, "detect", 0.30)?;
                check_cancelled(cancelled)?;
                let (input, line_regions) =
                    detect_line_regions(engine, ocr_image, selected_region)?;
                progress(emitter, session_id, "recognize", 0.55)?;
                check_cancelled(cancelled)?;
                RecognitionPass {
                    detected_lines: line_regions.len(),
                    lines: recognize_line_regions(engine, &input, &line_regions)?
                        .into_iter()
                        .flatten()
                        .collect(),
                }
            }
            OcrQuality::Auto => {
                let fast_engine = engines.get(OcrQuality::Fast)?;
                progress(emitter, session_id, "detect", 0.30)?;
                check_cancelled(cancelled)?;
                let (fast_input, line_regions) =
                    detect_line_regions(fast_engine, ocr_image, selected_region)?;
                progress(emitter, session_id, "recognize", 0.48)?;
                check_cancelled(cancelled)?;
                let mut lines = recognize_line_regions(fast_engine, &fast_input, &line_regions)?;
                let weak_indices = lines
                    .iter()
                    .enumerate()
                    .filter_map(|(index, line)| {
                        line.as_ref()
                            .is_none_or(|line| line_needs_refinement(line))
                            .then_some(index)
                    })
                    .collect::<Vec<_>>();
                if !weak_indices.is_empty() {
                    progress(emitter, session_id, "refine", 0.72)?;
                    check_cancelled(cancelled)?;
                    let accurate_engine = engines.get(OcrQuality::Accurate)?;
                    let source =
                        ImageSource::from_bytes(ocr_image.as_raw(), ocr_image.dimensions())
                            .map_err(|error| {
                                internal(format!("Could not prepare OCR pixels: {error}"))
                            })?;
                    let accurate_input =
                        accurate_engine.prepare_input(source).map_err(|error| {
                            internal(format!("Could not prepare OCR input: {error}"))
                        })?;
                    let weak_regions = weak_indices
                        .iter()
                        .map(|&index| line_regions[index].clone())
                        .collect::<Vec<_>>();
                    let refined =
                        recognize_line_regions(accurate_engine, &accurate_input, &weak_regions)?;
                    for (&index, candidate) in weak_indices.iter().zip(refined) {
                        match (&lines[index], &candidate) {
                            // A low-confidence fast-only character is usually a detector artifact.
                            (Some(current), None) if current.confidence < 0.50 => {
                                lines[index] = None
                            }
                            (_, Some(candidate))
                                if lines[index].as_ref().is_none_or(|current| {
                                    line_reliability(candidate) > line_reliability(current)
                                        || date_shape_score(&candidate.text)
                                            > date_shape_score(&current.text)
                                        || (is_complete_date(&current.text)
                                            && is_complete_date(&candidate.text)
                                            && candidate.confidence >= 0.80)
                                }) =>
                            {
                                lines[index] = Some(candidate.clone())
                            }
                            _ => {}
                        }
                    }
                }
                RecognitionPass {
                    detected_lines: line_regions.len(),
                    lines: lines.into_iter().flatten().collect(),
                }
            }
        };
        check_cancelled(cancelled)?;

        let detected_lines = pass.detected_lines;
        let recognized = pass.lines;
        let confidence_count = recognized.len();
        let (confidence, minimum_confidence) = confidence_metrics(&recognized, detected_lines);
        let result_lines = recognized
            .iter()
            .map(|line| {
                json!({
                    "text": line.text,
                    "confidence": line.confidence * 100.0,
                    "bounds": {
                        "left": line.bounds.left * original_width as f32 / resized_width as f32,
                        "top": line.bounds.top * original_height as f32 / resized_height as f32,
                        "width": (line.bounds.right - line.bounds.left) * original_width as f32 / resized_width as f32,
                        "height": (line.bounds.bottom - line.bounds.top) * original_height as f32 / resized_height as f32,
                    }
                })
            })
            .collect::<Vec<_>>();
        let text = finalize_recognized_text(recognized, layout, smart_correction);
        progress(emitter, session_id, "complete", 1.0)?;
        Ok(json!({
            "text": text,
            "confidence": confidence * 100.0,
            "minimumConfidence": minimum_confidence * 100.0,
            "recognizedLines": confidence_count,
            "detectedLines": detected_lines,
            "quality": match quality { OcrQuality::Fast => "fast", OcrQuality::Accurate => "accurate", OcrQuality::Auto => "auto" },
            "lines": result_lines,
        }))
    }
}

fn load_engine(quality: OcrQuality) -> Result<OcrEngine, PluginError> {
    let mut model_options = rten::ModelOptions::with_all_ops();
    model_options
        .prepack_weights(true)
        .enable_shape_inference(true);
    let detection = model_options
        .load_static_slice(DETECTION_MODEL)
        .map_err(|error| asset_error(format!("Could not load OCR detection model: {error}")))?;
    let recognition_bytes = match quality {
        OcrQuality::Fast => RECOGNITION_FAST_MODEL,
        OcrQuality::Accurate => RECOGNITION_ACCURATE_MODEL,
        OcrQuality::Auto => RECOGNITION_FAST_MODEL,
    };
    let recognition = model_options
        .load_static_slice(recognition_bytes)
        .map_err(|error| asset_error(format!("Could not load OCR recognition model: {error}")))?;
    OcrEngine::new(OcrEngineParams {
        detection_model: Some(detection),
        recognition_model: Some(recognition),
        detection_params: TextDetectorParams {
            min_area: 50.0,
            text_threshold: 0.20,
        },
        alphabet: Some(crate::ocr_alphabet::OCR_ALPHABET.to_string()),
        ..Default::default()
    })
    .map_err(|error| asset_error(format!("Could not initialize OCR engine: {error}")))
}

#[derive(Clone, Copy)]
struct LineBounds {
    left: f32,
    top: f32,
    right: f32,
    bottom: f32,
}

impl LineBounds {
    fn height(self) -> f32 {
        self.bottom - self.top
    }
}

#[derive(Clone)]
struct RecognizedLine {
    text: String,
    confidence: f32,
    minimum_confidence: f32,
    character_count: usize,
    bounds: LineBounds,
}

struct RecognitionPass {
    lines: Vec<RecognizedLine>,
    detected_lines: usize,
}

struct VisualRow {
    top: f32,
    bottom: f32,
    lines: Vec<RecognizedLine>,
}

fn detect_line_regions(
    engine: &OcrEngine,
    image: &image::RgbImage,
    selected_region: Option<LineBounds>,
) -> Result<(OcrInput, Vec<Vec<RotatedRect>>), PluginError> {
    let source = ImageSource::from_bytes(image.as_raw(), image.dimensions())
        .map_err(|error| internal(format!("Could not prepare OCR pixels: {error}")))?;
    let input = engine
        .prepare_input(source)
        .map_err(|error| internal(format!("Could not prepare OCR input: {error}")))?;
    let mut words = engine
        .detect_words(&input)
        .map_err(|error| internal(format!("OCR text detection failed: {error}")))?;
    if let Some(selected_region) = selected_region {
        words.retain(|word| {
            line_bounds(std::slice::from_ref(word))
                .is_some_and(|bounds| bounds_overlap_ratio(bounds, selected_region) >= 0.20)
        });
    }
    let line_regions = engine.find_text_lines(&input, &words);
    Ok((input, line_regions))
}

fn recognize_line_regions(
    engine: &OcrEngine,
    input: &OcrInput,
    line_regions: &[Vec<RotatedRect>],
) -> Result<Vec<Option<RecognizedLine>>, PluginError> {
    let lines = engine
        .recognize_text(&input, &line_regions)
        .map_err(|error| internal(format!("OCR text recognition failed: {error}")))?;
    let mut recognized = Vec::with_capacity(line_regions.len());
    for (line, region) in lines.into_iter().zip(line_regions) {
        let Some(line) = line else {
            recognized.push(None);
            continue;
        };
        let Some(bounds) = line_bounds(region) else {
            recognized.push(None);
            continue;
        };
        let value = line.to_string();
        if value.trim().is_empty() || (line.chars().len() == 1 && line.confidence() < 0.60) {
            recognized.push(None);
            continue;
        }
        recognized.push(Some(RecognizedLine {
            text: value,
            confidence: line.confidence(),
            minimum_confidence: line
                .chars()
                .iter()
                .map(|character| character.confidence)
                .reduce(f32::min)
                .unwrap_or(0.0),
            character_count: line.chars().len(),
            bounds,
        }));
    }
    Ok(recognized)
}

fn scale_region(
    region: Region,
    original_width: u32,
    original_height: u32,
    resized_width: u32,
    resized_height: u32,
) -> LineBounds {
    let scale_x = resized_width as f32 / original_width as f32;
    let scale_y = resized_height as f32 / original_height as f32;
    LineBounds {
        left: region.left as f32 * scale_x,
        top: region.top as f32 * scale_y,
        right: region.left.saturating_add(region.width) as f32 * scale_x,
        bottom: region.top.saturating_add(region.height) as f32 * scale_y,
    }
}

fn bounds_overlap_ratio(bounds: LineBounds, region: LineBounds) -> f32 {
    let overlap_width = bounds.right.min(region.right) - bounds.left.max(region.left);
    let overlap_height = bounds.bottom.min(region.bottom) - bounds.top.max(region.top);
    if overlap_width <= 0.0 || overlap_height <= 0.0 {
        return 0.0;
    }
    let area = (bounds.right - bounds.left).max(0.0) * bounds.height().max(0.0);
    if area <= 0.0 {
        0.0
    } else {
        (overlap_width * overlap_height / area).clamp(0.0, 1.0)
    }
}

fn line_reliability(line: &RecognizedLine) -> f32 {
    line.confidence * 0.7 + line.minimum_confidence * 0.3
}

fn line_needs_refinement(line: &RecognizedLine) -> bool {
    line.confidence < 0.86
        || line.minimum_confidence < 0.45
        || line.text.contains('?')
        || (line.text.contains('月') && line.text.contains('日'))
}

fn date_shape_score(text: &str) -> u8 {
    u8::from(text.contains('年')) + u8::from(text.contains('月')) + u8::from(text.contains('日'))
}

fn is_complete_date(text: &str) -> bool {
    text.contains('年') && text.contains('月') && text.contains('日')
}

fn confidence_metrics(lines: &[RecognizedLine], detected_lines: usize) -> (f32, f32) {
    let character_count = lines.iter().map(|line| line.character_count).sum::<usize>();
    if character_count == 0 {
        return (0.0, 0.0);
    }
    let mean = lines
        .iter()
        .map(|line| line.confidence * line.character_count as f32)
        .sum::<f32>()
        / character_count as f32;
    let minimum = lines
        .iter()
        .map(|line| line.minimum_confidence)
        .reduce(f32::min)
        .unwrap_or(0.0);
    let coverage = (lines.len() as f32 / detected_lines.max(1) as f32).clamp(0.0, 1.0);
    // CTC probabilities are often over-confident. Blend in the weakest character
    // and detection coverage, and reserve 100% because this is not an accuracy rate.
    let reliability = ((mean * 0.65 + minimum * 0.35) * coverage).clamp(0.0, 0.995);
    (reliability, minimum)
}

fn line_bounds(region: &[RotatedRect]) -> Option<LineBounds> {
    let mut points = region.iter().flat_map(RotatedRect::corners);
    let first = points.next()?;
    let mut bounds = LineBounds {
        left: first.x,
        top: first.y,
        right: first.x,
        bottom: first.y,
    };
    for point in points {
        bounds.left = bounds.left.min(point.x);
        bounds.top = bounds.top.min(point.y);
        bounds.right = bounds.right.max(point.x);
        bounds.bottom = bounds.bottom.max(point.y);
    }
    Some(bounds)
}

fn format_recognized_lines(mut lines: Vec<RecognizedLine>, visual_layout: bool) -> String {
    if !visual_layout {
        return lines
            .into_iter()
            .map(|line| line.text)
            .collect::<Vec<_>>()
            .join("\n");
    }

    lines.sort_by(|a, b| {
        a.bounds
            .top
            .total_cmp(&b.bounds.top)
            .then_with(|| a.bounds.left.total_cmp(&b.bounds.left))
    });
    let mut rows: Vec<VisualRow> = Vec::new();
    for line in lines {
        let same_row = rows.last().is_some_and(|row| {
            let overlap = row.bottom.min(line.bounds.bottom) - row.top.max(line.bounds.top);
            overlap > 0.0 && overlap >= row_height(row).min(line.bounds.height()) * 0.35
        });
        if same_row {
            let row = rows.last_mut().expect("visual row exists");
            row.top = row.top.min(line.bounds.top);
            row.bottom = row.bottom.max(line.bounds.bottom);
            row.lines.push(line);
        } else {
            rows.push(VisualRow {
                top: line.bounds.top,
                bottom: line.bounds.bottom,
                lines: vec![line],
            });
        }
    }

    rows.into_iter()
        .map(|mut row| {
            row.lines
                .sort_by(|a, b| a.bounds.left.total_cmp(&b.bounds.left));
            row.lines
                .into_iter()
                .map(|line| line.text)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn finalize_recognized_text(
    lines: Vec<RecognizedLine>,
    visual_layout: bool,
    smart_correction: bool,
) -> String {
    let requested_layout = format_recognized_lines(lines.clone(), visual_layout);
    if !smart_correction {
        return requested_layout;
    }

    correct_recognized_text(&requested_layout)
}

fn correct_recognized_text(text: &str) -> String {
    let mut chars = text.chars().collect::<Vec<_>>();
    if chars.len() < 18 {
        return text.to_string();
    }
    for start in 0..=chars.len() - 18 {
        let mut candidate = String::with_capacity(18);
        let mut changed = false;
        let mut valid_shape = true;
        for (index, character) in chars[start..start + 18].iter().copied().enumerate() {
            let corrected = match character {
                'O' | 'o' if index < 17 => '0',
                'I' | 'l' if index < 17 => '1',
                'x' if index == 17 => 'X',
                value => value,
            };
            if !(corrected.is_ascii_digit() || (index == 17 && corrected == 'X')) {
                valid_shape = false;
                break;
            }
            changed |= corrected != character;
            candidate.push(corrected);
        }
        if valid_shape && changed && valid_identity_number(&candidate) {
            for (offset, corrected) in candidate.chars().enumerate() {
                chars[start + offset] = corrected;
            }
        }
    }
    chars.into_iter().collect()
}

fn valid_identity_number(id: &str) -> bool {
    if id.len() != 18 {
        return false;
    }
    let weights = [7u32, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
    let checks = b"10X98765432";
    let bytes = id.as_bytes();
    let mut sum = 0u32;
    for (byte, weight) in bytes[..17].iter().zip(weights) {
        if !byte.is_ascii_digit() {
            return false;
        }
        sum += u32::from(byte - b'0') * weight;
    }
    bytes[17].to_ascii_uppercase() == checks[(sum % 11) as usize]
}

fn row_height(row: &VisualRow) -> f32 {
    row.bottom - row.top
}

fn validate_dimensions(width: u32, height: u32) -> Result<(), PluginError> {
    if width == 0
        || height == 0
        || width > MAX_IMAGE_SIDE
        || height > MAX_IMAGE_SIDE
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(bad("OCR image dimensions exceed the safe limit"));
    }
    Ok(())
}

fn resize_for_ocr(image: image::DynamicImage, max_side: u32) -> image::DynamicImage {
    let (width, height) = image.dimensions();
    let longest = width.max(height);
    if longest <= max_side {
        return image;
    }
    let scale = max_side as f64 / longest as f64;
    let target_width = (width as f64 * scale).round().max(1.0) as u32;
    let target_height = (height as f64 * scale).round().max(1.0) as u32;
    image.resize_exact(
        target_width,
        target_height,
        image::imageops::FilterType::Triangle,
    )
}

fn enhance_document(image: image::DynamicImage) -> image::RgbImage {
    // Preserve color cues used by PaddleOCR's detector. The previous grayscale
    // percentile stretch amplified security-pattern backgrounds into false text.
    image.adjust_contrast(12.0).unsharpen(0.8, 1).into_rgb8()
}

fn default_true() -> bool {
    true
}

fn progress(
    emitter: &PluginEmitter,
    session_id: &str,
    stage: &str,
    value: f32,
) -> Result<(), PluginError> {
    emitter.event(
        "toolbox/ocr/progress",
        json!({ "sessionId": session_id, "stage": stage, "progress": value }),
    )
}

fn check_cancelled(cancelled: &AtomicBool) -> Result<(), PluginError> {
    if cancelled.load(Ordering::Relaxed) {
        Err(PluginError::new(-32800, "OCR recognition was cancelled"))
    } else {
        Ok(())
    }
}

fn parse<T: for<'de> Deserialize<'de>>(params: Value) -> Result<T, PluginError> {
    serde_json::from_value(params).map_err(|error| bad(format!("Invalid OCR parameters: {error}")))
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
    use super::{
        bounds_overlap_ratio, confidence_metrics, enhance_document, finalize_recognized_text,
        format_recognized_lines, load_engine, resize_for_ocr, scale_region, validate_dimensions,
        LineBounds, OcrQuality, OcrService, RecognizedLine, Region, MAX_IMAGE_BYTES,
        MAX_IMAGE_PIXELS, OCR_UPLOAD_CHUNK_BYTES, RECOGNITION_ACCURATE_MODEL,
        RECOGNITION_FAST_MODEL,
    };
    use image::GenericImageView;
    use rten_imageproc::{PointF, RotatedRect, Vec2};
    use serde_json::json;

    #[test]
    fn accepts_maximum_sized_frontend_upload_shape() {
        let chunks = MAX_IMAGE_BYTES.div_ceil(OCR_UPLOAD_CHUNK_BYTES) as u32;
        let service = OcrService::default();
        assert!(service
            .begin(json!({ "byteLength": MAX_IMAGE_BYTES, "chunkCount": chunks }))
            .is_ok());
        assert!(service
            .begin(json!({ "byteLength": MAX_IMAGE_BYTES, "chunkCount": chunks + 1 }))
            .is_err());
    }

    #[test]
    fn rejects_oversized_images() {
        assert!(validate_dimensions(16_385, 1).is_err());
        assert!(validate_dimensions(MAX_IMAGE_PIXELS as u32, 2).is_err());
        assert!(validate_dimensions(1_000, 1_000).is_ok());
    }

    #[test]
    fn bounds_inference_resolution_without_distorting_aspect_ratio() {
        let image = image::DynamicImage::new_rgb8(4_096, 2_048);
        let resized = resize_for_ocr(image, 2_048);
        assert_eq!(resized.dimensions(), (2_048, 1_024));
        let unchanged = resize_for_ocr(image::DynamicImage::new_rgb8(800, 600), 2_048);
        assert_eq!(unchanged.dimensions(), (800, 600));
    }

    #[test]
    fn packaged_models_initialize_the_native_engine() {
        assert_eq!(&RECOGNITION_FAST_MODEL[..4], b"RTEN");
        assert_eq!(&RECOGNITION_ACCURATE_MODEL[..4], b"RTEN");
        for quality in [OcrQuality::Fast, OcrQuality::Accurate] {
            let engine = load_engine(quality).expect("packaged OCR models should load");
            assert!(engine.alphabet().len() > 10_000);
            let pixels = vec![255u8; 128 * 128 * 3];
            let source = ocrs_cjk::ImageSource::from_bytes(&pixels, (128, 128)).unwrap();
            let input = engine.prepare_input(source).unwrap();
            assert_eq!(engine.get_text(&input).unwrap(), "");

            // Force a recognition-model run even though the blank image has
            // no detected words. This catches converted models that load but
            // have missing dynamic inputs at inference time.
            let line = vec![RotatedRect::new(
                PointF::from_yx(64.0, 64.0),
                Vec2::from_yx(1.0, 0.0),
                96.0,
                48.0,
            )];
            engine
                .recognize_text(&input, &[line])
                .expect("packaged recognition model should execute");
        }
    }

    #[test]
    fn document_enhancement_preserves_color_and_increases_local_contrast() {
        let mut image = image::RgbImage::from_pixel(20, 10, image::Rgb([210, 220, 230]));
        for y in 2..8 {
            for x in 4..16 {
                image.put_pixel(x, y, image::Rgb([140, 150, 160]));
            }
        }
        let enhanced = enhance_document(image::DynamicImage::ImageRgb8(image));
        let background = enhanced.get_pixel(0, 0);
        let foreground = enhanced.get_pixel(10, 5);

        assert_ne!(background[0], background[1]);
        assert_ne!(foreground[0], foreground[1]);
        assert!(background[0].saturating_sub(foreground[0]) > 70);
    }

    #[test]
    fn visual_layout_merges_fragments_on_the_same_row() {
        let line = |text: &str, left, top, right, bottom| RecognizedLine {
            text: text.to_string(),
            confidence: 0.9,
            minimum_confidence: 0.8,
            character_count: text.chars().count(),
            bounds: LineBounds {
                left,
                top,
                right,
                bottom,
            },
        };
        let text = format_recognized_lines(
            vec![
                line("姓名", 10.0, 10.0, 40.0, 24.0),
                line("张秋祥", 70.0, 11.0, 130.0, 25.0),
                line("出生", 10.0, 40.0, 40.0, 54.0),
                line("1978年05月20日", 70.0, 40.0, 180.0, 55.0),
            ],
            true,
        );
        assert_eq!(text, "姓名 张秋祥\n出生 1978年05月20日");
    }

    #[test]
    fn region_filter_uses_full_image_coordinates_without_recropping() {
        let selected = scale_region(
            Region {
                left: 500,
                top: 250,
                width: 500,
                height: 250,
            },
            2_000,
            1_000,
            1_000,
            500,
        );
        assert_eq!(
            bounds_overlap_ratio(
                LineBounds {
                    left: 10.0,
                    top: 10.0,
                    right: 100.0,
                    bottom: 30.0,
                },
                selected,
            ),
            0.0
        );
        assert!(
            bounds_overlap_ratio(
                LineBounds {
                    left: 230.0,
                    top: 150.0,
                    right: 280.0,
                    bottom: 180.0,
                },
                selected,
            ) >= 0.20
        );
    }

    #[test]
    fn confidence_is_conservative_and_accounts_for_weak_characters() {
        let lines = vec![RecognizedLine {
            text: "test".to_string(),
            confidence: 0.99,
            minimum_confidence: 0.40,
            character_count: 4,
            bounds: LineBounds {
                left: 0.0,
                top: 0.0,
                right: 10.0,
                bottom: 10.0,
            },
        }];
        let (reliability, minimum) = confidence_metrics(&lines, 2);
        assert!(reliability < 0.6);
        assert_eq!(minimum, 0.40);

        let perfect = vec![RecognizedLine {
            confidence: 1.0,
            minimum_confidence: 1.0,
            ..lines[0].clone()
        }];
        assert_eq!(confidence_metrics(&perfect, 1).0, 0.995);
    }

    #[test]
    fn smart_correction_only_changes_checksum_valid_characters() {
        assert_eq!(
            super::correct_recognized_text("4521271978O5203052"),
            "452127197805203052"
        );
        assert_eq!(
            super::correct_recognized_text("4521271978O5203053"),
            "4521271978O5203053"
        );
        assert_eq!(
            super::correct_recognized_text("11010519491231002x"),
            "11010519491231002X"
        );
    }

    #[test]
    fn smart_correction_never_generates_unrecognized_fields() {
        let lines = vec![RecognizedLine {
            text: "4521271978O5203052".to_string(),
            confidence: 0.9,
            minimum_confidence: 0.8,
            character_count: 18,
            bounds: LineBounds {
                left: 10.0,
                top: 10.0,
                right: 200.0,
                bottom: 22.0,
            },
        }];

        let corrected = finalize_recognized_text(lines, false, true);
        assert_eq!(corrected, "452127197805203052");
        assert!(!corrected.chars().any(|character| character.is_alphabetic()));
        assert!(!corrected.contains("姓名"));
        assert!(!corrected.contains("公民身份号码"));
    }
}
