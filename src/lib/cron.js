import { CronExpressionParser } from "cron-parser";

export const CRON_FLAVORS = [
  { id: "quartz", zh: "Quartz", en: "Quartz", keys: ["second", "minute", "hour", "day", "month", "weekday", "year"], quartz: true },
  { id: "spring", zh: "Spring", en: "Spring", keys: ["second", "minute", "hour", "day", "month", "weekday"], quartz: true },
  { id: "linux", zh: "Linux", en: "Linux", keys: ["minute", "hour", "day", "month", "weekday"], quartz: false },
  { id: "node", zh: "Node", en: "Node", keys: ["second", "minute", "hour", "day", "month", "weekday"], quartz: false },
];

export const CRON_FIELD_DEFS = {
  second: { key: "second", zh: "秒", en: "Second", tabZh: "秒", tabEn: "Second", everyZh: "每秒", everyEn: "Every second", unitZh: "秒", unitEn: "second", min: 0, max: 59, pad: 2 },
  minute: { key: "minute", zh: "分", en: "Minute", tabZh: "分钟", tabEn: "Minute", everyZh: "每分", everyEn: "Every minute", unitZh: "分钟", unitEn: "minute", min: 0, max: 59, pad: 2 },
  hour: { key: "hour", zh: "时", en: "Hour", tabZh: "小时", tabEn: "Hour", everyZh: "每时", everyEn: "Every hour", unitZh: "小时", unitEn: "hour", min: 0, max: 23, pad: 2 },
  day: { key: "day", zh: "日", en: "Day", tabZh: "日", tabEn: "Day", everyZh: "每日", everyEn: "Every day", unitZh: "日", unitEn: "day", min: 1, max: 31, pad: 2 },
  month: { key: "month", zh: "月", en: "Month", tabZh: "月", tabEn: "Month", everyZh: "每月", everyEn: "Every month", unitZh: "月", unitEn: "month", min: 1, max: 12, pad: 2 },
  weekday: { key: "weekday", zh: "周", en: "Weekday", tabZh: "周", tabEn: "Week", everyZh: "每周", everyEn: "Every weekday", unitZh: "周", unitEn: "weekday", min: 0, max: 7, pad: 0 },
  year: { key: "year", zh: "年", en: "Year", tabZh: "年", tabEn: "Year", everyZh: "每年", everyEn: "Every year", unitZh: "年", unitEn: "year", min: 1970, max: 2099, pad: 4 },
};

export const CRON_TIMEZONES = [
  { id: "Asia/Shanghai", zh: "中国标准时间", en: "China Standard Time" },
  { id: "Asia/Tokyo", zh: "东京", en: "Tokyo" },
  { id: "Asia/Singapore", zh: "新加坡", en: "Singapore" },
  { id: "Europe/London", zh: "伦敦", en: "London" },
  { id: "America/New_York", zh: "纽约", en: "New York" },
  { id: "UTC", zh: "UTC", en: "UTC" },
];

export const CRON_PRESET_PIN_COUNT = 10;

