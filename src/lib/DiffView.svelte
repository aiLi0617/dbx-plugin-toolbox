<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { diffParts } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let left = $state("");
  let right = $state("");
  let mode = $state("lines");
  let ignoreWhitespace = $state(false);
  let ignoreCase = $state(false);
  const inputError = $derived(inputLimitError(left, INPUT_LIMITS.diff, t("左侧输入", "Left input")) || inputLimitError(right, INPUT_LIMITS.diff, t("右侧输入", "Right input")));
  const parts = $derived(inputError ? [] : diffParts(left, right, { mode, ignoreWhitespace, ignoreCase }));
  const patchText = $derived(parts.map((part) => `${part.mark === "add" ? "+" : part.mark === "del" ? "-" : " "}${part.value}`).join(""));

  function swap() {
    const previous = left;
    left = right;
    right = previous;
  }
</script>

<div class="page">
  <div class="diff-controls">
    <label class="diff-mode">
      <span class="dbx-label">{t("粒度", "Granularity")}</span>
      <Select bind:value={mode} options={[
        { value: "lines", label: t("行", "Lines") },
        { value: "words", label: t("单词", "Words") },
        { value: "chars", label: t("字符", "Characters") },
      ]} />
    </label>
    <div class="diff-actions">
      <label class="diff-check"><input type="checkbox" bind:checked={ignoreWhitespace} /><span>{t("忽略空白差异", "Ignore whitespace")}</span></label>
      <label class="diff-check"><input type="checkbox" bind:checked={ignoreCase} /><span>{t("忽略大小写", "Ignore case")}</span></label>
      <button class="dbx-btn" type="button" onclick={swap}>{t("交换左右", "Swap")}</button>
    </div>
  </div>

  <div class="editors">
    <label class="col">
      <span class="dbx-label caption">{t("左侧", "Left")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.diff} bind:value={left}></textarea>
    </label>
    <label class="col">
      <span class="dbx-label caption">{t("右侧", "Right")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.diff} bind:value={right}></textarea>
    </label>
  </div>
  {#if inputError}<p class="error" role="alert">{inputError}</p>{/if}
  <div class="diff">
    <div class="caption-row">
      <span class="dbx-label caption">{t("差异", "Diff")}</span>
      <CopyButton {locale} text={patchText} labelZh="复制差异" labelEn="Copy diff" />
    </div>
    <pre class="out" class:inline={mode !== "lines"}>{#each parts as part, i (i)}<span class={part.mark}>{part.value}</span>{/each}</pre>
  </div>
</div>

<style>
  .page { container-type: inline-size; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--ui-gap, 12px); }
  .diff-controls { display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: end; gap: 12px; flex-shrink: 0; min-width: 0; }
  .diff-mode { display: flex; flex-direction: column; gap: var(--ui-field-gap, 6px); min-width: 0; }
  .diff-mode > .dbx-label { min-height: var(--ui-caption, 20px); color: var(--color-muted-foreground); }
  .diff-mode :global(.dbx-select) { width: 100%; min-width: 0; }
  .diff-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; }
  .diff-check { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; min-height: 30px; font-size: 12px; white-space: nowrap; }
  .editors { flex: 1 1 46%; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ui-gap, 12px); align-items: stretch; }
  .col, .diff { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--ui-field-gap, 6px); }
  .diff { flex: 1 1 40%; }
  .caption { color: var(--color-muted-foreground); }
  .area, .out { flex: 1; min-height: 0; margin: 0; resize: none; line-height: 1.5; }
  .out { overflow: auto; padding: 10px 12px; border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent))); border-radius: var(--radius-md); background: var(--color-card, var(--color-background, Canvas)); white-space: pre-wrap; font-family: var(--font-mono); }
  .out.inline :global(span) { border-radius: 2px; }
  .add { color: var(--color-success); background: var(--color-success-bg); }
  .del { color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 12%, transparent); text-decoration: line-through; }
  /* The tool pane can be narrow while the host window is still wide (for example
     when the sidebar is open), so respond to this view's width, not the viewport. */
  @container (max-width: 720px) {
    .diff-controls { grid-template-columns: minmax(0, 1fr); }
    .editors { grid-template-columns: minmax(0, 1fr); }
  }
</style>
