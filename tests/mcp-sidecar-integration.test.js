import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { generateKeyPairSync, hkdfSync, randomBytes, verify as verifySignature } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { PDFDocument } from "@cantoo/pdf-lib";
import { connect } from "./helpers/sidecar.js";

const binary = process.env.TOOLBOX_SIDECAR;
const dbxBinary = process.env.TOOLBOX_DBX_MCP;
const dbxPackage = process.env.TOOLBOX_MCP_PACKAGE;
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const contribution = manifest.contributions.find(({ type }) => type === "mcp");
const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const large = "18446744073709551616123456789";
const decimal = "0.123456789012345678901234567890";
const exponent = "1.00E+9007199254740993123456789";
const scalars = [large, decimal, exponent, "-0"];
const source = '{"z":' + large + ',"z":' + decimal + ',"e":' + exponent + ',"n":-0}';
const publicKey = Buffer.concat([
  Buffer.from([0, 0, 0, 11]), Buffer.from("ssh-ed25519"),
  Buffer.from([0, 0, 0, 32]), Buffer.alloc(32, 1),
]).toString("base64");
const jwt = (payload) => ['{"alg":"none"}', payload].map((part) => Buffer.from(part).toString("base64url")).join(".") + ".";
const gzip = (text) => gzipSync(text).toString("base64");
const text = (expected) => (result) => assert.equal(result.text, expected);
const field = (key, expected) => (result) => assert.deepEqual(result[key], expected);
const contains = (regex) => (result) => assert.match(result.text, regex);
const rsaFixture = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPgUbL4DwACCgFmeGgpMwAAAABJRU5ErkJggg==";
const pdfFixture = await PDFDocument.create();
pdfFixture.addPage();
pdfFixture.addPage();
const pdf = Buffer.from(await pdfFixture.save()).toString("base64");

