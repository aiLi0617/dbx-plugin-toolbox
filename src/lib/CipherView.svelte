<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";
  import { runAsymmetric, runSymmetric, runXor, RSA_PADDINGS } from "./tools/encode.js";

  let { locale = "zh-CN", kind = "aes" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let op = $state("encrypt");
  let algorithm = $state("aes-256");
  let mode = $state("gcm");
  let sm4Mode = $state("cbc");
  let padding = $state("oaep");
  let inputHex = $state("text");
  let input = $state("");
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let output = $state("");
  let extra = $state("");
  let error = $state("");

  $effect(() => {
    algorithm = kind === "rsa" ? "rsa" : "aes-256";
  });

  const picker = $derived.by(() => {
    if (kind === "aes") return algorithm === "sm4-128" ? "sm4-128" : "aes";
    if (kind === "rsa") return algorithm === "sm2" ? "sm2" : "rsa-pem";
    if (kind === "xor") return "xor";
    return "hmac";
  });
  const ctx = $derived(keyCtx(source, keyId, material));
  const encrypting = $derived(op === "encrypt");
  const leftLabel = $derived(
    kind === "xor"
      ? t("输入", "Input")
      : encrypting
        ? t("明文", "Plaintext")
        : t("密文", "Ciphertext"),
  );
  const rightLabel = $derived(
    kind === "xor"
      ? t("Hex", "Hex")
      : encrypting
        ? t("密文", "Ciphertext")
        : t("明文", "Plaintext"),
  );

  async function compute(nextCtx, text) {
    if (kind === "aes") {
      return {
        text: await runSymmetric(text, { op, algorithm, mode, sm4Mode }, nextCtx),
        extra: "",
      };
    }
    if (kind === "rsa") {
      return {
        text: await runAsymmetric(text, { op, algorithm, padding }, nextCtx),
        extra: "",
      };
    }
    const xor = await runXor(text, inputHex === "hex", nextCtx);
    return { text: xor.hex, extra: xor.utf8 };
  }

  $effect(() => {
    const text = input;
    const next = ctx;
    const snapshot = [kind, op, algorithm, mode, sm4Mode, inputHex, padding];
    void snapshot;
    if (!text || !next) {
      output = "";
      extra = "";
      error = "";
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await compute(next, text);
        if (cancelled) return;
        output = result.text;
        extra = result.extra;
        error = "";
      } catch (err) {
        if (cancelled) return;
        output = "";
        extra = "";
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
    {#if kind !== "xor"}
      <div class="field">
        <span>{t("操作", "Operation")}</span>
        <div class="seg" role="group" aria-label={t("操作", "Operation")}>
          <button
            class:active={op === "encrypt"}
            aria-pressed={op === "encrypt"}
            onclick={() => (op = "encrypt")}
            type="button"
          >{t("加密", "Encrypt")}</button>
          <button
            class:active={op === "decrypt"}
            aria-pressed={op === "decrypt"}
            onclick={() => (op = "decrypt")}
            type="button"
          >{t("解密", "Decrypt")}</button>
        </div>
      </div>
    {/if}
    {#if kind === "aes"}
      <label class="field">
        <span>{t("算法", "Algorithm")}</span>
        <Select
          bind:value={algorithm}
          options={[
            { value: "aes-256", label: "AES-256" },
            { value: "aes-128", label: "AES-128" },
            { value: "sm4-128", label: "SM4" },
          ]}
        />
      </label>
      {#if algorithm === "sm4-128"}
        <label class="field">
          <span>{t("SM4 模式", "SM4 mode")}</span>
          <Select
            bind:value={sm4Mode}
            options={[
              { value: "cbc", label: "CBC" },
              { value: "ecb", label: "ECB" },
            ]}
          />
        </label>
      {:else}
        <label class="field">
          <span>{t("模式", "Mode")}</span>
          <Select
            bind:value={mode}
            options={[
              { value: "gcm", label: "GCM" },
              { value: "cbc", label: "CBC" },
            ]}
          />
        </label>
      {/if}
    {:else if kind === "rsa"}
      <label class="field">
        <span>{t("算法", "Algorithm")}</span>
        <Select
          bind:value={algorithm}
          options={[
            { value: "rsa", label: "RSA" },
            { value: "sm2", label: "SM2" },
          ]}
        />
      </label>
      {#if algorithm === "rsa"}
        <label class="field">
          <span>{t("填充", "Padding")}</span>
          <Select
            bind:value={padding}
            options={RSA_PADDINGS.map((item) => ({ value: item.value, label: pick(locale, item.zh, item.en) }))}
          />
        </label>
      {/if}
    {:else}
      <label class="field">
        <span>{t("输入格式", "Input format")}</span>
        <Select
          bind:value={inputHex}
          options={[
            { value: "text", label: t("文本", "Text") },
            { value: "hex", label: "Hex" },
          ]}
        />
      </label>
    {/if}
  </div>

  <KeySourceBar {locale} {picker} bind:source bind:material bind:keyId />

  {#if error}
    <p class="error">{error}</p>
  {:else if !ctx}
    <p class="dbx-hint">{t("提供密钥后会自动计算。", "Provide a key to compute automatically.")}</p>
  {/if}

  <IoSplit {locale} bind:input {output} error="" inputLabel={leftLabel} outputLabel={rightLabel} />

  {#if kind === "xor" && extra}
    <div class="row">
      <span class="name">UTF-8</span>
      <input class="dbx-input mono" readonly value={extra} />
      <CopyButton {locale} text={extra} labelZh="复制 UTF-8" labelEn="Copy UTF-8" />
    </div>
  {/if}
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .field :global(.dbx-select) {
    width: auto;
    min-width: 140px;
  }
  .seg {
    display: inline-flex;
    height: 30px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
  }
  .seg button {
    height: 100%;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: var(--color-background, Canvas);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button:hover:not(:disabled):not(.active) {
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
  }
  .seg button.active {
    background: var(--color-primary);
    color: var(--color-primary-foreground);
    font-weight: 600;
  }
  .error {
    margin: 0;
    color: var(--color-destructive, #dc2626);
  }
  .dbx-hint {
    margin: 0;
  }
  .row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
</style>
