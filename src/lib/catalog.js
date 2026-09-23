import { TOOL_DEFS } from "./toolCatalog.js";
import { TEXT_ACTIONS } from "./textActions.js";
import { categories, L, localeValues } from "./i18n.js";
import { resolveIntent } from "./searchIntent.js";

export const CATEGORY_ORDER = ["format", "encode", "convert", "text", "security", "generate", "image"];

export const LEGACY_TOOL_IDS = {
  "json-convert": "json",
  "json-yaml": "json",
  "json-csv": "json",
  "json-xml": "json",
  "json-toml": "json",
  "json-sql": "json",
  "json-ts": "json",
  jsonpath: "json",
  duration: "timestamp",
  hex: "base64",
  base32: "base64",
  base58: "base64",
  unicode: "html-entities",
  sm4: "aes",
  "hmac-sm3": "hmac-sha256",
  sm2: "rsa",
  "ssh-fingerprint": "cert",
  sql: "code-format",
  xml: "code-format",
  yaml: "code-format",
  html: "code-format",
  css: "code-format",
  ulid: "uuid",
  nanoid: "uuid",
  "random-bytes": "password",
  crc32: "hash",
  naming: "whitespace",
  case: "whitespace",
  stats: "whitespace",
  slugify: "whitespace",
  "strip-html": "whitespace",
  lines: "whitespace",
};

export function canonicalToolId(id) {
  return LEGACY_TOOL_IDS[id] || id;
}