export const CRON_PRESETS = [
  { id: "min", zh: "每分钟", en: "Every minute", linux: "* * * * *", node: "0 * * * * *", quartz: "0 * * * * ? *" },
  { id: "min5", zh: "每5分钟", en: "Every 5 minutes", linux: "*/5 * * * *", node: "0 */5 * * * *", quartz: "0 */5 * * * ? *" },
  { id: "min10", zh: "每10分钟", en: "Every 10 minutes", linux: "*/10 * * * *", node: "0 */10 * * * *", quartz: "0 */10 * * * ? *" },
  { id: "min15", zh: "每15分钟", en: "Every 15 minutes", linux: "*/15 * * * *", node: "0 */15 * * * *", quartz: "0 */15 * * * ? *" },
  { id: "min30", zh: "每30分钟", en: "Every 30 minutes", linux: "*/30 * * * *", node: "0 */30 * * * *", quartz: "0 */30 * * * ? *" },
  { id: "hour", zh: "每小时", en: "Hourly", linux: "0 * * * *", node: "0 0 * * * *", quartz: "0 0 * * * ? *" },
  { id: "hour2", zh: "每2小时", en: "Every 2 hours", linux: "0 */2 * * *", node: "0 0 */2 * * *", quartz: "0 0 */2 * * ? *" },
  { id: "hour6", zh: "每6小时", en: "Every 6 hours", linux: "0 */6 * * *", node: "0 0 */6 * * *", quartz: "0 0 */6 * * ? *" },
  { id: "midnight", zh: "每天零点", en: "Daily midnight", linux: "0 0 * * *", node: "0 0 0 * * *", quartz: "0 0 0 * * ? *" },
  { id: "morning", zh: "每天8点", en: "Daily 8:00", linux: "0 8 * * *", node: "0 0 8 * * *", quartz: "0 0 8 * * ? *" },
  { id: "daily930", zh: "每天9:30", en: "Daily 9:30", linux: "30 9 * * *", node: "0 30 9 * * *", quartz: "0 30 9 * * ? *" },
  { id: "noon", zh: "每天中午", en: "Daily noon", linux: "0 12 * * *", node: "0 0 12 * * *", quartz: "0 0 12 * * ? *" },
  { id: "daily18", zh: "每天18点", en: "Daily 18:00", linux: "0 18 * * *", node: "0 0 18 * * *", quartz: "0 0 18 * * ? *" },
  { id: "daily23", zh: "每天23点", en: "Daily 23:00", linux: "0 23 * * *", node: "0 0 23 * * *", quartz: "0 0 23 * * ? *" },
  { id: "weekdays9", zh: "工作日9点", en: "Weekdays 9:00", linux: "0 9 * * 1-5", node: "0 0 9 * * 1-5", quartz: "0 0 9 ? * 2-6 *" },
  { id: "weekdays18", zh: "工作日18点", en: "Weekdays 18:00", linux: "0 18 * * 1-5", node: "0 0 18 * * 1-5", quartz: "0 0 18 ? * 2-6 *" },
  { id: "monday9", zh: "每周一9点", en: "Mondays 9:00", linux: "0 9 * * 1", node: "0 0 9 * * 1", quartz: "0 0 9 ? * 2 *" },
  { id: "friday18", zh: "每周五18点", en: "Fridays 18:00", linux: "0 18 * * 5", node: "0 0 18 * * 5", quartz: "0 0 18 ? * 6 *" },
  { id: "saturday10", zh: "每周六10点", en: "Saturdays 10:00", linux: "0 10 * * 6", node: "0 0 10 * * 6", quartz: "0 0 10 ? * 7 *" },
  { id: "month1", zh: "每月1号", en: "1st of month", linux: "0 0 1 * *", node: "0 0 0 1 * *", quartz: "0 0 0 1 * ? *" },
  { id: "month15", zh: "每月15号", en: "15th of month", linux: "0 0 15 * *", node: "0 0 0 15 * *", quartz: "0 0 0 15 * ? *" },
  { id: "monthLast", zh: "每月最后一天", en: "Last day of month", linux: "0 0 L * *", node: "0 0 0 L * *", quartz: "0 0 0 L * ? *" },
  { id: "quarter", zh: "每季度首日", en: "First day of quarter", linux: "0 0 1 1,4,7,10 *", node: "0 0 0 1 1,4,7,10 *", quartz: "0 0 0 1 1,4,7,10 ? *" },
  { id: "newyear", zh: "每年元旦", en: "New Year's Day", linux: "0 0 1 1 *", node: "0 0 0 1 1 *", quartz: "0 0 0 1 1 ? *" },
  { id: "linuxMin5", zh: "Linux每5分钟", en: "Linux every 5 min", forceFlavor: "linux", linux: "*/5 * * * *", node: "*/5 * * * *", quartz: "*/5 * * * *" },
  { id: "linux2am", zh: "Linux每天2点", en: "Linux daily 2:00", forceFlavor: "linux", linux: "0 2 * * *", node: "0 2 * * *", quartz: "0 2 * * *" },
  { id: "linuxWork", zh: "Linux工作时段", en: "Linux work hours", forceFlavor: "linux", linux: "0 9-18 * * 1-5", node: "0 9-18 * * 1-5", quartz: "0 9-18 * * 1-5" },
  { id: "linuxSun", zh: "Linux每周日", en: "Linux Sundays", forceFlavor: "linux", linux: "0 0 * * 0", node: "0 0 * * 0", quartz: "0 0 * * 0" },
  { id: "nodeMin10", zh: "Node每10分钟", en: "Node every 10 min", forceFlavor: "node", linux: "0 */10 * * * *", node: "0 */10 * * * *", quartz: "0 */10 * * * *" },
  { id: "nodeWeekdays9", zh: "Node工作日9点", en: "Node weekdays 9:00", forceFlavor: "node", linux: "0 0 9 * * 1-5", node: "0 0 9 * * 1-5", quartz: "0 0 9 * * 1-5" },
];

