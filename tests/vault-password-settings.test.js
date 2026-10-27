import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, compile } from "svelte/compiler";

const source = readFileSync(new URL("../src/lib/VaultPasswordSettings.svelte", import.meta.url), "utf8");
const handlers = parse(source, {modern: true}).instance.content.body
  .filter(n => n.type === "FunctionDeclaration").map(n => source.slice(n.start, n.end)).join("\n");
function passwordForm(initial = {}, invoke = async () => ({ok: true})) {
  return new Function("initial", "invoke", `
    let currentPassword = initial.currentPassword ?? 'old-password';
    let newPassword = initial.newPassword ?? 'new-password';
    let confirmNewPassword = initial.confirmNewPassword ?? 'new-password';
    let status = {unlocked: initial.unlocked ?? true}, updating = initial.updating ?? false;
    let disposed = false, statusSequence = 0, fieldErrors = {}, error = '', notice = '';
    let events = 0;
    const locale = 'en', t = (zh,en) => en;
    const localizeError = (locale, error) => error.message;
    const window = {dispatchEvent() {events++;}};
    ${handlers}
    return {changePassword, resetForm, clearSecrets,
      read: () => ({currentPassword, newPassword, confirmNewPassword, fieldErrors, error, notice, updating, events})};
  `)(initial, invoke);
}

test("password settings compile and old vault password controls are removed", () => {
  assert.deepEqual(compile(source, {}).warnings.filter(w => w.code.startsWith("a11y")), []);
  const vault = readFileSync(new URL("../src/lib/VaultView.svelte", import.meta.url), "utf8");
  compile(vault, {});
  assert.doesNotMatch(vault, /changePassword|change-password|autoLockOptions|onAutoLockChange/);
  assert.doesNotMatch(source, /localStorage|setSettingsPreferences|exportSettings/);
});

test("password verification errors stay inline; successful rotation clears secrets", async () => {
  const failed = passwordForm({}, async () => {throw new Error("Current master password is wrong");});
  await failed.changePassword();
  assert.equal(failed.read().error, "Current master password is wrong");
  assert.equal(failed.read().newPassword, "new-password");
  assert.equal(failed.read().updating, false);
  let request;
  const saved = passwordForm({}, async (...args) => {request = args;});
  await saved.changePassword();
  assert.deepEqual(request, ["toolbox/keys/change-password", {currentPassword:"old-password",newPassword:"new-password"}, 60000]);
  assert.equal(saved.read().currentPassword + saved.read().newPassword + saved.read().confirmNewPassword, "");
  assert.equal(saved.read().notice, "Master password updated");
  assert.equal(saved.read().events, 1);
});

test("invalid confirmations, locked vault and duplicate submits never call the backend", async () => {
  let calls = 0;
  for (const initial of [{confirmNewPassword:"mismatch"}, {newPassword:"short"}, {currentPassword:"short"}, {unlocked:false}, {updating:true}]) {
    const form = passwordForm(initial, async () => {calls++;}); await form.changePassword();
  }
  assert.equal(calls, 0);
  let release;
  const pending = passwordForm({}, () => new Promise(resolve => {calls++; release = resolve;}));
  const submission = pending.changePassword(); await pending.changePassword();
  assert.equal(calls, 1); release(); await submission;
});

test("reset clears all password fields and previous errors", async () => {
  const form = passwordForm({}, async () => {throw new Error("wrong password");});
  await form.changePassword(); form.resetForm();
  assert.equal(form.read().currentPassword + form.read().newPassword + form.read().confirmNewPassword + form.read().error, "");
});
