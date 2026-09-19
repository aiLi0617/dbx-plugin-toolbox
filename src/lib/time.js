const MIN_MS = -62135596800000;
const MAX_MS = 253402300799999;
const DAY_MS = 86_400_000;
const formatters = new Map();

export const TIME_ERROR_TEXT = {
  timezone: ["请输入有效的 IANA 时区，例如 Asia/Shanghai。", "Enter a valid IANA time zone, such as Asia/Shanghai."],
  date: ["日期无效。请使用 YYYY-MM-DD HH:mm:ss，可附毫秒或 ISO 8601 时区。", "Invalid date. Use YYYY-MM-DD HH:mm:ss, optionally with milliseconds or an ISO 8601 offset."],
  range: ["支持的日期范围为公元 0001 至 9999 年。", "Dates must be between years 0001 and 9999."],
  timestamp: ["请输入有效时间戳：秒最多 3 位小数，毫秒必须为整数。", "Enter a valid timestamp: seconds allow up to 3 decimal places; milliseconds must be integers."],
  gap: ["该当地时间因时区或夏令时调整而不存在，请选择其他时间。", "This local time does not exist because of a time-zone or daylight-saving transition."],
  overlap: ["该当地时间出现两次，请在“重复时间”中选择较早或较晚的一次。", "This local time occurs twice. Choose the earlier or later occurrence under Repeated time."],
  amount: ["加减数量必须为整数，且结果需在支持的日期范围内。", "The amount must be an integer and the result must stay within the supported date range."],
  unit: ["不支持的时间单位。", "Unsupported time unit."],
};

function fail(code) {
  const error = new Error(TIME_ERROR_TEXT[code]?.[1] || code);
  error.code = code;
  throw error;
}

export function resolveTimeZone(zone = "Asia/Shanghai") {
  const requested = zone === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : String(zone).trim();
  if (!requested) fail("timezone");
  try {
    return new Intl.DateTimeFormat("en", { timeZone: requested }).resolvedOptions().timeZone;
  } catch {
    fail("timezone");
  }
}

function formatter(zone) {
  if (!formatters.has(zone)) {
    formatters.set(zone, new Intl.DateTimeFormat("en-GB-u-ca-gregory-nu-latn", {
      timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", era: "short",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }));
  }
  return formatters.get(zone);
}

function utc(parts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour || 0, parts.minute || 0, parts.second || 0, parts.ms || 0);
  return date.getTime();
}

export function daysInMonth(year, month) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validateParts(parts) {
  if (!Number.isInteger(parts.year) || parts.year < 1 || parts.year > 9999) fail("range");
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12 ||
      !Number.isInteger(parts.day) || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month) ||
      !Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23 ||
      !Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59 ||
      !Number.isInteger(parts.second) || parts.second < 0 || parts.second > 59 ||
      !Number.isInteger(parts.ms) || parts.ms < 0 || parts.ms > 999) fail("date");
}

function validateInstant(ms) {
  if (!Number.isSafeInteger(ms) || ms < MIN_MS || ms > MAX_MS) fail("range");
  return ms;
}

function partsAt(ms, zone) {
  const fields = Object.fromEntries(formatter(zone).formatToParts(ms).map((part) => [part.type, part.value]));
  return {
    year: fields.era === "BC" ? 1 - Number(fields.year) : Number(fields.year),
    month: Number(fields.month), day: Number(fields.day), hour: Number(fields.hour),
    minute: Number(fields.minute), second: Number(fields.second), ms: ((ms % 1000) + 1000) % 1000,
  };
}

function offsetAt(ms, zone) { return utc(partsAt(ms, zone)) - ms; }

export function zonedParts(ms, timeZone = "Asia/Shanghai") {
  validateInstant(ms);
  const parts = partsAt(ms, resolveTimeZone(timeZone));
  validateParts(parts);
  return parts;
}

/** Resolve a local wall time without silently normalizing invalid dates or DST gaps. */
export function instantFromParts(parts, timeZone = "Asia/Shanghai", repeated = "reject") {
  const value = { hour: 0, minute: 0, second: 0, ms: 0, ...parts };
  validateParts(value);
  const zone = resolveTimeZone(timeZone);
  const wall = utc(value);
  const offsets = new Set();
  // Include both sides of transitions, including historical date-line changes.
  for (const hours of [-72, -48, -24, -6, 0, 6, 24, 48, 72]) offsets.add(offsetAt(wall + hours * 3_600_000, zone));
  const candidates = [...offsets].map((offset) => wall - offset).filter((candidate) => {
    const actual = partsAt(candidate, zone);
    return Object.keys(value).every((key) => actual[key] === value[key]);
  }).sort((a, b) => a - b);
  if (!candidates.length) fail("gap");
  if (candidates.length > 1 && repeated !== "earlier" && repeated !== "later") fail("overlap");
  return validateInstant(repeated === "later" ? candidates.at(-1) : candidates[0]);
}

