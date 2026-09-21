<script>
  import { untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { generateSecret } from "./tools/generate.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let kind = $state("password");
  let length = $state(16);
  let symbols = $state("yes");
  let value = $state(generateSecret("password", 16, "yes"));
  $effect(() => {
    const requested = initialOptions.kind;
    if (["password", "bytes"].includes(requested)) untrack(() => { kind = requested; generate(); });
  });

  function generate() {
    value = generateSecret(kind, length, symbols);
  }
</script>

<div class="page">
  <div class="opts">
    <label class="field">
      <span>{t("类型", "Kind")}</span>
      <Select
        bind:value={kind}
        options={[
          { value: "password", label: t("密码", "Password") },
          { value: "bytes", label: t("随机字节", "Random bytes") },
        ]}
        onchange={generate}
      />
    </label>
    <label class="field">
      <span>{t("长度", "Length")}</span>
      <NumberInput {locale} class="size" min="4" max="1024" ariaLabel={t("长度", "Length")} bind:value={length} />
    </label>
    {#if kind === "password"}
      <label class="field">
        <span>{t("符号", "Symbols")}</span>
        <Select
          bind:value={symbols}
          options={[
            { value: "yes", label: t("含符号", "Include symbols") },
            { value: "no", label: t("不含符号", "No symbols") },
          ]}
          onchange={generate}
        />
      </label>
    {/if}
    <button class="dbx-btn dbx-btn--primary" onclick={generate} type="button">{t("生成", "Generate")}</button>
  </div>

  <div class="row">
    <input class="dbx-input mono" readonly aria-label={t("生成结果", "Generated value")} value={value} />
    <CopyButton {locale} text={value} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
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
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 140px;
  }
  .field :global(.dbx-number.size) {
    width: 5.5rem;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
</style>
