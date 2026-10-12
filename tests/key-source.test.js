import test from "node:test";
import assert from "node:assert/strict";

import { matchKey } from "../src/lib/keySource.js";

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
