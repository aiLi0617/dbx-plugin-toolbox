import { canonicalToolId, tools } from "./catalog.js";
import { optionsForTool } from "./searchIntent.js";
import { EPHEMERAL_TOOL_IDS } from "./viewRegistry.js";

export { EPHEMERAL_TOOL_IDS };
export { resolveIntent, intentLabelForTool, optionsForTool } from "./searchIntent.js";

const knownIds = new Set(tools.map((tool) => tool.id));

export function sanitizeToolIds(ids, limit = Infinity) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(ids) ? ids : []) {
    if (typeof raw !== "string") continue;
    const id = canonicalToolId(raw);
    if (!knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
export function pushRecent(ids, id, limit = 10) {
  return sanitizeToolIds([id, ...(ids || [])], limit);
}

/** Reorder an id list relative to a target. Does not filter against the tool catalog. */
export function moveId(ids, sourceId, targetId, after = false) {
  const next = Array.isArray(ids) ? [...ids] : [];
  if (!sourceId || !targetId || sourceId === targetId) return next;
  const from = next.indexOf(sourceId);
  const target = next.indexOf(targetId);
  if (from < 0 || target < 0) return next;
  next.splice(from, 1);
  const targetAfterRemoval = next.indexOf(targetId);
  next.splice(targetAfterRemoval + (after ? 1 : 0), 0, sourceId);
  return next;
}

export function moveToolId(ids, sourceId, targetId, after = false) {
  return moveId(sanitizeToolIds(ids), sourceId, targetId, after);
}

// Only navigation options are recorded here; input text and keys are never persisted.
export function toolOptionsForQuery(toolId, query = "") {
  return optionsForTool(toolId, query);
}

const PRIVATE_CONTEXT_KEY = /(?:password|passphrase|secret|token|key|material|input|text|content|payload)/i;

/** Convert a DBX workbench context snapshot into safe navigation state. */
export function navigationTargetFromContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const page = ["home", "catalog", "vault"].includes(value.page) ? value.page : "";
  const toolId = sanitizeToolIds([value.toolId], 1)[0] || "";
  if (!page && !toolId) return null;
  const action = typeof value.action === "string" ? value.action.trim().slice(0, 80) : "";
  const explicit = value.options && typeof value.options === "object" && !Array.isArray(value.options)
    ? Object.fromEntries(Object.entries(value.options).filter(([key, option]) => {
        if (PRIVATE_CONTEXT_KEY.test(key)) return false;
        return typeof option === "boolean"
          || (typeof option === "number" && Number.isFinite(option))
          || (typeof option === "string" && option.length <= 200);
      }))
    : {};
  return { page: toolId ? "tool" : page, toolId, options: toolId ? { ...toolOptionsForQuery(toolId, action), ...explicit } : {} };
}
