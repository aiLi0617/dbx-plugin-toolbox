// Default display order = array order. Keep categories contiguous and put
 // highest-frequency tools first within each category.
// Row: [id, category, zh-CN, zh-TW, en, view, aliases?]
import { L } from "./locale.js";

const rows = [
  // —— 数据与代码 ——
  ["json", "format", "JSON 工作台", "JSON 工作台", "JSON workbench", "json-workbench", [
    "json-convert", "json-yaml", "json-csv", "json-xml", "json-toml", "json-sql", "json-ts", "jsonpath",
    "yaml", "csv", "xml", "toml", "sql", "typescript", "python", "go", "java",
    "format", "minify", "validate", "tree", "unicode", "escape", "sort", "extract",
    "格式化", "压缩", "校验", "树形", "路径提取", "JSONPath", "转 TypeScript", "转 SQL",
  ]],
  ["data-convert", "format", "数据格式转换", "資料格式轉換", "Data format convert", "data-convert", [
    "json-convert", "yaml", "csv", "tsv", "ndjson", "xml", "toml", "json",
    "yaml-json", "csv-json", "xml-json", "toml-json",
    "数据转换", "格式互转", "双向转换", "convert format",
  ]],
  ["code-format", "format", "代码格式化", "程式碼格式化", "Code formatter", "code-format", [
    "sql", "xml", "yaml", "html", "css", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "beautify", "prettier", "格式化代码", "美化", "validate",
  ]],
  ["spreadsheet", "format", "电子表格", "電子表格", "Spreadsheet", "spreadsheet", [
    "xlsx", "excel", "csv", "tsv", "表格", "表格编辑", "excel转json", "json转excel", "工作表", "sheet",
  ]],

  // —— 编码转义 ——
  ["base64", "encode", "Base / Hex", "Base / Hex", "Base / Hex", "base64", [
    "base32", "base58", "hex", "base64", "base 64", "十六进制", "编码", "解码",
  ]],
  ["url", "encode", "URL 编解码", "URL 編解碼", "URL encode", "url", [
    "url编码", "url解码", "encodeuri", "decodeuri", "encodeuriComponent",
    "query string", "查询参数", "百分号编码", "percent encode",
  ]],
  ["html-entities", "encode", "字符转义", "字元轉義", "Character escape", "html-entities", [
    "unicode", "html-entities", "html实体", "json escape", "js escape", "css escape",
    "转义", "实体", "\\u", "实体编码",
  ]],
  ["sql-escape", "encode", "SQL 转义", "SQL 轉義", "SQL escape", "live-io", [
    "sql", "in", "quote", "sql字符串", "sql转义", "拼sql",
  ]],
  ["data-uri", "encode", "Data URI", "Data URI", "Data URI", "data-uri", [
    "dataurl", "data url", "内联资源", "base64图片",
  ]],
  ["punycode", "encode", "Punycode / IDN", "Punycode / IDN", "Punycode / IDN", "punycode", [
    "idn", "国际化域名", "中文域名", "xn--", "域名编码",
  ]],
  ["quoted-printable", "encode", "Quoted-Printable", "Quoted-Printable", "Quoted-Printable", "live-io", [
    "qp", "邮件编码", "mime编码",
  ]],

  // —— 转换计算 ——
  ["timestamp", "convert", "时间戳", "時間戳", "Timestamp", "time-convert", [
    "duration", "unix", "timestamp", "time", "beijing", "epoch",
    "时间戳转换", "北京时间", "时间差", "时长", "utc",
  ]],
  ["color", "convert", "颜色转换", "顏色轉換", "Color convert", "color-convert", [
    "hex", "rgb", "hsl", "hsv", "cmyk", "colour", "eyedropper", "picker",
    "取色", "色环", "颜色",
  ]],
  ["cron", "convert", "Cron 表达式", "Cron 運算式", "Cron expression", "cron", [
    "crontab", "cron表达式", "定时任务", "计划任务", "schedule", "quartz", "spring cron",
  ]],
  ["base-convert", "convert", "进制转换", "進制轉換", "Number base", "base-convert", [
    "binary", "octal", "decimal", "hex", "radix", "二进", "八进", "十进", "十六进", "进制",
  ]],
  ["network-calc", "convert", "网络 / CIDR", "網路 / CIDR", "Network / CIDR", "network-calc", [
    "ip", "ipv4", "ipv6", "cidr", "子网", "子网切分", "子网掩码", "广播地址",
    "网络地址", "ip转整数", "网段", "subnet",
  ]],

  // —— 文本工具 ——
  ["whitespace", "text", "文本处理", "文字處理", "Text tools", "whitespace", [
    "空白与行", "查找替换", "全半角", "去重", "排序", "前缀", "后缀", "去空行",
    "大小写", "命名", "序号", "流水号", "随机打乱", "按列截取", "长度过滤",
    "case", "naming", "字数统计", "stats", "word count", "slugify",
    "去 HTML 标签", "strip-html", "trim", "unique", "sort", "replace",
    "camel", "snake", "kebab", "文本清理",
  ]],
  ["regex", "text", "正则测试", "正規測試", "Regex tester", "regex", [
    "正则", "正则表达式", "regexp", "pattern", "正则匹配", "正则替换",
  ]],
  ["diff", "text", "文本对比", "文字對比", "Text diff", "diff", [
    "diff", "对比", "差异", "compare", "文本差异",
  ]],
  ["markdown", "text", "Markdown", "Markdown", "Markdown", "markdown", [
    "md", "markdown预览", "markdown渲染", "预览markdown",
  ]],
  ["unicode-inspect", "text", "Unicode 检查", "Unicode 檢查", "Unicode inspector", "unicode-inspect", [
    "码位", "code point", "codepoints", "字符检查", "emoji", "unicode",
  ]],

  // —— 安全加密 ——
  ["hash", "security", "哈希校验", "雜湊校驗", "Hash & checksum", "hash", [
    "hash", "md5", "sha", "sha1", "sha256", "sha384", "sha512", "sm3", "crc32",
    "checksum", "摘要", "哈希", "校验和",
  ]],
  ["jwt", "security", "JWT", "JWT", "JWT", "jwt", [
    "验签", "decode token", "json web token", "令牌", "签发", "jwt解码", "jwt验签", "jwt签发",
  ]],
  ["aes", "security", "对称加密", "對稱加密", "Symmetric cipher", "aes", [
    "sm4", "aes", "gcm", "cbc", "ecb", "iv", "nonce", "aad", "对称", "加解密",
  ]],
  ["hmac-sha256", "security", "HMAC", "HMAC", "HMAC", "hmac", [
    "hmac-sm3", "hmac", "hmac-sha1", "hmac-sha384", "hmac-sha512", "消息认证",
  ]],
  ["rsa", "security", "非对称加密", "非對稱加密", "Asymmetric cipher", "rsa", [
    "sm2", "rsa", "oaep", "pkcs1", "非对称", "公钥加密",
  ]],
  ["totp", "security", "TOTP", "TOTP", "TOTP", "totp", [
    "otp", "otpauth", "双因素", "二步验证", "动态口令", "验证码", "2fa", "mfa",
  ]],
  ["cert", "security", "证书与 SSH", "憑證與 SSH", "Certificate & SSH", "cert", [
    "ssh-fingerprint", "x509", "pem", "证书", "指纹", "ssh公钥", "certificate", "san",
  ]],
  ["jwk", "security", "JWK / JWKS", "JWK / JWKS", "JWK / JWKS", "jwk", [
    "jwk", "jwks", "json web key", "JSON Web Key", "jwk转pem", "pem转jwk",
  ]],
  ["symmetric-key", "security", "对称密钥", "對稱金鑰", "Symmetric key", "symmetric-key", [
    "aes-key", "hmac-key", "生成密钥", "密钥生成", "随机密钥",
  ]],
  ["key-pair", "security", "密钥对", "金鑰對", "Key pair", "keypair", [
    "keypair", "rsa", "sm2", "生成密钥对", "公私钥", "公钥", "私钥",
  ]],
  ["xor", "security", "XOR（调试）", "XOR（除錯）", "XOR (debug)", "xor", [
    "异或", "xor加密", "debug xor",
  ]],

  // —— 生成器 ——
  ["uuid", "generate", "唯一 ID", "唯一 ID", "Unique ID", "unique-id", [
    "ulid", "nanoid", "uuid", "guid", "唯一标识", "生成id", "生成uuid",
  ]],
  ["password", "generate", "随机密码", "隨機密碼", "Random password", "password", [
    "random-bytes", "密码生成", "随机字节", "强密码", "password generator",
  ]],
  ["qrcode", "generate", "二维码 / 条码", "二維碼 / 條碼", "QR & barcodes", "qrcode", [
    "qr", "barcode", "汉信", "pdf417", "data matrix", "svg",
    "批量识别", "扫码", "生成二维码", "识别二维码",
  ]],
  ["lorem", "generate", "重复文本", "重複文字", "Repeated text", "lorem", [
    "ipsum", "placeholder", "dbx", "推广文案", "自定义内容", "占位文本", "lorem ipsum",
  ]],

  // —— 图片 ——
  ["image-process", "image", "图片处理", "圖片處理", "Image editor", "image-process", [
    "图片压缩", "裁剪", "缩放", "旋转", "翻转", "水印", "格式转换",
    "jpeg", "png", "webp", "jpg", "图片编辑", "compress image",
  ]],
  ["image-generate", "image", "占位图", "佔位圖", "Placeholder image", "image-generate", [
    "占位图", "指定大小", "文件大小", "placeholder", "dummy image", "generate image", "假图",
  ]],
];

export const TOOL_DEFS = rows.map(([id, category, zhCN, zhTW, en, view, aliases]) => ({
  id,
  category,
  name: L(en, zhCN, zhTW, en, en, en, en),
  view,
  ...(aliases ? { aliases } : {}),
}));
