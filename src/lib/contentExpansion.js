export function normalizeEmailList(
  text,
  { gmail = false, stripPlus = false, lowerLocal = false } = {},
) {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const value = line.trim();
      const at = value.lastIndexOf("@");
      if (at <= 0 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw new Error("Invalid email address");
      let local = value.slice(0, at);
      let domain = value.slice(at + 1).toLowerCase();
      if (lowerLocal) local = local.toLowerCase();
      if (gmail && ["gmail.com", "googlemail.com"].includes(domain)) {
        domain = "gmail.com";
        local = local.toLowerCase().replaceAll(".", "");
        if (stripPlus) local = local.split("+")[0];
      }
      return `${local}@${domain}`;
    })
    .join("\n");
}
export function extractLinks(text, { keepQuery = true, group = false } = {}) {
  const pattern =
    /(?:https?:\/\/|mailto:)[^\s<>"']+|\b(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;
  const urls = [];
  for (const match of text.matchAll(pattern)) {
    if (match.index > 0 && /[@\w]/.test(text[match.index - 1])) continue;
    try {
      const raw = match[0].replace(/[),.;!?]+$/, "");
      const url = new URL(/^[a-z]+:/i.test(raw) ? raw : `https://${raw}`);
      if (!keepQuery) {
        url.search = "";
        url.hash = "";
      }
      urls.push(url.href);
    } catch {}
  }
  const unique = [...new Set(urls)];
  return group
    ? Object.groupBy(unique, (url) => new URL(url).hostname || "mailto")
    : unique;
}
export function palette(hex, scheme = "complementary") {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error("Invalid color");
  const [r, g, b] = [1, 3, 5].map(
      (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min,
    l = (max + min) / 2;
  let h = 0;
  if (delta)
    h =
      (max === r
        ? ((g - b) / delta) % 6
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4) * 60;
  const s = delta ? delta / (1 - Math.abs(2 * l - 1)) : 0;
  const offsets = {
    complementary: [0, 180],
    analogous: [-30, 0, 30],
    triadic: [0, 120, 240],
    tetradic: [0, 90, 180, 270],
    monochrome: [0, 0, 0, 0, 0],
  }[scheme];
  if (!offsets) throw new Error("Invalid scheme");
  return offsets.map((offset, i) => {
    const hue = (((h + offset) % 360) + 360) % 360;
    const light = scheme === "monochrome" ? 0.15 + i * 0.175 : l;
    return {
      css: `hsl(${hue.toFixed(1)} ${(s * 100).toFixed(1)}% ${(light * 100).toFixed(1)}%)`,
    };
  });
}
export const EMOJI = [
  ["😀", "笑脸 smile happy", "faces"],
  ["😂", "大笑 laugh tears", "faces"],
  ["😊", "微笑 blush", "faces"],
  ["😍", "爱 love heart eyes", "faces"],
  ["😎", "酷 cool", "faces"],
  ["🤔", "思考 think", "faces"],
  ["😢", "哭 sad", "faces"],
  ["😭", "大哭 cry", "faces"],
  ["😡", "生气 angry", "faces"],
  ["🥳", "庆祝 party", "faces"],
  ["👍", "赞 thumb up", "people", true],
  ["👎", "踩 thumb down", "people", true],
  ["👋", "挥手 wave", "people", true],
  ["👏", "鼓掌 clap", "people", true],
  ["🙏", "感谢 pray thanks", "people", true],
  ["💪", "加油 muscle", "people", true],
  ["👩‍💻", "女程序员 woman developer", "people"],
  ["👨‍💻", "男程序员 man developer", "people"],
  ["❤️", "红心 heart love", "symbols"],
  ["✅", "完成 check", "symbols"],
  ["❌", "错误 cross", "symbols"],
  ["⚠️", "警告 warning", "symbols"],
  ["✨", "闪光 sparkles", "symbols"],
  ["🔥", "火 fire", "nature"],
  ["🌈", "彩虹 rainbow", "nature"],
  ["🌱", "幼苗 plant", "nature"],
  ["🐱", "猫 cat", "nature"],
  ["🐶", "狗 dog", "nature"],
  ["🌍", "地球 earth", "nature"],
  ["🚀", "火箭 rocket", "objects"],
  ["💻", "电脑 computer", "objects"],
  ["🔑", "密钥 key", "objects"],
  ["🔒", "锁 lock", "objects"],
  ["📁", "文件夹 folder", "objects"],
  ["🛠️", "工具 tools", "objects"],
  ["📊", "图表 chart", "objects"],
  ["📝", "笔记 note", "objects"],
  ["🎉", "庆祝 tada", "objects"],
  ["☕", "咖啡 coffee", "food"],
  ["🍎", "苹果 apple", "food"],
  ["🍕", "披萨 pizza", "food"],
  ["🍰", "蛋糕 cake", "food"],
];
