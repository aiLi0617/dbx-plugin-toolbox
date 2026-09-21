import fs from 'node:fs';
import path from 'node:path';
import { parse as svelte } from 'svelte/compiler';
import { parse } from 'acorn';

const messages = {};
const langs = ['en', 'zh-CN', 'zh-TW', 'es', 'it', 'ja', 'pt-BR'];
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
scan(process.argv[2] || 'src');
if (!process.argv[2]) {
  const { tools } = await import('../src/lib/catalog.js');
  const { TEXT_ACTIONS } = await import('../src/lib/textActions.js');
  for (const tool of tools) for (const map of [tool.name, tool.summary]) {
    add(map.en, map['zh-CN'], Object.fromEntries(langs.slice(2).map(l => [l, map[l]])));
  }
  for (const action of TEXT_ACTIONS) add(action.en, action.zh);
}
fs.writeFileSync(process.argv[3] || 'scripts/ui-message-inventory.json', JSON.stringify(messages, null, 2) + '\n');
console.log(`${Object.keys(messages).length} messages; ${Object.values(messages).filter(m => !m.ja).length} bilingual messages`);
