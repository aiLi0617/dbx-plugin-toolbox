import assert from "node:assert/strict";
import test from "node:test";
import { localizeError } from "../src/lib/i18n.js";
import { precisionErrorMessage, UnsafeNumberError } from "../src/lib/jsonPrecision.js";
import { SIDECAR_ERRORS } from "../src/lib/i18nErrors.js";
import { SUPPORTED_LOCALES } from "../src/lib/locale.js";
import { UI_MESSAGES } from "../src/lib/uiMessages.js";
import { readFileSync, readdirSync } from "node:fs";

test("already localized validation messages are not replaced by the generic error", () => {
  for (const source of ["Passwords do not match", "Provide a key"]) {
    for (const locale of SUPPORTED_LOCALES) {
      const message = UI_MESSAGES[source]?.[locale];
      assert.ok(message, `${source}: ${locale}`);
      assert.equal(localizeError(locale, new Error(message)), message, `${source}: ${locale}`);
    }
  }
  assert.equal(localizeError("zh-CN", "主密码至少 8 位"), "主密码至少 8 位");
  const secret = "内部错误：password=never-display-this";
  assert.doesNotMatch(localizeError("zh-CN", secret), /never-display-this/);
  assert.doesNotMatch(localizeError("zh-CN", secret), /技术详情/);
});

test("literal backend validation errors have specific UI messages, not a generic fallback", () => {
  const directory = new URL("../backend/src/", import.meta.url);
  const missing = [];
  // Port errors have a dedicated code-to-message handler in PortProcessesView.
  for (const file of readdirSync(directory).filter((name) => name.endsWith(".rs") && !name.startsWith("ports"))) {
    const source = readFileSync(new URL(file, directory), "utf8");
    for (const [, message] of source.matchAll(/\b(?:err|bad|internal|asset_error)\(\s*"([^"\n]+)"\s*[,)]/g)) {
      for (const locale of SUPPORTED_LOCALES.filter((item) => item !== "en")) {
        if (localizeError(locale, message) === localizeError(locale, "__unknown_error__")) missing.push(`${file}: ${locale}: ${message}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("OCR model failures are categorized without leaking paths or network details", () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [raw, key] of [
      ["OCR model recognition-server-opset13.rten is not installed", "OCR_MODEL_MISSING"],
      ["OCR model detection-ppocrv5.rten failed SHA-256 verification", "OCR_MODEL_INTEGRITY"],
      ["Could not download OCR model: secret-network-details", "OCR_MODEL_NETWORK"],
      ["OCR model server returned HTTP 403", "OCR_MODEL_NETWORK"],
      ["Could not write the OCR model: secret-path-details", "OCR_MODEL_IO"],
    ]) {
      const result = localizeError(locale, raw);
      assert.equal(result, SIDECAR_ERRORS[key][locale]);
      assert.doesNotMatch(result, /secret-network-details|secret-path-details/);
    }
  }
});

test("vault authentication failures have an actionable translation in every locale", () => {
  const raw = "Wrong master password or vault data is corrupt";
  for (const locale of SUPPORTED_LOCALES) {
    const expected = SIDECAR_ERRORS[raw][locale];
    assert.ok(expected, `missing vault authentication translation for ${locale}`);
    assert.equal(localizeError(locale, new Error(raw)), expected);
  }
  assert.match(localizeError("zh-CN", { message: raw }), /主密码不正确.*数据已损坏/);
});

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

test("unknown failures never expose an English-only primary message in non-English locales", () => {
  const raw = "An implementation-specific backend failure";
  assert.equal(localizeError("en", raw), raw);
  for (const locale of ["zh-CN", "zh-TW", "es", "it", "ja", "pt-BR", "ko", "tr", "az"]) {
    assert.notEqual(localizeError(locale, raw), raw, locale);
    assert.ok(localizeError(locale, raw).length > 8, locale);
  }
});
