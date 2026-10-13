function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function slug(value, used) {
  const base = String(value).toLocaleLowerCase().trim().replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "") || "section";
  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

export function analyzeMarkdownDocument(source) {
  const input = String(source || "");
  let body = input;
  let frontMatter = "";
  if (input.startsWith("---\n") || input.startsWith("---\r\n")) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(input);
    if (match) { frontMatter = match[1]; body = input.slice(match[0].length); }
  }
  const used = new Map();
  const headings = [...body.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((match) => ({ level: match[1].length, text: match[2].replace(/[*_`[\]]/g, "").trim() })).map((heading) => ({ ...heading, id: slug(heading.text, used) }));
  const plain = body.replace(/```[\s\S]*?```/g, " ").replace(/<[^>]+>|[#>*_`~\[\]()!-]/g, " ");
  const words = (plain.match(/[\p{Letter}\p{Number}]+/gu) || []).length;
  return { body, frontMatter, headings, stats: { characters: [...body].length, words, lines: body ? body.split(/\r?\n/).length : 0, readingMinutes: words ? Math.max(1, Math.ceil(words / 220)) : 0 } };
}

export function markdownToc(headings) {
  return headings.map((heading) => `${"  ".repeat(Math.max(0, heading.level - 1))}- [${heading.text}](#${heading.id})`).join("\n");
}

export function selfContainedMarkdownHtml(renderedHtml, options = {}) {
  const title = escapeHtml(options.title || "Markdown document");
  const content = String(renderedHtml || "").replace(/<img\b[^>]*>/gi, '<span class="blocked-image">[external image omitted]</span>');
  return `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>${title}</title><style>body{max-width:860px;margin:40px auto;padding:0 24px;font:16px/1.65 system-ui;color:#1f2328}pre,code{font-family:ui-monospace,monospace}pre{overflow:auto;padding:14px;background:#f6f8fa;border-radius:8px}table{border-collapse:collapse}th,td{padding:6px 10px;border:1px solid #d0d7de}.blocked-image{color:#656d76}</style></head><body>${content}</body></html>`;
}
