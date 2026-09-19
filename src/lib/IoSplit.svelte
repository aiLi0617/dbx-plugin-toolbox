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
  } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const left = $derived(inputLabel || t(chrome.input.zh, chrome.input.en));
  const right = $derived(outputLabel || t(chrome.output.zh, chrome.output.en));
  let clearedInput = $state(null);
  function clearInput() { clearedInput = input; input = ""; }
  function undoClear() { if (clearedInput !== null) { input = clearedInput; clearedInput = null; } }
</script>

<div class="split">
  <div class="col">
    <span class="caption-row">
      <span class="dbx-label caption">{left}</span>
      <span class="input-actions">
        {#if clearedInput !== null && !input}<button class="dbx-btn dbx-btn--ghost small-action" type="button" onclick={undoClear}>{t("撤销清空", "Undo clear")}</button>{/if}
        <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={!input} onclick={clearInput}>{t("清空", "Clear")}</button>
      </span>
    </span>
    {#if language}
      <CodeEditor bind:value={input} {language} placeholder={inputPlaceholder} label={left} />
    {:else}
      <textarea
        class="dbx-textarea area"
        spellcheck="false"
        placeholder={inputPlaceholder}
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
      <CopyButton {locale} text={error ? "" : output} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
    </div>
    {#if error}
      <pre class="area out error">{error}</pre>
    {:else if language}
      <CodeEditor value={output} {language} placeholder={outputPlaceholder} readonly={outputReadonly} label={right} />
    {:else if outputReadonly}
      <textarea class="dbx-textarea area out" readonly placeholder={outputPlaceholder} value={output} aria-label={right}></textarea>
    {:else}
      <textarea class="dbx-textarea area out" placeholder={outputPlaceholder} value={output} aria-label={right}></textarea>
    {/if}
  </div>
</div>

<style>
  .input-actions { display: flex; margin-left: auto; gap: 4px; }
  .small-action { min-height: 20px; height: 20px; padding: 0 5px; font-size: 11px; }
  .output-status { margin-left: 6px; font-weight: 400; white-space: nowrap; }
  .split {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
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
    min-height: 0;
    margin: 0;
    resize: none;
    line-height: 1.55;
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

  @media (max-width: 720px) {
    .split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(160px, 1fr) minmax(160px, 1fr);
    }
  }
</style>
