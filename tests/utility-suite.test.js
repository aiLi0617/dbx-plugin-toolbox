import test from "node:test";
import assert from "node:assert/strict";
import { parse as parseYaml } from "yaml";
import { buildPreviewDocument, calculateTransfer, chartSvg, collectClientDiagnostics, composeToDockerRun, dockerRunToCompose, formatCopyRows, formatCopySections, formatDuration, generateFakeRows, metaTags, parseChartData, parseCurl, parseFakeFields, parsePhoneNumber, parseUserAgent, requestCode, serializeKeyboardEvent } from "../src/lib/utilitySuite.js";

test("copy formatters produce readable labeled text without JSON punctuation", () => {
  assert.equal(formatCopyRows([["Browser", "Edge 128"], ["Online", false], ["Count", 0]]), "Browser: Edge 128\nOnline: false\nCount: 0");
  assert.equal(formatCopySections([
    { title: "Browser", rows: [["User-Agent", "UA"], ["Online", "Yes"]] },
    { title: "Display", rows: [["Viewport", "1280 × 720"]] },
  ]), "[Browser]\nUser-Agent: UA\nOnline: Yes\n\n[Display]\nViewport: 1280 × 720");
  assert.doesNotMatch(formatCopyRows([["Value", "text"]]), /[{}\[\]"]/);
});

test("phone and transfer calculators return stable local results", () => {
  assert.deepEqual(parsePhoneNumber("138 0013 8000", "CN"), {
    e164: "+8613800138000",
    international: "+86 138 0013 8000",
    national: "13800138000",
    formattedNational: "138 0013 8000",
    callingCode: "+86",
    region: "CN",
  });
  assert.equal(parsePhoneNumber("+1 (415) 555-2671", "US").international, "+1 415 555 2671");
  assert.equal(parsePhoneNumber("+1 416 555 0123", "CA").region, "CA");
  assert.throws(() => parsePhoneNumber("123", "CN"), /not (?:possible|valid)/);
  assert.equal(calculateTransfer({ size: 125, sizeUnit: "MB", speed: 1000, speedUnit: "Mbps" }).seconds, 1);
  assert.equal(calculateTransfer({ size: 125, sizeUnit: "MB", speed: 1000, speedUnit: "Mbps", overhead: 20, count: 2 }).seconds, 2.5);
  assert.throws(() => calculateTransfer({ size: 1, speed: 1, count: 1.5 }), /File count/);
  assert.equal(calculateTransfer({ size: 1, sizeUnit: "GiB", speed: 1, speedUnit: "GiB/s" }).seconds, 1);
  assert.throws(() => calculateTransfer({ size: 1, sizeUnit: "blocks", speed: 1 }), /Unsupported size unit/);
  assert.throws(() => calculateTransfer({ size: 1, speed: 1, speedUnit: "rpm" }), /Unsupported speed unit/);
  assert.equal(formatDuration(59.6), "1m 0s");
  assert.equal(formatDuration(0.0005), "500 µs");
});

test("curl and docker converters retain important options and diagnose unsupported ones", () => {
  const request = parseCurl("curl -L --max-time 12 -X POST -H 'Accept: application/json' -d '{\"ok\":true}' https://example.invalid/api");
  assert.equal(request.method, "POST");
  assert.equal(request.timeout, 12);
  for (const language of ["javascript", "python", "java", "csharp", "go", "php", "ruby", "rust", "kotlin"]) {
    const code = requestCode(request, language);
    assert.match(code, /Accept/);
    assert.match(code, /ok/);
  }
  assert.throws(() => parseCurl("curl -H 'broken https://example.invalid"), /unclosed quote/);
  const compose = dockerRunToCompose("docker run --name api --restart always --network internal -w '/app dir' -p 8080:80 -e MODE=prod nginx:alpine sh -c 'echo hi'");
  const parsedCompose = parseYaml(compose.output);
  assert.equal(compose.serviceName, "api");
  assert.equal(parsedCompose.services.api.container_name, "api");
  assert.equal(parsedCompose.services.api.restart, "always");
  assert.equal(parsedCompose.services.api.working_dir, "/app dir");
  assert.deepEqual(parsedCompose.services.api.ports, ["8080:80"]);
  assert.deepEqual(parsedCompose.services.api.environment, { MODE: "prod" });
  assert.deepEqual(parsedCompose.services.api.command, ["sh", "-c", "echo hi"]);
  assert.equal(parsedCompose.networks.internal.external, true);
  const hostNetwork = dockerRunToCompose("docker run --network host --read-only alpine");
  assert.equal(parseYaml(hostNetwork.output).services.alpine.network_mode, "host");
  const advanced = parseYaml(dockerRunToCompose("docker run --mount type=bind,src=/host,dst=/data,readonly --dns 1.1.1.1 --cap-drop ALL --health-cmd 'curl -f localhost' --health-retries 3 --init alpine").output);
  assert.deepEqual(advanced.services.alpine.volumes, ["/host:/data:ro"]);
  assert.deepEqual(advanced.services.alpine.cap_drop, ["ALL"]);
  assert.equal(advanced.services.alpine.healthcheck.retries, 3);
  assert.equal(advanced.services.alpine.init, true);
  const interactive = parseYaml(dockerRunToCompose("sudo docker container run -it --gpus all --shm-size 1g --ulimit nofile=1024:2048 --log-driver json-file --log-opt max-size=10m ubuntu bash", { serviceName: "worker" }).output);
  assert.equal(interactive.services.worker.gpus, "all");
  assert.equal(interactive.services.worker.shm_size, "1g");
  assert.equal(interactive.services.worker.stdin_open, true);
  assert.equal(interactive.services.worker.tty, true);
  assert.equal(interactive.services.worker.logging.options["max-size"], "10m");
  assert.deepEqual(interactive.services.worker.ulimits.nofile, { soft: 1024, hard: 2048 });
  assert.throws(() => dockerRunToCompose("docker run --unknown value alpine"), /Unsupported Docker option/);
});

test("Docker converter supports Compose to run and preserves common service settings", () => {
  const compose = `
services:
  api:
    image: ghcr.io/example/api:1
    container_name: example-api
    ports: ["127.0.0.1:8080:80"]
    environment:
      MODE: production
      EMPTY:
    volumes:
      - ./data:/data:ro
    cap_drop: [ALL]
    read_only: true
    init: true
    healthcheck:
      test: [CMD-SHELL, "curl -f http://localhost/health || exit 1"]
      interval: 30s
    ulimits:
      nofile: { soft: 1024, hard: 2048 }
    command: [serve, "--workers", "2"]
`;
  const result = composeToDockerRun(compose, { serviceName: "api" });
  assert.match(result.output, /^docker run /);
  assert.match(result.output, /--name example-api/);
  assert.match(result.output, /--publish 127\.0\.0\.1:8080:80/);
  assert.match(result.output, /--env MODE=production/);
  assert.match(result.output, /--env EMPTY=/);
  assert.match(result.output, /--health-cmd 'curl -f http:\/\/localhost\/health \|\| exit 1'/);
  assert.match(result.output, /--ulimit nofile=1024:2048/);
  assert.match(result.output, /ghcr\.io\/example\/api:1 serve --workers 2$/);
  assert.deepEqual(result.diagnostics, []);
  assert.throws(() => composeToDockerRun("services:\n  api:\n    build: ."), /build-only/);
  assert.throws(() => composeToDockerRun("not: compose"), /services map/);
});

test("curl converter supports query data, common headers, and multipart code", () => {
  const query = parseCurl("curl -G --data-urlencode 'q=hello world' -A agent -b 'sid=1' https://example.invalid/search");
  assert.equal(query.method, "GET");
  assert.match(query.url, /q=hello%20world/);
  assert.match(query.headers.join("\n"), /User-Agent: agent/);
  const form = parseCurl("curl -F 'name=DBX' -F 'upload=@demo.txt' https://example.invalid/upload");
  for (const language of ["javascript", "python", "java", "csharp", "go", "php", "ruby", "rust", "kotlin"]) {
    const code = requestCode(form, language);
    assert.match(code, /upload/);
    assert.match(code, /demo\.txt|fileInput/);
  }
});

test("curl converter emits idiomatic clients for the expanded language set", () => {
  const request = parseCurl("curl -L --max-time 8 -X PUT -H 'Content-Type: application/json' -d '{\"name\":\"DBX\"}' https://example.invalid/items/1");
  const expectedClients = {
    java: /HttpClient\.newBuilder/,
    csharp: /new HttpClient/,
    ruby: /Net::HTTP/,
    rust: /reqwest::blocking::Client/,
    kotlin: /OkHttpClient\.Builder/,
  };
  for (const [language, marker] of Object.entries(expectedClients)) {
    const code = requestCode(request, language);
    assert.match(code, marker);
    assert.match(code, /PUT/);
    assert.match(code, /DBX/);
  }
  assert.throws(() => requestCode(request, "brainfuck"), /Unsupported target language/);
});

test("generated content is deliberately synthetic and exportable", () => {
  const rows = generateFakeRows(3, ["name", "email", "uuid"]);
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.email.endsWith("@example.invalid")));
  assert.deepEqual(rows, generateFakeRows(3, ["name", "email", "uuid"]));
  assert.deepEqual(parseFakeFields("id:integer,email,active:boolean"), [{ name: "id", type: "integer" }, { name: "email", type: "email" }, { name: "active", type: "boolean" }]);
  assert.throws(() => parseFakeFields("name,name"), /Duplicate/);
  const meta = metaTags({ title: "DBX", description: "Tools", url: "https://example.invalid/a", image: "https://example.invalid/share.png" });
  assert.match(meta.html, /canonical/);
  assert.match(meta.html, /twitter:title/);
  assert.equal(meta.warnings.length, 0);
  const metaWithoutImage = metaTags({ title: "DBX", description: "Tools", url: "https://example.invalid/a" });
  assert.doesNotMatch(metaWithoutImage.html, /(?:og:image|twitter:image)/);
  assert.equal(metaWithoutImage.warnings.length, 0);
  assert.deepEqual(metaTags({ title: "DBX", description: "Tools", image: "not-a-url" }).warnings, ["Sharing image must be an absolute HTTP(S) URL"]);
  assert.match(chartSvg(parseChartData("A,1\nB,2"), "bar"), /<svg/);
});

