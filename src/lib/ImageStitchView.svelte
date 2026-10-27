<script>
  import ColorPicker from "./ColorPicker.svelte";
  import { onDestroy } from "svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { createTaskGate, imageInputError, reorderList, validateCanvasSize, validateImageFiles } from "./imageBatch.js";
  import { saveBlobThroughHost } from "./fileSave.js";

  let { locale = "zh-CN" } = $props(); const t = (zh, en) => pick(locale, zh, en);
  let items = $state([]); let direction = $state("horizontal"); let gap = $state(12); let padding = $state(16); let background = $state("#ffffff"); let alignment = $state("center"); let columns = $state(3); let outputFormat = $state("png"); let quality = $state(90); let outputUrl = $state(""); let outputBlob = $state(null); let error = $state(""); let busy = $state(false); let pointerDrag = $state(null);
  const directions = ["horizontal", "vertical", "grid"].map((value) => ({ value, label: t({ horizontal: "横向", vertical: "纵向", grid: "网格" }[value], value) }));
  const alignments = ["start", "center", "end"].map((value) => ({ value, label: t({ start: "起始", center: "居中", end: "末端" }[value], value) }));
  const formats = ["png", "jpeg", "webp"].map((value) => ({ value, label: value.toUpperCase() })); const tasks = createTaskGate();

  onDestroy(() => { tasks.cancel(); items.forEach((item) => URL.revokeObjectURL(item.url)); if (outputUrl) URL.revokeObjectURL(outputUrl); });
  async function onFiles(event) {
    error = "";
    let pending = [];
    try {
      const files = validateImageFiles(event.currentTarget.files, { min: 2, max: 30 });
      pending = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
      const decoded = await Promise.all(pending.map(async (item) => ({ ...item, image: await loadImage(item.file) })));
      for (const item of items) URL.revokeObjectURL(item.url);
      items = decoded;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = ""; outputBlob = null;
      await render();
    } catch (cause) {
      pending.forEach((item) => URL.revokeObjectURL(item.url));
      error = imageInputError(cause, t);
      event.currentTarget.value = "";
    }
  }
  function loadImage(file) { return new Promise((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("无法读取其中一张图片", "Could not read one of the images"))); }; image.src = url; }); }
  function move(index, delta) { const target = index + delta; if (target < 0 || target >= items.length) return; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; items = next; void render(); }
  function reorder(sourceIndex, targetIndex, after = false) { const next = reorderList(items, sourceIndex, targetIndex, after); if (next.every((item, index) => item === items[index])) return; items = next; void render(); }
  function pointerDown(event, index) {
    if (event.button !== 0) return;
    const row = event.currentTarget.closest("article"); const rect = row.getBoundingClientRect();
    pointerDrag = { pointerId: event.pointerId, sourceIndex: index, targetIndex: index, after: false, active: false, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, width: rect.width, height: rect.height, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
  }
  function pointerMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) { pointerDrag = null; return; }
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.active && distance < 5) return;
    if (!pointerDrag.active) event.currentTarget.setPointerCapture?.(event.pointerId);
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-queue-index]"); const rect = hit?.getBoundingClientRect();
    pointerDrag = { ...pointerDrag, active: true, x: event.clientX - pointerDrag.offsetX, y: event.clientY - pointerDrag.offsetY, targetIndex: hit ? Number(hit.dataset.queueIndex) : pointerDrag.targetIndex, after: rect ? event.clientY > rect.top + rect.height / 2 : pointerDrag.after };
    document.getSelection()?.removeAllRanges(); event.preventDefault();
  }
  function pointerEnd(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const current = pointerDrag; pointerDrag = null; event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (current.active) reorder(current.sourceIndex, current.targetIndex, current.after);
  }
  function pointerCancel(event) { if (pointerDrag?.pointerId === event.pointerId) pointerDrag = null; }
  function pointerLeave() { if (pointerDrag && !pointerDrag.active) pointerDrag = null; }
  function keyMove(event, index) { if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return; event.preventDefault(); move(index, event.key === "ArrowUp" ? -1 : 1); }
  async function render() {
    if (!items.length) return; const token = tasks.begin(); busy = true; error = "";
    try {
      const safeGap = Math.max(0, Number(gap) || 0); const edge = Math.max(0, Number(padding) || 0); let width; let height; const cells = [];
      const alignOffset = (available, size) => alignment === "end" ? available - size : alignment === "center" ? (available - size) / 2 : 0;
      if (direction === "vertical") { const contentW = Math.max(...items.map((item) => item.image.naturalWidth)); width = contentW + edge * 2; height = items.reduce((sum, item) => sum + item.image.naturalHeight, 0) + safeGap * (items.length - 1) + edge * 2; let y = edge; items.forEach((item) => { cells.push([item, edge + alignOffset(contentW, item.image.naturalWidth), y]); y += item.image.naturalHeight + safeGap; }); }
      else if (direction === "grid") { const columnCount = Math.max(1, Math.min(items.length, Math.floor(Number(columns) || 1))); const rows = Math.ceil(items.length / columnCount); const cellW = Math.max(...items.map((item) => item.image.naturalWidth)); const cellH = Math.max(...items.map((item) => item.image.naturalHeight)); width = columnCount * cellW + safeGap * (columnCount - 1) + edge * 2; height = rows * cellH + safeGap * (rows - 1) + edge * 2; items.forEach((item, index) => cells.push([item, edge + index % columnCount * (cellW + safeGap) + alignOffset(cellW, item.image.naturalWidth), edge + Math.floor(index / columnCount) * (cellH + safeGap) + alignOffset(cellH, item.image.naturalHeight)])); }
      else { const contentH = Math.max(...items.map((item) => item.image.naturalHeight)); width = items.reduce((sum, item) => sum + item.image.naturalWidth, 0) + safeGap * (items.length - 1) + edge * 2; height = contentH + edge * 2; let x = edge; items.forEach((item) => { cells.push([item, x, edge + alignOffset(contentH, item.image.naturalHeight)]); x += item.image.naturalWidth + safeGap; }); }
      ({ width, height } = validateCanvasSize(width, height));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); context.fillStyle = background; context.fillRect(0, 0, width, height); cells.forEach(([item, x, y]) => context.drawImage(item.image, x, y));
      const mime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[outputFormat] || "image/png";
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, Math.max(.1, Math.min(1, Number(quality) / 100)))); if (!blob) throw new Error("Could not encode image");
      if (!tasks.isCurrent(token)) return;
      if (outputUrl) URL.revokeObjectURL(outputUrl); outputBlob = blob; outputUrl = URL.createObjectURL(blob);
    } catch (cause) { if (tasks.isCurrent(token)) error = imageInputError(cause, t); } finally { if (tasks.isCurrent(token)) busy = false; }
  }
  async function save() { if (!outputBlob) return; const extension = outputFormat === "jpeg" ? "jpg" : outputFormat; try { await saveBlobThroughHost(outputBlob, { fileName: `stitched.${extension}`, mimeType: outputBlob.type, title: t("保存拼接图片", "Save stitched image"), binary: true }); } catch (cause) { error = localizeError(locale, cause); } }
