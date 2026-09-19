<script>
  import { onDestroy, onMount } from "svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { invoke } from "./host.js";
  import { fitDimension, formatInfo, normalizeAngle, normalizeCrop, normalizeOutputSize, normalizeRotation, rotatedSize, watermarkCoordinates } from "./imageOps.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const formats = [
    { value: "image/png", label: "PNG" }, { value: "image/jpeg", label: "JPEG" }, { value: "image/webp", label: "WebP" },
  ];
  const positions = [
    ["top-left", "左上", "Top left"], ["top-center", "顶部居中", "Top center"], ["top-right", "右上", "Top right"],
    ["center-left", "左侧居中", "Center left"], ["center", "居中", "Center"], ["center-right", "右侧居中", "Center right"],
    ["bottom-left", "左下", "Bottom left"], ["bottom-center", "底部居中", "Bottom center"], ["bottom-right", "右下", "Bottom right"],
  ].map(([value, zh, en]) => ({ value, label: t(zh, en) }));
  const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"]);
  const MAX_FILE_BYTES = 30 * 1024 * 1024;
  const MAX_BATCH_FILES = 20;
  const MAX_BATCH_BYTES = 100 * 1024 * 1024;

  let sourceImage;
  let sourceUrl = $state("");
  let sourceName = $state("");
  let batchFiles = $state([]);
  let batchResults = $state([]);
  let sourceType = $state("");
  let sourceSize = $state(0);
  let sourceWidth = $state(0);
  let sourceHeight = $state(0);
  let cropX = $state(0);
  let cropY = $state(0);
  let cropWidth = $state(0);
  let cropHeight = $state(0);
  let targetWidth = $state(0);
  let targetHeight = $state(0);
  let lockRatio = $state(true);
  let cropRotation = $state(0);
  let rotation = $state(0);
  let flipHorizontal = $state(false);
  let flipVertical = $state(false);
  let format = $state("image/png");
  let quality = $state(85);
  let background = $state("#ffffff");
  let watermark = $state("");
  let watermarkSize = $state(32);
  let watermarkOpacity = $state(70);
  let watermarkColor = $state("#ffffff");
  let watermarkPosition = $state("bottom-right");
  let watermarkTiled = $state(false);
  let resultUrl = $state("");
  let resultBlob = $state(null);
  let resultWidth = $state(0);
  let resultHeight = $state(0);
  let error = $state("");
  let processing = $state(false);
  let dragging = $state(false);
  let cropDragging = $state(false);
  let cropDragStart = $state(null);
  let cropDragOrigin = $state(null);
  let cropDragMode = $state("");
  let cropDragMoved = $state(false);
  let cropStage = $state(null);
  let sourcePreview = $state(null);
  let cropFrame = $state({ left: 0, top: 0, width: 0, height: 0 });
  let savedPath = $state("");
  let fileInput = $state(null);
  let previewPending = $state(false);
  let saving = $state(false);
  let batchProcessing = $state(false);
  let previewTimer = null;
  let processQueued = false;

  const qualityEnabled = $derived(format === "image/jpeg" || format === "image/webp");
  const previewStatus = $derived(processing ? t("处理中…", "Processing…") : previewPending ? t("等待预览…", "Preview pending…") : t("自动预览已开启", "Auto preview on"));
  const saveLabel = $derived.by(() => {
    const label = formatInfo(format).label;
    if (saving) return t("保存中…", "Saving…");
    if (savedPath) return t("已保存 " + label, "Saved " + label);
    return t("保存 " + label, "Save " + label);
  });
  const hasSource = $derived(Boolean(sourceUrl && sourceImage));

  onDestroy(() => {
    if (previewTimer) clearTimeout(previewTimer);
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  });

  // Keep the preview in sync with controls without encoding on every keystroke.
  $effect(() => {
    const inputs = [
      sourceUrl, sourceImage, cropX, cropY, cropWidth, cropHeight, targetWidth, targetHeight, lockRatio,
      cropRotation, rotation, flipHorizontal, flipVertical, format, quality, background, watermark,
      watermarkSize, watermarkOpacity, watermarkColor, watermarkPosition, watermarkTiled, cropDragging,
    ];
    if (!inputs[0]) return;
    if (cropDragging) {
      previewPending = true;
      return;
    }
    schedulePreview();
    return () => {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    };
  });

  onMount(() => {
    window.addEventListener("resize", updateCropFrame);
    return () => window.removeEventListener("resize", updateCropFrame);
  });

  // The preview image can be letterboxed inside its stage. Keep the crop frame
  // in stage coordinates so dragging still maps precisely to source pixels.
  $effect(() => {
    sourceUrl; sourceWidth; sourceHeight; cropX; cropY; cropWidth; cropHeight;
    requestAnimationFrame(updateCropFrame);
  });

  function humanSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const power = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** power).toFixed(power ? 1 : 0)} ${units[power]}`;
  }
  function loadElement(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(t("无法解码这张图片。", "Could not decode this image.")));
      image.src = url;
    });
  }
  async function loadFile(file) {
    if (!file) return false;
    error = ""; savedPath = "";
    if (!acceptedTypes.has(file.type)) { error = t("请选择 PNG、JPEG、WebP、GIF、AVIF 或 BMP 图片。", "Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image."); return false; }
    if (file.size > MAX_FILE_BYTES) { error = t("图片不能超过 30 MB。", "The image must be 30 MB or smaller."); return false; }
    const nextUrl = URL.createObjectURL(file);
    try {
      const nextImage = await loadElement(nextUrl);
      if (nextImage.naturalWidth * nextImage.naturalHeight > 40_000_000) throw new Error(t("图片不能超过 4000 万像素。", "The image must not exceed 40 megapixels."));
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      sourceImage = nextImage; sourceUrl = nextUrl; resultUrl = ""; resultBlob = null;
      sourceName = file.name; sourceType = file.type; sourceSize = file.size;
      sourceWidth = nextImage.naturalWidth; sourceHeight = nextImage.naturalHeight;
      cropX = 0; cropY = 0; cropWidth = sourceWidth; cropHeight = sourceHeight;
      targetWidth = sourceWidth; targetHeight = sourceHeight;
      cropRotation = 0; rotation = 0; flipHorizontal = false; flipVertical = false;
      format = formats.some((item) => item.value === file.type) ? file.type : "image/png";
      return true;
    } catch (cause) {
      URL.revokeObjectURL(nextUrl);
      error = String(cause.message || cause);
      return false;
    }
  }
  function acceptFiles(files) {
    if (!files.length) return;
    const selected = files.slice(0, MAX_BATCH_FILES);
    const total = selected.reduce((sum, file) => sum + file.size, 0);
    if (files.length > MAX_BATCH_FILES || total > MAX_BATCH_BYTES) {
      error = t(`批量最多 ${MAX_BATCH_FILES} 张且总大小不超过 100 MB。`, `Batch input is limited to ${MAX_BATCH_FILES} images and 100 MB total.`);
      return;
    }
    batchFiles = selected.length > 1 ? selected : [];
    batchResults = [];
    void loadFile(selected[0]);
  }
  function onFile(event) {
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = "";
    acceptFiles(files);
  }
  function onDrop(event) { event.preventDefault(); dragging = false; acceptFiles([...(event.dataTransfer?.files || [])]); }
  function onPaste(event) {
    const file = [...(event.clipboardData?.files || [])].find((item) => acceptedTypes.has(item.type));
    if (file) { event.preventDefault(); batchFiles = []; batchResults = []; void loadFile(file); }
  }
  function clearBatch() { batchFiles = []; batchResults = []; }

  async function processBatch() {
    if (batchFiles.length < 2 || batchProcessing || processing) return;
    batchProcessing = true; batchResults = []; error = "";
    const options = { cropX, cropY, cropWidth, cropHeight, targetWidth, targetHeight, lockRatio, cropRotation, rotation, flipHorizontal, flipVertical, format, quality, background, watermark, watermarkSize, watermarkOpacity, watermarkColor, watermarkPosition, watermarkTiled };
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    try {
      for (const file of batchFiles) {
        const loaded = await loadFile(file);
        if (!loaded) continue;
        cropX = options.cropX; cropY = options.cropY; cropWidth = options.cropWidth; cropHeight = options.cropHeight;
        targetWidth = options.targetWidth; targetHeight = options.targetHeight; lockRatio = options.lockRatio;
        cropRotation = options.cropRotation; rotation = options.rotation; flipHorizontal = options.flipHorizontal; flipVertical = options.flipVertical;
        format = options.format; quality = options.quality; background = options.background; watermark = options.watermark;
        watermarkSize = options.watermarkSize; watermarkOpacity = options.watermarkOpacity; watermarkColor = options.watermarkColor; watermarkPosition = options.watermarkPosition; watermarkTiled = options.watermarkTiled;
        if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
        await processImage();
        if (resultBlob) batchResults = [...batchResults, { name: outputName(), blob: resultBlob }];
      }
      if (!batchResults.length && !error) error = t("没有成功处理的图片。", "No images were processed successfully.");
    } catch (cause) { error = String(cause.message || cause); }
    finally { batchProcessing = false; }
  }

  function downloadBatch() {
    if (batchProcessing || !batchResults.length) return;
    batchResults.forEach((item, index) => setTimeout(() => triggerDownload(item.blob, item.name), index * 180));
  }

  function sourcePoint(event, allowOutside = false) {
    if (!sourcePreview || !sourceWidth || !sourceHeight) return null;
    const rect = sourcePreview.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    // The preview can be letterboxed inside the stage. Ignore a new gesture
    // in that letterbox, but keep an active gesture clamped to the image edge.
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    const isHandle = event.target?.closest?.("[data-crop-handle]");
    if (outside && !cropDragging && !allowOutside && !isHandle) return null;
    const x = (event.clientX - rect.left) / rect.width * sourceWidth;
    const y = (event.clientY - rect.top) / rect.height * sourceHeight;
    if (allowOutside || cropDragging && cropDragMode === "rotate") return { x, y };
    return {
      x: Math.max(0, Math.min(sourceWidth, x)),
      y: Math.max(0, Math.min(sourceHeight, y)),
    };
  }
  function updateCropFrame() {
    if (!cropStage || !sourcePreview || !sourceWidth || !sourceHeight) {
      cropFrame = { left: 0, top: 0, width: 0, height: 0 };
      return;
    }
    const stageRect = cropStage.getBoundingClientRect();
    const imageRect = sourcePreview.getBoundingClientRect();
    const scaleX = imageRect.width / sourceWidth;
    const scaleY = imageRect.height / sourceHeight;
    cropFrame = {
      left: imageRect.left - stageRect.left + cropX * scaleX,
      top: imageRect.top - stageRect.top + cropY * scaleY,
      width: cropWidth * scaleX,
      height: cropHeight * scaleY,
    };
  }
  function cropOverlayPoints() {
    const centerX = cropFrame.left + cropFrame.width / 2;
    const centerY = cropFrame.top + cropFrame.height / 2;
    const angle = Number(cropRotation) || 0;
    return [
      { x: cropFrame.left, y: cropFrame.top },
      { x: cropFrame.left + cropFrame.width, y: cropFrame.top },
      { x: cropFrame.left + cropFrame.width, y: cropFrame.top + cropFrame.height },
      { x: cropFrame.left, y: cropFrame.top + cropFrame.height },
    ].map((point) => rotatePoint(point, centerX, centerY, angle));
  }
  function cropHandlePoints() {
    const centerX = cropFrame.left + cropFrame.width / 2;
    const centerY = cropFrame.top + cropFrame.height / 2;
    const handles = [
      ["nw", cropFrame.left, cropFrame.top], ["n", centerX, cropFrame.top], ["ne", cropFrame.left + cropFrame.width, cropFrame.top],
      ["e", cropFrame.left + cropFrame.width, centerY], ["se", cropFrame.left + cropFrame.width, cropFrame.top + cropFrame.height],
      ["s", centerX, cropFrame.top + cropFrame.height], ["sw", cropFrame.left, cropFrame.top + cropFrame.height], ["w", cropFrame.left, centerY],
    ];
    return handles.map(([handle, x, y]) => ({ handle, ...rotatePoint({ x, y }, centerX, centerY, Number(cropRotation) || 0) }));
  }
  function cropRotateHandlePoint() {
    const centerX = cropFrame.left + cropFrame.width / 2;
    const centerY = cropFrame.top + cropFrame.height / 2;
    return rotatePoint({ x: centerX, y: cropFrame.top - 24 }, centerX, centerY, Number(cropRotation) || 0);
  }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function rotatePoint(point, centerX, centerY, degrees) {
    const radians = degrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const x = point.x - centerX;
    const y = point.y - centerY;
    return { x: centerX + x * cosine - y * sine, y: centerY + x * sine + y * cosine };
  }
  function pointInCrop(point, x, y, width, height, angle) {
    const local = rotatePoint(point, x + width / 2, y + height / 2, -angle);
    return local.x >= x && local.x <= x + width && local.y >= y && local.y <= y + height;
  }
  function cropTarget(event) {
    const target = event.target;
    return target && typeof target.closest === "function" ? target : null;
  }
  function beginCrop(event) {
    if (event.button != null && event.button !== 0) return;
    const target = cropTarget(event);
    const handle = target?.closest("[data-crop-handle]")?.dataset?.cropHandle || "";
    const selection = target?.closest(".crop-selection");
    const point = sourcePoint(event, Boolean(handle) || Boolean(selection && !handle));
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const inside = pointInCrop(point, cropX, cropY, cropWidth, cropHeight, cropRotation);
    const isFullCrop = cropX <= 0 && cropY <= 0 && cropWidth >= sourceWidth && cropHeight >= sourceHeight && Math.abs(Number(cropRotation) || 0) < 0.001;
    cropDragging = true;
    cropDragStart = point;
    cropDragOrigin = { x: cropX, y: cropY, width: cropWidth, height: cropHeight, angle: cropRotation };
    // Handles resize the corresponding edges. Clicking inside the frame moves
    // it; dragging outside starts a fresh selection.
    cropDragMode = handle || (selection && inside && !isFullCrop ? "move" : "new");
    cropDragMoved = false;
  }
  function moveCrop(event) {
    if (!cropDragging || !cropDragStart || !cropDragOrigin) return;
    const resizing = cropDragMode && !["move", "new", "rotate"].includes(cropDragMode);
    const point = sourcePoint(event, cropDragMode === "rotate" || resizing || cropDragMode === "move");
    if (!point) return;
    if (!cropDragMoved && Math.hypot(point.x - cropDragStart.x, point.y - cropDragStart.y) < 2) return;
    cropDragMoved = true;
    const origin = {
      x: Number(cropDragOrigin.x) || 0,
      y: Number(cropDragOrigin.y) || 0,
      width: Math.max(1, Number(cropDragOrigin.width) || 1),
      height: Math.max(1, Number(cropDragOrigin.height) || 1),
      angle: Number(cropDragOrigin.angle) || 0,
    };
    const dx = point.x - cropDragStart.x;
    const dy = point.y - cropDragStart.y;
    if (cropDragMode === "rotate") {
      const centerX = origin.x + origin.width / 2;
      const centerY = origin.y + origin.height / 2;
      const startAngle = Math.atan2(cropDragStart.y - centerY, cropDragStart.x - centerX);
      const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
      const delta = (currentAngle - startAngle) * 180 / Math.PI;
      cropRotation = normalizeAngle((Number(origin.angle) || 0) + delta);
      return;
    }
    if (cropDragMode === "new") {
      const x = Math.min(cropDragStart.x, point.x);
      const y = Math.min(cropDragStart.y, point.y);
      cropX = Math.round(x);
      cropY = Math.round(y);
      cropWidth = Math.max(1, Math.round(Math.abs(point.x - cropDragStart.x)));
      cropHeight = Math.max(1, Math.round(Math.abs(point.y - cropDragStart.y)));
      return;
    }
    if (cropDragMode === "move") {
      cropX = Math.round(clamp(origin.x + dx, 0, sourceWidth - origin.width));
      cropY = Math.round(clamp(origin.y + dy, 0, sourceHeight - origin.height));
      return;
    }
    const centerX = origin.x + origin.width / 2;
    const centerY = origin.y + origin.height / 2;
    const localPoint = rotatePoint(point, centerX, centerY, -origin.angle);
    const localX = localPoint.x - centerX;
    const localY = localPoint.y - centerY;
    const east = cropDragMode.includes("e");
    const west = cropDragMode.includes("w");
    const south = cropDragMode.includes("s");
    const north = cropDragMode.includes("n");
    const halfWidth = origin.width / 2;
    const halfHeight = origin.height / 2;
    let nextWidth = origin.width;
    let nextHeight = origin.height;
    let shiftX = 0;
    let shiftY = 0;
    if (west) {
      const edge = clamp(localX, -halfWidth - sourceWidth, halfWidth - 1);
      nextWidth = Math.max(1, Math.min(sourceWidth, halfWidth - edge));
      shiftX = (halfWidth + edge) / 2;
    }
    if (east) {
      const edge = clamp(localX, -halfWidth + 1, halfWidth + sourceWidth);
      nextWidth = Math.max(1, Math.min(sourceWidth, edge + halfWidth));
      shiftX = (edge - halfWidth) / 2;
    }
    if (north) {
      const edge = clamp(localY, -halfHeight - sourceHeight, halfHeight - 1);
      nextHeight = Math.max(1, Math.min(sourceHeight, halfHeight - edge));
      shiftY = (halfHeight + edge) / 2;
    }
    if (south) {
      const edge = clamp(localY, -halfHeight + 1, halfHeight + sourceHeight);
      nextHeight = Math.max(1, Math.min(sourceHeight, edge + halfHeight));
      shiftY = (edge - halfHeight) / 2;
    }
    const shiftedCenter = rotatePoint({ x: centerX + shiftX, y: centerY + shiftY }, centerX, centerY, origin.angle);
    cropWidth = Math.max(1, Math.round(nextWidth));
    cropHeight = Math.max(1, Math.round(nextHeight));
    cropX = Math.round(clamp(shiftedCenter.x - cropWidth / 2, 0, sourceWidth - cropWidth));
    cropY = Math.round(clamp(shiftedCenter.y - cropHeight / 2, 0, sourceHeight - cropHeight));
  }
  function finishCrop(event) {
    if (!cropDragging) return;
    cropDragging = false;
    cropDragStart = null;
    cropDragOrigin = null;
    cropDragMode = "";
    cropDragMoved = false;
    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
  }
  function setFullCrop() {
    cropX = 0; cropY = 0; cropWidth = sourceWidth; cropHeight = sourceHeight;
    targetWidth = sourceWidth; targetHeight = sourceHeight;
  }
  function matchCropSize() { targetWidth = Math.max(1, Number(cropWidth) || 1); targetHeight = Math.max(1, Number(cropHeight) || 1); }
  function resetOptions() {
    setFullCrop();
    lockRatio = true;
    rotation = 0;
    cropRotation = 0;
    flipHorizontal = false;
    flipVertical = false;
    format = formats.some((item) => item.value === sourceType) ? sourceType : "image/png";
    quality = 85;
    background = "#ffffff";
    watermark = "";
    watermarkSize = 32;
    watermarkOpacity = 70;
    watermarkColor = "#ffffff";
    watermarkPosition = "bottom-right";
    watermarkTiled = false;
    applyImage();
  }
  function changeWidth(event) {
    targetWidth = event.currentTarget.value;
    if (lockRatio) targetHeight = fitDimension(targetWidth, cropWidth, cropHeight);
  }
  function changeHeight(event) {
    targetHeight = event.currentTarget.value;
    if (lockRatio) targetWidth = fitDimension(targetHeight, cropHeight, cropWidth);
  }
  function rotate(delta) { rotation = normalizeRotation(rotation + delta); }
  function schedulePreview(delay = 280) {
    if (!sourceImage) return;
    if (previewTimer) clearTimeout(previewTimer);
    previewPending = true;
    previewTimer = setTimeout(() => {
      previewTimer = null;
      void processImage();
    }, delay);
  }
  function applyImage() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    previewPending = false;
    void processImage();
  }
  function canvasBlob(canvas, mime, amount) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image encoding failed")), mime, amount));
  }
  async function processImage() {
    if (!sourceImage) return;
    if (processing) {
      processQueued = true;
      return;
    }
    processQueued = false;
    previewPending = false;
    processing = true; error = ""; savedPath = "";
    try {
      const crop = normalizeCrop(sourceWidth, sourceHeight, { x: cropX, y: cropY, width: cropWidth, height: cropHeight });
      const target = normalizeOutputSize(targetWidth, targetHeight);
      const outputAngle = normalizeRotation(rotation);
      const output = rotatedSize(target.width, target.height, outputAngle);
      const canvas = document.createElement("canvas");
      canvas.width = output.width; canvas.height = output.height;
      const context = canvas.getContext("2d", { alpha: format !== "image/jpeg" });
      if (!context) throw new Error("Canvas is unavailable");
      if (format === "image/jpeg") { context.fillStyle = background; context.fillRect(0, 0, canvas.width, canvas.height); }
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = target.width;
      cropCanvas.height = target.height;
      const cropContext = cropCanvas.getContext("2d");
      if (!cropContext) throw new Error("Canvas is unavailable");
      const cropAngle = normalizeAngle(cropRotation);
      cropContext.save();
      cropContext.translate(target.width / 2, target.height / 2);
      cropContext.rotate(-cropAngle * Math.PI / 180);
      cropContext.scale(target.width / crop.width, target.height / crop.height);
      cropContext.translate(-(crop.x + crop.width / 2), -(crop.y + crop.height / 2));
      cropContext.drawImage(sourceImage, 0, 0);
      cropContext.restore();
      context.save();
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(outputAngle * Math.PI / 180);
      context.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(cropCanvas, -target.width / 2, -target.height / 2, target.width, target.height);
      context.restore();
      if (watermark.trim()) {
        const fontSize = Math.max(8, Math.min(256, Number(watermarkSize) || 32));
        context.save();
        context.font = `600 ${fontSize}px sans-serif`;
        context.textBaseline = "alphabetic";
        const textWidth = context.measureText(watermark).width;
        context.globalAlpha = Math.max(0, Math.min(1, Number(watermarkOpacity) / 100));
        context.lineWidth = Math.max(2, fontSize / 12);
        context.strokeStyle = "rgba(0,0,0,.55)";
        context.fillStyle = watermarkColor;
        if (watermarkTiled) {
          const gapX = Math.max(28, fontSize * 2.8);
          const gapY = Math.max(24, fontSize * 2.6);
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate(-25 * Math.PI / 180);
          context.translate(-canvas.width / 2, -canvas.height / 2);
          for (let y = -canvas.height; y < canvas.height * 2; y += gapY) {
            for (let x = -canvas.width; x < canvas.width * 2; x += textWidth + gapX) {
              context.strokeText(watermark, x, y);
              context.fillText(watermark, x, y);
            }
          }
        } else {
          const point = watermarkCoordinates(canvas.width, canvas.height, textWidth, fontSize, watermarkPosition, Math.max(12, fontSize * 0.55));
          context.strokeText(watermark, point.x, point.y);
          context.fillText(watermark, point.x, point.y);
        }
        context.restore();
      }
      const blob = await canvasBlob(canvas, format, qualityEnabled ? Number(quality) / 100 : undefined);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultBlob = blob; resultUrl = URL.createObjectURL(blob); resultWidth = canvas.width; resultHeight = canvas.height;
    } catch (cause) { error = String(cause.message || cause); }
    finally {
      processing = false;
      if (processQueued) schedulePreview(0);
    }
  }
  function outputName() {
    const base = sourceName.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "image";
    return `${base}-edited.${formatInfo(format).extension}`;
  }
  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.rel = "noopener"; document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function blobBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || ""); reader.onerror = reject; reader.readAsDataURL(blob);
    });
  }
  async function downloadResult() {
    if (!resultBlob || saving || processing || previewPending) return;
    saving = true;
    error = "";
    try {
      if (window.dbxPlugin?.invoke) {
        const saved = await invoke("toolbox/save-file", { fileName: outputName(), mimeType: format, data: await blobBase64(resultBlob), title: t("保存图片", "Save image") }, 120000);
        savedPath = saved?.path || "";
      } else triggerDownload(resultBlob, outputName());
    } catch (cause) { error = String(cause.message || cause); }
    finally { saving = false; }
  }
</script>

<div class="page" onpaste={onPaste}>
  <input
    bind:this={fileInput}
    class="file-input"
    type="file"
    multiple
    accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp"
    aria-label={t("选择图片文件", "Choose an image file")}
    onchange={onFile}
  />
  {#if hasSource}
    <div class="topbar">
      <button class="dbx-btn" type="button" onclick={() => fileInput?.click()}>{t("更换图片", "Replace image")}</button>
      <button class="dbx-btn dbx-btn--primary" type="button" onclick={downloadResult} disabled={!resultBlob || processing || previewPending || saving}>{saveLabel}</button>
      {#if batchResults.length}<button class="dbx-btn" type="button" onclick={downloadBatch} disabled={batchProcessing}>{t(`下载批量结果（${batchResults.length}）`, `Download batch (${batchResults.length})`)}</button>{/if}
      <span class="preview-status" aria-live="polite">{previewStatus}</span>
      <span class="dbx-hint">{t("支持粘贴图片和批量选择；调整参数后会自动预览，本地处理，不上传。", "Paste or select multiple images; adjust options for an automatic local preview.")}</span>
      {#if sourceType === "image/gif"}<span class="dbx-hint">{t("GIF 将按第一帧处理。", "Animated GIFs use the first frame.")}</span>{/if}
    </div>
  {/if}
  {#if hasSource && batchFiles.length > 1}
    <div class="batch-toolbar" role="status">
      <div><strong>{t("批量模式", "Batch mode")}</strong><span>{t(`已选择 ${batchFiles.length} 张图片，当前参数会应用到全部图片。`, `${batchFiles.length} images selected; current settings apply to all.`)}</span></div>
      <div class="batch-toolbar-actions"><button class="dbx-btn dbx-btn--primary" type="button" onclick={processBatch} disabled={batchProcessing || processing}>{batchProcessing ? t("处理中…", "Processing…") : t("开始批量处理", "Process all")}</button><button class="dbx-btn" type="button" onclick={clearBatch} disabled={batchProcessing}>{t("改为单图", "Use single image")}</button></div>
    </div>
  {/if}
  {#if batchResults.length}<div class="batch-results" aria-live="polite"><strong>{t("批量结果", "Batch results")}</strong>{#each batchResults as item}<span>{item.name}</span>{/each}</div>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if !hasSource}
    <div class="empty-state">
      <button class="dropzone" class:dragging ondragover={(event) => { event.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop} type="button" onclick={() => fileInput?.click()}>
        <span class="dropzone-icon" aria-hidden="true">↑</span>
        <strong>{t("开始处理图片", "Start with an image")}</strong>
        <span>{t("拖放图片到这里，或点击选择图片", "Drop an image here, or click to choose one")}</span>
        <span class="dropzone-action">{t("选择图片", "Choose image")}</span>
        <small>{t("支持 PNG、JPEG、WebP、GIF、AVIF、BMP，最大 30 MB", "PNG, JPEG, WebP, GIF, AVIF; up to 30 MB")}</small>
      </button>
    </div>
  {:else}
    <div class="workspace">
      <aside class="controls">
        <section><div class="section-title"><strong>{t("裁剪", "Crop")}</strong><button class="link" type="button" onclick={setFullCrop}>{t("使用整张图片", "Full image")}</button></div><div class="quad"><label>X<input class="dbx-input" type="number" min="0" bind:value={cropX} /></label><label>Y<input class="dbx-input" type="number" min="0" bind:value={cropY} /></label><label>{t("宽", "W")}<input class="dbx-input" type="number" min="1" bind:value={cropWidth} /></label><label>{t("高", "H")}<input class="dbx-input" type="number" min="1" bind:value={cropHeight} /></label></div><div class="crop-rotate-row"><span class="subtle">{t("裁剪框角度", "Crop angle")}：{Math.round(cropRotation)}° · {t("结果框位置不变，内容随选区变化", "Fixed result frame; content follows the crop")}</span><div class="button-row"><button class="dbx-btn" type="button" onclick={() => (cropRotation = normalizeAngle(cropRotation - 15))}>↶ 15°</button><button class="dbx-btn" type="button" onclick={() => (cropRotation = normalizeAngle(cropRotation + 15))}>↷ 15°</button><button class="dbx-btn" type="button" onclick={() => (cropRotation = 0)}>{t("归零", "Reset")}</button></div></div></section>
        <section><div class="section-title"><strong>{t("缩放", "Resize")}</strong><button class="link" type="button" onclick={matchCropSize}>{t("匹配裁剪尺寸", "Match crop")}</button></div><div class="pair"><label>{t("宽度", "Width")}<input class="dbx-input" type="number" min="1" max="12000" value={targetWidth} oninput={changeWidth} /></label><label>{t("高度", "Height")}<input class="dbx-input" type="number" min="1" max="12000" value={targetHeight} oninput={changeHeight} /></label></div><label class="check"><input type="checkbox" bind:checked={lockRatio} /> {t("锁定宽高比", "Lock aspect ratio")}</label></section>
        <section><strong>{t("旋转与翻转", "Rotate and flip")}</strong><span class="subtle">{t("会作用于导出结果", "Applies to the exported result")}</span><div class="button-row"><button class="dbx-btn" type="button" onclick={() => rotate(-90)}>↶ 90°</button><button class="dbx-btn" type="button" onclick={() => rotate(90)}>↷ 90°</button><button class="dbx-btn" class:active={flipHorizontal} aria-pressed={flipHorizontal} type="button" onclick={() => (flipHorizontal = !flipHorizontal)}>{t("水平翻转", "Flip H")}</button><button class="dbx-btn" class:active={flipVertical} aria-pressed={flipVertical} type="button" onclick={() => (flipVertical = !flipVertical)}>{t("垂直翻转", "Flip V")}</button></div><span class="subtle">{t("当前旋转", "Rotation")}: {rotation}°</span></section>
        <section><strong>{t("水印", "Watermark")}</strong><label>{t("文字", "Text")}<input class="dbx-input" bind:value={watermark} placeholder={t("留空则不添加", "Leave blank for none")} /></label><div class="pair"><label>{t("字号", "Size")}<input class="dbx-input" type="number" min="8" max="256" bind:value={watermarkSize} /></label><label>{t("透明度", "Opacity")}<input class="dbx-input" type="number" min="0" max="100" bind:value={watermarkOpacity} /></label></div><div class="pair"><label>{t("位置", "Position")}<Select bind:value={watermarkPosition} options={positions} /></label><label>{t("颜色", "Color")}<input class="color-input" type="color" bind:value={watermarkColor} /></label></div><label class="check"><input type="checkbox" bind:checked={watermarkTiled} /> {t("平铺水印", "Tile watermark")}</label></section>
        <section><div class="section-title"><strong>{t("输出", "Output")}</strong><button class="link" type="button" onclick={resetOptions}>{t("重置参数", "Reset")}</button></div><label>{t("格式", "Format")}<Select bind:value={format} options={formats} /></label>{#if qualityEnabled}<label>{t("质量", "Quality")} · {quality}%<input class="range" type="range" min="10" max="100" bind:value={quality} /></label>{/if}{#if format === "image/jpeg"}<label>{t("透明区域背景", "Transparency background")}<input class="color-input" type="color" bind:value={background} /></label>{/if}</section>
      </aside>
      <main class="previews">
        <article><div class="preview-head"><strong>{t("原图", "Original")}</strong><span>{sourceWidth}×{sourceHeight} · {humanSize(sourceSize)}</span></div><div
          bind:this={cropStage}
          class="stage crop-stage"
          class:crop-active={cropDragging}
        role="application"
          aria-label={t("拖动选框移动，拖动边角调整大小，框外拖动重新框选；左侧可旋转裁剪框", "Drag the frame to move, handles to resize, or drag outside to reselect; rotate it from the controls")}
        onlostpointercapture={finishCrop}
        onpointercancel={finishCrop}
        onpointerdown={beginCrop}
        onpointermove={moveCrop}
        onpointerup={finishCrop}
        ><img
          bind:this={sourcePreview}
          src={sourceUrl}
          alt={t("原图预览，可拖动调整裁剪区域", "Original preview; drag to adjust the crop area")}
          draggable="false"
          onload={updateCropFrame}
        />{#if cropFrame.width > 0}<svg class="crop-overlay" viewBox={`0 0 ${cropStage?.clientWidth || 1} ${cropStage?.clientHeight || 1}`} aria-label={t("裁剪选区，可拖动调整位置或边角调整大小", "Crop selection; drag to move or use the handles to resize")}>
          <polygon class="crop-selection" class:active={cropDragging} points={cropOverlayPoints().map((point) => `${point.x},${point.y}`).join(" ")} />
          {#each cropHandlePoints() as item}
            <circle class={`crop-handle crop-handle--${item.handle}`} data-crop-handle={item.handle} cx={item.x} cy={item.y} r="6" />
          {/each}
          <circle class="crop-rotate-handle" data-crop-handle="rotate" cx={cropRotateHandlePoint().x} cy={cropRotateHandlePoint().y} r="9" aria-label={t("旋转裁剪选区", "Rotate crop selection")} />
        </svg>{/if}<span class="crop-hint">{t("拖动移动；边角调整大小；左侧可旋转", "Drag to move; handles resize; rotate from the controls")}</span></div></article>
        <article><div class="preview-head"><strong>{t("处理结果", "Result")}</strong>{#if resultBlob}<span>{resultWidth}×{resultHeight} · {humanSize(resultBlob.size)}</span>{/if}</div><div class="stage checker">{#if resultUrl}<img src={resultUrl} alt={t("处理结果预览", "Processed image preview")} />{:else}<span>{t("等待自动预览…", "Waiting for auto preview…")}</span>{/if}</div>{#if savedPath}<p class="saved">{t("已保存：", "Saved: ")}{savedPath}</p>{/if}</article>
      </main>
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 10px; }
  .topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 10px; background: color-mix(in srgb, var(--color-card) 94%, var(--color-muted)); }.topbar .dbx-hint { margin-left: auto; max-width: min(52ch, 48%); text-align: right; line-height: 1.35; }.topbar .dbx-hint + .dbx-hint { margin-left: 0; }.preview-status { padding: 3px 7px; border-radius: 999px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 11px; white-space: nowrap; }
  .file-input { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .error { margin: 0; padding: 8px 10px; border-radius: 6px; color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 9%, transparent); font-size: 12px; }
  .batch-results { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 7px 9px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 11px; }.batch-results strong { color: var(--color-foreground); }.batch-results span { overflow-wrap: anywhere; }
  .batch-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 14px; padding: 9px 10px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); border-radius: 10px; background: color-mix(in srgb, var(--color-primary) 6%, var(--color-card)); }.batch-toolbar > div:first-child { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }.batch-toolbar strong { color: var(--color-foreground); font-size: 12px; }.batch-toolbar span { color: var(--color-muted-foreground); font-size: 11px; }.batch-toolbar-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .empty-state { flex: 1; min-height: 260px; display: grid; place-items: center; padding: clamp(18px, 3vw, 36px); border: 1px solid var(--color-border); border-radius: 14px; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--color-primary) 7%, transparent), transparent 52%), color-mix(in srgb, var(--color-muted) 42%, var(--color-background)); }
  .dropzone { width: min(100%, 640px); min-height: 270px; margin: 0; padding: 34px 24px; display: grid; place-content: center; gap: 9px; border: 1px dashed color-mix(in srgb, var(--color-primary) 38%, var(--color-border)); border-radius: 14px; background: color-mix(in srgb, var(--color-card) 94%, transparent); color: var(--color-muted-foreground); cursor: pointer; font: inherit; text-align: center; box-shadow: 0 12px 28px color-mix(in srgb, #000 7%, transparent); transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease, transform 120ms ease; }.dropzone strong { color: var(--color-foreground); font-size: 16px; }.dropzone > span:not(.dropzone-icon):not(.dropzone-action) { font-size: 12px; }.dropzone small { color: var(--color-muted-foreground); font-size: 11px; }.dropzone-action { justify-self: center; padding: 7px 13px; border-radius: 7px; background: var(--color-primary); color: var(--color-primary-foreground); font-size: 12px; font-weight: 600; }.dropzone-icon { display: grid; place-items: center; width: 40px; height: 40px; margin: 0 auto 4px; border: 1px solid color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); border-radius: 50%; background: color-mix(in srgb, var(--color-primary) 8%, var(--color-background)); color: var(--color-primary); font-size: 24px; line-height: 1; }.dropzone:hover { border-color: var(--color-primary); }.dropzone.dragging { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 8%, var(--color-card)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 12%, transparent), 0 12px 28px color-mix(in srgb, #000 9%, transparent); transform: translateY(-1px); }
  .workspace { display: grid; flex: 1; min-height: 0; grid-template-columns: 310px minmax(0, 1fr); gap: 12px; }
  .controls { min-height: 0; overflow: auto; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card); }
  .controls section { display: flex; flex-direction: column; gap: 9px; padding: 13px; border-bottom: 1px solid var(--color-border); }.controls section:last-child { border-bottom: 0; }
  .controls label { display: flex; flex-direction: column; gap: 5px; color: var(--color-muted-foreground); font-size: 11px; }.controls strong { font-size: 13px; color: var(--color-foreground); }
  .section-title, .preview-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }.link { border: 0; background: transparent; padding: 0; color: var(--color-primary); cursor: pointer; font: inherit; font-size: 11px; }
  .quad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }.quad .dbx-input { min-width: 0; padding-inline: 6px; }
  .check { flex-direction: row !important; align-items: center; }.button-row { display: flex; flex-wrap: wrap; gap: 6px; }.button-row .active { border-color: var(--dbx-selection-border); color: var(--dbx-selection-foreground); background: var(--dbx-selection-background); }.subtle { color: var(--color-muted-foreground); font-size: 11px; }.crop-rotate-row { display: flex; flex-direction: column; gap: 6px; padding-top: 2px; }
  .color-input { width: 100%; min-height: 32px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background); padding: 3px; }.range { width: 100%; }
  .previews { display: grid; min-width: 0; min-height: 0; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; }.previews article { display: flex; min-width: 0; min-height: 0; flex-direction: column; gap: 7px; }.preview-head { color: var(--color-muted-foreground); font-size: 11px; }.preview-head strong { color: var(--color-foreground); font-size: 13px; }
  .stage { display: grid; width: 100%; height: clamp(360px, 66vh, 720px); min-height: 0; place-items: center; overflow: auto; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 12px; }.checker { background-color: var(--color-background); background-image: linear-gradient(45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(-45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-muted) 75%), linear-gradient(-45deg, transparent 75%, var(--color-muted) 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }.stage img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }.crop-stage { position: relative; cursor: crosshair; touch-action: none; user-select: none; }.crop-stage > img { cursor: crosshair; }.crop-stage.crop-active > img { cursor: crosshair; }.crop-selection { position: absolute; z-index: 1; transform-origin: center; border: 2px solid var(--color-primary); background: color-mix(in srgb, var(--color-primary) 12%, transparent); box-shadow: 0 0 0 9999px color-mix(in srgb, #000 34%, transparent); pointer-events: auto; cursor: move; }.crop-selection.active { background: color-mix(in srgb, var(--color-primary) 18%, transparent); }.crop-handle { position: absolute; z-index: 2; width: 12px; height: 12px; margin: -6px; padding: 0; border: 2px solid var(--color-background); border-radius: 3px; background: var(--color-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 55%, transparent); cursor: inherit; }.crop-handle--nw, .crop-handle--se { cursor: nwse-resize; }.crop-handle--ne, .crop-handle--sw { cursor: nesw-resize; }.crop-handle--n, .crop-handle--s { cursor: ns-resize; }.crop-handle--e, .crop-handle--w { cursor: ew-resize; }.crop-handle--nw { left: 0; top: 0; }.crop-handle--n { left: 50%; top: 0; }.crop-handle--ne { right: 0; top: 0; }.crop-handle--e { right: 0; top: 50%; }.crop-handle--se { right: 0; bottom: 0; }.crop-handle--s { left: 50%; bottom: 0; }.crop-handle--sw { left: 0; bottom: 0; }.crop-handle--w { left: 0; top: 50%; }.crop-rotate-handle { position: absolute; left: 50%; top: -24px; z-index: 3; width: 20px; height: 20px; margin-left: -10px; padding: 0; border: 2px solid var(--color-background); border-radius: 50%; background: var(--color-primary); color: var(--color-primary-foreground); font-size: 13px; line-height: 16px; cursor: grab; }.crop-rotate-handle:active { cursor: grabbing; }.crop-hint { position: absolute; right: 8px; bottom: 7px; z-index: 2; padding: 3px 6px; border-radius: 4px; background: color-mix(in srgb, var(--color-background) 82%, transparent); color: var(--color-muted-foreground); font-size: 10px; pointer-events: none; }.saved { margin: 0; color: var(--color-muted-foreground); font-size: 11px; overflow-wrap: anywhere; }
  .crop-overlay { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible; pointer-events: none; }.crop-overlay .crop-selection { position: static; transform: none; fill: color-mix(in srgb, var(--color-primary) 12%, transparent); stroke: var(--color-primary); stroke-width: 2; pointer-events: auto; cursor: move; }.crop-overlay .crop-selection.active { fill: color-mix(in srgb, var(--color-primary) 18%, transparent); }.crop-overlay .crop-handle { position: static; width: auto; height: auto; margin: 0; padding: 0; fill: var(--color-primary); stroke: var(--color-background); stroke-width: 2; pointer-events: auto; }.crop-overlay .crop-handle--nw, .crop-overlay .crop-handle--se { cursor: nwse-resize; }.crop-overlay .crop-handle--ne, .crop-overlay .crop-handle--sw { cursor: nesw-resize; }.crop-overlay .crop-handle--n, .crop-overlay .crop-handle--s { cursor: ns-resize; }.crop-overlay .crop-handle--e, .crop-overlay .crop-handle--w { cursor: ew-resize; }.crop-overlay .crop-rotate-handle { position: static; width: auto; height: auto; margin: 0; padding: 0; fill: var(--color-primary); stroke: var(--color-background); stroke-width: 2; pointer-events: auto; cursor: grab; }.crop-overlay .crop-rotate-handle:active { cursor: grabbing; }
  @media (max-width: 900px) { .workspace { grid-template-columns: 1fr; overflow: auto; }.controls { overflow: visible; }.previews { min-height: 500px; } }
  @media (max-width: 620px) { .previews { grid-template-columns: 1fr; }.topbar .dbx-hint { width: 100%; margin-left: 0; }.empty-state { padding: 14px; }.dropzone { min-height: 230px; padding: 26px 16px; } }
</style>
