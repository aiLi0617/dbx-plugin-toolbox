// Default display order = array order. Keep categories contiguous and put
 // highest-frequency tools first within each category.
// Row: [id, category, zh-CN, zh-TW, en, view, aliases?]
import { L } from "./locale.js";
import { EXPANSION_TOOLS } from './expansionTools.js';
import { EXPANSION_NAMES } from './expansionNames.js';
import { presentTool } from './toolPresentation.js';

// The original catalog was bilingual, which made every non-Chinese locale
// silently fall back to English. Keep the compact row format and layer the
// host's other four locales on top of it here.
const LOCALIZED_NAMES = {
  "windows-port": ["Procesos por puerto", "Processi per porta", "ポート別プロセス", "Processos por porta"],
  json: ["Banco de trabajo JSON", "Area di lavoro JSON", "JSON ワークベンチ", "Bancada JSON"],
  "data-convert": ["Conversión de formatos", "Conversione formati", "データ形式変換", "Conversão de formatos"],
  "code-format": ["Formateador de código", "Formattatore di codice", "コードフォーマッター", "Formatador de código"],
  spreadsheet: ["Hoja de cálculo", "Foglio di calcolo", "スプレッドシート", "Planilha"],
  base64: ["Base / Hex", "Base / Hex", "Base / Hex", "Base / Hex"],
  url: ["Codificación URL", "Codifica URL", "URL エンコード", "Codificação de URL"],
  "html-entities": ["Escape de caracteres", "Escape caratteri", "文字エスケープ", "Escape de caracteres"],
  "sql-escape": ["Escape SQL", "Escape SQL", "SQL エスケープ", "Escape SQL"],
  "data-uri": ["URI de datos", "URI dati", "データ URI", "URI de dados"],
  punycode: ["Punycode / IDN", "Punycode / IDN", "Punycode / IDN", "Punycode / IDN"],
  "quoted-printable": ["Quoted-Printable", "Quoted-Printable", "Quoted-Printable", "Quoted-Printable"],
  timestamp: ["Marca de tiempo", "Timestamp", "タイムスタンプ", "Timestamp"],
  color: ["Color y contraste", "Colore e contrasto", "色とコントラスト", "Cor e contraste"],
  cron: ["Expresión Cron", "Espressione Cron", "Cron 式", "Expressão Cron"],
  "base-convert": ["Conversión de bases", "Conversione di base", "進数変換", "Conversão de bases"],
  "network-calc": ["Red / CIDR", "Rete / CIDR", "ネットワーク / CIDR", "Rede / CIDR"],
  whitespace: ["Herramientas de texto", "Strumenti di testo", "テキスト処理", "Ferramentas de texto"],
  gzip: ["Gzip de texto", "Gzip testo", "テキスト Gzip", "Gzip de texto"],
  regex: ["Prueba de expresiones regulares", "Test espressioni regolari", "正規表現テスター", "Teste de expressões regulares"],
  diff: ["Comparación de texto", "Confronto testi", "テキスト比較", "Comparação de texto"],
  markdown: ["Markdown", "Markdown", "Markdown", "Markdown"],
  "unicode-inspect": ["Inspector Unicode", "Analisi Unicode", "Unicode インスペクター", "Inspetor Unicode"],
  hash: ["Hash y suma de verificación", "Hash e checksum", "ハッシュとチェックサム", "Hash e checksum"],
  jwt: ["JWT", "JWT", "JWT", "JWT"],
  aes: ["Cifrado simétrico", "Cifratura simmetrica", "対称暗号", "Criptografia simétrica"],
  "hmac-sha256": ["HMAC", "HMAC", "HMAC", "HMAC"],
  rsa: ["Cifrado asimétrico", "Cifratura asimmetrica", "非対称暗号", "Criptografia assimétrica"],
  sm4: ["Cifrado SM4", "Cifratura SM4", "SM4 暗号", "Criptografia SM4"],
  sm2: ["Cifrado SM2", "Cifratura SM2", "SM2 暗号", "Criptografia SM2"],
  "modern-aead": ["Cifrado autenticado moderno", "Cifratura autenticata moderna", "最新の認証付き暗号", "Criptografia autenticada moderna"],
  kdf: ["Derivación de claves", "Derivazione chiavi", "鍵導出", "Derivação de chaves"],
  signature: ["Firma digital", "Firma digitale", "デジタル署名", "Assinatura digital"],
  "key-wrap": ["Envoltura de claves", "Wrapping delle chiavi", "鍵ラップ", "Encapsulamento de chaves"],
  "storage-crypto": ["Cifrado de almacenamiento", "Cifratura archiviazione", "ストレージ暗号", "Criptografia de armazenamento"],
  "format-preserving": ["Cifrado con formato", "Cifratura formato", "形式保持暗号", "Criptografia com preservação de formato"],
  "aes-mac": ["MAC basado en AES", "MAC basato su AES", "AES ベース MAC", "MAC baseado em AES"],
  hpke: ["Cifrado híbrido HPKE", "Cifratura ibrida HPKE", "HPKE ハイブリッド暗号", "Criptografia híbrida HPKE"],
  "ml-kem": ["Encapsulación poscuántica", "Incapsulamento post-quantum", "耐量子鍵カプセル化", "Encapsulamento pós-quântico"],
  totp: ["TOTP", "TOTP", "TOTP", "TOTP"],
  cert: ["Certificados y SSH", "Certificati e SSH", "証明書と SSH", "Certificados e SSH"],
  jwk: ["JWK / JWKS", "JWK / JWKS", "JWK / JWKS", "JWK / JWKS"],
  "symmetric-key": ["Clave simétrica", "Chiave simmetrica", "対称鍵", "Chave simétrica"],
  "key-pair": ["Par de claves", "Coppia di chiavi", "鍵ペア", "Par de chaves"],
  xor: ["XOR (depuración)", "XOR (debug)", "XOR（デバッグ）", "XOR (depuração)"],
  uuid: ["ID único", "ID univoco", "一意の ID", "ID único"],
  password: ["Contraseña aleatoria", "Password casuale", "ランダムパスワード", "Senha aleatória"],
  "random-bytes": ["Bytes aleatorios", "Byte casuali", "ランダムバイト", "Bytes aleatórios"],
  "http-request": ["cURL a código", "cURL in codice", "cURL からコード", "cURL para código"],
  qrcode: ["QR y códigos de barras", "QR e codici a barre", "QR・バーコード", "QR e códigos de barras"],
  lorem: ["Texto repetido", "Testo ripetuto", "繰り返しテキスト", "Texto repetido"],
  "image-process": ["Editor de imágenes", "Editor immagini", "画像編集", "Editor de imagens"],
  "image-generate": ["Imagen de marcador", "Immagine segnaposto", "プレースホルダー画像", "Imagem de espaço reservado"],
  "md5-collision": ["Colisión MD5", "Collisione MD5", "MD5 衝突チェック", "Colisão MD5"],
  "file-type": ["Identificar formato", "Riconosci formato", "ファイル形式判定", "Identificar formato"],
  "image-utility": ["Utilidades de imagen", "Strumenti immagine", "画像ユーティリティ", "Utilitários de imagem"],
};

