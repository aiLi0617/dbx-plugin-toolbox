// Shared metadata for the expansion. Each row is a directly discoverable tool.
export const EXPANSION_TOOLS = [
  [
    "json-diff",
    "data",
    "JSON 结构对比",
    "JSON structure diff",
    "developer-expansion",
    "Compare JSON fields",
    "按字段比较 JSON 的新增、删除与修改",
  ],
  [
    "yaml-tree",
    "data",
    "YAML 树形查看",
    "YAML tree viewer",
    "developer-expansion",
    "Browse YAML documents as trees",
    "折叠查看 YAML 多文档与节点路径",
  ],
  [
    "basic-auth",
    "developer",
    "Basic Auth 生成器",
    "Basic Auth generator",
    "basic-auth",
    "Generate an Authorization header from a username and password",
    "通过用户名、密码生成认证请求头",
  ],
  [
    "safelink",
    "developer",
    "SafeLink 解码",
    "SafeLink decoder",
    "developer-expansion",
    "Extract the original URL without visiting it",
    "提取安全链接中的原始网址，不访问目标",
  ],
  [
    "regex-reference",
    "developer",
    "正则语法速查",
    "Regex reference",
    "developer-expansion",
    "Browse syntax and try examples",
    "查阅正则语法并测试示例",
  ],
  [
    "wifi-qr",
    "generate",
    "Wi-Fi 二维码",
    "Wi-Fi QR code",
    "wifi-qr",
    "Create a Wi-Fi connection QR code",
    "生成包含网络名称、密码和加密方式的连接二维码",
  ],
  [
    "roman",
    "calculate",
    "罗马数字转换",
    "Roman numeral converter",
    "developer-expansion",
    "Convert integers and Roman numerals",
    "整数与罗马数字双向转换",
  ],
  [
    "mac-generator",
    "network",
    "MAC 地址生成",
    "MAC address generator",
    "developer-expansion",
    "Generate locally administered MAC addresses",
    "批量生成 MAC 地址，支持指定前缀和格式",
  ],
  [
    "ipv6-ula",
    "network",
    "IPv6 ULA 生成",
    "IPv6 ULA generator",
    "developer-expansion",
    "Generate private IPv6 prefixes",
    "生成私有 IPv6 ULA 前缀",
  ],
  [
    "ipv4-range",
    "network",
    "IPv4 范围与汇总",
    "IPv4 ranges and aggregation",
    "developer-expansion",
    "Expand ranges and summarize CIDRs",
    "展开地址范围并汇总最小 CIDR 集合",
  ],
  ...[
    ["math-expression", "数学表达式计算", "Math expression"],
    ["unit-converter", "单位换算", "Unit converter"],
    ["percentage", "百分比计算", "Percentage calculator"],
    ["statistics", "数值统计", "Statistics"],
    ["business-days", "工作日计算", "Business days"],
    ["temperature", "温度换算", "Temperature converter"],
    ["eta", "ETA 预计完成时间", "ETA calculator"],
    ["stopwatch", "秒表与计次", "Stopwatch and laps"],
    ["benchmark", "基准测试结果对比", "Benchmark comparison"],
    ["compound-interest", "复利计算", "Compound interest"],
  ].map(([id, zh, en]) => [
    id,
    "calculate",
    zh,
    en,
    "calculator-suite",
    en,
    zh,
  ]),
  ...[
    ["bcrypt", "Bcrypt 哈希与校验", "Bcrypt hash and verify"],
    ["password-strength", "密码强度分析", "Password strength"],
    ["iban", "IBAN 校验", "IBAN validator"],
    ["bip39", "BIP39 助记词", "BIP39 mnemonic"],
  ].map(([id, zh, en]) => [
    id,
    "security",
    zh,
    en,
    "security-expansion",
    en,
    zh,
  ]),
  ...[
    ["figlet", "Figlet 字符横幅", "Figlet banner"],
    ["numeronym", "数字缩写（Numeronym）", "Numeronym"],
    ["english-plural", "英文单复数转换", "English singular and plural"],
    ["email-normalizer", "邮箱规范化", "Email normalizer"],
    ["url-extractor", "URL 提取", "URL extractor"],
    ["emoji-picker", "Emoji 选择器", "Emoji picker"],
    ["color-palette", "配色方案生成", "Color palette"],
    ["rich-text", "HTML 富文本编辑器", "HTML rich text editor"],
    ["lunar-calendar", "农历阳历转换", "Lunar and solar calendar"],
  ].map(([id, zh, en]) => [
    id,
    id === "lunar-calendar" ? "calculate" : "text",
    zh,
    en,
    "content-expansion",
    en,
    zh,
  ]),
  ...[
    ["gif-compress", "GIF 压缩", "GIF compressor"],
    ["gif-crop", "GIF 裁剪", "GIF cropper"],
    ["gif-frames", "GIF 帧编辑", "GIF frame editor"],
  ].map(([id, zh, en]) => [id, "image", zh, en, "gif-editor", en, zh]),
  [
    "text-speech",
    "text",
    "文字朗读",
    "Read aloud",
    "speech",
    "Read text using local voices",
    "使用本地语音朗读文字",
  ],
  ...[
    ["merge", "合并", "Merge"],
    ["split", "拆分", "Split"],
    ["organize", "页面整理", "Organize pages"],
    ["rotate", "页面旋转", "Rotate pages"],
    ["delete", "删除页面", "Delete pages"],
    ["extract", "提取页面", "Extract pages"],
    ["watermark", "文字水印", "Text watermark"],
    ["page-numbers", "添加页码", "Page numbers"],
    ["crop", "页面裁剪", "Crop pages"],
    ["visual-signature", "视觉签名", "Visual signature"],
    ["images", "转图片", "To images"],
    ["compress", "压缩", "Compress"],
    ["encrypt", "密码加密", "Encrypt"],
    ["decrypt", "密码解密", "Decrypt"],
    ["signature-check", "数字签名检查", "Check digital signatures"],
  ].map(([id, zh, en]) => [
    `pdf-${id}`,
    "data",
    `PDF ${zh}`,
    `PDF ${en}`,
    "pdf-tool",
    `PDF ${en}`,
    `在本地处理 PDF：${zh}`,
  ]),
];

