import { normalizeLocale } from "./locale.js";

export async function ready() {
  if (window.dbxPlugin?.ready) await window.dbxPlugin.ready;
}

function errorText(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return String(err.message || err.msg || err.data?.message || "");
}

function normalizeError(err, method) {
  if (err instanceof Error && err.code && err.method === method) return err;
  const message = errorText(err) || "Request failed";
  const normalized = err instanceof Error ? err : new Error(message);
  if (!normalized.message) normalized.message = message;
  const rawCode = err?.code ?? err?.data?.code;
  normalized.code = rawCode === undefined || rawCode === null
    ? /timeout|timed out/i.test(message) ? "TIMEOUT" : "HOST_ERROR"
    : String(rawCode);
  normalized.method = method;
  return normalized;
}

function isSidecarStarting(err) {
  return /sidecar is not ready|backend is not ready/i.test(errorText(err));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invoke(method, params = {}, timeoutMs = 30000) {
  await ready();
  if (!window.dbxPlugin?.invoke) {
    throw new Error("DBX plugin host is not available");
  }
  let lastErr;
  const waits = [0, 200, 400, 800, 1600, 2500];
  const timeout = Number.isFinite(Number(timeoutMs)) ? Math.max(1, Math.min(Number(timeoutMs), 10 * 60 * 1000)) : 30000;
  for (const wait of waits) {
    if (wait) await sleep(wait);
    try {
      return await window.dbxPlugin.invoke(method, params, { timeoutMs: timeout });
    } catch (err) {
      lastErr = normalizeError(err, method);
      if (!isSidecarStarting(lastErr)) throw lastErr;
    }
  }
  throw normalizeError(lastErr, method);
}

/** Read a locale from an onInit payload / dbx-plugin-env event before falling back to the bridge snapshot. */
export function locale(environment) {
  const seen = new Set();
  const findLocale = (value) => {
    if (typeof value === "string" && value.trim()) return value;
    if (!value || typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    for (const key of ["locale", "language", "languageTag"]) {
      if (typeof value[key] === "string" && value[key].trim()) return value[key];
    }
    for (const key of ["detail", "environment", "env", "init", "payload", "params"]) {
      const nested = findLocale(value[key]);
      if (nested) return nested;
    }
    return "";
  };
  const hostValue = typeof window !== "undefined" ? window.dbxPlugin?.locale : "";
  const browserValue = typeof navigator !== "undefined" ? navigator.language : "";
  return normalizeLocale(findLocale(environment) || hostValue || browserValue || "en");
}

/** Subscribe before reading the snapshot. DBX env events target document and
 * do not bubble; capture supports both current and older window-based hosts.
 * onInit's argument is application context and must never override locale.
 */
export function observeEnvironment(callback) {
  const update = (event) => callback(event);
  window.addEventListener("dbx-plugin-env", update, true);
  const offInit = window.dbxPlugin?.onInit?.(() => callback());
  callback();
  return () => {
    window.removeEventListener("dbx-plugin-env", update, true);
    if (typeof offInit === "function") offInit();
  };
}

export function theme() {
  return window.dbxPlugin?.theme || { appearance: "light", tokens: {} };
}

export function themeAppearance() {
  return theme().appearance === "dark" ? "dark" : "light";
}

/** Public plugin tokens (`--color-*`) and DBX/shadcn aliases (`--card`, `--accent`, …). */
const COLOR_TOKEN_NAMES = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
  "success",
  "success-foreground",
  "success-bg",
  "warning",
  "warning-foreground",
  "warning-bg",
  "info",
  "info-foreground",
  "info-bg",
];

const ALIAS_PAIRS = [
  ["--font-sans", "--font-family"],
  ["--font-mono", "--dbx-editor-font-family"],
  ["--dbx-editor-font-size", "--editor-font-size"],
  ["--radius-sm", "--dbx-radius-sm"],
  ["--radius-md", "--dbx-radius-md"],
  ["--radius-lg", "--dbx-radius-lg"],
  ["--radius-xl", "--dbx-radius-xl"],
];

let appliedInlineTokens = new Set();

function tokenCssValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return "";
}

function tokenCssName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const dashed = raw.startsWith("--") ? raw : `--${raw}`;
  return /^--[a-zA-Z_][a-zA-Z0-9-]*$/.test(dashed) ? dashed : "";
}

function flattenTokens(tokens, prefix = "") {
  const out = {};
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) return out;
  for (const [key, value] of Object.entries(tokens)) {
    const name = prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = Object.values(value);
      if (nested.length && nested.every((item) => typeof item === "string" || typeof item === "number")) {
        Object.assign(out, flattenTokens(value, name.replace(/^--+/, "")));
      }
      continue;
    }
    const cssName = tokenCssName(name);
    const cssValue = tokenCssValue(value);
    if (cssName && cssValue) out[cssName] = cssValue;
  }
  return out;
}

function setToken(root, applied, name, value) {
  root.style.setProperty(name, value);
  applied[name] = value;
}

/** Push host appearance + CSS tokens onto the document root so the UI tracks DBX theme/palette changes. */
export function applyTheme() {
  const value = theme();
  const root = document.documentElement;
  const body = document.body;
  const appearance = value.appearance === "dark" ? "dark" : "light";
  root.dataset.dbxTheme = appearance;
  root.classList.toggle("dark", appearance === "dark");
  root.style.colorScheme = appearance;
  if (body) {
    body.dataset.dbxTheme = appearance;
    body.dataset.theme = appearance;
  }

  const applied = flattenTokens(value.tokens);
  for (const [name, tokenValue] of Object.entries(applied)) {
    root.style.setProperty(name, tokenValue);
  }

  for (const key of COLOR_TOKEN_NAMES) {
    const longName = `--color-${key}`;
    const shortName = `--${key}`;
    if (applied[longName] && !applied[shortName]) setToken(root, applied, shortName, applied[longName]);
    if (applied[shortName] && !applied[longName]) setToken(root, applied, longName, applied[shortName]);
  }
  for (const [left, right] of ALIAS_PAIRS) {
    if (applied[left] && !applied[right]) setToken(root, applied, right, applied[left]);
    if (applied[right] && !applied[left]) setToken(root, applied, left, applied[right]);
  }

  const nextKeys = new Set(Object.keys(applied));
  for (const name of appliedInlineTokens) {
    if (!nextKeys.has(name)) root.style.removeProperty(name);
  }
  appliedInlineTokens = nextKeys;
}
