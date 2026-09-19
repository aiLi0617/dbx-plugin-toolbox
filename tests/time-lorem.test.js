import assert from "node:assert/strict";
import test from "node:test";
import {
  addDateTime, formatDateTime, formatTimestamp, instantFromParts, parseDateTime,
  parseTimestamp, resolveTimeZone, timeDifference,
} from "../src/lib/time.js";
import { lorem, LOREM_MAX_LINES, LOREM_MAX_CUSTOM_LENGTH } from "../src/lib/lorem.js";

const hasCode = (code) => (error) => error.code === code;

test("timestamps preserve signed millisecond precision and reject overflow", () => {
  for (const ms of [-62135596800000, -1001, -1000, -1, 0, 1, 1001, 1789726849000, 253402300799999]) {
    assert.equal(parseTimestamp(formatTimestamp(ms, "s"), "s"), ms);
    assert.equal(parseTimestamp(formatTimestamp(ms, "ms"), "ms"), ms);
  }
  assert.equal(parseTimestamp("1000", "s"), 1_000_000);
  assert.equal(parseTimestamp("1000", "ms"), 1000);
  for (const text of ["", "1e3", "NaN", "12x", "1.0001"]) assert.throws(() => parseTimestamp(text), hasCode("timestamp"));
  assert.throws(() => parseTimestamp("1.5", "ms"), hasCode("timestamp"));
  assert.throws(() => parseTimestamp("253402300800000", "ms"), hasCode("range"));
  assert.throws(() => parseTimestamp("900719925474099999999", "ms"), hasCode("range"));
});

test("date parsing rejects invalid calendar fields instead of rolling forward", () => {
  for (const input of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01", "2026-04-31", "2026-09-19 24:00:00", "2026-09-19 12:60:00", "2026-09-19 12:00:60", "2026-09-19T12:00:00+24:00", "2026-09-19T12:00:00+08:60", "2026-09-19T12:00:00.0001Z", "2026-09-19Z"]) {
    assert.throws(() => parseDateTime(input, "UTC"), hasCode("date"), input);
  }
  assert.throws(() => parseDateTime("0000-01-01", "UTC"), hasCode("range"));
  assert.equal(formatDateTime(parseDateTime("0001-01-01", "UTC"), "UTC").date, "0001-01-01 00:00:00.000");
  assert.equal(formatDateTime(parseDateTime("0099-12-31", "UTC"), "UTC").date, "0099-12-31 00:00:00.000");
  assert.equal(formatDateTime(parseDateTime("2024-02-29", "UTC"), "UTC").date, "2024-02-29 00:00:00.000");
});

test("UTC, Beijing, local, and IANA zones resolve the same instant", () => {
  const instant = parseDateTime("2026-09-19 12:30:45.012", "Asia/Shanghai");
  assert.equal(instant, Date.parse("2026-09-19T04:30:45.012Z"));
  assert.equal(parseDateTime("20260919123045", "Asia/Shanghai"), instant - 12);
  assert.equal(parseDateTime("20260919123045012", "Asia/Shanghai"), instant);
  assert.equal(parseDateTime("202609191230", "Asia/Shanghai"), instant - 45_012);
  assert.equal(parseDateTime("2026年9月19日12时30分45秒", "Asia/Shanghai"), instant - 12);
  assert.equal(parseDateTime("2026年9月19日12时30分", "Asia/Shanghai"), instant - 45_012);
  assert.equal(parseDateTime("2026.9.19 12:30:45", "Asia/Shanghai"), instant - 12);
  assert.equal(parseDateTime("2026/09/19 12:30:45.012", "Asia/Shanghai"), instant);
  assert.equal(parseDateTime("2026-09-19T10:15:45.012+05:45", "UTC"), instant);
  assert.equal(parseDateTime("2026-09-19T04:30:45.012Z", "America/New_York"), instant);
  assert.equal(formatDateTime(instant, "Asia/Kathmandu").date, "2026-09-19 10:15:45.012");
  assert.equal(resolveTimeZone("local"), Intl.DateTimeFormat().resolvedOptions().timeZone);
  assert.throws(() => resolveTimeZone("Imaginary/City"), hasCode("timezone"));
  assert.throws(() => resolveTimeZone(""), hasCode("timezone"));
});

test("DST spring gaps fail and fall overlaps require an explicit choice", () => {
  assert.throws(() => parseDateTime("2026-03-08 02:30:00", "America/New_York"), hasCode("gap"));
  assert.throws(() => parseDateTime("2026-11-01 01:30:00", "America/New_York"), hasCode("overlap"));
  const early = parseDateTime("2026-11-01 01:30:00", "America/New_York", "earlier");
  const late = parseDateTime("2026-11-01 01:30:00", "America/New_York", "later");
  assert.equal(early, Date.parse("2026-11-01T05:30:00Z"));
  assert.equal(late - early, 3_600_000);
  assert.equal(formatDateTime(early, "America/New_York").offset, "-04:00");
  assert.equal(formatDateTime(late, "America/New_York").offset, "-05:00");
  assert.equal(parseDateTime("2026-11-01T01:30:00-05:00", "America/New_York"), late);
  assert.equal(addDateTime(late, 0, "day", "America/New_York"), late);
});

