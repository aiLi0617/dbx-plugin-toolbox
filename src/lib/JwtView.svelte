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

  const MODES = [
    { value: "decode", zh: "解码", en: "Decode" },
    { value: "verify", zh: "验签", en: "Verify" },
    { value: "sign", zh: "签发", en: "Sign" },
  ];

  let mode = $state("decode");
  let algorithm = $state("HS256");
  let token = $state("");
  let payload = $state('{\n  "sub": "user-1",\n  "name": "Demo"\n}');
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

  const signedParts = $derived.by(() => {
    if (!signed) return [];
    const parts = signed.split(".");
    return parts.length === 3 ? parts : [signed];
  });

  const signedClaims = $derived.by(() => {
    if (!signed || signedParts.length !== 3) return null;
    try {
      return inspectJwtClaims(decodeJwt(signed).payload);
    } catch {
      return null;
    }
  });

  function insertClaim(name) {
    let obj;
    try {
      obj = JSON.parse(payload || "{}");
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
    } catch {
      obj = {};
    }
    const now = Math.floor(Date.now() / 1000);
    if (name === "iat") obj.iat = now;
    else if (name === "exp") obj.exp = now + 3600;
    else if (name === "nbf") obj.nbf = now;
    else if (name === "sub" && obj.sub === undefined) obj.sub = "";
    payload = JSON.stringify(obj, null, 2);
  }

  $effect(() => {
    if (mode !== "sign") return;
    const next = ctx;
    const body = payload;
    const selectedAlgorithm = algorithm;
    if (!next || !String(body).trim()) {
      signed = "";
      signError = "";
      signing = false;
      return;
    }
    let cancelled = false;
    signing = true;
    const timer = setTimeout(async () => {
      try {
        const text = await signJwt(body, next, selectedAlgorithm);
        if (!cancelled) {
          signed = text;
          signError = "";
          signing = false;
        }
      } catch (err) {
        if (!cancelled) {
          signed = "";
          signError = localizeError(locale, err);
          signing = false;
        }
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (mode !== "verify") return;
    const next = ctx;
    const text = token;
    const selectedAlgorithm = algorithm;
    const canDecode = Boolean(decoded.value) && !decoded.error;
    if (!next || !String(text).trim() || !canDecode) {
      verifyStatus = null;
      verifyError = "";
      verifying = false;
      return;
    }
    let cancelled = false;
    verifying = true;
    const timer = setTimeout(async () => {
      try {
        const ok = await verifyJwt(text, next, selectedAlgorithm);
        if (!cancelled) {
          verifyStatus = ok;
          verifyError = "";
          verifying = false;
        }
      } catch (err) {
        if (!cancelled) {
          verifyStatus = null;
          verifyError = localizeError(locale, err);
          verifying = false;
        }
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (mode !== "verify") return;
    const headerAlgorithm = decoded.value?.header?.alg;
    if (JWT_ALGORITHMS.includes(headerAlgorithm)) algorithm = headerAlgorithm;
  });

  const keyPicker = $derived(algorithm.startsWith("HS") ? "hmac" : "rsa-pem");
  const asymmetric = $derived(!algorithm.startsWith("HS"));
  const keyHint = $derived(asymmetric
    ? t("提供 RSA 私钥后会自动签发。", "Provide an RSA private key to sign automatically.")
    : t("提供 HMAC 密钥后会自动签发。", "Provide an HMAC key to sign automatically."));
  const verifyKeyHint = $derived(asymmetric
    ? t("提供 RSA 公钥后会自动验签。", "Provide an RSA public key to verify automatically.")
    : t("提供 HMAC 密钥后会自动验签。", "Provide an HMAC key to verify automatically."));
</script>

<div class="page">
  <div class="mode-bar">
    <div class="seg" role="tablist" aria-label={t("模式", "Mode")}>
      {#each MODES as item (item.value)}
        <button
          class:active={mode === item.value}
          aria-selected={mode === item.value}
          onclick={() => (mode = item.value)}
          role="tab"
          type="button"
        >{t(item.zh, item.en)}</button>
      {/each}
    </div>
    {#if mode !== "decode"}
      <Select
        bind:value={algorithm}
        options={[
          ...JWT_ALGORITHMS.slice(0, 3).map((value) => ({ value, label: value, group: "HMAC" })),
          ...JWT_ALGORITHMS.slice(3, 6).map((value) => ({ value, label: value, group: "RSA PKCS#1 v1.5" })),
          ...JWT_ALGORITHMS.slice(6).map((value) => ({ value, label: value, group: "RSA-PSS" })),
        ]}
      />
    {/if}
  </div>

  {#if mode === "decode" || mode === "verify"}
    {#if mode === "verify"}
      <KeySourceBar {locale} picker={keyPicker} multiline={asymmetric} bind:source bind:material bind:keyId />
      {#if !ctx}
        <p class="dbx-hint key-hint">{verifyKeyHint}</p>
      {/if}
    {/if}
    <label class="block token-block">
      <div class="caption-row">
        <span class="caption">Token</span>
        {#if mode === "verify"}
          <div class="verify-inline">
            {#if verifying}<span class="hint-inline">{t("验签中…", "Verifying…")}</span>{/if}
            {#if !verifying && verifyStatus === true}<span class="status valid">{t("签名有效", "Signature valid")}</span>{/if}
            {#if !verifying && verifyStatus === false}<span class="status invalid">{t("签名无效", "Signature invalid")}</span>{/if}
            {#if verifyError}<span class="error">{verifyError}</span>{/if}
          </div>
        {/if}
      </div>
      <textarea
        class="dbx-textarea area token-area"
        spellcheck="false"
        maxlength={INPUT_LIMITS.jwt}
        placeholder="eyJhbGciOiJIUzI1NiJ9..."
        bind:value={token}
      ></textarea>
    </label>
    {#if decoded.error}
      <p class="error">{decoded.error}</p>
    {:else if decoded.value}
      {#if claims}
        <div class="claims">
          {#if claims.exp}<span class:bad={claims.expired}>{claims.expired ? t("已过期", "Expired") : t("未过期", "Not expired")} · exp {claims.exp}</span>{/if}
          {#if claims.nbf}<span class:bad={!claims.active}>{claims.active ? t("已生效", "Active") : t("尚未生效", "Not active yet")} · nbf {claims.nbf}</span>{/if}
          {#if claims.iat}<span class:bad={claims.issuedInFuture}>iat {claims.iat}</span>{/if}
          {#if claims.invalid.length}<span class="bad">{t(`无效的时间声明：${claims.invalid.join(", ")}（需为可表示的秒数）`, `Invalid time claims: ${claims.invalid.join(", ")} (expected representable seconds)`)}</span>{/if}
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
    {:else}
      <p class="dbx-hint">{t("粘贴 JWT 后会拆出 Header 与 Payload。", "Paste a JWT to split header and payload.")}</p>
    {/if}
  {:else}
    <KeySourceBar {locale} picker={keyPicker} multiline={asymmetric} bind:source bind:material bind:keyId />
    {#if !ctx}
      <p class="dbx-hint key-hint">{keyHint}</p>
    {/if}

    <div class="sign-split">
      <div class="col">
        <div class="caption-row">
          <span class="caption">{t("Payload JSON", "Payload JSON")}</span>
          <div class="claim-actions">
            <button class="chip" type="button" onclick={() => insertClaim("sub")}>sub</button>
            <button class="chip" type="button" onclick={() => insertClaim("iat")}>iat</button>
            <button class="chip" type="button" onclick={() => insertClaim("exp")}>exp</button>
            <button class="chip" type="button" onclick={() => insertClaim("nbf")}>nbf</button>
          </div>
        </div>
        <textarea class="dbx-textarea area payload-area" spellcheck="false" maxlength={INPUT_LIMITS.jwt} bind:value={payload}></textarea>
      </div>

      <div class="col">
        <div class="caption-row">
          <span class="caption">JWT</span>
          {#if signed}
            <CopyButton {locale} text={signed} labelZh={chrome.copy.zh} labelEn={chrome.copy.en} />
          {/if}
        </div>
        {#if signError}
          <p class="error">{signError}</p>
        {/if}
        {#if signed}
          <pre class="token-out" aria-label="JWT">{#each signedParts as part, i (i)}{#if i > 0}<span class="dot">.</span>{/if}<span class="part p{i}">{part}</span>{/each}</pre>
          {#if signedClaims}
            <div class="claims">
              {#if signedClaims.exp}<span class:bad={signedClaims.expired}>{signedClaims.expired ? t("已过期", "Expired") : t("未过期", "Not expired")} · exp {signedClaims.exp}</span>{/if}
              {#if signedClaims.nbf}<span class:bad={!signedClaims.active}>{signedClaims.active ? t("已生效", "Active") : t("尚未生效", "Not active yet")} · nbf {signedClaims.nbf}</span>{/if}
              {#if signedClaims.iat}<span class:bad={signedClaims.issuedInFuture}>iat {signedClaims.iat}</span>{/if}
            </div>
          {/if}
        {:else}
          <div class="token-placeholder">
            {#if !ctx}
              {keyHint}
            {:else if signing}
              {t("正在签发…", "Signing…")}
            {:else}
              {t("编辑 Payload 后自动生成 JWT。", "JWT appears here as you edit the payload.")}
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .mode-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 12px;
    align-items: center;
    flex-shrink: 0;
  }
  .mode-bar :global(.dbx-select) {
    width: auto;
    min-width: 140px;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
    max-width: 100%;
  }
  .seg button {
    height: 30px;
    padding: 0 14px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button:last-child { border-right: 0; }
  .seg button:hover:not(.active) {
    background: var(--color-muted, color-mix(in srgb, CanvasText 6%, transparent));
  }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .block, .col {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    min-width: 0;
    min-height: 0;
  }
  .token-block {
    flex: 0 1 auto;
    min-height: 88px;
  }
  .area {
    flex: 1;
    min-height: 72px;
    resize: vertical;
  }
  .token-area {
    min-height: 88px;
    max-height: 160px;
    font-family: var(--font-mono);
  }
  .payload-area {
    flex: 1;
    min-height: 0;
    resize: none;
    font-family: var(--font-mono);
  }
  .caption-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: var(--ui-caption, 20px);
  }
  .caption {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground);
  }
  .verify-inline, .claim-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .hint-inline {
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .chip {
    height: 22px;
    padding: 0 8px;
    border-radius: 999px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: var(--color-muted-foreground);
    font: inherit;
    font-size: 11px;
    font-family: var(--font-mono);
    cursor: pointer;
  }
  .chip:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 6%, transparent));
    color: var(--color-foreground);
  }
  .jsons, .sign-split {
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
  .token-out, .token-placeholder {
    flex: 1;
    min-height: 0;
    margin: 0;
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md);
    background: var(--color-card, var(--color-background, Canvas));
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .token-placeholder {
    display: flex;
    align-items: center;
    color: var(--color-muted-foreground);
  }
  .dot { color: var(--color-muted-foreground); }
  .part.p0 { color: #e11d48; }
  .part.p1 { color: #2563eb; }
  .part.p2 { color: #16a34a; }
  .row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
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
    flex-shrink: 0;
  }
  .dbx-hint, .key-hint {
    margin: 0;
    flex-shrink: 0;
  }

  @container (max-width: 720px) {
    .jsons, .sign-split {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(160px, 1fr) minmax(160px, 1fr);
    }
  }
</style>
