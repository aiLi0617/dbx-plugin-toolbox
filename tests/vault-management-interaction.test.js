import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "svelte/compiler";

const source = readFileSync(new URL("../src/lib/VaultView.svelte", import.meta.url), "utf8");
const wanted = new Set(["passwordTooShort", "run", "clearManagement", "closeManagement", "requestCloseManagement", "createKey", "changePassword"]);
const handlers = parse(source, { modern: true }).instance.content.body
  .filter((node) => node.type === "FunctionDeclaration" && wanted.has(node.id.name))
  .map((node) => source.slice(node.start, node.end)).join("\n");

function management(initial = {}, invoke = async () => ({ key: { id: "new-key" } })) {
  const defaults = {
    panel: "create", busy: false, discardPending: false, formError: "", fieldErrors: {},
    createName: "", createAlg: "aes-256", createMode: "generate", createBits: "2048", createFormat: "pkcs8",
    createMaterial: "", createPublicMaterial: "", currentPassword: "", newPassword: "", confirmNewPassword: "",
    highlightedKeyId: "", listQuery: "", keyType: "all", highlightTimer: null,
  };
  const values = { ...defaults, ...initial };
  return new Function("initial", "invoke", `
    ${Object.keys(defaults).map((key) => `let ${key} = initial.${key};`).join("\n")}
    const t = (zh, en) => en;
    const errorText = error => error.message;
    const fail = error => { throw error; };
    const ok = () => {};
    const refresh = async () => {};
    const tick = async () => {};
    const window = { clearTimeout() {}, setTimeout() { return 1; } };
    const document = { querySelector() { return null; } };
    const CSS = { escape: value => value };
    const managementTrigger = null;
    const generateSymmetricKeyMaterial = () => ({ material: '00'.repeat(32) });
    const generateRsaKeyPairPem = async () => ({ privateKey: 'test-private-key' });
    const pasteExisting = createMode === 'paste';
    ${handlers}
    return { createKey, changePassword, requestCloseManagement, closeManagement,
      read: () => ({ ${Object.keys(defaults).join(",")} }) };
  `)(values, invoke);
}

test("dirty key forms require explicit discard and clear secret material afterward", () => {
  const form = management({ createMaterial: "sensitive-test-input", createMode: "paste" });
  form.requestCloseManagement();
  assert.equal(form.read().discardPending, true);
  assert.equal(form.read().panel, "create");
  assert.equal(form.read().createMaterial, "sensitive-test-input");
  form.closeManagement();
  assert.equal(form.read().panel, "");
  assert.equal(form.read().createMaterial, "");
});

test("pending saves cannot be dismissed or submitted twice", async () => {
  let calls = 0;
  const form = management({ busy: true, createName: "test" }, async () => { calls++; });
  form.requestCloseManagement();
  await form.createKey();
  assert.equal(form.read().panel, "create");
  assert.equal(form.read().discardPending, false);
  assert.equal(calls, 0);
});

test("required create fields are validated before calling the backend", async () => {
  let calls = 0;
  const form = management({ createMode: "paste" }, async () => { calls++; });
  await form.createKey();
  assert.equal(calls, 0);
  assert.ok(form.read().fieldErrors.createName);
  assert.ok(form.read().fieldErrors.createMaterial);
});

test("successful key creation closes the form, clears secrets and highlights the new row", async () => {
  let request;
  const form = management({ createName: "test", createMode: "paste", createMaterial: "test-secret", keyType: "sm4-128" }, async (method, params) => {
    request = { method, params: structuredClone(params) };
    return { key: { id: "new-key" } };
  });
  await form.createKey();
  assert.equal(request.method, "toolbox/keys/create");
  assert.equal(request.params.material, "test-secret");
  assert.equal(form.read().panel, "");
  assert.equal(form.read().createMaterial, "");
  assert.equal(form.read().highlightedKeyId, "new-key");
  assert.equal(form.read().keyType, "all");
});

test("key type filters combine with text queries and retain exact algorithm boundaries", () => {
  const declaration = parse(source, { modern: true }).instance.content.body
    .flatMap((node) => node.type === "VariableDeclaration" ? node.declarations : [])
    .find((node) => node.id.name === "filteredKeys");
  const expression = declaration.init.arguments[0];
  const filter = new Function("keys", "keyType", "listQuery", `return ${source.slice(expression.start, expression.end)};`);
  const keys = [
    { id:"a", name:"production", algorithm:"aes-128" },
    { id:"b", name:"production", algorithm:"aes-256" },
    { id:"c", name:"test", algorithm:"aes-256" },
  ];
  assert.deepEqual(filter(keys, "aes-256", "production").map((key) => key.id), ["b"]);
  assert.deepEqual(filter(keys, "all", "production").map((key) => key.id), ["a", "b"]);
  assert.deepEqual(filter(keys, "aes-128", "test"), []);
});

test("password errors remain in the modal and successful changes clear all password fields", async () => {
  const initial = { panel: "password", currentPassword: "old-password", newPassword: "new-password", confirmNewPassword: "new-password" };
  const failed = management(initial, async () => { throw new Error("Wrong master password"); });
  await failed.changePassword();
  assert.equal(failed.read().panel, "password");
  assert.equal(failed.read().formError, "Wrong master password");
  assert.equal(failed.read().newPassword, "new-password");
  const saved = management(initial);
  await saved.changePassword();
  assert.equal(saved.read().panel, "");
  assert.equal(saved.read().currentPassword + saved.read().newPassword + saved.read().confirmNewPassword, "");
});
