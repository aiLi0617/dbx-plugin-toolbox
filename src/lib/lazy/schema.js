import { Validator } from "@cfworker/json-schema";

const JSON_TYPES = new Set(["null", "boolean", "object", "array", "number", "string", "integer"]);
const DIRECT_SCHEMA_KEYWORDS = [
  "additionalItems", "additionalProperties", "contains", "contentSchema", "else", "if", "items",
  "not", "propertyNames", "then", "unevaluatedItems", "unevaluatedProperties",
];
const SCHEMA_ARRAY_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];
const SCHEMA_MAP_KEYWORDS = ["$defs", "definitions", "dependentSchemas", "patternProperties", "properties"];
const NON_NEGATIVE_INTEGER_KEYWORDS = [
  "maxContains", "maxItems", "maxLength", "maxProperties", "minContains", "minItems", "minLength", "minProperties",
];
const NUMBER_KEYWORDS = ["exclusiveMaximum", "exclusiveMinimum", "maximum", "minimum"];
const STRING_KEYWORDS = [
  "$anchor", "$comment", "$dynamicAnchor", "$dynamicRef", "$id", "$ref", "$schema", "contentEncoding",
  "contentMediaType", "description", "format", "title",
];

function pointerToken(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function schemaIssue(path, keyword, message, messageZh, params = {}) {
  return { source: "schema", path, keyword, message, messageZh, params };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const DOCUMENT_MESSAGES_ZH = {
  additionalProperties: "存在 Schema 不允许的额外属性。",
  allOf: "数据未同时满足所有子 Schema。",
  anyOf: "数据未满足任一子 Schema。",
  const: "数据与 Schema 指定的固定值不一致。",
  contains: "数组中没有满足 Schema 的元素。",
  dependentRequired: "缺少当前属性所依赖的必填属性。",
  dependentSchemas: "数据未满足当前属性关联的 Schema。",
  enum: "数据不在 Schema 允许的枚举值中。",
  exclusiveMaximum: "数值必须小于 Schema 指定的上限。",
  exclusiveMinimum: "数值必须大于 Schema 指定的下限。",
  format: "字符串格式不符合 Schema 要求。",
  items: "数组元素不符合 Schema。",
  maxItems: "数组元素数量超过 Schema 上限。",
  maxLength: "字符串长度超过 Schema 上限。",
  maxProperties: "对象属性数量超过 Schema 上限。",
  maximum: "数值超过 Schema 允许的最大值。",
  minItems: "数组元素数量少于 Schema 下限。",
  minLength: "字符串长度少于 Schema 下限。",
  minProperties: "对象属性数量少于 Schema 下限。",
  minimum: "数值小于 Schema 允许的最小值。",
  multipleOf: "数值不是 Schema 指定值的整数倍。",
  not: "数据命中了 Schema 明确排除的规则。",
  oneOf: "数据必须且只能满足一个子 Schema。",
  pattern: "字符串不符合 Schema 指定的正则表达式。",
  properties: "对象属性值不符合 Schema。",
  propertyNames: "对象属性名不符合 Schema。",
  required: "缺少 Schema 指定的必填属性。",
  type: "数据类型不符合 Schema 要求。",
  uniqueItems: "数组中存在重复元素。",
};

function documentMessageZh(error) {
  return DOCUMENT_MESSAGES_ZH[error.keyword] || `数据不符合“${error.keyword || "Schema"}”规则。`;
}

/**
 * Validate the structural vocabulary supported by the CSP-safe validator before
 * treating a user document as a Schema. Unknown keywords remain valid extension
 * keywords, as required by JSON Schema.
 */
export function validateJsonSchemaDefinition(schema) {
  const errors = [];

  function add(path, keyword, message, messageZh, params) {
    errors.push(schemaIssue(path, keyword, message, messageZh, params));
  }

  function walk(node, path) {
    if (node === true || node === false) return;
    if (!isRecord(node)) {
      add(path, "schema", "A schema must be an object or a boolean.", "Schema 必须是对象或布尔值。", {
        expected: "object | boolean",
      });
      return;
    }

    for (const keyword of STRING_KEYWORDS) {
      if (keyword in node && typeof node[keyword] !== "string") {
        add(`${path}/${pointerToken(keyword)}`, keyword, `Schema keyword \"${keyword}\" must be a string.`, `Schema 关键字“${keyword}”必须是字符串。`, { expected: "string" });
      }
    }

    if ("type" in node) {
      const value = node.type;
      const validSingle = typeof value === "string" && JSON_TYPES.has(value);
      const validArray = Array.isArray(value)
        && value.length > 0
        && value.every((item) => typeof item === "string" && JSON_TYPES.has(item))
        && new Set(value).size === value.length;
      if (!validSingle && !validArray) {
        add(`${path}/type`, "type", "Schema keyword \"type\" must be a valid JSON type or a non-empty array of unique JSON types.", "Schema 关键字“type”必须是合法的 JSON 类型，或由不重复类型组成的非空数组。", {
          allowed: [...JSON_TYPES], actual: value,
        });
      }
    }

    if ("enum" in node && (!Array.isArray(node.enum) || node.enum.length === 0)) {
      add(`${path}/enum`, "enum", "Schema keyword \"enum\" must be a non-empty array.", "Schema 关键字“enum”必须是非空数组。", { expected: "non-empty array" });
    }
    if ("required" in node) {
      const value = node.required;
      if (!Array.isArray(value) || value.some((item) => typeof item !== "string") || new Set(value).size !== value.length) {
        add(`${path}/required`, "required", "Schema keyword \"required\" must be an array of unique strings.", "Schema 关键字“required”必须是由不重复字符串组成的数组。", { expected: "unique string[]" });
      }
    }
    if ("uniqueItems" in node && typeof node.uniqueItems !== "boolean") {
      add(`${path}/uniqueItems`, "uniqueItems", "Schema keyword \"uniqueItems\" must be a boolean.", "Schema 关键字“uniqueItems”必须是布尔值。", { expected: "boolean" });
    }
    for (const keyword of ["deprecated", "readOnly", "writeOnly", "$recursiveAnchor"]) {
      if (keyword in node && typeof node[keyword] !== "boolean") {
        add(`${path}/${pointerToken(keyword)}`, keyword, `Schema keyword \"${keyword}\" must be a boolean.`, `Schema 关键字“${keyword}”必须是布尔值。`, { expected: "boolean" });
      }
    }
    for (const keyword of NON_NEGATIVE_INTEGER_KEYWORDS) {
      if (keyword in node && (!Number.isInteger(node[keyword]) || node[keyword] < 0)) {
        add(`${path}/${keyword}`, keyword, `Schema keyword \"${keyword}\" must be a non-negative integer.`, `Schema 关键字“${keyword}”必须是非负整数。`, { expected: "integer >= 0" });
      }
    }
    for (const keyword of NUMBER_KEYWORDS) {
      if (keyword in node && (typeof node[keyword] !== "number" || !Number.isFinite(node[keyword]))) {
        add(`${path}/${keyword}`, keyword, `Schema keyword \"${keyword}\" must be a finite number.`, `Schema 关键字“${keyword}”必须是有限数字。`, { expected: "number" });
      }
    }
    if ("multipleOf" in node && (typeof node.multipleOf !== "number" || !Number.isFinite(node.multipleOf) || node.multipleOf <= 0)) {
      add(`${path}/multipleOf`, "multipleOf", "Schema keyword \"multipleOf\" must be a number greater than zero.", "Schema 关键字“multipleOf”必须是大于 0 的数字。", { expected: "number > 0" });
    }
    if ("pattern" in node) {
      if (typeof node.pattern !== "string") {
        add(`${path}/pattern`, "pattern", "Schema keyword \"pattern\" must be a string.", "Schema 关键字“pattern”必须是字符串。", { expected: "string" });
      } else {
        try { new RegExp(node.pattern, "u"); }
        catch {
          add(`${path}/pattern`, "pattern", "Schema keyword \"pattern\" must contain a valid regular expression.", "Schema 关键字“pattern”必须包含有效的正则表达式。", { expected: "regular expression" });
        }
      }
    }

    for (const keyword of DIRECT_SCHEMA_KEYWORDS) {
      if (keyword in node) walk(node[keyword], `${path}/${pointerToken(keyword)}`);
    }
    for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
      if (!(keyword in node)) continue;
      const value = node[keyword];
      if (!Array.isArray(value) || value.length === 0) {
        add(`${path}/${keyword}`, keyword, `Schema keyword \"${keyword}\" must be a non-empty array of schemas.`, `Schema 关键字“${keyword}”必须是由 Schema 组成的非空数组。`, { expected: "non-empty schema[]" });
        continue;
      }
      value.forEach((child, index) => walk(child, `${path}/${keyword}/${index}`));
    }
    for (const keyword of SCHEMA_MAP_KEYWORDS) {
      if (!(keyword in node)) continue;
      const value = node[keyword];
      if (!isRecord(value)) {
        add(`${path}/${pointerToken(keyword)}`, keyword, `Schema keyword \"${keyword}\" must be an object containing schemas.`, `Schema 关键字“${keyword}”必须是包含 Schema 的对象。`, { expected: "schema map" });
        continue;
      }
      for (const [name, child] of Object.entries(value)) {
        if (keyword === "patternProperties") {
          try { new RegExp(name, "u"); }
          catch {
            add(`${path}/${keyword}/${pointerToken(name)}`, keyword, `Pattern property \"${name}\" is not a valid regular expression.`, `模式属性“${name}”不是有效的正则表达式。`, { expected: "regular expression" });
          }
        }
        walk(child, `${path}/${pointerToken(keyword)}/${pointerToken(name)}`);
      }
    }

    if ("dependentRequired" in node) {
      const value = node.dependentRequired;
      if (!isRecord(value)) {
        add(`${path}/dependentRequired`, "dependentRequired", "Schema keyword \"dependentRequired\" must be an object.", "Schema 关键字“dependentRequired”必须是对象。", { expected: "object" });
      } else {
        for (const [name, dependencies] of Object.entries(value)) {
          if (!Array.isArray(dependencies) || dependencies.some((item) => typeof item !== "string") || new Set(dependencies).size !== dependencies.length) {
            add(`${path}/dependentRequired/${pointerToken(name)}`, "dependentRequired", "Each dependentRequired value must be an array of unique strings.", "dependentRequired 的每个值都必须是由不重复字符串组成的数组。", { expected: "unique string[]" });
          }
        }
      }
    }
    if ("$vocabulary" in node) {
      const value = node.$vocabulary;
      if (!isRecord(value) || Object.values(value).some((item) => typeof item !== "boolean")) {
        add(`${path}/$vocabulary`, "$vocabulary", "Schema keyword \"$vocabulary\" must map URI strings to booleans.", "Schema 关键字“$vocabulary”必须把 URI 字符串映射为布尔值。", { expected: "Record<string, boolean>" });
      }
    }
  }

  walk(schema, "#");
  return { valid: errors.length === 0, errors };
}

export function validateJsonSchema(schema, value) {
  // DBX deliberately omits `unsafe-eval` from its CSP. Ajv's browser runtime
  // compiles schemas with `new Function`, so use an interpreter-style Draft
  // 2020-12 validator here instead of weakening the host policy.
  const schemaResult = validateJsonSchemaDefinition(schema);
  if (!schemaResult.valid) return { valid: false, schemaValid: false, errors: schemaResult.errors };

  let result;
  try {
    const validator = new Validator(schema, "2020-12", false);
    result = validator.validate(value);
  } catch (cause) {
    return {
      valid: false,
      schemaValid: false,
      errors: [schemaIssue("#", "schema", cause?.message || "The schema could not be resolved.", "Schema 无法解析，请检查引用和标识符。")],
    };
  }
  const leafErrors = result.errors.filter((error, index, errors) => {
    const location = error.instanceLocation || "#";
    return !errors.some((candidate, candidateIndex) =>
      candidateIndex !== index && (candidate.instanceLocation || "#").startsWith(`${location}/`));
  });
  return {
    valid: Boolean(result.valid),
    schemaValid: true,
    errors: leafErrors.map((error) => ({
      source: "document",
      path: error.instanceLocation && error.instanceLocation !== "#" ? error.instanceLocation.slice(1) : "/",
      keyword: error.keyword,
      message: error.error || "Invalid value",
      messageZh: documentMessageZh(error),
      params: { keywordLocation: error.keywordLocation },
    })),
  };
}
