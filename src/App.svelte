<script>
  import { onMount } from "svelte";
  import { CATEGORY_ORDER, DEFAULT_ENABLED_IDS, tools, toolsByCategory, toolsByIds } from "./lib/catalog.js";
  import { chrome, pick } from "./lib/i18n.js";
  import { applyTheme, invoke, locale as hostLocale, ready } from "./lib/host.js";
  import {
    DEFAULT_VAULT_AUTO_LOCK_MINUTES,
    getFavoriteToolIds,
    getVaultAutoLockMinutes,
    sanitizeVaultAutoLockMinutes,
    setFavoriteToolIds,
    setVaultAutoLockMinutes,
  } from "./lib/prefs.js";
  import { moveToolId, pushRecent, recentWithoutFavorites, sanitizeToolIds, toolOptionsForQuery } from "./lib/navigation.js";
  import { EPHEMERAL_TOOL_IDS, FILL_VIEWS, VIEW_LOADERS } from "./lib/viewRegistry.js";
  import { loadVaultKeys } from "./lib/keySource.js";
  import ToolboxSidebar from "./lib/ToolboxSidebar.svelte";
  import ToolboxHome from "./lib/ToolboxHome.svelte";
  import ToolCatalog from "./lib/ToolCatalog.svelte";
  import ToolLauncher from "./lib/ToolLauncher.svelte";
  import VaultView from "./lib/VaultView.svelte";

  const RECENT_KEY = "toolbox.recentToolIds";
  const SIDEBAR_KEY = "toolbox.sidebarCollapsed";
  const MAX_SESSION_VIEWS = 8;

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
  let savingPrefs = $state(false);
  let prefsError = $state("");
  let vaultUnlocked = $state(false);
  let vaultAutoLockMinutes = $state(DEFAULT_VAULT_AUTO_LOCK_MINUTES);
  let loadedViews = $state({});
  let viewLoadErrors = $state({});
  const pendingViewLoads = new Map();
  let persistSeq = 0;
  let autoLockPersistSeq = 0;
  let vaultLockTimer;
  let vaultLastActivityAt = 0;

  const favoriteSet = $derived(new Set(favoriteIds));
  const favoriteTools = $derived(toolsByIds(favoriteIds));
  const recentTools = $derived(toolsByIds(recentWithoutFavorites(recentIds, favoriteIds, 8)));
  const launcherRecentTools = $derived(toolsByIds(recentIds));
  const grouped = toolsByCategory(tools);
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, grouped[id].length]));
  const tool = $derived(tools.find((item) => item.id === activeToolId) || null);
  const sessionTools = $derived(toolsByIds(sessionToolIds));
  const fillPane = $derived(page === "vault" || (page === "tool" && FILL_VIEWS.has(tool?.view)));
  const title = $derived.by(() => {
    if (page === "home") return pick(locale, "首页", "Home");
    if (page === "catalog") return pick(locale, chrome.allTools.zh, chrome.allTools.en);
    if (page === "vault") return pick(locale, chrome.vault.zh, chrome.vault.en);
    return tool ? pick(locale, tool.name.zh, tool.name.en) : pick(locale, "首页", "Home");
  });

  onMount(() => {
    let disposed = false;
    let offInit;
    try { recentIds = sanitizeToolIds(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"), 10); } catch { recentIds = []; }
    // DBX's sandboxed iframe may deny access to browser storage.
    try { sidebarCollapsed = localStorage.getItem(SIDEBAR_KEY) === "true"; } catch { sidebarCollapsed = false; }
    const onEnv = () => { locale = hostLocale(); applyTheme(); };
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
      onEnv();
      [favoriteIds, vaultAutoLockMinutes] = await Promise.all([
        getFavoriteToolIds(),
        getVaultAutoLockMinutes(),
      ]);
      if (disposed) return;
      await refreshKeys();
      window.addEventListener("dbx-plugin-env", onEnv);
      offInit = typeof window.dbxPlugin?.onInit === "function" ? window.dbxPlugin.onInit(onEnv) : undefined;
    };
    void initialize();
    return () => {
      disposed = true;
      window.removeEventListener("dbx-plugin-env", onEnv);
      window.removeEventListener("keydown", onShortcut);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("toolbox-vault-change", onVaultChange);
      clearVaultLockTimer();
      if (typeof offInit === "function") offInit();
    };
  });

  function persistRecent(next) {
    recentIds = sanitizeToolIds(next, 10);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds)); } catch { /* ignore */ }
  }
  function setCollapsed(next) {
    sidebarCollapsed = next;
    try { localStorage.setItem(SIDEBAR_KEY, String(next)); } catch { /* ignore */ }
  }
  function closeOverlays() { window.dispatchEvent(new Event("toolbox-close-overlays")); }
  function openLauncher() { closeOverlays(); launcherOpen = true; }
  function openHome() { closeOverlays(); page = "home"; launcherOpen = false; }
  function openCatalog(category = "all") { closeOverlays(); catalogCategory = category; page = "catalog"; launcherOpen = false; }
  function openTool(item, query = "") {
    if (!item) return;
    closeOverlays();
    void ensureViewLoaded(item.view);
    activeToolId = sanitizeToolIds([item.id])[0] || item.id;
    const options = toolOptionsForQuery(activeToolId, query);
    if (Object.keys(options).length || !toolOptions[activeToolId]) toolOptions[activeToolId] = options;
    if (!EPHEMERAL_TOOL_IDS.has(activeToolId)) {
      // Keep a bounded working set. Tool views can own workers, timers, and
      // large editor buffers, so a long session must not retain every view.
      sessionToolIds = [...sessionToolIds.filter((id) => id !== activeToolId), activeToolId].slice(-MAX_SESSION_VIEWS);
    }
    page = "tool"; launcherOpen = false;
    persistRecent(pushRecent(recentIds, item.id, 10));
  }
  function openVault() { closeOverlays(); page = "vault"; launcherOpen = false; }

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
        viewLoadErrors = { ...viewLoadErrors, [view]: error?.message || String(error) };
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
      if (seq === persistSeq) { favoriteIds = previous; prefsError = err?.message || String(err); }
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
        prefsError = err?.message || String(err);
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
  {#if ActiveView}
    {#if item.view === "live-io"}<ActiveView {locale} toolId={item.id} />
    {:else if item.view === "aes" || item.view === "rsa" || item.view === "xor"}<ActiveView {locale} kind={item.view} {initialOptions} />
    {:else if item.view === "keypair" || item.view === "symmetric-key"}<ActiveView {locale} onVaultChange={refreshKeys} />
    {:else if item.view === "whitespace"}<ActiveView {locale} initialAction={initialOptions.action || "trim"} />
    {:else}<ActiveView {locale} {initialOptions} />{/if}
  {:else if viewLoadErrors[item.view]}
    <div class="view-load-state" role="alert">
      <span>{pick(locale, "工具加载失败", "Failed to load tool")}: {viewLoadErrors[item.view]}</span>
      <button class="dbx-btn" type="button" onclick={() => ensureViewLoaded(item.view)}>{pick(locale, "重试", "Retry")}</button>
    </div>
  {:else}
    <div class="view-load-state" role="status">{pick(locale, "正在加载工具…", "Loading tool…")}</div>
  {/if}
{/snippet}

<div class="app" class:sidebar-collapsed={sidebarCollapsed}>
  <ToolboxSidebar {locale} collapsed={sidebarCollapsed} {page} {activeToolId} favorites={favoriteTools} recents={recentTools} {vaultUnlocked}
    onHome={openHome} onCatalog={() => openCatalog("all")} onSearch={openLauncher} onTool={openTool} onVault={openVault}
    onToggleCollapse={() => setCollapsed(!sidebarCollapsed)} onMoveFavorite={moveFavorite} />
  <section class="main">
    <div class="toolbar">
      <h2>{title}</h2>
      <div class="toolbar-end">
        {#if page === "tool" && tool}
          <button class="dbx-btn dbx-btn--ghost icon-btn favorite-action" class:active={favoriteSet.has(tool.id)} disabled={savingPrefs} onclick={() => toggleFavorite(tool.id)} type="button" aria-label={favoriteSet.has(tool.id) ? pick(locale,"从常用移除","Remove favorite") : pick(locale,"添加到常用","Add favorite")} title={favoriteSet.has(tool.id) ? pick(locale,"从常用移除","Remove favorite") : pick(locale,"添加到常用","Add favorite")}>{favoriteSet.has(tool.id) ? "★" : "☆"}</button>
        {/if}
      </div>
    </div>
    {#if prefsError}<div class="banner app-banner">{prefsError}</div>{/if}
    <div class="pane" class:pane-fill={fillPane} class:shell-page={page === "home" || page === "catalog"}>
      {#if page === "home"}
        <ToolboxHome {locale} {tools} favorites={favoriteTools} recents={recentTools} {categoryCounts} onCatalog={openCatalog} onTool={openTool} onToggleFavorite={toggleFavorite} onMoveFavorite={moveFavorite} />
      {:else if page === "catalog"}
        <ToolCatalog {locale} {tools} favorites={favoriteIds} category={catalogCategory} onCategory={(id) => (catalogCategory = id)} onTool={openTool} onToggleFavorite={toggleFavorite} />
      {:else if page === "vault"}
        <VaultView {locale} autoLockMinutes={vaultAutoLockMinutes} onAutoLockChange={updateVaultAutoLockMinutes} onKeysChange={refreshKeys} />
      {:else if tool && EPHEMERAL_TOOL_IDS.has(tool.id)}
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
  .tool-session { min-width: 0; }
  .tool-session.fill { display: flex; flex: 1; min-height: 0; flex-direction: column; }
  .tool-session[hidden] { display: none; }
  .view-load-state { display: flex; align-items: center; gap: 10px; color: var(--color-muted-foreground); }
</style>
