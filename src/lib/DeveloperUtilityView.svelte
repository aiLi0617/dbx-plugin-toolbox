<script>
  import { loadAssetModule } from "./assetModules.js";
  import ChmodView from "./ChmodView.svelte";
  import SemverView from "./SemverView.svelte";
  import { compareDotEnv, dotenvExample, parseDotEnv, stringifyDotEnv, syncDotEnvTemplate } from "./developerUtilities.js";
  import { localizeError, pick } from "./i18n.js";

  let { locale = "zh-CN", toolId = "json-schema", initialOptions = {}, demo = null, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let auxiliary = $state("");
  let secondary = $state("");
  let dotenvMode = $state("validate");
  let comparisonRows = $state([]);
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
    if (toolId === "dotenv" && initialOptions.mode) dotenvMode = initialOptions.mode;
  });
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest || !demo) return;
    appliedDemoRequest = demoRequest;
    if (toolId === "chmod") return;
    const preset = toolId === "dotenv" ? demo.modes?.[dotenvMode] || demo : demo;
    input = preset.input || "";
    auxiliary = preset.auxiliary || demo.auxiliary || "";
    secondary = preset.secondary || "";
    void run();
  });

  async function run() {
    busy = true; error = ""; diagnostics = [];
    try {
      const limit = toolId === "json-schema" ? 5_000_000 : 1_000_000;
      if (new TextEncoder().encode(`${input}${auxiliary}${secondary}`).length > limit) throw new Error(t("输入内容超过此工具的安全上限", "Input exceeds this tool's safe limit"));
      if (toolId === "json-schema") {
        const schema = JSON.parse(auxiliary || "{}");
        const value = JSON.parse(input || "null");
        const module = await loadAssetModule("schema");
        const result = module.validateJsonSchema(schema, value);
        diagnostics = result.errors;
        output = result.valid ? t("✓ 数据符合 Schema", "✓ Document is valid") : JSON.stringify(result.errors, null, 2);
      } else if (toolId === "dotenv") {
        comparisonRows = [];
        if (dotenvMode === "json-to-env") output = stringifyDotEnv(JSON.parse(input || "{}"));
        else if (dotenvMode === "env-to-json") { const result = parseDotEnv(input); diagnostics = result.diagnostics; output = JSON.stringify(result.value, null, 2); }
        else if (dotenvMode === "example") { const result = parseDotEnv(input); diagnostics = result.diagnostics; output = dotenvExample(input); }
        else if (dotenvMode === "compare") { const result = compareDotEnv(input, secondary); diagnostics = result.diagnostics; comparisonRows = result.rows; output = JSON.stringify(result.rows, null, 2); }
        else if (dotenvMode === "sync") { const result = syncDotEnvTemplate(input, secondary); diagnostics = result.diagnostics; output = result.output; }
        else { const result = parseDotEnv(input); diagnostics = result.diagnostics; output = diagnostics.some((item) => item.level === "error") ? t("发现配置错误", "Configuration errors found") : t(`✓ ${Object.keys(result.value).length} 个变量有效`, `✓ ${Object.keys(result.value).length} valid variables`); }
      }
    } catch (cause) { error = localizeError(locale, cause); output = ""; }
    finally { busy = false; }
  }

  function clear() { input = ""; secondary = ""; output = ""; error = ""; diagnostics = []; comparisonRows = []; if (toolId !== "dotenv") auxiliary = ""; }

  function comparisonStatusLabel(status) {
    if (status === "same") return t("相同", "Same");
    if (status === "different") return t("不同", "Different");
    if (status === "missing-left") return t("左侧缺失", "Missing on left");
    if (status === "missing-right") return t("右侧缺失", "Missing on right");
    return status;
  }
</script>

