<script>
  import CopyButton from "./CopyButton.svelte";
  import { gzipCompressText, gzipDecompressText } from "./gzip.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN", demo = null, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let mode = $state("compress");
  let input = $state("");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);
  let stats = $state(null);
  let conversionRevision = 0;
  let appliedDemoRequest = 0;

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest || demo?.input == null) return;
    appliedDemoRequest = demoRequest;
    mode = "compress";
    input = demo.input;
    output = "";
    error = "";
    stats = null;
  });

  function setMode(value) {
    if (value === mode) return;
    mode = value;
    input = output || "";
    output = "";
    error = "";
    stats = null;
  }

  $effect(() => {
    const source = input;
    const operation = mode;
    const revision = ++conversionRevision;
    if (!source) {
      output = "";
      error = "";
      stats = null;
      busy = false;
      return;
    }
    busy = true;
    error = "";
    const timer = setTimeout(async () => {
      try {
        const result = operation === "compress" ? await gzipCompressText(source) : await gzipDecompressText(source);
        if (revision !== conversionRevision) return;
        output = operation === "compress" ? result.base64 : result.text;
        stats = result;
      } catch (cause) {
        if (revision !== conversionRevision) return;
        output = "";
        stats = null;
        error = cause?.message || String(cause);
      } finally {
        if (revision === conversionRevision) busy = false;
      }
    }, 250);
    return () => clearTimeout(timer);
  });

  const humanSize = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
</script>

<div class="page">
  <div class="toolbar">
    <div class="tabs" role="group" aria-label={t("Gzip 操作", "Gzip operation")}>
      <button class:active={mode === "compress"} type="button" onclick={() => setMode("compress")}>{t("压缩", "Compress")}</button>
      <button class:active={mode === "decompress"} type="button" onclick={() => setMode("decompress")}>{t("解压", "Decompress")}</button>
    </div>
    <span class="hint">{mode === "compress" ? t("UTF-8 文本 → Gzip Base64", "UTF-8 text → Gzip Base64") : t("Gzip Base64 → UTF-8 文本", "Gzip Base64 → UTF-8 text")} · {busy ? t("处理中…", "Working…") : t("输入后自动转换", "Updates as you type")}</span>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="editors">
    <label>
      <span>{mode === "compress" ? t("原始文本", "Source text") : t("Gzip Base64", "Gzip Base64")}</span>
      <textarea class="dbx-textarea mono" bind:value={input} spellcheck="false" placeholder={mode === "compress" ? t("输入要压缩的文本", "Enter text to compress") : t("粘贴 Gzip Base64 或 Data URL", "Paste Gzip Base64 or a Data URL")}></textarea>
    </label>
    <label>
      <span>{mode === "compress" ? t("压缩结果", "Compressed result") : t("解压文本", "Decompressed text")}</span>
      <div class="output-wrap">
        <textarea class="dbx-textarea mono" value={output} readonly spellcheck="false"></textarea>
        <CopyButton {locale} text={output} labelZh="复制结果" labelEn="Copy result" />
      </div>
    </label>
  </div>

  {#if stats}<span class="stats">{humanSize(stats.inputBytes)} → {humanSize(stats.outputBytes)}</span>{/if}
</div>

<style>
  .page { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .toolbar { justify-content: space-between; }
  .tabs { display: flex; border: 1px solid var(--color-border); border-radius: 8px; overflow: hidden; }
  .tabs button { border: 0; border-right: 1px solid var(--color-border); background: transparent; color: inherit; padding: 7px 14px; cursor: pointer; }
  .tabs button:last-child { border-right: 0; }
  .tabs button.active { background: var(--dbx-selection-background); color: var(--dbx-selection-foreground); font-weight: 600; }
  .hint, .stats { color: var(--color-muted-foreground); font-size: 12px; }
  .editors { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .editors > label { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 7px; font-size: 12px; font-weight: 600; }
  .editors textarea { flex: 1; min-height: 300px; resize: none; font-weight: 400; }
  .output-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
  .output-wrap textarea { width: 100%; padding-right: 42px; }
  .output-wrap :global(.copy-btn) { position: absolute; top: 8px; right: 8px; }
  .mono { font-family: var(--font-mono); }
  .error { margin: 0; padding: 9px; color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 8%, transparent); border-radius: 8px; }
  .stats { align-self: flex-end; }
  @media (max-width: 720px) { .editors { grid-template-columns: 1fr; } .editors textarea { min-height: 220px; } }
</style>
