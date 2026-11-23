import { getExampleNumber, parsePhoneNumberFromString } from "libphonenumber-js/max";
import mobileExamples from "libphonenumber-js/mobile/examples";
import { daysInMonth } from "./time.js";

const FIRST_NAMES = ["Alex", "Morgan", "Taylor", "Jordan", "Casey", "Riley", "Avery", "Jamie"];
const LAST_NAMES = ["Chen", "Smith", "Garcia", "Kim", "Patel", "Brown", "Martin", "Lee"];
const CN_SURNAMES = ["王", "李", "张", "刘", "陈", "杨", "赵", "黄", "林", "周", "徐", "何"];
const CN_GIVEN_NAMES = ["子涵", "佳宁", "晨曦", "雨桐", "明轩", "思远", "清和", "嘉言", "书瑶", "一诺", "星宇", "安然"];
const COMPANY_STEMS = ["澄屿", "禾序", "栖川", "云芽", "山岚", "白榆", "青原", "松隅"];
const COMPANY_SECTORS = ["科技", "软件", "设计", "商贸", "咨询"];
const DEPARTMENTS = {
  "zh-CN": ["市场部", "产品部", "研发部", "运营部", "客户服务部", "财务部"],
  en: ["Marketing", "Product", "Research and Development", "Operations", "Customer Service", "Finance"],
};
const JOB_TITLES = {
  "zh-CN": ["项目经理", "软件工程师", "产品设计师", "业务分析师", "运营专员", "客户顾问"],
  en: ["Project Manager", "Software Engineer", "Product Designer", "Business Analyst", "Operations Specialist", "Customer Advisor"],
};
const SENTENCES = [
  "The team reviewed the sample records before the next release.",
  "This entry describes a routine update to the test workspace.",
  "The report summarizes changes from the latest review.",
  "A new request was added to the queue for follow-up.",
  "The draft was shared for feedback during the weekly meeting.",
  "The results were recorded for the next round of testing.",
];
const CN_SENTENCES = [
  "团队在发布前检查了样例记录。",
  "项目成员把本周的变更整理到了工作区。",
  "报告汇总了本次评审的主要结论。",
  "这条请求已加入队列，等待后续处理。",
  "会议结束后，草稿交由团队继续讨论。",
  "工作人员记录了本轮测试的结果。",
];
const DATA_LANGUAGES = ["zh-CN", "en"];

const DEFAULT_ID_ADDRESS_CODE = "110105";

// Keep each district's administrative and postal codes together. Street names are sample data.
export const FAKE_ADDRESS_CITIES = Object.freeze({
  beijing: { name: "北京", province: "北京市", city: "北京市", districts: [
    { district: "朝阳区", code: DEFAULT_ID_ADDRESS_CODE, postalCode: "100020", street: "示例路" },
    { district: "海淀区", code: "110108", postalCode: "100080", street: "样本街" },
  ] },
  shanghai: { name: "上海", province: "上海市", city: "上海市", districts: [
    { district: "浦东新区", code: "310115", postalCode: "200120", street: "示例大道" },
    { district: "徐汇区", code: "310104", postalCode: "200030", street: "样本路" },
  ] },
  guangzhou: { name: "广州", province: "广东省", city: "广州市", districts: [
    { district: "天河区", code: "440106", postalCode: "510630", street: "示例路" },
    { district: "越秀区", code: "440104", postalCode: "510030", street: "样本街" },
  ] },
  hangzhou: { name: "杭州", province: "浙江省", city: "杭州市", districts: [
    { district: "西湖区", code: "330106", postalCode: "310013", street: "示例路" },
    { district: "上城区", code: "330102", postalCode: "310002", street: "样本街" },
  ] },
  chengdu: { name: "成都", province: "四川省", city: "成都市", districts: [
    { district: "锦江区", code: "510104", postalCode: "610021", street: "示例路" },
    { district: "武侯区", code: "510107", postalCode: "610041", street: "样本街" },
  ] },
});
export const FAKE_ADDRESS_TYPES = Object.freeze(["province", "city", "district", "postalCode", "address"]);
const PERSON_TYPES = ["age", "birthDate", "gender", "idCard"];
const LEGACY_TYPES = new Set([
  "name", "firstName", "lastName", "username", "email", "phone", "company", "date", "datetime",
  "uuid", "boolean", "integer", "number", "amount", "url", "ipv4", "sentence",
]);
const FIELD_TYPES = new Set([
  ...LEGACY_TYPES, ...FAKE_ADDRESS_TYPES, ...PERSON_TYPES,
  "cnName", "department", "jobTitle", "timestamp", "sequence", "enum", "paragraph", "domain",
  "ipv6", "fixed", "pattern",
]);

