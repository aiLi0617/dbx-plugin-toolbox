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
  return next.length ? next : [...DEFAULT_ENABLED_IDS];
}

const LOCAL_KEY = "toolbox.enabledToolIds";

function readLocal() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"));
  } catch {
    return [...DEFAULT_ENABLED_IDS];
  }
}

export async function getEnabledToolIds() {
  try {
    const result = await invoke("toolbox/prefs/get");
    return sanitize(result?.enabledToolIds);
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

export async function setEnabledToolIds(ids) {
  const next = sanitize(ids);
  writeLocal(next);
  try {
    const result = await invoke("toolbox/prefs/set", { enabledToolIds: next });
    const saved = sanitize(result?.enabledToolIds ?? next);
    writeLocal(saved);
    return saved;
  } catch (err) {
    if (window.dbxPlugin?.invoke) throw err;
    return next;
  }
}
