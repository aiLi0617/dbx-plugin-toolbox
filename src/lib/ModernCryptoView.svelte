<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";
  import { KDF_BY_TOOL, MODERN_AEAD_BY_TOOL } from "./cryptoCapabilities.js";

  let { locale = "zh-CN", toolId = "modern-aead", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const kdf = $derived(toolId === "kdf" || Boolean(KDF_BY_TOOL[toolId]));
  const fixedAlgorithm = $derived(KDF_BY_TOOL[toolId] || MODERN_AEAD_BY_TOOL[toolId] || "");
  let algorithm = $state("xchacha20-poly1305");
  let op = $state("encrypt");
  let input = $state("");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);
  let source = $state("once");
  let material = $state("");
  let keyId = $state("");
  let keyEncoding = $state("auto");
  let nonce = $state("");
  let nonceEncoding = $state("hex");
  let aad = $state("");
  let inputEncoding = $state("utf8");
  let outputEncoding = $state("base64");
  let salt = $state("");
  let saltEncoding = $state("hex");
  let length = $state(32);
  let iterations = $state(2);
  let memoryKiB = $state(19456);
  let logN = $state(15);
  let info = $state("");
  let resultNonce = $state("");
  let saveName = $state("");
  let saveType = $state("aes-256");
  let configuredKdf = $state("");
  let deriveRevision = 0;

  const cipherAlgorithms = [
    { value: "xchacha20-poly1305", label: "XChaCha20-Poly1305" },
    { value: "chacha20-poly1305", label: "ChaCha20-Poly1305" },
    { value: "aes-256-gcm-siv", label: "AES-256-GCM-SIV" },
    { value: "aes-256-siv", label: "AES-256-SIV" },
    { value: "aes-256-ccm", label: "AES-256-CCM" },
  ];
  const kdfAlgorithms = [
    { value: "argon2id", label: "Argon2id" },
    { value: "scrypt", label: "scrypt" },
    { value: "pbkdf2-sha256", label: "PBKDF2-HMAC-SHA256" },
    { value: "hkdf-sha256", label: "HKDF-SHA256" },
  ];
  const encodings = [{ value: "utf8", label: "UTF-8" }, { value: "hex", label: "Hex" }, { value: "base64", label: "Base64" }];
  const binaryEncodings = encodings.slice(1);
  const targetTypes = [
    { value: "aes-128", label: "AES-128", bytes: 16 }, { value: "aes-192", label: "AES-192", bytes: 24 },
    { value: "aes-256", label: "AES-256", bytes: 32 }, { value: "sm4-128", label: "SM4-128", bytes: 16 },
    { value: "chacha20-256", label: "ChaCha20-256", bytes: 32 }, { value: "aes-siv-512", label: "AES-SIV-512", bytes: 64 },
    { value: "aes-xts-256", label: "AES-XTS-256", bytes: 32 }, { value: "aes-xts-512", label: "AES-XTS-512", bytes: 64 },
    { value: "hmac-sha256", label: "HMAC-SHA256", bytes: 32 }, { value: "hmac-sha384", label: "HMAC-SHA384", bytes: 48 },
    { value: "hmac-sha512", label: "HMAC-SHA512", bytes: 64 }, { value: "hmac-sm3", label: "HMAC-SM3", bytes: 32 },
  ];
  const compatibleTargets = $derived(targetTypes.filter((item) => item.bytes === Number(length)));
  const allowedKeyAlgorithms = $derived(algorithm.includes("chacha") ? ["chacha20-256"] : algorithm === "aes-256-siv" ? ["aes-siv-512"] : ["aes-256"]);

  $effect(() => {
    const requested = fixedAlgorithm || initialOptions.algorithm;
    const list = kdf ? kdfAlgorithms : cipherAlgorithms;
    algorithm = list.some((item) => item.value === requested) ? requested : list[0].value;
  });
  $effect(() => {
    if (!kdf || configuredKdf === algorithm) return;
    configuredKdf = algorithm;
    if (algorithm === "argon2id") iterations = 2;
    if (algorithm === "pbkdf2-sha256") iterations = 600000;
  });
  $effect(() => { if (kdf && compatibleTargets.length && !compatibleTargets.some((item) => item.value === saveType)) saveType = compatibleTargets[0].value; });

  function saltIsReady(value, encoding) {
    const trimmed = value.trim();
    if (algorithm === "hkdf-sha256") return true;
    if (encoding === "hex") return /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 16 && trimmed.length % 2 === 0;
    return /^[A-Za-z0-9+/]*={0,2}$/.test(trimmed) && trimmed.length >= 12;
  }

  $effect(() => {
    if (!kdf) return;
    const request = {
      action: "kdf", algorithm, text: input, salt, saltEncoding, length: Number(length),
      iterations: Number(iterations), memoryKiB: Number(memoryKiB), logN: Number(logN), info,
    };
    const validParameters = Number.isInteger(request.length) && request.length >= 16 && request.length <= 1024
      && (algorithm !== "argon2id" || (Number.isInteger(request.iterations) && request.iterations >= 1 && request.iterations <= 10 && request.memoryKiB >= 8192))
      && (algorithm !== "pbkdf2-sha256" || (Number.isInteger(request.iterations) && request.iterations >= 10000))
      && (algorithm !== "scrypt" || (Number.isInteger(request.logN) && request.logN >= 10 && request.logN <= 20));
    const revision = ++deriveRevision;
    output = "";
    error = "";
    if (!input || !saltIsReady(salt, saltEncoding) || !validParameters) {
      busy = false;
      return;
    }
    busy = true;
    const timer = setTimeout(async () => {
      try {
        const result = await invoke("toolbox/crypto", request);
        if (revision !== deriveRevision) return;
        output = result.text || "";
        error = "";
      } catch (err) {
        if (revision !== deriveRevision) return;
        output = "";
        error = localizeError(locale, err);
      } finally {
        if (revision === deriveRevision) busy = false;
      }
    }, 500);
    return () => clearTimeout(timer);
  });

  async function run() {
    error = ""; output = ""; resultNonce = ""; busy = true;
    try {
      if (!kdf) {
        const ctx = keyCtx(source, keyId, material);
        if (!ctx) throw new Error(t("请提供密钥", "Provide a key"));
        const params = {
          action: "modern-aead", algorithm, op, text: input, nonce, nonceEncoding, aad,
          aadEncoding: "utf8", inputEncoding, outputEncoding, requiredPurpose: algorithm.includes("chacha") ? "chacha-aead" : "aes-aead", ...ctx,
        };
        if (params.keyMaterial) params.keyEncoding = keyEncoding;
        const result = await invoke("toolbox/crypto", params);
        output = result.text || "";
        resultNonce = result.nonce || "";
      }
    } catch (err) { error = localizeError(locale, err); }
    finally { busy = false; }
  }

  async function saveDerived() {
    error = "";
    if (!output || !saveName.trim()) { error = t("请先派生密钥并填写名称", "Derive a key and enter a name first"); return; }
    if (!compatibleTargets.some((item) => item.value === saveType)) { error = t("目标密钥类型与输出长度不匹配", "Target key type does not match the output length"); return; }
    try {
      await invoke("toolbox/keys/create", { name: saveName.trim(), algorithm: saveType, generate: false, material: output });
      window.dispatchEvent(new Event("toolbox-vault-change"));
      saveName = "";
    } catch (err) { error = localizeError(locale, err); }
  }