test("HTML preview is network-isolated and client diagnostics are serializable", () => {
  const document = buildPreviewDocument({ html: "<main>ok</main>", css: "body{} </style><img>", script: "console.log('ok')</script>", scriptEnabled: true, channel: "test" });
  assert.match(document, /Content-Security-Policy/);
  assert.match(document, /connect-src 'none'/);
  assert.doesNotMatch(document, /console\.log\('ok'\)<\/script>/);
  const info = collectClientDiagnostics({
    navigator: { userAgent: "UA", language: "en", languages: ["en"], hardwareConcurrency: 4, onLine: true, serviceWorker: {}, clipboard: {} },
    screen: { width: 100, height: 200, availWidth: 90, availHeight: 180 }, innerWidth: 80, innerHeight: 160, devicePixelRatio: 2,
    crypto: { subtle: {} }, WebAssembly: {}, matchMedia: () => ({ matches: false }),
    document: { visibilityState: "visible", createElement: () => ({ getContext: (type) => type === "webgl" ? {} : null }) },
  });
  assert.equal(info.logicalProcessors, 4);
  assert.equal(info.viewport.dpr, 2);
  assert.deepEqual([info.screen.availWidth, info.screen.availHeight], [90, 180]);
  assert.deepEqual(info.capabilities, { webgl: true, serviceWorker: true, webCrypto: true, webAssembly: true, clipboard: true });
  assert.equal(typeof info.localTime, "string");
  assert.doesNotThrow(() => JSON.stringify(info));
});

