<script>
  import { onMount } from "svelte";
  import { CATEGORY_ORDER, DEFAULT_ENABLED_IDS, tools, toolsByCategory, toolsByIds } from "./lib/catalog.js";
  import { chrome, L, localizeError, pick } from "./lib/i18n.js";
  import { applyTheme, context as hostContext, invoke, locale as hostLocale, observeContext, observeEnvironment, ready } from "./lib/host.js";
  import {
    DEFAULT_VAULT_AUTO_LOCK_MINUTES,
    getFavoriteToolIds,
    getWorkspacePreferences,
    getVaultAutoLockMinutes,
    setFavoriteToolIds,
    setRecentToolIds,
    setRecentCollapsed,
    setSettingsPreferences,
    sanitizeRecentToolLimit,
    DEFAULT_RECENT_TOOL_LIMIT,
    setSidebarCollapsed,
  } from "./lib/prefs.js";
  import { moveToolId, navigationTargetFromContext, pushRecent, sanitizeToolIds, toolOptionsForQuery } from "./lib/navigation.js";
  import { createSidebarState } from "./lib/sidebarState.js";
  import { SIMPLE_TOOL_IDS, BACKGROUND_TOOL_IDS, EPHEMERAL_TOOL_IDS, fillsToolPane, VIEW_LOADERS, viewPropsForTool } from "./lib/viewRegistry.js";
  import { loadVaultKeys } from "./lib/keySource.js";
  import ToolboxSidebar from "./lib/ToolboxSidebar.svelte";
  import ToolboxHome from "./lib/ToolboxHome.svelte";
  import ToolCatalog from "./lib/ToolCatalog.svelte";
  import ToolLauncher from "./lib/ToolLauncher.svelte";
  import VaultView from "./lib/VaultView.svelte";
  import { createToolDemo } from "./lib/demoCatalog.js";
  import { hasParameterSupportLevels, supportLabel } from "./lib/cryptoCapabilities.js";
  import { DEFAULT_SHORTCUTS, isEditableTarget, shortcutLabel, shortcutMatches, toolIdFromShortcutAction } from "./lib/shortcuts.js";
  import SettingsDialog from "./lib/SettingsDialog.svelte";
  import ToolSession from "./lib/ToolSession.svelte";
  import SessionConfirm from "./lib/SessionConfirm.svelte";
  import { sessionState, sessionVictim } from "./lib/sessionState.js";
  import { taskManager } from "./lib/taskManager.js";
  import TaskCenter from "./lib/TaskCenter.svelte";

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
  let recentTouched = false;
  let catalogCategory = $state("all");
  let launcherOpen = $state(false);
  let sidebarCollapsed = $state(false);
  let shortcuts = $state({ ...DEFAULT_SHORTCUTS });
  let preferredSidebarCollapsed = $state(false);
  let settingsOpen = $state(false);
  let settingsInitialTab = $state("general");
  let settingsVersion = $state(null);
  let recentToolLimit = $state(DEFAULT_RECENT_TOOL_LIMIT);
  let recentCollapsed = $state(false);
  let recentCollapsedTouched = false;
  const sidebarState = createSidebarState();
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
  let sessionMetadata = $state({});
  let confirmRequest = $state(null);
  let confirmationResolve;
  function askSession(id, ids = null) {
    if (confirmationResolve) return Promise.resolve({ action: 'cancel' });
    confirmRequest = { id, ids, busy: sessionState.get(id).busy, name: id => pick(locale, tools.find(t => t.id === id)?.name || {en:id}), canExport: id => sessionState.get(id).canExport, save: id => sessionState.export(id) };
    return new Promise(resolve => confirmationResolve = resolve);
  }
  function answerSession(answer) { const done = confirmationResolve; confirmationResolve = null; confirmRequest = null; done?.(answer); }
  async function beforeReplace(id) {
    if (!sessionState.protected(id)) return true;
    if (sessionState.get(id).busy) return false;
    return (await askSession(id)).action === 'discard';
  }
  let persistSeq = 0;
  let vaultLockTimer;
  let vaultLastActivityAt = 0;

  const favoriteSet = $derived(new Set(favoriteIds));
  const catalogTools = $derived(tools.filter((item) => item.catalogVisible !== false));
  const favoriteTools = $derived(toolsByIds(favoriteIds));
  const recentTools = $derived(toolsByIds(sanitizeToolIds(recentIds, recentToolLimit)));
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
  const settingsLabel = $derived(pick(locale, chrome.settings));
  const fillPane = $derived(page === "vault" || (page === "tool" && fillsToolPane(tool)));
  const title = $derived.by(() => {
    if (page === "home") return pick(locale, chrome.home);
    if (page === "catalog") return pick(locale, chrome.allTools);
    if (page === "vault") return pick(locale, chrome.vault);
    return tool ? pick(locale, tool.name) : pick(locale, chrome.home);
  });

  onMount(() => {
    const offSessions = sessionState.subscribe(value => sessionMetadata = value);
    const beforeUnload = (event) => { if (Object.keys(sessionMetadata).some(id => sessionState.protected(id))) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    const releaseWorkbench = () => { taskManager.cancelAll(); sessionState.releaseAll(); };
    window.addEventListener("pagehide", releaseWorkbench);
    let disposed = false;
    let offInit;
    let offContext;
    const compactSidebar = window.matchMedia("(max-width: 959px)");
    const onSidebarResize = () => { sidebarCollapsed = sidebarState.resize(compactSidebar.matches); };
    onSidebarResize();
    compactSidebar.addEventListener("change", onSidebarResize);
    const onEnv = (environment) => {
      locale = hostLocale(environment);
      document.documentElement.lang = locale;
      document.title = pick(locale, chrome.pluginName);
      applyTheme();
    };
    const onVaultChange = () => { void refreshKeys(); };
    const lockTotp = () => { void invoke("toolbox/totp/lock").catch(() => {}); };
    window.addEventListener("pagehide", lockTotp);
    window.addEventListener("toolbox-workbench-lock", lockTotp);
    const onActivity = () => recordVaultActivity();
    const onResume = () => { if (!document.hidden) void enforceVaultAutoLock(); };
    const onShortcut = (event) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || settingsOpen) return;
      const action = Object.keys(shortcuts).find((name) => shortcutMatches(event, shortcuts[name]));
      const editorSafe = action === "search" || action === "settings" || action?.startsWith("tool:");
      if (!action || (isEditableTarget(event.target) && !editorSafe)) return;
      event.preventDefault();
      runShortcutAction(action);
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
        getWorkspacePreferences(false),
      ]);
      if (disposed) return;
      favoriteIds = savedFavorites;
      vaultAutoLockMinutes = savedAutoLock;
      recentToolLimit = sanitizeRecentToolLimit(workspacePrefs.recentToolLimit);
      if (recentTouched) {
        recentIds = sanitizeToolIds([...recentIds, ...workspacePrefs.recentToolIds], recentToolLimit);
        void setRecentToolIds(recentIds).catch(() => {});
      } else {
        recentIds = sanitizeToolIds(workspacePrefs.recentToolIds, recentToolLimit);
      }
      if (!recentCollapsedTouched) recentCollapsed = Boolean(workspacePrefs.recentCollapsed);
      sidebarCollapsed = sidebarState.restore(workspacePrefs.sidebarCollapsed);
      preferredSidebarCollapsed = workspacePrefs.sidebarCollapsed;
      shortcuts = workspacePrefs.shortcuts;
      applyWorkbenchContext(hostContext());
      await refreshKeys();
    };
    void initialize();
    return () => {
      offSessions(); window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", releaseWorkbench); releaseWorkbench();
      disposed = true;
      lockTotp();
      window.removeEventListener("pagehide", lockTotp);
      window.removeEventListener("toolbox-workbench-lock", lockTotp);
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
    recentTouched = true;
    recentIds = sanitizeToolIds(next, recentToolLimit);
    void setRecentToolIds(recentIds).catch(() => {});
  }
  function toggleRecentCollapsed(next = !recentCollapsed) {
    recentCollapsedTouched = true;
    recentCollapsed = Boolean(next);
    void setRecentCollapsed(recentCollapsed).catch(() => {});
  }
  function setCollapsed(next) {
    sidebarCollapsed = sidebarState.select(next);
    preferredSidebarCollapsed = next;
    void setSidebarCollapsed(next).catch(() => {});
  }
  function closeOverlays() { mobileSidebarOpen = false; window.dispatchEvent(new Event("toolbox-close-overlays")); }
  function openLauncher() { closeOverlays(); launcherOpen = true; }
  function cycleSession(delta) {
    if (!sessionToolIds.length) return;
    const at = sessionToolIds.indexOf(activeToolId);
    const base = at < 0 ? (delta > 0 ? -1 : 0) : at;
    const nextId = sessionToolIds[(base + delta + sessionToolIds.length) % sessionToolIds.length];
    openTool(tools.find((item) => item.id === nextId));
  }
  function runShortcutAction(action) {
    const directToolId = toolIdFromShortcutAction(action);
    if (directToolId) { openTool(tools.find((item) => item.id === directToolId)); return; }
    if (action === "search") openLauncher();
    else if (action === "home") openHome();
    else if (action === "catalog") openCatalog("all");
    else if (action === "vault") openVault();
    else if (action === "toggleSidebar") setCollapsed(!sidebarCollapsed);
    else if (action === "previousTool") cycleSession(-1);
    else if (action === "nextTool") cycleSession(1);
    else if (action === "closeTool" && page === "tool" && tool) closeSession(tool.id);
    else if (action === "toggleFavorite" && page === "tool" && tool) toggleFavorite(tool.id);
    else if (action === "loadDemo" && page === "tool" && tool?.actions?.includes("demo")) loadDemo();
    else if (action === "settings") { settingsInitialTab = "general"; closeOverlays(); launcherOpen = false; settingsOpen = true; }
  }
  function openHome() { closeOverlays(); page = "home"; launcherOpen = false; }
  function openCatalog(category = "all") { closeOverlays(); catalogCategory = category; page = "catalog"; launcherOpen = false; }
  function selectCatalogCategory(category) { catalogCategory = category; }
  async function openTool(item, query = "", explicitOptions = {}) {
    if (!item) return;
    if (!EPHEMERAL_TOOL_IDS.has(item.id) && !EPHEMERAL_TOOL_IDS.has(item.parentId) && !sessionToolIds.includes(item.id) && !BACKGROUND_TOOL_IDS.has(item.id)) {
      const victim = sessionVictim(sessionToolIds, sessionState, BACKGROUND_TOOL_IDS);
      if (victim === false) {
        const ids = sessionToolIds.filter(id => !BACKGROUND_TOOL_IDS.has(id) && !sessionState.get(id).busy);
        if (!ids.length) return false;
        const answer = await askSession(ids[0], ids);
        if (answer.action !== 'discard') return false;
        sessionToolIds = sessionToolIds.filter(id => id !== answer.id);
      } else if (victim) sessionToolIds = sessionToolIds.filter(id => id !== victim);
    }
    closeOverlays();
    void ensureViewLoaded(item.view);
    activeToolId = sanitizeToolIds([item.id])[0] || item.id;
    const options = { ...(item.defaultOptions || {}), ...toolOptionsForQuery(activeToolId, query), ...explicitOptions };
    if (Object.keys(options).length || !toolOptions[activeToolId]) toolOptions[activeToolId] = options;
    if (!EPHEMERAL_TOOL_IDS.has(activeToolId) && !EPHEMERAL_TOOL_IDS.has(item.parentId)) {
      // Keep a bounded working set. Tool views can own workers, timers, and
      // large editor buffers, so a long session must not retain every view.
      sessionToolIds = [...sessionToolIds.filter(id => id !== activeToolId), activeToolId];
    }
    page = "tool"; launcherOpen = false;
    persistRecent(pushRecent(recentIds, item.id, recentToolLimit));
    return true;
  }
  function applyWorkbenchContext(value) {
    const target = navigationTargetFromContext(value);
    if (!target) return;
    if (target.page === "tool") openTool(tools.find((item) => item.id === target.toolId), "", target.options);
    else if (target.page === "catalog") openCatalog("all");
    else if (target.page === "vault") openVault();
    else openHome();
  }
  async function closeSession(id) {
    if (sessionState.protected(id)) {
      const answer = await askSession(id);
      if (answer.action === "cancel") return;
      if (answer.action === "hide") { openHome(); return; }
      taskManager.cancelTool(id);
    }
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
  async function loadDemo() {
    if (tool && !await beforeReplace(tool.id)) return;
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
      window.dispatchEvent(new CustomEvent("toolbox-vault-change", { detail: { unlocked: false } }));
    } catch {
      await refreshKeys();
    }
  }
  async function applySettings(value, options) {
    const saved = await setSettingsPreferences(value, options);
    shortcuts = saved.shortcuts;
    favoriteIds = saved.favoriteToolIds;
    recentToolLimit = saved.recentToolLimit;
    recentIds = options?.clearRecent ? [] : sanitizeToolIds(recentIds, recentToolLimit);
    recentCollapsed = saved.recentCollapsed;
    recentCollapsedTouched = true;
    sidebarCollapsed = sidebarState.select(saved.sidebarCollapsed);
    preferredSidebarCollapsed = saved.sidebarCollapsed;
    vaultAutoLockMinutes = saved.vaultAutoLockMinutes;
    settingsVersion = saved.version;
    scheduleVaultAutoLock();
    await enforceVaultAutoLock();
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
      if (wasUnlocked) window.dispatchEvent(new CustomEvent("toolbox-vault-change", { detail: { unlocked: false } }));
    }
  }
