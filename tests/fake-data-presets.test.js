import assert from "node:assert/strict";
import test from "node:test";
import { formatFakeRows, generateFakeRows } from "../src/lib/fakeData.js";
import { createFakeDataPreset, listFakeDataPresets, updateFakeDataPreset, validatePresetConfig } from "../src/lib/fakeDataPresets.js";

function example() {
  return {
    fields: [
      { id: 51, name: "联系电话", type: "phone", options: { region: "JP", format: "international" } },
      { id: 19, name: "出生日期", type: "birthDate", options: { format: "YYYY/MM/DD" } },
      { id: 8, name: "年龄", type: "age", options: { min: 26, max: 28 } },
    ],
    count: 3,
    format: "csv",
    seed: "测试表单",
    referenceDate: "2025-02-28",
  };
}

test("the saved configuration is detached from the editor and reproduces its output", () => {
  const current = example();
  const render = ({ count, fields, format, ...options }) => formatFakeRows(generateFakeRows(count, fields, options), format);
  const expected = render(current);
  const saved = validatePresetConfig(current);
  assert.deepEqual(saved.fields.map(({ name }) => name), ["联系电话", "出生日期", "年龄"]);
  assert.notEqual(saved.fields[0].options, current.fields[0].options);
  assert.equal(saved.fields[0].id, undefined);
  assert.deepEqual(Object.keys(saved).sort(), ["count", "fields", "format", "referenceDate", "seed"]);
  current.fields[0].options.region = "CN";
  current.format = "json";
  assert.equal(render(JSON.parse(JSON.stringify(saved))), expected);
});

test("invalid draft options are rejected with the generator's usual field error", () => {
  const current = example();
  current.fields[0].options.region = "XXX";
  assert.throws(() => validatePresetConfig(current), { code: "options", field: "联系电话", index: 0 });
  assert.throws(() => validatePresetConfig({ ...example(), format: "yaml" }), { code: "invalid" });
  assert.throws(() => validatePresetConfig({ ...example(), referenceDate: "2025-02-29" }), { code: "referenceDate" });
});

test("the desktop bridge reports errors without falling back or overwriting the draft", async (t) => {
  const previousWindow = globalThis.window;
  t.after(() => { globalThis.window = previousWindow; });
  const calls = [];
  let failure;
  globalThis.window = {
    dbxPlugin: { async invoke(method, params) {
      calls.push({ method, params });
      if (failure) throw failure;
      return { presets: [], id: "saved" };
    } },
  };
  const current = example();
  assert.deepEqual(await listFakeDataPresets(), { presets: [], id: "saved" });
  await createFakeDataPreset("  测试表单  ", current);
  assert.equal(calls[1].method, "toolbox/fake-data-presets/create");
  assert.equal(calls[1].params.name, "测试表单");
  assert.deepEqual(calls[1].params.config, validatePresetConfig(current));
  failure = Object.assign(new Error("write failed"), { code: -32000 });
  await assert.rejects(updateFakeDataPreset("saved", current), { code: "storage" });
  assert.deepEqual(current, example());
  failure = Object.assign(new Error("duplicate"), { code: -32120 });
  await assert.rejects(createFakeDataPreset("测试表单", current), { code: "duplicate" });
  current.fields[0].options.region = "XXX";
  await assert.rejects(updateFakeDataPreset("saved", current), { code: "options" });
  assert.equal(calls.length, 4);
});
