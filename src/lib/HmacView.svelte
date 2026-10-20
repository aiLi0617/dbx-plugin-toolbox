<script>
  import CopyButton from "./CopyButton.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { keyCtx } from "./keySource.js";
  import { HMAC_ALGORITHMS, runHmac } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let digests = $state({});
  let error = $state("");

  // HMAC keys are byte strings and can be reused with any supported digest.
  // The stored algorithm is descriptive metadata, not a compatibility boundary.
  const picker = "hmac";
  const ctx = $derived(keyCtx(source, keyId, material));

  $effect(() => {
    const text = input;
    const next = ctx;
    digests = {};
    const limitError = inputLimitError(text, INPUT_LIMITS.hmac, t("输入", "Input"));
    if (limitError) {
      error = limitError;
      return;
    }
    if (!next) {
      error = "";
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const values = await Promise.all(
          HMAC_ALGORITHMS.map(async (item) => [item.value, await runHmac(text, item.value, next)]),
        );
        if (cancelled) return;
        digests = Object.fromEntries(values);
        error = "";
      } catch (err) {
        if (cancelled) return;
        digests = {};
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
  <KeySourceBar {locale} {picker} requiredPurpose="hmac" bind:source bind:material bind:keyId />
  <label class="block">
    <span class="label">{t("输入", "Input")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.hmac} bind:value={input}></textarea>
  </label>
  {#if error}
    <p class="error">{error}</p>
  {:else if !ctx}
    <p class="dbx-hint">{t("提供密钥后会计算摘要。", "Provide a key to compute the digest.")}</p>
  {/if}
  <div class="results" aria-label={`HMAC ${t("摘要", "Digest")}`}>
    {#each HMAC_ALGORITHMS as item}
      {@const label = t(item.zh, item.en)}
      {@const digest = digests[item.value] || ""}
      <div class="result-row">
        <span class="name">{label}</span>
        <input
          class="dbx-input mono"
          class:invalid={Boolean(error)}
          readonly
          aria-label={t(`${label} 摘要`, `${label} digest`)}
          value={digest}
        />
        <CopyButton {locale} text={digest} labelZh={`复制 ${label} 摘要`} labelEn={`Copy ${label} digest`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
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
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .area {
    min-height: 96px;
    max-height: 220px;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .result-row {
    display: grid;
    grid-template-columns: 8rem minmax(0, 1fr) 30px;
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
  @media (max-width: 520px) {
    .result-row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .result-row .name {
      grid-column: 1 / -1;
    }
  }
</style>
