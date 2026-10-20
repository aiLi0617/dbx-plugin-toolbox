<script>
  import { onMount } from "svelte";
  import { CATEGORY_ORDER, DEFAULT_ENABLED_IDS, tools, toolsByCategory, toolsByIds } from "./lib/catalog.js";
  import { chrome, localizeError, pick } from "./lib/i18n.js";
  import { applyTheme, context as hostContext, invoke, locale as hostLocale, observeContext, observeEnvironment, ready } from "./lib/host.js";
  import {
    DEFAULT_VAULT_AUTO_LOCK_MINUTES,
    getFavoriteToolIds,
    getWorkspacePreferences,
    getVaultAutoLockMinutes,
    sanitizeVaultAutoLockMinutes,
    setFavoriteToolIds,
    setRecentToolIds,
    setSidebarCollapsed,
    setVaultAutoLockMinutes,
  } from "./lib/prefs.js";
  import { moveToolId, navigationTargetFromContext, pushRecent, sanitizeToolIds, toolOptionsForQuery } from "./lib/navigation.js";
  import { EPHEMERAL_TOOL_IDS, FILL_VIEWS, VIEW_LOADERS, viewPropsForTool } from "./lib/viewRegistry.js";
  import { loadVaultKeys } from "./lib/keySource.js";
  import ToolboxSidebar from "./lib/ToolboxSidebar.svelte";
  import ToolboxHome from "./lib/ToolboxHome.svelte";
  import ToolCatalog from "./lib/ToolCatalog.svelte";
  import ToolLauncher from "./lib/ToolLauncher.svelte";
  import VaultView from "./lib/VaultView.svelte";
  import { createToolDemo } from "./lib/demoCatalog.js";
  import { hasParameterSupportLevels, supportLabel } from "./lib/cryptoCapabilities.js";

  // Keep demo payloads referentially stable. Tool views use the payload in an
  // effect keyed by demoRequest; recreating it during normal renders can make
  // that effect restore the sample while the user is editing or clearing it.
  const demoByToolId = new Map(tools.map((item) => [item.id, createToolDemo(item)]));

  let locale = $state("zh-CN");
  let page = $state("home");
  let activeToolId = $state("");
  let sessionToolIds = $state([]);
  let toolOptions = $state({});
  let favoriteIds = $state([...DEFAULT_ENABLED_IDS]);
  let recentIds = $state([]);
  let catalogCategory = $state("all");
  let launcherOpen = $state(false);
  let sidebarCollapsed = $state(false);
  let mobileSidebarOpen = $state(false);
  let savingPrefs = $state(false);
  let prefsError = $state("");
  let vaultUnlocked = $state(false);
  let vaultAutoLockMinutes = $state(DEFAULT_VAULT_AUTO_LOCK_MINUTES);
  let loadedViews = $state({});
  let viewLoadErrors = $state({});
  let demoRevisions = $state({});
  let reportedSupportLevels = $state({});
  const pendingViewLoads = new Map();
  const supportLevelReporters = new Map();
  let persistSeq = 0;
  let autoLockPersistSeq = 0;
  let vaultLockTimer;
  let vaultLastActivityAt = 0;

  const favoriteSet = $derived(new Set(favoriteIds));
  const catalogTools = $derived(tools.filter((item) => item.catalogVisible !== false));
  const favoriteTools = $derived(toolsByIds(favoriteIds));
  const recentTools = $derived(toolsByIds(sanitizeToolIds(recentIds, 8)));
  const launcherRecentTools = $derived(toolsByIds(recentIds));
  const grouped = $derived(toolsByCategory(catalogTools));
  const categoryCounts = $derived(Object.fromEntries(CATEGORY_ORDER.map((id) => [id, grouped[id].length])));
  const tool = $derived(tools.find((item) => item.id === activeToolId) || null);
  const pageSupportLevel = $derived.by(() => {
    if (!tool) return "";
    if (Object.hasOwn(reportedSupportLevels, tool.id)) return reportedSupportLevels[tool.id];
    return tool.supportLevel && !hasParameterSupportLevels(tool.capabilityId) ? tool.supportLevel : "";
  });
  const sessionTools = $derived(toolsByIds(sessionToolIds));
  const fillPane = $derived(page === "vault" || (page === "tool" && FILL_VIEWS.has(tool?.view)));
  const title = $derived.by(() => {
    if (page === "home") return pick(locale, chrome.home);
    if (page === "catalog") return pick(locale, chrome.allTools);
    if (page === "vault") return pick(locale, chrome.vault);
    return tool ? pick(locale, tool.name) : pick(locale, chrome.home);
  });

  onMount(() => {
    let disposed = false;
    let offInit;
    let offContext;
    const compactSidebar = window.matchMedia("(max-width: 959px)");
    const onSidebarResize = () => { if (compactSidebar.matches) sidebarCollapsed = true; };
    sidebarCollapsed = compactSidebar.matches;
    compactSidebar.addEventListener("change", onSidebarResize);
    const onEnv = (environment) => {
      locale = hostLocale(environment);
      document.documentElement.lang = locale;
      document.title = pick(locale, chrome.pluginName);
      applyTheme();
    };
    const onVaultChange = () => { void refreshKeys(); };
    const onActivity = () => recordVaultActivity();
    const onResume = () => { if (!document.hidden) void enforceVaultAutoLock(); };
    const onShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openLauncher(); }
    };
    window.addEventListener("keydown", onShortcut);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("toolbox-vault-change", onVaultChange);
    const initialize = async () => {
      await ready(); if (disposed) return;
      // Subscribe before loading preferences: language/theme changes must not be
      // lost while the sidecar-backed startup work is still in flight.
      offInit = observeEnvironment(onEnv);
      offContext = observeContext(applyWorkbenchContext);
      const [savedFavorites, savedAutoLock, workspacePrefs] = await Promise.all([
        getFavoriteToolIds(),
        getVaultAutoLockMinutes(),
        getWorkspacePreferences(window.innerWidth < 960),
      ]);
      if (disposed) return;
      favoriteIds = savedFavorites;
      vaultAutoLockMinutes = savedAutoLock;
      recentIds = sanitizeToolIds(workspacePrefs.recentToolIds, 10);
      sidebarCollapsed = workspacePrefs.sidebarCollapsed || compactSidebar.matches;
      applyWorkbenchContext(hostContext());
      await refreshKeys();
    };
    void initialize();
    return () => {
      disposed = true;
      compactSidebar.removeEventListener("change", onSidebarResize);
      window.removeEventListener("keydown", onShortcut);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("toolbox-vault-change", onVaultChange);
      clearVaultLockTimer();
      if (typeof offInit === "function") offInit();
      if (typeof offContext === "function") offContext();
    };
  });

  function persistRecent(next) {
    recentIds = sanitizeToolIds(next, 10);
    void setRecentToolIds(recentIds).catch(() => {});
  }
  function setCollapsed(next) {
    sidebarCollapsed = next;
    void setSidebarCollapsed(next).catch(() => {});
  }
  function closeOverlays() { mobileSidebarOpen = false; window.dispatchEvent(new Event("toolbox-close-overlays")); }
  function openLauncher() { closeOverlays(); launcherOpen = true; }
  function openHome() { closeOverlays(); page = "home"; launcherOpen = false; }
  function openCatalog(category = "all") { closeOverlays(); catalogCategory = category; page = "catalog"; launcherOpen = false; }
  function selectCatalogCategory(category) { catalogCategory = category; }
  function openTool(item, query = "", explicitOptions = {}) {
    if (!item) return;
    closeOverlays();
    void ensureViewLoaded(item.view);
    activeToolId = sanitizeToolIds([item.id])[0] || item.id;
    const options = { ...(item.defaultOptions || {}), ...toolOptionsForQuery(activeToolId, query), ...explicitOptions };
    if (Object.keys(options).length || !toolOptions[activeToolId]) toolOptions[activeToolId] = options;
    if (!EPHEMERAL_TOOL_IDS.has(activeToolId) && !EPHEMERAL_TOOL_IDS.has(item.parentId)) {
      // Keep a bounded working set. Tool views can own workers, timers, and
      // large editor buffers, so a long session must not retain every view.
      sessionToolIds = [...sessionToolIds.filter((id) => id !== activeToolId), activeToolId];
    }
    page = "tool"; launcherOpen = false;
    persistRecent(pushRecent(recentIds, item.id, 10));
  }
  function applyWorkbenchContext(value) {
    const target = navigationTargetFromContext(value);
    if (!target) return;
    if (target.page === "tool") openTool(tools.find((item) => item.id === target.toolId), "", target.options);
    else if (target.page === "catalog") openCatalog("all");
    else if (target.page === "vault") openVault();
    else openHome();
  }
  function closeSession(id) {
    const remaining = sessionToolIds.filter((item) => item !== id);
    sessionToolIds = remaining;
    if (page === "tool" && activeToolId === id) {
      const nextId = remaining.at(-1);
      if (nextId) openTool(tools.find((item) => item.id === nextId));
      else openHome();
    }
  }
  function openVault() { closeOverlays(); page = "vault"; launcherOpen = false; }
  function supportLevelReporter(toolId) {
    if (!supportLevelReporters.has(toolId)) {
      supportLevelReporters.set(toolId, (level) => {
        const next = level || "";
        if (reportedSupportLevels[toolId] === next) return;
        reportedSupportLevels = { ...reportedSupportLevels, [toolId]: next };
      });
    }
    return supportLevelReporters.get(toolId);
  }
  function loadDemo() {
    if (!tool) return;
    const demo = demoByToolId.get(tool.id);
    toolOptions[tool.id] = { ...(tool.defaultOptions || {}), ...(demo?.options || {}), demo: true };
    demoRevisions = { ...demoRevisions, [tool.id]: (demoRevisions[tool.id] || 0) + 1 };
  }

  function ensureViewLoaded(view) {
    const loader = VIEW_LOADERS[view];
    if (!loader || loadedViews[view]) return Promise.resolve();
    if (pendingViewLoads.has(view)) return pendingViewLoads.get(view);
    viewLoadErrors = { ...viewLoadErrors, [view]: "" };
    const pending = loader()
      .then((module) => {
        if (typeof module.default !== "function") throw new Error(`Invalid tool view: ${view}`);
        loadedViews = { ...loadedViews, [view]: module.default };
      })
      .catch((error) => {
        viewLoadErrors = { ...viewLoadErrors, [view]: localizeError(locale, error) };
      })
      .finally(() => pendingViewLoads.delete(view));
    pendingViewLoads.set(view, pending);
    return pending;
  }

  async function saveFavorites(next, previous) {
    const seq = ++persistSeq;
    prefsError = ""; savingPrefs = true; favoriteIds = next;
    try {
      const saved = await setFavoriteToolIds(next);
      if (seq === persistSeq) favoriteIds = [...saved];
    } catch (err) {
      if (seq === persistSeq) { favoriteIds = previous; prefsError = localizeError(locale, err); }
    } finally { if (seq === persistSeq) savingPrefs = false; }
  }
  function toggleFavorite(id) {
    if (savingPrefs) return;
    const previous = [...favoriteIds];
    const next = favoriteSet.has(id) ? previous.filter((item) => item !== id) : [...previous, id];
    void saveFavorites(next, previous);
  }
  function moveFavorite(sourceId, targetId, after) {
    if (savingPrefs) return;
    const previous = [...favoriteIds];
    const next = moveToolId(previous, sourceId, targetId, after);
    if (next.join("\0") !== previous.join("\0")) void saveFavorites(next, previous);
  }
  function clearVaultLockTimer() {
    if (vaultLockTimer == null) return;
    window.clearTimeout(vaultLockTimer);
    vaultLockTimer = undefined;
  }
  function scheduleVaultAutoLock() {
    clearVaultLockTimer();
    if (!vaultUnlocked || vaultAutoLockMinutes <= 0 || vaultLastActivityAt <= 0) return;
    const dueAt = vaultLastActivityAt + vaultAutoLockMinutes * 60_000;
    vaultLockTimer = window.setTimeout(
      () => { void enforceVaultAutoLock(); },
      Math.max(0, dueAt - Date.now()),
    );
  }
  function recordVaultActivity() {
    if (!vaultUnlocked) return;
    vaultLastActivityAt = Date.now();
    scheduleVaultAutoLock();
  }
  async function enforceVaultAutoLock() {
    clearVaultLockTimer();
    if (!vaultUnlocked || vaultAutoLockMinutes <= 0 || vaultLastActivityAt <= 0) return;
    const remaining = vaultLastActivityAt + vaultAutoLockMinutes * 60_000 - Date.now();
    if (remaining > 0) {
      scheduleVaultAutoLock();
      return;
    }
    try {
      await invoke("toolbox/keys/lock");
      vaultUnlocked = false;
      vaultLastActivityAt = 0;
      window.dispatchEvent(new Event("toolbox-vault-change"));
    } catch {
      await refreshKeys();
    }
  }
  async function updateVaultAutoLockMinutes(value) {
    const seq = ++autoLockPersistSeq;
    const previous = vaultAutoLockMinutes;
    const next = sanitizeVaultAutoLockMinutes(value);
    vaultAutoLockMinutes = next;
    prefsError = "";
    if (vaultUnlocked) recordVaultActivity();
    else scheduleVaultAutoLock();
    try {
      const saved = await setVaultAutoLockMinutes(next);
      if (seq === autoLockPersistSeq) {
        vaultAutoLockMinutes = saved;
        scheduleVaultAutoLock();
      }
    } catch (err) {
      if (seq === autoLockPersistSeq) {
        vaultAutoLockMinutes = previous;
        scheduleVaultAutoLock();
        prefsError = localizeError(locale, err);
      }
    }
  }
  async function refreshKeys() {
    const wasUnlocked = vaultUnlocked;
    const next = await loadVaultKeys();
    vaultUnlocked = next.unlocked;
    if (vaultUnlocked) {
      if (!wasUnlocked || vaultLastActivityAt <= 0) vaultLastActivityAt = Date.now();
      scheduleVaultAutoLock();
    } else {
      vaultLastActivityAt = 0;
      clearVaultLockTimer();
    }
  }
