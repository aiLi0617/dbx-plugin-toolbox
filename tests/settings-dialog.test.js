import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compile, parse } from "svelte/compiler";
import { defaultSettings, parseSettingsFile, exportSettings, MAX_SETTINGS_BYTES } from "../src/lib/settingsTransfer.js";

const source = fs.readFileSync(new URL("../src/lib/SettingsDialog.svelte", import.meta.url), "utf8");
const handlers = parse(source, { modern: true }).instance.content.body
  .filter(node => node.type === "FunctionDeclaration").map(node => source.slice(node.start, node.end)).join("\n");
function dialogState(initial = {}, onSave = async () => {}) {
  return new Function("initial", "onSave", "defaultSettings", "parseSettingsFile", "MAX_SETTINGS_BYTES", "exportSettings", `
    let draft = defaultSettings(), baseline = JSON.stringify(draft), hasChanges = true;
    let clearRecent = false, pendingImport = null, confirmation = '', busy = false;
    const backupDirty = initial.backupDirty ?? false, backupBusy = initial.backupBusy ?? false;
    const passwordDirty = initial.passwordDirty ?? false, passwordBusy = initial.passwordBusy ?? false;
    const hasShortcutConflicts = initial.hasShortcutConflicts ?? false;
    let closeTarget = 'close', notice = '', error = '', closed = false, vault = false;
    const onClose = () => closed = true, onOpenVault = () => vault = true;
    const t = (zh, en) => en, locale = 'en', DEFAULT_RECENT_TOOL_LIMIT = 10;
    const localizeError = (locale, err) => err.message;
    const tick = async () => {};
    const window = {dbxPlugin: {invoke() {}}};
    const saveBlobThroughHost = initial.saveBlobThroughHost;
    let focus = '';
    const document = {activeElement: null};
    const first = {focus() {focus = 'first';}, getClientRects() {return [1];}};
    const last = {focus() {focus = 'last';}, getClientRects() {return [1];}};
    const dialog = {querySelectorAll() {return [first, last];}, focus() {focus = 'dialog';}};
    Object.assign(draft, initial.draft);
    busy = initial.busy ?? false; hasChanges = initial.hasChanges ?? true;
    ${handlers}
    return {requestClose, finishClose, clearPreferences, acceptImport, resetInterface, resetVault, save, onImport, exportPreferences,
      key(event, position) {document.activeElement = position === 'first' ? first : position === 'last' ? last : dialog; keydown(event);},
      read: () => ({draft, clearRecent, pendingImport, confirmation, busy, notice, error, closed, vault, baseline, focus})};
  `)(initial, onSave, defaultSettings, parseSettingsFile, MAX_SETTINGS_BYTES, exportSettings);
}

test("preferences export uses the host's ordinary file path rather than image validation", async () => {
  let calls = 0;
  const state = dialogState({
    draft: {recentToolLimit: 20, favoriteToolIds: ["json"]},
    async saveBlobThroughHost(blob, options) {
      calls++;
      assert.equal(options.binary, true);
      assert.equal(options.fileName, "dbx-toolbox-preferences.json");
      assert.equal(options.extension, "json");
      assert.equal(options.mimeType, "application/json");
      assert.deepEqual(parseSettingsFile(await blob.text()), state.read().draft);
      assert.equal(state.read().busy, true);
      return {cancelled: false, path: "dbx-toolbox-preferences.json"};
    },
  });
  await state.exportPreferences();
  assert.equal(calls, 1);
  assert.equal(state.read().notice, "Preferences exported.");
  assert.equal(state.read().error, "");
  assert.equal(state.read().busy, false);
});

test("preferences export cancellation and failures release the dialog without claiming success", async () => {
  for (const result of [{cancelled: true}, {canceled: true}, new Error("Failed to save file")]) {
    const state = dialogState({async saveBlobThroughHost() {
      if (result instanceof Error) throw result;
      return result;
    }});
    await state.exportPreferences();
    assert.equal(state.read().notice, "");
    assert.equal(state.read().error, result instanceof Error ? result.message : "");
    assert.equal(state.read().busy, false);
    assert.equal(state.read().focus, "dialog");
  }
});