const cases = {
  json_patch: [{ text: '{"id":' + large + ',"negative":-0,"items":[0,1]}',
    patch: '[{"op":"test","path":"/id","value":' + large + '0e-1},{"op":"replace","path":"/items/0","value":' + exponent + '},{"op":"copy","from":"/negative","path":"/items/-"}]' },
    text('{"id":' + large + ',"negative":-0,"items":[' + exponent + ',1,-0]}'),
    { text: '{"x":' + large + '}', patch: '[{"op":"test","path":"/x","value":9007199254740993}]' }, /Patch operation 1: JSON Patch test failed/],
  table_transform: [{ action: "join_left", format: "tsv", text: "id\tname\n0001\tA\n" + large + "\tB", column: "id", other: "id\tamount\n0001\t" + decimal + "\n0001\t-0" },
    (r) => { assert.equal(r.rows, 3); assert.equal(r.text, 'id\tname\tright_amount\n0001\tA\t' + decimal + '\n0001\tA\t-0\n' + large + '\tB\t""'); },
    { action: "select", text: "id,id\n1,2", columns: '["id"]' }, /headers must be unique/],
  sql_analyze: [{ dialect: "postgresql", text: "WITH q AS (SELECT " + large + " AS id) SELECT id FROM q WHERE id = $1 AND '$2' = '$2'; UPDATE metrics SET score = " + decimal + " WHERE id=$1;" },
    (r) => {
      assert.equal(r.statementCount, 2);
      assert.deepEqual(r.statements, [{ kind: "SELECT", leadingKeyword: "WITH", cteCount: 1 }, { kind: "UPDATE", leadingKeyword: "UPDATE", cteCount: 0 }]);
      assert.deepEqual(r.parameters, { $1: 2 });
      assert.deepEqual(r.numericLiterals, [large, decimal]);
    },
    { text: "SELECT (" }, /Invalid SQL/],
  json: [{ action: "format", text: source, indent: 4 },
    text('{\n    "z": ' + large + ',\n    "z": ' + decimal + ',\n    "e": ' + exponent + ',\n    "n": -0\n}'),
    { action: "format", text: "{" }, /line 1/],
  json_pointer: [{ text: '{"a/b":{"~key":[' + exponent + ']}}', pointer: "/a~1b/~0key/0" }, text(exponent),
    { text: source, pointer: "/z" }, /duplicate key/],
  json_diff: [{ left: '{"a/b":' + large + ',"same":1e+10}', right: '{"same":10000000000.000,"a/b":' + decimal + '}' },
    field("changes", [{ path: "/a~1b", action: "replace", left: large, right: decimal }]),
    { left: source, right: "{}" }, /unique object keys/],
  csv: [{ action: "json_to_csv", text: '[{"a":' + large + ',"b":' + decimal + ',"c":' + exponent + ',"d":-0}]' },
    text("a,b,c,d\n" + scalars.join(",")), { action: "csv_to_json", text: "a,a\n1,2" }, /headers must be unique/],
  tsv: [{ action: "tsv_to_json", text: 'id\tname\n00017\t"before\tafter"' },
    (result) => assert.deepEqual(JSON.parse(result.text), [{ id: "00017", name: "before\tafter" }]),
    { action: "tsv_to_json", text: 'a\tb\n"unterminated' }, /Unclosed quoted field/],
  ndjson: [{ action: "ndjson_to_json", text: "\uFEFF" + large + "\r\n\r\n" + source },
    text("[" + large + "," + source + "]"), { action: "ndjson_to_json", text: "1\n\nx" }, /Invalid NDJSON at line 3/],
  dotenv: [{ action: "env_to_json", text: 'A="$' + '{LITERAL}"\nB="line 1\nline 2"\nC="0001"' },
    (r) => assert.deepEqual(JSON.parse(r.text), { A: "$" + "{LITERAL}", B: "line 1\nline 2", C: "0001" }),
    { action: "env_to_json", text: "A=1\nA=2" }, /Duplicate .env variable on line 2/],
  json_to_insert: [{ text: '[{"value":' + large + ',"tag":"O\'Reilly"},{"tag":"beta","value":' + exponent + '}]', table: "public.metrics" },
    text('INSERT INTO "public"."metrics" ("value", "tag") VALUES\n(' + large + ", 'O''Reilly'),\n(" + exponent + ", 'beta');"),
    { text: '[{"a":1},{"b":2}]', table: "metrics" }, /same columns/],
  sql_format: [{ text: "select " + decimal + " as amount, $1 from metric", dialect: "postgresql" },
    (r) => { assert.match(r.text, /\n/); assert.ok(r.text.includes(decimal)); assert.ok(r.text.includes("$1")); },
    { text: "SELECT 1", dialect: "unknown" }, /dialect/],
  xml_format: [{ text: '<r><a> x <b/> y </a><c><![CDATA[<z>]]></c><d xml:space="preserve"> <x/> </d></r>' },
    text('<r>\n  <a> x <b/> y </a>\n  <c><![CDATA[<z>]]></c>\n  <d xml:space="preserve"> <x/> </d>\n</r>'),
    { text: '<!DOCTYPE r [<!ENTITY sample "x">]><r>&sample;</r>' }, /doctype/],
  hash: [{ algorithm: "sha256", text: "abc" }, field("digest", digest), { algorithm: "wat", text: "abc" }, /algorithm/],
  url: [{ action: "parse", text: "https://example.com/p?x=0003&x=&q=a+b#f" }, field("query", [["x", "0003"], ["x", ""], ["q", "a b"]]),
    { action: "decode", text: "%z3" }, /percent escape/],
  gzip: [{ action: "decompress", text: gzip("工具") }, text("工具"), { action: "decompress", text: gzip("x".repeat(65_537)) },
    /Expanded gzip exceeds 64 KiB/],
  escape: [{ action: "decode", format: "html", text: "&amp;lt; &#x1f600;" }, text("&lt; 😀"),
    { action: "decode", format: "json", text: "42" }, /quoted JSON string/],
  regex: [{ text: "é📚é", pattern: "é" }, (r) => assert.deepEqual(r.matches.map(({ start, end }) => [start, end]), [[0, 2], [6, 8]]),
    { text: "x", pattern: "(?=x)" }, /unsupported.*regex/],
  text_diff: [{ left: "a\nb\n", right: "a\nc\n" }, contains(/-b\n\+c/), { left: "x" }, /Missing right/],
  unicode_inspect: [{ text: "甲😀" }, (r) => {
    assert.deepEqual(r.characters.map(({ codePoint, utf8Hex }) => [codePoint, utf8Hex]), [["U+7532", "e794b2"], ["U+1F600", "f09f9880"]]);
  }, { text: "a".repeat(5000) }, /Result exceeds 128 KiB/],
  file_signature: [{ text: Buffer.from("SQLite format 3\0").toString("base64") }, field("mime", "application/vnd.sqlite3"),
    { text: "~" }, /Base64/],
  timestamp: [{ action: "to_rfc3339", text: "-1", unit: "ns" }, text("1969-12-31T23:59:59.999999999Z"),
    { action: "from_rfc3339", text: "2024-01-01T00:00:00.000001Z", unit: "ms" }, /lose timestamp precision/],
  cron: [{ expression: "0 0 * * *", after: "2024-01-02T08:00:00+08:00", count: 2 },
    field("occurrences", ["2024-01-03T00:00:00Z", "2024-01-04T00:00:00Z"]),
    { expression: "* * * * * *", after: "2024-01-02T00:00:00Z" }, /five-field/],
  cidr: [{ text: "::/0" }, field("addressCount", "340282366920938463463374607431768211456"),
    { text: "192.0.2.1/33" }, /valid slash prefix/],
  ipv4_range: [{ start: "0.0.0.0", end: "255.255.255.255" }, field("blocks", ["0.0.0.0/0"]),
    { start: "192.0.2.2", end: "192.0.2.1" }, /must not exceed/],
  semver: [{ action: "compare", version: "1.0.0+abc", other: "1.0.0+xyz" }, field("order", 0),
    { action: "matches", version: "1.0.0", other: "wat" }, /SemVer requirement/],
  radix: [{ text: large, from: 10, to: 16 }, text(BigInt(large).toString(16)), { text: "2", from: 2, to: 10 }, /outside the source base/],
  unit_convert: [{ value: "1", from: "m", to: "in" }, text("5000/127"), { value: "1", from: "m", to: "kg" }, /same category/],
  percentage: [{ x: "1", y: "3" }, (r) => assert.deepEqual(r, { percentOf: "0.03", share: "100/3", change: "200" }),
    { x: "NaN", y: "0" }, /signed decimal/],
  cert: [{ pem: "ssh-ed25519 " + publicKey + " public-fixture" }, (r) => assert.match(JSON.stringify(r), /ssh-ed25519/),
    { pem: "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----" }, /certificate or OpenSSH public key/],
  jwt_decode: [{ text: jwt(source) }, (r) => assert.equal(r.payload, source), { text: jwt("[]") }, /payload must be a JSON object/],
  iban: [{ text: "GB82 WEST 1234 5698 7654 32" }, field("valid", true), { text: "A".repeat(35) }, /34 characters/],
  cipher: [{ algorithm: "aes-128", op: "encrypt", keyMaterial: "00".repeat(16), text: "", payloadFormat: "separate", iv: "00".repeat(12) },
    field("tag", "58e2fccefa7e3061367f1d57a4e7455a"),
    { algorithm: "sm4", op: "encrypt", keyMaterial: "00", text: "abc" }, /key length/],
  public_key_cipher: [{ algorithm: "rsa", op: "encrypt", keyMaterial: rsaFixture.publicKey, text: "toolbox" },
    (r) => assert.equal(Buffer.from(r.text, "base64").length, 256),
    { algorithm: "rsa", op: "encrypt", keyMaterial: "invalid", text: "abc" }, /RSA public\/private PEM/],
  message_auth: [{ algorithm: "hmac-sha256", keyEncoding: "utf8", keyMaterial: "key", text: "abc" },
    field("digest", "9c196e32dc0175f86f4b1cb89289d6619de6bee699e4c378e68309ed97a1a6ab"),
    { algorithm: "totp-sha1", keyMaterial: "test", text: "59" }, /keyEncoding base32/],
  key_derivation: [{ algorithm: "hkdf-sha256", text: "temporary", salt: "toolbox-test", saltEncoding: "utf8", info: "MCP", length: 32 },
    text(Buffer.from(hkdfSync("sha256", "temporary", "toolbox-test", "MCP", 32)).toString("hex")),
    { algorithm: "hkdf-sha256", text: "x", salt: "0a" }, /at least 8 bytes/],
  digital_signature: [{ algorithm: "rsa-pkcs1-sha256", op: "sign", keyMaterial: rsaFixture.privateKey, text: "toolbox" },
    (r) => assert.ok(verifySignature("sha256", Buffer.from("toolbox"), rsaFixture.publicKey, Buffer.from(r.text, "base64"))),
    { algorithm: "rsa-pkcs1-sha256", op: "sign", keyMaterial: "invalid", text: "toolbox" }, /RSA private key/],
  jwt_signature: [{ algorithm: "HS256", op: "sign", keyMaterial: "temporary-test-key", text: '{"value":' + exponent + "}" },
    (r) => assert.equal(Buffer.from(r.text.split(".")[1], "base64url").toString("utf8"), '{"value":' + exponent + "}"),
    { algorithm: "HS256", op: "sign", keyMaterial: "temporary", text: "[]" }, /must be a JSON object/],
  key_cipher: [{ algorithm: "aes-kw", op: "wrap", keyMaterial: "000102030405060708090A0B0C0D0E0F", text: "00112233445566778899AABBCCDDEEFF" },
    text("1fa68b0a8112b447aef34bd8fb5a7b829d3e862371d2cfe5"),
    { algorithm: "aes-kw", op: "wrap", keyMaterial: "00", text: "00" }, /AES-KW/],
  key_exchange: [{ algorithm: "ml-kem-768", op: "generate" },
    (r) => assert.equal(Buffer.from(r.publicKey, "base64").length, 1184),
    { algorithm: "ml-kem-768", op: "encrypt" }, /ML-KEM operation/],
  key_generate: [{ algorithm: "aes-256" },
    (r) => { assert.equal(r.saved, false); assert.match(r.material, /^[0-9a-f]{64}$/); },
    { algorithm: "rsa", bits: 2050 }, /2048 or 3072/],
  data_convert: [{ from: "yaml", to: "json", text: "id: " + large },
    (r) => assert.match(r.text, new RegExp('"' + "id" + '": ' + large + '\\b')),
    { from: "json", to: "yaml", text: '{"n":' + decimal + '}' }, /without losing precision/],
  json_query: [{ action: "path", text: '{"rows":[{"id":' + exponent + '}, {"id":' + large + '}]}', query: "$.rows[*].id" },
    text("[\n  " + exponent + ",\n  " + large + "\n]"),
    { action: "path", text: source, query: "$.z" }, /unique object keys/],
  json_generate: [{ language: "typescript", text: '{"id":1,"label":"工具"}' },
    contains(/id: number;[\s\S]*label: string;/),
    { language: "typescript", text: "{" }, /line 1/i],
  code_format: [{ language: "javascript", text: "const x={a:1};" }, contains(/const x = \{\s+a: 1/),
    { language: "yaml", text: "x: [" }, /flow sequence|closing|end/i],
  base_codec: [{ action: "encode", format: "base32", text: "foobar" }, text("MZXW6YTBOI======"),
    { action: "decode", format: "base32", text: "MY=====X" }, /Invalid Base32/],
  text_transform: [{ action: "regex-replace", text: "v12 v34", find: "v(\\d+)", replacement: "[$1]" }, text("[12] [34]"),
    { action: "replace", text: "x" }, /find must be non-empty/],
  developer_helpers: [{ action: "curl-to-code", text: "curl https://example.test/api", options: "python" },
    contains(/import requests[\s\S]*example\.test/),
    { action: "curl-to-code", text: "curl" }, /No HTTP URL|curl command/i],
  network_helpers: [{ action: "subnet-split", text: "2001:db8::/126", options: "127" },
    field("subnets", ["2001:db8::/127", "2001:db8::2/127"]),
    { action: "subnet-split", text: "::/0", options: "128" }, /more than 256/],
  exact_calculate: [{ action: "expression", text: "(" + large + " - " + large + ") + 1 / 3" }, text("1/3"),
    { action: "expression", text: "1/(2-2)" }, /Division by zero/],
  calendar: [{ action: "date-diff", text: "2024-02-28", options: "2024-03-01" }, field("days", "2"),
    { action: "date-diff", text: "2024-02-31", options: "2024-03-01" }, /Invalid date/],
  fake_data: [{ fields: "name,email", seed: "test", count: 2 },
    (r) => { const records = JSON.parse(r.text); assert.equal(records.length, 2); assert.match(records[0].email, /@example\.invalid$/); },
    { fields: "test:invalid-type", count: 1 }, /field|preset|config|type/i],
  random_values: [{ kind: "nanoid", length: 21, count: 2 },
    (r) => assert.ok(r.values.length === 2 && r.values.every(value => /^[A-Za-z0-9_-]{21}$/.test(value))),
    { kind: "bytes", length: 4096, count: 100 }, /exceed 32 KiB/],
  qr_code: [{ text: "DBX" }, contains(/<svg[\s\S]*<path/),
    { text: "", kind: "wifi" }, /Invalid Wi-Fi/],
  image_transform: [{ text: png, action: "resize", width: 3, height: 2 },
    (r) => { assert.equal(r.width, 3); assert.equal(r.height, 2); assert.match(r.text, /^iVBOR/); },
    { text: "eA==", action: "inspect" }, /PNG, JPEG or WebP/],
  pdf_document: [{ text: pdf, action: "extract", pages: "2" },
    (r) => { assert.equal(r.pages, 1); assert.match(r.text, /^JVBER/); },
    { text: pdf, action: "rotate", pages: "3" }, /outside the document/],
};

test("manifest declares 56 prioritized read-only tools in the expected groups", () => {
  assert.equal(contribution.external_tools, true);
  assert.equal(contribution.scope, undefined);
  assert.equal(Object.keys(cases).length, 56);
  assert.deepEqual(Object.keys(contribution.tools).sort(), Object.keys(cases).sort());
  const counts = {};
  for (const { access, toolset } of Object.values(contribution.tools)) {
    assert.equal(access, "read");
    counts[toolset] = (counts[toolset] ?? 0) + 1;
  }
  assert.deepEqual(counts, { data: 17, text: 10, developer: 8, math: 4, inspect: 8, security: 9 });
  assert.deepEqual(contribution.toolsets.map(({ id }) => id).sort(), Object.keys(counts).sort());
  for (const file of ["README.md", "README.en.md"]) {
    const lines = readFileSync(new URL("../" + file, import.meta.url), "utf8").split("\n");
    const toolRows = lines.filter((line) => /^\| .* · \d+ \|/.test(line));
    const documented = toolRows.flatMap((line) => [...line.matchAll(/[\x60](\w+)[\x60]/g)].map(([, name]) => name));
    assert.deepEqual(documented.sort(), Object.keys(cases).sort(), file);
  }
});

test("framed sidecar discovers and executes all declared MCP tools", { skip: !binary }, async (t) => {
  const sidecar = connect(binary);
  t.after(() => sidecar.close());
  const { plugin } = await sidecar.invoke("plugin/initialize", { host: { protocolVersions: [1] } });
  assert.deepEqual(plugin, { id: manifest.id, version: manifest.version });
  const { tools } = await sidecar.invoke("mcp/tools");
  assert.deepEqual(tools.map(({ name }) => name).sort(), Object.keys(contribution.tools).sort());
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.idempotentHint, !["cipher", "public_key_cipher", "digital_signature", "jwt_signature", "key_exchange", "key_generate", "random_values", "pdf_document"].includes(tool.name));
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.properties.connectionId, undefined);
  }

  await t.test("localizes all descriptions and preserves the tool contract", async () => {
    const [simplified, traditional, english, bilingual] = await Promise.all(
      ["zh-CN", "zh-TW", "en", "unsupported"].map(async (locale) => (await sidecar.invoke("mcp/tools", { locale })).tools)
    );
    for (const [index, item] of english.entries()) {
      const { description, ...definition } = item;
      assert.match(description, /^[\x20-\x7e]+$/);
      for (const language of [simplified, traditional, bilingual]) {
        const { description: translated, ...sameDefinition } = language[index];
        assert.match(translated, /\p{Script=Han}/u, item.name);
        assert.deepEqual(sameDefinition, definition);
      }
      assert.equal(bilingual[index].description, simplified[index].description + "\n" + description);
    }
    const envSidecar = connect(binary, { ...process.env, DBX_TOOLBOX_MCP_LOCALE: "zh-TW" });
    try {
      assert.deepEqual((await envSidecar.invoke("mcp/tools")).tools, traditional);
    } finally {
      await envSidecar.close();
    }
  });

  const call = (tool, args) => sidecar.invoke("mcp/call", { tool, arguments: args });
  async function success(tool, args) {
    const result = await call(tool, args);
    assert.equal(result.isError, false, tool + ": " + result.content[0].text);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    return result.structuredContent;
  }
  async function failure(tool, args, message) {
    const result = await call(tool, args);
    assert.equal(result.isError, true, tool);
    assert.match(result.content[0].text, message, tool);
  }

  for (const [tool, [args, verify, malformed, error]] of Object.entries(cases)) {
    await t.test(tool, async () => {
      verify(await success(tool, args));
      await failure(tool, malformed, error);
    });
  }

  await t.test("new operation variants preserve precision and round-trip supplied bytes", async () => {
    assert.equal((await success("json_patch", { action: "merge", text: '{"n":' + large + ',"nested":{"keep":1,"drop":2}}',
      patch: '{"nested":{"drop":null,"add":' + decimal + '}}' })).text,
    '{"n":' + large + ',"nested":{"keep":1,"add":' + decimal + '}}');
    const moved = await success("json_patch", { text: '[0,' + exponent + ',-0]',
      patch: '[{"op":"move","from":"/0","path":"/2"}]' });
    assert.equal(moved.text, "[" + exponent + ",-0,0]");
    await failure("json_patch", { text: '{"parent":{"child":{}}}',
      patch: '[{"op":"move","from":"/parent","path":"/parent/child"}]' }, /own descendant/);
    const projected = await success("table_transform", { action: "select", text: 'raw,id\n"' + decimal + '",00017', columns: '["id","raw"]' });
    assert.equal(projected.text, "id,raw\n00017," + decimal);
    const deduplicated = await success("table_transform", { action: "deduplicate", text: "id,value\n01,first\n1,second\n01,last", columns: '["id"]' });
    assert.equal(deduplicated.text, "id,value\n01,first\n1,second");
    const quotedSql = await success("sql_analyze", { text: "SELECT 1.00E+123, '3', ?; -- 7 and ?" });
    assert.deepEqual(quotedSql.numericLiterals, ["1.00E+123"]);
    assert.deepEqual(quotedSql.parameters, { "?": 1 });

    const cipherArgs = { algorithm: "sm4", keyMaterial: "01".repeat(16) };
    const sealed = await success("cipher", { ...cipherArgs, op: "encrypt", text: "工具箱" });
    assert.equal((await success("cipher", { ...cipherArgs, op: "decrypt", text: sealed.text })).text, "工具箱");
    const totp = await success("message_auth", { algorithm: "totp-sha1", keyEncoding: "base32",
      keyMaterial: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", text: "59", digits: 8 });
    assert.equal(totp.text, "94287082");
    const token = await success("jwt_signature", cases.jwt_signature[0]);
    assert.equal((await success("jwt_signature", { ...cases.jwt_signature[0], op: "verify", text: token.text })).valid, true);
    const converted = await success("data_convert", { from: "toml", to: "json", text: "id = 9223372036854775807" });
    assert.match(converted.text, /9223372036854775807/);
    const compose = await success("developer_helpers", { action: "docker-to-compose", text: "docker run --env ID=" + large + " example:latest" });
    assert.match(compose.text, new RegExp(large));
    await failure("developer_helpers", { action: "docker-to-compose", text: "docker run --ulimit nofile=" + large + " example:latest" }, /without losing precision/);
    await failure("developer_helpers", { action: "curl-to-code", text: "curl --max-time " + decimal + " https://example.test" }, /without losing precision/);
    await failure("json_query", { action: "schema", text: "1.5", query: '{"type":"number"}' }, /safe integer/);
    assert.equal((await success("json_query", { action: "schema", text: '{"count":3}', query: '{"properties":{"count":{"type":"integer","minimum":2}}}' })).valid, true);
    const phrase = await success("random_values", { kind: "bip39-encode", text: "00".repeat(16) });
    assert.equal(phrase.text, "abandon ".repeat(11) + "about");
    assert.equal((await success("random_values", { kind: "bip39-decode", text: phrase.text })).text, "00".repeat(16));
    const hashed = await success("random_values", { kind: "bcrypt-hash", text: "temporary", rounds: 4 });
    assert.equal((await success("random_values", { kind: "bcrypt-verify", text: "temporary", proof: hashed.text })).matches, true);
    assert.match((await success("qr_code", { kind: "code128", text: "DBX-1234" })).text, /<svg/);
    assert.equal((await success("pdf_document", { action: "merge", text: pdf, second: pdf })).pages, 4);
    const encrypted = await success("pdf_document", { action: "encrypt", text: pdf, newPassword: "fixture only" });
    const decrypted = await success("pdf_document", { action: "decrypt", text: encrypted.text, password: "fixture only" });
    assert.equal((await success("pdf_document", { action: "inspect", text: decrypted.text })).pages, 2);
  });

  await t.test("lossless JSON and shared resource limits", async () => {
    const spaced = ' {  "z" : ' + large + ' , "z" : ' + decimal + ', "e": ' + exponent + ', "n": -0 } ';
    assert.deepEqual(await success("json", { action: "validate", text: spaced }), { ok: true, message: "Valid JSON" });
    assert.equal((await success("json", { action: "minify", text: spaced })).text, source);
    const invalid = await success("json", { action: "validate", text: '{\n "number": 01\n}' });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.line, 2);
    assert.equal((await success("json", { action: "minify", text: '"a\\\\b\\u0061  中"' })).text, '"a\\\\b\\u0061  中"');
    assert.equal((await success("json_diff", { left: "1E+999999999999999999", right: "10e+999999999999999998" })).equal, true);
    assert.equal((await success("json_diff", { left: "1e+9007199254740993", right: "1e+9007199254740992" })).equal, false);
    assert.equal((await success("json_diff", { left: "-0", right: "0e-999999999999999999" })).equal, true);
    assert.equal((await success("json_pointer", { text: '{"~1":42}', pointer: "/~01" })).text, "42");
    await failure("json_pointer", { text: "[1]", pointer: "/00" }, /invalid.*index/i);
    assert.equal((await success("ndjson", { action: "json_to_ndjson", text: "[" + spaced + ", " + exponent + "]" })).text, source + "\n" + exponent);
    assert.equal((await success("tsv", { action: "json_to_tsv", text: '[{"a":' + decimal + ',"b":-0}]' })).text, "a\tb\n" + decimal + "\t-0");
    assert.deepEqual(JSON.parse((await success("csv", { action: "csv_to_json", text: 'id,note\n0001,"one,\ntwo"' })).text), [{ id: "0001", note: "one,\ntwo" }]);
    assert.equal((await success("dotenv", { action: "json_to_env", text: '{"VALUE":' + exponent + "}" })).text, 'VALUE="' + exponent + '"');
    const sql = await success("sql_format", {
      text: "select " + scalars.join(", ") + ", $tag$例  1E+3\nx$tag$, $1, 'it''s  safe' from values_table",
      dialect: "postgresql",
    });
    for (const literal of [...scalars, "$tag$例  1E+3\nx$tag$", "$1", "'it''s  safe'"]) {
      assert.ok(sql.text.includes(literal), literal + " was altered by SQL formatting");
    }
    assert.equal((await success("hash", { algorithm: "sha256", text: "YWJj", encoding: "base64" })).digest, digest);
    assert.equal((await success("cidr", { text: "192.0.2.3/31" })).firstHost, "192.0.2.2");
    assert.equal((await success("regex", { pattern: ".", text: "x".repeat(101) })).truncated, true);
    assert.equal((await success("timestamp", { action: "from_rfc3339", text: "1969-12-31T23:59:59.999999999Z", unit: "ns" })).text, "-1");
    await failure("timestamp", { action: "from_rfc3339", text: "2024-01-01T00:00:00.0000000001Z", unit: "ns" }, /nanosecond precision/);
    await failure("json", { action: "format", text: "[".repeat(128) + "0" + "]".repeat(128) }, /nesting exceeds/);
    await failure("json", { action: "format", text: "[".repeat(100) + "0,".repeat(300) + "0" + "]".repeat(100), indent: 8 }, /Result exceeds 128 KiB/);
    await failure("hash", { algorithm: "sha256", text: "é".repeat(32_769) }, /64 KiB/);
    await failure("hash", { algorithm: "sha256", text: "", dataBase64: "YQ==" }, /Unexpected/);
    await failure("toolbox/keys/list", {}, /Unknown/);
  });
});

