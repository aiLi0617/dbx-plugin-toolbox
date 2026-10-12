<script>
  import { untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { chrome, pick } from "./i18n.js";
  import { clampSecretCount, generateSecret, passwordEntropyBits } from "./tools/generate.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  const kind = untrack(() => initialOptions.kind === "bytes" ? "bytes" : "password");
  let length = $state(kind === "bytes" ? 32 : 16);
  let count = $state(1);
  let lower = $state(true);
  let upper = $state(true);
  let digits = $state(true);
  let symbols = $state(true);
  let excludeAmbiguous = $state(false);
  let byteFormat = $state("hex");
  let items = $state([]);
  let generatedConfig = $state("");

  const passwordOptions = $derived({ lower, upper, digits, symbols, excludeAmbiguous });
  const selectedGroupCount = $derived([lower, upper, digits, symbols].filter(Boolean).length);
  const canGenerate = $derived(kind === "bytes" || (selectedGroupCount > 0 && Number(length) >= selectedGroupCount));
  const entropy = $derived(kind === "password" && selectedGroupCount > 0 ? passwordEntropyBits(length, passwordOptions) : 0);
  const allText = $derived(items.join("\n"));
  const isDirty = $derived(Boolean(items.length && generatedConfig !== currentConfigSignature()));

  function currentConfigSignature(normalizedCount = clampSecretCount(count)) {
    return JSON.stringify({
      kind,
      length: Number(length),
      count: normalizedCount,
      lower,
      upper,
      digits,
      symbols,
      excludeAmbiguous,
      byteFormat,
    });
  }

  function strengthLabel(bits) {
    if (bits < 40) return t("较弱", "Weak");
    if (bits < 60) return t("一般", "Fair");
    if (bits < 80) return t("较强", "Strong");
    return t("很强", "Very strong");
  }

  function generateOne() {
    return generateSecret(kind, length, kind === "bytes" ? { format: byteFormat } : passwordOptions);
  }

  function generate() {
    if (!canGenerate) return;
    const n = clampSecretCount(count);
    count = n;
    items = Array.from({ length: n }, generateOne);
    generatedConfig = currentConfigSignature(n);
  }

  generate();
</script>

<div class="page">
  <div class="opts">
    <label class="field">
      <span>{kind === "bytes" ? t("字节数", "Bytes") : t("长度", "Length")}</span>
      <NumberInput {locale} class="size" min="4" max="1024" ariaLabel={kind === "bytes" ? t("字节数", "Bytes") : t("长度", "Length")} bind:value={length} onenter={generate} />
    </label>
    <label class="field">
      <span>{t("数量", "Count")}</span>
      <NumberInput {locale} class="size" min="1" max="100" ariaLabel={t("数量", "Count")} bind:value={count} onenter={generate} />
    </label>
    {#if kind === "bytes"}
      <label class="field">
        <span>{t("输出格式", "Output format")}</span>
        <Select
          bind:value={byteFormat}
          options={[
            { value: "hex", label: "Hex" },
            { value: "base64", label: "Base64" },
            { value: "base64url", label: "Base64URL" },
          ]}
        />
      </label>
    {/if}
    <button class="dbx-btn dbx-btn--primary" disabled={!canGenerate} onclick={generate} type="button">
      {items.length ? t("重新生成", "Regenerate") : t("生成", "Generate")}
    </button>
    {#if items.length > 1}
      <CopyButton {locale} text={allText} labelZh="复制全部" labelEn="Copy all" />
    {/if}
  </div>

  {#if kind === "password"}
    <div class="password-options" aria-label={t("密码字符选项", "Password character options")}>
      <label class="check"><input type="checkbox" bind:checked={lower} /><span>{t("小写字母", "Lowercase")}</span></label>
      <label class="check"><input type="checkbox" bind:checked={upper} /><span>{t("大写字母", "Uppercase")}</span></label>
      <label class="check"><input type="checkbox" bind:checked={digits} /><span>{t("数字", "Numbers")}</span></label>
      <label class="check"><input type="checkbox" bind:checked={symbols} /><span>{t("特殊符号", "Symbols")}</span></label>
      <label class="check"><input type="checkbox" bind:checked={excludeAmbiguous} /><span>{t("排除易混淆字符", "Exclude ambiguous characters")}</span></label>
    </div>
    <div class="summary" class:error={!canGenerate}>
      {#if selectedGroupCount === 0}
        {t("请至少选择一种字符类型", "Select at least one character type")}
      {:else if Number(length) < selectedGroupCount}
        {t("密码长度不能小于所选字符类型数", "Length must cover every selected character type")}
      {:else}
        {t("估算熵值", "Estimated entropy")}：<strong>{Math.round(entropy)} bits</strong>
        <span class="dot">·</span>
        <strong>{strengthLabel(entropy)}</strong>
      {/if}
      {#if isDirty}
        <span class="dot">·</span><span class="pending" role="status">{t("配置已更改，请重新生成", "Settings changed; regenerate to apply")}</span>
      {/if}
    </div>
  {:else}
    <p class="summary">
      {t("随机字节由安全随机数生成；Hex 输出长度是字节数的两倍。", "Random bytes use a cryptographically secure generator; Hex output has two characters per byte.")}
      {#if isDirty}
        <span class="dot">·</span><span class="pending" role="status">{t("配置已更改，请重新生成", "Settings changed; regenerate to apply")}</span>
      {/if}
    </p>
  {/if}

  <div class="rows" class:numbered={items.length > 1}>
    {#each items as value, i (`${i}:${value}`)}
      <div class="row">
        {#if items.length > 1}<span class="idx">{i + 1}</span>{/if}
        <input class="dbx-input mono" readonly aria-label={t("生成结果", "Generated value")} value={value} />
        <CopyButton
          {locale}
          text={value}
          labelZh={items.length > 1 ? `复制第 ${i + 1} 条` : chrome.copy.zh}
          labelEn={items.length > 1 ? `Copy #${i + 1}` : chrome.copy.en}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
  .opts { display: flex; flex-wrap: wrap; gap: var(--ui-gap, 12px); align-items: flex-end; }
  .opts :global(.copy-btn) { align-self: flex-end; }
  .field :global(.dbx-custom-select) { width: auto; min-width: 132px; }
  .field :global(.dbx-number.size) { width: 5.5rem; }
  .password-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    padding: 10px 12px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 6px);
    background: var(--color-muted, color-mix(in srgb, CanvasText 4%, transparent));
  }
  .check { display: inline-flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; cursor: pointer; }
  .check input { margin: 0; }
  .summary {
    min-height: 18px;
    margin: -4px 0 0;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 12px;
  }
  .summary strong { color: var(--color-foreground, CanvasText); }
  .summary.error { color: var(--color-destructive); }
  .pending {
    color: var(--color-warning);
    font-weight: 600;
  }
  .dot { margin: 0 5px; }
  .rows { display: flex; flex-direction: column; gap: 6px; max-height: min(420px, 60vh); overflow: auto; }
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 30px; gap: 8px; align-items: center; }
  .rows.numbered .row { grid-template-columns: 1.75rem minmax(0, 1fr) 30px; }
  .idx {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
</style>
