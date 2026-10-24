import test from "node:test";
import assert from "node:assert/strict";
import {
  bcryptHash,
  bcryptVerify,
  bip39Generate,
  bip39Validate,
  bip39Seed,
  passwordStrength,
} from "../src/lib/lazy/security-tools.js";
import {
  banner,
  englishNouns,
  lunarConvert,
} from "../src/lib/lazy/content-tools.js";
import {
  PDFDocument,
  processPdf,
  inspectPdf,
  pdfSignatureData,
} from "../src/lib/lazy/pdf-tools.js";
test("Bcrypt verifies passwords without truncation or excessive costs", async () => {
  const hash = await bcryptHash("test-password", 4);
  assert.equal(await bcryptVerify("test-password", hash), true);
  assert.equal(await bcryptVerify("wrong", hash), false);
  await assert.rejects(bcryptHash("中".repeat(25), 4));
  await assert.rejects(bcryptHash("x", 13));
  assert.equal(passwordStrength("password").score, 0);
});
test("BIP39 matches the published TREZOR seed vector and supports word counts", async () => {
  const words =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  assert.equal(bip39Validate(words), true);
  assert.equal(
    await bip39Seed(words, "TREZOR"),
    "c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04",
  );
  for (const n of [12, 15, 18, 21, 24]) {
    const generated = bip39Generate(n);
    assert.equal(generated.split(" ").length, n);
    assert.equal(bip39Validate(generated), true);
  }
});
test("Figlet renders actual fonts; English irregular nouns and lunar leap dates roundtrip", () => {
  assert.ok(banner("DBX").split("\n").length > 4);
  assert.notEqual(banner("DBX", "Standard"), banner("DBX", "Small"));
  assert.throws(() => banner('DBX','Standard',1e9,'center'));
  assert.throws(() => banner('DBX','Standard',Infinity,'right'));
  assert.equal(englishNouns("child mouse sheep"), "children mice sheep");
  assert.equal(englishNouns("children mice sheep", true), "child mouse sheep");
  assert.equal(lunarConvert({ solarDate: "2026-02-17" }).lunarDay, 1);
  const leap = lunarConvert({ solarDate: "2023-03-22" });
  assert.equal(leap.leapMonth, true);
  assert.equal(
    lunarConvert({
      year: leap.lunarYear,
      month: leap.lunarMonth,
      day: leap.lunarDay,
      leap: true,
      direction: "lunar",
    }).solar,
    "2023-03-22",
  );
});
async function fixture() {
  const doc = await PDFDocument.create();
  for (let i = 1; i <= 3; i++) doc.addPage([300, 400]).drawText(`Page ${i}`);
  return doc.save();
}
test("PDF merge split extract delete organize rotate and crop preserve expected page structure", async () => {
  const input = await fixture();
  assert.equal(
    (await inspectPdf((await processPdf("merge", [input, input]))[0])).count,
    6,
  );
  const parts = await processPdf("split", [input], { pages: "1-2,3" });
  assert.equal(parts.length, 2);
  assert.equal((await inspectPdf(parts[0])).count, 2);
  assert.equal(
    (
      await inspectPdf(
        (await processPdf("extract", [input], { pages: "2" }))[0],
      )
    ).count,
    1,
  );
  assert.equal(
    (await inspectPdf((await processPdf("delete", [input], { pages: "2" }))[0]))
      .count,
    2,
  );
  const rotated = (
    await processPdf("rotate", [input], { pages: "2", angle: 90 })
  )[0];
  assert.deepEqual(
    (await inspectPdf(rotated)).pages.map((p) => p.rotation),
    [0, 90, 0],
  );
  const cropped = await PDFDocument.load(
    (
      await processPdf("crop", [input], {
        left: 10,
        right: 20,
        top: 30,
        bottom: 40,
      })
    )[0],
  );
  assert.equal(cropped.getPage(0).getCropBox().width, 270);
  await assert.rejects(processPdf("delete", [input], { pages: "1-3" }));
  await assert.rejects(processPdf("organize", [input], { order: [0, 0, 2] }));
  assert.equal(
    (
      await inspectPdf(
        (await processPdf("organize", [input], { order: [2, 0, 1] }))[0],
      )
    ).count,
    3,
  );
});
test("PDF AES-256 encryption requires the correct password; decrypted output opens without one", async () => {
  const source = await fixture();
  const encrypted = (
    await processPdf("encrypt", [source], { newPassword: "secret" })
  )[0];
  await assert.rejects(inspectPdf(encrypted));
  await assert.rejects(inspectPdf(encrypted, "wrong"));
  assert.equal((await inspectPdf(encrypted, "secret")).count, 3);
  const decrypted = (
    await processPdf("decrypt", [encrypted], { password: "secret" })
  )[0];
  assert.equal((await inspectPdf(decrypted)).count, 3);
});
test("PDF watermark, page numbers and compression produce readable new files", async () => {
  const input = await fixture();
  for (const operation of ["watermark", "page-numbers", "compress"]) {
    const result = (
      await processPdf(operation, [input], {
        text: "DBX",
        x: 20,
        y: 30,
        angle: 45,
      })
    )[0];
    assert.equal((await inspectPdf(result)).count, 3);
  }
  assert.deepEqual(await pdfSignatureData(input), []);
});
test("PDF visual signatures embed a PNG on selected pages", async () => {
  const input = await fixture();
  const signature = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl5ZJYAAAAASUVORK5CYII=",
    "base64",
  );
  const result = (
    await processPdf("visual-signature", [input], {
      pages: "2",
      signature,
      x: 24,
      y: 24,
      width: 80,
      height: 32,
    })
  )[0];
  assert.equal((await inspectPdf(result)).count, 3);
  await assert.rejects(
    processPdf("visual-signature", [input], {
      pages: "1",
      signature,
      x: 280,
      y: 390,
      width: 80,
      height: 32,
    }),
  );
});
