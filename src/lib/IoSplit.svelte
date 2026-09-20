<script>
  import CodeEditor from "./CodeEditor.svelte";
  import CopyButton from "./CopyButton.svelte";
  import { chrome, pick } from "./i18n.js";

  let {
    locale = "zh-CN",
    input = $bindable(""),
    output = "",
    error = "",
    inputLabel = "",
    outputLabel = "",
    inputPlaceholder = "",
    outputPlaceholder = "",
    outputReadonly = true,
    outputStatus = "",
    language = "",
    orientation = "horizontal",
    onClear = null,
    inputActions = null,
    outputActions = null,
    clearDisabled = undefined,
    maxlength = undefined,
  } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const left = $derived(inputLabel || pick(locale, chrome.input));
  const right = $derived(outputLabel || pick(locale, chrome.output));
  const vertical = $derived(orientation === "vertical");
  const clearIsDisabled = $derived(clearDisabled ?? !input);
  function clearInput() {
    input = "";
    onClear?.();
  }
</script>

<div class="shell">
  <div class="split" class:vertical>
    <div class="col">
      <div class="caption-row">
        <span class="dbx-label caption">{left}</span>
        {#if inputActions}<span class="caption-actions">{@render inputActions()}</span>{/if}
        <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={clearIsDisabled} onclick={clearInput}>{t("清空", "Clear")}</button>
      </div>
      {#if language}
        <CodeEditor bind:value={input} {language} placeholder={inputPlaceholder} label={left} />
      {:else}
        <textarea
          class="dbx-textarea area"
          spellcheck="false"
          placeholder={inputPlaceholder}
          maxlength={maxlength}
          bind:value={input}
          aria-label={left}
        ></textarea>
      {/if}
    </div>
    <div class="col">
      <div class="caption-row">
        <span class="dbx-label caption">
          {right}
          {#if outputStatus}<span class="output-status" role="status">{outputStatus}</span>{/if}
        </span>
        {#if outputActions}<span class="caption-actions">{@render outputActions()}</span>{/if}
        <CopyButton {locale} text={error ? "" : output} label={chrome.copy} />
      </div>
      {#if error}
        <pre class="area out error">{error}</pre>
      {:else if language}
        <CodeEditor value={output} {language} placeholder={outputPlaceholder} readonly={outputReadonly} label={right} />
      {:else if outputReadonly}
        <textarea class="dbx-textarea area out" readonly tabindex="-1" placeholder={outputPlaceholder} value={output} aria-label={right}></textarea>
      {:else}
        <textarea class="dbx-textarea area out" placeholder={outputPlaceholder} value={output} aria-label={right}></textarea>
      {/if}
    </div>
  </div>
</div>

<style>
  .small-action { min-height: 20px; height: 20px; padding: 0 5px; font-size: 11px; }
  .caption-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
    min-width: 0;
  }
  .output-status { margin-left: 6px; font-weight: 400; white-space: nowrap; }
  .shell {
    container-type: inline-size;
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .split {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
  }
  .split.vertical {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(120px, 1fr) minmax(120px, 1fr);
  }
  .col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
  }
  .caption {
    color: var(--color-muted-foreground);
  }
  .area {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 120px;
    margin: 0;
    resize: none;
    line-height: 1.55;
  }
  .out:not(.error) {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
  }
  .error {
    margin: 0;
    padding: 10px 12px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-destructive);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 28%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-destructive) 10%, var(--color-background, Canvas));
  }

  /* Pane can be narrow while the host window is still wide — key off this
     shell's width, not the viewport. Keep side-by-side until quite tight. */
  @container (max-width: 520px) {
    .split:not(.vertical) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(120px, 1fr) minmax(120px, 1fr);
    }
  }
</style>