const MONTH_ZH = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEK_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEK_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function flavorById(id) {
  return CRON_FLAVORS.find((item) => item.id === id) || CRON_FLAVORS[2];
}

export function isQuartzFlavor(id) {
  return flavorById(id).quartz;
}

export function presetExpression(preset, flavorId) {
  const id = preset.forceFlavor || flavorId;
  if (id === "spring") return preset.quartz.split(/\s+/).slice(0, 6).join(" ");
  if (flavorById(id).quartz) return preset.quartz;
  if (id === "node") return preset.node;
  return preset.linux;
}

export function weekdayOptions(flavorId) {
  const quartz = isQuartzFlavor(flavorId);
  return WEEK_ZH.map((zh, i) => ({
    value: quartz ? i + 1 : i,
    zh,
    en: WEEK_EN[i],
  }));
}

export function yearChoices(selected = [], now = new Date()) {
  const year = now.getFullYear();
  const set = new Set();
  for (let i = year - 1; i <= year + 10; i++) set.add(i);
  for (const value of selected) {
    const n = Number(value);
    if (Number.isInteger(n)) set.add(n);
  }
  return [...set].sort((a, b) => a - b);
}

export function fieldValues(key, flavorId, selected = []) {
  if (key === "weekday") return weekdayOptions(flavorId).map((item) => item.value);
  if (key === "year") return yearChoices(selected);
  const def = CRON_FIELD_DEFS[key];
  const values = [];
  for (let n = def.min; n <= def.max; n++) values.push(n);
  return values;
}

export function valueLabel(key, value, localeIsZh, flavorId) {
  if (key === "month") {
    const name = MONTH_ZH[value - 1];
    return localeIsZh ? name : String(value);
  }
  if (key === "weekday") {
    const index = isQuartzFlavor(flavorId) ? (value === 7 ? 6 : value - 1) : value === 7 ? 0 : value;
    const safe = index >= 0 && index < 7 ? index : 0;
    return localeIsZh ? WEEK_ZH[safe] : WEEK_EN[safe];
  }
  const def = CRON_FIELD_DEFS[key];
  return def.pad ? String(value).padStart(def.pad, "0") : String(value);
}

export function defaultFieldState(def) {
  return {
    mode: "every",
    from: def.min,
    to: Math.min(def.max, def.min + 1),
    interval: 1,
    selected: [],
    custom: "",
  };
}

export function emptyFields() {
  const fields = {};
  for (const def of Object.values(CRON_FIELD_DEFS)) fields[def.key] = defaultFieldState(def);
  return fields;
}

function clamp(n, def) {
  const value = Number(n);
  if (!Number.isFinite(value)) return def.min;
  return Math.min(def.max, Math.max(def.min, Math.trunc(value)));
}

function isEvery(state) {
  return !state || state.mode === "every";
}