const SUMMARIES = {
  "windows-port": L(
    "Find and terminate processes using a TCP or UDP port",
    "查询并结束占用 TCP 或 UDP 端口的进程",
    "查詢並終止占用 TCP 或 UDP 連接埠的程序",
    "Buscar y finalizar procesos que usan un puerto TCP o UDP",
    "Trova e termina i processi che usano una porta TCP o UDP",
    "TCP・UDP ポートを使用するプロセスを検索して終了",
    "Localize e encerre processos que usam uma porta TCP ou UDP",
  ),
  json: L(
    "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL",
    "格式化、压缩、校验、树形编辑、JSONPath，以及导出 TypeScript / SQL 等",
    "格式化、壓縮、校驗、樹狀編輯、JSONPath，以及匯出 TypeScript / SQL 等",
    "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL",
    "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL",
    "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL",
    "Format, minify, validate, tree-edit, JSONPath, and export to TypeScript / SQL",
  ),
  "data-convert": L(
    "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML",
    "JSON / YAML / CSV / TSV / NDJSON / XML / TOML 互转",
    "JSON / YAML / CSV / TSV / NDJSON / XML / TOML 互轉",
    "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML",
    "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML",
    "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML",
    "Convert among JSON, YAML, CSV, TSV, NDJSON, XML, and TOML",
  ),
  "code-format": L(
    "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript",
    "格式化 SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript",
    "格式化 SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript",
    "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript",
    "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript",
    "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript",
    "Format SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript",
  ),
  spreadsheet: L(
    "Open, edit, and export XLSX, CSV, TSV, and JSON locally",
    "本地打开、编辑并导出 XLSX、CSV、TSV、JSON",
    "本機開啟、編輯並匯出 XLSX、CSV、TSV、JSON",
    "Open, edit, and export XLSX, CSV, TSV, and JSON locally",
    "Open, edit, and export XLSX, CSV, TSV, and JSON locally",
    "Open, edit, and export XLSX, CSV, TSV, and JSON locally",
    "Open, edit, and export XLSX, CSV, TSV, and JSON locally",
  ),
  base64: L(
    "Encode or decode Base64, Base32, Base58, or Hex",
    "Base64 / Base32 / Base58 / Hex 编码解码",
    "Base64 / Base32 / Base58 / Hex 編碼解碼",
    "Encode or decode Base64, Base32, Base58, or Hex",
    "Encode or decode Base64, Base32, Base58, or Hex",
    "Encode or decode Base64, Base32, Base58, or Hex",
    "Encode or decode Base64, Base32, Base58, or Hex",
  ),
  url: L(
    "Percent-encode/decode URLs, or list query params",
    "URL 百分号编解码，或拆解查询参数",
    "URL 百分號編解碼，或拆解查詢參數",
    "Percent-encode/decode URLs, or list query params",
    "Percent-encode/decode URLs, or list query params",
    "Percent-encode/decode URLs, or list query params",
    "Percent-encode/decode URLs, or list query params",
  ),
  "html-entities": L(
    "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers",
    "HTML 实体、Unicode、JS、JSON、CSS 标识符转义",
    "HTML 實體、Unicode、JS、JSON、CSS 識別碼轉義",
    "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers",
    "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers",
    "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers",
    "Escape HTML entities, Unicode, JS, JSON, or CSS identifiers",
  ),
  "sql-escape": L(
    "Escape each line as a SQL string literal, with optional commas",
    "按行转成 SQL 字符串字面量，可选行尾逗号",
    "按行轉成 SQL 字串字面量，可選行尾逗號",
    "Escape each line as a SQL string literal, with optional commas",
    "Escape each line as a SQL string literal, with optional commas",
    "Escape each line as a SQL string literal, with optional commas",
    "Escape each line as a SQL string literal, with optional commas",
  ),
  "data-uri": L(
    "Build or parse Data URIs from text or files",
    "生成或解析 Data URI，支持文本与文件",
    "產生或解析 Data URI，支援文字與檔案",
    "Build or parse Data URIs from text or files",
    "Build or parse Data URIs from text or files",
    "Build or parse Data URIs from text or files",
    "Build or parse Data URIs from text or files",
  ),
  punycode: L(
    "Convert between IDN and Punycode domain names",
    "国际化域名（IDN）与 Punycode 互转",
    "國際化網域名稱（IDN）與 Punycode 互轉",
    "Convert between IDN and Punycode domain names",
    "Convert between IDN and Punycode domain names",
    "Convert between IDN and Punycode domain names",
    "Convert between IDN and Punycode domain names",
  ),
  "quoted-printable": L(
    "Quoted-Printable encode or decode for email",
    "邮件 Quoted-Printable 编码与解码",
    "郵件 Quoted-Printable 編碼與解碼",
    "Quoted-Printable encode or decode for email",
    "Quoted-Printable encode or decode for email",
    "Quoted-Printable encode or decode for email",
    "Quoted-Printable encode or decode for email",
  ),
  timestamp: L(
    "Convert Unix timestamps and dates; timezones, arithmetic, and diffs",
    "Unix 时间戳与日期互转，支持时区、加减与时间差",
    "Unix 時間戳與日期互轉，支援時區、加減與時間差",
    "Convert Unix timestamps and dates; timezones, arithmetic, and diffs",
    "Convert Unix timestamps and dates; timezones, arithmetic, and diffs",
    "Convert Unix timestamps and dates; timezones, arithmetic, and diffs",
    "Convert Unix timestamps and dates; timezones, arithmetic, and diffs",
  ),
  color: L(
    "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker",
    "HEX / RGB / CMYK / HSV 互转，含色环与屏幕取色",
    "HEX / RGB / CMYK / HSV 互轉，含色環與螢幕取色",
    "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker",
    "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker",
    "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker",
    "Convert HEX, RGB, CMYK, HSV; color wheel and screen picker",
  ),
  cron: L(
    "Build a cron expression and preview the next runs",
    "可视化编辑 Cron，并预览下次触发时间",
    "視覺化編輯 Cron，並預覽下次觸發時間",
    "Build a cron expression and preview the next runs",
    "Build a cron expression and preview the next runs",
    "Build a cron expression and preview the next runs",
    "Build a cron expression and preview the next runs",
  ),
  "base-convert": L(
    "Convert bases 2–36, with optional grouping and prefixes",
    "2–36 进制互转，支持分组与前缀",
    "2–36 進制互轉，支援分組與前綴",
    "Convert bases 2–36, with optional grouping and prefixes",
    "Convert bases 2–36, with optional grouping and prefixes",
    "Convert bases 2–36, with optional grouping and prefixes",
    "Convert bases 2–36, with optional grouping and prefixes",
  ),
  "network-calc": L(
    "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets",
    "计算 IPv4 / IPv6 网段、掩码、主机范围并切分子网",
    "計算 IPv4 / IPv6 網段、遮罩、主機範圍並切分子網",
    "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets",
    "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets",
    "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets",
    "Calculate IPv4/IPv6 networks, masks, ranges, and split subnets",
  ),
  whitespace: L(
    "Clean, dedupe, sort, number, extract columns, restyle names, and count text",
    "清理、去重、排序、序号、列截取、命名风格与字数统计",
    "清理、去重、排序、序號、欄截取、命名風格與字數統計",
    "Clean, dedupe, sort, number, extract columns, restyle names, and count text",
    "Clean, dedupe, sort, number, extract columns, restyle names, and count text",
    "Clean, dedupe, sort, number, extract columns, restyle names, and count text",
    "Clean, dedupe, sort, number, extract columns, restyle names, and count text",
  ),
  regex: L(
    "Test regexes, inspect matches, and preview replacements",
    "测试正则表达式，查看匹配并预览替换",
    "測試正規運算式，查看符合並預覽取代",
    "Test regexes, inspect matches, and preview replacements",
    "Test regexes, inspect matches, and preview replacements",
    "Test regexes, inspect matches, and preview replacements",
    "Test regexes, inspect matches, and preview replacements",
  ),
  diff: L(
    "Compare two texts by line, word, or character",
    "按行、单词或字符对比两段文本",
    "按行、單詞或字元對比兩段文字",
    "Compare two texts by line, word, or character",
    "Compare two texts by line, word, or character",
    "Compare two texts by line, word, or character",
    "Compare two texts by line, word, or character",
  ),
  markdown: L(
    "Live Markdown preview as you type",
    "边写边预览 Markdown 渲染结果",
    "邊寫邊預覽 Markdown 渲染結果",
    "Live Markdown preview as you type",
    "Live Markdown preview as you type",
    "Live Markdown preview as you type",
    "Live Markdown preview as you type",
  ),
  "unicode-inspect": L(
    "Inspect Unicode code points per character",
    "逐字符查看 Unicode 码位与属性",
    "逐字元查看 Unicode 碼位與屬性",
    "Inspect Unicode code points per character",
    "Inspect Unicode code points per character",
    "Inspect Unicode code points per character",
    "Inspect Unicode code points per character",
  ),
  hash: L(
    "Hash text or files with MD5, SHA, SM3, or CRC32",
    "计算文本或文件的 MD5 / SHA / SM3 / CRC32",
    "計算文字或檔案的 MD5 / SHA / SM3 / CRC32",
    "Hash text or files with MD5, SHA, SM3, or CRC32",
    "Hash text or files with MD5, SHA, SM3, or CRC32",
    "Hash text or files with MD5, SHA, SM3, or CRC32",
    "Hash text or files with MD5, SHA, SM3, or CRC32",
  ),
  jwt: L(
    "Decode, sign, or verify JWTs with HS / RS / PS",
    "解码、签发或验签 JWT（HS / RS / PS）",
    "解碼、簽發或驗簽 JWT（HS / RS / PS）",
    "Decode, sign, or verify JWTs with HS / RS / PS",
    "Decode, sign, or verify JWTs with HS / RS / PS",
    "Decode, sign, or verify JWTs with HS / RS / PS",
    "Decode, sign, or verify JWTs with HS / RS / PS",
  ),
  aes: L(
    "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)",
    "AES / SM4 对称加解密（GCM / CBC / ECB）",
    "AES / SM4 對稱加解密（GCM / CBC / ECB）",
    "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)",
    "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)",
    "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)",
    "AES or SM4 encrypt/decrypt (GCM, CBC, ECB)",
  ),
  "hmac-sha256": L(
    "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3",
    "HMAC-SHA1 / SHA256 / SHA384 / SHA512 / SM3",
    "HMAC-SHA1 / SHA256 / SHA384 / SHA512 / SM3",
    "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3",
    "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3",
    "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3",
    "HMAC with SHA-1, SHA-256, SHA-384, SHA-512, or SM3",
  ),
  rsa: L(
    "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt",
    "RSA（OAEP / PKCS#1）或 SM2 加解密",
    "RSA（OAEP / PKCS#1）或 SM2 加解密",
    "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt",
    "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt",
    "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt",
    "RSA OAEP/PKCS#1 or SM2 encrypt and decrypt",
  ),
  totp: L(
    "Generate the current TOTP code from a secret",
    "根据密钥生成当前 TOTP 动态口令",
    "根據金鑰產生目前 TOTP 動態口令",
    "Generate the current TOTP code from a secret",
    "Generate the current TOTP code from a secret",
    "Generate the current TOTP code from a secret",
    "Generate the current TOTP code from a secret",
  ),
  cert: L(
    "Inspect cert validity, SANs, fingerprints, or SSH public keys",
    "查看证书有效期、SAN、指纹，或 SSH 公钥指纹",
    "查看憑證有效期、SAN、指紋，或 SSH 公鑰指紋",
    "Inspect cert validity, SANs, fingerprints, or SSH public keys",
    "Inspect cert validity, SANs, fingerprints, or SSH public keys",
    "Inspect cert validity, SANs, fingerprints, or SSH public keys",
    "Inspect cert validity, SANs, fingerprints, or SSH public keys",
  ),
  jwk: L(
    "Validate JWK/JWKS and convert RSA JWK ↔ PEM",
    "校验 JWK / JWKS，RSA JWK 与 PEM 互转",
    "校驗 JWK / JWKS，RSA JWK 與 PEM 互轉",
    "Validate JWK/JWKS and convert RSA JWK ↔ PEM",
    "Validate JWK/JWKS and convert RSA JWK ↔ PEM",
    "Validate JWK/JWKS and convert RSA JWK ↔ PEM",
    "Validate JWK/JWKS and convert RSA JWK ↔ PEM",
  ),
  "symmetric-key": L(
    "Generate an AES, SM4, or HMAC key; optional vault save",
    "生成 AES / SM4 / HMAC 密钥，可写入密钥库",
    "產生 AES / SM4 / HMAC 金鑰，可寫入金鑰庫",
    "Generate an AES, SM4, or HMAC key; optional vault save",
    "Generate an AES, SM4, or HMAC key; optional vault save",
    "Generate an AES, SM4, or HMAC key; optional vault save",
    "Generate an AES, SM4, or HMAC key; optional vault save",
  ),
  "key-pair": L(
    "Generate RSA or SM2 key pairs; bits and PEM format options",
    "生成 RSA / SM2 公私钥对，可配置位数与 PEM 格式",
    "產生 RSA / SM2 公私鑰對，可設定位數與 PEM 格式",
    "Generate RSA or SM2 key pairs; bits and PEM format options",
    "Generate RSA or SM2 key pairs; bits and PEM format options",
    "Generate RSA or SM2 key pairs; bits and PEM format options",
    "Generate RSA or SM2 key pairs; bits and PEM format options",
  ),
  xor: L(
    "XOR bytes for debugging only",
    "按字节异或运算，仅供调试对照",
    "按位元組異或運算，僅供除錯對照",
    "XOR bytes for debugging only",
    "XOR bytes for debugging only",
    "XOR bytes for debugging only",
    "XOR bytes for debugging only",
  ),
  uuid: L(
    "Generate UUID, ULID, or NanoID values",
    "批量生成 UUID、ULID 或 NanoID",
    "批次產生 UUID、ULID 或 NanoID",
    "Generate UUID, ULID, or NanoID values",
    "Generate UUID, ULID, or NanoID values",
    "Generate UUID, ULID, or NanoID values",
    "Generate UUID, ULID, or NanoID values",
  ),
  password: L(
    "Generate a random password or hex bytes",
    "生成随机密码或随机十六进制字节",
    "產生隨機密碼或隨機十六進位位元組",
    "Generate a random password or hex bytes",
    "Generate a random password or hex bytes",
    "Generate a random password or hex bytes",
    "Generate a random password or hex bytes",
  ),
  qrcode: L(
    "Generate or decode QR, Han Xin, PDF417, and Data Matrix",
    "生成或识别 QR / 汉信码 / PDF417 / Data Matrix",
    "產生或辨識 QR / 漢信碼 / PDF417 / Data Matrix",
    "Generate or decode QR, Han Xin, PDF417, and Data Matrix",
    "Generate or decode QR, Han Xin, PDF417, and Data Matrix",
    "Generate or decode QR, Han Xin, PDF417, and Data Matrix",
    "Generate or decode QR, Han Xin, PDF417, and Data Matrix",
  ),
  lorem: L(
    "Repeat default or custom copy a chosen number of times",
    "按次数重复默认文案或自定义内容",
    "按次數重複預設文案或自訂內容",
    "Repeat default or custom copy a chosen number of times",
    "Repeat default or custom copy a chosen number of times",
    "Repeat default or custom copy a chosen number of times",
    "Repeat default or custom copy a chosen number of times",
  ),
  "image-process": L(
    "Crop, resize, rotate, flip, watermark, convert, and compress",
    "裁剪、缩放、旋转、翻转、水印、转格式与压缩",
    "裁剪、縮放、旋轉、翻轉、浮水印、轉格式與壓縮",
    "Crop, resize, rotate, flip, watermark, convert, and compress",
    "Crop, resize, rotate, flip, watermark, convert, and compress",
    "Crop, resize, rotate, flip, watermark, convert, and compress",
    "Crop, resize, rotate, flip, watermark, convert, and compress",
  ),
  "image-generate": L(
    "Generate placeholders at exact pixel size and file size",
    "按像素尺寸与目标体积生成占位图",
    "依像素尺寸與目標體積產生佔位圖",
    "Generate placeholders at exact pixel size and file size",
    "Generate placeholders at exact pixel size and file size",
    "Generate placeholders at exact pixel size and file size",
    "Generate placeholders at exact pixel size and file size",
  ),
  "md5-collision": L(
    "Compare two files and flag equal MD5 hashes with different bytes",
    "比较两个文件，识别 MD5 相同但内容不同的碰撞",
    "比較兩個檔案，識別 MD5 相同但內容不同的碰撞",
    "Compare two files and flag equal MD5 hashes with different bytes",
    "Compare two files and flag equal MD5 hashes with different bytes",
    "Compare two files and flag equal MD5 hashes with different bytes",
    "Compare two files and flag equal MD5 hashes with different bytes",
  ),
  "file-type": L(
    "Identify a file from its signature instead of its extension",
    "根据文件头魔数识别真实格式、MIME 与扩展名",
    "根據檔案頭魔數識別真實格式、MIME 與副檔名",
    "Identify a file from its signature instead of its extension",
    "Identify a file from its signature instead of its extension",
    "Identify a file from its signature instead of its extension",
    "Identify a file from its signature instead of its extension",
  ),
  "image-pixelate": L("Pixelate an image with an adjustable block size", "按可调像素块将图片像素化", "按可調像素塊將圖片像素化", "Pixelate an image with an adjustable block size", "Pixelate an image with an adjustable block size", "Pixelate an image with an adjustable block size", "Pixelate an image with an adjustable block size"),
  "image-grid": L("Split an image into a rows × columns ZIP archive", "按行列网格切图并打包为 ZIP", "按行列網格切圖並打包為 ZIP", "Split an image into a rows × columns ZIP archive", "Split an image into a rows × columns ZIP archive", "Split an image into a rows × columns ZIP archive", "Split an image into a rows × columns ZIP archive"),
  "image-compress": L("Compress PNG, JPEG, or WebP locally with a size comparison", "本地压缩 PNG、JPEG 或 WebP，并对比文件体积", "本機壓縮 PNG、JPEG 或 WebP，並比較檔案大小", "Compress PNG, JPEG, or WebP locally with a size comparison", "Compress PNG, JPEG, or WebP locally with a size comparison", "Compress PNG, JPEG, or WebP locally with a size comparison", "Compress PNG, JPEG, or WebP locally with a size comparison"),
  "image-base64": L("Convert an image to raw Base64 or a Data URL", "将图片转换为纯 Base64 或 Data URL", "將圖片轉換為純 Base64 或 Data URL", "Convert an image to raw Base64 or a Data URL", "Convert an image to raw Base64 or a Data URL", "Convert an image to raw Base64 or a Data URL", "Convert an image to raw Base64 or a Data URL"),
};

