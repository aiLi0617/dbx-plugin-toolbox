import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRichTextLink, createRichTextHistory } from "../src/lib/richText.js";
import { tools } from "../src/lib/catalog.js";
import { viewPropsForTool } from "../src/lib/viewRegistry.js";

test("the shared Demo action is exposed and its revision reaches the rich text view", () => {
  const tool = tools.find(({ id }) => id === "rich-text");
  assert.ok(tool.actions.includes("demo"));
  assert.equal(tool.demoPreset, "rich-text");
  assert.equal(viewPropsForTool(tool, { demoRequest: 2 }).demoRequest, 2);
});

test("rich text links accept common schemes and default bare hosts to HTTPS", () => {
  assert.equal(normalizeRichTextLink(" example.com/docs?q=1 "), "https://example.com/docs?q=1");
  assert.equal(normalizeRichTextLink("https://example.com/a"), "https://example.com/a");
  assert.equal(normalizeRichTextLink("mailto:hello@example.com"), "mailto:hello@example.com");
  assert.equal(normalizeRichTextLink("tel:+86123456789"), "tel:+86123456789");
});

test("rich text links reject executable schemes, credentials, empty and malformed values", () => {
  for (const value of ["", "   ", "javascript:alert(1)", "data:text/html,test", "vbscript:msgbox(1)", "file:///etc/passwd", "https://", "not a link", "https://user:pass@example.com", "java\nscript:alert(1)", "mailto:", "tel:"]) {
    assert.equal(normalizeRichTextLink(value), null, value);
  }
});

test("history restores applied source and clear operations, and drops redo after a new edit", () => {
  const history = createRichTextHistory();
  history.push("<p>hello</p>");
  history.push("<h2>hello</h2>");
  history.push("");
  assert.equal(history.undo(), "<h2>hello</h2>");
  assert.equal(history.undo(), "<p>hello</p>");
  assert.equal(history.redo(), "<h2>hello</h2>");
  history.push("<p>new branch</p>");
  assert.equal(history.canRedo, false);
  assert.equal(history.undo(), "<h2>hello</h2>");
});

test("history ignores duplicate updates and bounds retained snapshots", () => {
  const history = createRichTextHistory("", 3);
  for (const value of ["a", "a", "b", "c"]) history.push(value);
  assert.equal(history.undo(), "b");
  assert.equal(history.undo(), "a");
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), "a");
  assert.equal(history.redo(), "b");
  assert.equal(history.redo(), "c");
  assert.equal(history.canRedo, false);
});
