<script>
  import { pick, localizeError } from "./i18n.js";
  import { UNITS, convertUnit, precision } from "./calculators.js";
  import Select from "./Select.svelte";
  import CopyButton from "./CopyButton.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let category = $state("length");
  let from = $state("m");
  let to = $state("km");
  let input = $state("");
  let digits = $state(8);
  let appliedDemoRequest = 0;
  const categories = $derived([
    { value: "length", label: t("长度", "Length") },
    { value: "area", label: t("面积", "Area") },
    { value: "volume", label: t("体积", "Volume") },
    { value: "mass", label: t("质量", "Mass") },
    { value: "speed", label: t("速度", "Speed") },
    { value: "data", label: t("数据存储", "Data storage") },
  ]);
  const names = $derived({
    m: t("米", "Metre"), km: t("千米", "Kilometre"), cm: t("厘米", "Centimetre"), mm: t("毫米", "Millimetre"),
    in: t("英寸", "Inch"), ft: t("英尺", "Foot"), yd: t("码", "Yard"), mi: t("英里", "Mile"),
    "m²": t("平方米", "Square metre"), "km²": t("平方千米", "Square kilometre"), "cm²": t("平方厘米", "Square centimetre"),
    ha: t("公顷", "Hectare"), acre: t("英亩", "Acre"), "ft²": t("平方英尺", "Square foot"),
    L: t("升", "Litre"), mL: t("毫升", "Millilitre"), "m³": t("立方米", "Cubic metre"),
    "US gal": t("美制加仑", "US gallon"), "US fl oz": t("美制液量盎司", "US fluid ounce"),
    kg: t("千克", "Kilogram"), g: t("克", "Gram"), mg: t("毫克", "Milligram"), t: t("吨", "Tonne"),
    lb: t("磅", "Pound"), oz: t("盎司", "Ounce"), "m/s": t("米/秒", "Metres per second"),
    "km/h": t("千米/时", "Kilometres per hour"), mph: t("英里/时", "Miles per hour"), knot: t("节", "Knot"),
    B: t("字节", "Byte"), bit: t("比特", "Bit"),
  });
  const options = $derived(Object.keys(UNITS[category]).map(value => ({ value, label: names[value] ? `${names[value]} (${value})` : value })));
  const calculation = $derived.by(() => {
    if (!input.trim()) return { rows: [], value: "", error: "" };
    if (!Number.isInteger(Number(digits)) || digits < 1 || digits > 15)
      return { rows: [], value: "", error: t("有效数字须为 1 到 15 的整数", "Significant digits must be an integer from 1 to 15") };
    try {
      const value = String(precision(convertUnit(input, category, from, to), Number(digits)));
      // An overflowing secondary unit should not hide a valid primary result.
      const rows = options.map(({ value: unit, label }) => {
        try { return { unit, label, value: String(precision(convertUnit(input, category, from, unit), Number(digits))) }; }
        catch { return { unit, label, value: "—" }; }
      });
      return { value, rows, error: "" };
    } catch (error) { return { rows: [], value: "", error: localizeError(locale, error) }; }
  });
  const rate = $derived(String(precision(convertUnit(1, category, from, to), 10)));
  function changeCategory(value) {
    category = value;
    [from, to] = Object.keys(UNITS[value]);
  }
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    category = "length"; from = "m"; to = "km"; input = "1024"; digits = 8;
  });
</script>

