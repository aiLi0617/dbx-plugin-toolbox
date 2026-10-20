import manifest from "./crypto-capabilities.json" with { type: "json" };

export const SUPPORT_LEVELS = Object.freeze({
  recommended: { zh: "推荐默认", en: "Recommended" },
  supported: { zh: "完整支持", en: "Supported" },
  compatibility: { zh: "兼容模式", en: "Compatibility" },
  verification: { zh: "仅校验 / 强警告", en: "Verification only / warning" },
});

export const CRYPTO_CAPABILITIES = Object.freeze(Object.fromEntries(manifest.capabilities.map((item) => [item.capabilityId, Object.freeze({ ...item, id: item.capabilityId, tags: Object.freeze(item.tags || []), operations: Object.freeze(item.operations || []) })])));
export const CRYPTO_KEY_TYPES = Object.freeze(Object.fromEntries(Object.entries(manifest.keyTypes || {}).map(([id, item]) => [id, Object.freeze({ ...item, capabilities: Object.freeze(item.capabilities || []) })])));

export function cryptoCapability(id) {
  return CRYPTO_CAPABILITIES[id] || null;
}

export function capabilityOptions(ids) {
  return ids.map((id) => CRYPTO_CAPABILITIES[id]).filter(Boolean).map((item) => ({
    value: item.id,
    label: item.standardName,
    supportLevel: item.supportLevel,
  }));
}

export function parameterSupportLevel(capabilityId, parameter, value) {
  return cryptoCapability(capabilityId)?.parameters?.[parameter]?.supportLevels?.[value] || null;
}

export function hasParameterSupportLevels(capabilityId) {
  const parameters = cryptoCapability(capabilityId)?.parameters || {};
  return Object.values(parameters).some((item) => item?.supportLevels && Object.keys(item.supportLevels).length > 0);
}

export const MODERN_AEAD_BY_TOOL = Object.freeze({
  "chacha20-poly1305": "chacha20-poly1305",
  "xchacha20-poly1305": "xchacha20-poly1305",
  "aes-gcm-siv": "aes-256-gcm-siv",
  "aes-siv": "aes-256-siv",
  "aes-ccm": "aes-256-ccm",
});

export const KDF_BY_TOOL = Object.freeze({
  "argon2id-kdf": "argon2id",
  "scrypt-kdf": "scrypt",
  "pbkdf2-kdf": "pbkdf2-sha256",
  hkdf: "hkdf-sha256",
});

export const SIGNATURE_BY_TOOL = Object.freeze({
  "rsa-pss-signature": "rsa-pss-sha256",
  "rsa-pkcs1-signature": "rsa-pkcs1-sha256",
  "sm2-sm3-signature": "sm2-sm3",
});

export const AES_MAC_BY_TOOL = Object.freeze({
  "aes-cmac": "aes-cmac",
  "aes-128-gmac": "aes-128-gmac",
  "aes-256-gmac": "aes-256-gmac",
});

export function supportLabel(level, locale = "zh-CN") {
  const item = SUPPORT_LEVELS[level] || SUPPORT_LEVELS.supported;
  return locale.startsWith("zh") ? item.zh : item.en;
}
