// Fetch public upstream files without credentials; parse them as data only.
import fs from 'node:fs';
import path from 'node:path';
const base = 'https://raw.githubusercontent.com/aiLi0617/dbx-plugin-toolbox/main/';
const files = [];
function list(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) list(file);
    else if (/\.(js|svelte)$/.test(file) && !file.endsWith('uiMessages.js')) files.push(file);
  }
}
list('src');
let count = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (files.length) {
    const file = files.shift();
    const response = await fetch(base + file, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) continue;
    const target = 'output/public-ui/' + file;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, await response.text());
    count++;
  }
}));
console.log(`Verified ${count} publicly accessible source files (no credentials).`);
