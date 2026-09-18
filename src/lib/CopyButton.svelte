<script>
  import { chrome, pick } from "./i18n.js";
  import { copyText } from "./clipboard.js";

  let { locale = "zh-CN", text = "", labelZh = "复制", labelEn = "Copy" } = $props();

  let copied = $state(false);

  const t = (zh, en) => pick(locale, zh, en);
  const title = $derived(copied ? t(chrome.copied.zh, chrome.copied.en) : t(labelZh, labelEn));

  async function copy() {
    if (!text) return;
    try {
      await copyText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 1200);
    } catch {
      copied = false;
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
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
  {/if}
</button>

<style>
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
