export function parseIpv4(value) {
  const text = String(value ?? "").trim();
  const parts = text.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    throw new Error("IPv4 address must contain four decimal octets");
  }
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) {
    throw new Error("IPv4 octets must be between 0 and 255");
  }
  return octets.reduce((result, part) => ((result << 8) | part) >>> 0, 0);
}

export function formatIpv4(value) {
  const ip = Number(value) >>> 0;
  return [ip >>> 24, (ip >>> 16) & 255, (ip >>> 8) & 255, ip & 255].join(".");
}

export function prefixToMask(prefix) {
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error("CIDR prefix must be between 0 and 32");
  return bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
}

export function maskToPrefix(maskText) {
  const mask = parseIpv4(maskText);
  let prefix = 0;
  let zeroSeen = false;
  for (let bit = 31; bit >= 0; bit -= 1) {
    const enabled = ((mask >>> bit) & 1) === 1;
    if (enabled && zeroSeen) throw new Error("Subnet mask bits must be contiguous");
    if (enabled) prefix += 1;
    else zeroSeen = true;
  }
  return prefix;
}

export function parseCidr(value, fallbackPrefix = 24) {
  const raw = String(value ?? "").trim();
  const slash = raw.indexOf("/");
  const address = slash >= 0 ? raw.slice(0, slash) : raw;
  const prefixText = slash >= 0 ? raw.slice(slash + 1) : String(fallbackPrefix);
  if (!/^\d{1,2}$/.test(prefixText)) throw new Error("CIDR prefix must be between 0 and 32");
  const prefix = Number(prefixText);
  prefixToMask(prefix);
  const ip = parseIpv4(address);
  return { ip, prefix, address: formatIpv4(ip) };
}

function addressType(ip) {
  if (((ip & 0xff000000) >>> 0) === 0x0a000000) return "private";
  if (((ip & 0xfff00000) >>> 0) === 0xac100000) return "private";
  if (((ip & 0xffff0000) >>> 0) === 0xc0a80000) return "private";
  if (((ip & 0xff000000) >>> 0) === 0x7f000000) return "loopback";
  if (((ip & 0xffff0000) >>> 0) === 0xa9fe0000) return "link-local";
  if (((ip & 0xf0000000) >>> 0) === 0xe0000000) return "multicast";
  if (ip === 0xffffffff) return "broadcast";
  if ((ip & 0xff000000) === 0) return "unspecified";
  return "public";
}

export function calculateIpv4(value, fallbackPrefix = 24) {
  const { ip, prefix, address } = parseCidr(value, fallbackPrefix);
  const mask = prefixToMask(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, total - 2);
  const wildcard = (~mask) >>> 0;
  return {
    address,
    integer: ip,
    hexadecimal: `0x${ip.toString(16).toUpperCase().padStart(8, "0")}`,
    binary: [24, 16, 8, 0].map((shift) => ((ip >>> shift) & 255).toString(2).padStart(8, "0")).join("."),
    prefix,
    cidr: `${formatIpv4(network)}/${prefix}`,
    mask: formatIpv4(mask),
    wildcard: formatIpv4(wildcard),
    network: formatIpv4(network),
    broadcast: formatIpv4(broadcast),
    firstHost: formatIpv4(first),
    lastHost: formatIpv4(last),
    total,
    usable,
    type: addressType(ip),
    isNetwork: ip === network,
    isBroadcast: prefix < 31 && ip === broadcast,
  };
}

export function integerToIpv4(value) {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) throw new Error("Integer must be between 0 and 4294967295");
  const number = Number(raw);
  if (!Number.isSafeInteger(number) || number < 0 || number > 0xffffffff) {
    throw new Error("Integer must be between 0 and 4294967295");
  }
  return formatIpv4(number);
}

const IPV6_BITS = 128n;
const IPV6_MAX = (1n << IPV6_BITS) - 1n;

function ipv4ToIpv6Groups(value) {
  const ip = parseIpv4(value);
  return [(ip >>> 16).toString(16), (ip & 0xffff).toString(16)];
}

export function parseIpv6(value) {
  let text = String(value ?? "").trim().toLowerCase();
  if (!text) throw new Error("IPv6 address is required");
  if (text.includes("%")) text = text.slice(0, text.indexOf("%"));
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    if (colon < 0) throw new Error("Invalid IPv6 address");
    const groups = ipv4ToIpv6Groups(text.slice(colon + 1));
    text = `${text.slice(0, colon)}:${groups.join(":")}`;
  }
  if ((text.match(/::/g) || []).length > 1) throw new Error("IPv6 address can contain only one :: compression");
  const compressed = text.includes("::");
  const [leftText, rightText] = compressed ? text.split("::") : [text, ""];
  const left = leftText ? leftText.split(":") : [];
  const right = rightText ? rightText.split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((!compressed && missing !== 0) || (compressed && missing < 1)) throw new Error("IPv6 address must contain eight 16-bit groups");
  const groups = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) throw new Error("Invalid IPv6 address");
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

