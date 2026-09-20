<script>
  import CopyButton from "./CopyButton.svelte";
  import {
    escapeCssIdent,
    escapeHtml,
    escapeJson,
    escapeJsUnicode,
    escapeUnicode,
    unescapeCssIdent,
    unescapeHtml,
    unescapeJson,
    unescapeJsUnicode,
    unescapeUnicode,
  } from "./tools/encode.js";
  import { localizeError, pick } from "./i18n.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  const MODES = [
    { value: "encode", zh: "转义", en: "Escape" },
    { value: "decode", zh: "还原", en: "Unescape" },
  ];

  const FORMATS = [
    { id: "html", zh: "HTML 实体", en: "HTML entities", encode: escapeHtml, decode: unescapeHtml },
    { id: "unicode", zh: "Unicode \\u{…}", en: "Unicode \\u{…}", encode: escapeUnicode, decode: unescapeUnicode },
    { id: "js", zh: "JS \\uXXXX", en: "JS \\uXXXX", encode: escapeJsUnicode, decode: unescapeJsUnicode },
    { id: "json", zh: "JSON 字符串", en: "JSON string", encode: escapeJson, decode: unescapeJson },
    { id: "css", zh: "CSS 标识符", en: "CSS identifier", encode: escapeCssIdent, decode: unescapeCssIdent },
  ];

  let mode = $state("encode");
  let input = $state("");

  const rows = $derived.by(() => {
    const decode = mode === "decode";
    return FORMATS.map((item) => {
      const run = decode ? item.decode : item.encode;
      try {
        return { ...item, value: input ? run(input) : "", error: "" };
      } catch (err) {
        return { ...item, value: "", error: localizeError(locale, err) };
      }
    });
  });

  function clearInput() {
    input = "";
  }
</script>

<div class="page">
  <div class="seg" role="tablist" aria-label={t("方向", "Direction")}>
    {#each MODES as item}
      <button
        class:active={mode === item.value}
        aria-selected={mode === item.value}
        onclick={() => (mode = item.value)}
        role="tab"
        type="button"
      >{t(item.zh, item.en)}</button>
    {/each}
  </div>

  <div class="block">
    <div class="caption-row">
      <span class="caption">{mode === "decode" ? t("已转义文本", "Escaped text") : t("原文", "Source")}</span>
      <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={!input} onclick={clearInput}>{t("清空", "Clear")}</button>
    </div>
    <textarea
      class="dbx-textarea area"
      spellcheck="false"
      aria-label={mode === "decode" ? t("已转义文本", "Escaped text") : t("原文", "Source")}
      placeholder={mode === "decode" ? "&lt;tag&gt; / \\u4e2d / \\\"hi\\\"" : "<tag> 中文 \"hi\""}
      bind:value={input}
    ></textarea>
  </div>

  <div class="rows">
    {#each rows as row (row.id)}
      <div class="row">
        <span class="name">{t(row.zh, row.en)}</span>
        {#if row.error}
          <pre class="out error" role="alert">{row.error}</pre>
        {:else}
          <textarea
            class="dbx-textarea out mono"
            readonly
            tabindex="-1"
            placeholder={t("输入后自动转换", "Updates as you type")}
            aria-label={t(`${row.zh} 输出`, `${row.en} output`)}
            value={row.value}
          ></textarea>
        {/if}
        <CopyButton {locale} text={row.error ? "" : row.value} labelZh={`复制${row.zh}`} labelEn={`Copy ${row.en}`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
    max-width: 720px;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
  }
  .seg button {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .seg button:last-child { border-right: 0; }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    min-width: 0;
  }
  .caption-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
  }
  .caption {
    color: var(--color-muted-foreground);
    font-size: 12px;
    font-weight: 500;
  }
  .small-action {
    margin-left: auto;
    min-height: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 11px;
  }
  .area {
    min-height: 96px;
    max-height: 220px;
    resize: vertical;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: start;
  }
  .name {
    padding-top: 8px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground);
    line-height: 1.3;
    word-break: break-word;
  }
  .out {
    min-height: 40px;
    max-height: 120px;
    margin: 0;
    resize: vertical;
    line-height: 1.55;
  }
  .out.mono {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
  }
  .error {
    padding: 8px 10px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--color-destructive);
    border: 1px solid color-mix(in srgb, var(--color-destructive) 28%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-destructive) 10%, var(--color-background, Canvas));
  }
  .row :global(.copy-btn) {
    margin-top: 5px;
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
      padding-top: 0;
    }
  }
</style>
