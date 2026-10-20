<script>
  import KeyView from "./KeyView.svelte";
  import KeyPairView from "./KeyPairView.svelte";
  import { pick } from "./i18n.js";
  let { locale = "zh-CN", toolId = "key-generator", initialOptions = {}, onVaultChange = () => {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let mode = $state("symmetric");
  const fixed = $derived(toolId !== "key-generator");
  $effect(() => { mode = initialOptions.generator === "keypair" ? "pair" : "symmetric"; });
</script>

<div class="key-workbench">
  {#if !fixed}<div class="dbx-tabs" role="tablist" aria-label={t("密钥类型", "Key type")}>
    <button type="button" role="tab" aria-selected={mode === "symmetric"} class:active={mode === "symmetric"} onclick={() => mode = "symmetric"}>{t("对称密钥", "Symmetric key")}</button>
    <button type="button" role="tab" aria-selected={mode === "pair"} class:active={mode === "pair"} onclick={() => mode = "pair"}>{t("密钥对", "Key pair")}</button>
  </div>{/if}
  {#if mode === "symmetric"}<KeyView {locale} {onVaultChange} />{:else}<KeyPairView {locale} {onVaultChange} fixedAlgorithm={initialOptions.algorithm || ""} />{/if}
</div>

<style>
  .key-workbench{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px}
</style>
