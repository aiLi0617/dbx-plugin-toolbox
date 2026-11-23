import IBAN_LENGTHS from "./data/iban-lengths.json" with { type: "json" };

// ISO 13616 country lengths. Validation checks syntax and checksum, not account ownership.

export function validateIban(value) {
  const raw = String(value ?? "");
  const iban = raw.replace(/[\s\u00a0]+/g, "").toUpperCase();
  const country = iban.slice(0, 2),
    expectedLength = IBAN_LENGTHS[country] ?? null;
  let remainder = 0;
  const syntax = /^[A-Z]{2}\d{2}[A-Z\d]+$/.test(iban) && iban.length >= 5;
  if (syntax)
    for (const char of iban.slice(4) + iban.slice(0, 4)) {
      for (const digit of /[A-Z]/.test(char)
        ? String(char.charCodeAt(0) - 55)
        : char)
        remainder = (remainder * 10 + Number(digit)) % 97;
    }
  return {
    iban,
    country,
    checkDigits: iban.slice(2, 4),
    bban: iban.slice(4),
    expectedLength,
    lengthValid: expectedLength !== null && expectedLength === iban.length,
    syntaxValid: syntax,
    formatted: iban.replace(/(.{4})/g, "$1 ").trim(),
    valid: syntax && expectedLength === iban.length && remainder === 1,
    checksumValid: syntax && remainder === 1,
  };
}
