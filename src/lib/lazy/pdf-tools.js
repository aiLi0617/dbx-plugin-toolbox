import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFHexString,
  PDFInvalidObject,
  degrees,
  StandardFonts,
  rgb,
} from "@cantoo/pdf-lib";
import { pageSelection } from "../pdfTools.js";
import fontkit from "@pdf-lib/fontkit";
export { PDFDocument };
export async function demoPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([300, 400]);
    page.drawText(`Toolbox sample page ${i}`, {
      x: 24,
      y: 340,
      size: 18,
      font,
    });
  }
  return doc.save();
}
export async function inspectPdf(bytes, password = "") {
  const doc = await PDFDocument.load(bytes.slice(), {
    password,
    updateMetadata: false,
  });
  const count = doc.getPageCount();
  if (count < 1 || count > 500) throw new Error("PDF page limit is 500");
  return {
    count,
    pages: doc.getPages().map((p) => ({
      width: p.getWidth(),
      height: p.getHeight(),
      rotation: p.getRotation().angle,
    })),
    signed: doc.context
      .enumerateIndirectObjects()
      .some(([, v]) => v instanceof PDFDict && v.has(PDFName.of("ByteRange"))),
  };
}
async function load(bytes, password) {
  const doc = await PDFDocument.load(bytes.slice(), {
    password,
    updateMetadata: false,
  });
  if (doc.getPageCount() > 500) throw new Error("PDF page limit is 500");
  // Old cross-reference streams can retain an Encrypt entry after decryption.
  // A full save creates a new xref; retaining obsolete xrefs makes readers
  // incorrectly treat the decrypted output as encrypted again.
  for (const [ref, object] of doc.context.enumerateIndirectObjects()) {
    const invalidXref =
      object instanceof PDFInvalidObject &&
      /\/Type\s*\/XRef\b/.test(
        new TextDecoder().decode(object.data).split(/\bstream\b/, 1)[0],
      );
    if (
      object?.dict?.get(PDFName.of("Type"))?.toString() === "/XRef" ||
      invalidXref
    )
      doc.context.delete(ref);
  }
  return doc;
}
async function copy(source, indices) {
  const target = await PDFDocument.create();
  for (const page of await target.copyPages(source, indices))
    target.addPage(page);
  return target;
}
export async function processPdf(operation, inputs, options = {}) {
  const docs = [];
  for (const input of inputs)
    docs.push(await load(input, options.password || ""));
  if (!docs.length) throw new Error("PDF required");
  const source = docs[0],
    count = source.getPageCount();
  const selected = pageSelection(options.pages || "", count);
  if (operation === "merge") {
    if (docs.reduce((n, d) => n + d.getPageCount(), 0) > 500)
      throw new Error("PDF page limit is 500");
    const out = await PDFDocument.create();
    for (const doc of docs)
      for (const page of await out.copyPages(doc, doc.getPageIndices()))
        out.addPage(page);
    return [await out.save()];
  }
  if (operation === "split") {
    const ranges = (options.pages || "").trim()
      ? options.pages.split(",")
      : Array.from({ length: count }, (_, i) => String(i + 1));
    const outputs = [];
    for (const range of ranges)
      outputs.push(
        await (await copy(source, pageSelection(range, count))).save(),
      );
    return outputs;
  }
  if (operation === "extract")
    return [await (await copy(source, selected)).save()];
  if (operation === "delete") {
    if (!options.pages?.trim()) throw new Error("Specify pages to delete");
    const keep = source.getPageIndices().filter((i) => !selected.includes(i));
    if (!keep.length) throw new Error("Cannot delete all pages");
    for (const i of selected.toSorted((a, b) => b - a)) source.removePage(i);
  } else if (operation === "organize") {
    const order = options.order;
    if (
      !Array.isArray(order) ||
      order.length !== count ||
      new Set(order).size !== count ||
      order.some((i) => !Number.isInteger(i) || i < 0 || i >= count)
    )
      throw new Error("Invalid page order");
    return [await (await copy(source, order)).save()];
  } else if (operation === "rotate") {
    const angle = Number(options.angle);
    if (![90, 180, 270].includes(angle))
      throw new Error("Rotation must be 90, 180, or 270");
    for (const i of selected) {
      const p = source.getPage(i);
      p.setRotation(degrees((p.getRotation().angle + angle) % 360));
    }
  } else if (operation === "crop") {
    const left = Number(options.left),
      right = Number(options.right),
      top = Number(options.top),
      bottom = Number(options.bottom);
    if (![left, right, top, bottom].every((v) => Number.isFinite(v) && v >= 0))
      throw new Error("Invalid crop margins");
    for (const i of selected) {
      const p = source.getPage(i),
        box = p.getCropBox();
      if (left + right >= box.width || top + bottom >= box.height)
        throw new Error("Crop removes the entire page");
      p.setCropBox(
        box.x + left,
        box.y + bottom,
        box.width - left - right,
        box.height - top - bottom,
      );
    }
  } else if (operation === "watermark" || operation === "page-numbers") {
    const text = String(options.text || "");
    if (operation === "watermark" && !text)
      throw new Error("Watermark text required");
    let font;
    if (options.fontBytes) {
      source.registerFontkit(fontkit);
      font = await source.embedFont(options.fontBytes, { subset: true });
    } else font = await source.embedFont(StandardFonts.Helvetica);
    const size = Number(options.fontSize || 24),
      opacity = Number(options.opacity ?? 0.5),
      x = Number(options.x ?? 36),
      y = Number(options.y ?? 36),
      angle = Number(options.angle || 0),
      start = Number(options.start || 1);
    if (
      ![size, opacity, x, y, angle, start].every(Number.isFinite) ||
      size < 6 ||
      size > 144 ||
      opacity < 0 ||
      opacity > 1
    )
      throw new Error("Invalid text settings");
    for (const [index, i] of selected.entries()) {
      const p = source.getPage(i),
        value =
          operation === "watermark"
            ? text
            : String(options.format || "{n}")
                .replaceAll("{n}", String(start + index))
                .replaceAll("{total}", String(selected.length));
      p.drawText(value, {
        font,
        size,
        x,
        y,
        opacity,
        rotate: degrees(angle),
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  } else if (operation === "visual-signature") {
    if (!options.signature) throw new Error("Signature image required");
    const bytes = new Uint8Array(options.signature);
    const image =
      bytes[0] === 0x89
        ? await source.embedPng(bytes)
        : await source.embedJpg(bytes);
    const x = Number(options.x || 0),
      y = Number(options.y || 0),
      width = Number(options.width || 150),
      height = Number(options.height || 60);
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0
    )
      throw new Error("Invalid signature position");
    for (const i of selected) {
      const page = source.getPage(i);
      if (x + width > page.getWidth() || y + height > page.getHeight())
        throw new Error("Signature is outside page bounds");
      page.drawImage(image, { x, y, width, height });
    }
  } else if (operation === "compress") {
    source.catalog.delete(PDFName.of("Metadata"));
    for (const p of source.getPages()) p.node.delete(PDFName.of("Thumb"));
    delete source.context.trailerInfo.Info;
  } else if (operation === "encrypt") {
    if (!options.newPassword || options.newPassword.length > 127)
      throw new Error("Use an opening password of 1 to 127 characters");
    source.encrypt({
      userPassword: options.newPassword,
      ownerPassword: [...crypto.getRandomValues(new Uint8Array(32))]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join(""),
      algorithm: "AES-256",
    });
  } else if (operation !== "decrypt" && operation !== "delete")
    throw new Error("Unknown PDF operation");
  return [await source.save({ useObjectStreams: true, addDefaultPage: false })];
}

// Returns signature dictionaries and exact original signed bytes. Never re-save before verification.
export async function pdfSignatureData(bytes, password = "") {
  const doc = await load(bytes, password),
    out = [];
  for (const [, dict] of doc.context.enumerateIndirectObjects()) {
    if (!(dict instanceof PDFDict) || !dict.has(PDFName.of("ByteRange")))
      continue;
    const range = dict
      .lookup(PDFName.of("ByteRange"), PDFArray)
      .asArray()
      .map((n) => n.asNumber());
    const content = dict.lookup(PDFName.of("Contents"));
    const subFilter = dict.get(PDFName.of("SubFilter"))?.toString() || "";
    if (
      range.length !== 4 ||
      range.some((n) => !Number.isSafeInteger(n) || n < 0) ||
      range[0] !== 0 ||
      range[1] >= range[2] ||
      range[2] + range[3] > bytes.length ||
      !(content instanceof PDFHexString)
    )
      throw new Error("Invalid signature byte range");
    // The excluded gap must contain exactly the signature hex string, not arbitrary document content.
    const gap = new TextDecoder()
      .decode(bytes.slice(range[1], range[2]))
      .trim();
    if (!/^<[\da-fA-F\s]+>$/.test(gap))
      throw new Error("Signature excludes unexpected document content");
    const embedded = content.asBytes(),
      gapBytes = Uint8Array.from(
        gap
          .slice(1, -1)
          .replace(/\s/g, "")
          .match(/.{1,2}/g) || [],
        (h) => parseInt(h.padEnd(2, "0"), 16),
      );
    if (
      gapBytes.length !== embedded.length ||
      gapBytes.some((n, i) => n !== embedded[i])
    )
      throw new Error("Signature contents do not match byte range");
    const signed = new Uint8Array(range[1] + range[3]);
    signed.set(bytes.slice(0, range[1]));
    signed.set(bytes.slice(range[2], range[2] + range[3]), range[1]);
    out.push({
      cms: embedded,
      signed,
      range,
      subFilter,
      coversCurrentFile: range[2] + range[3] === bytes.length,
    });
  }
  return out;
}
