import { TEXT_ACTIONS, textActionForQuery } from "./textActions.js";

function labelFrom(options, fallback = "") {
  const parts = Object.values(options || {}).filter(Boolean);
  return parts.length ? parts.join(" → ") : fallback;
}

function textActionMatch(q) {
  const exact = TEXT_ACTIONS.find((item) =>
    [item.id, item.zh, item.en, ...item.aliases].some((value) => value.toLowerCase() === q));
  if (exact) return exact;
  return TEXT_ACTIONS.find((item) =>
    [item.id, item.zh, item.en, ...item.aliases].some((value) => value.toLowerCase().includes(q))) || null;
}

/** Option parsers — preserve previous toolOptionsForQuery behavior. */
function optionsUuid(q) {
  const kind = ["ulid", "nanoid", "uuid"].find((value) => q.includes(value));
  return kind ? { kind } : {};
}

function optionsPassword(q) {
  return /bytes|字节/.test(q) ? { kind: "bytes" } : {};
}

function optionsAes(q) {
  const options = {};
  if (/sm4/.test(q)) options.algorithm = "sm4-128";
  else if (/aes.?128/.test(q)) options.algorithm = "aes-128";
  else if (/aes/.test(q)) options.algorithm = "aes-256";
  if (/cbc/.test(q)) options.mode = "cbc";
  else if (/gcm/.test(q)) options.mode = "gcm";
  else if (/ecb/.test(q)) options.mode = "ecb";
  if (/解密|decrypt/.test(q)) options.op = "decrypt";
  return options;
}

function optionsRsa(q) {
  return /sm2/.test(q) ? { algorithm: "sm2" } : {};
}

function optionsHmac(q) {
  if (/sm3/.test(q)) return { algorithm: "hmac-sm3" };
  if (/sha.?1\b|sha1/.test(q)) return { algorithm: "hmac-sha1" };
  if (/sha.?384|sha384/.test(q)) return { algorithm: "hmac-sha384" };
  if (/sha.?512|sha512/.test(q)) return { algorithm: "hmac-sha512" };
  if (/sha.?256|sha256/.test(q)) return { algorithm: "hmac-sha256" };
  return {};
}

function optionsCodeFormat(q) {
  const languages = [
    ["typescript", "typescript"], ["javascript", "javascript"], ["tsx", "typescript"], ["jsx", "javascript"],
    ["ts", "typescript"], ["js", "javascript"], ["sql", "sql"], ["xml", "xml"], ["yaml", "yaml"],
    ["html", "html"], ["css", "css"],
  ];
  const tokens = q.split(/[^a-z]+/);
  const match = languages.find(([name]) => tokens.includes(name));
  return match ? { language: match[1] } : {};
}

function optionsDataConvert(q) {
  const formats = q.match(/ndjson|tsv|json|yaml|csv|xml|toml/g) || [];
  if (formats.length > 1) return { from: formats[0], to: formats[1] };
  if (formats.length === 1 && formats[0] !== "json") return { from: formats[0], to: "json" };
  return {};
}

function optionsJson(q) {
  return /jsonpath|路径提取|extract/.test(q) ? { mode: "extract" } : {};
}

function optionsTimestamp(q) {
  if (/duration|difference|时间差|时长/.test(q)) return { action: "difference" };
  if (/加减|加天|arithmetic/.test(q)) return { action: "arithmetic" };
  if (/utc/.test(q)) return { timezone: "UTC" };
  return {};
}

function optionsHash(q) {
  if (/\bmd5\b/.test(q)) return { algorithm: "md5" };
  if (/sha.?512|sha512/.test(q)) return { algorithm: "sha512" };
  if (/sha.?384|sha384/.test(q)) return { algorithm: "sha384" };
  if (/sha.?256|sha256/.test(q)) return { algorithm: "sha256" };
  if (/sha.?1\b|sha1/.test(q)) return { algorithm: "sha1" };
  if (/\bsm3\b/.test(q)) return { algorithm: "sm3" };
  if (/crc32/.test(q)) return { algorithm: "crc32" };
  return {};
}

function optionsBase64(q) {
  const options = {};
  if (/base32/.test(q)) options.format = "base32";
  else if (/base58/.test(q)) options.format = "base58";
  else if (/\bhex\b|十六进制/.test(q)) options.format = "hex";
  else if (/base64|base\s*64/.test(q)) options.format = "base64";
  if (!options.format) return {};
  if (/解码|decode/.test(q)) options.op = "decode";
  else if (/编码|encode/.test(q)) options.op = "encode";
  return options;
}

