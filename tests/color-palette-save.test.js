import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { parse } from "svelte/compiler";
import { createPalette, exportPalette } from "../src/lib/colorPalette.js";
import { saveBlobThroughHost } from "../src/lib/fileSave.js";

const source = fs.readFileSync(new URL("../src/lib/ColorPaletteView.svelte", import.meta.url), "utf8");
const handler = parse(source, { modern: true }).instance.content.body.find(node => node.type === "FunctionDeclaration" && node.id.name === "save");
function saveState(format, output) {
  return new Function("format", "output", "saveBlobThroughHost", `
    let saving = false, error = '', status = '';
    const locale = 'en', t = (zh, en) => en, localizeError = (locale, error) => error.message;
    ${source.slice(handler.start, handler.end)}
    return {save, read: () => ({saving, error, status})};
  `)(format, output, saveBlobThroughHost);
}

test("palette export sends CSS, JSON, HEX and SVG through the ordinary file save route", async () => {
  const previousWindow = globalThis.window;
  const colors = createPalette("#15988F", "triadic", 5);
  try {
    for (const [format, extension, mime] of [["css", "css", "text/css"], ["json", "json", "application/json"], ["hex", "txt", "text/plain"], ["svg", "svg", "image/svg+xml"]]) {
      const output = exportPalette(colors, format);
      const chunks = [];
      let finalized = false;
      globalThis.window = { dbxPlugin: { async invoke(method, params) {
        if (method.endsWith("/begin")) {
          assert.equal(params.binary, true, "Text exports must bypass the host's image validation");
          assert.equal(params.fileName, `palette.${extension}`);
          assert.equal(params.extension, extension);
          assert.equal(params.mimeType, mime);
          return { sessionId: "palette-export" };
        }
        assert.equal(params.sessionId, "palette-export");
        if (method.endsWith("/update")) {
          chunks.push(Buffer.from(params.dataBase64, "base64"));
          return { ok: true };
        }
        if (method.endsWith("/finalize")) {
          finalized = true;
          return { cancelled: false };
        }
        throw new Error(`Unexpected method: ${method}`);
      } } };
      const state = saveState(format, output);
      await state.save();
      assert.equal(finalized, true);
      assert.equal(Buffer.concat(chunks).toString("utf8"), output);
      assert.deepEqual(state.read(), { saving: false, error: "", status: "Palette exported" });
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("cancelled palette saves do not report success and failures release the button", async () => {
  const previousWindow = globalThis.window;
  try {
    for (const failed of [false, true]) {
      globalThis.window = { dbxPlugin: { async invoke(method) {
        if (method.endsWith("/begin")) return { sessionId: "palette-export" };
        if (method.endsWith("/finalize")) {
          if (failed) throw new Error("Disk write failed");
          return { cancelled: true };
        }
        return { ok: true };
      } } };
      const state = saveState("css", ":root { --color-1: #15988F; }");
      await state.save();
      assert.deepEqual(state.read(), { saving: false, error: failed ? "Disk write failed" : "", status: "" });
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
