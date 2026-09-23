// Central view registry. Tool metadata stays in toolCatalog.js; this file owns
// lazy component loading and view behavior flags so adding a tool does not
// require editing App.svelte and navigation.js independently.
import { tools } from "./catalog.js";

const loadCipherView = () => import("./CipherView.svelte");

export const VIEW_LOADERS = {
  "json-workbench": () => import("./JsonWorkbench.svelte"),
  "base-convert": () => import("./BaseConvertView.svelte"),
  "time-convert": () => import("./TimeConvertView.svelte"),
  "color-convert": () => import("./ColorConvertView.svelte"),
  cron: () => import("./CronView.svelte"),
  totp: () => import("./TotpView.svelte"),
  "unique-id": () => import("./UniqueIdView.svelte"),
  password: () => import("./PasswordView.svelte"),
  hash: () => import("./HashView.svelte"),
  "md5-collision": () => import("./Md5CollisionView.svelte"),
  "file-type": () => import("./FileTypeView.svelte"),
  "unicode-inspect": () => import("./UnicodeInspectView.svelte"),
  qrcode: () => import("./QrView.svelte"),
  markdown: () => import("./MarkdownView.svelte"),
  base64: () => import("./BaseCodecView.svelte"),
  url: () => import("./UrlView.svelte"),
  "html-entities": () => import("./EscapeView.svelte"),
  punycode: () => import("./PunycodeView.svelte"),
  "data-uri": () => import("./DataUriView.svelte"),
  jwt: () => import("./JwtView.svelte"),
  hmac: () => import("./HmacView.svelte"),
  cert: () => import("./CertView.svelte"),
  "code-format": () => import("./CodeFormatView.svelte"),
  lorem: () => import("./LoremView.svelte"),
  whitespace: () => import("./TextWorkbench.svelte"),
  regex: () => import("./RegexView.svelte"),
  diff: () => import("./DiffView.svelte"),
  "data-convert": () => import("./DataConvertView.svelte"),
  spreadsheet: () => import("./SpreadsheetView.svelte"),
  "image-process": () => import("./ImageProcessView.svelte"),
  "image-generate": () => import("./ImageGenerateView.svelte"),
  "image-utility": () => import("./ImageUtilityView.svelte"),
  "network-calc": () => import("./NetworkCalcView.svelte"),
  "windows-port": () => import("./PortProcessesView.svelte"),
  "live-io": () => import("./LiveIoView.svelte"),
  aes: loadCipherView,
  rsa: loadCipherView,
  jwk: () => import("./JwkView.svelte"),
  xor: loadCipherView,
  keypair: () => import("./KeyPairView.svelte"),
  "symmetric-key": () => import("./KeyView.svelte"),
};

export const FILL_VIEWS = new Set([
  "json-workbench", "markdown", "url", "data-uri", "live-io", "jwt", "aes", "xor", "rsa",
  "code-format", "data-convert", "spreadsheet", "image-process", "image-generate", "image-utility", "lorem",
  "whitespace", "regex", "diff", "keypair", "symmetric-key", "unicode-inspect",
]);

export const EPHEMERAL_TOOL_IDS = new Set([
  "aes", "rsa", "xor", "jwt", "jwk", "hmac-sha256", "totp", "password", "symmetric-key", "key-pair",
]);

const TOOL_LIMITS = Object.freeze({
  "data-convert": { inputBytes: 5_000_000 },
  spreadsheet: { inputBytes: 50_000_000 },
  "image-process": { inputBytes: 30_000_000 },
  json: { inputBytes: 5_000_000 },
  jwt: { inputBytes: 1_000_000 },
  jwk: { inputBytes: 1_000_000 },
  hash: { inputBytes: 16_000_000 },
  "md5-collision": { inputBytes: 16_000_000 },
  "file-type": { inputBytes: 100_000_000 },
  "image-pixelate": { inputBytes: 30_000_000 },
  "image-grid": { inputBytes: 30_000_000 },
  "image-compress": { inputBytes: 30_000_000 },
  "image-base64": { inputBytes: 10_000_000 },
  hmac: { inputBytes: 5_000_000 },
  "hmac-sha256": { inputBytes: 5_000_000 },
  cert: { inputBytes: 2_000_000 },
  diff: { inputBytes: 1_000_000 },
  markdown: { inputBytes: 1_000_000 },
  regex: { inputBytes: 1_000_000 },
  whitespace: { inputBytes: 5_000_000 },
});

export const TOOL_VIEW_CONFIG = Object.freeze(
  Object.fromEntries(Object.entries(VIEW_LOADERS).map(([view, loader]) => [view, {
    view,
    loader,
    fill: FILL_VIEWS.has(view),
  }])),
);

// A single runtime shape consumed by catalog/search/persistence integrations.
// Keeping defaults and limits on every entry makes new tools explicit even
// when they do not currently need options or a special input cap.
export const TOOL_REGISTRY = Object.freeze(tools.map((tool) => Object.freeze({
  id: tool.id,
  category: tool.category,
  name: tool.name,
  summary: tool.summary || { zh: "", en: "" },
  aliases: Object.freeze([...(tool.aliases || [])]),
  loader: VIEW_LOADERS[tool.view],
  view: tool.view,
  defaultOptions: Object.freeze({ ...(tool.defaultOptions || {}) }),
  ephemeral: EPHEMERAL_TOOL_IDS.has(tool.id),
  fill: FILL_VIEWS.has(tool.view),
  limits: TOOL_LIMITS[tool.id] || null,
})));

export const TOOL_IDS = Object.freeze(TOOL_REGISTRY.map((tool) => tool.id));
