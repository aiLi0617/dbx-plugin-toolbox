import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeSourceTranslations, needsTranslation } from '../scripts/ui-translation-utils.mjs';

test('translation builder processes registered English fallbacks and empty targets', () => {
  const message = { en: 'Generate hash', 'zh-CN': '生成哈希', es: 'Generate hash' };
  assert.equal(needsTranslation(message, 'es'), true);
  assert.equal(needsTranslation(message, 'ja'), true);
  assert.equal(needsTranslation({ ...message, es: '  ' }, 'es'), true);
  assert.equal(needsTranslation({ ...message, es: 'Generar hash' }, 'es'), false);
  assert.equal(needsTranslation({ en: 'JSON', 'zh-CN': 'JSON', es: 'JSON' }, 'es'), false);
});

test('source refresh preserves translations while replacing English fallback values', () => {
  const current = { en: 'Copy', 'zh-CN': '旧文案', es: 'Copiar', ja: 'Copy' };
  const merged = mergeSourceTranslations(current, {
    en: 'Copy', 'zh-CN': '复制', es: 'Copy', ja: 'コピー', ko: '복사', tr: undefined,
  });
  assert.deepEqual(merged, {
    en: 'Copy', 'zh-CN': '复制', es: 'Copiar', ja: 'コピー', ko: '복사',
  });
  assert.equal(mergeSourceTranslations(undefined, { en: 'Copy', 'zh-CN': '复制' }).en, 'Copy');
});
