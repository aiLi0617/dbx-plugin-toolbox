<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { BASE_FIELDS, decodeBytes, encodeBytes } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let values = $state(Object.fromEntries(BASE_FIELDS.map((field) => [field.id, ""])));
  let invalidId = $state("");

  function paint(exceptId, bytes) {
    for (const field of BASE_FIELDS) {
      if (field.id === exceptId) continue;
      values[field.id] = encodeBytes(field.id, bytes);
    }
  }

  function update(fromId, text) {
    values[fromId] = text;
    if (!String(text).trim() && fromId !== "text") {
      invalidId = "";
      for (const field of BASE_FIELDS) {
        if (field.id !== fromId) values[field.id] = "";
      }
      if (fromId !== "text") values.text = "";
      return;
    }
    if (fromId === "text" && !text) {
      invalidId = "";
      for (const field of BASE_FIELDS) {
        if (field.id !== "text") values[field.id] = "";
      }
      return;
    }
    try {
      const bytes = decodeBytes(fromId, text);
      invalidId = "";
      paint(fromId, bytes);
    } catch {
      invalidId = fromId;
      for (const field of BASE_FIELDS) if (field.id !== fromId) values[field.id] = "";
    }
  }
</script>

<div class="page">
  {#if invalidId}<p class="dbx-hint" role="alert">{t("输入不是有效的编码，其他结果已清空。请检查字符、长度和填充。", "Invalid encoding. Other results were cleared; check the characters, length, and padding.")}</p>{/if}
  <div class="rows">
    {#each BASE_FIELDS as field (field.id)}
      <div class="row" class:stack={field.id === "text"}>
        <span class="name">{t(field.zh, field.en)}</span>
        {#if field.id === "text"}
          <textarea
            class="dbx-textarea mono"
            class:invalid={invalidId === field.id}
            aria-label={t(field.zh, field.en)}
            aria-invalid={invalidId === field.id}
            spellcheck="false"
            value={values[field.id]}
            oninput={(event) => update(field.id, event.currentTarget.value)}
          ></textarea>
        {:else}
          <input
            class="dbx-input mono"
            class:invalid={invalidId === field.id}
            aria-label={t(field.zh, field.en)}
            aria-invalid={invalidId === field.id}
            spellcheck="false"
            value={values[field.id]}
            oninput={(event) => update(field.id, event.currentTarget.value)}
          />
        {/if}
        <CopyButton {locale} text={invalidId ? "" : values[field.id]} labelZh={`复制 ${field.zh}`} labelEn={`Copy ${field.en}`} />
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
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .row.stack {
    align-items: start;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
    padding-top: 7px;
  }
  .row:not(.stack) .name {
    padding-top: 0;
  }
  .dbx-textarea.mono {
    min-height: 72px;
    resize: vertical;
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
      padding-top: 0;
    }
  }
</style>