</script>

{#snippet renderTool(item)}
  {@const ActiveView = loadedViews[item.view]}
  {@const initialOptions = toolOptions[item.id] || {}}
  {@const demo = demoByToolId.get(item.id)}
  {@const shortcut = false}
  {@const activeProps = viewPropsForTool(item, { locale, initialOptions, shortcut, demo, demoRequest: demoRevisions[item.id] || 0, visible: page === "tool" && activeToolId === item.id, onStateChange: value => sessionState.update(item.id, value), onBeforeReplace: () => beforeReplace(item.id), onVaultChange: refreshKeys, onSupportLevelChange: supportLevelReporter(item.id), onOpenTool: (id, options) => openTool(tools.find(tool => tool.id === id), '', options) })}
  {#if ActiveView}
    <ActiveView {...activeProps} />
  {:else if viewLoadErrors[item.view]}
    <div class="view-load-state" role="alert">
      <span>{pick(locale, chrome.toolLoadFailed)}: {viewLoadErrors[item.view]}</span>
      <button class="dbx-btn" type="button" onclick={() => ensureViewLoaded(item.view)}>{pick(locale, chrome.retry)}</button>
    </div>
  {:else}
    <div class="view-load-state" role="status">{pick(locale, chrome.loadingTool)}</div>
  {/if}
{/snippet}

<div class="app" class:sidebar-collapsed={sidebarCollapsed} class:mobile-sidebar-open={mobileSidebarOpen} inert={settingsOpen}>
  {#if mobileSidebarOpen}<button class="sidebar-scrim" type="button" aria-label={pick(locale, chrome.collapseSidebar)} onclick={() => mobileSidebarOpen = false}></button>{/if}
  <ToolboxSidebar {locale} collapsed={sidebarCollapsed && !mobileSidebarOpen} {page} {activeToolId} favorites={favoriteTools} recents={recentTools} {recentCollapsed} {vaultUnlocked} searchShortcut={shortcutLabel(shortcuts.search)}
    onHome={openHome} onCatalog={() => openCatalog("all")} onSearch={openLauncher} onTool={openTool} onVault={openVault}
    onToggleCollapse={() => setCollapsed(!sidebarCollapsed)} onToggleRecentCollapsed={toggleRecentCollapsed} onMoveFavorite={moveFavorite} />
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
        <button class="dbx-btn dbx-btn--ghost icon-btn shortcut-settings-action" type="button" aria-label={settingsLabel} title={`${settingsLabel} (${shortcutLabel(shortcuts.settings)})`} onclick={() => runShortcutAction("settings")}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 3-.5 2a8 8 0 0 0-2 1L4.5 5.5 2.5 9l1.5 1.5a8 8 0 0 0 0 3L2.5 15l2 3.5L6.5 18a8 8 0 0 0 2 1l.5 2h6l.5-2a8 8 0 0 0 2-1l2 .5 2-3.5-1.5-1.5a8 8 0 0 0 0-3L21.5 9l-2-3.5-2 .5a8 8 0 0 0-2-1L15 3Z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>


    {#if prefsError}<div class="banner app-banner">{prefsError}</div>{/if}
    <div class="pane" class:pane-fill={fillPane} class:shell-page={page === "home" || page === "catalog"}>
      {#if page === "home"}
        <ToolboxHome {locale} {tools} favorites={favoriteTools} recents={recentTools} {categoryCounts} onCatalog={openCatalog} onTool={openTool} onToggleFavorite={toggleFavorite} onMoveFavorite={moveFavorite} />
      {:else if page === "catalog"}
        <ToolCatalog {locale} tools={catalogTools} favorites={favoriteIds} category={catalogCategory} onCategory={selectCatalogCategory} onTool={openTool} onToggleFavorite={toggleFavorite} />
      {:else if page === "vault"}
        <VaultView {locale} onKeysChange={refreshKeys} />
      {:else if tool && (EPHEMERAL_TOOL_IDS.has(tool.id) || EPHEMERAL_TOOL_IDS.has(tool.parentId))}
        {#key tool.id}
          {@render renderTool(tool)}
        {/key}
      {/if}
      {#each sessionTools as item (item.id)}
        <div class="tool-session" class:fill={fillsToolPane(item)} hidden={page !== "tool" || activeToolId !== item.id}>
          {#if SIMPLE_TOOL_IDS.has(item.id) || SIMPLE_TOOL_IDS.has(item.parentId)}
            {@render renderTool(item)}
          {:else}
            <ToolSession toolId={item.id} beforeReplace={beforeReplace}>{@render renderTool(item)}</ToolSession>
          {/if}
        </div>
      {/each}
    </div>
  </section>
</div>

{#if launcherOpen}<ToolLauncher {locale} {tools} favorites={favoriteTools} recents={launcherRecentTools} onClose={() => (launcherOpen = false)} onTool={openTool} />{/if}
{#if settingsOpen}<SettingsDialog {locale} initialTab={settingsInitialTab} {shortcuts} tools={catalogTools} favorites={favoriteIds} sidebarCollapsed={preferredSidebarCollapsed} {recentCollapsed} {recentToolLimit} {vaultAutoLockMinutes} preferencesVersion={settingsVersion}
  onClose={() => (settingsOpen = false)} onSave={applySettings}
  onOpenVault={() => { settingsOpen = false; openVault(); }} />{/if}

<TaskCenter {locale} sessions={sessionMetadata} onTool={(id) => openTool(tools.find(item => item.id === id))} />
{#if confirmRequest}<SessionConfirm {locale} request={confirmRequest} onAnswer={answerSession} />{/if}

<style>
  .tool-session:not([hidden]){display:flex;flex-direction:column;min-width:0;min-height:0}

  .tool-session { min-width: 0; min-height: 0; }
  .tool-session.fill { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; overflow: hidden; }
  .tool-session[hidden] { display: none; }
  .view-load-state { display: flex; align-items: center; gap: 10px; color: var(--color-muted-foreground); }
  .support-level{padding:2px 7px;border-radius:999px;background:var(--dbx-selection-background);color:var(--dbx-selection-foreground);font-size:10px}.support-level.compatibility{background:var(--color-warning-bg);color:var(--color-warning)}
</style>
