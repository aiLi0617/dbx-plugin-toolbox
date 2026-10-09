import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export function validateJsonSchema(schema, value) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, loadSchema: undefined });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(value);
  return {
    valid: Boolean(valid),
    errors: (validate.errors || []).map((error) => ({
      path: error.instancePath || "/",
      keyword: error.keyword,
      message: error.message || "Invalid value",
      params: error.params,
    })),
  };
}
