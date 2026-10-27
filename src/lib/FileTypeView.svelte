<script>
  import { localizeError, pick } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import { extensionMatches, fileExtension, fileTypeReport, identifyFileType, lookupFileTypes } from "./fileType.js";
  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const MAX_BYTES = 100 * 1024 * 1024;
  let info = $state(null); let fileName = $state(""); let fileSize = $state(0); let reportedType = $state(""); let error = $state(""); let loading = $state(false); let reports = $state([]); let query = $state("");
  const lookup = $derived(lookupFileTypes(query));
  const extensionState = $derived(info ? extensionMatches(info, fileName) : null);
  async function inspectFiles(files) {
    const selected = [...(files || [])]; if (!selected.length) return;
    if (selected.length > 50 || selected.some((file)=>file.size > MAX_BYTES) || selected.reduce((sum,file)=>sum+file.size,0)>250*1024*1024) { error = t("最多 50 个文件、单文件 100 MB、总计 250 MB。", "Up to 50 files, 100 MB each, and 250 MB total."); return; }
    loading = true; error = ""; info = null; reports=[];
    try {
      const next=[]; for(const file of selected){const bytes=new Uint8Array(await file.slice(0,1024*1024).arrayBuffer());const detected=identifyFileType(bytes);next.push(fileTypeReport(detected,file));}
      reports=next; const first=next[0]; info=first.detected;fileName=first.fileName;fileSize=first.size;reportedType=first.browserMime;
    } catch (cause) { error = localizeError(locale, cause); }
    finally { loading = false; }
  }
  function onFile(event) { const files = [...(event.currentTarget.files || [])]; event.currentTarget.value = ""; void inspectFiles(files); }
  function onDrop(event) { event.preventDefault(); void inspectFiles(event.dataTransfer?.files); }
  const size = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
</script>

<div class="page">
  <label class="drop file-button" ondragover={(event)=>event.preventDefault()} ondrop={onDrop}>
    <input type="file" multiple onchange={onFile} disabled={loading} />
    <strong>{loading ? t("正在识别…", "Identifying…") : t("选择或拖入文件", "Choose or drop a file")}</strong>
    <span>{t("批量按内容识别；最多 50 个、单文件 100 MB", "Batch content inspection; up to 50 files, 100 MB each")}</span>
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
    {#if reports.length>1}<section class="batch"><div class="headline"><strong>{t("批量检测报告","Batch inspection report")}</strong><CopyButton {locale} text={JSON.stringify(reports,null,2)} labelZh="复制 JSON 报告" labelEn="Copy JSON report" /></div>{#each reports as report}<div class:bad={report.disguisedExtension} class="batch-row"><span>{report.fileName}</span><code>{report.detected.mime}</code><span>{report.disguisedExtension?t("扩展名伪装告警","Extension mismatch"):t("匹配","Match")}</span></div>{/each}</section>{/if}
  {/if}
  <section class="lookup"><label>{t("扩展名 / MIME 双向查询","Extension / MIME lookup")}<input class="dbx-input" bind:value={query} placeholder="png / application/pdf" /></label>{#if query}<div>{#each lookup as item}<span><b>.{item.extensions.join(" / .")}</b><code>{item.mime}</code></span>{/each}{#if !lookup.length}<small>{t("没有匹配项","No matches")}</small>{/if}</div>{/if}</section>
</div>

<style>
  .page{max-width:920px;display:flex;flex-direction:column;gap:14px}.drop{position:relative;min-height:170px;display:grid;place-content:center;gap:8px;padding:24px;border:1px dashed var(--color-border);border-radius:12px;background:var(--color-card);cursor:pointer;text-align:center}.drop:hover{border-color:var(--color-primary)}.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop span,.headline span{color:var(--color-muted-foreground);font-size:12px}.result,.batch,.lookup{display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--color-border);border-radius:12px}.headline{display:flex;align-items:center;justify-content:space-between;gap:12px}.headline>div{min-width:0;display:flex;flex-direction:column;gap:4px}.confidence{padding:4px 8px;border-radius:999px;background:var(--color-muted)}.confidence.high{color:var(--color-success)}dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}dl div{min-width:0;padding:10px;border-radius:8px;background:var(--color-muted)}dt{color:var(--color-muted-foreground);font-size:11px}dd{margin:4px 0 0;overflow-wrap:anywhere;font-size:13px}.warning,.match,.error{margin:0;padding:9px 11px;border-radius:8px;font-size:12px}.warning,.error{color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 9%,transparent)}.match{color:var(--color-success);background:color-mix(in srgb,var(--color-success) 9%,transparent)}.batch-row{display:grid;grid-template-columns:minmax(120px,1fr) minmax(160px,1fr) 110px;gap:8px;padding:7px;border-top:1px solid var(--color-border);font-size:12px}.batch-row.bad{color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 7%,transparent)}.lookup label{display:flex;flex-direction:column;gap:6px;font-size:12px}.lookup>div{display:grid;grid-template-columns:1fr 1fr;gap:6px}.lookup>div span{display:flex;justify-content:space-between;gap:8px;padding:7px;background:var(--color-muted);border-radius:6px;font-size:11px}@media(max-width:600px){dl,.lookup>div{grid-template-columns:1fr}.batch-row{grid-template-columns:1fr}}
</style>
