<script>
  import { pick, localizeError } from "./i18n.js";
  import ColorPicker from "./ColorPicker.svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { createPalette, normalizePaletteHex, exportPalette } from "./colorPalette.js";
  import { saveBlobThroughHost } from "./fileSave.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let base = $state("#15988F");
  let draft = $state("#15988F");
  let scheme = $state("complementary");
  let format = $state("css");
  let count = $state(5);
  let saving = $state(false);
  let error = $state("");
  let status = $state("");
  const colors = $derived(createPalette(base, scheme, Number(count)));
  const output = $derived(exportPalette(colors, format));
  const invalid = $derived(!normalizePaletteHex(draft));
  const schemes = $derived([
    { value: "complementary", label: t("互补色", "Complementary"), note: t("色相相差 180°，营造鲜明对比。", "Opposite hues, 180° apart, for a bold contrast.") },
    { value: "analogous", label: t("邻近色", "Analogous"), note: t("相邻的三种色相，柔和而协调。", "Three neighboring hues for a harmonious palette.") },
    { value: "triadic", label: t("三角色", "Triadic"), note: t("色环上等距的三种颜色，平衡又活泼。", "Three evenly spaced hues for a balanced, vibrant palette.") },
    { value: "tetradic", label: t("四角色", "Tetradic"), note: t("四种等距色相，适合丰富的视觉层次。", "Four evenly spaced hues for a rich visual hierarchy.") },
    { value: "monochrome", label: t("单色阶", "Monochromatic"), note: t("保留色相，以不同明度构建层次。", "One hue with different lightness levels.") },
  ]);
  const presets = ["#15988F", "#6366F1", "#E87950", "#D94680", "#3B82F6", "#7C9A48"];
  function useColor(hex) { base = hex; draft = hex; status = ""; }
  function editHex(event) {
    draft = event.currentTarget.value;
    const hex = normalizePaletteHex(draft);
    if (hex) base = hex;
  }
  function randomize() {
    const hue = Math.floor(Math.random() * 360);
    const saturation = 45 + Math.random() * 35;
    const lightness = 35 + Math.random() * 25;
    // Reuse the existing HSL parser so random colors stay in a useful range.
    useColor(toHex(`hsl(${hue} ${saturation}% ${lightness}%)`));
  }
  import { parseRgbaColor, formatColorValue } from "./colorContrast.js";
  const toHex = value => formatColorValue(parseRgbaColor(value));
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    useColor("#6366F1"); scheme = "analogous"; count = 5; format = "css"; error = "";
  });
  async function save() {
    saving = true; error = ""; status = "";
    const extension = format === "hex" ? "txt" : format;
    const mimeType = { css: "text/css", json: "application/json", svg: "image/svg+xml", hex: "text/plain" }[format];
    try {
      const result = await saveBlobThroughHost(new Blob([output], { type: mimeType }), { fileName: `palette.${extension}`, extension, mimeType, binary: true });
      if (!result?.cancelled) status = t("配色方案已导出", "Palette exported");
    } catch (cause) { error = localizeError(locale, cause); }
    finally { saving = false; }
  }
</script>

