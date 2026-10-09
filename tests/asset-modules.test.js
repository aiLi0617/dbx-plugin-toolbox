import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssetModuleLoader } from '../src/lib/assetModules.js';
import { formatCode } from '../src/lib/tools/format.js';

test('asset bridge waits for host, deduplicates loads and releases blob URLs', async () => {
  let start;
  const ready = new Promise(resolve => { start = resolve; });
  const reads = [], revoked = [];
  const module = { value: 42 };
  const load = createAssetModuleLoader({
    getHost: () => ({ ready, readAssetUrl: async path => { reads.push(path); return 'blob:test'; } }),
    importModule: async url => { assert.equal(url, 'blob:test'); return module; },
    revokeUrl: url => revoked.push(url),
  });
  const first = load('excel');
  assert.equal(load('excel'), first);
  assert.deepEqual(reads, []);
  start();
  assert.equal(await first, module);
  assert.equal(await load('excel'), module);
  assert.deepEqual(reads, ['assets/lazy/excel.js']);
  assert.deepEqual(revoked, ['blob:test']);
  await assert.rejects(load('../secret'), /Unknown asset module/);
});

test('asset bridge releases failed imports and permits retry', async () => {
  let attempts = 0;
  const revoked = [];
  const load = createAssetModuleLoader({
    getHost: () => ({ ready: Promise.resolve(), readAssetUrl: async () => 'blob:retry' }),
    importModule: async () => { if (++attempts === 1) throw new Error('load failed'); return { ok: true }; },
    revokeUrl: url => revoked.push(url),
  });
  await assert.rejects(load('sql'), /load failed/);
  assert.deepEqual(await load('sql'), { ok: true });
  assert.equal(revoked.length, 2);
});

test('asset bridge retries after resource read failure', async () => {
  let attempts = 0;
  const load = createAssetModuleLoader({
    getHost: () => ({ readAssetUrl: async () => { if (++attempts === 1) throw new Error('read failed'); return 'blob:ok'; } }),
    importModule: async () => ({}), revokeUrl: () => {},
  });
  await assert.rejects(load('barcode'), /read failed/);
  await load('barcode');
  assert.equal(attempts, 2);
});

test('lazy SQL and HTML/CSS formatting preserve behavior', async () => {
  assert.match(await formatCode('select a from users where id=1', 'sql'), /select\n  a\nfrom/);
  assert.match(await formatCode('<main><div>Hello</div></main>', 'html'), /\n/);
  assert.match(await formatCode('a{color:red}', 'css'), /color: red/);
});

