const TEXT = "  alpha\n beta\nalpha\n\nGamma  ";
const JSON_SAMPLE = `{
  "string": "DBX 工具箱",
  "number": 42.5,
  "boolean": true,
  "null": null,
  "array": [
    "文本",
    7,
    false,
    null,
    {
      "nested": "value"
    }
  ],
  "object": {
    "name": "DBX",
    "version": 2
  }
}`;

const DATA_FORMAT_SAMPLES = {
  json: '[\n  { "id": 1, "name": "Alice", "active": true, "score": 98.5 },\n  { "id": 2, "name": "李雷", "active": false, "score": 87 }\n]',
  yaml: '- id: 1\n  name: Alice\n  active: true\n  score: 98.5\n- id: 2\n  name: 李雷\n  active: false\n  score: 87',
  csv: 'id,name,active,score\n1,Alice,true,98.5\n2,李雷,false,87',
  tsv: 'id\tname\tactive\tscore\n1\tAlice\ttrue\t98.5\n2\t李雷\tfalse\t87',
  ndjson: '{"id":1,"name":"Alice","active":true,"score":98.5}\n{"id":2,"name":"李雷","active":false,"score":87}',
  xml: '<users><user id="1"><name>Alice</name><active>true</active><score>98.5</score></user><user id="2"><name>李雷</name><active>false</active><score>87</score></user></users>',
  toml: 'title = "DBX Toolbox"\nversion = 2\nenabled = true\n\n[owner]\nname = "Alice"\nteam = "Developer Experience"',
};

const CODE_FORMAT_SAMPLES = {
  sql: "select u.id,u.name,count(o.id) as orders from users u left join orders o on o.user_id=u.id where u.active=1 group by u.id,u.name order by orders desc",
  xml: '<catalog><tool id="json"><name>DBX Toolbox</name><enabled>true</enabled></tool></catalog>',
  yaml: 'name: DBX Toolbox\nfeatures:\n- JSON workbench\n- Code formatter\nenabled: true',
  html: '<main><h1>DBX Toolbox</h1><p class="intro">Developer tools, ready to use.</p></main>',
  css: '.toolbox{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.toolbox__item{padding:12px;border:1px solid currentColor}',
  javascript: 'const tools=["JSON","SQL","Gzip"];const labels=tools.map((name,index)=>({id:index+1,name}));console.log(labels);',
  typescript: 'type Tool={id:number;name:string;enabled:boolean};const tool:Tool={id:1,name:"JSON workbench",enabled:true};export default tool;',
};

const TEXT_MODE_SAMPLES = {
  trim: { input: TEXT },
  empty: { input: 'alpha\n\n\nbeta\n \ngamma' },
  tabs: { input: 'alpha    beta\n    indented' },
  spaces: { input: 'alpha\tbeta\n\tindented' },
  sort: { input: 'Gamma\nalpha\nbeta\nAlpha' },
  unique: { input: 'alpha\nbeta\nalpha\ngamma\nbeta' },
  reverse: { input: 'first\nsecond\nthird' },
  shuffle: { input: 'alpha\nbeta\ngamma\ndelta', controls: { shuffleSeed: 2026 } },
  prefix: { input: 'users\norders\nproducts', controls: { affix: 'table_' } },
  suffix: { input: 'avatar\nbanner\nlogo', controls: { affix: '.png' } },
  number: { input: 'Initialize project\nBuild assets\nRun checks', controls: { startNumber: 1, numberWidth: 2, numberSeparator: '. ' } },
  unnumber: { input: '01. Initialize project\n02. Build assets\n03. Run checks' },
  column: { input: 'alice,admin,active\nbob,viewer,disabled', controls: { column: 2, delimiter: ',' } },
  'filter-length': { input: 'DBX\nJSON\nformatter\nextraordinarily-long-line', controls: { minLength: 4, maxLength: 12 } },
  replace: { input: 'Hello DBX\nDBX Toolbox makes DBX workflows easier.', controls: { find: 'DBX', replace: 'DataBox', replaceRegex: false, replaceFirstOnly: false, replaceIgnoreCase: false } },
  upper: { input: 'Hello DBX Toolbox' },
  lower: { input: 'Hello DBX TOOLBOX' },
  title: { input: 'build better developer tools' },
  camel: { input: 'json workbench demo' },
  pascal: { input: 'json workbench demo' },
  snake: { input: 'JSON workbench demo' },
  kebab: { input: 'JSON workbench demo' },
  full: { input: 'DBX Toolbox 2026!' },
  half: { input: 'ＤＢＸ　Ｔｏｏｌｂｏｘ　２０２６！' },
  slugify: { input: 'DBX Toolbox: JSON & SQL Tools' },
  'strip-html': { input: '<article><h1>DBX Toolbox</h1><p>Hello <strong>world</strong>.</p><script>alert("ignored")</script></article>' },
  mask: { input: 'Email: alice@example.com\nMobile: 13800138000\nCard: 4111111111111111' },
  numeronym: { input: 'internationalization accessibility kubernetes' },
  pluralize: { input: 'tool city box' },
  'email-normalize': { input: ' Alice@EXAMPLE.COM \nbob@DbxIO.COM' },
  'extract-email': { input: 'Contact alice@example.com or support@dbxio.com for help.' },
  'extract-url': { input: 'Docs: https://dbxio.com/docs. Repository: https://github.com/t8y2/dbx' },
  'ascii-banner': { input: 'DBX' },
  stats: { input: 'DBX Toolbox\nHello, 世界!\nOne two three.' },
};

