<script>
  import { CATEGORY_ORDER, searchTools } from "./catalog.js";
  import { categories, pick } from "./i18n.js";
  let { locale = "zh-CN", tools = [], favorites = [], category = "all", onCategory, onTool, onToggleFavorite } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let query = $state("");
  const favoriteSet = $derived(new Set(favorites));
  const filtered = $derived(searchTools(query, locale, tools).filter((item) => category === "all" || item.category === category));
</script>

<div class="catalog-page">
  <div class="catalog-top">
    <p>{t("搜索、筛选并将高频工具加入常用。", "Search, filter, and favorite the tools you use most.")}</p>
    <div class="catalog-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input bind:value={query} name="toolbox-catalog-query" autocomplete="off" placeholder={t("搜索名称、功能或关键字", "Search names, features, or keywords")} />{#if query}<button type="button" onclick={() => (query = "")}>×</button>{/if}</div>
  </div>
  <div class="filters" role="group" aria-label={t("工具分类", "Tool categories")}>
    <button class:active={category === "all"} aria-pressed={category === "all"} onclick={() => onCategory?.("all")} type="button">{t("全部", "All")} <small>{tools.length}</small></button>
    {#each CATEGORY_ORDER as id}<button class:active={category === id} aria-pressed={category === id} onclick={() => onCategory?.(id)} type="button">{pick(locale,categories[id].zh,categories[id].en)} <small>{tools.filter((item) => item.category === id).length}</small></button>{/each}
  </div>
  <div class="result-head"><span>{t(`${filtered.length} 个工具`, `${filtered.length} tools`)}</span></div>
  <div class="catalog-grid">
    {#each filtered as item (item.id)}
      <article class="catalog-card">
        <button class="open" type="button" onclick={() => onTool?.(item, query)}><strong>{pick(locale,item.name.zh,item.name.en)}</strong><span>{pick(locale,item.summary.zh,item.summary.en)}</span><small>{pick(locale,categories[item.category].zh,categories[item.category].en)}</small></button>
        <button class="star" class:active={favoriteSet.has(item.id)} type="button" onclick={() => onToggleFavorite?.(item.id)} aria-label={favoriteSet.has(item.id) ? t("从常用移除", "Remove favorite") : t("添加到常用", "Add favorite")} title={favoriteSet.has(item.id) ? t("从常用移除", "Remove favorite") : t("添加到常用", "Add favorite")}>{favoriteSet.has(item.id) ? "★" : "☆"}</button>
      </article>
    {:else}<div class="empty">{t("没有匹配的工具。", "No matching tools.")}</div>{/each}
  </div>
</div>

<style>
  .catalog-page{width:min(1120px,100%);margin:0 auto;padding:26px;display:flex;flex-direction:column;gap:14px}p{margin:0}.catalog-top>p{color:var(--color-muted-foreground);font-size:12px}.catalog-top{display:flex;align-items:center;justify-content:space-between;gap:20px}.catalog-search{display:flex;align-items:center;gap:8px;width:min(420px,48%);height:34px;padding:0 9px;border:1px solid var(--color-input);border-radius:7px;background:var(--color-background)}.catalog-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit}.catalog-search button{border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.filters{display:flex;flex-wrap:wrap;gap:6px;padding:5px 0}.filters button{height:29px;padding:0 10px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-background);font-size:11px}.filters button.active{border-color:var(--dbx-selection-border);background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.filters small{margin-left:3px;opacity:.7}.result-head{color:var(--color-muted-foreground);font-size:11px}.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.catalog-card{display:grid;grid-template-columns:minmax(0,1fr) 34px;min-height:92px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.catalog-card:hover{border-color:color-mix(in srgb,var(--color-primary) 45%,var(--color-border))}.open{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:13px;border:0;background:transparent;text-align:left}.open strong{font-size:13px}.open span{width:100%;overflow:hidden;color:var(--color-muted-foreground);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.open small{color:var(--color-primary);font-size:10px}.star{height:34px;margin:8px 5px 0 0;border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.star.active{color:var(--color-warning)}.empty{grid-column:1/-1;padding:40px;border:1px dashed var(--color-border);border-radius:9px;color:var(--color-muted-foreground);text-align:center;font-size:12px}@media(max-width:700px){.catalog-page{padding:16px}.catalog-top{align-items:stretch;flex-direction:column}.catalog-search{width:100%}.catalog-grid{grid-template-columns:1fr}}
</style>
