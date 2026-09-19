import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  decodeBase64Url,
  encodeBase64Url,
  parseJwkDocument,
  selectJwk,
  serializeJwkDocument,
  jwkToPem,
  pemToJwk,
} from "../src/lib/jwk.js";

const RSA_PUBLIC = {
  kty: "RSA",
  kid: "primary",
  n: "sXchY0hHdG9vbG9uZw",
  e: "AQAB",
  alg: "RS256",
};

test("JWK and JWKS validation preserves key ids and canonical serialization", () => {
  const document = parseJwkDocument(JSON.stringify({ keys: [RSA_PUBLIC] }));
  assert.equal(document.type, "jwks");
  assert.equal(selectJwk(document, "primary").alg, "RS256");
  assert.match(serializeJwkDocument(document), /"keys"/);
  assert.deepEqual([...decodeBase64Url("AQAB")], [1, 0, 1]);
  assert.equal(encodeBase64Url(Uint8Array.from([1, 0, 1])), "AQAB");
});

test("JWK validation rejects unsupported key types and duplicate JWKS kids", () => {
  assert.throws(
    () => parseJwkDocument(JSON.stringify({ kty: "BAD", x: "AQ" })),
    /Unsupported JWK kty/,
  );
  assert.throws(
    () => parseJwkDocument(JSON.stringify({ keys: [RSA_PUBLIC, RSA_PUBLIC] })),
    /duplicate kid/,
  );
});

test("RSA PKCS#8/SPKI PEM round trips through WebCrypto JWK", async () => {
  const { publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const jwk = await pemToJwk(publicKey);
  assert.equal(jwk.kty, "RSA");
  assert.match(await jwkToPem(jwk), /BEGIN PUBLIC KEY/);
});
