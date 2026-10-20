<script>
  import { onDestroy } from "svelte";
  import Select from "./Select.svelte";
  import { loadAssetModule } from "./assetModules.js";
  import { createTaskGate, imageDrawRect, imageInputError, validateCanvasSize, validateImageFiles } from "./imageBatch.js";
  import { localizeError, pick } from "./i18n.js";
  import { saveBlobThroughHost } from "./fileSave.js";

  let { locale = "zh-CN" } = $props(); const t = (zh, en) => pick(locale, zh, en);
  let frames = $state([]); let width = $state(480); let height = $state(320); let delay = $state(300); let repeat = $state(0); let colors = $state(128); let fit = $state("contain"); let background = $state("#ffffff"); let outputUrl = $state(""); let outputBlob = $state(null); let busy = $state(false); let progress = $state(""); let error = $state("");
  const tasks = createTaskGate(); const fitOptions = ["contain", "cover", "stretch"].map((value) => ({ value, label: t({ contain: "完整显示", cover: "填满裁切", stretch: "拉伸" }[value], value) }));
  onDestroy(() => { tasks.cancel(); frames.forEach((frame) => URL.revokeObjectURL(frame.url)); if (outputUrl) URL.revokeObjectURL(outputUrl); });
  async function onFiles(event) {
    tasks.cancel(); busy = false;
    error = "";
    let pending = [];
    try {
      const files = validateImageFiles(event.currentTarget.files, { min: 2, max: 60 });
      pending = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
      const decoded = await Promise.all(pending.map(async (frame) => ({ ...frame, image: await loadImage(frame.file) })));
      frames.forEach((frame) => URL.revokeObjectURL(frame.url));
      frames = decoded;
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = ""; outputBlob = null; progress = "";
      width = Math.min(1200, frames[0].image.naturalWidth); height = Math.min(1200, frames[0].image.naturalHeight);
    } catch (cause) {
      pending.forEach((frame) => URL.revokeObjectURL(frame.url));
      error = imageInputError(cause, t);
      event.currentTarget.value = "";
    }
  }
  function loadImage(file) { return new Promise((resolve, reject) => { const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("无法解码其中一张图片", "Could not decode one of the images"))); }; image.src = url; }); }
  function move(index, delta) { const target = index + delta; if (target < 0 || target >= frames.length) return; const next = [...frames]; [next[index], next[target]] = [next[target], next[index]]; frames = next; }
  function remove(index) { if (frames.length <= 2) { error = t("GIF 至少需要两帧", "A GIF requires at least two frames"); return; } const frame = frames[index]; URL.revokeObjectURL(frame.url); frames = frames.filter((_, item) => item !== index); if (outputUrl) URL.revokeObjectURL(outputUrl); outputUrl = ""; outputBlob = null; }
  function cancel() { tasks.cancel(); busy = false; progress = t("已取消", "Cancelled"); }
  async function generate() {
    if (frames.length < 2 || busy) return; const token = tasks.begin(); busy = true; error = ""; progress = t("准备帧…", "Preparing frames…");
    try {
      const { width: w, height: h } = validateCanvasSize(width, height, { maxSide: 1200, maxPixels: 1_440_000 });
      if (w * h * frames.length > 80_000_000) throw new Error(t("帧像素总量超过 8000 万", "Total frame pixels exceed 80 million"));
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; const context = canvas.getContext("2d", { willReadFrequently: true }); const prepared = [];
      for (let i = 0; i < frames.length; i += 1) { if (!tasks.isCurrent(token)) return; progress = t(`准备第 ${i + 1}/${frames.length} 帧`, `Preparing frame ${i + 1}/${frames.length}`); context.fillStyle = background; context.fillRect(0,0,w,h); const rect = imageDrawRect(frames[i].image.naturalWidth, frames[i].image.naturalHeight, w, h, fit); context.drawImage(frames[i].image, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh); prepared.push({ ...context.getImageData(0,0,w,h), delay: Math.max(20, Math.min(10_000, Number(frames[i].delay ?? delay) || 100)) }); await new Promise((resolve) => setTimeout(resolve)); }
      if (!tasks.isCurrent(token)) return; progress = t("编码 GIF…", "Encoding GIF…"); const module = await loadAssetModule("gif"); const blob = module.encodeGif(prepared,w,h,{delay:Number(delay)||100,repeat:Number(repeat)||0,colors:Number(colors)||128});
      if (!tasks.isCurrent(token)) return;
      if (outputUrl) URL.revokeObjectURL(outputUrl); outputBlob = blob; outputUrl = URL.createObjectURL(blob); progress = `${frames.length} ${t("帧", "frames")} · ${(blob.size/1024).toFixed(1)} KB`;
    } catch (cause) { if (tasks.isCurrent(token)) { error = imageInputError(cause, t); progress = ""; } } finally { if (tasks.isCurrent(token)) busy = false; }
  }
  async function save() { if (!outputBlob) return; try { await saveBlobThroughHost(outputBlob,{fileName:"animation.gif",mimeType:"image/gif",title:t("保存 GIF","Save GIF"),binary:true}); } catch(cause){error=localizeError(locale,cause);} }
