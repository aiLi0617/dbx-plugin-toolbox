const TEXT = "  alpha\n beta\nalpha\n\nGamma  ";
const JSON_SAMPLE = '{\n  "name": "DBX",\n  "version": 2,\n  "enabled": true\n}';

export function createToolDemo(tool) {
  const id = tool?.id || "";
  const view = tool?.view || "";
  const options = { ...(tool?.defaultOptions || {}) };
  if (view === "whitespace") return { input: TEXT, options };
  if (view === "gzip") return { input: "DBX 工具箱 Gzip 示例\nHello, world!", options };
  if (view === "base64") return { input: "Hello, DBX 工具箱!", options };
  if (view === "code-format") {
    const language = options.language || "sql";
    const samples = { sql:"select id,name from users where active=1 order by name", xml:"<root><item id=\"1\">DBX</item></root>", yaml:"name: DBX\nitems:\n- one\n- two", javascript:"const greet=(name)=>{return `Hello ${name}`}", typescript:"type User={id:number;name:string};const user:User={id:1,name:'DBX'}" };
    return { input: samples[language] || samples.sql, options };
  }
  if (view === "data-convert" || view === "json-workbench") return { input: JSON_SAMPLE, options };
  if (view === "developer-utility") {
    if (id === "json-schema") return { input:'{"name":"DBX","version":2}', auxiliary:'{"type":"object","required":["name","version"],"properties":{"name":{"type":"string"},"version":{"type":"integer","minimum":1}}}', options };
    if (id === "dotenv") return { input:'APP_NAME="DBX Toolbox"\nPORT=5190\nDEBUG=true', auxiliary:"env-to-json", options };
    if (id === "semver") return { input:"1.0.0\n1.5.0\n2.0.0-beta.1\n2.0.0", auxiliary:"^1.0.0", options };
    return { input:"4xx", auxiliary:"", options };
  }
  if (id === "windows-port") return { input:"5432", options, safeOnly:true };
  if (view === "image-process" || view === "image-utility" || view === "spreadsheet") return { fixture:"generated", options };
  if (id === "jwt") return { input:"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkYngtZGVtbyIsIm5hbWUiOiJEQlgifQ.", options };
  if (["aes","rsa","xor","hmac-sha256","hash","totp","jwk","cert","symmetric-key","key-pair"].includes(id)) return { input:"DBX public demo vector", options, publicTestVector:true };
  return { input:"DBX Toolbox demo\nHello, 世界!\n123", options };
}

export function assertDemoCoverage(tools) {
  return tools.every((tool) => !tool.actions?.includes("demo") || (tool.demoPreset && createToolDemo(tool)));
}
