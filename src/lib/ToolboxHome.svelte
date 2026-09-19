<script>
  import { CATEGORY_ORDER, searchTools } from "./catalog.js";
  import { categories, pick } from "./i18n.js";
  import { toolOptionsForQuery } from "./navigation.js";

  let { locale = "zh-CN", tools = [], favorites = [], recents = [], categoryCounts = {}, onCatalog, onTool, onToggleFavorite, onMoveFavorite } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const FAVORITE_PREVIEW_LIMIT = 12;
  let pointerDrag = $state(null);
  let suppressOpen = $state(false);
  let showAllFavorites = $state(false);
  let searchQuery = $state("");
  let searchActive = $state(false);
  let searchSelected = $state(0);
  let searchInput = $state(null);
  const draggingTool = $derived(pointerDrag ? favorites.find((item) => item.id === pointerDrag.sourceId) : null);
  const visibleFavorites = $derived(showAllFavorites ? favorites : favorites.slice(0, FAVORITE_PREVIEW_LIMIT));
  const defaultSearchTools = $derived.by(() => {
    const seen = new Set();
    return [...favorites, ...recents, ...tools].filter((item) => !seen.has(item.id) && seen.add(item.id)).slice(0, 8);
  });
  const searchResults = $derived(searchQuery.trim() ? searchTools(searchQuery, locale, tools).slice(0, 8) : defaultSearchTools);

  $effect(() => { searchQuery; searchSelected = 0; });

  function searchDestination(item) {
    return Object.values(toolOptionsForQuery(item.id, searchQuery)).join(" → ");
  }
  function chooseSearchResult(item) {
    if (!item) return;
    searchActive = false;
    onTool?.(item, searchQuery);
  }
  function searchKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      searchSelected = Math.min(searchResults.length - 1, searchSelected + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      searchSelected = Math.max(0, searchSelected - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      chooseSearchResult(searchResults[searchSelected]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      searchActive = false;
      searchInput?.blur();
    }
  }
  function searchFocusOut(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) searchActive = false;
  }

  function pointerDown(event, item) {
    if (event.button !== 0 || event.target.closest(".star")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    pointerDrag = {
      pointerId: event.pointerId,
      sourceId: item.id,
      startX: event.clientX,
      startY: event.clientY,
      targetId: item.id,
      after: false,
      active: false,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  }
  function pointerMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) { pointerDrag = null; return; }
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.active && distance < 6) return;
    if (!pointerDrag.active) event.currentTarget.setPointerCapture?.(event.pointerId);
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-favorite-id]");
    const rect = hit?.getBoundingClientRect();
    pointerDrag = {
      ...pointerDrag,
      active: true,
      x: event.clientX - pointerDrag.offsetX,
      y: event.clientY - pointerDrag.offsetY,
      targetId: hit?.dataset.favoriteId || pointerDrag.targetId,
      after: rect ? event.clientX > rect.left + rect.width / 2 : pointerDrag.after,
    };
    document.getSelection()?.removeAllRanges();
    event.preventDefault();
  }
  function pointerEnd(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const current = pointerDrag;
    pointerDrag = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!current.active) return;
    suppressOpen = true;
    if (current.targetId && current.targetId !== current.sourceId) {
      onMoveFavorite?.(current.sourceId, current.targetId, current.after);
    }
    setTimeout(() => (suppressOpen = false), 0);
  }
  function pointerCancel(event) {
    if (pointerDrag?.pointerId === event.pointerId) pointerDrag = null;
  }
  function pointerLeave() { if (pointerDrag && !pointerDrag.active) pointerDrag = null; }
  function openItem(event, item) {
    if (suppressOpen) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onTool?.(item);
  }
  function keyMove(event, item) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const at = favorites.findIndex((entry) => entry.id === item.id);
    const backwards = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const target = favorites[at + (backwards ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    onMoveFavorite?.(item.id, target.id, !backwards);
  }
</script>

<div class="home-page">
  <section class="hero">
    <div><h2>{t("需要使用什么工具？", "What do you need?")}</h2><p>{t("搜索全部工具，或从常用和最近使用中快速打开。", "Search every tool, or jump back into favorites and recent tools.")}</p></div>
    <div class="home-search" onfocusout={searchFocusOut}>
      <div class="home-search-box">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          onfocus={() => (searchActive = true)}
          onkeydown={searchKeydown}
          type="search"
          autocomplete="off"
          role="combobox"
          aria-label={t("搜索工具", "Search tools")}
          aria-autocomplete="list"
          aria-expanded={searchActive}
          aria-controls="home-search-results"
          aria-activedescendant={searchActive && searchResults.length ? `home-search-result-${searchSelected}` : undefined}
          placeholder={t("搜索工具、功能或关键字", "Search tools, features, or keywords")}
        />
        {#if searchQuery}
          <button class="search-clear" type="button" onclick={() => { searchQuery = ""; searchInput?.focus(); }} aria-label={t("清空搜索", "Clear search")}>×</button>
        {:else}
          <kbd>Ctrl K</kbd>
        {/if}
      </div>
      {#if searchActive}
        <div class="home-search-results" id="home-search-results" role="listbox" aria-label={t("工具搜索结果", "Tool search results")}>
          <div class="search-result-label">{searchQuery.trim() ? t("搜索结果", "Results") : t("常用与最近", "Favorites and recent")}</div>
          {#each searchResults as item, index (item.id)}
            <button
              id={`home-search-result-${index}`}
              class:selected={index === searchSelected}
              type="button"
              role="option"
              aria-selected={index === searchSelected}
              onfocus={() => (searchSelected = index)}
              onmouseenter={() => (searchSelected = index)}
              onmousedown={(event) => event.preventDefault()}
              onclick={() => chooseSearchResult(item)}
            >
              <span><strong>{pick(locale, item.name.zh, item.name.en)}{#if searchDestination(item)} · {searchDestination(item)}{/if}</strong><small>{pick(locale, item.summary.zh, item.summary.en)}</small></span>
              <em>{pick(locale, categories[item.category].zh, categories[item.category].en)}</em>
            </button>
          {:else}
            <p class="search-empty">{t("没有匹配的工具", "No matching tools")}</p>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="home-section">
    <div class="section-head">
      <div><h3>{t("常用工具", "Favorites")}</h3><p>{t("拖动卡片调整日常使用顺序", "Drag cards to arrange your workflow")}</p></div>
      <div class="section-actions">
        {#if favorites.length > FAVORITE_PREVIEW_LIMIT}
          <button class="text-btn" type="button" onclick={() => (showAllFavorites = !showAllFavorites)}>
            {showAllFavorites ? t("收起", "Collapse") : t(`展开全部（${favorites.length}）`, `Show all (${favorites.length})`)}
          </button>
        {/if}
        <button class="text-btn" type="button" onclick={() => onCatalog?.("all")}>{t("工具库", "Library")}</button>
      </div>
    </div>
    {#if favorites.length}
      <div class="tool-grid">
        {#each visibleFavorites as item (item.id)}
          <article
            class="tool-card"
            class:dragging={pointerDrag?.active && pointerDrag.sourceId === item.id}
            class:drop-target={pointerDrag?.active && pointerDrag.targetId === item.id && pointerDrag.sourceId !== item.id}
            data-favorite-id={item.id}
            onpointerdown={(event) => pointerDown(event, item)}
            onpointermove={pointerMove}
            onpointerup={pointerEnd}
            onpointercancel={pointerCancel}
            onpointerleave={pointerLeave}
          >
            <button
              class="drag"
              type="button"
              onkeydown={(event) => keyMove(event, item)}
              aria-label={t(`调整 ${item.name.zh} 顺序`, `Reorder ${item.name.en}`)}
              title={t("拖动整张卡片排序，或使用方向键调整", "Drag the card to reorder, or use arrow keys")}
            >⠿</button>
            <button class="card-open" type="button" onclick={(event) => openItem(event, item)}><strong>{pick(locale, item.name.zh, item.name.en)}</strong><span>{pick(locale, item.summary.zh, item.summary.en)}</span></button>
            <button class="star active" type="button" onclick={() => onToggleFavorite?.(item.id)} aria-label={t("从常用移除", "Remove favorite")} title={t("从常用移除", "Remove favorite")}>★</button>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty"><p>{t("还没有常用工具。", "No favorite tools yet.")}</p><button class="dbx-btn dbx-btn--primary" type="button" onclick={() => onCatalog?.("all")}>{t("前往工具库添加", "Add from tool library")}</button></div>
    {/if}
  </section>

  {#if recents.length}
    <section class="home-section">
      <div class="section-head"><div><h3>{t("最近使用", "Recent")}</h3><p>{t("自动记录最近打开的非常用工具", "Recently opened tools not already in favorites")}</p></div></div>
      <div class="recent-grid">
        {#each recents.slice(0, 8) as item (item.id)}
          <button type="button" onclick={() => onTool?.(item)}><strong>{pick(locale, item.name.zh, item.name.en)}</strong><span>{pick(locale, categories[item.category].zh, categories[item.category].en)}</span></button>
        {/each}
      </div>
    </section>
  {/if}

  <section class="home-section categories">
    <div class="section-head"><div><h3>{t("按分类浏览", "Browse by category")}</h3></div></div>
    <div class="category-grid">
      {#each CATEGORY_ORDER as id}
        <button type="button" onclick={() => onCatalog?.(id)}><span>{pick(locale, categories[id].zh, categories[id].en)}</span><small>{categoryCounts[id] || 0}</small></button>
      {/each}
    </div>
  </section>
</div>

{#if pointerDrag?.active && draggingTool}
  <div
    class="drag-ghost"
    style:left={`${pointerDrag.x}px`}
    style:top={`${pointerDrag.y}px`}
    style:width={`${pointerDrag.width}px`}
    style:height={`${pointerDrag.height}px`}
    aria-hidden="true"
  >
    <span class="ghost-handle">⠿</span>
    <span class="ghost-copy"><strong>{pick(locale, draggingTool.name.zh, draggingTool.name.en)}</strong><small>{pick(locale, draggingTool.summary.zh, draggingTool.summary.en)}</small></span>
    <span class="ghost-star">★</span>
  </div>
{/if}

<style>
  .home-page { width:min(1080px,100%); margin:0 auto; padding:28px; display:flex; flex-direction:column; gap:28px; }
  .hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(300px,480px); align-items:end; gap:28px; padding:22px; border:1px solid var(--color-border); border-radius:12px; background:linear-gradient(135deg,color-mix(in srgb,var(--color-primary) 8%,var(--color-card)),var(--color-card)); }
  h2,h3,p { margin:0; } h2 { font-size:20px; } h3 { font-size:14px; } .hero p,.section-head p { margin-top:5px; color:var(--color-muted-foreground); font-size:12px; }
  .home-search { position:relative; min-width:0; }
  .home-search-box { display:flex; align-items:center; gap:9px; height:42px; padding:0 12px; border:1px solid var(--color-input); border-radius:8px; background:var(--color-background); color:var(--color-muted-foreground); }
  .home-search-box:focus-within { border-color:var(--color-ring,var(--color-primary)); box-shadow:0 0 0 2px color-mix(in srgb,var(--color-ring,var(--color-primary)) 22%,transparent); }
  .home-search-box input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--color-foreground); font:inherit; }
  .home-search-box input::placeholder { color:var(--color-muted-foreground); }
  .home-search-box input::-webkit-search-cancel-button { display:none; }
  .home-search-box kbd { flex:0 0 auto; padding:2px 6px; border:1px solid var(--color-border); border-radius:4px; font-size:10px; }
  .search-clear { display:inline-flex; align-items:center; justify-content:center; flex:0 0 24px; width:24px; height:24px; padding:0; border:0; border-radius:5px; background:transparent; color:var(--color-muted-foreground); font-size:18px; line-height:1; }
  .search-clear:hover { background:var(--color-muted); color:var(--color-foreground); }
  .home-search-results { position:absolute; z-index:50; top:calc(100% + 6px); right:0; left:0; max-height:min(52vh,360px); padding:6px; overflow:auto; border:1px solid var(--color-border); border-radius:9px; background:var(--color-popover,var(--color-background)); box-shadow:0 14px 36px rgba(0,0,0,.18); }
  .search-result-label { padding:4px 8px 6px; color:var(--color-muted-foreground); font-size:10px; font-weight:600; }
  .home-search-results button { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:48px; padding:7px 9px; border:0; border-radius:7px; background:transparent; text-align:left; }
  .home-search-results button.selected { background:var(--color-accent,var(--color-muted)); }
  .home-search-results button > span { display:flex; min-width:0; flex-direction:column; gap:3px; }
  .home-search-results strong { font-size:13px; }
  .home-search-results small { overflow:hidden; color:var(--color-muted-foreground); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .home-search-results em { flex:0 0 auto; color:var(--color-muted-foreground); font-size:10px; font-style:normal; }
  .search-empty { padding:24px 10px; color:var(--color-muted-foreground); text-align:center; font-size:12px; }
  .home-section { display:flex; flex-direction:column; gap:11px; }
  .section-head { display:flex; align-items:end; justify-content:space-between; gap:12px; }
  .section-actions { display:flex; align-items:center; gap:12px; }
  .text-btn { border:0; background:transparent; color:var(--color-primary); font-size:12px; }
  .tool-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:9px; }
  .tool-card { position:relative; display:grid; grid-template-columns:24px minmax(0,1fr) 28px; align-items:center; min-height:70px; border:1px solid var(--color-border); border-radius:9px; background:var(--color-card); cursor:grab; user-select:none; transition:opacity 120ms,border-color 120ms,transform 120ms; }
  .tool-card:hover { border-color:color-mix(in srgb,var(--color-primary) 45%,var(--color-border)); }
  .tool-card.dragging { opacity:.5; cursor:grabbing; transform:scale(.985); }
  .tool-card.drop-target { border-color:var(--color-primary); box-shadow:0 0 0 2px color-mix(in srgb,var(--color-primary) 18%,transparent); }
  .drag-ghost { position:fixed; z-index:120; display:grid; grid-template-columns:24px minmax(0,1fr) 28px; align-items:center; pointer-events:none; border:1px solid var(--color-primary); border-radius:9px; background:var(--color-card); box-shadow:0 14px 34px rgba(0,0,0,.22); transform:scale(1.02); }
  .ghost-handle { color:var(--color-muted-foreground); text-align:center; }
  .ghost-copy { display:flex; min-width:0; flex-direction:column; gap:4px; padding:10px 5px; }
  .ghost-copy strong { font-size:13px; }
  .ghost-copy small { overflow:hidden; color:var(--color-muted-foreground); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .ghost-star { color:#d49a00; font-size:16px; text-align:center; }
  .drag,.star { position:relative; z-index:2; height:32px; padding:0; border:0; background:transparent; color:var(--color-muted-foreground); }
  .drag { grid-column:1; cursor:grab; opacity:.45; }.tool-card:hover .drag,.drag:focus-visible{opacity:1}.star{grid-column:3}.star.active{color:#d49a00;font-size:16px}
  .card-open { position:absolute; z-index:1; inset:0; display:flex; flex-direction:column; justify-content:center; gap:4px; min-width:0; padding:11px 36px 11px 30px; border:0; border-radius:inherit; background:transparent; text-align:left; }
  .card-open strong { font-size:13px; }.card-open span { overflow:hidden; color:var(--color-muted-foreground); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
  .recent-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(170px,1fr)); gap:7px; }
  .recent-grid button,.category-grid button { display:flex; align-items:center; justify-content:space-between; gap:8px; height:42px; padding:0 12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-card); text-align:left; }
  .recent-grid button:hover,.category-grid button:hover { background:var(--color-muted); }.recent-grid strong{font-size:12px}.recent-grid span,.category-grid small{color:var(--color-muted-foreground);font-size:10px}
  .category-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:7px; }
  .empty { padding:24px; border:1px dashed var(--color-border); border-radius:9px; text-align:center; }.empty p{margin-bottom:12px;color:var(--color-muted-foreground);font-size:12px}
  @media(max-width:760px){.home-page{padding:16px}.hero{grid-template-columns:1fr}.tool-grid{grid-template-columns:1fr}}
</style>
