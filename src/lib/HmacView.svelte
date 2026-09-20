<script>
  import CopyButton from "./CopyButton.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { keyCtx } from "./keySource.js";
  import { HMAC_ALGORITHMS, runHmac } from "./tools/encode.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let algorithm = $state("hmac-sha256");
  let input = $state("");
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let digest = $state("");
  let error = $state("");
  $effect(() => {
    if (HMAC_ALGORITHMS.some((item) => item.value === initialOptions.algorithm)) {
      algorithm = initialOptions.algorithm;
    }
  });

  const picker = $derived(algorithm === "hmac-sm3" ? "hmac-sm3" : "hmac");
  const ctx = $derived(keyCtx(source, keyId, material));

  $effect(() => {
    const text = input;
    const alg = algorithm;
    const next = ctx;
    digest = "";
    const limitError = inputLimitError(text, INPUT_LIMITS.hmac, t("输入", "Input"));
    if (limitError) {
      error = limitError;
      return;
    }
    if (!next) {
      digest = "";
      error = "";
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const value = await runHmac(text, alg, next);
        if (cancelled) return;
        digest = value;
        error = "";
      } catch (err) {
        if (cancelled) return;
        digest = "";
        error = localizeError(locale, err);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });
</script>

<div class="page">
  <div class="options">
    <label class="field">
      <span>{t("算法", "Algorithm")}</span>
      <Select
        bind:value={algorithm}
        options={HMAC_ALGORITHMS.map((item) => ({ value: item.value, label: t(item.zh, item.en) }))}
      />
    </label>
  </div>
  <KeySourceBar {locale} {picker} bind:source bind:material bind:keyId />
  <label class="block">
    <span class="label">{t("输入", "Input")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.hmac} bind:value={input}></textarea>
  </label>
  {#if error}
    <p class="error">{error}</p>
  {:else if !ctx}
    <p class="dbx-hint">{t("提供密钥后会计算摘要。", "Provide a key to compute the digest.")}</p>
  {/if}
  <div class="row">
    <span class="name">{t("摘要", "Digest")}</span>
    <input class="dbx-input mono" class:invalid={Boolean(error)} readonly aria-label={t("摘要", "Digest")} value={digest} />
    <CopyButton {locale} text={digest} labelZh="复制摘要" labelEn="Copy digest" />
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
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
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 160px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .area {
    min-height: 96px;
    max-height: 220px;
  }
  .row {
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .invalid {
    border-color: var(--color-destructive);
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .dbx-hint {
    margin: 0;
  }
</style>
