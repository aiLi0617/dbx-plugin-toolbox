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
<div class="expansion-page developer-workspace" class:safelink-page={toolId === "safelink"} class:regex-reference-page={toolId === "regex-reference"} class:yaml-tree-workspace={toolId === "yaml-tree"} class:mac-generator-page={toolId === "mac-generator"} class:ipv4-range-page={toolId === "ipv4-range"}>
  {#if toolId === "regex-reference"}
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
      <div class="reference-count"><strong>{filteredReferences.length}</strong><span>{t("条规则", "rules")}</span></div>
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
  {:else if toolId === "safelink"}
    <section class="safelink-intro">
      <p class="safelink-description">{t("提取 Outlook SafeLink 中的原始网址，整个过程在本地完成。", "Extract the original URL from an Outlook SafeLink locally in your browser.")}</p>
      <span class="safelink-local-badge"><span class="safelink-dot"></span>{t("本地处理", "Local only")}</span>
    </section>
    <div class="safelink-grid">
      <section class="safelink-panel"><div class="safelink-panel-head"><div><strong>{t("输入 SafeLink", "SafeLink input")}</strong><span>{t("每行一个链接", "One link per line")}</span></div><span class="safelink-count">{input.length.toLocaleString(locale)} {t("字符", "chars")}</span></div><textarea class="dbx-textarea safelink-textarea" bind:value={input} maxlength="1000000" placeholder={t("粘贴 safelinks.protection.outlook.com 链接…", "Paste a safelinks.protection.outlook.com link…")} spellcheck="false"></textarea><div class="safelink-panel-foot"><button class="dbx-btn dbx-btn--ghost" type="button" onclick={() => { input = ""; error = ""; output = ""; }} disabled={!input}>{t("清空", "Clear")}</button><div class="safelink-primary-actions"><CopyButton {locale} text={input} /><button class="dbx-btn dbx-btn--primary" type="button" onclick={run} disabled={!input.trim()}>{t("解码链接", "Decode links")}</button></div></div></section>
      <section class="safelink-panel safelink-result-panel"><div class="safelink-panel-head"><div><strong>{t("解码结果", "Decoded result")}</strong><span>{t("原始目标地址", "Original destination")}</span></div>{#if output}<CopyButton {locale} text={output} />{/if}</div>{#if output}<textarea class="dbx-textarea safelink-textarea safelink-output" readonly value={output} spellcheck="false"></textarea>{:else}<div class="safelink-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12h8M9 7h6a4 4 0 0 1 0 8H9a4 4 0 0 1 0-8Z"/><path d="m9 12-2 2a4 4 0 0 1-5.66-5.66l2-2A4 4 0 0 1 9 6.34M15 12l2-2a4 4 0 0 1 5.66 5.66l-2 2A4 4 0 0 1 15 17.66"/></svg><strong>{t("解码结果将在这里显示", "Decoded links will appear here")}</strong><span>{t("粘贴链接后点击“解码链接”", "Paste a link and choose “Decode links”")}</span></div>{/if}</section>
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    <p class="safelink-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>{t("不会上传链接，也不会访问目标网站。", "Your links stay in this browser and are never opened or uploaded.")}</p>
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
    {#if toolId === "ipv4-range"}<div class="mode-switch" role="tablist" aria-label={t("模式", "Mode")}>
      <button type="button" role="tab" aria-selected={mode === "summarize"} onclick={() => (mode = "summarize")}>{t("汇总 CIDR", "Summarize CIDRs")}</button>
      <button type="button" role="tab" aria-selected={mode === "expand"} onclick={() => (mode = "expand")}>{t("展开地址范围", "Expand address range")}</button>
    </div>{/if}
    {#if toolId === "mac-generator"}
      <section class="mac-generator-card" aria-label={t("MAC 地址生成设置", "MAC generator settings")}>
        <label class="mac-prefix-field"><span>{t("MAC 前缀", "MAC prefix")} <small>{t("可选", "Optional")}</small></span><input class="dbx-input mac-prefix-input" bind:value={input} maxlength="17" placeholder="AA:BB:CC" spellcheck="false" /><small class="field-hint">{t("留空可生成任意本地管理地址，例如 AA:BB:CC。", "Leave empty for any locally administered address, or enter a prefix such as AA:BB:CC.")}</small></label>
        <div class="mac-options-grid"><label><span>{t("数量", "Count")}</span><input class="dbx-input" type="number" min="1" max="1000" bind:value={count} /></label><label><span>{t("输出格式", "Output format")}</span><Select bind:value={separator} ariaLabel={t("输出格式", "Output format")} options={[{value:":",label:"AA:BB:CC:DD:EE:FF"},{value:"-",label:"AA-BB-CC-DD-EE-FF"},{value:".",label:"AABB.CCDD.EEFF"}]} /></label></div>
      </section>
    {:else}
      <label class:range-input={toolId === "ipv4-range"}>{t("输入", "Input")}<textarea class="dbx-textarea" bind:value={input} maxlength="1000000" rows={toolId === "ipv4-range" ? "6" : "8"}></textarea>{#if toolId === "ipv4-range"}<small class="range-hint">{t("每行一个 CIDR，例如 192.168.1.0/25", "One CIDR per line, for example 192.168.1.0/25")}</small>{/if}</label>
    {/if}
    {#if toolId === "json-diff" || (toolId === "ipv4-range" && mode === "expand")}<label class:range-secondary={toolId === "ipv4-range" && mode === "expand"}
      >{toolId === "json-diff"
          ? t("第二份 JSON", "Second JSON")
          : t("结束地址", "End address")}<textarea
          class="dbx-textarea"
          bind:value={secondary}
          rows="6"
          maxlength="1000000"></textarea></label
      >{/if}
    <div class="expansion-actions" class:mac-actions={toolId === "mac-generator"}>
      <button class="dbx-btn dbx-btn--primary" onclick={run}
        >{toolId === "mac-generator" ? t("生成地址", "Generate addresses") : t("执行", "Run")}</button
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
    </div>{:else if output}<div class="result-panel output-card" class:mac-result-panel={toolId === "mac-generator"}><div class="output-card-head"><span>{t("生成结果", "Generated addresses")}</span><span class="output-count">{output.split("\n").filter(Boolean).length}</span></div>{#if toolId === "mac-generator"}<div class="mac-result-list" role="list" aria-label={t("MAC 地址结果", "MAC address results")}>{#each output.split("\n").filter(Boolean) as address, index}<div class="mac-result-row" role="listitem"><span class="mac-result-index">{String(index + 1).padStart(2, "0")}</span><code>{address}</code><CopyButton {locale} text={address} /></div>{/each}</div>{:else}<textarea class="dbx-textarea" readonly value={output} rows="12"></textarea>{/if}</div>{/if}
    {/if}
  {/if}
</div>
{/if}

<style>
  .developer-workspace{max-width:1100px}
  .safelink-page{max-width:1180px;gap:18px;padding:28px 32px 40px;background:var(--color-background)}
  .safelink-intro{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:0 2px 2px}
  .safelink-description{margin:0;color:var(--color-muted-foreground);font-size:13px}
  .safelink-local-badge{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid var(--color-success);border-radius:999px;background:var(--color-success-bg);color:var(--color-success);font-size:11px;font-weight:650;white-space:nowrap}
  .safelink-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .safelink-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:stretch}
  .safelink-panel{display:flex;flex-direction:column;min-width:0;min-height:330px;padding:16px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card);box-shadow:none}
  .safelink-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
  .safelink-panel-head>div{display:flex;flex-direction:column;gap:3px;min-width:0}
  .safelink-panel-head strong{font-size:13px}
  .safelink-panel-head span{color:var(--color-muted-foreground);font-size:11px}
  .safelink-count{font:11px var(--font-mono);white-space:nowrap}
  .safelink-textarea{flex:1;min-height:230px;padding:13px 14px;border-radius:var(--radius-md);font:12px/1.65 var(--font-mono);resize:vertical}
  .safelink-textarea::placeholder{color:var(--color-muted-foreground);opacity:.7}
  .safelink-panel-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px}
  .safelink-primary-actions{display:flex;align-items:center;gap:7px}
  .safelink-primary-actions :global(.dbx-btn--primary){min-width:104px}
  .safelink-result-panel{background:var(--color-card)}
  .safelink-result-panel .safelink-panel-head{align-items:center}
  .safelink-output{background:var(--color-card);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
  .safelink-empty{display:flex;flex:1;min-height:230px;align-items:center;justify-content:center;flex-direction:column;gap:7px;padding:24px;text-align:center;color:var(--color-muted-foreground)}
  .safelink-empty svg{width:30px;height:30px;margin-bottom:4px;color:var(--color-primary);fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
  .safelink-empty strong{color:var(--color-foreground);font-size:13px}
  .safelink-empty span{font-size:11px}
  .safelink-note{display:flex;align-items:center;gap:7px;margin:0!important;color:var(--color-muted-foreground);font-size:11px!important}
  .safelink-note svg{width:15px;height:15px;flex:none;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
  @container (max-width:760px){.safelink-page{padding:20px 16px 30px}.safelink-grid{grid-template-columns:1fr}.safelink-panel{min-height:280px}.safelink-textarea,.safelink-empty{min-height:180px}}
  @container (max-width:480px){.safelink-page{padding:16px 12px 24px}.safelink-intro{align-items:flex-start;flex-direction:column;gap:12px}.safelink-panel{padding:13px}.safelink-panel-foot{align-items:stretch;flex-direction:column}.safelink-primary-actions{justify-content:flex-end}}
  .ipv4-range-page{max-width:1120px;gap:16px;padding:22px 28px 34px}
  .mode-switch{display:inline-flex;align-items:center;width:max-content;max-width:100%;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:hidden;background:var(--dbx-control-background)}
  .mode-switch button{height:28px;padding:0 12px;border:0;border-right:1px solid var(--color-border);border-radius:0;background:transparent;color:var(--dbx-control-foreground);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
  .mode-switch button:last-child{border-right:0}
  .mode-switch button:hover:not([aria-selected="true"]){color:var(--dbx-hover-foreground);background:var(--dbx-hover-background)}
  .mode-switch button[aria-selected="true"]{background:var(--dbx-selection-background);border-color:var(--dbx-selection-border);color:var(--dbx-selection-foreground);font-weight:600}
  .mode-switch button:focus-visible{outline:none;box-shadow:var(--dbx-focus-ring)}
  .ipv4-range-page .range-input{gap:8px}
  .ipv4-range-page .range-input .dbx-textarea,.ipv4-range-page .range-secondary .dbx-textarea{min-height:132px;padding:12px;font-family:var(--font-mono);font-size:13px;line-height:1.65;border-radius:10px;background:var(--dbx-control-background,var(--color-card))}
  .range-hint{color:var(--color-muted-foreground);font-size:11px}
  .ipv4-range-page .expansion-actions{padding-top:2px}
  .ipv4-range-page .expansion-actions .dbx-btn--primary{min-width:84px;height:36px}
  .ipv4-range-page .output-card{padding:14px;border:1px solid var(--dbx-control-border,var(--color-border));border-radius:10px;background:var(--dbx-control-background,var(--color-card));box-shadow:none}
  .ipv4-range-page .output-card .dbx-textarea{min-height:190px;font-family:var(--font-mono);line-height:1.6}
  .ipv4-range-page:has(.range-secondary){display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:16px;align-content:start}
  .ipv4-range-page:has(.range-secondary)>:is(.mode-switch,.expansion-actions,.output-card,[role="alert"]){grid-column:1 / -1}
  .ipv4-range-page:has(.range-secondary)>.range-input,.ipv4-range-page:has(.range-secondary)>.range-secondary{min-width:0}
  @container (max-width:700px){.ipv4-range-page:has(.range-secondary){display:flex;flex-direction:column}.ipv4-range-page:has(.range-secondary)>:is(.mode-switch,.expansion-actions,.output-card,[role="alert"]){width:100%}}
  @container (max-width:560px){.ipv4-range-page{padding:16px 12px 28px}.mode-switch{width:100%}.mode-switch button{flex:1;padding-inline:8px}}
  .mac-generator-page{display:flex;flex-direction:column;gap:18px;max-width:860px;padding:28px 32px 40px}
  .mac-generator-card{display:flex;flex-direction:column;gap:18px;padding:20px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card)}
  .mac-generator-card label{display:flex;flex-direction:column;gap:7px;color:var(--color-foreground);font-size:12px;font-weight:600}
  .mac-generator-card label small{font-weight:400;color:var(--color-muted-foreground)}
  .mac-prefix-input{height:42px;font-family:var(--font-mono);font-size:14px;letter-spacing:.04em}
  .field-hint{font-size:11px!important;font-weight:400!important}
  .mac-options-grid{display:grid;grid-template-columns:minmax(0,.7fr) minmax(0,1.3fr);gap:14px}
  .mac-options-grid .dbx-input,.mac-options-grid :global(.dbx-custom-select){width:100%;height:38px}
  .mac-actions{padding-top:0}
  .mac-actions :global(.dbx-btn--primary){min-width:132px}
  .output-card{display:flex;flex-direction:column;gap:8px}
  .mac-result-panel{padding:20px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card)}
  .output-card-head{display:flex;align-items:center;justify-content:space-between;color:var(--color-foreground);font-size:12px;font-weight:600}
  .output-count{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:22px;padding:0 6px;border-radius:999px;background:var(--color-muted);color:var(--color-foreground);font:11px var(--font-mono)}
  .mac-result-panel .dbx-textarea{min-height:220px;font-family:var(--font-mono);font-size:13px;line-height:1.6}
  .mac-result-list{display:flex;flex-direction:column;max-height:360px;overflow:auto;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-background)}
  .mac-result-row{display:grid;grid-template-columns:30px minmax(0,1fr) 28px;align-items:center;gap:10px;min-height:42px;padding:6px 10px;border-top:1px solid var(--color-border)}
  .mac-result-row:first-child{border-top:0}
  .mac-result-row code{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--color-foreground);font:13px var(--font-mono);letter-spacing:.02em}
  .mac-result-index{color:var(--color-muted-foreground);font:10px var(--font-mono);text-align:center}
  .mac-result-row :global(.dbx-btn){width:26px;height:26px;min-height:26px;padding:0;font-size:0}
  @container (max-width: 560px){.mac-generator-page{padding:18px 14px 28px}.mac-options-grid{grid-template-columns:1fr}.mac-generator-card,.mac-result-panel{padding:15px}}
  .developer-workspace.yaml-tree-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);max-width:none;flex:1;min-height:0;overflow:hidden;align-content:stretch}
  .yaml-input-panel,.yaml-result-panel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
  .yaml-input-panel{gap:8px}
  .yaml-input-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-shrink:0;min-height:32px}
  .yaml-input-toolbar :global(.dbx-btn){display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-height:28px;padding:0}
  .yaml-input-toolbar .yaml-format-button{width:auto;padding:0 10px;margin-right:auto}
  .yaml-result-panel>[role="alert"]{flex:1;min-height:0;margin:40px 0 0;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);overflow:auto;white-space:pre-wrap}
  .regex-reference-page{max-width:1180px;gap:18px;padding:18px 28px 40px}
  .reference-count{display:flex;align-items:baseline;gap:6px;white-space:nowrap;color:var(--color-muted-foreground);font-size:12px}
  .reference-count strong{font-size:18px;line-height:1;color:var(--color-foreground)}
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
  @container (max-width: 560px){.regex-reference-page{padding:16px 12px 28px}.reference-count{margin-left:auto}.regex-reference-toolbar{padding:9px}.reference-grid{grid-template-columns:1fr}}
  @container (min-width: 760px){
    .developer-workspace:not(.ipv4-range-page){display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);align-content:start}
    .developer-workspace:not(.ipv4-range-page)>.expansion-actions,.developer-workspace:not(.ipv4-range-page)>[role="alert"]{grid-column:1/-1}
    .developer-workspace:not(.ipv4-range-page)>.result-panel{grid-column:2;grid-row:1 / span 4;min-height:320px}
  }
  @container (max-width: 759px){.developer-workspace>.result-panel{min-height:220px}}
  .diff-result{min-height:0;overflow:auto;padding:10px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}
  .diff-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;padding:8px 0;border-top:1px solid var(--color-border)}.diff-row:first-child{border-top:0}.diff-row>div{grid-column:1/-1;display:flex;gap:8px;align-items:center}.diff-row strong{font:600 10px var(--font-sans);text-transform:uppercase;color:var(--color-info)}.diff-row.added strong{color:var(--color-success)}.diff-row.removed strong{color:var(--color-destructive)}.diff-row code{min-width:0;overflow-wrap:anywhere;color:var(--color-muted-foreground)}.diff-row pre{margin:0;min-width:0;overflow:auto;padding:7px;border-radius:var(--radius-sm);background:var(--color-muted);font:11px/1.45 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere}
</style>
