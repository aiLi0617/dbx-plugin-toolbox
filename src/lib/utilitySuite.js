import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PHONE_REGIONS = new Set(["CN", "US", "GB", "JP", "DE", "FR", "AU", "CA"]);

export function formatCopyRows(rows = []) {
  return rows
    .filter((row) => Array.isArray(row) && row.length >= 2 && String(row[0] ?? "").trim())
    .map(([label, value]) => `${String(label).trim()}: ${value == null ? "" : String(value)}`)
    .join("\n");
}

export function formatCopySections(sections = []) {
  return sections
    .map((section) => {
      const body = formatCopyRows(section?.rows);
      const title = String(section?.title ?? "").trim();
      return [title ? `[${title}]` : "", body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export function parsePhoneNumber(value, region = "CN") {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Enter a phone number");
  const defaultRegion = PHONE_REGIONS.has(region) ? region : "CN";
  const normalized = raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
  const phone = parsePhoneNumberFromString(normalized, defaultRegion);
  if (!phone || !phone.isPossible()) throw new Error("Phone number is not possible for the selected region");
  if (!phone.isValid()) throw new Error("Phone number is not valid for the selected region");
  return {
    e164: phone.number,
    international: phone.formatInternational(),
    national: phone.nationalNumber,
    formattedNational: phone.formatNational(),
    callingCode: `+${phone.countryCallingCode}`,
    region: phone.country || "Unknown",
  };
}

const SIZE_UNITS = Object.freeze({
  B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
  KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4,
});
const SPEED_UNITS = Object.freeze({
  bps: 1, Kbps: 1e3, Mbps: 1e6, Gbps: 1e9, Tbps: 1e12,
  "B/s": 8, "KB/s": 8e3, "MB/s": 8e6, "GB/s": 8e9,
  "KiB/s": 8 * 1024, "MiB/s": 8 * 1024 ** 2, "GiB/s": 8 * 1024 ** 3,
});

export function calculateTransfer({ size, sizeUnit = "MB", speed, speedUnit = "Mbps", overhead = 0, count = 1 }) {
  const amount = Number(size);
  const rate = Number(speed);
  const copies = Number(count);
  const loss = Number(overhead);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(rate) || rate <= 0) throw new Error("Size and speed must be valid positive numbers");
  if (!Number.isInteger(copies) || copies < 1 || copies > 1_000_000) throw new Error("File count must be an integer between 1 and 1000000");
  if (!Number.isFinite(loss) || loss < 0 || loss >= 100) throw new Error("Protocol overhead must be between 0 and 99.99 percent");
  if (!Object.hasOwn(SIZE_UNITS, sizeUnit)) throw new Error(`Unsupported size unit: ${sizeUnit}`);
  if (!Object.hasOwn(SPEED_UNITS, speedUnit)) throw new Error(`Unsupported speed unit: ${speedUnit}`);
  const bytes = amount * SIZE_UNITS[sizeUnit] * copies;
  const bitsPerSecond = rate * SPEED_UNITS[speedUnit];
  if (!Number.isFinite(bytes) || !Number.isFinite(bitsPerSecond)) throw new Error("Transfer values are too large");
  const efficiency = 1 - loss / 100;
  const effectiveBitsPerSecond = bitsPerSecond * efficiency;
  const seconds = bytes * 8 / effectiveBitsPerSecond;
  const idealSeconds = bytes * 8 / bitsPerSecond;
  return { bytes, bitsPerSecond, effectiveBitsPerSecond, efficiency, seconds, idealSeconds, overheadSeconds: seconds - idealSeconds, text: formatDuration(seconds) };
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 0) return "—";
  if (seconds < 0.001) return `${Math.round(seconds * 1_000_000)} µs`;
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  const rounded = Math.round(seconds);
  const days = Math.floor(rounded / 86400);
  const hours = Math.floor(rounded % 86400 / 3600);
  const minutes = Math.floor(rounded % 3600 / 60);
  const secs = rounded % 60;
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${secs}s`].filter(Boolean).join(" ");
}

export function shellTokens(command) {
  const source = String(command || "").trim();
  const tokens = [];
  let value = ""; let quote = ""; let escaped = false;
  for (const char of source) {
    if (escaped) { value += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = ""; else value += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (value) { tokens.push(value); value = ""; } continue; }
    value += char;
  }
  if (escaped) throw new Error("Command ends with an incomplete escape");
  if (quote) throw new Error("Command contains an unclosed quote");
  if (value) tokens.push(value);
  return tokens;
}

function optionValue(tokens, index, token, longName) {
  const prefix = `${longName}=`;
  if (token.startsWith(prefix)) return { value: token.slice(prefix.length), index };
  if (index + 1 >= tokens.length) throw new Error(`${token} requires a value`);
  return { value: tokens[index + 1], index: index + 1 };
}

export function parseCurl(command) {
  const tokens = shellTokens(command.replace(/\\\r?\n/g, " "));
  if (tokens[0] !== "curl") throw new Error("Command must start with curl");
  let method = "GET"; let url = ""; let body = ""; let timeout = null; let connectTimeout = null; let followRedirects = false; let queryMode = false; let bodyType = "raw"; const headers = []; const form = [];
  const diagnostics = [];
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (["-X", "--request"].includes(token) || token.startsWith("--request=")) { const next = optionValue(tokens, i, token, "--request"); method = next.value.toUpperCase(); i = next.index; }
    else if (["-H", "--header"].includes(token) || token.startsWith("--header=")) { const next = optionValue(tokens, i, token, "--header"); headers.push(next.value); i = next.index; }
    else if (["-d", "--data", "--data-raw", "--data-binary", "--data-urlencode"].includes(token) || /^--data(?:-raw|-binary|-urlencode)?=/.test(token)) { const name = token.split("=")[0]; const next = optionValue(tokens, i, token, name); const value = name === "--data-urlencode" ? encodeCurlData(next.value) : next.value; body = body ? `${body}&${value}` : value; if (method === "GET" && !queryMode) method = "POST"; i = next.index; }
    else if (["-F", "--form"].includes(token) || token.startsWith("--form=")) { const next = optionValue(tokens, i, token, "--form"); form.push(next.value); bodyType = "multipart"; if (method === "GET") method = "POST"; i = next.index; }
    else if (token === "--json" || token.startsWith("--json=")) { const next = optionValue(tokens, i, token, "--json"); body = next.value; method = method === "GET" ? "POST" : method; if (!headers.some((item) => /^content-type:/i.test(item))) headers.push("Content-Type: application/json"); if (!headers.some((item) => /^accept:/i.test(item))) headers.push("Accept: application/json"); i = next.index; }
    else if (["-u", "--user"].includes(token) || token.startsWith("--user=")) { const next = optionValue(tokens, i, token, "--user"); headers.push(`Authorization: Basic ${encodeBase64(next.value)}`); i = next.index; }
    else if (["-A", "--user-agent"].includes(token) || token.startsWith("--user-agent=")) { const next = optionValue(tokens, i, token, "--user-agent"); headers.push(`User-Agent: ${next.value}`); i = next.index; }
    else if (["-e", "--referer"].includes(token) || token.startsWith("--referer=")) { const next = optionValue(tokens, i, token, "--referer"); headers.push(`Referer: ${next.value}`); i = next.index; }
    else if (["-b", "--cookie"].includes(token) || token.startsWith("--cookie=")) { const next = optionValue(tokens, i, token, "--cookie"); headers.push(`Cookie: ${next.value}`); i = next.index; }
    else if (token === "--url" || token.startsWith("--url=")) { const next = optionValue(tokens, i, token, "--url"); url = next.value; i = next.index; }
    else if (["-L", "--location"].includes(token)) followRedirects = true;
    else if (["-I", "--head"].includes(token)) method = "HEAD";
    else if (["-G", "--get"].includes(token)) { queryMode = true; method = "GET"; }
    else if (token === "--max-time" || token.startsWith("--max-time=")) { const next = optionValue(tokens, i, token, "--max-time"); timeout = Number(next.value); if (!Number.isFinite(timeout) || timeout <= 0) throw new Error("--max-time must be a positive number"); i = next.index; }
    else if (token === "--connect-timeout" || token.startsWith("--connect-timeout=")) { const next = optionValue(tokens, i, token, "--connect-timeout"); connectTimeout = Number(next.value); if (!Number.isFinite(connectTimeout) || connectTimeout <= 0) throw new Error("--connect-timeout must be a positive number"); i = next.index; }
    else if (token === "--compressed") headers.push("Accept-Encoding: gzip, deflate, br");
    else if (["-k", "--insecure"].includes(token)) diagnostics.push("TLS certificate verification is disabled by the source command and cannot be represented safely in browser fetch");
    else if (token.startsWith("http://") || token.startsWith("https://")) url = token;
    else if (token.startsWith("-")) diagnostics.push(`Unsupported option: ${token}`);
  }
  if (!url) throw new Error("No HTTP URL found");
  if (queryMode && body) { const separator = url.includes("?") ? "&" : "?"; url += `${separator}${body}`; body = ""; }
  if (form.length) diagnostics.push("Multipart form fields are generated, but @file uploads require manual file selection in the target language");
  return { method, url, headers, body, bodyType, form, timeout, connectTimeout, followRedirects, diagnostics };
}

function encodeCurlData(value) {
  const at = value.indexOf("=");
  return at < 0 ? encodeURIComponent(value) : `${encodeURIComponent(value.slice(0, at))}=${encodeURIComponent(value.slice(at + 1))}`;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function requestCode(request, language = "javascript") {
  const headers = Object.fromEntries(request.headers.filter(Boolean).map((line) => {
    const at = line.indexOf(":"); return at < 0 ? [line, ""] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
  }));
  const timeoutSeconds = request.timeout || null;
  const formFields = (request.form || []).map(parseFormField);
  const regularFields = formFields.filter((field) => !field.file);
  const fileFields = formFields.filter((field) => field.file);
  if (language === "python") return `import requests\n\n${fileFields.length ? `files = {\n${fileFields.map((field) => `    ${JSON.stringify(field.name)}: open(${JSON.stringify(field.value)}, "rb"),`).join("\n")}\n}\n` : ""}response = requests.request(\n    ${JSON.stringify(request.method)},\n    ${JSON.stringify(request.url)},\n    headers=${JSON.stringify(headers, null, 2)}${request.body ? `,\n    data=${JSON.stringify(request.body)}` : regularFields.length ? `,\n    data=${JSON.stringify(Object.fromEntries(regularFields.map((field) => [field.name, field.value])), null, 2)}` : ""}${fileFields.length ? `,\n    files=files` : ""}${timeoutSeconds ? `,\n    timeout=${timeoutSeconds}` : ""},\n    allow_redirects=${request.followRedirects ? "True" : "False"},\n)\nresponse.raise_for_status()\nprint(response.text)`;
  if (language === "java") {
    const javaForm = formFields.length ? `String boundary = "DBX-" + UUID.randomUUID();\n        List<byte[]> parts = new ArrayList<>();\n${regularFields.map((field) => `        parts.add(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\\"" + ${JSON.stringify(field.name)} + "\\\"\\r\\n\\r\\n" + ${JSON.stringify(field.value)} + "\\r\\n").getBytes(StandardCharsets.UTF_8));`).join("\n")}${fileFields.map((field) => `\n        parts.add(("--" + boundary + "\\r\\nContent-Disposition: form-data; name=\\\"" + ${JSON.stringify(field.name)} + "\\\"; filename=\\\"" + Path.of(${JSON.stringify(field.value)}).getFileName() + "\\\"\\r\\nContent-Type: application/octet-stream\\r\\n\\r\\n").getBytes(StandardCharsets.UTF_8));\n        parts.add(Files.readAllBytes(Path.of(${JSON.stringify(field.value)})));\n        parts.add("\\r\\n".getBytes(StandardCharsets.UTF_8));`).join("")}\n        parts.add(("--" + boundary + "--\\r\\n").getBytes(StandardCharsets.UTF_8));\n        HttpRequest.BodyPublisher body = HttpRequest.BodyPublishers.ofByteArrays(parts);` : `HttpRequest.BodyPublisher body = ${request.body ? `HttpRequest.BodyPublishers.ofString(${JSON.stringify(request.body)})` : "HttpRequest.BodyPublishers.noBody()"};`;
    const javaImports = formFields.length ? "\nimport java.nio.charset.StandardCharsets;\nimport java.nio.file.Files;\nimport java.nio.file.Path;\nimport java.util.ArrayList;\nimport java.util.List;\nimport java.util.UUID;" : "";
    return `import java.net.URI;\nimport java.net.http.HttpClient;\nimport java.net.http.HttpRequest;\nimport java.net.http.HttpResponse;${timeoutSeconds || request.connectTimeout ? "\nimport java.time.Duration;" : ""}${javaImports}\n\npublic class Main {\n    public static void main(String[] args) throws Exception {\n        ${javaForm}\n        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(${JSON.stringify(request.url)}))${timeoutSeconds ? `\n            .timeout(Duration.ofMillis(${Math.ceil(timeoutSeconds * 1000)}))` : ""}\n            .method(${JSON.stringify(request.method)}, body);\n${Object.entries(headers).filter(([key]) => !(formFields.length && key.toLowerCase() === "content-type")).map(([key, value]) => `        request.header(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join("\n")}${formFields.length ? `\n        request.header("Content-Type", "multipart/form-data; boundary=" + boundary);` : ""}\n        HttpClient client = HttpClient.newBuilder()${request.connectTimeout ? `\n            .connectTimeout(Duration.ofMillis(${Math.ceil(request.connectTimeout * 1000)}))` : ""}\n            .followRedirects(HttpClient.Redirect.${request.followRedirects ? "NORMAL" : "NEVER"})\n            .build();\n        HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());\n        if (response.statusCode() >= 400) throw new RuntimeException("HTTP " + response.statusCode());\n        System.out.println(response.body());\n    }\n}`;
  }
  if (language === "csharp") {
    const csharpContent = formFields.length ? `using var content = new MultipartFormDataContent();\n${regularFields.map((field) => `content.Add(new StringContent(${JSON.stringify(field.value)}), ${JSON.stringify(field.name)});`).join("\n")}${fileFields.map((field) => `\ncontent.Add(new StreamContent(File.OpenRead(${JSON.stringify(field.value)})), ${JSON.stringify(field.name)}, Path.GetFileName(${JSON.stringify(field.value)}));`).join("")}` : request.body ? `using var content = new StringContent(${JSON.stringify(request.body)});` : "HttpContent? content = null;";
    return `using System.Net;\nusing System.Net.Http;\n${fileFields.length ? "using System.IO;\n" : ""}\nusing var handler = new HttpClientHandler { AllowAutoRedirect = ${request.followRedirects ? "true" : "false"} };\nusing var client = new HttpClient(handler)${timeoutSeconds ? ` { Timeout = TimeSpan.FromSeconds(${timeoutSeconds}) }` : ""};\n${csharpContent}\nusing var request = new HttpRequestMessage(new HttpMethod(${JSON.stringify(request.method)}), ${JSON.stringify(request.url)}) { Content = content };\n${Object.entries(headers).filter(([key]) => !(formFields.length && key.toLowerCase() === "content-type")).map(([key, value]) => `if (!request.Headers.TryAddWithoutValidation(${JSON.stringify(key)}, ${JSON.stringify(value)})) request.Content?.Headers.TryAddWithoutValidation(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join("\n")}\nusing var response = await client.SendAsync(request);\nresponse.EnsureSuccessStatusCode();\nConsole.WriteLine(await response.Content.ReadAsStringAsync());`;
  }
  if (language === "go") {
    const multipartImports = formFields.length ? `\n\t"bytes"\n\t"mime/multipart"${fileFields.length ? `\n\t"os"\n\t"path/filepath"` : ""}` : "";
    const bodySetup = formFields.length ? `\tvar buffer bytes.Buffer\n\twriter := multipart.NewWriter(&buffer)\n${regularFields.map((field) => `\tif err := writer.WriteField(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)}); err != nil { panic(err) }`).join("\n")}${fileFields.map((field) => `\n\tfile, err := os.Open(${JSON.stringify(field.value)})\n\tif err != nil { panic(err) }\n\tdefer file.Close()\n\tpart, err := writer.CreateFormFile(${JSON.stringify(field.name)}, filepath.Base(${JSON.stringify(field.value)}))\n\tif err != nil { panic(err) }\n\tif _, err = io.Copy(part, file); err != nil { panic(err) }`).join("")}\n\tif err := writer.Close(); err != nil { panic(err) }\n\tbodyReader := &buffer\n` : `\tbodyReader := strings.NewReader(${JSON.stringify(request.body || "")})\n`;
    const contentType = formFields.length ? `\n\treq.Header.Set("Content-Type", writer.FormDataContentType())` : "";
    return `package main\n\nimport (\n\t"fmt"\n\t"io"\n\t"net/http"${formFields.length ? "" : `\n\t"strings"`}${multipartImports}${timeoutSeconds ? `\n\t"time"` : ""}\n)\n\nfunc main() {\n${bodySetup}\treq, err := http.NewRequest(${JSON.stringify(request.method)}, ${JSON.stringify(request.url)}, bodyReader)\n\tif err != nil { panic(err) }\n${Object.entries(headers).map(([k, v]) => `\treq.Header.Set(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join("\n")}${contentType}\n\tclient := &http.Client{${timeoutSeconds ? `Timeout: ${timeoutSeconds} * time.Second, ` : ""}CheckRedirect: func(req *http.Request, via []*http.Request) error { ${request.followRedirects ? "return nil" : "return http.ErrUseLastResponse"} }}\n\tresp, err := client.Do(req)\n\tif err != nil { panic(err) }\n\tdefer resp.Body.Close()\n\tbody, err := io.ReadAll(resp.Body)\n\tif err != nil { panic(err) }\n\tif resp.StatusCode >= 400 { panic(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, body)) }\n\tfmt.Println(string(body))\n}`;
  }
  if (language === "php") {
    const phpHeaders = Object.entries(headers).map(([key, value]) => `${key}: ${value}`);
    const phpForm = formFields.length ? `$postFields = [\n${formFields.map((field) => `    ${JSON.stringify(field.name)} => ${field.file ? `new CURLFile(${JSON.stringify(field.value)})` : JSON.stringify(field.value)},`).join("\n")}\n];\n` : "";
    const phpBody = formFields.length ? "$postFields" : request.body ? JSON.stringify(request.body) : "";
    return `<?php\n${phpForm}$ch = curl_init(${JSON.stringify(request.url)});\ncurl_setopt_array($ch, [\n    CURLOPT_CUSTOMREQUEST => ${JSON.stringify(request.method)},\n    CURLOPT_RETURNTRANSFER => true,\n    CURLOPT_FOLLOWLOCATION => ${request.followRedirects ? "true" : "false"}${phpBody ? `,\n    CURLOPT_POSTFIELDS => ${phpBody}` : ""}${phpHeaders.length ? `,\n    CURLOPT_HTTPHEADER => ${JSON.stringify(phpHeaders)}` : ""}${timeoutSeconds ? `,\n    CURLOPT_TIMEOUT => ${Math.ceil(timeoutSeconds)}` : ""}\n]);\n$result = curl_exec($ch);\nif ($result === false) { throw new RuntimeException(curl_error($ch)); }\n$httpCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);\ncurl_close($ch);\nif ($httpCode >= 400) { throw new RuntimeException("HTTP " . $httpCode); }\necho $result;`;
  }
  if (language === "ruby") {
    const rubyBody = formFields.length ? `form = [\n${formFields.map((field) => `  [${JSON.stringify(field.name)}, ${field.file ? `File.open(${JSON.stringify(field.value)}, "rb")` : JSON.stringify(field.value)}],`).join("\n")}\n]\nrequest.set_form(form, "multipart/form-data")` : request.body ? `request.body = ${JSON.stringify(request.body)}` : "";
    return `require "net/http"\nrequire "uri"\n\nuri = URI(${JSON.stringify(request.url)})\nrequest = Net::HTTPGenericRequest.new(${JSON.stringify(request.method)}, ${!["GET", "HEAD"].includes(request.method)}, ${request.method !== "HEAD"}, uri.request_uri)\n${Object.entries(headers).filter(([key]) => !(formFields.length && key.toLowerCase() === "content-type")).map(([key, value]) => `request[${JSON.stringify(key)}] = ${JSON.stringify(value)}`).join("\n")}\n${rubyBody}\nhttp = Net::HTTP.new(uri.host, uri.port)\nhttp.use_ssl = uri.scheme == "https"${request.connectTimeout ? `\nhttp.open_timeout = ${request.connectTimeout}` : ""}${timeoutSeconds ? `\nhttp.read_timeout = ${timeoutSeconds}` : ""}\nresponse = http.request(request)\nraise "HTTP #{response.code}: #{response.body}" unless response.is_a?(Net::HTTPSuccess)\nputs response.body${request.followRedirects ? "\n# Net::HTTP does not follow redirects automatically; repeat the request with response['location'] when needed." : ""}`;
  }
  if (language === "rust") {
    const rustForm = formFields.length ? `let form = reqwest::blocking::multipart::Form::new()${regularFields.map((field) => `\n        .text(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)})`).join("")}${fileFields.map((field) => `\n        .file(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)})?`).join("")};` : "";
    const rustPayload = formFields.length ? ".multipart(form)" : request.body ? `.body(${JSON.stringify(request.body)})` : "";
    return `use reqwest::blocking::Client;\nuse reqwest::redirect::Policy;\nuse std::error::Error;${timeoutSeconds || request.connectTimeout ? "\nuse std::time::Duration;" : ""}\n\nfn main() -> Result<(), Box<dyn Error>> {\n    ${rustForm ? `${rustForm}\n    ` : ""}let client = Client::builder()\n        .redirect(Policy::${request.followRedirects ? "limited(10)" : "none()"})${request.connectTimeout ? `\n        .connect_timeout(Duration::from_millis(${Math.ceil(request.connectTimeout * 1000)}))` : ""}${timeoutSeconds ? `\n        .timeout(Duration::from_millis(${Math.ceil(timeoutSeconds * 1000)}))` : ""}\n        .build()?;\n    let response = client\n        .request(reqwest::Method::from_bytes(${JSON.stringify(request.method)}.as_bytes())?, ${JSON.stringify(request.url)})${Object.entries(headers).filter(([key]) => !(formFields.length && key.toLowerCase() === "content-type")).map(([key, value]) => `\n        .header(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join("")}${rustPayload ? `\n        ${rustPayload}` : ""}\n        .send()?\n        .error_for_status()?;\n    println!("{}", response.text()?);\n    Ok(())\n}`;
  }
  if (language === "kotlin") {
    const contentType = Object.entries(headers).find(([key]) => key.toLowerCase() === "content-type")?.[1] || "text/plain; charset=utf-8";
    const kotlinBody = formFields.length ? `val body = MultipartBody.Builder().setType(MultipartBody.FORM)${regularFields.map((field) => `\n    .addFormDataPart(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)})`).join("")}${fileFields.map((field) => `\n    .addFormDataPart(${JSON.stringify(field.name)}, File(${JSON.stringify(field.value)}).name, File(${JSON.stringify(field.value)}).asRequestBody("application/octet-stream".toMediaType()))`).join("")}\n    .build()` : request.body ? `val body = ${JSON.stringify(request.body)}.toRequestBody(${JSON.stringify(contentType)}.toMediaType())` : "val body: RequestBody? = null";
    return `import okhttp3.*\nimport okhttp3.MediaType.Companion.toMediaType\nimport okhttp3.RequestBody.Companion.asRequestBody\nimport okhttp3.RequestBody.Companion.toRequestBody\n${fileFields.length ? "import java.io.File\n" : ""}${timeoutSeconds || request.connectTimeout ? "import java.util.concurrent.TimeUnit\n" : ""}\n${kotlinBody}\nval client = OkHttpClient.Builder()${request.followRedirects ? "" : "\n    .followRedirects(false)\n    .followSslRedirects(false)"}${request.connectTimeout ? `\n    .connectTimeout(${Math.ceil(request.connectTimeout * 1000)}, TimeUnit.MILLISECONDS)` : ""}${timeoutSeconds ? `\n    .callTimeout(${Math.ceil(timeoutSeconds * 1000)}, TimeUnit.MILLISECONDS)` : ""}\n    .build()\nval request = Request.Builder()\n    .url(${JSON.stringify(request.url)})\n    .method(${JSON.stringify(request.method)}, ${["GET", "HEAD"].includes(request.method) && !request.body && !formFields.length ? "null" : "body"})${Object.entries(headers).filter(([key]) => !(formFields.length && key.toLowerCase() === "content-type")).map(([key, value]) => `\n    .addHeader(${JSON.stringify(key)}, ${JSON.stringify(value)})`).join("")}\n    .build()\nclient.newCall(request).execute().use { response ->\n    check(response.isSuccessful) { "HTTP ${'$'}{response.code}" }\n    println(response.body?.string().orEmpty())\n}`;
  }
  const signal = timeoutSeconds ? `AbortSignal.timeout(${Math.ceil(timeoutSeconds * 1000)})` : null;
  const jsForm = formFields.length ? `const form = new FormData();\n${formFields.map((field) => field.file ? `form.append(${JSON.stringify(field.name)}, fileInput.files[0]); // ${field.value}` : `form.append(${JSON.stringify(field.name)}, ${JSON.stringify(field.value)});`).join("\n")}\n\n` : "";
  if (language === "javascript") return `${jsForm}const response = await fetch(${JSON.stringify(request.url)}, {\n  method: ${JSON.stringify(request.method)},\n  headers: ${JSON.stringify(headers, null, 2)}${request.body ? `,\n  body: ${JSON.stringify(request.body)}` : formFields.length ? `,\n  body: form` : ""},\n  redirect: ${JSON.stringify(request.followRedirects ? "follow" : "manual")}${signal ? `,\n  signal: ${signal}` : ""}\n});\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconsole.log(await response.text());`;
  throw new Error(`Unsupported target language: ${language}`);
}

function parseFormField(value) {
  const at = value.indexOf("=");
  const name = (at < 0 ? value : value.slice(0, at)).trim();
  const raw = at < 0 ? "" : value.slice(at + 1);
  return { name, value: raw.startsWith("@") ? raw.slice(1) : raw, file: raw.startsWith("@") };
}

const DOCKER_LIST_FIELDS = Object.freeze([
  "ports", "env_file", "volumes", "networks", "labels", "expose", "extra_hosts", "dns", "dns_search",
  "cap_add", "cap_drop", "security_opt", "devices", "tmpfs", "group_add", "links", "volumes_from", "sysctls", "storage_opt",
]);

function dockerCommandTokens(command) {
  return shellTokens(String(command || "").replace(/(?:\\|`|\^)\s*\r?\n/g, " "));
}

