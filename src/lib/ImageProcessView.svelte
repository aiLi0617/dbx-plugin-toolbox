<script>
  import { onDestroy, onMount } from "svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { invoke } from "./host.js";
  import {
    MAX_IMAGE_SIDE,
    fitDimension,
    formatInfo,
    normalizeAngle,
    normalizeOutputSize,
    normalizeRotation,
    objectFitContainRect,
    pointInCrop,
    resizeCropRect,
    rotatePoint,
    rotatedSize,
    sanitizeCropRect,
    watermarkCoordinates,
  } from "./imageOps.js";
  import { encodeCanvasImage, listProcessFormats, PROCESS_OUTPUT_FORMATS, resolveOutputFormat } from "./imageGenerate.js";
  import { buildZipStore } from "./zipStore.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let formats = $state(PROCESS_OUTPUT_FORMATS.filter((item) => !item.optional).map((item) => ({ value: item.mime, label: item.label })));
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
  let queue = $state([]);
  let activeId = $state("");
  let batchResults = $state([]);
  let batchNotice = $state("");
  let batchZip = $state(null);
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
  let imageLayout = $state({ left: 0, top: 0, width: 0, height: 0, scale: 0 });
  let stageSize = $state({ width: 1, height: 1 });
  // Single SVG <g rotate> owns mask hole + frame + handles (one transform, no CSS/SVG split).
  let cropOverlay = $derived.by(() => {
    const { left, top, scale } = imageLayout;
    if (!scale) return null;
    const x = Number(cropX) || 0;
    const y = Number(cropY) || 0;
    const w = Math.max(1, Number(cropWidth) || 1);
    const h = Math.max(1, Number(cropHeight) || 1);
    const angle = Number(cropRotation) || 0;
    const ox = left + x * scale;
    const oy = top + y * scale;
    const rw = w * scale;
    const rh = h * scale;
    const cx = ox + rw / 2;
    const cy = oy + rh / 2;
    return {
      ox, oy, rw, rh, cx, cy, angle,
      transform: `rotate(${angle} ${cx} ${cy})`,
      handles: [
        ["nw", ox, oy], ["n", cx, oy], ["ne", ox + rw, oy],
        ["e", ox + rw, cy], ["se", ox + rw, oy + rh],
        ["s", cx, oy + rh], ["sw", ox, oy + rh], ["w", ox, cy],
      ],
      rotateHandle: { x: cx, y: oy - 28 },
    };
  });
  let savedPath = $state("");
  let fileInput = $state(null);
  let previewPending = $state(false);
  let saving = $state(false);
  let batchProcessing = $state(false);
  let previewTimer = null;
  let processQueued = false;
  let queueSeq = 0;
  let cropMoveRaf = 0;
  let cropMoveEvent = null;

  const qualityEnabled = $derived(format === "image/jpeg" || format === "image/webp" || format === "image/avif");
  const opaqueOutput = $derived(!resolveOutputFormat(format).supportsAlpha);
  const saveLabel = $derived.by(() => {
    const label = formatInfo(format).label;
    if (saving) return t("保存中…", "Saving…");
    if (savedPath) return t("已保存 " + label, "Saved " + label);
    return t("保存 " + label, "Save " + label);
  });
  const hasSource = $derived(Boolean(sourceUrl && sourceImage));
  const hasQueue = $derived(queue.length > 1);

  onDestroy(() => {
    if (previewTimer) clearTimeout(previewTimer);
    if (cropMoveRaf) cancelAnimationFrame(cropMoveRaf);
    revokeQueueUrls();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  });

  // Keep the preview in sync with controls without encoding on every keystroke.
  // While dragging, do NOT read crop geometry — otherwise every pointermove
  // re-runs this effect and causes visible jitter.
  $effect(() => {
    if (!sourceUrl || !sourceImage) return;
    if (cropDragging) {
      previewPending = true;
      return;
    }
    void cropX; void cropY; void cropWidth; void cropHeight; void cropRotation;
    void targetWidth; void targetHeight; void lockRatio;
    void rotation; void flipHorizontal; void flipVertical;
    void format; void quality; void background;
    void watermark; void watermarkSize; void watermarkOpacity;
    void watermarkColor; void watermarkPosition; void watermarkTiled;
    schedulePreview();
    return () => {
      if (previewTimer) {
        clearTimeout(previewTimer);
        previewTimer = null;
      }
    };
  });

  onMount(() => {
    listProcessFormats().then((items) => {
      formats = items.map((item) => ({ value: item.mime, label: item.label }));
    });
    window.addEventListener("resize", updateImageLayout);
    return () => window.removeEventListener("resize", updateImageLayout);
  });

  // Layout depends on the preview image box, not crop rect values — avoid
  // recalculating (and jittering scale) on every drag frame.
  $effect(() => {
    sourceUrl; sourceWidth; sourceHeight;
    requestAnimationFrame(updateImageLayout);
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
  function revokeQueueUrls() {
    for (const item of queue) {
      if (item?.url) URL.revokeObjectURL(item.url);
    }
  }
  function defaultFormatFor(type) {
    return formats.some((item) => item.value === type) ? type : "image/png";
  }
  function snapshotOutput() {
    return {
      targetWidth: Math.max(1, Number(targetWidth) || 1),
      targetHeight: Math.max(1, Number(targetHeight) || 1),
      lockRatio: Boolean(lockRatio),
      rotation: normalizeRotation(rotation),
      flipHorizontal: Boolean(flipHorizontal),
      flipVertical: Boolean(flipVertical),
      format: format || "image/png",
      quality: Math.max(10, Math.min(100, Number(quality) || 85)),
      background: background || "#ffffff",
      watermark: String(watermark || ""),
      watermarkSize: Math.max(8, Math.min(256, Number(watermarkSize) || 32)),
      watermarkOpacity: Math.max(0, Math.min(100, Number(watermarkOpacity) || 0)),
      watermarkColor: watermarkColor || "#ffffff",
      watermarkPosition: watermarkPosition || "bottom-right",
      watermarkTiled: Boolean(watermarkTiled),
    };
  }
  function snapshotEdit() {
    return {
      cropX, cropY, cropWidth, cropHeight, cropRotation,
      ...snapshotOutput(),
    };
  }
  /** Map the active crop into another image's pixel space (keeps relative layout). */
  function scaleCropToItem(item, source) {
    const sw = Math.max(1, Number(source.width) || 1);
    const sh = Math.max(1, Number(source.height) || 1);
    const tw = Math.max(1, Number(item.width) || 1);
    const th = Math.max(1, Number(item.height) || 1);
    const sx = tw / sw;
    const sy = th / sh;
    const next = sanitizeCropRect(
      tw,
      th,
      {
        x: Number(source.cropX) * sx,
        y: Number(source.cropY) * sy,
        width: Math.max(1, Number(source.cropWidth) * sx),
        height: Math.max(1, Number(source.cropHeight) * sy),
      },
      source.cropRotation,
    );
    return {
      cropX: next.x,
      cropY: next.y,
      cropWidth: next.width,
      cropHeight: next.height,
      cropRotation: normalizeAngle(source.cropRotation),
    };
  }
  function syncSettingsToQueue() {
    persistActive();
    const active = queue.find((item) => item.id === activeId);
    const source = {
      width: sourceWidth || active?.width || 1,
      height: sourceHeight || active?.height || 1,
      ...snapshotEdit(),
    };
    // Every page setting: crop (scaled to each image) + resize/rotate/flip/watermark/format.
    queue = queue.map((item) => ({
      ...item,
      ...snapshotOutput(),
      ...scaleCropToItem(item, source),
    }));
    return source;
  }
  function settingsFromActiveForNewItem(width, height) {
    if (!queue.length || !sourceWidth || !sourceHeight) return null;
    const source = { width: sourceWidth, height: sourceHeight, ...snapshotEdit() };
    const stub = { width, height };
    return {
      ...snapshotOutput(),
      ...scaleCropToItem(stub, source),
    };
  }
  function createQueueItem(file, image, url, shared = null) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    return {
      id: `img-${++queueSeq}`,
      file,
      name: file.name,
      url,
      image,
      width,
      height,
      size: file.size,
      type: file.type,
      cropX: shared?.cropX ?? 0,
      cropY: shared?.cropY ?? 0,
      cropWidth: shared?.cropWidth ?? width,
      cropHeight: shared?.cropHeight ?? height,
      cropRotation: shared?.cropRotation ?? 0,
      targetWidth: shared?.targetWidth ?? width,
      targetHeight: shared?.targetHeight ?? height,
      lockRatio: shared?.lockRatio ?? true,
      rotation: shared?.rotation ?? 0,
      flipHorizontal: shared?.flipHorizontal ?? false,
      flipVertical: shared?.flipVertical ?? false,
      format: shared?.format ?? defaultFormatFor(file.type),
      quality: shared?.quality ?? 85,
      background: shared?.background ?? "#ffffff",
      watermark: shared?.watermark ?? "",
      watermarkSize: shared?.watermarkSize ?? 32,
      watermarkOpacity: shared?.watermarkOpacity ?? 70,
      watermarkColor: shared?.watermarkColor ?? "#ffffff",
      watermarkPosition: shared?.watermarkPosition ?? "bottom-right",
      watermarkTiled: shared?.watermarkTiled ?? false,
    };
  }
  function persistActive() {
    if (!activeId) return;
    const index = queue.findIndex((item) => item.id === activeId);
    if (index < 0) return;
    const current = queue[index];
    queue = queue.map((item, i) => (i === index ? { ...current, ...snapshotEdit(), image: sourceImage || current.image } : item));
  }
  function applyItemToUi(item, { clearResult = true } = {}) {
    sourceImage = item.image;
    sourceUrl = item.url;
    sourceName = item.name;
    sourceType = item.type;
    sourceSize = item.size;
    sourceWidth = item.width;
    sourceHeight = item.height;
    cropX = item.cropX;
    cropY = item.cropY;
    cropWidth = item.cropWidth;
    cropHeight = item.cropHeight;
    cropRotation = item.cropRotation;
    targetWidth = item.targetWidth;
    targetHeight = item.targetHeight;
    lockRatio = item.lockRatio;
    rotation = item.rotation;
    flipHorizontal = item.flipHorizontal;
    flipVertical = item.flipVertical;
    format = item.format;
    quality = item.quality;
    background = item.background;
    watermark = item.watermark;
    watermarkSize = item.watermarkSize;
    watermarkOpacity = item.watermarkOpacity;
    watermarkColor = item.watermarkColor;
    watermarkPosition = item.watermarkPosition;
    watermarkTiled = item.watermarkTiled;
    activeId = item.id;
    savedPath = "";
    if (clearResult) {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = "";
      resultBlob = null;
      resultWidth = 0;
      resultHeight = 0;
    }
  }
  async function decodeFile(file) {
    if (!acceptedTypes.has(file.type)) throw new Error(t("请选择 PNG、JPEG、WebP、GIF、AVIF 或 BMP 图片。", "Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image."));
    if (file.size > MAX_FILE_BYTES) throw new Error(t("图片不能超过 30 MB。", "The image must be 30 MB or smaller."));
    const url = URL.createObjectURL(file);
    try {
      const image = await loadElement(url);
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error(t("图片不能超过 4000 万像素。", "The image must not exceed 40 megapixels."));
      return { image, url };
    } catch (cause) {
      URL.revokeObjectURL(url);
      throw cause;
    }
  }
  async function acceptFiles(files, { append = false } = {}) {
    if (!files.length) return;
    error = "";
    const incoming = files.filter((file) => acceptedTypes.has(file.type));
    if (!incoming.length) {
      error = t("请选择 PNG、JPEG、WebP、GIF、AVIF 或 BMP 图片。", "Choose a PNG, JPEG, WebP, GIF, AVIF, or BMP image.");
      return;
    }
    const existingCount = append ? queue.length : 0;
    const room = Math.max(0, MAX_BATCH_FILES - existingCount);
    if (append && room <= 0) {
      error = t(`批量最多 ${MAX_BATCH_FILES} 张。`, `Batch input is limited to ${MAX_BATCH_FILES} images.`);
      return;
    }
    const selected = incoming.slice(0, append ? room : MAX_BATCH_FILES);
    const total = (append ? queue.reduce((sum, item) => sum + item.size, 0) : 0) + selected.reduce((sum, file) => sum + file.size, 0);
    if ((!append && incoming.length > MAX_BATCH_FILES) || selected.length + existingCount > MAX_BATCH_FILES || total > MAX_BATCH_BYTES) {
      error = t(`批量最多 ${MAX_BATCH_FILES} 张且总大小不超过 100 MB。`, `Batch input is limited to ${MAX_BATCH_FILES} images and 100 MB total.`);
      return;
    }
    const inheritSettings = append && queue.length > 0;
    const nextItems = [];
    for (const file of selected) {
      try {
        const { image, url } = await decodeFile(file);
        const itemShared = inheritSettings
          ? settingsFromActiveForNewItem(image.naturalWidth, image.naturalHeight)
          : null;
        nextItems.push(createQueueItem(file, image, url, itemShared));
      } catch (cause) {
        error = String(cause.message || cause);
      }
    }
    if (!nextItems.length) return;
    if (!append) {
      revokeQueueUrls();
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = "";
      resultBlob = null;
      batchResults = [];
      batchZip = null;
      batchNotice = "";
      queue = nextItems;
      applyItemToUi(nextItems[0]);
      return;
    }
    persistActive();
    queue = [...queue, ...nextItems];
    if (!activeId) applyItemToUi(nextItems[0]);
  }
  function onFile(event) {
    const files = [...(event.currentTarget.files || [])];
    event.currentTarget.value = "";
    // Multi-image queue: "Add images" appends. Single-image mode replaces.
    void acceptFiles(files, { append: hasQueue });
  }
  function onDrop(event) {
    event.preventDefault();
    dragging = false;
    void acceptFiles([...(event.dataTransfer?.files || [])], { append: hasQueue });
  }
  function onPaste(event) {
    const file = [...(event.clipboardData?.files || [])].find((item) => acceptedTypes.has(item.type));
    if (!file) return;
    event.preventDefault();
    void acceptFiles([file], { append: hasQueue });
  }
  function selectQueueItem(id) {
    if (!id || id === activeId || batchProcessing) return;
    persistActive();
    const item = queue.find((entry) => entry.id === id);
    if (item) applyItemToUi(item);
  }
  function removeQueueItem(id) {
    if (batchProcessing || queue.length <= 1) return;
    const index = queue.findIndex((item) => item.id === id);
    if (index < 0) return;
    const removed = queue[index];
    if (removed.url) URL.revokeObjectURL(removed.url);
    const next = queue.filter((item) => item.id !== id);
    queue = next;
    if (activeId === id) applyItemToUi(next[Math.min(index, next.length - 1)]);
  }
  function clearQueueKeepActive() {
    if (batchProcessing) return;
    persistActive();
    const active = queue.find((item) => item.id === activeId);
    if (!active) return;
    for (const item of queue) {
      if (item.id !== active.id && item.url) URL.revokeObjectURL(item.url);
    }
    queue = [active];
    batchResults = [];
    batchZip = null;
    batchNotice = "";
  }
  function clearAllImages() {
    if (batchProcessing) return;
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    processQueued = false;
    revokeQueueUrls();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    queue = [];
    activeId = "";
    sourceImage = null;
    sourceUrl = "";
    sourceName = "";
    sourceType = "";
    sourceSize = 0;
    sourceWidth = 0;
    sourceHeight = 0;
    cropX = 0; cropY = 0; cropWidth = 0; cropHeight = 0; cropRotation = 0;
    targetWidth = 0; targetHeight = 0;
    resultUrl = "";
    resultBlob = null;
    resultWidth = 0;
    resultHeight = 0;
    savedPath = "";
    error = "";
    batchResults = [];
    batchZip = null;
    batchNotice = "";
    imageLayout = { left: 0, top: 0, width: 0, height: 0, scale: 0 };
    previewPending = false;
  }
  function applyOutputToAll() {
    if (queue.length < 2) return;
    syncSettingsToQueue();
    const active = queue.find((item) => item.id === activeId);
    if (active) applyItemToUi(active, { clearResult: false });
    batchNotice = t(
      `已将当前页全部配置同步到 ${queue.length} 张图片`,
      `Synced all page settings to ${queue.length} images`,
    );
    schedulePreview(0);
  }
  async function exportAll() {
    if (queue.length < 2 || batchProcessing || processing || saving) return;
    syncSettingsToQueue();
    batchProcessing = true;
    batchResults = [];
    batchZip = null;
    batchNotice = "";
    error = "";
    if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
    processQueued = false;
    try {
      const results = [];
      const usedNames = new Set();
      for (const item of queue) {
        const rendered = await renderProcessed(item);
        const name = uniqueExportName(editedFileName(item.name, item.format), usedNames);
        results.push({
          name,
          blob: rendered.blob,
          mime: item.format,
          bytes: new Uint8Array(await rendered.blob.arrayBuffer()),
        });
      }
      batchResults = results.map(({ name, blob, mime }) => ({ name, blob, mime }));
      if (!results.length) {
        error = t("没有成功处理的图片。", "No images were processed successfully.");
        return;
      }
      const zipBytes = buildZipStore(results.map((item) => ({ name: item.name, bytes: item.bytes })));
      const zipBlob = new Blob([zipBytes], { type: "application/zip" });
      const zipName = `images-edited-${results.length}.zip`;
      batchZip = { blob: zipBlob, name: zipName, mime: "application/zip" };
      const saved = await saveBlob(zipBlob, zipName, "application/zip", t("导出全部图片", "Export all images"), true);
      if (saved?.cancelled) {
        batchNotice = t(`已处理 ${results.length} 张，已取消保存`, `Processed ${results.length} images; save cancelled`);
      } else if (saved?.path) {
        batchNotice = t(`已导出 ${results.length} 张到 ${saved.path}`, `Exported ${results.length} images to ${saved.path}`);
        savedPath = saved.path;
      } else {
        batchNotice = t(`已导出 ${results.length} 张（${zipName}）`, `Exported ${results.length} images (${zipName})`);
      }
    } catch (cause) {
      error = String(cause.message || cause);
    } finally {
      batchProcessing = false;
      schedulePreview(0);
    }
  }
  function uniqueExportName(name, used) {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const match = String(name).match(/^(.*?)(\.[^.]+)?$/);
    const stem = match?.[1] || "image";
    const ext = match?.[2] || "";
    let index = 2;
    let candidate = `${stem}-${index}${ext}`;
    while (used.has(candidate)) {
      index += 1;
      candidate = `${stem}-${index}${ext}`;
    }
    used.add(candidate);
    return candidate;
  }
  async function saveBlob(blob, fileName, mimeType, title, binary = false) {
    if (window.dbxPlugin?.invoke) {
      return invoke(
        "toolbox/save-file",
        {
          fileName,
          mimeType,
          data: await blobBase64(blob),
          title,
          binary: Boolean(binary),
          extension: binary ? String(fileName).split(".").pop() : undefined,
        },
        180000,
      );
    }
    triggerDownload(blob, fileName);
    return { cancelled: false, path: "", fileName };
  }
  async function downloadBatch() {
    if (batchZip?.blob) {
      try {
        const saved = await saveBlob(batchZip.blob, batchZip.name, batchZip.mime, t("导出全部图片", "Export all images"), true);
        if (saved?.path) {
          batchNotice = t(`已保存到 ${saved.path}`, `Saved to ${saved.path}`);
          savedPath = saved.path;
        }
      } catch (cause) {
        error = String(cause.message || cause);
      }
      return;
    }
    if (!batchResults.length) return;
    for (const [index, item] of batchResults.entries()) {
      setTimeout(() => triggerDownload(item.blob, item.name), index * 180);
    }
  }

  function updateImageLayout() {
    if (cropDragging) return;
    if (!cropStage || !sourcePreview || !sourceWidth || !sourceHeight) {
      imageLayout = { left: 0, top: 0, width: 0, height: 0, scale: 0 };
      stageSize = { width: 1, height: 1 };
      return;
    }
    const stageW = Math.max(1, cropStage.clientWidth);
    const stageH = Math.max(1, cropStage.clientHeight);
    stageSize = { width: stageW, height: stageH };
    const stageRect = cropStage.getBoundingClientRect();
    const imageRect = sourcePreview.getBoundingClientRect();
    // Absolute / SVG children are relative to the padding box; subtract border.
    const originLeft = stageRect.left + cropStage.clientLeft;
    const originTop = stageRect.top + cropStage.clientTop;
    if (!stageRect.width || !imageRect.width) {
      imageLayout = objectFitContainRect(stageW, stageH, sourceWidth, sourceHeight);
      return;
    }
    // Prefer the painted image box; force a single isotropic scale.
    const scale = Math.min(imageRect.width / sourceWidth, imageRect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    imageLayout = {
      left: imageRect.left - originLeft + (imageRect.width - width) / 2,
      top: imageRect.top - originTop + (imageRect.height - height) / 2,
      width,
      height,
      scale,
    };
  }
  function sourcePoint(event, allowOutside = false) {
    if (!cropStage || !sourceWidth || !sourceHeight || !imageLayout.scale) return null;
    const stageRect = cropStage.getBoundingClientRect();
    const { left, top, width, height, scale } = imageLayout;
    // Match imageLayout: pointer in padding-box coordinates.
    const localX = event.clientX - (stageRect.left + cropStage.clientLeft);
    const localY = event.clientY - (stageRect.top + cropStage.clientTop);
    const outside = localX < left || localX > left + width || localY < top || localY > top + height;
    const isHandle = event.target?.closest?.("[data-crop-handle]");
    if (outside && !cropDragging && !allowOutside && !isHandle) return null;
    const x = (localX - left) / scale;
    const y = (localY - top) / scale;
    if (allowOutside || (cropDragging && cropDragMode === "rotate")) return { x, y };
    return {
      x: Math.max(0, Math.min(sourceWidth, x)),
      y: Math.max(0, Math.min(sourceHeight, y)),
    };
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
    cropDragMode = handle || (selection && inside && !isFullCrop ? "move" : "new");
    cropDragMoved = false;
  }
  function moveCrop(event) {
    if (!cropDragging || !cropDragStart || !cropDragOrigin) return;
    cropMoveEvent = event;
    if (cropMoveRaf) return;
    cropMoveRaf = requestAnimationFrame(() => {
      cropMoveRaf = 0;
      const latest = cropMoveEvent;
      cropMoveEvent = null;
      if (latest) applyCropMove(latest);
    });
  }
  function applyCropMove(event) {
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
      cropX = Math.min(cropDragStart.x, point.x);
      cropY = Math.min(cropDragStart.y, point.y);
      cropWidth = Math.max(1, Math.abs(point.x - cropDragStart.x));
      cropHeight = Math.max(1, Math.abs(point.y - cropDragStart.y));
      cropRotation = 0;
      return;
    }
    if (cropDragMode === "move") {
      cropX = origin.x + dx;
      cropY = origin.y + dy;
      return;
    }
    const centerX = origin.x + origin.width / 2;
    const centerY = origin.y + origin.height / 2;
    const localPoint = rotatePoint(point, centerX, centerY, -origin.angle);
    const resized = resizeCropRect(origin, cropDragMode, localPoint.x - centerX, localPoint.y - centerY, sourceWidth, sourceHeight);
    cropX = resized.x;
    cropY = resized.y;
    cropWidth = resized.width;
    cropHeight = resized.height;
  }
  function finishCrop(event) {
    if (!cropDragging) return;
    if (cropMoveRaf) {
      cancelAnimationFrame(cropMoveRaf);
      cropMoveRaf = 0;
    }
    if (cropMoveEvent) {
      applyCropMove(cropMoveEvent);
      cropMoveEvent = null;
    }
    cropDragging = false;
    cropDragStart = null;
    cropDragOrigin = null;
    cropDragMode = "";
    cropDragMoved = false;
    event?.currentTarget?.releasePointerCapture?.(event.pointerId);
    commitCropFields();
    updateImageLayout();
  }
  function commitCropFields() {
    const next = sanitizeCropRect(
      sourceWidth,
      sourceHeight,
      { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
      cropRotation,
    );
    cropX = next.x;
    cropY = next.y;
    cropWidth = next.width;
    cropHeight = next.height;
    persistActive();
  }
  function setFullCrop() {
    cropX = 0; cropY = 0; cropWidth = sourceWidth; cropHeight = sourceHeight;
    targetWidth = sourceWidth; targetHeight = sourceHeight;
    persistActive();
  }
  function matchCropSize() { targetWidth = Math.max(1, Number(cropWidth) || 1); targetHeight = Math.max(1, Number(cropHeight) || 1); persistActive(); }
  function resetOptions() {
    setFullCrop();
    lockRatio = true;
    rotation = 0;
    cropRotation = 0;
    flipHorizontal = false;
    flipVertical = false;
    format = defaultFormatFor(sourceType);
    quality = 85;
    background = "#ffffff";
    watermark = "";
    watermarkSize = 32;
    watermarkOpacity = 70;
    watermarkColor = "#ffffff";
    watermarkPosition = "bottom-right";
    watermarkTiled = false;
    persistActive();
    applyImage();
  }
  function changeWidth(event) {
    targetWidth = event.currentTarget.value;
    if (lockRatio) targetHeight = fitDimension(targetWidth, cropWidth, cropHeight);
    persistActive();
  }
  function changeHeight(event) {
    targetHeight = event.currentTarget.value;
    if (lockRatio) targetWidth = fitDimension(targetHeight, cropHeight, cropWidth);
    persistActive();
  }
  function rotate(delta) { rotation = normalizeRotation(rotation + delta); persistActive(); }
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
  function editedFileName(name, mime) {
    const base = String(name || "image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "image";
    return `${base}-edited.${formatInfo(mime).extension}`;
  }
  /** Pure render from a queue item / UI snapshot — no shared processing lock. */
  async function renderProcessed(item) {
    const image = item.image;
    if (!image) throw new Error(t("图片尚未就绪。", "Image is not ready."));
    const sw = Math.max(1, Number(item.width) || image.naturalWidth || 1);
    const sh = Math.max(1, Number(item.height) || image.naturalHeight || 1);
    const crop = sanitizeCropRect(
      sw,
      sh,
      { x: item.cropX, y: item.cropY, width: item.cropWidth, height: item.cropHeight },
      item.cropRotation,
    );
    const target = normalizeOutputSize(item.targetWidth, item.targetHeight);
    const outputAngle = normalizeRotation(item.rotation);
    const output = rotatedSize(target.width, target.height, outputAngle);
    const mime = item.format || "image/png";
    const opaque = !resolveOutputFormat(mime).supportsAlpha;
    const canvas = document.createElement("canvas");
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext("2d", { alpha: !opaque });
    if (!context) throw new Error("Canvas is unavailable");
    if (opaque) {
      context.fillStyle = item.background || "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = target.width;
    cropCanvas.height = target.height;
    const cropContext = cropCanvas.getContext("2d");
    if (!cropContext) throw new Error("Canvas is unavailable");
    const cropAngle = normalizeAngle(item.cropRotation);
    cropContext.save();
    cropContext.translate(target.width / 2, target.height / 2);
    cropContext.scale(target.width / crop.width, target.height / crop.height);
    cropContext.rotate(-cropAngle * Math.PI / 180);
    cropContext.translate(-(crop.x + crop.width / 2), -(crop.y + crop.height / 2));
    cropContext.drawImage(image, 0, 0);
    cropContext.restore();
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(outputAngle * Math.PI / 180);
    context.scale(item.flipHorizontal ? -1 : 1, item.flipVertical ? -1 : 1);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(cropCanvas, -target.width / 2, -target.height / 2, target.width, target.height);
    context.restore();
    const mark = String(item.watermark || "").trim();
    if (mark) {
      const fontSize = Math.max(8, Math.min(256, Number(item.watermarkSize) || 32));
      context.save();
      context.font = `600 ${fontSize}px sans-serif`;
      context.textBaseline = "alphabetic";
      const textWidth = context.measureText(mark).width;
      context.globalAlpha = Math.max(0, Math.min(1, Number(item.watermarkOpacity) / 100));
      context.lineWidth = Math.max(2, fontSize / 12);
      context.strokeStyle = "rgba(0,0,0,.55)";
      context.fillStyle = item.watermarkColor || "#ffffff";
      if (item.watermarkTiled) {
        const gapX = Math.max(28, fontSize * 2.8);
        const gapY = Math.max(24, fontSize * 2.6);
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(-25 * Math.PI / 180);
        context.translate(-canvas.width / 2, -canvas.height / 2);
        for (let y = -canvas.height; y < canvas.height * 2; y += gapY) {
          for (let x = -canvas.width; x < canvas.width * 2; x += textWidth + gapX) {
            context.strokeText(mark, x, y);
            context.fillText(mark, x, y);
          }
        }
      } else {
        const point = watermarkCoordinates(canvas.width, canvas.height, textWidth, fontSize, item.watermarkPosition, Math.max(12, fontSize * 0.55));
        context.strokeText(mark, point.x, point.y);
        context.fillText(mark, point.x, point.y);
      }
      context.restore();
    }
    const qualityOn = resolveOutputFormat(mime).lossy;
    const blob = await encodeCanvasImage(canvas, mime, qualityOn ? Number(item.quality) / 100 : undefined);
    return { blob, width: canvas.width, height: canvas.height };
  }
  async function processImage() {
    if (!sourceImage || batchProcessing) return;
    if (processing) {
      processQueued = true;
      return;
    }
    processQueued = false;
    previewPending = false;
    processing = true; error = ""; savedPath = "";
    try {
      const rendered = await renderProcessed({
        image: sourceImage,
        width: sourceWidth,
        height: sourceHeight,
        name: sourceName,
        ...snapshotEdit(),
      });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultBlob = rendered.blob;
      resultUrl = URL.createObjectURL(rendered.blob);
      resultWidth = rendered.width;
      resultHeight = rendered.height;
    } catch (cause) { error = String(cause.message || cause); }
    finally {
      processing = false;
      if (processQueued && !batchProcessing) schedulePreview(0);
    }
  }
  function outputName() {
    return editedFileName(sourceName, format);
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
      <button class="dbx-btn" type="button" onclick={() => fileInput?.click()}>{hasQueue ? t("添加图片", "Add images") : t("更换图片", "Replace image")}</button>
      {#if hasSource}<button class="dbx-btn" type="button" onclick={clearAllImages} disabled={batchProcessing}>{t("清空全部", "Clear all")}</button>{/if}
      <button class="dbx-btn dbx-btn--primary" type="button" onclick={downloadResult} disabled={!resultBlob || processing || previewPending || saving || batchProcessing}>{saveLabel}</button>
      {#if hasQueue}
        <button class="dbx-btn" type="button" onclick={exportAll} disabled={batchProcessing || processing || saving}>{batchProcessing ? t("导出中…", "Exporting…") : t(`导出全部（${queue.length}）`, `Export all (${queue.length})`)}</button>
        <button class="dbx-btn" type="button" onclick={applyOutputToAll} disabled={batchProcessing}>{t("应用到全部", "Apply to all")}</button>
      {/if}
      {#if batchZip || batchResults.length}<button class="dbx-btn" type="button" onclick={downloadBatch} disabled={batchProcessing || saving}>{t("再次保存打包", "Save zip again")}</button>{/if}
      <span class="dbx-hint">{t("支持粘贴与多选。应用到全部会同步本页全部配置（裁剪按比例适配各图）；导出全部打包为 ZIP。", "Paste or multi-select. Apply-to-all syncs every setting on this page (crop scales per image); export all packs a ZIP.")}</span>
      {#if sourceType === "image/gif"}<span class="dbx-hint">{t("GIF 将按第一帧处理。", "Animated GIFs use the first frame.")}</span>{/if}
    </div>
  {/if}
  {#if hasQueue}
    <div class="queue-bar" role="list">
      <div class="queue-meta">
        <strong>{t("图片队列", "Image queue")}</strong>
        <span>{t(`${queue.length} 张 · 点击切换，每张独立裁剪`, `${queue.length} images · click to switch; crop per image`)}</span>
        <button class="link" type="button" onclick={clearQueueKeepActive} disabled={batchProcessing}>{t("仅保留当前", "Keep current only")}</button>
        <button class="link" type="button" onclick={clearAllImages} disabled={batchProcessing}>{t("清空全部", "Clear all")}</button>
      </div>
      <div class="queue-strip">
        {#each queue as item (item.id)}
          <div class="queue-item" class:active={item.id === activeId} role="listitem">
            <button class="queue-thumb" type="button" onclick={() => selectQueueItem(item.id)} disabled={batchProcessing} title={item.name}>
              <img src={item.url} alt="" />
              <span>{item.name}</span>
            </button>
            <button class="queue-remove" type="button" onclick={() => removeQueueItem(item.id)} disabled={batchProcessing || queue.length <= 1} aria-label={t("移除", "Remove")}>×</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if batchNotice}<div class="batch-results" aria-live="polite"><strong>{batchNotice}</strong></div>{/if}
  {#if batchResults.length}<div class="batch-results" aria-live="polite"><strong>{t("批量结果", "Batch results")}</strong>{#each batchResults as item}<span>{item.name}</span>{/each}</div>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if !hasSource}
    <div class="empty-state">
      <button class="dropzone" class:dragging ondragover={(event) => { event.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop} type="button" onclick={() => fileInput?.click()}>
        <span class="dropzone-icon" aria-hidden="true">↑</span>
        <strong>{t("开始处理图片", "Start with an image")}</strong>
        <span>{t("拖放图片到这里，或点击选择图片", "Drop an image here, or click to choose one")}</span>
        <span class="dropzone-action">{t("选择图片", "Choose image")}</span>
        <small>{t("支持 PNG、JPEG、WebP、GIF、AVIF、BMP，最大 30 MB；可多选组成队列", "PNG, JPEG, WebP, GIF, AVIF, BMP; up to 30 MB; multi-select builds a queue")}</small>
      </button>
    </div>
  {:else}
    <div class="workspace">
      <aside class="controls">
        <section><div class="section-title"><strong>{t("裁剪", "Crop")}</strong><button class="link" type="button" onclick={setFullCrop}>{t("使用整张图片", "Full image")}</button></div><div class="quad"><label>X<input class="dbx-input" type="number" value={Math.round(cropDragging && cropDragOrigin ? cropDragOrigin.x : cropX)} onchange={(event) => { cropX = Number(event.currentTarget.value); commitCropFields(); }} /></label><label>Y<input class="dbx-input" type="number" value={Math.round(cropDragging && cropDragOrigin ? cropDragOrigin.y : cropY)} onchange={(event) => { cropY = Number(event.currentTarget.value); commitCropFields(); }} /></label><label>{t("宽", "W")}<input class="dbx-input" type="number" min="1" max={MAX_IMAGE_SIDE} value={Math.round(cropDragging && cropDragOrigin ? cropDragOrigin.width : cropWidth)} onchange={(event) => { cropWidth = Number(event.currentTarget.value); commitCropFields(); }} /></label><label>{t("高", "H")}<input class="dbx-input" type="number" min="1" max={MAX_IMAGE_SIDE} value={Math.round(cropDragging && cropDragOrigin ? cropDragOrigin.height : cropHeight)} onchange={(event) => { cropHeight = Number(event.currentTarget.value); commitCropFields(); }} /></label></div><div class="crop-rotate-row"><span class="subtle">{t("裁剪框角度", "Crop angle")}：{Math.round(cropRotation)}° · {t("宽高可不限于图片，轴向随旋转", "Size may exceed image; axes follow rotation")}</span><div class="button-row"><button class="dbx-btn" type="button" onclick={() => { cropRotation = normalizeAngle(cropRotation - 15); persistActive(); }}>↶ 15°</button><button class="dbx-btn" type="button" onclick={() => { cropRotation = normalizeAngle(cropRotation + 15); persistActive(); }}>↷ 15°</button><button class="dbx-btn" type="button" onclick={() => { cropRotation = 0; persistActive(); }}>{t("归零", "Reset")}</button></div></div></section>
        <section><div class="section-title"><strong>{t("缩放", "Resize")}</strong><button class="link" type="button" onclick={matchCropSize}>{t("匹配裁剪尺寸", "Match crop")}</button></div><div class="pair"><label>{t("宽度", "Width")}<input class="dbx-input" type="number" min="1" max="12000" value={targetWidth} oninput={changeWidth} /></label><label>{t("高度", "Height")}<input class="dbx-input" type="number" min="1" max="12000" value={targetHeight} oninput={changeHeight} /></label></div><label class="check"><input type="checkbox" bind:checked={lockRatio} onchange={persistActive} /> {t("锁定宽高比", "Lock aspect ratio")}</label></section>
        <section><strong>{t("旋转与翻转", "Rotate and flip")}</strong><span class="subtle">{t("会作用于导出结果", "Applies to the exported result")}</span><div class="button-row"><button class="dbx-btn" type="button" onclick={() => rotate(-90)}>↶ 90°</button><button class="dbx-btn" type="button" onclick={() => rotate(90)}>↷ 90°</button><button class="dbx-btn" class:active={flipHorizontal} aria-pressed={flipHorizontal} type="button" onclick={() => { flipHorizontal = !flipHorizontal; persistActive(); }}>{t("水平翻转", "Flip H")}</button><button class="dbx-btn" class:active={flipVertical} aria-pressed={flipVertical} type="button" onclick={() => { flipVertical = !flipVertical; persistActive(); }}>{t("垂直翻转", "Flip V")}</button></div><span class="subtle">{t("当前旋转", "Rotation")}: {rotation}°</span></section>
        <section><strong>{t("水印", "Watermark")}</strong><label>{t("文字", "Text")}<input class="dbx-input" bind:value={watermark} onchange={persistActive} placeholder={t("留空则不添加", "Leave blank for none")} /></label><div class="pair"><label>{t("字号", "Size")}<input class="dbx-input" type="number" min="8" max="256" bind:value={watermarkSize} onchange={persistActive} /></label><label>{t("透明度", "Opacity")} · {watermarkOpacity}%<input class="range" type="range" min="0" max="100" bind:value={watermarkOpacity} onchange={persistActive} /></label></div><div class="pair"><label>{t("位置", "Position")}<Select bind:value={watermarkPosition} options={positions} onchange={persistActive} /></label><label>{t("颜色", "Color")}<input class="color-input" type="color" bind:value={watermarkColor} onchange={persistActive} /></label></div><label class="check"><input type="checkbox" bind:checked={watermarkTiled} onchange={persistActive} /> {t("平铺水印", "Tile watermark")}</label></section>
        <section><div class="section-title"><strong>{t("输出", "Output")}</strong><button class="link" type="button" onclick={resetOptions}>{t("重置参数", "Reset")}</button></div><label>{t("格式", "Format")}<Select bind:value={format} options={formats} onchange={persistActive} /></label>{#if qualityEnabled}<label>{t("质量", "Quality")} · {quality}%<input class="range" type="range" min="10" max="100" bind:value={quality} onchange={persistActive} /></label>{/if}{#if opaqueOutput}<label>{t("透明区域背景", "Transparency background")}<input class="color-input" type="color" bind:value={background} onchange={persistActive} /></label>{/if}</section>
      </aside>
      <main class="previews">
        <article><div class="preview-head"><strong>{t("原图", "Original")}</strong><span>{sourceWidth}×{sourceHeight} · {humanSize(sourceSize)}</span></div><div
          bind:this={cropStage}
          class="stage crop-stage"
          class:crop-active={cropDragging}
          role="application"
          aria-label={t("拖动选框移动，拖动边角调整大小，框外拖动重新框选；可旋转裁剪框", "Drag the frame to move, handles to resize, or drag outside to reselect; rotate the crop")}
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
          onload={updateImageLayout}
        />{#if cropOverlay}<svg
          class="crop-overlay"
          width={stageSize.width}
          height={stageSize.height}
          viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
          preserveAspectRatio="none"
          aria-label={t("裁剪选区，可拖动调整位置或边角调整大小", "Crop selection; drag to move or use the handles to resize")}
        >
          <defs>
            <mask id="crop-dim-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={stageSize.width} height={stageSize.height}>
              <rect width={stageSize.width} height={stageSize.height} fill="#fff" />
              <rect x={cropOverlay.ox} y={cropOverlay.oy} width={cropOverlay.rw} height={cropOverlay.rh} fill="#000" transform={cropOverlay.transform} />
            </mask>
          </defs>
          <rect class="crop-mask-fill" width={stageSize.width} height={stageSize.height} mask="url(#crop-dim-mask)" />
          <g transform={cropOverlay.transform}>
            <rect class="crop-selection" class:active={cropDragging} x={cropOverlay.ox} y={cropOverlay.oy} width={cropOverlay.rw} height={cropOverlay.rh} />
            {#each cropOverlay.handles as [id, hx, hy]}
              <circle class={`crop-handle crop-handle--${id}`} data-crop-handle={id} cx={hx} cy={hy} r="6" />
            {/each}
            <circle class="crop-rotate-handle" data-crop-handle="rotate" cx={cropOverlay.rotateHandle.x} cy={cropOverlay.rotateHandle.y} r="9" aria-label={t("旋转裁剪选区", "Rotate crop selection")} />
          </g>
        </svg>{/if}<span class="crop-hint">{t("拖动移动；边角调整大小；可旋转", "Drag to move; handles resize; rotate from handle")}</span></div></article>
        <article><div class="preview-head"><strong>{t("处理结果", "Result")}</strong>{#if resultBlob}<span>{resultWidth}×{resultHeight} · {humanSize(resultBlob.size)}</span>{/if}</div><div class="stage checker">{#if resultUrl}<img src={resultUrl} alt={t("处理结果预览", "Processed image preview")} />{:else}<span>{t("等待自动预览…", "Waiting for auto preview…")}</span>{/if}</div>{#if savedPath}<p class="saved">{t("已保存：", "Saved: ")}{savedPath}</p>{/if}</article>
      </main>
    </div>
  {/if}
</div>

<style>
  .page { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 10px; }
  .topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 10px; background: color-mix(in srgb, var(--color-card) 94%, var(--color-muted)); }.topbar .dbx-hint { margin-left: auto; max-width: min(52ch, 48%); text-align: right; line-height: 1.35; }.topbar .dbx-hint + .dbx-hint { margin-left: 0; }
  .file-input { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .error { margin: 0; padding: 8px 10px; border-radius: 6px; color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 9%, transparent); font-size: 12px; }
  .batch-results { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 7px 9px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 11px; }.batch-results strong { color: var(--color-foreground); }.batch-results span { overflow-wrap: anywhere; }
  .queue-bar { display: flex; flex-direction: column; gap: 8px; padding: 9px 10px; border: 1px solid color-mix(in srgb, var(--color-primary) 28%, var(--color-border)); border-radius: 10px; background: color-mix(in srgb, var(--color-primary) 6%, var(--color-card)); }
  .queue-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }.queue-meta strong { color: var(--color-foreground); font-size: 12px; }.queue-meta span { color: var(--color-muted-foreground); font-size: 11px; }
  .queue-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
  .queue-item { position: relative; flex: 0 0 auto; }
  .queue-thumb { display: grid; gap: 4px; width: 88px; margin: 0; padding: 4px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-card); color: inherit; cursor: pointer; font: inherit; text-align: left; }
  .queue-thumb img { display: block; width: 100%; height: 56px; object-fit: cover; border-radius: 5px; background: var(--color-muted); }
  .queue-thumb span { overflow: hidden; color: var(--color-muted-foreground); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .queue-item.active .queue-thumb { border-color: var(--color-primary); box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary) 40%, transparent); }
  .queue-remove { position: absolute; top: -6px; right: -6px; width: 18px; height: 18px; margin: 0; padding: 0; border: 1px solid var(--color-border); border-radius: 50%; background: var(--color-card); color: var(--color-muted-foreground); cursor: pointer; font-size: 12px; line-height: 16px; }
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
  .stage { display: grid; width: 100%; height: clamp(360px, 66vh, 720px); min-height: 0; place-items: center; overflow: hidden; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 12px; }.checker { background-color: var(--color-background); background-image: linear-gradient(45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(-45deg, var(--color-muted) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--color-muted) 75%), linear-gradient(-45deg, transparent 75%, var(--color-muted) 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }.stage img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }.stage.crop-stage { position: relative; overflow: hidden; cursor: crosshair; touch-action: none; user-select: none; }.crop-stage > img { position: relative; z-index: 0; cursor: crosshair; }
  .crop-overlay { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  .crop-mask-fill { fill: color-mix(in srgb, #000 34%, transparent); pointer-events: none; }
  .crop-selection { fill: color-mix(in srgb, var(--color-primary) 12%, transparent); stroke: var(--color-primary); stroke-width: 2; pointer-events: auto; cursor: move; }
  .crop-selection.active { fill: color-mix(in srgb, var(--color-primary) 18%, transparent); }
  .crop-handle { fill: var(--color-primary); stroke: var(--color-background); stroke-width: 2; pointer-events: auto; }
  .crop-handle--nw, .crop-handle--se { cursor: nwse-resize; }.crop-handle--ne, .crop-handle--sw { cursor: nesw-resize; }
  .crop-handle--n, .crop-handle--s { cursor: ns-resize; }.crop-handle--e, .crop-handle--w { cursor: ew-resize; }
  .crop-rotate-handle { fill: var(--color-primary); stroke: var(--color-background); stroke-width: 2; pointer-events: auto; cursor: grab; }
  .crop-rotate-handle:active { cursor: grabbing; }
  .crop-hint { position: absolute; right: 8px; bottom: 7px; z-index: 2; padding: 3px 6px; border-radius: 4px; background: color-mix(in srgb, var(--color-background) 82%, transparent); color: var(--color-muted-foreground); font-size: 10px; pointer-events: none; }.saved { margin: 0; color: var(--color-muted-foreground); font-size: 11px; overflow-wrap: anywhere; }
  @media (max-width: 900px) { .workspace { grid-template-columns: 1fr; overflow: auto; }.controls { overflow: visible; }.previews { min-height: 500px; } }
  @media (max-width: 620px) { .previews { grid-template-columns: 1fr; }.topbar .dbx-hint { width: 100%; margin-left: 0; }.empty-state { padding: 14px; }.dropzone { min-height: 230px; padding: 26px 16px; } }
</style>
