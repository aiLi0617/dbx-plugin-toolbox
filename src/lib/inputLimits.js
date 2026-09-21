import { L, localize } from "./locale.js";

export const INPUT_LIMITS = Object.freeze({
  text: 5_000_000,
  json: 5_000_000,
  markdown: 1_000_000,
  regex: 1_000_000,
  hash: 16_000_000,
  diff: 1_000_000,
  certificate: 2_000_000,
  jwt: 1_000_000,
  jwk: 1_000_000,
  hmac: 5_000_000,
  /** Align with backend MAX_CRYPTO_INPUT_BYTES (16 MiB). */
  crypto: 16_000_000,
});

/**
 * @param {unknown} value
 * @param {number} limit
 * @param {string | { locale?: string, zh?: string, en?: string, label?: object }} [labelOrOpts="Input"]
 */
export function inputLimitError(value, limit, labelOrOpts = "Input") {
  const length = String(value ?? "").length;
  if (length <= limit) return "";
  const n = limit.toLocaleString();
  if (labelOrOpts && typeof labelOrOpts === "object") {
    const locale = labelOrOpts.locale || "en";
    const label = labelOrOpts.label
      ? localize(locale, labelOrOpts.label)
      : localize(locale, {
        en: labelOrOpts.en || "Input",
        "zh-CN": labelOrOpts.zh || "输入",
        "zh-TW": labelOrOpts.zhTW,
        es: labelOrOpts.es, it: labelOrOpts.it, ja: labelOrOpts.ja,
        "pt-BR": labelOrOpts.ptBR,
      });
    return localize(locale, L(
      `${label} is limited to ${n} characters`,
      `${label}不能超过 ${n} 个字符`,
      `${label}不能超過 ${n} 個字元`,
      `${label} está limitado a ${n} caracteres`,
      `${label} è limitato a ${n} caratteri`,
      `${label}は ${n} 文字までに制限されています`,
      `${label} está limitado a ${n} caracteres`,
    ));
  }
  return `${labelOrOpts} is limited to ${limit.toLocaleString()} characters`;
}
