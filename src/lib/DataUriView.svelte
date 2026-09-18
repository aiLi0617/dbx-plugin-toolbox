<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import { chrome, pick } from "./i18n.js";
  import { toDataUri } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let mime = $state("text/plain;charset=utf-8");
  let input = $state("");
  const uri = $derived(input ? toDataUri(input, mime) : "");
  const image = $derived(mime.trim().toLowerCase().startsWith("image/") && uri ? uri : "");
</script>

<div class="page">
  <label class="field">
    <span>{t("MIME", "MIME")}</span>
    <input class="dbx-input" spellcheck="false" placeholder="text/plain;charset=utf-8" bind:value={mime} />
  </label>
  <IoSplit {locale} bind:input output={uri} inputLabel={t("文本", "Text")} outputLabel="Data URI" />
  {#if image}
      <div class="caption-row">
        <span class="caption">{t("预览", "Preview")}</span>
        <CopyButton {locale} text={uri} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
      </div>
    <div class="preview"><img alt="" src={image} /></div>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    max-width: 420px;
    flex-shrink: 0;
  }
  .preview {
    flex-shrink: 0;
    padding: 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .preview img {
    display: block;
    max-width: 240px;
    max-height: 160px;
  }
</style>