export function parseCronToken(token) {
  const raw = String(token ?? "").trim();
  if (!raw || raw === "*") return { mode: "every" };
  if (raw === "?") return { mode: "unset" };
  if (/^[lL]$/.test(raw)) return { mode: "last" };
  if (/^[lL][wW]$/.test(raw)) return { mode: "lastWeekday" };
  if (/^\d+[wW]$/.test(raw)) return { mode: "nearest", from: Number(raw.slice(0, -1)) };
  if (/^\d+-\d+$/.test(raw)) {
    const [from, to] = raw.split("-").map(Number);
    return { mode: "range", from, to };
  }
  if (/^\*\/\d+$/.test(raw)) return { mode: "step", from: null, interval: Number(raw.slice(2)) };
  if (/^\d+\/\d+$/.test(raw)) {
    const [from, interval] = raw.split("/").map(Number);
    return { mode: "step", from, interval };
  }
  if (/^\d+(,\d+)*$/.test(raw)) return { mode: "specify", selected: raw.split(",").map(Number) };
  return { mode: "custom", custom: raw };
}

function applyToken(def, parsed) {
  const base = defaultFieldState(def);
  if (parsed.mode === "range") {
    return { ...base, mode: "range", from: clamp(parsed.from, def), to: clamp(parsed.to, def) };
  }
  if (parsed.mode === "step") {
    return {
      ...base,
      mode: "step",
      from: parsed.from == null ? def.min : clamp(parsed.from, def),
      interval: Math.max(1, parsed.interval || 1),
    };
  }
  if (parsed.mode === "specify") {
    return { ...base, mode: "specify", selected: [...new Set(parsed.selected.map((n) => clamp(n, def)))].sort((a, b) => a - b) };
  }
  if (parsed.mode === "unset") return { ...base, mode: "unset" };
  if (parsed.mode === "last") return { ...base, mode: "last" };
  if (parsed.mode === "lastWeekday") return { ...base, mode: "lastWeekday" };
  if (parsed.mode === "nearest") return { ...base, mode: "nearest", from: clamp(parsed.from, def) };
  if (parsed.mode === "custom") return { ...base, mode: "custom", custom: parsed.custom || "" };
  return base;
}

export function parseCronFields(expr, flavorId) {
  const flavor = flavorById(flavorId);
  const tokens = String(expr ?? "").trim().split(/\s+/).filter(Boolean);
  const fields = emptyFields();
  flavor.keys.forEach((key, i) => {
    const token = tokens[i];
    if (!token) return;
    fields[key] = applyToken(CRON_FIELD_DEFS[key], parseCronToken(token));
  });
  return fields;
}

export function fieldToken(state, def) {
  if (!state || state.mode === "every") return "*";
  if (state.mode === "unset") return "?";
  if (state.mode === "last") return "L";
  if (state.mode === "lastWeekday") return "LW";
  if (state.mode === "nearest") return `${clamp(state.from, def)}W`;
  if (state.mode === "range") {
    const from = clamp(state.from, def);
    const to = clamp(state.to, def);
    return from <= to ? `${from}-${to}` : `${to}-${from}`;
  }
  if (state.mode === "step") {
    const interval = Math.max(1, Number(state.interval) || 1);
    const from = clamp(state.from ?? def.min, def);
    return from === def.min ? `*/${interval}` : `${from}/${interval}`;
  }
  if (state.mode === "specify") {
    const values = [...new Set((state.selected || []).map((n) => clamp(n, def)))].sort((a, b) => a - b);
    return values.length ? values.join(",") : "*";
  }
  return state.custom?.trim() || "*";
}

function quartzPair(fields, dayPriority) {
  const dayEvery = isEvery(fields.day);
  const weekEvery = isEvery(fields.weekday);
  const dayUnset = fields.day?.mode === "unset";
  const weekUnset = fields.weekday?.mode === "unset";
  if (dayUnset && weekUnset) return { day: "?", weekday: "*" };
  if (dayUnset) return { day: "?", weekday: fieldToken(fields.weekday, CRON_FIELD_DEFS.weekday) };
  if (weekUnset) return { day: fieldToken(fields.day, CRON_FIELD_DEFS.day), weekday: "?" };
  if (dayEvery && weekEvery) return { day: "*", weekday: "?" };
  if (!dayEvery && weekEvery) return { day: fieldToken(fields.day, CRON_FIELD_DEFS.day), weekday: "?" };
  if (dayEvery && !weekEvery) return { day: "?", weekday: fieldToken(fields.weekday, CRON_FIELD_DEFS.weekday) };
  if (dayPriority === "weekday") {
    return { day: "?", weekday: fieldToken(fields.weekday, CRON_FIELD_DEFS.weekday) };
  }
  return { day: fieldToken(fields.day, CRON_FIELD_DEFS.day), weekday: "?" };
}

