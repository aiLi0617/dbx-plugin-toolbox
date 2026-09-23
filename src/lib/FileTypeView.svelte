<script>
  import { pick } from "./i18n.js";
  import { extensionMatches, fileExtension, identifyFileType } from "./fileType.js";
  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const MAX_BYTES = 100 * 1024 * 1024;
  let info = $state(null); let fileName = $state(""); let fileSize = $state(0); let reportedType = $state(""); let error = $state(""); let loading = $state(false);
  const extensionState = $derived(info ? extensionMatches(info, fileName) : null);
  async function inspect(file) {
    if (!file) return;
    if (file.size > MAX_BYTES) { error = t("文件不能超过 100 MB。", "Files are limited to 100 MB."); return; }
    loading = true; error = ""; info = null;
    try {
      const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
      info = identifyFileType(bytes); fileName = file.name; fileSize = file.size; reportedType = file.type || "";
    } catch (cause) { error = cause?.message || String(cause); }
    finally { loading = false; }
  }
  function onFile(event) { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void inspect(file); }
  function onDrop(event) { event.preventDefault(); void inspect(event.dataTransfer?.files?.[0]); }
  const size = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
</script>

<div class="page">
  <label class="drop" ondragover={(event)=>event.preventDefault()} ondrop={onDrop}>
    <input type="file" onchange={onFile} disabled={loading} />
    <strong>{loading ? t("正在识别…", "Identifying…") : t("选择或拖入文件", "Choose or drop a file")}</strong>
    <span>{t("根据文件内容识别，不依赖文件名；最大 100 MB", "Identifies content, not the filename; up to 100 MB")}</span>
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if info}
    <section class="result">
      <div class="headline"><div><strong>{info.name}</strong><span>{fileName} · {size(fileSize)}</span></div><span class:high={info.confidence === "high"} class="confidence">{t("置信度", "Confidence")}: {info.confidence}</span></div>
      <dl>
        <div><dt>{t("检测 MIME", "Detected MIME")}</dt><dd><code>{info.mime}</code></dd></div>
        <div><dt>{t("建议扩展名", "Suggested extension")}</dt><dd>{info.extensions.length ? info.extensions.map((item)=>`.${item}`).join(" / ") : "—"}</dd></div>
        <div><dt>{t("浏览器报告", "Browser reported")}</dt><dd><code>{reportedType || t("未提供", "Not provided")}</code></dd></div>
        <div><dt>{t("识别依据", "Evidence")}</dt><dd>{info.detail}</dd></div>
      </dl>
      {#if extensionState === false}<div class="warning">{t(`文件名扩展名 .${fileExtension(fileName)} 与检测结果不一致。`, `The .${fileExtension(fileName)} filename extension does not match the detected content.`)}</div>
      {:else if extensionState === true}<div class="match">✓ {t("扩展名与内容匹配", "Extension matches the content")}</div>{/if}
    </section>
  {/if}
</div>

<style>
  .page{max-width:820px;display:flex;flex-direction:column;gap:14px}.drop{position:relative;min-height:170px;display:grid;place-content:center;gap:8px;padding:24px;border:1px dashed var(--color-border);border-radius:12px;background:var(--color-card);cursor:pointer;text-align:center}.drop:hover{border-color:var(--color-primary)}.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop span,.headline span{color:var(--color-muted-foreground);font-size:12px}.result{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--color-border);border-radius:12px}.headline{display:flex;align-items:center;justify-content:space-between;gap:12px}.headline>div{min-width:0;display:flex;flex-direction:column;gap:4px}.confidence{padding:4px 8px;border-radius:999px;background:var(--color-muted)}.confidence.high{color:var(--color-success)}dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}dl div{min-width:0;padding:10px;border-radius:8px;background:var(--color-muted)}dt{color:var(--color-muted-foreground);font-size:11px}dd{margin:4px 0 0;overflow-wrap:anywhere;font-size:13px}.warning,.match,.error{margin:0;padding:9px 11px;border-radius:8px;font-size:12px}.warning,.error{color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 9%,transparent)}.match{color:var(--color-success);background:color-mix(in srgb,var(--color-success) 9%,transparent)}@media(max-width:600px){dl{grid-template-columns:1fr}}
</style>
