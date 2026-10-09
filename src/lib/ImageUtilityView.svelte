<script>
  import { onDestroy } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  import { encodeCanvasImage } from "./imageGenerate.js";
  import { buildZipStore } from "./zipStore.js";
  import { LARGE_DATA_URL_CHARS, base64EncodedLength, clampInteger, compressionRatio, dataUrlParts, gridSlices, imageDataUrlLength, parseBase64Image } from "./imageUtility.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const modes = [
    { value: "pixelate", label: t("像素化", "Pixelate") },
    { value: "grid", label: t("多格切图", "Grid slicer") },
    { value: "compress", label: t("压缩", "Compress") },
    { value: "base64", label: "Base64" },
    { value: "base64-decode", label: t("Base64 转图片", "Base64 to image") },
  ];
  const formatOptions = [
    { value: "image/jpeg", label: "JPEG" },
    { value: "image/webp", label: "WebP" },
    { value: "image/png", label: "PNG" },
  ];
  let mode = $state("pixelate");
  let file = $state(null); let image = $state(null); let sourceUrl = $state(""); let outputUrl = $state(""); let outputBlob = $state(null); let outputName = $state("");
  let error = $state(""); let busy = $state(false); let saving = $state(false);
  let base64Input = $state(""); let decodedMime = $state("");
  let encodedFile = null; let encodedDataUrl = "";
  let pixelSize = $state(12); let rows = $state(3); let columns = $state(3); let quality = $state(75); let outputFormat = $state("image/jpeg");
  const rawBase64Length = $derived(file ? base64EncodedLength(file.size) : 0);
  const encodedDataUrlLength = $derived(file ? imageDataUrlLength(file.size, file.type) : 0);
  const largeDataUrl = $derived(encodedDataUrlLength >= LARGE_DATA_URL_CHARS);
  const baseName = $derived(String(file?.name || "image").replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") || "image");
  const resultRatio = $derived(file && outputBlob ? compressionRatio(file.size, outputBlob.size) : 0);
  const previewGrid = $derived.by(() => {
    if (!image) return { vertical: [], horizontal: [] };
    const safeRows = clampInteger(rows, 1, 20, 3);
    const safeColumns = clampInteger(columns, 1, 20, 3);
    return {
      vertical: Array.from({ length: safeColumns - 1 }, (_, index) => Math.round((index + 1) * image.naturalWidth / safeColumns)),
      horizontal: Array.from({ length: safeRows - 1 }, (_, index) => Math.round((index + 1) * image.naturalHeight / safeRows)),
    };
  });
  const humanSize = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
  const extension = (mime) => mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";

  function revoke() { if (sourceUrl) URL.revokeObjectURL(sourceUrl); if (outputUrl) URL.revokeObjectURL(outputUrl); sourceUrl = ""; outputUrl = ""; encodedFile = null; encodedDataUrl = ""; }
  onDestroy(revoke);
  function loadImage(url) { return new Promise((resolve, reject) => { const value = new Image(); value.onload = () => resolve(value); value.onerror = () => reject(new Error(t("无法解码图片。", "Could not decode the image."))); value.src = url; }); }
  function readDataUrl(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || "")); reader.onerror = reject; reader.readAsDataURL(blob); }); }

  async function imageEncoding(kind) {
    const selected = file;
    if (!selected) return "";
    if (encodedFile !== selected || !encodedDataUrl) {
      const value = await readDataUrl(selected);
      if (file !== selected) throw new Error(t("图片已更换，请重试。", "The image changed; try again."));
      encodedFile = selected;
      encodedDataUrl = value;
    }
    return kind === "base64" ? (dataUrlParts(encodedDataUrl)?.base64 || "") : encodedDataUrl;
  }

  async function load(fileValue) {
    if (!fileValue) return;
    const limit = mode === "base64" ? 10 : 30;
    if (fileValue.size > limit * 1024 * 1024) { error = t(`文件不能超过 ${limit} MB。`, `Files are limited to ${limit} MB.`); return; }
    if (!fileValue.type.startsWith("image/")) { error = t("请选择图片文件。", "Choose an image file."); return; }
    busy = true; error = ""; revoke(); outputBlob = null;
    try {
      const url = URL.createObjectURL(fileValue); const decoded = await loadImage(url);
      if (decoded.naturalWidth * decoded.naturalHeight > 40_000_000) throw new Error(t("图片不能超过 4000 万像素。", "The image must not exceed 40 megapixels."));
      file = fileValue; image = decoded; sourceUrl = url;
      busy = false;
      if (mode !== "base64") await generate();
    } catch (cause) { error = cause?.message || String(cause); }
    finally { busy = false; }
  }
  function onFile(event) { const value = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void load(value); }
  function onDrop(event) { event.preventDefault(); void load(event.dataTransfer?.files?.[0]); }
  function canvas(width, height) { const value = document.createElement("canvas"); value.width = width; value.height = height; return value; }
  async function setOutput(blob, name) { if (outputUrl) URL.revokeObjectURL(outputUrl); outputBlob = blob; outputUrl = URL.createObjectURL(blob); outputName = name; }

  async function decodeBase64() {
    if (!base64Input.trim() || busy) return;
    busy = true; error = ""; decodedMime = "";
    try {
      const decoded = parseBase64Image(base64Input);
      decodedMime = decoded.mime;
      await setOutput(new Blob([decoded.bytes], { type: decoded.mime }), `base64-image.${decoded.extension}`);
    } catch (cause) { error = cause?.message || String(cause); outputBlob = null; if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = ""; }
    finally { busy = false; }
  }

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
  function changeMode(value) { mode = value; outputBlob = null; error = ""; decodedMime = ""; if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = ""; if (file && value !== "base64" && value !== "base64-decode") void generate(); }
  function download(blob, name) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); }
  async function save() {
    if (!outputBlob || saving) return; saving = true; error = "";
    try {
      if (window.dbxPlugin?.invoke) {
        await saveBlobThroughHost(outputBlob, { fileName: outputName, mimeType: outputBlob.type, title: t("保存文件", "Save file"), binary: true });
      } else download(outputBlob, outputName);
    } catch (cause) { error = cause?.message || String(cause); } finally { saving = false; }
  }
