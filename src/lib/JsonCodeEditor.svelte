<script>
  import { jsonTextFolds, tokenizeJson, visibleTextLines } from "./jsonOps.js";

  let {
    value = $bindable(""),
    showLineNumbers = true,
    placeholder = "",
  } = $props();

  let textareaEl = $state(null);
  let gutterEl = $state(null);
  let measureEl = $state(null);
  let highlightEl = $state(null);
  let lineCollapsed = $state({});
  let gutterHeights = $state([]);

  const folds = $derived(jsonTextFolds(value));
  const visible = $derived(visibleTextLines(folds.lines, folds.foldable, lineCollapsed));
  const shownText = $derived(visible.map((line) => line.text).join("\n"));
  const hasActiveFolds = $derived(visible.some((line) => line.folded));
  const overlayTokens = $derived(tokenizeJson(hasActiveFolds ? shownText : value));

  $effect(() => {
    const foldable = folds.foldable;
    const stale = Object.keys(lineCollapsed).filter((k) => lineCollapsed[k] && foldable[k] == null);
    if (!stale.length) return;
    const next = { ...lineCollapsed };
    for (const k of stale) delete next[k];
    lineCollapsed = next;
  });

  function measureGutter() {
    const ta = textareaEl;
    const box = measureEl;
    if (!ta || !box) return;
    const cs = getComputedStyle(ta);
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    box.style.width = `${Math.max(40, ta.clientWidth - pad)}px`;
    const rows = visible.length ? visible.map((line) => line.text) : [""];
    gutterHeights = rows.map((line) => {
      box.textContent = line.length ? line : " ";
      return Math.max(20, box.offsetHeight);
    });
  }

  $effect(() => {
    shownText;
    showLineNumbers;
    queueMicrotask(measureGutter);
  });

  $effect(() => {
    const ta = textareaEl;
    if (!ta || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measureGutter());
    ro.observe(ta);
    return () => ro.disconnect();
  });

  function syncScroll() {
    if (gutterEl && textareaEl) gutterEl.scrollTop = textareaEl.scrollTop;
    if (highlightEl && textareaEl) {
      highlightEl.scrollTop = textareaEl.scrollTop;
      highlightEl.scrollLeft = textareaEl.scrollLeft;
    }
  }

  function onKeydown(event) {
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const ta = event.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    value = value.slice(0, start) + "  " + value.slice(end);
    queueMicrotask(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
  }

  function expandFolds() {
    if (!hasActiveFolds) return;
    lineCollapsed = {};
    queueMicrotask(() => textareaEl?.focus());
  }

  function onCopy(event) {
    if (!hasActiveFolds) return;
    event.preventDefault();
    event.clipboardData?.setData("text/plain", value);
  }

  function toggleFold(start, event) {
    event.preventDefault();
    event.stopPropagation();
    lineCollapsed = { ...lineCollapsed, [start]: !lineCollapsed[start] };
    textareaEl?.blur();
  }
</script>

<div class="json-code">
  <div class="json-gutter" class:no-nums={!showLineNumbers} bind:this={gutterEl}>
    {#each visible as line, i (`${line.start}:${line.folded}`)}
      <div class="gutter-row" style:height="{(gutterHeights[i] || 20) + "px"}">
        {#if showLineNumbers}
          <span class="gutter-no">{line.no}</span>
        {/if}
        {#if line.foldable}
          <button
            class="fold-arrow"
            class:closed={line.folded}
            onclick={(event) => toggleFold(line.start, event)}
            onmousedown={(event) => event.preventDefault()}
            type="button"
            tabindex="-1"
            title={line.folded ? "Expand" : "Collapse"}
            aria-label={line.folded ? "Expand" : "Collapse"}
          ></button>
        {:else}
          <span class="fold-arrow-space"></span>
        {/if}
      </div>
    {/each}
  </div>
  <div class="json-edit-stack">
    <pre class="json-highlight" bind:this={highlightEl} aria-hidden="true">{#each overlayTokens as tok, ti (`${ti}-${tok.type}`)}<span class="tok tok-{tok.type}">{tok.text}</span>{/each}</pre>
    {#if hasActiveFolds}
      <textarea
        class="json-textarea"
        bind:this={textareaEl}
        value={shownText}
        {placeholder}
        readonly
        spellcheck="false"
        onscroll={syncScroll}
        onpointerdown={expandFolds}
        onfocus={expandFolds}
        oncopy={onCopy}
      ></textarea>
    {:else}
      <textarea
        class="json-textarea"
        bind:this={textareaEl}
        bind:value
        {placeholder}
        spellcheck="false"
        onscroll={syncScroll}
        onkeydown={onKeydown}
      ></textarea>
    {/if}
  </div>
  <div class="json-measure" bind:this={measureEl} aria-hidden="true"></div>
</div>

<style>
  .json-code {
    --json-pad-y: 10px;
    --json-pad-x: 12px;
    --json-pad-bottom: var(--json-pad-y);
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    font-family: var(--font-mono);
    font-size: var(--dbx-editor-font-size, 13px);
    line-height: 20px;
  }
  .json-gutter {
    flex: 0 0 auto;
    min-width: 3.8em;
    overflow: hidden;
    padding: var(--json-pad-y) 0 var(--json-pad-bottom);
    background: color-mix(in srgb, CanvasText 5%, transparent);
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 48%, transparent));
    user-select: none;
  }
  .json-gutter.no-nums {
    min-width: 22px;
  }
  .gutter-row {
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    box-sizing: border-box;
    padding: 0 4px 0 8px;
  }
  .gutter-no {
    min-width: 1.6em;
    text-align: right;
  }
  .fold-arrow,
  .fold-arrow-space {
    width: 12px;
    height: 12px;
    margin-left: 4px;
    margin-top: 4px;
    flex: 0 0 12px;
  }
  .fold-arrow {
    border: 0;
    padding: 0;
    background: transparent;
    cursor: pointer;
    position: relative;
    color: inherit;
  }
  .fold-arrow::before {
    content: "";
    position: absolute;
    inset: 2px 1px 1px;
    background: var(--color-muted-foreground, color-mix(in srgb, CanvasText 55%, transparent));
    clip-path: polygon(0 0, 100% 0, 50% 100%);
  }
  .fold-arrow.closed::before {
    inset: 1px 2px 1px 3px;
    clip-path: polygon(0 0, 100% 50%, 0 100%);
  }
  .json-edit-stack {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .json-highlight,
  .json-textarea {
    box-sizing: border-box;
    position: absolute;
    inset: 0;
    margin: 0;
    border: 0;
    padding: var(--json-pad-y) var(--json-pad-x) var(--json-pad-bottom);
    font: inherit;
    line-height: 20px;
    tab-size: 2;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .json-highlight {
    overflow: hidden;
    pointer-events: none;
    color: inherit;
  }
  .json-textarea {
    z-index: 1;
    width: auto;
    height: auto;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: var(--color-foreground, CanvasText);
    overflow: auto;
  }
  .json-textarea:focus {
    outline: none;
  }
  .json-textarea::placeholder {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 45%, transparent));
  }
  .json-textarea::selection {
    color: transparent;
    background: color-mix(in srgb, var(--color-primary, #2563eb) 28%, transparent);
  }
  .tok-key,
  .tok-string {
    color: #a31515;
    font-weight: 400;
  }
  .tok-number {
    color: #098658;
  }
  .tok-boolean,
  .tok-null {
    color: #0000ff;
  }
  .tok-punct {
    color: inherit;
  }
  :global([data-dbx-theme="dark"]) .tok-key {
    color: #9cdcfe;
  }
  :global([data-dbx-theme="dark"]) .tok-string {
    color: #ce9178;
  }
  :global([data-dbx-theme="dark"]) .tok-number {
    color: #b5cea8;
  }
  :global([data-dbx-theme="dark"]) .tok-boolean,
  :global([data-dbx-theme="dark"]) .tok-null {
    color: #569cd6;
  }
  .json-measure {
    position: absolute;
    left: 0;
    top: 0;
    visibility: hidden;
    pointer-events: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    font: inherit;
    line-height: 20px;
    padding: 0;
    margin: 0;
  }
</style>
