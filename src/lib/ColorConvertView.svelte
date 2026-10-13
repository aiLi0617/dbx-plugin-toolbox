<script>
  import { onMount } from "svelte";
  import { copyText } from "./clipboard.js";
  import { chrome, pick } from "./i18n.js";
  import ColorWheelPicker from "./ColorWheelPicker.svelte";
  import Select from "./Select.svelte";
  import {
    bestMonochromeContrastColor,
    evaluateEffectiveWcagContrast,
    formatColorValue,
    formatEditableColorValue,
    formatRgbaCss,
    formatRgbaHex,
    isLargeText,
    parseRgbaColor,
    suggestContrastColor,
  } from "./colorContrast.js";
  import {
    clampByte,
    cmykToRgb,
    formatRgbColor,
    hslToRgb,
    hsvToRgb,
    parseHexColor,
    rgbToHsv,
  } from "./tools/convert.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const initial = formatRgbColor(255, 87, 51);
  const HISTORY_KEY = "dbx-toolbox-color-contrast-history-v1";

  let rgb = $state({ r: initial.r, g: initial.g, b: initial.b });
  let foregroundAlpha = $state(1);
  let hex = $state(initial.hexBody);
  let rgbIn = $state({ r: String(initial.r), g: String(initial.g), b: String(initial.b) });
  let cmykIn = $state({
    c: String(initial.cmyk.c),
    m: String(initial.cmyk.m),
    y: String(initial.cmyk.y),
    k: String(initial.cmyk.k),
  });
  let hsvIn = $state({
    h: String(initial.hsv.h),
    s: String(initial.hsv.s),
    v: String(initial.hsv.v),
  });
  let invalid = $state("");
  let copied = $state("");
  let hsvLive = $state({ h: initial.hsv.h, s: initial.hsv.s, v: initial.hsv.v });
  let colorInputEl = $state(null);
  let picking = $state(false);
  let pickHint = $state("");
  let contrastHex = $state("FFFFFF");
  let contrastColor = $state(parseRgbaColor("FFFFFF"));
  let contrastInvalid = $state(false);
  let canvasHex = $state("FFFFFF");
  let canvasInvalid = $state(false);
  let fixRole = $state("foreground");
  let copyFormat = $state("hex");
  let fontSize = $state("16");
  let fontUnit = $state("px");
  let fontWeight = $state("400");
  let colorHistory = $state([]);
  let historyTimer;

  const fmt = $derived(rgb ? formatRgbColor(rgb.r, rgb.g, rgb.b) : null);
  const foregroundColor = $derived(rgb ? { ...rgb, a: foregroundAlpha } : null);
  const contrastBackground = $derived(contrastInvalid ? null : contrastColor);
  const canvasColor = $derived(parseRgbaColor(canvasHex));
  const contrast = $derived(
    foregroundColor && contrastBackground && canvasColor
      ? evaluateEffectiveWcagContrast(foregroundColor, contrastBackground, canvasColor)
      : null,
  );
  const monochromeSuggestion = $derived(
    foregroundColor && contrastBackground && canvasColor
      ? bestMonochromeContrastColor(foregroundColor, contrastBackground, fixRole, canvasColor)
      : null,
  );
  const largeText = $derived(isLargeText(fontSize, fontUnit, fontWeight));
  const aaTarget = $derived(largeText ? 3 : 4.5);
  const aaaTarget = $derived(largeText ? 4.5 : 7);
  const currentTextAa = $derived(Boolean(contrast && contrast.ratio >= aaTarget));
  const currentTextAaa = $derived(Boolean(contrast && contrast.ratio >= aaaTarget));
  const previewFontSize = $derived(`${Number(fontSize) || 16}${fontUnit}`);
  const aaSuggestion = $derived(
    foregroundColor && contrastBackground && canvasColor
      ? suggestContrastColor(foregroundColor, contrastBackground, aaTarget, fixRole, canvasColor)
      : null,
  );
  const aaaSuggestion = $derived(
    foregroundColor && contrastBackground && canvasColor
      ? suggestContrastColor(foregroundColor, contrastBackground, aaaTarget, fixRole, canvasColor)
      : null,
  );
  const hsvCss = $derived(`hsv(${Math.round(hsvLive.h)}°, ${Math.round(hsvLive.s)}%, ${Math.round(hsvLive.v)}%)`);
  const copies = $derived(
    fmt
      ? {
          hex: foregroundColor ? formatRgbaHex(foregroundColor) : fmt.hex,
          rgb: foregroundColor ? formatRgbaCss(foregroundColor) : fmt.rgbCss,
          cmyk: fmt.cmykCss,
          hsv: hsvCss,
          foreground: foregroundColor ? formatColorValue(foregroundColor, copyFormat) : "",
          foregroundCss: foregroundColor ? formatColorValue(foregroundColor, copyFormat) : "",
          background: contrastBackground ? formatColorValue(contrastBackground, copyFormat) : "",
          backgroundCss: contrastBackground ? formatColorValue(contrastBackground, copyFormat) : "",
          css: foregroundColor ? `${formatRgbaHex(foregroundColor)}\n${formatRgbaCss(foregroundColor)}\n${fmt.hslCss}` : "",
          variables: foregroundColor && contrastBackground && contrast
            ? `--color-foreground: ${formatColorValue(foregroundColor, copyFormat)};\n--color-background: ${formatColorValue(contrastBackground, copyFormat)};${contrastBackground.a < 1 && canvasColor ? `\n--color-canvas: ${formatColorValue({ ...canvasColor, a: 1 }, copyFormat)};` : ""}\n/* Contrast: ${contrast.ratio.toFixed(2)}:1 */`
            : "",
        }
      : null,
  );

  function parseNumber(text, min, max) {
    const raw = String(text ?? "").trim();
    if (!raw) return { empty: true };
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return { invalid: true };
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max) return { invalid: true };
    return { value: n };
  }

  function parseColorText(text) {
    const raw = String(text ?? "").trim();
    const asRgb = parseRgbaColor(raw);
    if (asRgb) return asRgb;
    const hslMatch = raw.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
    if (hslMatch) {
      const h = Number(hslMatch[1]);
      const s = Number(hslMatch[2]);
      const l = Number(hslMatch[3]);
      if (h <= 360 && s <= 100 && l <= 100) return hslToRgb(h, s / 100, l / 100);
    }
    return null;
  }

  function preserveHsv(hsv) {
    let { h, s, v } = hsv;
    if (v < 0.5) {
      h = hsvLive.h;
      s = hsvLive.s;
    } else if (s < 0.5) {
      h = hsvLive.h;
    }
    return { h, s, v };
  }

  function applyRgb(next, except, live) {
    rgb = { r: clampByte(next.r), g: clampByte(next.g), b: clampByte(next.b) };
    if (next.a != null) foregroundAlpha = Math.max(0, Math.min(1, Number(next.a)));
    invalid = "";
    copied = "";
    const f = formatRgbColor(rgb.r, rgb.g, rgb.b);
    if (except !== "hex") hex = formatRgbaHex({ ...rgb, a: foregroundAlpha }).slice(1);
    if (except !== "rgb") rgbIn = { r: String(f.r), g: String(f.g), b: String(f.b) };
    if (except !== "cmyk") {
      cmykIn = { c: String(f.cmyk.c), m: String(f.cmyk.m), y: String(f.cmyk.y), k: String(f.cmyk.k) };
    }
    if (live) hsvLive = live;
    else hsvLive = preserveHsv(rgbToHsv(rgb.r, rgb.g, rgb.b));
    if (except !== "hsv") {
      hsvIn = {
        h: String(Math.round(hsvLive.h)),
        s: String(Math.round(hsvLive.s)),
        v: String(Math.round(hsvLive.v)),
      };
    }
    queueHistory();
  }

  function applyFromWheel(next) {
    applyRgb(hsvToRgb(next.h, next.s, next.v), "wheel", next);
  }

  function updateHex(text) {
    const next = String(text ?? "").replace(/^#+/, "");
    hex = next;
    copied = "";
    if (!next.trim()) {
      clearAll(false);
      return;
    }
    const asColor = parseColorText(next);
    if (asColor) {
      applyRgb(asColor, "hex");
      return;
    }
    invalid = "hex";
  }

  function updateGroup(id, fields, convert) {
    copied = "";
    let empty = 0;
    const values = {};
    for (const field of fields) {
      const parsed = parseNumber(field.value, field.min, field.max);
      if (parsed.empty) {
        empty += 1;
        continue;
      }
      if (parsed.invalid) {
        invalid = id;
        return;
      }
      values[field.key] = parsed.value;
    }
    if (empty) {
      invalid = empty === fields.length ? "" : id;
      return;
    }
    applyRgb(convert(values), id, id === "hsv" ? { h: values.h, s: values.s, v: values.v } : undefined);
  }

  function updateRgb(key, text) {
    rgbIn = { ...rgbIn, [key]: text };
    updateGroup("rgb", [
      { key: "r", value: key === "r" ? text : rgbIn.r, min: 0, max: 255 },
      { key: "g", value: key === "g" ? text : rgbIn.g, min: 0, max: 255 },
      { key: "b", value: key === "b" ? text : rgbIn.b, min: 0, max: 255 },
    ], (v) => ({ r: v.r, g: v.g, b: v.b }));
  }

  function updateCmyk(key, text) {
    cmykIn = { ...cmykIn, [key]: text };
    updateGroup("cmyk", [
      { key: "c", value: key === "c" ? text : cmykIn.c, min: 0, max: 100 },
      { key: "m", value: key === "m" ? text : cmykIn.m, min: 0, max: 100 },
      { key: "y", value: key === "y" ? text : cmykIn.y, min: 0, max: 100 },
      { key: "k", value: key === "k" ? text : cmykIn.k, min: 0, max: 100 },
    ], (v) => cmykToRgb(v.c, v.m, v.y, v.k));
  }

  function updateHsv(key, text) {
    hsvIn = { ...hsvIn, [key]: text };
    updateGroup("hsv", [
      { key: "h", value: key === "h" ? text : hsvIn.h, min: 0, max: 360 },
      { key: "s", value: key === "s" ? text : hsvIn.s, min: 0, max: 100 },
      { key: "v", value: key === "v" ? text : hsvIn.v, min: 0, max: 100 },
    ], (v) => hsvToRgb(v.h, v.s, v.v));
  }

  function clearAll(resetCopied = true) {
    rgb = null;
    foregroundAlpha = 1;
    invalid = "";
    if (resetCopied) copied = "";
    hex = "";
    rgbIn = { r: "", g: "", b: "" };
    cmykIn = { c: "", m: "", y: "", k: "" };
    hsvIn = { h: "", s: "", v: "" };
  }

  async function copy(id, text) {
    if (!text) return;
    try {
      await copyText(text);
      copied = id;
      setTimeout(() => {
        if (copied === id) copied = "";
      }, 1200);
    } catch {
      copied = "";
    }
  }

  function actionLabel(id, zh, en) {
    if (copied === id) return t(chrome.copied.zh, chrome.copied.en);
    return t(zh, en);
  }

  function applyPickedHex(value) {
    const parsed = parseHexColor(value);
    if (!parsed) return;
    applyRgb(parsed, null);
  }

  async function pickColor() {
    pickHint = "";
    if (typeof window.EyeDropper === "function") {
      picking = true;
      try {
        const result = await new window.EyeDropper().open();
        applyPickedHex(result?.sRGBHex);
      } catch (err) {
        if (err?.name !== "AbortError") {
          pickHint = t("屏幕取色不可用，已打开系统调色板", "Eyedropper unavailable; opened the system color picker");
          colorInputEl?.click();
        }
      } finally {
        picking = false;
      }
      return;
    }
    if (colorInputEl) {
      colorInputEl.click();
      return;
    }
    pickHint = t("当前环境不支持取色", "Color picking is not available here");
  }

  function onNativeColorInput(event) {
    applyPickedHex(event.currentTarget.value);
  }

  function updateContrastHex(text) {
    contrastHex = String(text ?? "").trim();
    const parsed = parseRgbaColor(contrastHex);
    contrastInvalid = !parsed;
    if (parsed) contrastColor = parsed;
    queueHistory();
  }

  function normalizeContrastInput() {
    const color = parseRgbaColor(contrastHex);
    if (!color) return;
    contrastColor = color;
    contrastHex = formatEditableColorValue(color, copyFormat);
    contrastInvalid = false;
  }

  function updateCopyFormat(format) {
    const background = contrastBackground;
    copyFormat = format;
    if (background) contrastHex = formatEditableColorValue(background, format);
  }

  function onContrastColorInput(event) {
    const current = contrastBackground;
    contrastColor = { ...parseRgbaColor(event.currentTarget.value), a: current?.a ?? 1 };
    contrastHex = formatEditableColorValue(contrastColor, copyFormat);
    contrastInvalid = false;
    queueHistory();
  }

  function updateForegroundAlpha(value) {
    foregroundAlpha = Math.max(0, Math.min(1, Number(value) / 100));
    hex = formatRgbaHex({ ...rgb, a: foregroundAlpha }).slice(1);
    queueHistory();
  }

  function updateBackgroundAlpha(value) {
    if (!contrastBackground) return;
    contrastColor = { ...contrastBackground, a: Math.max(0, Math.min(1, Number(value) / 100)) };
    contrastHex = formatEditableColorValue(contrastColor, copyFormat);
    contrastInvalid = false;
    queueHistory();
  }

  function updateCanvasHex(text) {
    canvasHex = String(text ?? "").trim();
    const parsed = parseRgbaColor(canvasHex);
    canvasInvalid = !parsed || parsed.a < 1;
    queueHistory();
  }

  function swapContrastColors() {
    if (!fmt || !contrastBackground) return;
    const nextForeground = contrastBackground;
    contrastColor = foregroundColor;
    contrastHex = formatEditableColorValue(contrastColor, copyFormat);
    contrastInvalid = false;
    applyRgb(nextForeground, null);
  }

  function applyRoleColor(color, role = fixRole) {
    if (!color) return;
    if (role === "foreground") applyRgb(color, null);
    else {
      contrastColor = color;
      contrastHex = formatEditableColorValue(contrastColor, copyFormat);
      contrastInvalid = false;
      queueHistory();
    }
  }

  function applyContrastSuggestion(suggestion, role = fixRole) {
    if (!suggestion?.color) return;
    applyRoleColor(suggestion.color, role);
  }

  function queueHistory() {
    if (typeof window === "undefined") return;
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      if (!foregroundColor || !contrastBackground || !canvasColor || contrastInvalid || canvasInvalid) return;
      const item = {
        foreground: formatRgbaHex(foregroundColor),
        background: formatRgbaHex(contrastBackground),
        canvas: formatRgbaHex({ ...canvasColor, a: 1 }),
      };
      const key = `${item.foreground}|${item.background}|${item.canvas}`;
      colorHistory = [item, ...colorHistory.filter((entry) => `${entry.foreground}|${entry.background}|${entry.canvas}` !== key)].slice(0, 6);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(colorHistory)); } catch { /* ignore unavailable storage */ }
    }, 650);
  }

  function restoreHistory(item) {
    const foreground = parseRgbaColor(item.foreground);
    const background = parseRgbaColor(item.background);
    if (!foreground || !background) return;
    contrastColor = background;
    contrastHex = formatEditableColorValue(contrastColor, copyFormat);
    canvasHex = item.canvas.slice(1);
    contrastInvalid = false;
    canvasInvalid = false;
    applyRgb(foreground, null);
  }

  function clearHistory() {
    colorHistory = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore unavailable storage */ }
  }

  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) {
        colorHistory = saved.filter((item) => parseRgbaColor(item?.foreground) && parseRgbaColor(item?.background) && parseRgbaColor(item?.canvas)).slice(0, 6);
      }
    } catch { colorHistory = []; }
    return () => clearTimeout(historyTimer);
  });