</script>

<div class="page">
  <div class="toolbar"><label class="dbx-btn file">{items.length ? t("更换图片", "Replace images") : t("选择多张图片", "Choose images")}<input type="file" accept="image/*" multiple onchange={onFiles}/></label>{#if outputBlob}<button class="dbx-btn dbx-btn--primary" type="button" onclick={save}>{t("导出", "Export")} {outputFormat.toUpperCase()}</button>{/if}</div>
  {#if !items.length}<label class="drop file-button">{t("选择 2–30 张图片开始拼接", "Choose 2–30 images to start stitching")}<input type="file" accept="image/*" multiple onchange={onFiles}/></label>{:else}<div class="workspace"><aside><div class="pair"><label>{t("布局", "Layout")}<Select bind:value={direction} options={directions} onchange={render}/></label><label>{t("对齐", "Alignment")}<Select bind:value={alignment} options={alignments} onchange={render}/></label></div>{#if direction === "grid"}<label>{t("列数", "Columns")}<input class="dbx-input" type="number" min="1" max={items.length} step="1" bind:value={columns} onchange={render}/></label>{/if}<div class="pair"><label>{t("间距", "Gap")}<input class="dbx-input" type="number" min="0" max="500" bind:value={gap} onchange={render}/></label><label>{t("边距", "Padding")}<input class="dbx-input" type="number" min="0" max="500" bind:value={padding} onchange={render}/></label></div><div class="pair"><label>{t("格式", "Format")}<Select bind:value={outputFormat} options={formats} onchange={render}/></label><label>{t("背景", "Background")}<ColorPicker bind:value={background} onchange={render} {locale} /></label></div>{#if outputFormat !== "png"}<label>{t("质量", "Quality")} · {quality}%<input type="range" min="10" max="100" bind:value={quality} onchange={render}/></label>{/if}<div class="queue">{#each items as item,index (item.url)}<article class:dragging={pointerDrag?.active && pointerDrag.sourceIndex === index} class:drop-before={pointerDrag?.active && pointerDrag.targetIndex === index && pointerDrag.sourceIndex !== index && !pointerDrag.after} class:drop-after={pointerDrag?.active && pointerDrag.targetIndex === index && pointerDrag.sourceIndex !== index && pointerDrag.after} data-queue-index={index}><button class="drag" type="button" title={t("拖动或使用上下方向键排序", "Drag or use Up/Down to reorder")} aria-label={t("拖动或使用上下方向键排序", "Drag or use Up/Down to reorder")} onpointerdown={(event) => pointerDown(event,index)} onpointermove={pointerMove} onpointerup={pointerEnd} onpointercancel={pointerCancel} onpointerleave={pointerLeave} onkeydown={(event) => keyMove(event,index)}>⠿</button><img src={item.url} alt=""/><span>{item.file.name}</span><button type="button" onclick={() => move(index,-1)} aria-label={t("前移", "Move earlier")}>↑</button><button type="button" onclick={() => move(index,1)} aria-label={t("后移", "Move later")}>↓</button></article>{/each}</div></aside><main>{#if outputUrl}<img src={outputUrl} alt={t("拼接结果", "Stitched result")}/>{:else}<span>{busy ? t("处理中…", "Working…") : t("暂无结果", "No result")}</span>{/if}</main></div>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

{#if pointerDrag?.active}
  <div class="drag-ghost" style:left={`${pointerDrag.x}px`} style:top={`${pointerDrag.y}px`} style:width={`${pointerDrag.width}px`} style:height={`${pointerDrag.height}px`} aria-hidden="true">⠿<img src={items[pointerDrag.sourceIndex]?.url} alt=""/><span>{items[pointerDrag.sourceIndex]?.file.name}</span></div>
{/if}

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px}.toolbar{display:flex;justify-content:space-between}.file,.drop{position:relative;overflow:hidden;cursor:pointer}.file input,.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop{display:grid;flex:1;min-height:300px;place-items:center;border:1px dashed var(--color-border);border-radius:12px;color:var(--color-muted-foreground)}.workspace{display:grid;grid-template-columns:300px minmax(0,1fr);gap:12px;flex:1;min-height:0}.workspace aside{display:flex;flex-direction:column;gap:10px;overflow:auto;padding:14px;border:1px solid var(--color-border);border-radius:10px}.workspace label{display:flex;flex-direction:column;gap:5px;font-size:12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.workspace main{display:grid;min-height:360px;place-items:center;overflow:auto;border:1px solid var(--color-border);border-radius:10px;background:var(--color-muted)}.workspace main>img{max-width:100%;max-height:100%;object-fit:contain}.queue{display:flex;flex-direction:column;gap:5px}.queue article{display:grid;grid-template-columns:22px 38px minmax(0,1fr) 28px 28px;align-items:center;gap:5px;border-radius:5px;transition:opacity 100ms,box-shadow 100ms}.queue article.dragging{opacity:.4}.queue article.drop-before{box-shadow:inset 0 2px 0 var(--color-primary)}.queue article.drop-after{box-shadow:inset 0 -2px 0 var(--color-primary)}.queue img,.drag-ghost img{width:38px;height:38px;object-fit:cover;border-radius:5px}.queue span,.drag-ghost span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.queue button{border:1px solid var(--color-border);border-radius:5px;background:transparent;color:inherit}.queue .drag{height:38px;padding:0;border-color:transparent;color:var(--color-muted-foreground);cursor:grab;touch-action:none}.queue .drag:active{cursor:grabbing}.drag-ghost{position:fixed;z-index:120;display:grid;grid-template-columns:22px 38px minmax(0,1fr);align-items:center;gap:5px;padding:0 5px;border:1px solid var(--color-primary);border-radius:6px;background:var(--color-card);box-shadow:var(--dbx-shadow-md);pointer-events:none}.error{color:var(--color-destructive)}@media(max-width:760px){.workspace{grid-template-columns:1fr}.workspace aside{max-height:none}}
</style>
