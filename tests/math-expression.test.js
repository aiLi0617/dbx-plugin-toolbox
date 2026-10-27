import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression as evaluate } from "../src/lib/calculators.js";

test("extended expressions preserve precedence and support common mathematical notation", () => {
  for (const [source, expected] of [
    ["2**3**2", 512], ["-2^2", -4], ["2^-2", 0.25],
    ["5! / (3! * 2!)", 10], ["0!", 1], ["-3!", -6], ["2^3!", 64],
    ["2pi", 2 * Math.PI], ["3(4+1)", 15], ["(2+1)(4-1)", 9],
    ["2sin(pi/2)", 2], ["6/2(1+2)", 9], ["2π", 2 * Math.PI],
    ["6 × 2 ÷ 3 − 1", 3], ["1e3 + 2e-2", 1000.02],
    ["max(1, min(5, 3), -2)", 3], ["pow(2, 3)", 8],
    ["hypot(3, 4)", 5], ["atan2(0, 1)", 0],
    ["log2(8) + log10(100)", 5], ["cbrt(-8)", -2],
    ["trunc(-1.8) + sign(-3)", -2], ["cosh(0) + sinh(0) + tanh(0)", 1],
    ["tau", 2 * Math.PI], ["phi", (1 + Math.sqrt(5)) / 2],
    ["MAX(1, 2, 3)", 3], ["min(7)", 7],
  ]) assert.equal(evaluate(source), expected, source);
});

test("extended expressions reject malformed arguments, unsafe names, and invalid factorials", () => {
  for (const source of [
    "min()", "pow(2)", "pow(2, 3, 4)", "sin(1,2)", "round(1,2)",
    "max(1,)", "max(,1)", "max(1,,2)", "(1,2)", "2 3", "1.2.3",
    "(-1)!", "1.5!", "171!", "1/0", "1%0", "sqrt(-1)",
    "sqrt(-1)^0", "1e309^0", "exp(1000)^0", "0^(-1)",
    "constructor(1)", "__proto__", "Math.max(1,2)", "globalThis", "1;2",
    "[1,2]", "2=3", "sin", "pow(2,3", "2***3", "1".repeat(10001),
    "(".repeat(101) + "1" + ")".repeat(101),
  ]) assert.throws(() => evaluate(source), source);
});
