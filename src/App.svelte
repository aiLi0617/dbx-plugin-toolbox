<script>
  import { onMount } from "svelte";
  import { CATEGORY_ORDER, DEFAULT_ENABLED_IDS, canonicalToolId, searchTools, tools, toolsByCategory } from "./lib/catalog.js";
  import { categories, chrome, pick } from "./lib/i18n.js";
  import { applyTheme, locale as hostLocale, ready } from "./lib/host.js";
  import { getEnabledToolIds, setEnabledToolIds } from "./lib/prefs.js";
  import { loadVaultKeys } from "./lib/keySource.js";
  import VaultView from "./lib/VaultView.svelte";
  import KeyPairView from "./lib/KeyPairView.svelte";
  import KeyView from "./lib/KeyView.svelte";
  import JsonWorkbench from "./lib/JsonWorkbench.svelte";
  import BaseConvertView from "./lib/BaseConvertView.svelte";
  import TimeConvertView from "./lib/TimeConvertView.svelte";
  import ColorConvertView from "./lib/ColorConvertView.svelte";
  import CronView from "./lib/CronView.svelte";
  import TotpView from "./lib/TotpView.svelte";
  import UniqueIdView from "./lib/UniqueIdView.svelte";
  import PasswordView from "./lib/PasswordView.svelte";
  import HashView from "./lib/HashView.svelte";
  import StatsView from "./lib/StatsView.svelte";
  import UnicodeInspectView from "./lib/UnicodeInspectView.svelte";
  import QrView from "./lib/QrView.svelte";
  import CaseView from "./lib/CaseView.svelte";
  import MarkdownView from "./lib/MarkdownView.svelte";
  import BaseCodecView from "./lib/BaseCodecView.svelte";
  import UrlView from "./lib/UrlView.svelte";
  import EscapeView from "./lib/EscapeView.svelte";
  import PunycodeView from "./lib/PunycodeView.svelte";
  import DataUriView from "./lib/DataUriView.svelte";
  import JwtView from "./lib/JwtView.svelte";
  import CipherView from "./lib/CipherView.svelte";
  import HmacView from "./lib/HmacView.svelte";
  import CertView from "./lib/CertView.svelte";
  import LiveIoView from "./lib/LiveIoView.svelte";
  import JsonPathView from "./lib/JsonPathView.svelte";
  import CodeFormatView from "./lib/CodeFormatView.svelte";
  import LoremView from "./lib/LoremView.svelte";
  import WhitespaceView from "./lib/WhitespaceView.svelte";
  import RegexView from "./lib/RegexView.svelte";
  import DiffView from "./lib/DiffView.svelte";

  const VIEW_MAP = {
    keypair: KeyPairView,
    "symmetric-key": KeyView,
    "json-workbench": JsonWorkbench,
    "base-convert": BaseConvertView,
    "time-convert": TimeConvertView,
    "color-convert": ColorConvertView,
    cron: CronView,
    totp: TotpView,
    "unique-id": UniqueIdView,
    password: PasswordView,
    hash: HashView,
    stats: StatsView,
    "unicode-inspect": UnicodeInspectView,
    qrcode: QrView,
    case: CaseView,
    markdown: MarkdownView,
    base64: BaseCodecView,
    url: UrlView,
    "html-entities": EscapeView,
    punycode: PunycodeView,
    "data-uri": DataUriView,
    jwt: JwtView,
    hmac: HmacView,
    cert: CertView,
    jsonpath: JsonPathView,
    "code-format": CodeFormatView,
    lorem: LoremView,
    whitespace: WhitespaceView,
    regex: RegexView,
    diff: DiffView,
  };

  const FILL_VIEWS = new Set([
    "json-workbench",
    "markdown",
    "url",
    "data-uri",
    "live-io",
    "jwt",
    "aes",
    "xor",
    "rsa",
    "jsonpath",
    "code-format",
    "lorem",
    "whitespace",
    "regex",
    "diff",
    "keypair",
    "symmetric-key",
  ]);

  let locale = $state("zh-CN");
  let query = $state("");
  let category = $state("format");
  let toolId = $state("json");
  let enabledIds = $state([...DEFAULT_ENABLED_IDS]);
  let editIds = $state([...DEFAULT_ENABLED_IDS]);
  let editing = $state(false);
  let savingPrefs = $state(false);
  let prefsError = $state("");
  let persistSeq = 0;
  let vaultOpen = $state(false);
  let vaultUnlocked = $state(false);

  const activeIds = $derived(editing ? editIds : enabledIds);
  const enabledSet = $derived(new Set(activeIds));
  const myTools = $derived(tools.filter((item) => enabledSet.has(item.id)));
  const grouped = $derived(toolsByCategory(myTools));
  const catalogGrouped = $derived(toolsByCategory(tools));
  const visibleCats = $derived(editing ? CATEGORY_ORDER : CATEGORY_ORDER.filter((id) => grouped[id]?.length));
  const visible = $derived(
    query.trim() ? searchTools(query, locale) : ((editing ? catalogGrouped : grouped)[category] || []),
  );
  const tool = $derived(myTools.find((item) => item.id === toolId) || myTools[0] || null);
  const ActiveView = $derived(VIEW_MAP[tool?.view] || null);
  const fillPane = $derived(vaultOpen || FILL_VIEWS.has(tool?.view));

  onMount(async () => {
    await ready();
    locale = hostLocale();
    applyTheme();
    enabledIds = await getEnabledToolIds();
    editIds = [...enabledIds];
    const mine = tools.filter((item) => enabledIds.includes(item.id));
    const lastCat = localStorage.getItem("toolbox.lastCategory");
    const lastTool = canonicalToolId(localStorage.getItem("toolbox.lastTool") || "");
    if (lastTool && mine.some((item) => item.id === lastTool)) {
      const selected = mine.find((item) => item.id === lastTool);
      toolId = selected.id;
      category = selected.category;
    } else if (mine[0]) {
      toolId = mine[0].id;
      category = mine[0].category;
    } else if (lastCat && CATEGORY_ORDER.includes(lastCat)) {
      category = lastCat;
    }
    refreshKeys();
    const onEnv = () => {
      locale = hostLocale();
      applyTheme();
    };
    window.addEventListener("dbx-plugin-env", onEnv);
    const offInit = typeof window.dbxPlugin?.onInit === "function" ? window.dbxPlugin.onInit(onEnv) : undefined;
    return () => {
      window.removeEventListener("dbx-plugin-env", onEnv);
      if (typeof offInit === "function") offInit();
    };
  });

  function labelOf(map) {
    return pick(locale, map.zh, map.en);
  }

  function syncToolToIds(ids) {
    if (ids.includes(toolId)) return;
    const fallback = tools.find((item) => ids.includes(item.id));
    if (fallback) selectTool(fallback);
  }

  function applyIds(next, persist) {
    if (!next.length) {
      prefsError = pick(locale, "至少保留一个工具", "Keep at least one tool");
      return;
    }
    const ids = [...next];
    if (editing) editIds = ids;
    else {
      enabledIds = ids;
      editIds = ids;
    }
    syncToolToIds(ids);
    if (persist) persistEnabled(ids);
  }

  async function persistEnabled(next) {
    if (!next.length) {
      prefsError = pick(locale, "至少保留一个工具", "Keep at least one tool");
      return false;
    }
    const seq = ++persistSeq;
    prefsError = "";
    savingPrefs = true;
    try {
      const saved = await setEnabledToolIds(next);
      if (seq !== persistSeq) return true;
      enabledIds = [...saved];
      if (!editing) editIds = [...saved];
      syncToolToIds(editing ? editIds : enabledIds);
      return true;
    } catch (err) {
      if (seq !== persistSeq) return false;
      prefsError = err?.message || String(err);
      return false;
    } finally {
      if (seq === persistSeq) savingPrefs = false;
    }
  }

  function toggleEnabled(id) {
    const ids = editing ? editIds : enabledIds;
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    applyIds(next, false);
  }

  function restoreDefaults() {
    query = "";
    applyIds([...DEFAULT_ENABLED_IDS], false);
  }

  function startEditing() {
    editIds = [...enabledIds];
    editing = true;
  }

  async function finishEditing() {
    enabledIds = [...editIds];
    editing = false;
    syncToolToIds(enabledIds);
    await persistEnabled([...editIds]);
  }

  function addAndOpen(item) {
    if (!enabledSet.has(item.id)) applyIds([...enabledIds, item.id], true);
    selectTool(item);
  }

  function onToolClick(item) {
    if (editing) {
      toggleEnabled(item.id);
      return;
    }
    if (!enabledSet.has(item.id)) {
      addAndOpen(item);
      return;
    }
    selectTool(item);
  }

  function catCount(id) {
    if (!editing) return grouped[id].length;
    return `${grouped[id]?.length || 0}/${catalogGrouped[id].length}`;
  }

  function filterCategory(id) {
    category = id;
    localStorage.setItem("toolbox.lastCategory", id);
    if (editing || query.trim()) return;
    const list = grouped[id] || [];
    if (!list.some((item) => item.id === toolId) && list[0]) {
      selectTool(list[0]);
    }
  }

  function toggleVault() {
    vaultOpen = !vaultOpen;
  }

  function selectTool(item) {
    vaultOpen = false;
    toolId = item.id;
    category = item.category;
    localStorage.setItem("toolbox.lastCategory", item.category);
    localStorage.setItem("toolbox.lastTool", item.id);
  }

  async function refreshKeys() {
    const next = await loadVaultKeys();
    vaultUnlocked = next.unlocked;
  }

  $effect(() => {
    if (editing) return;
    if (visibleCats.length && !visibleCats.includes(category)) {
      category = visibleCats[0];
    }
  });
