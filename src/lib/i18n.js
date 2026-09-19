export function isZh(locale) {
  return String(locale || "").toLowerCase().startsWith("zh");
}

export function pick(locale, zh, en) {
  return isZh(locale) ? zh : en;
}

const SIDECAR_ERRORS = {
  "Master password must be at least 8 characters": { zh: "主密码至少 8 位", en: "Master password must be at least 8 characters" },
  "Wrong master password": { zh: "主密码不正确", en: "Wrong master password" },
  "Current master password is wrong": { zh: "当前主密码不正确", en: "Current master password is wrong" },
  "Master password is wrong": { zh: "主密码不正确", en: "Master password is wrong" },
  "Key vault is locked": { zh: "密钥库已锁定", en: "Key vault is locked" },
  "Key vault already exists": { zh: "密钥库已经存在", en: "Key vault already exists" },
  "Key vault is already unlocked": { zh: "密钥库已解锁", en: "Key vault is already unlocked" },
  "Key vault not found": { zh: "找不到密钥库", en: "Key vault not found" },
  "Unknown key id": { zh: "找不到这把密钥", en: "Unknown key id" },
  "Name is required": { zh: "请填写名称", en: "Name is required" },
  "Name is required to save": { zh: "写入密钥库需要填写名称", en: "Name is required to save" },
  "Material is required": { zh: "请粘贴密钥材料", en: "Material is required" },
  "Unsupported algorithm": { zh: "不支持该算法", en: "Unsupported algorithm" },
  "Cannot generate this algorithm; import material instead": { zh: "该算法不能随机生成，请粘贴已有密钥", en: "Cannot generate this algorithm; import material instead" },
  "Key material must be hex or base64": { zh: "密钥材料须为 hex 或 base64", en: "Key material must be hex or base64" },
  "Invalid PEM": { zh: "PEM 无效", en: "Invalid PEM" },
  "Do not store certificates in the key vault; use the cert tool": { zh: "证书请用「证书 / SSH 指纹」，不要存进密钥库", en: "Do not store certificates in the key vault; use the cert tool" },
  "PEM must be an RSA private or public key for the asymmetric cipher tool": { zh: "PEM 须为 RSA 公钥或私钥，供非对称加密使用", en: "PEM must be an RSA private or public key for the asymmetric cipher tool" },
  "algorithm must be rsa or sm2": { zh: "算法须为 RSA 或 SM2", en: "algorithm must be rsa or sm2" },
  "Use generate-keypair for RSA and SM2": { zh: "RSA / SM2 请用「非对称密钥」", en: "Use Asymmetric key for RSA and SM2" },
  "RSA bits must be 2048, 3072, or 4096": { zh: "RSA 位数须为 2048、3072 或 4096", en: "RSA bits must be 2048, 3072, or 4096" },
  "RSA format must be pkcs8 or pkcs1": { zh: "RSA 格式须为 PKCS#8 或 PKCS#1", en: "RSA format must be pkcs8 or pkcs1" },
  "RSA padding must be oaep or pkcs1": { zh: "RSA 填充须为 OAEP 或 PKCS#1", en: "RSA padding must be oaep or pkcs1" },
  "Invalid RSA private key PEM": { zh: "RSA 私钥 PEM 无效", en: "Invalid RSA private key PEM" },
  "Invalid RSA private key PEM (PKCS#8 or PKCS#1)": { zh: "RSA 私钥须为 PKCS#8 或 PKCS#1 PEM", en: "Invalid RSA private key PEM (PKCS#8 or PKCS#1)" },
  "Invalid RSA public/private PEM": { zh: "RSA 公钥或私钥 PEM 无效", en: "Invalid RSA public/private PEM" },
  "Invalid RSA public/private PEM (PKCS#8 or PKCS#1)": { zh: "RSA 密钥须为 PKCS#8 或 PKCS#1 PEM", en: "Invalid RSA public/private PEM (PKCS#8 or PKCS#1)" },
  "Plaintext is too long for this RSA key and padding": { zh: "明文超过当前 RSA 密钥和填充允许的长度", en: "Plaintext is too long for this RSA key and padding" },
  "Vault data is corrupt": { zh: "密钥库数据已损坏", en: "Vault data is corrupt" },
  "Vault file is truncated": { zh: "密钥库文件不完整", en: "Vault file is truncated" },
  "Vault file magic mismatch": { zh: "不是有效的密钥库文件", en: "Vault file magic mismatch" },
  "Unsupported vault version": { zh: "不支持的密钥库版本", en: "Unsupported vault version" },
  "Failed to encrypt vault": { zh: "加密密钥库失败", en: "Failed to encrypt vault" },
  "Failed to init vault cipher": { zh: "无法初始化密钥库加密", en: "Failed to init vault cipher" },
  "Unsupported JWT algorithm": { zh: "不支持该 JWT 签名算法", en: "Unsupported JWT algorithm" },
  "JWT header algorithm does not match the selected algorithm": { zh: "JWT Header 中的算法与所选算法不一致", en: "JWT header algorithm does not match the selected algorithm" },
  "JWT signing failed": { zh: "JWT 签名失败", en: "JWT signing failed" },
  "Cannot resolve user data directory": { zh: "无法确定用户数据目录", en: "Cannot resolve user data directory" },
  "Sidecar is not ready": { zh: "后端还在启动，请稍后再试，或重新打开工作台。", en: "The backend is still starting. Try again, or reopen the workbench." },
};

