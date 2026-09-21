// Build-time only: translate public UI copy into bundled, offline dictionaries.
// Existing reviewed translations and manual overrides always take precedence.
import fs from 'node:fs';
const locales = ['zh-TW', 'es', 'it', 'ja', 'pt-BR', 'ko', 'tr', 'az'];
const inventory = JSON.parse(fs.readFileSync('scripts/ui-message-inventory.json', 'utf8'));
const file = 'src/lib/uiMessages.json';
const messages = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
for (const [key, entry] of Object.entries(inventory)) messages[key] = { ...messages[key], ...entry };
for (const [key, translations] of Object.entries(JSON.parse(fs.readFileSync('scripts/ui-overrides.json', 'utf8')))) {
  Object.assign(messages[key], translations);
}
for (const [key, translations] of Object.entries(JSON.parse(fs.readFileSync('scripts/host-ui-translations.json', 'utf8')))) {
  for (const [locale, text] of Object.entries(translations)) messages[key][locale] ??= text;
}
const nativeKeys = JSON.parse(fs.readFileSync('scripts/native-inventory.json', 'utf8'));
for (const line of fs.readFileSync('scripts/native-translations.txt', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#')) continue;
  const [id, ko, tr, az] = line.split('|');
  if (!ko || !tr || !az) throw new Error(`Invalid native entry ${id}`);
  Object.assign(messages[nativeKeys[Number(id)]], { ko, tr, az });
}
for (const [key, message] of Object.entries(messages)) {
  if (key === message['zh-CN']) for (const locale of locales) message[locale] = key;
}
const save = () => fs.writeFileSync(file, JSON.stringify(messages, null, 2) + '\n');
save();
const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join(',');
for (const locale of locales) {
  const pending = Object.entries(messages).filter(([, m]) => !m[locale]);
  let done = 0;
  while (pending.length) {
    const batch = [];
    let size = 0;
    while (pending.length && batch.length < 25 && size + pending[0][0].length < 2200) {
      const entry = pending.shift();
      batch.push(entry);
      size += entry[0].length;
    }
    if (!batch.length) batch.push(pending.shift());
    const query = new URLSearchParams({ client: 'dict-chrome-ex', sl: 'en', tl: locale === 'pt-BR' ? 'pt' : locale });
    for (const [key] of batch) query.append('q', key);
    let response;
    for (let attempt = 0; attempt < 5; attempt++) {
      response = await fetch(`https://translate.googleapis.com/translate_a/t?${query}`, { signal: AbortSignal.timeout(30000) });
      if (response.status !== 429 && response.status < 500) break;
      console.log(`Service busy (${response.status}); retry ${attempt + 1} after 30 seconds`);
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    if (!response.ok) throw new Error(`Translation failed: ${response.status}. Progress saved.`);
    const result = await response.json();
    if (!Array.isArray(result) || result.length !== batch.length) throw new Error('Unexpected translation count');
    for (let i = 0; i < batch.length; i++) {
      const [key, message] = batch[i];
      const translated = result[i];
      if (typeof translated !== 'string' || !translated.trim() || placeholders(key) !== placeholders(translated)) {
        console.log(`Needs review (${locale}): ${key} => ${JSON.stringify(translated)}`);
        continue;
      }
      message[locale] = translated;
    }
    save();
    done += batch.length;
    console.log(`${locale}: +${done}, ${pending.length} remaining`);
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
}
