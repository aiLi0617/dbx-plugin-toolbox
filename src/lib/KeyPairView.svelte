<script>
  import CopyButton from "./CopyButton.svelte";
  import UnlockVaultDialog from "./UnlockVaultDialog.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { errorMessage, localizeError, pick } from "./i18n.js";
  import { RSA_BIT_OPTIONS, RSA_PEM_FORMATS, rsaGenerateTimeoutMs } from "./tools/generate.js";

  let { locale = "zh-CN", onVaultChange = () => {} } = $props();
  let algorithm = $state("rsa");
  let bits = $state("2048");
  let pemFormat = $state("pkcs8");
  let name = $state("");
  let save = $state("no");
  let publicKey = $state("");
  let privateKey = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  let unlockOpen = $state(false);

  const t = (zh, en) => pick(locale, zh, en);

  function isLockedError(err) {
    return /key vault is locked/i.test(errorMessage(err));
  }

  async function generate() {
    if (busy) return;
    error = "";
    notice = "";
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
      const result = await invoke("toolbox/keys/generate-keypair", {
        algorithm,
        bits: algorithm === "rsa" ? Number(bits) : undefined,
        format: algorithm === "rsa" ? pemFormat : undefined,
        save: save === "yes",
        name,
      }, algorithm === "rsa" ? rsaGenerateTimeoutMs(bits) : 60000);
      publicKey = result.publicKey || "";
      privateKey = result.privateKey || "";
      notice = result.saved
        ? t("私钥已写入密钥库，界面不保留私钥原文", "Private key saved to vault; not kept in the UI")
        : t("请立即保存私钥；锁定工作台前请清空", "Save the private key now; clear it before leaving");
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

  async function afterUnlock() {
    onVaultChange();
    await runGenerate();
  }
</script>

<div class="page">
  {#if error}<div class="banner">{error}</div>{/if}
  <p class="dbx-hint">{t("RSA 可选 1024 / 2048 / 3072 / 4096 位，PEM 为 PKCS#8 或 PKCS#1。写入密钥库后可供「非对称加密」选用；未解锁时会提示输入主密码。", "RSA supports 1024/2048/3072/4096-bit PKCS#8 or PKCS#1 PEM. Saved keys can be used in Asymmetric cipher. If the vault is locked, you will be asked for the master password.")}</p>
  <div class="options">
    <label class="field">
      <span>{t("算法", "Algorithm")}</span>
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
        <span>{t("位数", "Bits")}</span>
        <Select
          bind:value={bits}
          options={RSA_BIT_OPTIONS.map((value) => ({ value, label: t(`${value} 位`, `${value}-bit`) }))}
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
    <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={generate} type="button">
      {busy ? t("生成中…", "Generating…") : t("生成", "Generate")}
    </button>
  </div>
  {#if notice}<p class="dbx-hint">{notice}</p>{/if}
  <div class="keys">
    <label class="block">
      <div class="caption-row">
        <span class="caption">{t("公钥", "Public key")}</span>
        <CopyButton {locale} text={publicKey} labelZh="复制公钥" labelEn="Copy public key" />
      </div>
      <textarea class="dbx-textarea area" value={publicKey} readonly aria-label={t("生成的公钥", "Generated public key")} placeholder={t("生成后显示", "Appears after generate")}></textarea>
    </label>
    <label class="block">
      <div class="caption-row">
        <span class="caption">{t("私钥", "Private key")}</span>
        {#if privateKey}
          <button class="dbx-btn dbx-btn--ghost clear-btn" onclick={() => (privateKey = "")} type="button">{t("清除", "Clear")}</button>
        {/if}
        <CopyButton {locale} text={privateKey} labelZh="复制私钥" labelEn="Copy private key" />
      </div>
      <textarea class="dbx-textarea area" value={privateKey} readonly aria-label={t("生成的私钥", "Generated private key")} placeholder={t("生成后显示", "Appears after generate")}></textarea>
    </label>
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
  .dbx-hint {
    margin: 0;
    flex-shrink: 0;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
  }
  .field :global(.dbx-select),
  .field .dbx-input {
    width: auto;
    min-width: 140px;
  }
  .keys {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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
    min-height: 0;
    resize: none;
    font-family: var(--font-mono);
  }

  @media (max-width: 720px) {
    .keys {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