export function errorMessage(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  return String(err.message || err.msg || err.data?.message || err.toString?.() || "");
}

export function localizeError(locale, err) {
  const raw = errorMessage(err).trim();
  if (!raw) return pick(locale, "操作失败", "Request failed");
  if (/sidecar is not ready|backend is not ready/i.test(raw)) {
    return SIDECAR_ERRORS["Sidecar is not ready"][isZh(locale) ? "zh" : "en"];
  }
  const exact = SIDECAR_ERRORS[raw];
  if (exact) return pick(locale, exact.zh, exact.en);
  const keyLen = raw.match(/^Key length must be (\d+) bytes$/);
  if (keyLen) return pick(locale, `密钥长度必须是 ${keyLen[1]} 字节`, raw);
  if (raw === "Missing password" || raw === "Missing currentPassword" || raw === "Missing newPassword") {
    return pick(locale, "请填写主密码", "Enter the master password");
  }
  return raw;
}

export const chrome = {
  search: { zh: "搜索工具", en: "Search tools" },
  results: { zh: "搜索结果", en: "Results" },
  recent: { zh: "最近", en: "Recent" },
  empty: { zh: "没有匹配的工具", en: "No matching tools" },
  pin: { zh: "固定到常用工具", en: "Pin tool" },
  unpin: { zh: "从常用工具移除", en: "Unpin tool" },
  pinned: { zh: "常用工具", en: "Pinned tools" },
  allTools: { zh: "全部工具", en: "All tools" },
  allToolsHint: { zh: "按分类浏览全部工具；固定常用工具后，它会出现在左侧栏。", en: "Browse every tool by category. Pin the ones you use often to keep them in the sidebar." },
  emptyMine: { zh: "还没有常用工具，可从全部工具中固定。", en: "No pinned tools yet. Pin tools from the full catalog." },
  run: { zh: "运行", en: "Run" },
  copy: { zh: "复制输出", en: "Copy output" },
  clear: { zh: "清空", en: "Clear" },
  input: { zh: "输入", en: "Input" },
  output: { zh: "输出", en: "Output" },
  copied: { zh: "已复制", en: "Copied" },
  ready: { zh: "已就绪", en: "Ready" },
  subtitle: { zh: "本地计算，密钥不进浏览器存储", en: "Runs locally. Keys never enter browser storage." },
  vault: { zh: "密钥库", en: "Key vault" },
  vaultLocked: { zh: "密钥库（已锁定）", en: "Key vault (locked)" },
  vaultUnlocked: { zh: "密钥库（已解锁）", en: "Key vault (unlocked)" },
};

export const categories = {
  convert: { zh: "转换与计算", en: "Conversion & calculation" },
  encode: { zh: "编码与转义", en: "Encoding & escaping" },
  format: { zh: "数据与代码", en: "Data & code" },
  image: { zh: "图片处理", en: "Image tools" },
  security: { zh: "安全与校验", en: "Security & checksums" },
  generate: { zh: "生成工具", en: "Generators" },
  text: { zh: "文本处理", en: "Text processing" },
};

export const optionLabels = {
  direction: { zh: "方向", en: "Direction" },
  path: { zh: "路径", en: "Path" },
  table: { zh: "表名", en: "Table" },
  from: { zh: "从", en: "From" },
  to: { zh: "到", en: "To" },
  now: { zh: "模式", en: "Mode" },
  mode: { zh: "模式", en: "Mode" },
  encoding: { zh: "编码", en: "Encoding" },
  language: { zh: "语言", en: "Language" },
  kind: { zh: "类型", en: "Kind" },
  sm4Mode: { zh: "SM4 模式", en: "SM4 mode" },
  url: { zh: "变体", en: "Variant" },
  mime: { zh: "MIME", en: "MIME" },
  op: { zh: "操作", en: "Operation" },
  algorithm: { zh: "算法", en: "Algorithm" },
  inputHex: { zh: "输入格式", en: "Input format" },
  action: { zh: "操作", en: "Action" },
  sortKeys: { zh: "键顺序", en: "Key order" },
  style: { zh: "风格", en: "Style" },
  find: { zh: "查找", en: "Find" },
  replace: { zh: "替换", en: "Replace" },
  pattern: { zh: "表达式", en: "Pattern" },
  flags: { zh: "标志", en: "Flags" },
  affix: { zh: "前后缀", en: "Affix" },
  size: { zh: "长度", en: "Length" },
  length: { zh: "长度", en: "Length" },
  symbols: { zh: "符号", en: "Symbols" },
  paragraphs: { zh: "行数", en: "Lines" },
};
