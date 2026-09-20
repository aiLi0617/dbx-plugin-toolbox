import assert from "node:assert/strict";
import test from "node:test";
import { localizeError } from "../src/lib/i18n.js";
import { precisionErrorMessage, UnsafeNumberError } from "../src/lib/jsonPrecision.js";

test("JSON control-character SyntaxError is localized for zh and kept clear for en", () => {
  const raw = 'Bad control character in string literal in JSON at position 14 (line 1 column 15)';
  assert.match(localizeError("zh-CN", raw), /未转义的控制字符/);
  assert.match(localizeError("zh-CN", raw), /第 1 行第 15 列/);
  assert.match(localizeError("en", raw), /Bad control character/);
  assert.match(localizeError("en", raw), /position 14/);
});

test("common JSON.parse messages localize through precisionErrorMessage", () => {
  for (const [raw, zhPart] of [
    ["Unexpected end of JSON input", /不完整/],
    ["Unterminated string in JSON at position 13 (line 1 column 14)", /未正确结束/],
    ["Expected property name or '}' in JSON at position 1 (line 1 column 2)", /属性名/],
    ["Unexpected non-whitespace character after JSON at position 7 (line 1 column 8)", /多余字符/],
    ["Unexpected token ']', \"[1,2,]\" is not valid JSON", /意外的/],
  ]) {
    assert.match(precisionErrorMessage(new SyntaxError(raw), "zh-CN"), zhPart);
    assert.ok(precisionErrorMessage(new SyntaxError(raw), "en").length > 0);
  }
});

test("Firefox-style JSON.parse messages localize", () => {
  const raw = "JSON.parse: bad control character in string literal at line 1 column 15 of the JSON data";
  assert.match(localizeError("zh-CN", raw), /未转义的控制字符/);
  assert.match(localizeError("zh-CN", raw), /第 1 行第 15 列/);
});

test("JSON string-escape helper errors localize", () => {
  assert.match(localizeError("zh-CN", "Text is not a valid JSON string escape"), /JSON 字符串转义/);
  assert.match(localizeError("zh-CN", "Text is not an escaped JSON string"), /\\n/);
  assert.match(localizeError("en", "Text is not a valid JSON string escape"), /control characters/);
});

test("unsafe-number and NDJSON nested errors still localize", () => {
  assert.match(precisionErrorMessage(new UnsafeNumberError("9007199254740993"), "zh-CN"), /无法无损转换/);
  assert.match(
    localizeError("zh-CN", 'Invalid NDJSON at line 2: Bad control character in string literal in JSON at position 3'),
    /第 2 行 NDJSON 无效/,
  );
});

test("XML object-key and validator details localize", () => {
  assert.equal(
    localizeError("zh-CN", "Cannot represent these object keys as XML: Tag '123' is an invalid name."),
    "这些对象键无法表示为 XML：标签「123」不是有效的 XML 名称",
  );
  assert.equal(
    localizeError("en", "Cannot represent these object keys as XML: Tag '123' is an invalid name."),
    "Cannot represent these object keys as XML: Tag '123' is an invalid name.",
  );
  assert.equal(localizeError("zh-CN", "Tag 'foo bar' is an invalid name."), "标签「foo bar」不是有效的 XML 名称");
  assert.equal(localizeError("zh-CN", "Attribute '@' is an invalid name."), "属性「@」不是有效的 XML 名称");
  assert.equal(localizeError("zh-CN", "Invalid XML"), "XML 无效");
  assert.equal(
    localizeError("zh-CN", "TOML needs an object at the document root. Wrap the data in a named property first."),
    "TOML 文档根须为对象，请先用命名属性包一层",
  );
  assert.equal(
    localizeError("zh-CN", "Date/time at $.when cannot be converted without changing its type. Quote it as a string first."),
    "$.when 处的日期/时间无法原样转换，请先写成字符串",
  );
});

test("crypto sidecar errors localize for cipher tools", () => {
  assert.equal(localizeError("zh-CN", "AES-GCM decrypt failed"), "AES-GCM 解密失败（密钥、nonce、tag 或密文可能不正确）");
  assert.equal(localizeError("zh-CN", "Ciphertext is too short"), "密文过短，不是有效的封装格式");
  assert.equal(localizeError("zh-CN", "Nonce must be 12 bytes"), "Nonce 必须是 12 字节");
  assert.equal(localizeError("zh-CN", "IV must be 16 bytes"), "IV 必须是 16 字节");
  assert.equal(localizeError("zh-CN", "GCM tag must be 16 bytes"), "GCM tag 必须是 16 字节");
  assert.equal(localizeError("zh-CN", "Provide keyId or keyMaterial"), "请提供密钥或从密钥库选择");
  assert.match(localizeError("zh-CN", "Crypto input exceeds the 16777216 byte input limit"), /加密输入超过/);
  assert.equal(localizeError("en", "AES-GCM decrypt failed"), "AES-GCM decrypt failed");
  assert.match(localizeError("ja", "AES-GCM decrypt failed"), /AES-GCM/);
  assert.match(localizeError("zh-TW", "Key vault is locked"), /金鑰庫|鎖定/);
  assert.match(localizeError("es", "Wrong master password"), /contraseña/i);
});

test("crypto input limit messages are bilingual", async () => {
  const { INPUT_LIMITS, inputLimitError } = await import("../src/lib/inputLimits.js");
  assert.equal(INPUT_LIMITS.crypto, 16_000_000);
  assert.equal(
    inputLimitError("x".repeat(INPUT_LIMITS.crypto + 1), INPUT_LIMITS.crypto, { locale: "zh-CN", zh: "明文", en: "Plaintext" }),
    "明文不能超过 16,000,000 个字符",
  );
  assert.equal(
    inputLimitError("x".repeat(INPUT_LIMITS.crypto + 1), INPUT_LIMITS.crypto, { locale: "en", zh: "明文", en: "Plaintext" }),
    "Plaintext is limited to 16,000,000 characters",
  );
  assert.equal(inputLimitError("ok", INPUT_LIMITS.crypto, { locale: "zh-CN", zh: "明文", en: "Plaintext" }), "");
});
