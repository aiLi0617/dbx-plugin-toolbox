import test from "node:test";
import assert from "node:assert/strict";

import { matchKey, normalizeVaultKey } from "../src/lib/keySource.js";

test("legacy keys require explicit opt-in for XOR even with old backend metadata", () => {
  const key = normalizeVaultKey({ algorithm: "sm4-128", allowedPurposes: null, effectivePurposes: ["sm4-cipher", "debug-xor"] });
  assert.deepEqual(key.effectivePurposes, ["sm4-cipher"]);
  assert.equal(matchKey(key, "xor"), false);
  const enabled = normalizeVaultKey({ algorithm: "sm4-128", allowedPurposes: ["sm4-cipher", "debug-xor"] });
  assert.equal(matchKey(enabled, "xor"), true);
  assert.deepEqual(normalizeVaultKey({ algorithm: "sm4-128", allowedPurposes: [] }).effectivePurposes, []);
});

test("HMAC picker accepts keys saved for every supported HMAC digest", () => {
  for (const algorithm of [
    "hmac",
    "hmac-sha1",
    "hmac-sha256",
    "hmac-sha384",
    "hmac-sha512",
    "hmac-sm3",
  ]) {
    assert.equal(matchKey({ algorithm }, "hmac"), true, algorithm);
  }

  assert.equal(matchKey({ algorithm: "aes-256" }, "hmac"), false);
  assert.equal(matchKey({ algorithm: "sm4-128" }, "hmac"), false);
});
