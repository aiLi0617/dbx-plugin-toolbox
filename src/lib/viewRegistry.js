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
  gzip: () => import("./GzipView.svelte"),
  regex: () => import("./RegexView.svelte"),
  diff: () => import("./DiffView.svelte"),
  "data-convert": () => import("./DataConvertView.svelte"),
  spreadsheet: () => import("./SpreadsheetView.svelte"),
  "image-process": () => import("./ImageProcessView.svelte"),
  "image-generate": () => import("./ImageGenerateView.svelte"),
  "image-utility": () => import("./ImageUtilityView.svelte"),
  "image-stitch": () => import("./ImageStitchView.svelte"),
  "gif-tools": () => import("./GifToolsView.svelte"),
  "image-ocr": () => import("./ImageOcrView.svelte"),
  "utility-suite": () => import("./UtilitySuiteView.svelte"),
  "developer-utility": () => import("./DeveloperUtilityView.svelte"),
  "http-status": () => import("./HttpStatusView.svelte"),
  "network-calc": () => import("./NetworkCalcView.svelte"),
  "windows-port": () => import("./PortProcessesView.svelte"),
  "live-io": () => import("./LiveIoView.svelte"),
  aes: loadCipherView,
  rsa: loadCipherView,
  jwk: () => import("./JwkView.svelte"),
  xor: loadCipherView,
  keypair: () => import("./KeyPairView.svelte"),
  "symmetric-key": () => import("./KeyView.svelte"),
  "key-generator": () => import("./KeyGeneratorView.svelte"),
  "modern-crypto": () => import("./ModernCryptoView.svelte"),
  signature: () => import("./SignatureView.svelte"),
  "specialized-crypto": () => import("./SpecializedCryptoView.svelte"),
  kem: () => import("./KemView.svelte"),
  'developer-expansion': () => import('./DeveloperExpansionView.svelte'),
  'ipv6-ula': () => import('./Ipv6UlaView.svelte'),
  'basic-auth': () => import('./BasicAuthView.svelte'),
  'wifi-qr': () => import('./WifiQrView.svelte'),
  'calculator-suite': () => import('./CalculatorSuiteView.svelte'),
  'security-expansion': () => import('./SecurityExpansionView.svelte'),
  'content-expansion': () => import('./ContentExpansionView.svelte'),
  'gif-editor': () => import('./GifEditorView.svelte'),
  'speech': () => import('./SpeechView.svelte'),
  'pdf-tool': () => import('./PdfToolView.svelte'),
};

export const FILL_VIEWS = new Set([
  "json-workbench", "markdown", "url", "data-uri", "live-io", "jwt", "aes", "xor", "rsa", "modern-crypto", "signature",
  "specialized-crypto", "kem", "code-format", "data-convert", "spreadsheet", "image-process", "image-generate", "image-utility", "image-stitch", "gif-tools", "image-ocr", "utility-suite", "lorem",
  "whitespace", "gzip", "regex", "diff", "keypair", "symmetric-key", "key-generator", "unicode-inspect", "developer-utility", "http-status",
]);

// Keep these established utilities free of per-tool workflow and editing guards.
export function fillsToolPane(tool) {
  return tool?.id === "yaml-tree" || tool?.id === "roman" || FILL_VIEWS.has(tool?.view);
}

export const SIMPLE_TOOL_IDS = new Set(['json','data-convert','spreadsheet','whitespace','regex','base64','image-ocr']);

export const BACKGROUND_TOOL_IDS = new Set(tools.filter(tool => ['pdf-tool', 'gif-editor', 'gif-tools', 'image-ocr'].includes(tool.view)).map(tool => tool.id));

export const EPHEMERAL_TOOL_IDS = new Set([
  'basic-auth','wifi-qr','bcrypt','password-strength','bip39',
  "aes", "sm4", "rsa", "sm2", "modern-aead", "kdf", "signature", "key-wrap", "storage-crypto", "format-preserving", "aes-mac", "hpke", "ml-kem", "xor", "jwt", "jwk", "hmac-sha256", "totp", "password", "random-bytes", "key-generator",
]);

