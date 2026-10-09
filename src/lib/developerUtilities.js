export function parseDotEnv(source) {
  const value = {};
  const diagnostics = [];
  const seen = new Set();
  const lines = String(source || "").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) { diagnostics.push({ line: index + 1, level: "error", message: "Invalid variable declaration" }); continue; }
    const [, key] = match;
    let rawValue = match[2];
    if (seen.has(key)) diagnostics.push({ line: index + 1, level: "warning", message: `Duplicate key: ${key}` });
    seen.add(key);
    const quoteStart = rawValue[0];
    if ((quoteStart === '"' || quoteStart === "'") && !rawValue.endsWith(quoteStart)) {
      while (index + 1 < lines.length && !rawValue.endsWith(quoteStart)) rawValue += `\n${lines[++index]}`;
      if (!rawValue.endsWith(quoteStart)) {
        diagnostics.push({ line: index + 1, level: "error", message: `Unterminated quoted value: ${key}` });
        continue;
      }
    }
    let parsed = rawValue;
    if ((parsed.startsWith('"') && parsed.endsWith('"')) || (parsed.startsWith("'") && parsed.endsWith("'"))) {
      const quote = parsed[0];
      parsed = parsed.slice(1, -1);
      if (quote === '"') parsed = parsed.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    } else {
      parsed = parsed.replace(/\s+#.*$/, "").trim();
    }
    value[key] = parsed;
  }
  return { value, diagnostics };
}

export function stringifyDotEnv(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return Object.entries(value).map(([key, raw]) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid variable name: ${key}`);
    const text = raw == null ? "" : String(raw);
    const safe = /^[A-Za-z0-9_./:@+-]*$/.test(text) ? text : `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
    return `${key}=${safe}`;
  }).join("\n");
}

export const HTTP_STATUS_CLASSES = Object.freeze({
  "1xx": { label: { zh: "信息响应", en: "Informational" }, description: { zh: "请求已收到，处理仍在继续", en: "The request was received and processing continues." } },
  "2xx": { label: { zh: "成功", en: "Success" }, description: { zh: "请求已成功接收、理解并处理", en: "The request was successfully received, understood, and accepted." } },
  "3xx": { label: { zh: "重定向", en: "Redirection" }, description: { zh: "需要进一步操作才能完成请求", en: "Further action is needed to complete the request." } },
  "4xx": { label: { zh: "客户端错误", en: "Client error" }, description: { zh: "请求有误、无权访问或无法完成", en: "The request is invalid, unauthorized, or cannot be fulfilled." } },
  "5xx": { label: { zh: "服务端错误", en: "Server error" }, description: { zh: "服务器未能完成一个看似有效的请求", en: "The server failed to fulfill an apparently valid request." } },
});