export function parseDateTime(text, timeZone = "Asia/Shanghai", repeated = "reject") {
  const raw = String(text).trim();
  const normalized = raw.replace(/年|月/g, "-").replace(/日/g, " ")
    .replace(/[时点]/g, ":").replace(/分$/, "").replace(/分/g, ":").replace(/秒/g, "")
    .replace(/^(\d{4})\.(\d{1,2})\.(\d{1,2})/, "$1-$2-$3").replace(/\s+/g, " ").trim();
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(?:(\d{2})(\d{3})?)?)?$/);
  const match = compact || normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:[.,](\d{1,3}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i);
  if (!match) fail("date");
  const [, year, month, day, hour, minute, second, fraction, offset] = match;
  if (offset && !hour) fail("date");
  const parts = { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour || 0), minute: Number(minute || 0), second: Number(second || 0), ms: Number((fraction || "").padEnd(3, "0")) };
  validateParts(parts);
  if (!offset) return instantFromParts(parts, timeZone, repeated);
  let shift = 0;
  if (offset.toUpperCase() !== "Z") {
    const digits = offset.slice(1).replace(":", "");
    const offsetHours = Number(digits.slice(0, 2));
    const offsetMinutes = Number(digits.slice(2));
    if (offsetHours > 23 || offsetMinutes > 59) fail("date");
    shift = (offsetHours * 60 + offsetMinutes) * 60_000 * (offset[0] === "-" ? -1 : 1);
  }
  return validateInstant(utc(parts) - shift);
}

export function parseTimestamp(text, unit = "s") {
  const raw = String(text).trim();
  if (unit !== "s" && unit !== "ms") fail("unit");
  if (raw.length > 64) fail("range");
  if (!(unit === "s" ? /^[+-]?\d+(?:\.\d{1,3})?$/ : /^[+-]?\d+$/).test(raw)) fail("timestamp");
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^[+-]/, "").split(".");
  const exact = BigInt(whole) * (unit === "s" ? 1000n : 1n) + (unit === "s" ? BigInt(fraction.padEnd(3, "0")) : 0n);
  return validateInstant(Number(negative ? -exact : exact));
}

export function formatTimestamp(ms, unit = "s") {
  validateInstant(ms);
  if (unit === "ms") return String(ms);
  if (unit !== "s") fail("unit");
  const magnitude = Math.abs(ms);
  const fraction = magnitude % 1000;
  return `${ms < 0 ? "-" : ""}${Math.floor(magnitude / 1000)}${fraction ? `.${String(fraction).padStart(3, "0").replace(/0+$/, "")}` : ""}`;
}

export function formatDateTime(ms, timeZone = "Asia/Shanghai") {
  const zone = resolveTimeZone(timeZone);
  const parts = zonedParts(ms, zone);
  const pad = (value, length = 2) => String(value).padStart(length, "0");
  const date = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}.${pad(parts.ms, 3)}`;
  const seconds = offsetAt(ms, zone) / 1000;
  const magnitude = Math.abs(seconds);
  const offset = `${seconds < 0 ? "-" : "+"}${pad(Math.floor(magnitude / 3600))}:${pad(Math.floor(magnitude / 60) % 60)}${magnitude % 60 ? `:${pad(magnitude % 60)}` : ""}`;
  return { text: `${date} UTC${offset}`, date, offset, zone };
}

export function timeDifference(start, end) {
  validateInstant(start); validateInstant(end);
  const milliseconds = end - start;
  let rest = Math.abs(milliseconds);
  const days = Math.floor(rest / DAY_MS); rest %= DAY_MS;
  const hours = Math.floor(rest / 3_600_000); rest %= 3_600_000;
  const minutes = Math.floor(rest / 60_000); rest %= 60_000;
  const seconds = Math.floor(rest / 1000);
  return { milliseconds, secondsTotal: milliseconds / 1000, daysTotal: milliseconds / DAY_MS, negative: milliseconds < 0, days, hours, minutes, seconds, ms: rest % 1000 };
}

export function addDateTime(ms, amount, unit = "day", timeZone = "Asia/Shanghai", repeated = "reject") {
  validateInstant(ms);
  if (String(amount).trim() === "" || !Number.isSafeInteger(Number(amount))) fail("amount");
  const count = Number(amount);
  const fixed = { millisecond: 1, second: 1000, minute: 60_000, hour: 3_600_000 };
  if (Object.hasOwn(fixed, unit)) return validateInstant(ms + count * fixed[unit]);
  const parts = zonedParts(ms, timeZone);
  if (!["month", "year", "day", "week"].includes(unit)) fail("unit");
  if (count === 0) return ms;
  if (unit === "month" || unit === "year") {
    const months = parts.year * 12 + parts.month - 1 + count * (unit === "year" ? 12 : 1);
    parts.year = Math.floor(months / 12);
    parts.month = ((months % 12) + 12) % 12 + 1;
    parts.day = Math.min(parts.day, daysInMonth(parts.year, parts.month));
  } else if (unit === "day" || unit === "week") {
    const date = new Date(utc(parts) + count * (unit === "week" ? 7 : 1) * DAY_MS);
    if (!Number.isFinite(date.getTime())) fail("range");
    parts.year = date.getUTCFullYear(); parts.month = date.getUTCMonth() + 1; parts.day = date.getUTCDate();
  } else fail("unit");
  return instantFromParts(parts, timeZone, repeated);
}
