<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { parseDataUri, toDataUri } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let mode = $state("encode");
  let mime = $state("text/plain;charset=utf-8");
  let input = $state("");
  let fileUri = $state("");
  let fileName = $state("");

  const generatedState = $derived.by(() => {
    if (fileUri) return { value: fileUri, error: "" };
    if (!input) return { value: "", error: "" };
    try {
      return { value: toDataUri(input, mime), error: "" };
    } catch (error) {
      return { value: "", error: error?.message || String(error) };
    }
  });
  const generated = $derived(generatedState.value);
  const parsed = $derived.by(() => {
    if (mode !== "decode" || !input.trim()) return { value: null, error: "" };
    try {
      return { value: parseDataUri(input), error: "" };
    } catch (error) {
      return { value: null, error: error?.message || String(error) };
    }
  });
  const output = $derived(mode === "encode" ? generated : parsed.value?.text || "");
  const preview = $derived(
    mode === "encode"
      ? (isPreviewableImage(mime) ? generated : "")
      : (isPreviewableImage(parsed.value?.mime) ? input.trim() : ""),
  );

  function isPreviewableImage(type) {
    return /^(?:image\/(?:png|jpeg|gif|webp|avif))(?:;|$)/i.test(String(type || "").trim());
  }

  function onTextInput() {
    fileUri = "";
    fileName = "";
  }

  function onFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      fileName = t("文件不能超过 10 MB", "Files are limited to 10 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      fileUri = String(reader.result || "");
      fileName = file.name;
      mime = file.type || "application/octet-stream";
      input = "";
    };
    reader.readAsDataURL(file);
  }

  function downloadDecoded() {
    if (!parsed.value) return;
    const blob = new Blob([parsed.value.bytes], { type: parsed.value.mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `decoded.${extensionFor(parsed.value.mime)}`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function extensionFor(type) {
    const known = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg", "application/json": "json", "text/plain": "txt" };
    return known[type] || type.split("/")[1]?.split(/[;+]/)[0] || "bin";
  }
</script>

<div class="page">
  <div class="options">
    <label class="field compact">
      <span>{t("模式", "Mode")}</span>
      <Select bind:value={mode} options={[
        { value: "encode", label: t("生成", "Create") },
        { value: "decode", label: t("解析", "Parse") },
      ]} />
    </label>
    {#if mode === "encode"}
      <label class="field mime">
        <span>{t("MIME", "MIME")}</span>
        <input class="dbx-input" spellcheck="false" placeholder="text/plain;charset=utf-8" bind:value={mime} />
      </label>
      <label class="file-button dbx-btn">
        {t("选择文件", "Choose file")}
        <input type="file" onchange={onFile} />
      </label>
      {#if fileName}<span class="file-name">{fileName}</span>{/if}
    {/if}
  </div>

  <div oninput={onTextInput}>
    <IoSplit
      {locale}
      bind:input
      {output}
      error={mode === "encode" ? generatedState.error : parsed.error}
      inputLabel={mode === "encode" ? t("文本", "Text") : "Data URI"}
      outputLabel={mode === "encode" ? "Data URI" : t("解析文本", "Decoded text")}
    />
  </div>

  {#if mode === "decode" && parsed.value}
    <div class="meta">
      <span>{parsed.value.mime}</span>
      <span>{parsed.value.size.toLocaleString()} bytes</span>
      <span>{parsed.value.base64 ? "Base64" : t("百分号编码", "Percent encoded")}</span>
      <button class="dbx-btn" type="button" onclick={downloadDecoded}>{t("下载原始数据", "Download data")}</button>
    </div>
  {/if}

  {#if preview}
    <div class="caption-row">
      <span class="caption">{t("预览", "Preview")}</span>
      <CopyButton {locale} text={mode === "encode" ? generated : input.trim()} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
    </div>
    <div class="preview"><img alt={t("Data URI 预览", "Data URI preview")} src={preview} /></div>
  {/if}
</div>

<style>
  .page { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .options, .meta { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; flex-shrink: 0; }
  .compact { width: 9rem; flex: 0 0 9rem; }
  .options .compact :global(.dbx-select) { width: 100%; min-width: 0; }
  .mime { min-width: 260px; max-width: 420px; flex: 1; }
  .file-button { position: relative; overflow: hidden; cursor: pointer; }
  .file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .file-name, .meta { font-size: 12px; color: var(--color-muted-foreground); }
  .meta { align-items: center; }
  .preview { flex-shrink: 0; padding: 10px; border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)); border-radius: var(--radius-md, 8px); background: var(--color-card, var(--color-background, Canvas)); }
  .preview img { display: block; max-width: 320px; max-height: 220px; }
</style>