// Preserve the seeded output for the original regions and the US example's 555-01xx prefix.
const ORIGINAL_MOBILE_EXAMPLES = {
  CN: ["+8613123456789", 4], US: ["+12015550123", 2], CA: ["+15062345678", 4],
  GB: ["+447400123456", 4], JP: ["+819012345678", 4], DE: ["+4915123456789", 4],
  FR: ["+33612345678", 4], AU: ["+61412345678", 4],
};
function validMobile(value, region) {
  const phone = parsePhoneNumberFromString(value);
  return phone?.country === region && phone.isValid() && ["MOBILE", "FIXED_LINE_OR_MOBILE"].includes(phone.getType())
    ? phone : null;
}

const MOBILE_EXAMPLES = new Map(Object.entries(ORIGINAL_MOBILE_EXAMPLES));
for (const region of Object.keys(mobileExamples)) {
  if (MOBILE_EXAMPLES.has(region)) continue;
  const example = getExampleNumber(region, mobileExamples);
  // Some territories share another region's example. Require an unambiguous match.
  if (!example || !validMobile(example.number, region)) continue;
  const digits = Math.min(4, Math.max(1, example.nationalNumber.length - 3));
  MOBILE_EXAMPLES.set(region, [example.number, digits]);
}
export const FAKE_PHONE_REGIONS = Object.freeze([...MOBILE_EXAMPLES.keys()]);
export const FAKE_CUSTOM_DATE_FORMAT = "custom";
export const FAKE_DATE_PATTERN_LIMIT = 128;
export const FAKE_DATE_FORMATS = Object.freeze([
  "YYYY-MM-DD", "YYYY/MM/DD", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY年MM月DD日",
]);
export const FAKE_DATETIME_FORMATS = Object.freeze(["ISO 8601 (UTC)", "YYYY-MM-DD HH:mm:ss", "YYYY/MM/DD HH:mm:ss"]);

const DAY_MS = 86_400_000;
const DEFAULT_DATE_START = "2024-01-01";
const DEFAULT_DATE_END = "2024-12-31";
const DEFAULT_FIELDS = ["name", "email", "company", "date", "uuid"];

export const FAKE_FIELD_DEFAULTS = Object.freeze({
  ...Object.fromEntries(FAKE_ADDRESS_TYPES.map((type) => [type, Object.freeze({ city: "" })])),
  name: Object.freeze({ language: "en" }),
  firstName: Object.freeze({ language: "en" }),
  lastName: Object.freeze({ language: "en" }),
  company: Object.freeze({ language: "en" }),
  department: Object.freeze({ language: "zh-CN" }),
  jobTitle: Object.freeze({ language: "zh-CN" }),
  phone: Object.freeze({ region: "CN", format: "national" }),
  age: Object.freeze({ min: 18, max: 65 }),
  birthDate: Object.freeze({ format: FAKE_DATE_FORMATS[0] }),
  date: Object.freeze({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END, format: FAKE_DATE_FORMATS[0] }),
  datetime: Object.freeze({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END, format: FAKE_DATETIME_FORMATS[0] }),
  timestamp: Object.freeze({ start: DEFAULT_DATE_START, end: DEFAULT_DATE_END, unit: "seconds" }),
  integer: Object.freeze({ min: 0, max: 9999 }),
  number: Object.freeze({ min: 0, max: 1000, decimals: 2 }),
  amount: Object.freeze({ min: 0, max: 10000, decimals: 2 }),
  sequence: Object.freeze({ start: 1, step: 1 }),
  boolean: Object.freeze({ truePercent: 50 }),
  enum: Object.freeze({ values: "待处理\n处理中\n已完成" }),
  sentence: Object.freeze({ count: 1, language: "en" }),
  paragraph: Object.freeze({ count: 1, language: "en" }),
  fixed: Object.freeze({ valueType: "string", value: "" }),
  pattern: Object.freeze({ template: "VIP-######" }),
});

