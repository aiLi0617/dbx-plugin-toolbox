import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHORTCUTS,
  currentToolPrimaryButton,
  SHORTCUT_GROUPS,
  sanitizeShortcut,
  sanitizeShortcuts,
  shortcutConflicts,
  shortcutFromEvent,
  shortcutLabel,
  shortcutMatches,
  toolIdFromShortcutAction,
  toolShortcutAction,
} from "../src/lib/shortcuts.js";

test("shortcut syntax is normalized and unsafe bare keys are rejected", () => {
  assert.equal(sanitizeShortcut("Shift+Mod+KeyK"), "Mod+Shift+KeyK");
  assert.equal(sanitizeShortcut("KeyK"), null);
  assert.equal(sanitizeShortcut("Shift+KeyK"), null);
  assert.equal(sanitizeShortcut("F8"), "F8");
  assert.equal(sanitizeShortcut(""), "");
  assert.equal(sanitizeShortcut("Mod+Unknown"), null);
  assert.deepEqual(sanitizeShortcuts({ search: "Alt+KeyP", home: "" }), {
    ...DEFAULT_SHORTCUTS,
    search: "Alt+KeyP",
    home: "",
  });
  assert.deepEqual(sanitizeShortcuts({ "tool:json": "Mod+Shift+KeyJ", "tool:../bad": "Mod+KeyX" }), {
    ...DEFAULT_SHORTCUTS,
    "tool:json": "Mod+Shift+KeyJ",
  });
  assert.equal(toolShortcutAction("image-process"), "tool:image-process");
  assert.equal(toolShortcutAction("../bad"), "");
  assert.equal(toolIdFromShortcutAction("tool:image-process"), "image-process");
});

test("keyboard events can be captured, matched, and displayed", () => {
  const event = { code: "KeyP", ctrlKey: true, metaKey: false, altKey: true, shiftKey: false };
  assert.equal(shortcutFromEvent(event, false), "Mod+Alt+KeyP");
  assert.equal(shortcutFromEvent({ ...event, ctrlKey: false, metaKey: true }, true), "Mod+Alt+KeyP");
  assert.equal(shortcutFromEvent({ ...event, ctrlKey: true, metaKey: false }, true), "Control+Alt+KeyP");
  assert.equal(shortcutMatches(event, "Mod+Alt+KeyP", false), true);
  assert.equal(shortcutMatches({ ...event, shiftKey: true }, "Mod+Alt+KeyP", false), false);
  assert.equal(shortcutLabel("Mod+Alt+KeyP", false), "Ctrl+Alt+P");
  assert.equal(shortcutLabel("Mod+Comma", true), "⌘ ,");
});

test("duplicate bindings identify every conflicting action", () => {
  const conflicts = shortcutConflicts({ ...DEFAULT_SHORTCUTS, home: DEFAULT_SHORTCUTS.search, "tool:json": DEFAULT_SHORTCUTS.search });
  assert.deepEqual([...conflicts].sort(), ["home", "search", "tool:json"]);
});

test("calculate is a configurable tool action with migration, clearing, and conflict checks", () => {
  assert.equal(sanitizeShortcuts({}).calculate, "Mod+Enter");
  assert.ok(SHORTCUT_GROUPS.find(group => group.id === "tool").actions.includes("calculate"));
  assert.equal(sanitizeShortcuts({calculate: "Alt+KeyR"}).calculate, "Alt+KeyR");
  assert.equal(sanitizeShortcuts({calculate: ""}).calculate, "");
  assert.equal(shortcutMatches({code: "KeyR", ctrlKey: false, metaKey: false, altKey: true, shiftKey: false}, "Alt+KeyR"), true);
  assert.equal(shortcutMatches({code: "Enter", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false}, "Alt+KeyR"), false);
  assert.equal(shortcutMatches({code: "Enter", ctrlKey: true}, ""), false);
  assert.ok(shortcutConflicts({...DEFAULT_SHORTCUTS, calculate: DEFAULT_SHORTCUTS.search}).has("calculate"));
});

function primaryButton({ hidden = false, rendered = true, disabled = false, explicit = false } = {}) {
  return {
    closest: () => hidden ? {} : null,
    getClientRects: () => rendered ? [{}] : [],
    matches: () => disabled,
    hasAttribute: () => explicit,
  };
}

function toolPane(buttons, target = null) {
  return { querySelectorAll: () => buttons, contains: value => value === target };
}

test("primary action resolves visible tool buttons beyond the math calculator", () => {
  const hiddenSession = primaryButton({ hidden: true });
  const hiddenTab = primaryButton({ rendered: false });
  const confirm = primaryButton();
  assert.equal(currentToolPrimaryButton(toolPane([hiddenSession, hiddenTab, confirm])), confirm);
  assert.equal(currentToolPrimaryButton(toolPane([])), null);
  assert.equal(currentToolPrimaryButton(null), null);
});

test("a disabled primary action does not fall through to a different operation", () => {
  const busy = primaryButton({ disabled: true });
  const secondary = primaryButton();
  assert.equal(currentToolPrimaryButton(toolPane([busy, secondary])), null);
});

test("focused forms and explicit primary markers select the intended operation", () => {
  const first = primaryButton();
  const submit = primaryButton();
  const target = { closest: () => ({ contains: button => button === submit }) };
  assert.equal(currentToolPrimaryButton(toolPane([first, submit], target), target), submit);
  const explicit = primaryButton({ explicit: true });
  assert.equal(currentToolPrimaryButton(toolPane([first, submit, explicit], target), target), explicit);
});
