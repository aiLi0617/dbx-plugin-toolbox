<script>
  import { pick, localizeError } from "./i18n.js";
  import { boundedText, jsonStructureDiff } from "./developerExpansion.js";
  import { parseLosslessJson, stringifyLosslessJson } from "./jsonPrecision.js";
  import JsonCodeEditor from "./JsonCodeEditor.svelte";
  import CopyButton from "./CopyButton.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let left = $state("");
  let right = $state("");
  let errors = $state(["", ""]);
  let result = $state(null);
  let filter = $state("all");
  let appliedDemoRequest = 0;
  const current = $derived(result && result.left === left && result.right === right);
  const rows = $derived(current ? result.rows : []);
  const visible = $derived(rows.filter((row) => filter === "all" || row.type === filter));
  const labels = $derived({ all: t("全部", "All"), modified: t("修改", "Modified"), added: t("新增", "Added"), removed: t("删除", "Removed") });
  const output = $derived(current ? JSON.stringify(rows, null, 2) : "");

  function parse(text, side) {
    try {
      if (!text.trim()) throw new Error(t("请输入 JSON", "Enter JSON"));
      return { value: JSON.parse(boundedText(text)) };
    } catch (error) {
      errors[side] = localizeError(locale, error);
      return null;
    }
  }
  function compare() {
    errors = ["", ""];
    result = null;
    const a = parse(left, 0);
    const b = parse(right, 1);
    if (!a || !b) return;
    try {
      result = { left, right, rows: jsonStructureDiff(left, right) };
      filter = "all";
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
  }
  function swap() {
    [left, right] = [right, left];
    errors = ["", ""];
    if (result) compare();
  }
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    left = JSON.stringify({ name: "DBX", version: 1, features: ["JSON", "YAML"], debug: true }, null, 2);
    right = JSON.stringify({ name: "DBX", version: 2, features: ["JSON", "YAML", "XML"], active: true }, null, 2);
    compare();
  });
</script>

<div class="json-diff-workspace">
  <div class="workspace-toolbar">
    <p>{t("按字段比较 JSON，忽略对象键的顺序；数组按索引比较。", "Compare JSON by field, ignoring object key order; arrays are compared by index.")}</p>
    <div class="actions">
      <button class="dbx-btn" onclick={swap} disabled={!left && !right}>{t("交换左右", "Swap sides")}</button>
      <button class="dbx-btn dbx-btn--ghost" data-replaces-content onclick={clear} disabled={!left && !right}>{t("清空", "Clear")}</button>
      <button class="dbx-btn dbx-btn--primary" onclick={compare} disabled={!left.trim() || !right.trim()}>{t("开始对比", "Compare")}</button>
    </div>
  </div>

  <div class="editors">
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
        <div class="empty" role="status"><span class="empty-symbol" aria-hidden="true">&#123; &#125;</span><strong>{result ? t("输入已更新，请重新对比", "Input changed. Compare again.") : t("等待对比", "Ready to compare")}</strong><p>{t("在上方输入两份 JSON，点击「开始对比」查看字段差异。", "Enter two JSON documents above and select Compare to see field differences.")}</p></div>
      {:else if !rows.length}
        <div class="empty success" role="status"><span class="empty-symbol" aria-hidden="true">✓</span><strong>{t("两份 JSON 内容一致", "The JSON documents are equal")}</strong><p>{t("未发现字段差异，对象键的顺序不影响结果。", "No field differences found. Object key order does not affect the result.")}</p></div>
      {:else if !visible.length}
        <div class="empty" role="status"><strong>{t("此分类下没有差异", "No differences in this category")}</strong></div>
      {:else}
        {#each visible as change}
          <article class="change" class:added={change.type === "added"} class:removed={change.type === "removed"}>
            <div class="change-heading"><span class="badge">{labels[change.type]}</span><code>{change.path}</code></div>
            <div class="values">
              <div class="before"><span class="value-label">{t("原始值", "Original value")}</span><pre class:missing={change.type === "added"}>{change.type === "added" ? t("不存在", "Absent") : JSON.stringify(change.before, null, 2)}</pre></div>
              <div class="after"><span class="value-label">{t("对比值", "Updated value")}</span><pre class:missing={change.type === "removed"}>{change.type === "removed" ? t("不存在", "Absent") : JSON.stringify(change.after, null, 2)}</pre></div>
            </div>
          </article>
        {/each}
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
  .workspace-toolbar .dbx-btn--primary{color:var(--color-primary-foreground)}
  .editors{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;flex-shrink:0}
  .editor-panel,.results{min-width:0;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}
  .panel-heading,.result-heading{min-height:48px;padding:8px 12px;border-bottom:1px solid var(--color-border)}
  h2{display:flex;align-items:center;gap:8px;margin:0;font-size:13px;font-weight:600}
  .side-marker,.total{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:4px;background:var(--color-muted);color:var(--color-muted-foreground);font:600 11px var(--font-mono)}
  .editor-body{display:flex;height:clamp(230px,34vh,430px);min-height:0;padding:1px}
  .editor-body :global(.json-code-editor){border:0;border-radius:0}
  .error{margin:0;padding:10px 12px;border-top:1px solid var(--color-border);color:var(--color-destructive);font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}
  .results{flex-shrink:0;overflow:hidden}.result-content{padding:12px}
  .filters{display:flex;gap:4px;flex-wrap:wrap}.filters button{display:flex;gap:6px;align-items:center;border:0;background:transparent;color:var(--color-muted-foreground);border-radius:4px;padding:6px 8px;font-size:12px;cursor:pointer}.filters button:hover{background:var(--color-muted)}.filters button.active{background:color-mix(in srgb,var(--color-primary) 12%,transparent);color:var(--color-primary)}
  .filters button:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
  .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:150px;padding:20px;text-align:center;color:var(--color-muted-foreground);font-size:13px}.empty p{margin:0;font-size:12px;line-height:1.6}.empty-symbol{font:24px var(--font-mono);opacity:.7}.success strong,.success .empty-symbol{color:var(--color-success)}
  .change{--change-color:var(--color-info);border:1px solid var(--color-border);border-left:3px solid var(--change-color);border-radius:var(--radius-md);overflow:hidden}.change+.change{margin-top:10px}.change.added{--change-color:var(--color-success)}.change.removed{--change-color:var(--color-destructive)}
  .change-heading{display:flex;align-items:center;gap:10px;padding:10px 12px;background:color-mix(in srgb,var(--change-color) 5%,transparent)}.badge{flex-shrink:0;font-size:11px;font-weight:600;color:var(--change-color)}.change-heading code{font:12px var(--font-mono);overflow-wrap:anywhere;min-width:0}
  .values{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.values>div{min-width:0;padding:10px 12px}.before{border-right:1px solid var(--color-border);background:color-mix(in srgb,var(--color-destructive) 4%,transparent)}.after{background:color-mix(in srgb,var(--color-success) 4%,transparent)}.value-label{font-size:10px;color:var(--color-muted-foreground)}pre{margin:6px 0 0;font:12px/1.6 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere;max-height:280px;overflow:auto}.missing{color:var(--color-muted-foreground);font-style:italic}
  @container (max-width:680px){.editors{grid-template-columns:minmax(0,1fr)}.values{grid-template-columns:minmax(0,1fr)}.before{border-right:0;border-bottom:1px solid var(--color-border)}.workspace-toolbar>.actions{margin-left:0}.editor-body{height:240px}}
</style>

