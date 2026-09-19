import parseXml from "xml-parser-xo";
import { XMLValidator } from "fast-xml-parser";

// Only indent element-only XML. Text, mixed content, comments and CDATA are
// never routed through JS scalar coercion or trimmed as layout whitespace.
export function formatXmlPreservingText(input, indent = 2) {
  const valid = XMLValidator.validate(input);
  if (valid !== true) throw new Error(valid.err?.msg || "Invalid XML");
  const document = parseXml(input, { strictMode: true });
  const pad = (depth) => " ".repeat(indent * depth);
  const render = (node, depth = 0, preserve = false) => {
    if (node.type === "ProcessingInstruction") return `<?${node.name}${node.content ? ` ${node.content}` : ""}?>`;
    if (node.type !== "Element") return node.content;
    const attrs = Object.entries(node.attributes).map(([key, value]) => ` ${key}="${String(value).replace(/"/g, "&quot;")}"`).join("");
    const open = `<${node.name}${attrs}`;
    if (node.children === null) return `${open}/>`;
    const children = node.children;
    if (!children.length) return `${open}></${node.name}>`;
    const hasElements = children.some((child) => child.type === "Element");
    const significantText = children.some((child) => child.type === "CDATA" || (child.type === "Text" && (child.content.trim() || !hasElements)));
    const keep = preserve || node.attributes["xml:space"] === "preserve" || significantText;
    if (keep) return `${open}>${children.map((child) => render(child, depth + 1, true)).join("")}</${node.name}>`;
    const content = children.filter((child) => child.type !== "Text" || child.content.trim()).map((child) => `${pad(depth + 1)}${render(child, depth + 1)}`).join("\n");
    return `${open}>\n${content}\n${pad(depth)}</${node.name}>`;
  };
  return [...(document.declaration ? [document.declaration] : []), ...document.children].map((node) => render(node)).join("\n");
}
