<script>
  import SearchObjectFilter from "./SearchObjectFilter.svelte";
  import { matchesObject } from "./searchObjects.js";
  let searchObject = $state("all");
  import { CATEGORY_ORDER, searchToolMatches } from "./catalog.js";
  import { buildCatalogSections } from "./catalogGroups.js";
  import { categories, chrome, pick } from "./i18n.js";
  import ClipTip from "./ClipTip.svelte";
  import { supportLabel } from "./cryptoCapabilities.js";
  let { locale = "zh-CN", tools = [], favorites = [], category = "all", onCategory, onTool, onToggleFavorite } = $props();
  const t = (dict) => pick(locale, dict);
  let query = $state("");
  const favoriteSet = $derived(new Set(favorites));
  const matches = $derived(searchToolMatches(query, locale, tools).filter((match) => (category === "all" || match.tool.category === category) && matchesObject(match.tool, searchObject)));
  const filtered = $derived(matches.map((match) => match.tool));
  const matchById = $derived(new Map(matches.map((match) => [match.tool.id, match])));
  const sections = $derived(buildCatalogSections(filtered, category, query));
  const showCategoryMeta = $derived(Boolean(query.trim()));
  function destination(item) {
    return matchById.get(item.id)?.matchLabel || "";
  }
</script>

