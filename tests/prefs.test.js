import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SHORTCUTS } from "../src/lib/shortcuts.js";
import {
  DEFAULT_VAULT_AUTO_LOCK_MINUTES,
  getFavoriteToolIds,
  getVaultAutoLockMinutes,
  getWorkspacePreferences,
  sanitizeVaultAutoLockMinutes,
  setFavoriteToolIds,
  setVaultAutoLockMinutes,
  setRecentToolIds,
  setRecentCollapsed,
  setSidebarCollapsed,
  setShortcuts,
  VAULT_AUTO_LOCK_MINUTES,
} from "../src/lib/prefs.js";

test("vault auto-lock accepts supported intervals and defaults invalid values", () => {
  assert.deepEqual(VAULT_AUTO_LOCK_MINUTES, [0, 5, 15, 30, 60]);
  for (const minutes of VAULT_AUTO_LOCK_MINUTES) {
    assert.equal(sanitizeVaultAutoLockMinutes(minutes), minutes);
    assert.equal(sanitizeVaultAutoLockMinutes(String(minutes)), minutes);
  }
  assert.equal(sanitizeVaultAutoLockMinutes(null), DEFAULT_VAULT_AUTO_LOCK_MINUTES);
  assert.equal(sanitizeVaultAutoLockMinutes(""), DEFAULT_VAULT_AUTO_LOCK_MINUTES);
  assert.equal(sanitizeVaultAutoLockMinutes(10), DEFAULT_VAULT_AUTO_LOCK_MINUTES);
});

test("workspace navigation preferences migrate to and persist through the sidecar", async (t) => {
  const values = new Map([
    ["toolbox.recentToolIds", '["json","hash"]'],
    ["toolbox.sidebarCollapsed", "true"],
  ]);
  const calls = [];
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: {
      invoke: async (method, params) => {
        calls.push({ method, params });
        if (method === "toolbox/prefs/get") return { recentToolIds: ["uuid"], sidebarCollapsed: false };
        return params;
      },
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  assert.deepEqual(await getWorkspacePreferences(true), {
    recentToolIds: ["uuid"],
    sidebarCollapsed: false,
    recentCollapsed: false,
    shortcuts: DEFAULT_SHORTCUTS,
    recentToolLimit: 10,
  });
  assert.deepEqual(await setRecentToolIds(["hash", "json"]), ["hash", "json"]);
  assert.equal(await setSidebarCollapsed(true), true);
  assert.deepEqual(calls.at(-2), { method: "toolbox/prefs/set", params: { recentToolIds: ["hash", "json"] } });
  assert.deepEqual(calls.at(-1), { method: "toolbox/prefs/set", params: { sidebarCollapsed: true } });
});

test("recent history falls back to local storage when an older sidecar returns no history", async (t) => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const values = new Map([["toolbox.recentToolIds", '["hash"]'], ["toolbox.recentCollapsed", "true"]]);
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  globalThis.window = { dbxPlugin: { invoke: async (method, params) => method === "toolbox/prefs/get" ? { version: 6, recentToolIds: [], sidebarCollapsed: false } : { version: 6, ...params } } };
  t.after(() => { globalThis.window = originalWindow; globalThis.localStorage = originalStorage; });

  const saved = await getWorkspacePreferences();
  assert.deepEqual(saved.recentToolIds, ["hash"]);
  assert.equal(saved.recentCollapsed, true);
  assert.deepEqual(await setRecentToolIds(["json"]), ["json"]);
  assert.equal(await setRecentCollapsed(false), false);
  assert.equal(values.get("toolbox.recentToolIds"), '["json"]');
  assert.equal(values.get("toolbox.recentCollapsed"), "false");
});

