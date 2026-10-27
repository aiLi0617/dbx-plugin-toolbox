import test from "node:test";
import assert from "node:assert/strict";
import {
  basicAuth,
  jsonStructureDiff,
  treeRows,
  yamlDocuments,
  decodeSafeLink,
  toRoman,
  fromRoman,
  randomMac,
  ipv6Ula,
  ipv4Range,
  summarizeIpv4,
  wifiPayload,
} from "../src/lib/developerExpansion.js";
import {
  evaluateExpression,
  convertUnit,
  statistics,
  temperatures,
  businessDays,
  compoundInterest,
  compareBenchmarks,
} from "../src/lib/calculators.js";
import {
  normalizeEmailList,
  extractLinks,
  palette,
} from "../src/lib/contentExpansion.js";
import { validateIban } from "../src/lib/securityExpansion.js";
import { pageSelection } from "../src/lib/pdfTools.js";
import { gridToHtml, gridToText } from "../src/lib/spreadsheet.js";
import {
  encodeAnimation,
  decodeAnimation,
  transformFrames,
} from "../src/lib/gifEditing.js";
import { EXPANSION_TOOLS } from "../src/lib/expansionTools.js";
import { TOOL_REGISTRY, BACKGROUND_TOOL_IDS, EPHEMERAL_TOOL_IDS } from "../src/lib/viewRegistry.js";

test("Basic Auth encodes UTF-8 and rejects ambiguous usernames", () => {
  assert.equal(
    basicAuth("Aladdin", "open sesame"),
    "Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==",
  );
  assert.equal(
    Buffer.from(
      basicAuth("用户", "密:码").split(" ").at(-1),
      "base64",
    ).toString("utf8"),
    "用户:密:码",
  );
  assert.throws(() => basicAuth("a:b", "c"));
  assert.throws(() => basicAuth("a", "b\n"));
});
test("JSON diff ignores key order and distinguishes absence from null", () => {
  assert.deepEqual(jsonStructureDiff('{"a":1,"b":2}', '{"b":2,"a":1}'), []);
  assert.deepEqual(
    jsonStructureDiff('{"a":null,"x/y":1}', '{"b":null,"x/y":2}').map((r) => [
      r.path,
      r.type,
    ]),
    [
      ["/a", "removed"],
      ["/x~1y", "modified"],
      ["/b", "added"],
    ],
  );
  assert.equal(jsonStructureDiff("[1,2]", "[2,1]").length, 2);
});

test("YAML tree data preserves documents, paths, empty values and nested containers", () => {
  const [first, second] = yamlDocuments("name: DBX\nitems:\n  - id: 1\n  - id: 2\nempty: null\n---\nactive: true");
  const tree = treeRows(first, "document[1]");
  assert.equal(second.active, true);
  assert.equal(tree.value, "Object");
  assert.equal(tree.children.find((node) => node.path === 'document[1]["items"]')?.value, "Array (2)");
  assert.equal(tree.children.find((node) => node.path === 'document[1]["empty"]')?.value, "null");
  assert.equal(tree.children.find((node) => node.path === 'document[1]["items"]')?.children[1].children[0].path, 'document[1]["items"][1]["id"]');
});

