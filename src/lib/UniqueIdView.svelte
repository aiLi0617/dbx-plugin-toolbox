<script>
  import { untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { clampUniqueIdCount, formatUuid, generateUniqueId } from "./tools/generate.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let kind = $state("uuid");
  let size = $state(21);
  let count = $state(1);
  let withHyphens = $state(true);
  let uppercase = $state(false);
  let braces = $state(false);
  let raw = $state([generateUniqueId("uuid")]);
  $effect(() => {
    const requested = initialOptions.kind;
    if (["uuid", "ulid", "nanoid"].includes(requested)) untrack(() => { kind = requested; generate(); });
  });
  const items = $derived(
    raw.map((id) => (kind === "uuid" ? formatUuid(id, { hyphens: withHyphens, uppercase, braces }) : id)),
  );
  const allText = $derived(items.join("\n"));

  function generate() {
    const n = clampUniqueIdCount(count);
    count = n;
    raw = Array.from({ length: n }, () => generateUniqueId(kind, size));
  }

  $effect(() => {
    const n = clampUniqueIdCount(count);
    if (raw.length === n) return;
    if (raw.length > n) {
      raw = raw.slice(0, n);
      return;
    }
    raw = [...raw, ...Array.from({ length: n - raw.length }, () => generateUniqueId(kind, size))];
  });

</script>

<div class="page">
  <div class="opts">
    <label class="field">
      <span>{t("类型", "Kind")}</span>
      <Select
        bind:value={kind}
        options={[
          { value: "uuid", label: "UUID v4" },
          { value: "ulid", label: "ULID" },
          { value: "nanoid", label: "NanoID" },
        ]}
        onchange={generate}
      />
    </label>
    {#if kind === "nanoid"}
      <label class="field">
        <span>{t("长度", "Length")}</span>
        <NumberInput {locale} class="size" min="4" max="64" ariaLabel={t("长度", "Length")} bind:value={size} />
      </label>
    {/if}
    <label class="field">
      <span>{t("数量", "Count")}</span>
      <NumberInput {locale} class="size" min="1" max="100" ariaLabel={t("数量", "Count")} bind:value={count} />
    </label>
    {#if kind === "uuid"}
      <label class="check">
        <input type="checkbox" bind:checked={withHyphens} />
        <span>{t("带连字符", "Hyphens")}</span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={uppercase} />
        <span>{t("大写", "Uppercase")}</span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={braces} />
        <span>{t("花括号", "Braces")}</span>
      </label>
    {/if}
    <button class="dbx-btn dbx-btn--primary" onclick={generate} type="button">{t("生成", "Generate")}</button>
    {#if items.length > 1}
      <CopyButton {locale} text={allText} labelZh="复制全部" labelEn="Copy all" />
    {/if}
  </div>

  <div class="rows" class:numbered={items.length > 1}>
    {#each items as id, i (`${i}:${id}`)}
      <div class="row">
        {#if items.length > 1}
          <span class="idx">{i + 1}</span>
        {/if}
        <input class="dbx-input mono" readonly aria-label={t(items.length > 1 ? `第 ${i + 1} 条唯一 ID` : "唯一 ID 输出", items.length > 1 ? `Unique ID #${i + 1}` : "Generated unique ID")} value={id} />
        <CopyButton
          {locale}
          text={id}
          labelZh={items.length > 1 ? `复制第 ${i + 1} 条` : chrome.copy.zh}
          labelEn={items.length > 1 ? `Copy #${i + 1}` : chrome.copy.en}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 640px;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
  }
  .opts :global(.copy-btn) {
    align-self: flex-end;
  }
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 140px;
  }
  .field :global(.dbx-number.size) {
    width: 5.5rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    cursor: pointer;
  }
  .check input {
    margin: 0;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: min(420px, 60vh);
    overflow: auto;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .rows.numbered .row {
    grid-template-columns: 1.75rem minmax(0, 1fr) 30px;
  }
  .idx {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
</style>
