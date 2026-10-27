import { number, precision } from "./calculators.js";

export function calculatePercentage(a, b, digits = 8) {
  const x = number(a), y = number(b);
  if (!Number.isInteger(Number(digits)) || digits < 1 || digits > 15)
    throw new Error("Significant digits must be an integer from 1 to 15");
  const rounded = (value) => {
    if (!Number.isFinite(value)) return null;
    const result = precision(value, Number(digits));
    return Number.isFinite(result) ? result : null;
  };
  // Divide first to avoid overflowing an otherwise representable percentage.
  const percentOf = rounded(Math.abs(x) > Math.abs(y) ? (x / 100) * y : x * (y / 100));
  const share = y === 0 ? null : rounded((x / y) * 100);
  const difference = y - x;
  const change = x === 0 ? null : rounded((Number.isFinite(difference)
    ? difference / Math.abs(x)
    : y / Math.abs(x) - Math.sign(x)) * 100);
  return { percentOf, formulaPercent: "X × Y / 100", share,
    formulaShare: "X / Y × 100", change, formulaChange: "(Y − X) / |X| × 100" };
}
