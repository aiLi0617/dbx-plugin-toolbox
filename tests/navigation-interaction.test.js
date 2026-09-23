import test from "node:test";
import assert from "node:assert/strict";
import { indentSelection } from "../src/lib/editorIndent.js";
import { tools, searchTools } from "../src/lib/catalog.js";
import { toolOptionsForQuery, EPHEMERAL_TOOL_IDS, resolveIntent } from "../src/lib/navigation.js";

test("merged tool searches open the requested operation", () => {
  assert.deepEqual(toolOptionsForQuery("uuid", "ULID"), { kind: "ulid" });
  assert.deepEqual(toolOptionsForQuery("aes", "SM4 CBC 解密"), { algorithm: "sm4-128", mode: "cbc", op: "decrypt" });
  assert.deepEqual(toolOptionsForQuery("hmac-sha256", "HMAC-SHA512"), { algorithm: "hmac-sha512" });
  assert.deepEqual(toolOptionsForQuery("hmac-sha256", "sm3"), { algorithm: "hmac-sm3" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "YAML → JSON"), { from: "yaml", to: "json" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "JSON 转 TOML"), { from: "json", to: "toml" });
  assert.deepEqual(toolOptionsForQuery("json", "JSONPath 提取"), { mode: "extract" });
  assert.deepEqual(toolOptionsForQuery("code-format", "TS"), { language: "typescript" });
  assert.deepEqual(toolOptionsForQuery("timestamp", "时间差"), { action: "difference" });
  assert.deepEqual(toolOptionsForQuery("uuid", ""), {});
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
  assert.deepEqual(toolOptionsForQuery("hash", "md5 16"), { algorithm: "md5-16" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha224"), { algorithm: "sha224" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha3"), { algorithm: "sha3-256" });
  assert.deepEqual(toolOptionsForQuery("hash", "sha256"), { algorithm: "sha256" });
  assert.deepEqual(toolOptionsForQuery("base64", "base64 decode"), { format: "base64", op: "decode" });
  assert.deepEqual(toolOptionsForQuery("qrcode", "二维码识别"), { mode: "decode" });
  assert.deepEqual(toolOptionsForQuery("image-process", "裁剪"), { op: "crop" });
  assert.equal(resolveIntent("去重")[0]?.toolId, "whitespace");
  assert.deepEqual(resolveIntent("去重")[0]?.options, { action: "unique" });
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
  assert.ok(searchTools("SM4 CBC", "zh-CN").some((tool) => tool.id === "aes"));
  assert.equal(searchTools("ULID", "zh-CN")[0].id, "uuid");
  assert.ok(tools.some((tool) => tool.id === "data-convert" && tool.category === "format"));
  assert.ok(EPHEMERAL_TOOL_IDS.has("jwt") && EPHEMERAL_TOOL_IDS.has("password"));
  assert.ok(!EPHEMERAL_TOOL_IDS.has("json"));
});

test("search ranks intent matches first", () => {
  assert.equal(searchTools("验签", "zh-CN")[0].id, "jwt");
  assert.equal(searchTools("SM4 CBC", "zh-CN")[0].id, "aes");
  assert.equal(searchTools("crontab", "zh-CN")[0].id, "cron");
  assert.equal(searchTools("decode token", "en")[0].id, "jwt");
  assert.equal(searchTools("去重", "zh-CN")[0].id, "whitespace");
  assert.equal(searchTools("ランダムパスワード", "ja")[0].id, "password");
  assert.equal(searchTools("contraseña aleatoria", "es")[0].id, "password");
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
