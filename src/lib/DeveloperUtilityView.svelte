<script>
  import { loadAssetModule } from "./assetModules.js";
  import ChmodView from "./ChmodView.svelte";
  import SemverView from "./SemverView.svelte";
  import { parseDotEnv, stringifyDotEnv } from "./developerUtilities.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN", toolId = "json-schema", initialOptions = {}, demo = null, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let auxiliary = $state("");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);
  let diagnostics = $state([]);
  let appliedDemoRequest = 0;

  const specs = {
    "json-schema": { title: ["JSON 数据", "JSON document"], aux: ["JSON Schema", "JSON Schema"] },
    dotenv: { title: [".env 或 JSON", ".env or JSON"], aux: ["模式：env-to-json / json-to-env", "Mode: env-to-json / json-to-env"] },
    chmod: { title: ["八进制或符号权限", "Octal or symbolic permissions"], aux: ["", ""] },
  };
  const spec = $derived(specs[toolId] || specs["json-schema"]);

  $effect(() => {
    if (toolId === "dotenv") auxiliary = initialOptions.mode || "env-to-json";
  });
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest || !demo) return;
    appliedDemoRequest = demoRequest;
    if (toolId === "chmod") return;
    input = demo.input || ""; auxiliary = demo.auxiliary || "";
    void run();
  });

  async function run() {
    busy = true; error = ""; diagnostics = [];
    try {
      const limit = toolId === "json-schema" ? 5_000_000 : 1_000_000;
      if (new TextEncoder().encode(`${input}${auxiliary}`).length > limit) throw new Error(t("输入内容超过此工具的安全上限", "Input exceeds this tool's safe limit"));
      if (toolId === "json-schema") {
        const schema = JSON.parse(auxiliary || "{}");
        const value = JSON.parse(input || "null");
        const module = await loadAssetModule("schema");
        const result = module.validateJsonSchema(schema, value);
        diagnostics = result.errors;
        output = result.valid ? t("✓ 数据符合 Schema", "✓ Document is valid") : JSON.stringify(result.errors, null, 2);
      } else if (toolId === "dotenv") {
        if ((auxiliary || "env-to-json") === "json-to-env") output = stringifyDotEnv(JSON.parse(input || "{}"));
        else { const result = parseDotEnv(input); diagnostics = result.diagnostics; output = JSON.stringify(result.value, null, 2); }
      }
    } catch (cause) { error = String(cause?.message || cause); output = ""; }
    finally { busy = false; }
  }

  function clear() { input = ""; output = ""; error = ""; diagnostics = []; if (toolId !== "dotenv") auxiliary = ""; }
</script>

{#if toolId === "chmod"}
  <ChmodView {locale} />
{:else if toolId === "semver"}
  <SemverView {locale} {demo} {demoRequest} />
{:else}
<div class="utility-page">
  <div class="utility-options">
    {#if toolId === "dotenv"}
      <label><span>{t("转换方向", "Direction")}</span><select class="dbx-select" bind:value={auxiliary}><option value="env-to-json">.env → JSON</option><option value="json-to-env">JSON → .env</option></select></label>
    {:else if spec.aux[0]}
      <label class="grow"><span>{t(...spec.aux)}</span><textarea class="dbx-textarea mono small" bind:value={auxiliary} spellcheck="false"></textarea></label>
    {/if}
  </div>
  <div class="utility-grid">
    <label><span>{t(...spec.title)}</span><textarea class="dbx-textarea mono" bind:value={input} spellcheck="false"></textarea></label>
    <label><span>{t("结果", "Result")}</span><textarea class="dbx-textarea mono" value={output} readonly spellcheck="false"></textarea></label>
  </div>
  <div class="actions"><button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy} type="button">{busy ? t("处理中…", "Working…") : t("运行", "Run")}</button><button class="dbx-btn" onclick={clear} type="button">{t("清空", "Clear")}</button></div>
  {#if error}<div class="banner" role="alert">{error}</div>{/if}
  {#if diagnostics.length}<div class="diagnostics" role="status">{#each diagnostics as item}<div><strong>{item.path || `L${item.line}`}</strong> {item.message}</div>{/each}</div>{/if}
</div>
{/if}

<style>
  .utility-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;width:100%}.utility-options{display:flex;gap:12px}.utility-options label{display:flex;gap:8px;align-items:center}.utility-options .grow{flex:1;align-items:stretch;flex-direction:column}.small{min-height:90px}.utility-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:280px}.utility-grid label{display:flex;min-width:0;min-height:0;flex-direction:column;gap:6px}.utility-grid textarea{flex:1;resize:none}.actions{display:flex;gap:8px}.banner{color:var(--color-destructive);font-size:12px}.diagnostics{max-height:130px;overflow:auto;padding:8px;border:1px solid var(--color-border);border-radius:7px;font-size:12px}@media(max-width:760px){.utility-grid{grid-template-columns:1fr}.utility-grid textarea{min-height:180px}}
</style>
