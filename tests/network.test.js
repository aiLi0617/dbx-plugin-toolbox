import assert from "node:assert/strict";
import test from "node:test";
import { calculateIpv6, formatIpv6, parseIpv6, previewSubnets, splitSubnets } from "../src/lib/network.js";

test("IPv6 parsing and formatting use BigInt without precision loss", () => {
  assert.equal(formatIpv6(parseIpv6("2001:0db8:0000:0000:0000:ff00:0042:8329")), "2001:db8::ff00:42:8329");
  assert.equal(formatIpv6(parseIpv6("::1")), "::1");
  assert.equal(formatIpv6(parseIpv6("::")), "::");
  const result = calculateIpv6("2001:db8::1234/64");
  assert.equal(result.cidr, "2001:db8::/64");
  assert.equal(result.network, "2001:db8::");
  assert.equal(result.lastHost, "2001:db8::ffff:ffff:ffff:ffff");
  assert.equal(result.total, 1n << 64n);
});

test("IPv4 and IPv6 CIDR splitting returns bounded subnet lists", () => {
  assert.deepEqual(splitSubnets("192.0.2.0/30", 31), ["192.0.2.0/31", "192.0.2.2/31"]);
  assert.deepEqual(splitSubnets("2001:db8::/126", 128), [
    "2001:db8::/128", "2001:db8::1/128", "2001:db8::2/128", "2001:db8::3/128",
  ]);
  assert.throws(() => splitSubnets("2001:db8::/64", 80, 8), /more than 8/);
});

test("subnet previews report the full count without generating every subnet", () => {
  const ipv4 = previewSubnets("10.0.0.0/24", 32, 64);
  assert.equal(ipv4.total, 256n);
  assert.equal(ipv4.subnets.length, 64);
  assert.equal(ipv4.subnets[0], "10.0.0.0/32");
  assert.equal(ipv4.subnets[63], "10.0.0.63/32");
  assert.equal(ipv4.truncated, true);

  const ipv6 = previewSubnets("2001:db8::/64", 128, 64);
  assert.equal(ipv6.total, 1n << 64n);
  assert.equal(ipv6.subnets.length, 64);
  assert.equal(ipv6.truncated, true);

  const complete = previewSubnets("192.0.2.0/30", 31, 64);
  assert.deepEqual(complete.subnets, ["192.0.2.0/31", "192.0.2.2/31"]);
  assert.equal(complete.total, 2n);
  assert.equal(complete.truncated, false);
});