const ERROR_MESSAGES = {
  rowCount: "Row count must be an integer between 1 and 1000",
  fieldCount: "Choose between 1 and 50 fields",
  name: "Invalid field name",
  duplicate: "Duplicate field name",
  type: "Unsupported fake data type",
  options: "Invalid field options",
  ageRange: "Age must be an integer range between 0 and 120",
  ageConflict: "Age ranges do not overlap",
  cityConflict: "Address cities conflict",
  referenceDate: "Enter a valid age reference date",
  dateRange: "Enter a valid date range",
  dateFormat: "Enter a supported custom date format",
  numberRange: "Enter a valid numeric range",
  sequence: "Enter a safe integer sequence with a nonzero step",
  enum: "Enter at least one nonempty choice",
  fixed: "Enter a value matching the fixed value type",
  pattern: "Enter a template of 1 to 256 characters",
  phone: "Could not generate a mobile number for this region",
};

export class FakeDataError extends Error {
  constructor(code, { field = "", index = -1, detail = "" } = {}) {
    const label = ERROR_MESSAGES[code];
    super([label, field, detail].filter(Boolean).join(": "));
    this.name = "FakeDataError";
    this.code = code;
    this.field = field;
    this.index = index;
  }
}

function inferFakeType(name) {
  const key = name.toLowerCase();
  if (key === "id" || key.endsWith("_id")) return "integer";
  if (key.includes("email")) return "email";
  if (key.includes("phone") || key.includes("mobile")) return "phone";
  if (key.includes("company") || key.includes("organization")) return "company";
  if (key.includes("uuid")) return "uuid";
  if (key.includes("datetime") || key.includes("created") || key.includes("updated")) return "datetime";
  if (key.includes("date")) return "date";
  if (/price|amount|total/.test(key)) return "amount";
  if (key.includes("url") || key.includes("website")) return "url";
  if (key.includes("active") || key.startsWith("is_") || key.startsWith("has_")) return "boolean";
  if (key.includes("name")) return key.includes("first") ? "firstName" : key.includes("last") ? "lastName" : "name";
  return "sentence";
}

function parseFields(fields) {
  const list = Array.isArray(fields) ? fields : String(fields || "").split(",");
  if (!list.length || list.length > 50) throw new FakeDataError("fieldCount");
  const seen = new Set();
  return list.map((input, index) => {
    const structured = input !== null && typeof input === "object";
    const raw = structured ? "" : String(input).trim();
    const separator = raw.indexOf(":");
    const name = structured ? String(input.name ?? "").trim() : raw.slice(0, separator < 0 ? undefined : separator).trim();
    const requested = structured ? input.type : separator < 0 ? name : raw.slice(separator + 1).trim();
    const field = { field: name, index };
    if (!/^[\p{L}_][\p{L}\p{M}\p{N}_.-]{0,63}$/u.test(name)) throw new FakeDataError("name", field);
    if (seen.has(name)) throw new FakeDataError("duplicate", field);
    seen.add(name);
    if ((structured || separator >= 0) && !FIELD_TYPES.has(requested)) {
      throw new FakeDataError("type", { ...field, detail: String(requested ?? "") });
    }
    const type = FIELD_TYPES.has(requested) ? requested : inferFakeType(name);
    if (structured && input.options != null && (typeof input.options !== "object" || Array.isArray(input.options))) {
      throw new FakeDataError("options", field);
    }
    return { name, type, index, options: structured ? input.options : undefined, legacy: !structured && LEGACY_TYPES.has(type) };
  });
}

export function parseFakeFields(fields) {
  return parseFields(fields).map(({ name, type }) => ({ name, type }));
}

