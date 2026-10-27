<script>
  import CopyButton from "./CopyButton.svelte";
  import TreeNode from "./TreeNode.svelte";
  let { node, locale = "zh-CN" } = $props();
</script>

{#if node.children.length}<details>
    <summary><code>{node.path}</code> · {node.value}</summary><CopyButton
      {locale}
      text={node.path}
    />
    <div class="children">
      {#each node.children as child}<TreeNode node={child} {locale} />{/each}
    </div>
  </details>{:else}<div>
    <code>{node.path}</code> : {node.value}<CopyButton
      {locale}
      text={node.path}
    />
  </div>{/if}

<style>
  .children {
    padding-left: 20px;
  }
  details,
  div {
    overflow-wrap: anywhere;
  }
  summary {
    cursor: pointer;
    padding: 6px;
  }
  code {
    font-size: 12px;
  }
</style>
