<script>
  import { tokenizeCode } from "./codeHighlight.js";

  let {
    value = $bindable(""),
    language = "sql",
    placeholder = "",
    readonly = false,
  } = $props();

  let textareaEl = $state(null);
  let highlightEl = $state(null);

  const overlayTokens = $derived(tokenizeCode(value, language));

  function syncScroll() {
    if (highlightEl && textareaEl) {
      highlightEl.scrollTop = textareaEl.scrollTop;
      highlightEl.scrollLeft = textareaEl.scrollLeft;
    }
  }

  function onKeydown(event) {
    if (readonly || event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const ta = event.currentTarget;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    value = value.slice(0, start) + "  " + value.slice(end);
    queueMicrotask(() => {
      ta.selectionStart = ta.selectionEnd = start + 2;
    });
  }
</script>

<div class="code-editor">
  <pre class="code-highlight" bind:this={highlightEl} aria-hidden="true">{#each overlayTokens as tok, ti (`${ti}-${tok.type}`)}<span class="tok tok-{tok.type}">{tok.text}</span>{/each}</pre>
  {#if readonly}
    <textarea
      class="code-textarea readonly"
      bind:this={textareaEl}
      value={value}
      {placeholder}
      readonly
      spellcheck="false"
      onscroll={syncScroll}
    ></textarea>
  {:else}
    <textarea
      class="code-textarea"
      bind:this={textareaEl}
      bind:value
      {placeholder}
      spellcheck="false"
      onscroll={syncScroll}
      onkeydown={onKeydown}
    ></textarea>
  {/if}
</div>

<style>
  .code-editor {
    --code-pad-y: 8px;
    --code-pad-x: 10px;
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-background, Canvas);
    color: var(--color-foreground, CanvasText);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.55;
  }
  .code-editor:focus-within {
    outline: 2px solid var(--color-ring, var(--color-primary));
    outline-offset: 1px;
    border-color: var(--color-ring, var(--color-primary));
  }
  .code-highlight,
  .code-textarea {
    box-sizing: border-box;
    margin: 0;
    border: 0;
    padding: var(--code-pad-y) var(--code-pad-x);
    font: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
    tab-size: 2;
    scrollbar-gutter: stable;
  }
  .code-highlight {
    position: absolute;
    inset: 0;
    overflow: auto;
    pointer-events: none;
    scrollbar-width: none;
    color: inherit;
  }
  .code-highlight::-webkit-scrollbar {
    display: none;
  }
  .code-textarea {
    position: relative;
    z-index: 1;
    flex: 1;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    resize: none;
    background: transparent;
    color: transparent;
    caret-color: var(--color-foreground, CanvasText);
    overflow: auto;
  }
  .code-textarea:focus {
    outline: none;
  }
  .code-textarea::placeholder {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 45%, transparent));
  }
  .code-textarea::selection {
    color: transparent;
    background: color-mix(in srgb, var(--color-primary, #2563eb) 28%, transparent);
  }
  .code-textarea.readonly {
    cursor: default;
  }

  .tok-comment {
    color: #008000;
  }
  .tok-keyword,
  .tok-boolean,
  .tok-null {
    color: #0000ff;
  }
  .tok-string,
  .tok-entity {
    color: #a31515;
  }
  .tok-number {
    color: #098658;
  }
  .tok-tag {
    color: #800000;
  }
  .tok-attr,
  .tok-key {
    color: #e50000;
  }
  .tok-ident,
  .tok-punct,
  .tok-text,
  .tok-ws {
    color: inherit;
  }

  :global([data-dbx-theme="dark"]) .tok-comment {
    color: #6a9955;
  }
  :global([data-dbx-theme="dark"]) .tok-keyword {
    color: #c586c0;
  }
  :global([data-dbx-theme="dark"]) .tok-boolean,
  :global([data-dbx-theme="dark"]) .tok-null {
    color: #569cd6;
  }
  :global([data-dbx-theme="dark"]) .tok-string,
  :global([data-dbx-theme="dark"]) .tok-entity {
    color: #ce9178;
  }
  :global([data-dbx-theme="dark"]) .tok-number {
    color: #b5cea8;
  }
  :global([data-dbx-theme="dark"]) .tok-tag {
    color: #569cd6;
  }
  :global([data-dbx-theme="dark"]) .tok-attr,
  :global([data-dbx-theme="dark"]) .tok-key {
    color: #9cdcfe;
  }
</style>
