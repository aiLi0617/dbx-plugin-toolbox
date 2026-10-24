export const SHORTCUT_ACTIONS = Object.freeze([
  "search",
  "home",
  "catalog",
  "vault",
  "toggleSidebar",
  "previousTool",
  "nextTool",
  "closeTool",
  "toggleFavorite",
  "loadDemo",
  "settings",
]);

export const SHORTCUT_GROUPS = Object.freeze([
  Object.freeze({ id: "navigation", actions: Object.freeze(["search", "home", "catalog", "vault"]) }),
  Object.freeze({ id: "workspace", actions: Object.freeze(["toggleSidebar", "previousTool", "nextTool", "closeTool"]) }),
  Object.freeze({ id: "tool", actions: Object.freeze(["toggleFavorite", "loadDemo"]) }),
  Object.freeze({ id: "settings", actions: Object.freeze(["settings"]) }),
]);

export const DEFAULT_SHORTCUTS = Object.freeze({
  search: "Mod+KeyK",
  home: "Mod+Digit1",
  catalog: "Mod+Digit2",
  vault: "Mod+Digit3",
  toggleSidebar: "Mod+KeyB",
  previousTool: "Mod+Shift+BracketLeft",
  nextTool: "Mod+Shift+BracketRight",
  closeTool: "Mod+KeyW",
  toggleFavorite: "Mod+Shift+KeyF",
  loadDemo: "Mod+Shift+KeyD",
  settings: "Mod+Comma",
});

const TOOL_ACTION_PATTERN = /^tool:([a-z0-9][a-z0-9._-]{0,79})$/;

const CODE_PATTERN = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Backquote|Enter|Space|Tab|Home|End|PageUp|PageDown|Insert|Delete)$/;

function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform || navigator.platform || "");
}

export function sanitizeShortcut(value) {
  if (value === "") return "";
  if (typeof value !== "string") return null;
  const parts = value.split("+");
  const code = parts.pop();
  if (!CODE_PATTERN.test(code || "")) return null;
  const modifiers = new Set(parts);
  if (modifiers.size !== parts.length || [...modifiers].some((item) => !["Mod", "Control", "Alt", "Shift"].includes(item))) return null;
  if (!["Mod", "Control", "Alt"].some((item) => modifiers.has(item)) && !/^F(?:[1-9]|1[0-2])$/.test(code)) return null;
  return [...["Mod", "Control", "Alt", "Shift"].filter((item) => modifiers.has(item)), code].join("+");
}

export function sanitizeShortcuts(value, fallback = DEFAULT_SHORTCUTS) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const next = {};
  for (const action of SHORTCUT_ACTIONS) {
    const candidate = Object.hasOwn(source, action) ? sanitizeShortcut(source[action]) : null;
    const inherited = sanitizeShortcut(fallback?.[action]);
    next[action] = candidate ?? inherited ?? "";
  }
  for (const [action, value] of Object.entries(source)) {
    if (!TOOL_ACTION_PATTERN.test(action)) continue;
    const shortcut = sanitizeShortcut(value);
    if (shortcut) next[action] = shortcut;
  }
  return next;
}

export function toolShortcutAction(toolId) {
  const action = `tool:${String(toolId || "")}`;
  return TOOL_ACTION_PATTERN.test(action) ? action : "";
}

export function toolIdFromShortcutAction(action) {
  return TOOL_ACTION_PATTERN.exec(action)?.[1] || "";
}

export function shortcutFromEvent(event, mac = isMacPlatform()) {
  if (!event?.code || ["ControlLeft", "ControlRight", "ShiftLeft", "ShiftRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(event.code)) return "";
  const modifiers = [];
  if (mac ? event.metaKey : event.ctrlKey) modifiers.push("Mod");
  if (mac ? event.ctrlKey : event.metaKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  return sanitizeShortcut([...modifiers, event.code].join("+")) || "";
}

export function shortcutMatches(event, shortcut) {
  const normalized = sanitizeShortcut(shortcut);
  if (!normalized || !event?.code) return false;
  const parts = new Set(normalized.split("+"));
  const mac = isMacPlatform();
  const modPressed = mac ? event.metaKey : event.ctrlKey;
  const extraPlatformModifier = mac ? event.ctrlKey : event.metaKey;
  return parts.has(event.code)
    && modPressed === parts.has("Mod")
    && extraPlatformModifier === parts.has("Control")
    && Boolean(event.altKey) === parts.has("Alt")
    && Boolean(event.shiftKey) === parts.has("Shift");
}

function codeLabel(code) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return ({
    Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
    BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-",
    Equal: "=", Backquote: "`", Space: "Space", ArrowUp: "↑", ArrowDown: "↓",
    ArrowLeft: "←", ArrowRight: "→", PageUp: "Page Up", PageDown: "Page Down",
  })[code] || code;
}

export function shortcutLabel(shortcut, mac = isMacPlatform()) {
  const normalized = sanitizeShortcut(shortcut);
  if (!normalized) return "—";
  const parts = normalized.split("+");
  const code = parts.pop();
  const labels = parts.map((part) => ({
    Mod: mac ? "⌘" : "Ctrl",
    Control: mac ? "Ctrl" : "Win",
    Alt: mac ? "⌥" : "Alt",
    Shift: mac ? "⇧" : "Shift",
  })[part]);
  return [...labels, codeLabel(code)].join(mac ? " " : "+");
}

export function shortcutConflicts(shortcuts) {
  const seen = new Map();
  const conflicts = new Set();
  for (const [action, rawValue] of Object.entries(shortcuts || {})) {
    if (!SHORTCUT_ACTIONS.includes(action) && !TOOL_ACTION_PATTERN.test(action)) continue;
    const value = sanitizeShortcut(rawValue);
    if (!value) continue;
    if (seen.has(value)) {
      conflicts.add(action);
      conflicts.add(seen.get(value));
    } else seen.set(value, action);
  }
  return conflicts;
}

export function isEditableTarget(target) {
  return Boolean(target?.closest?.("input, textarea, select, [contenteditable='true'], [role='textbox']"));
}
