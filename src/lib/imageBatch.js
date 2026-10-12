export const IMAGE_BATCH_LIMITS = Object.freeze({
  maxFileBytes: 30_000_000,
  maxTotalBytes: 90_000_000,
});

export function validateImageFiles(input, options = {}) {
  const files = [...(input || [])];
  const min = options.min ?? 1;
  const max = options.max ?? 30;
  const maxFileBytes = options.maxFileBytes ?? IMAGE_BATCH_LIMITS.maxFileBytes;
  const maxTotalBytes = options.maxTotalBytes ?? IMAGE_BATCH_LIMITS.maxTotalBytes;
  if (files.length < min) throw Object.assign(new Error(`Choose at least ${min} images`), { code: "IMAGE_COUNT_MIN", min });
  if (files.length > max) throw Object.assign(new Error(`Choose no more than ${max} images`), { code: "IMAGE_COUNT_MAX", max });
  let total = 0;
  for (const file of files) {
    if (!String(file?.type || "").startsWith("image/")) throw Object.assign(new Error(`${file?.name || "File"} is not an image`), { code: "IMAGE_TYPE", file });
    if (!(file.size >= 0) || file.size > maxFileBytes) throw Object.assign(new Error(`${file.name} exceeds the per-file size limit`), { code: "IMAGE_FILE_SIZE", file, maxFileBytes });
    total += file.size;
  }
  if (total > maxTotalBytes) throw Object.assign(new Error("Selected images exceed the total size limit"), { code: "IMAGE_TOTAL_SIZE", total, maxTotalBytes });
  return files;
}

export function normalizeOcrRectangle(rectangle, imageWidth, imageHeight) {
  const imageW = Math.floor(Number(imageWidth));
  const imageH = Math.floor(Number(imageHeight));
  if (!(imageW > 0 && imageH > 0)) throw Object.assign(new Error("Image dimensions are unavailable"), { code: "OCR_IMAGE_SIZE" });
  const values = [rectangle.left, rectangle.top, rectangle.width, rectangle.height].map(Number);
  if (!values.every(Number.isFinite)) throw Object.assign(new Error("Recognition region must contain finite numbers"), { code: "OCR_REGION_NUMBER" });
  const [left, top, width, height] = values.map(Math.floor);
  if (left < 0 || top < 0 || width < 1 || height < 1) throw Object.assign(new Error("Recognition region must have a positive size and non-negative origin"), { code: "OCR_REGION_BOUNDS" });
  if (left >= imageW || top >= imageH || left + width > imageW || top + height > imageH) {
    throw Object.assign(new Error("Recognition region extends beyond the image"), { code: "OCR_REGION_BOUNDS" });
  }
  return { left, top, width, height };
}

export function ocrSelectionFromDisplay(start, end, displayWidth, displayHeight, imageWidth, imageHeight) {
  const dw = Number(displayWidth); const dh = Number(displayHeight);
  const iw = Math.floor(Number(imageWidth)); const ih = Math.floor(Number(imageHeight));
  if (![dw, dh, iw, ih].every((value) => Number.isFinite(value) && value > 0)) {
    throw Object.assign(new Error("Image selection dimensions are invalid"), { code: "OCR_IMAGE_SIZE" });
  }
  const clamp = (value, maximum) => Math.min(maximum, Math.max(0, Number(value) || 0));
  const x1 = clamp(start?.x, dw); const y1 = clamp(start?.y, dh);
  const x2 = clamp(end?.x, dw); const y2 = clamp(end?.y, dh);
  const left = Math.floor(Math.min(x1, x2) / dw * iw);
  const top = Math.floor(Math.min(y1, y2) / dh * ih);
  const right = Math.ceil(Math.max(x1, x2) / dw * iw);
  const bottom = Math.ceil(Math.max(y1, y2) / dh * ih);
  return normalizeOcrRectangle({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }, iw, ih);
}

