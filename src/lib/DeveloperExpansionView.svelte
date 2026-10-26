<script>
  import { pick, localizeError } from "./i18n.js";
  import {
    jsonStructureDiff,
    yamlDocuments,
    formatYaml,
    treeRows,
    decodeSafeLink,
    randomMac,
    ipv4Range,
    summarizeIpv4,
    REGEX_REFERENCE,
  } from "./developerExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import YamlTreeView from "./YamlTreeView.svelte";
  import JsonCodeEditor from "./JsonCodeEditor.svelte";
  import Select from "./Select.svelte";
  import JsonDiffView from "./JsonDiffView.svelte";
  import RomanView from "./RomanView.svelte";
  let { toolId, locale = "zh-CN", onOpenTool, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    secondary = $state(""),
    output = $state(""),
    error = $state(""),
    trees = $state([]),
    diffRows = $state([]),
    count = $state(5),
    separator = $state(":"),
    mode = $state("summarize");
  let referenceQuery = $state("");
  let referenceCategory = $state("全部");
  const referenceCategories = ["全部", "基础", "边界", "分组", "断言", "模式"];
  const referenceCategoryNames = { 全部: "All", 基础: "Basics", 边界: "Boundaries", 分组: "Groups", 断言: "Assertions", 模式: "Modes" };
  const referenceCategoryMap = {
    "字面量与转义": "基础", "任意字符": "基础", "字符类": "基础", "否定字符类": "基础",
    "数字": "基础", "非数字": "基础", "单词字符": "基础", "空白字符": "基础",
    "单词边界": "边界", "行首与行尾": "边界", "多行锚点": "边界",
    "或分支": "分组", "可选": "基础", "零次或多次": "基础", "一次或多次": "基础",
    "指定次数": "基础", "次数范围": "基础", "分组": "分组", "非捕获组": "分组",
    "命名捕获组": "分组", "反向引用": "分组", "命名反向引用": "分组",
    "正向预查": "断言", "负向预查": "断言", "正向后查": "断言", "负向后查": "断言",
    "非贪婪": "模式", "Unicode 属性类": "模式", "点号匹配换行": "模式",
  };
  const filteredReferences = $derived(
    REGEX_REFERENCE.filter(([zh, en, pattern, sample]) => {
      const query = referenceQuery.trim().toLowerCase();
      const category = referenceCategoryMap[zh] || "基础";
      return (!query || [zh, en, pattern, sample].some((value) => String(value).toLowerCase().includes(query)))
        && (referenceCategory === "全部" || category === referenceCategory);
    }),
  );
  function run() {
    output = "";
    error = "";
    trees = [];
    diffRows = [];
    try {
      if (toolId === "json-diff") {
        diffRows = jsonStructureDiff(input, secondary);
        output = JSON.stringify(diffRows, null, 2);
      }
      else if (toolId === "safelink")
        output = input
          .split(/\r?\n/)
          .filter((s) => s.trim())
          .map(decodeSafeLink)
          .join("\n");
      else if (toolId === "mac-generator")
        output = randomMac(Number(count), input, separator);
      else if (toolId === "ipv4-range")
        output = (
          mode === "expand"
            ? ipv4Range(input, secondary, { expand: true })
            : summarizeIpv4(input)
        ).join("\n");
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
  function demo() {
    input =
      {
        "json-diff": '{"name":"DBX","version":1}',
        "yaml-tree":
          "name: DBX\nfeatures:\n  - JSON\n  - YAML\n---\nactive: true",
        safelink: "https://example.com/",
        "mac-generator": "",
        "ipv4-range": "192.168.1.0/25\n192.168.1.128/25",
      }[toolId] || "";
    secondary =
      toolId === "json-diff"
        ? ' {"version":2,"name":"DBX"}'
        : toolId === "ipv4-range" && mode === "expand"
          ? "192.168.1.10"
          : "";
    if (toolId === "ipv4-range" && mode === "expand") input = "192.168.1.1";
    output = "";
    trees = [];
    diffRows = [];
  }
  function formatYamlInput() {
    try {
      input = formatYaml(input);
      error = "";
    } catch (e) {
      error = localizeError(locale, e);
      if (e.line && e.column) error += ` [${e.line}:${e.column}]`;
    }
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    demo();
  });
  $effect(() => {
    if (toolId !== "yaml-tree") return;
    const text = input;
    const timer = setTimeout(() => {
      trees = [];
      error = "";
      if (!text.trim()) return;
      try {
        trees = yamlDocuments(text).map((v, i) => treeRows(v, `document[${i + 1}]`));
      } catch (e) {
        error = localizeError(locale, e);
        if (e.line && e.column) error += ` [${e.line}:${e.column}]`;
      }
    }, 120);
    return () => clearTimeout(timer);
  });
</script>

{#if toolId === "json-diff"}
  <JsonDiffView {locale} {demoRequest} />
{:else if toolId === "roman"}
  <RomanView {locale} {demoRequest} />
{:else}
<div class="expansion-page developer-workspace" class:regex-reference-page={toolId === "regex-reference"} class:yaml-tree-workspace={toolId === "yaml-tree"}>
  {#if toolId === "regex-reference"}
    <section class="regex-reference-head">
      <div>
        <p class="eyebrow">{t("DEVELOPER REFERENCE", "DEVELOPER REFERENCE")}</p>
        <h1>{t("正则语法速查", "Regex reference")}</h1>
        <p class="intro">{t("按场景快速查找语法，复制后即可在测试器中验证。", "Find syntax by use case, copy it, and verify it in the tester.")}</p>
      </div>
      <div class="reference-count"><strong>{filteredReferences.length}</strong><span>{t("条规则", "rules")}</span></div>
    </section>
    <div class="regex-reference-toolbar">
      <label class="reference-search">
        <span class="sr-only">{t("搜索正则语法", "Search regex syntax")}</span>
        <span class="search-icon" aria-hidden="true">⌕</span>
        <input class="dbx-input" bind:value={referenceQuery} placeholder={t("搜索名称、语法或示例…", "Search name, syntax, or example…")} />
        {#if referenceQuery}<button class="clear-search" type="button" aria-label={t("清除搜索", "Clear search")} onclick={() => (referenceQuery = "")}>×</button>{/if}
      </label>
      <div class="category-tabs" role="tablist" aria-label={t("分类", "Categories")}>
        {#each referenceCategories as category}
          <button type="button" class:active={referenceCategory === category} role="tab" aria-selected={referenceCategory === category} onclick={() => (referenceCategory = category)}>{t(category, referenceCategoryNames[category])}</button>
        {/each}
      </div>
    </div>
    {#if filteredReferences.length}
      <div class="reference-grid">
        {#each filteredReferences as [zh, en, pattern, sample, flags = "g"]}
          <article class="reference-card">
            <div class="card-topline"><span class="card-category">{t(referenceCategoryMap[zh] || "基础", referenceCategoryNames[referenceCategoryMap[zh] || "基础"])}</span><span class="card-index">{String(REGEX_REFERENCE.findIndex((item) => item[0] === zh) + 1).padStart(2, "0")}</span></div>
            <h3>{t(zh, en)}</h3>
            <code class="pattern-code">{pattern}</code>
            <div class="sample-line"><span>{t("示例", "Example")}</span><code>{sample}</code></div>
            <div class="card-actions"><CopyButton {locale} text={pattern} /><button class="dbx-btn dbx-btn--primary open-tester" onclick={() => onOpenTool?.("regex", { pattern, input: sample, flags })}>{t("打开测试器", "Open tester")}</button></div>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty-reference"><strong>{t("没有找到匹配的语法", "No matching syntax")}</strong><span>{t("换个关键词或清除筛选试试。", "Try another keyword or clear the filters.")}</span></div>
    {/if}
  {:else}
    {#if toolId === "yaml-tree"}
      <div class="yaml-input-panel">
        <div class="yaml-input-toolbar">
          <button class="dbx-btn yaml-format-button" type="button" onclick={formatYamlInput} disabled={!input.trim()}>
            {t("格式化", "Format")}
          </button>
          <CopyButton {locale} text={input} />
          <button class="dbx-btn dbx-btn--ghost" type="button" data-replaces-content onclick={() => { input = ""; trees = []; error = ""; }} disabled={!input} title={t("清空", "Clear")} aria-label={t("清空", "Clear")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"></path></svg>
          </button>
        </div>
        <JsonCodeEditor bind:value={input} mode="yaml" {locale} showLineNumbers={true} ariaLabel="YAML" placeholder={'name: DBX\nfeatures:\n  - JSON'} />
      </div>
      <div class="yaml-result-panel">
        {#if error}<p role="alert">{error}</p>{:else}<YamlTreeView {trees} {locale} />{/if}
      </div>
    {:else}
    {#if toolId === "ipv4-range"}<Select bind:value={mode} ariaLabel={t("模式", "Mode")} options={[
      {value:"summarize",label:t("汇总 CIDR", "Summarize CIDRs")},
      {value:"expand",label:t("展开地址范围", "Expand address range")},
    ]} />{/if}
    <label
        >{toolId === "mac-generator"
          ? t("MAC 前缀（可留空）", "MAC prefix (optional)")
          : t("输入", "Input")}<textarea
          class="dbx-textarea"
          bind:value={input}
          maxlength="1000000"
          rows="8"></textarea></label
      >
    {#if toolId === "json-diff" || (toolId === "ipv4-range" && mode === "expand")}<label
        >{toolId === "json-diff"
          ? t("第二份 JSON", "Second JSON")
          : t("结束地址", "End address")}<textarea
          class="dbx-textarea"
          bind:value={secondary}
          rows="8"
          maxlength="1000000"></textarea></label
      >{/if}
    {#if toolId === "mac-generator"}<label
        >{t("数量", "Count")}<input
          class="dbx-input"
          type="number"
          min="1"
          max="1000"
          bind:value={count}
        /></label
      ><Select bind:value={separator} ariaLabel={t("分隔符", "Separator")} options={[
        {value:":",label:"AA:BB:CC:DD:EE:FF"},{value:"-",label:"AA-BB-CC-DD-EE-FF"},{value:".",label:"AABB.CCDD.EEFF"},
      ]} />{/if}
    <div class="expansion-actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run}
        >{t("执行", "Run")}</button
      ><CopyButton {locale} text={output} />
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if toolId === "json-diff" && diffRows.length}<div class="diff-result result-panel" role="region" aria-label={t("差异", "Difference")}>
      {#each diffRows as change}
        <article class="diff-row" class:added={change.type === "added"} class:removed={change.type === "removed"}>
          <div><strong>{change.type}</strong><code>{change.path}</code></div>
          {#if change.type !== "added"}<pre>{JSON.stringify(change.before, null, 2)}</pre>{/if}
          {#if change.type !== "removed"}<pre>{JSON.stringify(change.after, null, 2)}</pre>{/if}
        </article>
      {/each}
    </div>{:else if output}<textarea class="dbx-textarea result-panel" readonly value={output} rows="12"
      ></textarea>{/if}
    {/if}
  {/if}
</div>
{/if}

<style>
  .developer-workspace{max-width:1100px}
  .developer-workspace.yaml-tree-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);max-width:none;flex:1;min-height:0;overflow:hidden;align-content:stretch}
  .yaml-input-panel,.yaml-result-panel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
  .yaml-input-panel{gap:8px}
  .yaml-input-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-shrink:0;min-height:32px}
  .yaml-input-toolbar :global(.dbx-btn){display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-height:28px;padding:0}
  .yaml-input-toolbar .yaml-format-button{width:auto;padding:0 10px;margin-right:auto}
  .yaml-result-panel>[role="alert"]{flex:1;min-height:0;margin:40px 0 0;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:auto;white-space:pre-wrap}
  .regex-reference-page{max-width:1180px;gap:18px;padding:24px 28px 40px}
  .regex-reference-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:4px 2px 2px}
  .eyebrow{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--color-info);}
  .regex-reference-head h1{margin:0;font-size:24px;line-height:1.2;letter-spacing:-.02em}
  .intro{margin:7px 0 0;color:var(--color-muted-foreground);font-size:13px}
  .reference-count{display:flex;align-items:baseline;gap:6px;white-space:nowrap;color:var(--color-muted-foreground);font-size:12px}
  .reference-count strong{font-size:24px;line-height:1;color:var(--color-foreground)}
  .regex-reference-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:color-mix(in srgb,var(--color-card) 88%,var(--color-muted))}
  .reference-search{position:relative;display:flex;align-items:center;flex:1 1 260px;min-width:220px}
  .reference-search .dbx-input{width:100%;height:34px;padding-left:32px;padding-right:30px}
  .search-icon{position:absolute;left:11px;color:var(--color-muted-foreground);font-size:19px;line-height:1;transform:translateY(-1px)}
  .clear-search{position:absolute;right:6px;width:24px;height:24px;border-radius:50%;color:var(--color-muted-foreground);font-size:18px;line-height:1}
  .category-tabs{display:flex;gap:4px;overflow:auto;padding:2px}
  .category-tabs button{height:28px;padding:0 10px;border-radius:999px;color:var(--color-muted-foreground);font-size:12px;white-space:nowrap}
  .category-tabs button:hover{color:var(--color-foreground)}
  .category-tabs button.active{background:var(--color-primary);color:var(--color-primary-foreground)}
  .reference-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px}
  .reference-card{display:flex;flex-direction:column;min-width:0;min-height:166px;padding:15px 16px 13px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card);transition:border-color .15s ease,box-shadow .15s ease,transform .15s ease}
  .reference-card:hover{border-color:var(--color-ring);box-shadow:var(--dbx-shadow-sm);transform:translateY(-1px)}
  .card-topline{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .card-category{font-size:10px;font-weight:600;color:var(--color-info);letter-spacing:.04em}
  .card-index{font:11px var(--font-mono);color:var(--color-muted-foreground);opacity:.7}
  .reference-card h3{margin:0 0 9px;font-size:14px;line-height:1.3}
  .pattern-code{display:block;overflow:auto;padding:8px 9px;border-radius:var(--radius-md);background:var(--color-muted);color:var(--color-foreground);font-size:13px;white-space:nowrap}
  .sample-line{display:flex;align-items:center;gap:7px;min-width:0;margin-top:9px;color:var(--color-muted-foreground);font-size:11px}
  .sample-line code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-foreground)}
  .card-actions{display:flex;align-items:center;gap:4px;margin-top:auto;padding-top:11px}
  .card-actions :global(.dbx-btn){height:28px;padding:0 8px;font-size:11px}
  .open-tester{margin-left:auto}
  .empty-reference{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:180px;border:1px dashed var(--color-border);border-radius:var(--radius-lg);color:var(--color-muted-foreground)}
  .empty-reference strong{color:var(--color-foreground);font-size:14px}
  @container (max-width: 560px){.regex-reference-page{padding:16px 12px 28px}.regex-reference-head{align-items:flex-start}.reference-count{display:none}.regex-reference-toolbar{padding:9px}.reference-grid{grid-template-columns:1fr}}
  @container (min-width: 760px){
    .developer-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);align-content:start}
    .developer-workspace>.expansion-actions,.developer-workspace>[role="alert"]{grid-column:1/-1}
    .developer-workspace>.result-panel{grid-column:2;grid-row:1 / span 4;min-height:320px}
  }
  @container (max-width: 759px){.developer-workspace>.result-panel{min-height:220px}}
  .diff-result{min-height:0;overflow:auto;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}
  .diff-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid var(--color-border)}.diff-row:first-child{border-top:0}.diff-row>div{grid-column:1/-1;display:flex;gap:8px;align-items:center}.diff-row strong{font:600 10px var(--font-sans);text-transform:uppercase;color:var(--color-info)}.diff-row.added strong{color:var(--color-success)}.diff-row.removed strong{color:var(--color-destructive)}.diff-row code{min-width:0;overflow-wrap:anywhere;color:var(--color-muted-foreground)}.diff-row pre{margin:0;min-width:0;overflow:auto;padding:7px;border-radius:var(--radius-sm);background:var(--color-muted);font:11px/1.45 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere}
</style>
