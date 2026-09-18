import yaml from "js-yaml";
import { XMLParser, XMLBuilder, XMLValidator } from "fast-xml-parser";
import { format as formatSql } from "sql-formatter";
import beautify from "js-beautify";
import { jsonConvertModes, runJsonConvert } from "./convert.js";

export const CODE_LANGUAGES = [
  { value: "sql", zh: "SQL", en: "SQL" },
  { value: "xml", zh: "XML", en: "XML" },
  { value: "yaml", zh: "YAML", en: "YAML" },
  { value: "html", zh: "HTML", en: "HTML" },
  { value: "css", zh: "CSS", en: "CSS" },
];

export function formatCode(input, language = "sql", action = "format") {
  if (language === "sql") return formatSql(input, { language: "sql" });
  if (language === "yaml") return yaml.dump(yaml.load(input));
  if (language === "html") return beautify.html(input, { indent_size: 2 });
  if (language === "css") return beautify.css(input, { indent_size: 2 });
  const check = XMLValidator.validate(input);
  if (check !== true) {
    const msg = typeof check === "object" ? JSON.stringify(check) : String(check);
    if (action === "validate") return { ok: false, text: msg };
    throw new Error(msg);
  }
  if (action === "validate") return { ok: true, text: "Valid XML" };
  const parser = new XMLParser({ ignoreAttributes: false, preserveOrder: true });
  const builder = new XMLBuilder({ ignoreAttributes: false, preserveOrder: true, format: true, indentBy: "  " });
  return builder.build(parser.parse(input));
}

export const formatTools = [
  {
    id: "json",
    category: "format",
    phase: "p0",
    view: "json-workbench",
    name: { zh: "JSON 格式化", en: "JSON format" },
    aliases: [
      "json-convert", "json-yaml", "json-csv", "json-xml", "json-toml", "json-sql", "json-ts",
      "yaml", "csv", "xml", "toml", "sql", "typescript", "python", "go", "java",
      "format", "minify", "validate", "tree", "unicode", "escape", "sort",
      "行号", "树形", "压缩", "转义", "校验", "转换", "语言",
    ],
    options: [
      {
        key: "mode",
        type: "select",
        label: { zh: "转换", en: "Convert" },
        values: jsonConvertModes,
      },
      {
        key: "table",
        type: "text",
        placeholder: "users",
        visibleWhen: { key: "mode", values: ["json-sql"] },
      },
    ],
    defaults: { mode: "json-yaml" },
    run: runJsonConvert,
  },
  {
    id: "code-format",
    category: "format",
    phase: "p0",
    name: { zh: "代码格式化", en: "Code format" },
    aliases: ["sql", "xml", "yaml", "html", "css", "minify", "validate", "beautify"],
    defaults: { language: "sql", action: "format" },
    view: "code-format",
  },
];