const HTTP_STATUS_SUMMARIES = {
  100: ["客户端可以继续发送请求体", "The client may continue sending the request body."],
  101: ["服务器同意切换到请求的协议", "The server agrees to switch protocols."],
  102: ["服务器已收到请求，仍在处理中", "The server received the request and is still processing it."],
  103: ["在最终响应前预加载可能需要的资源", "Hints allow resources to be preloaded before the final response."],
  104: ["临时登记：服务器支持可恢复上传", "Temporary registration: the server supports resumable uploads."],
  200: ["请求成功，响应包含结果", "The request succeeded and the response contains the result."],
  201: ["请求成功并创建了新资源", "The request succeeded and created a new resource."],
  202: ["请求已接受，但尚未处理完成", "The request was accepted but processing is not complete."],
  204: ["请求成功，但无需返回响应正文", "The request succeeded with no response body."],
  206: ["返回了 Range 请求指定的部分内容", "The response contains the requested byte range."],
  301: ["资源已永久迁移，客户端可更新链接", "The resource moved permanently; clients may update stored links."],
  302: ["资源暂时位于另一个地址", "The resource is temporarily available at another URI."],
  303: ["应使用 GET 到另一个地址获取结果", "Retrieve the result from another URI using GET."],
  304: ["缓存仍然有效，无需传输响应正文", "The cached representation is still valid."],
  307: ["临时重定向，并保留原请求方法和请求体", "Temporary redirect that preserves the method and body."],
  308: ["永久重定向，并保留原请求方法和请求体", "Permanent redirect that preserves the method and body."],
  400: ["请求语法、参数或格式不正确", "The request syntax, parameters, or format are invalid."],
  401: ["需要提供有效的身份认证信息", "Valid authentication credentials are required."],
  403: ["服务器理解请求，但拒绝执行", "The server understood the request but refuses to fulfill it."],
  404: ["目标资源不存在或不愿透露其存在", "The target resource was not found or its existence is not disclosed."],
  405: ["该资源不支持当前请求方法", "The resource does not support the request method."],
  408: ["服务器等待请求的时间过长", "The server timed out while waiting for the request."],
  409: ["请求与资源当前状态发生冲突", "The request conflicts with the current state of the resource."],
  410: ["资源已永久移除且没有转发地址", "The resource was permanently removed with no forwarding address."],
  412: ["请求头中的前置条件未满足", "A precondition in the request headers was not met."],
  413: ["请求内容超过服务器愿意处理的大小", "The request content is larger than the server will process."],
  415: ["服务器不支持请求内容的媒体类型", "The request media type is not supported."],
  416: ["请求的内容范围无法满足", "The requested content range cannot be satisfied."],
  418: ["RFC 9110 保留的未使用状态码；常称“我是茶壶”", "Reserved as unused by RFC 9110; commonly known as “I'm a Teapot”."],
  421: ["请求被发送到了无法生成响应的服务器", "The request was directed to a server unable to produce a response."],
  422: ["格式正确，但内容在语义上无法处理", "The syntax is valid, but the content cannot be processed."],
  425: ["服务器不愿承担请求被重放的风险", "The server is unwilling to risk processing a replayed request."],
  426: ["客户端需要切换到服务器要求的协议", "The client must switch to the protocol required by the server."],
  428: ["服务器要求请求带有前置条件", "The server requires the request to be conditional."],
  429: ["请求过于频繁，应在稍后重试", "Too many requests were sent; retry later."],
  431: ["请求头字段整体或单个字段过大", "The request header fields are too large."],
  451: ["因法律原因无法提供资源", "The resource is unavailable for legal reasons."],
  500: ["服务器遇到未预期的内部错误", "The server encountered an unexpected internal error."],
  501: ["服务器不支持完成请求所需的功能", "The server does not support the functionality required."],
  502: ["网关从上游服务收到了无效响应", "A gateway received an invalid response from an upstream server."],
  503: ["服务暂时不可用，通常可稍后重试", "The service is temporarily unavailable; retrying later may help."],
  504: ["网关等待上游服务响应超时", "A gateway timed out waiting for an upstream server."],
  511: ["客户端需要先完成网络认证", "The client must authenticate to gain network access."],
};

const HTTP_STATUSES = [
  [100,"Continue"],[101,"Switching Protocols"],[102,"Processing"],[103,"Early Hints"],[104,"Upload Resumption Supported", { temporary: true }],
  [200,"OK"],[201,"Created"],[202,"Accepted"],[203,"Non-Authoritative Information"],[204,"No Content"],[205,"Reset Content"],[206,"Partial Content"],[207,"Multi-Status"],[208,"Already Reported"],[226,"IM Used"],
  [300,"Multiple Choices"],[301,"Moved Permanently"],[302,"Found"],[303,"See Other"],[304,"Not Modified"],[305,"Use Proxy"],[307,"Temporary Redirect"],[308,"Permanent Redirect"],
  [400,"Bad Request"],[401,"Unauthorized"],[402,"Payment Required"],[403,"Forbidden"],[404,"Not Found"],[405,"Method Not Allowed"],[406,"Not Acceptable"],[407,"Proxy Authentication Required"],[408,"Request Timeout"],[409,"Conflict"],[410,"Gone"],[411,"Length Required"],[412,"Precondition Failed"],[413,"Content Too Large"],[414,"URI Too Long"],[415,"Unsupported Media Type"],[416,"Range Not Satisfiable"],[417,"Expectation Failed"],[418,"Unused (I'm a Teapot)", { unused: true }],[421,"Misdirected Request"],[422,"Unprocessable Content"],[423,"Locked"],[424,"Failed Dependency"],[425,"Too Early"],[426,"Upgrade Required"],[428,"Precondition Required"],[429,"Too Many Requests"],[431,"Request Header Fields Too Large"],[451,"Unavailable For Legal Reasons"],
  [500,"Internal Server Error"],[501,"Not Implemented"],[502,"Bad Gateway"],[503,"Service Unavailable"],[504,"Gateway Timeout"],[505,"HTTP Version Not Supported"],[506,"Variant Also Negotiates"],[507,"Insufficient Storage"],[508,"Loop Detected"],[510,"Not Extended", { obsolete: true }],[511,"Network Authentication Required"],
].map(([code, name, metadata = {}]) => {
  const category = `${Math.floor(code / 100)}xx`;
  const [zh, en] = HTTP_STATUS_SUMMARIES[code] || [HTTP_STATUS_CLASSES[category].description.zh, HTTP_STATUS_CLASSES[category].description.en];
  return Object.freeze({ code, name, category, summary: { zh, en }, ...metadata });
});

