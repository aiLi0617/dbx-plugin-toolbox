import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indentSelection } from "../src/lib/editorIndent.js";
import { tools, searchTools } from "../src/lib/catalog.js";
import { toolOptionsForQuery, EPHEMERAL_TOOL_IDS, navigationTargetFromContext, resolveIntent } from "../src/lib/navigation.js";

test("merged tool searches open the requested operation", () => {
  assert.deepEqual(toolOptionsForQuery("uuid", "ULID"), { kind: "ulid" });
  assert.deepEqual(toolOptionsForQuery("uuid", "UUID v7"), { kind: "uuid-v7" });
  assert.deepEqual(toolOptionsForQuery("uuid", "UUID v5"), { kind: "uuid-v5" });
  assert.deepEqual(toolOptionsForQuery("aes", "SM4 CBC 解密"), { algorithm: "sm4-128", mode: "cbc", op: "decrypt" });
  assert.deepEqual(toolOptionsForQuery("hmac-sha256", "HMAC-SHA512"), { algorithm: "hmac-sha512" });
  assert.deepEqual(toolOptionsForQuery("hmac-sha256", "sm3"), { algorithm: "hmac-sm3" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "YAML → JSON"), { from: "yaml", to: "json" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "JSON 转 TOML"), { from: "json", to: "toml" });
  assert.deepEqual(toolOptionsForQuery("json", "JSONPath 提取"), { mode: "extract" });
  assert.deepEqual(toolOptionsForQuery("code-format", "TS"), { language: "typescript" });
  assert.deepEqual(toolOptionsForQuery("timestamp", "时间差"), { action: "difference" });
  assert.deepEqual(toolOptionsForQuery("uuid", ""), {});
  assert.deepEqual(toolOptionsForQuery("http-status", "HTTP 404"), { query: "404" });
  assert.deepEqual(toolOptionsForQuery("http-status", "5xx"), { query: "5xx" });
});

