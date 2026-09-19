import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TOOL_IDS } from "../src/lib/viewRegistry.js";

test("frontend registry ids are accepted by the Rust preference route", () => {
  const source = fs.readFileSync(
    new URL("../backend/src/prefs.rs", import.meta.url),
    "utf8",
  );
  const block =
    source.match(/const KNOWN_TOOL_IDS: &[^=]+ = &\[(.*?)\];/s)?.[1] || "";
  const backendIds = new Set(
    [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1]),
  );
  assert.ok(backendIds.size > 0);
  for (const id of TOOL_IDS)
    assert.ok(
      backendIds.has(id),
      `frontend tool id missing from backend allow-list: ${id}`,
    );
});
