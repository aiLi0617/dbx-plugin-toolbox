// The Sidecar permits four native sessions. Serialize admission so two views
// cannot both reclaim the same slot while an upload is starting.
export function createPdfSessionPool(limit = 4) {
  const entries = new Map();
  let queue = Promise.resolve();
  return {
    async acquire(owner, resource = {}) {
      const admit = async () => {
        if (entries.size >= limit) {
          const idle = [...entries].find(([, entry]) => entry.sessionId && entry.canRelease?.());
          if (idle) {
            await idle[1].release();
            entries.delete(idle[0]);
          }
        }
        if (entries.size >= limit) {
          const error = new Error("Too many PDF sessions are active");
          error.code = "PDF_SESSION_LIMIT";
          error.occupants = [...entries.values()].map(entry => entry.owner);
          throw error;
        }
        const key = Symbol(owner);
        const entry = { owner, ...resource, sessionId: "" };
        entries.set(key, entry);
        return {
          attach(sessionId) { entry.sessionId = sessionId; },
          abandon() { entries.delete(key); },
        };
      };
      const next = queue.then(admit);
      queue = next.catch(() => {});
      return next;
    },
    release(sessionId) {
      for (const [key, entry] of entries) if (entry.sessionId === sessionId) entries.delete(key);
    },
    owners() { return [...entries.values()].map(entry => entry.owner); },
  };
}
export const pdfSessionPool = createPdfSessionPool();
