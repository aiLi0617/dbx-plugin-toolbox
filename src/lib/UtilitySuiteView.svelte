<script>
  import { onMount, tick } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { GIT_REFERENCE, GIT_UI, filterGitReference, gitGroupCommands, gitText } from "./gitReference.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  import {
    buildPreviewDocument, calculateTransfer, chartSvg, collectClientDiagnostics, formatCopyRows, formatCopySections, formatDuration,
    composeToDockerRun, dockerRunToCompose, generateFakeRows, metaTags, parseChartData, parseCurl,
    parsePhoneNumber, parseUserAgent, requestCode, rowsToDelimited, serializeKeyboardEvent,
  } from "./utilitySuite.js";

  let { locale = "zh-CN", toolId = "bandwidth", demo = null, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""); let output = $state(""); let error = $state(""); let diagnostics = $state([]);
  let option = $state(""); let auxiliary = $state(""); let count = $state(12);
  let chartType = $state("bar"); let chartMarkup = $state(""); let chartTitle = $state("DBX Chart"); let chartColor = $state("#0f9688"); let chartRows = $state([]); let chartDonut = $state(false); let chartSmooth = $state(false);
  let chartShowValues = $state(true); let chartShowPoints = $state(true); let chartShowLabels = $state(true); let chartShowLegend = $state(true); let chartShowGrid = $state(true); let chartTransparent = $state(false); let chartPieLabel = $state("category"); let chartSaving = $state(""); let chartSaved = $state("");
  let chartHover = $state(null); let chartPreviewEl = $state(null);
  let chartActiveTarget;
  let chartPointer;
  let size = $state(100); let sizeUnit = $state("MB"); let speed = $state(100); let speedUnit = $state("Mbps"); let overhead = $state(5); let fileCount = $state(1);
  let phoneRegion = $state("CN"); let phoneResult = $state(null); let language = $state("javascript");
  let dockerDirection = $state("run-to-compose"); let dockerService = $state("");
  let title = $state("DBX Toolbox"); let description = $state("Local, privacy-focused developer tools."); let imageUrl = $state(""); let pageUrl = $state("https://example.invalid/toolbox"); let siteName = $state("DBX"); let metaLocale = $state("en_US"); let robots = $state("index, follow"); let metaType = $state("website"); let twitterCard = $state("summary_large_image");
  let html = $state("<main>\n  <h1>Hello, DBX</h1>\n</main>"); let css = $state("body { font-family: system-ui; padding: 2rem; }\nh1 { color: #0f766e; }"); let script = $state(""); let scriptEnabled = $state(false);
  const previewChannel = globalThis.crypto?.randomUUID?.() || `preview-${Date.now()}-${Math.random()}`; let consoleRows = $state([]);
  let keyboard = $state(null); let keyboardHistory = $state([]);
  let query = $state(""); let gitCategory = $state("all"); let format = $state("json"); let fakeSeed = $state("dbx-toolbox");
  let deviceGroups = $state([]);
  let userAgentResult = $state(null);
  let appliedDemoRequest = 0;
  const keyboardJson = $derived(keyboard ? JSON.stringify(keyboard, null, 2) : "");
  const diagnosticText = $derived(formatCopySections(deviceGroups.map((group) => ({
    title: group.title,
    rows: group.rows.map((row) => [row.label, row.boolean ? row.display : row.value]),
  }))));
  const userAgentText = $derived.by(() => {
    if (!userAgentResult) return "";
    const result = userAgentResult;
    return formatCopyRows([
      [t("浏览器", "Browser"), `${result.browser.name}${result.browser.version ? ` ${result.browser.version}` : ""}`],
      [t("渲染引擎", "Engine"), `${result.engine}${result.engineVersion ? ` ${result.engineVersion}` : ""}${result.engineVersionSource ? ` · ${result.engineVersionSource}` : ""}`],
      [t("操作系统", "Operating system"), `${result.os.name}${result.os.version ? ` ${result.os.version}` : ""}`],
      [t("设备类型", "Device type"), result.device.type],
      [t("厂商 / 型号", "Vendor / model"), [result.device.vendor, result.device.model].filter(Boolean).join(" · ") || t("不可识别", "Unknown")],
      [t("架构", "Architecture"), result.architecture],
    ]);
  });

  const languageOptions = [
    ["javascript", "JavaScript · Fetch"],
    ["python", "Python · Requests"],
    ["java", "Java · HttpClient"],
    ["csharp", "C# · HttpClient"],
    ["go", "Go · net/http"],
    ["php", "PHP · cURL"],
    ["ruby", "Ruby · Net::HTTP"],
    ["rust", "Rust · reqwest"],
    ["kotlin", "Kotlin · OkHttp"],
  ].map(([value, label]) => ({ value, label }));
  const dockerDirectionOptions = [
    { value: "run-to-compose", label: t("docker run → Compose", "docker run → Compose") },
    { value: "compose-to-run", label: t("Compose → docker run", "Compose → docker run") },
  ];
  const chartOptions = ["bar", "horizontal-bar", "line", "area", "pie"].map((value) => ({ value, label: t({ bar: "柱状图", "horizontal-bar": "横向条形图", line: "折线图", area: "面积图", pie: "饼图" }[value], value) }));
  const pieLabelOptions = ["category", "value", "percent"].map((value) => ({ value, label: t({ category: "分类", value: "数值", percent: "百分比" }[value], { category: "Category", value: "Value", percent: "Percent" }[value]) }));
  const sizeOptions = ["B", "KB", "MB", "GB", "TB", "KiB", "MiB", "GiB", "TiB"].map((value) => ({ value, label: value }));
  const speedOptions = ["Kbps", "Mbps", "Gbps", "Tbps", "B/s", "KB/s", "MB/s", "GB/s", "KiB/s", "MiB/s", "GiB/s"].map((value) => ({ value, label: value }));
  const speedPresets = [{ label: "100 Mbps", speed: 100, unit: "Mbps" }, { label: "500 Mbps", speed: 500, unit: "Mbps" }, { label: "1 Gbps", speed: 1, unit: "Gbps" }, { label: "10 Gbps", speed: 10, unit: "Gbps" }];
  const phoneRegions = {
    CN: ["中国大陆", "China", "+86", "138 0013 8000"], US: ["美国", "United States", "+1", "415 555 2671"],
    GB: ["英国", "United Kingdom", "+44", "20 7946 0958"], JP: ["日本", "Japan", "+81", "90 1234 5678"],
    DE: ["德国", "Germany", "+49", "30 901820"], FR: ["法国", "France", "+33", "6 12 34 56 78"],
    AU: ["澳大利亚", "Australia", "+61", "4 1234 5678"], CA: ["加拿大", "Canada", "+1", "416 555 0123"],
  };
  const regionOptions = Object.entries(phoneRegions).map(([value, [zh, en, code]]) => ({ value, label: `${t(zh, en)} · ${code}` }));
  const formatOptions = ["json", "csv", "tsv", "ndjson"].map((value) => ({ value, label: value.toUpperCase() }));
  const previewDocument = $derived(buildPreviewDocument({ html, css, script, scriptEnabled, channel: previewChannel }));
  const gitMatchesByCategory = $derived(filterGitReference(GIT_REFERENCE, query, locale));
  const gitCategoryCounts = $derived(Object.fromEntries(gitMatchesByCategory.map((group) => [group.id, group.commands.length])));
  const gitAllCommandCount = $derived(gitMatchesByCategory.reduce((count, group) => count + group.commands.length, 0));
  const filteredGit = $derived(filterGitReference(GIT_REFERENCE, query, locale, gitCategory));
  const gitCommandCount = $derived(filteredGit.reduce((count, group) => count + group.commands.length, 0));
  const gt = (map) => gitText(map, locale);
  const phoneInputPrefix = $derived(/^\s*(?:\+|00)/.test(input) ? t("国际", "INTL") : phoneRegions[phoneRegion]?.[2]);

  $effect(() => {
    if (toolId !== "docker-convert") return;
    const source = input;
    const direction = dockerDirection;
    const service = dockerService;
    if (!source.trim()) { output = ""; error = ""; diagnostics = []; return; }
    const timer = setTimeout(() => {
      void direction; void service;
      run();
    }, 180);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (toolId !== "docker-convert" || !demoRequest || demoRequest === appliedDemoRequest || !demo) return;
    appliedDemoRequest = demoRequest;
    const preset = demo.modes?.[dockerDirection] || demo;
    input = preset.input || "";
    dockerService = preset.service || "";
  });

  const transferResult = $derived.by(() => {
    try { return { value: calculateTransfer({ size, sizeUnit, speed, speedUnit, overhead, count: fileCount }), error: "" }; }
    catch (cause) { return { value: null, error: localizeError(locale, cause) }; }
  });

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const index = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1) : 0;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: index ? 2 : 0 }).format(bytes / 1000 ** index)} ${units[index]}`;
  }

  function formatRate(bitsPerSecond) {
    if (!Number.isFinite(bitsPerSecond)) return "—";
    const units = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
    const index = bitsPerSecond > 0 ? Math.min(Math.floor(Math.log(bitsPerSecond) / Math.log(1000)), units.length - 1) : 0;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bitsPerSecond / 1000 ** index)} ${units[index]}`;
  }

  function useSpeedPreset(preset) { speed = preset.speed; speedUnit = preset.unit; }

  function keyboardEventLabel(type) { return type === "keyup" ? t("抬起", "Key up") : t("按下", "Key down"); }
  function keyboardLocationLabel(name) {
    return t({ standard: "标准区域", left: "左侧", right: "右侧", numpad: "数字键盘", unknown: "未知区域" }[name] || "未知区域", { standard: "Standard", left: "Left", right: "Right", numpad: "Numpad", unknown: "Unknown" }[name] || "Unknown");
  }
  function keyboardLocationText(location) { return locale === "zh-CN" ? `${keyboardLocationLabel(location.name)}（${location.value}）` : `${keyboardLocationLabel(location.name)} (${location.value})`; }
  function keyboardModifierText(modifiers) {
    const labels = { ctrl: "Ctrl", alt: "Alt", shift: "Shift", meta: "Meta", altGraph: "AltGraph" };
    return Object.entries(labels).filter(([name]) => modifiers[name]).map(([, label]) => label).join(" + ") || t("无", "None");
  }
  function keyboardLockText(modifiers) {
    const labels = { capsLock: "Caps Lock", numLock: "Num Lock", scrollLock: "Scroll Lock" };
    const active = Object.entries(labels).filter(([name]) => modifiers[name]).map(([, label]) => label);
    return active.length ? `${active.join(" + ")} ${t("开启", "on")}` : t("无", "None");
  }
  function keyboardTargetText(target) {
    if (!target.tag) return "—";
    const attributes = [target.type ? `type="${target.type}"` : "", target.id ? `id="${target.id}"` : "", target.contentEditable ? 'contenteditable="true"' : ""].filter(Boolean);
    return `<${target.tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}>`;
  }
  function keyboardTimestampText(value) { return value == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(value)} ms ${t("（页面加载后）", "(since page load)")}`; }
  function keyboardLegacyText(legacy) { return `keyCode: ${legacy.keyCode} · which: ${legacy.which} ${t("（已废弃）", "(deprecated)")}`; }
  function booleanLabel(value) { return value ? t("是", "Yes") : t("否", "No"); }

  onMount(() => {
    if (toolId === "chart") input = "Category,Value\nA,100\nB,200\nC,150\nD,300";
    if (toolId === "http-request") input = "curl -H 'Accept: application/json' https://example.invalid/api";
    if (toolId === "phone") input = "138 0013 8000";
    if (toolId === "user-agent") input = navigator.userAgent || "";
    refreshClientInfo();
    const recordKeyboardEvent = (event) => {
      if (toolId !== "keyboard-event") return;
      keyboard = serializeKeyboardEvent(event);
      keyboardHistory = [keyboard, ...keyboardHistory].slice(0, 30);
    };
    const keydown = (event) => {
      recordKeyboardEvent(event);
      if (toolId !== "keyboard-event" && (event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); run(); }
    };
    const keyup = (event) => recordKeyboardEvent(event);
    window.addEventListener("keydown", keydown); window.addEventListener("keyup", keyup);
    const resize = () => refreshClientInfo();
    const message = (event) => { const data = event.data; if (data?.source !== "dbx-playground" || data.channel !== previewChannel) return; consoleRows = [...consoleRows.slice(-99), { level: data.level, text: (data.args || []).join(" ") }]; };
    window.addEventListener("resize", resize); window.addEventListener("message", message);
    if (["chart", "bandwidth", "web-meta", "fake-data", "phone", "user-agent"].includes(toolId)) run();
    return () => { window.removeEventListener("keydown", keydown); window.removeEventListener("keyup", keyup); window.removeEventListener("resize", resize); window.removeEventListener("message", message); };
  });

  function refreshClientInfo() {
    const info = collectClientDiagnostics();
    const unavailable = t("不可用", "Unavailable");
    const dimensions = (width, height) => width && height ? `${width} × ${height}` : unavailable;
    const booleanRow = (label, value) => ({ label, value: value === true, display: value === true ? t("是", "Yes") : t("否", "No"), boolean: true });
    deviceGroups = [
      { id: "browser", title: t("浏览器", "Browser"), rows: [
        { label: "User-Agent", value: info.userAgent || unavailable },
        { label: t("平台", "Platform"), value: info.platform || unavailable },
        { label: t("语言", "Language"), value: info.language || unavailable },
        { label: t("所有语言", "Languages"), value: info.languages.join(", ") || unavailable },
        booleanRow(t("在线", "Online"), info.online),
        booleanRow("Cookie", info.cookiesEnabled),
      ] },
      { id: "hardware", title: t("硬件", "Hardware"), rows: [
        { label: t("CPU 线程", "CPU threads"), value: info.logicalProcessors || unavailable },
        { label: t("内存 (GB)", "Memory (GB)"), value: info.deviceMemoryGiB || unavailable },
        { label: t("触控点数", "Touch points"), value: info.touchPoints },
      ] },
      { id: "display", title: t("显示", "Display"), rows: [
        { label: t("屏幕", "Screen"), value: dimensions(info.screen.width, info.screen.height) },
        { label: t("可用", "Available"), value: dimensions(info.screen.availWidth, info.screen.availHeight) },
        { label: t("色深", "Color depth"), value: info.screen.colorDepth ? `${info.screen.colorDepth}-bit` : unavailable },
        { label: t("像素比", "Pixel ratio"), value: info.viewport.dpr },
        { label: t("视口", "Viewport"), value: dimensions(info.viewport.width, info.viewport.height) },
      ] },
      { id: "region", title: t("区域", "Region"), rows: [
        { label: t("时区", "Timezone"), value: info.timezone || unavailable },
        { label: t("本地时间", "Local time"), value: info.localTime },
      ] },
      { id: "capabilities", title: t("API 能力", "API capabilities"), rows: [
        booleanRow("WebGL", info.capabilities.webgl),
        booleanRow("Service Worker", info.capabilities.serviceWorker),
        booleanRow("Web Crypto", info.capabilities.webCrypto),
        booleanRow("WebAssembly", info.capabilities.webAssembly),
        booleanRow(t("剪贴板 API", "Clipboard API"), info.capabilities.clipboard),
      ] },
    ];
  }

  function run() {
    error = ""; diagnostics = [];
    try {
      if (toolId === "phone") {
        output = "";
        if (!input.trim()) { phoneResult = null; return; }
        phoneResult = parsePhoneNumber(input, phoneRegion);
      }
      else if (toolId === "user-agent") { userAgentResult = parseUserAgent(input); output = ""; }
      else if (toolId === "bandwidth") { output = ""; return; }
      else if (toolId === "http-request") { const parsed = parseCurl(input); diagnostics = parsed.diagnostics; output = requestCode(parsed, language); }
      else if (toolId === "docker-convert") {
        const result = dockerDirection === "run-to-compose"
          ? dockerRunToCompose(input, { serviceName: dockerService })
          : composeToDockerRun(input, { serviceName: dockerService });
        output = result.output; diagnostics = result.diagnostics;
      }
      else if (toolId === "web-meta") { const result = metaTags({ title, description, image: imageUrl, url: pageUrl, siteName, locale: metaLocale, robots, type: metaType, card: twitterCard }); output = result.html; diagnostics = result.warnings; }
      else if (toolId === "fake-data") { const fields = auxiliary || "name,email,company,date,uuid"; const rows = generateFakeRows(count, fields, { seed: fakeSeed }); output = format === "csv" ? rowsToDelimited(rows) : format === "tsv" ? rowsToDelimited(rows, "\t") : format === "ndjson" ? rows.map((row) => JSON.stringify(row)).join("\n") : JSON.stringify(rows, null, 2); }
      else if (toolId === "chart") { chartSaved = ""; clearChartHover(); chartRows = parseChartData(input); chartMarkup = chartSvg(chartRows, chartType, 900, 520, { title: chartTitle, color: chartColor, donut: chartDonut, smooth: chartSmooth, showValues: chartShowValues, showPoints: chartShowPoints, showLabels: chartShowLabels, showLegend: chartShowLegend, showGrid: chartShowGrid, transparent: chartTransparent, pieLabel: chartPieLabel }); output = chartMarkup; if (chartPointer) tick().then(refreshChartHoverAtPointer); }
    } catch (cause) { error = localizeError(locale, cause); output = ""; if (toolId === "phone") phoneResult = null; if (toolId === "user-agent") userAgentResult = null; }
  }

  function transferText(result) {
    if (!result) return "";
    return formatCopyRows([
      [t("预计耗时", "Estimated time"), result.text],
      [t("总数据量", "Total data"), formatBytes(result.bytes)],
      [t("有效速度", "Effective speed"), formatRate(result.effectiveBitsPerSecond)],
      [t("链路利用率", "Link efficiency"), `${(result.efficiency * 100).toFixed(1)}%`],
      [t("损耗增加耗时", "Overhead penalty"), `+${formatDuration(result.overheadSeconds)}`],
      [t("理论零损耗耗时", "Ideal time, no overhead"), formatDuration(result.idealSeconds)],
    ]);
  }

  function usePhoneExample() {
    input = phoneRegions[phoneRegion]?.[3] || "";
    run();
  }

  function changeDockerDirection() {
    error = ""; output = ""; diagnostics = []; dockerService = "";
    input = "";
  }

  function onPhoneInput() {
    if (!input.trim()) { phoneResult = null; output = ""; error = ""; return; }
    if (input.replace(/\D/g, "").length < 7) { phoneResult = null; output = ""; error = ""; return; }
    run();
  }

  function clearChartHover() {
    chartActiveTarget?.classList.remove("is-active");
    chartActiveTarget?.ownerSVGElement?.classList.remove("has-active-mark");
    chartActiveTarget = null;
    chartHover = null;
  }

  function leaveChartPreview() { chartPointer = null; clearChartHover(); }

  function chartTargetAt(clientX, clientY) {
    return document.elementsFromPoint(clientX, clientY).map((item) => item.closest?.("[data-chart-hit]")).find((item) => item && chartPreviewEl?.contains(item));
  }

  function refreshChartHoverAtPointer() {
    if (!chartPointer) return;
    const target = chartTargetAt(chartPointer.clientX, chartPointer.clientY);
    if (target) updateChartHover({ target, ...chartPointer });
  }

  function updateChartHover(event, fromFocus = false) {
    if (!fromFocus && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) chartPointer = { clientX: event.clientX, clientY: event.clientY };
    const target = event.target?.closest?.("[data-chart-hit]") || (!fromFocus && chartTargetAt(event.clientX, event.clientY));
    if (!target || !chartPreviewEl?.contains(target)) { if (!fromFocus) clearChartHover(); return; }
    if (chartActiveTarget !== target) {
      chartActiveTarget?.classList.remove("is-active");
      chartActiveTarget?.ownerSVGElement?.classList.remove("has-active-mark");
      chartActiveTarget = target;
      target.classList.add("is-active");
      target.ownerSVGElement?.classList.add("has-active-mark");
    }
    const previewRect = chartPreviewEl.getBoundingClientRect();
    const svg = target.ownerSVGElement;
    const svgRect = svg?.getBoundingClientRect();
    const viewBox = svg?.viewBox?.baseVal;
    const targetRect = target.getBoundingClientRect();
    const pointerX = fromFocus ? targetRect.left + targetRect.width / 2 - previewRect.left : event.clientX - previewRect.left;
    const pointerY = fromFocus ? targetRect.top + targetRect.height / 2 - previewRect.top : event.clientY - previewRect.top;
    const svgX = Number(target.dataset.chartX); const svgY = Number(target.dataset.chartY);
    const guideX = Math.round(svgRect && viewBox?.width ? svgRect.left - previewRect.left + (svgX - viewBox.x) / viewBox.width * svgRect.width : pointerX);
    const guideY = Math.round(svgRect && viewBox?.height ? svgRect.top - previewRect.top + (svgY - viewBox.y) / viewBox.height * svgRect.height : pointerY);
    const scaleX = svgRect && viewBox?.width ? svgRect.width / viewBox.width : 1; const scaleY = svgRect && viewBox?.height ? svgRect.height / viewBox.height : 1;
    const plotLeft = svgRect ? svgRect.left - previewRect.left + Number(target.dataset.chartPlotLeft) * scaleX : 0;
    const plotTop = svgRect ? svgRect.top - previewRect.top + Number(target.dataset.chartPlotTop) * scaleY : 0;
    const plotRight = svgRect ? svgRect.left - previewRect.left + Number(target.dataset.chartPlotRight) * scaleX : previewRect.width;
    const plotBottom = svgRect ? svgRect.top - previewRect.top + Number(target.dataset.chartPlotBottom) * scaleY : previewRect.height;
    chartHover = {
      label: target.dataset.chartLabel || "", value: target.dataset.chartValue || "", color: target.dataset.chartColor || chartColor,
      percent: target.dataset.chartPercent || "", guide: target.dataset.chartGuide || "none", guideX, guideY, plotLeft, plotTop, plotRight, plotBottom,
      x: Math.min(Math.max(8, pointerX + 12), Math.max(8, previewRect.width - 132)), y: Math.max(8, pointerY - 70),
    };
  }

  async function saveChart(format = "svg") {
    if (chartSaving || !chartRows.length) return;
    if (!chartMarkup) run();
    chartSaving = format;
    chartSaved = "";
    error = "";
    try {
      if (format === "svg") {
        const saved = await saveBlobThroughHost(new Blob([chartMarkup], { type: "image/svg+xml" }), { fileName: "chart.svg", mimeType: "image/svg+xml", title: t("保存图表", "Save chart") });
        if (!saved?.cancelled) chartSaved = "SVG";
        return;
      }
      const url = URL.createObjectURL(new Blob([chartMarkup], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("Unable to render chart")); image.src = url; });
        const canvas = document.createElement("canvas"); canvas.width = 900; canvas.height = 520;
        const context = canvas.getContext("2d");
        if (!chartTransparent) { context.fillStyle = "#fbf9f6"; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Unable to encode PNG");
        const saved = await saveBlobThroughHost(blob, { fileName: "chart.png", mimeType: "image/png", title: t("保存图表", "Save chart") });
        if (!saved?.cancelled) chartSaved = "PNG";
      } finally { URL.revokeObjectURL(url); }
    }
    catch (cause) { error = localizeError(locale, cause); }
    finally { chartSaving = ""; }
  }
</script>

<div class="suite">
  {#if toolId === "user-agent"}
    <div class="ua-layout">
      <section class="card ua-input-card">
        <div class="result-head"><h3>User-Agent</h3><button class="dbx-btn" type="button" onclick={() => { input = navigator.userAgent || ""; run(); }}>{t("使用当前值", "Use current")}</button></div>
        <textarea class="dbx-textarea mono" bind:value={input} oninput={run} placeholder={t("粘贴 User-Agent 字符串…", "Paste a User-Agent string…")}></textarea>
        <p>{t("解析在本地完成，不会发送任何数据。", "Parsing runs locally and sends no data.")}</p>
      </section>
      <section class="card ua-result-card">
        <div class="result-head"><h3>{t("解析结果", "Parsed result")}</h3><CopyButton {locale} text={userAgentText} labelZh="复制结果" labelEn="Copy result" /></div>
        {#if userAgentResult}
          <dl>
            <dt>{t("浏览器", "Browser")}</dt><dd>{userAgentResult.browser.name}{userAgentResult.browser.version ? ` ${userAgentResult.browser.version}` : ""}</dd>
            <dt>{t("渲染引擎", "Engine")}</dt><dd>{userAgentResult.engine}{userAgentResult.engineVersion ? ` ${userAgentResult.engineVersion}` : ""}{userAgentResult.engineVersionSource ? ` · ${userAgentResult.engineVersionSource}` : ""}</dd>
            <dt>{t("操作系统", "Operating system")}</dt><dd>{userAgentResult.os.name}{userAgentResult.os.version ? ` ${userAgentResult.os.version}` : ""}</dd>
            <dt>{t("设备类型", "Device type")}</dt><dd>{userAgentResult.device.type}</dd>
            <dt>{t("厂商 / 型号", "Vendor / model")}</dt><dd>{[userAgentResult.device.vendor, userAgentResult.device.model].filter(Boolean).join(" · ") || t("不可识别", "Unknown")}</dd>
            <dt>{t("架构", "Architecture")}</dt><dd>{userAgentResult.architecture}</dd>
          </dl>
        {:else}<p class="empty-copy">{t("输入 User-Agent 后显示解析结果。", "Enter a User-Agent to see parsed details.")}</p>{/if}
      </section>
    </div>
  {:else if toolId === "device-info"}
    <div class="diagnostic-actions"><button class="dbx-btn" type="button" onclick={refreshClientInfo}>{t("刷新", "Refresh")}</button><CopyButton {locale} text={diagnosticText} labelZh="复制信息" labelEn="Copy info" /></div>
    <div class="diagnostic-layout">
      {#each deviceGroups as group}
        <section class="card diagnostic-card diagnostic-card--{group.id}">
          <header class="diagnostic-card-head">
            <h3>
              <span class="diagnostic-icon" aria-hidden="true">
                {#if group.id === "browser"}
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>
                {:else if group.id === "hardware"}
                  <svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3M10 10h4v4h-4z"/></svg>
                {:else if group.id === "display"}
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                {:else if group.id === "region"}
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                {:else}
                  <svg viewBox="0 0 24 24"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>
                {/if}
              </span>
              {group.title}
            </h3>
            <span class="diagnostic-count">{group.rows.length}</span>
          </header>
          <div class="diagnostic-rows">
            {#each group.rows as row}
              <div class="diagnostic-row">
                <span class="diagnostic-label">{row.label}</span>
                {#if row.boolean}
                  <span class:enabled={row.value} class="diagnostic-boolean">{row.display}</span>
                {:else}
                  <code>{row.value}</code>
                {/if}
                <CopyButton {locale} text={String(row.boolean ? row.display : row.value)} />
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else if toolId === "keyboard-event"}
    <section class="keyboard-shell card" aria-label={t("键盘事件捕获区域", "Keyboard event capture area")}>
      <header class="keyboard-head">
        <div><h3>{t("按下任意键", "Press any key")}</h3><p>{t("保持此页面聚焦，可实时检查 keydown 与 keyup 事件。", "Keep this page focused to inspect keydown and keyup events in real time.")}</p></div>
        <div class="diagnostic-actions"><button class="dbx-btn" type="button" onclick={() => { keyboard = null; keyboardHistory = []; }}>{t("清空", "Clear")}</button><CopyButton {locale} text={keyboardJson} labelZh="复制 JSON" labelEn="Copy JSON" /></div>
      </header>
      {#if keyboard}
        <div class="keyboard-hero"><strong>{keyboard.key || t("空值", "Empty")}</strong><code>{keyboard.code || "—"}</code><span class:keyup={keyboard.type === "keyup"}>{keyboardEventLabel(keyboard.type)} · {keyboard.type}</span></div>
        <div class="keyboard-layout">
          <section><h3>{t("事件属性", "Event properties")}</h3><dl>
            <dt>{t("键盘区域", "Keyboard location")} <code>location</code></dt><dd class="keyboard-value"><span>{keyboardLocationText(keyboard.location)}</span><CopyButton {locale} text={String(keyboard.location.value)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("修饰键", "Modifiers")} <code>modifiers</code></dt><dd class="keyboard-value"><span>{keyboardModifierText(keyboard.modifiers)}</span><CopyButton {locale} text={keyboardModifierText(keyboard.modifiers)} /></dd>
            <dt>{t("锁定状态", "Lock state")} <code>getModifierState</code></dt><dd class="keyboard-value"><span>{keyboardLockText(keyboard.modifiers)}</span><CopyButton {locale} text={keyboardLockText(keyboard.modifiers)} /></dd>
            <dt>{t("是否重复", "Repeating")} <code>repeat</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.repeat)}</span><CopyButton {locale} text={String(keyboard.repeat)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("输入法合成中", "Composing")} <code>isComposing</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.composing)}</span><CopyButton {locale} text={String(keyboard.composing)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("可信事件", "Trusted event")} <code>isTrusted</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.trusted)}</span><CopyButton {locale} text={String(keyboard.trusted)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("时间戳", "Timestamp")} <code>timeStamp</code></dt><dd class="keyboard-value"><span>{keyboardTimestampText(keyboard.timestampMs)}</span><CopyButton {locale} text={keyboard.timestampMs == null ? "" : String(keyboard.timestampMs)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("事件目标", "Event target")} <code>target</code></dt><dd class="keyboard-value"><span>{keyboardTargetText(keyboard.target)}</span><CopyButton {locale} text={keyboardTargetText(keyboard.target)} /></dd>
            <dt>{t("是否冒泡", "Bubbles")} <code>bubbles</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.propagation.bubbles)}</span><CopyButton {locale} text={String(keyboard.propagation.bubbles)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("可否取消", "Cancelable")} <code>cancelable</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.propagation.cancelable)}</span><CopyButton {locale} text={String(keyboard.propagation.cancelable)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("穿透 Shadow DOM", "Crosses Shadow DOM")} <code>composed</code></dt><dd class="keyboard-value"><span>{booleanLabel(keyboard.propagation.composed)}</span><CopyButton {locale} text={String(keyboard.propagation.composed)} labelZh="复制原始值" labelEn="Copy raw value" /></dd>
            <dt>{t("兼容键码", "Legacy key codes")}</dt><dd class="keyboard-value"><span>{keyboardLegacyText(keyboard.legacy)}</span><CopyButton {locale} text={`keyCode: ${keyboard.legacy.keyCode}; which: ${keyboard.legacy.which}`} /></dd>
          </dl></section>
          <section><h3>{t("最近事件", "Recent events")} · {keyboardHistory.length}/30</h3><div class="keyboard-history">{#each keyboardHistory as item}<div><span class:keyup={item.type === "keyup"}>{keyboardEventLabel(item.type)}</span><b>{item.key || "—"}</b><code>{item.code || "—"}</code><small>{item.timestampMs ?? "—"} ms</small></div>{/each}</div></section>
        </div>
      {:else}<div class="keyboard-empty"><kbd>A</kbd><strong>{t("等待键盘事件", "Waiting for a keyboard event")}</strong><span>{t("支持普通键、功能键、数字键盘、修饰键和输入法合成状态。", "Supports regular keys, function keys, numpad, modifiers, and composition state.")}</span></div>{/if}
    </section>
  {:else if toolId === "git-reference"}
    <section class="git-reference">
      <div class="git-toolbar">
        <input class="dbx-input search" bind:value={query} placeholder={gt(GIT_UI.searchPlaceholder)} aria-label={gt(GIT_UI.searchPlaceholder)} />
        <span class="git-count">{gitCommandCount} {gt(GIT_UI.commandCount)}</span>
      </div>
      <nav class="git-categories" aria-label="Git categories">
        <button type="button" class:active={gitCategory === "all"} onclick={() => (gitCategory = "all")}><span>{gt(GIT_UI.all)}</span><b>{gitAllCommandCount}</b></button>
        {#each GIT_REFERENCE as group}<button type="button" class:active={gitCategory === group.id} onclick={() => (gitCategory = group.id)}><span>{gt(group.title)}</span><b>{gitCategoryCounts[group.id] || 0}</b></button>{/each}
      </nav>
      {#if filteredGit.length}
        <div class="reference-grid">
          {#each filteredGit as group}
            <article class="card git-card">
              <header><div><h3>{gt(group.title)}<span>{group.commands.length}</span></h3><p>{gt(group.summary)}</p></div><CopyButton {locale} getText={() => gitGroupCommands(group)} label={GIT_UI.copyGroup} /></header>
              <div class="git-command-list">
                {#each group.commands as item}
                  <div class="git-command" class:caution={item.caution}>
                    <div class="git-command-copy"><code>{item.value}</code>{#if item.caution}<span class="git-warning" title={gt(GIT_UI.destructive)}>⚠ {gt(GIT_UI.caution)}</span>{/if}<CopyButton {locale} text={item.value} /></div>
                    <p>{gt(item.hint)}</p>
                  </div>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      {:else}<div class="git-empty">{gt(GIT_UI.noResults)}</div>{/if}
    </section>
  {:else if toolId === "html-playground"}
    <div class="playground-toolbar"><label class="check"><input type="checkbox" bind:checked={scriptEnabled} onchange={() => (consoleRows = [])} /> {t("允许预览运行 JavaScript", "Allow JavaScript in preview")}</label><span>{t("预览使用隔离 iframe，并通过 CSP 禁止网络、表单与外部资源", "Preview uses an isolated iframe; CSP blocks network, forms, and external resources")}</span></div>
    <div class="playground"><section><label>HTML<textarea class="dbx-textarea mono" bind:value={html}></textarea></label><label>CSS<textarea class="dbx-textarea mono" bind:value={css}></textarea></label><label>JavaScript<textarea class="dbx-textarea mono" bind:value={script}></textarea></label></section><section class="preview-stack"><iframe title={t("HTML 预览", "HTML preview")} sandbox={scriptEnabled ? "allow-scripts" : ""} srcdoc={previewDocument}></iframe>{#if scriptEnabled}<div class="console"><header><strong>Console</strong><button type="button" onclick={() => (consoleRows = [])}>{t("清空", "Clear")}</button></header><div>{#each consoleRows as row}<p class:error-log={row.level === "error"}><span>{row.level}</span>{row.text}</p>{/each}{#if !consoleRows.length}<p class="muted">{t("控制台输出会显示在这里", "Console output appears here")}</p>{/if}</div></div>{/if}</section></div>
  {:else if toolId === "web-meta"}
    <div class="workbench"><aside class="card fields"><label>{t("标题", "Title")}<input class="dbx-input" maxlength="120" bind:value={title} oninput={run} /><small>{title.length}/60</small></label><label>{t("描述", "Description")}<textarea class="dbx-textarea" maxlength="300" bind:value={description} oninput={run}></textarea><small>{description.length}/160</small></label><label>{t("页面 URL", "Page URL")}<input class="dbx-input" type="url" bind:value={pageUrl} oninput={run} /></label><label>{t("分享图片", "Sharing image")}<input class="dbx-input" type="url" bind:value={imageUrl} oninput={run} /></label><div class="pair"><label>{t("站点名称", "Site name")}<input class="dbx-input" bind:value={siteName} oninput={run} /></label><label>og:locale<input class="dbx-input" bind:value={metaLocale} oninput={run} /></label></div><div class="pair"><label>og:type<input class="dbx-input" bind:value={metaType} oninput={run} /></label><label>robots<input class="dbx-input" bind:value={robots} oninput={run} /></label></div><label>Twitter card<input class="dbx-input" bind:value={twitterCard} oninput={run} /></label></aside><main class="preview-column"><article class="share-preview">{#if imageUrl}<img src={imageUrl} alt="" referrerpolicy="no-referrer" />{/if}<span>{pageUrl || "example.invalid"}</span><strong>{title}</strong><p>{description}</p></article><section class="grow meta-output"><div class="result-head"><label for="web-meta-output">HTML</label><CopyButton {locale} getText={() => output} labelZh="复制 HTML" labelEn="Copy HTML" /></div><textarea id="web-meta-output" class="dbx-textarea mono" value={output} readonly></textarea></section></main></div>
  {:else if toolId === "chart"}
    <section class="chart-shell">
      <div class="chart-toolbar">
        <label class="toolbar-field title-field"><span>{t("标题", "Title")}</span><input class="dbx-input" bind:value={chartTitle} oninput={run} /></label>
        <label class="toolbar-field"><span>{t("类型", "Type")}</span><Select bind:value={chartType} options={chartOptions} onchange={run} /></label>
        {#if chartType === "pie"}
          <label class="chart-toggle" class:active={chartDonut}><input type="checkbox" bind:checked={chartDonut} onchange={run} /><span>{t("环形", "Donut")}</span></label>
          <label class="chart-toggle" class:active={chartShowLabels}><input type="checkbox" bind:checked={chartShowLabels} onchange={run} /><span>{t("外部标签", "Labels")}</span></label>
          <label class="chart-toggle" class:active={chartShowLegend}><input type="checkbox" bind:checked={chartShowLegend} onchange={run} /><span>{t("图例", "Legend")}</span></label>
          {#if chartShowLabels}<label class="toolbar-field label-mode"><span>{t("标签", "Label")}</span><Select bind:value={chartPieLabel} options={pieLabelOptions} onchange={run} /></label>{/if}
        {:else if chartType === "line" || chartType === "area"}
          <label class="chart-toggle" class:active={chartSmooth}><input type="checkbox" bind:checked={chartSmooth} onchange={run} /><span>{t("平滑", "Smooth")}</span></label>
          <label class="chart-toggle" class:active={chartShowPoints}><input type="checkbox" bind:checked={chartShowPoints} onchange={run} /><span>{t("节点", "Points")}</span></label>
          <label class="chart-toggle" class:active={chartShowValues}><input type="checkbox" bind:checked={chartShowValues} onchange={run} /><span>{t("数值", "Values")}</span></label>
          <label class="toolbar-field color-field"><span>{t("颜色", "Color")}</span><input class="chart-color" type="color" bind:value={chartColor} oninput={run} aria-label={t("图表颜色", "Chart color")} /></label>
        {:else}
          <label class="chart-toggle" class:active={chartShowValues}><input type="checkbox" bind:checked={chartShowValues} onchange={run} /><span>{t("数值", "Values")}</span></label>
          <label class="toolbar-field color-field"><span>{t("颜色", "Color")}</span><input class="chart-color" type="color" bind:value={chartColor} oninput={run} aria-label={t("图表颜色", "Chart color")} /></label>
        {/if}
        {#if chartType !== "pie"}<label class="chart-toggle" class:active={chartShowGrid}><input type="checkbox" bind:checked={chartShowGrid} onchange={run} /><span>{t("网格", "Grid")}</span></label>{/if}
        <label class="chart-toggle" class:active={chartTransparent}><input type="checkbox" bind:checked={chartTransparent} onchange={run} /><span>{t("透明背景", "Transparent")}</span></label>
        <div class="chart-actions">
          {#if chartSaved}<span class="save-status" role="status">{t("已保存", "Saved")} {chartSaved}</span>{/if}
          <button class="dbx-btn dbx-btn--primary" type="button" disabled={!chartRows.length || Boolean(chartSaving)} onclick={() => saveChart("png")}>{chartSaving === "png" ? t("保存中…", "Saving…") : "↓ PNG"}</button>
          <button class="dbx-btn" type="button" disabled={!chartRows.length || Boolean(chartSaving)} onclick={() => saveChart("svg")}>{chartSaving === "svg" ? t("保存中…", "Saving…") : "SVG"}</button>
        </div>
      </div>
      <div class="chart-workbench">
        <section class="chart-panel input-panel">
          <header><strong>☰　{t("数据输入", "Data input")}</strong><span class="data-count"><i></i>{chartRows.length} {t("条数据", "rows")}</span></header>
          <textarea class="chart-input mono" bind:value={input} oninput={run} spellcheck="false" aria-label={t("CSV 或 JSON 数据", "CSV or JSON data")}></textarea>
          <footer>{t("支持 CSV / TSV / JSON，第一行可作为表头", "CSV / TSV / JSON; the first row may be a header")}</footer>
        </section>
        <section class="chart-panel preview-panel">
          <header><strong>⌁　{t("图表预览", "Chart preview")}</strong><span>{t("实时更新", "Live")}</span></header>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- event delegation serves focusable SVG data marks -->
          <main bind:this={chartPreviewEl} class="chart-preview" class:transparent-bg={chartTransparent} onpointerover={updateChartHover} onpointermove={updateChartHover} onpointerleave={leaveChartPreview} onfocusin={(event) => updateChartHover(event, true)} onfocusout={clearChartHover} onkeydown={(event) => event.key === "Escape" && clearChartHover()}>
            {@html chartMarkup}
            {#if chartHover}
              {#if chartHover.guide === "vertical"}<span class="chart-guide vertical" style={`left:${chartHover.guideX}px;top:${chartHover.plotTop}px;height:${chartHover.plotBottom - chartHover.plotTop}px`} aria-hidden="true"></span>{/if}
              {#if chartHover.guide === "horizontal"}<span class="chart-guide horizontal" style={`top:${chartHover.guideY}px;left:${chartHover.plotLeft}px;width:${chartHover.plotRight - chartHover.plotLeft}px`} aria-hidden="true"></span>{/if}
              <aside class="chart-tooltip" style={`left:${chartHover.x}px;top:${chartHover.y}px`} role="status">
                <strong>{chartHover.label}</strong><span><i style={`background:${chartHover.color}`}></i><b>{chartHover.value}</b>{#if chartHover.percent}<small>{chartHover.percent}%</small>{/if}</span>
              </aside>
            {/if}
          </main>
          <footer>{t("输入或设置变化后实时更新", "Updates as data or settings change")}</footer>
        </section>
      </div>
    </section>
  {:else if toolId === "phone"}
    <section class="phone-workbench">
      <div class="phone-intro">
        <span class="phone-kicker">{t("号码规范化", "NUMBER NORMALIZER")}</span>
        <h3>{t("把电话号码转换为统一、可复制的格式", "Normalize phone numbers into consistent, copy-ready formats")}</h3>
        <p>{t("所有解析均在本地完成。默认地区仅用于没有国际区号的号码。", "Parsing stays on this device. The default region is only used when a country calling code is missing.")}</p>
      </div>

      <div class="phone-grid">
        <section class="card phone-form">
          <div class="phone-section-head"><span>01</span><strong>{t("输入号码", "Enter number")}</strong></div>
          <label>{t("默认地区", "Default region")}<Select bind:value={phoneRegion} options={regionOptions} onchange={run} /></label>
          <label>{t("电话号码", "Phone number")}
            <div class="phone-input-wrap">
              <span>{phoneInputPrefix}</span>
              <input class="dbx-input phone-input" bind:value={input} oninput={onPhoneInput} onkeydown={(event) => event.key === "Enter" && run()} autocomplete="tel" inputmode="tel" placeholder={phoneRegions[phoneRegion]?.[3]} />
            </div>
          </label>
          <div class="phone-form-actions">
            <button class="dbx-btn dbx-btn--primary" type="button" onclick={run}>{t("解析号码", "Parse number")}</button>
            <button class="dbx-btn" type="button" onclick={usePhoneExample}>{t("使用示例", "Use example")}</button>
          </div>
          <p class="phone-tip">{t("支持空格、短横线、括号，以及以 + 或 00 开头的国际号码。", "Supports spaces, dashes, parentheses, and international numbers starting with + or 00.")}</p>
        </section>

        <section class="card phone-result" aria-live="polite">
          <div class="phone-result-head">
            <div class="phone-section-head"><span>02</span><strong>{t("解析结果", "Parsed result")}</strong></div>
            {#if phoneResult}<span class="valid-badge"><i></i>{t("格式有效", "Valid format")}</span>{/if}
          </div>
          {#if phoneResult}
            <div class="phone-primary-result">
              <span>E.164</span>
              <strong>{phoneResult.e164}</strong>
              <CopyButton {locale} text={phoneResult.e164} />
            </div>
            <div class="phone-result-list">
              <div><span>{t("国际格式", "International")}</span><code>{phoneResult.international}</code><CopyButton {locale} text={phoneResult.international} /></div>
              <div><span>{t("本地号码", "National number")}</span><code>{phoneResult.formattedNational}</code><CopyButton {locale} text={phoneResult.formattedNational} /></div>
              <div><span>{t("国家 / 地区", "Country / region")}</span><code>{phoneRegions[phoneResult.region]?.[locale.startsWith("zh") ? 0 : 1] || phoneResult.region}</code></div>
              <div><span>{t("国际区号", "Calling code")}</span><code>{phoneResult.callingCode || "—"}</code><CopyButton {locale} text={phoneResult.callingCode} /></div>
            </div>
          {:else}
            <div class="phone-empty">
              <div class="phone-empty-icon" aria-hidden="true">＋</div>
              <strong>{t("输入电话号码开始解析", "Enter a phone number to begin")}</strong>
              <span>{t("结果会自动显示在这里", "The normalized formats will appear here")}</span>
            </div>
          {/if}
        </section>
      </div>
    </section>
  {:else if toolId === "bandwidth"}
    <section class="bandwidth-shell">
      <header class="bandwidth-intro">
        <span>{t("带宽规划", "TRANSFER PLANNING")}</span>
        <h3>{t("估算真实传输耗时", "Estimate real-world transfer time")}</h3>
        <p>{t("区分 bit 与 Byte，并将协议损耗和文件数量计入结果。", "Distinguish bits from bytes and include protocol overhead and file count.")}</p>
      </header>
      <div class="bandwidth-grid">
        <section class="card bandwidth-form">
          <div class="field-group">
            <strong>{t("数据量", "Data volume")}</strong>
            <div class="value-unit"><input class="dbx-input" aria-label={t("文件大小", "File size")} type="number" min="0" step="any" bind:value={size} /><Select bind:value={sizeUnit} options={sizeOptions} /></div>
          </div>
          <label>{t("文件数量", "File count")}<input class="dbx-input" type="number" min="1" max="1000000" step="1" bind:value={fileCount} /></label>
          <div class="field-group">
            <strong>{t("链路速度", "Link speed")}</strong>
            <div class="value-unit"><input class="dbx-input" aria-label={t("传输速度", "Transfer speed")} type="number" min="0.001" step="any" bind:value={speed} /><Select bind:value={speedUnit} options={speedOptions} /></div>
            <div class="speed-presets" aria-label={t("常用带宽", "Common bandwidths")}>{#each speedPresets as preset}<button class:active={speed === preset.speed && speedUnit === preset.unit} type="button" onclick={() => useSpeedPreset(preset)}>{preset.label}</button>{/each}</div>
          </div>
          <label class="overhead-field"><span>{t("协议损耗", "Protocol overhead")}<b>{overhead}%</b></span><input type="range" min="0" max="95" step="0.1" bind:value={overhead} /><small>{t("可用于计入 TCP/IP、加密、无线重传等开销。", "Accounts for TCP/IP, encryption, and wireless retransmission overhead.")}</small></label>
        </section>
        <section class="card bandwidth-result">
          <div class="result-head"><strong>{t("预计耗时", "Estimated time")}</strong><CopyButton {locale} getText={() => transferText(transferResult.value)} labelZh="复制结果" labelEn="Copy result" /></div>
          {#if transferResult.value}
            <div class="duration-result"><strong>{transferResult.value.text}</strong><span>{t("以有效吞吐量计算", "Calculated from effective throughput")}</span></div>
            <div class="metric-grid">
              <div><span>{t("总数据量", "Total data")}</span><b>{formatBytes(transferResult.value.bytes)}</b></div>
              <div><span>{t("有效速度", "Effective speed")}</span><b>{formatRate(transferResult.value.effectiveBitsPerSecond)}</b></div>
              <div><span>{t("链路利用率", "Link efficiency")}</span><b>{(transferResult.value.efficiency * 100).toFixed(1)}%</b></div>
              <div><span>{t("损耗增加耗时", "Overhead penalty")}</span><b>+{formatDuration(transferResult.value.overheadSeconds)}</b></div>
            </div>
            <div class="transfer-note"><span>{t("理论零损耗耗时", "Ideal time, no overhead")}</span><b>{formatDuration(transferResult.value.idealSeconds)}</b></div>
          {:else}
            <div class="bandwidth-empty"><strong>—</strong><span>{t("请输入有效的数据量与链路速度", "Enter a valid data volume and link speed")}</span></div>
          {/if}
        </section>
      </div>
      {#if transferResult.error}<div class="banner error" role="alert">{transferResult.error}</div>{/if}
    </section>
  {:else}
    <div class="standard-layout">
      <section class="card form-panel">
        {#if toolId === "http-request"}<label>{t("目标语言", "Target language")}<Select bind:value={language} options={languageOptions} /></label><label class="grow">cURL<textarea class="dbx-textarea mono" bind:value={input}></textarea></label>
        {:else if toolId === "docker-convert"}
          <label>{t("转换方向", "Direction")}<Select bind:value={dockerDirection} options={dockerDirectionOptions} onchange={changeDockerDirection} /></label>
          <label>{t("服务名称", "Service name")}<input class="dbx-input mono" bind:value={dockerService} placeholder={dockerDirection === "run-to-compose" ? t("自动（优先使用 --name）", "Auto (prefers --name)") : t("留空则选择首个服务", "First service when empty")} /></label>
          <label class="grow">{dockerDirection === "run-to-compose" ? "docker run" : "compose.yaml"}<textarea class="dbx-textarea mono" bind:value={input}></textarea></label>
          <p class="field-help">{t("输入、方向或服务名称变化后自动转换", "Converts automatically when the input, direction, or service name changes")}</p>
        {:else if toolId === "fake-data"}<div class="pair"><label>{t("数量", "Count")}<input class="dbx-input" type="number" min="1" max="1000" step="1" bind:value={count} /></label><label>{t("格式", "Format")}<Select bind:value={format} options={formatOptions} /></label></div><label>{t("随机种子", "Seed")}<input class="dbx-input" bind:value={fakeSeed} /></label><label>{t("字段（逗号分隔）", "Fields (comma-separated)")}<input class="dbx-input" bind:value={auxiliary} placeholder="id:integer,name,email,active:boolean,amount" /></label><p class="field-help">{t("可用类型：name、email、phone、company、date、datetime、uuid、boolean、integer、number、amount、url、ipv4、sentence", "Types: name, email, phone, company, date, datetime, uuid, boolean, integer, number, amount, url, ipv4, sentence")}</p>{/if}
        {#if toolId !== "docker-convert"}<button class="dbx-btn dbx-btn--primary" type="button" onclick={run}>{t("运行", "Run")}</button>{/if}
      </section>
      <section class="result-panel"><div class="result-head"><strong>{t("结果", "Result")}</strong><CopyButton {locale} getText={() => output} /></div><textarea class="dbx-textarea mono" value={output} readonly></textarea></section>
    </div>
  {/if}
  {#if error}<div class="banner error" role="alert">{error}</div>{/if}
  {#if diagnostics.length}<div class="banner" role="status">{#each diagnostics as item}<div>{item}</div>{/each}</div>{/if}
</div>

<style>
  .ua-layout{display:grid;grid-template-columns:minmax(280px,.8fr) minmax(0,1.2fr);gap:12px;flex:1;min-height:0}.ua-layout .card{padding:16px}.ua-input-card,.ua-result-card{min-height:300px}.ua-input-card{display:flex;flex-direction:column}.ua-input-card textarea{flex:1;min-height:190px;resize:vertical}.ua-input-card p,.empty-copy{color:var(--color-muted-foreground);font-size:12px}.ua-result-card dl{grid-template-columns:minmax(110px,max-content) 1fr}
  .keyboard-shell{display:flex;flex:1;min-height:420px;flex-direction:column;padding:18px}.keyboard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.keyboard-head p{margin:6px 0 0;color:var(--color-muted-foreground);font-size:12px}.keyboard-hero{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:12px;margin-top:18px;padding:18px;border:1px solid color-mix(in srgb,var(--color-primary) 25%,var(--color-border));border-radius:10px;background:color-mix(in srgb,var(--color-primary) 6%,var(--color-card))}.keyboard-hero strong{overflow:hidden;font:700 30px/1.2 var(--font-mono);text-overflow:ellipsis}.keyboard-hero code{font-size:14px}.keyboard-hero span,.keyboard-history span{padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--color-primary) 12%,transparent);color:var(--color-primary);font-size:10px;font-weight:700}.keyboard-hero span.keyup,.keyboard-history span.keyup{background:var(--color-muted);color:var(--color-muted-foreground)}.keyboard-layout{display:grid;grid-template-columns:minmax(320px,1fr) minmax(320px,1fr);gap:20px;margin-top:18px;min-height:0}.keyboard-layout>section{min-width:0}.keyboard-layout dl{grid-template-columns:max-content minmax(0,1fr);font-family:var(--font-mono);font-size:12px}.keyboard-value{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:center;gap:8px}.keyboard-value>span{min-width:0;overflow-wrap:anywhere}.keyboard-value :global(.copy-btn){height:28px;min-height:28px}.keyboard-history{max-height:330px;margin-top:12px;overflow:auto;border:1px solid var(--color-border);border-radius:8px}.keyboard-history>div{display:grid;grid-template-columns:66px minmax(60px,.6fr) minmax(100px,1fr) auto;align-items:center;gap:8px;min-height:38px;padding:5px 9px;border-bottom:1px solid var(--color-border);font-size:11px}.keyboard-history>div:last-child{border-bottom:0}.keyboard-history b,.keyboard-history code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.keyboard-history small{color:var(--color-muted-foreground)}.keyboard-empty{display:flex;flex:1;min-height:300px;align-items:center;justify-content:center;flex-direction:column;gap:9px;color:var(--color-muted-foreground);text-align:center}.keyboard-empty kbd{display:grid;width:56px;height:56px;place-items:center;border:1px solid var(--color-border);border-bottom-width:4px;border-radius:10px;background:var(--color-background);color:var(--color-foreground);font:700 22px var(--font-mono)}.keyboard-empty strong{color:var(--color-foreground);font-size:14px}.keyboard-empty span{font-size:12px}
  .suite{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px}.card,.result-panel,.playground iframe{border:1px solid var(--color-border);border-radius:10px;background:var(--color-card)}h3{margin:0;font-size:14px}.standard-layout,.workbench{display:grid;grid-template-columns:minmax(260px,.38fr) minmax(0,1fr);gap:12px;flex:1;min-height:0}.form-panel,.fields{display:flex;min-height:0;flex-direction:column;gap:12px;padding:14px}.form-panel label,.fields label,.preview-column label{display:flex;flex-direction:column;gap:6px;font-size:12px}.fields small{align-self:flex-end;color:var(--color-muted-foreground)}.field-help{margin:0;color:var(--color-muted-foreground);font-size:11px;line-height:1.55}.grow{flex:1;min-height:0}.grow textarea{height:100%;min-height:180px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}.result-panel{display:flex;min-height:320px;flex-direction:column;padding:12px}.result-panel textarea{flex:1;resize:none}.result-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.diagnostic-actions{display:flex;justify-content:flex-end;gap:8px}.diagnostic-layout{display:grid;grid-template-columns:repeat(3,minmax(260px,1fr));align-items:start;gap:12px;min-height:0}.diagnostic-card{min-width:0;overflow:hidden}.diagnostic-card-head{display:flex;min-height:44px;align-items:center;justify-content:space-between;padding:0 12px;border-bottom:1px solid var(--color-border);background:color-mix(in srgb,var(--color-muted) 45%,var(--color-card))}.diagnostic-card-head h3{display:flex;align-items:center;gap:8px}.diagnostic-icon{display:grid;width:23px;height:23px;place-items:center;border-radius:6px;background:var(--color-primary);color:var(--color-primary-foreground);font-size:12px;font-weight:700}.diagnostic-count{display:grid;min-width:28px;height:28px;padding:0 7px;place-items:center;border-radius:999px;background:var(--color-muted);color:var(--color-muted-foreground);font-size:11px}.diagnostic-row{display:grid;grid-template-columns:minmax(92px,.72fr) minmax(0,1.55fr) 30px;align-items:center;gap:10px;min-height:53px;padding:7px 12px;border-bottom:1px solid var(--color-border)}.diagnostic-row:last-child{border-bottom:0}.diagnostic-label{color:var(--color-muted-foreground);font-size:12px;font-weight:600}.diagnostic-row code{min-width:0;overflow-wrap:anywhere;color:var(--color-foreground);font:12px/1.5 var(--font-mono)}.diagnostic-row :global(.copy-btn){height:28px;min-height:28px}.diagnostic-boolean{justify-self:start;padding:3px 8px;border-radius:6px;background:color-mix(in srgb,var(--color-muted-foreground) 10%,transparent);color:var(--color-muted-foreground);font-size:11px;font-weight:700}.diagnostic-boolean.enabled{background:color-mix(in srgb,#10b981 13%,transparent);color:#059669}dl{display:grid;grid-template-columns:max-content 1fr;gap:9px 16px;margin:16px 0 0}dt{color:var(--color-muted-foreground)}dd{margin:0;overflow-wrap:anywhere}.playground-toolbar span{color:var(--color-muted-foreground);font-size:12px}.key-grid{display:grid;grid-template-columns:minmax(0,1fr) 100px;gap:1px;margin-top:18px;overflow:hidden;border:1px solid var(--color-border);border-radius:8px;background:var(--color-border)}.key-grid>*{padding:10px;background:var(--color-background)}.search{max-width:560px}.playground-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.check{display:flex;align-items:center;gap:7px}.playground{display:grid;grid-template-columns:minmax(320px,.8fr) minmax(0,1.2fr);gap:12px;flex:1;min-height:0}.playground>section:first-child{display:grid;grid-template-rows:repeat(3,1fr);gap:8px}.playground label{display:flex;min-height:0;flex-direction:column;gap:4px;font-size:12px}.playground textarea{flex:1;resize:none}.preview-stack{display:grid;grid-template-rows:minmax(320px,1fr) auto;min-height:0;gap:8px}.playground iframe{width:100%;height:100%;min-height:420px;background:white}.console{display:flex;max-height:190px;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:9px;background:var(--color-background)}.console header{display:flex;align-items:center;justify-content:space-between;padding:6px 9px;border-bottom:1px solid var(--color-border)}.console header button{border:0;background:transparent;color:var(--color-muted-foreground);cursor:pointer}.console>div{overflow:auto;padding:4px 9px}.console p{display:grid;grid-template-columns:46px 1fr;gap:8px;margin:0;padding:4px 0;border-bottom:1px solid var(--color-border);font:11px/1.4 var(--font-mono);overflow-wrap:anywhere}.console p span{color:var(--color-muted-foreground)}.console p.error-log{color:var(--color-destructive)}.console p.muted{display:block;color:var(--color-muted-foreground)}.preview-column{display:flex;min-width:0;min-height:0;flex-direction:column;gap:12px}.preview-column textarea{flex:1;resize:none}.share-preview{overflow:hidden;padding:22px;border:1px solid var(--color-border);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--color-primary) 8%,var(--color-card)),var(--color-card))}.share-preview img{display:block;width:calc(100% + 44px);height:170px;margin:-22px -22px 18px;object-fit:cover}.share-preview span,.share-preview p{color:var(--color-muted-foreground);font-size:12px}.share-preview strong{display:block;margin-top:12px;font-size:20px}.phone-workbench{width:min(960px,100%);margin:0 auto}.phone-intro{padding:22px 2px 18px}.phone-kicker{display:block;margin-bottom:8px;color:var(--color-primary);font-size:10px;font-weight:750;letter-spacing:.12em}.phone-intro h3{max-width:680px;font-size:20px;line-height:1.4}.phone-intro p{max-width:680px;margin:8px 0 0;color:var(--color-muted-foreground);font-size:12px;line-height:1.6}.phone-grid{display:grid;grid-template-columns:minmax(280px,.82fr) minmax(360px,1.18fr);gap:12px;align-items:start}.phone-form,.phone-result{padding:18px}.phone-form{display:flex;flex-direction:column;gap:14px}.phone-form label{display:flex;flex-direction:column;gap:7px;color:var(--color-muted-foreground);font-size:12px;font-weight:500}.phone-section-head{display:flex;align-items:center;gap:8px}.phone-section-head>span{display:grid;width:22px;height:22px;place-items:center;border-radius:6px;background:color-mix(in srgb,var(--color-primary) 11%,transparent);color:var(--color-primary);font-size:10px;font-weight:750}.phone-section-head strong{font-size:13px}.phone-input-wrap{position:relative}.phone-input-wrap>span{position:absolute;z-index:1;top:1px;bottom:1px;left:1px;display:flex;align-items:center;padding:0 9px;border-right:1px solid var(--color-border);border-radius:var(--radius-md) 0 0 var(--radius-md);background:var(--color-muted);color:var(--color-foreground);font-family:var(--font-mono);font-size:12px}.phone-input{height:38px;padding-left:55px!important;font-family:var(--font-mono)!important;font-size:14px!important;letter-spacing:.015em}.phone-form-actions{display:grid;grid-template-columns:1fr auto;gap:8px}.phone-form-actions .dbx-btn{height:34px}.phone-tip{margin:0;padding-top:2px;color:var(--color-muted-foreground);font-size:11px;line-height:1.6}.phone-result{min-height:330px}.phone-result-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.valid-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,var(--color-success,var(--color-primary)) 11%,transparent);color:var(--color-success,var(--color-primary));font-size:11px;font-weight:650}.valid-badge i{width:6px;height:6px;border-radius:50%;background:currentColor}.phone-primary-result{display:grid;grid-template-columns:1fr auto;gap:5px 12px;margin:18px 0 14px;padding:16px 14px;border:1px solid color-mix(in srgb,var(--color-primary) 24%,var(--color-border));border-radius:9px;background:color-mix(in srgb,var(--color-primary) 6%,var(--color-card))}.phone-primary-result>span{grid-column:1;font-size:10px;font-weight:750;letter-spacing:.08em;color:var(--color-primary)}.phone-primary-result>strong{grid-column:1;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:21px;line-height:1.35}.phone-primary-result :global(.copy-btn){grid-column:2;grid-row:1/3;align-self:center}.phone-result-list{border-top:1px solid var(--color-border)}.phone-result-list>div{display:grid;grid-template-columns:110px minmax(0,1fr) 30px;align-items:center;gap:10px;min-height:48px;border-bottom:1px solid var(--color-border)}.phone-result-list>div>span{color:var(--color-muted-foreground);font-size:11px}.phone-result-list code{overflow:hidden;color:var(--color-foreground);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.phone-result-list :global(.copy-btn){height:28px;min-height:28px}.phone-empty{display:flex;min-height:270px;align-items:center;justify-content:center;flex-direction:column;color:var(--color-muted-foreground);text-align:center}.phone-empty-icon{display:grid;width:44px;height:44px;margin-bottom:12px;place-items:center;border:1px dashed var(--color-border);border-radius:14px;background:var(--color-muted);color:var(--color-primary);font-size:22px}.phone-empty strong{color:var(--color-foreground);font-size:13px}.phone-empty span{margin-top:5px;font-size:11px}.chart-shell{display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;padding:10px;border:1px solid var(--color-border);border-radius:12px;background:color-mix(in srgb,var(--color-card) 92%,var(--color-muted))}.chart-toolbar{display:flex;align-items:center;gap:8px;min-height:48px;padding:8px 10px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card);box-shadow:0 1px 3px color-mix(in srgb,#000 6%,transparent)}.toolbar-field{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--color-muted-foreground)}.toolbar-field .dbx-input{width:190px}.toolbar-field :global(.dbx-custom-select){width:118px;min-width:118px}.color-field{padding:3px 7px;border:1px solid var(--color-border);border-radius:7px;background:var(--color-background)}.chart-color{width:28px;height:24px;padding:1px;border:0;background:transparent;cursor:pointer}.chart-actions{display:flex;gap:6px}.data-count{display:inline-flex;align-items:center;gap:6px;margin-left:auto;padding:5px 10px;border-radius:999px;background:color-mix(in srgb,var(--color-primary) 11%,transparent);color:var(--color-primary);font-size:12px;font-weight:650}.data-count i{width:7px;height:7px;border-radius:50%;background:#10b981}.chart-workbench{display:grid;grid-template-columns:minmax(300px,1fr) minmax(420px,1fr);gap:10px;flex:1;min-height:0}.chart-panel{display:flex;min-width:0;min-height:0;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.chart-panel>header,.chart-panel>footer{display:flex;align-items:center;justify-content:space-between;min-height:35px;padding:0 12px;border-bottom:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:11px}.chart-panel>header strong{color:var(--color-foreground);font-size:12px}.chart-panel>footer{min-height:29px;border-top:1px solid var(--color-border);border-bottom:0}.chart-input{flex:1;min-height:300px;resize:none;padding:16px;border:0;outline:0;background:var(--color-background);color:var(--color-foreground);font:13px/1.75 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.input-panel:focus-within{border-color:color-mix(in srgb,var(--color-primary) 65%,var(--color-border))}.chart-preview{display:grid;flex:1;min-height:300px;place-items:center;overflow:auto;padding:14px;background:#fbf9f6}.chart-preview :global(svg){display:block;width:100%;height:auto;max-height:100%}.banner{padding:9px 11px;border-radius:8px;background:var(--color-muted);font-size:12px}.banner.error{color:var(--color-destructive)}@media(max-width:1100px){.diagnostic-layout{grid-template-columns:repeat(2,minmax(260px,1fr))}}@media(max-width:900px){.chart-workbench{grid-template-columns:1fr}.chart-toolbar{align-items:flex-end;flex-wrap:wrap}.data-count{margin-left:0}.chart-panel{min-height:360px}}@media(max-width:760px){.standard-layout,.workbench,.diagnostic-layout,.playground,.phone-grid{grid-template-columns:1fr}.phone-intro{padding-top:8px}.phone-result{min-height:0}.playground iframe{min-height:420px}.playground-toolbar{align-items:flex-start;flex-direction:column}.toolbar-field.title-field{width:100%}.toolbar-field.title-field .dbx-input{flex:1;width:auto}}@media(max-width:440px){.phone-form,.phone-result{padding:14px}.phone-result-list>div{grid-template-columns:92px minmax(0,1fr) 30px}.phone-form-actions{grid-template-columns:1fr}.phone-intro h3{font-size:17px}}
  .git-reference{display:flex;min-height:0;flex:1;flex-direction:column;gap:12px}.git-toolbar{display:flex;align-items:center;gap:12px}.git-toolbar .search{height:36px;flex:1}.git-count{white-space:nowrap;color:var(--color-muted-foreground);font-size:12px}.git-categories{display:flex;flex-wrap:wrap;align-items:center;gap:7px;overflow:visible}.git-categories button{display:inline-flex;min-height:30px;flex:0 0 auto;align-items:center;justify-content:center;gap:7px;padding:0 7px 0 12px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-background);color:var(--color-muted-foreground);font-size:12px;font-weight:500;line-height:1.2;text-decoration:none;white-space:nowrap;cursor:pointer}.git-categories button b{display:grid;min-width:20px;height:20px;padding:0 5px;place-items:center;border-radius:999px;background:var(--color-muted);color:var(--color-muted-foreground);font-size:10px;font-variant-numeric:tabular-nums;line-height:1}.git-categories button:hover,.git-categories button.active{border-color:color-mix(in srgb,var(--color-primary) 55%,var(--color-border));background:color-mix(in srgb,var(--color-primary) 9%,var(--color-background));color:var(--color-primary)}.git-categories button.active b{background:color-mix(in srgb,var(--color-primary) 16%,transparent);color:var(--color-primary)}.git-categories button:focus-visible{outline:2px solid var(--color-ring,var(--color-primary));outline-offset:2px}.reference-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:12px;overflow:auto;padding:1px 1px 12px}.git-card{overflow:hidden}.git-card>header{display:flex;min-height:70px;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px;border-bottom:1px solid var(--color-border)}.git-card>header>div{min-width:0}.git-card>header h3{display:flex;align-items:center;gap:7px;font-size:15px;line-height:1.4}.git-card>header h3 span{display:grid;min-width:22px;height:22px;padding:0 6px;place-items:center;border-radius:999px;background:var(--color-muted);color:var(--color-muted-foreground);font-size:10px;font-variant-numeric:tabular-nums}.git-card>header p{margin:5px 0 0;color:var(--color-muted-foreground);font-size:12px;line-height:1.5}.git-card>header :global(.copy-btn),.git-command-copy :global(.copy-btn){width:30px;height:30px;min-height:30px}.git-command-list{display:flex;flex-direction:column}.git-command{display:flex;min-height:72px;flex-direction:column;padding:12px 14px;border-bottom:1px solid var(--color-border)}.git-command:last-child{border-bottom:0}.git-command.caution{background:color-mix(in srgb,#f59e0b 6%,var(--color-card))}.git-command-copy{display:grid;grid-template-columns:minmax(0,1fr) auto 30px;align-items:center;gap:10px}.git-command code{min-width:0;overflow:auto;padding:2px 0;color:var(--color-primary);font-size:12px;line-height:1.5;white-space:nowrap}.git-command p{margin:5px 0 0;color:var(--color-muted-foreground);font-size:12px;line-height:1.5}.git-warning{display:inline-flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,#f59e0b 12%,transparent);color:#b45309;font-size:10px;font-weight:650;line-height:1.3;white-space:nowrap}.git-empty{display:grid;min-height:220px;place-items:center;padding:24px;border:1px dashed var(--color-border);border-radius:10px;color:var(--color-muted-foreground);font-size:12px;text-align:center}
  @media(max-width:760px){.ua-layout{grid-template-columns:1fr}}
  @media(max-width:760px){.keyboard-head{flex-direction:column}.keyboard-layout{grid-template-columns:1fr}.keyboard-hero{grid-template-columns:1fr auto}.keyboard-hero code{grid-column:1}.keyboard-history>div{grid-template-columns:60px minmax(50px,.6fr) minmax(80px,1fr)}.keyboard-history small{display:none}}
  .chart-toggle{position:relative;display:inline-flex;height:30px;align-items:center;padding:0 11px;border:1px solid var(--color-border);border-radius:7px;background:var(--color-background);color:var(--color-muted-foreground);font-size:12px;font-weight:650;cursor:pointer;user-select:none;transition:border-color 120ms ease,background 120ms ease,color 120ms ease}
  .chart-toggle:hover{border-color:color-mix(in srgb,var(--color-primary) 55%,var(--color-border));color:var(--color-foreground)}
  .chart-toggle.active{border-color:color-mix(in srgb,var(--color-primary) 58%,var(--color-border));background:color-mix(in srgb,var(--color-primary) 9%,var(--color-background));color:var(--color-primary)}
  .chart-toggle input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
  .chart-toggle:has(input:focus-visible){outline:1px solid var(--color-ring,var(--color-primary));outline-offset:2px}
  .chart-actions{margin-left:auto;align-items:center}
  .save-status{color:var(--color-primary);font-size:11px;white-space:nowrap}
  .label-mode :global(.dbx-custom-select){width:102px;min-width:102px}
  .chart-preview.transparent-bg{background-color:#fff;background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-position:0 0,0 10px,10px -10px,-10px 0;background-size:20px 20px}
  .chart-preview{position:relative}.chart-preview :global([data-chart-hit]){cursor:crosshair;outline:none}.chart-preview :global([data-chart-hit] .chart-mark){transition:filter 140ms ease,opacity 140ms ease}.chart-preview :global(svg.has-active-mark [data-chart-hit]:not(.is-active) .chart-mark){opacity:.48;filter:saturate(.72)}.chart-preview :global([data-chart-hit].is-active .chart-mark){opacity:1;filter:brightness(1.18) saturate(1.14) drop-shadow(0 2px 3px rgb(0 0 0 / .2))}.chart-preview :global([data-chart-hit].is-active .chart-hit-target){fill-opacity:.16;stroke:currentColor;stroke-width:2}.chart-preview :global([data-chart-hit]:focus-visible .chart-mark){stroke:#fff;stroke-width:3}.chart-guide{position:absolute;z-index:2;pointer-events:none}.chart-guide.vertical{width:1px;background:repeating-linear-gradient(to bottom,color-mix(in srgb,var(--color-muted-foreground) 48%,transparent) 0 4px,transparent 4px 8px)}.chart-guide.horizontal{height:1px;background:repeating-linear-gradient(to right,color-mix(in srgb,var(--color-muted-foreground) 48%,transparent) 0 4px,transparent 4px 8px)}.chart-tooltip{position:absolute;z-index:3;display:flex;min-width:108px;max-width:160px;flex-direction:column;gap:8px;padding:9px 11px;border:1px solid color-mix(in srgb,var(--color-border) 82%,#000);border-radius:5px;background:var(--color-card);box-shadow:0 2px 8px color-mix(in srgb,#000 16%,transparent);color:var(--color-foreground);font-size:12px;pointer-events:none}.chart-tooltip>strong{overflow:hidden;color:var(--color-muted-foreground);font-weight:500;text-overflow:ellipsis;white-space:nowrap}.chart-tooltip>span{display:flex;align-items:center;gap:8px}.chart-tooltip i{width:10px;height:10px;flex:0 0 auto;border-radius:50%}.chart-tooltip b{font-size:13px}.chart-tooltip small{margin-left:auto;color:var(--color-muted-foreground);font-size:10px}
  .bandwidth-shell{width:min(980px,100%);margin:0 auto}.bandwidth-intro{padding:18px 2px}.bandwidth-intro>span{color:var(--color-primary);font-size:10px;font-weight:750;letter-spacing:.12em}.bandwidth-intro h3{margin-top:7px;font-size:20px}.bandwidth-intro p{margin:7px 0 0;color:var(--color-muted-foreground);font-size:12px}.bandwidth-grid{display:grid;grid-template-columns:minmax(280px,.86fr) minmax(340px,1.14fr);gap:12px}.bandwidth-form,.bandwidth-result{padding:18px}.bandwidth-form{display:flex;flex-direction:column;gap:16px}.bandwidth-form label,.field-group{display:flex;flex-direction:column;gap:7px;color:var(--color-muted-foreground);font-size:12px}.field-group>strong{color:var(--color-foreground);font-size:12px}.value-unit{display:grid;grid-template-columns:minmax(0,1fr) 118px;gap:8px}.speed-presets{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}.speed-presets button{min-height:28px;padding:3px 5px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-background);color:var(--color-muted-foreground);font-size:10px;cursor:pointer}.speed-presets button:hover,.speed-presets button.active{border-color:color-mix(in srgb,var(--color-primary) 55%,var(--color-border));background:color-mix(in srgb,var(--color-primary) 8%,var(--color-background));color:var(--color-primary)}.overhead-field>span{display:flex;justify-content:space-between}.overhead-field b{color:var(--color-primary)}.overhead-field small{line-height:1.5}.bandwidth-result{display:flex;min-height:330px;flex-direction:column}.duration-result{display:flex;flex-direction:column;gap:6px;margin:14px 0;padding:20px;border:1px solid color-mix(in srgb,var(--color-primary) 25%,var(--color-border));border-radius:10px;background:linear-gradient(135deg,color-mix(in srgb,var(--color-primary) 9%,var(--color-card)),var(--color-card))}.duration-result strong{font:700 32px/1.1 var(--font-mono)}.duration-result span,.metric-grid span,.transfer-note span{color:var(--color-muted-foreground);font-size:11px}.metric-grid{display:grid;grid-template-columns:1fr 1fr;gap:1px;overflow:hidden;border:1px solid var(--color-border);border-radius:8px;background:var(--color-border)}.metric-grid>div{display:flex;min-height:62px;flex-direction:column;justify-content:center;gap:6px;padding:11px;background:var(--color-background)}.metric-grid b,.transfer-note b{font:650 13px var(--font-mono)}.transfer-note{display:flex;justify-content:space-between;gap:12px;margin-top:12px;padding:10px;border-radius:7px;background:var(--color-muted)}.bandwidth-empty{display:flex;flex:1;align-items:center;justify-content:center;flex-direction:column;gap:7px;color:var(--color-muted-foreground);text-align:center}.bandwidth-empty strong{font-size:28px}.bandwidth-shell>.banner{margin-top:12px}
  @media(max-width:900px){.chart-actions{margin-left:auto}}
  @media(max-width:760px){.bandwidth-grid{grid-template-columns:1fr}.bandwidth-result{min-height:0}}
  @media(max-width:440px){.speed-presets{grid-template-columns:1fr 1fr}.value-unit{grid-template-columns:minmax(0,1fr) 104px}.metric-grid{grid-template-columns:1fr}.duration-result strong{font-size:26px}}
  .diagnostic-icon{width:24px;height:24px;border:1px solid color-mix(in srgb,var(--color-primary) 22%,var(--color-border));border-radius:7px;background:color-mix(in srgb,var(--color-primary) 9%,var(--color-card));color:var(--color-primary)}
  .diagnostic-icon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  @media(min-width:1101px){
    .diagnostic-layout{grid-template-columns:repeat(6,minmax(0,1fr));align-items:stretch}
    .diagnostic-card{grid-column:span 2}
    .diagnostic-card--region,.diagnostic-card--capabilities{grid-column:span 3}
  }
  @media(min-width:761px) and (max-width:1100px){
    .diagnostic-layout{align-items:stretch}
    .diagnostic-card--capabilities{grid-column:1/-1}
  }
  .meta-output{display:flex;flex-direction:column}.meta-output textarea{height:auto;flex:1;min-height:180px;resize:none}
</style>
