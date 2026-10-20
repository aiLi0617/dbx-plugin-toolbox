<script>
  import CopyButton from "./CopyButton.svelte";
  import UnlockVaultDialog from "./UnlockVaultDialog.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { errorMessage, localizeError, pick } from "./i18n.js";
  import { RSA_BIT_OPTIONS, RSA_PEM_FORMATS, generateRsaKeyPairPem } from "./tools/generate.js";

  let { locale = "zh-CN", fixedAlgorithm = "", onVaultChange = () => {} } = $props();
  let algorithm = $state("rsa");
  let bits = $state("2048");
  let pemFormat = $state("pkcs8");
  let name = $state("");
  let save = $state("no");
  let publicKey = $state("");
  let privateKey = $state("");
  let error = $state("");
  let busy = $state(false);
  let unlockOpen = $state(false);
  $effect(() => { if (fixedAlgorithm) algorithm = fixedAlgorithm; });

  const t = (zh, en) => pick(locale, zh, en);

  function isLockedError(err) {
    return /key vault is locked/i.test(errorMessage(err));
  }

  function onAlgorithmChange() {
    publicKey = "";
    privateKey = "";
    error = "";
  }

  async function generate() {
    if (busy) return;
    error = "";
    if (save === "yes" && !name.trim()) {
      error = t("写入密钥库需要填写名称", "Name is required to save");
      return;
    }
    if (save === "yes") {
      try {
        const status = await invoke("toolbox/keys/status");
        if (!status.unlocked) {
          unlockOpen = true;
          return;
        }
      } catch (err) {
        error = localizeError(locale, err);
        return;
      }
    }
    await runGenerate();
  }

  async function runGenerate() {
    busy = true;
    error = "";
    try {
      if (algorithm === "rsa") {
        // WebCrypto uses the OS crypto provider; pure-Rust rsa keygen is too slow for UI.
        const pair = await generateRsaKeyPairPem(bits, pemFormat);
        publicKey = pair.publicKey;
        privateKey = pair.privateKey;
        if (save === "yes") {
          await saveRsaToVault(pair.privateKey);
        }
        return;
      }
      const result = await invoke("toolbox/keys/generate-keypair", {
        algorithm,
        save: save === "yes",
        name,
      }, 60000);
      publicKey = result.publicKey || "";
      privateKey = result.privateKey || "";
      if (result.saved) onVaultChange();
    } catch (err) {
      if (save === "yes" && isLockedError(err)) {
        unlockOpen = true;
        return;
      }
      error = localizeError(locale, err);
    } finally {
      busy = false;
    }
  }

  async function saveRsaToVault(material) {
    await invoke("toolbox/keys/create", {
      name,
      algorithm: "rsa-pem",
      generate: false,
      material,
    });
    onVaultChange();
  }

  async function afterUnlock() {
    onVaultChange();
    // Keep an already-generated RSA pair; only persist it after unlock.
    if (algorithm === "rsa" && save === "yes" && privateKey) {
      busy = true;
      error = "";
      try {
        await saveRsaToVault(privateKey);
      } catch (err) {
        if (isLockedError(err)) {
          unlockOpen = true;
          return;
        }
        error = localizeError(locale, err);
      } finally {
        busy = false;
      }
      return;
    }
    await runGenerate();
  }
</script>

<div class="page">
  {#if error}<div class="banner">{error}</div>{/if}
  <div class="options options--algo">
    {#if !fixedAlgorithm}<label class="field">
      <span>{t("算法", "Algorithm")}</span>
      <Select
        bind:value={algorithm}
        options={[
          { value: "rsa", label: "RSA" },
          { value: "sm2", label: "SM2" },
        ]}
        onchange={onAlgorithmChange}
      />
    </label>{/if}
    {#if algorithm === "rsa"}
      <label class="field">
        <span>{t("位数", "Bits")}</span>
        <Select
          bind:value={bits}
          options={RSA_BIT_OPTIONS.map((value) => ({
            value,
            label: value === "8192"
              ? t("8192 位（较慢）", "8192-bit (slow)")
              : t(`${value} 位`, `${value}-bit`),
          }))}
        />
      </label>
      <label class="field">
        <span>{t("格式", "Format")}</span>
        <Select
          bind:value={pemFormat}
          options={RSA_PEM_FORMATS.map((item) => ({ value: item.value, label: pick(locale, item.zh, item.en) }))}
        />
      </label>
    {/if}
  </div>
  <div class="options options--actions">
    <label class="field">
      <span>{t("写入密钥库", "Save to vault")}</span>
      <Select
        bind:value={save}
        options={[
          { value: "no", label: t("否，仅显示一次", "No, show once") },
          { value: "yes", label: t("是", "Yes") },
        ]}
      />
    </label>
    {#if save === "yes"}
      <label class="field"><span>{t("名称", "Name")}</span><input class="dbx-input" bind:value={name} /></label>
    {/if}
    <button class="dbx-btn dbx-btn--primary generate" disabled={busy} onclick={generate} type="button">
      {busy ? t("生成中…", "Generating…") : t("生成", "Generate")}
    </button>
  </div>
  <div class="keys">
    <label class="block">
      <div class="caption-row">
        <span class="caption">{t("公钥", "Public key")}</span>
        <CopyButton {locale} text={publicKey} labelZh="复制公钥" labelEn="Copy public key" />
      </div>
      <textarea class="dbx-textarea area" value={publicKey} readonly aria-label={t("生成的公钥", "Generated public key")} placeholder={t("生成后显示", "Appears after generate")}></textarea>
    </label>
    <div class="block">
      <div class="caption-row">
        <span class="caption">{t("私钥", "Private key")}</span>
        {#if privateKey}
          <button class="dbx-btn dbx-btn--ghost clear-btn" onclick={() => (privateKey = "")} type="button">{t("清除", "Clear")}</button>
          <CopyButton {locale} text={privateKey} labelZh="复制私钥" labelEn="Copy private key" />
        {/if}
      </div>
      <textarea class="dbx-textarea area" value={privateKey} readonly aria-label={t("生成的私钥", "Generated private key")} placeholder={t("生成后显示", "Appears after generate")}></textarea>
    </div>
  </div>
</div>

<UnlockVaultDialog {locale} bind:open={unlockOpen} onUnlocked={afterUnlock} />

<style>
  .page {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .options--actions .generate {
    margin-left: auto;
  }
  .field :global(.dbx-custom-select),
  .field .dbx-input {
    width: auto;
    min-width: 140px;
  }
  .keys {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-gap, 12px);
    align-items: stretch;
  }
  .block {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
  }
  .clear-btn {
    color: var(--color-destructive);
  }
  .area {
    flex: 1;
    min-height: 8rem;
    resize: none;
    font-family: var(--font-mono);
  }
  @media (min-width: 1100px) {
    .keys {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
    .area {
      min-height: 0;
    }
  }
</style>
