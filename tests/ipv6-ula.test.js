import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import { planUlaSubnets } from '../src/lib/ipv6Ula.js';
import { parseIpv6Cidr } from '../src/lib/network.js';

test('ULA subnet planning preserves the /48 and supports hexadecimal boundaries', () => {
  const block = 'fd12:3456:789a::/48';
  const plan = planUlaSubnets(block, '000f', 3);
  assert.equal(plan.error, '');
  assert.deepEqual(plan.rows, [
    { id: '000f', prefix: 'fd12:3456:789a:f::/64' },
    { id: '0010', prefix: 'fd12:3456:789a:10::/64' },
    { id: '0011', prefix: 'fd12:3456:789a:11::/64' },
  ]);
  assert.equal(planUlaSubnets(block, '0', 1).rows[0].prefix, 'fd12:3456:789a::/64');
  assert.equal(planUlaSubnets(block, '0xFFFF', 1).rows[0].prefix, 'fd12:3456:789a:ffff::/64');
  const batch = planUlaSubnets(block, 'f000', 1000).rows;
  assert.equal(new Set(batch.map(row => row.prefix)).size, 1000);
  for (const row of batch) assert.doesNotThrow(() => parseIpv6Cidr(row.prefix));
});

test('ULA subnet planning rejects overflow and invalid inputs without stale results', () => {
  const block = 'fd12:3456:789a::/48';
  for (const start of ['', '-1', '10000', '1.5', 'gggg'])
    assert.deepEqual(planUlaSubnets(block, start, 1), { error: 'start', rows: [] });
  for (const count of [0, -1, 1.5, 1001, '', undefined])
    assert.deepEqual(planUlaSubnets(block, '1', count), { error: 'count', rows: [] });
  assert.deepEqual(planUlaSubnets(block, 'ffff', 2), { error: 'range', rows: [] });
  for (const prefix of ['2001:db8::/48', 'fc12:3456:789a::/48', 'fd12:3456:789a:1::/48', 'fd12:3456:789a::/64'])
    assert.deepEqual(planUlaSubnets(prefix, '1', 1), { error: 'prefix', rows: [] });
});

test('ULA planner compiles as a standalone Svelte view', () => {
  const source = readFileSync(new URL('../src/lib/Ipv6UlaView.svelte', import.meta.url), 'utf8');
  assert.doesNotThrow(() => compile(source, { filename: 'Ipv6UlaView.svelte', generate: 'client' }));
});
