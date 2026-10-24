export function number(value) {
  const n = Number(value);
  if (String(value).trim() === "" || !Number.isFinite(n))
    throw new Error("A finite number is required");
  return n;
}
export function precision(value, digits = 6) {
  if (!Number.isFinite(value)) throw new Error("Result is not finite");
  return Number(value.toPrecision(Math.max(1, Math.min(15, digits))));
}

// Pratt parser: tokens never reach eval, Function, or a property lookup on globals.
export function evaluateExpression(source) {
  if (source.length > 10_000) throw new Error("Expression is too long");
  const tokens = [];
  let at = 0;
  while (at < source.length) {
    const part = source.slice(at);
    const match =
      /^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z]+|[+*/%^(),-])/i.exec(
        part,
      );
    if (!match) throw new Error(`Invalid token at ${at + 1}`);
    if (!/^\s/.test(match[0])) tokens.push({ value: match[0], at });
    at += match[0].length;
  }
  let index = 0,
    depth = 0;
  const functions = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sqrt: Math.sqrt,
    abs: Math.abs,
    ln: Math.log,
    log: Math.log10,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
  };
  const constants = { pi: Math.PI, e: Math.E };
  function parse(min = 0) {
    if (++depth > 100) throw new Error("Expression nesting is too deep");
    const token = tokens[index++];
    if (!token) throw new Error("Incomplete expression");
    const t = token.value.toLowerCase();
    let left;
    if (t === "+" || t === "-") left = (t === "-" ? -1 : 1) * parse(25);
    else if (t === "(") {
      left = parse();
      if (tokens[index++]?.value !== ")")
        throw new Error(`Missing closing parenthesis at ${token.at + 1}`);
    } else if (Object.hasOwn(constants, t)) left = constants[t];
    else if (Object.hasOwn(functions, t)) {
      if (tokens[index++]?.value !== "(")
        throw new Error("Function requires parentheses");
      const value = parse();
      if (tokens[index++]?.value !== ")")
        throw new Error("Missing closing parenthesis");
      left = functions[t](value);
    } else if (/^\d|^\./.test(t)) left = number(t);
    else throw new Error(`Unknown name at ${token.at + 1}`);
    while (index < tokens.length) {
      const op = tokens[index].value;
      const power = { "+": 10, "-": 10, "*": 20, "/": 20, "%": 20, "^": 30 }[
        op
      ];
      if (power === undefined || power < min) break;
      index++;
      const right = parse(op === "^" ? power : power + 1);
      if ((op === "/" || op === "%") && right === 0)
        throw new Error("Division by zero");
      left =
        op === "+"
          ? left + right
          : op === "-"
            ? left - right
            : op === "*"
              ? left * right
              : op === "/"
                ? left / right
                : op === "%"
                  ? left % right
                  : left ** right;
    }
    depth--;
    return left;
  }
  const result = parse();
  if (index !== tokens.length)
    throw new Error(`Unexpected token at ${tokens[index].at + 1}`);
  if (!Number.isFinite(result)) throw new Error("Result is not finite");
  return result;
}
export const UNITS = {
  length: {
    m: 1,
    km: 1000,
    cm: 0.01,
    mm: 0.001,
    in: 0.0254,
    ft: 0.3048,
    yd: 0.9144,
    mi: 1609.344,
  },
  area: {
    "m²": 1,
    "km²": 1e6,
    "cm²": 0.0001,
    ha: 10000,
    acre: 4046.8564224,
    "ft²": 0.09290304,
  },
  volume: {
    L: 1,
    mL: 0.001,
    "m³": 1000,
    "US gal": 3.785411784,
    "US fl oz": 0.0295735295625,
  },
  mass: {
    kg: 1,
    g: 0.001,
    mg: 1e-6,
    t: 1000,
    lb: 0.45359237,
    oz: 0.028349523125,
  },
  speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444444444 },
  data: {
    B: 1,
    kB: 1000,
    MB: 1e6,
    GB: 1e9,
    TB: 1e12,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
    bit: 0.125,
  },
};
export function convertUnit(value, category, from, to) {
  const units = UNITS[category];
  if (!units || !Object.hasOwn(units, from) || !Object.hasOwn(units, to))
    throw new Error("Invalid unit");
  return (number(value) * units[from]) / units[to];
}
export function statistics(source) {
  const values = String(source)
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(number);
  if (!values.length || values.length > 100_000)
    throw new Error("Use between 1 and 100000 numbers");
  const sorted = [...values].sort((a, b) => a - b);
  let mean = 0,
    m2 = 0;
  values.forEach((x, i) => {
    const delta = x - mean;
    mean += delta / (i + 1);
    m2 += delta * (x - mean);
  });
  const counts = new Map();
  for (const x of values) counts.set(x, (counts.get(x) || 0) + 1);
  let max = 0;
  for (const frequency of counts.values()) max = Math.max(max, frequency);
  return {
    count: values.length,
    sum: values.reduce((a, b) => a + b, 0),
    mean,
    median:
      sorted.length % 2
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    modes:
      max === 1 ? [] : [...counts].filter(([, n]) => n === max).map(([x]) => x),
    min: sorted[0],
    max: sorted.at(-1),
    range: sorted.at(-1) - sorted[0],
    populationVariance: m2 / values.length,
    populationStdDev: Math.sqrt(m2 / values.length),
    sampleVariance: values.length > 1 ? m2 / (values.length - 1) : null,
    sampleStdDev:
      values.length > 1 ? Math.sqrt(m2 / (values.length - 1)) : null,
  };
}
export function temperatures(value, from) {
  const n = number(value);
  const k =
    from === "C"
      ? n + 273.15
      : from === "F"
        ? ((n + 459.67) * 5) / 9
        : from === "R"
          ? (n * 5) / 9
          : n;
  if (k < 0) throw new Error("Temperature is below absolute zero");
  return { C: k - 273.15, F: (k * 9) / 5 - 459.67, K: k, R: (k * 9) / 5 };
}
function day(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Use YYYY-MM-DD");
  const n = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(n) || new Date(n).toISOString().slice(0, 10) !== value)
    throw new Error("Invalid date");
  return n;
}
export function businessDays(
  start,
  { end, add, weekends = [0, 6], holidays = [] } = {},
) {
  const first = day(start);
  const excluded = new Set(holidays.filter(Boolean).map(day));
  const valid = (d) =>
    !weekends.includes(new Date(d).getUTCDay()) && !excluded.has(d);
  if (weekends.length === 7)
    throw new Error("At least one working weekday is required");
  if (end !== undefined) {
    const last = day(end),
      sign = last >= first ? 1 : -1;
    if (Math.abs(last - first) / 864e5 > 100_000)
      throw new Error("Date range is too large");
    let count = 0;
    for (let d = first; d !== last;) {
      d += sign * 864e5;
      if (valid(d)) count += sign;
    }
    return {
      start,
      end,
      workingDays: count,
      convention: "Start excluded, end included",
    };
  }
  let left = number(add);
  if (!Number.isInteger(left) || Math.abs(left) > 100_000)
    throw new Error("Working days must be an integer within 100000");
  const sign = Math.sign(left);
  left = Math.abs(left);
  let d = first,
    steps = 0;
  while (left) {
    if (++steps > 750_000) throw new Error("Date range is too large");
    d += sign * 864e5;
    if (valid(d)) left--;
  }
  return {
    start,
    end: new Date(d).toISOString().slice(0, 10),
    addedWorkingDays: Number(add),
  };
}
export function compoundInterest(
  principal,
  rate,
  years,
  frequency = 12,
  monthly = 0,
) {
  principal = number(principal);
  rate = number(rate) / 100;
  years = number(years);
  frequency = number(frequency);
  monthly = number(monthly);
  if (
    principal < 0 ||
    monthly < 0 ||
    years < 0 ||
    years > 200 ||
    rate <= -1 ||
    ![1, 2, 4, 12, 365].includes(frequency)
  )
    throw new Error("Invalid interest parameters");
  const months = Math.round(years * 12),
    monthlyRate = (1 + rate / frequency) ** (frequency / 12) - 1;
  let value = principal;
  for (let m = 0; m < months; m++) value = value * (1 + monthlyRate) + monthly;
  const invested = principal + months * monthly;
  return {
    months,
    principal: invested,
    interest: value - invested,
    total: value,
    convention: "Contributions at month end; excludes taxes and fees",
  };
}
export function compareBenchmarks(source) {
  const rows = String(source)
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, i) => {
      const at = line.indexOf(":");
      const name = at < 0 ? `#${i + 1}` : line.slice(0, at);
      const s = statistics(at < 0 ? line : line.slice(at + 1));
      if (s.min <= 0)
        throw new Error("Scores must be positive operations per second");
      return { name, ...s };
    })
    .sort((a, b) => b.mean - a.mean);
  return rows.map((row, i) => ({
    ...row,
    rank: i + 1,
    relativeToFastest: row.mean / rows[0].mean,
  }));
}