<div class="unit-page">
  <div class="categories" role="group" aria-label={t("类别", "Category")}>
    {#each categories as item}<button type="button" class:active={category === item.value} aria-pressed={category === item.value} onclick={() => changeCategory(item.value)}>{item.label}</button>{/each}
  </div>
  <section class="converter" aria-label={t("换算设置", "Conversion settings")}>
    <div class="input-row">
      <label class="value-field"><span>{t("数值", "Value")}</span><input class="dbx-input" bind:value={input} inputmode="decimal" placeholder={t("输入数值，如 1024 或 1e3", "Enter a value, e.g. 1024 or 1e3")} aria-invalid={Boolean(calculation.error)} /></label>
      <label class="precision-field"><span>{t("有效数字", "Significant digits")}</span><input class="dbx-input" type="number" min="1" max="15" step="1" bind:value={digits} /></label>
    </div>
    <div class="unit-row">
      <div class="unit-field"><span>{t("从", "From")}</span><Select bind:value={from} {options} ariaLabel={t("来源单位", "Source unit")} /></div>
      <button type="button" class="dbx-btn swap" title={t("交换单位", "Swap units")} aria-label={t("交换单位", "Swap units")} onclick={() => { [from, to] = [to, from]; }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4" /></svg></button>
      <div class="unit-field"><span>{t("到", "To")}</span><Select bind:value={to} {options} ariaLabel={t("目标单位", "Target unit")} /></div>
    </div>
    <div class="result">
      <div class="result-heading"><span>{t("换算结果", "Conversion result")}</span><CopyButton {locale} text={calculation.value ? `${calculation.value} ${to}` : ""} /></div>
      <output aria-live="polite" aria-atomic="true">{#if calculation.value}<strong>{calculation.value}</strong><span class="result-unit">{to}</span>{:else}<span class="empty">{t("等待输入", "Awaiting input")}</span>{/if}</output>
      {#if calculation.value}<p class="equation">{input} {from} = {calculation.value} {to}</p>{/if}
      <p class="rate">{t("换算关系", "Conversion rate")} · 1 {from} = {rate} {to}</p>
    </div>
    {#if calculation.error}<p class="error" role="alert">{calculation.error}</p>{/if}
    {#if category === "data"}<p class="hint">{t("kB、MB 等使用十进制（1000）；KiB、MiB 等使用二进制（1024）。", "kB, MB, etc. use decimal (1000); KiB, MiB, etc. use binary (1024).")}</p>{/if}
  </section>
  {#if calculation.rows.length}
    <section class="comparison" aria-label={t("同类单位对照", "Unit comparison")}>
      <h3>{t("同类单位对照", "Unit comparison")}</h3>
      <div class="comparison-grid">{#each calculation.rows as row}<div class="comparison-item" class:selected={row.unit === to}><span>{row.label}</span><div><strong>{row.value}</strong><CopyButton {locale} text={row.value === "—" ? "" : `${row.value} ${row.unit}`} /></div></div>{/each}</div>
    </section>
  {/if}
</div>

<style>
  .unit-page { width: 100%; max-width: 1000px; min-height: 0; overflow: auto; margin: 0 auto; padding: 24px; box-sizing: border-box; display: flex; flex-direction: column; gap: 22px; }
  .unit-page > * { flex-shrink: 0; }
  p { margin: 0; }
  .hint, .rate, .equation, .comparison-item > span { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.6; }
  .categories { display: flex; flex-wrap: wrap; gap: 6px; padding: 5px; border-radius:var(--radius-lg); background: var(--color-muted); }
  .categories button { flex: 1; min-width: 80px; border: 1px solid transparent; border-radius:var(--radius-md); background: transparent; color: var(--color-muted-foreground); padding: 9px 12px; font: inherit; cursor: pointer; }
  .categories button.active { color: var(--color-primary); background: var(--color-background); border-color: var(--color-border); box-shadow:var(--dbx-shadow-sm); font-weight: 600; }
  .converter { border: 1px solid var(--color-border); border-radius:var(--radius-lg); padding: 22px; display: flex; flex-direction: column; gap: 20px; }
  .input-row { display: grid; grid-template-columns: minmax(0, 1fr) 140px; gap: 18px; }
  label, .unit-field { display: flex; flex-direction: column; gap: 8px; font-size: 12px; min-width: 0; }
  .dbx-input { width: 100%; box-sizing: border-box; height: 40px; }
  .value-field input { font: 18px var(--font-mono, monospace); }
  .unit-row { display: grid; grid-template-columns: minmax(0, 1fr) 38px minmax(0, 1fr); align-items: end; gap: 14px; }
  .swap { height: 32px; width: 38px; justify-content: center; }
  .result { border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent); border-radius:var(--radius-md); background: color-mix(in srgb, var(--color-primary) 4%, var(--color-background)); padding: 16px 20px; }
  .result-heading { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-muted-foreground); }
  output { display: flex; align-items: baseline; gap: 12px; margin: 10px 0; overflow-wrap: anywhere; }
  output strong { font: 600 clamp(26px, 4vw, 38px) var(--font-mono, monospace); color: var(--color-primary); min-width: 0; }
  .result-unit { font-size: 18px; }
  .empty { font-size: 24px; color: var(--color-muted-foreground); }
  .rate { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--color-border); }
  .equation { overflow-wrap: anywhere; }
  .error { color: var(--color-destructive); font-size: 12px; }
  h3 { margin: 0 0 12px; font-size: 13px; font-weight: 600; }
  .comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .comparison-item { border: 1px solid var(--color-border); border-radius:var(--radius-lg); padding: 12px 14px; min-width: 0; }
  .comparison-item.selected { border-color: color-mix(in srgb, var(--color-primary) 45%, transparent); }
  .comparison-item > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; }
  .comparison-item strong { font: 500 15px var(--font-mono, monospace); overflow-wrap: anywhere; min-width: 0; }
  button:focus-visible { outline:none;box-shadow:var(--dbx-focus-ring); }
  @media (max-width: 580px) {
    .unit-page { padding: 16px; gap: 16px; } .converter { padding: 16px; } .input-row { grid-template-columns: minmax(0, 1fr) 96px; gap: 12px; }
    .unit-row { grid-template-columns: minmax(0, 1fr); gap: 10px; } .swap { justify-self: center; } .comparison-grid { grid-template-columns: minmax(0, 1fr); }
  }
</style>
