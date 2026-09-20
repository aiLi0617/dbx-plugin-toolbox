/** Extra raster/vector encoders used by image generate (BMP / GIF / SVG). */

function writeUint16LE(view, offset, value) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(view, offset, value) {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
  view[offset + 2] = (value >>> 16) & 0xff;
  view[offset + 3] = (value >>> 24) & 0xff;
}

export function encodeBmpFromCanvas(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  const { data } = ctx.getImageData(0, 0, width, height);
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowSize * height;
  const fileSize = 54 + pixelBytes;
  const out = new Uint8Array(fileSize);

  out[0] = 0x42;
  out[1] = 0x4d;
  writeUint32LE(out, 2, fileSize);
  writeUint32LE(out, 10, 54);
  writeUint32LE(out, 14, 40);
  writeUint32LE(out, 18, width);
  writeUint32LE(out, 22, height);
  writeUint16LE(out, 26, 1);
  writeUint16LE(out, 28, 24);
  writeUint32LE(out, 34, pixelBytes);

  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = rowStart + x * 4;
      const alpha = data[i + 3] / 255;
      out[offset++] = Math.round(data[i + 2] * alpha);
      out[offset++] = Math.round(data[i + 1] * alpha);
      out[offset++] = Math.round(data[i] * alpha);
    }
    offset += rowSize - width * 3;
  }
  return out;
}

export function padBmpToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const out = new Uint8Array(target);
  out.set(source, 0);
  writeUint32LE(out, 2, target);
  return out;
}

function lzwEncodeGif(indices, width, height) {
  const minCodeSize = 8;
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let nextCode = endCode + 1;
  let codeSize = minCodeSize + 1;
  const maxCode = () => (1 << codeSize) - 1;

  let dictionary = new Map();
  const resetDict = () => {
    dictionary = new Map();
    for (let i = 0; i < clearCode; i += 1) dictionary.set(String(i), i);
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const output = [];
  let cur = indices[0];
  let bitBuffer = 0;
  let bitCount = 0;

  const writeCode = (code) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  writeCode(clearCode);
  for (let i = 1; i < indices.length; i += 1) {
    const k = indices[i];
    const key = `${cur},${k}`;
    if (dictionary.has(key)) {
      cur = dictionary.get(key);
      continue;
    }
    writeCode(cur);
    if (nextCode <= 4095) {
      dictionary.set(key, nextCode);
      if (nextCode > maxCode() && codeSize < 12) codeSize += 1;
      nextCode += 1;
    } else {
      writeCode(clearCode);
      resetDict();
    }
    cur = k;
  }
  writeCode(cur);
  writeCode(endCode);
  if (bitCount > 0) output.push(bitBuffer & 0xff);

  // Package into GIF sub-blocks
  const blocks = [minCodeSize];
  for (let i = 0; i < output.length; i += 255) {
    const slice = output.slice(i, i + 255);
    blocks.push(slice.length, ...slice);
  }
  blocks.push(0);
  return Uint8Array.from(blocks);
}

/** Encode a single-frame GIF using an RGB332 palette (256 colors). */
export function encodeGifFromCanvas(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  if (width > 65535 || height > 65535) throw new Error("GIF dimensions are too large");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  const { data } = ctx.getImageData(0, 0, width, height);

  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const r = Math.round(((i >> 5) & 7) * 255 / 7);
    const g = Math.round(((i >> 2) & 7) * 255 / 7);
    const b = Math.round((i & 3) * 255 / 3);
    palette[i * 3] = r;
    palette[i * 3 + 1] = g;
    palette[i * 3 + 2] = b;
  }

  const indices = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < indices.length; i += 1, p += 4) {
    const a = data[p + 3];
    if (a < 16) {
      indices[i] = 0;
      continue;
    }
    const r = Math.round(data[p] * 7 / 255);
    const g = Math.round(data[p + 1] * 7 / 255);
    const b = Math.round(data[p + 2] * 3 / 255);
    indices[i] = (r << 5) | (g << 2) | b;
  }

  const header = new Uint8Array(13 + 768);
  header.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // GIF89a
  writeUint16LE(header, 6, width);
  writeUint16LE(header, 8, height);
  header[10] = 0xf7; // GCT flag, 8-bit
  header[11] = 0;
  header[12] = 0;
  header.set(palette, 13);

  const descriptor = new Uint8Array(10);
  descriptor[0] = 0x2c;
  writeUint16LE(descriptor, 1, 0);
  writeUint16LE(descriptor, 3, 0);
  writeUint16LE(descriptor, 5, width);
  writeUint16LE(descriptor, 7, height);
  descriptor[9] = 0;

  const imageData = lzwEncodeGif(indices, width, height);
  const trailer = new Uint8Array([0x3b]);
  const out = new Uint8Array(header.length + descriptor.length + imageData.length + trailer.length);
  out.set(header, 0);
  out.set(descriptor, header.length);
  out.set(imageData, header.length + descriptor.length);
  out.set(trailer, header.length + descriptor.length + imageData.length);
  return out;
}