export const HTTP_STATUS_COUNT = HTTP_STATUSES.length;

export function searchHttpStatuses(query = "") {
  const q = String(query).trim().toLowerCase();
  return HTTP_STATUSES.filter((item) => !q || [
    item.code,
    item.name,
    item.category,
    item.summary.zh,
    item.summary.en,
    item.temporary ? "temporary 临时" : "",
    item.obsolete ? "obsolete 已废弃" : "",
    item.unused ? "unused 未使用 茶壶 teapot" : "",
  ].join(" ").toLowerCase().includes(q));
}

export function chmodFromOctal(input) {
  const raw = String(input || "").trim().replace(/^0o/i, "");
  if (!/^[0-7]{3,4}$/.test(raw)) throw new Error("Permissions must be three or four octal digits");
  const padded = raw.padStart(4, "0");
  const special = Number(padded[0]);
  const digits = padded.slice(1).split("").map(Number);
  const chars = digits.flatMap((digit) => [(digit & 4) ? "r" : "-", (digit & 2) ? "w" : "-", (digit & 1) ? "x" : "-"]);
  if (special & 4) chars[2] = chars[2] === "x" ? "s" : "S";
  if (special & 2) chars[5] = chars[5] === "x" ? "s" : "S";
  if (special & 1) chars[8] = chars[8] === "x" ? "t" : "T";
  return { octal: special ? padded : padded.slice(1), symbolic: chars.join(""), special, digits };
}

export function chmodFromUmask(input) {
  const raw = String(input || "").trim().replace(/^0o/i, "");
  if (!/^(?:0?[0-7]{1,3})$/.test(raw)) throw new Error("Umask must contain up to three octal digits with an optional leading zero");
  const mask = Number.parseInt(raw, 8) & 0o777;
  const file = (0o666 & ~mask) & 0o777;
  const directory = (0o777 & ~mask) & 0o777;
  const describe = (value) => {
    const octal = value.toString(8).padStart(3, "0");
    return { octal, symbolic: chmodFromOctal(octal).symbolic };
  };
  return {
    umask: mask.toString(8).padStart(3, "0"),
    file: describe(file),
    directory: describe(directory),
  };
}

export function chmodSymbolicExpression(input) {
  const mode = typeof input === "string" ? chmodFromOctal(input) : input;
  if (!mode || !Array.isArray(mode.digits) || mode.digits.length !== 3) throw new Error("Expected a chmod mode");
  const clauses = ["u", "g", "o"].map((who, index) => {
    const digit = mode.digits[index];
    return `${who}=${digit & 4 ? "r" : ""}${digit & 2 ? "w" : ""}${digit & 1 ? "x" : ""}`;
  });
  if (mode.special & 4) clauses.push("u+s");
  if (mode.special & 2) clauses.push("g+s");
  if (mode.special & 1) clauses.push("o+t");
  return clauses.join(",");
}

export function chmodFromSymbolic(input) {
  const value = String(input || "").trim();
  if (!/^[r-][w-][xSs-][r-][w-][xSs-][r-][w-][xTt-]$/.test(value)) throw new Error("Expected a nine-character symbolic mode");
  const groups = [value.slice(0,3), value.slice(3,6), value.slice(6,9)];
  const digits = groups.map((group) => (group[0] === "r" ? 4 : 0) + (group[1] === "w" ? 2 : 0) + (/[xst]/.test(group[2]) ? 1 : 0));
  const special = (/[sS]/.test(groups[0][2]) ? 4 : 0) + (/[sS]/.test(groups[1][2]) ? 2 : 0) + (/[tT]/.test(groups[2][2]) ? 1 : 0);
  return chmodFromOctal(`${special || ""}${digits.join("")}`);
}
