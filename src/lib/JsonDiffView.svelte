<script>
  import { untrack } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { boundedText, jsonStructureDiff } from "./developerExpansion.js";
  import { parseLosslessJson, stringifyLosslessJson, isLosslessNumber } from "./jsonPrecision.js";
  import JsonCodeEditor from "./JsonCodeEditor.svelte";
  import CopyButton from "./CopyButton.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let left = $state("");
  let right = $state("");
  let errors = $state(["", ""]);
  let result = $state(null);
  let filter = $state("all");
  let focusResults = $state(false);
  let appliedDemoRequest = 0;
  const current = $derived(result && result.left === left && result.right === right);
  const rows = $derived(current ? result.rows : []);
  const visible = $derived(rows.filter((row) => filter === "all" || row.type === filter));
  const labels = $derived({ all: t("全部", "All"), modified: t("修改", "Modified"), added: t("新增", "Added"), removed: t("删除", "Removed") });
  const output = $derived(current ? stringifyLosslessJson(rows, 2) : "");

  function expandable(value) {
    return (value !== null && typeof value === "object" && !isLosslessNumber(value)) || stringifyLosslessJson(value)?.length > 100;
  }
  function preview(value) {
    if (Array.isArray(value)) return `Array · ${value.length}`;
    if (value !== null && typeof value === "object" && !isLosslessNumber(value)) return `Object · ${Object.keys(value).length}`;
    const text = stringifyLosslessJson(value);
    return text.length > 100 ? `${text.slice(0, 100)}…` : text;
  }

  function parse(text, side) {
    try {
      if (!text.trim()) throw new Error(t("请输入 JSON", "Enter JSON"));
      return { value: parseLosslessJson(boundedText(text)) };
    } catch (error) {
      errors[side] = localizeError(locale, error);
      return null;
    }
  }
  function compare() {
    errors = ["", ""];
    result = null;
    if (!left.trim() || !right.trim()) return;
    const a = parse(left, 0);
    const b = parse(right, 1);
    if (!a || !b) return;
    try {
      result = { left, right, rows: jsonStructureDiff(left, right) };
    } catch (error) {
      errors[0] = localizeError(locale, error);
    }
  }
  function format(side) {
    errors[side] = "";
    const parsed = parse(side === 0 ? left : right, side);
    if (!parsed) return;
    const text = stringifyLosslessJson(parseLosslessJson(side === 0 ? left : right), 2);
    if (side === 0) left = text;
    else right = text;
  }
  function clear() {
    left = right = "";
    errors = ["", ""];
    result = null;
    filter = "all";
    focusResults = false;
  }
  function swap() {
    [left, right] = [right, left];
  }
  $effect(() => {
    // Track inputs only; comparison also reads and writes validation state.
    left; right; locale;
    untrack(compare);
  });
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    left = JSON.stringify({ name: "DBX", version: 1, features: ["JSON", "YAML"], debug: true }, null, 2);
    right = JSON.stringify({ name: "DBX", version: 2, features: ["JSON", "YAML", "XML"], active: true }, null, 2);
  });
</script>