</script>

<div class="page">
  <div class="toolbar">
    <div class="tabs">{#each modes as item}<button type="button" class:active={mode===item.value} onclick={()=>changeMode(item.value)}>{item.label}</button>{/each}</div>
    {#if mode !== "base64-decode"}<label class="dbx-btn file-button">{file ? t("更换图片", "Replace image") : t("选择图片", "Choose image")}<input type="file" accept="image/*" onchange={onFile} /></label>{/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if mode === "base64-decode"}
    <div class="decode-workspace">
      <section>
        <label for="base64-image-input">{t("图片 Base64 或 Data URL", "Image Base64 or Data URL")}</label>
        <textarea id="base64-image-input" class="dbx-textarea mono" bind:value={base64Input} spellcheck="false" placeholder={t("粘贴纯 Base64，或 data:image/...;base64,...", "Paste raw Base64 or data:image/...;base64,...")}></textarea>
        <div class="decode-actions"><button class="dbx-btn dbx-btn--primary" type="button" onclick={decodeBase64} disabled={busy || !base64Input.trim()}>{busy ? t("解码中…", "Decoding…") : t("转换并预览", "Convert and preview")}</button>{#if outputBlob}<button class="dbx-btn" type="button" onclick={save} disabled={saving}>{saving ? t("保存中…", "Saving…") : t("保存图片", "Save image")}</button>{/if}</div>
        <span class="hint">{t("支持 PNG、JPEG、GIF、WebP、BMP、ICO、AVIF，最大 10 MB；会校验真实文件类型。", "Supports PNG, JPEG, GIF, WebP, BMP, ICO, and AVIF up to 10 MB; the actual file type is verified.")}</span>
      </section>
      <article><strong>{t("图片预览", "Image preview")}{decodedMime ? ` · ${decodedMime}` : ""}</strong><div class="preview checker">{#if outputUrl}<img src={outputUrl} alt={t("Base64 解码图片", "Base64 decoded image")}/>{:else}<span class="hint">{t("转换后将在此处显示", "The decoded image will appear here")}</span>{/if}</div></article>
    </div>
  {:else if !file}<label class="drop" ondragover={(event)=>event.preventDefault()} ondrop={onDrop}><input type="file" accept="image/*" onchange={onFile}/><strong>{t("选择或拖入图片", "Choose or drop an image")}</strong><span>{t("全部处理都在本地完成", "All processing stays local")}</span></label>
  {:else}
    <div class="workspace" class:base64-workspace={mode === "base64"}>
      <aside>
        <div class="file-meta"><strong title={file.name}>{file.name}</strong><span>{image.naturalWidth}×{image.naturalHeight} · {humanSize(file.size)}</span></div>
        {#if mode === "pixelate"}<label>{t("像素块大小", "Pixel block size")} · {pixelSize}px<input type="range" min="2" max="100" bind:value={pixelSize} onchange={generate}/></label>
        {:else if mode === "grid"}<div class="pair"><label>{t("行数", "Rows")}<input class="dbx-input" type="number" min="1" max="20" bind:value={rows}/></label><label>{t("列数", "Columns")}<input class="dbx-input" type="number" min="1" max="20" bind:value={columns}/></label></div><span class="hint">{t(`将生成 ${rows * columns} 张 PNG 并打包为 ZIP`, `Creates ${rows * columns} PNG files in a ZIP`)}</span><button class="dbx-btn" type="button" onclick={generate}>{t("生成切图", "Build slices")}</button>
        {:else if mode === "compress"}<label>{t("输出格式", "Output format")}<Select bind:value={outputFormat} options={formatOptions} onchange={generate}/></label>{#if outputFormat !== "image/png"}<label>{t("质量", "Quality")} · {quality}%<input type="range" min="10" max="100" bind:value={quality} onchange={generate}/></label>{/if}{#if outputBlob}<div class="stats"><span>{humanSize(file.size)} → {humanSize(outputBlob.size)}</span><strong class:negative={resultRatio < 0}>{resultRatio >= 0 ? t(`减小 ${resultRatio}%`, `${resultRatio}% smaller`) : t(`增大 ${Math.abs(resultRatio)}%`, `${Math.abs(resultRatio)}% larger`)}</strong></div>{/if}
        {:else}<div class="encoding-section"><span class="section-label">{t("复制编码", "Copy encoding")}</span><div class="encoding-actions"><div class="encoding-row"><div><strong>{t("纯 Base64", "Raw Base64")}</strong><span>{t(`约 ${humanSize(rawBase64Length)}`, `About ${humanSize(rawBase64Length)}`)}</span></div><CopyButton {locale} getText={()=>imageEncoding("base64")} labelZh="复制纯 Base64" labelEn="Copy raw Base64"/></div><div class="encoding-row"><div><strong>Data URL</strong><span>{t(`约 ${humanSize(encodedDataUrlLength)}`, `About ${humanSize(encodedDataUrlLength)}`)}</span></div><CopyButton {locale} getText={()=>imageEncoding("data-url")} labelZh="复制 Data URL" labelEn="Copy Data URL"/></div></div><span class="mime">{file.type || "image/*"}</span></div>{#if largeDataUrl}<span class="warning">{t("超过 2 MB，浏览器地址栏可能截断并显示白块。请粘贴到支持大文本的代码或工具中。", "Over 2 MB. Browser address bars may truncate it and show a white area; paste it into code or a tool that supports large text.")}</span>{/if}{/if}
        {#if outputBlob}<button class="dbx-btn dbx-btn--primary" type="button" onclick={save} disabled={busy||saving}>{saving ? t("保存中…", "Saving…") : mode === "grid" ? t("保存 ZIP", "Save ZIP") : t("保存结果", "Save result")}</button>{/if}
      </aside>
      <main class:single-pane={mode === "base64"}>
        <article><strong>{t("原图", "Original")}</strong><div class="preview checker"><img src={sourceUrl} alt={t("原图", "Original")}/></div></article>
        {#if mode === "grid"}<article><strong>{t("切分预览", "Grid preview")}</strong><div class="preview grid-preview"><svg viewBox={`0 0 ${image.naturalWidth} ${image.naturalHeight}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("带切分网格的原图", "Original image with slicing grid")}><image href={sourceUrl} width={image.naturalWidth} height={image.naturalHeight}/>{#each previewGrid.vertical as x}<line x1={x} y1="0" x2={x} y2={image.naturalHeight}/>{/each}{#each previewGrid.horizontal as y}<line x1="0" y1={y} x2={image.naturalWidth} y2={y}/>{/each}</svg></div></article>
        {:else if mode !== "base64"}<article><strong>{busy?t("处理中…","Processing…"):t("结果","Result")}</strong><div class="preview checker">{#if outputUrl}<img src={outputUrl} alt={t("处理结果", "Result")}/>{/if}</div></article>{/if}
      </main>
    </div>
  {/if}
</div>

<style>
  .page{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px}.toolbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between}.tabs{display:flex;flex-wrap:wrap;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.tabs button{padding:7px 12px;border:0;border-right:1px solid var(--color-border);background:transparent;color:inherit;cursor:pointer}.tabs button:last-child{border:0}.tabs button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground);font-weight:600}.file-button,.drop{position:relative;overflow:hidden;cursor:pointer}.file-button input,.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop{flex:1;min-height:260px;display:grid;place-content:center;gap:8px;border:1px dashed var(--color-border);border-radius:12px;text-align:center}.drop span,.hint,.file-meta span{color:var(--color-muted-foreground);font-size:12px}.workspace{flex:1;min-height:0;display:grid;grid-template-columns:260px minmax(0,1fr);gap:14px}.workspace.base64-workspace{grid-template-columns:300px minmax(0,1fr)}.workspace aside{display:flex;flex-direction:column;gap:14px;padding:14px;border:1px solid var(--color-border);border-radius:10px;overflow:auto}.workspace aside label,.file-meta{display:flex;flex-direction:column;gap:6px}.file-meta strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.stats{display:flex;justify-content:space-between;padding:10px;border-radius:8px;background:var(--color-muted);font-size:12px}.stats strong{color:var(--color-success)}.stats strong.negative{color:var(--color-destructive)}.encoding-section{display:flex;flex-direction:column;gap:8px}.section-label{font-size:12px;font-weight:600}.encoding-actions{display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:9px;overflow:hidden}.encoding-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 8px 10px 12px}.encoding-row+.encoding-row{border-top:1px solid var(--color-border)}.encoding-row>div{min-width:0;display:flex;flex-direction:column;gap:2px}.encoding-row strong{font-size:13px}.encoding-row span,.mime{color:var(--color-muted-foreground);font-size:11px}.mime{align-self:flex-start;padding:3px 7px;border-radius:999px;background:var(--color-muted);font-family:var(--font-mono)}.warning{padding:10px;border-radius:8px;background:color-mix(in srgb,var(--color-primary) 12%,transparent);color:var(--color-foreground);font-size:12px;line-height:1.5}.workspace main{min-width:0;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.workspace main.single-pane{grid-template-columns:minmax(0,1fr)}.workspace article,.decode-workspace article{min-width:0;min-height:0;display:flex;flex-direction:column;gap:7px}.workspace article>strong,.decode-workspace article>strong{font-size:12px}.preview{position:relative;flex:1;min-height:320px;display:grid;place-items:center;overflow:hidden;border:1px solid var(--color-border);border-radius:10px}.preview img{display:block;max-width:100%;max-height:100%;object-fit:contain}.checker{background:var(--color-muted)}.grid-preview svg{display:block;width:100%;height:100%;max-width:100%;max-height:100%}.grid-preview line{stroke:var(--color-primary);stroke-width:1;vector-effect:non-scaling-stroke;pointer-events:none}.mono{font-family:var(--font-mono);resize:none}.error{margin:0;padding:9px;color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 8%,transparent);border-radius:8px}.decode-workspace{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.decode-workspace section{min-width:0;min-height:0;display:flex;flex-direction:column;gap:9px}.decode-workspace section>label,.decode-workspace article>strong{font-size:12px;font-weight:600}.decode-workspace textarea{flex:1;min-height:320px}.decode-actions{display:flex;flex-wrap:wrap;gap:8px}@media(max-width:760px){.workspace,.workspace.base64-workspace,.decode-workspace{grid-template-columns:1fr}.workspace main{grid-template-columns:1fr}.preview,.decode-workspace textarea{min-height:240px}}
</style>