export function formatIpv6(value) {
  let number;
  try { number = typeof value === "bigint" ? value : BigInt(value); }
  catch { throw new Error("Invalid IPv6 integer"); }
  if (number < 0n || number > IPV6_MAX) throw new Error("IPv6 integer must be between 0 and 2^128-1");
  const groups = Array.from({ length: 8 }, (_, index) => ((number >> BigInt((7 - index) * 16)) & 0xffffn).toString(16));
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== "0") { index += 1; continue; }
    const start = index;
    while (index < groups.length && groups[index] === "0") index += 1;
    if (index - start > bestLength) { bestStart = start; bestLength = index - start; }
  }
  if (bestLength < 2) return groups.join(":");
  const left = groups.slice(0, bestStart).join(":");
  const right = groups.slice(bestStart + bestLength).join(":");
  if (!left && !right) return "::";
  if (!left) return `::${right}`;
  if (!right) return `${left}::`;
  return `${left}::${right}`;
}

export function prefixToIpv6Mask(prefix) {
  const bits = Number(prefix);
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) throw new Error("IPv6 CIDR prefix must be between 0 and 128");
  return bits === 0 ? 0n : ((IPV6_MAX << BigInt(128 - bits)) & IPV6_MAX);
}

export const ipv6PrefixToMask = prefixToIpv6Mask;

export function parseIpv6Cidr(value, fallbackPrefix = 64) {
  const raw = String(value ?? "").trim();
  const slash = raw.indexOf("/");
  const address = slash >= 0 ? raw.slice(0, slash) : raw;
  const prefixText = slash >= 0 ? raw.slice(slash + 1) : String(fallbackPrefix);
  if (!/^\d{1,3}$/.test(prefixText)) throw new Error("IPv6 CIDR prefix must be between 0 and 128");
  const prefix = Number(prefixText);
  prefixToIpv6Mask(prefix);
  const ip = parseIpv6(address);
  return { ip, prefix, address: formatIpv6(ip) };
}

function ipv6AddressType(ip) {
  if (ip === 0n) return "unspecified";
  if (ip === 1n) return "loopback";
  if ((ip >> 121n) === 0b1111110n) return "unique-local";
  if ((ip >> 118n) === 0b1111111010n) return "link-local";
  if ((ip >> 120n) === 0xffn) return "multicast";
  return "global";
}

export function calculateIpv6(value, fallbackPrefix = 64) {
  const { ip, prefix, address } = parseIpv6Cidr(value, fallbackPrefix);
  const mask = prefixToIpv6Mask(prefix);
  const network = ip & mask;
  const total = 1n << BigInt(128 - prefix);
  const last = network + total - 1n;
  const hexadecimal = `0x${ip.toString(16).toUpperCase().padStart(32, "0")}`;
  const binary = ip.toString(2).padStart(128, "0").match(/.{1,16}/g).join(":");
  return {
    address,
    integer: ip,
    hexadecimal,
    binary,
    prefix,
    cidr: `${formatIpv6(network)}/${prefix}`,
    mask: formatIpv6(mask),
    wildcard: formatIpv6(IPV6_MAX ^ mask),
    network: formatIpv6(network),
    broadcast: null,
    firstHost: formatIpv6(network),
    lastHost: formatIpv6(last),
    total,
    usable: total,
    type: ipv6AddressType(ip),
    isNetwork: ip === network,
  };
}

export function splitIpv6Subnets(value, newPrefix, limit = 1024) {
  const { ip, prefix } = parseIpv6Cidr(value);
  const target = Number(newPrefix);
  prefixToIpv6Mask(target);
  if (target < prefix) throw new Error("Subnet prefix must be equal to or longer than the source prefix");
  const count = 1n << BigInt(target - prefix);
  if (count > BigInt(limit)) throw new Error(`Subnet split would create more than ${limit} networks`);
  const base = ip & prefixToIpv6Mask(prefix);
  const size = 1n << BigInt(128 - target);
  return Array.from({ length: Number(count) }, (_, index) => `${formatIpv6(base + BigInt(index) * size)}/${target}`);
}

export function splitIpv4Subnets(value, newPrefix, limit = 1024) {
  const { ip, prefix } = parseCidr(value);
  const target = Number(newPrefix);
  prefixToMask(target);
  if (target < prefix) throw new Error("Subnet prefix must be equal to or longer than the source prefix");
  const count = 2 ** (target - prefix);
  if (count > limit) throw new Error(`Subnet split would create more than ${limit} networks`);
  const base = (ip & prefixToMask(prefix)) >>> 0;
  const size = 2 ** (32 - target);
  return Array.from({ length: count }, (_, index) => `${formatIpv4(base + index * size)}/${target}`);
}

export function splitSubnets(value, newPrefix, limit = 1024) {
  return String(value ?? "").includes(":") ? splitIpv6Subnets(value, newPrefix, limit) : splitIpv4Subnets(value, newPrefix, limit);
}