function dockerServiceName(value) {
  const name = String(value || "app").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) throw new Error("Service name may only contain letters, numbers, dots, underscores, and hyphens");
  return name;
}

function inferredDockerServiceName(service) {
  if (service.container_name) return dockerServiceName(service.container_name);
  const image = String(service.image || "").split("@")[0].split("/").at(-1)?.split(":")[0] || "app";
  const normalized = image.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return dockerServiceName(normalized || "app");
}

function dockerEnvironmentMap(values) {
  const environment = {};
  for (const raw of values) {
    const value = String(raw); const at = value.indexOf("=");
    const key = at < 0 ? value : value.slice(0, at);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
    environment[key] = at < 0 ? null : value.slice(at + 1);
  }
  return environment;
}

export function dockerRunToCompose(command, { serviceName = "" } = {}) {
  const tokens = dockerCommandTokens(command);
  let start = 2;
  if (tokens[0] === "sudo") { tokens.shift(); }
  if (tokens[0] !== "docker") throw new Error("Command must start with docker run");
  if (tokens[1] === "container" && tokens[2] === "run") start = 3;
  else if (tokens[1] !== "run") throw new Error("Command must start with docker run");
  const service = Object.fromEntries(DOCKER_LIST_FIELDS.map((key) => [key, []]));
  Object.assign(service, { image: "", command: [], environment: [], logging: {}, ulimits: {} });
  const diagnostics = [];
  let optionsEnded = false;
  for (let i = start; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (service.image) { service.command.push(token); continue; }
    if (token === "--") { optionsEnded = true; continue; }
    if (optionsEnded) { service.image = token; continue; }
    const take = (longName) => { const next = optionValue(tokens, i, token, longName); i = next.index; return next.value; };
    if (["-p", "--publish"].includes(token) || token.startsWith("--publish=")) service.ports.push(take("--publish"));
    else if (["-e", "--env"].includes(token) || token.startsWith("--env=")) service.environment.push(take("--env"));
    else if (token === "--env-file" || token.startsWith("--env-file=")) service.env_file.push(take("--env-file"));
    else if (["-v", "--volume"].includes(token) || token.startsWith("--volume=")) service.volumes.push(take("--volume"));
    else if (token === "--name" || token.startsWith("--name=")) service.container_name = take("--name");
    else if (token === "--restart" || token.startsWith("--restart=")) service.restart = take("--restart");
    else if (token === "--network" || token.startsWith("--network=")) {
      const network = take("--network");
      if (["host", "none", "bridge"].includes(network) || network.startsWith("container:")) service.network_mode = network;
      else service.networks.push(network);
    }
    else if (["-w", "--workdir"].includes(token) || token.startsWith("--workdir=")) service.working_dir = take("--workdir");
    else if (["-u", "--user"].includes(token) || token.startsWith("--user=")) service.user = take("--user");
    else if (["-h", "--hostname"].includes(token) || token.startsWith("--hostname=")) service.hostname = take("--hostname");
    else if (token === "--entrypoint" || token.startsWith("--entrypoint=")) service.entrypoint = take("--entrypoint");
    else if (token === "--add-host" || token.startsWith("--add-host=")) (service.extra_hosts ||= []).push(take("--add-host"));
    else if (token === "--mount" || token.startsWith("--mount=")) { const mount = normalizeDockerMount(take("--mount")); if (mount.startsWith("tmpfs:")) service.tmpfs.push(mount.slice(6)); else service.volumes.push(mount); }
    else if (token === "--dns" || token.startsWith("--dns=")) service.dns.push(take("--dns"));
    else if (token === "--dns-search" || token.startsWith("--dns-search=")) service.dns_search.push(take("--dns-search"));
    else if (token === "--cap-add" || token.startsWith("--cap-add=")) service.cap_add.push(take("--cap-add"));
    else if (token === "--cap-drop" || token.startsWith("--cap-drop=")) service.cap_drop.push(take("--cap-drop"));
    else if (token === "--security-opt" || token.startsWith("--security-opt=")) service.security_opt.push(take("--security-opt"));
    else if (token === "--device" || token.startsWith("--device=")) service.devices.push(take("--device"));
    else if (token === "--tmpfs" || token.startsWith("--tmpfs=")) service.tmpfs.push(take("--tmpfs"));
    else if (token === "--group-add" || token.startsWith("--group-add=")) service.group_add.push(take("--group-add"));
    else if (token === "--link" || token.startsWith("--link=")) service.links.push(take("--link"));
    else if (token === "--volumes-from" || token.startsWith("--volumes-from=")) service.volumes_from.push(take("--volumes-from"));
    else if (token === "--sysctl" || token.startsWith("--sysctl=")) service.sysctls.push(take("--sysctl"));
    else if (token === "--storage-opt" || token.startsWith("--storage-opt=")) service.storage_opt.push(take("--storage-opt"));
    else if (token === "--ulimit" || token.startsWith("--ulimit=")) {
      const value = take("--ulimit");
      const at = value.indexOf("=");
      if (at < 1) throw new Error("--ulimit must use name=value or name=soft:hard");
      const name = value.slice(0, at); const limits = value.slice(at + 1).split(":");
      service.ulimits[name] = limits.length > 1 ? { soft: Number(limits[0]), hard: Number(limits[1]) } : Number(limits[0]);
      if (Object.values(typeof service.ulimits[name] === "object" ? service.ulimits[name] : { value: service.ulimits[name] }).some((item) => !Number.isInteger(item) || item < -1)) throw new Error("--ulimit values must be integers greater than or equal to -1");
    }
    else if (token === "--shm-size" || token.startsWith("--shm-size=")) service.shm_size = take("--shm-size");
    else if (token === "--memory" || token === "-m" || token.startsWith("--memory=")) service.mem_limit = take("--memory");
    else if (token === "--cpus" || token.startsWith("--cpus=")) service.cpus = take("--cpus");
    else if (token === "--cpu-shares" || token.startsWith("--cpu-shares=")) service.cpu_shares = Number(take("--cpu-shares"));
    else if (token === "--pids-limit" || token.startsWith("--pids-limit=")) service.pids_limit = Number(take("--pids-limit"));
    else if (token === "--gpus" || token.startsWith("--gpus=")) service.gpus = take("--gpus");
    else if (token === "--pid" || token.startsWith("--pid=")) service.pid = take("--pid");
    else if (token === "--ipc" || token.startsWith("--ipc=")) service.ipc = take("--ipc");
    else if (token === "--uts" || token.startsWith("--uts=")) service.uts = take("--uts");
    else if (token === "--userns" || token.startsWith("--userns=")) service.userns_mode = take("--userns");
    else if (token === "--cgroupns" || token.startsWith("--cgroupns=")) service.cgroup = take("--cgroupns");
    else if (token === "--runtime" || token.startsWith("--runtime=")) service.runtime = take("--runtime");
    else if (token === "--domainname" || token.startsWith("--domainname=")) service.domainname = take("--domainname");
    else if (token === "--mac-address" || token.startsWith("--mac-address=")) service.mac_address = take("--mac-address");
    else if (token === "--platform" || token.startsWith("--platform=")) service.platform = take("--platform");
    else if (token === "--pull" || token.startsWith("--pull=")) service.pull_policy = take("--pull");
    else if (token === "--stop-signal" || token.startsWith("--stop-signal=")) service.stop_signal = take("--stop-signal");
    else if (token === "--stop-timeout" || token.startsWith("--stop-timeout=")) service.stop_grace_period = `${take("--stop-timeout")}s`;
    else if (token === "--health-cmd" || token.startsWith("--health-cmd=")) (service.healthcheck ||= {}).test = ["CMD-SHELL", take("--health-cmd")];
    else if (token === "--health-interval" || token.startsWith("--health-interval=")) (service.healthcheck ||= {}).interval = take("--health-interval");
    else if (token === "--health-timeout" || token.startsWith("--health-timeout=")) (service.healthcheck ||= {}).timeout = take("--health-timeout");
    else if (token === "--health-start-period" || token.startsWith("--health-start-period=")) (service.healthcheck ||= {}).start_period = take("--health-start-period");
    else if (token === "--health-start-interval" || token.startsWith("--health-start-interval=")) (service.healthcheck ||= {}).start_interval = take("--health-start-interval");
    else if (token === "--health-retries" || token.startsWith("--health-retries=")) { const retries = Number(take("--health-retries")); if (!Number.isInteger(retries) || retries < 0) throw new Error("--health-retries must be a non-negative integer"); (service.healthcheck ||= {}).retries = retries; }
    else if (token === "--no-healthcheck") service.healthcheck = { disable: true };
    else if (token === "--log-driver" || token.startsWith("--log-driver=")) service.logging.driver = take("--log-driver");
    else if (token === "--log-opt" || token.startsWith("--log-opt=")) service.logging.options ||= [], service.logging.options.push(take("--log-opt"));
    else if (token === "--read-only") service.read_only = true;
    else if (token === "--oom-kill-disable") service.oom_kill_disable = true;
    else if (token === "--privileged") service.privileged = true;
    else if (token === "--init") service.init = true;
    else if (["-i", "--interactive"].includes(token)) service.stdin_open = true;
    else if (["-t", "--tty", "-it", "-ti"].includes(token)) { service.tty = true; if (token.length > 2) service.stdin_open = true; }
    else if (["-l", "--label"].includes(token) || token.startsWith("--label=")) service.labels.push(take("--label"));
    else if (token === "--expose" || token.startsWith("--expose=")) service.expose.push(take("--expose"));
    else if (["-d", "--detach", "--rm", "-P", "--publish-all"].includes(token)) diagnostics.push(`Runtime-only option omitted: ${token}`);
    else if (["-a", "--attach", "--cidfile", "--detach-keys", "--name", "--network-alias"].includes(token)) diagnostics.push(`Option is not represented in Compose: ${token} ${take(token)}`);
    else if (token.startsWith("-")) throw new Error(`Unsupported Docker option ${token}; remove it or use a supported equivalent so its value is not mistaken for the image`);
    else service.image = token;
  }
  if (!service.image) throw new Error("Docker image is missing");
  const name = serviceName ? dockerServiceName(serviceName) : inferredDockerServiceName(service);
  const outputService = { image: service.image };
  for (const key of ["container_name", "hostname", "domainname", "mac_address", "restart", "network_mode", "working_dir", "user", "entrypoint", "mem_limit", "cpus", "cpu_shares", "pids_limit", "gpus", "shm_size", "pid", "ipc", "uts", "userns_mode", "cgroup", "runtime", "platform", "pull_policy", "stop_signal", "stop_grace_period"]) {
    if (service[key] !== undefined) outputService[key] = service[key];
  }
  for (const key of ["read_only", "privileged", "init", "stdin_open", "tty", "oom_kill_disable"]) if (service[key]) outputService[key] = true;
  for (const key of DOCKER_LIST_FIELDS) {
    const values = service[key];
    if (values.length) outputService[key] = values;
  }
  if (service.environment.length) outputService.environment = dockerEnvironmentMap(service.environment);
  if (service.healthcheck) outputService.healthcheck = service.healthcheck;
  if (Object.keys(service.ulimits).length) outputService.ulimits = service.ulimits;
  if (service.logging.driver || service.logging.options?.length) {
    outputService.logging = {};
    if (service.logging.driver) outputService.logging.driver = service.logging.driver;
    if (service.logging.options?.length) {
      outputService.logging.options = {};
      for (const option of service.logging.options) {
        const at = option.indexOf("=");
        const key = at < 0 ? option : option.slice(0, at);
        const value = at < 0 ? "" : option.slice(at + 1);
        outputService.logging.options[key] = value;
      }
    }
  }
  if (service.command.length) outputService.command = service.command;
  const document = { services: { [name]: outputService } };
  if (service.networks.length) {
    document.networks = Object.fromEntries([...new Set(service.networks)].map((network) => [network, { external: true }]));
  }
  return { output: stringifyYaml(document, { lineWidth: 0, defaultStringType: "PLAIN" }).trimEnd(), diagnostics, serviceName: name };
}

function asComposeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}=${item == null ? "" : item}`);
  return [String(value)];
}

function shellQuote(value) {
  const text = String(value);
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", `'"'"'`)}'`;
}

function composeDurationToSeconds(value) {
  const text = String(value);
  if (/^\d+(?:\.\d+)?s$/.test(text)) return text.slice(0, -1);
  return text;
}

export function composeToDockerRun(source, { serviceName = "" } = {}) {
  let document;
  try { document = parseYaml(String(source || "")); }
  catch (cause) { throw new Error(`Invalid Compose YAML: ${cause.message}`); }
  if (!document || typeof document !== "object" || !document.services || typeof document.services !== "object") throw new Error("Compose document must contain a services map");
  const names = Object.keys(document.services);
  if (!names.length) throw new Error("Compose document has no services");
  const selected = serviceName ? dockerServiceName(serviceName) : names[0];
  const service = document.services[selected];
  if (!service || typeof service !== "object") throw new Error(`Compose service not found: ${selected}`);
  if (!service.image) throw new Error(`Compose service ${selected} has no image; build-only services cannot be converted`);
  const args = ["docker", "run"];
  const diagnostics = [];
  const add = (flag, value) => { args.push(flag); if (value !== undefined) args.push(String(value)); };
  if (service.container_name) add("--name", service.container_name);
  if (service.restart) add("--restart", service.restart);
  if (service.network_mode) add("--network", service.network_mode);
  else for (const network of asComposeList(service.networks).map((item) => item.split("=")[0])) add("--network", network);
  const scalarFlags = { working_dir: "--workdir", user: "--user", hostname: "--hostname", domainname: "--domainname", mac_address: "--mac-address", entrypoint: "--entrypoint", mem_limit: "--memory", cpus: "--cpus", cpu_shares: "--cpu-shares", pids_limit: "--pids-limit", gpus: "--gpus", shm_size: "--shm-size", pid: "--pid", ipc: "--ipc", uts: "--uts", userns_mode: "--userns", cgroup: "--cgroupns", runtime: "--runtime", platform: "--platform", pull_policy: "--pull", stop_signal: "--stop-signal" };
  for (const [key, flag] of Object.entries(scalarFlags)) if (service[key] != null) add(flag, service[key]);
  const listFlags = { ports: "--publish", environment: "--env", env_file: "--env-file", volumes: "--volume", labels: "--label", expose: "--expose", extra_hosts: "--add-host", dns: "--dns", dns_search: "--dns-search", cap_add: "--cap-add", cap_drop: "--cap-drop", security_opt: "--security-opt", devices: "--device", tmpfs: "--tmpfs", group_add: "--group-add", links: "--link", volumes_from: "--volumes-from", sysctls: "--sysctl", storage_opt: "--storage-opt" };
  for (const [key, flag] of Object.entries(listFlags)) for (const value of asComposeList(service[key])) add(flag, value);
  for (const [name, value] of Object.entries(service.ulimits || {})) {
    if (value && typeof value === "object") add("--ulimit", `${name}=${value.soft}:${value.hard}`);
    else add("--ulimit", `${name}=${value}`);
  }
  if (service.read_only) add("--read-only");
  if (service.oom_kill_disable) add("--oom-kill-disable");
  if (service.privileged) add("--privileged");
  if (service.init) add("--init");
  if (service.stdin_open) add("--interactive");
  if (service.tty) add("--tty");
  if (service.healthcheck?.disable) add("--no-healthcheck");
  else if (service.healthcheck) {
    const test = service.healthcheck.test;
    if (Array.isArray(test) && test.length) {
      const kind = String(test[0]).toUpperCase();
      add("--health-cmd", kind === "CMD-SHELL" ? test.slice(1).join(" ") : test.slice(1).map(shellQuote).join(" "));
    }
    if (service.healthcheck.interval) add("--health-interval", service.healthcheck.interval);
    if (service.healthcheck.timeout) add("--health-timeout", service.healthcheck.timeout);
    if (service.healthcheck.start_period) add("--health-start-period", service.healthcheck.start_period);
    if (service.healthcheck.start_interval) add("--health-start-interval", service.healthcheck.start_interval);
    if (service.healthcheck.retries != null) add("--health-retries", service.healthcheck.retries);
  }
  if (service.logging?.driver) add("--log-driver", service.logging.driver);
  for (const value of asComposeList(service.logging?.options)) add("--log-opt", value);
  if (service.stop_grace_period) add("--stop-timeout", composeDurationToSeconds(service.stop_grace_period));
  for (const key of ["build", "depends_on", "deploy", "profiles", "secrets", "configs"]) if (service[key] != null) diagnostics.push(`Compose field cannot be fully represented by docker run: ${key}`);
  args.push(String(service.image));
  if (Array.isArray(service.command)) args.push(...service.command.map(String));
  else if (typeof service.command === "string" && service.command) { args.push("sh", "-c", service.command); diagnostics.push("String command is emitted through sh -c to preserve shell syntax"); }
  return { output: args.map(shellQuote).join(" "), diagnostics, serviceName: selected, services: names };
}

