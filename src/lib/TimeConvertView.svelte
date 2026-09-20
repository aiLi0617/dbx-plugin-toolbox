<script>
  import { onMount } from "svelte";
  import { pick } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import {
    beijingPartsFromMs, formatBeijingDate, formatUnix, msFromBeijingParts,
    parseCompactBeijing, parseUnixToMs,
  } from "./tools/convert.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const PART_FIELDS = [
    { key: "year", zh: "年", en: "Year", pad: 4 },
    { key: "month", zh: "月", en: "Month", pad: 2 },
    { key: "day", zh: "日", en: "Day", pad: 2 },
    { key: "hour", zh: "时", en: "Hour", pad: 2 },
    { key: "minute", zh: "分", en: "Minute", pad: 2 },
    { key: "second", zh: "秒", en: "Second", pad: 2 },
    { key: "ms", zh: "毫秒", en: "Millisecond", pad: 3 },
  ];

  function pad2(value) { return String(value).padStart(2, "0"); }
  function partsFromNow() {
    const current = beijingPartsFromMs(Date.now());
    return {
      year: String(current.year), month: pad2(current.month), day: pad2(current.day),
      hour: pad2(current.hour), minute: pad2(current.minute), second: pad2(current.second),
      ms: String(current.ms).padStart(3, "0"),
    };
  }

  let unit = $state("s");
  let now = $state(Date.now());
  let timestampInput = $state(formatUnix(Date.now(), "s"));
  let timestampOutput = $state("");
  let timestampError = $state("");
  let timestampMs = $state(null);
  let parts = $state(partsFromNow());
  let partsOutput = $state("");
  let partsError = $state("");
  let partsMs = $state(null);
  let compactInput = $state("");
  let compactOutput = $state("");
  let compactError = $state("");
  let compactMs = $state(null);
  const nowText = $derived(formatUnix(now, unit));
  const visiblePartFields = $derived(unit === "ms" ? PART_FIELDS : PART_FIELDS.filter((field) => field.key !== "ms"));

  onMount(() => {
    const timer = setInterval(() => { now = Date.now(); }, unit === "ms" ? 50 : 250);
    return () => clearInterval(timer);
  });

  function setUnit(next) {
    if (next === unit) return;
    try { timestampInput = formatUnix(parseUnixToMs(timestampInput, unit), next); } catch { /* Keep invalid input unchanged. */ }
    if (next === "ms" && !String(parts.ms ?? "").trim()) parts.ms = String(beijingPartsFromMs(Date.now()).ms).padStart(3, "0");
    unit = next;
    if (timestampMs != null) timestampOutput = formatBeijingDate(timestampMs, unit);
    if (partsMs != null) partsOutput = formatUnix(partsMs, unit);
    if (compactMs != null) compactOutput = formatUnix(compactMs, unit);
  }

  function convertTimestamp() {
    timestampError = "";
    try {
      timestampMs = parseUnixToMs(timestampInput, unit);
      timestampOutput = formatBeijingDate(timestampMs, unit);
    } catch {
      timestampMs = null;
      timestampOutput = "";
      timestampError = t("不是有效的时间戳", "Not a valid Unix timestamp");
    }
  }

  function padField(key) {
    const field = PART_FIELDS.find((item) => item.key === key);
    const raw = String(parts[key] ?? "").trim();
    if (!raw || !field?.pad || !/^\d+$/.test(raw)) return;
    parts[key] = raw.padStart(field.pad, "0");
  }

  function daysInMonth(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 31;
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function boundsFor(key) {
    if (key === "year") return [1, 9999, false];
    if (key === "month") return [1, 12, true];
    if (key === "day") return [1, daysInMonth(parts.year, parts.month), true];
    if (key === "hour") return [0, 23, true];
    if (key === "minute" || key === "second") return [0, 59, true];
    return [0, 999, true];
  }

  function stepPart(key, delta) {
    const [min, max, wrap] = boundsFor(key);
    const current = Number(String(parts[key] ?? "").trim());
    let value = Number.isInteger(current) ? current + delta : min;
    if (wrap) {
      const span = max - min + 1;
      value = min + ((((value - min) % span) + span) % span);
    } else {
      value = Math.max(min, Math.min(max, value));
    }
    const field = PART_FIELDS.find((item) => item.key === key);
    parts[key] = String(value).padStart(field?.pad || 0, "0");
    if (key === "year" || key === "month") {
      const maxDay = daysInMonth(parts.year, parts.month);
      if (Number(parts.day) > maxDay) parts.day = String(maxDay).padStart(2, "0");
    }
    partsError = "";
    partsOutput = "";
    partsMs = null;
  }

  function convertParts() {
    partsError = "";
    if (visiblePartFields.some((field) => !String(parts[field.key] ?? "").trim())) {
      partsMs = null;
      partsOutput = "";
      partsError = unit === "ms"
        ? t("请填写完整的年月日时分秒毫秒", "Fill in year, month, day, hour, minute, second, and millisecond")
        : t("请填写完整的年月日时分秒", "Fill in year, month, day, hour, minute, and second");
      return;
    }
    try {
      partsMs = msFromBeijingParts(unit === "ms" ? parts : { ...parts, ms: 0 });
      partsOutput = formatUnix(partsMs, unit);
    } catch {
      partsMs = null;
      partsOutput = "";
      partsError = t("不是有效的北京时间", "Not a valid Beijing time");
    }
  }

  function convertCompact() {
    compactError = "";
    try {
      compactMs = parseCompactBeijing(compactInput);
      compactOutput = formatUnix(compactMs, unit);
    } catch {
      compactMs = null;
      compactOutput = "";
      compactError = t("无法识别的时间格式", "Unrecognized date-time format");
    }
  }

  function onEnter(fn) {
    return (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        fn();
      }
    };
  }
