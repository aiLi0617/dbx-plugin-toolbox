<script>
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { CODE_LANGUAGES, formatCode, SQL_DIALECTS } from "./tools/format.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let language = $state("sql");
  let action = $state("format");
  let sqlDialect = $state("sql");
  let indent = $state("2");
  let input = $state("");
  let result = $state({ text: "", error: "", notice: "" });
  let busy = $state(false);
  $effect(() => {
    const next = ({ js: "javascript", ts: "typescript" })[initialOptions.language] || initialOptions.language;
    if (CODE_LANGUAGES.some((item) => item.value === next)) language = next;
  });
  $effect(() => {
    const source = input;
    const lang = language;
    const op = lang === "xml" ? action : "format";
    const dialect = sqlDialect;
    const width = Number(indent);
    result = { text: "", error: "", notice: "" };
    busy = Boolean(source.trim());
    if (!source.trim()) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await formatCode(source, lang, op, dialect, width);
        if (cancelled) return;
        result = next && typeof next === "object"
          ? next.ok ? { text: next.text, error: "", notice: next.text } : { text: "", error: next.text, notice: "" }
          : { text: String(next ?? ""), error: "", notice: "" };
      } catch (err) {
        if (!cancelled) result = { text: "", error: err?.message || String(err), notice: "" };
      } finally {
        if (!cancelled) busy = false;
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>

<div class="page">
  <div class="options">
    <label class="field">
      <span>{t("语言", "Language")}</span>
      <Select
        bind:value={language}
        options={CODE_LANGUAGES.map((item) => ({ value: item.value, label: t(item.zh, item.en) }))}
      />
    </label>
    {#if language === "sql"}
      <label class="field">
        <span>{t("方言", "Dialect")}</span>
        <Select bind:value={sqlDialect} options={SQL_DIALECTS} />
      </label>
    {/if}
    {#if language === "xml"}
      <label class="field">
        <span>{t("操作", "Action")}</span>
        <Select
          bind:value={action}
          options={[
            { value: "format", label: t("格式化", "Format") },
            { value: "validate", label: t("校验", "Validate") },
          ]}
        />
      </label>
    {/if}
    {#if !(language === "xml" && action === "validate")}
      <label class="field">
        <span>{t("缩进", "Indent")}</span>
        <Select bind:value={indent} options={[
          { value: "2", label: t("2 空格", "2 spaces") },
          { value: "4", label: t("4 空格", "4 spaces") },
          { value: "8", label: t("8 空格", "8 spaces") },
        ]} />
      </label>
    {/if}
  </div>
  {#if language === "xml" && action === "validate" && result.notice}
    <p class="ok">{result.notice}</p>
  {/if}
  <IoSplit
    {locale}
    bind:input
    output={language === "xml" && action === "validate" ? "" : result.text}
    error={result.error}
    inputLabel={t("源码", "Source")}
    outputLabel={t("结果", "Result")}
    outputStatus={busy ? t("处理中…", "Processing…") : ""}
    {language}
  />
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    flex-shrink: 0;
  }
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 140px;
  }
  .ok {
    margin: 0;
    color: var(--color-primary);
  }
</style>
