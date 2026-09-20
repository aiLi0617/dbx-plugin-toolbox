<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { pick, localizeError } from "./i18n.js";
  import { INPUT_LIMITS } from "./inputLimits.js";
  import { jwkToPem, parseJwkDocument, pemToJwk, selectJwk, serializeJwkDocument } from "./jwk.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let operation = $state("normalize");
  let selectedKid = $state("");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);

  const parsed = $derived.by(() => {
    if (!input.trim()) return { document: null, error: "" };
    if (operation === "pem-to-jwk") return { document: { type: "pem", keys: [] }, error: "" };
    try { return { document: parseJwkDocument(input), error: "" }; }
    catch (err) { return { document: null, error: localizeError(locale, err) }; }
  });
  const keyOptions = $derived((parsed.document?.keys || []).map((key, index) => ({
    value: key.kid || String(index),
    label: key.kid ? `${key.kid} · ${key.kty}` : `${t("密钥", "Key")} ${index + 1} · ${key.kty}`,
  })));

  $effect(() => {
    if (!parsed.document) { selectedKid = ""; return; }
    const keys = parsed.document.keys || [];
    if (!keys.some((key, index) => (key.kid || String(index)) === selectedKid)) {
      selectedKid = keys[0]?.kid || (keys.length ? "0" : "");
    }
  });

  $effect(() => {
    const text = input;
    const op = operation;
    const kid = selectedKid;
    const doc = parsed.document;
    const parseError = parsed.error;

    output = "";
    error = "";
    busy = false;

    if (!text.trim()) return;
    if (parseError) {
      error = parseError;
      return;
    }
    if (!doc) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      busy = true;
      try {
        let next = "";
        if (op === "normalize") next = serializeJwkDocument(doc);
        else if (op === "pem-to-jwk") next = JSON.stringify(await pemToJwk(text), null, 2);
        else next = await jwkToPem(selectJwk(doc, kid));
        if (cancelled) return;
        output = next;
        error = "";
      } catch (err) {
        if (cancelled) return;
        output = "";
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
    <label class="field">
      <span>{t("操作", "Operation")}</span>
      <Select bind:value={operation} options={[
        { value: "normalize", label: t("规范化 JWK / JWKS", "Normalize JWK / JWKS") },
        { value: "pem", label: t("RSA JWK → PEM", "RSA JWK → PEM") },
        { value: "pem-to-jwk", label: t("RSA PEM → JWK", "RSA PEM → JWK") },
      ]} />
    </label>
    {#if parsed.document?.keys?.length > 1 && operation === "pem"}
      <label class="field">
        <span>{t("选择密钥", "Select key")}</span>
        <Select bind:value={selectedKid} options={keyOptions} />
      </label>
    {/if}
  </div>

  <p class="hint">{t("支持 JWK 对象和 JWKS（keys 数组）。RSA 密钥可在标准 PKCS#8 / SPKI PEM 间转换；本地处理，不上传内容。", "Accepts a JWK object or JWKS (keys array). RSA keys can be converted to and from standard PKCS#8 / SPKI PEM; processing stays local.")}</p>
  <label class="block">
    <div class="caption-row"><span class="caption">{t("输入 JWK / JWKS", "Input JWK / JWKS")}</span><span class="counter">{new TextEncoder().encode(input).length} / {INPUT_LIMITS.jwk} B</span></div>
    <textarea class="dbx-textarea area mono" maxlength={INPUT_LIMITS.jwk} spellcheck="false" bind:value={input} placeholder={'{"kty":"RSA","n":"…","e":"AQAB"}' }></textarea>
  </label>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <label class="block output-block">
    <div class="caption-row">
      <span class="caption">{t("输出", "Output")}</span>
      {#if busy}<span class="status" role="status">{t("转换中…", "Converting…")}</span>{/if}
      {#if output}<CopyButton {locale} text={output} labelZh="复制输出" labelEn="Copy output" />{/if}
    </div>
    <textarea class="dbx-textarea area mono" readonly value={output} placeholder={t("转换结果会显示在这里。", "The converted result appears here.")}></textarea>
  </label>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  .options { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 6px; min-width: 180px; font-size: 12px; }
  .hint, .error, .status { margin: 0; font-size: 12px; line-height: 1.5; color: var(--color-muted-foreground); }
  .error { color: var(--color-destructive); }
  .block { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .output-block { flex: 1; }
  .caption-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
  .counter { color: var(--color-muted-foreground); font-variant-numeric: tabular-nums; }
  .area { min-height: 150px; resize: vertical; }
  .mono { font-family: var(--font-mono); }
</style>
