import { CATEGORY_ORDER } from "./catalog.js";
import { categories } from "./i18n.js";

const names = {
  common: {
    az: "Məlumatların şifrələnməsi", en: "Data encryption", es: "Cifrado de datos", it: "Cifratura dei dati",
    ja: "データ暗号", ko: "데이터 암호화", "pt-BR": "Criptografia de dados", tr: "Veri şifreleme",
    "zh-CN": "通用加解密", "zh-TW": "通用加解密",
  },
  aead: {
    az: "Autentifikasiyalı şifrələmə", en: "Authenticated encryption", es: "Cifrado autenticado", it: "Crittografia autenticata",
    ja: "認証付き暗号", ko: "인증 암호화", "pt-BR": "Criptografia autenticada", tr: "Kimlik doğrulamalı şifreleme",
    "zh-CN": "认证加密", "zh-TW": "認證加密",
  },
  signatures: {
    az: "Rəqəmsal imzalar", en: "Digital signatures", es: "Firmas digitales", it: "Firme digitali",
    ja: "デジタル署名", ko: "디지털 서명", "pt-BR": "Assinaturas digitais", tr: "Dijital imzalar",
    "zh-CN": "数字签名", "zh-TW": "數位簽章",
  },
  integrity: {
    az: "Xülasə və mesaj autentifikasiyası", en: "Digests & message authentication", es: "Resúmenes y autenticación de mensajes", it: "Digest e autenticazione dei messaggi",
    ja: "ダイジェスト・メッセージ認証", ko: "다이제스트 및 메시지 인증", "pt-BR": "Resumos e autenticação de mensagens", tr: "Özetler ve ileti kimlik doğrulaması",
    "zh-CN": "摘要与消息认证", "zh-TW": "摘要與訊息認證",
  },
  derivation: {
    az: "Açar törətmə və kapsullaşdırma", en: "Key derivation & encapsulation", es: "Derivación y encapsulación de claves", it: "Derivazione e incapsulamento delle chiavi",
    ja: "鍵導出・カプセル化", ko: "키 파생 및 캡슐화", "pt-BR": "Derivação e encapsulamento de chaves", tr: "Anahtar türetme ve kapsülleme",
    "zh-CN": "密钥派生与封装", "zh-TW": "金鑰派生與封裝",
  },
  specialized: {
    az: "Xüsusi şifrələmə", en: "Specialized encryption", es: "Cifrado especializado", it: "Cifratura specializzata",
    ja: "特殊用途暗号", ko: "특수 암호화", "pt-BR": "Criptografia especializada", tr: "Özel amaçlı şifreleme",
    "zh-CN": "专用加密", "zh-TW": "專用加密",
  },
  keys: {
    az: "Açarlar və sertifikatlar", en: "Keys & certificates", es: "Claves y certificados", it: "Chiavi e certificati",
    ja: "鍵・証明書", ko: "키 및 인증서", "pt-BR": "Chaves e certificados", tr: "Anahtarlar ve sertifikalar",
    "zh-CN": "密钥与凭证", "zh-TW": "金鑰與憑證",
  },
};

const otherName = Object.freeze({
  az: "Digər", en: "Other", es: "Otros", it: "Altro", ja: "その他", ko: "기타",
  "pt-BR": "Outros", tr: "Diğer", "zh-CN": "其他", "zh-TW": "其他",
});

export const SECURITY_TOOL_GROUPS = Object.freeze([
  Object.freeze({ id: "common", name: Object.freeze(names.common), toolIds: Object.freeze(["aes", "sm4", "rsa-oaep", "rsa-pkcs1", "sm2"]) }),
  Object.freeze({ id: "aead", name: Object.freeze(names.aead), toolIds: Object.freeze(["chacha20-poly1305", "xchacha20-poly1305", "aes-gcm-siv", "aes-siv", "aes-ccm"]) }),
  Object.freeze({ id: "signatures", name: Object.freeze(names.signatures), toolIds: Object.freeze(["rsa-pss-signature", "rsa-pkcs1-signature", "sm2-sm3-signature"]) }),
  Object.freeze({ id: "integrity", name: Object.freeze(names.integrity), toolIds: Object.freeze(["hash", "hmac-sha256", "aes-cmac", "aes-128-gmac", "aes-256-gmac", "jwt", "totp"]) }),
  Object.freeze({ id: "derivation", name: Object.freeze(names.derivation), toolIds: Object.freeze(["argon2id-kdf", "scrypt-kdf", "pbkdf2-kdf", "hkdf", "key-wrap", "hpke", "ml-kem"]) }),
  Object.freeze({ id: "specialized", name: Object.freeze(names.specialized), toolIds: Object.freeze(["storage-crypto", "format-preserving"]) }),
  Object.freeze({ id: "keys", name: Object.freeze(names.keys), toolIds: Object.freeze(["symmetric-key-generator", "rsa-key-generator", "sm2-key-generator", "cert", "jwk"]) }),
]);

export const CATALOG_TOOL_GROUPS = Object.freeze({
  security: SECURITY_TOOL_GROUPS,
});

export function buildCatalogSections(items, category, query = "") {
  if (query.trim()) return null;

  if (category === "all") {
    return CATEGORY_ORDER.map((categoryId) => ({
      id: categoryId,
      kind: "category",
      category: categoryId,
      name: categories[categoryId],
      tools: items.filter((item) => item.category === categoryId),
    })).filter((section) => section.tools.length);
  }

  const configuredGroups = CATALOG_TOOL_GROUPS[category];
  if (!configuredGroups) return null;

  const byId = new Map(items.map((item) => [item.id, item]));
  const assigned = new Set();
  const groups = configuredGroups.map((group) => {
    const tools = group.toolIds.flatMap((id) => {
      const tool = byId.get(id);
      if (!tool || assigned.has(id)) return [];
      assigned.add(id);
      return [tool];
    });
    return { ...group, kind: "subgroup", category, tools };
  }).filter((group) => group.tools.length);
  const ungrouped = items.filter((item) => !assigned.has(item.id));
  return ungrouped.length
    ? [...groups, { id: "other", kind: "subgroup", category, name: otherName, tools: ungrouped }]
    : groups;
}

export const groupedCatalogTools = buildCatalogSections;