test("non-hour DST transitions and skipped dates are handled", () => {
  assert.throws(() => parseDateTime("2026-10-04 02:15:00", "Australia/Lord_Howe"), hasCode("gap"));
  const early = parseDateTime("2026-04-05 01:45:00", "Australia/Lord_Howe", "earlier");
  const late = parseDateTime("2026-04-05 01:45:00", "Australia/Lord_Howe", "later");
  assert.equal(late - early, 30 * 60_000);
  assert.throws(() => parseDateTime("2011-12-30 12:00:00", "Pacific/Apia"), hasCode("gap"));
});

test("calendar-day arithmetic differs from elapsed hours across DST", () => {
  const start = parseDateTime("2026-03-07 12:00:00", "America/New_York");
  const dayLater = addDateTime(start, 1, "day", "America/New_York");
  assert.equal(dayLater - start, 23 * 3_600_000);
  assert.equal(formatDateTime(dayLater, "America/New_York").date, "2026-03-08 12:00:00.000");
  assert.equal(formatDateTime(addDateTime(start, 24, "hour"), "America/New_York").date, "2026-03-08 13:00:00.000");
  const intoGap = parseDateTime("2026-03-07 02:30:00", "America/New_York");
  assert.throws(() => addDateTime(intoGap, 1, "day", "America/New_York"), hasCode("gap"));
});

test("date arithmetic handles month ends, leap years, subtracting and range bounds", () => {
  const january = parseDateTime("2026-01-31 15:30:00", "UTC");
  assert.equal(formatDateTime(addDateTime(january, 1, "month", "UTC"), "UTC").date, "2026-02-28 15:30:00.000");
  assert.equal(formatDateTime(addDateTime(january, -1, "month", "UTC"), "UTC").date, "2025-12-31 15:30:00.000");
  const leap = parseDateTime("2024-02-29 12:00:00", "UTC");
  assert.equal(formatDateTime(addDateTime(leap, 1, "year", "UTC"), "UTC").date, "2025-02-28 12:00:00.000");
  assert.throws(() => addDateTime(january, "", "day", "UTC"), hasCode("amount"));
  assert.throws(() => addDateTime(january, 1.5, "day", "UTC"), hasCode("amount"));
  assert.throws(() => addDateTime(january, 1, "unknown", "UTC"), hasCode("unit"));
  assert.throws(() => addDateTime(parseDateTime("9999-12-31", "UTC"), 1, "day", "UTC"), hasCode("range"));
  assert.throws(() => instantFromParts({ year: 2026, month: 4, day: 31 }, "UTC"), hasCode("date"));
});

test("time differences use elapsed milliseconds and preserve negative values", () => {
  const result = timeDifference(90_061_005, 0);
  assert.deepEqual(result, { milliseconds: -90_061_005, secondsTotal: -90_061.005, daysTotal: -90_061_005 / 86_400_000, negative: true, days: 1, hours: 1, minutes: 1, seconds: 1, ms: 5 });
});

test("Lorem retains translated DBX default copy and supports custom multiline blocks", () => {
  const original = lorem(1, "auto", "zh-CN");
  assert.match(original, /^DBX：/);
  assert.equal(lorem(2, "auto", "zh-CN"), original + "\n" + original);
  assert.equal(lorem(1, "auto", "zh-CN", "  \n "), original);
  assert.equal(lorem(2, "en", "zh-CN", " Hello\n世界 "), " Hello\n世界 \n Hello\n世界 ");
  assert.match(lorem(1, "en", "zh-CN"), /^DBX is/);
});

test("Lorem enforces repeat count, custom content and total output limits", () => {
  assert.equal(lorem(0, "en", "en", "x"), "x");
  assert.equal(lorem(2.9, "en", "en", "x"), "x\nx");
  assert.equal(lorem(Infinity, "en", "en", "x"), "x");
  assert.equal(lorem(10000, "en", "en", "x").split("\n").length, LOREM_MAX_LINES);
  assert.throws(() => lorem(1, "en", "en", "x".repeat(LOREM_MAX_CUSTOM_LENGTH + 1)), hasCode("custom-length"));
  assert.throws(() => lorem(1000, "en", "en", "x".repeat(1000)), hasCode("output-length"));
  assert.equal(lorem(1000, "en", "en", "x".repeat(999)).length, 999999);
});
