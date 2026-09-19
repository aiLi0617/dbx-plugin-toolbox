<script>
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { DATA_FORMATS, convertData } from "./dataConvert.js";
  import { precisionErrorMessage } from "./jsonPrecision.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let from = $state("json");
  let to = $state("yaml");
  let input = $state("");
  let result = $state({ text: "", error: "" });
  let pending = $state(false);
  $effect(() => {
    if (DATA_FORMATS.some((format) => format.value === initialOptions.from)) from = initialOptions.from;
    if (DATA_FORMATS.some((format) => format.value === initialOptions.to)) to = initialOptions.to;
  });
  $effect(() => {
    const source = input;
    const sourceFormat = from;
    const targetFormat = to;
    const language = locale;
    result = { text: "", error: "" };
    pending = Boolean(source.trim());
    if (!source.trim()) return;
    const timer = setTimeout(() => {
      try { result = { text: convertData(source, sourceFormat, targetFormat), error: "" }; }
      catch (error) { result = { text: "", error: precisionErrorMessage(error, language) }; }
      pending = false;
    }, 180);
    return () => clearTimeout(timer);
  });
  function swap() {
    if (pending || result.error || (input.trim() && !result.text)) return;
    const next = result.text;
    [from, to] = [to, from];
    input = next;
  }
</script>

<div class="page">
  <div class="options">
    <label class="field"><span>{t("输入格式", "Input format")}</span><Select bind:value={from} options={DATA_FORMATS} /></label>
    <button class="dbx-btn" type="button" onclick={swap} disabled={pending || Boolean(result.error)}>{t("交换并使用结果", "Swap and use result")}</button>
    <label class="field"><span>{t("输出格式", "Output format")}</span><Select bind:value={to} options={DATA_FORMATS} /></label>
  </div>
  <p class="dbx-hint">{t("CSV/TSV 按首行作为列名，值按文本读取；NDJSON 每行是一个 JSON 值。CSV/TSV 嵌套值输出为 JSON 文本；XML 使用 @_ 属性，多个顶层字段包在 root 中，数组包在 root/item 中。跨格式不保证保留注释。", "CSV/TSV use the first row as column names and read values as text; NDJSON contains one JSON value per line. Nested CSV/TSV values become JSON text. XML uses @_ attributes, root for multiple top-level fields, and root/item for arrays. Cross-format conversion may discard comments.")}</p>
  <IoSplit
    {locale}
    bind:input
    output={result.text}
    error={result.error}
    inputLabel={from.toUpperCase()}
    outputLabel={to.toUpperCase()}
    outputStatus={pending ? t("转换中…", "Converting…") : ""}
  />
</div>

<style>
  .page { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 12px; }
  .options { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field :global(.dbx-select) { min-width: 120px; }
  p { margin: 0; }
</style>
