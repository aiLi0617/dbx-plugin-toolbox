import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

globalThis.crypto ??= webcrypto;

const codec = await import("../src/lib/codec.js");
const convert = await import("../src/lib/tools/convert.js");
const encode = await import("../src/lib/tools/encode.js");
const format = await import("../src/lib/tools/format.js");
const generate = await import("../src/lib/tools/generate.js");
const cron = await import("../src/lib/cron.js");
const jsonToLang = await import("../src/lib/jsonToLang.js");
const textTools = await import("../src/lib/tools/text.js");
const catalog = await import("../src/lib/catalog.js");
const navigation = await import("../src/lib/navigation.js");
const registry = await import("../src/lib/viewRegistry.js");

test("tool catalog contains unique, complete entries", () => {
  assert.ok(catalog.tools.length > 0);
  assert.equal(new Set(catalog.tools.map((tool) => tool.id)).size, catalog.tools.length);
  assert.ok(catalog.tools.every((tool) => tool.name.zh && tool.name.en && tool.summary?.zh && tool.summary?.en && tool.view));
});

test("QR SVG export is self-contained and escapes style attributes", async () => {
  const { renderQrSvg } = await import("../src/lib/qrRender.js");
  const result = await renderQrSvg("https://example.test/?a=1&b=2", {
    width: 240,
    margin: 4,
    dark: "#123456",
    light: "#ffffff",
  });
  assert.equal(result.type, "qr");
  assert.match(result.svg, /^<svg xmlns=/);
  assert.match(result.svg, /fill="#123456"/);
  assert.ok(result.dataUrl.startsWith("data:image\/svg\+xml"));
  assert.ok(result.modules > 0);
});

test("runtime tool registry has a loader and stable metadata for every catalog entry", () => {
  assert.equal(registry.TOOL_REGISTRY.length, catalog.tools.length);
  assert.deepEqual(registry.TOOL_IDS, catalog.tools.map((tool) => tool.id));
  for (const tool of registry.TOOL_REGISTRY) {
    assert.equal(typeof tool.loader, "function", `${tool.id} should have a view loader`);
    assert.equal(typeof tool.view, "string");
    assert.equal(typeof tool.ephemeral, "boolean");
    assert.equal(typeof tool.fill, "boolean");
    assert.ok(Array.isArray(tool.aliases));
    assert.deepEqual(tool.defaultOptions, {});
  }
});

test("merged text tools preserve favorites and search targets", async () => {
  const { textActionForQuery } = await import("../src/lib/textActions.js");
  assert.deepEqual(catalog.toolsByIds(["case", "stats", "slugify", "strip-html", "naming", "lines"]).map((tool) => tool.id), ["whitespace"]);
  for (const [query, action] of [["去重", "unique"], ["大小写", "upper"], ["naming", "camel"], ["字数统计", "stats"], ["strip-html", "strip-html"], ["slugify", "slugify"]]) {
    assert.ok(catalog.searchTools(query, "zh-CN").some((tool) => tool.id === "whitespace"));
    assert.equal(textActionForQuery(query), action);
  }
  const cleaned = textTools.applyWhitespace("b\n\na\nb", "empty");
  const unique = textTools.applyWhitespace(cleaned, "unique");
  assert.equal(textTools.applyWhitespace(unique, "prefix", { affix: "- " }), "- b\n- a");
});

test("catalog cards can only be reordered inside their category", () => {
  const original = catalog.tools.map((tool) => tool.id);
  const formatIds = catalog.tools.filter((tool) => tool.category === "format").map((tool) => tool.id);
  assert.ok(formatIds.length > 1);

  const moved = catalog.moveToolWithinCategory(original, formatIds[0], formatIds[1], true);
  const movedFormatIds = moved.filter((id) => catalog.tools.find((tool) => tool.id === id)?.category === "format");
  assert.deepEqual(movedFormatIds.slice(0, 2), [formatIds[1], formatIds[0]]);

  const otherCategoryId = catalog.tools.find((tool) => tool.category !== "format").id;
  assert.deepEqual(catalog.moveToolWithinCategory(original, formatIds[0], otherCategoryId, true), original);
});