function normalizeDockerMount(value) {
  const options = Object.fromEntries(String(value).split(",").map((part) => { const at = part.indexOf("="); return at < 0 ? [part.trim(), true] : [part.slice(0, at).trim(), part.slice(at + 1).trim()]; }));
  const source = options.source || options.src;
  const target = options.target || options.dst || options.destination;
  if (!target) throw new Error("--mount requires a target");
  const suffix = options.readonly || options.ro ? ":ro" : "";
  if (options.type === "tmpfs") return `tmpfs:${target}`;
  return `${source ? `${source}:` : ""}${target}${suffix}`;
}

export function metaTags(fields) {
  const title = String(fields.title || "").trim();
  const description = String(fields.description || "").trim();
  const url = normalizeWebUrl(fields.url);
  const image = normalizeWebUrl(fields.image);
  const locale = String(fields.locale || "").trim();
  const entries = [
    ["name", "viewport", "width=device-width, initial-scale=1"], ["name", "description", description], ["name", "robots", fields.robots || "index, follow"],
    ["property", "og:title", title], ["property", "og:description", description],
    ["property", "og:image", image], ["property", "og:url", url],
    ["property", "og:type", fields.type || "website"], ["name", "twitter:card", fields.card || "summary_large_image"],
    ["name", "twitter:title", title], ["name", "twitter:description", description], ["name", "twitter:image", image],
    ["property", "og:locale", locale], ["property", "og:site_name", fields.siteName],
  ].filter(([, , value]) => value);
  const tags = ["<meta charset=\"utf-8\">", `<title>${escapeHtml(title)}</title>`, url && `<link rel="canonical" href="${escapeHtml(url)}">`, ...entries.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeHtml(value)}">`)].filter(Boolean);
  const warnings = [!title && "Missing title", title.length > 60 && "Title is longer than 60 characters", !description && "Missing description", description.length > 160 && "Description is longer than 160 characters", fields.url && !url && "Page URL must be an absolute HTTP(S) URL", fields.image && !image && "Sharing image must be an absolute HTTP(S) URL", image && !/\.(?:avif|gif|jpe?g|png|webp)(?:[?#]|$)/i.test(image) && "Sharing image URL has no recognizable image extension"].filter(Boolean);
  return { html: tags.join("\n"), warnings };
}

function normalizeWebUrl(value) {
  if (!String(value || "").trim()) return "";
  try { const url = new URL(String(value).trim()); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

export function buildPreviewDocument({ html = "", css = "", script = "", scriptEnabled = false, channel = "" } = {}) {
  const safeCss = String(css).replace(/<\/style/gi, "<\\/style");
  const safeScript = String(script).replace(/<\/script/gi, "<\\/script");
  const csp = `default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src ${scriptEnabled ? "'unsafe-inline'" : "'none'"}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  const reporter = scriptEnabled && channel ? `<script>(()=>{const send=(level,args)=>parent.postMessage({source:"dbx-playground",channel:${JSON.stringify(channel)},level,args:args.map(value=>{try{return typeof value==="string"?value:JSON.stringify(value)}catch{return String(value)}})},"*");for(const level of ["log","info","warn","error"]){const original=console[level];console[level]=(...args)=>{send(level,args);original.apply(console,args)}}addEventListener("error",event=>send("error",[event.message]));addEventListener("unhandledrejection",event=>send("error",[String(event.reason)]));})();<\/script>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${safeCss}</style></head><body>${html}${reporter}${scriptEnabled ? `<script>${safeScript}<\/script>` : ""}</body></html>`;
}

export function collectClientDiagnostics(environment = globalThis) {
  const nav = environment.navigator || {}; const screenInfo = environment.screen || {}; const doc = environment.document;
  const media = (query) => { try { return Boolean(environment.matchMedia?.(query).matches); } catch { return false; } };
  const supportsWebGl = () => {
    try {
      const canvas = doc?.createElement?.("canvas");
      return Boolean(canvas?.getContext?.("webgl") || canvas?.getContext?.("experimental-webgl"));
    } catch { return false; }
  };
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
  return {
    userAgent: nav.userAgent || "",
    language: nav.language || "",
    languages: [...(nav.languages || [])],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    platform: nav.userAgentData?.platform || nav.platform || "",
    logicalProcessors: nav.hardwareConcurrency || null,
    deviceMemoryGiB: nav.deviceMemory || null,
    touchPoints: nav.maxTouchPoints || 0,
    cookiesEnabled: nav.cookieEnabled ?? null,
    online: nav.onLine ?? null,
    screen: {
      width: screenInfo.width || null, height: screenInfo.height || null,
      availWidth: screenInfo.availWidth || null, availHeight: screenInfo.availHeight || null,
      colorDepth: screenInfo.colorDepth || null,
    },
    viewport: { width: environment.innerWidth || null, height: environment.innerHeight || null, dpr: environment.devicePixelRatio || 1 },
    localTime: new Date().toString(),
    capabilities: {
      webgl: supportsWebGl(),
      serviceWorker: "serviceWorker" in nav,
      webCrypto: Boolean(environment.crypto?.subtle),
      webAssembly: typeof environment.WebAssembly === "object",
      clipboard: Boolean(nav.clipboard),
    },
    preferences: { darkMode: media("(prefers-color-scheme: dark)"), reducedMotion: media("(prefers-reduced-motion: reduce)"), highContrast: media("(prefers-contrast: more)") },
    connection: connection ? { effectiveType: connection.effectiveType || null, downlinkMbps: connection.downlink || null, rttMs: connection.rtt || null, saveData: Boolean(connection.saveData) } : null,
    visibility: doc?.visibilityState || null,
  };
}

const KEY_LOCATIONS = Object.freeze(["standard", "left", "right", "numpad"]);

export function serializeKeyboardEvent(event) {
  const modifierState = (name) => { try { return Boolean(event.getModifierState?.(name)); } catch { return false; } };
  const target = event.target || {};
  const location = Number.isInteger(event.location) ? event.location : 0;
  return {
    type: event.type || "keydown",
    key: event.key || "",
    code: event.code || "",
    location: { value: location, name: KEY_LOCATIONS[location] || "unknown" },
    modifiers: {
      ctrl: Boolean(event.ctrlKey), alt: Boolean(event.altKey), shift: Boolean(event.shiftKey), meta: Boolean(event.metaKey),
      altGraph: modifierState("AltGraph"), capsLock: modifierState("CapsLock"), numLock: modifierState("NumLock"), scrollLock: modifierState("ScrollLock"),
    },
    repeat: Boolean(event.repeat),
    composing: Boolean(event.isComposing),
    trusted: Boolean(event.isTrusted),
    timestampMs: Number.isFinite(event.timeStamp) ? Math.round(event.timeStamp * 1000) / 1000 : null,
    propagation: { bubbles: Boolean(event.bubbles), cancelable: Boolean(event.cancelable), composed: Boolean(event.composed), defaultPrevented: Boolean(event.defaultPrevented) },
    target: {
      tag: String(target.tagName || "").toLowerCase(), type: target.type || "", id: target.id || "", contentEditable: Boolean(target.isContentEditable),
    },
    legacy: { keyCode: event.keyCode || 0, charCode: event.charCode || 0, which: event.which || 0 },
  };
}

const WINDOWS_VERSIONS = Object.freeze({
  "10.0": "10 / 11", "6.4": "10 Technical Preview", "6.3": "8.1", "6.2": "8",
  "6.1": "7", "6.0": "Vista", "5.2": "XP x64", "5.1": "XP", "5.0": "2000",
});

function matchVersion(source, pattern) {
  const match = source.match(pattern);
  return match ? match[1].replace(/_/g, ".") : "";
}

export function parseUserAgent(value) {
  const userAgent = String(value || "").trim();
  if (!userAgent) throw new Error("Enter a User-Agent string");

  let browser = { name: "Unknown", version: "" };
  const browserMatchers = [
    ["Edge", /(?:EdgA|EdgiOS|Edg)\/([\d.]+)/], ["Opera", /(?:OPR|Opera)\/([\d.]+)/],
    ["Samsung Internet", /SamsungBrowser\/([\d.]+)/], ["Firefox", /(?:FxiOS|Firefox)\/([\d.]+)/],
    ["Chrome", /(?:CriOS|Chrome)\/([\d.]+)/], ["Internet Explorer", /(?:MSIE\s|IEMobile\/)([\d.]+)/],
    ["Internet Explorer", /Trident\/.+?rv:([\d.]+)/], ["Safari", /Version\/([\d.]+).+Safari\//],
  ];
  for (const [name, pattern] of browserMatchers) {
    const version = matchVersion(userAgent, pattern);
    if (version) { browser = { name, version }; break; }
  }

  let os = { name: "Unknown", version: "" };
  const windows = userAgent.match(/Windows NT\s([\d.]+)/);
  const android = matchVersion(userAgent, /Android\s([\d._]+)/);
  const ios = matchVersion(userAgent, /(?:CPU (?:iPhone )?OS|iPhone OS)\s([\d_]+)/);
  const macos = matchVersion(userAgent, /Mac OS X\s([\d_]+)/);
  if (windows) os = { name: "Windows", version: WINDOWS_VERSIONS[windows[1]] || windows[1] };
  else if (android) os = { name: "Android", version: android };
  else if (ios) os = { name: "iOS", version: ios };
  else if (/CrOS\s/i.test(userAgent)) os = { name: "Chrome OS", version: matchVersion(userAgent, /CrOS\s\S+\s([\d.]+)/) };
  else if (macos) os = { name: "macOS", version: macos };
  else if (/Linux/i.test(userAgent)) os = { name: "Linux", version: "" };

  const isBot = /bot|crawler|spider|slurp|bingpreview|headlesschrome/i.test(userAgent);
  const isTablet = /iPad|Tablet|PlayBook|Silk\//i.test(userAgent) || (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
  const isMobile = !isTablet && /Mobi|iPhone|iPod|IEMobile|Windows Phone/i.test(userAgent);
  let device = { type: isBot ? "bot" : isTablet ? "tablet" : isMobile ? "mobile" : "desktop", vendor: "", model: "" };
  if (/iPad/i.test(userAgent)) device = { ...device, vendor: "Apple", model: "iPad" };
  else if (/iPhone/i.test(userAgent)) device = { ...device, vendor: "Apple", model: "iPhone" };
  else if (/iPod/i.test(userAgent)) device = { ...device, vendor: "Apple", model: "iPod" };
  else if (/Windows Phone/i.test(userAgent)) device = { ...device, vendor: "Microsoft", model: "Windows Phone" };
  else if (/Android/i.test(userAgent)) {
    const model = userAgent.match(/Android[^;)]*;\s*(?:[a-z]{2}(?:[-_]\w+)?;\s*)?([^;)]+?)(?:\s+Build(?:\/|;)|;\s*wv|\))/i)?.[1]?.trim() || "";
    const vendor = /\bSM-|SAMSUNG/i.test(model) ? "Samsung" : /\b(?:Pixel|Nexus)\b/i.test(model) ? "Google" : /\b(?:HUAWEI|HONOR)\b/i.test(model) ? "Huawei" : /\b(?:Mi|Redmi|MIX)\b/i.test(model) ? "Xiaomi" : "";
    device = { ...device, vendor, model };
  }

  const isIosBrowser = /(?:iPhone|iPad|iPod)/i.test(userAgent);
  const engine = /Trident/i.test(userAgent) ? "Trident" : isIosBrowser && /AppleWebKit/i.test(userAgent) ? "WebKit" : browser.name === "Firefox" ? "Gecko" : browser.name === "Safari" ? "WebKit" : ["Chrome", "Edge", "Opera", "Samsung Internet"].includes(browser.name) ? "Blink" : /AppleWebKit/i.test(userAgent) ? "WebKit" : "Unknown";
  const engineVersion = engine === "Trident" ? matchVersion(userAgent, /Trident\/([\d.]+)/)
    : engine === "Gecko" ? matchVersion(userAgent, /rv:([\d.]+)/)
      : engine === "WebKit" ? matchVersion(userAgent, /AppleWebKit\/([\d.]+)/)
        : engine === "Blink" ? matchVersion(userAgent, /(?:Chrome|Chromium)\/([\d.]+)/) : "";
  const engineVersionSource = engine === "Blink" && engineVersion ? "Chromium" : engine === "Gecko" && engineVersion ? "rv" : engine === "WebKit" && engineVersion ? "AppleWebKit" : engine === "Trident" && engineVersion ? "Trident" : "";
  const architecture = /(?:arm64|aarch64)/i.test(userAgent) ? "ARM64" : /(?:x86_64|Win64|WOW64|amd64)/i.test(userAgent) ? "x64" : /(?:i[3-6]86|x86)/i.test(userAgent) ? "x86" : /\barm\b/i.test(userAgent) ? "ARM" : "Unknown";
  return { userAgent, browser, engine, engineVersion, engineVersionSource, os, device, architecture };
}

const FIRST_NAMES = ["Alex", "Morgan", "Taylor", "Jordan", "Casey", "Riley", "Avery", "Jamie"];
const LAST_NAMES = ["Chen", "Smith", "Garcia", "Kim", "Patel", "Brown", "Martin", "Lee"];
const FAKE_TYPES = new Set(["name", "firstName", "lastName", "username", "email", "phone", "company", "date", "datetime", "uuid", "boolean", "integer", "number", "amount", "url", "ipv4", "sentence"]);
export function parseFakeFields(fields) {
  const list = Array.isArray(fields) ? fields : String(fields || "").split(",");
  if (!list.length || list.length > 50) throw new Error("Choose between 1 and 50 fields");
  const seen = new Set();
  return list.map((input) => {
    const raw = String(input).trim(); const at = raw.indexOf(":"); const name = (at < 0 ? raw : raw.slice(0, at)).trim();
    if (!/^[A-Za-z_][\w.-]{0,63}$/.test(name)) throw new Error(`Invalid field name: ${name || raw}`);
    if (seen.has(name)) throw new Error(`Duplicate field name: ${name}`); seen.add(name);
    const requested = at < 0 ? name : raw.slice(at + 1).trim();
    const type = FAKE_TYPES.has(requested) ? requested : inferFakeType(name);
    if (at >= 0 && !FAKE_TYPES.has(requested)) throw new Error(`Unsupported fake data type: ${requested}`);
    return { name, type };
  });
}

function inferFakeType(name) {
  const key = name.toLowerCase();
  if (key === "id" || key.endsWith("_id")) return "integer";
  if (key.includes("email")) return "email"; if (key.includes("phone") || key.includes("mobile")) return "phone";
  if (key.includes("company") || key.includes("organization")) return "company"; if (key.includes("uuid")) return "uuid";
  if (key.includes("datetime") || key.includes("created") || key.includes("updated")) return "datetime"; if (key.includes("date")) return "date";
  if (key.includes("price") || key.includes("amount") || key.includes("total")) return "amount"; if (key.includes("url") || key.includes("website")) return "url";
  if (key.includes("active") || key.startsWith("is_") || key.startsWith("has_")) return "boolean"; if (key.includes("name")) return key.includes("first") ? "firstName" : key.includes("last") ? "lastName" : "name";
  return "sentence";
}

export function generateFakeRows(count = 10, fields = ["name", "email", "company", "date", "uuid"], options = {}) {
  const requested = Number(count);
  if (!Number.isInteger(requested) || requested < 1 || requested > 1000) throw new Error("Row count must be an integer between 1 and 1000");
  const total = requested;
  const descriptors = parseFakeFields(fields);
  const random = seededRandom(options.seed ?? "dbx-toolbox");
  return Array.from({ length: total }, (_, index) => {
    const first = FIRST_NAMES[Math.floor(random() * FIRST_NAMES.length)]; const last = LAST_NAMES[Math.floor(random() * LAST_NAMES.length)];
    return Object.fromEntries(descriptors.map(({ name, type }) => [name, fakeValue(type, { first, last, index, random })]));
  });
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) { state ^= char.codePointAt(0); state = Math.imul(state, 16777619); }
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}

function fakeValue(type, { first, last, index, random }) {
  const number = index + 1;
  if (type === "name") return `${first} ${last}`; if (type === "firstName") return first; if (type === "lastName") return last;
  if (type === "username") return `${first}.${last}${number}`.toLowerCase(); if (type === "email") return `${first}.${last}.${number}@example.invalid`.toLowerCase();
  if (type === "phone") return `+1 202 555 ${String(1000 + number % 9000).padStart(4, "0")}`; if (type === "company") return `Example Company ${number}`;
  const date = new Date(Date.UTC(2024, 0, 1 + index)); if (type === "date") return date.toISOString().slice(0, 10); if (type === "datetime") return date.toISOString();
  if (type === "boolean") return random() >= .5; if (type === "integer") return Math.floor(random() * 10_000); if (type === "number") return Math.round(random() * 100_000) / 100;
  if (type === "amount") return (Math.round(random() * 1_000_000) / 100).toFixed(2); if (type === "url") return `https://example.invalid/items/${number}`;
  if (type === "ipv4") return `192.0.2.${1 + index % 253}`; if (type === "uuid") return fakeUuid(random);
  return `Synthetic sample ${number}`;
}

function fakeUuid(random) {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256)); bytes[6] = bytes[6] & 0x0f | 0x40; bytes[8] = bytes[8] & 0x3f | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(""); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function rowsToDelimited(rows, delimiter = ",") {
  if (!rows.length) return ""; const keys = Object.keys(rows[0]);
  const quote = (value) => { const text = String(value ?? ""); return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
  return [keys.join(delimiter), ...rows.map((row) => keys.map((key) => quote(row[key])).join(delimiter))].join("\n");
}

export function parseChartData(text) {
  const source = String(text || "").trim(); if (!source) return [];
  if (source.startsWith("[") || source.startsWith("{")) {
    const parsed = JSON.parse(source); const rows = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([label, value]) => ({ label, value }));
    return rows.map((row, index) => ({ label: String(row.label ?? row.name ?? index + 1), value: Number(row.value ?? row.y ?? 0) })).filter((row) => Number.isFinite(row.value));
  }
  const delimiter = source.includes("\t") ? "\t" : source.includes(";") && !source.includes(",") ? ";" : ",";
  return parseDelimitedText(source, delimiter).filter((parts) => parts.length >= 2 && Number.isFinite(Number(parts[1]))).map(([label, value]) => ({ label: label.trim(), value: Number(value) }));
}

function parseDelimitedText(source, delimiter) {
  const rows = []; let row = []; let value = ""; let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) { if (char === '"' && source[index + 1] === '"') { value += '"'; index += 1; } else if (char === '"') quoted = false; else value += char; continue; }
    if (char === '"' && !value) { quoted = true; continue; }
    if (char === delimiter) { row.push(value); value = ""; continue; }
    if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; continue; }
    value += char;
  }
  if (quoted) throw new Error("Delimited data contains an unclosed quoted field");
  row.push(value.replace(/\r$/, "")); rows.push(row); return rows;
}

function chartLinePath(points, smooth = false) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (!smooth) return `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")}`;
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const before = points[index - 1] || points[index];
    const current = points[index];
    const next = points[index + 1];
    const after = points[index + 2] || next;
    const cp1x = current.x + (next.x - before.x) / 6;
    const cp1y = current.y + (next.y - before.y) / 6;
    const cp2x = next.x - (after.x - current.x) / 6;
    const cp2y = next.y - (after.y - current.y) / 6;
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }
  return path;
}

