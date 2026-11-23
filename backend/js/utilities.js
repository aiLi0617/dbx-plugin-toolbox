import { convertData, parseYamlDocument } from "../../src/lib/dataConvert.js";
import { convertJsonToLang } from "../../src/lib/jsonToLang.js";
import { parseSafeJson, safeNumber, toSafeJsonValue } from "../../src/lib/jsonPrecision.js";
import { runExactJsonPath } from "../../src/lib/tools/convert.js";
import { validateJsonSchema } from "../../src/lib/lazy/schema.js";
import { analyzePunycode, parseDataUri, toDataUri } from "../../src/lib/tools/encode.js";
import * as codec from "../../src/lib/codec.js";
import { naming, punct, numeronym } from "../../src/lib/tools/text.js";
import { sqlEscape, stripHtml } from "../../src/lib/simpleTransforms.js";
import { extractLinks, normalizeEmailList, palette } from "../../src/lib/contentExpansion.js";
import { banner, englishNouns, lunarConvert, lunarLeapMonth } from "../../src/lib/lazy/content-tools.js";
import { basicAuth, decodeSafeLink, REGEX_REFERENCE, summarizeIpv4, wifiPayload } from "../../src/lib/developerExpansion.js";
import { GIT_REFERENCE, filterGitReference, gitText } from "../../src/lib/gitReference.js";
import { chartSvg, composeToDockerRun, dockerRunToCompose, metaTags, parseCurl, parsePhoneNumber, parseUserAgent, requestCode } from "../../src/lib/utilitySuite.js";
import { splitSubnets } from "../../src/lib/network.js";
import { businessDays } from "../../src/lib/calculators.js";
import { formatFakeRows, generateFakeRows, localFakeDate } from "../../src/lib/fakeData.js";
import { parseJwkDocument } from "../../src/lib/jwk.js";
import bcrypt from "bcryptjs";
import { entropyToMnemonic, mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import beautify from "js-beautify/js/lib/beautifier.js";
import qr from "qrcode/lib/core/qrcode.js";
import svg from "qrcode/lib/renderer/svg-tag.js";
import { toSVG } from "@bwip-js/browser";

const resultText = (text) => ({ text });

function readObject(text) {
  const value = parseSafeJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
  return value;
}

function convert({ text, from, to }) {
  if (from === to && from === "json") throw new Error("Use the JSON formatter for JSON-to-JSON");
  return resultText(convertData(text, from, to));
}

function schemaJson(source) {
  const value = parseSafeJson(source);
  function assertIntegers(item) {
    if (typeof item === "number" && !Number.isSafeInteger(item)) {
      throw new Error("JSON Schema validation requires safe integer numeric values to avoid fractional round-off");
    }
    if (item !== null && typeof item === "object") Object.values(item).forEach(assertIntegers);
  }
  assertIntegers(value);
  return value;
}

function jsonQuery({ action, text, query }) {
  if (action === "path") return resultText(runExactJsonPath(text, query));
  return validateJsonSchema(schemaJson(query), schemaJson(text));
}

function jsonGenerate({ text, language, table }) {
  return resultText(convertJsonToLang(text, language, { table }));
}

function format({ text, language, indent }) {
  if (language === "yaml") return resultText(parseYamlDocument(text).toString({ indent }));
  const formatter = language === "html" ? beautify.html : language === "css" ? beautify.css : beautify.js;
  return resultText(formatter(text, { indent_size: indent, end_with_newline: false }));
}

function baseCodec({ text, action, format, mediaType }) {
  const encode = action === "encode";
  switch (format) {
    case "base32":
      if (encode) return resultText(codec.encodeBase32(codec.textToBytes(text)));
      {
        const clean = text.replace(/\s+/g, "").toUpperCase();
        const bytes = codec.decodeBase32(clean);
        const canonical = codec.encodeBase32(bytes);
        if (clean !== canonical && clean !== canonical.replace(/=+$/, "")) throw new Error("Invalid Base32 padding or trailing bits");
        return resultText(codec.bytesToText(bytes));
      }
    case "base58":
      if (text.length > 8192) throw new Error("Base58 input exceeds 8,192 characters");
      return resultText(encode ? codec.encodeBase58(codec.textToBytes(text)) : codec.bytesToText(codec.decodeBase58(text)));
    case "base64url":
      if (!encode && !/^[A-Za-z0-9_-]*={0,2}$/.test(text.trim())) throw new Error("Invalid Base64URL");
      return resultText(encode ? codec.toBase64(codec.textToBytes(text), true) : codec.bytesToText(codec.fromBase64(text, true)));
    case "quoted-printable":
      return resultText(encode ? codec.encodeQuotedPrintable(text) : codec.decodeQuotedPrintable(text));
    case "unicode":
      return resultText(encode ? codec.escapeUnicode(text) : codec.unescapeUnicode(text));
    case "punycode": {
      const value = analyzePunycode(text);
      return resultText(encode ? value.ace : value.unicode);
    }
    case "data-uri":
      if (encode) {
        if (mediaType && !/^[^,\s]+\/[^,\s]+$/.test(mediaType)) throw new Error("Invalid media type");
        return resultText(toDataUri(text, mediaType));
      }
      {
        const { mime, charset, bytes, text: decoded } = parseDataUri(text);
        return { mime, charset, data: codec.toBase64(bytes), text: decoded };
      }
  }
}

function textTransform({ action, text, find, replacement = "" }) {
  switch (action) {
    case "camel": case "pascal": case "snake": case "kebab": return resultText(naming(text, action));
    case "fullwidth": case "halfwidth": return resultText(punct(text, action === "fullwidth" ? "full" : "half"));
    case "replace":
      if (!find) throw new Error("find must be non-empty");
      return resultText(text.replaceAll(find, () => replacement));
    case "strip-html": return resultText(stripHtml(text));
    case "urls": return { links: extractLinks(text) };
    case "emails": return { emails: normalizeEmailList(text) };
    case "numeronym": return resultText(numeronym(text));
    case "plural": case "singular": return resultText(englishNouns(text, action === "singular"));
    case "sql-quote": return resultText(sqlEscape(text));
    case "figlet": return resultText(banner(text));
  }
}

function developer({ action, text, options }) {
  switch (action) {
    case "curl-to-code": {
      const language = options || "javascript";
      if (!["javascript", "python", "java", "csharp", "go", "php", "ruby", "rust", "kotlin"].includes(language)) throw new Error("Unknown cURL output language");
      const request = parseCurl(text, { parseNumber: safeNumber });
      return { text: requestCode(request, language), diagnostics: request.diagnostics };
    }
    case "docker-to-compose":
    case "compose-to-docker": {
      if (action === "compose-to-docker") {
        toSafeJsonValue(parseYamlDocument(text).toJS({ maxAliasCount: 100 }));
      }
      const convert = action === "docker-to-compose" ? dockerRunToCompose : composeToDockerRun;
      const { output, ...metadata } = convert(text, { serviceName: options, parseNumber: safeNumber });
      return { text: output, ...metadata };
    }
    case "meta-tags": return metaTags(readObject(text));
    case "color-palette": return { colors: palette(text, options || "complementary") };
    case "basic-auth": {
      const { username, password } = readObject(text);
      if (typeof username !== "string" || typeof password !== "string") throw new Error("Expected username and password strings");
      return resultText(basicAuth(username, password));
    }
    case "chart-svg": {
      const chart = options || "bar";
      if (!["bar", "line", "area", "pie"].includes(chart)) throw new Error("Unknown chart type");
      const input = parseSafeJson(text);
      if (!input || typeof input !== "object") throw new Error("Expected JSON chart rows or label-value mapping");
      const rows = Array.isArray(input) ? input.map((row) => ({label: String(row.label), value: safeNumber(row.value)})) :
        Object.entries(input).map(([label, value]) => ({ label, value: safeNumber(value) }));
      if (!rows.length || rows.length > 100) throw new Error("Chart requires 1 to 100 rows");
      return resultText(chartSvg(rows, chart));
    }
    case "git-reference": {
      const locale = ["zh-CN", "zh-TW", "en"].includes(options) ? options : "en";
      const groups = filterGitReference(GIT_REFERENCE, text, locale);
      return { groups: groups.map(group => ({ title: gitText(group.title, locale), commands: group.commands.map(
        command => ({ command: command.value, description: gitText(command.hint, locale) })) })) };
    }
    case "regex-reference": {
      const query = text.trim().toLowerCase();
      return { items: REGEX_REFERENCE.filter(row => row.some(part => part.toLowerCase().includes(query)))
        .map(([zh, en, pattern, example, flags]) => ({ zh, en, pattern, example, flags })) };
    }
  }
}

function network({ action, text, options }) {
  switch (action) {
    case "phone": return parsePhoneNumber(text, options || "CN");
    case "user-agent": return parseUserAgent(text);
    case "safelink": return resultText(decodeSafeLink(text));
    case "ipv4-summary":
      if ([...text.matchAll(/\/([^\s,]*)/g)].some(([, prefix]) => !/^\d{1,2}$/.test(prefix))) {
        throw new Error("IPv4 prefix must be an integer from 0 to 32");
      }
      return { blocks: summarizeIpv4(text) };
    case "subnet-split":
      if (!/^\d{1,3}$/.test(options || "")) throw new Error("Expected a subnet prefix");
      return { subnets: splitSubnets(text, Number(options), 256) };
  }
}

function calculateCalendar({ action, text, options }) {
  switch (action) {
    case "business-days":
      if (!/^[+-]?\d{1,5}$/.test(options || "")) throw new Error("Expected a working-day offset");
      return businessDays(text, { add: Number(options) });
    case "date-diff": {
      const date = (value) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw new Error("Expected YYYY-MM-DD");
        const parsed = new Date(value + "T00:00:00Z");
        if (!Number.isFinite(parsed.getTime()) || !parsed.toISOString().startsWith(value)) throw new Error("Invalid date");
        return parsed.getTime();
      };
      return { days: String((date(options) - date(text)) / 864e5) };
    }
    case "lunar": return lunarConvert({ solarDate: text, direction: "solar" });
    case "solar": {
      const match = /^(\d{4})-(\d{2})-(\d{2})(-leap)?$/.exec(text);
      if (!match) throw new Error("Expected lunar YYYY-MM-DD with optional -leap");
      const [, y, m, d, leap] = match;
      if (leap && lunarLeapMonth(Number(y)) !== Number(m)) throw new Error("Invalid leap month");
      return lunarConvert({ year: Number(y), month: Number(m), day: Number(d), leap: !!leap, direction: "lunar" });
    }
  }
}

