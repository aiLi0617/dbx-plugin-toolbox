import assert from "node:assert/strict";
import test from "node:test";
import { convertData, jsonToNdjson, ndjsonToJson, jsonToTsv, tsvToJson } from "../src/lib/dataConvert.js";
import { formatCode } from "../src/lib/tools/format.js";
import { jsonToCsv, csvToJson, runJsonPath } from "../src/lib/tools/convert.js";
import { collapseAllPaths, formatJson, minifyJson, sortValue, restoreKeyOrder, serializeJson, parseLeaf } from "../src/lib/jsonOps.js";
import { convertJsonToLang } from "../src/lib/jsonToLang.js";
import { parseLosslessJson, toSafeJsonValue, parseSafeJson } from "../src/lib/jsonPrecision.js";

test("JSON formatting, sorting and order restoration preserve every numeric lexeme", () => {
  const input = '{"z":9007199254740993,"a":123456789012345678901234567890,"f":0.1234567890123456789,"e":2.3e+500,"n":-0}';
  assert.equal(minifyJson(formatJson(input)), input);
  const parsed = parseLosslessJson(input);
  const sorted = sortValue(parsed);
  const restored = restoreKeyOrder(sorted, parsed);
  assert.equal(serializeJson(restored, false), input);
  assert.match(formatJson(input, 4, "asc"), /9007199254740993/);
});

test("collapse all includes the top-level JSON container", () => {
  assert.deepEqual(collapseAllPaths({ nested: { value: 1 }, list: [true] }), {
    "": true,
    "/nested": true,
    "/list": true,
  });
  assert.deepEqual(collapseAllPaths([{}]), { "": true, "/0": true });
});

test("lossless handling cannot confuse user marker properties or lose prototype-like keys", () => {
  for (const input of [
    '{"isLosslessNumber":true,"value":"1"}',
    '{"__proto__":{"isLosslessNumber":true},"x":1,"constructor":2,"prototype":3}',
    '{"user":"__DBX_RAW_NUMBER__0","escaped":"\\u005f_DBX_RAW_NUMBER__1","big":9007199254740993}',
  ]) assert.equal(minifyJson(formatJson(input)), input.replace('"\\u005f_DBX_RAW_NUMBER__1"', '"__DBX_RAW_NUMBER__1"'));
  const userObject = '{"__proto__":{"isLosslessNumber":true},"x":1}';
  assert.ok(Object.hasOwn(JSON.parse(formatJson(userObject)), "__proto__"));
  assert.equal(JSON.parse(formatJson('{"isLosslessNumber":true,"value":"1"}')).isLosslessNumber, true);
});

test("unsafe numbers cannot silently reach tree edits, queries, or code generators", () => {
  for (const value of ["9007199254740993", "9007199254740993.0", "0.1234567890123456789", "1e400", "1e-400"]) {
    const input = `{"id":${value}}`;
    assert.throws(() => parseSafeJson(input), /precision/);
    assert.throws(() => convertJsonToLang(input, "typescript"), /precision/);
    assert.throws(() => runJsonPath(input, "$.id"), /precision/);
  }
  assert.throws(() => toSafeJsonValue(parseLeaf("9007199254740993")), /precision/);
  assert.deepEqual(parseSafeJson('{"number":12.5,"id":"9007199254740993"}'), { number: 12.5, id: "9007199254740993" });
});

test("data conversion works in both directions for YAML, CSV, XML, and TOML", () => {
  const json = '{"person":{"name":"Ada","active":true,"count":12}}';
  for (const format of ["yaml", "toml"]) {
    assert.deepEqual(JSON.parse(convertData(convertData(json, "json", format), format, "json")), JSON.parse(json));
  }
  const csvJson = '[{"name":"Ada","count":"12"},{"name":"Lin","count":"13"}]';
  assert.deepEqual(JSON.parse(convertData(convertData(csvJson, "json", "csv"), "csv", "json")), JSON.parse(csvJson));
  const xml = '<person id="001"><name>Ada</name><count> 001 </count></person>';
  const fromXml = convertData(xml, "xml", "json");
  assert.deepEqual(JSON.parse(fromXml), { person: { name: "Ada", count: " 001 ", "@_id": "001" } });
  assert.match(convertData(fromXml, "json", "xml"), /id="001"/);
  assert.match(convertData(fromXml, "json", "xml"), /<count> 001 <\/count>/);
});

test("TSV and NDJSON conversions preserve rows and escaped fields", () => {
  const rows = [{ name: "Ada", note: "one\ttwo" }, { name: "Lin", note: "line\nnext" }];
  const tsv = jsonToTsv(rows);
  assert.deepEqual(tsvToJson(tsv), rows.map((row) => ({ name: row.name, note: row.note })));
  assert.deepEqual(JSON.parse(convertData(tsv, "tsv", "json")), rows);
  const ndjson = jsonToNdjson(rows);
  assert.deepEqual(ndjsonToJson(ndjson), rows);
  assert.deepEqual(JSON.parse(convertData(ndjson, "ndjson", "json")), rows);
  assert.equal(convertData('[{"id":1},{"id":2}]', "json", "ndjson"), '{"id":1}\n{"id":2}');
  assert.throws(() => ndjsonToJson('{"ok":1}\nnope'), /line 2/);
});