function shortChartLabel(label, max = 16) {
  const chars = Array.from(String(label));
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

export function chartSvg(rows, type = "bar", width = 900, height = 520, options = {}) {
  const data = rows.length ? rows : [{ label: "No data", value: 0 }];
  const title = String(options.title || "Chart");
  const requestedColor = /^#[\da-f]{6}$/i.test(options.color || "") ? options.color : "#0f9688";
  const color = type === "pie" ? "#15988f" : requestedColor;
  const smooth = Boolean(options.smooth);
  const donut = Boolean(options.donut);
  const showValues = options.showValues !== false;
  const showPoints = options.showPoints !== false;
  const showLabels = options.showLabels !== false;
  const showLegend = options.showLegend !== false;
  const showGrid = options.showGrid !== false;
  const transparent = Boolean(options.transparent);
  const pieLabel = ["category", "value", "percent"].includes(options.pieLabel) ? options.pieLabel : "category";
  const pad = { top: 76, right: 34, bottom: 58, left: 62 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  let minValue = Math.min(0, ...data.map((row) => row.value));
  let maxValue = Math.max(0, ...data.map((row) => row.value));
  if (minValue === maxValue) maxValue = minValue + 1;
  const valueRange = maxValue - minValue;
  const step = innerW / data.length;
  const y = (value) => pad.top + (maxValue - value) / valueRange * innerH;
  const zeroY = y(0);
  const pointModels = data.map((row, i) => ({ x: pad.left + step * (i + .5), y: y(row.value) }));
  const hitAttributes = (row, index, markColor, xPos, yPos, guide = "vertical", plot = pad, extra = "") => `class="chart-hit" style="color:${markColor}" data-chart-hit data-chart-index="${index}" data-chart-label="${escapeHtml(row.label)}" data-chart-value="${row.value}" data-chart-color="${markColor}" data-chart-x="${xPos}" data-chart-y="${yPos}" data-chart-guide="${guide}" data-chart-plot-left="${plot.left}" data-chart-plot-top="${plot.top}" data-chart-plot-right="${width - plot.right}" data-chart-plot-bottom="${height - plot.bottom}" tabindex="0" role="img" aria-label="${escapeHtml(row.label)}: ${row.value}"${extra}`;
  const linePath = chartLinePath(pointModels, smooth);
  const grid = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    const yPos = pad.top + innerH * ratio;
    const value = Math.round((maxValue - valueRange * ratio) * 100) / 100;
    const line = showGrid ? `<line x1="${pad.left}" y1="${yPos}" x2="${pad.left + innerW}" y2="${yPos}" stroke="#e7e2da" stroke-width="1"/>` : "";
    return `${line}<text x="${pad.left - 12}" y="${yPos + 4}" text-anchor="end" font-size="12" fill="#78716c">${value}</text>`;
  }).join("");
  let marks = "";
  let labels = "";
  if (type === "line" || type === "area") {
    const first = pointModels[0]; const last = pointModels[pointModels.length - 1];
    const area = type === "area" ? `<path d="${linePath} L ${last.x} ${zeroY} L ${first.x} ${zeroY} Z" fill="url(#chart-area)"/>` : "";
    const dots = data.map((row, i) => {
      const point = pointModels[i];
      const visiblePoint = showPoints ? `<circle class="chart-mark" cx="${point.x}" cy="${point.y}" r="4" fill="white" stroke="${color}" stroke-width="3"/>` : "";
      return `<g ${hitAttributes(row, i, color, point.x, point.y)}><circle class="chart-hit-target" cx="${point.x}" cy="${point.y}" r="12" fill="currentColor" fill-opacity="0" pointer-events="all"/>${visiblePoint}</g>`;
    }).join("");
    const values = showValues ? data.map((row, i) => `<text x="${pointModels[i].x}" y="${pointModels[i].y + (row.value < 0 ? 19 : -11)}" text-anchor="middle" font-size="11" font-weight="600" fill="#57534e">${row.value}</text>`).join("") : "";
    marks = `${area}<path d="${linePath}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${values}`;
  } else if (type === "pie") {
    const pieData = data.filter((row) => row.value > 0);
    const slices = pieData.length ? pieData : [{ label: "No data", value: 1 }];
    const total = slices.reduce((sum, row) => sum + row.value, 0);
    const palette = [color, "#19b3a5", "#2ec9ba", "#f59e0b", "#3b82f6", "#8b5cf6", "#ef6a67", "#84a83f"];
    const sliceColor = (index) => palette[index % palette.length];
    const shortLabel = (label, max = 16) => {
      const chars = Array.from(String(label));
      return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
    };
    const cx = width / 2; const cy = 232; const radius = Math.min(145, innerH * .42); let at = -Math.PI / 2;
    const models = slices.map((row, index) => {
      const angle = row.value / total * Math.PI * 2;
      const model = { row, index, start: at, end: at + angle, mid: at + angle / 2, angle };
      at += angle;
      return model;
    });
    marks = models.map(({ row, index, start, end, angle }) => {
      const x1 = cx + Math.cos(start) * radius; const y1 = cy + Math.sin(start) * radius;
      const x2 = cx + Math.cos(end) * radius; const y2 = cy + Math.sin(end) * radius;
      const large = angle > Math.PI ? 1 : 0; const fill = sliceColor(index);
      const path = angle >= Math.PI * 2 - .0001
        ? `<circle class="chart-mark" cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="#fbf9f6" stroke-width="2"/>`
        : `<path class="chart-mark" d="M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z" fill="${fill}" stroke="#fbf9f6" stroke-width="2" stroke-linejoin="round"/>`;
      const anchorX = cx + Math.cos((start + end) / 2) * radius * .68;
      const anchorY = cy + Math.sin((start + end) / 2) * radius * .68;
      const percent = Math.round(row.value / total * 1000) / 10;
      return `<g ${hitAttributes(row, index, fill, anchorX, anchorY, "none", pad, ` data-chart-percent="${percent}"`)}>${path}</g>`;
    }).join("");
    if (donut) marks = `<g mask="url(#chart-donut-mask)">${marks}</g>`;
    const labelModels = models.map((model) => ({
      ...model,
      side: Math.cos(model.mid) >= 0 ? 1 : -1,
      labelY: cy + Math.sin(model.mid) * (radius + 24),
    }));
    for (const side of [-1, 1]) {
      const sideLabels = labelModels.filter((item) => item.side === side).sort((a, b) => a.labelY - b.labelY);
      const minY = cy - radius - 8; const maxY = cy + radius + 8; const gap = 22;
      sideLabels.forEach((item, index) => { item.labelY = Math.max(item.labelY, index ? sideLabels[index - 1].labelY + gap : minY); });
      for (let index = sideLabels.length - 1; index >= 0; index -= 1) {
        const ceiling = index === sideLabels.length - 1 ? maxY : sideLabels[index + 1].labelY - gap;
        sideLabels[index].labelY = Math.min(sideLabels[index].labelY, ceiling);
      }
    }
    const callouts = showLabels ? labelModels.map(({ row, mid, side, labelY }) => {
      const edgeX = cx + Math.cos(mid) * (radius + 2); const edgeY = cy + Math.sin(mid) * (radius + 2);
      const elbowX = cx + side * (radius + 25); const lineEndX = cx + side * (radius + 58);
      const textX = lineEndX + side * 7; const anchor = side > 0 ? "start" : "end";
      const percent = `${Math.round(row.value / total * 1000) / 10}%`;
      const content = pieLabel === "value" ? `${shortLabel(row.label, 11)} · ${row.value}` : pieLabel === "percent" ? `${shortLabel(row.label, 11)} · ${percent}` : shortLabel(row.label);
      return `<polyline points="${edgeX},${edgeY} ${elbowX},${labelY} ${lineEndX},${labelY}" fill="none" stroke="#d8d0c5" stroke-width="1"/><text x="${textX}" y="${labelY + 4}" text-anchor="${anchor}" font-size="12" fill="#78716c">${escapeHtml(content)}</text>`;
    }).join("") : "";
    const legendItems = models.map(({ row, index }) => ({ label: shortLabel(row.label, 12), color: sliceColor(index) }));
    const legendWidths = legendItems.map((item) => 27 + Array.from(item.label).length * 7);
    const legendRows = [[]];
    legendItems.forEach((item, index) => {
      const row = legendRows[legendRows.length - 1];
      const used = row.reduce((sum, entry) => sum + entry.width + 10, 0);
      if (row.length && used + legendWidths[index] > width - 80) legendRows.push([]);
      legendRows[legendRows.length - 1].push({ ...item, width: legendWidths[index] });
    });
    const legend = showLegend ? legendRows.map((row, rowIndex) => {
      const rowWidth = row.reduce((sum, item) => sum + item.width, 0) + Math.max(0, row.length - 1) * 10;
      let legendX = (width - rowWidth) / 2;
      const legendY = height - 22 - (legendRows.length - 1 - rowIndex) * 24;
      return row.map((item) => {
        const itemX = legendX; legendX += item.width + 10;
        return `<circle cx="${itemX + 6}" cy="${legendY - 4}" r="6" fill="${item.color}"/><text x="${itemX + 19}" y="${legendY}" font-size="12" fill="#78716c">${escapeHtml(item.label)}</text>`;
      }).join("");
    }).join("") : "";
    labels = `${callouts}${legend}`;
  } else if (type === "horizontal-bar") {
    const hPad = { top: 72, right: 62, bottom: 48, left: 142 };
    const hInnerW = width - hPad.left - hPad.right;
    const hInnerH = height - hPad.top - hPad.bottom;
    const band = hInnerH / data.length;
    const x = (value) => hPad.left + (value - minValue) / valueRange * hInnerW;
    const zeroX = x(0);
    const hGrid = Array.from({ length: 6 }, (_, index) => {
      const ratio = index / 5; const xPos = hPad.left + hInnerW * ratio;
      const value = Math.round((minValue + valueRange * ratio) * 100) / 100;
      const line = showGrid ? `<line x1="${xPos}" y1="${hPad.top}" x2="${xPos}" y2="${hPad.top + hInnerH}" stroke="#e7e2da" stroke-width="1"/>` : "";
      return `${line}<text x="${xPos}" y="${height - 21}" text-anchor="middle" font-size="12" fill="#78716c">${value}</text>`;
    }).join("");
    marks = data.map((row, index) => {
      const valueX = x(row.value); const barX = Math.min(zeroX, valueX); const barW = Math.max(1, Math.abs(valueX - zeroX));
      const barH = Math.min(38, band * .56); const barY = hPad.top + index * band + (band - barH) / 2;
      const valueText = showValues ? `<text x="${valueX + (row.value < 0 ? -8 : 8)}" y="${barY + barH / 2 + 4}" text-anchor="${row.value < 0 ? "end" : "start"}" font-size="11" font-weight="600" fill="#57534e">${row.value}</text>` : "";
      return `<g ${hitAttributes(row, index, color, valueX, barY + barH / 2, "horizontal", hPad)}><rect class="chart-mark" x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="5" fill="url(#chart-bar-horizontal)"/>${valueText}</g>`;
    }).join("");
    labels = data.map((row, index) => `<text x="${hPad.left - 12}" y="${hPad.top + band * (index + .5) + 4}" text-anchor="end" font-size="12" fill="#78716c">${escapeHtml(shortChartLabel(row.label, 17))}</text>`).join("");
    marks = `${hGrid}<line x1="${zeroX}" y1="${hPad.top}" x2="${zeroX}" y2="${hPad.top + hInnerH}" stroke="#aaa198"/>${marks}`;
  } else {
    marks = data.map((row, i) => {
      const valueY = y(row.value); const top = Math.min(zeroY, valueY); const h = Math.max(1, Math.abs(valueY - zeroY));
      const barW = Math.min(94, Math.max(8, step * .52));
      const x = pad.left + i * step + (step - barW) / 2;
      const valueText = showValues ? `<text x="${x + barW / 2}" y="${row.value < 0 ? top + h + 16 : Math.max(pad.top + 13, top - 8)}" text-anchor="middle" font-size="12" font-weight="600" fill="#57534e">${row.value}</text>` : "";
      return `<g ${hitAttributes(row, i, color, x + barW / 2, valueY)}><rect class="chart-mark" x="${x}" y="${top}" width="${barW}" height="${h}" rx="5" fill="url(#chart-bar)"/>${valueText}</g>`;
    }).join("");
  }
  if (type !== "pie" && type !== "horizontal-bar") labels = data.map((row, i) => `<text x="${pad.left + step * (i + .5)}" y="${height - 24}" text-anchor="middle" font-size="12" fill="#78716c">${escapeHtml(shortChartLabel(row.label, 13))}</text>`).join("");
  const axes = type === "pie" || type === "horizontal-bar" ? "" : `${grid}<line x1="${pad.left}" y1="${zeroY}" x2="${pad.left + innerW}" y2="${zeroY}" stroke="#aaa198"/>`;
  const background = transparent ? "none" : "#fbf9f6";
  const donutMask = donut && type === "pie" ? `<mask id="chart-donut-mask"><rect width="100%" height="100%" fill="white"/><circle class="chart-donut-hole" cx="${width / 2}" cy="232" r="${Math.min(145, innerH * .42) * .56}" fill="black"/></mask>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><defs><linearGradient id="chart-bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".56"/></linearGradient><linearGradient id="chart-bar-horizontal" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${color}" stop-opacity=".56"/><stop offset="1" stop-color="${color}"/></linearGradient><linearGradient id="chart-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity=".03"/></linearGradient>${donutMask}</defs><rect width="100%" height="100%" fill="${background}"/><text x="${width / 2}" y="38" text-anchor="middle" font-size="16" font-weight="700" fill="#292524">${escapeHtml(title)}</text>${axes}${marks}${labels}</svg>`;
}
