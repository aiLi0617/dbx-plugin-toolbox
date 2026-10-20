const GENERIC_WRAPPER = /^(?:request failed|operation failed|internal error|internal server error|invocation failed|rpc error|error)$/i;

/** Unwrap generic RPC envelopes without inspecting request parameters or secret data. */
export function errorMessage(error) {
  const seen = new Set();
  function visit(value, depth = 0) {
    if (typeof value === "string") return value.trim();
    if (!value || typeof value !== "object" || seen.has(value) || depth > 5) return "";
    seen.add(value);
    const own = [value.message, value.msg].find((item) => typeof item === "string" && item.trim())?.trim() || "";
    if (own && !GENERIC_WRAPPER.test(own)) return own;
    for (const nested of [value.error, value.data, value.cause]) {
      const detail = visit(nested, depth + 1);
      if (detail && !GENERIC_WRAPPER.test(detail)) return detail;
    }
    return own;
  }
  return visit(error);
}
