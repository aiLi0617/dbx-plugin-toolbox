// Local, non-sensitive fixtures for browser regression; never distributed.
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import { encodeAnimation } from "../src/lib/gifEditing.js";
await mkdir("output/playwright", { recursive: true });
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 3; i++) {
  const page = pdf.addPage([300, 400]);
  page.drawText(`Toolbox sample page ${i}`, { x: 24, y: 340, size: 18, font });
}
await writeFile("output/playwright/sample.pdf", await pdf.save());
const frames = [80, 170, 250].map((delay, index) => {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (x >= index * 3 && x < index * 3 + 6 && y >= 4 && y < 12)
        data.set([255, 70 + index * 50, 40, 255], (y * 16 + x) * 4);
    }
  return { data, delay };
});
await writeFile(
  "output/playwright/sample.gif",
  encodeAnimation({ width: 16, height: 16, repeat: 2, frames }, 64),
);
