<script>
  import YamlTreeNode from "./YamlTreeNode.svelte";
  import { pick } from "./i18n.js";

  let { trees = [], locale = "zh-CN", class: className = "" } = $props();
  let collapsed = $state({});
  const t = (zh, en) => pick(locale, zh, en);

  function toggle(path) {
    collapsed = { ...collapsed, [path]: !collapsed[path] };
  }
  function collect(node, out) {
    if (node.children?.length) {
      out[node.path] = true;
      node.children.forEach((child) => collect(child, out));
    }
  }
  function collapseAll() {
    const next = {};
    trees.forEach((node) => node.children?.forEach((child) => collect(child, next)));
    collapsed = next;
  }
  function expandAll() {
    collapsed = {};
  }
</script>

<div class="yaml-tree-view {className}">
  <div class="yaml-tree-toolbar">
    <span>{trees.length} {t("个文档", "document(s)")}</span>
    <div>
      <button class="dbx-btn dbx-btn--ghost" type="button" onclick={expandAll} disabled={!trees.length} title={t("展开全部节点", "Expand all nodes")} aria-label={t("展开全部节点", "Expand all nodes")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2"></rect>
          <path d="M12 8v8"></path><path d="M8 12h8"></path>
        </svg>
      </button>
      <button class="dbx-btn dbx-btn--ghost" type="button" onclick={collapseAll} disabled={!trees.length} title={t("折叠全部节点", "Collapse all nodes")} aria-label={t("折叠全部节点", "Collapse all nodes")}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect width="18" height="18" x="3" y="3" rx="2"></rect>
          <path d="M8 12h8"></path>
        </svg>
      </button>
    </div>
  </div>
  <div class="yaml-tree-content">
    {#if !trees.length}
      <p class="yaml-empty">{t("输入 YAML 后显示树形结构。", "Enter YAML to view its tree.")}</p>
    {:else}
      {#each trees as node, index (node.path)}
        <section class="yaml-document">
          <h3>{t("文档", "Document")} {index + 1}</h3>
          <YamlTreeNode {node} root {collapsed} {toggle} {locale} />
        </section>
      {/each}
    {/if}
  </div>
</div>

<style>
  .yaml-tree-view{display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;font-family:var(--font-mono);font-size:13px}
  .yaml-tree-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:32px;flex-shrink:0;color:var(--color-muted-foreground);font:12px var(--font-sans)}
  .yaml-tree-toolbar>div{display:flex;gap:6px;flex-wrap:wrap}.yaml-tree-toolbar .dbx-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;min-height:28px;padding:0}
  .yaml-tree-content{flex:1;min-height:0;overflow:auto;padding:10px 12px 16px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card,var(--color-background))}.yaml-document{padding:0 0 14px}.yaml-document+h3{margin-top:12px}
  .yaml-document h3{margin:0 0 6px;color:var(--color-muted-foreground);font:600 11px var(--font-sans);text-transform:uppercase;letter-spacing:.04em}
  .yaml-empty{margin:0;color:var(--color-muted-foreground);font:12px var(--font-sans)}
</style>