function optionsJwt(q) {
  if (/验签|(?:jwt|token|令牌).{0,8}verify|verify.{0,8}(?:jwt|token|令牌)/.test(q)) return { mode: "verify" };
  if (/(?:jwt|token|令牌).{0,8}(?:sign|签发)|(?:sign|签发).{0,8}(?:jwt|token|令牌)/.test(q)) return { mode: "sign" };
  if (/decode\s*token|token\s*decode|jwt\s*decode|解码.*(?:jwt|token|令牌)|(?:jwt|token|令牌).*解码/.test(q)) {
    return { mode: "decode" };
  }
  return {};
}

function optionsQr(q) {
  if (/识别|扫码|decode|scan|read/.test(q) && /二维码|qr|barcode|条码|汉信|pdf417|datamatrix/.test(q)) {
    return { mode: "decode" };
  }
  if (/生成|encode|create/.test(q) && /二维码|qr|barcode|条码/.test(q)) return { mode: "encode" };
  return {};
}

function optionsUrl(q) {
  if (/query\s*string|查询参数|url\s*query/.test(q)) return { mode: "query" };
  if (/url.*解码|解码.*url|url\s*decode|decode\s*url/.test(q)) return { mode: "decode" };
  if (/url.*编码|编码.*url|url\s*encode|encode\s*url|百分号编码|percent\s*encod/.test(q)) return { mode: "encode" };
  return {};
}

function optionsImage(q) {
  if (/裁剪|crop/.test(q)) return { op: "crop" };
  if (/缩放|resize/.test(q)) return { op: "resize" };
  if (/旋转|rotate/.test(q)) return { op: "rotate" };
  if (/翻转|flip/.test(q)) return { op: "flip" };
  if (/水印|watermark/.test(q)) return { op: "watermark" };
  if (/图片压缩|压缩图片|compress\s*image|image\s*compress/.test(q)) return { op: "compress" };
  return {};
}

function optionsColor(q) {
  if (/取色|eyedropper|color\s*picker|色环/.test(q)) return { mode: "picker" };
  return {};
}

const OPTION_PARSERS = {
  uuid: optionsUuid,
  password: optionsPassword,
  aes: optionsAes,
  rsa: optionsRsa,
  "hmac-sha256": optionsHmac,
  "code-format": optionsCodeFormat,
  "data-convert": optionsDataConvert,
  json: optionsJson,
  timestamp: optionsTimestamp,
  hash: optionsHash,
  base64: optionsBase64,
  jwt: optionsJwt,
  qrcode: optionsQr,
  url: optionsUrl,
  "image-process": optionsImage,
  color: optionsColor,
};

function push(out, toolId, options, label, priority) {
  out.push({ toolId, options: options || {}, label: label || "", priority });
}

/**
 * Resolve search / navigation intents from a free-text query.
 * Returns zero or more { toolId, options, label, priority } hits, highest priority first.
 */
