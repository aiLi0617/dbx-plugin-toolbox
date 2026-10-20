import assert from "node:assert/strict";
import test from "node:test";
import { AES_ALGORITHMS, AES_MODES, SM4_MODES, asymmetricCipherProfile, symmetricCipherProfile } from "../src/lib/cipherProfile.js";
import { hasParameterSupportLevels, parameterSupportLevel } from "../src/lib/cryptoCapabilities.js";

test("AES and SM4 entries expose disjoint algorithms and supported modes", () => {
  assert.deepEqual(AES_ALGORITHMS.map((item) => item.value), ["aes-256", "aes-192", "aes-128"]);
  assert.deepEqual(AES_MODES.map((item) => item.value), ["gcm", "cbc", "ctr", "ecb"]);
  assert.deepEqual(SM4_MODES.map((item) => item.value), ["cbc", "ecb"]);

  assert.deepEqual(symmetricCipherProfile("aes", { algorithm: "sm4-128", mode: "cbc" }), {
    algorithm: "aes-256",
    mode: "cbc",
    sm4Mode: "cbc",
  });
  assert.deepEqual(symmetricCipherProfile("sm4", { algorithm: "aes-128", mode: "gcm" }), {
    algorithm: "sm4-128",
    mode: "cbc",
    sm4Mode: "cbc",
  });
  assert.equal(symmetricCipherProfile("sm4", { mode: "ecb" }).sm4Mode, "ecb");
  assert.equal(symmetricCipherProfile("sm4", { mode: "cfb" }).sm4Mode, "cbc");
});

test("mixed-support algorithm choices use capability metadata as the single source", () => {
  assert.equal(parameterSupportLevel("aes", "mode", "gcm"), "recommended");
  assert.equal(parameterSupportLevel("aes", "mode", "cbc"), "compatibility");
  assert.equal(parameterSupportLevel("aes", "mode", "ecb"), "compatibility");
  assert.equal(parameterSupportLevel("rsa-oaep", "hash", "sha1"), "compatibility");
  assert.equal(parameterSupportLevel("rsa-oaep", "hash", "sha256"), "recommended");
  assert.equal(parameterSupportLevel("hmac-sha256", "hash", "sha1"), "compatibility");
  assert.equal(hasParameterSupportLevels("aes"), true);
  assert.equal(hasParameterSupportLevels("rsa-pkcs1"), false);
});

test("RSA and SM2 entries select disjoint asymmetric algorithms", () => {
  assert.equal(asymmetricCipherProfile("rsa"), "rsa");
  assert.equal(asymmetricCipherProfile("sm2"), "sm2");
  assert.equal(asymmetricCipherProfile("unknown"), "rsa");
});