</script>

{#snippet toolRow(item)}
  {@const on = enabledSet.has(item.id)}
  <button
    class="tool"
    class:with-summary={Boolean(item.summary)}
    class:active={on && item.id === toolId && !vaultOpen}
    class:off={!on}
    aria-pressed={editing ? on : undefined}
    onclick={() => onToolClick(item)}
    type="button"
  >
    {#if editing}
      <span class="tool-check" class:checked={on} aria-hidden="true"></span>
    {/if}
    <span class="tool-copy">
      <span class="tool-name">{labelOf(item.name)}</span>
      {#if item.summary}<span class="tool-summary">{labelOf(item.summary)}</span>{/if}
    </span>
    {#if !editing && !on}
      <span class="tool-add">{labelOf(chrome.add)}</span>
    {/if}
  </button>
{/snippet}

<div class="app">
  <aside class="sidebar" class:editing>
    <div class="brand">
      {#if editing}
        <div class="brand-edit">
          <button class="dbx-btn" onclick={restoreDefaults} type="button">{labelOf(chrome.restore)}</button>
          <button class="dbx-btn dbx-btn--primary" onclick={finishEditing} type="button">{labelOf(chrome.done)}</button>
        </div>
      {:else}
        <h1>{labelOf({ zh: "工具箱", en: "Toolbox" })}</h1>
      {/if}
    </div>
    <input class="dbx-input search" bind:value={query} placeholder={labelOf(chrome.search)} />
    {#if prefsError}<div class="banner sidebar-banner">{prefsError}</div>{/if}
    {#if !query.trim() && visibleCats.length}
      <div class="cats">
        {#each visibleCats as id}
          <button
            class="cat"
            class:active={id === category}
            aria-current={id === category ? "true" : undefined}
            onclick={() => filterCategory(id)}
            type="button"
          >
            <span class="cat-name">{labelOf(categories[id])}</span>
            <span class="cat-count">{catCount(id)}</span>
          </button>
        {/each}
      </div>
    {/if}
    <nav class="nav">
      {#if query.trim()}
        <p class="dbx-section-title">{labelOf(chrome.results)}</p>
        {#if visible.length === 0}
          <p class="dbx-hint nav-empty">{labelOf(chrome.empty)}</p>
        {:else}
          {#each visible as item}
            {@render toolRow(item)}
          {/each}
        {/if}
      {:else if !editing && myTools.length === 0}
        <p class="dbx-hint nav-empty">{labelOf(chrome.emptyMine)}</p>
        <button class="dbx-btn" onclick={startEditing} type="button">{labelOf(chrome.settings)}</button>
      {:else}
        {#each visible as item}
          {@render toolRow(item)}
        {/each}
      {/if}
    </nav>
  </aside>

  <section class="main">
    <div class="toolbar">
      <h2>{vaultOpen ? labelOf(chrome.vault) : tool ? labelOf(tool.name) : labelOf(chrome.mine)}</h2>
      <div class="toolbar-end">
        <button
          class="dbx-btn dbx-btn--ghost icon-btn"
          class:active={vaultOpen}
          aria-pressed={vaultOpen}
          aria-label={vaultUnlocked ? labelOf(chrome.vaultUnlocked) : labelOf(chrome.vaultLocked)}
          onclick={toggleVault}
          title={vaultUnlocked ? labelOf(chrome.vaultUnlocked) : labelOf(chrome.vaultLocked)}
          type="button"
        >
          {#if vaultUnlocked}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          {/if}
        </button>
        <button
          class="dbx-btn dbx-btn--ghost icon-btn"
          class:active={editing}
          aria-pressed={editing}
          aria-label={editing ? labelOf(chrome.done) : labelOf(chrome.settings)}
          onclick={() => (editing ? finishEditing() : startEditing())}
          title={editing ? labelOf(chrome.done) : labelOf(chrome.settings)}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>
    </div>
    <div class="pane" class:pane-fill={fillPane}>
      {#if vaultOpen}
        <VaultView {locale} onKeysChange={refreshKeys} />
      {:else if !tool}
        <p class="dbx-hint">{labelOf(chrome.emptyMine)}</p>
        <button class="dbx-btn dbx-btn--primary" onclick={startEditing} type="button">{labelOf(chrome.settings)}</button>
      {:else}
        {#key tool.id}
          {#if tool.view === "live-io"}
            <LiveIoView {locale} toolId={tool.id} />
          {:else if tool.view === "aes" || tool.view === "rsa" || tool.view === "xor"}
            <CipherView {locale} kind={tool.view} />
          {:else if tool.view === "keypair"}
            <KeyPairView {locale} onVaultChange={refreshKeys} />
          {:else if tool.view === "symmetric-key"}
            <KeyView {locale} onVaultChange={refreshKeys} />
          {:else if ActiveView}
            <ActiveView {locale} />
          {/if}
        {/key}
      {/if}
    </div>
  </section>
</div>