{#snippet toolCard(item, showCategory = false)}
  <article class="catalog-card">
    <button class="open" type="button" onclick={() => onTool?.(item, query)}>
      <strong>{pick(locale,item.name)}</strong>
      <span class="summary"><ClipTip text={pick(locale,item.summary)} /></span>
      {#if destination(item) || showCategory || item.supportLevel}
        <small class:match-reason={Boolean(destination(item))}>{#if destination(item)}{destination(item)}{:else if showCategory}{pick(locale,categories[item.category])}{/if}{#if !destination(item) && showCategory && item.supportLevel} · {/if}{#if !destination(item) && item.supportLevel}{supportLabel(item.supportLevel, locale)}{/if}</small>
      {/if}
    </button>
    <button class="star" class:active={favoriteSet.has(item.id)} type="button" onclick={() => onToggleFavorite?.(item.id)} aria-label={favoriteSet.has(item.id) ? t(chrome.removeFavorite) : t(chrome.addFavorite)} title={favoriteSet.has(item.id) ? t(chrome.removeFavorite) : t(chrome.addFavorite)}>{favoriteSet.has(item.id) ? "★" : "☆"}</button>
  </article>
{/snippet}

<div class="catalog-page">
  <div class="catalog-top">
    <p>{t(chrome.catalogHint)}</p>
    <div class="catalog-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input bind:value={query} name="toolbox-catalog-query" autocomplete="off" placeholder={t(chrome.searchPlaceholderShort)} />{#if query}<button type="button" onclick={() => (query = "")}>×</button>{/if}</div>
  </div>
  <div class="filters" role="group" aria-label={t(chrome.categoriesNav)}>
    <button class:active={category === "all"} aria-pressed={category === "all"} onclick={() => onCategory?.("all")} type="button">{t(chrome.all)} <small>{tools.length}</small></button>
    {#each CATEGORY_ORDER as id}<button class:active={category === id} aria-pressed={category === id} onclick={() => onCategory?.(id)} type="button">{pick(locale,categories[id])} <small>{tools.filter((item) => item.category === id).length}</small></button>{/each}
  </div>
  {#if query.trim()}<SearchObjectFilter {locale} value={searchObject} onChange={value => searchObject = value}/>{/if}
  <div class="result-head"><span>{t(chrome.toolCount(filtered.length))}</span></div>
  {#if sections?.length}
    <div class="catalog-sections" class:category-sections={category === "all"}>
      {#each sections as section (section.id)}
        <section class="catalog-section" class:category-section={section.kind === "category"}>
          <div class="section-head">
            <h3>
              {#if section.kind === "category"}
                <button type="button" onclick={() => onCategory?.(section.category)}>{pick(locale, section.name)} <span aria-hidden="true">→</span></button>
              {:else}
                {pick(locale, section.name)}
              {/if}
            </h3>
            <span>{section.tools.length}</span>
          </div>
          <div class="catalog-grid">{#each section.tools as item (item.id)}{@render toolCard(item)}{/each}</div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="catalog-grid">
      {#each filtered as item (item.id)}{@render toolCard(item, showCategoryMeta)}
      {:else}<div class="empty"><p>{t(chrome.emptyDot)} · {category === 'all' ? t(chrome.all) : pick(locale, categories[category])}</p><button class="dbx-btn" type="button" onclick={() => { onCategory?.('all'); searchObject = 'all'; }}>{pick(locale, '清除筛选', 'Clear filters')}</button><button class="dbx-btn" type="button" onclick={() => { query = 'JSON → CSV'; onCategory?.('all'); searchObject = 'all'; }}>{pick(locale, '试试 JSON → CSV', 'Try JSON → CSV')}</button><button class="dbx-btn" type="button" onclick={() => { query = ''; onCategory?.('all'); searchObject = 'all'; }}>{t(chrome.allTools)}</button></div>{/each}
    </div>
  {/if}
</div>

<style>
  /* Override the legacy global card rule so ClipTip can extend beyond the card. */
  .catalog-page{width:min(1120px,100%);margin:0 auto;padding:26px;display:flex;flex-direction:column;gap:14px}p{margin:0}.catalog-top>p{color:var(--color-muted-foreground);font-size:12px}.catalog-top{display:flex;align-items:center;justify-content:space-between;gap:20px}.catalog-search{display:flex;align-items:center;gap:8px;width:min(420px,48%);height:34px;padding:0 9px;border:1px solid var(--color-input);border-radius:7px;background:var(--color-background)}.catalog-search input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:inherit}.catalog-search button{border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.filters{display:flex;flex-wrap:wrap;gap:6px;padding:5px 0}.filters button{height:29px;padding:0 10px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-background);font-size:11px}.filters button.active{border-color:var(--dbx-selection-border);background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}.filters small{margin-left:3px;opacity:.7}.result-head{color:var(--color-muted-foreground);font-size:11px}.catalog-sections{display:flex;flex-direction:column;gap:22px}.catalog-sections.category-sections{gap:26px}.catalog-section{display:flex;flex-direction:column;gap:9px}.section-head{display:flex;align-items:center;gap:8px;min-height:22px;border-bottom:1px solid var(--color-border)}.section-head h3{margin:0 0 -1px;padding:0 0 7px;border-bottom:2px solid var(--color-primary);font-size:12px}.category-section .section-head h3{font-size:14px}.section-head>span{margin:0 0 7px;color:var(--color-muted-foreground);font-size:10px}.section-head h3 button{display:inline-flex;align-items:center;gap:6px;margin:-4px 0;padding:4px 0;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}.section-head h3 button span{color:var(--color-muted-foreground);font-size:12px;transition:transform .15s ease}.section-head h3 button:hover,.section-head h3 button:focus-visible{color:var(--color-primary)}.section-head h3 button:hover span,.section-head h3 button:focus-visible span{transform:translateX(2px);color:var(--color-primary)}.section-head h3 button:focus-visible{border-radius:3px;outline:1px solid var(--color-ring,var(--color-primary));outline-offset:-2px}.catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px}.catalog-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 34px;min-height:92px;overflow:visible;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.catalog-card:hover,.catalog-card:focus-within{z-index:2;border-color:color-mix(in srgb,var(--color-primary) 45%,var(--color-border))}.open{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0;padding:13px;border:0;background:transparent;text-align:left}.open strong{font-size:13px}.open .summary{width:100%;min-width:0;color:var(--color-muted-foreground);font-size:11px}.open small{color:var(--color-muted-foreground);font-size:10px}.open small.match-reason{color:var(--color-primary)}.star{height:34px;margin:8px 5px 0 0;border:0;background:transparent;color:var(--color-muted-foreground);font-size:18px}.star.active{color:var(--color-warning)}.empty{grid-column:1/-1;padding:40px;border:1px dashed var(--color-border);border-radius:9px;color:var(--color-muted-foreground);text-align:center;font-size:12px}@media(max-width:700px){.catalog-page{padding:16px}.catalog-top{align-items:stretch;flex-direction:column}.catalog-search{width:100%}.catalog-grid{grid-template-columns:1fr}}
  .open strong { max-width:100%; overflow-wrap:anywhere; line-height:1.45; }
</style>
