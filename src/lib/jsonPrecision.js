import { LosslessNumber, isSafeNumber } from "lossless-json";

// Use class identity, never a user-controlled `isLosslessNumber` property.
export function isLosslessNumber(value) { return value instanceof LosslessNumber; }

function numberMarker(serialized) {
  let prefix = "__DBX_RAW_NUMBER__";
  while (serialized.includes(prefix)) prefix += "_";
  return prefix;
}

export function parseLosslessJson(text) {
  if (String(text ?? "").length > 5_000_000) throw new Error("JSON input is limited to 5 MB");
  const source = String(text);
  // Native parsing preserves own __proto__/constructor/prototype properties.
  // It is used only to validate syntax and choose a collision-free marker;
  // numeric values below are rebuilt from their original lexical tokens.
  const checked = JSON.parse(source);
  const prefix = numberMarker(JSON.stringify(checked));
  const numbers = [];
  const replaced = source.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) => {
    if (token.startsWith('"')) return token;
    numbers.push(token);
    return JSON.stringify(`${prefix}${numbers.length - 1}`);
  });
  return JSON.parse(replaced, (_key, value) => typeof value === "string" && value.startsWith(prefix)
    ? new LosslessNumber(numbers[Number(value.slice(prefix.length))]) : value);
}

export function stringifyLosslessJson(value, indent) {
  const seed = JSON.stringify(value, (_key, item) => isLosslessNumber(item) || typeof item === "bigint" ? String(item) : item);
  if (seed === undefined) return undefined;
  const prefix = numberMarker(seed);
  const numbers = [];
  const output = JSON.stringify(value, (_key, item) => {
    if (!isLosslessNumber(item) && typeof item !== "bigint") return item;
    numbers.push(String(item));
    return `${prefix}${numbers.length - 1}`;
  }, indent);
  return output.replace(/"(?:\\.|[^"\\])*"/g, (token) => {
    const text = JSON.parse(token);
    return text.startsWith(prefix) ? numbers[Number(text.slice(prefix.length))] : token;
  });
}

export class UnsafeNumberError extends Error {
  constructor(value) {
    super(`Number ${value} cannot be represented without losing precision. Formatting preserves it; tree editing and conversion are unavailable.`);
    this.code = "UNSAFE_NUMBER";
    this.value = String(value);
  }
}

export function safeNumber(value) {
  const normalized = String(value).replace(/^\+/, "").replace(/^(-?)\./, "$10.").replace(/\.$/, ".0");
  const number = Number(normalized);
  if (!Number.isFinite(number) || !isSafeNumber(normalized) || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
    throw new UnsafeNumberError(value);
  }
  return number;
}

export function toSafeJsonValue(value) {
  if (isLosslessNumber(value) || typeof value === "bigint") return safeNumber(String(value));
  if (Array.isArray(value)) return value.map(toSafeJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toSafeJsonValue(child)]));
  }
  if (typeof value === "number" && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) {
    throw new UnsafeNumberError(value);
  }
  return value;
}

export function parseSafeJson(text) {
  return toSafeJsonValue(parseLosslessJson(text));
}

export function precisionErrorMessage(error, locale = "en") {
  if (error?.code === "UNSAFE_NUMBER" && String(locale).toLowerCase().startsWith("zh")) {
    return `数字 ${error.value} 无法无损转换。格式化和压缩会保留原值；树形编辑和当前格式转换已停止，避免精度丢失。`;
  }
  return error?.message || String(error);
}
