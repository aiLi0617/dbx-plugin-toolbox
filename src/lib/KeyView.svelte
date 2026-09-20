<script>
  import CopyButton from "./CopyButton.svelte";
  import UnlockVaultDialog from "./UnlockVaultDialog.svelte";
  import Select from "./Select.svelte";
  import { invoke } from "./host.js";
  import { errorMessage, localizeError, pick } from "./i18n.js";
  import { SYMMETRIC_KEY_ALGORITHMS, generateSymmetricKeyMaterial } from "./tools/generate.js";

  let { locale = "zh-CN", onVaultChange = () => {} } = $props();
  let algorithm = $state("aes-256");
  let name = $state("");
  let save = $state("no");
  let material = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  let unlockOpen = $state(false);

  const t = (zh, en) => pick(locale, zh, en);
  const selected = $derived(SYMMETRIC_KEY_ALGORITHMS.find((item) => item.id === algorithm) || SYMMETRIC_KEY_ALGORITHMS[0]);

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
      const generated = generateSymmetricKeyMaterial(algorithm);
      material = generated.material;
      if (save === "yes") {
        await saveToVault(generated.material);
        notice = t("密钥已写入密钥库；请确认后清除界面原文", "Key saved to vault; clear it from the UI when done");
      } else {
        notice = t("请立即保存；锁定工作台前请清空", "Save the key now; clear it before leaving");
      }
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

  async function saveToVault(keyMaterial) {
    await invoke("toolbox/keys/create", {
      name,
      algorithm,
      generate: false,
      material: keyMaterial,
    });
    onVaultChange();
  }

  async function afterUnlock() {
    onVaultChange();
    if (save === "yes" && material) {
      busy = true;
      error = "";
      try {
        await saveToVault(material);
        notice = t("密钥已写入密钥库；请确认后清除界面原文", "Key saved to vault; clear it from the UI when done");
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
  <p class="dbx-hint">{t("AES / SM4 / HMAC 是单钥，不是密钥对。写入密钥库后，对称加密、HMAC、JWT、XOR 可以直接选用；未解锁时会提示输入主密码。", "AES, SM4, and HMAC are single keys, not pairs. Saved keys can be used in Symmetric cipher, HMAC, JWT, and XOR. If the vault is locked, you will be asked for the master password.")}</p>
  <div class="options">
    <label class="field">
      <span>{t("算法", "Algorithm")}</span>
      <Select
        bind:value={algorithm}
        options={SYMMETRIC_KEY_ALGORITHMS.map((item) => ({
          value: item.id,
          label: item.label,
          group: pick(locale, item.groupZh, item.groupEn),
        }))}
      />
    </label>
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
  <label class="block">
    <div class="caption-row">
      <span class="caption">{t(`密钥 · ${selected.bytes} 字节 hex`, `Key · ${selected.bytes}-byte hex`)}</span>
      {#if material}
        <button class="dbx-btn dbx-btn--ghost clear-btn" onclick={() => (material = "")} type="button">{t("清除", "Clear")}</button>
      {/if}
      <CopyButton {locale} text={material} labelZh="复制密钥" labelEn="Copy key" />
    </div>
    <textarea class="dbx-textarea area" value={material} readonly aria-label={t("生成的对称密钥", "Generated symmetric key")} placeholder={t("生成后显示", "Appears after generate")}></textarea>
  </label>
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
  .block {
    flex: 1;
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
</style>