test("User-Agent parser separates browser, OS, device, engine, and architecture", () => {
  const desktop = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0");
  assert.deepEqual(desktop.browser, { name: "Edge", version: "128.0.0.0" });
  assert.deepEqual(desktop.os, { name: "Windows", version: "10 / 11" });
  assert.equal(desktop.engine, "Blink");
  assert.equal(desktop.engineVersion, "128.0.0.0");
  assert.equal(desktop.engineVersionSource, "Chromium");
  assert.equal(desktop.architecture, "x64");
  assert.equal(desktop.device.type, "desktop");

  const mobile = parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240205.004) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36");
  assert.deepEqual(mobile.browser, { name: "Chrome", version: "121.0.0.0" });
  assert.deepEqual(mobile.os, { name: "Android", version: "14" });
  assert.equal(mobile.device.type, "mobile");
  assert.equal(mobile.device.vendor, "Google");
  assert.equal(mobile.device.model, "Pixel 8 Pro");

  const safari = parseUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15");
  assert.equal(safari.engine, "WebKit");
  assert.equal(safari.engineVersion, "605.1.15");
  assert.equal(safari.engineVersionSource, "AppleWebKit");

  const firefox = parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0");
  assert.equal(firefox.engine, "Gecko");
  assert.equal(firefox.engineVersion, "128.0");
  assert.equal(firefox.engineVersionSource, "rv");
  assert.throws(() => parseUserAgent("   "), /User-Agent/);
});

test("keyboard events serialize modern, lock, target, and compatibility fields", () => {
  const info = serializeKeyboardEvent({
    type: "keydown", key: "A", code: "KeyA", location: 1, ctrlKey: true, shiftKey: true, repeat: true, isComposing: false,
    isTrusted: true, timeStamp: 12.3456, bubbles: true, cancelable: true, composed: true, defaultPrevented: false,
    keyCode: 65, charCode: 0, which: 65, target: { tagName: "INPUT", type: "text", id: "editor", isContentEditable: false },
    getModifierState: (name) => name === "CapsLock",
  });
  assert.equal(info.location.name, "left");
  assert.deepEqual(info.modifiers, { ctrl: true, alt: false, shift: true, meta: false, altGraph: false, capsLock: true, numLock: false, scrollLock: false });
  assert.deepEqual(info.target, { tag: "input", type: "text", id: "editor", contentEditable: false });
  assert.deepEqual(info.legacy, { keyCode: 65, charCode: 0, which: 65 });
  assert.equal(info.timestampMs, 12.346);
});