export function composeCron(flavorId, fields, dayPriority = "day") {
  const flavor = flavorById(flavorId);
  const quartz = flavor.quartz ? quartzPair(fields, dayPriority) : null;
  return flavor.keys
    .map((key) => {
      if (quartz && (key === "day" || key === "weekday")) return quartz[key];
      return fieldToken(fields[key], CRON_FIELD_DEFS[key]);
    })
    .join(" ");
}

function convertWeekValue(n, fromQuartz, toQuartz) {
  if (fromQuartz === toQuartz) return n;
  if (!fromQuartz && toQuartz) {
    if (n === 0 || n === 7) return 1;
    if (n >= 1 && n <= 6) return n + 1;
    return n;
  }
  if (n === 1) return 0;
  if (n >= 2 && n <= 7) return n - 1;
  return n;
}

function convertWeekToken(token, fromQuartz, toQuartz) {
  if (!token || token === "*" || token === "?") return token;
  const convertAtom = (atom) => {
    if (/^\d+$/.test(atom)) return String(convertWeekValue(Number(atom), fromQuartz, toQuartz));
    const range = atom.match(/^(\d+)-(\d+)$/);
    if (range) {
      return `${convertWeekValue(Number(range[1]), fromQuartz, toQuartz)}-${convertWeekValue(Number(range[2]), fromQuartz, toQuartz)}`;
    }
    return atom;
  };
  return String(token).split(",").map((item) => {
    const nth = item.match(/^(.+)#(\d+)$/);
    if (nth) return `${convertAtom(nth[1])}#${nth[2]}`;
    const step = item.match(/^(.+)\/(\d+)$/);
    if (step) return `${convertAtom(step[1])}/${step[2]}`;
    const last = item.match(/^(\d+)(L)$/i);
    if (last) return `${convertAtom(last[1])}${last[2]}`;
    return convertAtom(item);
  }).join(",");
}

function yearsFromToken(token) {
  if (!token || token === "*" || token === "?") return null;
  const parsed = parseCronToken(token);
  const def = CRON_FIELD_DEFS.year;
  if (parsed.mode === "specify") return new Set(parsed.selected);
  if (parsed.mode === "range") {
    const from = Math.min(parsed.from, parsed.to);
    const to = Math.max(parsed.from, parsed.to);
    const years = new Set();
    for (let year = from; year <= to; year++) years.add(year);
    return years;
  }
  if (parsed.mode === "step") {
    const years = new Set();
    const start = parsed.from == null ? def.min : parsed.from;
    for (let year = start; year <= def.max; year += Math.max(1, parsed.interval || 1)) years.add(year);
    return years;
  }
  return null;
}

function yearOfIso(iso, tz) {
  const opts = { year: "numeric" };
  if (tz) opts.timeZone = tz;
  return Number(new Intl.DateTimeFormat("en-US", opts).format(new Date(iso)));
}

function calendarParts(date, tz) {
  const options = { year: "numeric", month: "numeric", day: "numeric" };
  if (tz) options.timeZone = tz;
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function nearestWeekday(year, month, requested, last) {
  const end = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let day = last ? end : Math.min(end, Math.max(1, requested));
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  if (weekday === 6) day += day === 1 ? 2 : -1;
  else if (weekday === 0) day += day === end ? -2 : 1;
  return day;
}

function quartzNearestRuns(body, dayToken, yearToken, tz) {
  const match = dayToken.match(/^(?:(\d{1,2})W|LW)$/i);
  if (!match) return null;
  const now = new Date();
  const start = calendarParts(now, tz);
  const years = yearsFromToken(yearToken);
  const results = [];
  for (let offset = 0; offset < 240 && results.length < 5; offset++) {
    const zeroBased = start.month - 1 + offset;
    const year = start.year + Math.floor(zeroBased / 12);
    const month = ((zeroBased % 12) + 12) % 12 + 1;
    if (years && !years.has(year)) continue;
    const beforeMonth = new Date(Date.UTC(year, month - 1, 1) - 2 * 86400000);
    const options = { currentDate: beforeMonth };
    if (tz) options.tz = tz;
    const monthProbe = CronExpressionParser.parse(`0 0 0 1 ${body[4]} *`, options).next().toISOString();
    const allowedMonth = calendarParts(new Date(monthProbe), tz);
    if (allowedMonth.year !== year || allowedMonth.month !== month) continue;
    const day = nearestWeekday(year, month, Number(match[1] || 1), !match[1]);
    const tokens = [...body];
    tokens[3] = String(day);
    tokens[4] = String(month);
    tokens[5] = "*";
    const interval = CronExpressionParser.parse(tokens.join(" "), { ...options, currentDate: offset === 0 ? now : beforeMonth });
    for (let i = 0; i < 5 - results.length; i++) {
      const iso = interval.next().toISOString();
      const parts = calendarParts(new Date(iso), tz);
      if (parts.year !== year || parts.month !== month || parts.day !== day) break;
      results.push(iso);
    }
  }
  return results.sort().slice(0, 5);
}

function convertWeekState(state, fromQuartz, toQuartz) {
  if (!state || fromQuartz === toQuartz) return state;
  const map = (n) => convertWeekValue(n, fromQuartz, toQuartz);
  return {
    ...state,
    from: map(state.from),
    to: map(state.to),
    selected: (state.selected || []).map(map),
  };
}

export function migrateCronFields(fields, fromId, toId) {
  const next = emptyFields();
  for (const key of Object.keys(CRON_FIELD_DEFS)) {
    next[key] = { ...defaultFieldState(CRON_FIELD_DEFS[key]), ...(fields[key] || {}) };
  }
  next.weekday = convertWeekState(next.weekday, isQuartzFlavor(fromId), isQuartzFlavor(toId));
  const from = flavorById(fromId);
  const to = flavorById(toId);
  if (!from.keys.includes("second") && to.keys.includes("second") && isEvery(next.second)) {
    next.second = { ...defaultFieldState(CRON_FIELD_DEFS.second), mode: "specify", selected: [0] };
  }
  return next;
}

export function inferCronFlavor(expr, current = "linux") {
  const n = String(expr ?? "").trim().split(/\s+/).filter(Boolean).length;
  if (n <= 5) return "linux";
  if (n >= 7) return current === "spring" ? "spring" : "quartz";
  if (current === "quartz" || current === "spring") return current;
  if (/\?/.test(expr)) return current === "spring" ? "spring" : "quartz";
  return "node";
}

export function explainCron(expr, { tz, flavorId } = {}) {
  const expression = String(expr ?? "").trim();
  if (!expression) throw new Error("empty");
  const flavor = flavorById(flavorId || inferCronFlavor(expression));
  const atoms = expression.split(/\s+/).filter(Boolean);
  let yearToken = null;
  const body = atoms.length >= 7 ? atoms.slice(0, 6) : [...atoms];
  if (atoms.length >= 7) yearToken = atoms[6];
  if (flavor.quartz && body.length >= 6) {
    body[5] = convertWeekToken(body[5], true, false);
  }
  const specialRuns = flavor.quartz ? quartzNearestRuns(body, atoms[3], yearToken, tz) : null;
  if (specialRuns) return { expression, fields: atoms, next: specialRuns };
  const options = { currentDate: new Date() };
  if (tz) options.tz = tz;
  const interval = CronExpressionParser.parse(body.join(" "), options);
  const years = yearsFromToken(yearToken);
  const next = [];
  let guard = 0;
  while (next.length < 5 && guard < 500) {
    guard += 1;
    const iso = interval.next().toISOString();
    if (!years || years.has(yearOfIso(iso, tz))) next.push(iso);
  }
  return { expression, fields: atoms, next };
}

export function formatCronRun(iso, locale, timeZone) {
  const date = new Date(iso);
  const opts = {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
  };
  if (timeZone) opts.timeZone = timeZone;
  const parts = new Intl.DateTimeFormat(locale, opts).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`,
    weekday: get("weekday"),
  };
}
