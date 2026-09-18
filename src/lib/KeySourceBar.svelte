<script>
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { loadVaultKeys, matchKey } from "./keySource.js";

  let {
    locale = "zh-CN",
    picker = "hmac",
    source = $bindable("once"),
    material = $bindable(""),
    keyId = $bindable(""),
  } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let vaultKeys = $state([]);
  let vaultUnlocked = $state(false);

  async function refresh() {
    const next = await loadVaultKeys();
    vaultUnlocked = next.unlocked;
    vaultKeys = next.keys;
  }

  $effect(() => {
    void picker;
    refresh();
  });
</script>

<div class="options">
  <label class="field">
    <span class="dbx-label">{t("密钥来源", "Key source")}</span>
    <Select
      bind:value={source}
      options={[
        { value: "once", label: t("当次输入", "This time only") },
        { value: "vault", label: t("密钥库", "Key vault") },
      ]}
    />
  </label>
  {#if source === "vault"}
    <label class="field">
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
      <span class="dbx-hint">{t("请先点右上角解锁密钥库", "Unlock the key vault in the top right first")}</span>
    {/if}
  {:else}
    <label class="field grow">
      <span class="dbx-label">{t("密钥材料（hex/base64/PEM）", "Key material (hex/base64/PEM)")}</span>
      <input class="dbx-input" type="password" autocomplete="off" bind:value={material} />
    </label>
  {/if}
</div>

<style>
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
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
  .grow .dbx-input {
    width: 100%;
  }
  .dbx-hint {
    align-self: center;
  }
</style>
