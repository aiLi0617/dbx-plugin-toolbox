import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TOOL_IDS, TOOL_REGISTRY } from "../src/lib/viewRegistry.js";
import { assertDemoCoverage } from "../src/lib/demoCatalog.js";

test("frontend registry is forward-compatible with the Rust preference route", () => {
  const source = fs.readFileSync(
    new URL("../backend/src/prefs.rs", import.meta.url),
    "utf8",
  );
  assert.match(source, /id\.len\(\) <= 80/);
  assert.match(source, /is_ascii_lowercase/);
  assert.equal(new Set(TOOL_IDS).size, TOOL_IDS.length);
});

test("all tools declare navigation, action, and demo metadata", () => {
  assert.equal(TOOL_REGISTRY.length, 48);
  assert.equal(TOOL_REGISTRY.filter((tool) => tool.kind === "shortcut").length, 0);
  assert.ok(assertDemoCoverage(TOOL_REGISTRY));
  for (const tool of TOOL_REGISTRY) {
    assert.ok(tool.loader, `missing loader: ${tool.id}`);
    if (tool.actions.includes("demo")) assert.ok(tool.demoPreset, `missing demo preset: ${tool.id}`);
    if (tool.kind === "shortcut") assert.ok(TOOL_IDS.includes(tool.parentId), `missing parent: ${tool.id}`);
  }
  for (const id of ["uuid", "color", "cron", "timestamp", "chmod", "http-status"]) {
    assert.ok(!TOOL_REGISTRY.find((tool) => tool.id === id).actions.includes("demo"), `unexpected demo action: ${id}`);
  }
});

test("every demo-aware view consumes each demo request only once", () => {
  const libDir = new URL("../src/lib/", import.meta.url);
  const demoViews = fs.readdirSync(libDir)
    .filter((name) => name.endsWith(".svelte"))
    .map((name) => ({ name, source: fs.readFileSync(new URL(name, libDir), "utf8") }))
    .filter(({ source }) => /demoRequest\s*=\s*0/.test(source));

  assert.ok(demoViews.length > 0, "expected at least one demo-aware view");
  for (const { name, source } of demoViews) {
    assert.match(source, /let\s+appliedDemoRequest\s*=\s*0/, `${name} must track the consumed demo request`);
    assert.match(source, /demoRequest\s*===\s*appliedDemoRequest/, `${name} must ignore an already-consumed demo request`);
    assert.match(source, /appliedDemoRequest\s*=\s*demoRequest/, `${name} must consume the request before mutating editor state`);
  }

  for (const tool of TOOL_REGISTRY.filter((item) => item.actions.includes("demo"))) {
    const componentPath = String(tool.loader).match(/import\(["'](.+\.svelte)["']\)/)?.[1];
    assert.ok(componentPath, `cannot identify demo component for ${tool.id}`);
    const source = fs.readFileSync(new URL(componentPath, libDir), "utf8");
    assert.match(source, /demoRequest\s*=\s*0/, `${tool.id} advertises Demo but its view does not consume demoRequest`);
  }
});
