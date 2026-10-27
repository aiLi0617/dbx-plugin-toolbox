<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { pick } from "./i18n.js";
  import { hsvToRgb, rgbToHsv, rgbToHex } from "./tools/convert.js";
  import { parseRgbaColor } from "./colorContrast.js";
  import { pickScreenColor } from "./screenColorPicker.js";

  let { value = $bindable("#000000"), locale = "zh-CN", disabled = false,
    class: className = "", "aria-label": ariaLabel = "", hidden = false,
    oninput, onchange } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const uid = $props.id();
  let open = $state(false);
  let trigger = $state();
  let panel = $state();
  let returnFocus;
  let committedValue = "";
  let hue = $state(0);
  let saturation = $state(0);
  let brightness = $state(0);
  let hexDraft = $state("");
  let dragging = $state(false);
  let canPick = $state(false);
  let picking = $state(false);
  let pickError = $state("");
  let pickController;
  let pickerButton = $state();
  onMount(() => { canPick = typeof window.EyeDropper === "function"; });
  onDestroy(() => { pickController?.abort(); });
  let position = $state({ left: 8, top: 8 });
  const rgb = $derived(parseRgbaColor(value) || { r: 0, g: 0, b: 0 });
  const color = $derived(rgbToHex(rgb.r, rgb.g, rgb.b));

  $effect(() => {
    const next = rgbToHsv(rgb.r, rgb.g, rgb.b);
    // Preserve the chosen hue at black/gray, where RGB cannot encode it.
    if (next.s > 0) hue = next.h;
    if (next.v > 0) saturation = next.s;
    brightness = next.v;
    hexDraft = color;
  });
  $effect(() => { if (disabled && open) close(false); });

  function portal(node) {
    document.body.appendChild(node);
    document.addEventListener("scroll", place, true);
    return { destroy: () => { document.removeEventListener("scroll", place, true); node.remove(); } };
  }
  function place() {
    if (!open || !trigger || !panel) return;
    const rect = trigger.getBoundingClientRect();
    const height = panel.getBoundingClientRect().height;
    const width = panel.getBoundingClientRect().width;
    position = {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 6 + height <= window.innerHeight - 8
        ? rect.bottom + 6 : rect.top - height - 6, window.innerHeight - height - 8)),
    };
  }
  export async function click() {
    if (disabled) return;
    if (open) { close(); return; }
    returnFocus = hidden ? document.activeElement : trigger;
    committedValue = value;
    pickError = "";
    open = true;
    await tick();
    place();
    panel?.querySelector('[role="slider"]')?.focus();
  }
  function close(restore = true) {
    pickController?.abort();
    commit();
    open = false;
    dragging = false;
    if (restore) returnFocus?.focus();
  }
  function outside(event) {
    if (picking) return;
    if (open && !panel?.contains(event.target) && !trigger?.contains(event.target)) close(false);
  }
  function emit(next) {
    const nextValue = rgbToHex(next.r, next.g, next.b);
    if (nextValue.toLowerCase() === value.toLowerCase()) return;
    value = nextValue;
    // Keep existing native-input consumers and bound values in sync.
    const event = { currentTarget: { value }, target: { value } };
    oninput?.(event);
  }
  function commit() {
    if (value === committedValue) return;
    committedValue = value;
    onchange?.({ currentTarget: { value }, target: { value } });
  }
  function endDrag() { dragging = false; commit(); }
  async function pickFromScreen() {
    if (picking || disabled || !canPick) return;
    picking = true;
    pickError = "";
    const controller = new AbortController();
    pickController = controller;
    try {
      const hex = await pickScreenColor({ signal: controller.signal });
      if (hex && open && !disabled) { emit(parseRgbaColor(hex)); commit(); }
    } catch {
      pickError = t("取色失败", "Color picking failed");
    } finally {
      picking = false;
      if (pickController === controller) pickController = undefined;
      if (open) { await tick(); place(); pickerButton?.focus(); }
    }
  }
  function emitHsv() { emit(hsvToRgb(hue, saturation, brightness)); }
  function move(event) {
    if (!dragging) return;
    const rect = event.currentTarget.getBoundingClientRect();
    saturation = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    brightness = Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100));
    emitHsv();
  }
  function start(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging = true;
    move(event);
  }
  function planeKey(event) {
    const step = event.shiftKey ? 10 : 1;
    if (event.key === "ArrowLeft") saturation = Math.max(0, saturation - step);
    else if (event.key === "ArrowRight") saturation = Math.min(100, saturation + step);
    else if (event.key === "ArrowUp") brightness = Math.min(100, brightness + step);
    else if (event.key === "ArrowDown") brightness = Math.max(0, brightness - step);
    else return;
    event.preventDefault();
    emitHsv();
  }
  function panelKey(event) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === "Tab") {
      const fields = [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
      if (event.shiftKey && document.activeElement === fields[0]) {
        event.preventDefault(); fields.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === fields.at(-1)) {
        event.preventDefault(); fields[0]?.focus();
      }
    }
  }
  function editHex() {
    if (!/^#?[\da-f]{6}$/i.test(hexDraft)) return;
    emit(parseRgbaColor(hexDraft));
  }
</script>

<svelte:window onpointerdown={outside} onresize={place} onscroll={place} />
<button bind:this={trigger} type="button" class="dbx-color-trigger {className}" class:concealed={hidden}
  tabindex={hidden ? -1 : undefined} aria-hidden={hidden ? "true" : undefined}
  {disabled} aria-label={ariaLabel || t("选择颜色", "Choose color")} aria-haspopup="dialog"
  aria-expanded={open} aria-controls={open ? uid : undefined} onclick={click}>
  <span class="dbx-color-swatch" style:background={color}></span>
</button>
{#if open}
  <div use:portal bind:this={panel} id={uid} class="dbx-color-panel" role="dialog" tabindex="-1"
    aria-label={ariaLabel || t("选择颜色", "Choose color")}
    style:left="{position.left}px" style:top="{position.top}px" onkeydown={panelKey}
    onfocusout={(event) => { if (!picking && event.relatedTarget && !panel?.contains(event.relatedTarget) && event.relatedTarget !== trigger) close(false); }}>
    <div class="heading"><strong>{t("选择颜色", "Choose color")}</strong><button class="dbx-btn dbx-btn--ghost" type="button" onclick={() => close()} aria-label={t("关闭", "Close")}>×</button></div>
    <div class="plane" role="slider" tabindex="0" aria-label={t("饱和度与明亮度", "Saturation and brightness")}
      aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(saturation)}
      aria-valuetext={`${Math.round(saturation)}%, ${Math.round(brightness)}%`}
      style:background-color={`hsl(${hue} 100% 50%)`}
      onpointerdown={start} onpointermove={move} onpointerup={endDrag}
      onpointercancel={endDrag} onlostpointercapture={endDrag} onkeydown={planeKey} onkeyup={commit}>
      <span class="thumb" style:left="{saturation}%" style:top="{100 - brightness}%" style:background={color}></span>
    </div>
    <label class="hue-label"><span>{t("色相", "Hue")}</span><input class="hue" type="range" min="0" max="360" step="1" value={hue} oninput={(event) => { hue = Number(event.currentTarget.value); emitHsv(); }} onchange={commit} /></label>
    <button bind:this={pickerButton} class="dbx-btn screen-picker" type="button" onclick={pickFromScreen}
      disabled={!canPick || picking || disabled}
      title={!canPick ? t("当前环境不支持取色", "Color picking is not available here") : undefined}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-5L16 4l4 4L7 21Z"/><path d="m14 6 4 4M16 4l2-2 4 4-2 2M4 16l4 4"/></svg>
      {t("屏幕取色", "Pick screen color")}
    </button>
    {#if pickError}<p class="pick-error" role="alert">{pickError}</p>{/if}
    <label class="hex-label"><span>HEX</span><input class="dbx-input" aria-label="HEX" spellcheck="false" maxlength="7" bind:value={hexDraft} oninput={editHex} onchange={commit} onblur={() => hexDraft = color} /></label>
    <div class="channels">{#each ["r", "g", "b"] as channel}<label><span>{channel.toUpperCase()}</span><input class="dbx-input" type="number" min="0" max="255" step="1" aria-label={channel.toUpperCase()} value={rgb[channel]} onchange={commit} oninput={(event) => { if (event.currentTarget.value !== "") emit({ ...rgb, [channel]: Math.max(0, Math.min(255, Math.round(Number(event.currentTarget.value)))) }); }} /></label>{/each}</div>
  </div>
{/if}

<style>
  .dbx-color-trigger { display:inline-flex; align-items:stretch; box-sizing:border-box; overflow:hidden; width:100%; min-width:28px; height:32px; padding:4px; border:1px solid var(--dbx-control-border); border-radius:var(--radius-md); background:var(--dbx-control-background); cursor:pointer; }
  .dbx-color-trigger:hover { border-color:var(--color-ring); }
  .dbx-color-trigger:focus-visible, .plane:focus-visible { outline:2px solid var(--color-ring); outline-offset:2px; }
  .dbx-color-trigger:disabled { opacity:.5; cursor:not-allowed; }
  .dbx-color-swatch { display:block; box-sizing:border-box; width:100%; height:100%; min-height:0; border-radius:var(--radius-sm); box-shadow:inset 0 0 0 1px var(--color-border); }
  .concealed { position:absolute; width:1px; height:1px; min-width:0; padding:0; opacity:0; pointer-events:none; }
  .contrast-native-color { width:28px; height:28px; flex-shrink:0; }
  .dbx-color-panel { position:fixed; z-index:10000; box-sizing:border-box; width:260px; max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:auto; display:flex; flex-direction:column; gap:12px; padding:12px; border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-popover); color:var(--color-popover-foreground); box-shadow:var(--dbx-shadow-md); font:12px var(--font-sans, sans-serif); }
  .heading { display:flex; align-items:center; justify-content:space-between; }
  .heading button { min-height:24px; width:24px; padding:0; font-size:18px; }
  .plane { position:relative; height:146px; flex-shrink:0; border-radius:var(--radius-sm); background-image:linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,transparent); cursor:crosshair; touch-action:none; }
  .thumb { position:absolute; width:12px; height:12px; border:2px solid #fff; box-shadow:0 0 0 1px #0008; border-radius:50%; transform:translate(-50%,-50%); pointer-events:none; }
  label { display:flex; gap:6px; color:var(--color-muted-foreground); font-size:11px; }
  .hue-label, .hex-label { align-items:center; }
  .hue-label > span, .hex-label > span { width:30px; flex-shrink:0; }
  .hex-label input { flex:1; min-width:0; font-family:var(--font-mono,monospace); }
  .hue { flex:1; min-width:0; }
  .screen-picker { display:flex; align-items:center; justify-content:center; gap:6px; min-height:30px; }
  .pick-error { margin:0; color:var(--color-destructive); font-size:11px; }
  .hue::-webkit-slider-runnable-track { background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
  .hue::-moz-range-track { background:linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00); }
  .channels { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
  .channels label { flex-direction:column; }
  .channels input { width:100%; min-width:0; box-sizing:border-box; }
</style>
