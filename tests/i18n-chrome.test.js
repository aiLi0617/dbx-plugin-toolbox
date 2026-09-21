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
  assert.equal(pick("ja", chrome.pluginName), "DBX ツールボックス");
  assert.equal(pick("es", chrome.pluginName), "Herramientas DBX");
  assert.equal(pick("it", chrome.pluginName), "Strumenti DBX");
  assert.equal(pick("pt-BR", chrome.pluginName), "Ferramentas DBX");
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

test("Japanese shell, tool names, and summaries do not fall back to English", () => {
  assert.equal(pick("ja", chrome.home), "ホーム");
  assert.equal(pick("ja", chrome.brand), "ツールボックス");
  assert.equal(pick("ja", chrome.searchPlaceholder), "ツール、機能、キーワードを検索");
  assert.equal(pick("ja", chrome.recent), "最近");
  assert.equal(pick("ja-JP", chrome.openedAppearHere), "開いたツールがここに表示されます");
  assert.equal(pick("ja", chrome.vaultShort), "保管庫");

  const expected = new Map([
    ["json", "JSON ワークベンチ"],
    ["code-format", "コードフォーマッター"],
    ["network-calc", "ネットワーク / CIDR"],
    ["hash", "ハッシュとチェックサム"],
    ["uuid", "一意の ID"],
  ]);
  for (const tool of tools) {
    assert.ok(pick("ja", tool.name), `${tool.id} has a Japanese name`);
    assert.ok(pick("ja", tool.summary), `${tool.id} has a Japanese summary`);
  }
  for (const [id, name] of expected) {
    const tool = tools.find((item) => item.id === id);
    assert.equal(pick("ja", tool.name), name);
  }
  assert.match(pick("ja", tools.find((tool) => tool.id === "json").summary), /整形/);
  assert.match(pick("ja", tools.find((tool) => tool.id === "image-process").summary), /切り抜き/);
});

test("every advertised non-English locale has native catalog summaries", () => {
  for (const locale of ["es", "it", "ja", "pt-BR", "zh-CN", "zh-TW"]) {
    for (const tool of tools) {
      const localized = pick(locale, tool.summary);
      assert.ok(localized, `${tool.id} has a ${locale} summary`);
      assert.notEqual(localized, pick("en", tool.summary), `${tool.id} does not fall back to English in ${locale}`);
    }
  }

  assert.match(pick("es", tools.find((tool) => tool.id === "network-calc").summary), /subredes/);
  assert.match(pick("it", tools.find((tool) => tool.id === "regex").summary), /espressioni regolari/);
  assert.match(pick("pt-BR", tools.find((tool) => tool.id === "image-process").summary), /marca d'água/);
});

test("legacy bilingual pick still treats both Chinese locales as Chinese", () => {
  assert.equal(pick("zh-TW", "侧栏", "Sidebar"), "侧栏");
  assert.equal(pick("zh-CN", "侧栏", "Sidebar"), "侧栏");
  assert.equal(pick("en", "侧栏", "Sidebar"), "Sidebar");
});
