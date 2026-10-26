// Content remains inside mounted views. Only lifecycle metadata is published.
export function createSessionState() {
  const states = new Map(), actions = new Map(), listeners = new Set();
  const snapshot = () => Object.fromEntries([...states].map(([id, value]) => [id, { ...value }]));
  const publish = () => { const value = snapshot(); listeners.forEach(fn => fn(value)); };
  return {
    subscribe(fn) { listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
    get(id) { return states.get(id) || {}; },
    update(id, value) {
      const { export: exportResult, retry, dispose, ...metadata } = value;
      const current = actions.get(id) || {};
      if (exportResult !== undefined) current.export = exportResult;
      if (retry !== undefined) current.retry = retry;
      if (dispose !== undefined) current.dispose = dispose;
      actions.set(id, current);
      const next = { ...states.get(id), ...metadata, canExport: Boolean(current.export), canRetry: Boolean(current.retry) };
      const previous = states.get(id);
      if (!previous || Object.keys(next).some(key => next[key] !== previous[key])) { states.set(id, next); publish(); }
    },
    async export(id) {
      const save = actions.get(id)?.export;
      if (!save) return false;
      const result = await save();
      if (result === false || result?.cancelled) return false;
      this.update(id, { dirty: false, hasUnsavedResult: false }); return true;
    },
    async retry(id) { return actions.get(id)?.retry?.(); },
    async releaseResources(id) {
      const action = actions.get(id);
      if (action?.dispose) { await action.dispose(); action.dispose = undefined; }
    },
    discard(id) {
      const cleanup = actions.get(id)?.dispose;
      states.delete(id); actions.delete(id);
      try { Promise.resolve(cleanup?.()).catch(() => {}); } catch { /* best-effort teardown */ }
      publish();
    },
    releaseAll() { for (const id of [...states.keys()]) this.discard(id); },
    protected(id) { const state = this.get(id); return Boolean(state.dirty || state.busy || state.hasUnsavedResult); },
  };
}
export const sessionState = createSessionState();

export function sessionVictim(ids, state, backgroundIds, limit = 8) {
  const ordinary = ids.filter(id => !backgroundIds.has(id));
  if (ordinary.length < limit) return null;
  return ordinary.find(id => !state.protected(id)) || false;
}
