<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import { pick } from "./i18n.js";
  import { decodeUrl, encodeUrl, parseQuery } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  const MODES = [
    { value: "encode", zh: "编码", en: "Encode" },
    { value: "decode", zh: "解码", en: "Decode" },
    { value: "query", zh: "参数表", en: "Params" },
  ];

  let mode = $state("encode");
  let input = $state("");

  const result = $derived.by(() => {
    try {
      if (mode === "decode") return { text: input ? decodeUrl(input) : "", error: "", query: null };
      if (mode === "query") return { text: "", error: "", query: parseQuery(input) };
      return { text: input ? encodeUrl(input) : "", error: "", query: null };
    } catch (err) {
      return { text: "", error: err?.message || String(err), query: null };
    }
  });

  const structureRows = $derived.by(() => {
    const q = result.query;
    if (!q) return [];
    const rows = [];
    if (q.protocol) rows.push(["protocol", q.protocol]);
    if (q.host) rows.push(["host", q.host]);
    if (q.pathname) rows.push(["path", q.pathname]);
    if (q.href) rows.push(["href", q.href]);
    if (q.hashPath) rows.push(["hash", q.hashPath]);
    else if (q.hash) rows.push(["hash", q.hash]);
    return rows;
  });

  const hasQuery = $derived.by(() => {
    const q = result.query;
    if (!q) return false;
    return structureRows.length > 0 || q.rows.length > 0 || q.hashRows.length > 0;
  });

  const tableText = $derived.by(() => {
    const q = result.query;
    if (!q) return "";
    const lines = [];
    for (const [k, v] of structureRows) lines.push(`${k}\t${v}`);
    for (const [k, v] of q.rows) lines.push(`${k}\t${v}`);
    for (const [k, v] of q.hashRows) lines.push(`hash.${k}\t${v}`);
    return lines.join("\n");
  });

  function clearInput() {
    input = "";
  }
</script>

<div class="page">
  <div class="seg" role="tablist" aria-label={t("模式", "Mode")}>
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

  {#if mode === "query"}
    <label class="block">
      <span class="caption-row">
        <span class="caption">{t("URL 或查询串", "URL or query string")}</span>
        <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={!input} onclick={clearInput}>{t("清空", "Clear")}</button>
      </span>
      <textarea
        class="dbx-textarea area"
        spellcheck="false"
        bind:value={input}
        placeholder="https://example.com/path?q=1#/app?x=1"
        aria-label={t("URL 或查询串", "URL or query string")}
      ></textarea>
    </label>
    {#if result.error}
      <p class="error">{result.error}</p>
    {:else}
      <div class="caption-row">
        <span class="caption">{t("解析结果", "Parsed")}</span>
        <CopyButton {locale} text={tableText} labelZh="复制表" labelEn="Copy table" />
      </div>
      {#if hasQuery}
        <div class="table-wrap">
          {#if structureRows.length}
            <p class="section">{t("结构", "Structure")}</p>
            <table class="dbx-table">
              <thead>
                <tr>
                  <th>{t("键", "Key")}</th>
                  <th>{t("值", "Value")}</th>
                </tr>
              </thead>
              <tbody>
                {#each structureRows as row, i (`s-${row[0]}-${i}`)}
                  <tr><td class="mono key">{row[0]}</td><td class="mono">{row[1]}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
          {#if result.query.rows.length}
            <p class="section">{t("查询参数", "Query")}</p>
            <table class="dbx-table">
              <thead>
                <tr>
                  <th>{t("键", "Key")}</th>
                  <th>{t("值", "Value")}</th>
                </tr>
              </thead>
              <tbody>
                {#each result.query.rows as row, i (`q-${row[0]}-${i}`)}
                  <tr><td class="mono key">{row[0]}</td><td class="mono">{row[1]}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
          {#if result.query.hashRows.length}
            <p class="section">{t("Hash 参数", "Hash query")}</p>
            <table class="dbx-table">
              <thead>
                <tr>
                  <th>{t("键", "Key")}</th>
                  <th>{t("值", "Value")}</th>
                </tr>
              </thead>
              <tbody>
                {#each result.query.hashRows as row, i (`h-${row[0]}-${i}`)}
                  <tr><td class="mono key">{row[0]}</td><td class="mono">{row[1]}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {:else}
        <p class="dbx-hint">{t("粘贴 URL、编码后的 URL，或查询串。", "Paste a URL, encoded URL, or query string.")}</p>
      {/if}
    {/if}
  {:else}
    <IoSplit
      {locale}
      bind:input
      output={result.text}
      error={result.error}
      orientation="vertical"
      inputLabel={t("原文", "Source")}
      outputLabel={t("结果", "Result")}
      inputPlaceholder={mode === "decode" ? "https%3A%2F%2F…" : "https://…"}
    />
  {/if}
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
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
    flex-shrink: 0;
  }
  .caption-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 20px;
  }
  .caption {
    color: var(--color-muted-foreground);
  }
  .small-action {
    margin-left: auto;
    min-height: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 11px;
  }
  .area {
    min-height: 88px;
    resize: vertical;
  }
  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .section {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-muted-foreground);
  }
  .key {
    width: 28%;
    max-width: 220px;
    white-space: nowrap;
  }
  .mono {
    font-family: var(--font-mono);
    word-break: break-all;
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .dbx-hint {
    margin: 0;
  }
</style>