const JAPANESE_SUMMARIES = {
  "md5-collision": "2 つのファイルを比較し、内容が異なる同一 MD5 ハッシュを検出",
  "file-type": "拡張子ではなくファイルシグネチャから形式を判定",
  "image-pixelate": "ブロックサイズを調整して画像をピクセル化",
  "image-grid": "画像を行列グリッドに分割して ZIP に出力",
  "image-compress": "PNG、JPEG、WebP をローカルで圧縮しサイズを比較",
  "image-base64": "画像を生の Base64 または Data URL に変換",
  json: "JSON の整形、圧縮、検証、ツリー編集、JSONPath、TypeScript / SQL への出力",
  "data-convert": "JSON、YAML、CSV、TSV、NDJSON、XML、TOML を相互変換",
  "code-format": "SQL、XML、YAML、HTML、CSS、JavaScript、TypeScript を整形",
  spreadsheet: "XLSX、CSV、TSV、JSON をローカルで開き、編集して出力",
  base64: "Base64、Base32、Base58、Hex をエンコードまたはデコード",
  url: "URL のパーセントエンコード／デコードとクエリパラメーターの解析",
  "html-entities": "HTML エンティティ、Unicode、JS、JSON、CSS 識別子をエスケープ",
  "sql-escape": "各行を SQL 文字列リテラルへ変換し、末尾カンマにも対応",
  "data-uri": "テキストやファイルから Data URI を生成・解析",
  punycode: "IDN と Punycode ドメイン名を相互変換",
  "quoted-printable": "メール用 Quoted-Printable のエンコード／デコード",
  timestamp: "Unix タイムスタンプと日時を変換し、タイムゾーン・加減算・差分に対応",
  color: "HEX、RGB、CMYK、HSV の相互変換、カラーホイール、画面色取得",
  cron: "Cron 式を作成し、次回の実行日時をプレビュー",
  "base-convert": "2～36 進数を相互変換し、グループ化と接頭辞に対応",
  "network-calc": "IPv4/IPv6 のネットワーク、マスク、範囲、サブネット分割を計算",
  whitespace: "テキストの整理、重複削除、並べ替え、連番、列抽出、命名変換、文字数集計",
  regex: "正規表現をテストし、マッチ結果と置換をプレビュー",
  diff: "2 つのテキストを行・単語・文字単位で比較",
  markdown: "入力しながら Markdown をリアルタイムプレビュー",
  "unicode-inspect": "文字ごとの Unicode コードポイントを確認",
  hash: "テキストやファイルの MD5、SHA、SM3、CRC32 を計算",
  jwt: "HS / RS / PS を使って JWT をデコード、署名、検証",
  aes: "AES / SM4 の暗号化・復号（GCM、CBC、ECB）",
  "hmac-sha256": "SHA-1、SHA-256、SHA-384、SHA-512、SM3 による HMAC",
  rsa: "RSA OAEP / PKCS#1 または SM2 の暗号化・復号",
  totp: "秘密鍵から現在の TOTP コードを生成",
  cert: "証明書の有効期限、SAN、フィンガープリント、SSH 公開鍵を確認",
  jwk: "JWK / JWKS を検証し、RSA JWK と PEM を相互変換",
  "symmetric-key": "AES、SM4、HMAC 鍵を生成し、必要に応じて保管庫へ保存",
  "key-pair": "RSA / SM2 鍵ペアを生成し、ビット数と PEM 形式を指定",
  xor: "デバッグ用にバイト単位の XOR 演算を実行",
  uuid: "UUID、ULID、NanoID を生成",
  password: "ランダムパスワードまたは 16 進数バイト列を生成",
  qrcode: "QR、漢信、PDF417、Data Matrix を生成・読み取り",
  lorem: "既定または任意のテキストを指定回数だけ繰り返し",
  "image-process": "切り抜き、サイズ変更、回転、反転、透かし、形式変換、圧縮",
  "image-generate": "指定したピクセル寸法とファイルサイズのプレースホルダー画像を生成",
};

