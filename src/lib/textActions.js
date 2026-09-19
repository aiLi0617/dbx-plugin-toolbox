export const TEXT_ACTIONS = [
  ["trim", "去首尾空白", "Trim", ["whitespace", "lines"]],
  ["empty", "去空行", "Remove empty lines", []],
  ["tabs", "空格 → Tab", "Spaces → Tab", []],
  ["spaces", "Tab → 空格", "Tab → spaces", []],
  ["sort", "行排序", "Sort lines", ["排序"]],
  ["unique", "行去重", "Deduplicate lines", ["去重"]],
  ["reverse", "行倒序", "Reverse lines", []],
  ["shuffle", "随机打乱", "Shuffle lines", ["文本打乱", "随机排序"]],
  ["prefix", "添加前缀", "Add prefix", []],
  ["suffix", "添加后缀", "Add suffix", []],
  ["number", "添加序号", "Add line numbers", ["序号", "流水号"]],
  ["unnumber", "移除序号", "Remove line numbers", ["删除序号"]],
  ["column", "按列截取", "Extract column", ["列提取"]],
  ["filter-length", "按长度过滤", "Filter by length", ["文本长度过滤"]],
  ["replace", "查找替换", "Find and replace", []],
  ["upper", "转大写", "UPPERCASE", ["case", "大小写"]],
  ["lower", "转小写", "lowercase", []],
  ["title", "标题大小写", "Title Case", []],
  ["camel", "camelCase", "camelCase", ["naming", "命名"]],
  ["pascal", "PascalCase", "PascalCase", []],
  ["snake", "snake_case", "snake_case", []],
  ["kebab", "kebab-case", "kebab-case", []],
  ["full", "转全角", "Fullwidth", ["全半角"]],
  ["half", "转半角", "Halfwidth", []],
  ["slugify", "Slugify", "Slugify", ["slug"]],
  ["strip-html", "去 HTML 标签", "Strip HTML", ["去标签"]],
  ["stats", "仅统计", "Count only", ["字数", "字数统计", "word count"]],
].map(([id, zh, en, aliases]) => ({ id, zh, en, aliases }));

export function textActionForQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return "trim";
  return TEXT_ACTIONS.find((item) => [item.id, item.zh, item.en, ...item.aliases].some((value) => value.toLowerCase() === q))?.id
    || TEXT_ACTIONS.find((item) => [item.id, item.zh, item.en, ...item.aliases].some((value) => value.toLowerCase().includes(q)))?.id
    || "trim";
}
