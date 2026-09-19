<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { decodeUrl, encodeUrl, parseQuery } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

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

  const tableText = $derived.by(() => {
    const q = result.query;
    if (!q) return "";
    const lines = [];
    if (q.href) lines.push(`href\t${q.href}`);
    if (q.hash) lines.push(`hash\t${q.hash}`);
    for (const [k, v] of q.rows) lines.push(`${k}\t${v}`);
    return lines.join("\n");
  });
</script>

<div class="page">
  <div class="options">
    <label class="field">
      <span>{t("模式", "Mode")}</span>
      <Select
        bind:value={mode}
        options={[
          { value: "encode", label: t("编码", "Encode") },
          { value: "decode", label: t("解码", "Decode") },
          { value: "query", label: t("Query 表", "Query table") },
        ]}
      />
    </label>
  </div>

  {#if mode === "query"}
    <label class="block">
      <span class="caption">{t("URL 或查询串", "URL or query string")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" bind:value={input} placeholder="https://example.com/path?q=1#hash"></textarea>
    </label>
    {#if result.error}
      <p class="error">{result.error}</p>
    {:else}
      <div class="caption-row">
        <span class="caption">{t("参数", "Params")}</span>
        <CopyButton {locale} text={tableText} labelZh="复制表" labelEn="Copy table" />
      </div>
      {#if result.query && (result.query.href || result.query.hash || result.query.rows.length)}
        <div class="table-wrap">
          <table class="dbx-table">
            <thead>
              <tr>
                <th>{t("键", "Key")}</th>
                <th>{t("值", "Value")}</th>
              </tr>
            </thead>
            <tbody>
              {#if result.query.href}
                <tr><td class="mono">href</td><td class="mono">{result.query.href}</td></tr>
              {/if}
              {#if result.query.hash}
                <tr><td class="mono">hash</td><td class="mono">{result.query.hash}</td></tr>
              {/if}
              {#each result.query.rows as row, i (`${row[0]}-${i}`)}
                <tr><td class="mono">{row[0]}</td><td class="mono">{row[1]}</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="dbx-hint">{t("粘贴带查询参数的 URL。", "Paste a URL with query parameters.")}</p>
      {/if}
    {/if}
  {:else}
    <IoSplit
      {locale}
      bind:input
      output={result.text}
      error={result.error}
      inputLabel={t("原文", "Source")}
      outputLabel={mode === "decode" ? t("解码", "Decoded") : t("编码", "Encoded")}
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
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .field :global(.dbx-select) {
    width: auto;
    min-width: 160px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    flex-shrink: 0;
  }
  .area {
    min-height: 88px;
    resize: vertical;
  }
  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
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
