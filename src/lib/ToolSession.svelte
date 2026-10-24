<script>
  import { onMount, onDestroy } from 'svelte';
  import { saveBlobThroughHost } from "./fileSave.js";
  import { sessionState } from './sessionState.js';
  let { toolId, sensitive = false, beforeReplace, children } = $props();
  let root;
  onMount(() => {
    let replay = false;
    const protectFile = async (event) => {
      if (replay || event.target.type !== 'file' || !event.target.files?.length || sensitive || !sessionState.protected(toolId)) return;
      event.stopImmediatePropagation(); event.stopPropagation();
      const target = event.target;
      if (await beforeReplace(toolId)) {
        replay = true; target.dispatchEvent(new Event('change', { bubbles: true })); replay = false;
      } else target.value = '';
    };
    const protectClear = async event => {
      const button = event.target.closest?.('button[data-replaces-content]');
      if (replay || !button || sensitive || !sessionState.protected(toolId)) return;
      event.stopImmediatePropagation(); event.stopPropagation(); event.preventDefault();
      if (await beforeReplace(toolId)) { replay = true; button.click(); replay = false; }
    };
    root.addEventListener('click', protectClear, true);
    const edit = (event) => {
      if (sensitive || event.target.type === 'search' || event.target.closest('[data-navigation]')) return;
      sessionState.update(toolId, { dirty: true });
      if (!sessionState.get(toolId).canExport && root.querySelector('textarea')) sessionState.update(toolId, {export: async () => {
        const values = [...root.querySelectorAll('textarea')].map(el => el.value).filter(Boolean);
        if (!values.length) return false;
        return saveBlobThroughHost(new Blob([values.join('\n\n')], {type:'text/plain'}), {fileName: toolId + '.txt', binary:true});
      }});
    };
    root.addEventListener('change', protectFile, true);
    root.addEventListener('input', edit);
    return () => { root.removeEventListener('change', protectFile, true); root.removeEventListener('click', protectClear, true); root.removeEventListener('input', edit); };
  });
  onDestroy(() => sessionState.discard(toolId));
</script>
<div class="session-content" bind:this={root}>{@render children()}</div>
<style>.session-content{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}</style>