</script>

{#snippet glyphCheck()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5"></path>
  </svg>
{/snippet}

{#snippet glyphCopy()}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
  </svg>
{/snippet}

{#snippet copyIcon(id, text, zh, en)}
  {@const done = copied === id}
  <button
    class="dbx-btn dbx-btn--ghost icon-btn"
    disabled={!text}
    onclick={() => copy(id, text)}
    title={actionLabel(id, zh, en)}
    aria-label={actionLabel(id, zh, en)}
    type="button"
  >
    {#if done}{@render glyphCheck()}{:else}{@render glyphCopy()}{/if}
  </button>
{/snippet}

{#snippet previewLine(id, label, text)}
  {@const done = copied === id}
  <button
    class="preview-line"
    class:copied={done}
    onclick={() => copy(id, text)}
    title={done ? t(chrome.copied.zh, chrome.copied.en) : t(`复制 ${label}`, `Copy ${label}`)}
    type="button"
  >
    <span class="preview-line-label">{label}</span>
    <code>{text}</code>
  </button>
{/snippet}

<div class="color-workbench">
  <div class="color-grid">
      <section class="dbx-card color-card" class:invalid={invalid === "hex"}>
        <div class="card-head">
          <h3 class="card-title">{t("16进制 (HEX)", "HEX")}</h3>
          {@render copyIcon("hex", copies?.hex, "复制HEX", "Copy HEX")}
        </div>
        <div class="card-body">
          <div class="chan">
            <span class="hex-spacer" aria-hidden="true">R</span>
            <div class="hex-field" class:invalid={invalid === "hex"}>
              {#if !/^rgba?\(/i.test(hex)}<span class="hex-prefix">#</span>{/if}
              <input
                class="hex-input"
                spellcheck="false"
                autocomplete="off"
                aria-label={t("十六进制颜色值", "HEX color value")}
                value={hex}
                onfocus={(event) => event.currentTarget.select()}
                oninput={(event) => updateHex(event.currentTarget.value)}
              />
            </div>
            <label class="alpha-control">
              <span>{t("透明度", "Opacity")} {Math.round(foregroundAlpha * 100)}%</span>
              <input type="range" min="0" max="100" step="1" value={foregroundAlpha * 100} oninput={(event) => updateForegroundAlpha(event.currentTarget.value)} />
            </label>
          </div>
        </div>
        <p class="card-hint">{t("支持 HEX、8 位 HEX 与 RGBA", "Supports HEX, 8-digit HEX, and RGBA")}</p>
      </section>

      <section class="dbx-card color-card" class:invalid={invalid === "rgb"}>
        <div class="card-head">
          <h3 class="card-title">RGB</h3>
          {@render copyIcon("rgb", copies?.rgb, "复制RGB", "Copy RGB")}
        </div>
        <div class="card-body">
          <div class="chan-row">
            <label class="chan">
              <span>R</span>
              <input class="dbx-input chan-input" inputmode="numeric" autocomplete="off" value={rgbIn.r} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateRgb("r", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>G</span>
              <input class="dbx-input chan-input" inputmode="numeric" autocomplete="off" value={rgbIn.g} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateRgb("g", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>B</span>
              <input class="dbx-input chan-input" inputmode="numeric" autocomplete="off" value={rgbIn.b} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateRgb("b", e.currentTarget.value)} />
            </label>
          </div>
        </div>
        <p class="card-hint">{t("范围: 0-255", "Range: 0-255")}</p>
      </section>

      <section class="dbx-card color-card" class:invalid={invalid === "cmyk"}>
        <div class="card-head">
          <h3 class="card-title">CMYK</h3>
          {@render copyIcon("cmyk", copies?.cmyk, "复制CMYK", "Copy CMYK")}
        </div>
        <div class="card-body">
          <div class="chan-row four">
            <label class="chan">
              <span>C</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={cmykIn.c} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateCmyk("c", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>M</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={cmykIn.m} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateCmyk("m", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>Y</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={cmykIn.y} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateCmyk("y", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>K</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={cmykIn.k} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateCmyk("k", e.currentTarget.value)} />
            </label>
          </div>
        </div>
        <p class="card-hint">{t("范围: 0-100%", "Range: 0-100%")}</p>
      </section>

      <section class="dbx-card color-card" class:invalid={invalid === "hsv"}>
        <div class="card-head">
          <h3 class="card-title">HSV</h3>
          {@render copyIcon("hsv", copies?.hsv, "复制HSV", "Copy HSV")}
        </div>
        <div class="card-body">
          <div class="chan-row">
            <label class="chan">
              <span>H</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={hsvIn.h} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateHsv("h", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>S</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={hsvIn.s} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateHsv("s", e.currentTarget.value)} />
            </label>
            <label class="chan">
              <span>V</span>
              <input class="dbx-input chan-input" inputmode="decimal" autocomplete="off" value={hsvIn.v} onfocus={(e) => e.currentTarget.select()} oninput={(e) => updateHsv("v", e.currentTarget.value)} />
            </label>
          </div>
        </div>
        <p class="card-hint">{t("H: 0-360°, S/V: 0-100%", "H: 0-360°, S/V: 0-100%")}</p>
      </section>

      <section class="dbx-card color-card contrast-card" class:invalid={contrastInvalid || canvasInvalid}>
        <div class="card-head contrast-head">
          <h3 class="card-title">{t("WCAG 对比度", "WCAG contrast")}</h3>
          <div class="copy-format">
            <span>{t("复制格式", "Copy format")}</span>
            <Select
              class="copy-format-select"
              value={copyFormat}
              onchange={updateCopyFormat}
              ariaLabel={t("颜色复制格式", "Color copy format")}
              options={[
                { value: "hex", label: "HEX" },
                { value: "rgb", label: "RGB(A)" },
                { value: "hsl", label: "HSL(A)" },
              ]}
            />
          </div>
          {@render copyIcon("variables", copies?.variables, "复制 CSS 变量", "Copy CSS variables")}
          <button
            class="dbx-btn dbx-btn--ghost swap-btn"
            disabled={!contrast}
            onclick={swapContrastColors}
            type="button"
            title={t("交换前景色与背景色", "Swap foreground and background")}
            aria-label={t("交换前景色与背景色", "Swap foreground and background")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="m7 16-4-4 4-4"></path>
              <path d="M3 12h18"></path>
              <path d="m17 8 4 4-4 4"></path>
            </svg>
            {t("交换", "Swap")}
          </button>
        </div>

        <div class="contrast-colors">
          <div class="contrast-color">
            <span>{t("前景色", "Foreground")}</span>
            <div class="contrast-value">
              <i class="checker" style:background={foregroundColor ? formatRgbaCss(foregroundColor) : "transparent"}></i>
              <code>{copies?.foreground || "—"}</code>
              {@render copyIcon("foreground", copies?.foregroundCss, "复制前景色", "Copy foreground")}
            </div>
            <label class="alpha-control">
              <span>{t("透明度", "Opacity")} {Math.round(foregroundAlpha * 100)}%</span>
              <input type="range" min="0" max="100" step="1" value={foregroundAlpha * 100} oninput={(event) => updateForegroundAlpha(event.currentTarget.value)} />
            </label>
          </div>
          <label class="contrast-color">
            <span>{t("背景色", "Background")}</span>
            <div class="contrast-input" class:invalid={contrastInvalid}>
              <input
                class="contrast-native-color"
                type="color"
                value={contrastBackground ? formatRgbaHex(contrastBackground).slice(0, 7) : "#FFFFFF"}
                oninput={onContrastColorInput}
                aria-label={t("选择背景色", "Choose background color")}
              />
              {#if /^[\da-f]{0,8}$/i.test(contrastHex)}<span aria-hidden="true">#</span>{/if}
              <input
                class="contrast-hex-input"
                spellcheck="false"
                autocomplete="off"
                value={contrastHex}
                onfocus={(event) => event.currentTarget.select()}
                onblur={normalizeContrastInput}
                oninput={(event) => updateContrastHex(event.currentTarget.value)}
                aria-label={t("背景色值", "Background color value")}
              />
              {@render copyIcon("background", copies?.backgroundCss, "复制背景色", "Copy background")}
            </div>
            <label class="alpha-control">
              <span>{t("透明度", "Opacity")} {Math.round((contrastBackground?.a ?? 1) * 100)}%</span>
              <input type="range" min="0" max="100" step="1" value={(contrastBackground?.a ?? 1) * 100} disabled={!contrastBackground} oninput={(event) => updateBackgroundAlpha(event.currentTarget.value)} />
            </label>
          </label>
        </div>

        {#if contrastBackground && contrastBackground.a < 1}
          <label class="canvas-control">
            <span>{t("画布底色（用于合成透明背景）", "Canvas color for compositing the transparent background")}</span>
            <div class="contrast-input" class:invalid={canvasInvalid}>
              <span aria-hidden="true">#</span>
              <input class="contrast-hex-input" value={canvasHex} onfocus={(event) => event.currentTarget.select()} oninput={(event) => updateCanvasHex(event.currentTarget.value)} aria-label={t("画布底色", "Canvas color")} />
            </div>
          </label>
        {/if}

        <div class="type-controls">
          <label>
            <span>{t("字号", "Font size")}</span>
            <input class="dbx-input" type="number" min="1" max="256" step="0.1" bind:value={fontSize} />
          </label>
          <label>
            <span>{t("单位", "Unit")}</span>
            <select class="dbx-input" bind:value={fontUnit}><option value="px">px</option><option value="pt">pt</option><option value="rem">rem</option></select>
          </label>
          <label>
            <span>{t("字重", "Weight")}</span>
            <select class="dbx-input" bind:value={fontWeight}><option value="400">400</option><option value="500">500</option><option value="600">600</option><option value="700">700</option><option value="800">800</option><option value="900">900</option></select>
          </label>
          <div class="type-classification">
            <span>{t("自动分类", "Classification")}</span>
            <strong>{largeText ? t("大文本", "Large text") : t("普通文本", "Normal text")}</strong>
          </div>
        </div>

        {#if contrast}
          <div class="contrast-canvas" style:background-color={formatRgbaCss({ ...canvasColor, a: 1 })}>
            <div class="contrast-sample" style:color={formatRgbaCss(foregroundColor)} style:background-color={formatRgbaCss(contrastBackground)}>
              <strong style:font-size={previewFontSize} style:font-weight={fontWeight}>{t("示例文本 Aa", "Sample text Aa")}</strong>
              <span>{t("透明颜色按当前画布底色合成后计算", "Transparent colors are composited over the selected canvas")}</span>
            </div>
          </div>
          <div class="contrast-result" aria-live="polite">
            <div class="contrast-ratio">
              <strong>{contrast.ratio.toFixed(2)}:1</strong>
              <span>{t("对比度", "Contrast ratio")}</span>
            </div>
            <div class="contrast-checks">
              <span class:pass={currentTextAa}>{t("当前文字 AA", "Current text AA")} <b>{currentTextAa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={currentTextAaa}>{t("当前文字 AAA", "Current text AAA")} <b>{currentTextAaa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={contrast.normalAa}>{t("普通文本 AA", "Normal text AA")} <b>{contrast.normalAa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={contrast.normalAaa}>{t("普通文本 AAA", "Normal text AAA")} <b>{contrast.normalAaa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={contrast.largeAa}>{t("大文本 AA", "Large text AA")} <b>{contrast.largeAa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={contrast.largeAaa}>{t("大文本 AAA", "Large text AAA")} <b>{contrast.largeAaa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
              <span class:pass={contrast.nonTextAa}>{t("UI / 图形 AA", "UI / graphics AA")} <b>{contrast.nonTextAa ? t("通过", "Pass") : t("未通过", "Fail")}</b></span>
            </div>
          </div>
          <div class="contrast-actions">
            <div class="contrast-actions-head">
              <strong>{t("快速建议", "Quick suggestions")}</strong>
              <div class="fix-role" role="group" aria-label={t("修正对象", "Color to adjust")}>
                <button class:active={fixRole === "foreground"} type="button" onclick={() => fixRole = "foreground"}>{t("修正前景色", "Adjust foreground")}</button>
                <button class:active={fixRole === "background"} type="button" onclick={() => fixRole = "background"}>{t("修正背景色", "Adjust background")}</button>
              </div>
            </div>
            <div class="contrast-action-grid">
              <button
                class="contrast-action"
                type="button"
                onclick={() => applyRoleColor(monochromeSuggestion.color, fixRole)}
              >
                <i style:background-color={formatRgbaCss(monochromeSuggestion.color)}></i>
                <span>
                  <b>{fixRole === "foreground"
                    ? (monochromeSuggestion.name === "black" ? t("推荐黑色前景", "Use black foreground") : t("推荐白色前景", "Use white foreground"))
                    : (monochromeSuggestion.name === "black" ? t("推荐黑色背景", "Use black background") : t("推荐白色背景", "Use white background"))}</b>
                  <small>{monochromeSuggestion.ratio.toFixed(2)}:1</small>
                </span>
              </button>
              <button
                class="contrast-action"
                class:complete={!aaSuggestion?.changed}
                type="button"
                disabled={!aaSuggestion || !aaSuggestion.changed}
                onclick={() => applyContrastSuggestion(aaSuggestion, fixRole)}
              >
                <i style:background-color={aaSuggestion ? formatRgbaCss(aaSuggestion.color) : "transparent"}></i>
                <span>
                  <b>{aaSuggestion?.changed ? t("修正到当前文字 AA", "Fix current text to AA") : t("当前文字已满足 AA", "Current text already passes AA")}</b>
                  <small>{aaSuggestion ? `${formatRgbaHex(aaSuggestion.color)} · ${aaSuggestion.ratio.toFixed(2)}:1` : t("保持透明度时无法达到", "Not reachable while preserving opacity")}</small>
                </span>
              </button>
              <button
                class="contrast-action"
                class:complete={!aaaSuggestion?.changed}
                type="button"
                disabled={!aaaSuggestion || !aaaSuggestion.changed}
                onclick={() => applyContrastSuggestion(aaaSuggestion, fixRole)}
              >
                <i style:background-color={aaaSuggestion ? formatRgbaCss(aaaSuggestion.color) : "transparent"}></i>
                <span>
                  <b>{aaaSuggestion?.changed ? t("修正到当前文字 AAA", "Fix current text to AAA") : t("当前文字已满足 AAA", "Current text already passes AAA")}</b>
                  <small>{aaaSuggestion ? `${formatRgbaHex(aaaSuggestion.color)} · ${aaaSuggestion.ratio.toFixed(2)}:1` : t("保持透明度时无法达到", "Not reachable while preserving opacity")}</small>
                </span>
              </button>
            </div>
          </div>
          {#if colorHistory.length}
            <div class="contrast-history">
              <div class="contrast-actions-head">
                <strong>{t("最近颜色组合", "Recent color pairs")}</strong>
                <button class="history-clear" type="button" onclick={clearHistory}>{t("清空", "Clear")}</button>
              </div>
              <div class="history-list">
                {#each colorHistory as item}
                  <button type="button" onclick={() => restoreHistory(item)} title={t("恢复此颜色组合", "Restore this color pair")}>
                    <span class="history-swatch" style:background-color={item.canvas}>
                      <i style:background-color={formatRgbaCss(parseRgbaColor(item.background))}><b style:background-color={formatRgbaCss(parseRgbaColor(item.foreground))}></b></i>
                    </span>
                    <code>{item.foreground}<br />{item.background}</code>
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {:else}
          <p class="contrast-error">{t("请输入有效的 HEX、8 位 HEX 或 RGBA 颜色；画布底色必须不透明", "Enter valid HEX, 8-digit HEX, or RGBA colors; the canvas must be opaque")}</p>
        {/if}
      </section>
  </div>

  <section class="dbx-card color-preview">
    <div class="card-head">
      <h3 class="card-title">{t("色环选择", "Color wheel")}</h3>
      <button
        class="dbx-btn dbx-btn--ghost icon-btn"
        disabled={picking}
        onclick={pickColor}
        title={t("吸取颜色", "Pick color")}
        aria-label={t("吸取颜色", "Pick color")}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m12 9-8.414 8.414A2 2 0 0 0 3 18.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 3.828 21h1.344a2 2 0 0 0 1.414-.586L15 12"></path>
          <path d="m18 9 .4.4a1 1 0 1 1-3 3l-3.8-3.8a1 1 0 1 1 3-3l.4.4 3.4-3.4a1 1 0 1 1 3 3z"></path>
          <path d="m2 22 .414-.414"></path>
        </svg>
      </button>
      <button
        class="dbx-btn dbx-btn--ghost icon-btn"
        onclick={() => clearAll()}
        title={t("清空", "Clear")}
        aria-label={t("清空", "Clear")}
        type="button"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"></path>
          <path d="m5.082 11.09 8.828 8.828"></path>
        </svg>
      </button>
      <input
        bind:this={colorInputEl}
        class="native-color"
        type="color"
        value={fmt?.hex || "#000000"}
        oninput={onNativeColorInput}
        tabindex="-1"
        aria-hidden="true"
      />
    </div>
    {#if pickHint}
      <p class="pick-hint">{pickHint}</p>
    {/if}
    <ColorWheelPicker
      h={hsvLive.h}
      s={hsvLive.s}
      v={hsvLive.v}
      previewHex={fmt?.hex || ""}
      {locale}
      onChange={applyFromWheel}
    />
    <div class="preview-meta">
      <div class="preview-heading">
        <p class="preview-heading-text">{t("当前颜色值", "Current values")}</p>
        {#if copies}
          {@render copyIcon("css", copies.css, "复制 CSS", "Copy CSS")}
        {/if}
      </div>
      {#if copies}
        {@render previewLine("hex", "HEX", copies.hex)}
        {@render previewLine("rgb", "RGB", copies.rgb)}
        {@render previewLine("cmyk", "CMYK", copies.cmyk)}
        {@render previewLine("hsv", "HSV", copies.hsv)}
      {:else}
        <p class="preview-empty">{t("吸取屏幕颜色、拖动色环，或在左侧输入", "Pick from the screen, drag the wheel, or type on the left")}</p>
      {/if}
    </div>
  </section>
</div>

<style>
  .color-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
    gap: 12px;
    align-items: start;
    min-width: 0;
    max-width: 1040px;
  }
  .color-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    min-width: 0;
  }
  .color-card,
  .color-preview {
    min-width: 0;
  }
  .color-card {
    display: flex;
    flex-direction: column;
  }
  .color-card.invalid {
    border-color: var(--color-destructive);
  }
  .contrast-card {
    grid-column: 1 / -1;
  }
  .contrast-head {
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .copy-format {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 10px;
    white-space: nowrap;
  }
  .copy-format :global(.copy-format-select) {
    width: 82px;
    min-width: 82px;
  }
  .swap-btn {
    min-height: 28px;
    gap: 5px;
    padding: 0 8px;
    font-size: 11px;
  }
  .contrast-colors {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .contrast-color {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 11px;
  }
  .alpha-control {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    margin-top: 3px;
  }
  .alpha-control > span {
    font-size: 10px;
    white-space: nowrap;
  }
  .alpha-control input[type="range"] {
    width: 100%;
    min-width: 0;
    accent-color: var(--color-primary);
  }
  .contrast-value,
  .contrast-input {
    display: flex;
    min-width: 0;
    height: 32px;
    align-items: center;
    border: 1px solid var(--color-input, var(--color-border));
    border-radius: var(--radius-md, 8px);
    background: var(--color-background, Canvas);
  }
  .contrast-value i {
    width: 18px;
    height: 18px;
    margin: 0 8px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    border-radius: 5px;
  }
  .contrast-value .icon-btn,
  .contrast-input .icon-btn {
    width: 28px;
    height: 28px;
    margin-left: auto;
  }
  .contrast-value code {
    overflow: hidden;
    color: var(--color-foreground, CanvasText);
    font-family: var(--font-mono);
    font-size: 12px;
    text-overflow: ellipsis;
  }
  .contrast-input:has(.contrast-hex-input:focus-visible) {
    border-color: var(--color-ring, var(--color-primary));
    box-shadow: var(--dbx-focus-ring);
  }
  .contrast-input.invalid {
    border-color: var(--color-destructive);
  }
  .contrast-native-color {
    width: 28px;
    height: 24px;
    margin: 0 4px;
    padding: 2px;
    flex: 0 0 auto;
    border: 0;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
  }
  .contrast-input > span {
    color: var(--color-muted-foreground);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .canvas-control {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(180px, 1fr);
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  .type-controls {
    display: grid;
    grid-template-columns: minmax(86px, 1fr) 78px 92px minmax(110px, 1fr);
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .type-controls > label,
  .type-classification {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
    color: var(--color-muted-foreground);
    font-size: 10px;
  }
  .type-controls .dbx-input {
    width: 100%;
    height: 30px;
    padding: 0 7px;
  }
  .type-classification strong {
    display: flex;
    height: 30px;
    align-items: center;
    padding: 0 9px;
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-primary) 9%, transparent);
    color: var(--color-primary);
    font-size: 11px;
  }
  .contrast-hex-input {
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 8px 0 3px;
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--color-foreground, CanvasText);
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;
  }
  .contrast-canvas {
    margin-top: 10px;
    padding: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    border-radius: 8px;
  }
  .contrast-sample {
    display: flex;
    min-height: 64px;
    padding: 12px;
    justify-content: center;
    flex-direction: column;
  }
  .contrast-sample strong {
    font-size: 16px;
    line-height: 1.35;
  }
  .contrast-sample span {
    margin-top: 2px;
    font-size: 11px;
    line-height: 1.45;
  }
  .contrast-result {
    display: grid;
    grid-template-columns: 94px minmax(0, 1fr);
    gap: 10px;
    margin-top: 10px;
  }
  .contrast-ratio {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    border-radius: 8px;
    background: var(--color-muted, color-mix(in srgb, CanvasText 6%, transparent));
  }
  .contrast-ratio strong {
    font-family: var(--font-mono);
    font-size: 17px;
  }
  .contrast-ratio span {
    margin-top: 1px;
    color: var(--color-muted-foreground);
    font-size: 10px;
  }
  .contrast-checks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .contrast-checks > span {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    padding: 6px 8px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--color-destructive) 8%, transparent);
    color: var(--color-muted-foreground);
    font-size: 10px;
  }
  .contrast-checks > span.pass {
    background: color-mix(in srgb, var(--color-success, var(--color-primary)) 10%, transparent);
  }
  .contrast-checks b {
    flex: 0 0 auto;
    color: var(--color-destructive);
    font-weight: 650;
  }
  .contrast-checks .pass b {
    color: var(--color-success, var(--color-primary));
  }
  .contrast-error {
    margin: 10px 0 0;
    color: var(--color-destructive);
    font-size: 11px;
  }
  .contrast-actions {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .contrast-actions-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 7px;
  }
  .contrast-actions-head strong {
    font-size: 11px;
  }
  .fix-role {
    display: inline-flex;
    padding: 2px;
    border-radius: 7px;
    background: var(--color-muted);
  }
  .fix-role button {
    min-height: 24px;
    padding: 0 7px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--color-muted-foreground);
    font-size: 10px;
    cursor: pointer;
  }
  .fix-role button.active {
    background: var(--color-background);
    color: var(--color-foreground);
    box-shadow: inset 0 0 0 1px var(--color-border);
  }
  .contrast-action-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .contrast-action {
    display: flex;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    gap: 8px;
    padding: 7px 8px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-background, Canvas);
    color: var(--color-foreground, CanvasText);
    text-align: left;
    cursor: pointer;
  }
  .contrast-action:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background));
  }
  .contrast-action:focus-visible {
    outline: 1px solid var(--color-ring, var(--color-primary));
    outline-offset: 2px;
  }
  .contrast-action:disabled {
    cursor: default;
    opacity: 0.72;
  }
  .contrast-action i {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
    border-radius: 6px;
  }
  .contrast-action > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .contrast-action b,
  .contrast-action small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .contrast-action b {
    font-size: 10px;
    font-weight: 650;
  }
  .contrast-action small {
    color: var(--color-muted-foreground);
    font-family: var(--font-mono);
    font-size: 9px;
  }
  .contrast-history {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .history-clear {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-muted-foreground);
    font-size: 10px;
    cursor: pointer;
  }
  .history-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .history-list > button {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    padding: 6px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-background);
    color: var(--color-foreground);
    text-align: left;
    cursor: pointer;
  }
  .history-list > button:hover {
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
  }
  .history-swatch {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    place-items: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
    border-radius: 7px;
  }
  .history-swatch i {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
  }
  .history-swatch b {
    width: 15px;
    height: 15px;
    border-radius: 4px;
  }
  .history-list code {
    min-width: 0;
    overflow: hidden;
    font-size: 9px;
    line-height: 1.5;
    text-overflow: ellipsis;
  }
  .card-head {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .card-title {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 72%, transparent));
  }
  .icon-btn {
    width: 30px;
    height: 30px;
    padding: 0;
    flex-shrink: 0;
  }
  .native-color {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    border: 0;
    padding: 0;
    overflow: hidden;
  }
  .pick-hint {
    margin: 0 0 8px;
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .card-hint {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 52%, transparent));
  }
  .hex-spacer {
    visibility: hidden;
    pointer-events: none;
    user-select: none;
  }
  .hex-field {
    display: flex;
    align-items: center;
    width: 100%;
    height: 30px;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-background, Canvas);
  }
  .hex-field:has(input:focus-visible) {
    border-color: var(--color-ring, var(--color-primary));
    box-shadow: var(--dbx-focus-ring);
  }
  .hex-field.invalid {
    border-color: var(--color-destructive);
  }
  .hex-prefix {
    flex-shrink: 0;
    padding: 0 2px 0 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 55%, transparent));
    font-family: var(--font-mono);
  }
  .hex-input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    padding: 0 12px 0 6px;
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.04em;
  }
  .chan-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .chan-row.four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .chan {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .chan span {
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .chan-input {
    font-family: var(--font-mono);
    padding: 0 8px;
  }
  .color-preview {
    position: relative;
    display: flex;
    flex-direction: column;
  }
  .preview-meta {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .preview-heading {
    margin: 0 0 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .preview-heading-text {
    margin: 0;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .preview-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 68%, transparent));
    cursor: pointer;
  }
  .preview-line:hover,
  .preview-line.copied {
    background: color-mix(in srgb, CanvasText 6%, transparent);
  }
  .preview-line-label {
    flex: 0 0 3.2em;
    font-weight: 600;
    color: var(--color-foreground, CanvasText);
  }
  .preview-line code {
    flex: 1;
    min-width: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .preview-empty {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 52%, transparent));
  }

  @media (max-width: 860px) {
    .color-workbench {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .color-grid {
      grid-template-columns: 1fr;
    }
    .contrast-colors,
    .contrast-result,
    .contrast-checks,
    .contrast-action-grid,
    .history-list,
    .type-controls,
    .canvas-control {
      grid-template-columns: 1fr;
    }
    .contrast-actions-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .contrast-ratio {
      min-height: 58px;
    }
  }
</style>
