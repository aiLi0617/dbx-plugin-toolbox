<script>
  import { pick } from "./i18n.js";
  import { hsvToRgb, rgbToHex } from "./tools/convert.js";

  let { h = 0, s = 100, v = 100, previewHex = "", locale = "zh-CN", onChange } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let wheelEl = $state(null);
  let valueEl = $state(null);
  let dragging = $state("");

  const pureHex = $derived(rgbToHexFromHsv(h, s, 100));
  const currentHex = $derived(rgbToHexFromHsv(h, s, v));
  const handleLeft = $derived(50 + Math.sin((h * Math.PI) / 180) * (s / 2));
  const handleTop = $derived(50 - Math.cos((h * Math.PI) / 180) * (s / 2));
  const valuePct = $derived(Math.max(0, Math.min(100, v)));

  function rgbToHexFromHsv(hh, ss, vv) {
    const c = hsvToRgb(hh, ss, vv);
    return rgbToHex(c.r, c.g, c.b);
  }

  function emit(next) {
    onChange?.({
      h: next.h,
      s: next.s,
      v: next.v,
    });
  }

  function hsvFromWheelEvent(event) {
    const rect = wheelEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const radius = Math.min(rect.width, rect.height) / 2;
    const dist = Math.hypot(dx, dy);
    const nextS = Math.max(0, Math.min(1, radius ? dist / radius : 0)) * 100;
    let nextH = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (nextH < 0) nextH += 360;
    return { h: nextH, s: nextS, v };
  }

  function vFromEvent(event) {
    const rect = valueEl.getBoundingClientRect();
    if (!rect.height) return v;
    const tY = (event.clientY - rect.top) / rect.height;
    return Math.max(0, Math.min(100, (1 - tY) * 100));
  }

  function onWheelPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    dragging = "wheel";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    emit(hsvFromWheelEvent(event));
  }

  function onValuePointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    dragging = "value";
    event.currentTarget.setPointerCapture?.(event.pointerId);
    emit({ h, s, v: vFromEvent(event) });
  }

  function onPointerMove(event) {
    if (!dragging) return;
    if (event.buttons === 0) {
      dragging = "";
      return;
    }
    if (dragging === "wheel") emit(hsvFromWheelEvent(event));
    else emit({ h, s, v: vFromEvent(event) });
  }

  function onPointerUp() {
    dragging = "";
  }

  function onWheelKey(event) {
    const step = event.shiftKey ? 10 : 2;
    let nextH = h;
    let nextS = s;
    if (event.key === "ArrowLeft") nextH -= step;
    else if (event.key === "ArrowRight") nextH += step;
    else if (event.key === "ArrowUp") nextS = Math.min(100, s + step);
    else if (event.key === "ArrowDown") nextS = Math.max(0, s - step);
    else return;
    event.preventDefault();
    nextH %= 360;
    if (nextH < 0) nextH += 360;
    emit({ h: nextH, s: nextS, v });
  }

  function onValueKey(event) {
    const step = event.shiftKey ? 10 : 1;
    let next = v;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = Math.min(100, v + step);
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = Math.max(0, v - step);
    else if (event.key === "Home") next = 100;
    else if (event.key === "End") next = 0;
    else return;
    event.preventDefault();
    emit({ h, s, v: next });
  }
</script>

<div class="picker">
  <div class="picker-row">
    <div
      bind:this={wheelEl}
      class="wheel-wrap"
      role="slider"
      tabindex="0"
      aria-label={t("色环：色相与饱和度", "Color wheel: hue and saturation")}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={Math.round(s)}
      aria-valuetext={t(`色相 ${Math.round(h)}°，饱和度 ${Math.round(s)}%`, `Hue ${Math.round(h)}°, saturation ${Math.round(s)}%`)}
      onpointerdown={onWheelPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
      onkeydown={onWheelKey}
    >
      <div class="wheel"></div>
      <div
        class="handle"
        style:left="{handleLeft}%"
        style:top="{handleTop}%"
        style:background={pureHex}
      ></div>
    </div>

    <div class="value-col">
      <div
        bind:this={valueEl}
        class="value-track"
        role="slider"
        tabindex="0"
        aria-label={t("明亮度", "Brightness")}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(valuePct)}
        aria-valuetext={`${Math.round(valuePct)}%`}
        style={`--pure: ${pureHex}; --v: ${valuePct}`}
        onpointerdown={onValuePointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        onkeydown={onValueKey}
      >
        <span class="value-fill" aria-hidden="true"></span>
        <span class="value-thumb" style:background={currentHex}></span>
      </div>
      <span class="value-caption">{t("明亮度", "Brightness")}</span>
      <span class="value-num">{Math.round(valuePct)}%</span>
    </div>
  </div>

  <div class="result" class:filled={Boolean(previewHex)} style:background={previewHex || undefined} title={previewHex || t("当前颜色", "Current color")}></div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .picker-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 36px;
    gap: 10px;
    align-items: stretch;
  }
  .wheel-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    min-width: 0;
    outline: none;
    touch-action: none;
    user-select: none;
    cursor: crosshair;
  }
  .wheel-wrap:focus-visible {
    border-radius: 50%;
    box-shadow: var(--dbx-focus-ring);
  }
  .wheel {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background:
      radial-gradient(circle closest-side, #fff 0%, rgba(255, 255, 255, 0) 100%),
      conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, CanvasText 14%, transparent);
  }
  .handle {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px color-mix(in srgb, CanvasText 40%, transparent),
      0 1px 4px color-mix(in srgb, CanvasText 28%, transparent);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }
  .value-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 0;
    gap: 4px;
  }
  .value-track {
    position: relative;
    flex: 1 1 auto;
    width: 18px;
    min-height: 0;
    overflow: hidden;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, CanvasText 14%, transparent);
    background: var(--pure, #fff);
    outline: none;
    touch-action: none;
    user-select: none;
    cursor: ns-resize;
  }
  .value-fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(to top, #000, var(--pure, #fff));
    pointer-events: none;
  }
  .value-track:focus-visible {
    box-shadow: var(--dbx-focus-ring);
  }
  .value-thumb {
    position: absolute;
    left: 50%;
    top: calc(7px + (100% - 14px) * (1 - var(--v, 100) / 100));
    width: 14px;
    height: 14px;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow:
      0 0 0 1px color-mix(in srgb, CanvasText 40%, transparent),
      0 1px 3px color-mix(in srgb, CanvasText 25%, transparent);
    pointer-events: none;
    transform: translateX(-50%);
  }
  .value-caption,
  .value-num {
    font-size: 10px;
    line-height: 1.2;
    text-align: center;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .value-num {
    font-variant-numeric: tabular-nums;
    color: var(--color-foreground, CanvasText);
  }
  .result {
    height: 36px;
    flex-shrink: 0;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 10%, transparent));
    background-color: color-mix(in srgb, CanvasText 6%, var(--color-background, Canvas));
    background-image:
      linear-gradient(45deg, color-mix(in srgb, CanvasText 12%, transparent) 25%, transparent 25%),
      linear-gradient(-45deg, color-mix(in srgb, CanvasText 12%, transparent) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, color-mix(in srgb, CanvasText 12%, transparent) 75%),
      linear-gradient(-45deg, transparent 75%, color-mix(in srgb, CanvasText 12%, transparent) 75%);
    background-size: 12px 12px;
    background-position: 0 0, 0 6px, 6px -6px, -6px 0;
  }
  .result.filled {
    background-image: none;
  }
</style>