async function withDbx(dataDir, key, mode, run) {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("DBX_"))),
    DBX_DATA_DIR: dataDir, DBX_SECRET_KEY: key,
    DBX_MCP_PLUGIN_TOOLS: mode, DBX_MCP_ALLOW_WRITES: "0",
  };
  const child = spawn(dbxBinary, [], { env, windowsHide: true });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let stderr = "";
  let nextId = 0;

  function fail(error) {
    for (const task of pending.values()) {
      clearTimeout(task.timer);
      task.reject(error);
    }
    pending.clear();
  }

  child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-8192); });
  const closed = new Promise((done) => child.once("close", (code) => {
    fail(new Error("dbx-mcp exited with " + code + "\n" + stderr));
    done();
  }));
  child.on("error", fail);
  child.stdin.on("error", fail);
  lines.on("line", (line) => {
    try {
      const { id, result, error } = JSON.parse(line);
      const task = pending.get(id);
      if (!task) return;
      clearTimeout(task.timer);
      pending.delete(id);
      if (error) task.reject(new Error(JSON.stringify(error)));
      else task.resolve(result);
    } catch (error) {
      fail(error);
    }
  });

  function request(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Timed out calling " + method + "\n" + stderr));
      }, 20_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  try {
    await request("initialize", {
      protocolVersion: "2025-11-25", capabilities: {},
      clientInfo: { name: "toolbox-package-test", version: "1" },
    });
    child.stdin.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await run(request);
  } finally {
    child.kill();
    await closed;
    lines.close();
  }
}

