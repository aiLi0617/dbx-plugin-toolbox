import { parseDocument, visit, isScalar, stringify as stringifyYaml } from "yaml";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { csvToJson, jsonToCsv } from "./tools/convert.js";
import { parseLosslessJson, stringifyLosslessJson, toSafeJsonValue, safeNumber } from "./jsonPrecision.js";
import { formatXmlPreservingText } from "./xmlFormat.js";

export const DATA_FORMATS = ["json", "yaml", "csv", "tsv", "ndjson", "xml", "toml"].map((value) => ({ value, label: value.toUpperCase() }));

function splitTsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  for (let index = 0; index < source.length; index += 1) {
    const ch = source[index];
    if (quoted) {
      if (ch === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else field += ch;
    } else if (closedQuote && ch !== "\t" && ch !== "\r" && ch !== "\n") {
      throw new Error("Unexpected character after quoted TSV field");
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === '\t') { row.push(field); field = ""; closedQuote = false; }
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field); rows.push(row); row = []; field = ""; closedQuote = false;
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed quoted TSV field");
  if (field !== "" || row.length || !rows.length) { row.push(field); rows.push(row); }
  return rows;
}

export function tsvToJson(text) {
  const rows = splitTsv(text);
  if (!rows.length || (rows.length === 1 && rows[0].every((cell) => cell === ""))) return [];
  const headers = rows[0];
  if (new Set(headers).size !== headers.length) throw new Error("TSV headers must be unique");
  return rows.slice(1).map((cols) => {
    if (cols.length !== headers.length) throw new Error("TSV rows must have the same number of fields as the header");
    return Object.fromEntries(headers.map((header, index) => [header, cols[index] ?? ""]));
  });
}

