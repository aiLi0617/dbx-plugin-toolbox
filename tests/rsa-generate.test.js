import test from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey } from "node:crypto";
import {
  generateRsaKeyPairPem,
  generateSymmetricKeyMaterial,
  unwrapPkcs8ToPkcs1,
  unwrapSpkiToPkcs1,
} from "../src/lib/tools/generate.js";

test("WebCrypto RSA PKCS#8/SPKI PEMs are importable", async () => {
  const pair = await generateRsaKeyPairPem(2048, "pkcs8");
  assert.match(pair.privateKey, /BEGIN PRIVATE KEY/);
  assert.match(pair.publicKey, /BEGIN PUBLIC KEY/);
  assert.doesNotThrow(() => createPrivateKey(pair.privateKey));
  assert.doesNotThrow(() => createPublicKey(pair.publicKey));
  assert.equal(pair.bits, 2048);
  assert.equal(pair.format, "pkcs8");
});

test("WebCrypto RSA PKCS#1 PEMs unwrap from PKCS#8/SPKI", async () => {
  const pair = await generateRsaKeyPairPem(2048, "pkcs1");
  assert.match(pair.privateKey, /BEGIN RSA PRIVATE KEY/);
  assert.match(pair.publicKey, /BEGIN RSA PUBLIC KEY/);
  assert.doesNotThrow(() => createPrivateKey(pair.privateKey));
  assert.doesNotThrow(() => createPublicKey(pair.publicKey));
  assert.equal(pair.format, "pkcs1");
});

test("ASN.1 unwrap helpers extract PKCS#1 bodies", async () => {
  const subtle = globalThis.crypto.subtle;
  const pair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", pair.privateKey));
  const spki = new Uint8Array(await subtle.exportKey("spki", pair.publicKey));
  const pkcs1Private = unwrapPkcs8ToPkcs1(pkcs8);
  const pkcs1Public = unwrapSpkiToPkcs1(spki);
  assert.equal(pkcs1Private[0], 0x30);
  assert.equal(pkcs1Public[0], 0x30);
  assert.ok(pkcs1Private.length < pkcs8.length);
  assert.ok(pkcs1Public.length < spki.length);
});

test("symmetric key material matches algorithm byte lengths", () => {
  const lengths = {
    "aes-256": 64,
    "aes-128": 32,
    "sm4-128": 32,
    "hmac-sha1": 40,
    "hmac-sha256": 64,
    "hmac-sha384": 96,
    "hmac-sha512": 128,
    "hmac-sm3": 64,
  };
  for (const [algorithm, hexLen] of Object.entries(lengths)) {
    const { material, bytes } = generateSymmetricKeyMaterial(algorithm);
    assert.equal(material.length, hexLen);
    assert.equal(bytes * 2, hexLen);
    assert.match(material, /^[0-9a-f]+$/);
  }
  assert.throws(() => generateSymmetricKeyMaterial("rsa-pem"), /Unsupported/);
});

test("RSA generate rejects unsupported bit lengths", async () => {
  await assert.rejects(() => generateRsaKeyPairPem(1024, "pkcs8"), /2048, 3072, or 4096/);
});
