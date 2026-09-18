<script>
  import { pick } from "./i18n.js";
  import { textStats } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const stats = $derived(textStats(input));
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("文本", "Text")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" bind:value={input}></textarea>
  </label>

  <div class="cards">
    <div class="card">
      <span class="num">{stats.chars}</span>
      <span class="cap">{t("字符", "Chars")}</span>
    </div>
    <div class="card">
      <span class="num">{stats.words}</span>
      <span class="cap">{t("词", "Words")}</span>
    </div>
    <div class="card">
      <span class="num">{stats.lines}</span>
      <span class="cap">{t("行", "Lines")}</span>
    </div>
    <div class="card">
      <span class="num">{stats.bytes}</span>
      <span class="cap">{t("字节", "Bytes")}</span>
    </div>
  </div>
  <p class="hint">{t("词：汉字按字计，英文按单词计。", "Words: each CJK character, or a Latin word.")}</p>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 640px;
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
    min-height: 140px;
    max-height: 360px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .num {
    font-variant-numeric: tabular-nums;
    font-size: 18px;
    font-weight: 600;
  }
  .cap {
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }

  @media (max-width: 560px) {
    .cards {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
