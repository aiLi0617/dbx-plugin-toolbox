import { LosslessNumber, isSafeNumber } from "lossless-json";
import { localize, localizeError, L } from "./i18n.js";

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
  if (error?.code === "UNSAFE_NUMBER") {
    const value = error.value;
    return localize(locale, L(
      `Number ${value} cannot be converted without losing precision.`,
      `数字 ${value} 无法无损转换。格式化和压缩会保留原值；树形编辑和当前格式转换已停止，避免精度丢失。`,
      `數字 ${value} 無法無損轉換。格式化和壓縮會保留原值；樹形編輯和目前格式轉換已停止，避免精度遺失。`,
      `El número ${value} no se puede convertir sin perder precisión. El formato y la minificación conservan el valor; se detuvo la edición en árbol y la conversión.`,
      `Il numero ${value} non può essere convertito senza perdita di precisione. Formattazione e minificazione conservano il valore; modifica ad albero e conversione interrotte.`,
      `数値 ${value} は精度を失わずに変換できません。整形と圧縮は元の値を保持します。ツリー編集と現在の形式変換は停止しました。`,
      `O número ${value} não pode ser convertido sem perda de precisão. Formatação e minificação preservam o valor; a edição em árvore e a conversão foram interrompidas.`,
    ));
  }
  return localizeError(locale, error);
}