test("recent history writes are serialized in access order", async (t) => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = { dbxPlugin: { invoke: async (method, params) => {
    calls.push(params.recentToolIds);
    await new Promise(resolve => setTimeout(resolve, params.recentToolIds.length === 1 ? 15 : 0));
    return { version: 7, recentToolIds: params.recentToolIds, recentToolLimit: 10 };
  } } };
  t.after(() => { globalThis.window = originalWindow; globalThis.localStorage = originalStorage; });

  await Promise.all([setRecentToolIds(["hash"]), setRecentToolIds(["json", "hash"])]);
  assert.deepEqual(calls, [["hash"], ["json", "hash"]]);
});

test("shortcut preferences persist through the sidecar with a local fallback", async (t) => {
  const values = new Map();
  const calls = [];
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: {
      invoke: async (method, params) => {
        calls.push({ method, params });
        return method === "toolbox/prefs/set" ? { shortcuts: params.shortcuts } : {};
      },
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  const saved = await setShortcuts({ search: "Alt+KeyP", home: "", "tool:json": "Mod+Shift+KeyJ" });
  assert.equal(saved.search, "Alt+KeyP");
  assert.equal(saved.home, "");
  assert.equal(saved["tool:json"], "Mod+Shift+KeyJ");
  assert.deepEqual(calls.at(-1), { method: "toolbox/prefs/set", params: { shortcuts: saved } });
  assert.equal(JSON.parse(values.get("toolbox.shortcuts")).search, "Alt+KeyP");
});

test("current sidecar settings override stale local auto-lock state", async (t) => {
  const values = new Map([["toolbox.vaultAutoLockMinutes", "60"]]);
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: {
      invoke: async () => ({ vaultAutoLockMinutes: 15 }),
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  assert.equal(await getVaultAutoLockMinutes(), 15);
  assert.equal(values.get("toolbox.vaultAutoLockMinutes"), "15");
});

test("auto-lock updates are partial and failed saves do not poison local fallback", async (t) => {
  const values = new Map([["toolbox.vaultAutoLockMinutes", "15"]]);
  const calls = [];
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: {
      invoke: async (method, params) => {
        calls.push({ method, params });
        if (method === "toolbox/prefs/get") return { vaultAutoLockMinutes: 15, favoriteToolIds: ["hash"] };
        return { vaultAutoLockMinutes: 30 };
      },
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  assert.equal(await setVaultAutoLockMinutes(30), 30);
  assert.deepEqual(calls.at(-1), {
    method: "toolbox/prefs/set",
    params: { vaultAutoLockMinutes: 30 },
  });

  window.dbxPlugin.invoke = async (method) => {
    if (method === "toolbox/prefs/get") return { vaultAutoLockMinutes: 30 };
    throw new Error("disk full");
  };
  await assert.rejects(() => setVaultAutoLockMinutes(60), /disk full/);
  assert.equal(values.get("toolbox.vaultAutoLockMinutes"), "30");
});

test("failed favorite saves do not overwrite the local fallback", async (t) => {
  const values = new Map([["toolbox.favoriteToolIds", '["hash"]']]);
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: { invoke: async () => { throw new Error("disk full"); } },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  await assert.rejects(() => setFavoriteToolIds(["json"]), /disk full/);
  assert.equal(values.get("toolbox.favoriteToolIds"), '["hash"]');
});

test("favorites dropped by an older sidecar allow-list stay in the UI", async (t) => {
  const values = new Map();
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
  globalThis.window = {
    dbxPlugin: {
      invoke: async (_method, params) => ({
        // Pretend the running sidecar predates image-generate.
        favoriteToolIds: (params?.favoriteToolIds || []).filter((id) => id !== "image-generate"),
      }),
    },
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalStorage;
  });

  const saved = await setFavoriteToolIds(["hash", "image-generate"]);
  assert.deepEqual(saved, ["hash", "image-generate"]);
  assert.equal(values.get("toolbox.favoriteToolIds"), '["hash","image-generate"]');

  window.dbxPlugin.invoke = async () => ({ favoriteToolIds: ["hash"] });
  assert.deepEqual(await getFavoriteToolIds(), ["hash", "image-generate"]);
});
