import test from "node:test";
import assert from "node:assert/strict";
import { indentSelection } from "../src/lib/editorIndent.js";
import { tools, searchTools } from "../src/lib/catalog.js";
import { toolOptionsForQuery, EPHEMERAL_TOOL_IDS } from "../src/lib/navigation.js";

test("merged tool searches open the requested operation", () => {
  assert.deepEqual(toolOptionsForQuery("uuid", "ULID"), { kind: "ulid" });
  assert.deepEqual(toolOptionsForQuery("aes", "SM4 CBC 解密"), { algorithm: "sm4-128", mode: "cbc", op: "decrypt" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "YAML → JSON"), { from: "yaml", to: "json" });
  assert.deepEqual(toolOptionsForQuery("data-convert", "JSON 转 TOML"), { from: "json", to: "toml" });
  assert.deepEqual(toolOptionsForQuery("code-format", "TS"), { language: "typescript" });
  assert.deepEqual(toolOptionsForQuery("timestamp", "时间差"), { action: "difference" });
  assert.deepEqual(toolOptionsForQuery("uuid", ""), {});
});

test("search finds localized categories and multiple keywords", () => {
  assert.ok(searchTools("安全与校验", "zh-CN").every((tool) => tool.category === "security"));
  assert.ok(searchTools("安全与校验", "zh-CN").length >= 8);
  assert.ok(searchTools("SM4 CBC", "zh-CN").some((tool) => tool.id === "aes"));
  assert.equal(searchTools("ULID", "zh-CN")[0].id, "uuid");
  assert.ok(tools.some((tool) => tool.id === "data-convert" && tool.category === "format"));
  assert.ok(EPHEMERAL_TOOL_IDS.has("jwt") && EPHEMERAL_TOOL_IDS.has("password"));
  assert.ok(!EPHEMERAL_TOOL_IDS.has("json"));
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
