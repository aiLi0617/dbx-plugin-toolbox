import { sortValue } from "./jsonOps.js";
import { parseSafeJson } from "./jsonPrecision.js";
import { jsonToInsert } from "./tools/convert.js";
import { convertData } from "./dataConvert.js";

export const jsonLanguages = [
  { value: "typescript", zh: "TypeScript", en: "TypeScript" },
  { value: "python", zh: "Python", en: "Python" },
  { value: "go", zh: "Go", en: "Go" },
  { value: "java", zh: "Java", en: "Java" },
  { value: "csharp", zh: "C#", en: "C#" },
  { value: "rust", zh: "Rust", en: "Rust" },
  { value: "kotlin", zh: "Kotlin", en: "Kotlin" },
  { value: "swift", zh: "Swift", en: "Swift" },
  { value: "dart", zh: "Dart", en: "Dart" },
  { value: "cpp", zh: "C++", en: "C++" },
  { value: "php", zh: "PHP 数组", en: "PHP array" },
  { value: "ruby", zh: "Ruby", en: "Ruby" },
  { value: "json-schema", zh: "JSON Schema", en: "JSON Schema" },
  { value: "mysql", zh: "MySQL", en: "MySQL" },
  { value: "query", zh: "GET 请求参数", en: "Query string" },
  { value: "yaml", zh: "YAML", en: "YAML" },
  { value: "xml", zh: "XML", en: "XML" },
  { value: "toml", zh: "TOML", en: "TOML" },
  { value: "csv", zh: "CSV", en: "CSV" },
];

export function convertJsonToLang(text, lang, opts = {}) {
  let value = parseSafeJson(text);
  if (opts.sortKeys) value = sortValue(value, opts.sortKeys === true ? "asc" : opts.sortKeys);
  switch (lang) {
    case "python":
      return `data = ${pyValue(value)}`;
    case "php":
      return `<?php\n$data = ${phpValue(value)};\n`;
    case "ruby":
      return `data = ${rubyValue(value)}`;
    case "query":
      return toQuery(value);
    case "yaml":
    case "xml":
    case "toml":
    case "csv":
      return convertData(JSON.stringify(value), "json", lang);
    case "mysql":
      return mysqlOut(value, opts.table);
    case "json-schema":
      return JSON.stringify(toSchema(value), null, 2);
    case "typescript":
    case "go":
    case "java":
    case "csharp":
    case "rust":
    case "kotlin":
    case "swift":
    case "dart":
    case "cpp":
      return emitTypes(value, lang);
    default:
      return emitTypes(value, "typescript");
  }
}

function pascal(raw) {
  const parts = String(raw || "Item")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "Item";
  return parts.map((part) => part[0].toUpperCase() + part.slice(1)).join("");
}

function camel(raw) {
  const name = pascal(raw);
  return name[0].toLowerCase() + name.slice(1);
}

function snake(raw) {
  return (
    String(raw || "field")
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || "field"
  );
}

function identOk(key) {
  return /^[A-Za-z_]\w*$/.test(key);
}

function uniqueName(base, used) {
  let name = pascal(base);
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  let i = 2;
  while (used.has(name + i)) i++;
  const next = name + i;
  used.add(next);
  return next;
}

function shapeOf(value) {
  if (value === null) return { k: "null" };
  if (Array.isArray(value)) {
    if (!value.length) return { k: "array", item: { k: "any" } };
    return { k: "array", item: value.map(shapeOf).reduce(mergeShapes) };
  }
  const type = typeof value;
  if (type === "object") {
    return {
      k: "object",
      fields: Object.entries(value).map(([key, val]) => ({ key, shape: shapeOf(val) })),
    };
  }
  if (type === "boolean") return { k: "bool" };
  if (type === "number") return { k: Number.isInteger(value) ? "int" : "float" };
  return { k: "string" };
}

function mergeShapes(left, right) {
  if (left.k === right.k) {
    if (left.k === "array") return { k: "array", item: mergeShapes(left.item, right.item) };
    if (left.k === "object") {
      const leftFields = new Map(left.fields.map((field) => [field.key, field]));
      const rightFields = new Map(right.fields.map((field) => [field.key, field]));
      const keys = [...new Set([...leftFields.keys(), ...rightFields.keys()])];
      return {
        k: "object",
        fields: keys.map((key) => {
          const l = leftFields.get(key);
          const r = rightFields.get(key);
          return {
            key,
            shape: l && r ? mergeShapes(l.shape, r.shape) : (l || r).shape,
            optional: Boolean(l?.optional || r?.optional || !l || !r),
          };
        }),
      };
    }
    return left;
  }
  if ((left.k === "int" && right.k === "float") || (left.k === "float" && right.k === "int")) return { k: "float" };
  if (left.k === "null") return { ...right, nullable: true };
  if (right.k === "null") return { ...left, nullable: true };
  return { k: "any" };
}

