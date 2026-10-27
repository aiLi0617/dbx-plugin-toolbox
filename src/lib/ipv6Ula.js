import { parseIpv6, formatIpv6 } from './network.js';

// Keep subnet arithmetic within the selected /48; never wrap into another site.
export function planUlaSubnets(prefix, start, count) {
  if (!/^(?:0x)?[0-9a-f]{1,4}$/i.test(String(start))) return { error: 'start', rows: [] };
  const first = parseInt(String(start).replace(/^0x/i, ''), 16);
  if (!/^\d+$/.test(String(count)) || Number(count) < 1 || Number(count) > 1000)
    return { error: 'count', rows: [] };
  if (first + Number(count) > 65536) return { error: 'range', rows: [] };
  let base;
  try {
    const [address, length] = String(prefix).split('/');
    base = parseIpv6(address);
    if (length !== '48' || base >> 120n !== 0xfdn || (base & ((1n << 80n) - 1n)) !== 0n)
      return { error: 'prefix', rows: [] };
  } catch { return { error: 'prefix', rows: [] }; }
  return { error: '', rows: Array.from({ length: Number(count) }, (_, index) => {
    const id = first + index;
    return { id: id.toString(16).padStart(4, '0'), prefix: `${formatIpv6(base | (BigInt(id) << 64n))}/64` };
  }) };
}
