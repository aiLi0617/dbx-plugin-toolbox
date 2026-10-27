import { invoke } from "./host.js";
import { canonicalToolId, DEFAULT_ENABLED_IDS, tools } from "./catalog.js";
import { DEFAULT_SHORTCUTS, sanitizeShortcuts } from "./shortcuts.js";
import { validateSettings } from "./settingsTransfer.js";

const knownIds = new Set(tools.map((tool) => tool.id));

function sanitize(ids) {
  const raw = Array.isArray(ids) ? ids : [];
  const splitOldJsonTools = raw.includes("json-convert") && raw.includes("json");
  const seen = new Set();
  const next = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = canonicalToolId(item);
    if (!knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  if (splitOldJsonTools && knownIds.has("code-format") && !seen.has("code-format")) {
    const at = next.indexOf("json");
    if (at >= 0) next.splice(at + 1, 0, "code-format");
    else next.push("code-format");
  }
  return next;
}

// Older sidecars silently drop newly catalogued tool ids from the allow-list.
// Keep any requested (or locally stored) favorites the current UI still knows.
function retainKnownExtras(primary, extras) {
  const base = sanitize(primary);
  const seen = new Set(base);
  const out = [...base];
  for (const id of sanitize(extras)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const LOCAL_KEY = "toolbox.favoriteToolIds";
const LEGACY_LOCAL_KEY = "toolbox.enabledToolIds";
const VAULT_AUTO_LOCK_KEY = "toolbox.vaultAutoLockMinutes";
const RECENT_KEY = "toolbox.recentToolIds";
const SIDEBAR_KEY = "toolbox.sidebarCollapsed";
const RECENT_COLLAPSED_KEY = "toolbox.recentCollapsed";
const SHORTCUTS_KEY = "toolbox.shortcuts";
const RECENT_LIMIT_KEY = "toolbox.recentToolLimit";
export const DEFAULT_VAULT_AUTO_LOCK_MINUTES = 15;
export const VAULT_AUTO_LOCK_MINUTES = [0, 5, 15, 30, 60];
export const RECENT_TOOL_LIMITS = [5, 8, 10, 15, 20];
export const DEFAULT_RECENT_TOOL_LIMIT = 10;

let recentWriteChain = Promise.resolve();

export function sanitizeRecentToolLimit(value) {
  const limit = Number(value);
  return RECENT_TOOL_LIMITS.includes(limit) ? limit : DEFAULT_RECENT_TOOL_LIMIT;
}

export function sanitizeVaultAutoLockMinutes(value) {
  if (value == null || value === "") return DEFAULT_VAULT_AUTO_LOCK_MINUTES;
  const minutes = Number(value);
  return VAULT_AUTO_LOCK_MINUTES.includes(minutes) ? minutes : DEFAULT_VAULT_AUTO_LOCK_MINUTES;
}

function readLocalStored() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    if (raw === null) return null;
    return sanitize(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLocal() {
  return readLocalStored() ?? [...DEFAULT_ENABLED_IDS];
}

export async function getFavoriteToolIds() {
  try {
    const result = await invoke("toolbox/prefs/get");
    const ids = result?.favoriteToolIds ?? result?.enabledToolIds;
    if (!Array.isArray(ids)) return [...DEFAULT_ENABLED_IDS];
    const local = readLocalStored();
    return local ? retainKnownExtras(ids, local) : sanitize(ids);
  } catch {
    return readLocal();
  }
}

function writeLocal(ids) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota / private mode */
  }
}

export async function setFavoriteToolIds(ids) {
  const next = sanitize(ids);
  try {
    // Send both names during the v1 → v2 transition. New backends prefer
    // favoriteToolIds; an already-running v1 backend can still save the order.
    const result = await invoke("toolbox/prefs/set", { favoriteToolIds: next, enabledToolIds: next });
    const saved = retainKnownExtras(result?.favoriteToolIds ?? result?.enabledToolIds ?? next, next);
    writeLocal(saved);
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    writeLocal(next);
    return next;
  }
}

function readLocalVaultAutoLockMinutes() {
  try {
    const raw = localStorage.getItem(VAULT_AUTO_LOCK_KEY);
    return raw == null ? null : sanitizeVaultAutoLockMinutes(raw);
  } catch {
    return null;
  }
}

function writeLocalVaultAutoLockMinutes(value) {
  try {
    localStorage.setItem(VAULT_AUTO_LOCK_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export async function getVaultAutoLockMinutes() {
  const local = readLocalVaultAutoLockMinutes();
  try {
    const result = await invoke("toolbox/prefs/get");
    // A current sidecar is the source of truth. Local storage is only the
    // compatibility store for old sidecars that do not expose this field.
    if (result?.vaultAutoLockMinutes == null) {
      return local ?? DEFAULT_VAULT_AUTO_LOCK_MINUTES;
    }
    const saved = sanitizeVaultAutoLockMinutes(result?.vaultAutoLockMinutes);
    writeLocalVaultAutoLockMinutes(saved);
    return saved;
  } catch {
    return local ?? DEFAULT_VAULT_AUTO_LOCK_MINUTES;
  }
}

export async function setVaultAutoLockMinutes(value) {
  const next = sanitizeVaultAutoLockMinutes(value);
  try {
    const current = await invoke("toolbox/prefs/get");
    // Older sidecars require enabledToolIds and cannot persist this setting.
    // Keep the choice locally until the rebuilt sidecar exposes the new field.
    if (current?.vaultAutoLockMinutes == null) {
      writeLocalVaultAutoLockMinutes(next);
      return next;
    }
    // Send a partial update so a concurrent favorites change cannot be
    // overwritten by the stale value returned from the preceding read.
    const result = await invoke("toolbox/prefs/set", {
      vaultAutoLockMinutes: next,
    });
    const saved = result?.vaultAutoLockMinutes == null
      ? next
      : sanitizeVaultAutoLockMinutes(result.vaultAutoLockMinutes);
    writeLocalVaultAutoLockMinutes(saved);
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    writeLocalVaultAutoLockMinutes(next);
    return next;
  }
}

function readLocalWorkspace(defaultCollapsed = false) {
  let recentToolIds = [];
  let sidebarCollapsed = Boolean(defaultCollapsed);
  let recentCollapsed = false;
  let shortcuts = { ...DEFAULT_SHORTCUTS };
  let recentToolLimit = DEFAULT_RECENT_TOOL_LIMIT;
  try { recentToolIds = sanitize(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")).slice(0, 20); } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved != null) sidebarCollapsed = saved === "true";
  } catch { /* ignore */ }
  try {
    const saved = localStorage.getItem(RECENT_COLLAPSED_KEY);
    if (saved != null) recentCollapsed = saved === "true";
  } catch { /* ignore */ }
  try { shortcuts = sanitizeShortcuts(JSON.parse(localStorage.getItem(SHORTCUTS_KEY) || "{}")); } catch { /* ignore */ }
  try { recentToolLimit = sanitizeRecentToolLimit(localStorage.getItem(RECENT_LIMIT_KEY)); } catch { /* ignore */ }
  return { recentToolIds, sidebarCollapsed, recentCollapsed, shortcuts, recentToolLimit };
}

function writeLocalWorkspace({ recentToolIds, sidebarCollapsed, recentCollapsed, shortcuts, recentToolLimit }) {
  try {
    if (recentToolIds) localStorage.setItem(RECENT_KEY, JSON.stringify(recentToolIds));
    if (typeof sidebarCollapsed === "boolean") localStorage.setItem(SIDEBAR_KEY, String(sidebarCollapsed));
    if (typeof recentCollapsed === "boolean") localStorage.setItem(RECENT_COLLAPSED_KEY, String(recentCollapsed));
    if (shortcuts) localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(sanitizeShortcuts(shortcuts)));
    if (recentToolLimit != null) localStorage.setItem(RECENT_LIMIT_KEY, String(sanitizeRecentToolLimit(recentToolLimit)));
  } catch { /* sandboxed or unavailable storage */ }
}

/** Load navigation preferences from the Sidecar, migrating the former browser-only values. */
export async function getWorkspacePreferences(defaultCollapsed = false) {
  const local = readLocalWorkspace(defaultCollapsed);
  try {
    const result = await invoke("toolbox/prefs/get");
    const next = {
      recentToolIds: Array.isArray(result?.recentToolIds) && (Number(result?.version) >= 7 || result?.recentToolLimit != null || result.recentToolIds.length > 0)
        ? sanitize(result.recentToolIds).slice(0, 20)
        : local.recentToolIds,
      sidebarCollapsed: typeof result?.sidebarCollapsed === "boolean"
        ? result.sidebarCollapsed
        : local.sidebarCollapsed,
      recentCollapsed: typeof result?.recentCollapsed === "boolean"
        ? result.recentCollapsed
        : local.recentCollapsed,
      shortcuts: result?.shortcuts && typeof result.shortcuts === "object"
        ? sanitizeShortcuts(result.shortcuts)
        : local.shortcuts,
      recentToolLimit: sanitizeRecentToolLimit(result?.recentToolLimit ?? local.recentToolLimit),
    };
    writeLocalWorkspace(next);
    return next;
  } catch {
    return local;
  }
}

export async function setRecentToolLimit(value) {
  const recentToolLimit = sanitizeRecentToolLimit(value);
  try {
    const result = await invoke("toolbox/prefs/set", { recentToolLimit });
    const saved = sanitizeRecentToolLimit(result?.recentToolLimit ?? recentToolLimit);
    writeLocalWorkspace({ recentToolLimit: saved });
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    writeLocalWorkspace({ recentToolLimit });
    return recentToolLimit;
  }
}

export async function setRecentToolIds(ids) {
  const recentToolIds = sanitize(ids).slice(0, 20);
  writeLocalWorkspace({ recentToolIds });
  const operation = recentWriteChain.then(async () => {
    try {
      const result = await invoke("toolbox/prefs/set", { recentToolIds });
      const supportsRecentPersistence = Number(result?.version) >= 7 || result?.recentToolLimit != null || (Array.isArray(result?.recentToolIds) && result.recentToolIds.length > 0);
      const saved = supportsRecentPersistence && Array.isArray(result?.recentToolIds)
        ? sanitize(result.recentToolIds).slice(0, 20)
        : recentToolIds;
      writeLocalWorkspace({ recentToolIds: saved });
      return saved;
    } catch (err) {
      if (window.dbxPlugin?.invoke) throw err;
      return recentToolIds;
    }
  });
  recentWriteChain = operation.catch(() => {});
  return operation;
}

export async function setSidebarCollapsed(value) {
  const sidebarCollapsed = Boolean(value);
  writeLocalWorkspace({ sidebarCollapsed });
  try {
    const result = await invoke("toolbox/prefs/set", { sidebarCollapsed });
    const saved = typeof result?.sidebarCollapsed === "boolean" ? result.sidebarCollapsed : sidebarCollapsed;
    writeLocalWorkspace({ sidebarCollapsed: saved });
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    return sidebarCollapsed;
  }
}

export async function setRecentCollapsed(value) {
  const recentCollapsed = Boolean(value);
  writeLocalWorkspace({ recentCollapsed });
  try {
    const result = await invoke("toolbox/prefs/set", { recentCollapsed });
    const saved = typeof result?.recentCollapsed === "boolean" ? result.recentCollapsed : recentCollapsed;
    writeLocalWorkspace({ recentCollapsed: saved });
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    return recentCollapsed;
  }
}

export async function setShortcuts(value) {
  const shortcuts = sanitizeShortcuts(value);
  writeLocalWorkspace({ shortcuts });
  try {
    const result = await invoke("toolbox/prefs/set", { shortcuts });
    // Old sidecars ignore this forward-compatible field. Keep the local copy
    // until the rebuilt sidecar starts returning shortcuts.
    const saved = result?.shortcuts && typeof result.shortcuts === "object"
      ? sanitizeShortcuts(result.shortcuts)
      : shortcuts;
    writeLocalWorkspace({ shortcuts: saved });
    return saved;
  } catch (err) {
    // Shortcuts are safe, UI-only preferences. Keep the local fallback when
    // an older or temporarily unavailable sidecar cannot store the new field.
    return shortcuts;
  }
}

/** Save a settings draft in one backend transaction; keep live UI unchanged on failure. */
export async function setSettingsPreferences(value, { clearRecent = false } = {}) {
  const next = validateSettings(value);
  const params = { ...next, ...(clearRecent ? { recentToolIds: [] } : {}) };
  let version = null;
  try {
    const result = await invoke("toolbox/prefs/set", params);
    version = result?.version ?? null;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    // With no Sidecar, local storage is the only durable store. Report its
    // failure instead of marking an in-memory-only change as saved.
    const updates = {
      [LOCAL_KEY]: JSON.stringify(next.favoriteToolIds),
      [VAULT_AUTO_LOCK_KEY]: String(next.vaultAutoLockMinutes),
      [SIDEBAR_KEY]: String(next.sidebarCollapsed),
      [SHORTCUTS_KEY]: JSON.stringify(next.shortcuts),
      [RECENT_LIMIT_KEY]: String(next.recentToolLimit),
      ...(clearRecent ? { [RECENT_KEY]: "[]" } : {}),
    };
    const previous = Object.fromEntries(Object.keys(updates).map(key => [key, localStorage.getItem(key)]));
    try {
      for (const [key, content] of Object.entries(updates)) localStorage.setItem(key, content);
    } catch (storageError) {
      for (const [key, content] of Object.entries(previous)) {
        try { if (content == null) localStorage.removeItem(key); else localStorage.setItem(key, content); } catch { /* best-effort rollback */ }
      }
      throw storageError;
    }
  }
  writeLocal(next.favoriteToolIds);
  writeLocalVaultAutoLockMinutes(next.vaultAutoLockMinutes);
  writeLocalWorkspace({ ...next, ...(clearRecent ? { recentToolIds: [] } : {}) });
  return { ...next, version };
}

// Compatibility aliases for older callers while the preference schema migrates to v2.
export const getEnabledToolIds = getFavoriteToolIds;
export const setEnabledToolIds = setFavoriteToolIds;
