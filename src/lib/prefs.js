import { invoke } from "./host.js";
import { canonicalToolId, DEFAULT_ENABLED_IDS, tools } from "./catalog.js";

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

const LOCAL_KEY = "toolbox.favoriteToolIds";
const LEGACY_LOCAL_KEY = "toolbox.enabledToolIds";
const VAULT_AUTO_LOCK_KEY = "toolbox.vaultAutoLockMinutes";
export const DEFAULT_VAULT_AUTO_LOCK_MINUTES = 15;
export const VAULT_AUTO_LOCK_MINUTES = [0, 5, 15, 30, 60];

export function sanitizeVaultAutoLockMinutes(value) {
  if (value == null || value === "") return DEFAULT_VAULT_AUTO_LOCK_MINUTES;
  const minutes = Number(value);
  return VAULT_AUTO_LOCK_MINUTES.includes(minutes) ? minutes : DEFAULT_VAULT_AUTO_LOCK_MINUTES;
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    return raw === null ? [...DEFAULT_ENABLED_IDS] : sanitize(JSON.parse(raw));
  } catch {
    return [...DEFAULT_ENABLED_IDS];
  }
}

export async function getFavoriteToolIds() {
  try {
    const result = await invoke("toolbox/prefs/get");
    const ids = result?.favoriteToolIds ?? result?.enabledToolIds;
    return Array.isArray(ids) ? sanitize(ids) : [...DEFAULT_ENABLED_IDS];
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
    const saved = sanitize(result?.favoriteToolIds ?? result?.enabledToolIds ?? next);
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

// Compatibility aliases for older callers while the preference schema migrates to v2.
export const getEnabledToolIds = getFavoriteToolIds;
export const setEnabledToolIds = setFavoriteToolIds;
