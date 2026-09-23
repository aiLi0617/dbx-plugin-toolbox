<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { alignSideBySideRows, decorateInlineLineChanges, diffParts } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let left = $state("");
  let right = $state("");
  let mode = $state("lines");
  let layout = $state("stacked");
  let ignoreWhitespace = $state(false);
  let ignoreCase = $state(false);
  const inputError = $derived(inputLimitError(left, INPUT_LIMITS.diff, t("左侧输入", "Left input")) || inputLimitError(right, INPUT_LIMITS.diff, t("右侧输入", "Right input")));
  const parts = $derived(inputError ? [] : diffParts(left, right, { mode, ignoreWhitespace, ignoreCase }));
  const patchText = $derived(parts.map((part) => `${part.mark === "add" ? "+" : part.mark === "del" ? "-" : " "}${part.value}`).join(""));
  const lineRows = $derived.by(() => {
    if (mode !== "lines" || inputError) return [];
    const rows = [];
    for (const part of parts) {
      const split = part.value.endsWith("\n") || part.value.includes("\n")
        ? part.value.replace(/\n$/, "").split("\n")
        : [part.value];
      for (const line of split) {
        rows.push({
          mark: part.mark,
          line,
          pfx: part.mark === "add" ? "+" : part.mark === "del" ? "-" : " ",
        });
      }
    }
    return decorateInlineLineChanges(rows);
  });
  const sideLineRows = $derived(alignSideBySideRows(lineRows));

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
      <div class="caption-actions">
        <div class="layout-switch" role="group" aria-label={t("差异", "Diff")}>
          <button class="dbx-btn" type="button" aria-pressed={layout === "stacked"} onclick={() => (layout = "stacked")}>{t("上下对比", "Top/bottom")}</button>
          <button class="dbx-btn" type="button" aria-pressed={layout === "side"} onclick={() => (layout = "side")}>{t("左右对比", "Side by side")}</button>
        </div>
        <CopyButton {locale} text={patchText} labelZh="复制差异" labelEn="Copy diff" />
      </div>
    </div>
    {#if layout === "side" && mode === "lines"}
      <div class="out side-lines" aria-label={t("差异", "Diff")}>
        {#each sideLineRows as pair, i (i)}
          <div class="side-row">
            <div class="row side-cell {pair.left?.mark ?? 'empty'}">
              {#if pair.left}<span class="pfx" aria-hidden="true">{pair.left.pfx}</span><span class="text">{#each pair.left.segments as segment}<span class:inline-change={segment.mark !== "same"} class={segment.mark}>{segment.value}</span>{/each}</span>{/if}
            </div>
            <div class="row side-cell {pair.right?.mark ?? 'empty'}">
              {#if pair.right}<span class="pfx" aria-hidden="true">{pair.right.pfx}</span><span class="text">{#each pair.right.segments as segment}<span class:inline-change={segment.mark !== "same"} class={segment.mark}>{segment.value}</span>{/each}</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    {:else if layout === "side"}
      <div class="side-inline">
        <pre class="out inline" aria-label={t("左侧", "Left")}>{#each parts as part, i (i)}{#if part.mark !== "add"}<span class={part.mark}>{part.value}</span>{/if}{/each}</pre>
        <pre class="out inline" aria-label={t("右侧", "Right")}>{#each parts as part, i (i)}{#if part.mark !== "del"}<span class={part.mark}>{part.value}</span>{/if}{/each}</pre>
      </div>
    {:else if mode === "lines"}
      <div class="out lines" aria-label={t("差异", "Diff")}>
        {#each lineRows as row, i (`${i}-${row.mark}-${row.line}`)}
          <div class="row {row.mark}"><span class="pfx" aria-hidden="true">{row.pfx}</span><span class="text">{#each row.segments as segment}<span class:inline-change={segment.mark !== "same"} class={segment.mark}>{segment.value}</span>{/each}</span></div>
        {/each}
      </div>
    {:else}
      <pre class="out inline">{#each parts as part, i (i)}<span class={part.mark}>{part.value}</span>{/each}</pre>
    {/if}
  </div>
</div>

<style>
  .page { container-type: inline-size; flex: 1; min-height: 0; display: flex; flex-direction: column; gap: var(--ui-gap, 12px); }
  .diff-controls { display: grid; grid-template-columns: 160px minmax(0, 1fr); align-items: end; gap: 12px; flex-shrink: 0; min-width: 0; }
  .diff-mode { display: flex; flex-direction: column; gap: var(--ui-field-gap, 6px); min-width: 0; }
  .diff-mode > .dbx-label { min-height: var(--ui-caption, 20px); color: var(--color-muted-foreground); }
  .diff-mode :global(.dbx-custom-select) { width: 100%; min-width: 0; }
  .diff-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; }
  .diff-check { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; min-height: 30px; font-size: 12px; white-space: nowrap; }
  .editors { flex: 1 1 46%; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ui-gap, 12px); align-items: stretch; }
  .col, .diff { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--ui-field-gap, 6px); }
  .diff { flex: 1 1 40%; }
  .caption { color: var(--color-muted-foreground); }
  .caption-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .caption-actions, .layout-switch { display: flex; align-items: center; }
  .caption-actions { gap: 8px; }
  .layout-switch .dbx-btn { border-radius: 0; }
  .layout-switch .dbx-btn:first-child { border-radius: var(--radius-md) 0 0 var(--radius-md); }
  .layout-switch .dbx-btn:last-child { margin-left: -1px; border-radius: 0 var(--radius-md) var(--radius-md) 0; }
  .area, .out { flex: 1; min-height: 0; margin: 0; resize: none; line-height: 1.5; }
  .out { overflow: auto; padding: 10px 12px; border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent))); border-radius: var(--radius-md); background: var(--color-card, var(--color-background, Canvas)); white-space: pre-wrap; font-family: var(--font-mono); }
  .out.lines { display: flex; flex-direction: column; gap: 0; padding: 6px 0; white-space: normal; }
  .out.side-lines { display: flex; flex-direction: column; gap: 0; padding: 6px 0; white-space: normal; }
  .side-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .side-cell:first-child { border-right: 1px solid var(--color-border); }
  .side-cell.empty { min-height: calc(1.5em + 2px); background: var(--color-muted); opacity: 0.45; }
  .side-inline { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ui-gap, 12px); }
  .row { display: grid; grid-template-columns: 1.25rem minmax(0, 1fr); column-gap: 2px; padding: 1px 10px; white-space: pre-wrap; word-break: break-word; }
  .pfx { opacity: 0.7; user-select: none; }
  .out.inline :global(span) { border-radius: 2px; }
  .add { color: var(--color-success); background: var(--color-success-bg); }
  .del { color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 12%, transparent); text-decoration: line-through; }
  .row.del { text-decoration: none; }
  .row .text :global(span) { color: inherit; background: transparent; text-decoration: none; }
  .row .text :global(.inline-change.add) { background: color-mix(in srgb, var(--color-success) 32%, transparent); }
  .row .text :global(.inline-change.del) { background: color-mix(in srgb, var(--color-destructive) 26%, transparent); text-decoration: line-through; }
  /* The tool pane can be narrow while the host window is still wide (for example
     when the sidebar is open), so respond to this view's width, not the viewport. */
  @container (max-width: 720px) {
    .diff-controls { grid-template-columns: minmax(0, 1fr); }
    .editors { grid-template-columns: minmax(0, 1fr); }
  }
  @container (max-width: 520px) {
    .caption-row { align-items: flex-start; }
    .caption-actions { flex-wrap: wrap; justify-content: flex-end; }
    .layout-switch .dbx-btn { padding-inline: 8px; }
  }
</style>
