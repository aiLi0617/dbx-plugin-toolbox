<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";
  import { AES_MAC_BY_TOOL } from "./cryptoCapabilities.js";

  let { locale = "zh-CN", toolId = "key-wrap", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const profiles = {
    "key-wrap": [{ value: "aes-kw", label: "AES-KW" }, { value: "aes-kwp", label: "AES-KWP" }],
    "storage-crypto": [{ value: "aes-xts", label: "AES-XTS" }],
    "format-preserving": [{ value: "aes-ff1", label: "AES-FF1" }],
    "aes-mac": [{ value: "aes-cmac", label: "AES-CMAC" }, { value: "aes-128-gmac", label: "AES-128-GMAC" }, { value: "aes-256-gmac", label: "AES-256-GMAC" }],
    "aes-cmac": [{ value: "aes-cmac", label: "AES-CMAC" }],
    "aes-128-gmac": [{ value: "aes-128-gmac", label: "AES-128-GMAC" }],
    "aes-256-gmac": [{ value: "aes-256-gmac", label: "AES-256-GMAC" }],
  };
  const encodings = [{ value: "utf8", label: "UTF-8" }, { value: "hex", label: "Hex" }, { value: "base64", label: "Base64" }];
  const binaryEncodings = encodings.slice(1);
  let algorithm = $state("aes-kw");
  let op = $state("encrypt");
  let input = $state("");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let keyEncoding = $state("auto");
  let inputEncoding = $state("hex");
  let outputEncoding = $state("hex");
  let nonce = $state("");
  let tweak = $state("");
  let radix = $state(10);
  let sector = $state(0);
  let runRevision = 0;

  $effect(() => {
    algorithm = AES_MAC_BY_TOOL[toolId] || initialOptions.algorithm || profiles[toolId]?.[0]?.value || "aes-kw";
    inputEncoding = toolId === "aes-mac" || Boolean(AES_MAC_BY_TOOL[toolId]) ? "utf8" : "hex";
    output = "";
    error = "";
  });
  const macOnly = $derived(toolId === "aes-mac" || Boolean(AES_MAC_BY_TOOL[toolId]));
  const live = $derived(toolId === "key-wrap" || toolId === "storage-crypto" || toolId === "format-preserving" || toolId === "aes-cmac");
  const fixedAlgorithm = $derived((profiles[toolId] || []).length === 1);
  const inputOptions = $derived(toolId === "format-preserving" ? [{ value: "utf8", label: t("数字 / 字母", "Digits / letters") }] : macOnly ? encodings : binaryEncodings);
  const keyLabel = $derived(toolId === "storage-crypto" ? t("32 或 64 字节双密钥", "32 or 64-byte double key") : t("AES 密钥", "AES key"));
  const allowedKeyAlgorithms = $derived(toolId === "storage-crypto" ? ["aes-xts-256", "aes-xts-512"] : algorithm === "aes-128-gmac" ? ["aes-128"] : algorithm === "aes-256-gmac" ? ["aes-256"] : ["aes-128", "aes-192", "aes-256"]);

  function randomNonce() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    nonce = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function run() {
    const revision = ++runRevision;
    error = ""; output = ""; busy = true;
    try {
      const ctx = keyCtx(source, keyId, material);
      if (!ctx) throw new Error(t("请提供密钥", "Provide a key"));
      if (algorithm.includes("gmac") && !nonce.trim()) randomNonce();
      const params = {
        action: "specialized", algorithm, op, text: input, inputEncoding, outputEncoding,
        nonce, nonceEncoding: "hex", tweak, tweakEncoding: "hex", radix: Number(radix), sector: Number(sector), ...ctx,
        requiredPurpose: toolId === "storage-crypto" ? "aes-xts" : toolId === "format-preserving" ? "aes-ff1" : toolId === "key-wrap" ? "aes-key-wrap" : "aes-mac",
      };
      if (params.keyMaterial) params.keyEncoding = keyEncoding;
      const result = await invoke("toolbox/crypto", params);
      if (revision !== runRevision) return;
      output = result.text || "";
    } catch (err) { if (revision === runRevision) error = localizeError(locale, err); }
    finally { if (revision === runRevision) busy = false; }
  }

  $effect(() => {
    if (!live) return;
    const dependencies = [algorithm, op, input, inputEncoding, outputEncoding, source, material, keyId, keyEncoding, tweak, radix, sector];
    void dependencies;
    runRevision += 1;
    output = "";
    error = "";
    busy = false;
    const ctx = keyCtx(source, keyId, material);
    if (!input || !ctx) {
      return;
    }
    const timer = setTimeout(run, 250);
    return () => clearTimeout(timer);
  });
</script>

<div class="page">
  <div class="options">
    {#if !fixedAlgorithm}<label class="field"><span class="dbx-label">{t("算法", "Algorithm")}</span><Select bind:value={algorithm} options={profiles[toolId] || profiles["key-wrap"]} /></label>{/if}
    {#if !macOnly}
      <div class="field"><span class="dbx-label">{t("操作", "Operation")}</span><div class="seg"><button class:active={op === "encrypt"} onclick={() => (op = "encrypt")}>{toolId === "key-wrap" ? t("包装", "Wrap") : t("加密", "Encrypt")}</button><button class:active={op === "decrypt"} onclick={() => (op = "decrypt")}>{toolId === "key-wrap" ? t("解包", "Unwrap") : t("解密", "Decrypt")}</button></div></div>
    {/if}
    {#if toolId !== "format-preserving"}<label class="field"><span class="dbx-label">{t("输入编码", "Input encoding")}</span><Select bind:value={inputEncoding} options={inputOptions} /></label>{/if}
    {#if toolId !== "format-preserving"}<label class="field"><span class="dbx-label">{t("输出编码", "Output encoding")}</span><Select bind:value={outputEncoding} options={binaryEncodings} /></label>{/if}
  </div>

  <KeySourceBar {locale} allowedAlgorithms={allowedKeyAlgorithms} requiredPurpose={toolId === "storage-crypto" ? "aes-xts" : toolId === "format-preserving" ? "aes-ff1" : toolId === "key-wrap" ? "aes-key-wrap" : "aes-mac"} materialLabel={keyLabel} encodingOptions={[{value:"auto",label:t("自动","Auto")},{value:"hex",label:"Hex"},{value:"base64",label:"Base64"},{value:"utf8",label:"UTF-8"}]} bind:encoding={keyEncoding} bind:source bind:material bind:keyId />

  {#if toolId === "storage-crypto"}
    <label class="field compact"><span class="dbx-label">{t("扇区编号", "Sector number")}</span><input class="dbx-input" type="number" min="0" bind:value={sector} /></label>
  {:else if toolId === "format-preserving"}
    <div class="options"><label class="field"><span class="dbx-label">Radix</span><Select bind:value={radix} options={[{value:10,label:t("10（仅数字）","10 (digits)")},{value:36,label:t("36（数字 + a-z）","36 (digits + a-z)")}]} /></label><label class="field grow"><span class="dbx-label">Tweak · Hex</span><input class="dbx-input mono" bind:value={tweak} /></label></div>
  {:else if algorithm.includes("gmac")}
    <div class="nonce"><label class="field grow"><span class="dbx-label">Nonce · 12 bytes · Hex</span><input class="dbx-input mono" bind:value={nonce} placeholder={t("留空自动生成", "Leave empty to generate")} /></label><button class="dbx-btn" onclick={randomNonce}>{t("随机", "Random")}</button></div>
  {:else if toolId === "key-wrap"}
    <p class="dbx-hint">{algorithm === "aes-kw" ? t("KW 输入必须是至少 16 字节且为 8 字节的倍数。", "KW input must be at least 16 bytes and a multiple of 8 bytes.") : t("KWP 支持任意非空长度的密钥材料。", "KWP supports key material of any non-empty length.")}</p>
  {/if}

  <IoSplit {locale} bind:input {output} error="" inputLabel={toolId === "format-preserving" ? t("格式化明文 / 密文", "Formatted plaintext / ciphertext") : macOnly ? t("消息", "Message") : t("输入", "Input")} outputLabel={macOnly ? t("认证码", "Authentication tag") : t("输出", "Output")} />
  {#if live}
    {#if busy}<span class="live-status" role="status">{t("正在自动计算…", "Calculating automatically…")}</span>{/if}
  {:else}
    <button class="dbx-btn dbx-btn--primary run" type="button" onclick={run} disabled={busy}>{busy ? t("处理中…", "Working…") : t("执行", "Run")}</button>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if algorithm.includes("gmac") && nonce}<div class="result"><span>Nonce</span><input class="dbx-input mono" readonly value={nonce} /><CopyButton {locale} text={nonce} /></div>{/if}
</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.field{display:flex;flex-direction:column;gap:6px;font-size:12px}.compact{max-width:220px}.grow{flex:1}.seg{display:flex;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.seg button{height:30px;padding:0 12px;border:0;background:var(--color-background);color:inherit}.seg button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.nonce{display:flex;gap:8px;align-items:flex-end}.run,.live-status{align-self:flex-end}.live-status{color:var(--color-muted-foreground);font-size:12px}.error{margin:0;color:var(--color-destructive)}.result{display:grid;grid-template-columns:auto minmax(0,1fr) 30px;gap:8px;align-items:center}.mono{font-family:var(--font-mono)}
</style>
