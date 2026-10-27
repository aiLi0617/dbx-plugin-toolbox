import assert from "node:assert/strict";
import test from "node:test";
import { readCipherDefaults, saveCipherDefaults, clearCipherDefaults, resolveCipherDefaults } from "../src/lib/cipherDefaults.js";

test("SM4 defaults survive reopening, remain isolated, and reset to factory settings", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  try {
    saveCipherDefaults("aes", "sm4", {
      op: "decrypt", sm4Mode: "ecb", mode: "gcm", payloadFormat: "separate",
      cipherEncoding: "hex", keyEncoding: "hex", source: "vault",
      material: "secret", keyId: "private-id", input: "phone", output: "ciphertext",
      iv: "fixed-iv", tag: "tag", aad: "private-context",
    });
    const saved = readCipherDefaults("aes", "sm4");
    assert.deepEqual(saved, {
      op: "decrypt", mode: "gcm", sm4Mode: "ecb", source: "vault", keyEncoding: "hex",
      payloadFormat: "separate", cipherEncoding: "hex",
    });
    const reopened = resolveCipherDefaults("aes", "sm4", saved);
    assert.equal(reopened.sm4Mode, "ecb");
    assert.equal(reopened.op, "decrypt");
    assert.equal(reopened.cipherEncoding, "hex");
    assert.equal(resolveCipherDefaults("aes", "aes", readCipherDefaults("aes", "aes")).mode, "gcm");
    assert.equal(resolveCipherDefaults("aes", "sm4", saved, { mode: "cbc", op: "encrypt" }).sm4Mode, "cbc");
    saveCipherDefaults("aes", "aes", { mode: "ctr" });
    clearCipherDefaults("aes", "sm4");
    assert.deepEqual(readCipherDefaults("aes", "sm4"), {});
    assert.equal(resolveCipherDefaults("aes", "sm4", readCipherDefaults("aes", "sm4")).sm4Mode, "cbc");
    assert.equal(readCipherDefaults("aes", "aes").mode, "ctr");
  } finally {
    delete globalThis.localStorage;
  }
});

test("malformed settings and unavailable storage safely fall back; failed writes are reported", () => {
  globalThis.localStorage = { getItem: () => "invalid json" };
  try {
    assert.deepEqual(readCipherDefaults("aes", "sm4"), {});
    globalThis.localStorage.getItem = () => '{"op":"invalid","mode":"unknown","keyEncoding":{},"cipherEncoding":"hex"}';
    assert.deepEqual(readCipherDefaults("aes", "sm4"), { cipherEncoding: "hex" });
    const config = resolveCipherDefaults("aes", "sm4", { algorithm: "aes-256", mode: "gcm", sm4Mode: "gcm" });
    assert.equal(config.algorithm, "sm4-128");
    assert.equal(config.sm4Mode, "cbc");
    assert.equal(resolveCipherDefaults("rsa", "rsa-oaep", { padding: "pkcs1" }).padding, "oaep");
    assert.equal(resolveCipherDefaults("rsa", "sm2").algorithm, "sm2");
    globalThis.localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    assert.deepEqual(readCipherDefaults("aes", "sm4"), {});
    assert.throws(() => saveCipherDefaults("aes", "sm4", {}), /blocked/);
    assert.throws(() => clearCipherDefaults("aes", "sm4"), /blocked/);
  } finally {
    delete globalThis.localStorage;
  }
});
