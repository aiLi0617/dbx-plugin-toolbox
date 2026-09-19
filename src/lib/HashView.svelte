<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { HASH_ALGORITHMS, hashBytes, hashText } from "./tools/generate.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  let fileBytes = $state(null);
  let fileName = $state("");
  let expected = $state("");
  let digests = $state(Object.fromEntries(HASH_ALGORITHMS.map((alg) => [alg.id, ""])));
  let errors = $state({});
  let sourceError = $state("");
  let fileLoading = $state(false);
  let computing = $state(false);
  let fileSeq = 0;

  $effect(() => {
    const text = input;
    const bytes = fileBytes;
    digests = Object.fromEntries(HASH_ALGORITHMS.map((alg) => [alg.id, ""]));
    errors = {};
    if (fileLoading || sourceError) { computing = false; return; }
    const limitError = bytes ? "" : inputLimitError(text, INPUT_LIMITS.hash, t("文本输入", "Text input"));
    if (limitError) { sourceError = limitError; computing = false; return; }
    computing = true;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = {};
      const nextErrors = {};
      await Promise.all(
        HASH_ALGORITHMS.map(async (alg) => {
          try {
            next[alg.id] = bytes ? await hashBytes(alg.id, bytes) : await hashText(alg.id, text);
          } catch (err) {
            next[alg.id] = "";
            nextErrors[alg.id] = err?.message || String(err);
          }
        }),
      );
      if (cancelled) return;
      digests = next;
      errors = nextErrors;
      computing = false;
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  const expectedMatch = $derived.by(() => {
    if (computing || fileLoading || sourceError) return null;
    const value = expected.trim().toLowerCase().replace(/\s+/g, "");
    if (!value) return null;
    return Object.entries(digests).find(([, digest]) => digest.toLowerCase() === value)?.[0] || false;
  });

  async function onFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    const seq = ++fileSeq;
    sourceError = "";
    fileBytes = null;
    fileName = "";
    if (file.size > 16 * 1024 * 1024) {
      sourceError = t("文件不能超过 16 MB，请选择较小的文件。", "Files are limited to 16 MB. Choose a smaller file.");
      fileLoading = false;
      return;
    }
    fileLoading = true;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (seq !== fileSeq) return;
      fileName = file.name;
      fileBytes = bytes;
    } catch {
      if (seq === fileSeq) sourceError = t("无法读取文件，请重新选择。", "Could not read the file. Please select it again.");
    } finally { if (seq === fileSeq) fileLoading = false; }
  }

  function clearFile() {
    fileSeq++;
    fileLoading = false;
    sourceError = "";
    fileBytes = null;
    fileName = "";
  }
</script>

<div class="page">
  <div class="block">
    <div class="source-head">
      <span class="label source-label">
        {fileBytes ? t("当前文件", "Current file") : t("文本输入", "Text input")}
        {#if fileLoading || computing}
          <span class="source-status" role="status">{fileLoading ? t("正在读取文件…", "Reading file…") : t("正在计算…", "Computing…")}</span>
        {/if}
      </span>
      {#if fileBytes}
        <button class="dbx-btn" type="button" onclick={clearFile}>{t("改用文本", "Use text")}</button>
      {:else}
        <label class="file-button dbx-btn">
          {t("选择文件", "Choose file")}
          <input type="file" onchange={onFile} />
        </label>
      {/if}
    </div>
    {#if fileBytes}
      <div class="file-row">
        <span class="file-name">{fileName}</span>
        <span class="file-size">{fileBytes.length.toLocaleString()} bytes</span>
      </div>
    {:else}
      <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.hash} bind:value={input} oninput={() => (sourceError = "")} aria-label={t("文本输入", "Text input")}></textarea>
    {/if}
  </div>
  {#if sourceError}<p class="mismatch" role="alert">{sourceError}</p>{/if}

  <div class="controls">
    <label class="expected">
      <span class="label">{t("校验值（可选）", "Expected checksum (optional)")}</span>
      <input class="dbx-input mono" spellcheck="false" bind:value={expected} placeholder="SHA-256 / MD5 / …" />
    </label>
    {#if expectedMatch}
      <span class="match">✓ {HASH_ALGORITHMS.find((item) => item.id === expectedMatch)?.label}</span>
    {:else if expectedMatch === false}
      <span class="mismatch">{t("不匹配", "No match")}</span>
    {/if}
  </div>

  <div class="rows">
    {#each HASH_ALGORITHMS as alg (alg.id)}
      <div class="row">
        <span class="name">{alg.label}</span>
        <input
          class="dbx-input mono"
          class:invalid={Boolean(errors[alg.id])}
          readonly
          placeholder={errors[alg.id] || ""}
          title={errors[alg.id] || ""}
          aria-label={t(`${alg.label} 摘要`, `${alg.label} digest`)}
          value={digests[alg.id]}
        />
        <CopyButton {locale} text={digests[alg.id]} labelZh={`复制 ${alg.label}`} labelEn={`Copy ${alg.label}`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .area {
    min-height: 96px;
    max-height: 240px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .controls, .file-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }
  .source-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 12px; }
  .source-label { display: flex; min-width: 0; align-items: center; gap: 6px; overflow: hidden; white-space: nowrap; }
  .source-status { overflow: hidden; text-overflow: ellipsis; font-weight: 400; }
  .file-row {
    min-height: 48px;
    padding: 10px 12px;
    border: 1px solid var(--color-input, var(--color-border));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .file-name { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
  .file-size { flex: 0 0 auto; color: var(--color-muted-foreground); font-size: 12px; }
  .file-button { position: relative; overflow: hidden; cursor: pointer; }
  .file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .expected { flex: 1 1 100%; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .match { color: var(--color-success); font-size: 12px; }
  .mismatch { color: var(--color-destructive); font-size: 12px; }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .invalid {
    border-color: var(--color-destructive);
    color: var(--color-destructive);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
    }
  }
</style>
