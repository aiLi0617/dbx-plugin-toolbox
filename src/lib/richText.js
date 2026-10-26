export function normalizeRichTextLink(value) {
  const text = String(value).trim();
  if (!text || /[\s\u0000-\u001f\u007f]/u.test(text)) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`);
    if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) return null;
    if (["http:", "https:"].includes(url.protocol) && (!url.hostname || url.username || url.password)) return null;
    if (["mailto:", "tel:"].includes(url.protocol) && !url.pathname) return null;
    return url.href;
  } catch { return null; }
}

// Parse in an inert template and rebuild only the formatting that the editor supports.
// Never move imported nodes or copy arbitrary attributes into the live document.
export function sanitizeRichText(source, doc = document) {
  const template = doc.createElement("template");
  template.innerHTML = source;
  const output = doc.createElement("div");
  const allowed = new Set(["P", "DIV", "BR", "B", "STRONG", "I", "EM", "U", "S", "STRIKE", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "HR", "A", "SPAN", "SUB", "SUP"]);
  const discard = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "HEAD"]);
  function append(node, parent) {
    if (node.nodeType === 3) { parent.appendChild(doc.createTextNode(node.textContent)); return; }
    if (node.nodeType !== 1 || discard.has(node.tagName)) return;
    let target = parent;
    if (allowed.has(node.tagName)) {
      target = doc.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = normalizeRichTextLink(node.getAttribute("href") || "");
        if (href) target.setAttribute("href", href);
      }
      for (const property of ["text-align", "font-weight", "font-style", "text-decoration-line"]) {
        const value = node.style.getPropertyValue(property);
        const safe = {
          "text-align": /^(left|center|right|justify)$/,
          "font-weight": /^(normal|bold|[1-9]00)$/,
          "font-style": /^(normal|italic|oblique)$/,
          "text-decoration-line": /^(none|underline|line-through|underline line-through)$/,
        }[property];
        if (safe.test(value)) target.style.setProperty(property, value);
      }
      parent.appendChild(target);
    }
    for (const child of node.childNodes) append(child, target);
  }
  for (const child of template.content.childNodes) append(child, output);
  return output.innerHTML;
}

export function createRichTextHistory(initial = "", limit = 100) {
  let entries = [initial], index = 0;
  return {
    get canUndo() { return index > 0; },
    get canRedo() { return index < entries.length - 1; },
    push(value) {
      if (entries[index] === value) return;
      entries = entries.slice(0, index + 1);
      entries.push(value);
      if (entries.length > limit) entries.shift();
      index = entries.length - 1;
    },
    undo() { if (index > 0) index--; return entries[index]; },
    redo() { if (index < entries.length - 1) index++; return entries[index]; },
  };
}
