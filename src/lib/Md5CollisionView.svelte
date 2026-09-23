<script>
  import { pick } from "./i18n.js";
  import { hashBytes } from "./tools/generate.js";
  import { bytesEqual, classifyMd5Comparison } from "./collision.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const MAX_BYTES = 16 * 1024 * 1024;
  let files = $state([null, null]);
  let digests = $state(["", ""]);
  let error = $state("");
  let checking = $state(false);
  let runId = 0;
  const status = $derived(classifyMd5Comparison(digests[0], digests[1], files[0] && files[1] ? bytesEqual(files[0].bytes, files[1].bytes) : false));

  async function selectFile(index, event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) { error = t("单个文件不能超过 16 MB。", "Each file is limited to 16 MB."); return; }
    const currentRun = ++runId;
    checking = true; error = ""; digests[index] = "";
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const digest = await hashBytes("md5", bytes);
      if (currentRun !== runId) return;
      files[index] = { name: file.name, size: file.size, bytes };
      digests[index] = digest;
      files = [...files]; digests = [...digests];
    } catch (cause) { if (currentRun === runId) error = cause?.message || String(cause); }
    finally { if (currentRun === runId) checking = false; }
  }

  function clear() { runId += 1; files = [null, null]; digests = ["", ""]; error = ""; checking = false; }
  const size = (value) => value < 1024 ? `${value} B` : value < 1048576 ? `${(value / 1024).toFixed(1)} KB` : `${(value / 1048576).toFixed(2)} MB`;
</script>

<div class="page">
  <div class="intro"><strong>{t("MD5 碰撞检查", "MD5 collision check")}</strong><span>{t("只有“摘要相同、字节不同”才判定为碰撞；相同文件不会误报。", "A collision requires equal digests but different bytes; identical files are not reported as a collision.")}</span></div>
  <div class="files">
    {#each [0, 1] as index}
      <label class="drop">
        <input type="file" onchange={(event) => selectFile(index, event)} disabled={checking} />
        <strong>{files[index]?.name || t(`选择文件 ${index + 1}`, `Choose file ${index + 1}`)}</strong>
        {#if files[index]}<span>{size(files[index].size)}</span><code>{digests[index]}</code>{:else}<span>{t("点击选择，最大 16 MB", "Click to choose, up to 16 MB")}</span>{/if}
      </label>
    {/each}
  </div>
  {#if checking}<div class="notice neutral" role="status">{t("正在计算 MD5…", "Computing MD5…")}</div>{/if}
  {#if error}<div class="notice bad" role="alert">{error}</div>{/if}
  {#if status === "collision"}<div class="notice danger"><strong>{t("检测到 MD5 碰撞", "MD5 collision detected")}</strong><span>{t("两个文件内容不同，但 MD5 摘要完全相同。不要使用 MD5 做安全校验。", "The files differ but have exactly the same MD5 digest. Do not use MD5 for security checks.")}</span></div>
  {:else if status === "identical"}<div class="notice good"><strong>{t("文件完全相同", "Files are identical")}</strong><span>{t("摘要和逐字节内容均相同，不属于碰撞。", "Both the digest and every byte match; this is not a collision.")}</span></div>
  {:else if status === "different-hash"}<div class="notice good"><strong>{t("未发现碰撞", "No collision found")}</strong><span>{t("两个文件的 MD5 摘要不同。", "The two MD5 digests are different.")}</span></div>{/if}
  <button class="dbx-btn" type="button" onclick={clear} disabled={!files[0] && !files[1]}>{t("清空", "Clear")}</button>
</div>

<style>
  .page{max-width:860px;display:flex;flex-direction:column;gap:14px}.intro,.notice{display:flex;flex-direction:column;gap:5px;padding:12px;border:1px solid var(--color-border);border-radius:10px}.intro span,.drop span,.notice span{color:var(--color-muted-foreground);font-size:12px}.files{display:grid;grid-template-columns:1fr 1fr;gap:12px}.drop{position:relative;min-width:0;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:18px;border:1px dashed var(--color-border);border-radius:12px;background:var(--color-card);cursor:pointer;text-align:center}.drop:hover{border-color:var(--color-primary)}.drop input{position:absolute;inset:0;opacity:0;cursor:pointer}.drop strong{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.drop code{max-width:100%;overflow-wrap:anywhere;font-size:11px}.notice.good{border-color:color-mix(in srgb,var(--color-success) 45%,var(--color-border));background:color-mix(in srgb,var(--color-success) 8%,transparent)}.notice.danger,.notice.bad{border-color:color-mix(in srgb,var(--color-destructive) 45%,var(--color-border));background:color-mix(in srgb,var(--color-destructive) 8%,transparent)}.notice.neutral{color:var(--color-muted-foreground)}button{align-self:flex-start}@media(max-width:620px){.files{grid-template-columns:1fr}}
</style>
