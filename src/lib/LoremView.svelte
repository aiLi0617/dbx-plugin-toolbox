<script>
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { locale as hostLocale } from "./host.js";
  import { DBX_LOREM_LOCALES, LOREM_MAX_LINES, LOREM_MIN_LINES, lorem } from "./lorem.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let paragraphs = $state(3);
  let language = $state("auto");
  let value = $state("");

  function clampLines(n) {
    const num = Math.floor(Number(n));
    if (!Number.isFinite(num)) return LOREM_MIN_LINES;
    return Math.min(LOREM_MAX_LINES, Math.max(LOREM_MIN_LINES, num));
  }

  function generate() {
    paragraphs = clampLines(paragraphs);
    value = lorem(paragraphs, language, locale || hostLocale());
  }

  $effect(() => {
    void locale;
    generate();
  });
</script>

<div class="page">
  <div class="opts">
    <label class="field">
      <span>{t("行数", "Lines")}</span>
      <NumberInput class="size" min={LOREM_MIN_LINES} max={LOREM_MAX_LINES} bind:value={paragraphs} />
    </label>
    <label class="field">
      <span>{t("语言", "Language")}</span>
      <Select
        bind:value={language}
        options={DBX_LOREM_LOCALES.map((item) => ({ value: item.value, label: t(item.zh, item.en) }))}
      />
    </label>
    <button class="dbx-btn dbx-btn--primary" onclick={generate} type="button">{t("生成", "Generate")}</button>
  </div>
  <div class="out-row">
    <textarea class="dbx-textarea area" readonly value={value}></textarea>
    <CopyButton {locale} text={value} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
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
