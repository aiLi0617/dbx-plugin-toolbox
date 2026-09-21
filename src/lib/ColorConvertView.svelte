<script>
  import { copyText } from "./clipboard.js";
  import { chrome, pick } from "./i18n.js";
  import ColorWheelPicker from "./ColorWheelPicker.svelte";
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

  let rgb = $state({ r: initial.r, g: initial.g, b: initial.b });
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

  const fmt = $derived(rgb ? formatRgbColor(rgb.r, rgb.g, rgb.b) : null);
  const hsvCss = $derived(`hsv(${Math.round(hsvLive.h)}°, ${Math.round(hsvLive.s)}%, ${Math.round(hsvLive.v)}%)`);
  const copies = $derived(
    fmt
      ? {
          hex: fmt.hex,
          rgb: fmt.rgbCss,
          cmyk: fmt.cmykCss,
          hsv: hsvCss,
          css: `${fmt.hex}\n${fmt.rgbCss}\n${fmt.hslCss}`,
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
    const asHex = parseHexColor(raw);
    if (asHex) return asHex;
    const rgbMatch = raw.match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
    if (rgbMatch) {
      const r = Number(rgbMatch[1]);
      const g = Number(rgbMatch[2]);
      const b = Number(rgbMatch[3]);
      if ([r, g, b].every((n) => n <= 255)) return { r, g, b };
    }
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
    invalid = "";
    copied = "";
    const f = formatRgbColor(rgb.r, rgb.g, rgb.b);
    if (except !== "hex") hex = f.hexBody;
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
    const asHex = parseHexColor(next);
    if (asHex) {
      applyRgb(asHex, "hex");
      return;
    }
    const loose = parseColorText(next);
    if (loose) {
      applyRgb(loose, null);
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
              <span class="hex-prefix">#</span>
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
          </div>
        </div>
        <p class="card-hint">{t("例: FF5733", "e.g. FF5733")}</p>
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
  }
</style>
