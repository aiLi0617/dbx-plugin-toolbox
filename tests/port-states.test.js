import test from "node:test";
import assert from "node:assert/strict";
import { localizePortState, normalizePortState } from "../src/lib/portStates.js";

test("port states normalize Windows and lsof spellings", () => {
  assert.equal(normalizePortState("LISTENING"), "LISTENING");
  assert.equal(normalizePortState("Listen"), "LISTEN");
  assert.equal(normalizePortState("TIME_WAIT"), "TIMEWAIT");
  assert.equal(normalizePortState("FinWait2"), "FINWAIT2");
});

test("port states follow every supported UI locale and preserve unknown values", () => {
  assert.equal(localizePortState("zh-CN", "Established"), "已建立");
  assert.equal(localizePortState("zh-TW", "LISTENING"), "監聽中");
  assert.equal(localizePortState("ja", "TIME_WAIT"), "解放待機");
  assert.equal(localizePortState("ko", "CloseWait"), "닫기 대기");
  assert.equal(localizePortState("tr", "UDP"), "UDP");
  assert.equal(localizePortState("en", "vendor-state"), "vendor-state");
});

