import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHORTCUTS,
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
  assert.equal(shortcutMatches(event, "Mod+Alt+KeyP"), true);
  assert.equal(shortcutMatches({ ...event, shiftKey: true }, "Mod+Alt+KeyP"), false);
  assert.equal(shortcutLabel("Mod+Alt+KeyP", false), "Ctrl+Alt+P");
  assert.equal(shortcutLabel("Mod+Comma", true), "⌘ ,");
});

test("duplicate bindings identify every conflicting action", () => {
  const conflicts = shortcutConflicts({ ...DEFAULT_SHORTCUTS, home: DEFAULT_SHORTCUTS.search, "tool:json": DEFAULT_SHORTCUTS.search });
  assert.deepEqual([...conflicts].sort(), ["home", "search", "tool:json"]);
});
