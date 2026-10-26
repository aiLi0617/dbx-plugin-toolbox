import { toRoman, fromRoman } from "./developerExpansion.js";

// Keep the original line numbers so errors can be located after blank lines.
export function convertRomanLines(input) {
  return input.split(/\r\n?|\n/).flatMap((raw, index) => {
    const value = raw.trim();
    if (!value) return [];
    const decimal = /^[+-]?\d+(?:\.\d+)?$/.test(value);
    try {
      if (decimal && !/^\d+$/.test(value)) throw new Error("Integer must be between 1 and 3999");
      const result = String(decimal ? toRoman(value) : fromRoman(value));
      return [{ line: index + 1, input: value, result, decimal, error: "" }];
    } catch {
      return [{ line: index + 1, input: value, result: "", decimal,
        error: decimal ? "range" : "numeral" }];
    }
  });
}