// [es, it, pt-BR]. English remains the canonical source text, while every
// locale advertised by the host gets native catalog copy.
const ROMANCE_SUMMARIES = {
  "md5-collision": ["Compara dos archivos y detecta hashes MD5 iguales con bytes diferentes", "Confronta due file e rileva hash MD5 uguali con byte diversi", "Compare dois arquivos e detecte hashes MD5 iguais com bytes diferentes"],
  "file-type": ["Identifica un archivo por su firma en lugar de su extensión", "Identifica un file dalla firma anziché dall'estensione", "Identifique um arquivo pela assinatura, não pela extensão"],
  "image-pixelate": ["Pixela una imagen con un tamaño de bloque ajustable", "Pixelizza un'immagine con blocchi regolabili", "Pixelize uma imagem com tamanho de bloco ajustável"],
  "image-grid": ["Divide una imagen en una cuadrícula y crea un ZIP", "Divide un'immagine in una griglia e crea uno ZIP", "Divida uma imagem em uma grade e crie um ZIP"],
  "image-compress": ["Comprime PNG, JPEG o WebP localmente y compara el tamaño", "Comprimi PNG, JPEG o WebP localmente e confronta le dimensioni", "Comprima PNG, JPEG ou WebP localmente e compare o tamanho"],
  "image-base64": ["Convierte una imagen a Base64 puro o Data URL", "Converte un'immagine in Base64 puro o Data URL", "Converta uma imagem em Base64 puro ou Data URL"],
  json: ["Formatea, minimiza, valida y edita JSON en árbol; JSONPath y exportación a TypeScript / SQL", "Formatta, minimizza, convalida e modifica JSON ad albero; JSONPath ed esportazione in TypeScript / SQL", "Formate, minimize, valide e edite JSON em árvore; JSONPath e exportação para TypeScript / SQL"],
  "data-convert": ["Convierte entre JSON, YAML, CSV, TSV, NDJSON, XML y TOML", "Converte tra JSON, YAML, CSV, TSV, NDJSON, XML e TOML", "Converta entre JSON, YAML, CSV, TSV, NDJSON, XML e TOML"],
  "code-format": ["Formatea SQL, XML, YAML, HTML, CSS, JavaScript y TypeScript", "Formatta SQL, XML, YAML, HTML, CSS, JavaScript e TypeScript", "Formate SQL, XML, YAML, HTML, CSS, JavaScript e TypeScript"],
  spreadsheet: ["Abre, edita y exporta XLSX, CSV, TSV y JSON localmente", "Apre, modifica ed esporta XLSX, CSV, TSV e JSON in locale", "Abra, edite e exporte XLSX, CSV, TSV e JSON localmente"],
  base64: ["Codifica o decodifica Base64, Base32, Base58 o Hex", "Codifica o decodifica Base64, Base32, Base58 o Hex", "Codifique ou decodifique Base64, Base32, Base58 ou Hex"],
  url: ["Codifica o decodifica porcentajes en URL y analiza parámetros de consulta", "Codifica o decodifica percentuali negli URL e analizza i parametri di query", "Codifique ou decodifique percentuais em URLs e analise parâmetros de consulta"],
  "html-entities": ["Escapa entidades HTML, Unicode, JS, JSON o identificadores CSS", "Esegue l'escape di entità HTML, Unicode, JS, JSON o identificatori CSS", "Faça escape de entidades HTML, Unicode, JS, JSON ou identificadores CSS"],
  "sql-escape": ["Convierte cada línea en un literal SQL, con comas finales opcionales", "Converte ogni riga in un letterale SQL, con virgole finali opzionali", "Converta cada linha em um literal SQL, com vírgulas finais opcionais"],
  "data-uri": ["Crea o analiza URI de datos a partir de texto o archivos", "Crea o analizza URI dati da testo o file", "Crie ou analise URIs de dados a partir de texto ou arquivos"],
  punycode: ["Convierte entre nombres de dominio IDN y Punycode", "Converte tra nomi di dominio IDN e Punycode", "Converta entre nomes de domínio IDN e Punycode"],
  "quoted-printable": ["Codifica o decodifica Quoted-Printable para correo electrónico", "Codifica o decodifica Quoted-Printable per le email", "Codifique ou decodifique Quoted-Printable para e-mail"],
  timestamp: ["Convierte marcas Unix y fechas; admite zonas horarias, aritmética y diferencias", "Converte timestamp Unix e date; supporta fusi orari, calcoli e differenze", "Converta timestamps Unix e datas; inclui fusos horários, cálculos e diferenças"],
  color: ["Convierte HEX, RGB, CMYK y HSV; incluye rueda de color y selector de pantalla", "Converte HEX, RGB, CMYK e HSV; include ruota colori e selettore schermo", "Converta HEX, RGB, CMYK e HSV; inclui roda de cores e seletor de tela"],
  cron: ["Crea una expresión Cron y previsualiza las próximas ejecuciones", "Crea un'espressione Cron e visualizza le prossime esecuzioni", "Crie uma expressão Cron e visualize as próximas execuções"],
  "base-convert": ["Convierte bases de 2 a 36, con agrupación y prefijos opcionales", "Converte basi da 2 a 36, con raggruppamento e prefissi opzionali", "Converta bases de 2 a 36, com agrupamento e prefixos opcionais"],
  "network-calc": ["Calcula redes IPv4/IPv6, máscaras, rangos y división de subredes", "Calcola reti IPv4/IPv6, maschere, intervalli e suddivisione in sottoreti", "Calcule redes IPv4/IPv6, máscaras, intervalos e divisão de sub-redes"],
  whitespace: ["Limpia, deduplica, ordena, numera, extrae columnas, cambia nombres y cuenta texto", "Pulisce, deduplica, ordina, numera, estrae colonne, rinomina e conta il testo", "Limpe, remova duplicados, ordene, numere, extraia colunas, renomeie e conte textos"],
  regex: ["Prueba expresiones regulares, inspecciona coincidencias y previsualiza reemplazos", "Prova espressioni regolari, analizza le corrispondenze e mostra le sostituzioni", "Teste expressões regulares, inspecione correspondências e visualize substituições"],
  diff: ["Compara dos textos por línea, palabra o carácter", "Confronta due testi per riga, parola o carattere", "Compare dois textos por linha, palavra ou caractere"],
  markdown: ["Previsualiza Markdown en tiempo real mientras escribes", "Mostra l'anteprima Markdown in tempo reale durante la digitazione", "Visualize Markdown em tempo real enquanto digita"],
  "unicode-inspect": ["Inspecciona los puntos de código Unicode de cada carácter", "Analizza i punti di codice Unicode di ogni carattere", "Inspecione os pontos de código Unicode de cada caractere"],
  hash: ["Calcula MD5, SHA, SM3 o CRC32 de texto o archivos", "Calcola MD5, SHA, SM3 o CRC32 di testo o file", "Calcule MD5, SHA, SM3 ou CRC32 de textos ou arquivos"],
  jwt: ["Decodifica, firma o verifica JWT con HS / RS / PS", "Decodifica, firma o verifica JWT con HS / RS / PS", "Decodifique, assine ou verifique JWTs com HS / RS / PS"],
  aes: ["Cifra o descifra con AES / SM4 (GCM, CBC, ECB)", "Cifra o decifra con AES / SM4 (GCM, CBC, ECB)", "Criptografe ou descriptografe com AES / SM4 (GCM, CBC, ECB)"],
  "hmac-sha256": ["HMAC con SHA-1, SHA-256, SHA-384, SHA-512 o SM3", "HMAC con SHA-1, SHA-256, SHA-384, SHA-512 o SM3", "HMAC com SHA-1, SHA-256, SHA-384, SHA-512 ou SM3"],
  rsa: ["Cifra y descifra con RSA OAEP / PKCS#1 o SM2", "Cifra e decifra con RSA OAEP / PKCS#1 o SM2", "Criptografe e descriptografe com RSA OAEP / PKCS#1 ou SM2"],
  totp: ["Genera el código TOTP actual a partir de un secreto", "Genera il codice TOTP corrente da un segreto", "Gere o código TOTP atual a partir de um segredo"],
  cert: ["Inspecciona validez, SAN, huellas y claves públicas SSH", "Analizza validità, SAN, impronte e chiavi pubbliche SSH", "Inspecione validade, SANs, impressões digitais e chaves públicas SSH"],
  jwk: ["Valida JWK / JWKS y convierte RSA JWK ↔ PEM", "Convalida JWK / JWKS e converte RSA JWK ↔ PEM", "Valide JWK / JWKS e converta RSA JWK ↔ PEM"],
  "symmetric-key": ["Genera claves AES, SM4 o HMAC y permite guardarlas en el almacén", "Genera chiavi AES, SM4 o HMAC e consente di salvarle nell'archivio", "Gere chaves AES, SM4 ou HMAC e salve-as opcionalmente no cofre"],
  "key-pair": ["Genera pares RSA o SM2 con opciones de bits y formato PEM", "Genera coppie RSA o SM2 con opzioni per bit e formato PEM", "Gere pares RSA ou SM2 com opções de bits e formato PEM"],
  xor: ["Aplica XOR a bytes solo para depuración", "Applica XOR ai byte solo per il debug", "Aplique XOR a bytes somente para depuração"],
  uuid: ["Genera valores UUID, ULID o NanoID", "Genera valori UUID, ULID o NanoID", "Gere valores UUID, ULID ou NanoID"],
  password: ["Genera una contraseña aleatoria o bytes hexadecimales", "Genera una password casuale o byte esadecimali", "Gere uma senha aleatória ou bytes hexadecimais"],
  qrcode: ["Genera o lee QR, Han Xin, PDF417 y Data Matrix", "Genera o legge QR, Han Xin, PDF417 e Data Matrix", "Gere ou leia QR, Han Xin, PDF417 e Data Matrix"],
  lorem: ["Repite texto predeterminado o personalizado el número de veces elegido", "Ripete testo predefinito o personalizzato per il numero di volte scelto", "Repita um texto padrão ou personalizado pelo número de vezes escolhido"],
  "image-process": ["Recorta, redimensiona, gira, voltea, añade marcas de agua, convierte y comprime", "Ritaglia, ridimensiona, ruota, capovolge, aggiunge filigrane, converte e comprime", "Recorte, redimensione, gire, vire, aplique marca d'água, converta e comprima"],
  "image-generate": ["Genera imágenes de marcador con dimensiones y tamaño de archivo exactos", "Genera immagini segnaposto con dimensioni e peso esatti", "Gere imagens de espaço reservado com dimensões e tamanho de arquivo exatos"],
};

