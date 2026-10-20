import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import manifest from "../src/lib/crypto-capabilities.json" with { type: "json" };
import { CRYPTO_CAPABILITIES, MODERN_AEAD_BY_TOOL, KDF_BY_TOOL, SIGNATURE_BY_TOOL, AES_MAC_BY_TOOL } from "../src/lib/cryptoCapabilities.js";
import { tools } from "../src/lib/catalog.js";
import { compatibleKeys, matchKey, normalizeVaultKey } from "../src/lib/keySource.js";

test("shared crypto manifest covers every concrete crypto entry and required fields", () => {
  const concrete = tools.filter((tool) => tool.category === "security" && tool.capabilityId);
  for (const tool of concrete) {
    const capability = CRYPTO_CAPABILITIES[tool.capabilityId];
    assert.ok(capability, `missing capability: ${tool.id}`);
    for (const field of ["standardName", "group", "supportLevel", "operations", "keyTypes", "parameters", "encodings", "purpose"]) {
      assert.notEqual(capability[field], undefined, `${tool.id}.${field}`);
    }
  }
  assert.equal(Object.keys(CRYPTO_CAPABILITIES).length, manifest.capabilities.length);
  assert.deepEqual(Object.keys(MODERN_AEAD_BY_TOOL).sort(), ["aes-ccm", "aes-gcm-siv", "aes-siv", "chacha20-poly1305", "xchacha20-poly1305"]);
  assert.equal(Object.keys(KDF_BY_TOOL).length, 4);
  assert.equal(Object.keys(SIGNATURE_BY_TOOL).length, 3);
  assert.equal(Object.keys(AES_MAC_BY_TOOL).length, 3);
});

test("legacy vault metadata is derived from the shared key type manifest", () => {
  const key = normalizeVaultKey({ id: "old", name: "old AES", kind: "symmetric", algorithm: "aes-256", fingerprint: "abc" });
  assert.equal(key.displayType, "AES-256");
  assert.equal(key.bits, 256);
  assert.equal(key.format, "Hex");
  assert.deepEqual(key.effectivePurposes, ["aes-cipher", "aes-aead", "aes-key-wrap", "aes-ff1", "aes-mac", "debug-xor"]);
  assert.equal(key.supportLevel, "supported");
  assert.equal(key.legacyPurposeState, "pending");
});

test("vault key matching requires both type and allowed purpose", () => {
  const key = { algorithm: "aes-256", capabilities: ["aes-aead", "aes-cipher"], effectivePurposes: ["aes-cipher"] };
  assert.equal(matchKey(key, "aes", "aes-cipher"), true);
  assert.equal(matchKey(key, "aes", "aes-aead"), false);
  assert.equal(matchKey(key, "rsa-pem", "aes-cipher"), false);
  assert.equal(matchKey(key, "aes", "aes-cipher", ["aes-256"]), true);
  assert.equal(matchKey(key, "aes", "aes-cipher", ["aes-128"]), false);
  assert.deepEqual(
    compatibleKeys([key, { ...key, algorithm: "sm4-128" }], "aes", "aes-cipher", ["aes-256"]),
    [key],
  );
});

test("compatibility status stays out of parameter labels and recommendation banners", () => {
  const cipherView = readFileSync(new URL("../src/lib/CipherView.svelte", import.meta.url), "utf8");
  const specializedView = readFileSync(new URL("../src/lib/SpecializedCryptoView.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(cipherView, /仅用于兼容旧系统|新数据优先使用|不提供密文完整性保护/);
  assert.doesNotMatch(specializedView, /不提供完整性认证/);
  assert.doesNotMatch(cipherView, /强警告|ECB 会暴露重复数据模式/);
  assert.doesNotMatch(cipherView, /taggedOption|optionStatusLabel/);
  assert.match(cipherView, /onSupportLevelChange\?\.\(level\)/);
});

test("signature modes use shared page tabs and deterministic crypto tools update automatically", () => {
  const signatureView = readFileSync(new URL("../src/lib/SignatureView.svelte", import.meta.url), "utf8");
  const modernView = readFileSync(new URL("../src/lib/ModernCryptoView.svelte", import.meta.url), "utf8");
  const specializedView = readFileSync(new URL("../src/lib/SpecializedCryptoView.svelte", import.meta.url), "utf8");
  assert.match(signatureView, /class="dbx-tabs" role="tablist"/);
  assert.doesNotMatch(signatureView, /<Select bind:value=\{op\}/);
  assert.match(modernView, /let iterations = \$state\(2\)/);
  assert.match(modernView, /setTimeout\(async \(\) =>[\s\S]*}, 500\)/);
  assert.match(specializedView, /toolId === "key-wrap" \|\| toolId === "storage-crypto" \|\| toolId === "format-preserving" \|\| toolId === "aes-cmac"/);
  assert.match(specializedView, /: macOnly \? encodings : binaryEncodings/);
});

test("symmetric key labels distinguish byte length from hex character count", () => {
  const keyView = readFileSync(new URL("../src/lib/KeyView.svelte", import.meta.url), "utf8");
  assert.match(keyView, /hexCharacters = \$derived\(selected\.bytes \* 2\)/);
  assert.match(keyView, /Hex（\$\{hexCharacters\} 字符）/);
});