const TOOL_LIMITS = Object.freeze({
  "data-convert": { inputBytes: 5_000_000 },
  spreadsheet: { inputBytes: 50_000_000 },
  "image-process": { inputBytes: 30_000_000 },
  json: { inputBytes: 5_000_000 },
  jwt: { inputBytes: 1_000_000 },
  jwk: { inputBytes: 1_000_000 },
  hash: { inputBytes: 16_000_000 },
  "file-type": { inputBytes: 100_000_000 },
  "image-utility": { inputBytes: 30_000_000 },
  "image-compress": { inputBytes: 30_000_000 },
  "image-grid": { inputBytes: 30_000_000 },
  "image-pixelate": { inputBytes: 30_000_000 },
  "image-base64": { inputBytes: 30_000_000 },
  "image-stitch": { inputBytes: 90_000_000 },
  "gif-tools": { inputBytes: 90_000_000 },
  "image-ocr": { inputBytes: 20_000_000 },
  hmac: { inputBytes: 5_000_000 },
  "hmac-sha256": { inputBytes: 5_000_000 },
  cert: { inputBytes: 2_000_000 },
  diff: { inputBytes: 1_000_000 },
  markdown: { inputBytes: 1_000_000 },
  regex: { inputBytes: 1_000_000 },
  whitespace: { inputBytes: 5_000_000 },
  gzip: { inputBytes: 5_000_000 },
  "json-schema": { inputBytes: 5_000_000 },
  dotenv: { inputBytes: 1_000_000 },
  semver: { inputBytes: 1_000_000 },
  chmod: { inputBytes: 10_000 },
  "http-status": { inputBytes: 10_000 },
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
const CALCULATOR_IDS = new Set(["timestamp", "color", "cron", "base-convert", "semver", "chmod", "phone", "bandwidth", "network-calc"]);
const LIVE_IDS = new Set(["base64", "url", "html-entities", "sql-escape", "punycode", "quoted-printable"]);
const FILE_IDS = new Set(["hash", "file-type", "cert", "image-ocr"]);
const GENERATOR_IDS = new Set(["uuid", "password", "random-bytes", "qrcode", "lorem", "fake-data", "chart", "key-generator"]);
const EXPLICIT_IDS = new Set(["hash", "file-type", "cert", "image-process", "image-compress", "image-grid", "image-pixelate", "image-base64", "image-stitch", "gif-tools", "image-ocr", "aes", "sm4", "rsa", "sm2", "modern-aead", "kdf", "signature", "key-wrap", "storage-crypto", "format-preserving", "aes-mac", "hpke", "ml-kem", "hmac-sha256", "password", "random-bytes", "key-generator", "windows-port"]);
const DEBOUNCED_CRYPTO_IDS = new Set(["kdf", "argon2id-kdf", "scrypt-kdf", "pbkdf2-kdf", "hkdf", "key-wrap", "storage-crypto", "format-preserving", "aes-cmac"]);
function layoutKind(tool) {
  if (LIVE_IDS.has(tool.id)) return "live-io";
  if (CALCULATOR_IDS.has(tool.id)) return "calculator";
  if (FILE_IDS.has(tool.id)) return "file";
  if (GENERATOR_IDS.has(tool.id)) return "generator";
  if (["json", "code-format", "regex", "diff", "markdown", "dotenv"].includes(tool.id)) return "editor";
  return "custom";
}

export const TOOL_REGISTRY = Object.freeze(tools.map((tool) => Object.freeze({
  id: tool.id,
  category: tool.category,
  name: tool.name,
  summary: tool.summary || { zh: "", en: "" },
  aliases: Object.freeze([...(tool.aliases || [])]),
  loader: VIEW_LOADERS[tool.view],
  view: tool.view,
  kind: tool.kind || "tool",
  parentId: tool.parentId || null,
  defaultOptions: Object.freeze({ ...(tool.defaultOptions || {}) }),
  catalogVisible: tool.catalogVisible !== false,
  capabilityId: tool.capabilityId || null,
  supportLevel: tool.supportLevel || null,
  lockOptions: Object.freeze([...(tool.lockOptions || [])]),
  demoPreset: tool.demoPreset,
  actions: Object.freeze([...(tool.actions || [])]),
  ephemeral: EPHEMERAL_TOOL_IDS.has(tool.id) || EPHEMERAL_TOOL_IDS.has(tool.parentId),
  fill: fillsToolPane(tool),
  limits: TOOL_LIMITS[tool.id] || TOOL_LIMITS[tool.parentId] || (tool.view==='pdf-tool'?{inputBytes:50_000_000}:tool.view==='gif-editor'?{inputBytes:30_000_000}:tool.view?.includes('expansion')||['basic-auth','wifi-qr','calculator-suite','speech','ipv6-ula'].includes(tool.view)?{inputBytes:1_000_000}:null),
  layoutKind: layoutKind(tool),
  executionKind: DEBOUNCED_CRYPTO_IDS.has(tool.id) || DEBOUNCED_CRYPTO_IDS.has(tool.parentId) ? "debounced" : EXPLICIT_IDS.has(tool.id) || EXPLICIT_IDS.has(tool.parentId) ? "explicit" : LIVE_IDS.has(tool.id) ? "live" : "debounced",
})));

export const TOOL_IDS = Object.freeze(TOOL_REGISTRY.map((tool) => tool.id));

/**
 * Every tool view receives one stable prop contract. Individual views can pick
 * only the fields they use, while App.svelte no longer needs view-specific
 * rendering branches.
 */
export function viewPropsForTool(tool, context = {}) {
  const initialOptions = context.initialOptions || {};
  return {
    locale: context.locale || "zh-CN",
    toolId: tool.id,
    view: tool.view,
    kind: ["aes", "rsa", "xor"].includes(tool.view) ? tool.view : tool.kind || "tool",
    initialOptions,
    initialAction: initialOptions.action || "trim",
    focusedOperation: initialOptions.op || "",
    shortcut: Boolean(context.shortcut),
    calculateShortcut: context.calculateShortcut,
    shortcutId: tool.id,
    capabilityId: tool.capabilityId || null,
    lockOptions: tool.lockOptions || [],
    demo: context.demo,
    demoRequest: Number(context.demoRequest || 0),
    onVaultChange: context.onVaultChange,
    onSupportLevelChange: context.onSupportLevelChange,
    onOpenTool: context.onOpenTool,
    onCloseTool: context.onCloseTool,
    onStateChange: context.onStateChange,
    onBeforeReplace: context.onBeforeReplace,
    visible: context.visible,
  };
}
