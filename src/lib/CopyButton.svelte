<script>
  import { chrome, L, pick } from "./i18n.js";
  import { copyText } from "./clipboard.js";

  let {
    locale = "zh-CN",
    text = "",
    labelZh = "复制",
    labelEn = "Copy",
    label = null,
  } = $props();

  let copied = $state(false);
  let failed = $state(false);

  const t = (zh, en) => pick(locale, zh, en);
  const defaultLabel = L("Copy", "复制", "複製", "Copiar", "Copia", "コピー", "Copiar");
  const labelText = $derived(label ? pick(locale, label) : (labelZh !== "复制" || labelEn !== "Copy" ? t(labelZh, labelEn) : pick(locale, defaultLabel)));
  const title = $derived(copied ? pick(locale, chrome.copied) : labelText);

  async function copy() {
    if (!text) return;
    failed = false;
    try {
      await copyText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1200);
    } catch {
      copied = false;
      failed = true;
    }
  }
</script>

<button
  class="dbx-btn dbx-btn--ghost copy-btn"
  disabled={!text}
  onclick={copy}
  title={title}
  aria-label={title}
  type="button"
>
  {#if copied}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"></path>
    </svg>
  {:else if failed}
    <span aria-hidden="true">!</span>
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
  {/if}
</button>
<span class="copy-status" role="status" aria-live="polite">{#if copied}{pick(locale, chrome.copied)}{:else if failed}{pick(locale, chrome.copyFailed)}{/if}</span>
{#if failed}<span class="copy-error" role="alert">{pick(locale, chrome.copyFailed)}</span>{/if}

<style>
  .copy-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
  .copy-error { font-size: 11px; color: var(--color-destructive); grid-column: 1 / -1; }
  .copy-btn {
    width: 30px;
    padding: 0;
    flex-shrink: 0;
  }
  :global(.caption-row) .copy-btn {
    width: var(--ui-caption, 20px);
    height: var(--ui-caption, 20px);
    min-height: var(--ui-caption, 20px);
  }
</style>