const catalog = TOOL_DEFS;

export const tools = catalog.map((tool) => {
  const baseSummary = SUMMARIES[tool.id];
  const [es, it, ptBR] = ROMANCE_SUMMARIES[tool.id] || [];
  const summary = baseSummary ? {
    ...baseSummary,
    ...(es ? { es } : {}),
    ...(it ? { it } : {}),
    ...(JAPANESE_SUMMARIES[tool.id] ? { ja: JAPANESE_SUMMARIES[tool.id] } : {}),
    ...(ptBR ? { "pt-BR": ptBR } : {}),
  } : baseSummary;
  const aliases = tool.id === "whitespace"
    ? [...(tool.aliases || []), ...TEXT_ACTIONS.flatMap((action) => [action.id, action.zh, action.en, ...action.aliases])]
    : tool.aliases;
  return { ...tool, ...(summary ? { summary } : {}), ...(aliases ? { aliases } : {}) };
});

// Keep first-run state empty; favorites are an explicit user choice.
export const DEFAULT_ENABLED_IDS = [];

export function toolsByIds(ids) {
  const map = new Map(tools.map((tool) => [tool.id, tool]));
  const seen = new Set();
  const out = [];
  for (const raw of ids || []) {
    const id = canonicalToolId(raw);
    const tool = map.get(id);
    if (!tool || seen.has(id)) continue;
    seen.add(id);
    out.push(tool);
  }
  return out;
}

