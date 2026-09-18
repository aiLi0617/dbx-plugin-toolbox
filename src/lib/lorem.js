/** DBX UI locales from t8y2/dbx `apps/desktop/src/i18n/index.ts`. */
export const DBX_LOREM_LOCALES = [
  { value: "auto", zh: "跟随界面", en: "Match UI" },
  { value: "zh-CN", zh: "简体中文", en: "简体中文" },
  { value: "zh-TW", zh: "繁體中文", en: "繁體中文" },
  { value: "en", zh: "English", en: "English" },
  { value: "ja", zh: "日本語", en: "日本語" },
  { value: "ko", zh: "한국어", en: "한국어" },
  { value: "es", zh: "Español", en: "Español" },
  { value: "it", zh: "Italiano", en: "Italiano" },
  { value: "pt-BR", zh: "Português", en: "Português" },
  { value: "tr", zh: "Türkçe", en: "Türkçe" },
  { value: "az", zh: "Azərbaycan", en: "Azərbaycan" },
];

const LINE = {
  "zh-CN": "DBX：约 25MB 的轻量数据库客户端，统一管理 90+ 种数据库，下载即用。",
  "zh-TW": "DBX：約 25MB 的輕量資料庫用戶端，統一管理 90+ 種資料庫，下載即用。",
  en: "DBX is a ~25 MB lightweight database client for 90+ engines — download it and use it right away.",
  ja: "DBX は約 25MB の軽量クライアントで、90 種以上のデータベースをまとめて管理でき、ダウンロードしてすぐ使えます。",
  ko: "DBX는 약 25MB의 가벼운 클라이언트로 90개 이상 데이터베이스를 한곳에서 관리하며, 받아서 바로 쓸 수 있습니다.",
  es: "DBX es un cliente ligero de unos 25 MB para más de 90 bases de datos: descárgalo y úsalo al momento.",
  it: "DBX è un client leggero da circa 25 MB per oltre 90 database: scaricalo e usalo subito.",
  "pt-BR": "DBX é um cliente leve de cerca de 25 MB para mais de 90 bancos: baixe e use na hora.",
  tr: "DBX, yaklaşık 25 MB’lık hafif bir istemcidir; 90’dan fazla veritabanını tek yerde yönetir, indirip hemen kullanırsınız.",
  az: "DBX təxminən 25 MB-lıq yüngül müştəridir, 90-dan çox verilənlər bazasını bir yerdə idarə edir, endirib dərhal istifadə edirsiniz.",
};

const KNOWN = new Set(Object.keys(LINE));

export function localeFromLanguageTag(value) {
  if (!value) return null;
  const normalized = String(value).replace("_", "-").toLowerCase();
  if (KNOWN.has(value)) return value;
  if (normalized === "zh" || normalized.startsWith("zh-")) {
    if (
      normalized.includes("hant") ||
      normalized.startsWith("zh-tw") ||
      normalized.startsWith("zh-hk") ||
      normalized.startsWith("zh-mo")
    ) {
      return "zh-TW";
    }
    return "zh-CN";
  }
  if (normalized === "az" || normalized.startsWith("az-")) return "az";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "es" || normalized.startsWith("es-")) return "es";
  if (normalized === "it" || normalized.startsWith("it-")) return "it";
  if (normalized === "ja" || normalized.startsWith("ja-")) return "ja";
  if (normalized === "ko" || normalized.startsWith("ko-")) return "ko";
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-BR";
  if (normalized === "tr" || normalized.startsWith("tr-")) return "tr";
  return null;
}

export function resolveLoremLocale(language, fallbackLocale) {
  if (language && language !== "auto" && LINE[language]) return language;
  return localeFromLanguageTag(fallbackLocale) || "en";
}

export const LOREM_MIN_LINES = 1;
export const LOREM_MAX_LINES = 1000;

export function lorem(lines = 1, language = "auto", fallbackLocale = "zh-CN") {
  const text = LINE[resolveLoremLocale(language, fallbackLocale)] || LINE.en;
  const n = Math.floor(Number(lines));
  const count = Number.isFinite(n)
    ? Math.min(LOREM_MAX_LINES, Math.max(LOREM_MIN_LINES, n))
    : LOREM_MIN_LINES;
  return Array.from({ length: count }, () => text).join("\n");
}
