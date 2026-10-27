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
// Explicit schemes accept private hosts too. Bare hosts must have a domain,
// IP address, or localhost boundary so ordinary words are not turned into URLs.
const LINK_HOST = String.raw`(?:(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:[\p{L}]{2,}|xn--[a-z\d-]+)|(?:\d{1,3}\.){3}\d{1,3}|\[[a-f\d:]+\]|localhost)`;
const LINK_TAIL = String.raw`[^\s<>"'\x60，。；！？、（）【】「」『』]+`;

export function linkGroup(link) {
  const url = new URL(link);
  return url.hostname || url.protocol.slice(0, -1);
}

function trimLinkPunctuation(value) {
  let raw = value.replace(/[.,!]+$/, "");
  // A closing bracket belongs to the URL only when it has a matching opener.
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    let balance = 0;
    for (const char of raw) {
      if (char === open) balance++;
      if (char === close) balance--;
    }
    while (balance < 0 && raw.endsWith(close)) {
      raw = raw.slice(0, -1);
      balance++;
    }
  }
  return raw.replace(/[.,!]+$/, "");
}

export function extractLinks(text, { keepQuery = true, group = false, deduplicate = true, sort = false } = {}) {
  const pattern = new RegExp(
    String.raw`(?<![@\p{L}\p{N}_/.:+-])(?:(?:[a-z][a-z\d+.-]*:\/\/|(?:mailto|tel|sms|magnet|urn|geo|news|bitcoin):)${LINK_TAIL}|\/\/${LINK_HOST}(?::\d{1,5})?(?:[/?#](?:${LINK_TAIL})?)?|${LINK_HOST}(?::\d{1,5})?(?:[/?#](?:${LINK_TAIL})?)?)`,
    "giu",
  );
  const urls = [];
  for (const match of text.matchAll(pattern)) {
    try {
      let raw = trimLinkPunctuation(match[0]);
      if (/(?:href|src|action)\s*=\s*["']$/i.test(text.slice(Math.max(0, match.index - 40), match.index))) {
        raw = raw.replace(/&amp;/gi, "&").replace(/&#(x[\da-f]+|\d+);/gi, (entity, code) => {
          const point = code[0].toLowerCase() === "x" ? parseInt(code.slice(1), 16) : Number(code);
          return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
        });
      }
      const explicit = /^[a-z][a-z\d+.-]*:\/\//i.test(raw) || /^(?:mailto|tel|sms|magnet|urn|geo|news|bitcoin):/i.test(raw);
      const url = new URL(explicit ? raw : raw.startsWith("//") ? `https:${raw}` : `https://${raw}`);
      if (["javascript:", "vbscript:", "data:"].includes(url.protocol)) continue;
      if (url.protocol === "mailto:" && !/^[^\s@]+@[^\s@]+$/.test(url.pathname)) continue;
      if (!keepQuery) {
        url.search = "";
        url.hash = "";
      }
      urls.push(url.href);
    } catch {}
  }
  const result = deduplicate ? [...new Set(urls)] : urls;
  if (sort) result.sort();
  return group
    ? Object.groupBy(result, linkGroup)
    : result;
}
export function palette(hex, scheme = "complementary") {
  if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) throw new Error("Invalid color");
  if (hex.length === 4) hex = `#${[...hex.slice(1)].map((c) => c + c).join("")}`;
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
    const css = `hsl(${hue.toFixed(1)} ${(s * 100).toFixed(1)}% ${(light * 100).toFixed(1)}%)`;
    return { css, h: hue, s, l: light, hex: hslToHex(hue, s, light) };
  });
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`;
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
  ["🤣", "笑到打滚 rofl laugh", "faces"],
  ["😅", "尴尬 sweat smile", "faces"],
  ["🤩", "崇拜 star struck", "faces"],
  ["🥰", "喜爱 smiling hearts", "faces"],
  ["😘", "亲吻 kiss", "faces"],
  ["😴", "睡觉 sleep", "faces"],
  ["🤗", "拥抱 hug", "faces"],
  ["🤭", "偷笑 giggle", "faces"],
  ["🤫", "嘘 hush", "faces"],
  ["🤯", "震惊 exploding head", "faces"],
  ["😱", "尖叫 scream", "faces"],
  ["😇", "天使 halo", "faces"],
  ["🤓", "书呆子 nerd", "faces"],
  ["😬", "紧张 grimace", "faces"],
  ["🙄", "翻白眼 rolling eyes", "faces"],
  ["😏", "得意 smirk", "faces"],
  ["🤠", "牛仔 cowboy", "faces"],
  ["🤖", "机器人 robot", "faces"],
  ["👻", "幽灵 ghost", "faces"],
  ["👍", "赞 thumb up", "people", true],
  ["👎", "踩 thumb down", "people", true],
  ["👋", "挥手 wave", "people", true],
  ["👏", "鼓掌 clap", "people", true],
  ["🙏", "感谢 pray thanks", "people", true],
  ["💪", "加油 muscle", "people", true],
  ["🤞", "好运 crossed fingers", "people", true],
  ["✌️", "胜利 victory", "people", true],
  ["🤟", "爱你 love you", "people", true],
  ["🤘", "摇滚 rock", "people", true],
  ["👌", "好的 ok", "people", true],
  ["🤏", "一点点 pinch", "people", true],
  ["👆", "向上 point up", "people", true],
  ["👇", "向下 point down", "people", true],
  ["👉", "向右 point right", "people", true],
  ["👈", "向左 point left", "people", true],
  ["🙌", "举手 raising hands", "people", true],
  ["🤝", "握手 handshake", "people", true],
  ["💯", "满分 hundred", "symbols"],
  ["💔", "心碎 broken heart", "symbols"],
  ["💖", "闪亮的心 sparkling heart", "symbols"],
  ["⭐", "星星 star", "symbols"],
  ["🌟", "发光星星 glowing star", "symbols"],
  ["❗", "感叹号 exclamation", "symbols"],
  ["❓", "问号 question", "symbols"],
  ["⭕", "圆圈 circle", "symbols"],
  ["🔴", "红色圆 red circle", "symbols"],
  ["🟢", "绿色圆 green circle", "symbols"],
  ["🔵", "蓝色圆 blue circle", "symbols"],
  ["✔️", "勾号 check mark", "symbols"],
  ["♻️", "回收 recycle", "symbols"],
  ["⚡", "闪电 lightning", "symbols"],
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
  ["🌞", "太阳 sun", "nature"],
  ["🌙", "月亮 moon", "nature"],
  ["☁️", "云 cloud", "nature"],
  ["☔", "雨伞 rain", "nature"],
  ["❄️", "雪 snow", "nature"],
  ["🌸", "樱花 blossom", "nature"],
  ["🌹", "玫瑰 rose", "nature"],
  ["🌻", "向日葵 sunflower", "nature"],
  ["🍀", "幸运草 four leaf clover", "nature"],
  ["🌲", "松树 evergreen", "nature"],
  ["🐭", "老鼠 mouse", "nature"],
  ["🐰", "兔子 rabbit", "nature"],
  ["🦊", "狐狸 fox", "nature"],
  ["🐻", "熊 bear", "nature"],
  ["🐼", "熊猫 panda", "nature"],
  ["🐨", "考拉 koala", "nature"],
  ["🐯", "老虎 tiger", "nature"],
  ["🦁", "狮子 lion", "nature"],
  ["🐮", "奶牛 cow", "nature"],
  ["🐷", "猪 pig", "nature"],
  ["🐸", "青蛙 frog", "nature"],
  ["🐵", "猴子 monkey", "nature"],
  ["🐔", "鸡 chicken", "nature"],
  ["🐧", "企鹅 penguin", "nature"],
  ["🐦", "鸟 bird", "nature"],
  ["🦋", "蝴蝶 butterfly", "nature"],
  ["🐝", "蜜蜂 bee", "nature"],
  ["🐢", "乌龟 turtle", "nature"],
  ["🐍", "蛇 snake", "nature"],
  ["🐠", "热带鱼 tropical fish", "nature"],
  ["🐳", "鲸鱼 whale", "nature"],
  ["🚀", "火箭 rocket", "objects"],
  ["💻", "电脑 computer", "objects"],
  ["🔑", "密钥 key", "objects"],
  ["🔒", "锁 lock", "objects"],
  ["📁", "文件夹 folder", "objects"],
  ["🛠️", "工具 tools", "objects"],
  ["📊", "图表 chart", "objects"],
  ["📝", "笔记 note", "objects"],
  ["🎉", "庆祝 tada", "objects"],
  ["📌", "图钉 pin", "objects"],
  ["📎", "回形针 paperclip", "objects"],
  ["📅", "日历 calendar", "objects"],
  ["⏰", "闹钟 alarm", "objects"],
  ["⌚", "手表 watch", "objects"],
  ["📱", "手机 phone", "objects"],
  ["🖨️", "打印机 printer", "objects"],
  ["📷", "相机 camera", "objects"],
  ["🎧", "耳机 headphones", "objects"],
  ["🎵", "音乐 music", "objects"],
  ["🎮", "游戏 game", "objects"],
  ["⚽", "足球 soccer", "objects"],
  ["🏀", "篮球 basketball", "objects"],
  ["🚗", "汽车 car", "objects"],
  ["✈️", "飞机 airplane", "objects"],
  ["🚲", "自行车 bicycle", "objects"],
  ["🏠", "房子 house", "objects"],
  ["🔔", "铃铛 bell", "objects"],
  ["🎁", "礼物 gift", "objects"],
  ["☕", "咖啡 coffee", "food"],
  ["🍎", "苹果 apple", "food"],
  ["🍕", "披萨 pizza", "food"],
  ["🍰", "蛋糕 cake", "food"],
  ["🍌", "香蕉 banana", "food"],
  ["🍇", "葡萄 grapes", "food"],
  ["🍓", "草莓 strawberry", "food"],
  ["🍉", "西瓜 watermelon", "food"],
  ["🍋", "柠檬 lemon", "food"],
  ["🥑", "牛油果 avocado", "food"],
  ["🥕", "胡萝卜 carrot", "food"],
  ["🌽", "玉米 corn", "food"],
  ["🍔", "汉堡 hamburger", "food"],
  ["🍟", "薯条 fries", "food"],
  ["🌭", "热狗 hot dog", "food"],
  ["🍣", "寿司 sushi", "food"],
  ["🍜", "拉面 ramen", "food"],
  ["🍩", "甜甜圈 donut", "food"],
  ["🍪", "饼干 cookie", "food"],
  ["🍫", "巧克力 chocolate", "food"],
  ["🍿", "爆米花 popcorn", "food"],
  ["🍺", "啤酒 beer", "food"],
  ["🍹", "鸡尾酒 cocktail", "food"],
];
