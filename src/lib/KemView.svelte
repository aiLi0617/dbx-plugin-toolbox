<script>
  import CopyButton from "./CopyButton.svelte";
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import KeySourceBar from "./KeySourceBar.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";

  let { locale = "zh-CN", toolId = "hpke" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let algorithm = $state("hpke-x25519-chacha20");
  let op = $state("generate");
  let input = $state("");
  let output = $state("");
  let publicKey = $state("");
  let privateKey = $state("");
  let encapsulatedKey = $state("");
  let sharedSecret = $state("");
  let info = $state("");
  let aad = $state("");
  let outputEncoding = $state("utf8");
  let error = $state("");
  let busy = $state(false);
  let source = $state("once");
  let keyId = $state("");
  let saveName = $state("");
  const hpke = $derived(toolId === "hpke");
  const operations = $derived(hpke ? [
    { value: "generate", label: t("生成密钥对", "Generate keypair") },
    { value: "encrypt", label: t("加密", "Encrypt") },
    { value: "decrypt", label: t("解密", "Decrypt") },
  ] : [
    { value: "generate", label: t("生成密钥对", "Generate keypair") },
    { value: "encapsulate", label: t("封装共享密钥", "Encapsulate secret") },
    { value: "decapsulate", label: t("解封共享密钥", "Decapsulate secret") },
  ]);

  $effect(() => {
    algorithm = toolId === "ml-kem" ? "ml-kem-768" : "hpke-x25519-chacha20";
    op = "generate"; output = ""; error = ""; sharedSecret = ""; encapsulatedKey = "";
  });

  async function run() {
    error = ""; output = ""; sharedSecret = ""; busy = true;
    try {
      const result = await invoke("toolbox/crypto", {
        action: "kem", algorithm, op, text: input, inputEncoding: "utf8", outputEncoding,
        publicKey, privateKey, encapsulatedKey, info, aad,
        keyId: source === "vault" ? keyId : undefined,
      });
      if (result.publicKey) publicKey = result.publicKey;
      if (result.privateKey) privateKey = result.privateKey;
      if (result.encapsulatedKey) encapsulatedKey = result.encapsulatedKey;
      if (result.sharedSecret) sharedSecret = result.sharedSecret;
      output = result.text || "";
    } catch (err) { error = localizeError(locale, err); }
    finally { busy = false; }
  }

  async function savePair() {
    error = "";
    if (!saveName.trim() || !privateKey || !publicKey) { error = t("请先生成密钥对并填写名称", "Generate a keypair and enter a name first"); return; }
    try {
      await invoke("toolbox/keys/create", { name: saveName.trim(), algorithm: hpke ? "hpke-x25519" : algorithm, generate: false, material: privateKey, publicMaterial: publicKey });
      saveName = "";
      window.dispatchEvent(new Event("toolbox-vault-change"));
    } catch (err) { error = localizeError(locale, err); }
  }
</script>

<div class="page">
  <div class="options">
    {#if !hpke}<label class="field"><span class="dbx-label">{t("参数集", "Parameter set")}</span><Select bind:value={algorithm} options={[{value:"ml-kem-768",label:"ML-KEM-768"},{value:"ml-kem-1024",label:"ML-KEM-1024"}]} /></label>{/if}
    <label class="field"><span class="dbx-label">{t("操作", "Operation")}</span><Select bind:value={op} options={operations} /></label>
    {#if hpke && op === "decrypt"}<label class="field"><span class="dbx-label">{t("明文输出", "Plaintext output")}</span><Select bind:value={outputEncoding} options={[{value:"utf8",label:"UTF-8"},{value:"hex",label:"Hex"},{value:"base64",label:"Base64"}]} /></label>{/if}
  </div>

  {#if op !== "generate"}<KeySourceBar {locale} picker={hpke ? "hpke-x25519" : algorithm} requiredPurpose={hpke ? "hpke" : "ml-kem"} allowedAlgorithms={[hpke ? "hpke-x25519" : algorithm]} multiline={true} hideMaterial={true} bind:source bind:keyId />{/if}

  {#if source === "once" || op === "generate"}<div class="keys">
    {#if op === "generate" || op === "encrypt" || op === "encapsulate"}
      <label><span>{t("接收方公钥（Base64）", "Recipient public key (Base64)")}</span><textarea class="dbx-textarea mono key" bind:value={publicKey}></textarea><CopyButton {locale} text={publicKey} /></label>
    {/if}
    {#if op === "generate" || op === "decrypt" || op === "decapsulate"}
      <label><span>{t("接收方私钥（Base64）", "Recipient private key (Base64)")}</span><textarea class="dbx-textarea mono key" bind:value={privateKey}></textarea><CopyButton {locale} text={privateKey} /></label>
    {/if}
  </div>{/if}

  {#if op === "decrypt" || op === "decapsulate"}
    <label class="block"><span>{t("封装密钥（Base64）", "Encapsulated key (Base64)")}</span><textarea class="dbx-textarea mono short" bind:value={encapsulatedKey}></textarea></label>
  {/if}
  {#if hpke && op !== "generate"}
    <div class="options"><label class="field grow"><span class="dbx-label">Info · UTF-8</span><input class="dbx-input mono" bind:value={info} /></label><label class="field grow"><span class="dbx-label">AAD · UTF-8</span><input class="dbx-input mono" bind:value={aad} /></label></div>
  {/if}

  {#if hpke && op !== "generate"}
    <IoSplit {locale} bind:input {output} error="" inputLabel={op === "encrypt" ? t("明文", "Plaintext") : t("密文（Base64）", "Ciphertext (Base64)")} outputLabel={op === "encrypt" ? t("密文（Base64）", "Ciphertext (Base64)") : t("明文", "Plaintext")} />
  {:else if !hpke && op !== "generate"}
    <div class="result"><span>{t("共享密钥（Base64）", "Shared secret (Base64)")}</span><textarea class="dbx-textarea mono short" readonly value={sharedSecret}></textarea><CopyButton {locale} text={sharedSecret} /></div>
  {/if}

  <button class="dbx-btn dbx-btn--primary run" type="button" onclick={run} disabled={busy}>{busy ? t("处理中…", "Working…") : op === "generate" ? t("生成", "Generate") : t("执行", "Run")}</button>
  {#if op === "generate" && privateKey}<div class="options"><label class="field grow"><span class="dbx-label">{t("密钥名称", "Key name")}</span><input class="dbx-input" bind:value={saveName} /></label><button class="dbx-btn" onclick={savePair}>{t("保存到密钥库", "Save to vault")}</button></div>{/if}
  {#if error}<p class="error">{error}</p>{/if}
  {#if (op === "encrypt" || op === "encapsulate") && encapsulatedKey}<div class="result"><span>{t("封装密钥（Base64）", "Encapsulated key (Base64)")}</span><textarea class="dbx-textarea mono short" readonly value={encapsulatedKey}></textarea><CopyButton {locale} text={encapsulatedKey} /></div>{/if}
  <p class="warning">{hpke ? t("HPKE 使用 X25519 + HKDF-SHA256 + ChaCha20-Poly1305；Info 和 AAD 解密时必须完全一致。", "HPKE uses X25519 + HKDF-SHA256 + ChaCha20-Poly1305; Info and AAD must match exactly when decrypting.") : t("ML-KEM 只建立 32 字节共享密钥，不直接加密正文；请将共享密钥交给 AEAD 或 KDF 使用。", "ML-KEM establishes a 32-byte shared secret; it does not encrypt payloads directly. Feed the secret into an AEAD or KDF.")}</p>
</div>

<style>
  .page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end}.field,.block{display:flex;flex-direction:column;gap:6px;font-size:12px}.grow{flex:1}.keys{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.keys label{display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:6px;align-items:start;font-size:12px}.keys label span{grid-column:1/-1}.key{min-height:90px}.short{min-height:64px}.run{align-self:flex-end}.error{margin:0;color:var(--color-destructive)}.result{display:grid;grid-template-columns:minmax(130px,auto) minmax(0,1fr) 30px;gap:8px;align-items:center}.warning{margin:0;padding:8px 10px;border-left:3px solid var(--color-warning);background:var(--color-warning-bg);font-size:12px}.mono{font-family:var(--font-mono)}
</style>
