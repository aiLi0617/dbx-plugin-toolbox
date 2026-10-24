import test from "node:test";
import assert from "node:assert/strict";
import { createTaskManager, createTaskScope } from "../src/lib/taskManager.js";
import { retainToolSession, MAX_TOOL_SESSIONS } from "../src/lib/navigation.js";
import { tools } from "../src/lib/catalog.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise((next) => { resolve = next; }); return { promise, resolve }; }

test("heavy tasks queue by resource while unrelated work can proceed", async () => {
  const manager = createTaskManager();
  const first = deferred(), started = [];
  const a = manager.run({ toolId: "pdf-merge", resource: "pdf" }, async (task) => { started.push("first"); task.update({ stage: "process", progress: 0.25 }); await first.promise; });
  const b = manager.run({ toolId: "pdf-split", resource: "pdf" }, () => started.push("second"));
  const c = manager.run({ toolId: "image-ocr", resource: "ocr" }, () => started.push("ocr"));
  await c;
  assert.deepEqual(started, ["first", "ocr"]);
  first.resolve();
  await Promise.all([a, b]);
  assert.deepEqual(started, ["first", "ocr", "second"]);
});

test("cancelling a queued task never starts it or releases another task's slot", async () => {
  const manager = createTaskManager(), gate = deferred();
  let snapshots, ran = false;
  manager.subscribe((value) => snapshots = value);
  const a = manager.run({ toolId: "a", resource: "pdf" }, () => gate.promise);
  const b = manager.run({ toolId: "b", resource: "pdf" }, () => { ran = true; });
  const rejection = assert.rejects(b, { name: "AbortError" });
  manager.cancel(snapshots.find((item) => item.toolId === "b").id);
  await rejection;
  const c = manager.run({ toolId: "c", resource: "pdf" }, () => { ran = true; });
  await tick();
  assert.equal(ran, false);
  gate.resolve();
  await Promise.all([a, c]);
});

test("running cancellation remains pending until cleanup, and suppresses a late result", async () => {
  const manager = createTaskManager(), gate = deferred();
  let snapshots, aborted = false;
  manager.subscribe((value) => snapshots = value);
  const running = manager.run({ toolId: "pdf", resource: "pdf" }, async ({ signal }) => {
    signal.addEventListener("abort", () => { aborted = true; });
    await gate.promise;
    return "stale output";
  });
  const rejection = assert.rejects(running, { name: "AbortError" });
  await tick();
  manager.cancel(snapshots[0].id);
  assert.equal(aborted, true);
  assert.equal(snapshots[0].state, "cancelling");
  gate.resolve();
  await rejection;
  assert.equal(snapshots[0].state, "cancelled");
});

test("disposal cancels only the owning view and prevents new work", async () => {
  const manager = createTaskManager(), gate = deferred();
  const owner = createTaskScope("one", "pdf", manager), other = createTaskScope("two", "pdf", manager);
  const a = owner.run(async (task) => { await gate.promise; task.check(); });
  const b = other.run(() => "other view");
  const rejected = assert.rejects(a, { name: "AbortError" });
  owner.dispose();
  gate.resolve();
  await rejected;
  assert.equal(await b, "other view");
  await assert.rejects(owner.run(() => {}), { name: "AbortError" });
});

test("task history is bounded and snapshots never contain work, secrets or document buffers", async () => {
  const manager = createTaskManager({ historyLimit: 2 });
  let snapshots;
  manager.subscribe((value) => snapshots = value);
  for (let i = 0; i < 5; i++) await manager.run({ toolId: "pdf", resource: "pdf" }, () => ({ password: "private" }));
  assert.equal(snapshots.length, 2);
  assert.doesNotMatch(JSON.stringify(snapshots), /password|private|controller|work|owner|resolve|reject/);
  manager.clearFinished();
  assert.equal(snapshots.length, 0);
});

test("failed jobs release the slot and allow retry", async () => {
  const manager = createTaskManager();
  await assert.rejects(manager.run({ toolId: "a", resource: "pdf" }, () => { throw new Error("failure"); }));
  assert.equal(await manager.run({ toolId: "a", resource: "pdf" }, () => "retry"), "retry");
});

test("tool session retention is bounded, deduplicated and keeps recently revisited inputs", () => {
  const ids = tools.slice(0, MAX_TOOL_SESSIONS + 3).map((tool) => tool.id);
  let sessions = [];
  for (const id of ids) sessions = retainToolSession(sessions, id);
  assert.deepEqual(sessions, ids.slice(-MAX_TOOL_SESSIONS));
  const first = sessions[0];
  sessions = retainToolSession(sessions, first);
  assert.equal(sessions.length, MAX_TOOL_SESSIONS);
  assert.equal(sessions.at(-1), first);
});