test("conversion rejects precision loss and unsupported target values", () => {
  for (const [input, from] of [['{"id":9007199254740993}', "json"], ['id: 9007199254740993', "yaml"], ['id = 9007199254740993', "toml"]]) {
    assert.throws(() => convertData(input, from, "csv"), /precision/);
  }
  assert.throws(() => convertData('x: 0.1234567890123456789', "yaml", "json"), /precision/);
  assert.throws(() => convertData('x = 0.1234567890123456789', "toml", "json"), /precision/);
  assert.deepEqual(JSON.parse(convertData('x = "0.1234567890123456789" # 9007199254740993', "toml", "json")), { x: "0.1234567890123456789" });
  assert.deepEqual(JSON.parse(convertData('x = +1\ny = +1.25', "toml", "json")), { x: 1, y: 1.25 });
  assert.deepEqual(JSON.parse(convertData('x: +1.25', "yaml", "json")), { x: 1.25 });
  assert.throws(() => convertData('a: !!set {foo, bar}', "yaml", "json"), /Unsupported collection/);
  assert.throws(() => convertData('{"value":null}', "json", "toml"), /null/);
  assert.throws(() => convertJsonToLang('{"value":null}', "toml"), /null/);
  assert.throws(() => convertData('[1,2]', "json", "toml"), /document root/);
  assert.throws(() => convertData('<p>Hello <b>Ada</b>!</p>', "xml", "json"), /losing order/);
  assert.throws(() => convertData('x: &x [*x]', "yaml", "json"), /Cyclic/);
});

test("XML same-format conversion preserves interleaved siblings and cross-format refuses lossy structures", () => {
  const source = '<r><a>1</a><b>2</b><a>3</a></r>';
  const output = convertData(source, "xml", "xml");
  assert.match(output, /<a>1<\/a>\s*<b>2<\/b>\s*<a>3<\/a>/);
  assert.throws(() => convertData(source, "xml", "json"), /Interleaved/);
  for (const xml of ['<r><!-- keep --><a>x</a></r>', '<r><![CDATA[a < b]]></r>']) {
    assert.throws(() => convertData(xml, "xml", "json"), /positions/);
    assert.match(convertData(xml, "xml", "xml"), /<!-- keep -->|<!\[CDATA\[a < b\]\]>/);
  }
});

test("CSV escapes comma, quote and newline in headers as well as values", () => {
  const row = { 'comma,key': "x,y", 'quote"key': 'v"v', 'line\nkey': 'first\nsecond', '__proto__': "plain" };
  const csv = jsonToCsv([row]);
  assert.match(csv, /^"comma,key","quote""key","line\nkey"/);
  assert.equal(JSON.stringify(csvToJson(csv)), JSON.stringify([row]));
  assert.throws(() => csvToJson("a,b\n1,2,3"), /same number/);
  assert.throws(() => csvToJson('a\n"quoted"trailing'), /after quoted/);
  assert.match(convertData('[{"id":1},{"id":2}]', "json", "xml"), /<root>\s*<item>/);
});

test("XML formatter retains comments, leading zeros, CDATA, whitespace and mixed content", () => {
  const input = '<?xml version="1.0"?><root><!--keep--><id>001</id><value> 001 </value><blank> </blank><p>before <b>bold</b> after</p><s xml:space="preserve">  a\n b </s><raw><![CDATA[a < b]]></raw></root>';
  const formatted = formatCode(input, "xml", "format", "sql", 4);
  for (const fragment of ['<!--keep-->', '<id>001</id>', '<value> 001 </value>', '<blank> </blank>', '<p>before <b>bold</b> after</p>', '<s xml:space="preserve">  a\n b </s>', '<![CDATA[a < b]]>']) assert.ok(formatted.includes(fragment), fragment);
  assert.match(formatted, /\n {4}<id>/);
  assert.throws(() => formatCode('<a><b></a>', "xml"));
});

test("YAML formatting keeps comments, aliases, and large integer spelling", () => {
  const input = '# header\na:\n  b:\n    c: 1 # inline\nlong: 9007199254740993\ndefault: &d {x: 1}\ncopy: *d\n';
  const formatted = formatCode(input, "yaml", "format", "sql", 4);
  for (const fragment of ['# header', '# inline', '9007199254740993', '&d', '*d']) assert.ok(formatted.includes(fragment), fragment);
  assert.match(formatted, /a:\n {4}b:\n {8}c: 1/);
  assert.throws(() => formatCode("x: 0.1234567890123456789", "yaml"), /precision/);
  assert.throws(() => formatCode("x: 2e500", "yaml"), /precision/);
});

test("JavaScript and TypeScript use parsers and report invalid source", async () => {
  assert.equal(await formatCode('const value={a:1};', "javascript"), 'const value = { a: 1 };\n');
  assert.match(await formatCode('type User={id:number;name:string};const f=(u:User)=>u.name;', "typescript"), /type User = \{/);
  await assert.rejects(() => formatCode('const = ;', "javascript"));
});