test("resolveIntent maps action phrases to tools and options", () => {
  assert.equal(resolveIntent("验签")[0]?.toolId, "jwt");
  assert.deepEqual(resolveIntent("验签")[0]?.options, { mode: "verify" });
  assert.equal(resolveIntent("decode token")[0]?.toolId, "jwt");
  assert.equal(resolveIntent("crontab")[0]?.toolId, "cron");
  assert.equal(resolveIntent("正则表达式")[0]?.toolId, "regex");
  assert.equal(resolveIntent("url解码")[0]?.toolId, "url");
  assert.deepEqual(resolveIntent("url解码")[0]?.options, { mode: "decode" });
  assert.equal(resolveIntent("md5")[0]?.toolId, "hash");
  assert.equal(resolveIntent("WCAG 对比度")[0]?.toolId, "color");
  assert.deepEqual(toolOptionsForQuery("hash", "md5 16"), { algorithm: "md5-16" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha224"), { algorithm: "sha224" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha3"), { algorithm: "sha3-256" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha256"), { algorithm: "sha256" });
  assert.deepEqual(toolOptionsForQuery("base64", "base64 decode"), { format: "base64", op: "decode" });
  assert.deepEqual(toolOptionsForQuery("qrcode", "二维码识别"), { mode: "decode" });
  assert.deepEqual(toolOptionsForQuery("image-process", "裁剪"), { op: "crop" });
  assert.equal(resolveIntent("去重")[0]?.toolId, "whitespace");
  assert.deepEqual(resolveIntent("去重")[0]?.options, { action: "unique" });
  assert.equal(resolveIntent("429")[0]?.toolId, "http-status");
  assert.deepEqual(resolveIntent("429")[0]?.options, { query: "429" });
});

test("workbench context selects tools without accepting private input", () => {
  assert.deepEqual(navigationTargetFromContext({
    toolId: "url",
    action: "decode",
    options: { mode: "encode", compact: true, password: "never", input: "private" },
  }), { page: "tool", toolId: "url", options: { mode: "encode", compact: true } });
  assert.deepEqual(navigationTargetFromContext({ page: "catalog" }), { page: "catalog", toolId: "", options: {} });
  assert.equal(navigationTargetFromContext({ toolId: "missing-tool" }), null);
});


test("intent search understands every non-English host locale", () => {
  assert.deepEqual(toolOptionsForQuery("jwt", "JWT の署名を検証"), { mode: "verify" });
  assert.deepEqual(toolOptionsForQuery("url", "URLをデコード"), { mode: "decode" });
  assert.deepEqual(toolOptionsForQuery("image-process", "画像を切り抜き"), { op: "crop" });
  assert.equal(resolveIntent("正規表現")[0]?.toolId, "regex");

  assert.deepEqual(toolOptionsForQuery("jwt", "verificar firma JWT"), { mode: "verify" });
  assert.deepEqual(toolOptionsForQuery("url", "decodificar URL"), { mode: "decode" });
  assert.equal(resolveIntent("espressione regolare")[0]?.toolId, "regex");
  assert.equal(resolveIntent("senha aleatória")[0]?.toolId, "password");
  assert.deepEqual(toolOptionsForQuery("url", "URL 解碼"), { mode: "decode" });
});

test("search finds localized categories and multiple keywords", () => {
  assert.ok(searchTools("安全加密", "zh-CN").every((tool) => tool.category === "security"));
  assert.ok(searchTools("安全加密", "zh-CN").length >= 8);
  assert.ok(searchTools("Security & crypto", "en").every((tool) => tool.category === "security"));
  assert.ok(searchTools("セキュリティと暗号", "ja").every((tool) => tool.category === "security"));
  assert.ok(searchTools("SM4 CBC", "zh-CN").some((tool) => tool.id === "sm4"));
  assert.equal(searchTools("ULID", "zh-CN")[0].id, "uuid");
  assert.ok(tools.some((tool) => tool.id === "data-convert" && tool.category === "data"));
  assert.ok(EPHEMERAL_TOOL_IDS.has("jwt") && EPHEMERAL_TOOL_IDS.has("password") && EPHEMERAL_TOOL_IDS.has("random-bytes"));
  assert.ok(!EPHEMERAL_TOOL_IDS.has("json"));
});

test("search ranks intent matches first", () => {
  assert.equal(searchTools("验签", "zh-CN")[0].id, "jwt");
  assert.equal(searchTools("SM4 CBC", "zh-CN")[0].id, "sm4");
  assert.equal(searchTools("crontab", "zh-CN")[0].id, "cron");
  assert.equal(searchTools("decode token", "en")[0].id, "jwt");
  assert.equal(searchTools("去重", "zh-CN")[0].id, "whitespace");
  assert.equal(searchTools("ランダムパスワード", "ja")[0].id, "password");
  assert.equal(searchTools("contraseña aleatoria", "es")[0].id, "password");
  assert.equal(searchTools("随机字节", "zh-CN")[0].id, "random-bytes");
  assert.equal(searchTools("random bytes", "en")[0].id, "random-bytes");
  assert.equal(searchTools("现代认证加密", "zh-CN").some((tool) => tool.id === "modern-aead"), false);
  assert.ok(searchTools("AES", "zh-CN").every((tool) => tool.catalogVisible !== false));
});

test("editor indentation preserves selections and supports outdent", () => {
  assert.deepEqual(indentSelection("abc", 1, 1), { value: "a  bc", start: 3, end: 3 });
  const source = "one\ntwo\nthree";
  const indented = indentSelection(source, 0, 8);
  assert.equal(indented.value, "  one\n  two\nthree");
  assert.equal(indentSelection(indented.value, indented.start, indented.end, true).value, source);
  assert.deepEqual(indentSelection("  one", 2, 2, true), { value: "one", start: 0, end: 0 });
  assert.equal(indentSelection("\nnext", 0, 1).value, "  \nnext");
  assert.deepEqual(indentSelection("  abc\n  def", 0, 0, true), { value: "abc\n  def", start: 0, end: 0 });
  assert.deepEqual(indentSelection("  abc\n  def", 1, 1, true), { value: "abc\n  def", start: 0, end: 0 });
  assert.deepEqual(indentSelection("  abc\n  def", 0, 7, true), { value: "abc\ndef", start: 0, end: 4 });
});

test("JSON editor uses one CodeMirror layout for text, highlighting, selection, and wrapping", () => {
  const source = readFileSync(new URL("../src/lib/JsonCodeEditor.svelte", import.meta.url), "utf8");
  const assetModules = readFileSync(new URL("../src/lib/assetModules.js", import.meta.url), "utf8");
  const workbench = readFileSync(new URL("../src/lib/JsonWorkbench.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(source, /maxlength=\{maxLength\}/);
  assert.match(source, /await import\("\.\/lazy\/codemirror\.js"\)/);
  assert.match(source, /loadAssetModule\("codemirror"\)/);
  assert.match(assetModules, /"codemirror"/);
  assert.match(source, /mode: "application\/json"/);
  assert.match(source, /lineWrapping: true/);
  assert.match(source, /lineNumbers: showLineNumbers/);
  assert.match(source, /foldGutter: true/);
  assert.doesNotMatch(source, /json-highlight|CSS\.highlights|<pre/);
  assert.match(workbench, /style:--json-editor-bottom-space="\{textActionsHeight \+ 24\}px"/);
  assert.match(workbench, /\.json-text-actions \{\s+position: absolute;/);
});

test("OCR quality controls follow the installed model tiers", () => {
  const source = readFileSync(new URL("../src/lib/ImageOcrView.svelte", import.meta.url), "utf8");
  assert.match(source, /import Select from "\.\/Select\.svelte";/);
  assert.match(source, /<Select bind:value=\{quality\} options=\{qualityOptions\} disabled=\{!models\?\.base\?\.installed\|\|modelBusy\}/);
  assert.match(source, /\{value:"accurate",label:[^\n]+disabled:!models\?\.accurate\?\.installed\}/);
});

test("OCR model cancellation ignores repeated clicks while a request is pending", () => {
  const source = readFileSync(new URL("../src/lib/ImageOcrView.svelte", import.meta.url), "utf8");
  assert.match(source, /if\(!modelSessionId\|\|modelCancelling\)return/);
  assert.match(source, /modelInstallController\?\.abort\(\)/);
  assert.match(source, /signal:installController\.signal/);
  assert.match(source, /disabled=\{modelCancelling\} onclick=\{cancelModelDownload\}/);
});

test("completed OCR model installs use a compact transient notice", () => {
  const source = readFileSync(new URL("../src/lib/ImageOcrView.svelte", import.meta.url), "utf8");
  assert.match(source, /class="model-notice" role="status"/);
  assert.match(source, /showModelNotice\(t\("模型安装完成","Model installation complete"\)\)/);
  assert.match(source, /setTimeout\(\(\)=>\{modelStatus="";modelNoticeTimer=null;\},3000\)/);
  assert.match(source, /\{#if modelBusy\}<div class="model-progress" role="status">/);
  assert.doesNotMatch(source, /modelBusy\|\|modelStatus/);
});

test("RSA and SM2 tools do not expose an in-page algorithm switch", () => {
  const source = readFileSync(new URL("../src/lib/CipherView.svelte", import.meta.url), "utf8");
  assert.match(source, /algorithm = asymmetricCipherProfile\(toolId\)/);
  assert.doesNotMatch(source, /bind:value=\{algorithm\}[\s\S]*value: "rsa"[\s\S]*value: "sm2"/);
  assert.match(source, /\{#if algorithm === "rsa"\}/);
});
