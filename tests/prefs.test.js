import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VAULT_AUTO_LOCK_MINUTES,
  getFavoriteToolIds,
  getVaultAutoLockMinutes,
  sanitizeVaultAutoLockMinutes,
  setFavoriteToolIds,
  setVaultAutoLockMinutes,
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
