import {spawn} from 'node:child_process';
import {once} from 'node:events';
export function connect(binary, env = process.env) {
  const child = spawn(binary, [], { windowsHide: true, env, stdio: ["pipe", "pipe", "pipe"] });
  let sequence = 0, buffered = Buffer.alloc(0);
  const pending = new Map();
  function fail(error) { for (const task of pending.values()) { clearTimeout(task.timer); task.reject(error); } pending.clear(); }
  child.on("error", fail);
  child.on("exit", (code) => fail(new Error(`Sidecar exited: ${code}`)));
  child.stderr.resume();
  child.stdout.on("data", (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 5 && buffered.length >= 5 + buffered.readUInt32BE(1)) {
      const length = buffered.readUInt32BE(1), kind = buffered[0], payload = buffered.subarray(5, 5 + length);
      buffered = buffered.subarray(5 + length);
      if (kind !== 0) continue;
      const response = JSON.parse(payload), task = pending.get(response.id);
      if (!task) continue;
      pending.delete(response.id); clearTimeout(task.timer);
      if (response.error) task.reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
      else task.resolve(response.result);
    }
  });
  function write(kind, payload) {
    const header = Buffer.alloc(5); header[0] = kind; header.writeUInt32BE(payload.length, 1);
    return new Promise((resolve, reject) => child.stdin.write(Buffer.concat([header, payload]), (error) => error ? reject(error) : resolve()));
  }
  return {
    ready: Promise.resolve(),
    invoke(method, params = {}, { timeoutMs = 30_000 } = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timed out: ${method}`)); }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        void write(0, Buffer.from(JSON.stringify({ jsonrpc: "2.0", id, method, params: structuredClone(params) }))).catch(fail);
      });
    },
    async sendBinary(channel, data) {
      const name = Buffer.from(channel), size = Buffer.alloc(2); size.writeUInt16BE(name.length);
      await write(1, Buffer.concat([size, name, Buffer.from(data)]));
    },
    async close() { const exited = once(child, "exit"); child.kill(); await exited; },
  };
}
