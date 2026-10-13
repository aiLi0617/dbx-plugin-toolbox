<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";

  let { locale = "zh-CN", toolId = "modern-aead", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const kdf = $derived(toolId === "kdf");
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
  let iterations = $state(600000);
  let memoryKiB = $state(19456);
  let logN = $state(15);
  let info = $state("");
  let resultNonce = $state("");

  const cipherAlgorithms = [
    { value: "xchacha20-poly1305", label: "XChaCha20-Poly1305" },
    { value: "chacha20-poly1305", label: "ChaCha20-Poly1305" },
    { value: "aes-256-gcm-siv", label: "AES-256-GCM-SIV" },
    { value: "aes-256-siv", label: "AES-256-SIV" },
    { value: "aes-256-ccm", label: "AES-256-CCM" },
    { value: "aes-256-ctr", label: "AES-256-CTR · Legacy" },
  ];
  const kdfAlgorithms = [
    { value: "argon2id", label: "Argon2id" },
    { value: "scrypt", label: "scrypt" },
    { value: "pbkdf2-sha256", label: "PBKDF2-HMAC-SHA256" },
    { value: "hkdf-sha256", label: "HKDF-SHA256" },
  ];
  const encodings = [{ value: "utf8", label: "UTF-8" }, { value: "hex", label: "Hex" }, { value: "base64", label: "Base64" }];
  const binaryEncodings = encodings.slice(1);

  $effect(() => {
    const requested = initialOptions.algorithm;
    const list = kdf ? kdfAlgorithms : cipherAlgorithms;
    algorithm = list.some((item) => item.value === requested) ? requested : list[0].value;
  });

  async function run() {
    error = ""; output = ""; resultNonce = ""; busy = true;
    try {
      if (kdf) {
        const result = await invoke("toolbox/crypto", {
          action: "kdf", algorithm, text: input, salt, saltEncoding, length: Number(length),
          iterations: Number(iterations), memoryKiB: Number(memoryKiB), logN: Number(logN), info,
        });
        output = result.text || "";
      } else {
        const ctx = keyCtx(source, keyId, material);
        if (!ctx) throw new Error(t("请提供密钥", "Provide a key"));
        const params = {
          action: "modern-aead", algorithm, op, text: input, nonce, nonceEncoding, aad,
          aadEncoding: "utf8", inputEncoding, outputEncoding, ...ctx,
        };
        if (params.keyMaterial) params.keyEncoding = keyEncoding;
        const result = await invoke("toolbox/crypto", params);
        output = result.text || "";
        resultNonce = result.nonce || "";
      }
    } catch (err) { error = localizeError(locale, err); }
    finally { busy = false; }
  }
</script>

<div class="page">
  <div class="options">
    <label class="field"><span class="dbx-label">{t("算法", "Algorithm")}</span><Select bind:value={algorithm} options={kdf ? kdfAlgorithms : cipherAlgorithms} /></label>
    {#if !kdf}
      <div class="field"><span class="dbx-label">{t("操作", "Operation")}</span><div class="seg"><button class:active={op === "encrypt"} onclick={() => { op = "encrypt"; inputEncoding = "utf8"; outputEncoding = "base64"; }}>Encrypt</button><button class:active={op === "decrypt"} onclick={() => { op = "decrypt"; inputEncoding = "base64"; outputEncoding = "utf8"; }}>Decrypt</button></div></div>
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
    <KeySourceBar {locale} picker="xor" materialLabel={algorithm === "aes-256-siv" ? t("64 字节密钥", "64-byte key") : t("32 字节密钥", "32-byte key")} encodingOptions={[{value:"auto",label:t("自动","Auto")},{value:"hex",label:"Hex"},{value:"base64",label:"Base64"},{value:"utf8",label:"UTF-8"}]} bind:encoding={keyEncoding} bind:source bind:material bind:keyId />
    <div class="grid">
      <label><span>Nonce · {algorithm === "xchacha20-poly1305" ? 24 : algorithm === "aes-256-ccm" ? 13 : algorithm === "aes-256-ctr" || algorithm === "aes-256-siv" ? 16 : 12} bytes</span><input class="dbx-input mono" bind:value={nonce} placeholder={op === "encrypt" ? t("留空随机生成", "Leave empty for random") : t("必填", "Required")} /></label>
      <label><span>{t("Nonce 编码", "Nonce encoding")}</span><Select bind:value={nonceEncoding} options={binaryEncodings} /></label>
      {#if algorithm !== "aes-256-ctr"}<label><span>AAD · UTF-8</span><input class="dbx-input mono" bind:value={aad} /></label>{/if}
    </div>
    {#if algorithm === "aes-256-ctr"}<p class="warning">{t("CTR 不验证密文完整性，仅用于协议兼容；新系统请使用认证加密。", "CTR does not authenticate ciphertext. Use only for interoperability; prefer an AEAD for new systems.")}</p>{/if}
  {/if}

  <IoSplit {locale} bind:input {output} error="" inputLabel={kdf ? t("密码 / 输入密钥材料", "Password / input key material") : t("输入", "Input")} outputLabel={kdf ? t("派生密钥（Hex）", "Derived key (Hex)") : t("输出", "Output")} />
  <button class="dbx-btn dbx-btn--primary run" type="button" onclick={run} disabled={busy}>{busy ? t("处理中…", "Working…") : t("执行", "Run")}</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if resultNonce}<div class="nonce"><span>Nonce</span><input class="dbx-input mono" readonly value={resultNonce} /><CopyButton {locale} text={resultNonce} /></div>{/if}
</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.field,.grid label{display:flex;flex-direction:column;gap:6px;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.seg{display:flex;border:1px solid var(--color-border);border-radius:8px;overflow:hidden}.seg button{height:30px;padding:0 12px;border:0;background:var(--color-background);color:inherit}.seg button.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.warning{margin:0;padding:8px 10px;border-left:3px solid var(--color-warning);background:var(--color-warning-bg);font-size:12px}.run{align-self:flex-end}.error{margin:0;color:var(--color-destructive)}.nonce{display:grid;grid-template-columns:auto minmax(0,1fr) 30px;gap:8px;align-items:center}.mono{font-family:var(--font-mono)}
</style>
