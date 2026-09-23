import test from "node:test";
import assert from "node:assert/strict";
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
