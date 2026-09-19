<script>
  import CopyButton from "./CopyButton.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { chrome, localizeError, pick } from "./i18n.js";
  import { INPUT_LIMITS } from "./inputLimits.js";
  import { keyCtx } from "./keySource.js";
  import { decodeJwt, inspectJwtClaims, JWT_ALGORITHMS, signJwt, verifyJwt } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let mode = $state("decode");
  let algorithm = $state("HS256");
  let token = $state("");
  let payload = $state("{\n  \n}");
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let signed = $state("");
  let signError = $state("");
  let signing = $state(false);
  let verifyStatus = $state(null);
  let verifyError = $state("");
  let verifying = $state(false);

  const decoded = $derived.by(() => {
    if ((mode !== "decode" && mode !== "verify") || !token.trim()) return { value: null, error: "" };
    try {
      return { value: decodeJwt(token), error: "" };
    } catch (err) {
      return { value: null, error: localizeError(locale, err) };
    }
  });

  const headerText = $derived(decoded.value ? JSON.stringify(decoded.value.header, null, 2) : "");
  const payloadText = $derived(decoded.value ? JSON.stringify(decoded.value.payload, null, 2) : "");
  const signature = $derived(decoded.value?.signature || "");
  const claims = $derived(decoded.value ? inspectJwtClaims(decoded.value.payload) : null);
  const ctx = $derived(keyCtx(source, keyId, material));

  async function verify() {
    verifyStatus = null;
    verifyError = "";
    if (!ctx) {
      verifyError = t("请先提供密钥", "Provide a key first");
      return;
    }
    verifying = true;
    try {
      verifyStatus = await verifyJwt(token, ctx, algorithm);
    } catch (err) {
      verifyError = localizeError(locale, err);
    } finally {
      verifying = false;
    }
  }

  async function sign() {
    signError = "";
    signed = "";
    if (!ctx) {
      signError = t("请先提供密钥", "Provide a key first");
      return;
    }
    signing = true;
    try {
      signed = await signJwt(payload, ctx, algorithm);
    } catch (err) {
      signError = localizeError(locale, err);
    } finally {
      signing = false;
    }
  }

  $effect(() => {
    if (mode !== "sign") return;
    const next = ctx;
    const body = payload;
    const selectedAlgorithm = algorithm;
    if (!next || !String(body).trim()) {
      signed = "";
      signError = next ? "" : "";
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const text = await signJwt(body, next, selectedAlgorithm);
        if (!cancelled) {
          signed = text;
          signError = "";
        }
      } catch (err) {
        if (!cancelled) {
          signed = "";
          signError = localizeError(locale, err);
        }
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    token;
    material;
    keyId;
    source;
    algorithm;
    verifyStatus = null;
    verifyError = "";
  });

  $effect(() => {
    if (mode !== "verify") return;
    const headerAlgorithm = decoded.value?.header?.alg;
    if (JWT_ALGORITHMS.includes(headerAlgorithm)) algorithm = headerAlgorithm;
  });

  const keyPicker = $derived(algorithm.startsWith("HS") ? "hmac" : "rsa-pem");
  const asymmetric = $derived(!algorithm.startsWith("HS"));

</script>

<div class="page">
  <div class="options">
    <label class="field">
      <span>{t("模式", "Mode")}</span>
      <Select
        bind:value={mode}
        options={[
          { value: "decode", label: t("解码（不验签）", "Decode (no verify)") },
          { value: "verify", label: t("验签", "Verify") },
          { value: "sign", label: t("签发", "Sign") },
        ]}
      />
    </label>
    {#if mode !== "decode"}
      <label class="field">
        <span>{t("签名算法", "Signature algorithm")}</span>
        <Select
          bind:value={algorithm}
          options={[
            ...JWT_ALGORITHMS.slice(0, 3).map((value) => ({ value, label: value, group: "HMAC" })),
            ...JWT_ALGORITHMS.slice(3, 6).map((value) => ({ value, label: value, group: "RSA PKCS#1 v1.5" })),
            ...JWT_ALGORITHMS.slice(6).map((value) => ({ value, label: value, group: "RSA-PSS" })),
          ]}
        />
      </label>
    {/if}
  </div>

  {#if mode === "decode" || mode === "verify"}
    {#if mode === "verify"}
      <KeySourceBar {locale} picker={keyPicker} multiline={asymmetric} bind:source bind:material bind:keyId />
    {/if}
    <label class="block grow">
      <span class="caption">{t("Token", "Token")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.jwt} placeholder="eyJhbGciOiJIUzI1NiJ9..." bind:value={token}></textarea>
    </label>
    {#if decoded.error}
      <p class="error">{decoded.error}</p>
    {:else if decoded.value}
      {#if mode === "verify"}
        <div class="actions verify-actions">
          <button class="dbx-btn dbx-btn--primary" disabled={verifying || !ctx} onclick={verify} type="button">
            {verifying ? t("验签中…", "Verifying…") : t("验证签名", "Verify signature")}
          </button>
          {#if verifyStatus === true}<span class="status valid">{t("签名有效", "Signature valid")}</span>{/if}
          {#if verifyStatus === false}<span class="status invalid">{t("签名无效", "Signature invalid")}</span>{/if}
          {#if verifyError}<span class="error">{verifyError}</span>{/if}
        </div>
      {/if}
      <div class="jsons">
        <label class="block">
          <div class="caption-row">
            <span class="caption">Header</span>
            <CopyButton {locale} text={headerText} labelZh="复制 Header" labelEn="Copy header" />
          </div>
          <textarea class="dbx-textarea area json" readonly value={headerText}></textarea>
        </label>
        <label class="block">
          <div class="caption-row">
            <span class="caption">Payload</span>
            <CopyButton {locale} text={payloadText} labelZh="复制 Payload" labelEn="Copy payload" />
          </div>
          <textarea class="dbx-textarea area json" readonly value={payloadText}></textarea>
        </label>
      </div>
      <div class="row">
        <span class="name">{t("签名", "Signature")}</span>
        <input class="dbx-input mono" readonly value={signature} />
        <CopyButton {locale} text={signature} labelZh="复制签名" labelEn="Copy signature" />
      </div>
      {#if claims}
        <div class="claims">
          {#if claims.exp}<span class:bad={claims.expired}>{claims.expired ? t("已过期", "Expired") : t("未过期", "Not expired")} · exp {claims.exp}</span>{/if}
          {#if claims.nbf}<span class:bad={!claims.active}>{claims.active ? t("已生效", "Active") : t("尚未生效", "Not active yet")} · nbf {claims.nbf}</span>{/if}
          {#if claims.iat}<span class:bad={claims.issuedInFuture}>iat {claims.iat}</span>{/if}
          {#if claims.invalid.length}<span class="bad">{t(`无效的时间声明：${claims.invalid.join(", ")}（需为可表示的秒数）`, `Invalid time claims: ${claims.invalid.join(", ")} (expected representable seconds)`)}</span>{/if}
        </div>
      {/if}
    {:else}
      <p class="dbx-hint">{t("粘贴 JWT 后会拆出 Header 与 Payload。", "Paste a JWT to split header and payload.")}</p>
    {/if}
  {:else}
    <KeySourceBar {locale} picker={keyPicker} multiline={asymmetric} bind:source bind:material bind:keyId />
    <label class="block grow">
      <span class="caption">{t("Payload JSON", "Payload JSON")}</span>
      <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.jwt} bind:value={payload}></textarea>
    </label>
    <div class="actions">
      <button class="dbx-btn dbx-btn--primary" disabled={signing} onclick={sign} type="button">{t("签发", "Sign")}</button>
    </div>
    {#if signError}
      <p class="error">{signError}</p>
    {/if}
    {#if signed}
      <div class="row">
        <span class="name">JWT</span>
        <input class="dbx-input mono" readonly value={signed} />
        <CopyButton {locale} text={signed} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
      </div>
    {:else if !ctx}
      <p class="dbx-hint">{asymmetric
        ? t("提供 RSA 私钥后再签发。", "Provide an RSA private key before signing.")
        : t("提供 HMAC 密钥后再签发。", "Provide an HMAC key before signing.")}</p>
    {/if}
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
  .options,
  .actions {
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
    min-width: 180px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    min-width: 0;
    min-height: 0;
  }
  .grow {
    flex: 1 1 auto;
    min-height: 88px;
  }
  .area {
    flex: 1;
    min-height: 72px;
    resize: vertical;
  }
  .jsons {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
  }
  .json {
    min-height: 120px;
    font-family: var(--font-mono);
  }
  .row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .verify-actions, .claims {
    align-items: center;
  }
  .status, .claims span {
    font-size: 12px;
  }
  .valid { color: var(--color-success); }
  .invalid, .bad { color: var(--color-destructive); }
  .claims {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    color: var(--color-muted-foreground);
  }
  .dbx-hint {
    margin: 0;
  }

  @media (max-width: 720px) {
    .jsons {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
