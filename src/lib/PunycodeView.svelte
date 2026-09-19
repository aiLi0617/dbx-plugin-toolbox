<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { punycodePair } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const pair = $derived.by(() => {
    try { return { ...punycodePair(input), error: "" }; }
    catch { return { unicode: "", ace: "", error: t("请输入有效域名（Unicode 或 xn-- 编码）", "Enter a valid Unicode or xn-- domain") }; }
  });
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("域名", "Domain")}</span>
    <input class="dbx-input mono" spellcheck="false" placeholder="例子.example" bind:value={input} />
  </label>
  {#if pair.error}<p class="dbx-hint" role="alert">{pair.error}</p>{/if}
  <div class="rows">
    <div class="row">
      <span class="name">Unicode</span>
      <input class="dbx-input mono" readonly value={pair.unicode} />
      <CopyButton {locale} text={pair.unicode} labelZh="复制 Unicode" labelEn="Copy Unicode" />
    </div>
    <div class="row">
      <span class="name">ACE</span>
      <input class="dbx-input mono" readonly value={pair.ace} />
      <CopyButton {locale} text={pair.ace} labelZh="复制 ACE" labelEn="Copy ACE" />
    </div>
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 560px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label,
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .label {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
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