{#if toolId === "chmod"}
  <ChmodView {locale} />
{:else if toolId === "semver"}
  <SemverView {locale} {demo} {demoRequest} />
{:else}
<div class="utility-page">
  <div class="utility-options">
    {#if toolId === "dotenv"}
      <div class="dbx-tabs" role="tablist" aria-label={t(".env 功能", ".env tools")}>{#each [["validate", "编辑校验", "Validate"], ["compare", "环境对比", "Compare"], ["example", "生成示例", "Example"], ["sync", "模板同步", "Sync"], ["env-to-json", ".env → JSON", ".env → JSON"], ["json-to-env", "JSON → .env", "JSON → .env"]] as [value, zh, en]}<button type="button" role="tab" aria-selected={dotenvMode===value} class:active={dotenvMode===value} onclick={() => { dotenvMode=value; output=""; comparisonRows=[]; }}>{t(zh,en)}</button>{/each}</div>
    {:else if spec.aux[0]}
      <label class="grow"><span>{t(...spec.aux)}</span><textarea class="dbx-textarea mono small" bind:value={auxiliary} spellcheck="false"></textarea></label>
    {/if}
  </div>
  <div class="utility-grid">
    <label><span>{toolId === "dotenv" && dotenvMode === "sync" ? t(".env.example 模板", ".env.example template") : toolId === "dotenv" && dotenvMode === "json-to-env" ? "JSON" : t(...spec.title)}</span><textarea class="dbx-textarea mono" bind:value={input} spellcheck="false"></textarea></label>
    {#if toolId === "dotenv" && ["compare","sync"].includes(dotenvMode)}<label><span>{dotenvMode === "compare" ? t("对比环境（值不会显示）", "Comparison environment (values are hidden)") : t("当前 .env 值", "Current .env values")}</span><textarea class="dbx-textarea mono" bind:value={secondary} spellcheck="false"></textarea></label>{:else}<label><span>{t("结果", "Result")}</span><textarea class="dbx-textarea mono" value={output} readonly spellcheck="false"></textarea></label>{/if}
  </div>
  {#if comparisonRows.length}<div class="compare-table"><table><thead><tr><th>{t("变量", "Variable")}</th><th>{t("状态", "Status")}</th><th>{t("左侧", "Left")}</th><th>{t("右侧", "Right")}</th></tr></thead><tbody>{#each comparisonRows as row}<tr><td><code>{row.key}</code></td><td>{comparisonStatusLabel(row.status)}</td><td>{row.leftSet ? "••••" : "—"}</td><td>{row.rightSet ? "••••" : "—"}</td></tr>{/each}</tbody></table></div>{/if}
  <div class="actions"><button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy} type="button">{busy ? t("处理中…", "Working…") : t("运行", "Run")}</button><button class="dbx-btn" onclick={clear} type="button">{t("清空", "Clear")}</button></div>
  {#if error}<div class="banner" role="alert">{error}</div>{/if}
  {#if diagnostics.length}<div class="diagnostics" role="status">{#each diagnostics as item}<div><strong>{item.path || `L${item.line}`}</strong> {item.message}</div>{/each}</div>{/if}
</div>
{/if}

<style>
  .utility-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;width:100%}.utility-options{display:flex;gap:12px}.utility-options label{display:flex;gap:8px;align-items:center}.utility-options .grow{flex:1;align-items:stretch;flex-direction:column}.small{min-height:90px}.utility-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;flex:1;min-height:280px}.utility-grid label{display:flex;min-width:0;min-height:0;flex-direction:column;gap:6px}.utility-grid textarea{flex:1;resize:none}.actions{display:flex;gap:8px}.banner{color:var(--color-destructive);font-size:12px}.diagnostics,.compare-table{max-height:180px;overflow:auto;padding:8px;border:1px solid var(--color-border);border-radius:7px;font-size:12px}.compare-table table{width:100%;border-collapse:collapse}.compare-table th,.compare-table td{padding:6px 8px;border-bottom:1px solid var(--color-border);text-align:left}@media(max-width:760px){.utility-grid{grid-template-columns:1fr}.utility-grid textarea{min-height:180px}}
</style>
