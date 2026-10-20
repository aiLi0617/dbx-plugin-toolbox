export const AES_ALGORITHMS = Object.freeze([
  { value: "aes-256", label: "AES-256" },
  { value: "aes-192", label: "AES-192" },
  { value: "aes-128", label: "AES-128" },
]);

export const AES_MODES = Object.freeze([
  { value: "gcm", label: "GCM" },
  { value: "cbc", label: "CBC" },
  { value: "ctr", label: "CTR" },
  { value: "ecb", label: "ECB" },
]);

export const SM4_MODES = Object.freeze([
  { value: "cbc", label: "CBC" },
  { value: "ecb", label: "ECB" },
]);

export function asymmetricCipherProfile(toolId) {
  return toolId === "sm2" ? "sm2" : "rsa";
}

export function symmetricCipherProfile(toolId, options = {}) {
  if (toolId === "sm4") {
    const mode = SM4_MODES.some((item) => item.value === options.mode) ? options.mode : "cbc";
    return {
      algorithm: "sm4-128",
      mode,
      sm4Mode: mode,
    };
  }

  return {
    algorithm: AES_ALGORITHMS.some((item) => item.value === options.algorithm) ? options.algorithm : "aes-256",
    mode: AES_MODES.some((item) => item.value === options.mode) ? options.mode : "gcm",
    sm4Mode: "cbc",
  };
}