export function normalizeToolOrder(ids, pool = tools) {
  const byId = new Map(pool.map((tool) => [tool.id, tool]));
  const seen = new Set();
  const ordered = [];
  for (const raw of ids || []) {
    const id = canonicalToolId(raw);
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return [...ordered, ...pool.filter((tool) => !seen.has(tool.id)).map((tool) => tool.id)];
}

export function moveToolWithinCategory(order, sourceId, targetId, after = false, pool = tools) {
  if (!sourceId || sourceId === targetId) return normalizeToolOrder(order, pool);
  const byId = new Map(pool.map((tool) => [tool.id, tool]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  const next = normalizeToolOrder(order, pool);
  if (!source || !target || source.category !== target.category) return next;

  const from = next.indexOf(sourceId);
  if (from < 0) return next;
  next.splice(from, 1);
  const targetAt = next.indexOf(targetId);
  if (targetAt < 0) return normalizeToolOrder(order, pool);
  next.splice(targetAt + (after ? 1 : 0), 0, sourceId);
  return next;
}

export function toolsByCategory(pool = tools) {
  const map = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, []]));
  for (const tool of pool) map[tool.category].push(tool);
  return map;
}

export function searchTools(query, locale, pool = tools) {
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  const tokens = q.split(/\s+/).filter(Boolean);
  const intentBoost = new Map();
  for (const [index, intent] of resolveIntent(q).entries()) {
    const boost = 5 + (Object.keys(intent.options || {}).length ? 1 : 0) - index * 0.01;
    const prev = intentBoost.get(intent.toolId);
    if (prev == null || boost > prev) intentBoost.set(intent.toolId, boost);
  }
  return pool.map((tool) => {
    const names = [tool.id, ...localeValues(tool.name)].map((value) => value.toLowerCase());
    const aliases = (tool.aliases || []).map((value) => value.toLowerCase());
    const category = categories[tool.category];
    const haystack = [
      ...names,
      ...aliases,
      ...localeValues(tool.summary),
      tool.category,
      ...localeValues(category),
    ].filter(Boolean).join(" ").toLowerCase();
    const matched = tokens.every((token) => haystack.includes(token));
    let score = matched ? (names.includes(q) ? 4 : aliases.includes(q) ? 3 : names.some((name) => name.includes(q)) ? 2 : 1) : 0;
    const boost = intentBoost.get(tool.id);
    if (boost != null) score = Math.max(score, boost);
    return { tool, score };
  }).filter((item) => item.score).sort((a, b) => b.score - a.score).map((item) => item.tool);
}
