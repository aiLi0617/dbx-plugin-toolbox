<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";
  import { runAsymmetric, runSymmetricDetailed, runXor, RSA_PADDINGS } from "./tools/encode.js";

  let { locale = "zh-CN", kind = "aes", initialOptions = {} } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let op = $state("encrypt");
  let algorithm = $state("aes-256");
  let mode = $state("gcm");
  let sm4Mode = $state("cbc");
  let padding = $state("oaep");
  let outputEncoding = $state("utf8");
  let inputHex = $state("text");
  let input = $state("");
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let output = $state("");
  let extra = $state("");
  let error = $state("");
  let payloadFormat = $state("packed");
  let cipherEncoding = $state("base64");
  let parameterEncoding = $state("hex");
  let plainEncoding = $state("utf8");
  let iv = $state("");
  let aad = $state("");
  let aadEncoding = $state("utf8");
  let tag = $state("");
  let resultMeta = $state(null);
  let busy = $state(false);

  $effect(() => {
    const options = initialOptions;
    const algorithms = kind === "rsa" ? ["rsa", "sm2"] : ["aes-128", "aes-256", "sm4-128"];
    algorithm = algorithms.includes(options.algorithm) ? options.algorithm : kind === "rsa" ? "rsa" : "aes-256";
    mode = options.mode === "cbc" ? "cbc" : "gcm";
    sm4Mode = options.mode === "ecb" ? "ecb" : "cbc";
    op = options.op === "decrypt" ? "decrypt" : "encrypt";
    padding = options.padding === "pkcs1" ? "pkcs1" : "oaep";
    outputEncoding = ["utf8", "hex", "base64"].includes(options.outputEncoding) ? options.outputEncoding : "utf8";
  });

  const picker = $derived.by(() => {
    if (kind === "aes") return algorithm === "sm4-128" ? "sm4-128" : "aes";
    if (kind === "rsa") return algorithm === "sm2" ? "sm2" : "rsa-pem";
    if (kind === "xor") return "xor";
    return "hmac";
  });
  const ctx = $derived(keyCtx(source, keyId, material));
  const encrypting = $derived(op === "encrypt");
  const activeMode = $derived(algorithm === "sm4-128" ? sm4Mode : mode);
  const advanced = $derived(payloadFormat === "separate");
  const encodings = [ { value: "hex", label: "Hex" }, { value: "base64", label: "Base64" } ];
  const textEncodings = [ { value: "utf8", label: "UTF-8" }, ...encodings ];
  const packedHint = $derived(activeMode === "gcm"
    ? t("Base64(nonce 12 字节 + 密文 + tag 16 字节)，无 AAD。加密时自动生成 nonce。", "Base64(12-byte nonce + ciphertext + 16-byte tag), no AAD. A fresh nonce is generated for encryption.")
    : activeMode === "cbc"
      ? t("Base64(IV 16 字节 + 密文)，PKCS#7 填充。加密时自动生成 IV。", "Base64(16-byte IV + ciphertext), PKCS#7 padding. A fresh IV is generated for encryption.")
      : t("Base64(密文)，PKCS#7 填充，ECB 不使用 IV。", "Base64(ciphertext), PKCS#7 padding; ECB has no IV."));
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

  async function compute(nextKind, nextCtx, text, options) {
    if (nextKind === "aes") {
      return { ...await runSymmetricDetailed(text, options, nextCtx), extra: "" };
    }
    if (nextKind === "rsa") {
      return {
        text: await runAsymmetric(text, options, nextCtx),
        extra: "",
      };
    }
    const xor = await runXor(text, options.inputHex === "hex", nextCtx);
    return { text: xor.hex, extra: xor.utf8 };
  }

  $effect(() => {
    const text = input;
    const next = ctx;
    const options = { op, algorithm, mode, sm4Mode, inputHex, padding, outputEncoding, payloadFormat, cipherEncoding, parameterEncoding, plainEncoding, iv, aad, aadEncoding, tag };
    const nextKind = kind;
    output = "";
    extra = "";
    error = "";
    resultMeta = null;
    busy = false;
    if ((!text && op === "decrypt" && !(kind === "aes" && advanced && activeMode === "gcm" && tag.trim())) || !next) {
      return;
    }
    busy = true;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await compute(nextKind, next, text, options);
        if (cancelled) return;
        output = result.text;
        extra = result.extra;
        error = "";
        resultMeta = result;
      } catch (err) {
        if (cancelled) return;
        output = "";
        extra = "";
        error = localizeError(locale, err);
      } finally {
        if (!cancelled) busy = false;
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
      {#if !encrypting}
        <label class="field">
          <span>{t("解密输出", "Decryption output")}</span>
          <Select bind:value={outputEncoding} options={[
            { value: "utf8", label: "UTF-8" },
            { value: "hex", label: "Hex" },
            { value: "base64", label: "Base64" },
          ]} />
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

  {#if kind === "aes"}
    <div class="options">
      <label class="field">
        <span>{t("密文格式", "Ciphertext format")}</span>
        <Select bind:value={payloadFormat} options={[
          { value: "packed", label: t("简单封装", "Packed") },
          { value: "separate", label: t("高级互操作", "Separate parameters") },
        ]} />
      </label>
      {#if advanced}
        <label class="field"><span>{t("密文编码", "Ciphertext encoding")}</span><Select bind:value={cipherEncoding} options={encodings} /></label>
        <label class="field"><span>{t("明文编码", "Plaintext encoding")}</span><Select bind:value={plainEncoding} options={textEncodings} /></label>
        {#if activeMode !== "ecb"}
          <label class="field"><span>{t("IV / tag 编码", "IV / tag encoding")}</span><Select bind:value={parameterEncoding} options={encodings} /></label>
        {/if}
      {/if}
    </div>
    {#if advanced}
      <div class="advanced-fields">
        {#if activeMode !== "ecb"}
          <label class="field">
            <span>{activeMode === "gcm" ? "Nonce · 12 bytes" : "IV · 16 bytes"}</span>
            <input class="dbx-input mono" bind:value={iv} spellcheck="false" autocomplete="off" placeholder={encrypting ? t("留空时随机生成", "Leave empty to generate randomly") : t("必填", "Required")} />
          </label>
        {/if}
        {#if activeMode === "gcm"}
          <label class="field"><span>{t("AAD 编码", "AAD encoding")}</span><Select bind:value={aadEncoding} options={textEncodings} /></label>
          <label class="field"><span>{t("附加认证数据 AAD（可选）", "Additional authenticated data (optional)")}</span><input class="dbx-input mono" bind:value={aad} spellcheck="false" autocomplete="off" /></label>
          {#if !encrypting}
            <label class="field"><span>Tag · 16 bytes</span><input class="dbx-input mono" bind:value={tag} spellcheck="false" autocomplete="off" placeholder={t("必填", "Required")} /></label>
          {/if}
        {/if}
      </div>
      <p class="dbx-hint">{activeMode === "gcm"
        ? t("密文不包含 nonce 或 tag；三者需分别传递。相同密钥下，每次加密必须使用不同 nonce。", "Ciphertext excludes nonce and tag; pass them separately. Every encryption with the same key requires a different nonce.")
        : activeMode === "ecb"
          ? t("ECB 不使用 IV；使用 PKCS#7 填充。", "ECB has no IV; uses PKCS#7 padding.")
          : t("密文不包含 IV；使用 PKCS#7 填充。", "Ciphertext excludes the IV; uses PKCS#7 padding.")}</p>
    {:else}
      <p class="dbx-hint">{packedHint}</p>
    {/if}
  {/if}

  {#if kind === "aes" && ((algorithm === "sm4-128" && sm4Mode !== "gcm") || (algorithm !== "sm4-128" && mode === "cbc"))}
    <p class="security-warning">{t("兼容模式不提供密文完整性保护；新数据优先使用 AES-GCM。", "Compatibility mode does not authenticate ciphertext; prefer AES-GCM for new data.")}</p>
  {:else if kind === "rsa" && algorithm === "rsa" && padding === "pkcs1"}
    <p class="security-warning">{t("PKCS#1 v1.5 仅用于兼容旧系统；新数据优先使用 OAEP-SHA256。", "PKCS#1 v1.5 is for legacy compatibility; prefer OAEP-SHA256.")}</p>
  {/if}

  <KeySourceBar {locale} {picker} bind:source bind:material bind:keyId />

  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !ctx}
    <p class="dbx-hint">{t("提供密钥后会自动计算。", "Provide a key to compute automatically.")}</p>
  {/if}

  <IoSplit
    {locale}
    bind:input
    {output}
    error=""
    inputLabel={leftLabel}
    outputLabel={rightLabel}
    outputStatus={busy ? t("计算中…", "Computing…") : ""}
  />

  {#if kind === "aes" && resultMeta}
    {#if advanced && encrypting}
      {#if activeMode !== "ecb"}
        <div class="row"><span class="name">{activeMode === "gcm" ? "Nonce" : "IV"}</span><input class="dbx-input mono" readonly value={resultMeta.iv || ""} /><CopyButton {locale} text={resultMeta.iv || ""} labelZh="复制 IV / nonce" labelEn="Copy IV / nonce" /></div>
      {/if}
      {#if activeMode === "gcm"}
        <div class="row"><span class="name">Tag</span><input class="dbx-input mono" readonly value={resultMeta.tag || ""} /><CopyButton {locale} text={resultMeta.tag || ""} labelZh="复制 tag" labelEn="Copy tag" /></div>
      {/if}
    {:else if !encrypting && resultMeta.textEncoding === "hex" && !advanced}
      <p class="dbx-hint">{t("解密结果不是 UTF-8 文本，已显示为 Hex；可切换高级模式选择输出编码。", "Decrypted bytes are not UTF-8 and are shown as Hex. Advanced mode lets you select the output encoding.")}</p>
    {/if}
  {/if}

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
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .page :global(.split) { flex-shrink: 0; min-height: 320px; }
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
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; }
  .advanced-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .advanced-fields .dbx-input { width: 100%; }
  .mono { font-family: var(--font-mono); }
  @media (max-width: 560px) { .advanced-fields { grid-template-columns: 1fr; } }
  .security-warning {
    margin: 0;
    padding: 7px 10px;
    border-left: 3px solid var(--color-warning, #d97706);
    background: var(--color-warning-bg, #fffbeb);
    color: var(--color-foreground, #292524);
    font-size: 12px;
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