const DOTENV_MODE_SAMPLES = {
  validate: { input: 'APP_NAME="DBX Toolbox"\nPORT=5190\nDEBUG=true' },
  compare: { input: 'APP_NAME="DBX Toolbox"\nPORT=5190\nDEBUG=true', secondary: 'APP_NAME="DBX Toolbox"\nPORT=8080\nCACHE=true' },
  example: { input: 'APP_NAME="DBX Toolbox"\nAPI_BASE_URL=https://api.example.test\nLOG_LEVEL=debug' },
  sync: { input: 'APP_NAME=\nPORT=\nDEBUG=false', secondary: 'APP_NAME="DBX Toolbox"\nPORT=5190\nCACHE=true' },
  'env-to-json': { input: 'APP_NAME="DBX Toolbox"\nPORT=5190\nDEBUG=true' },
  'json-to-env': { input: '{\n  "APP_NAME": "DBX Toolbox",\n  "PORT": 5190,\n  "DEBUG": true\n}' },
};

export function createToolDemo(tool) {
  const id = tool?.id || "";
  const view = tool?.view || "";
  const options = { ...(tool?.defaultOptions || {}) };
  if (view === "whitespace") return { input: TEXT, modes: TEXT_MODE_SAMPLES, options };
  if (view === "gzip") return {
    input: "DBX 工具箱 Gzip 示例\nHello, world!",
    modes: {
      compress: { input: "DBX 工具箱 Gzip 示例\nHello, world!" },
      decompress: { input: "H4sIAAAAAAAACnNxilB4un3p09btz9dtVHCvyixQeL5k15N93VweqTk5+ToK5flFOSmKAK3T8d4nAAAA" },
    },
    options,
  };
  if (view === "base64") return { input: "Hello, DBX 工具箱!", options };
  if (view === "code-format") return { input: CODE_FORMAT_SAMPLES.sql, inputs: CODE_FORMAT_SAMPLES, options };
  if (view === "data-convert") return { input: DATA_FORMAT_SAMPLES.json, inputs: DATA_FORMAT_SAMPLES, options };
  if (view === "json-workbench") return { input: JSON_SAMPLE, options };
  if (id === "sql-escape") return { input: "O'Reilly\nC:\\temp\\report.csv\n李雷", options };
  if (id === "quoted-printable") return {
    input: "Hello, DBX!\n世界",
    modes: {
      encode: { input: "Hello, DBX!\n世界" },
      decode: { input: "Hello, DBX!\n=E4=B8=96=E7=95=8C" },
    },
    options,
  };
  if (view === "developer-utility") {
    if (id === "json-schema") return { input:'{"name":"DBX","version":2}', auxiliary:'{"type":"object","required":["name","version"],"properties":{"name":{"type":"string"},"version":{"type":"integer","minimum":1}}}', options };
    if (id === "dotenv") return { ...DOTENV_MODE_SAMPLES.validate, modes: DOTENV_MODE_SAMPLES, options };
    if (id === "semver") return { input:"1.0.0\n1.5.0\n1.5.0+build.7\n2.0.0-beta.1\n2.0.0\ninvalid-version", auxiliary:"^1.0.0", options };
    return { input:"4xx", auxiliary:"", options };
  }
  if (id === "windows-port") return { input:"5432", options, safeOnly:true };
  if (id === "docker-convert") return {
    input: "docker run --name web -p 8080:80 -e NODE_ENV=production nginx:alpine",
    modes: {
      "run-to-compose": { input: "docker run --name web -p 8080:80 -e NODE_ENV=production nginx:alpine" },
      "compose-to-run": { input: 'services:\n  app:\n    image: nginx:alpine\n    container_name: web\n    ports:\n      - "8080:80"\n    environment:\n      NODE_ENV: production' },
    },
    options,
  };
  if (view === "image-process" || view === "image-utility" || view === "spreadsheet") return { fixture:"generated", options };
  if (id === "jwt") return { input:"eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJkYngtZGVtbyIsIm5hbWUiOiJEQlgifQ.", options };
  if (["aes","rsa","xor","hmac-sha256","hash","totp","jwk","cert","symmetric-key","key-pair"].includes(id)) return { input:"DBX public demo vector", options, publicTestVector:true };
  return { input:"DBX Toolbox demo\nHello, 世界!\n123", options };
}

export function assertDemoCoverage(tools) {
  return tools.every((tool) => !tool.actions?.includes("demo") || (tool.demoPreset && createToolDemo(tool)));
}
