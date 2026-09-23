import { XMLValidator } from "fast-xml-parser";
import { loadAssetModule } from "../assetModules.js";
import { jsonConvertModes, runJsonConvert } from "./convert.js";
import { parseYamlDocument } from "../dataConvert.js";
import { formatXmlPreservingText } from "../xmlFormat.js";
export { formatXmlPreservingText } from "../xmlFormat.js";

export const CODE_LANGUAGES = [
  { value: "sql", zh: "SQL", en: "SQL" },
  { value: "xml", zh: "XML", en: "XML" },
  { value: "yaml", zh: "YAML", en: "YAML" },
  { value: "html", zh: "HTML", en: "HTML" },
  { value: "css", zh: "CSS", en: "CSS" },
  { value: "javascript", zh: "JavaScript", en: "JavaScript" },
  { value: "typescript", zh: "TypeScript", en: "TypeScript" },
];

export const SQL_DIALECTS = [
  { value: "sql", label: "Standard SQL" },
  { value: "mysql", label: "MySQL" },
  { value: "postgresql", label: "PostgreSQL" },
  { value: "transactsql", label: "SQL Server" },
  { value: "sqlite", label: "SQLite" },
  { value: "plsql", label: "Oracle PL/SQL" },
  { value: "bigquery", label: "BigQuery" },
];

export function formatCode(input, language = "sql", action = "format", sqlDialect = "sql", indent = 2) {
  if (String(input ?? "").length > 2_000_000) throw new Error("Formatting input is limited to 2 MB");
  const indentSize = [2, 4, 8].includes(Number(indent)) ? Number(indent) : 2;
  if (language === "sql") return loadAssetModule("sql").then(({ format }) => format(input, { language: SQL_DIALECTS.some((item) => item.value === sqlDialect) ? sqlDialect : "sql", tabWidth: indentSize }));
  if (language === "yaml") return parseYamlDocument(input).toString({ indent: indentSize });
  if (language === "html" || language === "css") return loadAssetModule("beautify").then(({ default: beautify }) => beautify[language](input, { indent_size: indentSize }));
  if (language === "javascript" || language === "typescript" || language === "js" || language === "ts") return formatScript(input, language, indentSize);
  if (language !== "xml") throw new Error("Unsupported formatting language");
  const check = XMLValidator.validate(input);
  if (check !== true) {
    const msg = typeof check === "object" ? JSON.stringify(check) : String(check);
    if (action === "validate") return { ok: false, text: msg };
    throw new Error(msg);
  }
  if (action === "validate") return { ok: true, text: "Valid XML" };
  return formatXmlPreservingText(input, indentSize);
}

async function formatScript(input, language, indent) {
  const module = await loadAssetModule("script");
  return module.formatScript(input, language, indent);
}
