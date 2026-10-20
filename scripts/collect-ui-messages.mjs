import fs from 'node:fs';
import path from 'node:path';
import { parse as svelte } from 'svelte/compiler';
import { parse } from 'acorn';

const messages = {};
const langs = ['en', 'zh-CN', 'zh-TW', 'es', 'it', 'ja', 'pt-BR', 'ko', 'tr', 'az'];
const args = process.argv.slice(2);
const positional = args.filter(arg => !arg.startsWith('--'));
const sourceDir = positional[0] || 'src';
function value(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral') return node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `{${i}}` : '')).join('');
}
function add(en, zh, rest = {}) {
  if (!en || !zh) return;
  messages[en] = { ...messages[en], en, 'zh-CN': zh, ...rest };
}
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression') {
    const name = node.callee?.name;
    const args = node.arguments;
    if (name === 'L') {
      const vals = args.map(value);
      if (vals[0] && vals[1]) add(vals[0], vals[1], Object.fromEntries(langs.slice(2).map((l, i) => [l, vals[i + 2]]).filter(([, v]) => v)));
    } else if (name === 't') add(value(args[1]), value(args[0]));
    else if (name === 'pick') add(value(args[2]), value(args[1]));
  }
  if (node.type === 'ObjectExpression') {
    const props = Object.fromEntries(node.properties.filter(p => p.type === 'Property').map(p => [p.key.name || p.key.value, p.value]));
    for (const [key, prop] of Object.entries(props)) {
      if (key === 'en') add(value(prop), value(props.zh));
      else if (key.endsWith('En')) add(value(prop), value(props[key.slice(0, -2) + 'Zh']));
    }
  }
  for (const [key, child] of Object.entries(node)) if (!['parent', 'loc', 'start', 'end'].includes(key)) {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child && typeof child === 'object') visit(child);
  }
}
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (file.endsWith('.svelte')) visit(svelte(fs.readFileSync(file, 'utf8'), { modern: true }));
    else if (file.endsWith('.js') && !file.endsWith('uiMessages.js')) visit(parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }));
  }
}
scan(sourceDir);
if (!positional[0]) {
  // Bootstrap the generated runtime dictionary before catalog.js imports the
  // locale module. This also makes a clean checkout self-healing.
  const compactPath = 'src/lib/uiMessages.compact.json';
  if (!fs.existsSync(compactPath) && fs.existsSync('src/lib/uiMessages.json')) {
    const registered = JSON.parse(fs.readFileSync('src/lib/uiMessages.json', 'utf8'));
    const compact = Object.fromEntries(Object.entries(registered).map(([key, entry]) => [key, langs.map(locale => entry[locale] || '')]));
    fs.writeFileSync(compactPath, JSON.stringify(compact) + '\n');
  }
  const { tools } = await import('../src/lib/catalog.js');
  const { TEXT_ACTIONS } = await import('../src/lib/textActions.js');
  for (const tool of tools) for (const map of [tool.name, tool.summary]) {
    add(map.en, map['zh-CN'], Object.fromEntries(langs.slice(2).map(l => [l, map[l]])));
  }
  for (const action of TEXT_ACTIONS) add(action.en, action.zh);
}
const inventoryPath = positional[1] || 'scripts/ui-message-inventory.json';
const uiPath = 'src/lib/uiMessages.json';
const compactPath = 'src/lib/uiMessages.compact.json';
function compactMessages(source) {
  return Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, langs.map(locale => entry[locale] || '')]));
}
if (process.argv.includes('--check')) {
  const registered = JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  const missing = Object.keys(messages).filter(key => !registered[key]);
  if (missing.length) {
    console.error(`Missing ${missing.length} offline UI messages:\n${missing.map(key => `- ${key}`).join('\n')}`);
    process.exitCode = 1;
  } else {
    const expectedCompact = JSON.stringify(compactMessages(registered));
    const actualCompact = fs.existsSync(compactPath) ? fs.readFileSync(compactPath, 'utf8').trim() : '';
    if (actualCompact !== expectedCompact) {
      console.error('Compact UI message bundle is stale; run npm run i18n:sync');
      process.exitCode = 1;
    } else console.log(`${Object.keys(messages).length} source messages are registered`);
  }
} else {
  const registered = fs.existsSync(uiPath) ? JSON.parse(fs.readFileSync(uiPath, 'utf8')) : {};
  // Remove messages that no longer have a source call site. Keeping stale
  // translations indefinitely bloats DBX's required inline entry bundle.
  const synced = {};
  for (const [key, extracted] of Object.entries(messages)) {
    const current = registered[key] || {};
    const entry = { ...extracted, ...current, en: key, 'zh-CN': extracted['zh-CN'] || current['zh-CN'] || key };
    for (const locale of langs) entry[locale] ||= locale === 'zh-CN' ? entry['zh-CN'] : key;
    synced[key] = entry;
  }
  fs.writeFileSync(inventoryPath, JSON.stringify(messages, null, 2) + '\n');
  if (!positional[0]) {
    fs.writeFileSync(uiPath, JSON.stringify(synced, null, 2) + '\n');
    fs.writeFileSync(compactPath, JSON.stringify(compactMessages(synced)) + '\n');
  }
  console.log(`${Object.keys(messages).length} messages; ${Object.keys(messages).filter(key => !registered[key]).length} newly registered with offline fallback`);
}
