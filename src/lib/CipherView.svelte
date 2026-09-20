<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
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
      ? (inputHex === "hex" ? t("输入（Hex）", "Input (Hex)") : t("输入（文本）", "Input (Text)"))
      : encrypting
        ? t("明文", "Plaintext")
        : t("密文", "Ciphertext"),
  );
  const rightLabel = $derived(
    encrypting ? t("密文", "Ciphertext") : t("明文", "Plaintext"),
  );
  const xorLooksLikeHex = $derived(
    kind === "xor"
      && inputHex === "text"
      && /^[0-9a-fA-F]{4,}(?:\s+[0-9a-fA-F]+)*$/.test(input.trim())
      && input.trim().replace(/\s+/g, "").length % 2 === 0,
  );
  const xorInputPlaceholder = $derived(
    inputHex === "hex"
      ? t("例如 68656c6c6f（hello 的 Hex）", "e.g. 68656c6c6f (hex for hello)")
      : t("例如 hello", "e.g. hello"),
  );

  function useXorHexAsInput() {
    if (!output) return;
    input = output;
    inputHex = "hex";
  }

  function switchXorToHex() {
    inputHex = "hex";
  }

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
    const limitError = inputLimitError(text, INPUT_LIMITS.crypto, {
      locale,
      zh: leftLabel,
      en: leftLabel,
    });
    if (limitError) {
      error = limitError;
      return;
    }
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
        <span class="dbx-label">{t("操作", "Operation")}</span>
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
        <span class="dbx-label">{t("算法", "Algorithm")}</span>
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
          <span class="dbx-label">{t("SM4 模式", "SM4 mode")}</span>
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
          <span class="dbx-label">{t("模式", "Mode")}</span>
          <Select
            bind:value={mode}
            options={[
              { value: "gcm", label: "GCM" },
              { value: "cbc", label: "CBC" },
            ]}
          />
        </label>
      {/if}
      <label class="field" title={advanced ? undefined : packedHint}>
        <span class="dbx-label">{t("密文格式", "Ciphertext format")}</span>
        <Select bind:value={payloadFormat} options={[
          { value: "packed", label: t("简单封装", "Packed") },
          { value: "separate", label: t("高级互操作", "Separate parameters") },
        ]} />
      </label>
    {:else if kind === "rsa"}
      <label class="field">
        <span class="dbx-label">{t("算法", "Algorithm")}</span>
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
          <span class="dbx-label">{t("填充", "Padding")}</span>
          <Select
            bind:value={padding}
            options={RSA_PADDINGS.map((item) => ({ value: item.value, label: pick(locale, item.zh, item.en) }))}
          />
        </label>
      {/if}
      {#if !encrypting}
        <label class="field">
          <span class="dbx-label">{t("解密输出", "Decryption output")}</span>
          <Select bind:value={outputEncoding} options={[
            { value: "utf8", label: "UTF-8" },
            { value: "hex", label: "Hex" },
            { value: "base64", label: "Base64" },
          ]} />
        </label>
      {/if}
    {:else}
      <div class="field">
        <span class="dbx-label">{t("输入格式", "Input format")}</span>
        <div class="seg" role="group" aria-label={t("输入格式", "Input format")}>
          <button
            class:active={inputHex === "text"}
            aria-pressed={inputHex === "text"}
            onclick={() => (inputHex = "text")}
            type="button"
          >{t("文本", "Text")}</button>
          <button
            class:active={inputHex === "hex"}
            aria-pressed={inputHex === "hex"}
            onclick={() => (inputHex = "hex")}
            type="button"
          >Hex</button>
        </div>
      </div>
    {/if}
  </div>

  {#if kind === "xor"}
    <p class="dbx-hint">{t(
      "对每个字节与密钥循环异或。右侧 Hex 是主结果，下方 UTF-8 是同一字节的可读预览。还原时点「填入输入」或贴回并选 Hex。",
      "XOR each byte with a repeating key. Hex on the right is the main result; UTF-8 below is the same bytes as text. To reverse, click Use as input or paste back as Hex.",
    )}</p>
  {/if}

  {#if kind === "aes" && advanced}
    <div class="options">
      <label class="field"><span class="dbx-label">{t("密文编码", "Ciphertext encoding")}</span><Select bind:value={cipherEncoding} options={encodings} /></label>
      <label class="field"><span class="dbx-label">{t("明文编码", "Plaintext encoding")}</span><Select bind:value={plainEncoding} options={textEncodings} /></label>
      {#if activeMode !== "ecb"}
        <label class="field"><span class="dbx-label">{t("IV / tag 编码", "IV / tag encoding")}</span><Select bind:value={parameterEncoding} options={encodings} /></label>
      {/if}
    </div>
    <div class="advanced-fields">
      {#if activeMode !== "ecb"}
        <label class="field">
          <span class="dbx-label">{activeMode === "gcm" ? "Nonce · 12 bytes" : "IV · 16 bytes"}</span>
          <input class="dbx-input mono" bind:value={iv} spellcheck="false" autocomplete="off" placeholder={encrypting ? t("留空时随机生成", "Leave empty to generate randomly") : t("必填", "Required")} />
        </label>
      {/if}
      {#if activeMode === "gcm"}
        <label class="field"><span class="dbx-label">{t("AAD 编码", "AAD encoding")}</span><Select bind:value={aadEncoding} options={textEncodings} /></label>
        <label class="field"><span class="dbx-label">{t("附加认证数据 AAD（可选）", "Additional authenticated data (optional)")}</span><input class="dbx-input mono" bind:value={aad} spellcheck="false" autocomplete="off" /></label>
        {#if !encrypting}
          <label class="field"><span class="dbx-label">Tag · 16 bytes</span><input class="dbx-input mono" bind:value={tag} spellcheck="false" autocomplete="off" placeholder={t("必填", "Required")} /></label>
        {/if}
      {/if}
    </div>
    <p class="dbx-hint">{activeMode === "gcm"
      ? t("密文不包含 nonce 或 tag；三者需分别传递。相同密钥下，每次加密必须使用不同 nonce。", "Ciphertext excludes nonce and tag; pass them separately. Every encryption with the same key requires a different nonce.")
      : activeMode === "ecb"
        ? t("ECB 不使用 IV；使用 PKCS#7 填充。", "ECB has no IV; uses PKCS#7 padding.")
        : t("密文不包含 IV；使用 PKCS#7 填充。", "Ciphertext excludes the IV; uses PKCS#7 padding.")}</p>
  {/if}

  {#if kind === "aes" && ((algorithm === "sm4-128" && sm4Mode !== "gcm") || (algorithm !== "sm4-128" && mode === "cbc"))}
    <p class="security-warning">{t("兼容模式不提供密文完整性保护；新数据优先使用 AES-GCM。", "Compatibility mode does not authenticate ciphertext; prefer AES-GCM for new data.")}</p>
  {:else if kind === "rsa" && algorithm === "rsa" && padding === "pkcs1"}
    <p class="security-warning">{t("PKCS#1 v1.5 仅用于兼容旧系统；新数据优先使用 OAEP-SHA256。", "PKCS#1 v1.5 is for legacy compatibility; prefer OAEP-SHA256.")}</p>
  {/if}

  <KeySourceBar
    {locale}
    {picker}
    multiline={kind === "rsa"}
    materialLabel={kind === "xor" ? t("密钥材料（hex/base64）", "Key material (hex/base64)") : ""}
    materialPlaceholder={kind === "xor" ? t("例如 00 或 deadbeef", "e.g. 00 or deadbeef") : ""}
    bind:source
    bind:material
    bind:keyId
  />

  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if !ctx}
    <p class="dbx-hint">{t("提供密钥后会自动计算。", "Provide a key to compute automatically.")}</p>
  {:else if xorLooksLikeHex}
    <div class="warn-hint" role="status">
      <span>{t(
        "当前按「文本」处理这些字符。若这是上次的 Hex 结果，请改用 Hex。",
        "Treating these as text characters. If this is a prior Hex result, switch to Hex.",
      )}</span>
      <button class="dbx-btn hint-action" type="button" onclick={switchXorToHex}>{t("改为 Hex", "Use Hex")}</button>
    </div>
  {/if}

  {#if kind === "xor"}
    <div class="xor-io">
      <div class="xor-col">
        <div class="caption-row">
          <span class="dbx-label caption">{leftLabel}</span>
          <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={!input} onclick={() => (input = "")}>{t("清空", "Clear")}</button>
        </div>
        <textarea
          class="dbx-textarea xor-area"
          spellcheck="false"
          placeholder={xorInputPlaceholder}
          maxlength={INPUT_LIMITS.crypto}
          bind:value={input}
          aria-label={leftLabel}
        ></textarea>
      </div>
      <div class="xor-col xor-out">
        <div class="xor-pane primary">
          <div class="caption-row">
            <span class="dbx-label caption">
              Hex
              {#if busy}<span class="output-status" role="status">{t("计算中…", "Computing…")}</span>{/if}
            </span>
            <div class="pane-actions">
              {#if output}
                <button class="dbx-btn dbx-btn--ghost small-action" type="button" onclick={useXorHexAsInput}>{t("填入输入", "Use as input")}</button>
              {/if}
              <CopyButton {locale} text={output} labelZh="复制 Hex" labelEn="Copy Hex" />
            </div>
          </div>
          <textarea class="dbx-textarea xor-area out" readonly tabindex="-1" value={output} aria-label="Hex"></textarea>
        </div>
        <div class="xor-pane preview">
          <div class="caption-row">
            <span class="dbx-label subcap">{t("UTF-8 预览", "UTF-8 preview")}</span>
            <CopyButton {locale} text={extra} labelZh="复制 UTF-8" labelEn="Copy UTF-8" />
          </div>
          <textarea class="dbx-textarea xor-area out preview-area" readonly tabindex="-1" value={extra} aria-label={t("UTF-8 预览", "UTF-8 preview")}></textarea>
        </div>
      </div>
    </div>
  {:else}
    <IoSplit
      {locale}
      bind:input
      {output}
      error=""
      inputLabel={leftLabel}
      outputLabel={rightLabel}
      outputStatus={busy ? t("计算中…", "Computing…") : ""}
      maxlength={INPUT_LIMITS.crypto}
    />
  {/if}

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
  .page :global(.shell) { flex: 1 1 auto; min-height: 280px; }
  .page :global(.split) { min-height: 280px; }
  .xor-io {
    container-type: inline-size;
    flex: 1 0 auto;
    min-height: 320px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
  }
  .xor-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
  }
  .xor-out {
    display: grid;
    grid-template-rows: minmax(0, 1.6fr) minmax(72px, 0.7fr);
    gap: 8px;
  }
  .xor-pane {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .caption-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 20px;
  }
  .caption,
  .subcap {
    color: var(--color-muted-foreground);
  }
  .subcap {
    font-size: 11px;
  }
  .pane-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .output-status {
    margin-left: 6px;
    font-weight: 400;
    white-space: nowrap;
  }
  .xor-area {
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    resize: none;
    line-height: 1.55;
  }
  .xor-area.out {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
  }
  .preview-area {
    min-height: 56px;
  }
  @container (max-width: 520px) {
    .xor-io {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(140px, 1fr) minmax(180px, 1.2fr);
    }
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
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; font-size: 12px; }
  .advanced-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .advanced-fields .dbx-input { width: 100%; }
  .mono { font-family: var(--font-mono); }
  @media (max-width: 560px) { .advanced-fields { grid-template-columns: 1fr; } }
  .security-warning {
    margin: 0;
    padding: 7px 10px;
    border-left: 3px solid var(--color-warning);
    background: var(--color-warning-bg);
    color: var(--color-foreground);
    font-size: 12px;
  }
  .dbx-hint {
    margin: 0;
  }
  .warn-hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 7px 10px;
    border-left: 3px solid var(--color-warning);
    background: var(--color-warning-bg, color-mix(in srgb, var(--color-warning) 12%, var(--color-background, Canvas)));
    color: var(--color-foreground);
    font-size: 12px;
  }
  .warn-hint span {
    flex: 1 1 12rem;
    min-width: 0;
  }
  .hint-action {
    flex: 0 0 auto;
    height: 26px;
    min-height: 26px;
    padding: 0 10px;
    font-size: 12px;
  }
  .small-action {
    min-height: 20px;
    height: 20px;
    padding: 0 5px;
    font-size: 11px;
  }
  .row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
</style>