const rows = [
  // —— 数据与代码 ——
  ["json", "data", "JSON 工作台", "JSON 工作台", "JSON workbench", "json-workbench", [
    "json-convert", "json-yaml", "json-csv", "json-xml", "json-toml", "json-sql", "json-ts", "jsonpath",
    "yaml", "csv", "xml", "toml", "sql", "typescript", "python", "go", "java",
    "format", "minify", "validate", "tree", "unicode", "escape", "sort", "extract",
    "格式化", "压缩", "校验", "树形", "路径提取", "JSONPath", "转 TypeScript", "转 SQL",
  ]],
  ["data-convert", "data", "数据格式转换", "資料格式轉換", "Data format convert", "data-convert", [
    "json-convert", "yaml", "csv", "tsv", "ndjson", "xml", "toml", "json",
    "yaml-json", "csv-json", "xml-json", "toml-json",
    "数据转换", "格式互转", "双向转换", "convert format",
  ]],
  ["code-format", "data", "代码格式化", "程式碼格式化", "Code formatter", "code-format", [
    "sql", "xml", "yaml", "html", "css", "javascript", "typescript", "js", "ts", "jsx", "tsx",
    "beautify", "prettier", "格式化代码", "美化", "validate",
  ]],
  ["spreadsheet", "data", "电子表格", "電子表格", "Spreadsheet", "spreadsheet", [
    "xlsx", "excel", "csv", "tsv", "表格", "表格编辑", "excel转json", "json转excel", "工作表", "sheet",
  ]],
  ["chart", "data", "图表生成器", "圖表產生器", "Chart generator", "utility-suite", [
    "bar chart", "line chart", "area chart", "pie chart", "柱状图", "折线图", "面积图", "饼图", "svg", "png",
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
  ["timestamp", "calculate", "时间戳", "時間戳", "Timestamp", "time-convert", [
    "duration", "unix", "timestamp", "time", "beijing", "epoch",
    "时间戳转换", "北京时间", "时间差", "时长", "utc",
  ]],
  ["color", "calculate", "颜色与对比度", "顏色與對比度", "Color & contrast", "color-convert", [
    "hex", "rgb", "rgba", "hsl", "hsla", "hsv", "cmyk", "colour", "eyedropper", "picker",
    "wcag", "contrast", "accessibility", "alpha", "取色", "色环", "颜色", "对比度", "無障礙", "无障碍",
  ]],
  ["cron", "calculate", "Cron 表达式", "Cron 運算式", "Cron expression", "cron", [
    "crontab", "cron表达式", "定时任务", "计划任务", "schedule", "quartz", "spring cron",
  ]],
  ["base-convert", "calculate", "进制转换", "進制轉換", "Number base", "base-convert", [
    "binary", "octal", "decimal", "hex", "radix", "二进", "八进", "十进", "十六进", "进制",
  ]],
  ["phone", "calculate", "电话号码解析", "電話號碼解析", "Phone number", "utility-suite", [
    "phone", "e164", "手机号", "国际号码", "号码格式化", "telephone",
  ]],
  ["bandwidth", "calculate", "带宽与传输", "頻寬與傳輸", "Bandwidth calculator", "utility-suite", [
    "bandwidth", "transfer time", "file size", "网速", "文件大小", "传输时间", "mbps",
  ]],
  ["network-calc", "network", "网络 / CIDR", "網路 / CIDR", "Network / CIDR", "network-calc", [
    "ip", "ipv4", "ipv6", "cidr", "子网", "子网切分", "子网掩码", "广播地址",
    "网络地址", "ip转整数", "网段", "subnet",
  ]],

  // —— 文本工具 ——
  ["windows-port", "network", "端口进程", "連接埠程序", "Port processes", "windows-port", [
    "win", "windows", "mac", "macos", "linux", "lsof", "sigterm", "sigkill", "port", "kill", "taskkill", "端口", "端口占用", "杀进程", "结束进程", "释放端口", "pid", "tcp", "udp",
  ]],
  ["user-agent", "network", "User-Agent 解析器", "User-Agent 解析器", "User-Agent parser", "utility-suite", [
    "user agent", "ua", "ua parser", "浏览器解析", "ua解析", "browser", "operating system", "device model",
  ]],
  ["device-info", "network", "设备信息", "裝置資訊", "Device information", "utility-suite", [
    "device info", "client diagnostics", "客户端诊断", "viewport", "screen", "dpr", "hardware",
  ]],
  ["keyboard-event", "network", "键盘事件检查器", "鍵盤事件檢查器", "Keyboard event inspector", "utility-suite", [
    "keyboard event", "keydown", "keyup", "key code", "按键事件", "按键信息", "键码", "修饰键", "keycode", "which",
  ]],

  ["whitespace", "text", "文本处理", "文字處理", "Text tools", "whitespace", [
    "空白与行", "查找替换", "全半角", "去重", "排序", "前缀", "后缀", "去空行",
    "大小写", "命名", "序号", "流水号", "随机打乱", "按列截取", "长度过滤",
    "case", "naming", "字数统计", "stats", "word count", "slugify",
    "去 HTML 标签", "strip-html", "trim", "unique", "sort", "replace",
    "camel", "snake", "kebab", "文本清理",
  ]],
  ["gzip", "text", "文本 Gzip", "文字 Gzip", "Text Gzip", "gzip", [
    "gzip", "gunzip", "gz", "文本压缩", "文本解压", "压缩解压", "gzip base64", "compress text", "decompress text",
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

  // —— 开发辅助 ——
  ["http-request", "developer", "cURL 转代码", "cURL 轉程式碼", "cURL to code", "utility-suite", [
    "curl", "basic auth", "bearer", "request headers", "curl转代码", "请求头", "python requests", "fetch", "httpclient", "okhttp", "reqwest", "net/http",
  ]],
  ["docker-convert", "developer", "Docker Run 与 Compose 互转", "Docker Run 與 Compose 互轉", "Docker Run ↔ Compose", "utility-suite", [
    "docker run", "docker compose", "compose yaml", "容器命令", "docker转换", "docker run 转 compose", "compose 转 docker run",
  ]],
  ["git-reference", "developer", "Git 速查", "Git 速查", "Git reference", "utility-suite", [
    "git cheat sheet", "rebase", "stash", "reflog", "reset", "restore", "branch", "merge", "cherry-pick", "bisect", "worktree", "tag", "fetch", "pull", "push", "git命令", "版本控制",
  ]],
  ["web-meta", "developer", "Web Meta 生成器", "Web Meta 產生器", "Web Meta generator", "utility-suite", [
    "seo", "open graph", "twitter card", "meta tags", "og tags", "网页元信息",
  ]],
  ["html-playground", "developer", "HTML Playground", "HTML Playground", "HTML playground", "utility-suite", [
    "html editor", "css editor", "javascript preview", "网页预览", "前端沙箱", "html可视化",
  ]],

  // —— 安全加密 ——
  ["hash", "security", "哈希校验", "雜湊校驗", "Hash & checksum", "hash", [
    "hash", "md5", "md5 16", "md5 32", "sha", "sha1", "sha224", "sha256", "sha3", "sha384", "sha512", "sm3", "crc32",
    "checksum", "摘要", "哈希", "校验和",
  ]],
  ["file-type", "network", "文件格式识别", "檔案格式識別", "File type identifier", "file-type", [
    "文件类型", "文件识别", "魔数", "magic bytes", "file signature", "mime", "扩展名识别",
  ]],
  ["jwt", "security", "JWT", "JWT", "JWT", "jwt", [
    "验签", "decode token", "json web token", "令牌", "签发", "jwt解码", "jwt验签", "jwt签发",
  ]],
  ["aes", "security", "AES 加密", "AES 加密", "AES cipher", "aes", [
    "aes", "aes-128", "aes-192", "aes-256", "gcm", "cbc", "ctr", "ecb", "iv", "nonce", "aad", "对称", "加解密",
  ], { defaultOptions: { algorithm: "aes-256", mode: "gcm" }, capabilityId: "aes", supportLevel: "recommended" }],
  ["sm4", "security", "SM4 国密加密", "SM4 國密加密", "SM4 cipher", "aes", [
    "sm4", "国密", "國密", "cbc", "ecb", "iv", "对称加密", "sm4加密",
  ], { defaultOptions: { algorithm: "sm4-128", mode: "cbc" }, capabilityId: "sm4", supportLevel: "supported" }],
  ["hmac-sha256", "security", "HMAC", "HMAC", "HMAC", "hmac", [
    "hmac-sm3", "hmac", "hmac-sha1", "hmac-sha384", "hmac-sha512", "消息认证",
  ], { capabilityId: "hmac-sha256", supportLevel: "recommended" }],
  ["rsa-oaep", "security", "RSA-OAEP 加密与解密", "RSA-OAEP 加密與解密", "RSA-OAEP encrypt & decrypt", "rsa", [
    "rsa", "oaep", "oaep-sha1", "oaep-sha256", "oaep-sha384", "oaep-sha512", "公钥加密",
  ], { parentId: "rsa", defaultOptions: { algorithm: "rsa", padding: "oaep", oaepHash: "sha256" }, capabilityId: "rsa-oaep", supportLevel: "recommended", lockOptions: ["algorithm", "padding"] }],
  ["rsa-pkcs1", "security", "RSA-PKCS#1 v1.5 加密与解密", "RSA-PKCS#1 v1.5 加密與解密", "RSA-PKCS#1 v1.5 encrypt & decrypt", "rsa", [
    "rsa", "pkcs1", "pkcs1 v1.5", "兼容加密",
  ], { parentId: "rsa", defaultOptions: { algorithm: "rsa", padding: "pkcs1" }, capabilityId: "rsa-pkcs1", supportLevel: "compatibility", lockOptions: ["algorithm", "padding"] }],
  ["rsa", "security", "RSA 加密", "RSA 加密", "RSA cipher", "rsa", [
    "rsa", "oaep", "oaep-sha1", "oaep-sha256", "oaep-sha384", "oaep-sha512", "pkcs1", "非对称", "公钥加密",
  ], { defaultOptions: { algorithm: "rsa" }, catalogVisible: false }],
  ["sm2", "security", "SM2 国密加密", "SM2 國密加密", "SM2 cipher", "rsa", [
    "sm2", "国密", "國密", "非对称", "公钥加密", "sm2加密",
  ], { defaultOptions: { algorithm: "sm2" }, capabilityId: "sm2", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["chacha20-poly1305", "security", "ChaCha20-Poly1305", "ChaCha20-Poly1305", "ChaCha20-Poly1305", "modern-crypto", ["chacha20", "poly1305", "aead"], { parentId: "modern-aead", defaultOptions: { algorithm: "chacha20-poly1305" }, capabilityId: "chacha20-poly1305", supportLevel: "recommended", lockOptions: ["algorithm"] }],
  ["xchacha20-poly1305", "security", "XChaCha20-Poly1305", "XChaCha20-Poly1305", "XChaCha20-Poly1305", "modern-crypto", ["xchacha20", "poly1305", "aead"], { parentId: "modern-aead", defaultOptions: { algorithm: "xchacha20-poly1305" }, capabilityId: "xchacha20-poly1305", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-gcm-siv", "security", "AES-256-GCM-SIV", "AES-256-GCM-SIV", "AES-256-GCM-SIV", "modern-crypto", ["aes gcm siv", "misuse resistant", "aead"], { parentId: "modern-aead", defaultOptions: { algorithm: "aes-256-gcm-siv" }, capabilityId: "aes-gcm-siv", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-siv", "security", "AES-256-SIV", "AES-256-SIV", "AES-256-SIV", "modern-crypto", ["aes siv", "misuse resistant", "aead"], { parentId: "modern-aead", defaultOptions: { algorithm: "aes-256-siv" }, capabilityId: "aes-siv", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-ccm", "security", "AES-256-CCM", "AES-256-CCM", "AES-256-CCM", "modern-crypto", ["aes ccm", "aead"], { parentId: "modern-aead", defaultOptions: { algorithm: "aes-256-ccm" }, capabilityId: "aes-ccm", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["modern-aead", "security", "现代认证加密", "現代認證加密", "Modern authenticated cipher", "modern-crypto", [
    "chacha20", "poly1305", "xchacha20", "aes-gcm-siv", "aes-ccm", "aes-ctr", "aead", "现代加密", "认证加密",
  ], { catalogVisible: false }],
  ["argon2id-kdf", "security", "Argon2id", "Argon2id", "Argon2id", "modern-crypto", ["argon2", "password kdf", "口令派生"], { parentId: "kdf", defaultOptions: { algorithm: "argon2id" }, capabilityId: "argon2id-kdf", supportLevel: "recommended", lockOptions: ["algorithm"] }],
  ["scrypt-kdf", "security", "scrypt", "scrypt", "scrypt", "modern-crypto", ["scrypt", "password kdf", "口令派生"], { parentId: "kdf", defaultOptions: { algorithm: "scrypt" }, capabilityId: "scrypt-kdf", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["pbkdf2-kdf", "security", "PBKDF2-HMAC-SHA256", "PBKDF2-HMAC-SHA256", "PBKDF2-HMAC-SHA256", "modern-crypto", ["pbkdf2", "sha256", "password kdf"], { parentId: "kdf", defaultOptions: { algorithm: "pbkdf2-sha256" }, capabilityId: "pbkdf2-kdf", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["hkdf", "security", "HKDF-SHA256", "HKDF-SHA256", "HKDF-SHA256", "modern-crypto", ["hkdf", "sha256", "key derivation"], { parentId: "kdf", defaultOptions: { algorithm: "hkdf-sha256" }, capabilityId: "hkdf", supportLevel: "recommended", lockOptions: ["algorithm"] }],
  ["kdf", "security", "密钥派生 KDF", "金鑰派生 KDF", "Key derivation (KDF)", "modern-crypto", [
    "argon2id", "scrypt", "pbkdf2", "hkdf", "password derivation", "密钥派生", "口令派生",
  ], { catalogVisible: false }],
  ["rsa-pss-signature", "security", "RSA-PSS-SHA256 签名与验签", "RSA-PSS-SHA256 簽章與驗證", "RSA-PSS-SHA256 sign & verify", "signature", ["rsa pss", "sha256", "签名", "验签"], { parentId: "signature", defaultOptions: { algorithm: "rsa-pss-sha256" }, capabilityId: "rsa-pss-signature", supportLevel: "recommended", lockOptions: ["algorithm"] }],
  ["rsa-pkcs1-signature", "security", "RSA-PKCS#1 v1.5-SHA256 签名与验签", "RSA-PKCS#1 v1.5-SHA256 簽章與驗證", "RSA-PKCS#1 v1.5-SHA256 sign & verify", "signature", ["rsa pkcs1 signature", "sha256", "兼容签名"], { parentId: "signature", defaultOptions: { algorithm: "rsa-pkcs1-sha256" }, capabilityId: "rsa-pkcs1-signature", supportLevel: "compatibility", lockOptions: ["algorithm"] }],
  ["sm2-sm3-signature", "security", "SM2-SM3 签名与验签", "SM2-SM3 簽章與驗證", "SM2-SM3 sign & verify", "signature", ["sm2", "sm3", "国密签名"], { parentId: "signature", defaultOptions: { algorithm: "sm2-sm3" }, capabilityId: "sm2-sm3-signature", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["signature", "security", "数字签名与验签", "數位簽章與驗證", "Digital signatures", "signature", [
    "rsa-pss", "rsa signature", "sm2 signature", "数字签名", "签名", "验签", "verify signature",
  ], { catalogVisible: false }],
  ["key-wrap", "security", "AES 密钥包装", "AES 金鑰包裝", "AES key wrap", "specialized-crypto", [
    "aes-kw", "aes-kwp", "rfc3394", "rfc5649", "key wrapping", "密钥包装", "kek",
  ], { capabilityId: "key-wrap", supportLevel: "supported" }],
  ["storage-crypto", "security", "AES-XTS 存储加密", "AES-XTS 儲存加密", "AES-XTS storage encryption", "specialized-crypto", [
    "aes-xts", "disk encryption", "sector encryption", "磁盘加密", "扇区加密", "存储加密",
  ], { capabilityId: "storage-crypto", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["format-preserving", "security", "AES-FF1 格式保持加密", "AES-FF1 格式保持加密", "AES-FF1 format-preserving encryption", "specialized-crypto", [
    "aes-ff1", "fpe", "format preserving", "格式保持", "卡号加密", "数字加密",
  ], { capabilityId: "format-preserving", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-cmac", "security", "AES-CMAC", "AES-CMAC", "AES-CMAC", "specialized-crypto", ["cmac", "aes mac"], { parentId: "aes-mac", defaultOptions: { algorithm: "aes-cmac" }, capabilityId: "aes-cmac", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-128-gmac", "security", "AES-128-GMAC", "AES-128-GMAC", "AES-128-GMAC", "specialized-crypto", ["gmac", "aes 128 mac"], { parentId: "aes-mac", defaultOptions: { algorithm: "aes-128-gmac" }, capabilityId: "aes-128-gmac", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-256-gmac", "security", "AES-256-GMAC", "AES-256-GMAC", "AES-256-GMAC", "specialized-crypto", ["gmac", "aes 256 mac"], { parentId: "aes-mac", defaultOptions: { algorithm: "aes-256-gmac" }, capabilityId: "aes-256-gmac", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["aes-mac", "security", "AES-CMAC / GMAC", "AES-CMAC / GMAC", "AES-CMAC / GMAC", "specialized-crypto", [
    "cmac", "gmac", "aes mac", "消息认证", "认证码",
  ], { catalogVisible: false }],
  ["hpke", "security", "HPKE 混合公钥加密", "HPKE 混合公鑰加密", "HPKE hybrid encryption", "kem", [
    "hpke", "rfc9180", "x25519", "hybrid encryption", "混合加密", "公钥加密",
  ], { capabilityId: "hpke", supportLevel: "supported", lockOptions: ["algorithm"] }],
  ["ml-kem", "security", "ML-KEM 后量子密钥封装", "ML-KEM 後量子金鑰封裝", "ML-KEM post-quantum encapsulation", "kem", [
    "ml-kem", "fips203", "post quantum", "pq", "后量子", "密钥封装", "kem768", "kem1024",
  ], { capabilityId: "ml-kem", supportLevel: "supported" }],
  ["totp", "security", "TOTP", "TOTP", "TOTP", "totp", [
    "otp", "otpauth", "双因素", "二步验证", "动态口令", "验证码", "2fa", "mfa",
  ], { capabilityId: "totp", supportLevel: "supported" }],
  ["cert", "security", "证书与 SSH", "憑證與 SSH", "Certificate & SSH", "cert", [
    "ssh-fingerprint", "x509", "pem", "证书", "指纹", "ssh公钥", "certificate", "san",
  ]],
  ["jwk", "security", "JWK / JWKS", "JWK / JWKS", "JWK / JWKS", "jwk", [
    "jwk", "jwks", "json web key", "JSON Web Key", "jwk转pem", "pem转jwk",
  ]],
  ["symmetric-key-generator", "security", "AES / SM4 / HMAC 密钥生成", "AES / SM4 / HMAC 金鑰產生", "AES / SM4 / HMAC key generator", "key-generator", ["aes key", "sm4 key", "hmac key", "对称密钥"], { parentId: "key-generator", defaultOptions: { generator: "symmetric" } }],
  ["rsa-key-generator", "security", "RSA 密钥对生成", "RSA 金鑰對產生", "RSA key-pair generator", "key-generator", ["rsa keypair", "rsa 密钥对"], { parentId: "key-generator", defaultOptions: { generator: "keypair", algorithm: "rsa" }, lockOptions: ["algorithm"] }],
  ["sm2-key-generator", "security", "SM2 国密密钥对生成", "SM2 國密金鑰對產生", "SM2 key-pair generator", "key-generator", ["sm2 keypair", "国密密钥对"], { parentId: "key-generator", defaultOptions: { generator: "keypair", algorithm: "sm2" }, lockOptions: ["algorithm"] }],
  ["key-generator", "security", "密钥生成", "金鑰產生", "Key generator", "key-generator", [
    "aes-key", "hmac-key", "symmetric-key", "key-pair", "keypair", "rsa", "sm2", "生成密钥", "生成密钥对", "公私钥",
  ], { catalogVisible: false }],
  ["xor", "developer", "XOR（调试）", "XOR（除錯）", "XOR (debug)", "xor", [
    "异或", "xor加密", "debug xor",
  ]],

  // —— 生成器 ——
  ["uuid", "generate", "唯一 ID", "唯一 ID", "Unique ID", "unique-id", [
    "ulid", "nanoid", "uuid", "uuid v5", "uuid v7", "guid", "唯一标识", "生成id", "生成uuid",
  ]],
  ["password", "generate", "随机密码", "隨機密碼", "Random password", "password", [
    "密码生成", "强密码", "password generator", "secure password",
  ], { defaultOptions: { kind: "password" } }],
  ["random-bytes", "generate", "随机字节", "隨機位元組", "Random bytes", "password", [
    "安全随机数", "随机十六进制", "random hex", "secure random bytes", "cryptographic random",
  ], { defaultOptions: { kind: "bytes" } }],
  ["qrcode", "generate", "二维码 / 条码", "二維碼 / 條碼", "QR & barcodes", "qrcode", [
    "qr", "barcode", "汉信", "pdf417", "data matrix", "svg",
    "批量识别", "扫码", "生成二维码", "识别二维码",
  ]],
  ["lorem", "generate", "重复文本", "重複文字", "Repeated text", "lorem", [
    "ipsum", "placeholder", "dbx", "推广文案", "自定义内容", "占位文本", "lorem ipsum",
  ]],
  ["fake-data", "generate", "假数据生成", "假資料產生", "Fake data generator", "utility-suite", [
    "mock data", "faker", "csv generator", "测试数据", "虚构数据", "ndjson",
  ]],

  // —— 图片 ——
  ["image-process", "image", "图片编辑", "圖片編輯", "Image editor", "image-process", [
    "图片压缩", "裁剪", "缩放", "旋转", "翻转", "水印", "格式转换",
    "jpeg", "png", "webp", "jpg", "图片编辑", "compress image",
  ]],
  ["image-generate", "image", "占位图", "佔位圖", "Placeholder image", "image-generate", [
    "占位图", "指定大小", "文件大小", "placeholder", "dummy image", "generate image", "假图",
  ]],
  ["image-compress", "image", "图片压缩与格式转换", "圖片壓縮與格式轉換", "Image compress & convert", "image-utility", ["图片压缩", "格式转换", "jpeg", "png", "webp", "ico"]],
  ["image-grid", "image", "图片切图", "圖片切圖", "Image grid slicer", "image-utility", ["九宫格", "宫格切图", "grid slicer", "split image", "切片"]],
  ["image-pixelate", "image", "图片像素化", "圖片像素化", "Image pixelate", "image-utility", ["像素化", "马赛克", "pixelate", "pixel art", "mosaic"]],
  ["image-base64", "image", "图片与 Base64", "圖片與 Base64", "Image & Base64", "image-utility", ["图片base64", "image base64", "data uri", "base64转图片"]],
  ["image-stitch", "image", "图片拼接", "圖片拼接", "Image stitcher", "image-stitch", ["拼图", "合并图片", "横向拼接", "纵向拼接", "image merge"]],
  ["gif-tools", "image", "GIF 动画生成", "GIF 動畫產生", "GIF workbench", "gif-tools", ["gif", "图片转gif", "image sequence", "frames", "animation"]],
  ["image-ocr", "image", "图片 OCR", "圖片 OCR", "Image OCR", "image-ocr", ["ocr", "文字识别", "图片转文字", "tesseract", "中英文识别"]],
];

const utilityRows = [
  ["dotenv", "data", ".env 管理", ".env 管理", ".env manager", "developer-utility", ["environment variables", "dotenv", "env json", "env example", "环境对比"]],
  ["semver", "calculate", "语义版本", "語意版本", "Semantic version", "developer-utility", ["version compare", "version range", "版本比较"]],
  ["chmod", "calculate", "chmod 权限计算", "chmod 權限計算", "chmod calculator", "developer-utility", ["unix permissions", "octal", "rwx"]],
  ["http-status", "network", "HTTP 状态码速查", "HTTP 狀態碼速查", "HTTP status codes", "http-status", ["404", "401", "500", "5xx", "http code", "status code", "状态码", "狀態碼", "teapot"]],
];

const DEMO_VIEWS = new Set(["json-workbench", "whitespace", "gzip", "base64", "code-format", "data-convert", "live-io", "developer-utility"]);
const DEMO_IDS = new Set(["docker-convert", "phone"]);
const NO_DEMO_IDS = new Set(["uuid", "color", "cron", "timestamp", "chmod", "http-status"]);

const BASE_TOOL_DEFS = [...rows, ...utilityRows].map(([id, category, zhCN, zhTW, en, view, aliases, metadata = {}]) => {
  const [es = en, it = en, ja = en, ptBR = en] = LOCALIZED_NAMES[id] || [];
  const supportsDemo = (DEMO_VIEWS.has(view) || DEMO_IDS.has(id)) && !NO_DEMO_IDS.has(id);
  return {
    id,
    category,
    name: L(en, zhCN, zhTW, es, it, ja, ptBR),
    view,
    ...(aliases ? { aliases } : {}),
    kind: metadata.parentId ? "shortcut" : "tool",
    parentId: metadata.parentId || null,
    defaultOptions: metadata.defaultOptions || {},
    catalogVisible: metadata.catalogVisible !== false,
    capabilityId: metadata.capabilityId || null,
    supportLevel: metadata.supportLevel || null,
    lockOptions: metadata.lockOptions || [],
    demoPreset: supportsDemo ? id : null,
    actions: supportsDemo ? ["demo", "reset", "copy", "save", "drop"] : ["reset", "copy", "save", "drop"],
  };
});

const EXPANSION_DEMO_IDS = new Set([
  "basic-auth", "json-diff", "yaml-tree", "safelink", "roman", "mac-generator", "ipv4-range",
  "figlet", "numeronym", "english-plural", "email-normalizer", "url-extractor", "color-palette", "lunar-calendar", "rich-text",
  "math-expression", "unit-converter", "percentage", "statistics", "business-days", "temperature", "eta", "stopwatch", "benchmark", "compound-interest", "text-speech",
  "bcrypt", "password-strength", "iban", "bip39", "gif-compress", "gif-crop", "gif-frames", "wifi-qr",
]);
const expansionDefs = EXPANSION_TOOLS.map(([id,category,zh,en,view,,summary])=>({
  id,category,name:{...L(en,zh,...EXPANSION_NAMES[id].slice(0,5)),ko:EXPANSION_NAMES[id][5],tr:EXPANSION_NAMES[id][6],az:EXPANSION_NAMES[id][7]},view,
  aliases:[en,zh,...(id==='wifi-qr'?['wifi','wi-fi','无线网络二维码']:id==='figlet'?['figlet','ASCII art']:[])],
  kind:['numeronym','english-plural','email-normalizer','url-extractor'].includes(id)?'shortcut':'tool',parentId:['numeronym','english-plural','email-normalizer','url-extractor'].includes(id)?'whitespace':null,defaultOptions:['numeronym','english-plural','email-normalizer','url-extractor'].includes(id)?{action: {'numeronym':'numeronym','english-plural':'pluralize','email-normalizer':'email-normalize','url-extractor':'extract-url'}[id]}:{},catalogVisible:true,capabilityId:null,supportLevel:null,lockOptions:[],
  demoPreset:(id.startsWith('pdf-') || EXPANSION_DEMO_IDS.has(id))?id:null,actions:(id.startsWith('pdf-') || EXPANSION_DEMO_IDS.has(id))?['demo','reset','copy','save','drop']:['reset','copy','save','drop'],
  summary: {...L(EXPANSION_TOOLS.find(row=>row[0]===id)[5],summary,
    `本機工具：${EXPANSION_NAMES[id][0]}`,
    `Herramienta local: ${EXPANSION_NAMES[id][1]}`,
    `Strumento locale: ${EXPANSION_NAMES[id][2]}`,
    `ローカルツール：${EXPANSION_NAMES[id][3]}`,
    `Ferramenta local: ${EXPANSION_NAMES[id][4]}`),
    ko:`로컬 도구: ${EXPANSION_NAMES[id][5]}`,
    tr:`Yerel araç: ${EXPANSION_NAMES[id][6]}`,
    az:`Yerli alət: ${EXPANSION_NAMES[id][7]}`},
}));
export const TOOL_DEFS = [...BASE_TOOL_DEFS,...expansionDefs].map(presentTool);

