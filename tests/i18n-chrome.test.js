import test from "node:test";
import assert from "node:assert/strict";
import { chrome, pick, categories } from "../src/lib/i18n.js";
import { tools } from "../src/lib/catalog.js";

test("chrome distinguishes zh-CN and zh-TW for sidebar/home copy", () => {
  assert.equal(pick("zh-CN", chrome.home), "首页");
  assert.equal(pick("zh-TW", chrome.home), "首頁");
  assert.equal(pick("zh-CN", chrome.vaultShort), "密钥库");
  assert.equal(pick("zh-TW", chrome.vaultShort), "金鑰庫");
  assert.equal(pick("zh-CN", chrome.expandSidebar), "展开侧栏");
  assert.equal(pick("zh-TW", chrome.expandSidebar), "展開側欄");
  assert.equal(pick("zh-CN", chrome.searchPlaceholder), "搜索工具、功能或关键字");
  assert.equal(pick("zh-TW", chrome.searchPlaceholder), "搜尋工具、功能或關鍵字");
  assert.equal(pick("zh-CN", chrome.homeTitle), "需要使用什么工具？");
  assert.equal(pick("zh-TW", chrome.homeTitle), "需要使用什麼工具？");
  assert.equal(pick("zh-CN", chrome.showAll(12)), "展开全部（12）");
  assert.equal(pick("zh-TW", chrome.showAll(12)), "展開全部（12）");
  assert.notEqual(pick("zh-CN", chrome.home), pick("zh-TW", chrome.home));
});

test("categories and tool names resolve Traditional Chinese for zh-TW", () => {
  assert.equal(pick("zh-CN", categories.format), "数据与代码");
  assert.equal(pick("zh-TW", categories.format), "資料與程式碼");
  const dataConvert = tools.find((tool) => tool.id === "data-convert");
  assert.ok(dataConvert);
  assert.equal(pick("zh-CN", dataConvert.name), "数据格式转换");
  assert.equal(pick("zh-TW", dataConvert.name), "資料格式轉換");
  assert.match(pick("zh-TW", dataConvert.summary), /互轉/);
  assert.match(pick("zh-CN", dataConvert.summary), /互转/);
});

test("legacy bilingual pick still treats both Chinese locales as Chinese", () => {
  assert.equal(pick("zh-TW", "侧栏", "Sidebar"), "侧栏");
  assert.equal(pick("zh-CN", "侧栏", "Sidebar"), "侧栏");
  assert.equal(pick("en", "侧栏", "Sidebar"), "Sidebar");
});
