<script>
  import Select from "./Select.svelte";
  import UnlockVaultDialog from "./UnlockVaultDialog.svelte";
  import { pick } from "./i18n.js";
  import { loadVaultKeys, matchKey } from "./keySource.js";

  let {
    locale = "zh-CN",
    picker = "hmac",
    multiline = false,
    materialLabel = "",
    materialPlaceholder = "",
    source = $bindable("once"),
    material = $bindable(""),
    keyId = $bindable(""),
  } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const keyLabel = $derived(
    materialLabel
      || t("密钥材料（hex/base64/PEM）", "Key material (hex/base64/PEM)"),
  );

  let vaultKeys = $state([]);
  let vaultUnlocked = $state(false);
  let unlockOpen = $state(false);

  async function refresh() {
    const next = await loadVaultKeys();
    vaultUnlocked = next.unlocked;
    vaultKeys = next.keys;
    if (keyId && !vaultKeys.some((key) => key.id === keyId && matchKey(key, picker))) keyId = "";
    return next;
  }

  async function onSourceChange(nextSource) {
    if (nextSource !== "vault") return;
    const next = await refresh();
    if (!next.unlocked) unlockOpen = true;
  }

  async function afterUnlock() {
    await refresh();
    window.dispatchEvent(new Event("toolbox-vault-change"));
  }

  $effect(() => {
    void picker;
    refresh();
  });

  $effect(() => {
    const onVaultChange = () => { void refresh(); };
    window.addEventListener("toolbox-vault-change", onVaultChange);
    return () => window.removeEventListener("toolbox-vault-change", onVaultChange);
  });
</script>

<div class="bar">
  <div class="source-row">
    <label class="field">
      <span class="dbx-label">{t("密钥来源", "Key source")}</span>
      <Select
        bind:value={source}
        options={[
          { value: "once", label: t("当次输入", "This time only") },
          { value: "vault", label: t("密钥库", "Key vault") },
        ]}
        onchange={onSourceChange}
      />
    </label>
    {#if source === "vault"}
      <label class="field grow">
        <span class="dbx-label">{t("密钥", "Key")}</span>
        <Select
          bind:value={keyId}
          options={[
            { value: "", label: t("选择已保存密钥", "Choose a saved key") },
            ...vaultKeys.filter((k) => matchKey(k, picker)).map((key) => ({
              value: key.id,
              label: `${key.name} · ${key.algorithm} · ${key.fingerprint}`,
            })),
          ]}
        />
      </label>
      {#if !vaultUnlocked}
        <button class="dbx-btn dbx-btn--ghost unlock" type="button" onclick={() => (unlockOpen = true)}>
          {t("解锁密钥库", "Unlock key vault")}
        </button>
      {/if}
    {:else if !multiline}
      <label class="field grow">
        <span class="dbx-label">{keyLabel}</span>
        <input class="dbx-input" type="password" autocomplete="off" placeholder={materialPlaceholder} bind:value={material} />
      </label>
    {/if}
  </div>
  {#if source === "once" && multiline}
    <label class="field material">
      <span class="dbx-label">{keyLabel}</span>
      <textarea class="dbx-textarea key-material" rows="3" spellcheck="false" autocomplete="off" placeholder={materialPlaceholder} bind:value={material}></textarea>
    </label>
  {/if}
</div>

<UnlockVaultDialog {locale} purpose="select" bind:open={unlockOpen} onUnlocked={afterUnlock} />

<style>
  .bar {
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
    flex-shrink: 0;
  }
  .source-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
  }
  .field :global(.dbx-label) {
    color: var(--color-muted-foreground);
  }
  .field :global(.dbx-select),
  .field .dbx-input {
    width: auto;
    min-width: 160px;
  }
  .grow {
    flex: 1 1 220px;
    min-width: 220px;
  }
  .grow .dbx-input,
  .grow :global(.dbx-select) {
    width: 100%;
  }
  .unlock {
    align-self: flex-end;
  }
  .material {
    width: 100%;
  }
  .key-material {
    width: 100%;
    min-height: 72px;
    resize: vertical;
    font-family: var(--font-mono);
  }
</style>
