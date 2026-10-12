<script>
  import { untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { inspectUniqueId, UUID_NAMESPACE_IDS, uuidV5 } from "./codec.js";
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
  let monotonic = $state(true);
  let namespace = $state("dns");
  let customNamespace = $state(UUID_NAMESPACE_IDS.dns);
  let name = $state("example.com");
  let inspectInput = $state("");
  let error = $state("");
  let generationSequence = 0;
  let raw = $state([generateUniqueId("uuid")]);
  $effect(() => {
    const requested = initialOptions.kind;
    if (["uuid", "uuid-v7", "uuid-v5", "ulid", "nanoid"].includes(requested)) untrack(() => { kind = requested; generate(); });
  });
  const items = $derived(
    raw.map((id) => (kind.startsWith("uuid") ? formatUuid(id, { hyphens: withHyphens, uppercase, braces }) : id)),
  );
  const allText = $derived(items.join("\n"));
  const inspection = $derived(inspectUniqueId(inspectInput.trim()));

  async function generate() {
    const sequence = ++generationSequence;
    error = "";
    if (kind === "uuid-v5") {
      try {
        const id = await uuidV5(name, namespace === "custom" ? customNamespace : namespace);
        if (sequence === generationSequence) raw = [id];
      } catch {
        if (sequence === generationSequence) error = t("命名空间必须是有效的 UUID", "Namespace must be a valid UUID");
      }
      return;
    }
    const n = clampUniqueIdCount(count);
    count = n;
    raw = Array.from({ length: n }, () => generateUniqueId(kind, size, { monotonic }));
  }

  $effect(() => {
    if (kind === "uuid-v5") return;
    const n = clampUniqueIdCount(count);
    if (raw.length === n) return;
    if (raw.length > n) {
      raw = raw.slice(0, n);
      return;
    }
    raw = [...raw, ...Array.from({ length: n - raw.length }, () => generateUniqueId(kind, size, { monotonic }))];
  });

  function formatTimestamp(timestamp) {
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString(locale) : "—";
  }

</script>

<div class="page">
  <div class="opts">
    <div class="primary-options">
      <label class="field kind-field">
        <span>{t("类型", "Kind")}</span>
        <Select
          bind:value={kind}
          options={[
            { value: "uuid", label: "UUID v4" },
            { value: "uuid-v7", label: "UUID v7" },
            { value: "uuid-v5", label: "UUID v5" },
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
      {#if kind === "uuid-v5"}
        <label class="field namespace-field">
          <span>{t("命名空间", "Namespace")}</span>
          <Select bind:value={namespace} options={[
            { value: "dns", label: "DNS" },
            { value: "url", label: "URL" },
            { value: "oid", label: "OID" },
            { value: "x500", label: "X.500" },
            { value: "custom", label: t("自定义", "Custom") },
          ]} />
        </label>
        {#if namespace === "custom"}
          <label class="field grow">
            <span>{t("命名空间 UUID", "Namespace UUID")}</span>
            <input class="dbx-input mono" bind:value={customNamespace} />
          </label>
        {/if}
        <label class="field grow">
          <span>{t("名称", "Name")}</span>
          <input class="dbx-input" bind:value={name} />
        </label>
      {:else}
        <label class="field">
          <span>{t("数量", "Count")}</span>
          <NumberInput {locale} class="size" min="1" max="100" ariaLabel={t("数量", "Count")} bind:value={count} />
        </label>
      {/if}
      <button class="dbx-btn dbx-btn--primary" onclick={generate} type="button">{t("生成", "Generate")}</button>
      {#if items.length > 1}
        <CopyButton {locale} text={allText} labelZh="复制全部" labelEn="Copy all" />
      {/if}
    </div>

    {#if kind.startsWith("uuid") || kind === "ulid"}
      <div class="format-options">
        <span class="option-group-label">{t("格式", "Format")}</span>
        {#if kind.startsWith("uuid")}
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
        {:else}
          <label class="check">
            <input type="checkbox" bind:checked={monotonic} />
            <span>{t("单调递增", "Monotonic")}</span>
          </label>
        {/if}
      </div>
    {/if}
  </div>

  {#if error}<p class="dbx-hint error">{error}</p>{/if}

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

  <section class="inspect-card">
    <label class="field inspect-field">
      <span>{t("解析外部 ID", "Inspect an existing ID")}</span>
      <input class="dbx-input mono" bind:value={inspectInput} placeholder={t("粘贴 UUID 或 ULID", "Paste a UUID or ULID")} />
    </label>
    {#if inspection}
      <dl class="inspect-grid">
        <div><dt>{t("类型", "Type")}</dt><dd>{inspection.type}{inspection.version ? ` v${inspection.version}` : ""}</dd></div>
        {#if inspection.variant}<div><dt>{t("变体", "Variant")}</dt><dd>{inspection.variant}</dd></div>{/if}
        {#if inspection.timestamp !== undefined}<div><dt>{t("生成时间", "Timestamp")}</dt><dd>{formatTimestamp(inspection.timestamp)}</dd></div>{/if}
      </dl>
    {:else}
      <p class="dbx-hint inspect-hint">{t("粘贴已有的 UUID 或 ULID 以查看其类型和时间信息。", "Paste an existing UUID or ULID to inspect its type and timestamp.")}</p>
    {/if}
  </section>
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
    flex-direction: column;
    gap: 10px;
  }
  .primary-options,
  .format-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }
  .primary-options :global(.copy-btn) {
    align-self: flex-end;
  }
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 140px;
  }
  .field :global(.dbx-number.size) {
    width: 5.5rem;
  }
  .primary-options > .field.grow { flex: 1 1 180px; min-width: 160px; }
  .kind-field :global(.dbx-custom-select) { min-width: 120px; }
  .namespace-field :global(.dbx-custom-select) { min-width: 100px; }
  .format-options { align-items: center; min-height: 30px; }
  .option-group-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
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
    white-space: nowrap;
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
  .error { margin: 0; color: var(--color-destructive); }
  .inspect-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 16%, transparent));
    border-radius: var(--radius, 8px);
  }
  .inspect-field { width: 100%; }
  .inspect-hint { margin: 0; }
  .inspect-grid { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 0; }
  .inspect-grid div { min-width: 120px; }
  .inspect-grid dt { font-size: 11px; color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); }
  .inspect-grid dd { margin: 3px 0 0; font-family: var(--font-mono, monospace); font-size: 12px; }
</style>
