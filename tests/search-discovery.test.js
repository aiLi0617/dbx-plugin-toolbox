import test from "node:test";
import assert from "node:assert/strict";

import { searchToolMatches, searchTools, tools } from "../src/lib/catalog.js";
import { pick, SUPPORTED_LOCALES } from "../src/lib/i18n.js";
import { navigationTargetFromContext } from "../src/lib/navigation.js";
import { HOME_INTENT_EXAMPLES, HOME_SEARCH_TEXT } from "../src/lib/searchIntent.js";

test("home search discovery copy is complete without task metadata", () => {
  for (const locale of SUPPORTED_LOCALES) {
    assert.ok(pick(locale, HOME_SEARCH_TEXT.tryQueries)?.trim(), `search prompt ${locale}`);
  }
  assert.ok(tools.every((tool) => !Object.hasOwn(tool, "taskIds")));
});

test("localized home examples resolve to their intended tool in every locale", () => {
  const expected = ["image-process", "json", "aes", "timestamp"];
  HOME_INTENT_EXAMPLES.forEach((query, index) => {
    for (const locale of SUPPORTED_LOCALES) {
      const hits = searchToolMatches(pick(locale, query), locale);
      assert.equal(hits[0]?.tool.id, expected[index], `${locale}: ${pick(locale, query)} ranks ${expected[index]} first`);
      if (index !== 1) assert.ok(hits.length > 1, `${locale}: broad examples offer multiple tools`);
      if (index === 3) assert.ok(hits.every((hit) => hit.tool.category === "calculate"));
    }
  });
});

test("search explanations preserve compatibility and deterministic ranking", () => {
  const matches = searchToolMatches("SM4 CBC", "zh-CN");
  assert.equal(matches[0].tool.id, "sm4");
  assert.equal(matches[0].matchKind, "intent");
  assert.ok(matches[0].matchLabel);
  assert.deepEqual(searchTools("SM4 CBC", "zh-CN").map((tool) => tool.id), matches.map((match) => match.tool.id));
  assert.equal(searchToolMatches("color", "en")[0].tool.id, "color");
  assert.equal(searchToolMatches("color", "en")[0].matchKind, "name");
  assert.equal(searchToolMatches("color", "en")[0].matchLabel, "");
  assert.equal(searchToolMatches("JSON 工作台", "zh-CN")[0].matchLabel, "");
});

test("broad intents expose multiple stable labeled paths", () => {
  const encryption = searchToolMatches("加密", "zh-CN").slice(0, 3);
  assert.deepEqual(encryption.map((match) => match.tool.id), ["aes", "sm4", "rsa-oaep"]);
  assert.ok(encryption.every((match) => match.matchLabel));

  const coding = searchToolMatches("解码", "zh-CN").slice(0, 3);
  assert.deepEqual(coding.map((match) => match.tool.id), ["base64", "url", "data-uri"]);
  assert.ok(coding.every((match) => match.matchLabel));

  const images = searchToolMatches("图片处理", "zh-CN").slice(0, 3);
  assert.deepEqual(images.map((match) => match.tool.id), ["image-process", "image-compress", "image-ocr"]);
});

test("workbench context ignores removed task metadata", () => {
  assert.deepEqual(navigationTargetFromContext({ page: "catalog", taskId: "image-processing" }), {
    page: "catalog",
    toolId: "",
    options: {},
  });
  assert.deepEqual(navigationTargetFromContext({ toolId: "url", taskId: "image-processing", options: { token: "never", mode: "decode" } }), {
    page: "tool",
    toolId: "url",
    options: { mode: "decode" },
  });
});
