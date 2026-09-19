import assert from "node:assert/strict";
import test from "node:test";
import { csvToGrid, gridToCsv, gridToObjects, objectsToGrid, readXlsx, tsvToGrid, gridToTsv, writeXlsx } from "../src/lib/spreadsheet.js";

test("spreadsheet CSV preserves quotes, commas, and multiline values", () => {
  const grid = [["name", "note"], ["Ada", "one, two"], ["Lin", "line 1\nline 2"], ['A "quote"', ""]];
  assert.deepEqual(csvToGrid(gridToCsv(grid)), grid);
});

test("spreadsheet TSV preserves tabs, quotes, and multiline values", () => {
  const grid = [["name", "note"], ["Ada", "one\ttwo"], ["Lin", "line 1\nline 2"], ['A "quote"', ""]];
  assert.deepEqual(tsvToGrid(gridToTsv(grid)), grid);
});

test("spreadsheet JSON conversion creates stable unique headers", () => {
  assert.deepEqual(gridToObjects([["name", "name", ""], ["Ada", "Lovelace", "36"]]), [
    { name: "Ada", name_2: "Lovelace", column_3: "36" },
  ]);
  assert.deepEqual(gridToObjects([["name", "name", "name_2"], ["Ada", "Lovelace", "Grace"]]), [
    { name: "Ada", name_2: "Lovelace", name_2_2: "Grace" },
  ]);
  assert.deepEqual(objectsToGrid([{ name: "Ada", age: 36 }, { name: "Lin", active: true }]), [
    ["name", "age", "active"], ["Ada", "36", ""], ["Lin", "", "true"],
  ]);
});

test("XLSX workbook round trip preserves sheets and cell text", async () => {
  const source = [
    { name: "People", rows: [["name", "note"], ["Ada", "你好"]] },
    { name: "Empty values", rows: [["a", "b"], ["", "2"]] },
  ];
  const bytes = await writeXlsx(source);
  assert.ok(bytes.byteLength > 1000);
  assert.deepEqual(await readXlsx(bytes), source);
});

test("XLSX import preserves sparse columns", async () => {
  const bytes = await writeXlsx([{ name: "Sparse", rows: [["first", "", "", "fourth"]] }]);
  assert.deepEqual(await readXlsx(bytes), [{ name: "Sparse", rows: [["first", "", "", "fourth"]] }]);
});