function fakeData({ fields, seed, count, format, referenceDate = localFakeDate() }) {
  const specification = fields?.trim().startsWith("[") ? parseSafeJson(fields) : fields;
  const rows = generateFakeRows(count, specification, { seed, referenceDate });
  return { text: formatFakeRows(rows, format), referenceDate };
}

function credential({ kind, text, proof, rounds }) {
  if (text === undefined) throw new Error("Input text is required");
  if (kind === "jwk") {
    const doc = parseJwkDocument(parseSafeJson(text));
    const metadata = ["kty", "kid", "alg", "use", "crv"];
    return { type: doc.type, keys: doc.keys.map((key) => Object.fromEntries(
      metadata.filter((field) => typeof key[field] === "string").map((field) => [field, key[field]])
    )) };
  }
  if (kind === "bip39-encode") {
    return resultText(entropyToMnemonic(codec.hexToBytes(text), wordlist));
  }
  if (kind === "bip39-decode") {
    return resultText(codec.bytesToHex(mnemonicToEntropy(text.trim().replace(/\s+/g, " "), wordlist)));
  }
  if (codec.textToBytes(text).length > 72) throw new Error("Bcrypt input exceeds 72 UTF-8 bytes");
  if (kind === "bcrypt-hash") return resultText(bcrypt.hashSync(text, rounds));
  if (!/^\$2[aby]\$(?:0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(proof || "")) {
    throw new Error("Expected a bcrypt hash with cost 4 to 12");
  }
  return { matches: bcrypt.compareSync(text, proof) };
}

function qrCode({ text, kind, password, security, level }) {
  if (kind === "wifi") text = wifiPayload(text, password || "", security);
  else if (kind !== "text") {
    if (text.length > 1024) throw new Error("Barcode input exceeds 1,024 characters");
    return resultText(toSVG({ bcid: kind, text, scale: 2 }));
  }
  const code = qr.create(text, { errorCorrectionLevel: level });
  return resultText(svg.render(code));
}

const operations = {
  data_convert: convert, json_query: jsonQuery, json_generate: jsonGenerate, code_format: format,
  base_codec: baseCodec, text_transform: textTransform, developer_helpers: developer,
  network_helpers: network, calendar: calculateCalendar, fake_data: fakeData, qr_code: qrCode,
  credential,
};

export function run(name, argumentsJson) {
  try {
    return JSON.stringify({ result: operations[name](JSON.parse(argumentsJson)) });
  } catch (error) {
    return JSON.stringify({ error: String(error.message || error).slice(0, 2048) });
  }
}
