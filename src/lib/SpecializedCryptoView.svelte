<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";

  let { locale = "zh-CN", toolId = "key-wrap" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const profiles = {
    "key-wrap": [{ value: "aes-kw", label: "AES-KW" }, { value: "aes-kwp", label: "AES-KWP" }],
    "storage-crypto": [{ value: "aes-xts", label: "AES-XTS" }],
    "format-preserving": [{ value: "aes-ff1", label: "AES-FF1" }],
    "aes-mac": [{ value: "aes-cmac", label: "AES-CMAC" }, { value: "aes-128-gmac", label: "AES-128-GMAC" }, { value: "aes-256-gmac", label: "AES-256-GMAC" }],
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

  $effect(() => {
    algorithm = profiles[toolId]?.[0]?.value || "aes-kw";
    inputEncoding = toolId === "aes-mac" ? "utf8" : "hex";
    output = "";
    error = "";
  });
  const macOnly = $derived(toolId === "aes-mac");
  const inputOptions = $derived(toolId === "format-preserving" ? [{ value: "utf8", label: t("数字 / 字母", "Digits / letters") }] : toolId === "aes-mac" ? encodings : binaryEncodings);
  const keyLabel = $derived(toolId === "storage-crypto" ? t("32 或 64 字节双密钥", "32 or 64-byte double key") : t("AES 密钥", "AES key"));

  function randomNonce() {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    nonce = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function run() {
    error = ""; output = ""; busy = true;
    try {
      const ctx = keyCtx(source, keyId, material);
      if (!ctx) throw new Error(t("请提供密钥", "Provide a key"));
      if (algorithm.includes("gmac") && !nonce.trim()) randomNonce();
      const params = {
        action: "specialized", algorithm, op, text: input, inputEncoding, outputEncoding,
        nonce, nonceEncoding: "hex", tweak, tweakEncoding: "hex", radix: Number(radix), sector: Number(sector), ...ctx,
      };
      if (params.keyMaterial) params.keyEncoding = keyEncoding;
      const result = await invoke("toolbox/crypto", params);
      output = result.text || "";
    } catch (err) { error = localizeError(locale, err); }
    finally { busy = false; }
  }
</script>

<div class="page">
  <div class="options">
    <label class="field"><span class="dbx-label">{t("算法", "Algorithm")}</span><Select bind:value={algorithm} options={profiles[toolId] || profiles["key-wrap"]} /></label>
    {#if !macOnly}
      <div class="field"><span class="dbx-label">{t("操作", "Operation")}</span><div class="seg"><button class:active={op === "encrypt"} onclick={() => (op = "encrypt")}>{toolId === "key-wrap" ? t("包装", "Wrap") : t("加密", "Encrypt")}</button><button class:active={op === "decrypt"} onclick={() => (op = "decrypt")}>{toolId === "key-wrap" ? t("解包", "Unwrap") : t("解密", "Decrypt")}</button></div></div>
    {/if}
    {#if toolId !== "format-preserving"}<label class="field"><span class="dbx-label">{t("输入编码", "Input encoding")}</span><Select bind:value={inputEncoding} options={inputOptions} /></label>{/if}
    {#if toolId !== "format-preserving"}<label class="field"><span class="dbx-label">{t("输出编码", "Output encoding")}</span><Select bind:value={outputEncoding} options={binaryEncodings} /></label>{/if}
  </div>

  <KeySourceBar {locale} picker="xor" materialLabel={keyLabel} encodingOptions={[{value:"auto",label:t("自动","Auto")},{value:"hex",label:"Hex"},{value:"base64",label:"Base64"},{value:"utf8",label:"UTF-8"}]} bind:encoding={keyEncoding} bind:source bind:material bind:keyId />

  {#if toolId === "storage-crypto"}
    <label class="field compact"><span class="dbx-label">{t("扇区编号", "Sector number")}</span><input class="dbx-input" type="number" min="0" bind:value={sector} /></label>
    <p class="warning">{t("XTS 仅用于磁盘或固定扇区数据，不提供完整性认证。", "XTS is only for disk or sector data and does not provide authentication.")}</p>
  {:else if toolId === "format-preserving"}
    <div class="options"><label class="field"><span class="dbx-label">Radix</span><Select bind:value={radix} options={[{value:10,label:t("10（仅数字）","10 (digits)")},{value:36,label:t("36（数字 + a-z）","36 (digits + a-z)")}]} /></label><label class="field grow"><span class="dbx-label">Tweak · Hex</span><input class="dbx-input mono" bind:value={tweak} /></label></div>
    <p class="warning">{t("FF1 保持字符集和长度，但不提供完整性认证；相同密钥与 tweak 会产生确定性结果。", "FF1 preserves alphabet and length but does not authenticate; the same key and tweak produce deterministic output.")}</p>
  {:else if algorithm.includes("gmac")}
    <div class="nonce"><label class="field grow"><span class="dbx-label">Nonce · 12 bytes · Hex</span><input class="dbx-input mono" bind:value={nonce} placeholder={t("留空自动生成", "Leave empty to generate")} /></label><button class="dbx-btn" onclick={randomNonce}>{t("随机", "Random")}</button></div>
  {:else if toolId === "key-wrap"}
    <p class="dbx-hint">{algorithm === "aes-kw" ? t("KW 输入必须是至少 16 字节且为 8 字节的倍数。", "KW input must be at least 16 bytes and a multiple of 8 bytes.") : t("KWP 支持任意非空长度的密钥材料。", "KWP supports key material of any non-empty length.")}</p>
  {/if}

  <IoSplit {locale} bind:input {output} error="" inputLabel={toolId === "format-preserving" ? t("格式化明文 / 密文", "Formatted plaintext / ciphertext") : macOnly ? t("消息", "Message") : t("输入", "Input")} outputLabel={macOnly ? t("认证码", "Authentication tag") : t("输出", "Output")} />
  <button class="dbx-btn dbx-btn--primary run" type="button" onclick={run} disabled={busy}>{busy ? t("处理中…", "Working…") : t("执行", "Run")}</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if algorithm.includes("gmac") && nonce}<div class="result"><span>Nonce</span><input class="dbx-input mono" readonly value={nonce} /><CopyButton {locale} text={nonce} /></div>{/if}
</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.field{display:flex;flex-direction:column;gap:6px;font-size:12px}.compact{max-width:220px}.grow{flex:1}.seg{display:flex;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.seg button{height:30px;padding:0 12px;border:0;background:var(--color-background);color:inherit}.seg button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.warning{margin:0;padding:8px 10px;border-left:3px solid var(--color-warning);background:var(--color-warning-bg);font-size:12px}.nonce{display:flex;gap:8px;align-items:flex-end}.run{align-self:flex-end}.error{margin:0;color:var(--color-destructive)}.result{display:grid;grid-template-columns:auto minmax(0,1fr) 30px;gap:8px;align-items:center}.mono{font-family:var(--font-mono)}
</style>
