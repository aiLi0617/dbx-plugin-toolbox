import test from 'node:test';
import assert from 'node:assert/strict';
import { locale, observeEnvironment } from '../src/lib/host.js';
import { pick, normalizeLocale, SUPPORTED_LOCALES } from '../src/lib/locale.js';
import { UI_MESSAGES } from '../src/lib/uiMessages.js';
import { readFileSync } from 'node:fs';
import { tools } from '../src/lib/catalog.js';

test('live environment captures document dispatch and ignores application context language', () => {
  const oldWindow = globalThis.window;
  const listeners = new Map();
  let initListener;
  let off = false;
  globalThis.window = {
    dbxPlugin: { locale: 'ja', onInit(fn) { initListener = fn; fn({ language: 'sql' }); return () => { off = true; }; } },
    addEventListener(name, fn, capture) { assert.equal(capture, true); listeners.set(name, fn); },
    removeEventListener(name, fn, capture) { assert.equal(capture, true); assert.equal(listeners.get(name), fn); listeners.delete(name); },
  };
  try {
    let current;
    const stop = observeEnvironment(event => { current = locale(event); });
    assert.equal(current, 'ja');
    for (const next of SUPPORTED_LOCALES) {
      window.dbxPlugin.locale = next;
      listeners.get('dbx-plugin-env')({ detail: { locale: next } });
      assert.equal(current, next);
    }
    window.dbxPlugin.locale = 'ko';
    initListener({ locale: 'en' });
    assert.equal(current, 'ko');
    stop();
    assert.equal(listeners.size, 0);
    assert.equal(off, true);
  } finally { globalThis.window = oldWindow; }
});

test('all offline UI entries cover host locales and preserve placeholder slots', () => {
  const slots = value => [...value.matchAll(/\{\d+\}/g)].map(m => m[0]).sort();
  for (const [source, translations] of Object.entries(UI_MESSAGES)) {
    for (const locale of SUPPORTED_LOCALES) {
      assert.ok(translations[locale]?.trim(), `${locale}: ${source}`);
      // Chinese originals sometimes compose a different number of expressions;
      // templates are keyed by English and only translated target slots apply.
      if (locale !== 'zh-CN') assert.deepEqual(slots(translations[locale]), slots(source), `${locale}: ${source}`);
    }
  }
});

test('regional tags and legacy tool labels use complete dictionaries', () => {
  assert.equal(normalizeLocale(' ko_KR '), 'ko');
  assert.equal(normalizeLocale('tr-TR'), 'tr');
  assert.equal(normalizeLocale('az-Latn-AZ'), 'az');
  assert.equal(pick('ja', '当前值信息', 'Current value information'), '現在の値の情報');
  assert.equal(pick('ko', '明文', 'Plaintext'), '평문');
  assert.equal(pick('tr', '复制 abc.$[x]', 'Copy abc.$[x]'), 'abc.$[x] kopyala');
  assert.equal(pick('ja', '进制 16', 'Base 16'), '16 進数');
  assert.equal(pick('es', '未知', 'User data untouched'), 'User data untouched');
  assert.equal(pick('ko', { en: 'Base / Hex', 'zh-CN': 'Base / Hex' }), 'Base / Hex');
});

test('extracted source messages and generated catalog names all have offline entries', () => {
  const inventory = JSON.parse(readFileSync(new URL('../scripts/ui-message-inventory.json', import.meta.url), 'utf8'));
  for (const source of Object.keys(inventory)) assert.ok(UI_MESSAGES[source], `Unregistered message: ${source}`);
  for (const tool of tools) {
    for (const locale of ['az', 'ko', 'tr']) {
      assert.equal(tool.name[locale], UI_MESSAGES[tool.name.en][locale]);
      assert.notEqual(tool.summary[locale], tool.summary.en, `${locale}: ${tool.id} summary`);
    }
  }
});
