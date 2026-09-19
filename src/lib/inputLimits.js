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
});

export function inputLimitError(value, limit, label = "Input") {
  const length = String(value ?? "").length;
  return length > limit ? `${label} is limited to ${limit.toLocaleString()} characters` : "";
}