test("navigation sanitizes legacy ids and preserves favorite order", () => {
  assert.deepEqual(
    navigation.sanitizeToolIds(["json-yaml", "missing", "hash", "json", "hash"]),
    ["json", "hash"],
  );
  assert.deepEqual(navigation.moveToolId(["json", "hash", "uuid"], "uuid", "json"), ["uuid", "json", "hash"]);
  assert.deepEqual(navigation.moveToolId(["json", "hash", "uuid"], "json", "hash", true), ["hash", "json", "uuid"]);
  assert.deepEqual(navigation.moveId(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(navigation.moveId(["a", "b", "c"], "a", "b", true), ["b", "a", "c"]);
});

test("recent tools are unique and capped", () => {
  let recent = [];
  for (const id of ["json", "hash", "uuid", "json", "color"]) recent = navigation.pushRecent(recent, id, 3);
  assert.deepEqual(recent, ["color", "json", "uuid"]);
});

test("Base58 preserves empty and leading-zero byte arrays", () => {
  for (const bytes of [[], [0], [0, 0], [0, 1], [1, 2, 255]]) {
    const input = Uint8Array.from(bytes);
    assert.deepEqual([...codec.decodeBase58(codec.encodeBase58(input))], bytes);
  }
});

test("hex and quoted-printable reject malformed escapes", () => {
  assert.throws(() => codec.hexToBytes("zz"), /hex/i);
  assert.throws(() => codec.decodeQuotedPrintable("=GG"), /quoted-printable/i);
});

test("CRC32 hashes arbitrary bytes", () => {
  assert.equal(codec.crc32Bytes(new TextEncoder().encode("123456789")), "cbf43926");
});

test("quoted-printable preserves lines and encodes trailing whitespace", () => {
  const input = "alpha  \n中文\t";
  const encoded = codec.encodeQuotedPrintable(input);
  assert.match(encoded, /=20=20\r\n/);
  assert.match(encoded, /=09$/);
  assert.equal(codec.decodeQuotedPrintable(encoded), input.replace(/\n/g, "\r\n"));
});

test("text escape formats round-trip common developer strings", () => {
  const sample = `<tag>中文 "hi"\n`;
  assert.equal(encode.unescapeHtml(encode.escapeHtml(sample)), sample);
  assert.equal(encode.unescapeUnicode(encode.escapeUnicode("中文")), "中文");
  assert.equal(encode.unescapeJsUnicode(encode.escapeJsUnicode("中文😀")), "中文😀");
  assert.equal(encode.unescapeJson(encode.escapeJson(sample)), sample);
  assert.equal(encode.unescapeJson('"hi\\n"'), "hi\n");
  assert.throws(() => encode.unescapeJson("\\"), /json string escape/i);
  const css = encode.escapeCssIdent("a b");
  assert.match(css, /\\/);
  assert.equal(encode.unescapeCssIdent(css), "a b");
});

test("ULID has a valid timestamp prefix and alphabet", () => {
  const before = Date.now();
  const id = codec.encodeUlid();
  const after = Date.now();
  assert.match(id, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let timestamp = 0n;
  for (const ch of id.slice(0, 10)) timestamp = timestamp * 32n + BigInt(alphabet.indexOf(ch));
  assert.ok(Number(timestamp) >= before && Number(timestamp) <= after);
});

test("password generation includes every selected class", () => {
  const password = codec.randomPassword(32, { lower: true, upper: true, digits: true, symbols: true });
  assert.match(password, /[a-z]/);
  assert.match(password, /[A-Z]/);
  assert.match(password, /\d/);
  assert.match(password, /[^A-Za-z0-9]/);
});

test("TOTP matches the RFC SHA-1 test vector and accepts otpauth URIs", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(await codec.totp(secret, 8, 30, "SHA-1", 59_000), "94287082");
  const parsed = codec.parseTotpConfig(`otpauth://totp/Test?secret=${secret}&digits=8&period=30&algorithm=SHA1`);
  assert.deepEqual(parsed, { secret, digits: 8, step: 30, algorithm: "SHA-1" });
});

test("timestamp parsing obeys the selected unit", () => {
  assert.equal(convert.parseUnixToMs("1000", "ms"), 1000);
  assert.equal(convert.parseUnixToMs("1000", "s"), 1_000_000);
});

test("RGB-only color conversion rejects alpha-bearing hex", () => {
  assert.equal(convert.parseHexColor("#11223344"), null);
  assert.deepEqual(convert.parseHexColor("#123"), { r: 17, g: 34, b: 51 });
});

test("CSV handles primitives, CR, multiline fields, and invalid quotes", () => {
  assert.equal(convert.jsonToCsv([1, 2]), "value\n1\n2");
  assert.equal(convert.jsonToCsv([{ value: "a\rb" }]), 'value\n"a\rb"');
  const json = convert.runJsonConvert('name,note\r\na,"line 1\r\nline 2"', { mode: "csv-json" });
  assert.deepEqual(JSON.parse(json), [{ name: "a", note: "line 1\r\nline 2" }]);
  assert.throws(() => convert.runJsonConvert('a\n"broken', { mode: "csv-json" }), /unclosed/i);
});

test("SQL output quotes identifiers and serializes nested JSON", () => {
  const sql = convert.jsonToInsert({ nested: { ok: true } }, "app.users");
  assert.match(sql, /^INSERT INTO `app`\.`users`/);
  assert.match(sql, /'\{"ok":true\}'/);
});

test("type and SQL inference inspect all array rows", () => {
  const source = '[{"a":1},{"b":"x"}]';
  const ts = jsonToLang.convertJsonToLang(source, "typescript");
  assert.match(ts, /a\?: number/);
  assert.match(ts, /b\?: string/);
  const sql = jsonToLang.convertJsonToLang(source, "mysql", { table: "items" });
  assert.match(sql, /`a` BIGINT/);
  assert.match(sql, /`b` TEXT/);
});

test("Spring presets use six fields and Quartz nth-weekday keeps the ordinal", () => {
  const preset = cron.CRON_PRESETS.find((item) => item.id === "weekdays9");
  assert.equal(cron.presetExpression(preset, "spring").split(/\s+/).length, 6);
  const result = cron.explainCron("0 0 12 ? * 2#2 *", { flavorId: "quartz", tz: "UTC" });
  const next = new Date(result.next[0]);
  assert.equal(next.getUTCDay(), 1);
  assert.ok(next.getUTCDate() >= 8 && next.getUTCDate() <= 14);
});

test("Quartz nearest-weekday and last-weekday expressions produce valid runs", () => {
  for (const expression of ["0 0 12 15W * ? *", "0 0 12 LW * ? *"]) {
    const result = cron.explainCron(expression, { flavorId: "quartz", tz: "UTC" });
    assert.equal(result.next.length, 5);
    for (const iso of result.next) assert.ok(![0, 6].includes(new Date(iso).getUTCDay()));
  }
});

test("text helpers support Unicode slugs, graphemes, and zero-width regex matches", () => {
  assert.equal(textTools.slugify("中文 标题"), "中文-标题");
  assert.equal(textTools.textStats("👨‍👩‍👧‍👦").chars, 1);
  assert.equal(textTools.testRegex("a", "^|$", "g").matches.length, 2);
});

test("text line tools number, unnumber, extract, filter, and shuffle", () => {
  assert.equal(textTools.applyWhitespace("alpha\nbeta", "number", { start: 7, width: 3, separator: ") " }), "007) alpha\n008) beta");
  assert.equal(textTools.applyWhitespace("007) alpha\n8、beta", "unnumber"), "alpha\nbeta");
  assert.equal(textTools.applyWhitespace("a,b,c\nd,e,f", "column", { column: 2, delimiter: "," }), "b\ne");
  assert.equal(textTools.applyWhitespace("a\n👨‍👩‍👧‍👦\nlong", "filter-length", { minLength: 1, maxLength: 1 }), "a\n👨‍👩‍👧‍👦");
  assert.equal(textTools.applyWhitespace("a\nb\nc", "shuffle", { random: () => 0 }), "b\nc\na");
  const seeded = textTools.applyWhitespace("a\nb\nc\nd", "shuffle", { seed: 42 });
  assert.equal(textTools.applyWhitespace("a\nb\nc\nd", "shuffle", { seed: 42 }), seeded);
  assert.notEqual(textTools.applyWhitespace("a\nb\nc\nd", "shuffle", { seed: 43 }), seeded);
});

test("findReplace supports regex, first-only, and ignore-case", () => {
  assert.equal(textTools.findReplace("AaAa", "a", "x"), "AxAx");
  assert.equal(textTools.findReplace("AaAa", "a", "x", { firstOnly: true }), "AxAa");
  assert.equal(textTools.findReplace("AaAa", "a", "x", { ignoreCase: true }), "xxxx");
  assert.equal(textTools.findReplace("AaAa", "a", "x", { ignoreCase: true, firstOnly: true }), "xaAa");
  assert.equal(textTools.findReplace("a1 a22", "a(\\d+)", "N$1", { regex: true }), "N1 N22");
  assert.equal(textTools.findReplace("a1 a22", "a(\\d+)", "N$1", { regex: true, firstOnly: true }), "N1 a22");
  assert.equal(textTools.findReplace("Hello $world", "$", "_"), "Hello _world");
  assert.equal(textTools.applyWhitespace("Foo foo", "replace", { find: "foo", replace: "bar", ignoreCase: true }), "bar bar");
  assert.throws(() => textTools.findReplace("abc", "(", "x", { regex: true }), /regular expression/i);
});

test("IPv4 calculator validates masks and derives subnet boundaries", async () => {
  const network = await import("../src/lib/network.js");
  const result = network.calculateIpv4("192.168.1.10/24");
  assert.equal(result.network, "192.168.1.0");
  assert.equal(result.broadcast, "192.168.1.255");
  assert.equal(result.firstHost, "192.168.1.1");
  assert.equal(result.lastHost, "192.168.1.254");
  assert.equal(result.usable, 254);
  assert.equal(result.type, "private");
  assert.equal(network.maskToPrefix("255.255.254.0"), 23);
  assert.throws(() => network.maskToPrefix("255.0.255.0"), /contiguous/i);
  assert.equal(network.calculateIpv4("10.0.0.0/31").usable, 2);
  assert.equal(network.calculateIpv4("10.0.0.1/32").usable, 1);
  assert.throws(() => network.calculateIpv4("10.0.0.1/"), /prefix/i);
  assert.throws(() => network.parseCidr("10.0.0.1/33"), /between 0 and 32/i);
  assert.equal(network.integerToIpv4("3232235786"), "192.168.1.10");
});

test("Data URI supports base64 and percent-encoded round trips", () => {
  const generated = encode.toDataUri("你好", "text/plain;charset=utf-8");
  const parsed = encode.parseDataUri(generated);
  assert.equal(parsed.mime, "text/plain");
  assert.equal(parsed.charset.toLowerCase(), "utf-8");
  assert.equal(parsed.text, "你好");
  assert.equal(parsed.base64, true);

  const percent = encode.toDataUri("hello world", "text/plain;charset=utf-8", { encoding: "percent" });
  assert.equal(percent, "data:text/plain;charset=utf-8,hello%20world");
  const percentParsed = encode.parseDataUri(percent);
  assert.equal(percentParsed.text, "hello world");
  assert.equal(percentParsed.base64, false);

  const percentBytes = encode.dataUriFromBytes(new TextEncoder().encode("hi"), "text/plain", { encoding: "percent" });
  assert.equal(percentBytes, "data:text/plain,hi");
  assert.equal(encode.parseDataUri(percentBytes).text, "hi");


  const zhPercent = encode.toDataUri("你好", "text/plain;charset=utf-8", { encoding: "percent" });
  assert.match(zhPercent, /^data:text\/plain;charset=utf-8,%/);
  assert.equal(encode.parseDataUri(zhPercent).text, "你好");

  const plain = encode.parseDataUri("data:text/plain,hello%20world");
  assert.equal(plain.text, "hello world");
  assert.equal(plain.base64, false);
  assert.deepEqual([...encode.parseDataUri("data:application/octet-stream,%00%FF").bytes], [0, 255]);
  assert.throws(() => encode.parseDataUri("https://example.com"), /data uri/i);
  assert.equal(encode.parseDataUri(`data:text/plain,${"a".repeat(100_000)}`).size, 100_000);
  assert.throws(() => encode.toDataUri("a".repeat(10 * 1024 * 1024 + 1)), /10 MB/i);
  assert.throws(
    () => encode.parseDataUri(`data:application/octet-stream;base64,${"A".repeat(14_000_000)}`),
    /10 MB/i,
  );
});

test("JWT claim inspection reports expiry and activation state", () => {
  const claims = encode.inspectJwtClaims({ exp: 99, nbf: 50, iat: 101 }, 100_000);
  assert.equal(claims.expired, true);
  assert.equal(claims.active, true);
  assert.equal(claims.issuedInFuture, true);
});

test("diff supports word granularity and ignore options", () => {
  const parts = textTools.diffParts("Hello  world", "hello world!", {
    mode: "words",
    ignoreWhitespace: true,
    ignoreCase: true,
  });
  assert.ok(parts.some((part) => part.mark === "add" && part.value.includes("!")));
  assert.ok(!parts.some((part) => part.mark === "del"));
});

test("line diff keeps replacements adjacent when lines repeat", () => {
  const left = ["asd", "asd", "asd", "asd", "asd", "as", "da", "sd", "as"].join("\n");
  const right = ["as", "asd", "asd", "as", "asd", "as", "da", "sd", "as"].join("\n");
  const rows = textTools.lineDiffParts(left, right);
  assert.deepEqual(
    rows.map((row) => [row.mark, row.line]),
    [
      ["del", "asd"],
      ["add", "as"],
      ["same", "asd"],
      ["same", "asd"],
      ["del", "asd"],
      ["add", "as"],
      ["same", "asd"],
      ["same", "as"],
      ["same", "da"],
      ["same", "sd"],
      ["same", "as"],
    ],
  );
});

test("hash catalog includes MD5 variants, SHA-224, SHA3-256, and SHA-384", async () => {
  assert.deepEqual(
    generate.HASH_ALGORITHMS.slice(0, 8).map((algorithm) => algorithm.id),
    ["md5-16", "md5", "sha-1", "sha-224", "sha-256", "sha3-256", "sha-384", "sha-512"],
  );
  assert.equal(
    await generate.hashText("sha-384", ""),
    "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b",
  );
});

test("side-by-side line diff keeps change runs and following context aligned", () => {
  const rows = [
    { mark: "same", line: "first", pfx: " " },
    { mark: "del", line: "old one", pfx: "-" },
    { mark: "del", line: "old two", pfx: "-" },
    { mark: "add", line: "new", pfx: "+" },
    { mark: "same", line: "last", pfx: " " },
  ];
  const aligned = textTools.alignSideBySideRows(rows);
  assert.deepEqual(
    aligned.map((row) => [row.left?.line ?? null, row.right?.line ?? null]),
    [
      ["first", "first"],
      ["old one", "new"],
      ["old two", null],
      ["last", "last"],
    ],
  );
});

test("line replacements expose character-level changes inside aligned rows", () => {
  const rows = textTools.decorateInlineLineChanges([
    { mark: "same", line: "你好", pfx: " " },
    { mark: "del", line: "测试 测试", pfx: "-" },
    { mark: "add", line: "测试 不测试", pfx: "+" },
    { mark: "same", line: "测一测", pfx: " " },
  ]);
  assert.deepEqual(rows[1].segments, [
    { mark: "same", value: "测试 " },
    { mark: "same", value: "测试" },
  ]);
  assert.deepEqual(rows[2].segments, [
    { mark: "same", value: "测试 " },
    { mark: "add", value: "不" },
    { mark: "same", value: "测试" },
  ]);
});

test("code formatting respects indentation", () => {
  assert.match(format.formatCode("a:\n  b:\n    c: 1", "yaml", "format", "sql", 4), /^a:\n {4}b:\n {8}c: 1/m);
  assert.match(format.formatCode("<root><item>x</item></root>", "xml", "format", "sql", 4), /\n {4}<item>/);
});
