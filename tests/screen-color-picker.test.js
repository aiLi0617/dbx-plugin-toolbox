import test from "node:test";
import assert from "node:assert/strict";
import { pickScreenColor } from "../src/lib/screenColorPicker.js";

test("screen picker opens during user activation and returns the selected hex", async () => {
  const controller = new AbortController();
  let opened = false;
  class EyeDropper {
    open(options) {
      opened = true;
      assert.equal(options.signal, controller.signal);
      return Promise.resolve({ sRGBHex: "#12aBcD" });
    }
  }
  const pending = pickScreenColor({ EyeDropper, signal: controller.signal });
  assert.equal(opened, true);
  assert.equal(await pending, "#12aBcD");
});

test("cancelling screen picking produces no color", async () => {
  class EyeDropper {
    async open() { throw new DOMException("Cancelled", "AbortError"); }
  }
  assert.equal(await pickScreenColor({ EyeDropper }), null);
});

test("closing the component discards a late screen color", async () => {
  const controller = new AbortController();
  let resolve;
  class EyeDropper {
    open() { return new Promise((done) => { resolve = done; }); }
  }
  const pending = pickScreenColor({ EyeDropper, signal: controller.signal });
  controller.abort();
  resolve({ sRGBHex: "#123456" });
  assert.equal(await pending, null);
});

test("unavailable, invalid and failed screen picking report errors", async () => {
  await assert.rejects(pickScreenColor({ EyeDropper: null }), /unavailable/);
  class Invalid { async open() { return { sRGBHex: "invalid" }; } }
  await assert.rejects(pickScreenColor({ EyeDropper: Invalid }), /Invalid screen color/);
  class Failed { async open() { throw new Error("Blocked"); } }
  await assert.rejects(pickScreenColor({ EyeDropper: Failed }), /Blocked/);
});
