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

test("EC and OKP accept named crv without treating it as base64url", () => {
  const ec = parseJwkDocument({
    kty: "EC",
    crv: "P-256",
    x: "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
    y: "x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0",
    kid: "ec-1",
  });
  assert.equal(ec.keys[0].crv, "P-256");
  const okp = parseJwkDocument({
    kty: "OKP",
    crv: "Ed25519",
    x: "11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo",
  });
  assert.equal(okp.keys[0].crv, "Ed25519");
  assert.throws(
    () => parseJwkDocument({ kty: "EC", x: "AQ", y: "AQ" }),
    /missing crv/,
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
