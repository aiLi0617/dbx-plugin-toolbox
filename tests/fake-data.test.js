import test from "node:test";
import assert from "node:assert/strict";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { FAKE_PHONE_REGIONS, formatFakeRows, generateFakeRows, parseFakeFields } from "../src/lib/fakeData.js";
import { FIELD_GROUPS } from "../src/lib/fakeDataCopy.js";

const field = (name, type, options = {}) => ({ name, type, options });
const referenceDate = "2025-02-28";

function assertResidentIdChecksum(id) {
  // ISO 7064 MOD 11-2 uses powers of two and requires the weighted total to equal 1 modulo 11.
  const checksum = Array.from(id).reduce((sum, digit, index) =>
    sum + (digit === "X" ? 10 : Number(digit)) * 2 ** (17 - index), 0);
  assert.equal(checksum % 11, 1);
}

test("every advertised field has a workable default", () => {
  const fields = FIELD_GROUPS.flatMap(([, types]) => Object.keys(types).map((type) => field(type, type)));
  const [row] = generateFakeRows(1, fields, { referenceDate });
  assert.deepEqual(Object.keys(row), fields.map(({ name }) => name));
  assert.equal(row.name, `${row.firstName} ${row.lastName}`);
  assert.match(row.email, /@example\.invalid$/);
  assert.match(row.domain, /\.example\.invalid$/);
  assert.match(row.url, /^https:\/\/example\.invalid\//);
  assert.match(row.ipv4, /^192\.0\.2\.\d+$/);
  assert.match(row.ipv6, /^2001:db8::[a-f0-9]+:[a-f0-9]+$/);
  assert.match(row.uuid, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(typeof row.timestamp, "number");
  assert.equal([...row.paragraph.matchAll(/\./g)].length, 3);
});

test("generated names, organizations, and text accept a language per field", () => {
  const types = ["name", "firstName", "lastName", "company", "department", "jobTitle", "sentence", "paragraph"];
  const fields = types.flatMap((type) => [
    field(`${type}Zh`, type, { language: "zh-CN", count: 2 }),
    field(`${type}En`, type, { language: "en", count: 2 }),
  ]);
  const rows = generateFakeRows(12, fields, { seed: "bilingual" });
  assert.deepEqual(rows, generateFakeRows(12, fields, { seed: "bilingual" }));
  for (const row of rows) {
    assert.equal(row.nameZh, row.lastNameZh + row.firstNameZh);
    assert.equal(row.nameEn, `${row.firstNameEn} ${row.lastNameEn}`);
    for (const type of types) {
      assert.match(row[`${type}Zh`], /\p{Script=Han}/u);
      assert.match(row[`${type}En`], /^[\x00-\x7f]+$/);
    }
    assert.match(row.companyZh, /有限公司$/);
    assert.equal(row.sentenceZh.split("。").length - 1, 2);
    assert.equal(row.paragraphZh.split("\n\n").length, 2);
  }
  assert.throws(() => generateFakeRows(1, [field("公司", "company", { language: "fr" })]), {
    code: "options", field: "公司",
  });
});

test("all supported mobile regions pass local metadata checks in both output formats", () => {
  for (const region of ["CN", "HK", "MO", "TW", "KR", "SG", "MY", "IN", "BR", "ZA", "AE"]) {
    assert.ok(FAKE_PHONE_REGIONS.includes(region), region);
  }
  for (const region of FAKE_PHONE_REGIONS) {
    const options = { seed: "forms", referenceDate };
    const national = generateFakeRows(4, [field("phone", "phone", { region })], options);
    const international = generateFakeRows(4, [field("phone", "phone", { region, format: "international" })], options);
    international.forEach(({ phone }, index) => {
      assert.match(phone, /^\+\d+$/);
      const parsed = parsePhoneNumberFromString(phone);
      assert.equal(parsed.country, region);
      assert.ok(parsed.isValid());
      assert.ok(["MOBILE", "FIXED_LINE_OR_MOBILE"].includes(parsed.getType()));
      assert.match(national[index].phone, /^\d+$/);
      assert.equal(national[index].phone, parsed.formatNational().replace(/\D/g, ""));
    });
  }
});

test("custom date templates support dates, birthdays and UTC times", () => {
  const day = { start: "2024-02-09", end: "2024-02-09" };
  const custom = (pattern) => ({ format: "custom", customFormat: pattern });
  const fields = [
    field("date", "date", { ...day, ...custom("YYYYMMDD") }),
    field("short", "date", { ...day, ...custom("[Date] yy.M.d") }),
    field("dateWithTime", "date", { ...day, ...custom("YYYY-MM-DD HH:mm:ss") }),
    field("birth", "birthDate", custom("YYYY年M月D日")),
    field("birthISO", "birthDate"),
    field("instant", "datetime", { ...day, ...custom("yyyy/MM/dd[T]HH:mm:ss [UTC]") }),
  ];
  const rows = generateFakeRows(8, fields, { seed: "custom", referenceDate });
  for (const row of rows) {
    assert.equal(row.date, "20240209");
    assert.equal(row.short, "Date 24.2.9");
    assert.match(row.dateWithTime, /^2024-02-09 (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/);
    const [year, month, dayOfMonth] = row.birthISO.split("-").map(Number);
    assert.equal(row.birth, `${year}年${month}月${dayOfMonth}日`);
    assert.match(row.instant, /^2024\/02\/09T\d{2}:\d{2}:\d{2} UTC$/);
  }
  assert.ok(new Set(rows.map(({ dateWithTime }) => dateWithTime)).size > 1);
  for (const pattern of ["", "[literal]", "YYYY-MM-DD [unterminated", "YYYY-QQ"]) {
    assert.throws(() => generateFakeRows(1, [field("date", "date", { ...day, ...custom(pattern) })]),
      { code: "dateFormat", field: "date" });
  }
  assert.throws(() => generateFakeRows(1, [field("birth", "birthDate", custom("YYYY-MM-DD HH:mm:ss"))]),
    { code: "dateFormat", field: "birth" });
});

test("a row shares its birthday, completed age, sex, and valid resident ID", () => {
  const fields = [
    field("birth", "birthDate", { format: "DD/MM/YYYY" }),
    field("iso", "birthDate"),
    field("years", "age", { min: 24, max: 24 }),
    field("otherAge", "age", { min: 20, max: 30 }),
    field("sex", "gender"),
    field("id", "idCard"),
    field("idAgain", "idCard"),
  ];
  const options = { seed: "birthday-1", referenceDate };
  const rows = generateFakeRows(1000, fields, options);
  assert.deepEqual(rows, generateFakeRows(1000, fields, options));
  assert.ok(rows.some(({ iso }) => iso === "2000-02-29"));
  assert.ok(rows.some(({ iso }) => iso === "2001-02-28"));
  assert.ok(rows.some(({ id }) => id.endsWith("X")));
  const sexes = new Set();
  for (const { birth, iso, years, otherAge, sex, id, idAgain } of rows) {
    assert.equal(birth, iso.split("-").reverse().join("/"));
    assert.equal(years, 2025 - Number(iso.slice(0, 4)) - Number(iso.slice(5) > "02-28"));
    assert.equal(years, 24);
    assert.equal(otherAge, years);
    assert.equal(idAgain, id);
    assert.match(id, /^110105\d{11}[\dX]$/);
    assert.equal(id.slice(6, 14), iso.replaceAll("-", ""));
    assert.equal(Number(id[16]) % 2, Number(sex === "男"));
    assertResidentIdChecksum(id);
    sexes.add(sex);
  }
  assert.deepEqual([...sexes].sort(), ["女", "男"]);
  const march = generateFakeRows(1000, fields, { ...options, referenceDate: "2025-03-01" });
  assert.ok(march.every(({ iso }) => iso > "2000-02-29"));
});

test("address fields share the selected city and a single district/postcode pair", () => {
  const fields = [
    field("省份", "province", { city: "hangzhou" }),
    field("城市", "city"),
    field("区县", "district"),
    field("邮编", "postalCode"),
    field("地址", "address"),
    field("证件", "idCard"),
  ];
  const rows = generateFakeRows(20, fields, { referenceDate });
  for (const row of rows) {
    assert.equal(row.省份, "浙江省");
    assert.equal(row.城市, "杭州市");
    assert.equal(row.邮编, row.区县 === "西湖区" ? "310013" : "310002");
    assert.equal(row.证件.slice(0, 6), row.区县 === "西湖区" ? "330106" : "330102");
    assert.ok(row.地址.startsWith(row.省份 + row.城市 + row.区县));
    assertResidentIdChecksum(row.证件);
  }
  assert.throws(
    () => generateFakeRows(1, [...fields, field("另一个城市", "city", { city: "chengdu" })]),
    { code: "cityConflict", field: "另一个城市", index: 6 },
  );
});

test("resident IDs follow the district when the city is generated automatically", () => {
  const expectedCodes = new Map([
    ["北京市朝阳区", "110105"], ["北京市海淀区", "110108"],
    ["上海市浦东新区", "310115"], ["上海市徐汇区", "310104"],
    ["广州市天河区", "440106"], ["广州市越秀区", "440104"],
    ["杭州市西湖区", "330106"], ["杭州市上城区", "330102"],
    ["成都市锦江区", "510104"], ["成都市武侯区", "510107"],
  ]);
  const fields = [field("id", "idCard"), field("city", "city"), field("district", "district")];
  const { size } = expectedCodes;
  const rows = generateFakeRows(100, fields, { seed: "residency", referenceDate });
  assert.equal(new Set(rows.map(({ city, district }) => city + district)).size, size);
  for (const { id, city, district } of rows) {
    assert.equal(id.slice(0, 6), expectedCodes.get(city + district));
    assertResidentIdChecksum(id);
  }
});

test("date-only formats and UTC datetime and timestamp ranges are honored", () => {
  const range = { start: "2024-02-29", end: "2024-02-29" };
  const dates = [
    ["YYYY-MM-DD", "2024-02-29"], ["YYYY/MM/DD", "2024/02/29"], ["DD/MM/YYYY", "29/02/2024"],
    ["MM/DD/YYYY", "02/29/2024"], ["YYYY年MM月DD日", "2024年02月29日"],
  ];
  for (const [format, expected] of dates) {
    const [row] = generateFakeRows(1, [field("date", "date", { ...range, format })]);
    assert.equal(row.date, expected);
  }
  const fields = [
    field("iso", "datetime", range), field("plain", "datetime", { ...range, format: "YYYY/MM/DD HH:mm:ss" }),
    field("seconds", "timestamp", range), field("ms", "timestamp", { ...range, unit: "milliseconds" }),
  ];
  const start = Date.UTC(2024, 1, 29);
  for (const row of generateFakeRows(50, fields)) {
    assert.match(row.iso, /^2024-02-29T\d{2}:\d{2}:\d{2}\.000Z$/);
    assert.match(row.plain, /^2024\/02\/29 \d{2}:\d{2}:\d{2}$/);
    assert.ok(Number.isInteger(row.seconds) && row.seconds * 1000 >= start && row.seconds * 1000 < start + 86400000);
    assert.ok(Number.isInteger(row.ms) && row.ms >= start && row.ms < start + 86400000);
  }
});

test("numeric ranges, choices, and templates preserve configured types and bounds", () => {
  const fields = [
    field("会员编号", "sequence", { start: 10001, step: 2 }),
    field("integer", "integer", { min: -2, max: -1 }),
    field("decimal", "number", { min: 0.29, max: 0.29, decimals: 2 }),
    field("amount", "amount", { min: -1.2, max: -1.2, decimals: 2 }),
    field("zeroPlaces", "amount", { min: 3, max: 3, decimals: 0 }),
    field("yes", "boolean", { truePercent: 100 }),
    field("no", "boolean", { truePercent: 0 }),
    field("status", "enum", { values: "待处理\r\n\n已完成" }),
    field("pattern", "pattern", { template: "VIP-??/##" }),
    field("str", "fixed", { valueType: "string", value: "007" }),
    field("num", "fixed", { valueType: "number", value: 7 }),
    field("bool", "fixed", { valueType: "boolean", value: false }),
    field("missing", "fixed", { valueType: "null", value: null }),
  ];
  generateFakeRows(16, fields).forEach((row, index) => {
    assert.equal(row.会员编号, 10001 + index * 2);
    assert.ok([-2, -1].includes(row.integer));
    assert.equal(row.decimal, 0.29);
    assert.equal(row.amount, "-1.20");
    assert.equal(row.zeroPlaces, "3");
    assert.equal(row.yes, true);
    assert.equal(row.no, false);
    assert.ok(["待处理", "已完成"].includes(row.status));
    assert.match(row.pattern, /^VIP-[A-Z]{2}\/\d{2}$/);
    assert.equal(row.str, "007");
    assert.equal(row.num, 7);
    assert.equal(row.bool, false);
    assert.equal(row.missing, null);
  });
});

test("configuration errors identify the affected field", () => {
  const invalid = [
    ["options", field("bad", "phone", { region: "XX" })],
    ["dateRange", field("bad", "date", { start: "2023-02-29" })],
    ["dateRange", field("bad", "date", { start: "2024-03-01", end: "2024-02-29" })],
    ["numberRange", field("bad", "number", { min: 0.001, max: 0.009, decimals: 2 })],
    ["numberRange", field("bad", "integer", { min: 1.1 })],
    ["sequence", field("bad", "sequence", { start: Number.MAX_SAFE_INTEGER })],
    ["sequence", field("bad", "sequence", { step: 0 })],
    ["enum", field("bad", "enum", { values: "\n " })],
    ["fixed", field("bad", "fixed", { valueType: "boolean", value: "true" })],
    ["pattern", field("bad", "pattern", { template: "" })],
  ];
  for (const [code, descriptor] of invalid) {
    assert.throws(() => generateFakeRows(2, [descriptor]), { code, field: "bad", index: 0 });
  }
  assert.throws(() => generateFakeRows(1, [field("", "name")]), { code: "name", index: 0 });
  assert.throws(() => generateFakeRows(1, "名称:cnName,名称:cnName"), { code: "duplicate", field: "名称", index: 1 });
  assert.throws(() => generateFakeRows(1, [field("年龄", "age"), field("婴儿", "age", { min: 0, max: 1 })]), {
    code: "ageConflict", field: "婴儿", index: 1,
  });
  assert.throws(() => generateFakeRows(1, [field("age", "age")], { referenceDate: "2025-02-29" }), { code: "referenceDate" });
});

test("exports respect field order and serialize form identifiers as strings", () => {
  const fields = [
    field("证件", "idCard"), field("电话", "phone"), field("邮编", "postalCode"),
    field("备注", "fixed", { value: '含逗号,\t"引号"\n第二行' }),
  ];
  const rows = generateFakeRows(2, fields, { referenceDate });
  const names = fields.map(({ name }) => name);
  for (const format of ["json", "ndjson"]) {
    const output = formatFakeRows(rows, format);
    const parsed = format === "json" ? JSON.parse(output) : output.split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(parsed, rows);
    assert.deepEqual(Object.keys(parsed[0]), names);
    assert.ok(names.slice(0, 3).every((name) => typeof parsed[0][name] === "string"));
  }
  for (const [format, separator] of [["csv", ","], ["tsv", "\t"]]) {
    const output = formatFakeRows(rows, format);
    assert.ok(output.startsWith(names.join(separator) + "\n"));
    assert.ok(output.includes('"含逗号,\t""引号""\n第二行"'));
  }
});

test("legacy field strings and string arrays retain their original values", () => {
  const fields = "id:integer,name,email,phone,date,datetime,amount,ipv4,sentence";
  const [row] = generateFakeRows(1, fields);
  assert.deepEqual(generateFakeRows(1, fields), generateFakeRows(1, fields.split(",")));
  assert.deepEqual(row, {
    id: 4746,
    name: "Alex Lee",
    email: "alex.lee.1@example.invalid",
    phone: "+1 202 555 1001",
    date: "2024-01-01",
    datetime: "2024-01-01T00:00:00.000Z",
    amount: "7892.47",
    ipv4: "192.0.2.1",
    sentence: "Synthetic sample 1",
  });
  assert.deepEqual(parseFakeFields("中文名:cnName,入职日期:date"), [
    { name: "中文名", type: "cnName" }, { name: "入职日期", type: "date" },
  ]);
  assert.match(generateFakeRows(1, "姓名:cnName")[0].姓名, /^\p{Script=Han}{3}$/u);
  assert.equal(generateFakeRows(1, "company")[0].company, "Example Company 1");
});
