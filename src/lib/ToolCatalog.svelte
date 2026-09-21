<script>
  import { CATEGORY_ORDER, searchTools } from "./catalog.js";
  import { categories, chrome, pick } from "./i18n.js";
  import { intentLabelForTool } from "./navigation.js";
  import ClipTip from "./ClipTip.svelte";
  let { locale = "zh-CN", tools = [], favorites = [], category = "all", onCategory, onTool, onToggleFavorite } = $props();
  const t = (dict) => pick(locale, dict);
  let query = $state("");
  const favoriteSet = $derived(new Set(favorites));
  const filtered = $derived(searchTools(query, locale, tools).filter((item) => category === "all" || item.category === category));
  function destination(item) {
    return intentLabelForTool(item.id, query, locale);
  }
</script>

<div class="catalog-page">
  <div class="catalog-top">
    <p>{t(chrome.catalogHint)}</p>
    <div class="catalog-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input bind:value={query} name="toolbox-catalog-query" autocomplete="off" placeholder={t(chrome.searchPlaceholderShort)} />{#if query}<button type="button" onclick={() => (query = "")}>×</button>{/if}</div>
  </div>
  <div class="filters" role="group" aria-label={t(chrome.categoriesNav)}>
    <button class:active={category === "all"} aria-pressed={category === "all"} onclick={() => onCategory?.("all")} type="button">{t(chrome.all)} <small>{tools.length}</small></button>
    {#each CATEGORY_ORDER as id}<button class:active={category === id} aria-pressed={category === id} onclick={() => onCategory?.(id)} type="button">{pick(locale,categories[id])} <small>{tools.filter((item) => item.category === id).length}</small></button>{/each}
  </div>
  <div class="result-head"><span>{t(chrome.toolCount(filtered.length))}</span></div>
  <div class="catalog-grid">
    {#each filtered as item (item.id)}
      <article class="catalog-card">
        <button class="open" type="button" onclick={() => onTool?.(item, query)}>
          <strong>{pick(locale,item.name)}{#if destination(item)} · {destination(item)}{/if}</strong>
          <span class="summary"><ClipTip text={pick(locale,item.summary)} /></span>
          <small>{pick(locale,categories[item.category])}</small>
        </button>
        <button class="star" class:active={favoriteSet.has(item.id)} type="button" onclick={() => onToggleFavorite?.(item.id)} aria-label={favoriteSet.has(item.id) ? t(chrome.removeFavorite) : t(chrome.addFavorite)} title={favoriteSet.has(item.id) ? t(chrome.removeFavorite) : t(chrome.addFavorite)}>{favoriteSet.has(item.id) ? "★" : "☆"}</button>
      </article>
    {:else}<div class="empty">{t(chrome.emptyDot)}</div>{/each}
  </div>
</div>

<style>
  /* Override the legacy global card rule so ClipTip can extend beyond the card. */
  .catalog-page{width:min(1120px,100%);margin:0 auto;padding:26px;display:flex;flex-direction:column;gap:14px}p{margin:0}.catalog-top>p{color:var(--color-muted-foreground);font-size:12px}.catalog-top{display:flex;align-items:center;justify-content:space-between;gap:20px}.catalog-search{display:flex;align-items:center;gap:8px;width:min(420px,48%);height:34px;padding:0 9px;border:1px solid var(--color-input);border-radius:7px;background:var(--color-background)}.catalog-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit}.catalog-search button{border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.filters{display:flex;flex-wrap:wrap;gap:6px;padding:5px 0}.filters button{height:29px;padding:0 10px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-background);font-size:11px}.filters button.active{border-color:var(--dbx-selection-border);background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.filters small{margin-left:3px;opacity:.7}.result-head{color:var(--color-muted-foreground);font-size:11px}.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.catalog-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 34px;min-height:92px;overflow:visible;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.catalog-card:hover,.catalog-card:focus-within{z-index:2;border-color:color-mix(in srgb,var(--color-primary) 45%,var(--color-border))}.open{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:13px;border:0;background:transparent;text-align:left}.open strong{font-size:13px}.open .summary{width:100%;min-width:0;color:var(--color-muted-foreground);font-size:11px}.open small{color:var(--color-primary);font-size:10px}.star{height:34px;margin:8px 5px 0 0;border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.star.active{color:var(--color-warning)}.empty{grid-column:1/-1;padding:40px;border:1px dashed var(--color-border);border-radius:9px;color:var(--color-muted-foreground);text-align:center;font-size:12px}@media(max-width:700px){.catalog-page{padding:16px}.catalog-top{align-items:stretch;flex-direction:column}.catalog-search{width:100%}.catalog-grid{grid-template-columns:1fr}}
</style>
