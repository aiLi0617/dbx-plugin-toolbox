<script>
  import { onDestroy, untrack } from "svelte";
  import { createTaskScope, taskAbortError } from "./taskManager.js";
  import Worker from "./gifEditorWorker.js?worker&inline";
  import { pick, localizeError } from "./i18n.js";
  import Select from "./Select.svelte";
  import CropSelection from "./CropSelection.svelte";
  import { saveBlobThroughHost } from "./fileSave.js";
  import { validateGifOptions } from "./gifEditorOptions.js";
  let { toolId, locale = "zh-CN", onStateChange, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const taskScope = createTaskScope(untrack(() => toolId), "gif");
  let worker, timeout, pending;
  let workerLoaded = false;
  let taskProgress = $state(null);
  let disposed = false;
  function dismissCropHelp(node) {
    const outside = (event) => {
      if (node.open && !event.composedPath().includes(node)) node.open = false;
    };
    const escape = (event) => {
      if (!node.open || event.key !== "Escape") return;
      node.open = false;
      event.preventDefault();
      event.stopPropagation();
      node.querySelector("summary")?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return { destroy() {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
    } };
  }
  let file = $state(null),
    width = $state(0),
    height = $state(0),
    repeat = $state(0),
    frames = $state([]),
    colors = $state(128),
    step = $state(1),
    x = $state(0),
    y = $state(0),
    cropWidth = $state(1),
    cropHeight = $state(1),
    selected = $state(0),
    canvas = $state(null),
    blob = $state(null),
    url = $state(""),
    originalUrl = $state(""),
    busy = $state(false),
    error = $state("");
  let savedBlob = $state(null);
  let firstFrame = $state("");
  let draggedFrame = $state(null), dropTarget = $state(null);
  let sourceWidth = $state(0), sourceHeight = $state(0);
  let lockRatio = $state(true);
  let previewMode = $state("fit"), previewResult = $state(false);
  const outputWidth = $derived(toolId === "gif-crop" ? cropWidth : width);
  const outputHeight = $derived(toolId === "gif-crop" ? cropHeight : height);
  const validation = $derived(file ? validateGifOptions({
    width: outputWidth, height: outputHeight, colors, repeat, step,
    frames, sourceWidth, sourceHeight,
    crop: toolId === "gif-crop" ? { x, y } : null,
  }) : null);
  const validationMessage = $derived.by(() => {
    switch (validation?.code) {
      case "dimensions": return t("宽度和高度须为 1–4096 的整数", "Width and height must be integers from 1 to 4096");
      case "crop": return t("裁剪区域不能超出原图", "Crop area must stay inside the source image");
      case "colors": return t("颜色数量须为 2–256 的整数", "Colors must be an integer from 2 to 256");
      case "repeat": return t("循环次数须为 -1–65535 的整数", "Repeat must be an integer from -1 to 65535");
      case "step": return t("抽帧间隔须为 1–300 的整数", "Frame interval must be an integer from 1 to 300");
      case "pixels": return t("总帧像素超过 2400 万，请减小输出尺寸", "Total frame pixels exceed 24 million; reduce output dimensions");
      case "delays": return t("单帧或合并后的时长不能超过 655350 毫秒", "Individual or combined frame duration must not exceed 655350 ms");
      default: return "";
    }
  });
  const formatSize = (bytes) => bytes < 1000 ? bytes + " B" : bytes < 1_000_000 ? (bytes / 1000).toFixed(1) + " KB" : (bytes / 1_000_000).toFixed(2) + " MB";
  function resizeDimension(axis, value) {
    const next = value === "" ? undefined : Number(value);
    if (axis === "width") width = next; else height = next;
    if (lockRatio && Number.isInteger(next) && next > 0 && sourceWidth && sourceHeight) {
      if (axis === "width") height = Math.max(1, Math.round(next * sourceHeight / sourceWidth));
      else width = Math.max(1, Math.round(next * sourceWidth / sourceHeight));
    }
    invalidate();
  }
  function resetDimensions() {
    width = sourceWidth; height = sourceHeight; invalidate();
  }
  function scaleDimensions(scale) {
    width = Math.max(1, Math.round(sourceWidth * scale));
    height = Math.max(1, Math.round(sourceHeight * scale));
    invalidate();
  }
  $effect(() => { onStateChange?.({ busy, dirty: !!file && (!blob || blob !== savedBlob), hasUnsavedResult: !!blob && blob !== savedBlob, export: blob ? save : null, retry: null }); });
  function stop(cause = taskAbortError()) {
    workerLoaded = false;
    clearTimeout(timeout);
    worker?.terminate();
    pending?.reject(cause);
    pending = null;
    worker = null;
  }
  onDestroy(() => {
    disposed = true;
    taskScope.dispose();
    stop();
    if (url) URL.revokeObjectURL(url);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
  });
  function requestCore(message, onProgress) {
    if (pending) return Promise.reject(new Error("A task is already running"));
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      timeout = setTimeout(() => {
        stop(new Error("Processing timed out; reimport a smaller file"));
        error = t(
          "处理超时，请重新导入较小文件",
          "Processing timed out; reimport a smaller file",
        );
        busy = false;
      }, 60_000);
      worker.onmessage = ({ data }) => {
        if (data.progress) { onProgress(data.progress); return; }
        clearTimeout(timeout);
        const task = pending;
        pending = null;
        if (!task) return;
        if (data.error) task.reject(new Error(data.error));
        else task.resolve(data);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        const task = pending;
        pending = null;
        task?.reject(new Error("GIF worker failed"));
        stop();
      };
      try { worker.postMessage(message); }
      catch (error) { clearTimeout(timeout); pending = null; reject(error); }
    });
  }
  function request(message) {
    return taskScope.run(async (task) => {
      const stopWorker = () => stop();
      task.signal.addEventListener("abort", stopWorker, { once: true });
      const update = (value) => { taskProgress = value.progress; task.update(value); };
      try {
        task.check();
        if (!worker) worker = new Worker();
        if (message.action !== "load" && !workerLoaded) {
          const buffer = await file.arrayBuffer();
          task.check();
          await requestCore({ action: "load", buffer }, update);
          workerLoaded = true;
        }
        const result = await requestCore(message, update);
        task.check();
        if (message.action === "load") workerLoaded = true;
        return result;
      } finally { task.signal.removeEventListener("abort", stopWorker); }
    }, message.action === "load" ? "decode" : "encode");
  }
  function invalidate() {
    previewResult = false;
    error = "";
    blob = null;
    if (url) URL.revokeObjectURL(url);
    url = "";
  }
  async function load(event) {
    stop();
    invalidate();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = "";
    firstFrame = "";
    frames = [];
    draggedFrame = null; dropTarget = null;
    error = "";
    file = null;
    const next = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!next) return;
    if (next.size > 30_000_000) {
      error = t("文件不能超过 30 MB", "File must not exceed 30 MB");
      return;
    }
    taskProgress = null;
    busy = true;
    try {
      const result = await request({
        action: "load",
        buffer: await next.arrayBuffer(),
        includeThumbnails: toolId === "gif-frames",
      });
      if (disposed) return;
      file = next;
      width = result.width;
      height = result.height;
      sourceWidth = result.width; sourceHeight = result.height;
      lockRatio = true; colors = 128; step = 1;
      previewMode = "fit";
      x = 0;
      y = 0;
      cropWidth = width;
      cropHeight = height;
      repeat = result.repeat;
      frames = result.delays.map((delay, index) => ({ index, delay,
        thumbnail: result.thumbnails ? {
          width: result.thumbnails.width, height: result.thumbnails.height,
          data: result.thumbnails.frames[index],
        } : null,
      }));
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      originalUrl = URL.createObjectURL(next);
      if (toolId === "gif-crop") {
        const frame = await request({action:"frame",index:0});
        if (disposed) return;
        const preview = document.createElement("canvas");
        preview.width = frame.width; preview.height = frame.height;
        preview.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(frame.frame),frame.width,frame.height),0,0);
        firstFrame = preview.toDataURL("image/png");
      }
    } catch (e) {
      if (!disposed && e?.name !== "AbortError") error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  function moveTo(from, to) {
    if (busy || from === to || from < 0 || to < 0 || from >= frames.length || to >= frames.length) return;
    const selectedFrame = frames[Number(selected)];
    const next = [...frames];
    next.splice(to, 0, next.splice(from, 1)[0]);
    frames = next;
    selected = Math.max(0, next.findIndex((frame) => frame.index === selectedFrame?.index));
    invalidate();
  }
  function drawThumbnail(node, thumbnail) {
    if (!thumbnail) return;
    node.width = thumbnail.width; node.height = thumbnail.height;
    node.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(thumbnail.data), thumbnail.width, thumbnail.height), 0, 0);
  }
  function startDrag(event, index) {
    if (busy) { event.preventDefault(); return; }
    draggedFrame = index;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.setDragImage(event.currentTarget.closest(".frame-row"), 32, 24);
  }
  function endDrag() { draggedFrame = null; dropTarget = null; }
  function dragOver(event, index) {
    if (busy || draggedFrame === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    dropTarget = index + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
    const list = event.currentTarget.closest(".frame-list");
    const viewport = list.getBoundingClientRect();
    if (event.clientY < viewport.top + 36) list.scrollTop -= 16;
    else if (event.clientY > viewport.bottom - 36) list.scrollTop += 16;
  }
  function dropFrame(event) {
    if (draggedFrame === null || dropTarget === null) return;
    event.preventDefault();
    moveTo(draggedFrame, dropTarget > draggedFrame ? dropTarget - 1 : dropTarget);
    endDrag();
  }
  async function run() {
    if (!file || busy) return;
    if (validation) { error = validationMessage; return; }
    busy = true;
    error = "";
    invalidate();
    taskProgress = null;
    try {
      const options = {
        indices: frames.map((f) => f.index),
        delays: frames.map((f) => Number(f.delay)),
        repeat: Number(repeat),
        width: Number(width),
        height: Number(height),
        step: Number(step),
      };
      if (toolId === "gif-crop") {
        options.crop = {
          x: Number(x),
          y: Number(y),
          width: Number(cropWidth),
          height: Number(cropHeight),
        };
        options.width = Number(cropWidth);
        options.height = Number(cropHeight);
      }
      const result = await request({
        action: "encode",
        options,
        colors: Number(colors),
      });
      if (!disposed) {
        blob = new Blob([result.output], { type: "image/gif" });
        url = URL.createObjectURL(blob);
        previewResult = true;
      }
    } catch (e) {
      if (!disposed && e?.name !== "AbortError") error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  async function extract() {
    if (busy) return;
    busy = true;
    try {
      const result = await request({
        action: "frame",
        index: frames[Number(selected)]?.index,
      });
      if (disposed) return;
      canvas.width = result.width;
      canvas.height = result.height;
      canvas
        .getContext("2d")
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(result.frame),
            result.width,
            result.height,
          ),
          0,
          0,
        );
      const png = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (png && !disposed)
        await saveBlobThroughHost(png, { fileName: "frame.png", binary: true });
    } catch (e) {
      if (!disposed && e?.name !== "AbortError") error = localizeError(locale, e);
    } finally {
      busy = false;
    }
  }
  async function save() {
    try {
      const value = blob; const result = await saveBlobThroughHost(value, { fileName: "edited.gif", binary: true });
      if (result?.cancelled) return false; savedBlob = value; onStateChange?.({dirty:false,hasUnsavedResult:false}); return true;
    } catch (e) {
      error = localizeError(locale, e); return false;
    }
  }
  function example() {
    const bytes = Uint8Array.from(
      atob(
        "R0lGODlhEAAQAPAAAAAAAP9GKCH/C05FVFNDQVBFMi4wAwECAAAh+QQJCAAAACwAAAAAEAAQAAAILAABCBxIsKDBgwgTKkwYoKFDhQ4fMowYACJFixExSkRIseLEjAtDihxJEmFAACH5BAkRAAAALAAAAAAQABAAgAAAAP94KAgsAAEIHEiwoMGDCBMqXAgggMOHCh9CTCjRYcSKFyVmnIiwYoCNFhmKHEmyZEAAIfkECRkAAAAsAAAAABAAEACAAAAA/6ooCCwAAQgcSLCgwYMIEypcSDCAw4cKH0JMKNFhxIoXJWaciLBigI0WGYocSVJkQAA7",
      ),
      (c) => c.charCodeAt(0),
    );
    void load({
      currentTarget: {
        files: [new File([bytes], "sample.gif", { type: "image/gif" })],
        value: "",
      },
    });
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    example();
  });