test("chart export renders presentation metadata and escapes user labels", () => {
  const rows = parseChartData("Category,Value\n<script>,100\nB,200");
  const svg = chartSvg(rows, "bar", 900, 520, { title: "Sales <Q4>", color: "#123456" });
  assert.equal(rows.length, 2);
  assert.match(svg, /Sales &lt;Q4&gt;/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /stop-color="#123456"/);
  assert.doesNotMatch(svg, /<script>/);
});

test("chart CSV parsing handles quoted delimiters and rejects broken quotes", () => {
  assert.deepEqual(parseChartData('Category,Value\n"North, East",12'), [{ label: "North, East", value: 12 }]);
  assert.throws(() => parseChartData('"broken,12'), /unclosed quoted field/);
});

test("pie chart uses outside callouts and a centered dot legend", () => {
  const svg = chartSvg(parseChartData("A,100\nB,200\nC,150\nD,50"), "pie", 900, 520, { title: "Pie" });
  assert.equal((svg.match(/<polyline points=/g) || []).length, 4);
  assert.equal((svg.match(/ r="6" fill=/g) || []).length, 4);
  assert.match(svg, /stroke="#fbf9f6" stroke-width="2"/);
  assert.doesNotMatch(svg, / · 100/);
});

test("pie color is fixed while donut mode adds a center cutout", () => {
  const rows = parseChartData("A,100\nB,200");
  const pie = chartSvg(rows, "pie", 900, 520, { color: "#123456" });
  const donut = chartSvg(rows, "pie", 900, 520, { color: "#123456", donut: true });
  assert.doesNotMatch(pie, /#123456/);
  assert.doesNotMatch(pie, /chart-donut-hole/);
  assert.match(donut, /class="chart-donut-hole"/);
});

test("line and area charts can switch between straight and smooth paths", () => {
  const rows = parseChartData("A,100\nB,200\nC,150\nD,300");
  const straight = chartSvg(rows, "line", 900, 520, { smooth: false });
  const smoothLine = chartSvg(rows, "line", 900, 520, { smooth: true });
  const smoothArea = chartSvg(rows, "area", 900, 520, { smooth: true });
  assert.doesNotMatch(straight, / C [\d.]+ [\d.]+,/);
  assert.match(smoothLine, / C [\d.]+ [\d.]+,/);
  assert.match(smoothArea, / C [\d.]+ [\d.]+,/);
  assert.match(smoothArea, / Z" fill="url\(#chart-area\)"/);
});

test("cartesian charts preserve negative values around a zero axis", () => {
  const rows = parseChartData("Loss,-40\nGain,60");
  const vertical = chartSvg(rows, "bar");
  const horizontal = chartSvg(rows, "horizontal-bar");
  assert.match(vertical, />-40<\/text>/);
  assert.match(vertical, /stroke="#aaa198"/);
  assert.match(horizontal, /chart-bar-horizontal/);
  assert.match(horizontal, />Loss<\/text>/);
  assert.match(horizontal, />-40<\/text>/);
});

test("chart display options control points values grid and transparency", () => {
  const rows = parseChartData("A,10\nB,20\nC,15");
  const svg = chartSvg(rows, "line", 900, 520, {
    showPoints: false,
    showValues: false,
    showGrid: false,
    transparent: true,
  });
  assert.doesNotMatch(svg, /<circle cx=/);
  assert.doesNotMatch(svg, /stroke="#e7e2da"/);
  assert.match(svg, /<rect width="100%" height="100%" fill="none"\/>/);
});

test("chart marks expose hover and keyboard-focus metadata", () => {
  const rows = parseChartData('Category,Value\n"North & East",10\nSouth,20');
  for (const type of ["bar", "horizontal-bar", "line", "area", "pie"]) {
    const svg = chartSvg(rows, type, 900, 520, { showPoints: false });
    assert.equal((svg.match(/data-chart-hit/g) || []).length, 2);
    assert.match(svg, /tabindex="0" role="img"/);
    assert.match(svg, /data-chart-label="North &amp; East"/);
    assert.match(svg, /data-chart-value="10"/);
    assert.match(svg, /data-chart-plot-left=/);
    assert.match(svg, /data-chart-plot-bottom=/);
  }
});

test("pie labels support percentages and optional labels and legend", () => {
  const rows = parseChartData("A,25\nB,75");
  const percent = chartSvg(rows, "pie", 900, 520, { pieLabel: "percent" });
  const minimal = chartSvg(rows, "pie", 900, 520, { showLabels: false, showLegend: false });
  assert.match(percent, /A · 25%/);
  assert.doesNotMatch(minimal, /<polyline points=/);
  assert.doesNotMatch(minimal, / r="6" fill=/);
});
