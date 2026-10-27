export function pageSelection(source, count, { duplicates = false } = {}) {
  if (!Number.isInteger(count) || count < 1 || count > 5000)
    throw new Error("PDF page limit is 5000");
  if (!source.trim()) return Array.from({ length: count }, (_, i) => i);
  const pages = [];
  for (const part of source.split(",")) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!m) throw new Error("Invalid page range");
    const a = Number(m[1]),
      b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b > count)
      throw new Error("Page range is out of bounds");
    for (let i = a; i <= b; i++) pages.push(i - 1);
    if (pages.length > 5000) throw new Error("Too many selected pages");
  }
  return duplicates ? pages : [...new Set(pages)];
}
export function validatePdfFiles(files, { native = false } = {}) {
  const fileBytes = native ? 512 * 1024 * 1024 : 50_000_000;
  const totalBytes = native ? 1024 * 1024 * 1024 : 100_000_000;
  if (
    !files.length ||
    files.length > 20 ||
    files.some((f) => f.size > fileBytes) ||
    files.reduce((n, f) => n + f.size, 0) > totalBytes
  )
    throw new Error(native
      ? "Use up to 20 PDF files, 512 MB each, 1 GB total"
      : "Use up to 20 PDF files, 50 MB each, 100 MB total");
}
