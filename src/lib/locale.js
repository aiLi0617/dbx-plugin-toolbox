import { translateMessage } from './uiMessages.js';

/** Locales supported by the DBX host UI. Keep in sync with t8y2/dbx. */
export const SUPPORTED_LOCALES = Object.freeze(["az", "en", "es", "it", "ja", "ko", "pt-BR", "tr", "zh-CN", "zh-TW"]);
export const DEFAULT_LOCALE = "en";

/**
 * Normalize a host / browser language tag to a supported DBX locale.
 * Mirrors apps/desktop/src/i18n/index.ts localeFromLanguageTag.
 */
export function normalizeLocale(value) {
  if (!value) return DEFAULT_LOCALE;
  const normalized = String(value).trim().replace(/_/g, "-").toLowerCase();
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    if (
      normalized.includes("hant")
      || normalized.startsWith("zh-tw")
      || normalized.startsWith("zh-hk")
      || normalized.startsWith("zh-mo")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "it" || normalized.startsWith("it-")) return "it";
  if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  for (const language of ["az", "ko", "tr"]) {
    if (normalized === language || normalized.startsWith(`${language}-`)) return language;
  }
  return DEFAULT_LOCALE;
}

export function isZh(locale) {
  return normalizeLocale(locale).startsWith("zh");
}

/**
 * Build a localized string map for every supported locale.
 * Argument order: en, zh-CN, zh-TW, es, it, ja, pt-BR.
 * Also sets legacy `.zh` (= zh-CN) so existing `dict.zh` / `dict.en` call sites keep working.
 */
export function L(en, zhCN, zhTW, es, it, ja, ptBR) {
  return {
    en,
    "zh-CN": zhCN,
    "zh-TW": zhTW,
    es,
    it,
    ja,
    "pt-BR": ptBR,
    az: translateMessage("az", en) ?? en,
    ko: translateMessage("ko", en) ?? en,
    tr: translateMessage("tr", en) ?? en,
    zh: zhCN,
  };
}

/**
 * Resolve a localized value.
 * Supports:
 * - full maps from L()
 * - legacy { zh, en } maps (zh-TW falls back to zh)
 * - plain strings
 */
export function localize(locale, dict) {
  if (dict == null) return "";
  if (typeof dict === "string") return dict;
  const key = normalizeLocale(locale);
  if (dict[key] != null && dict[key] !== "") return dict[key];
  const translated = translateMessage(key, dict.en);
  if (translated != null && key !== "en") return translated;
  // Legacy zh/en catalog shape (no zh-CN key)
  if ("zh" in dict && !("zh-CN" in dict)) {
    if (key.startsWith("zh")) return dict.zh ?? dict.en ?? "";
    return dict.en ?? dict.zh ?? "";
  }
  if (dict.en != null && dict.en !== "") return dict.en;
  if (dict.zh != null && dict.zh !== "" && key.startsWith("zh")) return dict.zh;
  for (const localeKey of SUPPORTED_LOCALES) {
    if (dict[localeKey] != null && dict[localeKey] !== "") return dict[localeKey];
  }
  return "";
}

/**
 * pick(locale, L(...)) — full locale map
 * pick(locale, zh, en) — legacy call sites use the complete offline dictionary
 */
export function pick(locale, zhOrDict, en) {
  if (zhOrDict != null && typeof zhOrDict === "object" && en === undefined) {
    return localize(locale, zhOrDict);
  }
  const key = normalizeLocale(locale);
  if (key === "zh-CN") return zhOrDict;
  return translateMessage(key, en) ?? (isZh(key) ? zhOrDict : en);
}

/** All string values from a locale map (for search indexing). */
export function localeValues(dict) {
  if (!dict || typeof dict === "string") return dict ? [dict] : [];
  const out = [];
  for (const value of Object.values(dict)) {
    if (typeof value === "string" && value) out.push(value);
  }
  return out;
}
