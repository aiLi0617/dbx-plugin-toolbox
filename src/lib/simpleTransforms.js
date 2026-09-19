export function sqlEscape(text, opts = {}) {
  const raw = String(text ?? "");
  if (!raw) return "";
  const lines = raw.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const quoted = lines.map((line) => `'${line.replace(/'/g, "''")}'`);
  return quoted.join(opts.comma ? ",\n" : "\n");
}

export function slugify(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripHtml(text) {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(String(text ?? ""), "text/html");
    doc.querySelectorAll("script,style,noscript,template").forEach((node) => node.remove());
    return doc.body.textContent || "";
  }
  return String(text ?? "").replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "");
}