test("packaged tools work through real DBX direct and lazy discovery and enforce read grants", { skip: !dbxBinary || !dbxPackage }, async (t) => {
  const temp = realpathSync(process.env.TOOLBOX_MCP_TMPDIR || tmpdir());
  const dataDir = mkdtempSync(join(temp, "toolbox-mcp-test-"));
  t.after(() => {
    const target = realpathSync(dataDir);
    assert.equal(dirname(target), temp);
    assert.ok(basename(target).startsWith("toolbox-mcp-test-"));
    rmSync(target, { recursive: true, force: true, maxRetries: 3 });
  });
  const key = randomBytes(32).toString("hex");
  const pluginDir = join(dataDir, "plugins", manifest.id);
  mkdirSync(pluginDir, { recursive: true });
  execFileSync("tar", ["-xf", resolve(dbxPackage), "-C", pluginDir], { windowsHide: true });
  const packaged = JSON.parse(readFileSync(join(pluginDir, "manifest.json"), "utf8"));
  assert.equal(packaged.version, manifest.version);
  assert.deepEqual(packaged.contributions, manifest.contributions);

  const { DatabaseSync } = await import("node:sqlite");
  function grant(disabledTools = []) {
    const database = new DatabaseSync(join(dataDir, "dbx.db"));
    try {
      database.exec("CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings_json TEXT NOT NULL)");
      database.prepare("INSERT OR REPLACE INTO app_settings (id, settings_json) VALUES (1, ?)").run(JSON.stringify({
        plugin_mcp_grants: {
          [manifest.id]: { external: true, ceiling: "read", disabledTools },
        },
      }));
    } finally {
      database.close();
    }
  }

  grant();
  const prefix = "dbx_toolbox__";
  const discover = async (request) => {
    const { tools } = await request("tools/list");
    return tools.filter(({ name }) => name.startsWith(prefix));
  };
  await withDbx(dataDir, key, "flat", async (request) => {
    const tools = await discover(request);
    assert.deepEqual(tools.map(({ name }) => name.slice(prefix.length)).sort(), Object.keys(cases).sort());
    assert.ok(tools.every(({ annotations }) => annotations?.readOnlyHint === true));
    assert.ok(tools.every(({ description }) => /\p{Script=Han}/u.test(description)));
    for (const [tool, [args, verify, malformed, error]] of Object.entries(cases)) {
      const result = await request("tools/call", { name: prefix + tool, arguments: args });
      assert.notEqual(result.isError, true, result.content[0].text);
      verify(result.structuredContent);
      const invalid = await request("tools/call", { name: prefix + tool, arguments: malformed });
      assert.equal(invalid.isError, true, tool);
      assert.match(invalid.content[0].text, error, tool);
    }
  });
  await withDbx(dataDir, key, "lazy", async (request) => {
    assert.deepEqual(await discover(request), []);
    const result = await request("tools/call", { name: "dbx_plugin_tools", arguments: { plugin_id: manifest.id } });
    assert.notEqual(result.isError, true, result.content[0].text);
    const headings = [...result.content[0].text.matchAll(/^### (\w+)$/gm)].map(([, name]) => name);
    assert.deepEqual(headings.sort(), Object.keys(cases).sort());
    const reply = await request("tools/call", {
      name: "dbx_plugin_call",
      arguments: { plugin_id: manifest.id, tool: "json_pointer", arguments: cases.json_pointer[0] },
    });
    assert.notEqual(reply.isError, true, reply.content[0].text);
    cases.json_pointer[1](reply.structuredContent);
    const extra = await request("tools/call", {
      name: "dbx_plugin_call",
      arguments: { plugin_id: manifest.id, tool: "data_convert", arguments: cases.data_convert[0] },
    });
    assert.notEqual(extra.isError, true, extra.content[0].text);
    cases.data_convert[1](extra.structuredContent);
  });
  grant(["hash"]);
  await withDbx(dataDir, key, "flat", async (request) => {
    const tools = await discover(request);
    assert.equal(tools.length, 55);
    assert.ok(!tools.some(({ name }) => name === prefix + "hash"));
    const result = await request("tools/call", { name: prefix + "hash", arguments: cases.hash[0] });
    assert.equal(result.isError, true);
  });
  await withDbx(dataDir, key, "lazy", async (request) => {
    const result = await request("tools/call", {
      name: "dbx_plugin_call",
      arguments: { plugin_id: manifest.id, tool: "hash", arguments: cases.hash[0] },
    });
    assert.equal(result.isError, true);
  });
});
