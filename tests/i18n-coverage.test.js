import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { categories, chrome, optionLabels, SUPPORTED_LOCALES } from "../src/lib/i18n.js";
import { APP_ERRORS, SIDECAR_ERRORS } from "../src/lib/i18nErrors.js";
import { tools } from "../src/lib/catalog.js";
import { locale as hostLocale } from "../src/lib/host.js";

const ROOT = new URL("../", import.meta.url);

function assertCompleteMap(map, label) {
  assert.equal(typeof map, "object", `${label} is a locale map`);
  for (const locale of SUPPORTED_LOCALES) {
    assert.equal(typeof map[locale], "string", `${label} has ${locale}`);
    assert.ok(map[locale].trim(), `${label}.${locale} is not blank`);
  }
}

function assertDictionary(dictionary, label) {
  for (const [key, value] of Object.entries(dictionary)) {
    const map = typeof value === "function" ? value("X") : value;
    assertCompleteMap(map, `${label}.${key}`);
  }
}

test("every shared UI locale map covers every DBX host locale", () => {
  assert.deepEqual(SUPPORTED_LOCALES, ["az", "en", "es", "it", "ja", "ko", "pt-BR", "tr", "zh-CN", "zh-TW"]);
  assertDictionary(chrome, "chrome");
  assertDictionary(categories, "categories");
  assertDictionary(optionLabels, "optionLabels");
  assertDictionary(SIDECAR_ERRORS, "SIDECAR_ERRORS");
  assertDictionary(APP_ERRORS, "APP_ERRORS");

  for (const tool of tools) {
    assertCompleteMap(tool.name, `tools.${tool.id}.name`);
    assertCompleteMap(tool.summary, `tools.${tool.id}.summary`);
  }
});

test("manifest advertises the same complete locale set as the UI", () => {
  const manifest = JSON.parse(readFileSync(new URL("manifest.json", ROOT), "utf8"));
  const localized = Object.keys(manifest.localizations || {}).sort();
  const expected = SUPPORTED_LOCALES.filter((locale) => locale !== "en").sort();
  assert.deepEqual(localized, expected);

  for (const locale of expected) {
    const entry = manifest.localizations[locale];
    assert.ok(entry.name?.trim(), `manifest ${locale} name`);
    assert.ok(entry.description?.trim(), `manifest ${locale} description`);
    for (const contribution of manifest.contributions || []) {
      const translated = entry.contributions?.[contribution.id];
      assert.ok(translated?.label?.trim(), `manifest ${locale} ${contribution.id} label`);
      assert.ok(translated?.description?.trim(), `manifest ${locale} ${contribution.id} description`);
    }
  }
});

test("application shell does not use the legacy bilingual fallback", () => {
  const source = readFileSync(new URL("src/App.svelte", ROOT), "utf8");
  assert.doesNotMatch(source, /pick\(locale\s*,\s*["'`][^,]+["'`]\s*,/);
});

test("host locale follows live environment payloads instead of a stale bridge snapshot", () => {
  assert.equal(hostLocale({ locale: "zh-CN" }), "zh-CN");
  assert.equal(hostLocale({ detail: { locale: "zh-TW" } }), "zh-TW");
  assert.equal(hostLocale({ environment: { languageTag: "ja-JP" } }), "ja");
  assert.equal(hostLocale({ payload: { language: "pt-PT" } }), "pt-BR");
});