export function localFakeDate(date = new Date()) {
  return [String(date.getFullYear()).padStart(4, "0"), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

const pad2 = (value) => String(value).padStart(2, "0");
const isoDate = (date) => date.toISOString().slice(0, 10);
const sample = (values, random) => values[Math.floor(random() * values.length)];
const randomInt = (min, max, random) => min + Math.floor(random() * (max - min + 1));

function readDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return NaN;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && isoDate(date) === value ? date.getTime() : NaN;
}

const DATE_PARTS = {
  YYYY: (date) => String(date.getUTCFullYear()).padStart(4, "0"),
  YY: (date) => pad2(date.getUTCFullYear() % 100),
  MM: (date) => pad2(date.getUTCMonth() + 1),
  M: (date) => date.getUTCMonth() + 1,
  DD: (date) => pad2(date.getUTCDate()),
  D: (date) => date.getUTCDate(),
};
const TIME_PARTS = {
  HH: (date) => pad2(date.getUTCHours()),
  H: (date) => date.getUTCHours(),
  mm: (date) => pad2(date.getUTCMinutes()),
  m: (date) => date.getUTCMinutes(),
  ss: (date) => pad2(date.getUTCSeconds()),
  s: (date) => date.getUTCSeconds(),
};
const DATE_ALIASES = { yyyy: "YYYY", yy: "YY", dd: "DD", d: "D" };
const DATE_FORMAT_TOKEN = /\[[^\[\]]*\]|YYYY|yyyy|YY|yy|MM|DD|dd|HH|mm|ss|[MDdHmsTZ]|[^A-Za-z\[\]]+/gy;

function compileDateFormat(options, type, fail) {
  const isDatetime = type === "datetime";
  const supportsTime = type !== "birthDate";
  const presets = isDatetime ? FAKE_DATETIME_FORMATS : FAKE_DATE_FORMATS;
  const custom = options.format === FAKE_CUSTOM_DATE_FORMAT;
  if (!custom && !presets.includes(options.format)) fail("dateFormat");
  if (!custom && isDatetime && options.format === presets[0]) {
    return { format: (date) => date.toISOString(), includesTime: true };
  }
  const pattern = custom ? options.customFormat : options.format;
  if (typeof pattern !== "string" || !pattern.trim() || pattern.length > FAKE_DATE_PATTERN_LIMIT) fail("dateFormat");

  const parts = [];
  let parsedLength = 0;
  let hasToken = false;
  let includesTime = false;
  for (const [token] of pattern.matchAll(DATE_FORMAT_TOKEN)) {
    const key = DATE_ALIASES[token] ?? token;
    const timeField = supportsTime ? TIME_PARTS[key] : undefined;
    const field = DATE_PARTS[key] ?? timeField;
    if (field) {
      parts.push(field);
      hasToken = true;
      includesTime ||= Boolean(timeField);
    } else if (token.startsWith("[")) {
      parts.push(token.slice(1, -1));
    } else {
      if (/^[A-Za-z]/.test(token) && !(supportsTime && (token === "T" || token === "Z"))) fail("dateFormat");
      parts.push(token);
    }
    parsedLength += token.length;
  }
  if (!hasToken || parsedLength !== pattern.length) fail("dateFormat");
  const format = (date) => parts.map((part) => typeof part === "function" ? part(date) : part).join("");
  return { format, includesTime };
}

function ageAt(birthday, reference) {
  const beforeBirthday = reference.getUTCMonth() * 32 + reference.getUTCDate() <
    birthday.getUTCMonth() * 32 + birthday.getUTCDate();
  return reference.getUTCFullYear() - birthday.getUTCFullYear() - Number(beforeBirthday);
}

function ageCutoff(reference, age) {
  const year = reference.getUTCFullYear() - age;
  const month = reference.getUTCMonth();
  return Date.UTC(year, month, Math.min(reference.getUTCDate(), daysInMonth(year, month + 1))) / DAY_MS;
}

function citizenId(addressCode, birthday, sequence) {
  const body = `${addressCode}${isoDate(birthday).replaceAll("-", "")}${String(sequence).padStart(3, "0")}`;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(body[index]), 0);
  return body + "10X98765432"[sum % 11];
}

