<script>
  import { pick } from "./i18n.js";
  import { lineDiffParts } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let left = $state("");
  let right = $state("");
  const parts = $derived(lineDiffParts(left, right));
</script>

<div class="page">
  <div class="editors">
    <label class="col">
      <span class="dbx-label caption">{t("左侧", "Left")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" bind:value={left}></textarea>
    </label>
    <label class="col">
      <span class="dbx-label caption">{t("右侧", "Right")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" bind:value={right}></textarea>
    </label>
  </div>
  <div class="diff">
    <span class="dbx-label caption">{t("差异", "Diff")}</span>
    <pre class="out">{#each parts as part, i (`${i}-${part.mark}`)}<span class={part.mark}>{part.mark === "add" ? "+" : part.mark === "del" ? "-" : " "} {part.line}{"\n"}</span>{/each}</pre>
  </div>
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
  }
  .editors {
    flex: 1 1 46%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
  }
  .col,
  .diff {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
  }
  .diff {
    flex: 1 1 40%;
  }
  .caption {
    color: var(--color-muted-foreground);
  }
  .area,
  .out {
    flex: 1;
    min-height: 0;
    margin: 0;
    resize: none;
    line-height: 1.5;
  }
  .out {
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md);
    background: var(--color-card, var(--color-background, Canvas));
    white-space: pre;
    font-family: var(--font-mono);
  }
  .add {
    color: var(--color-success);
    background: var(--color-success-bg);
  }
  .del {
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
  }

  @media (max-width: 720px) {
    .editors {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
