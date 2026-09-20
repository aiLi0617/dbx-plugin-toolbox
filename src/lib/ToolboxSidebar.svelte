<script>
  import { pick } from "./i18n.js";

  let {
    locale = "zh-CN", collapsed = false, page = "home", activeToolId = "",
    favorites = [], recents = [], vaultUnlocked = false,
    onHome, onCatalog, onSearch, onTool, onVault, onToggleCollapse, onMoveFavorite,
  } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let panel = $state("");
  let pointerDrag = $state(null);
  let suppressOpen = $state(false);
  let sidebarEl = $state(null);
  const draggingTool = $derived(pointerDrag ? favorites.find((item) => item.id === pointerDrag.sourceId) : null);

  $effect(() => {
    if (!panel) return;
    const close = (event) => { if (sidebarEl && !sidebarEl.contains(event.target)) panel = ""; };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  });

  function openPanel(name) { panel = panel === name ? "" : name; }
  function pointerDown(event, item) {
    if (event.button !== 0) return;
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
    if (!pointerDrag.active && distance < 5) return;
    if (!pointerDrag.active) event.currentTarget.setPointerCapture?.(event.pointerId);
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-favorite-id]");
    const rect = hit?.getBoundingClientRect();
    pointerDrag = {
      ...pointerDrag,
      active: true,
      x: event.clientX - pointerDrag.offsetX,
      y: event.clientY - pointerDrag.offsetY,
      targetId: hit?.dataset.favoriteId || pointerDrag.targetId,
      after: rect ? event.clientY > rect.top + rect.height / 2 : pointerDrag.after,
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
  function openTool(event, item) {
    if (suppressOpen) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onTool?.(item);
  }
  function keyMove(event, item) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const at = favorites.findIndex((entry) => entry.id === item.id);
    const target = favorites[at + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    onMoveFavorite?.(item.id, target.id, event.key === "ArrowDown");
  }
</script>

<aside class="sidebar" class:collapsed bind:this={sidebarEl}>
  <div class="brand-row">
    {#if !collapsed}<strong>{t("工具箱", "Toolbox")}</strong>{/if}
    <button class="icon" type="button" onclick={onToggleCollapse} aria-label={collapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")} title={collapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d={collapsed ? "m9 18 6-6-6-6" : "m15 18-6-6 6-6"}/></svg>
    </button>
  </div>

  <nav class="primary" aria-label={t("主导航", "Primary navigation")}>
    <button class:active={page === "home"} onclick={onHome} type="button" title={t("首页", "Home")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 9-8 9 8v10h-6v-6H9v6H3z"/></svg><span>{t("首页", "Home")}</span>
    </button>
    <button onclick={onSearch} type="button" title={`${t("搜索工具", "Search tools")} (Ctrl+K)`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><span>{t("搜索工具", "Search tools")}</span>{#if !collapsed}<kbd>Ctrl K</kbd>{/if}
    </button>
    <button class:active={page === "catalog"} onclick={onCatalog} type="button" title={t("全部工具", "All tools")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg><span>{t("全部工具", "All tools")}</span>
    </button>
  </nav>

  {#if collapsed}
    <div class="rail-groups">
      <button class="icon" class:active={panel === "favorites"} onclick={() => openPanel("favorites")} type="button" title={t("常用工具", "Favorites")} aria-label={t("常用工具", "Favorites")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 2.5 3 6.1 6.7 1-4.9 4.7 1.2 6.7-6-3.2-6 3.2 1.2-6.7-4.9-4.7 6.7-1z"/></svg>
      </button>
      <button class="icon" class:active={panel === "recent"} onclick={() => openPanel("recent")} type="button" title={t("最近使用", "Recent")} aria-label={t("最近使用", "Recent")}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
      </button>
    </div>
    {#if panel}
      <div class="flyout">
        <strong>{panel === "favorites" ? t("常用工具", "Favorites") : t("最近使用", "Recent")}</strong>
        {#each panel === "favorites" ? favorites : recents as item (item.id)}
          <button type="button" onclick={() => { panel = ""; onTool?.(item); }}>{pick(locale, item.name)}</button>
        {:else}<p>{t("暂无工具", "No tools yet")}</p>{/each}
      </div>
    {/if}
  {:else}
    <section class="group favorites">
      <div class="group-title"><span>{t("常用工具", "Favorites")}</span><small>{favorites.length}</small></div>
      <div class="group-list">
        {#each favorites as item (item.id)}
          <div
            class="tool-row"
            class:dragging={pointerDrag?.active && pointerDrag.sourceId === item.id}
            class:drop-target={pointerDrag?.active && pointerDrag.targetId === item.id && pointerDrag.sourceId !== item.id}
            role="listitem"
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
              aria-label={t(`调整 ${pick(locale, item.name)} 顺序`, `Reorder ${pick(locale, item.name)}`)}
              title={t("拖动整行或使用上下方向键排序", "Drag the row or use Up/Down to reorder")}
            >⠿</button>
            <button class="tool" class:active={page === "tool" && activeToolId === item.id} type="button" onclick={(event) => openTool(event, item)}>{pick(locale, item.name)}</button>
          </div>
        {:else}<p class="empty">{t("在工具库中点击星标添加", "Star tools in the library")}</p>{/each}
      </div>
    </section>
    <section class="group recent">
      <div class="group-title"><span>{t("最近使用", "Recent")}</span></div>
      <div class="group-list">
        {#each recents.slice(0, 8) as item (item.id)}
          <button class="recent-tool" class:active={page === "tool" && activeToolId === item.id} type="button" onclick={() => onTool?.(item)}>{pick(locale, item.name)}</button>
        {:else}<p class="empty">{t("打开工具后会显示在这里", "Opened tools appear here")}</p>{/each}
      </div>
    </section>
  {/if}

  <div class="sidebar-bottom">
    <button class:active={page === "vault"} onclick={onVault} type="button" title={vaultUnlocked ? t("密钥库已解锁", "Vault unlocked") : t("密钥库", "Vault")}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="18" height="11" rx="2"/><path d={vaultUnlocked ? "M7 10V7a5 5 0 0 1 9.9-1" : "M7 10V7a5 5 0 0 1 10 0v3"}/></svg><span>{t("密钥库", "Vault")}</span>
    </button>
  </div>
</aside>

{#if pointerDrag?.active && draggingTool}
  <div
    class="row-ghost"
    style:left={`${pointerDrag.x}px`}
    style:top={`${pointerDrag.y}px`}
    style:width={`${pointerDrag.width}px`}
    style:height={`${pointerDrag.height}px`}
    aria-hidden="true"
  ><span>⠿</span><strong>{pick(locale, draggingTool.name)}</strong></div>
{/if}

<style>
  .sidebar { position: relative; display:flex; flex-direction:column; min-width:0; min-height:0; overflow:visible; background:var(--color-sidebar,var(--color-background)); color:var(--color-sidebar-foreground,var(--color-foreground)); border-right:1px solid var(--color-sidebar-border,var(--color-border)); }
  .brand-row { height:48px; flex:0 0 48px; display:flex; align-items:center; justify-content:space-between; padding:0 10px 0 14px; border-bottom:1px solid var(--color-sidebar-border,var(--color-border)); }
  .brand-row strong { font-size:14px; }
  button { font:inherit; color:inherit; cursor:pointer; }
  .icon { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; padding:0; border:0; border-radius:6px; background:transparent; }
  .icon:hover,.icon.active { background:var(--color-sidebar-accent,var(--color-muted)); }
  .primary { padding:8px; display:flex; flex-direction:column; gap:2px; border-bottom:1px solid var(--color-sidebar-border,var(--color-border)); }
  .primary button,.sidebar-bottom button { display:flex; align-items:center; gap:9px; width:100%; height:32px; padding:0 9px; border:0; border-radius:6px; background:transparent; text-align:left; }
  .primary button:hover,.primary button.active,.sidebar-bottom button:hover,.sidebar-bottom button.active { background:var(--color-sidebar-accent,var(--color-muted)); color:var(--color-sidebar-accent-foreground,var(--color-foreground)); }
  .primary svg,.sidebar-bottom svg { flex:0 0 16px; }
  .primary span,.sidebar-bottom span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  kbd { margin-left:auto; color:var(--color-muted-foreground); font-size:10px; }
  .group { min-height:0; padding:9px 8px 6px; }
  .favorites { flex:1 1 0; min-height:96px; overflow:auto; }
  .recent { flex:0 1 auto; max-height:200px; overflow:auto; border-top:1px solid var(--color-sidebar-border,var(--color-border)); }
  .group-title { display:flex; align-items:center; justify-content:space-between; padding:0 8px 5px; color:var(--color-muted-foreground); font-size:11px; font-weight:600; letter-spacing:.04em; }
  .group-title small { font-size:10px; }
  .group-list { display:flex; flex-direction:column; gap:1px; }
  .tool-row { display:flex; min-width:0; border:1px solid transparent; border-radius:6px; cursor:grab; user-select:none; transition:opacity 100ms,border-color 100ms; }
  .tool-row:hover { background:var(--color-sidebar-accent,var(--color-muted)); }
  .tool-row.dragging { opacity:.45; cursor:grabbing; }
  .tool-row.drop-target { border-color:var(--color-primary); background:color-mix(in srgb,var(--color-primary) 9%,transparent); }
  .row-ghost { position:fixed; z-index:120; display:grid; grid-template-columns:24px minmax(0,1fr); align-items:center; pointer-events:none; border:1px solid var(--color-primary); border-radius:6px; background:var(--color-popover,var(--color-background)); box-shadow:0 10px 26px rgba(0,0,0,.2); }
  .row-ghost span { color:var(--color-muted-foreground); text-align:center; }
  .row-ghost strong { overflow:hidden; padding:0 7px; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
  .drag { flex:0 0 24px; width:24px; border:0; background:transparent; color:var(--color-muted-foreground); opacity:.45; }
  .tool-row:hover .drag,.drag:focus-visible { opacity:1; }
  .tool,.recent-tool { min-width:0; flex:1; height:29px; padding:0 7px; overflow:hidden; border:0; border-radius:6px; background:transparent; text-align:left; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
  .tool.active,.recent-tool.active { background:var(--color-sidebar-accent,var(--color-muted)); font-weight:600; }
  .recent-tool:hover { background:var(--color-sidebar-accent,var(--color-muted)); }
  .empty { margin:6px 8px; color:var(--color-muted-foreground); font-size:11px; line-height:1.45; }
  .sidebar-bottom { flex:0 0 auto; padding:7px 8px; border-top:1px solid var(--color-sidebar-border,var(--color-border)); }
  .collapsed .brand-row { justify-content:center; padding:0; }
  .collapsed .primary { align-items:center; }
  .collapsed .primary button,.collapsed .sidebar-bottom button { width:32px; padding:0 8px; }
  .collapsed .primary span,.collapsed .sidebar-bottom span { display:none; }
  .rail-groups { display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 0; }
  .collapsed .sidebar-bottom { display:flex; justify-content:center; padding:7px 0; }
  .flyout { position:absolute; z-index:40; left:52px; top:148px; width:210px; max-height:320px; overflow:auto; padding:8px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-popover,var(--color-background)); box-shadow:0 12px 30px rgba(0,0,0,.16); }
  .flyout strong { display:block; padding:4px 7px 7px; font-size:12px; }
  .flyout button { display:block; width:100%; height:30px; padding:0 7px; overflow:hidden; border:0; border-radius:5px; background:transparent; text-align:left; text-overflow:ellipsis; white-space:nowrap; }
  .flyout button:hover { background:var(--color-muted); }
  .flyout p { padding:4px 7px; color:var(--color-muted-foreground); font-size:11px; }
</style>
