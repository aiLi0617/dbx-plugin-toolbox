<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { renderMarkdown } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const html = $derived(renderMarkdown(input));
  const empty = $derived(!input.trim());
</script>

<div class="page">
  <label class="col">
    <span class="caption-row">
      <span class="caption">{t("Markdown", "Markdown")}</span>
    </span>
    <textarea
      class="dbx-textarea area"
      spellcheck="false"
      placeholder={"# Title\n\n**bold** and `code`"}
      bind:value={input}
    ></textarea>
  </label>

  <div class="col">
    <div class="caption-row">
      <span class="caption">{t("预览", "Preview")}</span>
      <CopyButton {locale} text={html} labelZh="复制 HTML" labelEn="Copy HTML" />
    </div>
    <div class="preview" class:empty>
      {#if empty}
        <p class="hint">{t("在左侧输入，右侧即时渲染", "Type on the left; the preview updates as you type")}</p>
      {:else}
        {@html html}
      {/if}
    </div>
  </div>
</div>

<style>
  .page {
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
  .area,
  .preview {
    flex: 1;
    min-height: 0;
    margin: 0;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .area {
    resize: none;
    line-height: 1.55;
  }
  .preview {
    overflow: auto;
    padding: 12px 14px;
    font-size: 13px;
    line-height: 1.6;
    word-break: break-word;
  }
  .preview.empty {
    display: flex;
    align-items: flex-start;
  }
  .hint {
    margin: 0;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .preview :global(:first-child) {
    margin-top: 0;
  }
  .preview :global(:last-child) {
    margin-bottom: 0;
  }
  .preview :global(h1),
  .preview :global(h2),
  .preview :global(h3),
  .preview :global(h4),
  .preview :global(h5),
  .preview :global(h6) {
    margin: 1.1em 0 0.45em;
    line-height: 1.25;
    font-weight: 650;
  }
  .preview :global(h1) { font-size: 1.55em; }
  .preview :global(h2) { font-size: 1.28em; }
  .preview :global(h3) { font-size: 1.12em; }
  .preview :global(p),
  .preview :global(ul),
  .preview :global(ol),
  .preview :global(blockquote),
  .preview :global(pre),
  .preview :global(table) {
    margin: 0.7em 0;
  }
  .preview :global(ul),
  .preview :global(ol) {
    padding-left: 1.4em;
  }
  .preview :global(blockquote) {
    padding: 0 0.9em;
    border-left: 3px solid var(--color-border, color-mix(in srgb, CanvasText 22%, transparent));
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 68%, transparent));
  }
  .preview :global(code) {
    font-family: var(--font-mono);
    font-size: 0.9em;
    padding: 0.1em 0.35em;
    border-radius: 4px;
    background: color-mix(in srgb, CanvasText 8%, transparent);
  }
  .preview :global(pre) {
    overflow: auto;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, CanvasText 7%, transparent);
  }
  .preview :global(pre code) {
    padding: 0;
    background: transparent;
  }
  .preview :global(a) {
    color: var(--color-primary, #2563eb);
  }
  .preview :global(img) {
    max-width: 100%;
    height: auto;
  }
  .preview :global(hr) {
    border: 0;
    border-top: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    margin: 1.1em 0;
  }
  .preview :global(table) {
    width: 100%;
    border-collapse: collapse;
  }
  .preview :global(th),
  .preview :global(td) {
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    padding: 5px 8px;
    text-align: left;
  }
  .preview :global(th) {
    background: color-mix(in srgb, CanvasText 5%, transparent);
  }
  .preview :global(input[type="checkbox"]) {
    margin-right: 0.4em;
    vertical-align: middle;
  }

  @media (max-width: 720px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(180px, 1fr) minmax(180px, 1fr);
    }
  }
</style>
