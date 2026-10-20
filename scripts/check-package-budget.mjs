import fs from 'node:fs';
import path from 'node:path';

const MAX_PACKAGE_BYTES = 20 * 1024 * 1024;
const root = path.resolve(process.argv[2] || 'dist');

function zipEntries(buffer) {
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65_557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('Package is not a readable ZIP archive');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Package central directory is invalid');
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const bytes = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8').replaceAll('\\', '/');
    entries.push({ name, bytes, compressedBytes });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function collectPackages(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...collectPackages(file));
    else if (entry.name.endsWith('.dbxp')) result.push(file);
  }
  return result;
}

const packages = collectPackages(root);
if (!packages.length) {
  console.error(`No .dbxp packages found under ${root}`);
  process.exit(1);
}

let failed = false;
let largest = null;
for (const file of packages) {
  const bytes = fs.statSync(file).size;
  const content = fs.readFileSync(file);
  const entries = zipEntries(content);
  const containsRten = entries.some((entry) => entry.name.toLowerCase().endsWith('.rten'));
  const relative = path.relative(process.cwd(), file);
  console.log(`${relative}: ${(bytes / 1024 / 1024).toFixed(2)} MiB${containsRten ? ' [contains .rten]' : ''}`);
  const groups = new Map();
  for (const entry of entries) {
    const group = entry.name.split('/')[0] || '(root)';
    groups.set(group, (groups.get(group) || 0) + entry.compressedBytes);
  }
  console.log(`  contents: ${[...groups.entries()].sort((a,b)=>b[1]-a[1]).map(([name,size])=>`${name} ${(size/1024/1024).toFixed(2)} MiB`).join(', ')}`);
  if (!largest || bytes > largest.bytes) largest = { file: relative, bytes };
  if (bytes > MAX_PACKAGE_BYTES || containsRten) failed = true;
}

console.log(`Largest package: ${largest.file} (${(largest.bytes / 1024 / 1024).toFixed(2)} MiB)`);
if (failed) {
  console.error('Package gate failed: every .dbxp must be <= 20 MiB and contain no .rten file.');
  process.exit(1);
}