export function padGifToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  if (source[source.length - 1] !== 0x3b) throw new Error("GIF is missing trailer");

  let need = target - source.length;
  // Comment extension: 21 FE <n> <n bytes> 00  — minimum 4 bytes for n=1? Actually n=0 is empty block then 00 terminator = 21 FE 00 00 = 4 bytes
  if (need < 4) throw new Error("Padding gap is too small for GIF");

  const parts = [source.subarray(0, source.length - 1)];
  while (need > 0) {
    // Prefer one comment that consumes `need` bytes: overhead 4 + dataLen, where data can be split into 255 chunks.
    // For simplicity: each comment block uses 4 + payload (payload 0..255), total = 4+payload when single sub-block with terminator.
    // Structure: 21 FE <len> <data...> 00
    // total = 3 + 1 + len + 1 = 5 + len for len>=1, or 21 FE 00 00 = 4 for empty.
    if (need === 4) {
      parts.push(Uint8Array.of(0x21, 0xfe, 0x00, 0x00));
      need = 0;
      break;
    }
    if (need < 5) {
      // Impossible with standard comment; leave gap by using empty + fail
      throw new Error("Padding gap is too small for GIF");
    }
    const payload = Math.min(255, need - 5);
    const block = new Uint8Array(5 + payload);
    block[0] = 0x21;
    block[1] = 0xfe;
    block[2] = payload;
    block[4 + payload] = 0x00;
    parts.push(block);
    need -= block.length;
  }
  parts.push(Uint8Array.of(0x3b));
  const out = new Uint8Array(target);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  if (offset !== target) throw new Error("GIF padding failed to hit target size");
  return out;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function encodeSvgPlaceholder(options = {}) {
  const {
    width,
    height,
    background = "#d7e4f2",
    foreground = "#1e293b",
    transparent = false,
    showText = true,
    showBorder = false,
    label = "",
    sizeLabel = "",
  } = options;

  const title = escapeXml(label || `${width} × ${height}`);
  const sub = escapeXml(sizeLabel || "");
  const bg = transparent ? "none" : escapeXml(background);
  const ink = escapeXml(foreground);
  const edge = Math.min(width, height);
  const titleSize = Math.max(14, Math.min(72, Math.floor(edge / 9)));
  const badgeSize = Math.max(8, Math.min(96, Math.round(edge / 22)));
  const margin = Math.max(6, Math.round(edge / 28));

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${bg}"/>`,
  ];
  if (showBorder) {
    parts.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${ink}" stroke-opacity="0.2"/>`);
  }
  if (showText) {
    const cardW = Math.min(width * 0.7, Math.max(160, title.length * titleSize * 0.6));
    const cardH = sizeLabel ? titleSize * 2.2 : titleSize * 1.6;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2;
    parts.push(
      `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="${Math.max(8, edge / 28)}" fill="#ffffff" fill-opacity="0.72"/>`,
      `<text x="${width / 2}" y="${cardY + cardH * (sizeLabel ? 0.42 : 0.55)}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${titleSize}" font-weight="700" fill="${ink}">${title}</text>`,
    );
    if (sub) {
      parts.push(
        `<text x="${width / 2}" y="${cardY + cardH * 0.78}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${Math.max(9, titleSize * 0.28)}" font-weight="600" fill="${ink}" fill-opacity="0.62">${sub}</text>`,
      );
    }
  }
  const badgeW = badgeSize * 3.2;
  const badgeH = badgeSize * 1.6;
  parts.push(
    `<g transform="translate(${width - margin - badgeW} ${height - margin - badgeH})">`,
    `<rect width="${badgeW}" height="${badgeH}" rx="${badgeH / 2}" fill="#171717" fill-opacity="0.88"/>`,
    `<rect x="${badgeSize * 0.35}" y="${(badgeH - badgeSize * 0.7) / 2}" width="${badgeSize * 0.7}" height="${badgeSize * 0.7}" rx="${badgeSize * 0.18}" fill="#fafafa"/>`,
    `<text x="${badgeSize * 1.25}" y="${badgeH * 0.68}" font-family="system-ui,sans-serif" font-size="${badgeSize}" font-weight="700" fill="#fafafa">dbx</text>`,
    `</g>`,
    `</svg>`,
  );
  return new TextEncoder().encode(parts.join(""));
}

