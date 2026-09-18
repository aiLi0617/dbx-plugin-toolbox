<script>
  import JsonTreeNode from "./JsonTreeNode.svelte";

  let { value, collapsed = {}, onToggle, onAdd, onDelete, onEdit, onRename, locale = "zh-CN" } = $props();

  let hoverPath = $state(null);

  function onHover(path) {
    hoverPath = path;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="json-tree" onmouseleave={() => onHover(null)}>
  {#if value === undefined}
    <p class="json-tree-empty">{locale.startsWith("zh") ? "输入有效 JSON 后显示树形结构" : "Tree appears when JSON is valid"}</p>
  {:else}
    <JsonTreeNode
      {value}
      path=""
      {collapsed}
      {hoverPath}
      {onToggle}
      {onAdd}
      {onDelete}
      {onEdit}
      {onRename}
      {onHover}
      isLast={true}
      {locale}
    />
  {/if}
</div>

<style>
  .json-tree {
    --json-surface: var(--color-card, var(--color-background, Canvas));
    --json-ink: var(--color-foreground, CanvasText);
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px 12px 16px;
    font-family: var(--font-mono);
    font-size: var(--dbx-editor-font-size, 13px);
    line-height: 1.7;
    background: var(--json-surface);
  }
  .json-tree-empty {
    margin: 24px 8px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
</style>
