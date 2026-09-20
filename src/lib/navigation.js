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