export function resolveIntent(query = "") {
  const q = String(query).trim().toLowerCase();
  if (!q) return [];
  const out = [];

  const ws = textActionMatch(q);
  if (ws) push(out, "whitespace", { action: ws.id }, ws.id, 12);

  const uuid = optionsUuid(q);
  if (Object.keys(uuid).length) push(out, "uuid", uuid, labelFrom(uuid), 12);
  else if (/唯一\s*id|生成\s*(?:uuid|id|guid)|uuid\s*生成|guid/.test(q)) {
    push(out, "uuid", {}, "", 10);
  }

  const password = optionsPassword(q);
  if (Object.keys(password).length) push(out, "password", password, labelFrom(password), 11);
  else if (/随机密码|密码生成|生成密码|强密码|password\s*generat/.test(q)) {
    push(out, "password", {}, "", 10);
  }

  const aes = optionsAes(q);
  if (aes.algorithm || aes.mode || /sm4|aes|对称加密|对称加解密/.test(q)) {
    push(out, "aes", aes, labelFrom(aes), 12);
  } else if (/^(?:加密|解密|encrypt|decrypt)$/.test(q)) {
    push(out, "aes", /解密|decrypt/.test(q) ? { op: "decrypt" } : {}, labelFrom({ op: /解密|decrypt/.test(q) ? "decrypt" : "" }), 9);
  }

  const rsa = optionsRsa(q);
  if (Object.keys(rsa).length || /非对称|\brsa\b|公钥加密|sm2\s*加密/.test(q)) {
    push(out, "rsa", rsa, labelFrom(rsa), Object.keys(rsa).length ? 12 : 8);
  }

  if (/\bhmac\b|hmac-|消息认证/.test(q)) {
    const hmac = optionsHmac(q);
    push(out, "hmac-sha256", hmac, labelFrom(hmac), Object.keys(hmac).length ? 12 : 8);
  }

  const code = optionsCodeFormat(q);
  if (Object.keys(code).length) push(out, "code-format", code, labelFrom(code), 11);
  else if (/代码格式化|beautify|prettier|格式化\s*(?:sql|xml|yaml|html|css|js|ts)/.test(q)) {
    push(out, "code-format", {}, "", 8);
  }

  const convert = optionsDataConvert(q);
  if (Object.keys(convert).length) push(out, "data-convert", convert, labelFrom(convert), 12);
  else if (/数据格式|格式转换|双向转换|格式互转/.test(q)) {
    push(out, "data-convert", {}, "", 8);
  }

  const json = optionsJson(q);
  if (Object.keys(json).length) push(out, "json", json, labelFrom(json), 12);
  else if (/格式化\s*json|json\s*格式化|json\s*压缩|json\s*校验|minify\s*json|validate\s*json/.test(q)) {
    push(out, "json", {}, "", 11);
  }

  const time = optionsTimestamp(q);
  if (Object.keys(time).length) push(out, "timestamp", time, labelFrom(time), 12);
  else if (/时间戳|timestamp|unix\s*time|epoch|北京时间/.test(q)) {
    push(out, "timestamp", {}, "", 8);
  }

  // Hash: prefer over hmac for bare digest names
  if (!/\bhmac\b|hmac-/.test(q)) {
    const hash = optionsHash(q);
    if (Object.keys(hash).length) push(out, "hash", hash, labelFrom(hash), 11);
    else if (/哈希|checksum|摘要|校验和/.test(q)) push(out, "hash", {}, "", 8);
  } else {
    const hash = optionsHash(q);
    if (Object.keys(hash).length && /哈希|checksum|摘要|hash\b/.test(q)) {
      push(out, "hash", hash, labelFrom(hash), 9);
    }
  }

  // Special case: toolOptionsForQuery("hmac-sha256", "sm3") — also surface hmac when query is bare sm3
  if (/^sm3$/.test(q) || (/\bsm3\b/.test(q) && !/\bhmac\b|hmac-|hash|哈希|sha|md5|crc/.test(q))) {
    if (!out.some((item) => item.toolId === "hmac-sha256")) {
      push(out, "hmac-sha256", { algorithm: "hmac-sm3" }, "hmac-sm3", 10);
    }
  }

  const base = optionsBase64(q);
  if (Object.keys(base).length) push(out, "base64", base, labelFrom(base), 11);
  else if (/^编码$|^解码$|base\s*编码|hex\s*编码/.test(q)) {
    push(out, "base64", {}, "", 7);
  }

  const jwt = optionsJwt(q);
  if (Object.keys(jwt).length) push(out, "jwt", jwt, labelFrom(jwt), 13);
  else if (/验签/.test(q)) push(out, "jwt", { mode: "verify" }, "verify", 13);
  else if (/\bjwt\b|json\s*web\s*token/.test(q)) push(out, "jwt", {}, "", 9);

  const qr = optionsQr(q);
  if (Object.keys(qr).length) push(out, "qrcode", qr, labelFrom(qr), 12);
  else if (/二维码|qr\s*code|\bqrcode\b|条码|barcode|汉信|pdf417|data\s*matrix/.test(q)) {
    push(out, "qrcode", {}, "", 9);
  }

  const url = optionsUrl(q);
  if (Object.keys(url).length) push(out, "url", url, labelFrom(url), 12);
  else if (/\burl\b/.test(q)) push(out, "url", {}, "", 8);

  if (/正则|regex|regexp/.test(q)) push(out, "regex", {}, "", 10);

  if (/crontab|cron\s*表达|cron\s*expr|定时任务|计划任务|\bcron\b|quartz/.test(q)) {
    push(out, "cron", {}, "", 10);
  }

  const color = optionsColor(q);
  if (Object.keys(color).length) push(out, "color", color, labelFrom(color), 11);
  else if (/\brgb\b|\bcmyk\b|\bhsv\b|\bhsl\b|颜色转换|颜色/.test(q) && !/图片|image/.test(q)) {
    push(out, "color", {}, "", 9);
  }

  const image = optionsImage(q);
  if (Object.keys(image).length) push(out, "image-process", image, labelFrom(image), 11);
  else if (/图片处理|图片编辑|image\s*edit|图片格式/.test(q)) {
    push(out, "image-process", {}, "", 9);
  }
  if (/占位图|placeholder\s*image|dummy\s*image|假图/.test(q)) {
    push(out, "image-generate", {}, "", 10);
  }

  if (/punycode|国际化域名|\bidn\b|中文域名/.test(q)) {
    push(out, "punycode", {}, "", 10);
  }

  if (/文本对比|对比文本|文本\s*diff|\bdiff\b|文本差异/.test(q)) {
    push(out, "diff", {}, "", 10);
  }

  if (/markdown|md\s*预览|预览\s*md|预览\s*markdown/.test(q)) {
    push(out, "markdown", {}, "", 10);
  }

  if (/电子表格|\bexcel\b|\bxlsx\b|表格编辑|spreadsheet/.test(q)) {
    push(out, "spreadsheet", {}, "", 10);
  }

  if (/证书|x509|ssh\s*指纹|ssh\s*公钥|certificate|\bsan\b/.test(q)) {
    push(out, "cert", {}, "", 10);
  }

  if (/\bjwk\b|\bjwks\b|json\s*web\s*key/.test(q)) {
    push(out, "jwk", {}, "", 10);
  }

  if (/密钥对|生成密钥对|key\s*pair|keypair|公私钥/.test(q)) {
    push(out, "key-pair", {}, "", 10);
  }

  if (/对称密钥|生成密钥|aes\s*key|hmac\s*key|随机密钥/.test(q) && !/密钥对|key\s*pair|keypair/.test(q)) {
    push(out, "symmetric-key", {}, "", 9);
  }

  if (/\btotp\b|otpauth|双因素|二步验证|动态口令|2fa|mfa/.test(q)) {
    push(out, "totp", {}, "", 10);
  }

  if (/网段|子网|cidr|\bipv[46]\b|子网掩码|广播地址/.test(q)) {
    push(out, "network-calc", {}, "", 10);
  }

  if (/进制转换|进制|\bradix\b|二进|八进|十进制转|十六进制转/.test(q) && !/base64|base32|base58/.test(q)) {
    push(out, "base-convert", {}, "", 9);
  }

  if (/data\s*uri|data\s*url|内联资源/.test(q)) {
    push(out, "data-uri", {}, "", 10);
  }

  if (/html\s*实体|字符转义|unicode\s*转义|json\s*escape|js\s*escape/.test(q)) {
    push(out, "html-entities", {}, "", 9);
  }

  if (/sql\s*转义|sql\s*字符串|拼\s*sql/.test(q)) {
    push(out, "sql-escape", {}, "", 10);
  }

  if (/quoted.?printable|\bqp\b|邮件编码/.test(q)) {
    push(out, "quoted-printable", {}, "", 10);
  }

  if (/unicode\s*检查|码位|code\s*point/.test(q)) {
    push(out, "unicode-inspect", {}, "", 10);
  }

  if (/重复文本|lorem|占位文本|ipsum/.test(q) && !/占位图|image|图片/.test(q)) {
    push(out, "lorem", {}, "", 9);
  }

  if (/\bxor\b|异或/.test(q)) {
    push(out, "xor", {}, "", 8);
  }

  const seen = new Set();
  return out
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .filter((item) => {
      if (seen.has(item.toolId)) return false;
      seen.add(item.toolId);
      return true;
    });
}

/** Options to apply when opening a known tool from a search query. */
export function optionsForTool(toolId, query = "") {
  const q = String(query).trim().toLowerCase();
  if (!q) return {};
  if (toolId === "whitespace") return { action: textActionForQuery(q) };
  const parser = OPTION_PARSERS[toolId];
  if (parser) {
    const parsed = parser(q);
    if (Object.keys(parsed).length) return parsed;
  }
  const hit = resolveIntent(q).find((item) => item.toolId === toolId);
  return hit?.options || {};
}

/** Short destination label for search result rows. */
export function intentLabelForTool(toolId, query = "") {
  const q = String(query).trim();
  if (!q) return "";
  if (toolId === "whitespace") {
    const match = textActionMatch(q.toLowerCase());
    return match ? match.id : "";
  }
  const options = optionsForTool(toolId, q);
  if (Object.keys(options).length) return labelFrom(options);
  const hit = resolveIntent(q).find((item) => item.toolId === toolId);
  return hit?.label || "";
}