export function validateCanvasSize(width, height, options = {}) {
  const w = Math.floor(Number(width)); const h = Math.floor(Number(height));
  const maxSide = options.maxSide ?? 16_384; const maxPixels = options.maxPixels ?? 60_000_000;
  if (!(w > 0 && h > 0) || !Number.isSafeInteger(w) || !Number.isSafeInteger(h)) throw Object.assign(new Error("Canvas dimensions must be positive integers"), { code: "CANVAS_DIMENSIONS" });
  if (w > maxSide || h > maxSide || w * h > maxPixels) throw Object.assign(new Error("Output canvas exceeds the safe size limit"), { code: "CANVAS_SIZE", width: w, height: h, maxSide, maxPixels });
  return { width: w, height: h, pixels: w * h };
}

export function imageDrawRect(sourceWidth, sourceHeight, targetWidth, targetHeight, mode = "contain") {
  const sw = Number(sourceWidth); const sh = Number(sourceHeight); const tw = Number(targetWidth); const th = Number(targetHeight);
  if (![sw, sh, tw, th].every((value) => Number.isFinite(value) && value > 0)) throw new Error("Image and target dimensions must be positive");
  if (mode === "stretch") return { sx: 0, sy: 0, sw, sh, dx: 0, dy: 0, dw: tw, dh: th };
  const scale = mode === "cover" ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh);
  const dw = sw * scale; const dh = sh * scale;
  if (mode === "cover") {
    const cropW = tw / scale; const cropH = th / scale;
    return { sx: (sw - cropW) / 2, sy: (sh - cropH) / 2, sw: cropW, sh: cropH, dx: 0, dy: 0, dw: tw, dh: th };
  }
  return { sx: 0, sy: 0, sw, sh, dx: (tw - dw) / 2, dy: (th - dh) / 2, dw, dh };
}

export function reorderList(items, sourceIndex, targetIndex, after = false) {
  const next = Array.isArray(items) ? [...items] : [];
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return next;
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex >= next.length || targetIndex >= next.length || sourceIndex === targetIndex) return next;
  const [moved] = next.splice(sourceIndex, 1);
  const targetAfterRemoval = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
  next.splice(targetAfterRemoval + (after ? 1 : 0), 0, moved);
  return next;
}

export function createTaskGate() {
  let revision = 0;
  return {
    begin() { revision += 1; return revision; },
    isCurrent(token) { return token === revision; },
    cancel() { revision += 1; },
  };
}

export function imageInputError(cause, t) {
  const mb = (bytes) => Math.round(bytes / 1_000_000);
  switch (cause?.code) {
    case "IMAGE_COUNT_MIN": return t(`请至少选择 ${cause.min} 张图片`, `Choose at least ${cause.min} images`);
    case "IMAGE_COUNT_MAX": return t(`最多选择 ${cause.max} 张图片`, `Choose no more than ${cause.max} images`);
    case "IMAGE_TYPE": return t("所选文件中包含无法识别的图片类型", "The selection contains an unsupported image type");
    case "IMAGE_FILE_SIZE": return t(`单张图片不能超过 ${mb(cause.maxFileBytes)} MB`, `Each image must not exceed ${mb(cause.maxFileBytes)} MB`);
    case "IMAGE_TOTAL_SIZE": return t(`所选图片总计不能超过 ${mb(cause.maxTotalBytes)} MB`, `Selected images must not exceed ${mb(cause.maxTotalBytes)} MB in total`);
    case "OCR_IMAGE_SIZE": return t("无法读取图片尺寸", "Could not read the image dimensions");
    case "OCR_REGION_NUMBER": return t("识别区域必须是有效数字", "Recognition region must contain valid numbers");
    case "OCR_REGION_BOUNDS": return t("识别区域必须完整位于图片范围内", "Recognition region must stay inside the image");
    case "OCR_ENGINE_ASSET": return t("无法加载原生 OCR 模型，请重新构建或安装插件", "Could not load the native OCR models; rebuild or reinstall the plugin");
    case "BINARY_BRIDGE_UNAVAILABLE": return t("当前 DBX 版本不支持原生 OCR 所需的二进制通道，请升级 DBX", "This DBX version does not support the binary channel required by native OCR; update DBX");
    case "CANVAS_DIMENSIONS": return t("输出尺寸必须是正整数", "Output dimensions must be positive integers");
    case "CANVAS_SIZE": return t("输出画布超过安全尺寸限制", "Output canvas exceeds the safe size limit");
    default: return cause?.message || String(cause);
  }
}