function tsvCell(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[\t\r\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function jsonToTsv(value) {
  const rows = (Array.isArray(value) ? value : [value]).map((row) =>
    row && typeof row === "object" && !Array.isArray(row) ? row : { value: row },
  );
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return [headers.map(tsvCell).join("\t"), ...rows.map((row) => headers.map((header) => tsvCell(row?.[header])).join("\t"))].join("\n");
}

export function ndjsonToJson(text) {
  const lines = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  return lines.map((line, index) => {
    try { return parseLosslessJson(line); }
    catch (error) { throw new Error(`Invalid NDJSON at line ${index + 1}: ${error.message}`); }
  });
}

export function jsonToNdjson(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((row) => stringifyLosslessJson(row)).join("\n");
}

export function parseYamlDocument(input) {
  const doc = parseDocument(input, { intAsBigInt: true, keepSourceTokens: true, uniqueKeys: true });
  if (doc.errors.length) throw doc.errors[0];
  if (doc.warnings.length) throw doc.warnings[0];
  visit(doc, (_key, node) => {
    if (isScalar(node) && typeof node.value === "number") safeNumber(node.source?.replaceAll("_", "") ?? String(node.value));
  });
  return doc;
}

function readYaml(input) {
  const doc = parseYamlDocument(input);
  return doc.toJS({ maxAliasCount: 100 });
}

function assertTomlNumberPrecision(text) {
  // TOML's parser preserves integers as BigInt, but decimals become Number.
  // Inspect unquoted numeric tokens before accepting that conversion.
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "#") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (ch === '"' || ch === "'") {
      const marker = text.slice(i, i + 3) === ch.repeat(3) ? ch.repeat(3) : ch;
      i += marker.length;
      while (i < text.length) {
        if (ch === '"' && text[i] === "\\") { i += 2; continue; }
        if (text.startsWith(marker, i)) { i += marker.length; break; }
        i++;
      }
      continue;
    }
    if (/[\s,\[\]{}=]/.test(ch)) { i++; continue; }
    const start = i;
    while (i < text.length && !/[\s,\[\]{}=#"']/.test(text[i])) i++;
    const token = text.slice(start, i);
    const next = text.slice(i).trimStart()[0];
    if (next !== "=" && /^[+-]?\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?[\d_]+)?$/.test(token)) safeNumber(token.replaceAll("_", ""));
  }
}

function readXml(input) {
  const valid = XMLValidator.validate(input);
  if (valid !== true) throw new Error(valid.err?.msg || "Invalid XML");
  if (/<!DOCTYPE/i.test(input)) throw new Error("XML data conversion does not support DOCTYPE. Use the XML formatter to preserve the document.");
  const ordered = new XMLParser({ preserveOrder: true, trimValues: false, parseTagValue: false, commentPropName: "#comment", cdataPropName: "#cdata" }).parse(input);
  const inspect = (nodes) => {
    const seenNames = new Set();
    let previousName = "";
    for (const node of nodes) {
      for (const [key, children] of Object.entries(node)) {
        if (key === "#comment" || key === "#cdata" || (key.startsWith("?") && key !== "?xml")) throw new Error("XML comments, CDATA and processing instructions cannot retain their positions across data formats. Choose XML output to preserve this document.");
        if (!Array.isArray(children) || key.startsWith("#")) continue;
        if (key !== previousName && seenNames.has(key)) throw new Error("Interleaved XML sibling elements cannot be converted without losing order. Choose XML output to preserve this document.");
        seenNames.add(key);
        previousName = key;
        const hasElements = children.some((child) => Object.keys(child).some((name) => !name.startsWith("#") && name !== ":@" && !name.startsWith("?")));
        const hasText = children.some((child) => typeof child["#text"] === "string" && child["#text"].trim());
        if (hasElements && hasText) throw new Error("Mixed XML text and elements cannot be converted without losing order. Use the XML formatter instead.");
        inspect(children);
      }
    }
  };
  inspect(ordered);
  return new XMLParser({ ignoreAttributes: false, trimValues: false, parseTagValue: false, parseAttributeValue: false, commentPropName: "#comment", cdataPropName: "#cdata" }).parse(input);
}

function noUnsupportedValues(value, format, path = "$", seen = new Set()) {
  if (value instanceof Date) throw new Error(`Date/time at ${path} cannot be converted without changing its type. Quote it as a string first.`);
  if (value instanceof Set || value instanceof Map || ArrayBuffer.isView(value)) throw new Error(`Unsupported collection at ${path}. Use a plain object or array before converting.`);
  if (value === null && format === "toml") throw new Error(`TOML cannot represent null at ${path}. Remove it or choose another format.`);
  if (value && typeof value === "object") {
    if (seen.has(value)) throw new Error("Cyclic data cannot be converted to this format");
    seen.add(value);
    for (const [key, child] of Object.entries(value)) noUnsupportedValues(child, format, `${path}.${key}`, seen);
    seen.delete(value);
  }
}

export function convertData(input, from = "json", to = "yaml") {
  const text = String(input ?? "");
  if (text.length > 5_000_000) throw new Error("Data input is limited to 5 MB");
  if (!DATA_FORMATS.some((format) => format.value === from) || !DATA_FORMATS.some((format) => format.value === to)) throw new Error("Unsupported data format");
  if (from === "json" && to === "json") return stringifyLosslessJson(parseLosslessJson(text), 2);
  if (from === "yaml" && to === "yaml") return parseYamlDocument(text).toString({ indent: 2 });
  if (from === "xml" && to === "xml") return formatXmlPreservingText(text);
  let value;
  if (from === "json") value = parseLosslessJson(text);
  else if (from === "yaml") value = readYaml(text);
  else if (from === "csv") value = csvToJson(text);
  else if (from === "tsv") value = tsvToJson(text);
  else if (from === "ndjson") value = ndjsonToJson(text);
  else if (from === "xml") value = readXml(text);
  else {
    value = parseToml(text, { integersAsBigInt: "asNeeded" });
    assertTomlNumberPrecision(text);
  }
  noUnsupportedValues(value, to);
  value = toSafeJsonValue(value);
  if (to === "json") return stringifyLosslessJson(value, 2);
  if (to === "yaml") return stringifyYaml(value, { indent: 2 });
  if (to === "csv") return jsonToCsv(value);
  if (to === "tsv") return jsonToTsv(value);
  if (to === "ndjson") return jsonToNdjson(value);
  if (to === "toml") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("TOML needs an object at the document root. Wrap the data in a named property first.");
    return stringifyToml(value);
  }
  const object = Array.isArray(value) ? { root: { item: value } } : value && typeof value === "object" ? value : { root: value };
  const keys = Object.keys(object).filter((key) => !key.startsWith("?") && !key.startsWith("#"));
  const document = keys.length === 1 && !keys[0].startsWith("@_") ? object : { root: object };
  const output = new XMLBuilder({ ignoreAttributes: false, format: true, indentBy: "  ", commentPropName: "#comment", cdataPropName: "#cdata" }).build(document);
  const valid = XMLValidator.validate(output);
  if (valid !== true) throw new Error(`Cannot represent these object keys as XML: ${valid.err?.msg || "invalid XML"}`);
  return output;
}
