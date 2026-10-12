import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createToolDemo } from "../src/lib/demoCatalog.js";
import { convertData, DATA_FORMATS } from "../src/lib/dataConvert.js";
import { gzipDecompressText } from "../src/lib/gzip.js";
import { sqlEscape } from "../src/lib/simpleTransforms.js";
import { TEXT_ACTIONS } from "../src/lib/textActions.js";
import { quotedPrintable } from "../src/lib/tools/encode.js";
import { CODE_LANGUAGES, formatCode } from "../src/lib/tools/format.js";

const demoFor = (id, view) => createToolDemo({ id, view, defaultOptions: {} });
const viewSource = (name) => fs.readFileSync(new URL(`../src/lib/${name}`, import.meta.url), "utf8");

test("demo-aware workbenches select presets from the current mode", () => {
  assert.match(viewSource("DataConvertView.svelte"), /demo\.inputs\?\.\[from\]/);
  assert.match(viewSource("CodeFormatView.svelte"), /demo\.inputs\?\.\[language\]/);
  assert.match(viewSource("DeveloperUtilityView.svelte"), /demo\.modes\?\.\[dotenvMode\]/);
  assert.match(viewSource("GzipView.svelte"), /demo\.modes\?\.\[mode\]/);
  assert.match(viewSource("LiveIoView.svelte"), /demo\.modes\?\.\[optionValues\.mode\]/);
  assert.match(viewSource("TextWorkbench.svelte"), /demo\.modes\?\.\[mode\]/);
});

test("data conversion demo provides valid input for every source format", () => {
  const demo = demoFor("data-convert", "data-convert");
  assert.deepEqual(Object.keys(demo.inputs).sort(), DATA_FORMATS.map(({ value }) => value).sort());

  for (const { value: format } of DATA_FORMATS) {
    assert.doesNotThrow(() => convertData(demo.inputs[format], format, "json"), format);
  }
});

test("code formatter demo is valid for every selectable language", async () => {
  const demo = demoFor("code-format", "code-format");
  assert.deepEqual(Object.keys(demo.inputs).sort(), CODE_LANGUAGES.map(({ value }) => value).sort());
  for (const { value: language } of CODE_LANGUAGES) {
    assert.ok(demo.inputs[language].trim(), language);
    await assert.doesNotReject(() => Promise.resolve(formatCode(demo.inputs[language], language)), language);
  }
});

test("text workbench demo covers every action and supplies required controls", () => {
  const demo = demoFor("whitespace", "whitespace");
  assert.deepEqual(Object.keys(demo.modes).sort(), TEXT_ACTIONS.map(({ id }) => id).sort());
  assert.deepEqual(demo.modes.replace.controls, {
    find: "DBX",
    replace: "DataBox",
    replaceRegex: false,
    replaceFirstOnly: false,
    replaceIgnoreCase: false,
  });
  assert.equal(demo.modes.column.controls.delimiter, ",");
});

test("dotenv demo covers every mode including two-input workflows", () => {
  const demo = demoFor("dotenv", "developer-utility");
  assert.deepEqual(Object.keys(demo.modes).sort(), ["validate", "compare", "example", "sync", "env-to-json", "json-to-env"].sort());
  assert.ok(demo.modes.compare.secondary);
  assert.ok(demo.modes.sync.secondary);
  assert.doesNotThrow(() => JSON.parse(demo.modes["json-to-env"].input));
});

test("Gzip and Quoted-Printable demos work in both directions", async () => {
  const gzip = demoFor("gzip", "gzip");
  const inflated = await gzipDecompressText(gzip.modes.decompress.input);
  assert.equal(inflated.text, gzip.modes.compress.input);

  const qp = demoFor("quoted-printable", "live-io");
  assert.equal(quotedPrintable(qp.modes.decode.input, true), qp.modes.encode.input);
});

test("SQL escape demo exercises quotes, paths, and Unicode", () => {
  const demo = demoFor("sql-escape", "live-io");
  const output = sqlEscape(demo.input);
  assert.match(output, /O''Reilly/);
  assert.match(output, /C:\\temp\\report\.csv/);
  assert.match(output, /李雷/);
});

test("Docker converter demo covers both conversion directions", () => {
  const demo = demoFor("docker-convert", "utility-suite");
  assert.match(demo.modes["run-to-compose"].input, /^docker run /);
  assert.match(demo.modes["compose-to-run"].input, /^services:/);
});
