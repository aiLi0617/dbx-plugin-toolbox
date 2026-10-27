import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFormNavigationGuard } from "../src/formGuard.js";

test("form navigation guard keeps component submit handlers reachable", () => {
  const target = new EventTarget();
  const removeGuard = installFormNavigationGuard(target);
  let handled = false;
  target.addEventListener("submit", () => {
    handled = true;
  });

  const event = new Event("submit", { cancelable: true });
  target.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(handled, true);
  removeGuard();
});

test("password regeneration does not depend on form submission", () => {
  const source = readFileSync(new URL("../src/lib/PasswordView.svelte", import.meta.url), "utf8");
  assert.match(source, /onclick=\{generate\}/);
  assert.doesNotMatch(source, /type="submit"|onsubmit=/);
});

test("Basic Auth generation works without sandbox form permissions", () => {
  const source = readFileSync(new URL("../src/lib/BasicAuthView.svelte", import.meta.url), "utf8");
  assert.match(source, /type="button" onclick=\{generate\}/);
  assert.doesNotMatch(source, /<form\b|type="submit"|onsubmit=/);
  assert.equal((source.match(/onkeydown=\{generateOnEnter\}/g) || []).length, 2);
});

test("Bcrypt actions work without sandbox form permissions", () => {
  const source = readFileSync(new URL("../src/lib/BcryptView.svelte", import.meta.url), "utf8");
  assert.match(source, /type="button"\s+onclick=\{run\}/);
  assert.doesNotMatch(source, /<form\b|type="submit"|onsubmit=/);
  assert.equal((source.match(/onkeydown=\{runOnEnter\}/g) || []).length, 3);
});