</script>

<div class="unix-page">
  <section class="unix-section current-section">
    <p class="section-label">{t("当前时间戳（Unix timestamp）", "Current Unix timestamp")}</p>
    <div class="time-line"><input class="dbx-input time-mono" readonly aria-label={t("当前时间戳", "Current Unix timestamp")} value={nowText} /><CopyButton {locale} text={nowText} labelZh="复制当前时间戳" labelEn="Copy current timestamp" /></div>
    <div class="unit-radios" role="radiogroup" aria-label={t("时间戳精度", "Timestamp precision")}>
      <label><input checked={unit === "s"} onchange={() => setUnit("s")} name="time-unit" type="radio" value="s" />{t("10 位（秒级）", "10-digit (seconds)")}</label>
      <label><input checked={unit === "ms"} onchange={() => setUnit("ms")} name="time-unit" type="radio" value="ms" />{t("13 位（毫秒级）", "13-digit (milliseconds)")}</label>
    </div>
  </section>

  <section class="unix-section">
    <p class="section-label">{t("时间戳 → 北京时间", "Timestamp → Beijing time")}</p>
    <div class="time-line">
      <input class="dbx-input time-mono" spellcheck="false" autocomplete="off" inputmode="numeric" aria-label={t("待转换的 Unix 时间戳", "Unix timestamp to convert")} placeholder={unit === "ms" ? "1789726849000" : "1789726849"} bind:value={timestampInput} onkeydown={onEnter(convertTimestamp)} />
      <button class="dbx-btn dbx-btn--primary" onclick={convertTimestamp} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line"><input class="dbx-input time-mono" readonly aria-label={t("转换后的北京时间", "Converted Beijing time")} placeholder={t("转换后的北京时间", "Converted Beijing time")} value={timestampOutput} /><CopyButton {locale} text={timestampOutput} labelZh="复制转换后的北京时间" labelEn="Copy converted Beijing time" /></div>
    {#if timestampError}<p class="dbx-hint time-error" role="alert">{timestampError}</p>{/if}
  </section>

  <section class="unix-section">
    <p class="section-label">{t("北京时间 → 时间戳（逐项输入）", "Beijing time → timestamp (fields)")}</p>
    <div class="parts-line">
      <div class="time-parts" class:has-ms={unit === "ms"}>
        {#each visiblePartFields as field (field.key)}
          <label class="part-field">
            <input class="dbx-input time-part" inputmode="numeric" aria-label={t(field.zh, field.en)} bind:value={parts[field.key]} onblur={() => padField(field.key)} onfocus={(event) => event.currentTarget.select()} />
            <span class="part-controls">
              <button class="part-control" type="button" aria-label={t(`增加${field.zh}`, `Increase ${field.en}`)} title={t("增加", "Increase")} onclick={() => stepPart(field.key, 1)}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8 6 4 9 8"></path></svg>
              </button>
              <button class="part-control" type="button" aria-label={t(`减少${field.zh}`, `Decrease ${field.en}`)} title={t("减少", "Decrease")} onclick={() => stepPart(field.key, -1)}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4 6 8 9 4"></path></svg>
              </button>
            </span>
            <span>{t(field.zh, field.en)}</span>
          </label>
        {/each}
      </div>
      <button class="dbx-btn dbx-btn--primary" onclick={convertParts} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line"><input class="dbx-input time-mono" readonly aria-label={t("逐项输入转换后的时间戳", "Timestamp from fields")} placeholder={t("转换后的时间戳", "Converted timestamp")} value={partsOutput} /><CopyButton {locale} text={partsOutput} labelZh="复制转换后的时间戳" labelEn="Copy converted timestamp" /></div>
    {#if partsError}<p class="dbx-hint time-error" role="alert">{partsError}</p>{/if}
  </section>

  <section class="unix-section">
    <p class="section-label">{t("北京时间 → 时间戳（快速输入格式：YYYYMMDDHHMMSS）", "Beijing time → timestamp (quick format: YYYYMMDDHHMMSS)")}</p>
    <p class="format-hint">{t("也支持 2026-09-18 20:31:17、2026/09/18 20:31:17 和 ISO 8601。", "Also accepts 2026-09-18 20:31:17, 2026/09/18 20:31:17, and ISO 8601.")}</p>
    <div class="time-line">
      <input class="dbx-input time-mono" spellcheck="false" autocomplete="off" aria-label={t("快速时间输入", "Quick date-time input")} placeholder="20260918203117" bind:value={compactInput} onkeydown={onEnter(convertCompact)} />
      <button class="dbx-btn dbx-btn--primary" onclick={convertCompact} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line"><input class="dbx-input time-mono" readonly aria-label={t("快速输入转换后的时间戳", "Timestamp from quick input")} placeholder={t("转换后的时间戳", "Converted timestamp")} value={compactOutput} /><CopyButton {locale} text={compactOutput} labelZh="复制转换后的时间戳" labelEn="Copy converted timestamp" /></div>
    {#if compactError}<p class="dbx-hint time-error" role="alert">{compactError}</p>{/if}
  </section>
</div>

<style>
  .unix-page { display: flex; flex: 1 1 auto; min-height: 0; flex-direction: column; gap: var(--ui-gap, 12px); width: min(920px, 100%); }
  .unix-section { display: flex; flex-direction: column; gap: var(--ui-field-gap, 6px); min-width: 0; }
  .section-label { display: flex; align-items: center; min-height: var(--ui-caption, 20px); margin: 0; color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size: 12px; font-weight: 500; line-height: 1.25; }
  .time-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .time-mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .unit-radios { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size: 12px; }
  .unit-radios label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
  .unit-radios input { margin: 0; }
  .parts-line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
  .time-parts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; min-width: 0; }
  .time-parts.has-ms { grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .part-field { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; min-width: 0; border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent))); border-radius: var(--radius-md, 4px); overflow: hidden; background: var(--color-background, Canvas); }
  .part-field:focus-within { outline: 2px solid var(--color-ring, var(--color-primary)); outline-offset: 1px; }
  .time-part { min-width: 0; width: 100%; height: 30px; padding: 0 8px; border: 0; border-radius: 0; background: transparent; font-family: var(--font-mono); text-align: center; }
  .time-part:focus { outline: 0; }
  .part-field span { padding: 0 7px 0 4px; color: var(--color-muted-foreground); font-size: 12px; white-space: nowrap; }
  .part-field .part-controls { display: flex; flex-direction: column; align-self: stretch; padding: 0; border-left: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)); }
  .part-control { display: inline-flex; align-items: center; justify-content: center; width: 20px; flex: 1; min-height: 14px; padding: 0; border: 0; background: transparent; color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size: 12px; line-height: 1; cursor: pointer; }
  .part-control + .part-control { border-top: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)); }
  .part-control:hover, .part-control:focus-visible { background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent))); color: var(--color-foreground, CanvasText); }
  .format-hint { margin: 0; line-height: 1.5; }
  .time-error { margin: 0; color: var(--color-destructive); }
  @media (max-width: 760px) {
    .parts-line { grid-template-columns: 1fr; }
    .time-parts, .time-parts.has-ms { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