export function padSvgToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const text = new TextDecoder().decode(source);
  const close = text.lastIndexOf("</svg>");
  if (close < 0) throw new Error("SVG is missing closing tag");
  const need = target - source.length;
  // Insert an XML comment. Overhead: <!--  --> = 7 chars minimum for empty? `<!-->` invalid. Use `<!--` + body + `-->` = 7 + body.
  if (need < 7) throw new Error("Padding gap is too small for SVG");
  const bodyLen = need - 7;
  const comment = `<!--${"x".repeat(bodyLen)}-->`;
  const next = `${text.slice(0, close)}${comment}${text.slice(close)}`;
  const out = new TextEncoder().encode(next);
  if (out.length !== target) {
    // UTF-8 safety: body is ASCII so length should match
    throw new Error("SVG padding failed to hit target size");
  }
  return out;
}

function canvasToPngBytes(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error("Image encoding failed"));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

/** ICO containing a single PNG image (supported by modern Windows / browsers). */
export async function encodeIcoFromCanvas(canvas) {
  if (canvas.width > 256 || canvas.height > 256) {
    throw new Error("ICO dimensions are limited to 256 × 256 pixels");
  }
  const png = await canvasToPngBytes(canvas);
  const width = canvas.width === 256 ? 0 : canvas.width;
  const height = canvas.height === 256 ? 0 : canvas.height;
  const out = new Uint8Array(6 + 16 + png.length);
  // ICONDIR
  writeUint16LE(out, 0, 0);
  writeUint16LE(out, 2, 1); // icon
  writeUint16LE(out, 4, 1); // count
  // ICONDIRENTRY
  out[6] = width;
  out[7] = height;
  out[8] = 0;
  out[9] = 0;
  writeUint16LE(out, 10, 1);
  writeUint16LE(out, 12, 32);
  writeUint32LE(out, 14, png.length);
  writeUint32LE(out, 18, 22); // image offset
  out.set(png, 22);
  return out;
}

export function padIcoToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const out = new Uint8Array(target);
  out.set(source, 0);
  // Grow the embedded image byte count so the directory stays consistent.
  const imageOffset = out[18] | (out[19] << 8) | (out[20] << 16) | (out[21] << 24);
  writeUint32LE(out, 14, target - imageOffset);
  return out;
}

/** Uncompressed little-endian RGB TIFF. */
export function encodeTiffFromCanvas(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable");
  const { data } = ctx.getImageData(0, 0, width, height);
  const samples = 3;
  const stripSize = width * height * samples;
  const tagCount = 9;
  const ifdOffset = 8;
  const ifdSize = 2 + tagCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const dataOffset = bitsOffset + 6;
  const out = new Uint8Array(dataOffset + stripSize);

  out[0] = 0x49;
  out[1] = 0x49;
  writeUint16LE(out, 2, 42);
  writeUint32LE(out, 4, ifdOffset);

  writeUint16LE(out, ifdOffset, tagCount);
  let p = ifdOffset + 2;
  const writeTag = (tag, type, count, valueOrOffset) => {
    writeUint16LE(out, p, tag);
    writeUint16LE(out, p + 2, type);
    writeUint32LE(out, p + 4, count);
    writeUint32LE(out, p + 8, valueOrOffset);
    p += 12;
  };

  // SHORT values fit in the value field when count=1.
  const shortVal = (n) => n;
  writeTag(256, 3, 1, shortVal(width));
  writeTag(257, 3, 1, shortVal(height));
  writeTag(258, 3, 3, bitsOffset);
  writeTag(259, 3, 1, 1);
  writeTag(262, 3, 1, 2);
  writeTag(273, 4, 1, dataOffset);
  writeTag(277, 3, 1, samples);
  writeTag(278, 3, 1, shortVal(height));
  writeTag(279, 4, 1, stripSize);
  writeUint32LE(out, p, 0); // next IFD

  writeUint16LE(out, bitsOffset, 8);
  writeUint16LE(out, bitsOffset + 2, 8);
  writeUint16LE(out, bitsOffset + 4, 8);

  let o = dataOffset;
  for (let i = 0; i < width * height; i += 1) {
    const a = data[i * 4 + 3] / 255;
    out[o++] = Math.round(data[i * 4] * a);
    out[o++] = Math.round(data[i * 4 + 1] * a);
    out[o++] = Math.round(data[i * 4 + 2] * a);
  }
  return out;
}

export function padTiffToSize(bytes, targetBytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const target = Math.trunc(Number(targetBytes));
  if (!Number.isFinite(target) || target < source.length) {
    throw new Error("Target size is smaller than the encoded image");
  }
  if (target === source.length) return source;
  const out = new Uint8Array(target);
  out.set(source, 0);
  return out;
}
