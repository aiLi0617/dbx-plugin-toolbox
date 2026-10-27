import data from "./data/cn-holidays.json" with { type: "json" };

export const CN_CALENDAR_YEARS = Object.freeze(data.years.map((entry) => entry.year).sort((a, b) => a - b));
export const CN_CALENDAR_SOURCE = data.source;
export const CN_CALENDAR_REVISION = data.revision;
export const CN_CALENDAR_PAPERS = Object.freeze(data.years.flatMap(({ year, papers }) => papers.map((url) => ({ year, url }))));
const years = new Set(CN_CALENDAR_YEARS);
const official = new Map(data.years.flatMap((entry) => entry.days.map((row) => [row.date, row.isOffDay])));

// One policy is shared by the calculator and the displayed breakdown so that
// make-up workdays and overlapping exclusions cannot disagree with the total.
export function businessDayPolicy({ calendar = "weekends", weekends = [0, 6], holidays = [] } = {}) {
  if (!["weekends", "cn"].includes(calendar)) throw new Error("Invalid business calendar");
  const excluded = new Set(holidays);
  function assertYear(date) {
    const year = Number(date.slice(0, 4));
    if (calendar === "cn" && !years.has(year)) {
      const error = new Error("China holiday calendar is unavailable for this year");
      error.code = "CALENDAR_YEAR_UNAVAILABLE";
      error.year = year;
      throw error;
    }
  }
  function classify(timestamp) {
    const date = new Date(timestamp);
    const iso = date.toISOString().slice(0, 10);
    assertYear(iso);
    if (excluded.has(iso)) return "holiday";
    const weekend = (calendar === "cn" ? [0, 6] : weekends).includes(date.getUTCDay());
    if (calendar === "cn" && official.has(iso)) {
      if (!official.get(iso)) return weekend ? "makeup" : "workday";
      // Weekends in a holiday period are attributed once to the weekend bucket.
      return weekend ? "weekend" : "holiday";
    }
    return weekend ? "weekend" : "workday";
  }
  return { assertYear, classify, isWorkingDay(timestamp) {
    const kind = classify(timestamp);
    return kind === "workday" || kind === "makeup";
  } };
}

export function businessDayBreakdown(start, end, options = {}) {
  const policy = businessDayPolicy(options);
  policy.assertYear(start);
  policy.assertYear(end);
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  const total = Math.abs(last - first) / 864e5;
  const direction = Math.sign(last - first);
  const counts = { total, weekendCount: 0, holidayCount: 0, makeupCount: 0 };
  for (let i = 1; i <= total; i++) {
    const kind = policy.classify(first + i * direction * 864e5);
    if (kind === "weekend") counts.weekendCount++;
    else if (kind === "holiday") counts.holidayCount++;
    else if (kind === "makeup") counts.makeupCount++;
  }
  return counts;
}
