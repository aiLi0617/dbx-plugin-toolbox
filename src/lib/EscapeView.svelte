<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { escapeHtml, escapeUnicode, unescapeHtml, unescapeUnicode } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let mode = $state("encode");
  let input = $state("");

  const rows = $derived.by(() => {
    const decode = mode === "decode";
    const items = [
      { id: "html", zh: "HTML 实体", en: "HTML entities", run: decode ? unescapeHtml : escapeHtml },
      { id: "unicode", zh: "Unicode 转义", en: "Unicode escape", run: decode ? unescapeUnicode : escapeUnicode },
    ];
    return items.map((item) => {
      try {
        return { ...item, value: item.run(input), error: "" };
      } catch (err) {
        return { ...item, value: "", error: err?.message || String(err) };
      }
    });
  });
</script>

<div class="page">
  <div class="options">
    <label class="field">
      <span>{t("方向", "Direction")}</span>
      <Select
        bind:value={mode}
        options={[
          { value: "encode", label: t("转义", "Escape") },
          { value: "decode", label: t("还原", "Unescape") },
        ]}
      />
    </label>
  </div>
  <textarea
    class="dbx-textarea area"
    spellcheck="false"
    placeholder={mode === "decode" ? "&lt;tag&gt; 或 \\u4e2d" : "<tag> 中文"}
    bind:value={input}
  ></textarea>
  <div class="rows">
    {#each rows as row (row.id)}
      <div class="row">
        <span class="name">{t(row.zh, row.en)}</span>
        <input class="dbx-input mono" class:invalid={Boolean(row.error)} readonly value={row.error || row.value} />
        <CopyButton {locale} text={row.value} labelZh={`复制${row.zh}`} labelEn={`Copy ${row.en}`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 720px;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
  }
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .field :global(.dbx-select) {
    width: auto;
    min-width: 140px;
  }
  .area {
    min-height: 88px;
    max-height: 180px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .invalid {
    border-color: var(--color-destructive, #dc2626);
    color: var(--color-destructive, #dc2626);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
    }
  }
</style>