</script>

<div class="expansion-page gif-editor">
  <div class="import-bar">
    <label class="dbx-btn import-button">
      {file ? t("更换 GIF", "Replace GIF") : t("导入 GIF", "Import GIF")}
      <input type="file" accept="image/gif" onchange={load} disabled={busy} aria-label={t("导入 GIF", "Import GIF")} />
    </label>
    <span class="file-name" title={file?.name}>{file?.name || t("选择需要处理的 GIF 动图", "Choose a GIF to edit")}</span>
    {#if file}<span class="source-size">{formatSize(file.size)}</span>{/if}
  </div>
  <p class="limits">{t("最多 30 MB、300 帧、总计 2400 万像素。", "Up to 30 MB, 300 frames, and 24 million total pixels.")}</p>
  {#if !file}
    <div class="empty-state">
      <span class="file-badge" aria-hidden="true">GIF</span>
      <strong>{busy ? t("正在读取动图…", "Loading animation…") : t("从一张 GIF 开始", "Start with a GIF")}</strong>
      <p>{t("导入后可预览动图、调整参数并保存结果", "Import an animation to preview, adjust options, and save the result")}</p>
    </div>
    {#if busy}<div class="expansion-actions"><progress max="1" value={taskProgress ?? undefined} aria-label={t("处理中…", "Working…")}></progress><button class="dbx-btn" type="button" onclick={() => taskScope.cancel()}>{t("取消", "Cancel")}</button></div>{/if}
  {:else}
    <div class="editor-grid">
      <section class="preview-column" aria-label={t("动图预览", "Animation preview")}>
        <div class="preview-card">
          <div class="card-heading">
            <div class="segmented" role="group" aria-label={t("预览内容", "Preview content")}>
              <button type="button" aria-pressed={!previewResult} onclick={() => previewResult = false}>{t("原图", "Original")}</button>
              <button type="button" aria-pressed={previewResult} disabled={!url} onclick={() => previewResult = true}>{t("处理结果", "Result")}</button>
            </div>
            <span>{previewResult ? outputWidth : sourceWidth} × {previewResult ? outputHeight : sourceHeight} px · {previewResult ? Math.ceil(frames.length / step) : frames.length} {t("帧", "frames")}</span>
          </div>
          <div class="preview-stage" class:actual-size={previewMode === "actual"}>
            {#if toolId === "gif-crop" && firstFrame && !previewResult}
              <CropSelection src={firstFrame} {width} {height} {locale} bind:x bind:y bind:cropWidth bind:cropHeight onchange={invalidate} disabled={busy} />
            {:else}<img src={previewResult ? url : originalUrl} alt={previewResult ? t("处理结果", "Result") : t("原图", "Original")} class="preview" class:pixelated={(previewResult ? outputWidth : sourceWidth) < 64} />{/if}
          </div>
          <div class="preview-footer">
            {#if toolId !== "gif-crop" || previewResult}<div class="segmented" role="group" aria-label={t("预览缩放", "Preview zoom")}>
              <button type="button" aria-pressed={previewMode === "fit"} onclick={() => previewMode = "fit"}>{t("适应窗口", "Fit to window")}</button>
              <button type="button" aria-pressed={previewMode === "actual"} onclick={() => previewMode = "actual"}>{t("实际大小", "Actual size")}</button>
            </div>{/if}
            {#if toolId === "gif-crop" && !previewResult}
              <span class="crop-tip">{cropWidth === width && cropHeight === height ? t("先缩小选框，再拖动移动", "Shrink the selection before moving it") : t("拖动选框移动 · 右下角调整大小", "Drag to move · bottom-right handle to resize")}</span>
              <details class="crop-help" use:dismissCropHelp>
                <summary>{t("操作帮助", "Controls")}</summary>
                <div class="crop-help-panel">
                  <strong>{t("裁剪操作", "Crop controls")}</strong>
                  <p>{t("拖动选框移动，拖动右下角调整大小。", "Drag the selection to move; drag the bottom-right handle to resize.")}</p>
                  <p>{t("点击选框或用 Tab 聚焦后：", "Click the selection or focus it with Tab:")}</p>
                  <dl>
                    <div><dt><kbd>↑ ↓ ← →</kbd></dt><dd>{t("移动 1 像素", "Move 1 pixel")}</dd></div>
                    <div><dt><kbd>Alt</kbd> + <kbd>↑ ↓ ← →</kbd></dt><dd>{t("调整大小", "Resize")}</dd></div>
                    <div><dt><kbd>Shift</kbd></dt><dd>{t("步长改为 10 像素", "Use a 10-pixel step")}</dd></div>
                  </dl>
                  <p>{t("坐标与步长均以原图像素为单位。", "Coordinates and steps use source-image pixels.")}</p>
                </div>
              </details>
            {:else}<span>{t("缩放仅影响预览", "Zoom affects preview only")}</span>{/if}
          </div>
          {#if url}
            <div class="result-summary" role="status">
              <span>{formatSize(file.size)} → {formatSize(blob.size)}</span>
              <strong>{blob.size < file.size ? t("体积减少", "Size reduced by") + " " + ((1 - blob.size / file.size) * 100).toFixed(1) + "%" : t("体积未减小", "Size did not decrease")}</strong>
            </div>
          {/if}
        </div>
        {#if file.size < 1024 && toolId === "gif-compress"}<p class="small-file-note">{t("文件已小于 1 KB，重新编码后可能变大。", "This file is already under 1 KB; re-encoding may increase its size.")}</p>{/if}
        {#if toolId === "gif-frames"}
          <section class="frames-card" aria-label={t("帧编辑", "Frame editor")}>
            <div class="card-heading">
              <strong>{t("帧编辑", "Frame editor")}</strong>
              <span>{frames.length} {t("帧", "frames")} · {t("帧时长（毫秒）", "Frame duration (ms)")}</span>
            </div>
            <p class="frame-help">{t("拖动手柄调整帧顺序", "Drag the handle to reorder frames")}</p>
            <fieldset class="frame-controls" disabled={busy}>
              <ol class="frame-list" aria-label={t("帧编辑", "Frame editor")}>
                {#each frames as frame, i (frame.index)}
                  <li class="frame-row" class:drag-source={draggedFrame === i} class:drop-before={dropTarget === i} class:drop-after={i === frames.length - 1 && dropTarget === frames.length}
                    ondragover={(event) => dragOver(event, i)} ondrop={dropFrame}>
                    <button type="button" class="drag-handle" draggable={!busy} disabled={busy}
                      aria-label={`${t("拖动手柄调整帧顺序", "Drag the handle to reorder frames")} ${i + 1}`}
                      ondragstart={(event) => startDrag(event, i)} ondragend={endDrag}>⠿</button>
                    <span class="frame-number">{i + 1}</span>
                    <span role="img" aria-label={`${t("帧", "frames")} ${i + 1}`}><canvas class="frame-thumbnail" use:drawThumbnail={frame.thumbnail} aria-hidden="true"></canvas></span>
                    <input class="dbx-input delay" type="number" min="0" max="655350" bind:value={frame.delay} oninput={invalidate}
                      aria-label={`${t("帧", "frames")} ${i + 1} · ${t("帧时长（毫秒）", "Frame duration (ms)")}`} />
                    <span class="delay-unit" aria-hidden="true">ms</span>
                    <button class="dbx-btn frame-delete" type="button" disabled={frames.length < 2} aria-label={`${t("删除", "Delete")} ${i + 1}`} title={t("删除", "Delete")}
                      onclick={() => {
                        frames = frames.filter((_, j) => i !== j);
                        selected = 0;
                        invalidate();
                      }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button>
                  </li>
                {/each}
              </ol>
              <div class="frame-export">
                <label>{t("提取帧", "Extract frame")}<Select bind:value={selected} ariaLabel={t("提取帧", "Extract frame")} options={frames.map((_, i) => ({value:i,label:String(i + 1)}))} /></label>
                <button type="button" class="dbx-btn" onclick={extract} disabled={busy}>{t("导出 PNG", "Export PNG")}</button>
              </div>
            </fieldset>
            <canvas bind:this={canvas} hidden></canvas>
          </section>
        {/if}
      </section>
      <section class="settings-card" aria-label={t("输出设置", "Output settings")}>
        <div class="card-heading"><strong>{t("输出设置", "Output settings")}</strong><span>GIF</span></div>
        <fieldset class="settings-fields" disabled={busy}>
          <div class="section-label full">{t("尺寸", "Dimensions")} <span>px · 1–4096</span></div>
    {#if toolId === "gif-crop"}<label
        >X<input
          class="dbx-input"
          required
          type="number"
          min="0"
          bind:value={x}
          oninput={invalidate}
        /></label
      ><label
        >Y<input
          class="dbx-input"
          required
          type="number"
          min="0"
          bind:value={y}
          oninput={invalidate}
        /></label
      ><label
        >{t("裁剪宽度", "Crop width")}<input
          class="dbx-input"
          required
          type="number"
          min="1"
          bind:value={cropWidth}
          oninput={invalidate}
        /></label
      ><label
        >{t("裁剪高度", "Crop height")}<input
          class="dbx-input"
          required
          type="number"
          min="1"
          bind:value={cropHeight}
          oninput={invalidate}
        /></label
      >
    {:else}<label
        >{t("宽度", "Width")}<input
          class="dbx-input"
          required
          type="number"
          min="1"
          max="4096"
          aria-invalid={validation?.fields.includes("width") || undefined}
          aria-describedby={validation ? "gif-options-error" : undefined}
          value={width}
          oninput={(event) => resizeDimension("width", event.currentTarget.value)}
        /></label
      ><label
        >{t("高度", "Height")}<input
          class="dbx-input"
          required
          type="number"
          min="1"
          max="4096"
          aria-invalid={validation?.fields.includes("height") || undefined}
          aria-describedby={validation ? "gif-options-error" : undefined}
          value={height}
          oninput={(event) => resizeDimension("height", event.currentTarget.value)}
        /></label
      >
      <div class="dimension-actions full">
        <label class="check"><input type="checkbox" bind:checked={lockRatio} onchange={() => { if (lockRatio) resizeDimension("width", width); }} />{t("锁定原图比例", "Lock source aspect ratio")}</label>
        <button class="dbx-btn" type="button" onclick={resetDimensions}>{t("原始尺寸", "Original size")}</button>
      </div>
      <div class="size-presets full" role="group" aria-label={t("尺寸预设", "Size presets")}>
        {#each [1, 0.75, 0.5, 0.25] as scale}<button type="button" class="dbx-btn" aria-pressed={width === Math.max(1, Math.round(sourceWidth * scale)) && height === Math.max(1, Math.round(sourceHeight * scale))} onclick={() => scaleDimensions(scale)}>{scale * 100}%</button>{/each}
      </div>{/if}
      <div class="section-label full">{t("画质与播放", "Quality and playback")}</div>
    <label
      >{t("颜色数量", "Colors")}<input
        class="dbx-input"
          required
        type="number"
        min="2"
        max="256"
        aria-invalid={validation?.fields.includes("colors") || undefined}
        aria-describedby={validation ? "gif-options-error" : undefined}
        bind:value={colors}
        oninput={invalidate}
      /></label
    ><label
      >{t("循环次数", "Repeat count")}<input
        class="dbx-input"
          required
        type="number"
        min="-1"
        max="65535"
        aria-invalid={validation?.fields.includes("repeat") || undefined}
        aria-describedby={validation ? "gif-options-error" : undefined}
        bind:value={repeat}
        oninput={invalidate}
      /></label
    >
    <p class="full field-help">{t("循环：-1 为单次，0 为无限循环", "Repeat: -1 plays once; 0 loops forever")}</p>
    {#if toolId === "gif-compress"}<label class="full"
        >{t("抽帧间隔", "Frame interval")}<input
          class="dbx-input"
          required
          type="number"
          min="1"
          max="300"
          aria-invalid={validation?.fields.includes("step") || undefined}
          aria-describedby={validation ? "gif-options-error" : undefined}
          bind:value={step}
          oninput={invalidate}
        /></label
      >{/if}
        {#if toolId === "gif-compress"}<p class="full hint">{t("减少尺寸、颜色或帧数可缩小体积；抽帧会合并时长，保持播放总时长。", "Reduce dimensions, colors, or frames for a smaller file. Skipped frame delays are combined to preserve duration.")}</p>{/if}
        </fieldset>
        {#if validation}<p class="validation-error" id="gif-options-error" role="status">{validationMessage}</p>{:else}<div class="output-estimate">{t("输出", "Output")}: {outputWidth} × {outputHeight} px · {Math.ceil(frames.length / step)} {t("帧", "frames")}</div>{/if}
        <div class="output-actions">
          <button class="dbx-btn dbx-btn--primary" type="button" onclick={run} disabled={busy || !!validation}>{busy ? t("处理中…", "Working…") : t("生成 GIF", "Generate GIF")}</button>
          {#if url}<button class="dbx-btn" type="button" onclick={save}>{t("保存 GIF", "Save GIF")}</button>{/if}
          {#if busy}<button class="dbx-btn" type="button" onclick={() => taskScope.cancel()}>{t("取消", "Cancel")}</button>{/if}
        </div>
        {#if busy}<progress max="1" value={taskProgress ?? undefined} aria-label={t("处理中…", "Working…")}></progress>{/if}
      </section>
    </div>
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .gif-editor { flex: 1; max-width: 1200px; gap: 12px; }
  .import-bar { display: flex; align-items: center; gap: 12px; min-width: 0; flex-shrink: 0; }
  .import-button { position: relative; overflow: hidden; flex: none; cursor: pointer; }
  .import-button:has(input:focus-visible) { box-shadow: var(--dbx-focus-ring); }
  .import-button input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .source-size { margin-left: auto; white-space: nowrap; font-size: 12px; color: var(--color-muted-foreground); }
  .limits { margin: 0; }
  .editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(340px, 380px); align-items: start; gap: 16px; }
  .preview-column { display: grid; gap: 16px; min-width: 0; }
  .preview-card, .settings-card, .frames-card { min-width: 0; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card); overflow: hidden; }
  .card-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--color-border); font-size: 13px; }
  .card-heading span { font-size: 12px; color: var(--color-muted-foreground); }
  .preview-stage { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 312px; padding: 16px; overflow: auto; background-color: var(--color-background); background-image: conic-gradient(var(--color-muted) 25%, transparent 0 50%, var(--color-muted) 0 75%, transparent 0); background-size: 16px 16px; }
  .preview { display: block; width: 100%; height: 280px; object-fit: contain; }
  .preview.pixelated { image-rendering: pixelated; }
  .actual-size .preview { flex: none; width: auto; height: auto; max-width: none; max-height: none; margin: auto; }
  .preview-stage.actual-size { height: 312px; justify-content: flex-start; align-items: start; }
  .preview-footer { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--color-border); font-size: 11px; color: var(--color-muted-foreground); }
  .crop-tip { flex: 1; min-width: 0; }
  .crop-help { position: relative; flex: none; }
  .crop-help summary { cursor: pointer; color: var(--color-primary); padding: 4px 0; }
  .crop-help summary:focus-visible { outline: none; box-shadow: var(--dbx-focus-ring); border-radius: 3px; }
  .crop-help-panel { position: absolute; bottom: calc(100% + 8px); right: 0; z-index: 5; width: min(300px, calc(100cqw - 64px)); max-height: 260px; overflow: auto; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-popover, var(--color-background)); color: var(--color-foreground); box-shadow: var(--dbx-shadow-md); font-size: 12px; line-height: 1.6; }
  .crop-help-panel p { margin: 8px 0 0; }
  .crop-help-panel dl { display: grid; gap: 8px; margin: 10px 0; }
  .crop-help-panel dl > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .crop-help-panel dd { margin: 0; color: var(--color-muted-foreground); }
  .crop-help-panel kbd { padding: 1px 4px; border: 1px solid var(--color-border); border-radius: 3px; font: 11px var(--font-sans); background: var(--color-muted); }
  .segmented { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-muted); }
  .segmented button { padding: 5px 10px; border: 0; border-radius: 4px; background: transparent; color: var(--color-muted-foreground); font: inherit; cursor: pointer; }
  .segmented button[aria-pressed="true"] { background: var(--color-background); color: var(--color-foreground); }
  .segmented button:disabled { opacity: .45; cursor: default; }
  .segmented button:focus-visible { outline: none; box-shadow: var(--dbx-focus-ring); }
  .section-label { display: flex; justify-content: space-between; padding-top: 4px; font-size: 12px; font-weight: 600; }
  .section-label span { font-size: 11px; font-weight: 400; color: var(--color-muted-foreground); }
  .size-presets { display: flex; gap: 6px; }
  .size-presets button { flex: 1; padding: 4px 8px; min-height: 26px; font-size: 11px; }
  .field-help { margin: -5px 0 0; }
  .settings-fields input[aria-invalid="true"] { border-color: var(--color-destructive); }
  .validation-error, .output-estimate { margin: 0; padding: 0 16px 14px; font-size: 12px; }
  .gif-editor .validation-error { color: var(--color-destructive); }
  .output-estimate { color: var(--color-muted-foreground); }
  .small-file-note { margin: 0; padding: 0 4px; }
  .settings-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 12px; border: 0; padding: 16px; margin: 0; min-width: 0; }
  .settings-fields label { display: flex; flex-direction: column; gap: 7px; min-width: 0; font-size: 12px; }
  .settings-fields .dbx-input { width: 100%; min-width: 0; }
  .full { grid-column: 1 / -1; }
  .dimension-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .settings-fields .check { flex-direction: row; align-items: center; gap: 2px; }
  .dimension-actions button { font-size: 12px; }
  .hint { margin: 0; line-height: 1.7; }
  .output-actions { display: flex; gap: 8px; flex-wrap: wrap; padding: 14px 16px; border-top: 1px solid var(--color-border); }
  progress { display: block; width: calc(100% - 32px); margin: 0 16px 16px; accent-color: var(--color-primary); }
  .result-summary { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 14px 16px; font-size: 12px; border-top: 1px solid var(--color-border); }
  .result-summary strong { color: var(--color-primary); }
  .empty-state { display: flex; flex: 1; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; border: 1px dashed var(--color-border); border-radius: 10px; text-align: center; }
  .file-badge { padding: 12px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 18px; font-weight: 700; }
  .empty-state p { margin: 0; }
  .frame-controls { border: 0; padding: 0; margin: 0; min-width: 0; }
  .frame-help { margin: 0; padding: 10px 16px 4px; }
  .frame-list { list-style: none; margin: 0; max-height: 280px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-gutter: stable; padding: 4px 12px; }
  .frame-row { position: relative; display: grid; grid-template-columns: 20px 3ch 56px minmax(56px, 1fr) auto 30px; align-items: center; gap: 8px; padding: 8px 0; }
  .frame-row + .frame-row { border-top: 1px solid var(--color-border); }
  .frame-row.drag-source { opacity: .45; }
  .frame-row.drop-before::before, .frame-row.drop-after::after { content: ""; position: absolute; left: 0; right: 0; height: 2px; background: var(--color-primary); pointer-events: none; }
  .frame-row.drop-before::before { top: -1px; }
  .frame-row.drop-after::after { bottom: -1px; }
  .drag-handle { padding: 0; border: 0; background: transparent; color: var(--color-muted-foreground); font-size: 22px; cursor: grab; touch-action: none; }
  .drag-handle:active { cursor: grabbing; }
  .drag-handle:focus-visible { outline: none; box-shadow: var(--dbx-focus-ring); border-radius: 4px; }
  .frame-thumbnail { display: block; width: 56px; height: 44px; object-fit: contain; border: 1px solid var(--color-border); border-radius: 4px; background: repeating-conic-gradient(var(--color-muted) 0 25%, var(--color-background) 0 50%) 0 / 12px 12px; }
  .frame-number, .delay-unit { font-size: 12px; color: var(--color-muted-foreground); font-variant-numeric: tabular-nums; }
  .frame-number { text-align: right; }
  .frame-row .dbx-input { width: 100%; min-width: 0; }
  .frame-row .dbx-btn { padding: 4px 8px; min-height: 30px; }
  .frame-row .frame-delete { display: inline-flex; align-items: center; justify-content: center; padding: 4px; }
  .frame-delete:hover:not(:disabled) { color: var(--color-destructive); border-color: var(--color-destructive); }
  .frame-export { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--color-border); }
  .frame-export label { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .frame-export label :global(.dbx-custom-select) { width: 88px; }
  @container (max-width: 960px) { .frame-row { grid-template-columns: 16px 3ch 40px minmax(48px, 1fr) auto 30px; gap: 4px; } .frame-thumbnail { width: 40px; height: 36px; } .frame-row .dbx-btn { padding: 4px; } }
  @container (max-width: 760px) { .editor-grid { grid-template-columns: minmax(0, 1fr); } .preview-stage { min-height: 160px; } .preview { height: 220px; } }
</style>
