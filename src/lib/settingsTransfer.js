import { tools } from "./catalog.js";
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, sanitizeShortcut, shortcutConflicts } from "./shortcuts.js";

export const SETTINGS_SCHEMA = "io.github.aili0617.toolbox.preferences";
export const SETTINGS_EXPORT_VERSION = 1;
export const SETTINGS_FIELDS = ["shortcuts", "sidebarCollapsed", "recentToolLimit", "vaultAutoLockMinutes", "favoriteToolIds"];
export const MAX_SETTINGS_BYTES = 128 * 1024;
const knownTools = new Set(tools.map((tool) => tool.id));
const invalid = () => { throw new Error("Invalid preferences file"); };
function object(value, fields) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !fields.includes(key))) invalid();
}

/** Strict allow-list shared by file import, export and the settings save boundary. */
export function validateSettings(value) {
  object(value, SETTINGS_FIELDS);
  if (SETTINGS_FIELDS.some((key) => !Object.hasOwn(value, key))) invalid();
  if (typeof value.sidebarCollapsed !== "boolean" || ![5, 8, 10, 15, 20].includes(value.recentToolLimit)
    || ![0, 5, 15, 30, 60].includes(value.vaultAutoLockMinutes)) invalid();
  if (!Array.isArray(value.favoriteToolIds) || value.favoriteToolIds.length > knownTools.size
    || value.favoriteToolIds.some((id) => !knownTools.has(id))
    || new Set(value.favoriteToolIds).size !== value.favoriteToolIds.length) invalid();
  if (!value.shortcuts || typeof value.shortcuts !== "object" || Array.isArray(value.shortcuts)
    || Object.keys(value.shortcuts).length > 128) invalid();
  const shortcuts = { ...DEFAULT_SHORTCUTS };
  for (const [action, binding] of Object.entries(value.shortcuts)) {
    if (!SHORTCUT_ACTIONS.includes(action) && !(action.startsWith("tool:") && knownTools.has(action.slice(5)))) invalid();
    if (typeof binding !== "string" || binding.length > 64 || sanitizeShortcut(binding) === null) invalid();
    shortcuts[action] = sanitizeShortcut(binding);
  }
  if (shortcutConflicts(shortcuts).size) invalid();
  return { shortcuts, sidebarCollapsed: value.sidebarCollapsed, recentToolLimit: value.recentToolLimit,
    vaultAutoLockMinutes: value.vaultAutoLockMinutes, favoriteToolIds: [...value.favoriteToolIds] };
}

export function parseSettingsFile(text) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > MAX_SETTINGS_BYTES) invalid();
  let file;
  try { file = JSON.parse(text); } catch { invalid(); }
  object(file, ["schema", "version", "exportedAt", "preferences"]);
  if (file.schema !== SETTINGS_SCHEMA || file.version !== SETTINGS_EXPORT_VERSION) invalid();
  return validateSettings(file.preferences);
}

export function exportSettings(value) {
  // Pick exactly the public fields: callers may hold unrelated sensitive state.
  const selected = Object.fromEntries(SETTINGS_FIELDS.map((key) => [key, value[key]]));
  return JSON.stringify({ schema: SETTINGS_SCHEMA, version: SETTINGS_EXPORT_VERSION,
    exportedAt: new Date().toISOString(), preferences: validateSettings(selected) }, null, 2);
}

export function defaultSettings() {
  return { shortcuts: { ...DEFAULT_SHORTCUTS }, sidebarCollapsed: false, recentToolLimit: 10,
    vaultAutoLockMinutes: 15, favoriteToolIds: [] };
}
