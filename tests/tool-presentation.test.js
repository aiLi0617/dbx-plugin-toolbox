import test from 'node:test';
import assert from 'node:assert/strict';
import { tools, CATEGORY_ORDER, searchTools, toolsByCategory, toolsByIds } from '../src/lib/catalog.js';
import { categories, SUPPORTED_LOCALES, legacyCategories, localeValues } from '../src/lib/i18n.js';
import { presentTool } from '../src/lib/toolPresentation.js';
import { TOOL_REGISTRY } from '../src/lib/viewRegistry.js';
import { pushRecent, sanitizeToolIds, toolOptionsForQuery } from '../src/lib/navigation.js';
import { buildCatalogSections } from '../src/lib/catalogGroups.js';

test('eight categories cover every existing entry and retain hidden compatibility entries', () => {
  assert.deepEqual(CATEGORY_ORDER, ['developer', 'text', 'calculate', 'network', 'system', 'security', 'image', 'document']);
  assert.deepEqual(Object.keys(categories).sort(), [...CATEGORY_ORDER].sort());
  assert.equal(tools.length, 147);
  assert.equal(tools.filter(tool => tool.catalogVisible !== false).length, 141);
  assert.equal(new Set(tools.map(tool => tool.id)).size, 147);
  const grouped = toolsByCategory();
  assert.equal(Object.values(grouped).flat().length, 147);
  for (const tool of tools) assert.ok(grouped[tool.category].includes(tool));
  const visible = tools.filter(tool => tool.catalogVisible !== false);
  const sections = buildCatalogSections(visible, 'all');
  assert.deepEqual(sections.map(section => section.category), CATEGORY_ORDER);
  assert.equal(sections.reduce((count, section) => count + section.tools.length, 0), 141);
});

test('tools follow purpose rather than their input format or generation operation', () => {
  const expected = {
    developer: ['json', 'base64', 'data-convert', 'code-format', 'json-diff', 'yaml-tree', 'dotenv', 'semver', 'uuid', 'random-bytes', 'fake-data', 'cron'],
    text: ['whitespace', 'gzip', 'regex', 'diff', 'unicode-inspect', 'figlet', 'numeronym', 'english-plural', 'email-normalizer', 'url-extractor', 'emoji-picker', 'text-speech', 'lorem'],
    network: ['network-calc', 'windows-port', 'http-status', 'user-agent', 'mac-generator', 'ipv6-ula', 'ipv4-range', 'phone', 'bandwidth', 'safelink', 'wifi-qr'],
    system: ['device-info', 'keyboard-event', 'file-type', 'chmod'],
    security: ['aes', 'password', 'basic-auth', 'xor', 'key-generator'],
    image: ['image-process', 'image-ocr', 'image-base64', 'gif-tools', 'gif-crop', 'color', 'color-palette', 'qrcode', 'image-generate'],
    document: ['spreadsheet', 'chart', 'markdown', 'rich-text', ...tools.filter(tool => tool.id.startsWith('pdf-')).map(tool => tool.id)],
    calculate: ['timestamp', 'business-days', 'lunar-calendar', 'eta', 'stopwatch', 'benchmark', 'compound-interest', 'math-expression', 'base-convert'],
  };
  for (const [category, ids] of Object.entries(expected)) {
    for (const id of ids) assert.equal(tools.find(tool => tool.id === id)?.category, category, id);
  }
});

test('localized category searches return exactly that category and old labels remain searchable', () => {
  for (const category of CATEGORY_ORDER) for (const locale of SUPPORTED_LOCALES) {
    const found = searchTools(categories[category][locale], locale);
    assert.ok(found.length, `${category}: ${locale}`);
    assert.ok(found.every(tool => tool.category === category), `${category}: ${locale}`);
  }
  for (const [category, names] of Object.entries(legacyCategories)) {
    if (['format', 'convert'].includes(category)) continue;
    for (const name of localeValues(names)) {
      const found = searchTools(name, 'en');
      assert.ok(found.length, name);
    }
  }
  for (const [id, old, current] of [
    ['base64', 'Base / Hex', 'Base 编解码'],
    ['timestamp', '时间戳', '时间戳转换'],
    ['markdown', 'Markdown', 'Markdown 编辑与预览'],
    ['html-playground', 'HTML Playground', 'HTML 在线预览'],
    ['semver', '语义版本', '语义版本比较'],
    ['image-ocr', '图片 OCR', '图片文字识别'],
    ['pdf-visual-signature', 'PDF 视觉签名', 'PDF 手写与图片签名'],
  ]) {
    assert.equal(tools.find(tool => tool.id === id).name['zh-CN'], current);
    for (const name of [old, current]) assert.ok(searchTools(name, 'zh-CN').some(tool => tool.id === id), name);
  }
});

test('presentation preserves execution metadata, defaults, favorites and recent IDs', () => {
  const original = { id: 'aes-ccm', category: 'security', name: { en: 'AES-256-CCM' }, view: 'cipher', catalogVisible: false, defaultOptions: { mode: 'ccm' }, lockOptions: ['mode'] };
  const updated = presentTool(original);
  for (const key of ['id', 'view', 'catalogVisible', 'defaultOptions', 'lockOptions']) assert.equal(updated[key], original[key]);
  assert.equal(original.name.en, 'AES-256-CCM');
  const ids = ['pdf-encrypt', 'semver', 'image-ocr', 'rsa-oaep'];
  assert.deepEqual(sanitizeToolIds(ids), ids);
  assert.deepEqual(toolsByIds(ids).map(tool => tool.id), ids);
  assert.deepEqual(pushRecent(ids, 'semver'), ['semver', 'pdf-encrypt', 'image-ocr', 'rsa-oaep']);
  assert.deepEqual(toolOptionsForQuery('sm4', 'SM4 CBC'), { algorithm: 'sm4-128', mode: 'cbc' });
  for (const tool of TOOL_REGISTRY) assert.deepEqual(tool.name, tools.find(entry => entry.id === tool.id).name);
});