test("YAML tree parsing reports source location and remains read-only data", () => {
  assert.throws(() => yamlDocuments("name: [broken"), (error) => {
    assert.equal(typeof error.line, "number");
    assert.equal(typeof error.column, "number");
    return true;
  });
  const tree = treeRows({ value: 1 });
  assert.deepEqual(Object.keys(tree).sort(), ["children", "path", "value"]);
});
test("YAML supports multi-documents, anchors, and bounded aliases", () => {
  assert.deepEqual(yamlDocuments("a: &a [1, 2]\nb: *a\n---\ntrue"), [
    { a: [1, 2], b: [1, 2] },
    true,
  ]);
  assert.throws(() => yamlDocuments("a: [wrong"), error => error.line === 1 && error.column > 0);
});
test("YAML tree paths distinguish array indexes from object keys", () => {
  const tree = treeRows({ list: ["one", { nested: true }], "0": "key" }, "document[1]");
  const list = tree.children.find((node) => node.path === 'document[1]["list"]');
  assert.ok(list);
  assert.equal(list.children[0].path, 'document[1]["list"][0]');
  assert.equal(list.children[1].children[0].path, 'document[1]["list"][1]["nested"]');
  assert.ok(tree.children.some((node) => node.path === 'document[1]["0"]'));
});
test("SafeLink parsing is host-bound and never follows arbitrary URL parameters", () => {
  assert.equal(
    decodeSafeLink(
      "https://nam01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fx%3Fa%3D1&data=x",
    ),
    "https://example.com/x?a=1",
  );
  assert.equal(
    decodeSafeLink("https://example.com/?url=https://evil.example/"),
    "https://example.com/?url=https://evil.example/",
  );
  assert.throws(() => decodeSafeLink("javascript:alert(1)"));
});
test("Wi-Fi escaping covers delimiters, hidden and open networks", () => {
  assert.equal(
    wifiPayload("a;b", "x:y\\z", "WPA", true),
    "WIFI:T:WPA;S:a\\;b;P:x\\:y\\\\z;H:true;;",
  );
  assert.match(wifiPayload("Guest", "ignored", "nopass"), /P:;/);
  assert.throws(() => wifiPayload("中".repeat(11), "x"));
});
test("Roman conversions are canonical for every supported value", () => {
  for (let n = 1; n <= 3999; n++) assert.equal(fromRoman(toRoman(n)), n);
  for (const bad of ["IIII", "IC", "MMMM", "VX", ""])
    assert.throws(() => fromRoman(bad));
});
test("Network generators obey local/unicast bits and summarize full IPv4 boundaries", () => {
  const macs = randomMac(50).split("\n");
  assert.equal(new Set(macs).size, 50);
  for (const m of macs) assert.equal(parseInt(m.slice(0, 2), 16) & 3, 2);
  assert.match(ipv6Ula(), /^fd[\da-f]{2}:[\da-f]{4}:[\da-f]{4}::\/48$/);
  assert.deepEqual(ipv4Range("0.0.0.0", "255.255.255.255"), ["0.0.0.0/0"]);
  assert.deepEqual(summarizeIpv4("192.168.1.0/25\n192.168.1.128/25"), [
    "192.168.1.0/24",
  ]);
  assert.deepEqual(
    ipv4Range("255.255.255.254", "255.255.255.255", { expand: true }),
    ["255.255.255.254", "255.255.255.255"],
  );
  assert.throws(() =>
    ipv4Range("0.0.0.0", "255.255.255.255", { expand: true }),
  );
});
test("Expression parser honors precedence and cannot execute code", () => {
  assert.equal(evaluateExpression("-2^2 + 2^3^2"), 508);
  assert.equal(evaluateExpression("sqrt(16)+sin(pi/2)"), 5);
  for (const s of [
    "globalThis.alert(1)",
    "constructor(1)",
    "1/0",
    "2 3",
    "sqrt(-1)",
    "Math.sin(0)",
    "1;2",
  ])
    assert.throws(() => evaluateExpression(s));
});
test("Statistics distinguish sample and population, units preserve binary semantics", () => {
  const s = statistics("1,2,3,4");
  assert.equal(s.mean, 2.5);
  assert.equal(s.populationVariance, 1.25);
  assert.equal(s.sampleVariance, 5 / 3);
  assert.equal(statistics("2").sampleVariance, null);
  assert.equal(convertUnit(1, "data", "KiB", "B"), 1024);
  assert.equal(convertUnit(1, "length", "in", "cm"), 2.54);
  assert.equal(temperatures(32, "F").C, 0);
  assert.throws(() => temperatures(-1, "K"));
});

