<script>
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { locale as hostLocale } from "./host.js";
  import { DBX_LOREM_LOCALES, LOREM_MAX_CUSTOM_LENGTH, LOREM_MAX_LINES, LOREM_MIN_LINES, lorem } from "./lorem.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let paragraphs = $state(3);
  let language = $state("auto");
  let customText = $state("");

  function clampLines(n) {
    const num = Math.floor(Number(n));
    if (!Number.isFinite(num)) return LOREM_MIN_LINES;
    return Math.min(LOREM_MAX_LINES, Math.max(LOREM_MIN_LINES, num));
  }

  const result = $derived.by(() => {
    try {
      return { value: lorem(clampLines(paragraphs), language, locale || hostLocale(), customText), error: "" };
    } catch (error) {
      return { value: "", error: error.code === "custom-length"
        ? t("自定义内容最多 10,000 个字符。", "Custom content is limited to 10,000 characters.")
        : t("输出最多 1,000,000 个字符，请减少重复次数或内容长度。", "Output is limited to 1,000,000 characters. Reduce the repeat count or content length.") };
    }
  });
</script>

<div class="page">
  <div class="opts">
    <label class="field">
      <span>{t("重复次数", "Repeat count")}</span>
      <NumberInput class="size" min={LOREM_MIN_LINES} max={LOREM_MAX_LINES} bind:value={paragraphs} />
    </label>
    <label class="field">
      <span>{t("默认文案语言", "Default copy language")}</span>
      <Select
        bind:value={language}
        disabled={Boolean(customText.trim())}
        options={DBX_LOREM_LOCALES.map((item) => ({ value: item.value, label: t(item.zh, item.en) }))}
      />
    </label>
  </div>
  <label class="field custom-field">
    <span>{t("自定义内容（可选）", "Custom content (optional)")}</span>
    <textarea class="dbx-textarea custom" bind:value={customText} placeholder={t("留空使用默认 DBX 推广文案，可输入多行内容。", "Leave blank for the default DBX copy. Multiple lines are supported.")}></textarea>
  </label>
  <p class="hint">{t(`每次重复之间换行；1–${LOREM_MAX_LINES} 次，自定义内容最多 ${LOREM_MAX_CUSTOM_LENGTH.toLocaleString()} 个字符。`, `Each repetition is separated by a newline. 1–${LOREM_MAX_LINES} repetitions; custom content up to ${LOREM_MAX_CUSTOM_LENGTH.toLocaleString()} characters.`)}</p>
  {#if result.error}<p class="error" role="alert">{result.error}</p>{/if}
  <div class="out-row">
    <textarea class="dbx-textarea area" aria-label={t("生成结果", "Generated output")} readonly value={result.value}></textarea>
    <CopyButton {locale} text={result.value} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    min-height: 0;
    max-width: 720px;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .field :global(.dbx-number.size) {
    width: 5.5rem;
  }
  .custom-field { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
  .custom { min-height: 88px; max-height: 180px; resize: vertical; }
  .hint, .error { margin: 0; font-size: 12px; line-height: 1.5; }
  .hint { color: var(--color-muted-foreground); }
  .error { color: var(--color-destructive); }
  .field :global(.dbx-select) {
    width: auto;
    min-width: 160px;
  }
  .out-row {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: start;
  }
  .area {
    height: 100%;
    min-height: 180px;
    resize: none;
  }
</style>
