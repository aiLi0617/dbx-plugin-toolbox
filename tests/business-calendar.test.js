import test from "node:test";
import assert from "node:assert/strict";
import { businessDays } from "../src/lib/calculators.js";
import { businessDayPolicy, businessDayBreakdown, CN_CALENDAR_YEARS } from "../src/lib/businessCalendar.js";
import data from "../src/lib/data/cn-holidays.json" with { type: "json" };

const timestamp = (date) => Date.parse(`${date}T00:00:00Z`);
const cn = { calendar: "cn" };

test("bundled calendars have complete provenance and unique real dates", () => {
  assert.deepEqual(CN_CALENDAR_YEARS, [2024, 2025, 2026]);
  assert.match(data.revision, /^[a-f0-9]{40}$/);
  for (const entry of data.years) {
    assert.ok(entry.papers.length);
    assert.ok(entry.days.some((day) => day.isOffDay));
    assert.ok(entry.days.some((day) => !day.isOffDay));
    const dates = new Set();
    for (const row of entry.days) {
      assert.equal(Number(row.date.slice(0, 4)), entry.year);
      assert.equal(new Date(timestamp(row.date)).toISOString().slice(0, 10), row.date);
      assert.equal(typeof row.isOffDay, "boolean");
      assert.equal(dates.has(row.date), false);
      dates.add(row.date);
    }
  }
});

test("China calendar skips New Year holidays and includes Sunday make-up work", () => {
  assert.equal(businessDays("2025-12-31", { ...cn, add: 1 }).end, "2026-01-04");
  assert.equal(businessDays("2026-01-04", { ...cn, add: -1 }).end, "2025-12-31");
  assert.equal(businessDays("2025-12-31", { ...cn, end: "2026-01-05" }).workingDays, 2);
  assert.equal(businessDays("2026-01-05", { ...cn, end: "2025-12-31" }).workingDays, -2);
  assert.deepEqual(businessDayBreakdown("2025-12-31", "2026-01-05", cn), {
    total: 5, weekendCount: 1, holidayCount: 2, makeupCount: 1,
  });
});

test("Spring Festival and National Day use their published make-up dates", () => {
  assert.equal(businessDays("2026-02-13", { ...cn, add: 1 }).end, "2026-02-14");
  assert.equal(businessDays("2026-02-14", { ...cn, add: 1 }).end, "2026-02-24");
  assert.equal(businessDays("2026-09-30", { ...cn, add: 1 }).end, "2026-10-08");
  assert.equal(businessDays("2026-10-09", { ...cn, add: 1 }).end, "2026-10-10");
});

test("custom days off override official make-up days and do not double count", () => {
  const options = { ...cn, holidays: ["2026-01-04", "2026-01-04", "2026-01-03"] };
  assert.equal(businessDays("2025-12-31", { ...options, add: 1 }).end, "2026-01-05");
  const counts = businessDayBreakdown("2025-12-31", "2026-01-05", options);
  assert.deepEqual(counts, { total: 5, holidayCount: 4, weekendCount: 0, makeupCount: 0 });
  assert.equal(counts.total - counts.holidayCount - counts.weekendCount, 1);
});

test("unavailable years fail in both modes, including reverse, zero, and cross-year", () => {
  const missing = (year) => (error) => error.code === "CALENDAR_YEAR_UNAVAILABLE" && error.year === year;
  assert.throws(() => businessDays("2026-12-31", { ...cn, add: 1 }), missing(2027));
  assert.throws(() => businessDays("2024-01-01", { ...cn, add: -1 }), missing(2023));
  assert.throws(() => businessDays("2026-12-31", { ...cn, end: "2027-01-01" }), missing(2027));
  assert.throws(() => businessDays("2027-01-01", { ...cn, end: "2026-12-31" }), missing(2027));
  assert.throws(() => businessDays("2027-01-01", { ...cn, add: 0 }), missing(2027));
  assert.equal(businessDays("2026-12-31", { ...cn, add: 0 }).end, "2026-12-31");
});

test("ordinary weekends remain independent of China calendar and year coverage", () => {
  assert.equal(businessDays("2025-12-31", { add: 1 }).end, "2026-01-01");
  assert.equal(businessDays("2026-12-31", { add: 1 }).end, "2027-01-01");
  assert.equal(businessDays("2026-01-02", { add: 1, weekends: [0] }).end, "2026-01-03");
  assert.equal(businessDays("2026-01-02", { ...cn, add: 1, weekends: [0, 1, 2, 3, 4, 5, 6] }).end, "2026-01-04");
});

test("breakdown matches signed differences across all bundled years and overlaps", () => {
  for (const year of CN_CALENDAR_YEARS) {
    for (const reverse of [false, true]) {
      const start = `${year}-${reverse ? "12-31" : "01-01"}`;
      const end = `${year}-${reverse ? "01-01" : "12-31"}`;
      const options = { ...cn, holidays: [`${year}-01-04`, `${year}-05-01`] };
      const result = businessDays(start, { ...options, end });
      const counts = businessDayBreakdown(start, end, options);
      assert.equal(Math.abs(result.workingDays), counts.total - counts.weekendCount - counts.holidayCount);
      assert.ok(counts.makeupCount <= Math.abs(result.workingDays));
    }
  }
  const policy = businessDayPolicy(cn);
  assert.equal(policy.classify(timestamp("2026-01-04")), "makeup");
  assert.equal(policy.classify(timestamp("2026-01-01")), "holiday");
});
