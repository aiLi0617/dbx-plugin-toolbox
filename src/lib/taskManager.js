import { sessionState } from "./sessionState.js";
export function taskAbortError() {
  return Object.assign(new Error("Cancelled"), { name: "AbortError" });
}

export function createTaskManager({ historyLimit = 20, now = Date.now } = {}) {
  const tasks = new Map();
  const subscribers = new Set();
  const resources = new Set();
  let sequence = 0;
  const active = (task) => ["queued", "running", "cancelling"].includes(task.state);
  const snapshot = () => [...tasks.values()].map(({ controller, work, resolve, reject, owner, ownsSlot, ...view }) => ({ ...view }));
  const publish = () => {
    const finished = [...tasks.values()].filter((task) => !active(task) && !sessionState.get(task.toolId).hasUnsavedResult);
    for (const task of finished.slice(0, Math.max(0, finished.length - historyLimit))) tasks.delete(task.id);
    const value = snapshot();
    for (const subscriber of subscribers) subscriber(value);
  };
  function drain() {
    for (const task of tasks.values()) {
      if (task.state !== "queued" || resources.has(task.resource)) continue;
      resources.add(task.resource);
      task.ownsSlot = true;
      task.state = "running";
      task.startedAt = now();
      publish();
      const signal = task.controller.signal;
      const context = {
        signal,
        check() { if (signal.aborted) throw taskAbortError(); },
        update({ stage, progress = null }) {
          if (task.state !== "running") return;
          task.stage = stage;
          task.progress = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : null;
          publish();
        },
      };
      Promise.resolve().then(() => { context.check(); return task.work(context); }).then(
        (result) => finish(task, signal.aborted ? taskAbortError() : null, result),
        (error) => finish(task, error),
      );
    }
  }
  function finish(task, error, result) {
    if (task.controller.signal.aborted) error = taskAbortError();
    task.state = task.controller.signal.aborted || error?.name === "AbortError" ? "cancelled" : error ? "failed" : "complete";
    task.errorCode = error && task.state !== "cancelled" ? (/timeout|timed out/i.test(String(error.code || error.message)) ? "TASK_TIMEOUT" : "TASK_FAILED") : null;
    task.endedAt = now();
    task.progress = task.state === "complete" ? 1 : task.progress;
    if (task.ownsSlot) resources.delete(task.resource);
    delete task.ownsSlot;
    const { resolve, reject } = task;
    // Release closures that can retain documents, passwords, and typed arrays.
    delete task.work;
    delete task.resolve;
    delete task.reject;
    delete task.owner;
    publish();
    if (error) reject(error);
    else resolve(result);
    drain();
  }
  const manager = {
    subscribe(callback) {
      subscribers.add(callback);
      callback(snapshot());
      return () => subscribers.delete(callback);
    },
    run({ toolId, resource, stage = "prepare", owner }, work) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        tasks.set(id, { id, toolId, sessionId: toolId, resource, owner, stage, state: "queued", progress: null, createdAt: now(), startedAt: null, endedAt: null, controller: new AbortController(), work, resolve, reject });
        publish();
        drain();
      });
    },
    cancel(id) {
      const task = tasks.get(id);
      if (!task || !active(task) || task.state === "cancelling") return;
      const queued = task.state === "queued";
      task.state = "cancelling";
      task.controller.abort();
      if (queued) {
        finish(task, taskAbortError());
      } else publish();
    },
    cancelAll() { for (const task of tasks.values()) manager.cancel(task.id); },
    cancelTool(toolId) { for (const task of tasks.values()) if (task.toolId === toolId) manager.cancel(task.id); },
    cancelOwner(owner) {
      for (const task of tasks.values()) if (task.owner === owner) manager.cancel(task.id);
    },
    clearFinished() {
      for (const task of tasks.values()) if (!active(task)) tasks.delete(task.id);
      publish();
    },
  };
  return manager;
}

export const taskManager = createTaskManager();

export function createTaskScope(toolId, resource, manager = taskManager) {
  const owner = Symbol();
  let disposed = false;
  return {
    run(work, stage = "prepare") {
      if (disposed) return Promise.reject(taskAbortError());
      return manager.run({ toolId, resource, owner, stage }, work);
    },
    cancel() { manager.cancelOwner(owner); },
    dispose() { disposed = true; manager.cancelOwner(owner); },
  };
}
