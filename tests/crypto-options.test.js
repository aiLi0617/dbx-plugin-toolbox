import assert from "node:assert/strict";
import test from "node:test";
import { domainToASCII, domainToUnicode } from "node:url";
import { inspectJwtClaims, parseQuery, punycodePair, symmetricParams, runSymmetricDetailed } from "../src/lib/tools/encode.js";

test("Punycode accepts Unicode and ACE input and restores Unicode labels", () => {
  for (const name of ["例子.example", "bücher.de", "日本語.jp", "مثال.إختبار", "mañana.com", "😎.example", "例子。中国", "example.com."]) {
    const ace = domainToASCII(name);
    const expected = { ace, unicode: domainToUnicode(ace) };
    assert.deepEqual(punycodePair(name), expected);
    assert.deepEqual(punycodePair(ace), expected);
  }
  assert.deepEqual(punycodePair(""), { ace: "", unicode: "" });
  for (const invalid of ["xn--.example", "not a domain", "https://example.com", "example.com:8080"]) {
    assert.throws(() => punycodePair(invalid));
  }
});

test("query parsing accepts naked, prefixed, absolute and relative query strings", () => {
  const rows = [["a", "1"], ["a", "2"], ["label", "hello world"], ["empty", ""]];
  for (const text of ["a=1&a=2&label=hello+world&empty=", "?a=1&a=2&label=hello+world&empty=", "https://example.com/p?a=1&a=2&label=hello+world&empty=", "/p?a=1&a=2&label=hello+world&empty="]) {
    assert.deepEqual(parseQuery(text).rows, rows);
  }
  assert.deepEqual(parseQuery("a=%26%3D#section"), { href: "", hash: "#section", rows: [["a", "&="]] });
  assert.equal(parseQuery("/relative/path").href, "/relative/path");
});

test("JWT time inspection rejects invalid claims without crashing", () => {
  for (const exp of [1e300, Infinity, "100", null, {}, []]) {
    const claims = inspectJwtClaims({ exp }, 100_000);
    assert.deepEqual(claims.invalid, ["exp"]);
    assert.equal(claims.exp, "");
    assert.equal(claims.expired, null);
  }
  assert.equal(inspectJwtClaims({ exp: 0 }, 100_000).expired, true);
  assert.equal(inspectJwtClaims({ nbf: null }).active, null);
  assert.deepEqual(inspectJwtClaims({}).invalid, []);
});

test("advanced request forwards only applicable parameters and keeps vault keys opaque", async () => {
  const opts = { op: "decrypt", algorithm: "aes-128", mode: "gcm", payloadFormat: "separate", cipherEncoding: "hex", plainEncoding: "base64", parameterEncoding: "base64", iv: "aXY=", tag: "dGFn", aad: "test", aadEncoding: "utf8" };
  let captured;
  globalThis.window = { dbxPlugin: { invoke: async (method, params) => { captured = { method, params }; return { text: "aGVsbG8=", textEncoding: "base64" }; } } };
  const output = await runSymmetricDetailed("1234", opts, { keyId: "vault-key", keyMaterial: "never forward" });
  assert.equal(output.text, "aGVsbG8=");
  assert.equal(captured.method, "toolbox/crypto");
  assert.deepEqual(captured.params, { action: "decrypt", algorithm: "aes-128", mode: "gcm", text: "1234", payloadFormat: "separate", cipherEncoding: "hex", plainEncoding: "base64", parameterEncoding: "base64", iv: "aXY=", tag: "dGFn", aad: "test", aadEncoding: "utf8", keyId: "vault-key" });
  const ecb = symmetricParams("hello", { ...opts, algorithm: "sm4-128", sm4Mode: "ecb" }, { keyId: "sm4-key" });
  for (const name of ["iv", "tag", "aad", "aadEncoding", "keyMaterial"]) assert.ok(!(name in ecb));
  assert.deepEqual(symmetricParams("hello", {}, { keyId: "key" }), { action: "encrypt", algorithm: "aes-256", mode: "gcm", text: "hello", keyId: "key" });
  delete globalThis.window;
});