<div class="json-diff-workspace">
  <div class="workspace-toolbar">
    <p>{t("按字段比较 JSON，忽略对象键的顺序；数组按索引比较。", "Compare JSON by field, ignoring object key order; arrays are compared by index.")}</p>
    <div class="actions">
      <button class="dbx-btn" onclick={swap} disabled={!left && !right}>{t("交换左右", "Swap sides")}</button>
      <button class="dbx-btn dbx-btn--ghost icon-btn" data-replaces-content onclick={clear} disabled={!left && !right} title={t("清空", "Clear")} aria-label={t("清空", "Clear")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
        </svg>
      </button>
    </div>
  </div>

  <div class="editors" class:concealed={focusResults && current && rows.length > 0}>
    {#each [0, 1] as side}
      <section class="editor-panel" aria-label={side === 0 ? t("原始 JSON", "Original JSON") : t("对比 JSON", "Updated JSON")}>
        <div class="panel-heading">
          <h2><span class="side-marker">{side === 0 ? "A" : "B"}</span>{side === 0 ? t("原始 JSON", "Original JSON") : t("对比 JSON", "Updated JSON")}</h2>
          <div class="actions">
            <button class="dbx-btn dbx-btn--ghost" onclick={() => format(side)} disabled={!(side === 0 ? left : right).trim()}>{t("格式化", "Format")}</button>
            <CopyButton {locale} text={side === 0 ? left : right} />
          </div>
        </div>
        <div class="editor-body">
          {#if side === 0}
            <JsonCodeEditor bind:value={left} {locale} maxLength={1000000} ariaLabel={t("原始 JSON", "Original JSON")} placeholder={'{\n  "name": "DBX",\n  "version": 1\n}'} />
          {:else}
            <JsonCodeEditor bind:value={right} {locale} maxLength={1000000} ariaLabel={t("对比 JSON", "Updated JSON")} placeholder={'{\n  "name": "DBX",\n  "version": 2\n}'} />
          {/if}
        </div>
        {#if errors[side]}<p class="error" role="alert">{errors[side]}</p>{/if}
      </section>
    {/each}
  </div>

  <section class="results" aria-label={t("对比结果", "Comparison results")}>
    <div class="result-heading">
      <h2>{t("对比结果", "Comparison results")}{#if current}<span class="total">{rows.length}</span>{/if}</h2>
      <div class="actions">
        {#if current && rows.length}
          <button class="dbx-btn dbx-btn--ghost" aria-pressed={focusResults} onclick={() => (focusResults = !focusResults)}>{focusResults ? t("显示输入", "Show inputs") : t("展开结果", "Expand results")}</button>
          <div class="filters" role="group" aria-label={t("筛选差异", "Filter differences")}>
            {#each ["all", "modified", "added", "removed"] as type}
              <button class:active={filter === type} aria-pressed={filter === type} onclick={() => (filter = type)}>{labels[type]} <span>{type === "all" ? rows.length : rows.filter((row) => row.type === type).length}</span></button>
            {/each}
          </div>
        {/if}
        <CopyButton {locale} text={output} labelZh="复制对比结果" labelEn="Copy comparison results" />
      </div>
    </div>
    <div class="result-content">
      {#if !current}
        <div class="empty" role="status"><span class="empty-symbol" aria-hidden="true">&#123; &#125;</span><strong>{t("等待对比", "Ready to compare")}</strong><p>{t("在上方输入两份有效 JSON，字段差异将自动更新。", "Enter two valid JSON documents above to update field differences automatically.")}</p></div>
      {:else if !rows.length}
        <div class="empty success" role="status"><span class="empty-symbol" aria-hidden="true">✓</span><strong>{t("两份 JSON 内容一致", "The JSON documents are equal")}</strong><p>{t("未发现字段差异，对象键的顺序不影响结果。", "No field differences found. Object key order does not affect the result.")}</p></div>
      {:else if !visible.length}
        <div class="empty" role="status"><strong>{t("此分类下没有差异", "No differences in this category")}</strong></div>
      {:else}
        <div class="table-scroll">
          <table>
            <colgroup><col class="type-column" /><col class="path-column" /><col /><col /></colgroup>
            <thead><tr><th scope="col">{t("变更", "Change")}</th><th scope="col">{t("字段路径", "Field path")}</th><th scope="col">{t("原始值", "Original value")}</th><th scope="col">{t("对比值", "Updated value")}</th></tr></thead>
            <tbody>
              {#each visible as change (change.path)}
                <tr class="change" class:added={change.type === "added"} class:removed={change.type === "removed"}>
                  <td><span class="badge"><span aria-hidden="true">{change.type === "added" ? "+" : change.type === "removed" ? "−" : "↔"}</span> {labels[change.type]}</span></td>
                  <th scope="row"><div class="path-cell"><code>{change.path}</code><CopyButton {locale} text={change.path} /></div></th>
                  {#each ["before", "after"] as side}
                    {@const missing = side === "before" ? change.type === "added" : change.type === "removed"}
                    <td class:before={side === "before" && !missing} class:after={side === "after" && !missing}>
                      {#if missing}
                        <span class="missing" title={t("不存在", "Absent")} aria-label={t("不存在", "Absent")}>—</span>
                      {:else if expandable(change[side])}
                        <details><summary><code>{preview(change[side])}</code></summary><pre>{stringifyLosslessJson(change[side], 2)}</pre></details>
                      {:else}
                        <code class="scalar">{stringifyLosslessJson(change[side])}</code>
                      {/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </section>
</div>

<style>
  .json-diff-workspace{container-type:inline-size;display:flex;flex-direction:column;gap:16px;width:100%;min-height:0;flex:1;padding:16px 20px;overflow:auto;color:var(--color-foreground)}
  .workspace-toolbar,.panel-heading,.result-heading,.actions{display:flex;align-items:center;gap:8px}
  .workspace-toolbar,.panel-heading,.result-heading{justify-content:space-between;flex-wrap:wrap}
  .workspace-toolbar p{margin:0;color:var(--color-muted-foreground);font-size:12px;line-height:1.6}
  .actions{flex-wrap:wrap}.workspace-toolbar>.actions{margin-left:auto}
  .editors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;flex-shrink:0}
  .editor-panel,.results{min-width:0;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}
  .panel-heading,.result-heading{min-height:48px;padding:8px 12px;border-bottom:1px solid var(--color-border)}
  h2{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:600}
  .side-marker,.total{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:4px;background:var(--color-muted);color:var(--color-muted-foreground);font:600 11px var(--font-mono)}
  .editor-body{display:flex;height:clamp(230px,34vh,430px);min-height:0;padding:1px}
  .editor-body :global(.json-code-editor){border:0;border-radius:0}
  .error{margin:0;padding:10px 12px;border-top:1px solid var(--color-border);color:var(--color-destructive);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
  .results{flex-shrink:0;overflow:hidden}.result-content{padding:0}.editors.concealed{display:none}
  .filters{display:flex;gap:4px;flex-wrap:wrap}.filters button{display:flex;gap:6px;align-items:center;border:0;background:transparent;color:var(--color-muted-foreground);border-radius:4px;padding:6px 8px;font-size:12px;cursor:pointer}.filters button:hover{background:var(--color-muted)}.filters button.active{background:color-mix(in srgb,var(--color-primary) 12%,transparent);color:var(--color-primary)}
  .filters button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
  .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:150px;padding:20px;text-align:center;color:var(--color-muted-foreground);font-size:13px}.empty p{margin:0;font-size:12px;line-height:1.6}.empty-symbol{font:24px var(--font-mono);opacity:.7}.success strong,.success .empty-symbol{color:var(--color-success)}
  .table-scroll{overflow:auto;max-height:65vh}table{width:100%;min-width:580px;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:12px}.type-column{width:96px}.path-column{width:28%}th,td{padding:10px 14px;vertical-align:top;border-bottom:1px solid var(--color-border)}thead th{position:sticky;top:0;z-index:1;background:var(--color-card);color:var(--color-muted-foreground);font-size:11px;font-weight:500}tbody tr:last-child>*{border-bottom:0}tbody th{font-weight:400}tbody tr:hover{background:var(--color-muted)}
  .change{--change-color:var(--color-info)}.change.added{--change-color:var(--color-success)}.change.removed{--change-color:var(--color-destructive)}.badge{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11px;font-weight:600;color:var(--change-color);padding:3px 6px;border-radius:4px;background:color-mix(in srgb,var(--change-color) 9%,transparent)}
  code{font:12px/1.7 var(--font-mono);overflow-wrap:anywhere;white-space:pre-wrap}.path-cell{display:flex;align-items:flex-start;justify-content:space-between;gap:6px;min-width:0}.path-cell code{min-width:0}.path-cell :global(button){flex-shrink:0;opacity:0}.path-cell:hover :global(button),.path-cell:focus-within :global(button){opacity:1}.before .scalar{background:color-mix(in srgb,var(--color-destructive) 8%,transparent)}.after .scalar{background:color-mix(in srgb,var(--color-success) 8%,transparent)}.scalar{padding:2px 4px;border-radius:3px;box-decoration-break:clone}.missing{color:var(--color-muted-foreground)}
  summary{cursor:pointer;color:var(--color-muted-foreground);overflow-wrap:anywhere}summary:hover{color:var(--color-foreground)}summary:focus-visible{outline:2px solid var(--color-primary);outline-offset:3px}pre{margin:10px 0 0;padding:10px;border:1px solid var(--color-border);border-radius:4px;background:var(--color-muted);font:12px/1.6 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}
  @media (hover:none){.path-cell :global(button){opacity:1}}
  @container (max-width:680px){.editors{grid-template-columns:minmax(0,1fr)}.workspace-toolbar>.actions{margin-left:0}.editor-body{height:240px}.type-column{width:84px}.path-column{width:26%}th,td{padding:10px}}
</style>

