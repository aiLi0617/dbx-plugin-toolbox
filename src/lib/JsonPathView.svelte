<script>
  import IoSplit from "./IoSplit.svelte";
  import { pick } from "./i18n.js";
  import { runJsonPath } from "./tools/convert.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let path = $state("");
  let input = $state("");

  const result = $derived.by(() => {
    if (!input.trim()) return { text: "", error: "" };
    try {
      return { text: runJsonPath(input, path), error: "" };
    } catch (err) {
      return { text: "", error: err?.message || String(err) };
    }
  });
</script>

<div class="page">
  <label class="field">
    <span>{t("路径", "Path")}</span>
    <input class="dbx-input mono" spellcheck="false" placeholder="$.items[*].id" bind:value={path} />
  </label>
  <IoSplit
    {locale}
    bind:input
    output={result.text}
    error={result.error}
    inputLabel="JSON"
    outputLabel={t("结果", "Result")}
    inputPlaceholder={'{\n  "items": [{ "id": 1 }]\n}'}
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
  .field {
    max-width: 480px;
    flex-shrink: 0;
  }
</style>
