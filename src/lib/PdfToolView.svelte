<script>
  import { onDestroy, untrack } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import { pageSelection, validatePdfFiles } from "./pdfTools.js";
  import { buildZipStore } from "./zipStore.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  import {
    PDF_NATIVE_OPERATIONS,
    uploadNativePdfs,
    inspectNativePdfs,
    processNativePdf,
    saveNativePdf,
    cancelNativePdf,
  } from "./nativePdf.js";
  import { createTaskScope } from "./taskManager.js";
  import { createPdfWorkerClient } from "./pdfWorkerClient.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  let { toolId, locale = "zh-CN", demoRequest = 0, onStateChange, visible = true } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const taskScope = createTaskScope(
    untrack(() => toolId),
    "pdf",
  );
  const operation = $derived(toolId.slice(4));
  const nativeOperation = $derived(PDF_NATIVE_OPERATIONS.has(operation));
  const operationCopy = {
    merge: [
      "按当前顺序合并多个 PDF 文件。",
      "Merge multiple PDF files in the current order.",
    ],
    split: [
      "按单页或指定范围拆分 PDF。",
      "Split a PDF into individual pages or custom ranges.",
    ],
    organize: [
      "通过缩略图拖拽重新排列页面。",
      "Reorder pages with draggable thumbnails.",
    ],
    rotate: ["旋转全部或指定页面。", "Rotate all or selected pages."],
    delete: [
      "删除指定页面并生成新副本。",
      "Remove selected pages and create a new copy.",
    ],
    extract: [
      "把指定页面提取为新的 PDF。",
      "Extract selected pages into a new PDF.",
    ],
    watermark: [
      "为指定页面添加可配置的文字水印。",
      "Add configurable text watermarks to selected pages.",
    ],
    "page-numbers": [
      "添加自定义格式、位置和起始值的页码。",
      "Add page numbers with custom format, position, and starting value.",
    ],
    crop: [
      "调整指定页面的可见边界。",
      "Adjust the visible bounds of selected pages.",
    ],
    "visual-signature": [
      "添加手写或图片形式的视觉签名。",
      "Place a handwritten or image-based visual signature.",
    ],
    images: [
      "把指定页面导出为 PNG 或 JPEG 压缩包。",
      "Export selected pages as a PNG or JPEG archive.",
    ],
    compress: [
      "清理元数据和缩略图并重写文档结构。",
      "Clean metadata and thumbnails and rewrite the document structure.",
    ],
    encrypt: [
      "使用 AES-256 为新副本设置打开密码。",
      "Protect a new copy with an AES-256 opening password.",
    ],
    decrypt: [
      "使用已知密码生成无密码副本。",
      "Create an unencrypted copy using the known password.",
    ],
    "signature-check": [
      "离线检查签名完整性和证书信息。",
      "Inspect signature integrity and certificate information offline.",
    ],
  };
  const description = $derived(
    operationCopy[operation] || [
      "本地处理 PDF 文件。",
      "Process PDF files locally.",
    ],
  );
  let files = $state([]),
    info = $state(null),
    pages = $state(""),
    order = $state([]),
    thumbs = $state([]),
    password = $state(""),
    newPassword = $state(""),
    text = $state(""),
    fontSize = $state(24),
    opacity = $state(0.5),
    angle = $state(90),
    x = $state(36),
    y = $state(36),
    start = $state(1),
    format = $state("{n} / {total}"),
    top = $state(0),
    bottom = $state(0),
    left = $state(0),
    right = $state(0),
    signature = $state(null),
    fontBytes = $state(null),
    signatureWidth = $state(150),
    signatureHeight = $state(60),
    signatureCanvas = $state(null),
    drawing = $state(false),
    hasStrokes = $state(false),
    imageFormat = $state("png"),
    imageScale = $state(1.5),
    output = $state(null),
    report = $state(""),
    busy = $state(false),
    error = $state(""),
    progress = $state(""),
    dragActive = $state(false),
    showPassword = $state(false),
    filePointerDrag = $state(null);
  let buffers = [],
    renderer,
    nativeSession = "",
    disposed = false,
    revision = 0,
    dragged = -1;
  let appliedDemoRequest = 0;
  const formatBytes = (value) => {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  };
  const outputSize = $derived(output ? output.native ? output.size : output.blob.size : 0);
  const sizeChange = $derived(totalInputSize ? ((outputSize - totalInputSize) / totalInputSize * 100).toFixed(1) : '0.0');
  let advancedOpen = $state(false);
  let savedOutput = $state(null), savedReport = $state("");
  $effect(() => { onStateChange?.({ dispose: () => { taskScope.dispose(); void cancelNativePdf(nativeSession); }, busy, dirty: files.length > 0 && (!output || output !== savedOutput), hasUnsavedResult: (!!output && output !== savedOutput) || (!!report && report !== savedReport), export: output ? save : report ? saveReport : null, retry: info ? run : files.length ? load : null }); });
  $effect(() => { if (!visible) { password = ""; newPassword = ""; showPassword = false; } });
  async function saveReport() { const value = report; const result = await saveBlobThroughHost(new Blob([value], {type: 'application/json'}), { fileName: 'signature-report.json', binary: true }); if (result?.cancelled) return false; savedReport = value; return true; }
  const totalInputSize = $derived(
    files.reduce((sum, file) => sum + file.size, 0),
  );
  const pageRangeState = $derived.by(() => {
    if (
      !info ||
      [
        "merge",
        "organize",
        "compress",
        "encrypt",
        "decrypt",
        "signature-check",
      ].includes(operation)
    )
      return { count: 0, error: "" };
    try {
      return { count: pageSelection(pages, info.count).length, error: "" };
    } catch (e) {
      return { count: 0, error: localizeError(locale, e) };
    }
  });
  function clearOutput() {
    output = null;
    report = "";
  }
  async function clearPreview() {
    const old = renderer;
    renderer = null;
    try {
      await old?.destroy();
    } catch {
      /* Cleanup must still release URLs. */
    }
    thumbs.forEach((url) => URL.revokeObjectURL(url));
    thumbs = [];
  }
  onDestroy(() => {
    disposed = true;
    revision++;
    taskScope.dispose();
    void cancelNativePdf(nativeSession);
    nativeSession = "";
    void clearPreview();
    buffers = [];
    password = "";
    newPassword = "";
    signature = null;
    fontBytes = null;
    files = [];
    output = null;
    report = "";
  });
  $effect(() => {
    const request = Number(demoRequest) || 0;
    if (demoRequest === appliedDemoRequest || request <= 0) return;
    appliedDemoRequest = demoRequest;
    void example();
  });
  function uniqueFiles(list) {
    const seen = new Set();
    return list.filter((file) => {
      const key = `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  async function setFiles(incoming, { append = false } = {}) {
    const nextFiles = uniqueFiles(
      append && operation === "merge" ? [...files, ...incoming] : incoming,
    );
    revision++;
    await clearPreview();
    buffers = [];
    info = null;
    order = [];
    clearOutput();
    error = "";
    void cancelNativePdf(nativeSession);
    nativeSession = "";
    try {
      validatePdfFiles(nextFiles, { native: nativeOperation });
      files = nextFiles;
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
  async function choose(event) {
    const incoming = [...(event.currentTarget.files || [])];
    event.currentTarget.value = "";
    if (incoming.length) await setFiles(incoming, { append: files.length > 0 });
  }
  async function dropFiles(event) {
    event.preventDefault();
    dragActive = false;
    if (busy) return;
    const incoming = [...(event.dataTransfer?.files || [])];
    if (incoming.length) await setFiles(incoming, { append: files.length > 0 });
  }
  function reorderFiles(from, to) {
    if (from < 0 || to < 0 || from === to || operation !== "merge") return;
    const next = [...files];
    const [file] = next.splice(from, 1);
    next.splice(to, 0, file);
    files = next;
    info = null;
    clearOutput();
  }
  function filePointerDown(event, index) {
    if (operation !== "merge" || busy || event.button !== 0) return;
    filePointerDrag = {
      pointerId: event.pointerId,
      source: index,
      target: index,
      active: false,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function filePointerMove(event) {
    if (!filePointerDrag || event.pointerId !== filePointerDrag.pointerId)
      return;
    const distance = Math.abs(event.clientY - filePointerDrag.startY);
    if (!filePointerDrag.active && distance < 4) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest?.("[data-pdf-file-index]");
    if (!target) return;
    filePointerDrag = {
      ...filePointerDrag,
      active: true,
      target: Number(target.dataset.pdfFileIndex),
    };
    document.getSelection()?.removeAllRanges();
    event.preventDefault();
  }
  function filePointerEnd(event) {
    if (!filePointerDrag || event.pointerId !== filePointerDrag.pointerId)
      return;
    const current = filePointerDrag;
    filePointerDrag = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (current.active) reorderFiles(current.source, current.target);
  }
  function moveFileWithKeyboard(index, delta) {
    reorderFiles(index, index + delta);
  }
  async function removeFile(index) {
    revision++;
    await clearPreview();
    files = files.filter((_, i) => i !== index);
    buffers = [];
    info = null;
    order = [];
    clearOutput();
    error = "";
    void cancelNativePdf(nativeSession);
    nativeSession = "";
  }
  async function example() {
    busy = true;
    error = "";
    try {
      const lib = await loadAssetModule("pdf-tools");
      const bytes = await lib.demoPdf();
      if (disposed) return;
      await setFiles([
        new File([bytes], "sample.pdf", { type: "application/pdf" }),
      ]);
      password = "";
      newPassword = "";
      pages = "";
      text = "DEMO";
      await load();
    } catch (e) {
      if (!disposed) error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  async function managed(work) {
    return taskScope.run(async (task) => {
      const worker = createPdfWorkerClient(task.signal);
      const stopPreview = () => {
        void clearPreview();
      };
      task.signal.addEventListener("abort", stopPreview, { once: true });
      try {
        return await work(task, worker);
      } finally {
        worker.dispose();
        task.signal.removeEventListener("abort", stopPreview);
      }
    });
  }
  function cancelTask() {
    progress = t("正在取消并清理…", "Cancelling and cleaning up…");
    taskScope.cancel();
  }
  async function load() {
    const taskPassword = password;
    const token = ++revision;
    busy = true;
    error = "";
    info = null;
    order = [];
    clearOutput();
    await clearPreview();
    try {
      await managed(async (task, pdfWorker) => {
        validatePdfFiles(files, { native: nativeOperation });
        let inspections;
        if (nativeOperation) {
          await cancelNativePdf(nativeSession);
          nativeSession = "";
          const uploadedSession = await uploadNativePdfs(files, {
            signal: task.signal,
            onProgress: ({ uploadedBytes, totalBytes }) => {
              if (!disposed && token === revision) {
                task.update({
                  stage: "upload",
                  progress: totalBytes ? uploadedBytes / totalBytes : 0,
                });
                progress = `${formatBytes(uploadedBytes)} / ${formatBytes(totalBytes)}`;
              }
            },
          });
          if (disposed || token !== revision) {
            await cancelNativePdf(uploadedSession);
            return;
          }
          nativeSession = uploadedSession;
          inspections = (
            await inspectNativePdfs(nativeSession, taskPassword, {
              signal: task.signal,
              onProgress: (value) =>
                task.update({
                  stage: value.stage,
                  progress: value.total ? value.completed / value.total : null,
                }),
            })
          ).files;
          buffers = [];
        } else {
          buffers = [];
          for (const file of files)
            buffers.push(new Uint8Array(await file.arrayBuffer()));
          task.check();
          task.update({ stage: "inspect" });
          inspections = [];
          for (const buffer of buffers)
            inspections.push(
              await pdfWorker.request("inspect", [buffer, taskPassword]),
            );
        }
        const next =
          operation === "merge"
            ? {
                count: inspections.reduce((sum, item) => sum + item.count, 0),
                pages: inspections.flatMap((item) => item.pages),
                signed: inspections.some((item) => item.signed),
                fileCounts: inspections.map((item) => item.count),
              }
            : inspections[0];
        if (next.count > (nativeOperation ? 5000 : 500))
          throw new Error(`PDF page limit is ${nativeOperation ? 5000 : 500}`);
        task.check();
        if (disposed || token !== revision) return;
        info = next;
        order = Array.from({ length: info.count }, (_, i) => i);
        if (operation === "organize") {
          await createRenderer(task, taskPassword);
          await thumbnails(token, task);
        }
      });
    } catch (e) {
      if (!disposed && token === revision) {
        if (e?.name === "AbortError") {
          if (nativeOperation) {
            await cancelNativePdf(nativeSession);
            nativeSession = "";
            info = null;
          }
        } else error = localizeError(locale, e);
      }
    } finally {
      if (!disposed && token === revision) {
        busy = false;
        progress = "";
      }
    }
  }
  function setPagePreset(kind) {
    if (!info) return;
    if (kind === "all") pages = "";
    else {
      const parity = kind === "odd" ? 1 : 0;
      pages = Array.from({ length: info.count }, (_, i) => i + 1)
        .filter((page) => page % 2 === parity)
        .join(",");
    }
    clearOutput();
  }
  async function createRenderer(task, renderPassword = password) {
    if (!renderer) {
      progress = t("加载 PDF 渲染模块…", "Loading PDF rendering module…");
      const lib = await loadAssetModule("pdf-renderer");
      task.check();
      if (disposed) throw new Error("Cancelled");
      progress = t("启动 PDF 渲染器…", "Starting PDF renderer…");
      const next = await lib.openPdfRenderer(buffers[0], renderPassword, {
        signal: task.signal,
      });
      if (disposed) {
        await next.destroy();
        throw new Error("Cancelled");
      }
      renderer = next;
    }
  }
  async function fontFile(event) {
    try {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (file.size > 20_000_000) throw new Error("Font exceeds 20 MB");
      fontBytes = new Uint8Array(await file.arrayBuffer());
      clearOutput();
    } catch (e) {
      error = localizeError(locale, e);
    }
    event.currentTarget.value = "";
  }
  async function thumbnails(token, task) {
    const canvas = document.createElement("canvas");
    for (let i = 0; i < info.count; i++) {
      task.check();
      task.update({ stage: "render", progress: i / info.count });
      if (disposed || token !== revision) return;
      progress = `${i + 1} / ${info.count}`;
      const scale = Math.min(
        120 / info.pages[i].width,
        170 / info.pages[i].height,
      );
      await renderer.render(i, canvas, scale);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (blob && !disposed && token === revision)
        thumbs = [...thumbs, URL.createObjectURL(blob)];
    }
  }
  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    order = next;
    clearOutput();
  }
  function drop(event, index) {
    event.preventDefault();
    if (dragged < 0) return;
    const next = [...order];
    const [value] = next.splice(dragged, 1);
    next.splice(index, 0, value);
    order = next;
    dragged = -1;
    clearOutput();
  }
  function pointer(event) {
    const rect = signatureCanvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * signatureCanvas.width) / rect.width,
      y: ((event.clientY - rect.top) * signatureCanvas.height) / rect.height,
    };
  }
  function startStroke(event) {
    drawing = true;
    signatureCanvas.setPointerCapture(event.pointerId);
    const p = pointer(event),
      ctx = signatureCanvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }
  function stroke(event) {
    if (!drawing) return;
    const p = pointer(event),
      ctx = signatureCanvas.getContext("2d");
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStrokes = true;
    signature = null;
    clearOutput();
  }
  async function signatureFile(event) {
    try {
      const file = event.currentTarget.files?.[0];
      if (!file) return;
      if (file.size > 5_000_000)
        throw new Error("Signature image must be at most 5 MB");
      signature = new Uint8Array(await file.arrayBuffer());
      clearOutput();
    } catch (e) {
      error = localizeError(locale, e);
    }
    event.currentTarget.value = "";
  }
  async function run() {
    const taskPassword = password, taskNewPassword = newPassword;
    if (!info || busy) return;
    if (pageRangeState.error) {
      error = pageRangeState.error;
      document.getElementById("pdf-page-range")?.focus();
      return;
    }
    const token = ++revision;
    busy = true;
    error = "";
    clearOutput();
    try {
      await managed(async (task, pdfWorker) => {
        task.check();
        task.update({ stage: "process" });
        if (nativeOperation) {
          if (!nativeSession) throw new Error("Load the PDF before processing");
          progress = t(
            "Sidecar 正在处理临时文件…",
            "The Sidecar is processing temporary files…",
          );
          const result = await processNativePdf(
            nativeSession,
            operation,
            {
              password: taskPassword,
              newPassword: taskNewPassword,
              pages,
              order: [...order],
              angle: Number(angle),
              top: Number(top),
              bottom: Number(bottom),
              left: Number(left),
              right: Number(right),
            },
            {
              signal: task.signal,
              onProgress: (value) =>
                task.update({
                  stage: value.stage,
                  progress: value.total ? value.completed / value.total : null,
                }),
            },
          );
          if (!disposed && token === revision)
            output = {
              native: true,
              size: Number(result.size) || 0,
              name: resultName(),
            };
          return;
        }
        if (operation === "signature-check") {
          const reports = await pdfWorker.request("signatures", [
            buffers[0],
            taskPassword,
          ]);
          task.check();
          if (!disposed)
            report = JSON.stringify(
              {
                signatures: reports,
                notice:
                  "System trust, revocation and timestamp validation are not performed. No network requests.",
              },
              null,
              2,
            );
          return;
        }
        if (operation === "images") {
          await createRenderer(task, taskPassword);
          const selected = pageSelection(pages, info.count),
            entries = [],
            canvas = document.createElement("canvas");
          let total = 0;
          for (const index of selected) {
            task.check();
            task.update({
              stage: "render",
              progress: entries.length / selected.length,
            });
            if (disposed || token !== revision) return;
            progress = `${entries.length + 1} / ${selected.length}`;
            await renderer.render(index, canvas, Number(imageScale));
            const blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, `image/${imageFormat}`, 0.9),
            );
            if (!blob) throw new Error("Could not encode image");
            total += blob.size;
            if (total > 100_000_000) throw new Error("Output exceeds 100 MB");
            entries.push({
              name: `page-${index + 1}.${imageFormat === "jpeg" ? "jpg" : "png"}`,
              bytes: new Uint8Array(await blob.arrayBuffer()),
            });
          }
          task.check();
          if (!disposed)
            output = {
              blob: new Blob([buildZipStore(entries)], {
                type: "application/zip",
              }),
              name: resultName(),
            };
          return;
        }
        let signatureBytes = signature;
        if (operation === "visual-signature" && !signatureBytes) {
          if (!hasStrokes) throw new Error("Draw or upload a signature first");
          const canvasBlob = await new Promise((resolve) =>
            signatureCanvas.toBlob(resolve, "image/png"),
          );
          signatureBytes = new Uint8Array(await canvasBlob.arrayBuffer());
        }
        const results = await pdfWorker.request("process", [
          operation,
          buffers,
          {
            password: taskPassword,
            newPassword: taskNewPassword,
            pages,
            order: [...order],
            text,
            fontSize: Number(fontSize),
            fontBytes,
            opacity: Number(opacity),
            angle: Number(angle),
            x: Number(x),
            y: Number(y),
            start: Number(start),
            format,
            top: Number(top),
            bottom: Number(bottom),
            left: Number(left),
            right: Number(right),
            signature: signatureBytes,
            width: Number(signatureWidth),
            height: Number(signatureHeight),
          },
        ]);
        task.check();
        if (disposed || token !== revision) return;
        if (results.reduce((n, b) => n + b.length, 0) > 100_000_000)
          throw new Error("Output exceeds 100 MB");
        output =
          results.length === 1
            ? {
                blob: new Blob([results[0]], { type: "application/pdf" }),
                name: resultName(),
              }
            : {
                blob: new Blob(
                  [
                    buildZipStore(
                      results.map((bytes, i) => ({
                        name: `part-${i + 1}.pdf`,
                        bytes,
                      })),
                    ),
                  ],
                  { type: "application/zip" },
                ),
                name: resultName(),
              };
      });
    } catch (e) {
      if (!disposed && token === revision) {
        if (e?.name === "AbortError") {
          if (nativeOperation) {
            await cancelNativePdf(nativeSession);
            nativeSession = "";
            info = null;
          }
        } else error = localizeError(locale, e);
      }
    } finally {
      if (!disposed && token === revision) {
        busy = false;
        progress = "";
      }
    }
  }
  async function save() {
    try {
      const value = output;
      const result = value.native ? await saveNativePdf(nativeSession, value.name) : await saveBlobThroughHost(value.blob, { fileName: value.name, binary: true });
      if (result?.cancelled) return false;
      savedOutput = value; onStateChange?.({dirty: false, hasUnsavedResult: false}); return true;
    } catch (e) { error = localizeError(locale, e); return false; }
  }
  function resultName() {
    const base = (files[0]?.name || "document.pdf").replace(/\.pdf$/i, "");
    if (operation === "images") return `${base}-images.zip`;
    if (operation === "split") return `${base}-split.zip`;
    if (operation === "merge") return "merged.pdf";
    return `${base}-${operation}.pdf`;
  }
</script>

<div class="expansion-page pdf-page">
  {#if busy}<button class="dbx-btn" type="button" onclick={cancelTask}
      >{t("取消", "Cancel")}</button
    >{/if}
  {#if operation === 'compress'}<p class="dbx-hint">{t('压缩主要清理元数据、缩略图并重写结构；扫描件不保证明显缩小，输出也可能变大。', 'Compression cleans metadata and thumbnails and rewrites structure. Scanned files may not shrink; output can be larger.')}</p>{/if}
  <fieldset disabled={busy} class="controls">
    <section
      class="upload-card"
      role="group"
      aria-label={t("PDF 文件上传", "PDF file upload")}
      class:has-files={files.length > 0}
      class:drag-active={dragActive}
      ondragenter={(event) => {
        event.preventDefault();
        if (!busy) dragActive = true;
      }}
      ondragover={(event) => event.preventDefault()}
      ondragleave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          dragActive = false;
      }}
      ondrop={dropFiles}
    >
      <div class="upload-icon" aria-hidden="true">PDF</div>
      <div class="upload-copy">
        <strong
          >{dragActive
            ? t("松开即可添加 PDF", "Drop to add PDFs")
            : files.length && operation === "merge"
              ? t("继续添加 PDF", "Add more PDFs")
              : files.length
                ? t("更换 PDF 文件", "Replace the PDF")
                : t("选择或拖入 PDF", "Choose or drop PDFs")}</strong
        >
        <span
          >{operation === "merge"
            ? t(
                "拖动文件卡片调整合并顺序",
                "Drag file cards to set the merge order",
              )
            : t(
                "从本地选择一个 PDF 文件",
                "Choose a PDF file from this device",
              )}</span
        >
      </div>
      <label class="dbx-btn dbx-btn--primary file-button">
        {t(
          files.length && operation === "merge"
            ? "添加文件"
            : files.length
              ? "更换文件"
              : "选择文件",
          files.length && operation === "merge"
            ? "Add files"
            : files.length
              ? "Replace file"
              : "Choose file",
        )}
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple={operation === "merge"}
          onchange={choose}
          disabled={busy}
        />
      </label>
    </section>

    {#if files.length}<section class="dbx-card file-panel">
        <div class="section-heading">
          <h4>{t("已选文件", "Selected files")}</h4>
          <span
            >{files.length}
            {t("个文件", "files")} · {formatBytes(totalInputSize)}</span
          >
        </div>
        <div class="file-list">
          {#each files as file, i}<div
              class="file-row"
              class:dragging={filePointerDrag?.active &&
                filePointerDrag.source === i}
              class:drop-target={filePointerDrag?.active &&
                filePointerDrag.target === i &&
                filePointerDrag.source !== i}
              role="listitem"
              data-pdf-file-index={i}
              aria-label={operation === "merge"
                ? t(
                    `第 ${i + 1} 个文件：${file.name}，可拖动排序`,
                    `File ${i + 1}: ${file.name}, draggable`,
                  )
                : file.name}
              onpointerdown={(event) => filePointerDown(event, i)}
              onpointermove={filePointerMove}
              onpointerup={filePointerEnd}
              onpointercancel={() => (filePointerDrag = null)}
            >
              {#if operation === "merge"}<button
                  class="file-drag"
                  type="button"
                  aria-label={t(
                    `调整 ${file.name} 顺序`,
                    `Reorder ${file.name}`,
                  )}
                  title={t(
                    "拖动调整顺序，也可用上下方向键",
                    "Drag to reorder, or use the arrow keys",
                  )}
                  onkeydown={(event) => {
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      moveFileWithKeyboard(i, -1);
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      moveFileWithKeyboard(i, 1);
                    }
                  }}>⠿</button
                >{:else}<span class="file-drag-placeholder" aria-hidden="true"
                ></span>{/if}
              <span class="file-index">{i + 1}</span>
              <span class="file-name" title={file.name}>{file.name}</span>
              <span class="file-size">{formatBytes(file.size)}</span>
              <button
                class="dbx-btn dbx-btn--ghost remove-file"
                title={t("移除", "Remove")}
                aria-label={t(`移除 ${file.name}`, `Remove ${file.name}`)}
                onclick={() => removeFile(i)}>×</button
              >
            </div>{/each}
        </div>
        <div class="load-row">
          <label class="password-field">
            <span>{t("原文件密码", "Source password")}</span>
            <div class="password-input-row">
              <input
                class="dbx-input"
                type={showPassword ? "text" : "password"}
                autocomplete="new-password"
                bind:value={password}
                oninput={() => {
                  info = null;
                  clearOutput();
                }}
              />
              <button
                class="dbx-btn dbx-btn--ghost password-toggle"
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword
                  ? t("隐藏密码", "Hide password")
                  : t("显示密码", "Show password")}
                title={showPassword
                  ? t("隐藏密码", "Hide password")
                  : t("显示密码", "Show password")}
                onclick={() => (showPassword = !showPassword)}
                ><svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  aria-hidden="true"
                  ><path
                    d={showPassword
                      ? "M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.6 4.2 9.7 6.2a1.5 1.5 0 0 1 0 .8 14.8 14.8 0 0 1-3.1 3.8M6.2 6.2A14.2 14.2 0 0 0 2.3 11.2a1.5 1.5 0 0 0 0 .8C3.4 14 7 18.2 12 18.2c.7 0 1.4-.1 2-.2"
                      : "M2.3 12s3.5-6.5 9.7-6.5S21.7 12 21.7 12 18.2 18.5 12 18.5 2.3 12 2.3 12Z"}
                  />{#if !showPassword}<circle
                      cx="12"
                      cy="12"
                      r="2.5"
                    />{/if}</svg
                ></button
              >
            </div>
          </label>
          <button
            class="dbx-btn dbx-btn--primary"
            onclick={load}
            disabled={!files.length || busy}
          >
            {busy
              ? t("正在读取…", "Reading…")
              : t("读取并配置", "Read and configure")}
          </button>
        </div>
      </section>{/if}

    {#if info}<section class="dbx-card settings-card">
        <div class="section-heading">
          <div>
            <span class="step-number">2</span>
            <h4>{t("处理设置", "Processing settings")}</h4>
          </div>
          <span
            >{info.count}
            {t("页", "pages")} · {formatBytes(totalInputSize)}</span
          >
        </div>
        {#if info.signed && operation !== "signature-check"}<p role="status">
            {t(
              "修改文档可能使原有数字签名失效。",
              "Modifying the document may invalidate existing digital signatures.",
            )}
          </p>{/if}
        {#if !["merge", "organize", "compress", "encrypt", "decrypt", "signature-check"].includes(operation)}<div
            class="page-range-field"
          >
            <label for="pdf-page-range"
              >{operation === "split"
                ? t(
                    "拆分范围（留空按单页拆分）",
                    "Split ranges (empty means individual pages)",
                  )
                : t(
                    "页码范围（留空为全部，例如 1-3,5）",
                    "Page ranges (empty means all, e.g. 1-3,5)",
                  )}</label
            >
            <div class="range-input-row">
              <input
                id="pdf-page-range"
                class="dbx-input"
                class:invalid={pageRangeState.error}
                aria-invalid={pageRangeState.error ? "true" : "false"}
                aria-describedby="pdf-page-range-feedback"
                bind:value={pages}
                oninput={clearOutput}
              />
              <div
                class="range-presets"
                aria-label={t("页码快捷选择", "Page range shortcuts")}
              >
                <button
                  class="dbx-btn"
                  type="button"
                  onclick={() => setPagePreset("all")}
                  >{t("全部", "All")}</button
                ><button
                  class="dbx-btn"
                  type="button"
                  onclick={() => setPagePreset("odd")}
                  >{t("奇数页", "Odd")}</button
                ><button
                  class="dbx-btn"
                  type="button"
                  onclick={() => setPagePreset("even")}
                  >{t("偶数页", "Even")}</button
                >
              </div>
            </div>
            <small
              id="pdf-page-range-feedback"
              class:error-text={pageRangeState.error}
              >{pageRangeState.error ||
                t(
                  `已选择 ${pageRangeState.count} 页`,
                  `${pageRangeState.count} pages selected`,
                )}</small
            >
          </div>{/if}
        {#if operation === "organize"}<div class="pages">
            {#each order as page, i}<article
                draggable="true"
                ondragstart={() => (dragged = i)}
                ondragover={(e) => e.preventDefault()}
                ondrop={(e) => drop(e, i)}
                role="listitem"
              >
                <img src={thumbs[page]} alt={`${page + 1}`} /><span
                  >{page + 1}</span
                ><button
                  class="dbx-btn"
                  onclick={() => move(i, -1)}
                  disabled={busy || i === 0}>←</button
                ><button
                  class="dbx-btn"
                  onclick={() => move(i, 1)}
                  disabled={busy || i === order.length - 1}>→</button
                >
              </article>{/each}
          </div>{/if}
        {#if operation === "rotate" || operation === "watermark"}<label
            >{t("角度", "Angle")}<Select bind:value={angle} onchange={clearOutput} ariaLabel={t("角度", "Angle")} options={(operation === "rotate" ? [90,180,270] : [0,45,90,135,180,270,315]).map((value) => ({value,label:String(value)}))} /></label
          >{/if}
        {#if operation === "watermark"}<label
            >{t("水印文字", "Watermark text")}<input
              class="dbx-input"
              bind:value={text}
              maxlength="200"
              oninput={clearOutput}
            /></label
          >{/if}
        {#if operation === "page-numbers"}<label
            >{t("起始页码", "Starting page number")}<input
              class="dbx-input"
              type="number"
              bind:value={start}
              oninput={clearOutput}
            /></label
          ><label
            >{t(
              "格式：{n} 页码，{total} 总数",
              "Format: {n} page, {total} total",
            )}<input
              class="dbx-input"
              bind:value={format}
              oninput={clearOutput}
            /></label
          >{/if}
        {#if ["watermark", "page-numbers", "visual-signature"].includes(operation)}<details bind:open={advancedOpen}><summary>{t("高级设置", "Advanced settings")}</summary>
        {#if ["watermark", "page-numbers", "visual-signature"].includes(operation)}<p
          >
            {t(
              "位置单位为 PDF 点，原点为页面左下角。",
              "Position is in PDF points, measured from the bottom-left corner.",
            )}
          </p>
          <label
            >X<input
              class="dbx-input"
              type="number"
              bind:value={x}
              oninput={clearOutput}
            /></label
          ><label
            >Y<input
              class="dbx-input"
              type="number"
              bind:value={y}
              oninput={clearOutput}
            /></label
          >{/if}
        {#if ["watermark", "page-numbers"].includes(operation)}<label
            >{t("字号", "Font size")}<input
              class="dbx-input"
              type="number"
              min="6"
              max="144"
              bind:value={fontSize}
              oninput={clearOutput}
            /></label
          ><label
            >{t("透明度", "Opacity")}<input
              type="range"
              min="0"
              max="1"
              step="0.05"
              bind:value={opacity}
              oninput={clearOutput}
            /></label
          >
          <label
            >{t(
              "本地字体（TTF / OTF，可选）",
              "Local font (TTF / OTF, optional)",
            )}<input
              type="file"
              accept=".ttf,.otf"
              onchange={fontFile}
            /></label
          >
          <p>
            {t(
              "内置字体支持拉丁文字；中文等文字请选择包含对应字形的本地字体。",
              "The built-in font supports Latin text; choose a local font with the required glyphs for other scripts.",
            )}
          </p>{/if}
        </details>{/if}
        {#if operation === "crop"}<label
            >{t("上边距（点）", "Top margin (pt)")}<input
              class="dbx-input"
              type="number"
              min="0"
              bind:value={top}
              oninput={clearOutput}
            /></label
          ><label
            >{t("下边距（点）", "Bottom margin (pt)")}<input
              class="dbx-input"
              type="number"
              min="0"
              bind:value={bottom}
              oninput={clearOutput}
            /></label
          ><label
            >{t("左边距（点）", "Left margin (pt)")}<input
              class="dbx-input"
              type="number"
              min="0"
              bind:value={left}
              oninput={clearOutput}
            /></label
          ><label
            >{t("右边距（点）", "Right margin (pt)")}<input
              class="dbx-input"
              type="number"
              min="0"
              bind:value={right}
              oninput={clearOutput}
            /></label
          >{/if}
        {#if operation === "visual-signature"}<p>
            {t(
              "视觉签名是页面图像，不是密码学数字签名。",
              "A visual signature is a page image, not a cryptographic digital signature.",
            )}
          </p>
          <label
            >{t("上传签名图片", "Upload signature image")}<input
              type="file"
              accept="image/png,image/jpeg"
              onchange={signatureFile}
            /></label
          ><canvas
            class="signature"
            width="600"
            height="200"
            bind:this={signatureCanvas}
            onpointerdown={startStroke}
            onpointermove={stroke}
            onpointerup={() => (drawing = false)}
            onpointercancel={() => (drawing = false)}
            aria-label={t("手写签名区域", "Handwritten signature area")}
          ></canvas><button
            class="dbx-btn"
            onclick={() => {
              signatureCanvas.getContext("2d").clearRect(0, 0, 600, 200);
              signature = null;
              hasStrokes = false;
              clearOutput();
            }}>{t("清空签名", "Clear signature")}</button
          ><label
            >{t("签名宽度", "Signature width")}<input
              class="dbx-input"
              type="number"
              bind:value={signatureWidth}
              oninput={clearOutput}
            /></label
          ><label
            >{t("签名高度", "Signature height")}<input
              class="dbx-input"
              type="number"
              bind:value={signatureHeight}
              oninput={clearOutput}
            /></label
          >{/if}
        {#if operation === "encrypt"}<label
            >{t("新的打开密码", "New opening password")}<input
              class="dbx-input"
              type="password"
              autocomplete="new-password"
              bind:value={newPassword}
              maxlength="127"
              oninput={clearOutput}
            /></label
          >{/if}
        {#if operation === "images"}<Select bind:value={imageFormat} onchange={clearOutput} ariaLabel={t("图片格式", "Image format")} options={[{value:"png",label:"PNG"},{value:"jpeg",label:"JPEG"}]} /><label
            >{t("渲染倍率", "Render scale")}<input
              class="dbx-input"
              type="number"
              min="0.25"
              max="4"
              step="0.25"
              bind:value={imageScale}
              oninput={clearOutput}
            /></label
          >{/if}
        {#if operation === "compress"}<p>
            {t(
              "移除元数据和缩略图并重写对象流，不降低图片分辨率；体积可能增大。",
              "Removes metadata and thumbnails and rewrites object streams without downsampling images; file size may increase.",
            )}
          </p>{/if}
        <div class="run-row">
          <button
            class="dbx-btn dbx-btn--primary"
            onclick={run}
            disabled={busy || !!pageRangeState.error}
          >
            {busy
              ? t("处理中…", "Working…")
              : t("执行处理", "Run processing")}</button
          >
        </div>
      </section>{/if}
    {#if busy}<div class="status-card" role="status">
        <span class="spinner" aria-hidden="true"></span>
        {t("处理中…", "Working…")}
        {progress}
      </div>{/if}{#if output}<section class="result-card">
        <div>
          <strong>{t("处理完成", "Processing complete")}</strong><span
            >{formatBytes(totalInputSize)} → {formatBytes(
              output.native ? output.size : output.blob.size,
            )}</span
          >
        </div>
        <button class="dbx-btn dbx-btn--primary" onclick={save}
          >{t("保存结果", "Save result")}</button
        >
        {#if operation === 'compress'}<p role="status">{t('体积变化', 'Size change')}: {Number(sizeChange)>0?'+':''}{sizeChange}% {#if outputSize >= totalInputSize}{t('未缩小，可保留原文件。', 'No size reduction. You can keep the original file.')}{/if}</p>{/if}
      </section>{/if}{#if report}<section class="dbx-card report-card">
        <div class="section-heading">
          <h4>{t("签名检查报告", "Signature inspection report")}</h4>
          <CopyButton {locale} text={report} />
        </div>
        <textarea class="dbx-textarea" value={report} readonly rows="15"
        ></textarea>
      </section>{/if}{#if error}<div class="error-card" role="alert">
        {error}
      </div>{/if}
  </fieldset>
</div>

<style>
  .pdf-page {
    max-width: 1060px;
    padding: 22px;
    gap: 16px;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .controls > section {
    min-width: 0;
  }
  .upload-card {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 22px;
    border: 1px dashed var(--color-ring);
    border-radius: var(--radius-lg);
    background: color-mix(in srgb, var(--color-muted) 45%, transparent);
  }
  .upload-card.has-files {
    border-style: solid;
    border-color: var(--color-border);
  }
  .upload-card.drag-active {
    border-style: solid;
    border-width: 2px;
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }
  .upload-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-lg);
    background: var(--color-destructive);
    color: var(--color-destructive-foreground);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
  }
  .upload-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .upload-copy strong {
    font-size: 14px;
  }
  .upload-copy span {
    margin-top: 4px;
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .file-panel,
  .report-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .settings-card {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .settings-card > .section-heading,
  .settings-card > p,
  .settings-card > .pages,
  .settings-card > .page-range-field,
  .settings-card > .run-row,
  .settings-card > .signature {
    grid-column: 1 / -1;
  }
  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--color-border);
  }
  .section-heading > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-heading h4 {
    margin: 0;
    font-size: 13px;
  }
  .section-heading > span {
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .step-number,
  .file-index {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font-size: 11px;
    font-weight: 700;
  }
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .file-row {
    display: grid;
    grid-template-columns: 28px 26px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 4px 6px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-card);
    transition:
      opacity 100ms,
      border-color 100ms,
      background 100ms;
  }
  .file-row[data-pdf-file-index] {
    cursor: grab;
  }
  .file-row[data-pdf-file-index]:active {
    cursor: grabbing;
  }
  .file-row.dragging {
    opacity: 0.5;
  }
  .file-row.drop-target {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 9%, transparent);
    box-shadow: inset 0 0 0 1px var(--color-primary);
  }
  .file-drag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-muted-foreground);
    cursor: grab;
    touch-action: none;
    font-size: 16px;
  }
  .file-drag:hover,
  .file-drag:focus-visible {
    background: var(--color-muted);
    color: var(--color-foreground);
  }
  .file-drag:active {
    cursor: grabbing;
  }
  .file-drag-placeholder {
    width: 28px;
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .file-size {
    color: var(--color-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .file-row .dbx-btn {
    width: 30px;
    padding: 0;
  }
  .remove-file {
    font-size: 18px;
  }
  .load-row {
    display: grid;
    grid-template-columns: minmax(240px, 1fr) auto;
    align-items: end;
    gap: 10px;
  }
  .password-field,
  .settings-card > label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  .password-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 6px;
  }
  .password-toggle {
    width: 34px;
    padding: 0;
    font-size: 15px;
  }
  .page-range-field {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 12px;
  }
  .range-input-row {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) auto;
    gap: 8px;
  }
  .range-presets {
    display: flex;
    gap: 6px;
  }
  .range-presets .dbx-btn {
    min-width: 54px;
  }
  .page-range-field small {
    color: var(--color-muted-foreground);
  }
  .page-range-field small.error-text {
    color: var(--color-destructive);
  }
  .settings-card > p {
    margin: 0;
  }
  .run-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--color-border);
  }
  .status-card,
  .result-card,
  .error-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: var(--radius-md);
  }
  .status-card {
    background: var(--color-info-bg);
    color: var(--color-info);
  }
  .result-card {
    justify-content: space-between;
    background: var(--color-success-bg);
    color: var(--color-success);
  }
  .result-card > div {
    display: flex;
    flex-direction: column;
  }
  .result-card span {
    font-size: 12px;
  }
  .error-card {
    background: color-mix(in srgb, var(--color-destructive) 10%, transparent);
    color: var(--color-destructive);
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .pages {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pages article {
    display: grid;
    grid-template-columns: 1fr 1fr;
    max-width: 140px;
    border: 1px solid var(--color-border);
    padding: 8px;
  }
  .pages img {
    grid-column: 1/-1;
    max-width: 120px;
    height: 170px;
    object-fit: contain;
  }
  .pages span {
    grid-column: 1/-1;
  }
  .signature {
    border: 1px solid var(--color-border);
    background: white;
    max-width: 100%;
    touch-action: none;
  }
  @media (max-width: 680px) {
    .pdf-page {
      padding: 14px;
    }
    .run-row {
      align-items: stretch;
      flex-direction: column;
    }
    .upload-card {
      grid-template-columns: 42px minmax(0, 1fr);
    }
    .upload-card > .file-button {
      grid-column: 1 / -1;
    }
    .load-row {
      grid-template-columns: 1fr;
    }
    .settings-card {
      grid-template-columns: 1fr;
    }
    .settings-card > * {
      grid-column: 1 !important;
    }
    .range-input-row {
      grid-template-columns: 1fr;
    }
    .range-presets .dbx-btn {
      flex: 1;
    }
    .file-row {
      grid-template-columns: 28px 24px minmax(0, 1fr) auto auto;
    }
    .file-size {
      grid-column: 2;
    }
  }
</style>