function mobileNumber(region, format, random) {
  const [example, digits] = MOBILE_EXAMPLES.get(region);
  const prefix = example.slice(0, -digits);
  let phone;
  for (let attempt = 0; attempt < 16 && !phone; attempt += 1) {
    const suffix = randomInt(0, 10 ** digits - 1, random);
    phone = validMobile(prefix + String(suffix).padStart(digits, "0"), region);
  }
  phone ??= validMobile(example, region);
  if (!phone) return null;
  return format === "international" ? phone.number : phone.formatNational().replace(/\D/g, "");
}

function numberBound(value, scale, round) {
  const scaled = value * scale;
  const nearest = Math.round(scaled);
  return nearest / scale === value ? nearest : round(scaled);
}

function compileField(field, config) {
  const { type, legacy, name, index } = field;
  if (legacy) return (row) => legacyValue(type, row);
  const options = { ...FAKE_FIELD_DEFAULTS[type], ...field.options };
  const fail = (code = "options") => { throw new FakeDataError(code, { field: name, index }); };
  const checkChoice = (value, allowed) => { if (!allowed.includes(value)) fail(); };
  const checkInt = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const { language } = options;
  if (Object.hasOwn(FAKE_FIELD_DEFAULTS[type] ?? {}, "language")) checkChoice(language, DATA_LANGUAGES);

  if (FAKE_ADDRESS_TYPES.includes(type)) {
    const { city = "" } = options;
    if (city !== "") {
      if (!Object.hasOwn(FAKE_ADDRESS_CITIES, city)) fail();
      if (config.city && config.city !== city) fail("cityConflict");
      config.city = city;
    }
    config.address = true;
    return (row) => row.address[type];
  }
  if (PERSON_TYPES.includes(type)) config.person = true;

  switch (type) {
    case "cnName":
      return ({ random }) => sample(CN_SURNAMES, random) + sample(CN_GIVEN_NAMES, random);
    case "name":
    case "firstName":
    case "lastName":
      if (language === "en") return (row) => legacyValue(type, row);
      return (row) => {
        row.chineseName ??= {
          surname: sample(CN_SURNAMES, row.random),
          givenName: sample(CN_GIVEN_NAMES, row.random),
        };
        const { surname, givenName } = row.chineseName;
        if (type === "lastName") return surname;
        if (type === "firstName") return givenName;
        return surname + givenName;
      };
    case "age": {
      const { min, max } = options;
      if (!checkInt(min, 0, 120) || !checkInt(max, min, 120)) fail("ageRange");
      config.minAge = Math.max(min, config.minAge ?? 0);
      config.maxAge = Math.min(max, config.maxAge ?? 120);
      if (config.minAge > config.maxAge) fail("ageConflict");
      return (row) => row.person.age;
    }
    case "gender":
      return (row) => row.person.male ? "男" : "女";
    case "idCard":
      config.idCard = true;
      return (row) => row.person.idCard;
    case "birthDate": {
      const { format } = compileDateFormat(options, type, fail);
      return (row) => format(row.person.birthday);
    }
    case "phone":
      checkChoice(options.region, FAKE_PHONE_REGIONS);
      checkChoice(options.format, ["national", "international"]);
      return ({ random }) => mobileNumber(options.region, options.format, random) ?? fail("phone");
    case "company":
      if (language === "en") return (row) => legacyValue(type, row);
      return ({ random }) => sample(COMPANY_STEMS, random) + sample(COMPANY_SECTORS, random) + "有限公司";
    case "department":
      return ({ random }) => sample(DEPARTMENTS[language], random);
    case "jobTitle":
      return ({ random }) => sample(JOB_TITLES[language], random);
    case "date":
    case "datetime":
    case "timestamp": {
      const min = readDate(options.start);
      const max = readDate(options.end);
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) fail("dateRange");
      if (type === "timestamp") {
        checkChoice(options.unit, ["seconds", "milliseconds"]);
        const scale = options.unit === "seconds" ? 1000 : 1;
        return ({ random }) => randomInt(min / scale, (max + DAY_MS) / scale - 1, random);
      }
      const { format, includesTime } = compileDateFormat(options, type, fail);
      if (type === "date" && !includesTime) {
        return ({ random }) => format(new Date(randomInt(min / DAY_MS, max / DAY_MS, random) * DAY_MS));
      }
      return ({ random }) => format(new Date(randomInt(min / 1000, (max + DAY_MS) / 1000 - 1, random) * 1000));
    }
    case "integer":
    case "number":
    case "amount": {
      const { min, max } = options;
      const decimals = type === "integer" ? 0 : options.decimals;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min > max || !checkInt(decimals, 0, 8)) fail("numberRange");
      if (type === "integer" && (!Number.isSafeInteger(min) || !Number.isSafeInteger(max))) fail("numberRange");
      const scale = type === "integer" ? 1 : 10 ** decimals;
      const lower = numberBound(min, scale, Math.ceil);
      const upper = numberBound(max, scale, Math.floor);
      if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || lower > upper ||
          !Number.isSafeInteger(upper - lower + 1)) fail("numberRange");
      return ({ random }) => {
        const whole = randomInt(lower, upper, random);
        if (type !== "amount") return whole / scale;
        if (!decimals) return String(whole);
        const digits = String(Math.abs(whole)).padStart(decimals + 1, "0");
        return `${whole < 0 ? "-" : ""}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
      };
    }
    case "sequence": {
      const { start, step } = options;
      const offset = step * (config.count - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(step) || step === 0 ||
          !Number.isSafeInteger(offset) || !Number.isSafeInteger(start + offset)) fail("sequence");
      return (row) => start + step * row.index;
    }
    case "boolean":
      if (!Number.isFinite(options.truePercent) || options.truePercent < 0 || options.truePercent > 100) fail();
      return ({ random }) => random() * 100 < options.truePercent;
    case "enum": {
      const values = typeof options.values === "string" ? options.values.split(/\r?\n/) : options.values;
      if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) fail("enum");
      const choices = values.map((value) => value.trim()).filter(Boolean);
      if (!choices.length) fail("enum");
      return ({ random }) => sample(choices, random);
    }
    case "sentence":
    case "paragraph": {
      if (!checkInt(options.count, 1, 10)) fail();
      const sentences = language === "zh-CN" ? CN_SENTENCES : SENTENCES;
      const separator = language === "zh-CN" ? "" : " ";
      return ({ random }) => Array.from({ length: options.count }, () => Array.from(
        { length: type === "paragraph" ? 3 : 1 }, () => sample(sentences, random),
      ).join(separator)).join(type === "paragraph" ? "\n\n" : separator);
    }
    case "domain":
      return ({ index: row }) => `sample-${row + 1}.example.invalid`;
    case "ipv6":
      return ({ random }) => `2001:db8::${randomInt(1, 0xffff, random).toString(16)}:${randomInt(0, 0xffff, random).toString(16)}`;
    case "fixed": {
      const value = Object.hasOwn(field.options ?? {}, "value") ? field.options.value : options.value;
      const expected = field.options?.valueType ?? (value === null ? "null" : typeof value);
      if (!["string", "number", "boolean", "null"].includes(expected) ||
          (expected === "null" ? value !== null : typeof value !== expected) ||
          (expected === "number" && !Number.isFinite(value))) fail("fixed");
      return () => value;
    }
    case "pattern":
      if (typeof options.template !== "string" || !options.template.length || options.template.length > 256) fail("pattern");
      return ({ random }) => options.template.replace(/[#?]/g, (token) => token === "#"
        ? String(randomInt(0, 9, random)) : String.fromCharCode(randomInt(65, 90, random)));
    default:
      return (row) => legacyValue(type, row);
  }
}

function prepareFakeRows(count, fields, options) {
  const total = Number(count);
  if (!Number.isInteger(total) || total < 1 || total > 1000) throw new FakeDataError("rowCount");
  const config = { count: total };
  const descriptors = parseFields(fields);
  const columns = descriptors.map((field) => [field.name, compileField(field, config)]);
  let reference;
  let firstBirthday;
  let lastBirthday;
  if (config.person) {
    reference = new Date(readDate(options.referenceDate ?? localFakeDate()));
    if (!(reference.getUTCFullYear() >= 1900)) throw new FakeDataError("referenceDate");
    firstBirthday = ageCutoff(reference, (config.maxAge ?? 65) + 1) + 1;
    lastBirthday = ageCutoff(reference, config.minAge ?? 18);
  }
  return { total, config, columns, reference, firstBirthday, lastBirthday };
}

export function validateFakeRowsConfig(count, fields, options = {}) {
  prepareFakeRows(count, fields, options);
}

export function generateFakeRows(count = 10, fields = DEFAULT_FIELDS, options = {}) {
  const { total, config, columns, reference, firstBirthday, lastBirthday } = prepareFakeRows(count, fields, options);
  const cities = config.city ? [FAKE_ADDRESS_CITIES[config.city]] : Object.values(FAKE_ADDRESS_CITIES);
  const random = seededRandom(options.seed ?? "dbx-toolbox");
  return Array.from({ length: total }, (_, index) => {
    const row = { index, random, first: sample(FIRST_NAMES, random), last: sample(LAST_NAMES, random) };
    let idSequence;
    let idAddressCode = DEFAULT_ID_ADDRESS_CODE;
    if (config.person) {
      const birthday = new Date(randomInt(firstBirthday, lastBirthday, random) * DAY_MS);
      const male = random() < 0.5;
      row.person = { birthday, male, age: ageAt(birthday, reference) };
      // Draw the sequence before the address to preserve the existing seeded rows.
      if (config.idCard) idSequence = randomInt(1, 499, random) * 2 - Number(male);
    }
    if (config.address) {
      const { province, city, districts } = sample(cities, random);
      const { district, code, postalCode, street } = sample(districts, random);
      idAddressCode = code;
      const address = `${province === city ? city : province + city}${district}${street}${index + 1}号`;
      row.address = { province, city, district, postalCode, address };
    }
    if (config.idCard) row.person.idCard = citizenId(idAddressCode, row.person.birthday, idSequence);
    return Object.fromEntries(columns.map(([name, value]) => [name, value(row)]));
  });
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) {
    state ^= char.codePointAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function legacyValue(type, { first, last, index, random }) {
  const number = index + 1;
  switch (type) {
    case "name": return `${first} ${last}`;
    case "firstName": return first;
    case "lastName": return last;
    case "username": return `${first}.${last}${number}`.toLowerCase();
    case "email": return `${first}.${last}.${number}@example.invalid`.toLowerCase();
    case "phone": return `+1 202 555 ${String(1000 + number % 9000).padStart(4, "0")}`;
    case "company": return `Example Company ${number}`;
    case "date": return isoDate(new Date(Date.UTC(2024, 0, 1 + index)));
    case "datetime": return new Date(Date.UTC(2024, 0, 1 + index)).toISOString();
    case "boolean": return random() >= 0.5;
    case "integer": return Math.floor(random() * 10_000);
    case "number": return Math.round(random() * 100_000) / 100;
    case "amount": return (Math.round(random() * 1_000_000) / 100).toFixed(2);
    case "url": return `https://example.invalid/items/${number}`;
    case "ipv4": return `192.0.2.${1 + index % 253}`;
    case "uuid": return fakeUuid(random);
    default: return `Synthetic sample ${number}`;
  }
}

function fakeUuid(random) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = bytes[6] & 0x0f | 0x40;
  bytes[8] = bytes[8] & 0x3f | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function rowsToDelimited(rows, delimiter = ",") {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const quote = (value) => {
    const text = String(value ?? "");
    return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [keys.map(quote).join(delimiter), ...rows.map((row) => keys.map((key) => quote(row[key])).join(delimiter))].join("\n");
}

export function formatFakeRows(rows, format) {
  switch (format) {
    case "csv": return rowsToDelimited(rows);
    case "tsv": return rowsToDelimited(rows, "\t");
    case "ndjson": return rows.map((row) => JSON.stringify(row)).join("\n");
    default: return JSON.stringify(rows, null, 2);
  }
}