test("Statistics accept pasted separators and scientific notation without ignoring invalid values", () => {
  const result = statistics("-2，0；2、4\n6\t1e1");
  assert.equal(result.count, 6);
  assert.equal(result.sum, 20);
  assert.equal(result.median, 3);
  assert.deepEqual(result.modes, []);
  assert.deepEqual(statistics("1,1,2,2,3").modes, [1, 2]);
  const single = statistics("-3.5");
  assert.equal(single.populationVariance, 0);
  assert.equal(single.sampleStdDev, null);
  for (const input of ["", "1, invalid, 3", "NaN", "Infinity", "1e309"])
    assert.throws(() => statistics(input));
  assert.equal(statistics(Array(100000).fill("2").join(",")).count, 100000);
  assert.throws(() => statistics(Array(100001).fill("2").join(",")));
});
test("Business dates skip configured weekends and holidays in both directions", () => {
  assert.equal(
    businessDays("2026-10-23", { add: 1, holidays: ["2026-10-26"] }).end,
    "2026-10-27",
  );
  assert.equal(businessDays("2026-10-26", { add: -1 }).end, "2026-10-23");
  assert.equal(
    businessDays("2026-10-23", { end: "2026-10-27" }).workingDays,
    2,
  );
  assert.throws(() => businessDays("2026-02-30", { add: 1 }));
});
test("Finance and benchmark calculations use explicit contribution and comparison conventions", () => {
  assert.equal(compoundInterest(100, 0, 1, 12, 10).total, 220);
  assert.ok(Math.abs(compoundInterest(100, 10, 1, 1, 0).total - 110) < 1e-10);
  const rows = compareBenchmarks("slow: 1,2,3\nfast: 4,5,6");
  assert.equal(rows[0].name, "fast");
  assert.equal(rows[1].relativeToFastest, 0.4);
});
test("Content processing preserves account meaning by default and escapes HTML exports", () => {
  assert.equal(normalizeEmailList(" A.B+tag@GMAIL.COM "), "A.B+tag@gmail.com");
  assert.equal(
    normalizeEmailList(" A.B+tag@GMAIL.COM ", { gmail: true, stripPlus: true }),
    "ab@gmail.com",
  );
  assert.deepEqual(
    extractLinks("Docs example.com/x?a=1 and mailto:a@example.com", {
      keepQuery: false,
    }),
    ["https://example.com/x", "mailto:a@example.com"],
  );
  assert.equal(palette("#ff0000", "triadic").length, 3);
  assert.match(gridToHtml([["<script>", "&"]]), /&lt;script&gt;/);
  assert.equal(gridToText([["a", "", "c"], ["b"]], "|"), "a||c\nb||");
});
test("IBAN validates known checksums and country length", () => {
  assert.equal(validateIban("GB82 WEST 1234 5698 7654 32").valid, true);
  assert.equal(validateIban("GB83WEST12345698765432").valid, false);
  assert.equal(validateIban("ZZ82WEST12345698765432").valid, false);
});
test("GIF roundtrip preserves transparent pixels, frame timings, loops and crop", () => {
  const animation = {
    width: 2,
    height: 1,
    repeat: 3,
    frames: [
      { data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]), delay: 70 },
      { data: new Uint8ClampedArray([0, 0, 0, 0, 0, 255, 0, 255]), delay: 130 },
    ],
  };
  const decoded = decodeAnimation(encodeAnimation(animation, 16).buffer);
  assert.equal(decoded.repeat, 3);
  assert.deepEqual(
    decoded.frames.map((f) => f.delay),
    [70, 130],
  );
  assert.equal(decoded.frames[0].data[7], 0);
  assert.equal(decoded.frames[1].data[3], 0);
  const transformed = transformFrames(decoded, {
    crop: { x: 1, y: 0, width: 1, height: 1 },
    width: 1,
    height: 1,
    step: 2,
  });
  assert.equal(transformed.frames.length, 1);
  assert.equal(transformed.frames[0].delay, 200);
});
test("PDF selection rejects invalid and oversized ranges", () => {
  assert.deepEqual(pageSelection("3,1-2,3", 3), [2, 0, 1]);
  assert.throws(() => pageSelection("0", 3));
  assert.throws(() => pageSelection("2-1", 3));
  assert.throws(() => pageSelection("1-4", 3));
});
test("All expansion entries are routable and credentials are ephemeral", () => {
  for (const [id] of EXPANSION_TOOLS) {
    const entry = TOOL_REGISTRY.find((t) => t.id === id);
    assert.ok(entry?.loader, id);
    assert.ok(entry.limits, id);
  }
  for (const id of [
    "basic-auth",
    "wifi-qr",
    "bcrypt",
    "bip39",
    "password-strength",
  ])
    assert.ok(EPHEMERAL_TOOL_IDS.has(id));
  for (const id of ["pdf-encrypt", "pdf-decrypt"]) {
    assert.ok(BACKGROUND_TOOL_IDS.has(id));
    assert.ok(!EPHEMERAL_TOOL_IDS.has(id));
  }
});