<div class="palette-page">

  <section class="controls" aria-label={t("配色设置", "Palette settings")}>
    <div class="base-control"><span class="field-label" id="palette-base-label">{t("基础色", "Base color")}</span><div class="color-input"><ColorPicker value={base} oninput={event => useColor(event.target.value)} {locale} aria-label={t("选择基础色", "Choose base color")} /><input class="dbx-input hex-input" aria-labelledby="palette-base-label" aria-invalid={invalid} aria-describedby={invalid ? "palette-hex-error" : undefined} bind:value={draft} oninput={editHex} onblur={() => { if (!invalid) draft = base; }} spellcheck="false" maxlength="9" /></div></div>
    <div class="scheme-control"><span class="field-label">{t("配色方案", "Color scheme")}</span><Select bind:value={scheme} options={schemes} ariaLabel={t("配色方案", "Color scheme")} /></div>
    <div><span class="field-label">{t("颜色数量（最多 12 色）", "Color count (up to 12)")}</span><Select bind:value={count} options={Array.from({ length: 11 }, (_, i) => ({ value: i + 2, label: `${i + 2}` }))} ariaLabel={t("颜色数量", "Color count")} /></div>
    <div class="preset-control"><span class="field-label">{t("灵感起点", "Quick inspiration")}</span><div class="presets">{#each presets as hex}<button class:active={base.toUpperCase() === hex} style:background={hex} onclick={() => useColor(hex)} title={hex} aria-label={`${t("使用颜色", "Use color")} ${hex}`}></button>{/each}</div></div>
    <button class="dbx-btn random-button" onclick={randomize}>{t("随机灵感", "Surprise me")} <span aria-hidden="true">↗</span></button>
    {#if invalid}<p class="error" id="palette-hex-error" role="alert">{t("请输入 3 位或 6 位 HEX 颜色，例如 #15988F。预览保留上一个有效颜色。", "Enter a 3- or 6-digit HEX color, e.g. #15988F. The preview keeps the last valid color.")}</p>{/if}
  </section>

  <section class="palette-section" aria-label={t("配色预览", "Palette preview")}>
    <div class="section-heading"><h3>{schemes.find(item => item.value === scheme)?.label}<span class="count">{colors.length} {t("色", "colors")}</span></h3><p>{schemes.find(item => item.value === scheme)?.note}</p></div>
    <div class="color-grid" >
      {#each colors as color, index}<article class="color-card">
        <div class="palette-swatch" style:background={color.hex} style:color={color.text}><span class="color-index">{String(index + 1).padStart(2, "0")}</span><span class="type-sample" aria-hidden="true">Aa</span><span class="contrast">{t("文字对比度", "Text contrast")} {color.contrast.toFixed(2)}:1 · {color.contrast >= 7 ? "AAA" : "AA"}</span></div>
        <div class="color-info"><div class="hex-row"><strong>{color.hex}</strong><CopyButton text={color.hex} {locale} /></div><code>{color.rgb}</code><code>{color.css}</code><button class="use-base" onclick={() => useColor(color.hex)}>{t("设为基础色", "Use as base")} <span aria-hidden="true">↗</span></button></div>
      </article>{/each}
    </div>
    <p class="hint">{t("超出基础色数时，以明度变化扩展配色。", "Extra colors extend the base harmony with lightness variations.")} {t("对比度按色块背景与示例文字的黑色或白色计算；AA ≥ 4.5，AAA ≥ 7（普通文字）。", "Contrast compares each swatch with its black or white sample text; AA ≥ 4.5, AAA ≥ 7 for normal text.")}</p>
  </section>

  <section class="export-panel"><div class="export-header"><h3>{t("带走这组配色", "Take your palette with you")}</h3><div class="export-actions"><Select bind:value={format} ariaLabel={t("导出格式", "Export format")} options={[{value:"css",label:"CSS"},{value:"json",label:"JSON"},{value:"hex",label:"HEX"},{value:"svg",label:"SVG"}]} /><CopyButton text={output} {locale} /><button class="dbx-btn dbx-btn--primary" disabled={saving} onclick={save}>{saving ? t("导出中…", "Exporting…") : t("导出文件", "Export file")}</button></div></div><textarea class="dbx-textarea export-code" value={output} readonly rows="7" spellcheck="false" aria-label={t("配色代码", "Palette code")}></textarea></section>
  {#if error}<p class="error" role="alert">{error}</p>{/if}<div class="status" role="status">{status}</div>
</div>

<style>
  .palette-page{max-width:1180px;margin:0 auto;padding:28px;display:flex;flex-direction:column;gap:24px;color:var(--color-foreground);width:100%;box-sizing:border-box}
  .section-heading,.export-header{display:flex;align-items:center;justify-content:space-between;gap:16px}.section-heading p{font-size:12px;color:var(--color-muted-foreground);margin:0;line-height:1.7}
  .controls{padding:20px;display:grid;grid-template-columns:minmax(190px,1fr) minmax(150px,1fr) minmax(180px,1fr);gap:22px;border:1px solid var(--color-border);background:var(--color-card);border-radius:12px}.random-button{align-self:end;justify-self:start}.field-label{display:block;font-size:12px;font-weight:550;margin-bottom:10px}.color-input{display:flex;align-items:center;gap:10px}.color-input :global(.dbx-color-trigger){width:38px;flex-shrink:0}.hex-input{font-family:var(--font-mono);width:100%;min-width:0;letter-spacing:.5px}.presets{display:flex;align-items:center;gap:9px;height:32px}.presets button{border:0;width:25px;height:25px;border-radius:50%;cursor:pointer;flex-shrink:0;box-shadow:inset 0 0 0 1px #00000010}.presets button.active{outline:2px solid var(--color-foreground);outline-offset:3px}
  h3{font-size:14px;margin:0;font-weight:600}.count{font-size:11px;font-weight:400;margin-left:12px;color:var(--color-muted-foreground)}.palette-section{display:flex;flex-direction:column;gap:14px}.color-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}.color-card{border-radius:11px;overflow:hidden;border:1px solid var(--color-border);background:var(--color-card)}.palette-swatch{width:100%;height:190px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}.color-index{font-family:var(--font-mono);font-size:11px;opacity:.8}.type-sample{font-size:46px;font-weight:550;letter-spacing:-2px}.contrast{font-size:10px;line-height:1.5}.color-info{padding:13px;display:flex;flex-direction:column;gap:6px;min-width:0}.hex-row{display:flex;align-items:center;justify-content:space-between;gap:4px}.hex-row strong{font-family:var(--font-mono);font-size:14px}.color-info code{font-family:var(--font-mono);font-size:10px;color:var(--color-muted-foreground);overflow-wrap:anywhere}.use-base{background:none;border:0;border-top:1px solid var(--color-border);margin-top:7px;padding:11px 0 0;color:var(--color-muted-foreground);font:inherit;font-size:11px;cursor:pointer;display:flex;justify-content:space-between}.use-base:hover{color:var(--color-primary)}.hint{margin:0;font-size:11px;color:var(--color-muted-foreground);line-height:1.7}
  .export-panel{border:1px solid var(--color-border);border-radius:12px;overflow:hidden;background:var(--color-card)}.export-header{flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--color-border)}.export-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}.export-actions :global(.dbx-btn){flex-shrink:0;white-space:nowrap}.export-actions>.dbx-btn{min-width:88px}.export-actions :global(.dbx-custom-select){width:88px;min-width:88px;flex:0 0 88px}.export-code{display:block;min-height:150px;max-height:330px;resize:vertical;width:100%;box-sizing:border-box;font-family:var(--font-mono);font-size:12px;line-height:1.7;border:0;border-radius:0;padding:16px 18px;background:transparent}.error{color:var(--color-destructive);font-size:12px;margin:0;grid-column:1/-1}.status{font-size:12px;color:var(--color-muted-foreground)}button:focus-visible{outline:2px solid var(--color-ring);outline-offset:3px}
  @media(max-width:800px){.controls{grid-template-columns:1fr 1fr}.preset-control{grid-column:1/-1}.color-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.palette-swatch{height:160px}.section-heading{align-items:flex-start;flex-direction:column;gap:6px}}
  @media(max-width:480px){.palette-page{padding:16px;gap:20px}.controls{padding:14px;gap:16px;grid-template-columns:1fr}.preset-control{grid-column:auto}.export-header{align-items:flex-start;flex-direction:column}.export-actions{width:100%}.palette-swatch{padding:12px}.contrast{font-size:9px}.color-info{padding:10px}.hex-row strong{font-size:12px}}
</style>

