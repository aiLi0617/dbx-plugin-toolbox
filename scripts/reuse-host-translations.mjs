// Reuse matching DBX terminology locally. No network requests.
import fs from 'node:fs';
import { build } from 'esbuild';
const root = process.argv[2];
if (!root) throw new Error('Pass the DBX i18n/locales directory');
const locales = ['en', 'ko', 'tr', 'az', 'pt-BR'];
const source = locales.map((l, i) => `import l${i} from ${JSON.stringify(root + '/' + l + '.ts')};`).join('\n')
  + `\nexport default {${locales.map((l, i) => `${JSON.stringify(l)}:l${i}`).join(',')}};`;
await build({ stdin: { contents: source, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: 'output/host-locales.mjs' });
const { default: dictionaries } = await import('../output/host-locales.mjs');
const ui = JSON.parse(fs.readFileSync('src/lib/uiMessages.json', 'utf8'));
const additions = {};
function walk(en, values) {
  for (const [key, value] of Object.entries(en)) {
    if (typeof value === 'string' && ui[value]) {
      for (const locale of locales.slice(1)) {
        const translated = values[locale]?.[key];
        if (typeof translated === 'string' && translated && translated !== value && !ui[value][locale] && !value.includes('{')) {
          (additions[value] ||= {})[locale] ||= translated;
        }
      }
    } else if (value && typeof value === 'object') {
      walk(value, Object.fromEntries(locales.slice(1).map(l => [l, values[l]?.[key]])));
    }
  }
}
walk(dictionaries.en, dictionaries);
fs.writeFileSync('scripts/host-ui-translations.json', JSON.stringify(additions, null, 2) + '\n');
console.log(`Matched ${Object.keys(additions).length} UI phrases to DBX terminology.`);
