<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { applyCaseStyle, CASE_STYLES } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
</script>

<div class="page">
  <textarea class="dbx-textarea area" spellcheck="false" bind:value={input} placeholder="helloWorld example"></textarea>

  <div class="rows">
    {#each CASE_STYLES as style (style.id)}
      {@const value = applyCaseStyle(input, style.id)}
      <div class="row">
        <span class="name">{t(style.zh, style.en)}</span>
        <input class="dbx-input mono" readonly value={value} />
        <CopyButton {locale} text={value} labelZh={`复制${style.zh}`} labelEn={`Copy ${style.en}`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
  }
  .area {
    min-height: 64px;
    max-height: 160px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
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
