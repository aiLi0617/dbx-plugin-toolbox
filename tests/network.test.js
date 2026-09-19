import assert from "node:assert/strict";
import test from "node:test";
import { calculateIpv6, formatIpv6, parseIpv6, splitSubnets } from "../src/lib/network.js";

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
