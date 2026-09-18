<script>
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { CODE_LANGUAGES, formatCode } from "./tools/format.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let language = $state("sql");
  let action = $state("format");
  let input = $state("");

  const result = $derived.by(() => {
    if (!input.trim()) return { text: "", error: "", notice: "" };
    try {
      const next = formatCode(input, language, language === "xml" ? action : "format");
      if (next && typeof next === "object") {
        return next.ok
          ? { text: next.text, error: "", notice: next.text }
          : { text: "", error: next.text, notice: "" };
      }
      return { text: String(next ?? ""), error: "", notice: "" };
    } catch (err) {
      return { text: "", error: err?.message || String(err), notice: "" };
    }
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
  .field :global(.dbx-select) {
    width: auto;
    min-width: 140px;
  }
  .ok {
    margin: 0;
    color: var(--color-primary, #2563eb);
  }
</style>