</script>

{#snippet renderTool(item)}
  {@const ActiveView = loadedViews[item.view]}
  {@const initialOptions = toolOptions[item.id] || {}}
  {@const demo = demoByToolId.get(item.id)}
  {@const shortcut = false}
  {@const activeProps = viewPropsForTool(item, { locale, initialOptions, shortcut, demo, demoRequest: demoRevisions[item.id] || 0, onVaultChange: refreshKeys, onSupportLevelChange: supportLevelReporter(item.id) })}
  {#if ActiveView}
    <ActiveView {...activeProps} />
  {:else if viewLoadErrors[item.view]}
    <div class="view-load-state" role="alert">
      <span>{pick(locale, chrome.toolLoadFailed)}: {viewLoadErrors[item.view]}</span>
      <button class="dbx-btn" type="button" onclick={() => ensureViewLoaded(item.view)}>{pick(locale, chrome.retry)}</button>
    </div>
    {#if sessionTools.length}
      <nav class="session-tabs" aria-label={pick(locale, chrome.openTools)}>
        <button class="session-home" class:active={page === "home"} type="button" onclick={openHome}>{pick(locale, chrome.home)}</button>
        {#each sessionTools as item (item.id)}
          <span class="session-tab" class:active={page === "tool" && activeToolId === item.id}>
            <button type="button" onclick={() => openTool(item)}>{pick(locale, item.name)}</button>
            <button class="session-close" type="button" aria-label={`${pick(locale, chrome.close)} ${pick(locale, item.name)}`} title={pick(locale, chrome.close)} onclick={() => closeSession(item.id)}>×</button>
          </span>
        {/each}
      </nav>
    {/if}
  {:else}
    <div class="view-load-state" role="status">{pick(locale, chrome.loadingTool)}</div>
  {/if}
{/snippet}

<div class="app" class:sidebar-collapsed={sidebarCollapsed} class:mobile-sidebar-open={mobileSidebarOpen}>
  {#if mobileSidebarOpen}<button class="sidebar-scrim" type="button" aria-label={pick(locale, chrome.collapseSidebar)} onclick={() => mobileSidebarOpen = false}></button>{/if}
  <ToolboxSidebar {locale} collapsed={sidebarCollapsed && !mobileSidebarOpen} {page} {activeToolId} favorites={favoriteTools} recents={recentTools} {vaultUnlocked}
    onHome={openHome} onCatalog={() => openCatalog("all")} onSearch={openLauncher} onTool={openTool} onVault={openVault}
    onToggleCollapse={() => setCollapsed(!sidebarCollapsed)} onMoveFavorite={moveFavorite} />
  <section class="main">
    <div class="toolbar">
      <button class="dbx-btn dbx-btn--ghost icon-btn mobile-menu" type="button" aria-label={pick(locale, chrome.expandSidebar)} onclick={() => mobileSidebarOpen = !mobileSidebarOpen}>☰</button>
      <h2>{title}</h2>
      <div class="toolbar-end">
        {#if page === "tool" && tool}
          {#if pageSupportLevel}<span class="support-level" class:compatibility={pageSupportLevel === "compatibility"}>{supportLabel(pageSupportLevel, locale)}</span>{/if}
          {#if tool.actions?.includes("demo")}<button class="dbx-btn" onclick={loadDemo} type="button">{pick(locale, chrome.loadDemo)}</button>{/if}
          <button class="dbx-btn dbx-btn--ghost icon-btn favorite-action" class:active={favoriteSet.has(tool.id)} disabled={savingPrefs} onclick={() => toggleFavorite(tool.id)} type="button" aria-label={pick(locale, favoriteSet.has(tool.id) ? chrome.removeFavorite : chrome.addFavorite)} title={pick(locale, favoriteSet.has(tool.id) ? chrome.removeFavorite : chrome.addFavorite)}>{favoriteSet.has(tool.id) ? "★" : "☆"}</button>
        {/if}
      </div>
    </div>
    {#if prefsError}<div class="banner app-banner">{prefsError}</div>{/if}
    <div class="pane" class:pane-fill={fillPane} class:shell-page={page === "home" || page === "catalog"}>
      {#if page === "home"}
        <ToolboxHome {locale} {tools} favorites={favoriteTools} recents={recentTools} {categoryCounts} onCatalog={openCatalog} onTool={openTool} onToggleFavorite={toggleFavorite} onMoveFavorite={moveFavorite} />
      {:else if page === "catalog"}
        <ToolCatalog {locale} tools={catalogTools} favorites={favoriteIds} category={catalogCategory} onCategory={selectCatalogCategory} onTool={openTool} onToggleFavorite={toggleFavorite} />
      {:else if page === "vault"}
        <VaultView {locale} autoLockMinutes={vaultAutoLockMinutes} onAutoLockChange={updateVaultAutoLockMinutes} onKeysChange={refreshKeys} />
      {:else if tool && (EPHEMERAL_TOOL_IDS.has(tool.id) || EPHEMERAL_TOOL_IDS.has(tool.parentId))}
        {#key tool.id}
          {@render renderTool(tool)}
        {/key}
      {/if}
      {#each sessionTools as item (item.id)}
        <div class="tool-session" class:fill={FILL_VIEWS.has(item.view)} hidden={page !== "tool" || activeToolId !== item.id}>
          {@render renderTool(item)}
        </div>
      {/each}
    </div>
  </section>
</div>

{#if launcherOpen}<ToolLauncher {locale} {tools} favorites={favoriteTools} recents={launcherRecentTools} onClose={() => (launcherOpen = false)} onTool={openTool} />{/if}

<style>
  .tool-session { min-width: 0; min-height: 0; }
  .tool-session.fill { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow: hidden; }
  .tool-session[hidden] { display: none; }
  .view-load-state { display: flex; align-items: center; gap: 10px; color: var(--color-muted-foreground); }
  .support-level{padding:2px 7px;border-radius:999px;background:var(--dbx-selection-background);color:var(--dbx-selection-foreground);font-size:10px}.support-level.compatibility{background:var(--color-warning-bg);color:var(--color-warning)}
  .session-tabs{display:flex;flex:0 0 auto;gap:3px;min-width:0;padding:5px 8px;overflow-x:auto;border-bottom:1px solid var(--color-border);background:var(--color-card)}
  .session-tabs button{height:28px;border:0;background:transparent;color:inherit;font:inherit;white-space:nowrap}
  .session-home,.session-tab{border-radius:6px;color:var(--color-muted-foreground)}
  .session-home{padding:0 9px}.session-home.active,.session-tab.active{background:var(--dbx-selection-background);color:var(--dbx-selection-foreground)}
  .session-tab{display:inline-flex;align-items:center;flex:0 0 auto;padding-left:5px;background:var(--color-muted)}
  .session-tab>button:first-child{max-width:180px;overflow:hidden;text-overflow:ellipsis}
  .session-tab .session-close{width:26px;padding:0;font-size:16px;opacity:.7}.session-tab .session-close:hover{opacity:1}
</style>