function assignNames(shape, hint, named, used) {
  if (shape.k === "array") {
    assignNames(shape.item, hint, named, used);
    return;
  }
  if (shape.k !== "object" || shape.name) return;
  shape.name = uniqueName(hint, used);
  named.push(shape);
  for (const field of shape.fields) assignNames(field.shape, field.key, named, used);
}

function emitTypes(value, lang) {
  const root = shapeOf(value);
  const named = [];
  assignNames(root, "Root", named, new Set());
  if (!named.length) {
    const type = renderType(root, lang);
    return emitAlias(lang, "Root", type);
  }
  const structs = lang === "cpp" || lang === "java" || lang === "csharp" ? [...named].reverse() : named;
  return structs.map((shape) => emitStruct(shape, lang)).join("\n\n");
}

function emitAlias(lang, name, type) {
  if (lang === "go") return `type ${name} ${type}`;
  if (lang === "rust") return `type ${name} = ${type};`;
  if (lang === "kotlin") return `typealias ${name} = ${type}`;
  if (lang === "swift") return `typealias ${name} = ${type}`;
  if (lang === "dart") return `typedef ${name} = ${type};`;
  if (lang === "cpp") return `using ${name} = ${type};`;
  if (lang === "java") return `// ${name}: ${type}`;
  if (lang === "csharp") return `using ${name} = ${type};`;
  return `type ${name} = ${type};`;
}

function renderType(shape, lang) {
  if (shape.k === "object") return shape.name || "Root";
  if (shape.k === "array") {
    const inner = renderType(shape.item, lang);
    if (lang === "go") return `[]${inner}`;
    if (lang === "rust") return `Vec<${inner}>`;
    if (lang === "java") return `List<${javaBox(inner)}>`;
    if (lang === "csharp") return `List<${inner}>`;
    if (lang === "kotlin") return `List<${inner}>`;
    if (lang === "swift") return `[${inner}]`;
    if (lang === "dart") return `List<${inner}>`;
    if (lang === "cpp") return `std::vector<${inner}>`;
    return `${inner}[]`;
  }
  return prim(shape.k, lang);
}

function prim(kind, lang) {
  const table = {
    typescript: { null: "null", bool: "boolean", int: "number", float: "number", string: "string", any: "unknown" },
    go: { null: "any", bool: "bool", int: "int64", float: "float64", string: "string", any: "any" },
    rust: { null: "Option<()>", bool: "bool", int: "i64", float: "f64", string: "String", any: "serde_json::Value" },
    java: { null: "Object", bool: "boolean", int: "long", float: "double", string: "String", any: "Object" },
    csharp: { null: "object", bool: "bool", int: "long", float: "double", string: "string", any: "object" },
    kotlin: { null: "Any?", bool: "Boolean", int: "Long", float: "Double", string: "String", any: "Any" },
    swift: { null: "Any?", bool: "Bool", int: "Int64", float: "Double", string: "String", any: "Any" },
    dart: { null: "Null", bool: "bool", int: "int", float: "double", string: "String", any: "dynamic" },
    cpp: { null: "std::nullptr_t", bool: "bool", int: "int64_t", float: "double", string: "std::string", any: "nlohmann::json" },
  };
  return (table[lang] || table.typescript)[kind] || table.typescript.any;
}

function javaBox(type) {
  return { boolean: "Boolean", long: "Long", double: "Double" }[type] || type;
}

function fieldIdent(key, lang) {
  if (lang === "go" || lang === "csharp" || lang === "java") return pascal(key);
  if (lang === "rust") return snake(key);
  if (lang === "kotlin" || lang === "swift" || lang === "dart") return camel(key);
  if (lang === "cpp") return snake(key);
  return identOk(key) ? key : JSON.stringify(key);
}

