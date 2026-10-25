<script>
  import { onDestroy, untrack } from "svelte";
  import { createTaskScope, taskAbortError } from "./taskManager.js";
  import Worker from "./gifEditorWorker.js?worker&inline";
  import { pick, localizeError } from "./i18n.js";
  import Select from "./Select.svelte";
  import { saveBlobThroughHost } from "./fileSave.js";
  let { toolId, locale = "zh-CN", onStateChange, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const taskScope = createTaskScope(untrack(() => toolId), "gif");
  let worker, timeout, pending;
  let workerLoaded = false;
  let taskProgress = $state(null);
  let disposed = false;
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
    blob = null;
    if (url) URL.revokeObjectURL(url);
    url = "";
  }
  async function load(event) {
    stop();
    invalidate();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = "";
    frames = [];
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
      });
      if (disposed) return;
      file = next;
      width = result.width;
      height = result.height;
      cropWidth = width;
      cropHeight = height;
      repeat = result.repeat;
      frames = result.delays.map((delay, index) => ({ index, delay }));
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      originalUrl = URL.createObjectURL(next);
    } catch (e) {
      if (!disposed && e?.name !== "AbortError") error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  function move(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= frames.length) return;
    const next = [...frames];
    [next[i], next[j]] = [next[j], next[i]];
    frames = next;
    invalidate();
  }
  async function run() {
    if (!file || busy) return;
    busy = true;
    error = "";
    invalidate();
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
      }
    } catch (e) {
      if (!disposed) error = localizeError(locale, e);
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

<div class="expansion-page">
  <label
    >{t("导入 GIF", "Import GIF")}<input
      type="file"
      accept="image/gif"
      onchange={load}
      disabled={busy}
    /></label
  >
  {#if busy}<div class="expansion-actions"><progress max="1" value={taskProgress ?? undefined} aria-label={t("处理中…", "Working…")}></progress><button class="dbx-btn" type="button" onclick={() => taskScope.cancel()}>{t("取消", "Cancel")}</button></div>{/if}
  <p>
    {t(
      "最多 30 MB、300 帧、总计 2400 万像素。",
      "Up to 30 MB, 300 frames, and 24 million total pixels.",
    )}
  </p>
  {#if file}<img
      src={originalUrl}
      alt={t("原图", "Original")}
      class="preview"
    />
    {#if toolId === "gif-crop"}<label
        >X<input
          class="dbx-input"
          type="number"
          min="0"
          bind:value={x}
          oninput={invalidate}
        /></label
      ><label
        >Y<input
          class="dbx-input"
          type="number"
          min="0"
          bind:value={y}
          oninput={invalidate}
        /></label
      ><label
        >{t("裁剪宽度", "Crop width")}<input
          class="dbx-input"
          type="number"
          min="1"
          bind:value={cropWidth}
          oninput={invalidate}
        /></label
      ><label
        >{t("裁剪高度", "Crop height")}<input
          class="dbx-input"
          type="number"
          min="1"
          bind:value={cropHeight}
          oninput={invalidate}
        /></label
      >
    {:else}<label
        >{t("宽度", "Width")}<input
          class="dbx-input"
          type="number"
          min="1"
          max="4096"
          bind:value={width}
          oninput={invalidate}
        /></label
      ><label
        >{t("高度", "Height")}<input
          class="dbx-input"
          type="number"
          min="1"
          max="4096"
          bind:value={height}
          oninput={invalidate}
        /></label
      >{/if}
    <label
      >{t("颜色数量", "Colors")}<input
        class="dbx-input"
        type="number"
        min="2"
        max="256"
        bind:value={colors}
        oninput={invalidate}
      /></label
    ><label
      >{t("循环次数（-1 单次，0 无限）", "Repeat (-1 once, 0 forever)")}<input
        class="dbx-input"
        type="number"
        min="-1"
        max="65535"
        bind:value={repeat}
        oninput={invalidate}
      /></label
    >
    {#if toolId === "gif-compress"}<label
        >{t(
          "每 N 帧保留一帧（合并时长）",
          "Keep every Nth frame (combine delays)",
        )}<input
          class="dbx-input"
          type="number"
          min="1"
          max="300"
          bind:value={step}
          oninput={invalidate}
        /></label
      >{/if}
    {#if toolId === "gif-frames"}{#each frames as frame, i}<div
          class="expansion-actions"
        >
          <span>{i + 1}</span><input
            class="dbx-input delay"
            type="number"
            min="0"
            max="655350"
            bind:value={frame.delay}
            oninput={invalidate}
            aria-label={t("帧时长（毫秒）", "Frame duration (ms)")}
          /><button class="dbx-btn" onclick={() => move(i, -1)}>↑</button
          ><button class="dbx-btn" onclick={() => move(i, 1)}>↓</button><button
            class="dbx-btn"
            disabled={frames.length < 2}
            onclick={() => {
              frames = frames.filter((_, j) => i !== j);
              selected = 0;
              invalidate();
            }}>{t("删除", "Delete")}</button
          >
        </div>{/each}<label
        >{t("提取帧", "Extract frame")}<Select bind:value={selected} ariaLabel={t("提取帧", "Extract frame")} options={frames.map((_, i) => ({value:i,label:String(i + 1)}))} /></label
      ><button class="dbx-btn" onclick={extract} disabled={busy}
        >{t("导出 PNG", "Export PNG")}</button
      ><canvas bind:this={canvas} hidden></canvas>{/if}
    <div class="expansion-actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy}
        >{busy
          ? t("处理中…", "Working…")
          : t("生成 GIF", "Generate GIF")}</button
      >{#if busy}<button
          class="dbx-btn"
          onclick={() => taskScope.cancel()}>{t("取消", "Cancel")}</button
        >{/if}
    </div>
  {/if}
  {#if url}<img src={url} alt={t("处理结果", "Result")} class="preview" />
    <p>
      {file.size} B → {blob.size} B {blob.size >= file.size
        ? t("（体积未减小）", "(size did not decrease)")
        : ""}
    </p>
    <button class="dbx-btn" onclick={save}>{t("保存 GIF", "Save GIF")}</button
    >{/if}{#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .preview {
    max-width: 100%;
    max-height: 300px;
    object-fit: contain;
  }
  .delay {
    width: 110px;
  }
</style>