</script>

<div class="page"><div class="toolbar"><label class="dbx-btn file">{frames.length?t("更换帧","Replace frames"):t("选择图片序列","Choose image sequence")}<input type="file" accept="image/*" multiple onchange={onFiles}/></label><div>{#if outputBlob}<button class="dbx-btn" type="button" onclick={save}>{t("保存 GIF","Save GIF")}</button>{/if}{#if busy}<button class="dbx-btn" type="button" onclick={cancel}>{t("取消","Cancel")}</button>{/if}<button class="dbx-btn dbx-btn--primary" type="button" onclick={generate} disabled={busy||frames.length<2}>{busy?t("处理中…","Working…"):t("生成 GIF","Generate GIF")}</button></div></div>
  {#if !frames.length}<label class="drop file-button">{t("选择 2–60 张图片；文件顺序即帧顺序", "Choose 2–60 images; file order becomes frame order")}<input type="file" accept="image/*" multiple onchange={onFiles}/></label>{:else}<div class="workspace"><aside><div class="pair"><label>{t("宽度","Width")}<input class="dbx-input" type="number" min="1" max="1200" bind:value={width}/></label><label>{t("高度","Height")}<input class="dbx-input" type="number" min="1" max="1200" bind:value={height}/></label></div><div class="pair"><label>{t("适配方式","Fit mode")}<Select bind:value={fit} options={fitOptions}/></label><label>{t("背景","Background")}<input type="color" bind:value={background}/></label></div><label>{t("默认帧时长","Default frame delay")} · {delay} ms<input type="range" min="20" max="2000" step="10" bind:value={delay}/></label><label>{t("颜色数量","Colors")} · {colors}<input type="range" min="16" max="256" step="16" bind:value={colors}/></label><label>{t("循环次数（0 为无限）","Repeat (0 = forever)")}<input class="dbx-input" type="number" min="0" max="100" bind:value={repeat}/></label><div class="frames">{#each frames as frame,index}<article><img src={frame.url} alt=""/><span>{index+1}. {frame.file.name}</span><input class="frame-delay" type="number" min="20" max="10000" step="10" value={frame.delay ?? delay} onchange={(event)=>{frame.delay=Number(event.currentTarget.value);frames=[...frames];}} aria-label={t("此帧时长","Frame delay")}/><button type="button" onclick={()=>move(index,-1)} aria-label={t("前移","Move earlier")}>↑</button><button type="button" onclick={()=>move(index,1)} aria-label={t("后移","Move later")}>↓</button><button type="button" onclick={()=>remove(index)} aria-label={t("删除帧","Remove frame")}>×</button></article>{/each}</div></aside><main>{#if outputUrl}<img src={outputUrl} alt={t("GIF 结果","GIF result")}/>{:else}<span>{progress||t("配置参数后生成","Configure options, then generate")}</span>{/if}</main></div>{/if}{#if progress}<div class="status" role="status">{progress}</div>{/if}{#if error}<div class="error" role="alert">{error}</div>{/if}</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px}.toolbar{display:flex;justify-content:space-between;gap:8px}.toolbar>div{display:flex;gap:8px}.file,.drop{position:relative;overflow:hidden}.file input,.drop input{position:absolute;inset:0;opacity:0}.drop{display:grid;flex:1;min-height:300px;place-items:center;border:1px dashed var(--color-border);border-radius:12px;color:var(--color-muted-foreground)}.workspace{display:grid;grid-template-columns:340px minmax(0,1fr);gap:12px;flex:1;min-height:0}.workspace aside{display:flex;flex-direction:column;gap:12px;overflow:auto;padding:14px;border:1px solid var(--color-border);border-radius:10px}.workspace label{display:flex;flex-direction:column;gap:5px;font-size:12px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.workspace main{display:grid;place-items:center;min-height:360px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-muted)}.workspace main img{max-width:100%;max-height:100%;image-rendering:auto}.frames{display:flex;flex-direction:column;gap:5px}.frames article{display:grid;grid-template-columns:38px minmax(0,1fr) 64px 28px 28px 28px;align-items:center;gap:5px}.frames img{width:38px;height:38px;object-fit:cover}.frames span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.frames button{border:1px solid var(--color-border);background:transparent;color:inherit}.frame-delay{width:64px;min-width:0;padding:4px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-background);color:inherit;font-size:11px}.status{color:var(--color-muted-foreground);font-size:12px}.error{color:var(--color-destructive);font-size:12px}@media(max-width:760px){.workspace{grid-template-columns:1fr}}
</style>