test("settings dialog and app compile without accessibility warnings", () => {
  for (const file of ["SettingsDialog.svelte", "SettingsConfirmation.svelte", "ShortcutSettings.svelte", "VaultPasswordSettings.svelte", "../App.svelte"]) {
    const path = new URL(`../src/lib/${file}`, import.meta.url);
    const result = compile(fs.readFileSync(path, "utf8"), { filename: path.pathname });
    assert.deepEqual(result.warnings.filter(w => w.code.startsWith("a11y")), []);
  }
});

test("dirty settings require discard and pending saves cannot close", async () => {
  const dirty = dialogState(); dirty.requestClose();
  assert.equal(dirty.read().confirmation, "discard"); assert.equal(dirty.read().closed, false);
  dirty.finishClose(); assert.equal(dirty.read().closed, true);
  const clean = dialogState({hasChanges: false}); clean.requestClose("vault"); assert.equal(clean.read().vault, true);
  const saving = dialogState({busy: true}); saving.requestClose(); assert.equal(saving.read().closed, false);
});

test("password edits participate in close protection and rotation blocks closing", () => {
  const editing = dialogState({hasChanges: false, passwordDirty: true});
  editing.requestClose(); assert.equal(editing.read().confirmation, "discard");
  const updating = dialogState({hasChanges: false, passwordBusy: true});
  updating.requestClose(); assert.equal(updating.read().closed, false);
});

test("settings save failures retain draft and successful saves update baseline", async () => {
  const broken = dialogState({}, async () => {throw new Error("disk full");});
  await broken.save(); assert.equal(broken.read().error, "disk full"); assert.equal(broken.read().busy, false);
  assert.equal(broken.read().closed, false);
  let snapshot;
  const working = dialogState({draft: {recentToolLimit: 20}}, async p => {snapshot = structuredClone(p);});
  await working.save(); assert.equal(snapshot.recentToolLimit, 20);
  assert.deepEqual(JSON.parse(working.read().baseline), snapshot);
});

test("shortcut conflicts disable the shared settings save across sections", async () => {
  let calls = 0;
  const state = dialogState({hasShortcutConflicts: true}, async () => {calls++;});
  await state.save();
  assert.equal(calls, 0);
  assert.equal(state.read().busy, false);
});

test("group resets are isolated and clearing preferences is staged", () => {
  const state = dialogState({draft: {recentToolLimit: 20, vaultAutoLockMinutes: 60, favoriteToolIds: ["json"]}});
  state.resetInterface(); assert.equal(state.read().draft.vaultAutoLockMinutes, 60);
  state.resetVault(); assert.deepEqual(state.read().draft.favoriteToolIds, ["json"]);
  state.clearPreferences(); assert.equal(state.read().clearRecent, true);
  assert.deepEqual(state.read().draft, defaultSettings());
});

test("Tab and Shift+Tab wrap focus within the dialog", () => {
  const state = dialogState(); let prevented = false;
  state.key({key: "Tab", preventDefault() {prevented = true;}}, "last");
  assert.equal(prevented, true); assert.equal(state.read().focus, "first");
  state.key({key: "Tab", shiftKey: true, preventDefault() {}}, "first");
  assert.equal(state.read().focus, "last");
});

test("file import stages a validated preview before any settings are changed", async () => {
  let saves = 0;
  const state = dialogState({}, async () => { saves++; });
  const imported = {...defaultSettings(), recentToolLimit: 20, favoriteToolIds: ["json"]};
  const text = exportSettings(imported);
  const event = {target: {files: [{size: text.length, text: async () => text}], value: "selected"}};
  await state.onImport(event);
  assert.equal(saves, 0); assert.deepEqual(state.read().draft, defaultSettings());
  assert.deepEqual(state.read().pendingImport, imported);
  assert.equal(event.target.value, "");
  state.acceptImport(); assert.deepEqual(state.read().draft, imported); assert.equal(saves, 0);
  await state.save(); assert.equal(saves, 1);
  await state.onImport({target: {files: [{size: 2, text: async () => "{}"}], value: "selected"}});
  assert.equal(state.read().pendingImport, null); assert.deepEqual(state.read().draft, imported);
  assert.equal(state.read().error, "Invalid preferences file");
  await state.onImport({target: {files: [{size: MAX_SETTINGS_BYTES + 1, text: async () => { throw new Error("should not read"); }}], value: "selected"}});
  assert.equal(state.read().error, "Invalid preferences file");
});
