<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { toBase64 } from "./codec.js";
  import { invoke } from "./host.js";
  import { chrome, pick } from "./i18n.js";
  import { dataUriFromBytes, parseDataUri, toDataUri } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  const MODES = [
    { value: "encode", zh: "生成", en: "Create" },
    { value: "decode", zh: "解析", en: "Parse" },
  ];

  const MIME_PRESETS = [
    { value: "text/plain;charset=utf-8", label: "text/plain" },
    { value: "text/html;charset=utf-8", label: "text/html" },
    { value: "text/css;charset=utf-8", label: "text/css" },
    { value: "text/javascript;charset=utf-8", label: "text/javascript" },
    { value: "application/json;charset=utf-8", label: "application/json" },
    { value: "application/xml;charset=utf-8", label: "application/xml" },
    { value: "image/png", label: "image/png" },
    { value: "image/jpeg", label: "image/jpeg" },
    { value: "image/svg+xml;charset=utf-8", label: "image/svg+xml" },
    { value: "image/webp", label: "image/webp" },
    { value: "custom", label: "Custom…" },
  ];

  const ENCODINGS = [
    { value: "percent", zh: "百分号", en: "Percent" },
    { value: "base64", zh: "Base64", en: "Base64" },
  ];

  let mode = $state("encode");
  let mimePreset = $state("text/plain;charset=utf-8");
  let customMime = $state("");
  let payloadEncoding = $state("percent");
  let input = $state("");
  let fileUri = $state("");
  let fileName = $state("");
  let fileSize = $state(0);
  let fileError = $state("");
  let fileLoading = $state(false);
  let saving = $state(false);
  let saveError = $state("");

  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  const isEncode = $derived(mode === "encode");
  const mime = $derived(
    mimePreset === "custom" ? customMime.trim() || "text/plain;charset=utf-8" : mimePreset,
  );

  const generatedState = $derived.by(() => {
    if (fileUri) return { value: fileUri, error: "" };
    if (!input) return { value: "", error: "" };
    try {
      return { value: toDataUri(input, mime, { encoding: payloadEncoding }), error: "" };
    } catch (error) {
      return { value: "", error: error?.message || String(error) };
    }
  });
  const generated = $derived(generatedState.value);

  const parsed = $derived.by(() => {
    if (isEncode || !input.trim()) return { value: null, error: "" };
    try {
      return { value: parseDataUri(input), error: "" };
    } catch (error) {
      return { value: null, error: error?.message || String(error) };
    }
  });

  const output = $derived(isEncode ? generated : parsed.value?.text || "");
  const error = $derived(isEncode ? generatedState.error : parsed.error);
  const leftPreview = $derived.by(() => {
    if (!isEncode || !fileUri) return "";
    return isPreviewableImage(mime) || isPreviewableImage(fileUriMime(fileUri)) ? fileUri : "";
  });
  const rightPreview = $derived.by(() => {
    if (isEncode) return "";
    if (!parsed.value) return "";
    return isPreviewableImage(parsed.value.mime) ? input.trim() : "";
  });
  const canDownload = $derived.by(() => {
    if (isEncode) return Boolean(fileUri || generated);
    return Boolean(parsed.value);
  });

  function fileUriMime(uri) {
    const match = String(uri || "").match(/^data:([^;,]+)/i);
    return match?.[1] || "";
  }

  function isPreviewableImage(type) {
    return /^(?:image\/(?:png|jpeg|gif|webp|avif|svg\+xml))(?:;|$)/i.test(String(type || "").trim());
  }

  function needsCharset(type) {
    return /^(?:text\/|application\/(?:json|xml|javascript|xhtml\+xml)|image\/svg\+xml)/i.test(String(type || ""));
  }

  function applyFromParsed(value) {
    const type = value.mime || "text/plain";
    const withCharset =
      value.charset && value.charset.toLowerCase() !== "us-ascii" && needsCharset(type)
        ? `${type};charset=${value.charset}`
        : type;
    const exact = MIME_PRESETS.find((item) => item.value === withCharset);
    const byType = MIME_PRESETS.find((item) => item.value === type || item.value.startsWith(`${type};`));
    if (exact) {
      mimePreset = exact.value;
      customMime = "";
    } else if (byType) {
      mimePreset = byType.value;
      customMime = "";
    } else {
      mimePreset = "custom";
      customMime = withCharset;
    }
    payloadEncoding = value.base64 ? "base64" : "percent";
  }

  function clearFile() {
    fileUri = "";
    fileName = "";
    fileSize = 0;
    fileError = "";
    fileLoading = false;
  }

  function clearLeft() {
    input = "";
    clearFile();
  }

  function onLeftInput() {
    if (isEncode) clearFile();
  }

  function setMode(next) {
    if (next === mode) return;

    // Snapshot before flipping mode — derived `parsed` clears once mode is encode.
    const prev = mode;
    const parsedSnap = parsed.value;
    const generatedSnap = generated;
    const inputSnap = input;

    mode = next;

    if (prev === "encode" && next === "decode") {
      const uri = fileUri || generatedSnap;
      clearFile();
      if (uri) input = uri;
      return;
    }

    if (prev === "decode" && next === "encode") {
      clearFile();
      if (parsedSnap?.text) {
        input = parsedSnap.text;
        applyFromParsed(parsedSnap);
      } else if (parsedSnap) {
        // Binary payload → treat as a selected file so generate mode stays usable.
        applyFromParsed(parsedSnap);
        fileUri = inputSnap.trim();
        fileName = `decoded.${extensionFor(parsedSnap.mime)}`;
        fileSize = parsedSnap.size;
        input = "";
      }
    }
  }

  function reencodeFile(nextEncoding) {
    if (!fileUri) return;
    try {
      const current = parseDataUri(fileUri);
      fileUri = dataUriFromBytes(current.bytes, mime, { encoding: nextEncoding });
      payloadEncoding = nextEncoding;
      fileError = "";
    } catch (err) {
      fileError = err?.message || String(err);
      fileUri = "";
      fileSize = 0;
    }
  }

  function onEncodingChange(next) {
    if (next === payloadEncoding) return;
    if (fileUri) {
      reencodeFile(next);
      return;
    }
    payloadEncoding = next;
  }

  function readFile(file) {
    fileError = "";
    if (file.size > MAX_FILE_BYTES) {
      clearFile();
      fileError = t(
        `文件过大（${formatBytes(file.size)}），上限 10 MB`,
        `File too large (${formatBytes(file.size)}); limit is 10 MB`,
      );
      if (mode !== "encode") mode = "encode";
      return;
    }
    fileLoading = true;
    fileName = file.name;
    fileSize = file.size;
    fileUri = "";
    const reader = new FileReader();
    reader.onerror = () => {
      fileLoading = false;
      fileUri = "";
      fileError = t("读取文件失败", "Failed to read file");
    };
    reader.onload = () => {
      fileLoading = false;
      const result = String(reader.result || "");
      if (!result) {
        fileError = t("读取文件失败", "Failed to read file");
        fileUri = "";
        return;
      }
      // data: URL is ~4/3 of raw size; guard against runaway payloads.
      if (result.length > MAX_FILE_BYTES * 2) {
        fileUri = "";
        fileError = t("编码后超过 10 MB 限制", "Encoded payload exceeds the 10 MB limit");
        return;
      }
      fileUri = result;
      fileError = "";
      fileName = file.name;
      fileSize = file.size;
      input = "";
      const type = file.type || "application/octet-stream";
      const preset = MIME_PRESETS.find((item) => item.value === type || item.value.startsWith(`${type};`));
      if (preset) {
        mimePreset = preset.value;
        customMime = "";
      } else {
        mimePreset = "custom";
        customMime = type;
      }
      payloadEncoding = "base64";
      if (mode !== "encode") mode = "encode";
    };
    reader.readAsDataURL(file);
  }

  function onFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) readFile(file);
  }

  function onDrop(event) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  }

  function inPluginHost() {
    return Boolean(window.dbxPlugin?.invoke);
  }

  function downloadFromDataUri(dataUri, name) {
    const link = document.createElement("a");
    link.rel = "noopener";
    link.download = name || "download.bin";
    if (dataUri.length < 1_500_000) {
      link.href = dataUri;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    const current = parseDataUri(dataUri);
    const payload = current.bytes instanceof Uint8Array ? current.bytes.slice() : new Uint8Array(current.bytes || []);
    const blob = new Blob([payload], { type: current.mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    link.href = url;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function downloadCurrent() {
    if (saving || fileLoading) return;
    saveError = "";

    let uri = "";
    let name = "download.bin";
    let typeHint = "application/octet-stream";
    if (isEncode) {
      uri = fileUri || generated;
      if (!uri) return;
      typeHint = fileUriMime(uri) || mime;
      name = fileName || `data.${extensionFor(typeHint)}`;
    } else {
      uri = input.trim();
      if (!uri || !parsed.value) return;
      typeHint = parsed.value.mime;
      name = `decoded.${extensionFor(typeHint)}`;
    }

    saving = true;
    try {
      const current = parseDataUri(uri);
      const bytes =
        current.bytes instanceof Uint8Array
          ? current.bytes
          : new Uint8Array(current.bytes || []);
      const mimeType =
        String(current.mime || typeHint)
          .split(";")[0]
          .trim() || "application/octet-stream";

      if (inPluginHost()) {
        const result = await invoke(
          "toolbox/save-file",
          {
            fileName: name,
            mimeType,
            data: toBase64(bytes),
            title: t("保存文件", "Save file"),
            binary: true,
          },
          120000,
        );
        if (result?.cancelled) return;
        return;
      }

      downloadFromDataUri(uri, name);
    } catch (err) {
      saveError = err?.message || String(err) || t("保存失败", "Save failed");
    } finally {
      saving = false;
    }
  }

  function extensionFor(type) {
    const base = String(type || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const known = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
      "image/avif": "avif",
      "application/json": "json",
      "text/plain": "txt",
      "text/html": "html",
      "text/css": "css",
      "text/javascript": "js",
      "application/javascript": "js",
      "application/xml": "xml",
      "text/xml": "xml",
      "application/pdf": "pdf",
      "application/zip": "zip",
    };
    return known[base] || base.split("/")[1]?.split(/[+]/)[0] || "bin";
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="page">
  <div class="toolbar">
    <div class="seg" role="group" aria-label={t("模式", "Mode")}>
      {#each MODES as item}
        <button
          class:active={mode === item.value}
          aria-pressed={mode === item.value}
          onclick={() => setMode(item.value)}
          type="button"
        >{t(item.zh, item.en)}</button>
      {/each}
    </div>

    <div class="strip">
      {#if isEncode}
        <Select
          bind:value={mimePreset}
          options={MIME_PRESETS.map((item) => ({
            value: item.value,
            label: item.value === "custom" ? t("自定义…", "Custom…") : item.label,
          }))}
          disabled={Boolean(fileUri)}
          ariaLabel={t("MIME 类型", "MIME type")}
        />
        {#if mimePreset === "custom" && !fileUri}
          <input
            class="dbx-input mono custom-mime"
            spellcheck="false"
            placeholder="application/octet-stream"
            bind:value={customMime}
            aria-label={t("自定义 MIME", "Custom MIME")}
          />
        {/if}
        <div class="seg compact" role="group" aria-label={t("输出编码", "Encode as")}>
          {#each ENCODINGS as item}
            <button
              class:active={payloadEncoding === item.value}
              aria-pressed={payloadEncoding === item.value}
              onclick={() => onEncodingChange(item.value)}
              type="button"
            >{t(item.zh, item.en)}</button>
          {/each}
        </div>
      {:else if parsed.value}
        <span class="chip mono">{parsed.value.mime}</span>
        {#if parsed.value.charset && parsed.value.charset.toLowerCase() !== "us-ascii"}
          <span class="chip mono">{parsed.value.charset}</span>
        {/if}
        <span class="chip">{parsed.value.base64 ? "Base64" : t("百分号", "Percent")}</span>
        <span class="chip">{formatBytes(parsed.value.size)}</span>
      {:else}
        <span class="strip-hint">{parsed.error || t("粘贴 Data URI 后显示类型与编码", "Paste a Data URI to inspect type and encoding")}</span>
      {/if}
    </div>

    <div class="actions">
      {#if isEncode}
        {#if fileLoading}
          <span class="file-status" role="status">{t("正在读取…", "Reading…")}</span>
        {:else if fileUri}
          <div class="file-pill" title={fileName}>
            <span class="file-pill-name">{fileName}</span>
            <span class="file-pill-meta">{formatBytes(fileSize)}</span>
            <button class="file-pill-x" type="button" onclick={clearFile} aria-label={t("移除文件", "Remove file")}>×</button>
          </div>
        {:else}
          <label class="file-button dbx-btn" class:disabled={fileLoading}>
            {t("选择文件", "Choose file")}
            <input type="file" onchange={onFile} disabled={fileLoading} />
          </label>
        {/if}
      {/if}
      <button class="dbx-btn" type="button" disabled={!canDownload || fileLoading || saving} onclick={downloadCurrent}>
        {saving ? t("保存中…", "Saving…") : t("下载文件", "Download file")}
      </button>
    </div>
  </div>

  {#if fileError}
    <p class="banner-error" role="alert">{fileError}</p>
  {/if}
  {#if saveError}
    <p class="banner-error" role="alert">{saveError}</p>
  {/if}

  <div class="split">
    <section
      class="pane"
      aria-label={t("输入区，可拖入文件", "Input pane; drop a file here")}
      ondragover={(event) => event.preventDefault()}
      ondrop={onDrop}
    >
      <div class="pane-head">
        <span class="pane-title">
          {#if isEncode}
            {fileUri ? t("文件", "File") : t("文本", "Text")}
          {:else}
            Data URI
          {/if}
        </span>
        <button
          class="dbx-btn dbx-btn--ghost head-btn head-end"
          type="button"
          disabled={!input && !fileUri}
          onclick={clearLeft}
        >{t("清空", "Clear")}</button>
      </div>

      {#if isEncode && fileUri}
        <div class="file-block">
          <div class="file-row" role="status">
            <div class="file-row-text">
              <strong class="file-name" title={fileName}>{fileName}</strong>
              <span class="dim">{formatBytes(fileSize)} · {mime}</span>
            </div>
            <span class="dim hint">{t("拖入可替换", "Drop to replace")}</span>
          </div>
          {#if leftPreview}
            <div class="preview"><img alt={t("预览", "Preview")} src={leftPreview} /></div>
          {/if}
        </div>
      {:else}
        <textarea
          class="dbx-textarea area"
          class:mono={!isEncode}
          spellcheck="false"
          placeholder={isEncode
            ? t("输入文本，或拖入文件（≤10 MB）…", "Enter text, or drop a file (≤10 MB)…")
            : "data:text/plain;charset=utf-8,hello%20world"}
          bind:value={input}
          oninput={onLeftInput}
          aria-label={isEncode ? t("文本", "Text") : "Data URI"}
        ></textarea>
      {/if}
    </section>

    <section class="pane">
      <div class="pane-head">
        <span class="pane-title">{isEncode ? "Data URI" : t("内容", "Content")}</span>
        <span class="head-end">
          <CopyButton
            {locale}
            text={error ? "" : (isEncode ? generated : (parsed.value && !parsed.value.text ? input.trim() : output))}
            labelZh={chrome.copy.zh}
            labelEn={chrome.copy.en}
          />
        </span>
      </div>

      {#if error}
        <pre class="area error" role="alert">{error}</pre>
      {:else if isEncode}
        <textarea
          class="dbx-textarea area out mono"
          readonly
          tabindex="-1"
          placeholder={t("Data URI 会显示在这里", "Data URI appears here")}
          value={generated}
          aria-label="Data URI"
        ></textarea>
      {:else if parsed.value && !parsed.value.text}
        <div class="result-block">
          {#if rightPreview}
            <div class="preview"><img alt={t("预览", "Preview")} src={rightPreview} /></div>
          {:else}
            <div class="binary-hint" role="status">
              <strong>{t("二进制内容", "Binary content")}</strong>
              <span class="dim">{t("无法显示为文本，请使用「下载文件」", "Not textual — use Download file")}</span>
            </div>
          {/if}
        </div>
      {:else}
        <div class="result-block">
          <textarea
            class="dbx-textarea area out"
            class:mono={Boolean(output)}
            readonly
            tabindex="-1"
            placeholder={t("解析结果会显示在这里", "Decoded content appears here")}
            value={output}
            aria-label={t("内容", "Content")}
          ></textarea>
          {#if rightPreview}
            <div class="preview"><img alt={t("预览", "Preview")} src={rightPreview} /></div>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .strip {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1 1 12rem;
    height: 32px;
    overflow: hidden;
  }
  .strip :global(.dbx-custom-select) {
    width: 10.5rem;
    min-width: 0;
    flex: 0 0 auto;
  }
  .custom-mime {
    width: 12rem;
    flex: 0 1 12rem;
    min-width: 0;
    height: 32px;
  }
  .strip-hint {
    font-size: 12px;
    color: var(--color-muted-foreground);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    margin-left: auto;
  }
  .actions > .dbx-btn,
  .actions > .file-button {
    height: 32px;
  }
  .file-status {
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .banner-error {
    margin: 0;
    flex-shrink: 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--color-destructive) 28%, transparent);
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-destructive) 8%, var(--color-background, Canvas));
    color: var(--color-destructive);
    font-size: 12px;
  }

  .file-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 16rem;
    height: 32px;
    padding: 0 4px 0 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
    font-size: 12px;
  }
  .file-pill-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .file-pill-meta {
    flex: 0 0 auto;
    color: var(--color-muted-foreground);
  }
  .file-pill-x {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: var(--radius-sm, 6px);
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
  }
  .file-pill-x:hover {
    background: color-mix(in srgb, var(--color-muted, CanvasText) 10%, transparent);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    max-width: 12rem;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    font-size: 12px;
    color: var(--color-muted-foreground);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .seg {
    display: inline-flex;
    flex-shrink: 0;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
  }
  .seg button {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .seg.compact button {
    padding: 0 8px;
    font-size: 12px;
  }
  .seg button:last-child { border-right: 0; }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }

  .split {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
  }

  .pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pane-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    flex-shrink: 0;
    min-width: 0;
  }
  .pane-title {
    font-size: 12px;
    color: var(--color-muted-foreground);
    white-space: nowrap;
  }
  .head-btn {
    height: 28px;
    min-height: 28px;
    padding: 0 8px;
    font-size: 12px;
  }
  .head-end {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
  }

  .area {
    flex: 1;
    min-height: 0;
    margin: 0;
    resize: none;
    line-height: 1.55;
  }
  .mono,
  .out {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  }
  .out:not(.error) {
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
  }
  .error {
    padding: 10px 12px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-destructive);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 28%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-destructive) 10%, var(--color-background, Canvas));
  }

  .file-block {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
  }
  .file-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    flex-shrink: 0;
    padding: 8px 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 3%, var(--color-background, Canvas));
  }
  .file-row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .file-row .hint {
    flex: 0 0 auto;
    margin-left: auto;
  }
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .dim {
    font-size: 12px;
    color: var(--color-muted-foreground);
  }

  .result-block {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .binary-hint {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border: 1px dashed var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 3%, var(--color-background, Canvas));
  }

  .preview {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    overflow: auto;
  }
  .preview img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .file-button {
    position: relative;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
  }
  .file-button input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  @container (max-width: 640px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(140px, 1fr) minmax(140px, 1fr);
    }
    .actions { margin-left: 0; }
  }
</style>
