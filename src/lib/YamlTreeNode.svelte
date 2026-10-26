<script>
  import YamlTreeNode from "./YamlTreeNode.svelte";
  let { node, collapsed = {}, toggle, locale = "zh-CN", root = false } = $props();
  const isContainer = $derived(node.children?.length > 0);
  const folded = $derived(Boolean(collapsed[node.path]));
  const display = (value) => value === null ? "null" : String(value);
  const nodeLabel = $derived(node.key === null ? "" : (Array.isArray(node.key) ? `[${node.key}]` : node.key));
</script>

<div class="yaml-node">
  {#if !root || !isContainer}
    <div class="yaml-line">
      {#if isContainer}
        <button class="yaml-twist" class:folded type="button" aria-expanded={!folded} aria-label={folded ? "Expand" : "Collapse"} onclick={() => toggle(node.path)}><span></span></button>
      {:else}<span class="yaml-twist-spacer"></span>{/if}
      <code class="yaml-key">{nodeLabel}</code>
      {#if isContainer}<span class="yaml-size">{node.size}</span>{:else}<span class="yaml-value">{display(node.value)}</span>{/if}
    </div>
  {/if}
  {#if isContainer && !folded}
    <div class:yaml-children={!root} class:yaml-root-children={root}>
      {#each node.children as child (child.path)}<YamlTreeNode node={child} {collapsed} {toggle} {locale} />{/each}
    </div>
  {/if}
</div>

<style>
  .yaml-line{display:flex;align-items:center;gap:5px;min-height:26px;padding:2px 4px;border-radius:var(--radius-sm);overflow-wrap:anywhere}.yaml-line:hover{background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}
  .yaml-twist,.yaml-twist-spacer{display:inline-flex;align-items:center;justify-content:center;flex:0 0 20px;width:20px;height:20px}.yaml-twist{border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--color-muted-foreground);cursor:pointer}.yaml-twist:hover{border-color:var(--color-border);background:var(--dbx-hover-background)}.yaml-twist span{width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent currentColor;transform:rotate(90deg);transition:transform 120ms}.yaml-twist.folded span{transform:rotate(0deg)}
  .yaml-key{color:var(--color-warning);word-break:break-word}.yaml-value{min-width:0;word-break:break-word;color:var(--color-foreground)}.yaml-size{color:var(--color-muted-foreground);font:11px var(--font-sans)}.yaml-children{margin-left:13px;padding-left:12px;border-left:1px solid color-mix(in srgb,var(--color-border) 80%,transparent)}.yaml-root-children{padding:0}
</style>
