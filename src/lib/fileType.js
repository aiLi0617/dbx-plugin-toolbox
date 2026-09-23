const TYPES = {
  png: ["PNG image", "image/png", ["png"]],
  jpeg: ["JPEG image", "image/jpeg", ["jpg", "jpeg"]],
  gif: ["GIF image", "image/gif", ["gif"]],
  webp: ["WebP image", "image/webp", ["webp"]],
  bmp: ["BMP image", "image/bmp", ["bmp"]],
  tiff: ["TIFF image", "image/tiff", ["tif", "tiff"]],
  avif: ["AVIF image", "image/avif", ["avif"]],
  pdf: ["PDF document", "application/pdf", ["pdf"]],
  zip: ["ZIP archive", "application/zip", ["zip"]],
  rar: ["RAR archive", "application/vnd.rar", ["rar"]],
  sevenZip: ["7-Zip archive", "application/x-7z-compressed", ["7z"]],
  gzip: ["Gzip archive", "application/gzip", ["gz"]],
  bzip2: ["Bzip2 archive", "application/x-bzip2", ["bz2"]],
  xz: ["XZ archive", "application/x-xz", ["xz"]],
  wasm: ["WebAssembly binary", "application/wasm", ["wasm"]],
  sqlite: ["SQLite database", "application/vnd.sqlite3", ["sqlite", "db"]],
  exe: ["Windows executable", "application/vnd.microsoft.portable-executable", ["exe", "dll"]],
  elf: ["ELF executable", "application/x-elf", ["elf", "so"]],
  mp3: ["MP3 audio", "audio/mpeg", ["mp3"]],
  flac: ["FLAC audio", "audio/flac", ["flac"]],
  ogg: ["Ogg media", "application/ogg", ["ogg", "oga", "ogv"]],
  wav: ["WAV audio", "audio/wav", ["wav"]],
  mp4: ["MP4 media", "video/mp4", ["mp4", "m4v", "m4a"]],
  quicktime: ["QuickTime media", "video/quicktime", ["mov"]],
  webm: ["WebM media", "video/webm", ["webm"]],
};

function result(id, confidence = "high", detail = "Matched file signature") {
  const [name, mime, extensions] = TYPES[id];
  return { id, name, mime, extensions, confidence, detail };
}

function starts(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes, start = 0, length = bytes.length - start) {
  return String.fromCharCode(...bytes.subarray(start, Math.min(bytes.length, start + length)));
}

function detectZipContainer(bytes) {
  const text = ascii(bytes).replaceAll("\\", "/");
  if (text.includes("[Content_Types].xml")) {
    if (text.includes("word/")) return { id: "docx", name: "Microsoft Word document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: ["docx"], confidence: "high", detail: "ZIP container contains Word package entries" };
    if (text.includes("xl/")) return { id: "xlsx", name: "Microsoft Excel workbook", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: ["xlsx"], confidence: "high", detail: "ZIP container contains Excel package entries" };
    if (text.includes("ppt/")) return { id: "pptx", name: "Microsoft PowerPoint presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extensions: ["pptx"], confidence: "high", detail: "ZIP container contains PowerPoint package entries" };
  }
  if (text.includes("META-INF/MANIFEST.MF")) return { id: "jar", name: "Java archive", mime: "application/java-archive", extensions: ["jar"], confidence: "high", detail: "ZIP container contains a Java manifest" };
  if (text.includes("AndroidManifest.xml")) return { id: "apk", name: "Android package", mime: "application/vnd.android.package-archive", extensions: ["apk"], confidence: "high", detail: "ZIP container contains an Android manifest" };
  if (text.includes("mimetypeapplication/epub+zip") || text.includes("META-INF/container.xml")) return { id: "epub", name: "EPUB ebook", mime: "application/epub+zip", extensions: ["epub"], confidence: "high", detail: "ZIP container contains EPUB metadata" };
  return result("zip");
}

/** Identify common formats from content. Pass up to the first 1 MiB for ZIP subtype detection. */
export function identifyFileType(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (!bytes.length) return { id: "empty", name: "Empty file", mime: "application/x-empty", extensions: [], confidence: "high", detail: "The file contains no bytes" };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return result("png");
  if (starts(bytes, [0xff, 0xd8, 0xff])) return result("jpeg");
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return result("gif");
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return result("webp");
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return result("wav");
  if (starts(bytes, [0x42, 0x4d])) return result("bmp");
  if (starts(bytes, [0x49, 0x49, 0x2a, 0x00]) || starts(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return result("tiff");
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (/avif|avis/.test(brand)) return result("avif");
    if (/qt  /.test(brand)) return result("quicktime");
    return result("mp4");
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return result("pdf");
  if (starts(bytes, [0x50, 0x4b, 0x03, 0x04]) || starts(bytes, [0x50, 0x4b, 0x05, 0x06]) || starts(bytes, [0x50, 0x4b, 0x07, 0x08])) return detectZipContainer(bytes);
  if (starts(bytes, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return result("rar");
  if (starts(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return result("sevenZip");
  if (starts(bytes, [0x1f, 0x8b])) return result("gzip");
  if (ascii(bytes, 0, 3) === "BZh") return result("bzip2");
  if (starts(bytes, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return result("xz");
  if (starts(bytes, [0x00, 0x61, 0x73, 0x6d])) return result("wasm");
  if (ascii(bytes, 0, 16) === "SQLite format 3\0") return result("sqlite");
  if (starts(bytes, [0x4d, 0x5a])) return result("exe");
  if (starts(bytes, [0x7f, 0x45, 0x4c, 0x46])) return result("elf");
  if (ascii(bytes, 0, 4) === "fLaC") return result("flac");
  if (ascii(bytes, 0, 4) === "OggS") return result("ogg");
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return result("mp3");
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return result("webm", "medium", "Matched an EBML container signature; WebM and Matroska share this container");

  const sample = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 64 * 1024)).replace(/^\uFEFF/, "").trimStart();
  const controlCount = [...sample].filter((char) => char < " " && !"\r\n\t".includes(char)).length;
  if (sample && controlCount / sample.length < 0.01) {
    if (/^<svg(?:\s|>)/i.test(sample)) return { id: "svg", name: "SVG image", mime: "image/svg+xml", extensions: ["svg"], confidence: "medium", detail: "Matched SVG markup" };
    if (/^[\[{]/.test(sample)) { try { JSON.parse(sample); return { id: "json", name: "JSON text", mime: "application/json", extensions: ["json"], confidence: "medium", detail: "Content is valid JSON" }; } catch {} }
    if (/^<\?xml\b|^<[A-Za-z_:][^>]*>/.test(sample)) return { id: "xml", name: "XML document", mime: "application/xml", extensions: ["xml"], confidence: "low", detail: "Content resembles XML markup" };
    return { id: "text", name: "Plain text", mime: "text/plain", extensions: ["txt"], confidence: "low", detail: "Content is valid-looking UTF-8 text" };
  }
  return { id: "unknown", name: "Unknown binary", mime: "application/octet-stream", extensions: [], confidence: "low", detail: "No known signature was found" };
}

export function fileExtension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function extensionMatches(type, name) {
  const extension = fileExtension(name);
  return !extension || !type?.extensions?.length ? null : type.extensions.includes(extension);
}
