<script>
  import { onDestroy, untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { invoke } from "./host.js";
  import { encodeCanvasImage } from "./imageGenerate.js";
  import { buildZipStore } from "./zipStore.js";
  import { clampInteger, compressionRatio, dataUrlParts, gridSlices } from "./imageUtility.js";

  let { locale = "zh-CN", toolId = "image-pixelate" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const modes = [
    { value: "pixelate", label: t("像素化", "Pixelate") },
    { value: "grid", label: t("多格切图", "Grid slicer") },
    { value: "compress", label: t("压缩", "Compress") },
    { value: "base64", label: "Base64" },
  ];
  const formatOptions = [
    { value: "image/jpeg", label: "JPEG" },
    { value: "image/webp", label: "WebP" },
    { value: "image/png", label: "PNG" },
  ];
  const modeForTool = (id) => ({ "image-pixelate": "pixelate", "image-grid": "grid", "image-compress": "compress", "image-base64": "base64" }[id] || "pixelate");
  let mode = $state(untrack(() => modeForTool(toolId)));
  let file = $state(null); let image = $state(null); let sourceUrl = $state(""); let outputUrl = $state(""); let outputBlob = $state(null); let outputName = $state("");
  let dataUrl = $state(""); let error = $state(""); let busy = $state(false); let saving = $state(false);
  let pixelSize = $state(12); let rows = $state(3); let columns = $state(3); let quality = $state(75); let outputFormat = $state("image/jpeg");
  const rawBase64 = $derived(dataUrlParts(dataUrl)?.base64 || "");
  const baseName = $derived(String(file?.name || "image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "image");
  const resultRatio = $derived(file && outputBlob ? compressionRatio(file.size, outputBlob.size) : 0);
  const humanSize = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
  const extension = (mime) => mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

  function revoke() { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (outputUrl) URL.revokeObjectURL(outputUrl); sourceUrl = ""; outputUrl = ""; }
  onDestroy(revoke);
  function loadImage(url) { return new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error(t("无法解码图片。", "Could not decode the image."))); value.src = url; }); }
  function readDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(blob); }); }

  async function load(fileValue) {
    if (!fileValue) return;
    const limit = mode === "base64" ? 10 : 30;
    if (fileValue.size > limit * 1024 * 1024) { error = t(`文件不能超过 ${limit} MB。`, `Files are limited to ${limit} MB.`); return; }
    if (!fileValue.type.startsWith("image/")) { error = t("请选择图片文件。", "Choose an image file."); return; }
    busy = true; error = ""; revoke(); outputBlob = null; dataUrl = "";
    try {
      const url = URL.createObjectURL(fileValue); const decoded = await loadImage(url);
      if (decoded.naturalWidth * decoded.naturalHeight > 40_000_000) throw new Error(t("图片不能超过 4000 万像素。", "The image must not exceed 40 megapixels."));
      file = fileValue; image = decoded; sourceUrl = url; dataUrl = await readDataUrl(fileValue);
      busy = false;
      if (mode !== "base64") await generate();
    } catch (cause) { error = cause?.message || String(cause); }
    finally { busy = false; }
  }
  function onFile(event) { const value = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void load(value); }
  function onDrop(event) { event.preventDefault(); void load(event.dataTransfer?.files?.[0]); }
  function canvas(width, height) { const value = document.createElement("canvas"); value.width = width; value.height = height; return value; }
  async function setOutput(blob, name) { if (outputUrl) URL.revokeObjectURL(outputUrl); outputBlob = blob; outputUrl = URL.createObjectURL(blob); outputName = name; }

  async function generate() {
    if (!image || busy) return;
    busy = true; error = "";
    try {
      if (mode === "pixelate") {
        const block = clampInteger(pixelSize, 2, 200, 12);
        const small = canvas(Math.max(1, Math.ceil(image.naturalWidth / block)), Math.max(1, Math.ceil(image.naturalHeight / block)));
        small.getContext("2d").drawImage(image, 0, 0, small.width, small.height);
        const result = canvas(image.naturalWidth, image.naturalHeight); const context = result.getContext("2d"); context.imageSmoothingEnabled = false; context.drawImage(small, 0, 0, result.width, result.height);
        await setOutput(await encodeCanvasImage(result, "image/png"), `${baseName}-pixelated.png`);
      } else if (mode === "compress") {
        const result = canvas(image.naturalWidth, image.naturalHeight); const context = result.getContext("2d");
        if (outputFormat === "image/jpeg") { context.fillStyle = "#fff"; context.fillRect(0, 0, result.width, result.height); }
        context.drawImage(image, 0, 0);
        await setOutput(await encodeCanvasImage(result, outputFormat, Number(quality) / 100), `${baseName}-compressed.${extension(outputFormat)}`);
      } else if (mode === "grid") {
        const entries = [];
        for (const slice of gridSlices(image.naturalWidth, image.naturalHeight, rows, columns)) {
          const piece = canvas(slice.width, slice.height); piece.getContext("2d").drawImage(image, slice.x, slice.y, slice.width, slice.height, 0, 0, slice.width, slice.height);
          const blob = await encodeCanvasImage(piece, "image/png");
          entries.push({ name: `${baseName}-r${slice.row}-c${slice.column}.png`, bytes: new Uint8Array(await blob.arrayBuffer()) });
        }
        const blob = new Blob([buildZipStore(entries)], { type: "application/zip" }); await setOutput(blob, `${baseName}-${rows}x${columns}.zip`);
      }
    } catch (cause) { error = cause?.message || String(cause); }
    finally { busy = false; }
  }
  function changeMode(value) { mode = value; outputBlob = null; if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = ""; if (file && value !== "base64") void generate(); }
  function download(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  async function save() {
    if (!outputBlob || saving) return; saving = true; error = "";
    try {
      if (window.dbxPlugin?.invoke) {
        const encoded = await readDataUrl(outputBlob); await invoke("toolbox/save-file", { fileName: outputName, mimeType: outputBlob.type, data: dataUrlParts(encoded)?.base64 || "", title: t("保存文件", "Save file"), binary: true }, 120000);
      } else download(outputBlob, outputName);
    } catch (cause) { error = cause?.message || String(cause); } finally { saving = false; }
  }
</script>

<div class="page">
  <div class="toolbar">
    <div class="tabs">{#each modes as item}<button type="button" class:active={mode===item.value} onclick={()=>changeMode(item.value)}>{item.label}</button>{/each}</div>
    <label class="dbx-btn file-button">{file ? t("更换图片", "Replace image") : t("选择图片", "Choose image")}<input type="file" accept="image/*" onchange={onFile} /></label>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if !file}<label class="drop" ondragover={(event)=>event.preventDefault()} ondrop={onDrop}><input type="file" accept="image/*" onchange={onFile}/><strong>{t("选择或拖入图片", "Choose or drop an image")}</strong><span>{t("全部处理都在本地完成", "All processing stays local")}</span></label>
  {:else}
    <div class="workspace">
      <aside>
        <div class="file-meta"><strong>{file.name}</strong><span>{image.naturalWidth}×{image.naturalHeight} · {humanSize(file.size)}</span></div>
        {#if mode === "pixelate"}<label>{t("像素块大小", "Pixel block size")} · {pixelSize}px<input type="range" min="2" max="100" bind:value={pixelSize} onchange={generate}/></label>
        {:else if mode === "grid"}<div class="pair"><label>{t("行数", "Rows")}<input class="dbx-input" type="number" min="1" max="20" bind:value={rows}/></label><label>{t("列数", "Columns")}<input class="dbx-input" type="number" min="1" max="20" bind:value={columns}/></label></div><span class="hint">{t(`将生成 ${rows * columns} 张 PNG 并打包为 ZIP`, `Creates ${rows * columns} PNG files in a ZIP`)}</span><button class="dbx-btn" type="button" onclick={generate}>{t("生成切图", "Build slices")}</button>
        {:else if mode === "compress"}<label>{t("输出格式", "Output format")}<Select bind:value={outputFormat} options={formatOptions} onchange={generate}/></label>{#if outputFormat !== "image/png"}<label>{t("质量", "Quality")} · {quality}%<input type="range" min="10" max="100" bind:value={quality} onchange={generate}/></label>{/if}{#if outputBlob}<div class="stats"><span>{humanSize(file.size)} → {humanSize(outputBlob.size)}</span><strong class:negative={resultRatio < 0}>{resultRatio >= 0 ? t(`减小 ${resultRatio}%`, `${resultRatio}% smaller`) : t(`增大 ${Math.abs(resultRatio)}%`, `${Math.abs(resultRatio)}% larger`)}</strong></div>{/if}
        {:else}<div class="base-actions"><CopyButton {locale} text={rawBase64} labelZh="复制纯 Base64" labelEn="Copy raw Base64"/><span>{t("纯 Base64", "Raw Base64")}</span><CopyButton {locale} text={dataUrl} labelZh="复制 Data URL" labelEn="Copy Data URL"/><span>Data URL</span></div><span class="hint">{t(`输出约 ${humanSize(dataUrl.length)}，MIME：${file.type || "image/*"}`, `About ${humanSize(dataUrl.length)} output; MIME: ${file.type || "image/*"}`)}</span>{/if}
        {#if outputBlob}<button class="dbx-btn dbx-btn--primary" type="button" onclick={save} disabled={busy||saving}>{saving ? t("保存中…", "Saving…") : mode === "grid" ? t("保存 ZIP", "Save ZIP") : t("保存结果", "Save result")}</button>{/if}
      </aside>
      <main>
        <article><strong>{t("原图", "Original")}</strong><div class="preview checker"><img src={sourceUrl} alt={t("原图", "Original")}/></div></article>
        {#if mode === "base64"}<article><strong>Data URL</strong><textarea class="dbx-textarea mono" readonly value={dataUrl}></textarea></article>
        {:else if mode === "grid"}<article><strong>{t("切分预览", "Grid preview")}</strong><div class="preview grid-preview"><img src={sourceUrl} alt=""/><span style={`--rows:${rows};--columns:${columns}`}></span></div></article>
        {:else}<article><strong>{busy?t("处理中…","Processing…"):t("结果","Result")}</strong><div class="preview checker">{#if outputUrl}<img src={outputUrl} alt={t("处理结果", "Result")}/>{/if}</div></article>{/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .page{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between}.tabs{display:flex;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.tabs button{padding:7px 12px;border:0;border-right:1px solid var(--color-border);background:transparent;color:inherit;cursor:pointer}.tabs button:last-child{border:0}.tabs button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground);font-weight:600}.file-button,.drop{position:relative;overflow:hidden;cursor:pointer}.file-button input,.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop{flex:1;min-height:260px;display:grid;place-content:center;gap:8px;border:1px dashed var(--color-border);border-radius:12px;text-align:center}.drop span,.hint,.file-meta span{color:var(--color-muted-foreground);font-size:12px}.workspace{flex:1;min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px}.workspace aside{display:flex;flex-direction:column;gap:14px;padding:14px;border:1px solid var(--color-border);border-radius:10px;overflow:auto}.workspace aside label,.file-meta{display:flex;flex-direction:column;gap:6px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.stats{display:flex;justify-content:space-between;padding:10px;border-radius:8px;background:var(--color-muted);font-size:12px}.stats strong{color:var(--color-success)}.stats strong.negative{color:var(--color-destructive)}.base-actions{display:grid;grid-template-columns:32px 1fr;align-items:center;gap:8px}.workspace main{min-width:0;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.workspace article{min-width:0;min-height:0;display:flex;flex-direction:column;gap:7px}.workspace article>strong{font-size:12px}.preview,.workspace textarea{position:relative;flex:1;min-height:320px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--color-border);border-radius:10px}.preview img{display:block;max-width:100%;max-height:100%;object-fit:contain}.checker{background:var(--color-muted)}.grid-preview span{position:absolute;inset:0;background:linear-gradient(to right,transparent calc(100% - 1px),var(--color-primary) 0) 0 0/calc(100% / var(--columns)) 100%,linear-gradient(to bottom,transparent calc(100% - 1px),var(--color-primary) 0) 0 0/100% calc(100% / var(--rows));pointer-events:none}.mono{font-family:var(--font-mono);resize:none}.error{margin:0;padding:9px;color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 8%,transparent);border-radius:8px}@media(max-width:760px){.workspace{grid-template-columns:1fr}.workspace main{grid-template-columns:1fr}.preview,.workspace textarea{min-height:240px}}
</style>
