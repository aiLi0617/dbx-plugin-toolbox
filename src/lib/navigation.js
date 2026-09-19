import { canonicalToolId, tools } from "./catalog.js";
import { textActionForQuery } from "./textActions.js";
import { EPHEMERAL_TOOL_IDS } from "./viewRegistry.js";

export { EPHEMERAL_TOOL_IDS };

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

export function recentWithoutFavorites(recentIds, favoriteIds, limit = 8) {
  const favorites = new Set(sanitizeToolIds(favoriteIds));
  return sanitizeToolIds(recentIds).filter((id) => !favorites.has(id)).slice(0, limit);
}

export function moveToolId(ids, sourceId, targetId, after = false) {
  const next = sanitizeToolIds(ids);
  if (!sourceId || !targetId || sourceId === targetId) return next;
  const from = next.indexOf(sourceId);
  const target = next.indexOf(targetId);
  if (from < 0 || target < 0) return next;
  next.splice(from, 1);
  const targetAfterRemoval = next.indexOf(targetId);
  next.splice(targetAfterRemoval + (after ? 1 : 0), 0, sourceId);
  return next;
}

// Only navigation options are recorded here; input text and keys are never persisted.
export function toolOptionsForQuery(toolId, query = "") {
  const q = String(query).trim().toLowerCase();
  if (!q) return {};
  if (toolId === "whitespace") return { action: textActionForQuery(q) };
  if (toolId === "uuid") {
    const kind = ["ulid", "nanoid", "uuid"].find((value) => q.includes(value));
    return kind ? { kind } : {};
  }
  if (toolId === "password" && /bytes|字节/.test(q)) return { kind: "bytes" };
  if (toolId === "aes") {
    const options = {};
    if (/sm4/.test(q)) options.algorithm = "sm4-128";
    else if (/aes.?128/.test(q)) options.algorithm = "aes-128";
    else if (/aes/.test(q)) options.algorithm = "aes-256";
    if (/cbc/.test(q)) options.mode = "cbc";
    else if (/gcm/.test(q)) options.mode = "gcm";
    else if (/ecb/.test(q)) options.mode = "ecb";
    if (/解密|decrypt/.test(q)) options.op = "decrypt";
    return options;
  }
  if (toolId === "rsa" && /sm2/.test(q)) return { algorithm: "sm2" };
  if (toolId === "hmac-sha256" && /sm3/.test(q)) return { algorithm: "hmac-sm3" };
  if (toolId === "code-format") {
    const languages = [["typescript", "typescript"], ["javascript", "javascript"], ["tsx", "typescript"], ["jsx", "javascript"], ["ts", "typescript"], ["js", "javascript"], ["sql", "sql"], ["xml", "xml"], ["yaml", "yaml"], ["html", "html"], ["css", "css"]];
    const tokens = q.split(/[^a-z]+/);
    const match = languages.find(([name]) => tokens.includes(name));
    return match ? { language: match[1] } : {};
  }
  if (toolId === "data-convert") {
    const formats = q.match(/ndjson|tsv|json|yaml|csv|xml|toml/g) || [];
    if (formats.length > 1) return { from: formats[0], to: formats[1] };
    if (formats.length === 1 && formats[0] !== "json") return { from: formats[0], to: "json" };
  }
  if (toolId === "timestamp") {
    if (/duration|difference|时间差|时长/.test(q)) return { action: "difference" };
    if (/加减|加天|arithmetic/.test(q)) return { action: "arithmetic" };
    if (/utc/.test(q)) return { timezone: "UTC" };
  }
  return {};
}