function emitStruct(shape, lang) {
  const name = shape.name;
  const fields = shape.fields.map((field) => ({
    key: field.key,
    ident: fieldIdent(field.key, lang),
    type: renderType(field.shape, lang),
    optional: Boolean(field.optional || field.shape.nullable),
  }));
  if (lang === "go") {
    const body = fields.map((f) => `\t${f.ident} ${f.type} \`json:"${f.key}"\``).join("\n");
    return `type ${name} struct {\n${body}\n}`;
  }
  if (lang === "rust") {
    const body = fields.map((f) => `    pub ${f.ident}: ${f.type},`).join("\n");
    return `#[derive(Debug, Serialize, Deserialize)]\npub struct ${name} {\n${body}\n}`;
  }
  if (lang === "java") {
    const body = fields.map((f) => `    public ${f.type} ${camel(f.key)};`).join("\n");
    return `public class ${name} {\n${body}\n}`;
  }
  if (lang === "csharp") {
    const body = fields.map((f) => `    [JsonPropertyName("${f.key}")]\n    public ${f.type} ${f.ident} { get; set; }`).join("\n");
    return `public class ${name}\n{\n${body}\n}`;
  }
  if (lang === "kotlin") {
    const body = fields.map((f) => `    val ${f.ident}: ${f.type}`).join(",\n");
    return `data class ${name}(\n${body}\n)`;
  }
  if (lang === "swift") {
    const body = fields.map((f) => `    let ${f.ident}: ${f.type}`).join("\n");
    return `struct ${name}: Codable {\n${body}\n}`;
  }
  if (lang === "dart") {
    const decls = fields.map((f) => `  final ${f.type} ${f.ident};`).join("\n");
    const ctor = fields.map((f) => `required this.${f.ident}`).join(", ");
    return `class ${name} {\n${decls}\n  ${name}({${ctor}});\n}`;
  }
  if (lang === "cpp") {
    const body = fields.map((f) => `    ${f.type} ${f.ident};`).join("\n");
    return `struct ${name} {\n${body}\n};`;
  }
  const body = fields
    .map((f) => `  ${identOk(f.key) ? f.key : JSON.stringify(f.key)}${f.optional ? "?" : ""}: ${f.type};`)
    .join("\n");
  return `interface ${name} {\n${body}\n}`;
}

function pyValue(value, indent = 0) {
  const pad = "    ".repeat(indent);
  const inner = "    ".repeat(indent + 1);
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => `${inner}${pyValue(item, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${pyValue(v, indent + 1)},`).join("\n")}\n${pad}}`;
}

function phpValue(value, indent = 0) {
  const pad = "    ".repeat(indent);
  const inner = "    ".repeat(indent + 1);
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => `${inner}${phpValue(item, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "[]";
  return `[\n${entries.map(([k, v]) => `${inner}'${String(k).replace(/'/g, "\\'")}' => ${phpValue(v, indent + 1)},`).join("\n")}\n${pad}]`;
}

function rubyValue(value, indent = 0) {
  const pad = "  ".repeat(indent);
  const inner = "  ".repeat(indent + 1);
  if (value === null) return "nil";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return "[\n" + value.map((item) => `${inner}${rubyValue(item, indent + 1)},`).join("\n") + `\n${pad}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return "{\n" + entries.map(([k, v]) => `${inner}${JSON.stringify(k)} => ${rubyValue(v, indent + 1)},`).join("\n") + `\n${pad}}`;
}

function toQuery(value, prefix = "") {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((item, i) => toQuery(item, prefix ? `${prefix}[]` : String(i)))
      .filter(Boolean)
      .join("&");
  }
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, val]) => {
        const next = prefix ? `${prefix}[${encodeURIComponent(key)}]` : encodeURIComponent(key);
        return toQuery(val, next);
      })
      .filter(Boolean)
      .join("&");
  }
  return `${prefix}=${encodeURIComponent(String(value))}`;
}

function toSchema(value) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    if (!value.length) return { type: "array", items: {} };
    const variants = [...new Map(value.map((item) => {
      const schema = toSchema(item);
      return [JSON.stringify(schema), schema];
    })).values()];
    return { type: "array", items: variants.length === 1 ? variants[0] : { anyOf: variants } };
  }
  const type = typeof value;
  if (type === "object") {
    const properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toSchema(v)]));
    return { type: "object", properties, required: Object.keys(properties) };
  }
  if (type === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (type === "boolean") return { type: "boolean" };
  return { type: "string" };
}

function mysqlOut(value, table) {
  const name = table || "table_name";
  const records = Array.isArray(value) ? value : [value];
  const sample = records.find((row) => row && typeof row === "object" && !Array.isArray(row));
  if (!sample || typeof sample !== "object" || Array.isArray(sample)) return jsonToInsert(value, name);
  const keys = [...new Set(records.flatMap((row) => row && typeof row === "object" && !Array.isArray(row) ? Object.keys(row) : []))];
  const cols = keys.map((key) => {
    const values = records.map((row) => row?.[key]).filter((val) => val != null);
    const val = values[0];
    let typ = "TEXT";
    if (values.length && values.every((item) => typeof item === "number")) {
      typ = values.every(Number.isInteger) ? "BIGINT" : "DOUBLE";
    } else if (values.length && values.every((item) => typeof item === "boolean")) typ = "TINYINT(1)";
    else if (val && typeof val === "object") typ = "JSON";
    return `  \`${String(key).replace(/`/g, "``")}\` ${typ}`;
  });
  const safe = String(name).split(".").map((part) => `\`${part.replace(/`/g, "``")}\``).join(".");
  return `CREATE TABLE ${safe} (\n${cols.join(",\n")}\n);\n\n${jsonToInsert(value, name)}`;
}
