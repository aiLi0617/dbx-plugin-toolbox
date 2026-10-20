import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TOOL_IDS, TOOL_REGISTRY, viewPropsForTool } from "../src/lib/viewRegistry.js";
import { assertDemoCoverage, createToolDemo } from "../src/lib/demoCatalog.js";
import { canonicalToolId } from "../src/lib/catalog.js";

test("frontend registry is forward-compatible with the Rust preference route", () => {
  const source = fs.readFileSync(
    new URL("../backend/src/prefs.rs", import.meta.url),
    "utf8",
  );
  assert.match(source, /id\.len\(\) <= 80/);
  assert.match(source, /is_ascii_lowercase/);
  assert.equal(new Set(TOOL_IDS).size, TOOL_IDS.length);
});

test("legacy client diagnostics favorites migrate to device information", () => {
  assert.equal(canonicalToolId("client-diagnostics"), "device-info");
  assert.ok(TOOL_IDS.includes("user-agent"));
  assert.ok(TOOL_IDS.includes("device-info"));
  assert.ok(TOOL_IDS.includes("keyboard-event"));
  assert.ok(!TOOL_IDS.includes("client-diagnostics"));
});

test("all tools declare navigation, action, and demo metadata", () => {
  assert.ok(TOOL_REGISTRY.length >= 95);
  for (const id of ["aes", "sm4", "rsa", "sm2", "modern-aead", "kdf", "signature", "key-wrap", "storage-crypto", "format-preserving", "aes-mac", "hpke", "ml-kem"]) assert.ok(TOOL_IDS.includes(id), `missing crypto tool: ${id}`);
  assert.ok(TOOL_REGISTRY.filter((tool) => tool.kind === "shortcut").length >= 20);
  assert.ok(assertDemoCoverage(TOOL_REGISTRY));
  for (const tool of TOOL_REGISTRY) {
    assert.ok(tool.loader, `missing loader: ${tool.id}`);
    assert.ok(["live-io", "calculator", "editor", "file", "generator", "custom"].includes(tool.layoutKind), `invalid layout: ${tool.id}`);
    assert.ok(["live", "debounced", "explicit"].includes(tool.executionKind), `invalid execution: ${tool.id}`);
    if (tool.actions.includes("demo")) assert.ok(tool.demoPreset, `missing demo preset: ${tool.id}`);
    if (tool.kind === "shortcut") assert.ok(TOOL_IDS.includes(tool.parentId), `missing parent: ${tool.id}`);
  }
  for (const id of ["uuid", "color", "cron", "timestamp", "chmod", "http-status", "chart", "phone", "bandwidth"]) {
    assert.ok(!TOOL_REGISTRY.find((tool) => tool.id === id).actions.includes("demo"), `unexpected demo action: ${id}`);
  }
});

test("passwords and random bytes are distinct tools sharing one view", () => {
  const password = TOOL_REGISTRY.find((tool) => tool.id === "password");
  const randomBytes = TOOL_REGISTRY.find((tool) => tool.id === "random-bytes");
  assert.equal(password.view, "password");
  assert.equal(randomBytes.view, "password");
  assert.deepEqual(password.defaultOptions, { kind: "password" });
  assert.deepEqual(randomBytes.defaultOptions, { kind: "bytes" });
  assert.equal(password.executionKind, "explicit");
  assert.equal(randomBytes.executionKind, "explicit");
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

test("loading a demo updates mounted views without resetting their local mode", () => {
  const source = fs.readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
  assert.doesNotMatch(source, /#key[^\n]*demoRevisions/, "demo requests must not remount the active tool view");
});

test("App uses one normalized prop contract for every tool view", () => {
  const source = fs.readFileSync(new URL("../src/App.svelte", import.meta.url), "utf8");
  assert.match(source, /<ActiveView \{\.\.\.activeProps\} \/>/);
  assert.doesNotMatch(source, /item\.view ===/);
  const tool = TOOL_REGISTRY.find((item) => item.id === "aes");
  const props = viewPropsForTool(tool, { locale: "en", initialOptions: { op: "encrypt" }, demoRequest: 2 });
  assert.equal(props.kind, "aes");
  assert.equal(props.toolId, "aes");
  assert.equal(props.focusedOperation, "encrypt");
  assert.equal(props.demoRequest, 2);
});

test("JSON workbench demo covers every JSON value type", () => {
  const demo = createToolDemo({ id: "json", view: "json-workbench", defaultOptions: {} });
  const value = JSON.parse(demo.input);

  assert.equal(typeof value, "object");
  assert.equal(typeof value.string, "string");
  assert.equal(typeof value.number, "number");
  assert.equal(typeof value.boolean, "boolean");
  assert.equal(value.null, null);
  assert.ok(Array.isArray(value.array));
  assert.equal(typeof value.object, "object");
  assert.equal(Array.isArray(value.object), false);
});