</script>

<div class="page">
  <div class="options">
    {#if !fixedAlgorithm}<label class="field"><span class="dbx-label">{t("算法", "Algorithm")}</span><Select bind:value={algorithm} options={kdf ? kdfAlgorithms : cipherAlgorithms} /></label>{/if}
    {#if !kdf}
      <div class="field"><span class="dbx-label">{t("操作", "Operation")}</span><div class="seg"><button class:active={op === "encrypt"} onclick={() => { op = "encrypt"; inputEncoding = "utf8"; outputEncoding = "base64"; }}>{t("加密", "Encrypt")}</button><button class:active={op === "decrypt"} onclick={() => { op = "decrypt"; inputEncoding = "base64"; outputEncoding = "utf8"; }}>{t("解密", "Decrypt")}</button></div></div>
      <label class="field"><span class="dbx-label">{t("输入编码", "Input encoding")}</span><Select bind:value={inputEncoding} options={op === "encrypt" ? encodings : binaryEncodings} /></label>
      <label class="field"><span class="dbx-label">{t("输出编码", "Output encoding")}</span><Select bind:value={outputEncoding} options={op === "encrypt" ? binaryEncodings : encodings} /></label>
    {/if}
  </div>

  {#if kdf}
    <div class="grid">
      <label><span>{t("盐值", "Salt")}</span><input class="dbx-input mono" bind:value={salt} placeholder={t("至少 8 字节", "At least 8 bytes")} /></label>
      <label><span>{t("盐值编码", "Salt encoding")}</span><Select bind:value={saltEncoding} options={binaryEncodings} /></label>
      <label><span>{t("输出字节数", "Output bytes")}</span><input class="dbx-input" type="number" min="16" max="1024" bind:value={length} /></label>
      {#if algorithm === "pbkdf2-sha256"}<label><span>{t("迭代次数", "Iterations")}</span><input class="dbx-input" type="number" min="10000" bind:value={iterations} /></label>{/if}
      {#if algorithm === "argon2id"}<label><span>{t("内存（KiB）", "Memory (KiB)")}</span><input class="dbx-input" type="number" min="8192" bind:value={memoryKiB} /></label><label><span>{t("迭代次数", "Iterations")}</span><input class="dbx-input" type="number" min="1" bind:value={iterations} /></label>{/if}
      {#if algorithm === "scrypt"}<label><span>log₂(N)</span><input class="dbx-input" type="number" min="10" max="20" bind:value={logN} /></label>{/if}
      {#if algorithm === "hkdf-sha256"}<label><span>Info</span><input class="dbx-input mono" bind:value={info} /></label>{/if}
    </div>
  {:else}
    <KeySourceBar {locale} allowedAlgorithms={allowedKeyAlgorithms} requiredPurpose={algorithm.includes("chacha") ? "chacha-aead" : "aes-aead"} materialLabel={algorithm === "aes-256-siv" ? t("64 字节密钥", "64-byte key") : t("32 字节密钥", "32-byte key")} encodingOptions={[{value:"auto",label:t("自动","Auto")},{value:"hex",label:"Hex"},{value:"base64",label:"Base64"},{value:"utf8",label:"UTF-8"}]} bind:encoding={keyEncoding} bind:source bind:material bind:keyId />
    <div class="grid">
      <label><span>Nonce · {algorithm === "xchacha20-poly1305" ? 24 : algorithm === "aes-256-ccm" ? 13 : algorithm === "aes-256-siv" ? 16 : 12} bytes</span><input class="dbx-input mono" bind:value={nonce} placeholder={op === "encrypt" ? t("留空随机生成", "Leave empty for random") : t("必填", "Required")} /></label>
      <label><span>{t("Nonce 编码", "Nonce encoding")}</span><Select bind:value={nonceEncoding} options={binaryEncodings} /></label>
      <label><span>AAD · UTF-8</span><input class="dbx-input mono" bind:value={aad} /></label>
    </div>
  {/if}

  <IoSplit {locale} bind:input {output} error="" inputLabel={kdf ? t("密码 / 输入密钥材料", "Password / input key material") : t("输入", "Input")} outputLabel={kdf ? t("派生密钥（Hex）", "Derived key (Hex)") : t("输出", "Output")} />
  {#if kdf}
    {#if busy}<span class="live-status" role="status">{t("正在自动计算…", "Calculating automatically…")}</span>{/if}
  {:else}
    <button class="dbx-btn dbx-btn--primary run" type="button" onclick={run} disabled={busy}>{busy ? t("处理中…", "Working…") : t("执行", "Run")}</button>
  {/if}
  {#if kdf && output}
    <div class="options save-derived"><label class="field"><span class="dbx-label">{t("保存为", "Save as")}</span><Select bind:value={saveType} options={compatibleTargets} /></label><label class="field"><span class="dbx-label">{t("密钥名称", "Key name")}</span><input class="dbx-input" bind:value={saveName} /></label><button class="dbx-btn" disabled={!compatibleTargets.length} onclick={saveDerived}>{t("保存到密钥库", "Save to vault")}</button></div>
    {#if !compatibleTargets.length}<p class="warning">{t("当前输出长度没有匹配的密钥类型，请调整输出字节数。", "No key type matches this output length; change the output byte count.")}</p>{/if}
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if resultNonce}<div class="nonce"><span>Nonce</span><input class="dbx-input mono" readonly value={resultNonce} /><CopyButton {locale} text={resultNonce} /></div>{/if}
</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.field,.grid label{display:flex;flex-direction:column;gap:6px;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.seg{display:flex;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.seg button{height:30px;padding:0 12px;border:0;background:var(--color-background);color:inherit}.seg button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.warning{margin:0;padding:8px 10px;border-left:3px solid var(--color-warning);background:var(--color-warning-bg);font-size:12px}.run{align-self:flex-end}.live-status{align-self:flex-end;color:var(--color-muted-foreground);font-size:12px}.error{margin:0;color:var(--color-destructive)}.nonce{display:grid;grid-template-columns:auto minmax(0,1fr) 30px;gap:8px;align-items:center}.mono{font-family:var(--font-mono)}
</style>
