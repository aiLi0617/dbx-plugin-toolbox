import test from "node:test";
import assert from "node:assert/strict";
import { chmodFromOctal, chmodFromSymbolic, chmodFromUmask, chmodSymbolicExpression, parseDotEnv, searchHttpStatuses, stringifyDotEnv } from "../src/lib/developerUtilities.js";
import { validateJsonSchema } from "../src/lib/lazy/schema.js";
import { analyzeSemver, inspectSemver } from "../src/lib/lazy/semver.js";

test("dotenv converts without interpolation and reports duplicate or invalid declarations", () => {
  const parsed = parseDotEnv('NAME="DBX Toolbox"\nPORT=5190\nNAME=Toolbox\nBAD KEY=x\nREF=$PORT');
  assert.deepEqual(parsed.value, { NAME: "Toolbox", PORT: "5190", REF: "$PORT" });
  assert.equal(parsed.diagnostics.filter((item) => item.level === "warning").length, 1);
  assert.equal(parsed.diagnostics.filter((item) => item.level === "error").length, 1);
  assert.match(stringifyDotEnv({ NAME: "DBX Toolbox", PORT: 5190 }), /NAME="DBX Toolbox"/);
  assert.equal(parseDotEnv('MULTI="first\nsecond"').value.MULTI, "first\nsecond");
});

test("chmod converts ordinary and special permissions both ways", () => {
  assert.equal(chmodFromOctal("755").symbolic, "rwxr-xr-x");
  assert.equal(chmodFromOctal("4755").symbolic, "rwsr-xr-x");
  assert.equal(chmodFromOctal("0O755").symbolic, "rwxr-xr-x");
  assert.equal(chmodFromSymbolic("rwsr-xr-x").octal, "4755");
  assert.equal(chmodSymbolicExpression("4755"), "u=rwx,g=rx,o=rx,u+s");
  assert.equal(chmodSymbolicExpression("4644"), "u=rw,g=r,o=r,u+s");
  assert.throws(() => chmodFromOctal("988"), /octal/i);
});

test("umask derives separate regular-file and directory permissions", () => {
  assert.deepEqual(chmodFromUmask("022"), {
    umask: "022",
    file: { octal: "644", symbolic: "rw-r--r--" },
    directory: { octal: "755", symbolic: "rwxr-xr-x" },
  });
  assert.deepEqual(chmodFromUmask("0o077").file, { octal: "600", symbolic: "rw-------" });
  assert.throws(() => chmodFromUmask("089"), /umask/i);
  assert.throws(() => chmodFromUmask("1022"), /umask/i);
});

test("HTTP status lookup stays offline and supports code, name, and class", () => {
  assert.deepEqual(searchHttpStatuses("418").map((item) => item.code), [418]);
  assert.equal(searchHttpStatuses("not found")[0].code, 404);
  assert.ok(searchHttpStatuses("5xx").every((item) => item.code >= 500));
  assert.equal(searchHttpStatuses("请求过于频繁")[0].code, 429);
  assert.equal(searchHttpStatuses("teapot")[0].unused, true);
  assert.equal(searchHttpStatuses("104")[0].temporary, true);
});

test("JSON Schema validates Draft 2020-12 data and returns structured paths", () => {
  const schema = { type: "object", required: ["name"], properties: { name: { type: "string", minLength: 2 } } };
  assert.equal(validateJsonSchema(schema, { name: "DBX" }).valid, true);
  const invalid = validateJsonSchema(schema, { name: 1 });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors[0].path, "/name");
});

test("SemVer compares, sorts, and checks ranges", () => {
  const result = inspectSemver("2.0.0 1.5.0 1.0.0", "^1.0.0");
  assert.deepEqual(result.sorted, ["1.0.0", "1.5.0", "2.0.0"]);
  assert.deepEqual(result.versions.map((item) => item.satisfies), [false, true, true]);
  assert.equal(result.maximumSatisfying, "1.5.0");
  assert.throws(() => inspectSemver("latest"), /invalid semantic version/i);
  assert.throws(() => inspectSemver("1.0.0", "not a range"), /invalid semantic version range/i);
});

test("SemVer analysis keeps partial results and explains equal precedence", () => {
  const result = analyzeSemver("1.0.0+foo latest 1.0.0+bar", "^1.0.0");
  assert.equal(result.validCount, 2);
  assert.equal(result.invalidCount, 1);
  assert.deepEqual(result.maximumEquivalent, ["1.0.0+bar", "1.0.0+foo"]);
  assert.equal(result.maximum, "1.0.0+foo");
  assert.equal(result.maximumSatisfying, "1.0.0+foo");
  assert.equal(result.versions.find((item) => item.version === "latest").valid, false);
  assert.deepEqual(result.versions.find((item) => item.version === "1.0.0+foo").build, ["foo"]);
});

test("SemVer prerelease matching is explicit", () => {
  const ordinary = analyzeSemver("1.2.3-alpha.1 1.2.3", ">=1.2.3-alpha.1 <2.0.0");
  assert.deepEqual(ordinary.matching, ["1.2.3-alpha.1", "1.2.3"]);
  const inclusive = analyzeSemver("2.0.0-beta.1", ">=1.0.0 <2.0.0", { includePrerelease: true });
  assert.equal(inclusive.versions[0].satisfies, true);
});