const DESCRIPTIONS = {
  "math-expression": [
    "计算括号、幂、三角函数和对数等表达式",
    "Evaluate expressions with powers, trigonometry and logarithms",
  ],
  "unit-converter": [
    "换算长度、面积、体积、质量、速度和数据容量",
    "Convert length, area, volume, mass, speed and data units",
  ],
  percentage: [
    "计算百分比、占比及增减幅度并展示公式",
    "Calculate percentages, proportions and changes with formulas",
  ],
  statistics: [
    "计算均值、中位数、众数、方差和标准差",
    "Calculate mean, median, modes, variance and standard deviation",
  ],
  "business-days": [
    "按周末规则和自定义节假日计算工作日或截止日期",
    "Calculate working days and deadlines with custom holidays",
  ],
  temperature: [
    "换算摄氏、华氏、开尔文和兰金温标",
    "Convert Celsius, Fahrenheit, Kelvin and Rankine",
  ],
  eta: [
    "根据总量、已完成量和耗时估算剩余时间",
    "Estimate time remaining from progress and elapsed time",
  ],
  stopwatch: [
    "开始、暂停、计次并导出分圈记录",
    "Start, pause and export stopwatch lap records",
  ],
  benchmark: [
    "比较多组跑分样本的均值、波动和相对性能",
    "Compare benchmark sample averages, variation and relative performance",
  ],
  "compound-interest": [
    "按本金、利率、计息频率和定投计算本息",
    "Calculate compound growth with regular contributions",
  ],
  bcrypt: [
    "生成带盐哈希或校验密码与已有哈希是否匹配",
    "Generate salted hashes and verify passwords against Bcrypt hashes",
  ],
  "password-strength": [
    "本地分析弱密码模式并提供改进建议",
    "Estimate password strength locally and suggest improvements",
  ],
  iban: [
    "检查国际银行账号的国家长度和校验和",
    "Check IBAN country lengths and checksums",
  ],
  bip39: [
    "生成、校验助记词并使用可选口令派生种子",
    "Generate and validate mnemonics and derive seeds with an optional passphrase",
  ],
  figlet: [
    "使用内置 Figlet 字体生成多行 ASCII 艺术字",
    "Render ASCII banners with bundled Figlet fonts",
  ],
  numeronym: [
    "把长单词转换为 i18n、a11y 等数字缩写",
    "Abbreviate words into numeronyms such as i18n and a11y",
  ],
  "english-plural": [
    "双向转换英文名词，支持不规则词和不可数名词",
    "Convert English singular and plural nouns including irregular forms",
  ],
  "email-normalizer": [
    "按选项规范邮箱，服务商规则需主动启用",
    "Normalize email addresses with opt-in provider-specific rules",
  ],
  "url-extractor": [
    "提取链接、裸域名和 mailto，支持去重与域名分组",
    "Extract URLs, bare domains and mailto links with deduplication and grouping",
  ],
  "emoji-picker": [
    "分类浏览、搜索和复制 Emoji 及肤色变体",
    "Browse, search and copy Emoji with skin tone variants",
  ],
  "color-palette": [
    "根据基础色生成配色并导出 CSS 或 JSON",
    "Generate color palettes and export CSS or JSON",
  ],
  "rich-text": [
    "可视化编辑标题、段落、列表和链接并查看 HTML",
    "Visually edit headings, paragraphs, lists and links and inspect HTML",
  ],
  "lunar-calendar": [
    "双向换算中国农历与公历并校验闰月",
    "Convert between Chinese lunar and solar dates including leap months",
  ],
  "gif-compress": [
    "调整已有 GIF 的颜色数、尺寸和帧率并比较体积",
    "Optimize GIF colors, dimensions and frame rate and compare file sizes",
  ],
  "gif-crop": [
    "对已有 GIF 的全部帧应用相同裁剪区域",
    "Crop every frame of an imported GIF to the same rectangle",
  ],
  "gif-frames": [
    "提取、删除和重排 GIF 帧并修改时长及循环次数",
    "Extract, delete and reorder GIF frames and edit timing and loops",
  ],
  "pdf-merge": [
    "按指定顺序合并多个 PDF",
    "Merge PDF files in the specified order",
  ],
  "pdf-split": [
    "按单页或多个页码范围拆成文件",
    "Split a PDF into individual pages or page ranges",
  ],
  "pdf-organize": [
    "通过缩略图拖拽调整页面顺序",
    "Reorder PDF pages using draggable thumbnails",
  ],
  "pdf-rotate": ["旋转全部或指定 PDF 页面", "Rotate all or selected PDF pages"],
  "pdf-delete": [
    "删除指定页码或页码范围",
    "Remove selected pages or ranges from a PDF",
  ],
  "pdf-extract": [
    "将指定页面另存为一个新 PDF",
    "Save selected pages as a new PDF",
  ],
  "pdf-watermark": [
    "设置文字、位置、角度和透明度并添加水印",
    "Add text watermarks with position, angle and opacity controls",
  ],
  "pdf-page-numbers": [
    "设置起始页码、位置和格式",
    "Add page numbers with custom starting number, position and format",
  ],
  "pdf-crop": [
    "调整指定 PDF 页面的可见范围",
    "Adjust the visible bounds of selected PDF pages",
  ],
  "pdf-visual-signature": [
    "添加手写或图片签名并调整位置和尺寸",
    "Place handwritten or image signatures on PDF pages",
  ],
  "pdf-images": [
    "将选定页面导出为 PNG 或 JPEG",
    "Export selected PDF pages as PNG or JPEG images",
  ],
  "pdf-compress": [
    "优化资源并显示处理前后的体积变化",
    "Optimize PDF resources and compare file sizes",
  ],
  "pdf-encrypt": [
    "为新的 PDF 副本设置打开密码",
    "Set an opening password on a new PDF copy",
  ],
  "pdf-decrypt": [
    "使用已知密码生成解密副本",
    "Create an unencrypted PDF copy using a known password",
  ],
  "pdf-signature-check": [
    "分别报告内容完整性、证书有效期及可验证的链和信任信息",
    "Report signature integrity, certificate validity and verifiable chain information",
  ],
};
for (const row of EXPANSION_TOOLS)
  if (DESCRIPTIONS[row[0]]) {
    [row[6], row[5]] = DESCRIPTIONS[row[0]];
  }

export const EXPANSION_BY_ID = Object.fromEntries(
  EXPANSION_TOOLS.map((row) => [row[0], row]),
);
