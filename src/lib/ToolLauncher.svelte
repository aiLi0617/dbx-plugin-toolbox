<script>
  import { onMount } from "svelte";
  import { searchTools } from "./catalog.js";
  import { categories, pick } from "./i18n.js";
  import { toolOptionsForQuery } from "./navigation.js";

  let { locale = "zh-CN", tools = [], favorites = [], recents = [], onClose, onTool } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let query = $state("");
  let selected = $state(0);
  let inputEl = $state(null);
  let dialogEl = $state(null);
  const defaultTools = $derived.by(() => {
    const seen = new Set();
    return [...favorites, ...recents, ...tools].filter((item) => !seen.has(item.id) && seen.add(item.id)).slice(0, 14);
  });
  const results = $derived(query.trim() ? searchTools(query, locale, tools).slice(0, 30) : defaultTools);

  $effect(() => { query; selected = 0; });
  onMount(() => {
    const previous = document.activeElement;
    inputEl?.focus();
    return () => { if (previous?.isConnected && previous.getClientRects().length) previous.focus(); };
  });
  $effect(() => {
    const index = selected;
    dialogEl?.querySelectorAll('[role="option"]')[index]?.scrollIntoView({ block: "nearest" });
  });
  function destination(item) {
    return Object.values(toolOptionsForQuery(item.id, query)).join(" → ");
  }
  function moveSelection(delta) {
    selected = Math.max(0, Math.min(results.length - 1, selected + delta));
    if (document.activeElement !== inputEl) dialogEl?.querySelectorAll('[role="option"]')[selected]?.focus();
  }

  function choose(item) { if (item) onTool?.(item, query); }
  function onKeydown(event) {
    if (event.key === "Escape") { event.preventDefault(); onClose?.(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(1); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(-1); return; }
    if (event.key === "Enter") { event.preventDefault(); choose(results[selected]); return; }
    if (event.key === "Tab") {
      const focusable = [...dialogEl.querySelectorAll('input,button:not([disabled])')];
      if (!focusable.length) return;
      const at = focusable.indexOf(document.activeElement);
      const next = event.shiftKey ? (at <= 0 ? focusable.length - 1 : at - 1) : (at >= focusable.length - 1 ? 0 : at + 1);
      event.preventDefault(); focusable[next].focus();
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
  <div class="launcher-dialog" bind:this={dialogEl} role="dialog" aria-modal="true" aria-label={t("搜索工具", "Search tools")} tabindex="-1" onkeydown={onKeydown}>
    <div class="search-row">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
      <input bind:this={inputEl} bind:value={query} name="toolbox-launcher-query" autocomplete="off" aria-label={t("搜索工具", "Search tools")} aria-controls="tool-launcher-results" aria-activedescendant={results.length ? `tool-result-${selected}` : undefined} placeholder={t("搜索名称、功能或关键字…", "Search names, features, or keywords…")} />
      <kbd>Esc</kbd>
    </div>
    <div class="results" role="listbox" id="tool-launcher-results" aria-label={t("工具搜索结果", "Tool search results")}>
      <div class="result-label">{query.trim() ? t("搜索结果", "Results") : t("常用与最近", "Favorites and recent")}</div>
      {#each results as item, index (item.id)}
        <button id={`tool-result-${index}`} class:selected={index === selected} type="button" role="option" aria-selected={index === selected} onfocus={() => (selected = index)} onmouseenter={() => (selected = index)} onclick={() => choose(item)}>
          <span><strong>{pick(locale,item.name.zh,item.name.en)}{#if destination(item)} · {destination(item)}{/if}</strong><small>{pick(locale,item.summary.zh,item.summary.en)}</small></span>
          <em>{pick(locale,categories[item.category].zh,categories[item.category].en)}</em>
        </button>
      {:else}<p class="empty">{t("没有匹配的工具", "No matching tools")}</p>{/each}
    </div>
    <footer><span>↑↓ {t("选择", "Select")}</span><span>Enter {t("打开", "Open")}</span><span>Esc {t("关闭", "Close")}</span></footer>
  </div>
</div>

<style>
  .backdrop{position:fixed;z-index:100;inset:0;display:flex;align-items:flex-start;justify-content:center;padding-top:min(14vh,120px);background:rgba(0,0,0,.34);backdrop-filter:blur(2px)}.launcher-dialog{width:min(620px,calc(100vw - 32px));overflow:hidden;border:1px solid var(--color-border);border-radius:12px;background:var(--color-popover,var(--color-background));box-shadow:0 24px 70px rgba(0,0,0,.28)}.search-row{display:flex;align-items:center;gap:10px;height:52px;padding:0 14px;border-bottom:1px solid var(--color-border)}.search-row svg{color:var(--color-muted-foreground)}input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit;font-size:14px}kbd{padding:2px 6px;border:1px solid var(--color-border);border-radius:4px;color:var(--color-muted-foreground);font-size:10px}.results{max-height:min(55vh,440px);overflow:auto;padding:7px}.result-label{padding:5px 8px;color:var(--color-muted-foreground);font-size:10px;font-weight:600;text-transform:uppercase}.results button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:7px 9px;border:0;border-radius:7px;background:transparent;text-align:left}.results button.selected{background:var(--color-accent,var(--color-muted))}.results button>span{display:flex;min-width:0;flex-direction:column;gap:3px}.results strong{font-size:13px}.results small{overflow:hidden;color:var(--color-muted-foreground);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.results em{flex:0 0 auto;color:var(--color-muted-foreground);font-size:10px;font-style:normal}.empty{padding:30px;color:var(--color-muted-foreground);text-align:center;font-size:12px}footer{display:flex;gap:16px;padding:8px 14px;border-top:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:10px}
</style>
