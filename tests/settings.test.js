import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, exportSettings, parseSettingsFile, validateSettings, MAX_SETTINGS_BYTES } from "../src/lib/settingsTransfer.js";
import { getWorkspacePreferences, setSettingsPreferences, setRecentToolIds } from "../src/lib/prefs.js";

test("settings files round trip safe preferences and exclude unrelated sensitive state", () => {
  const settings = { ...defaultSettings(), favoriteToolIds: ["json"], recentToolLimit: 20 };
  settings.shortcuts["tool:json"] = "Mod+Shift+KeyJ";
  const text = exportSettings({ ...settings, keystore: "secret", password: "secret", toolInput: "secret", recentToolIds: ["hash"] });
  assert.deepEqual(parseSettingsFile(text), settings);
  assert.doesNotMatch(text, /secret|keystore|password|toolInput|recentToolIds/);
});

test("settings import rejects unsafe shapes, unknown IDs, invalid intervals and conflicting shortcuts", () => {
  const mutations = [
    p => { p.__protoField = {}; },
    p => { p.keystore = "secret"; },
    p => { p.favoriteToolIds = ["unknown"]; },
    p => { p.favoriteToolIds = ["json", "json"]; },
    p => { p.sidebarCollapsed = "false"; },
    p => { p.recentToolLimit = 100; },
    p => { p.vaultAutoLockMinutes = "15"; },
    p => { p.shortcuts.search = "KeyA"; },
    p => { p.shortcuts.home = p.shortcuts.search; },
    p => { p.shortcuts["tool:unknown"] = "Alt+KeyJ"; },
    p => { p.shortcuts = []; },
    p => { delete p.favoriteToolIds; },
  ];
  for (const mutate of mutations) {
    const p = defaultSettings(); mutate(p);
    assert.throws(() => validateSettings(p), /Invalid preferences file/);
  }
  const raw = JSON.parse(exportSettings(defaultSettings()));
  raw.preferences.shortcuts = JSON.parse('{"__proto__":"Mod+KeyZ"}');
  assert.throws(() => parseSettingsFile(JSON.stringify(raw)), /Invalid preferences file/);
  raw.version = 999;
  assert.throws(() => parseSettingsFile(JSON.stringify(raw)), /Invalid preferences file/);
  assert.throws(() => parseSettingsFile("{"), /Invalid preferences file/);
  assert.throws(() => parseSettingsFile(" ".repeat(MAX_SETTINGS_BYTES + 1)), /Invalid preferences file/);
});

test("new and old backends persist settings in a single transaction; failure preserves fallback", async t => {
  const priorWindow = globalThis.window, priorStorage = globalThis.localStorage;
  const values = new Map(), calls = [];
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)) };
  globalThis.window = { dbxPlugin: { invoke: async (method, params) => { calls.push({ method, params: structuredClone(params) }); return { version: 7, ...params }; } } };
  t.after(() => { globalThis.window = priorWindow; globalThis.localStorage = priorStorage; });
  const draft = { ...defaultSettings(), recentToolLimit: 20, favoriteToolIds: ["json"] };
  const saved = await setSettingsPreferences(draft, { clearRecent: true });
  assert.equal(saved.version, 7);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { method: "toolbox/prefs/set", params: { ...draft, recentToolIds: [] } });
  assert.equal(values.get("toolbox.recentToolLimit"), "20");
  const previousValues = [...values];
  window.dbxPlugin.invoke = async () => { throw new Error("disk full"); };
  await assert.rejects(setSettingsPreferences(defaultSettings()), /disk full/);
  assert.deepEqual([...values], previousValues);
  // An old sidecar lacks the new field; the saved local value survives loading.
  window.dbxPlugin.invoke = async () => ({ version: 6, recentToolIds: [], sidebarCollapsed: false });
  assert.equal((await getWorkspacePreferences()).recentToolLimit, 20);
  delete window.dbxPlugin;
  assert.equal((await setSettingsPreferences(draft)).recentToolLimit, 20);
});

test("recent tool history can retain twenty entries", async t => {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = { setItem() {}, getItem() { return null; } };
  t.after(() => { globalThis.window = previousWindow; globalThis.localStorage = previousStorage; });
  const { tools } = await import("../src/lib/catalog.js");
  assert.equal((await setRecentToolIds(tools.slice(0, 20).map(tool => tool.id))).length, 20);
});

test("unavailable browser storage cannot report a successful settings save", async t => {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage;
  globalThis.window = {};
  globalThis.localStorage = {getItem() {return null;}, setItem() {throw new Error("storage unavailable");}, removeItem() {}};
  t.after(() => {globalThis.window = previousWindow; globalThis.localStorage = previousStorage;});
  await assert.rejects(setSettingsPreferences(defaultSettings()), /storage unavailable/);
});
