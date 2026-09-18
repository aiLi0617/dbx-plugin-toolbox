<script>
  import { chrome, pick } from "./i18n.js";
  import { copyText } from "./clipboard.js";
  import {
    beijingPartsFromMs,
    formatBeijingDate,
    formatUnix,
    msFromBeijingParts,
    parseCompactBeijing,
    parseUnixToMs,
  } from "./tools/convert.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  const PART_FIELDS = [
    { key: "year", zh: "年", en: "Y", min: 1, max: 9999, wrap: false, pad: 0 },
    { key: "month", zh: "月", en: "M", min: 1, max: 12, wrap: true, pad: 2 },
    { key: "day", zh: "日", en: "D", min: 1, max: 31, wrap: true, pad: 2 },
    { key: "hour", zh: "时", en: "h", min: 0, max: 23, wrap: true, pad: 2 },
    { key: "minute", zh: "分", en: "m", min: 0, max: 59, wrap: true, pad: 2 },
    { key: "second", zh: "秒", en: "s", min: 0, max: 59, wrap: true, pad: 2 },
    { key: "ms", zh: "毫秒", en: "ms", min: 0, max: 999, wrap: true, pad: 3 },
  ];

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function daysInMonth(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 31;
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function fieldMax(key) {
    if (key === "day") return daysInMonth(parts.year, parts.month);
    return PART_FIELDS.find((field) => field.key === key)?.max ?? 59;
  }

  function formatPart(key, n) {
    const field = PART_FIELDS.find((item) => item.key === key);
    const width = field?.pad || 0;
    return width ? String(n).padStart(width, "0") : String(n);
  }

  function parsePart(key, field) {
    const n = Number(String(parts[key] ?? "").trim());
    if (Number.isInteger(n)) return n;
    if (key === "year") return beijingPartsFromMs(Date.now()).year;
    if (key === "month" || key === "day") return 1;
    return field.min;
  }

  function clampDay() {
    const max = fieldMax("day");
    const day = Number(String(parts.day ?? "").trim());
    if (Number.isInteger(day) && day > max) parts.day = pad2(max);
  }

  function stepPart(key, delta) {
    const field = PART_FIELDS.find((item) => item.key === key);
    if (!field) return;
    const max = fieldMax(key);
    let n = parsePart(key, field) + delta;
    if (field.wrap) {
      const span = max - field.min + 1;
      n = field.min + ((((n - field.min) % span) + span) % span);
    } else {
      n = Math.min(max, Math.max(field.min, n));
    }
    parts[key] = formatPart(key, n);
    if (key === "year" || key === "month") clampDay();
  }

  let holdTimer = 0;

  function clearHold() {
    window.clearTimeout(holdTimer);
    holdTimer = 0;
  }

  function beginStep(event, key, delta) {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stepPart(key, delta);
    clearHold();
    holdTimer = window.setTimeout(() => {
      const tick = () => {
        stepPart(key, delta);
        holdTimer = window.setTimeout(tick, 70);
      };
      tick();
    }, 380);
  }

  function onPartKey(key, event) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stepPart(key, 1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stepPart(key, -1);
      return;
    }
    onEnter(convertParts)(event);
  }

  function onPartWheel(key, event) {
    if (event.ctrlKey || event.metaKey) return;
    if (event.deltaY === 0 && event.deltaX === 0) return;
    event.preventDefault();
    stepPart(key, event.deltaY < 0 || event.deltaX < 0 ? 1 : -1);
  }

  function partsFromNow() {
    const p = beijingPartsFromMs(Date.now());
    return {
      year: String(p.year),
      month: pad2(p.month),
      day: pad2(p.day),
      hour: pad2(p.hour),
      minute: pad2(p.minute),
      second: pad2(p.second),
      ms: String(p.ms).padStart(3, "0"),
    };
  }

  let unit = $state("s");
  let nowText = $state(formatUnix(Date.now(), "s"));
  let tsInput = $state(formatUnix(Date.now(), "s"));
  let timeOut = $state("");
  let tsError = $state("");
  let tsMs = $state(null);
  let parts = $state(partsFromNow());
  let partsOut = $state("");
  let partsError = $state("");
  let partsMs = $state(null);
  let compactInput = $state("");
  let compactOut = $state("");
  let compactError = $state("");
  let compactMs = $state(null);
  let copiedId = $state("");
  const visiblePartFields = $derived(unit === "ms" ? PART_FIELDS : PART_FIELDS.filter((field) => field.key !== "ms"));

  $effect(() => {
    const u = unit;
    const tick = () => {
      nowText = formatUnix(Date.now(), u);
    };
    tick();
    const id = setInterval(tick, u === "ms" ? 50 : 250);
    return () => clearInterval(id);
  });

  $effect(() => {
    const u = unit;
    if (tsMs != null) timeOut = formatBeijingDate(tsMs, u);
    if (partsMs != null) partsOut = formatUnix(partsMs, u);
    if (compactMs != null) compactOut = formatUnix(compactMs, u);
  });

  function setUnit(next) {
    if (next === unit) return;
    try {
      tsInput = formatUnix(parseUnixToMs(tsInput), next);
    } catch {
      /* keep the raw input */
    }
    if (next === "ms" && !String(parts.ms ?? "").trim()) {
      parts.ms = String(beijingPartsFromMs(Date.now()).ms).padStart(3, "0");
    }
    unit = next;
  }

  function convertTs() {
    tsError = "";
    try {
      const ms = parseUnixToMs(tsInput);
      tsMs = ms;
      timeOut = formatBeijingDate(ms, unit);
    } catch {
      tsMs = null;
      timeOut = "";
      tsError = t("不是有效的时间戳", "Not a valid timestamp");
    }
  }

  function convertParts() {
    partsError = "";
    const required = visiblePartFields;
    if (required.some((field) => !String(parts[field.key] ?? "").trim())) {
      partsMs = null;
      partsOut = "";
      partsError =
        unit === "ms"
          ? t("请填写完整的年月日时分秒毫秒", "Fill in year, month, day, hour, minute, second, and millisecond")
          : t("请填写完整的年月日时分秒", "Fill in year, month, day, hour, minute, and second");
      return;
    }
    try {
      const ms = msFromBeijingParts(unit === "ms" ? parts : { ...parts, ms: 0 });
      partsMs = ms;
      partsOut = formatUnix(ms, unit);
    } catch {
      partsMs = null;
      partsOut = "";
      partsError = t("不是有效的北京时间", "Not a valid Beijing time");
    }
  }

  function convertCompact() {
    compactError = "";
    try {
      const ms = parseCompactBeijing(compactInput);
      compactMs = ms;
      compactOut = formatUnix(ms, unit);
    } catch {
      compactMs = null;
      compactOut = "";
      compactError = t("无法识别的时间格式", "Unrecognized time format");
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

  function padField(key) {
    const raw = String(parts[key] ?? "").trim();
    const field = PART_FIELDS.find((item) => item.key === key);
    if (!raw || !field?.pad) return;
    const n = Number(raw);
    if (!Number.isInteger(n)) return;
    parts[key] = String(n).padStart(field.pad, "0");
  }

  async function copy(id, text) {
    if (!text) return;
    try {
      await copyText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = "";
      }, 1200);
    } catch {
      copiedId = "";
    }
  }

  function copyLabel(done, zh, en) {
    if (done) return t(chrome.copied.zh, chrome.copied.en);
    return t(zh, en);
  }

  $effect(() => () => clearHold());
</script>

{#snippet copyBtn(id, text, zh, en)}
  {@const done = copiedId === id}
  <button
    class="dbx-btn dbx-btn--ghost time-copy"
    disabled={!text}
    onclick={() => copy(id, text)}
    title={copyLabel(done, zh, en)}
    aria-label={copyLabel(done, zh, en)}
    type="button"
  >
    {#if done}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5"></path>
      </svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    {/if}
  </button>
{/snippet}

<div class="time-convert">
  <section class="time-section">
    <p class="time-label">{t("当前时间戳(Unix timestamp)", "Current Unix timestamp")}</p>
    <div class="time-line">
      <input class="dbx-input time-mono" readonly value={nowText} />
      {@render copyBtn("now", nowText, "复制当前时间戳", "Copy current timestamp")}
    </div>
    <div class="time-units" role="radiogroup" aria-label={t("时间戳精度", "Timestamp precision")}>
      <label class="time-radio">
        <input checked={unit === "s"} name="time-unit" onchange={() => setUnit("s")} type="radio" value="s" />
        <span>{t("10位(秒级)", "10-digit (seconds)")}</span>
      </label>
      <label class="time-radio">
        <input checked={unit === "ms"} name="time-unit" onchange={() => setUnit("ms")} type="radio" value="ms" />
        <span>{t("13位(毫秒级)", "13-digit (milliseconds)")}</span>
      </label>
    </div>
  </section>

  <section class="time-section">
    <p class="time-label">{t("时间戳 → 北京时间", "Timestamp → Beijing time")}</p>
    <div class="time-line">
      <input
        class="dbx-input time-mono"
        spellcheck="false"
        autocomplete="off"
        inputmode="numeric"
        placeholder={unit === "ms" ? "1789726849000" : "1789726849"}
        bind:value={tsInput}
        onkeydown={onEnter(convertTs)}
      />
      <button class="dbx-btn dbx-btn--primary" onclick={convertTs} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line">
      <input class="dbx-input time-mono" readonly placeholder={t("转换后的时间", "Converted time")} value={timeOut} />
      {@render copyBtn("time", timeOut, "复制转换后的时间", "Copy converted time")}
    </div>
    {#if tsError}<p class="dbx-hint time-error">{tsError}</p>{/if}
  </section>

  <section class="time-section">
    <p class="time-label">{t("北京时间 → 时间戳（逐项输入）", "Beijing time → timestamp (fields)")}</p>
    <div class="time-line">
      <div class="time-parts" class:has-ms={unit === "ms"}>
        {#each visiblePartFields as field (field.key)}
          <div class="time-spin" class:year={field.key === "year"}>
            <input
              class="dbx-input time-part"
              inputmode="numeric"
              bind:value={parts[field.key]}
              aria-label={t(field.zh, field.en)}
              onblur={() => padField(field.key)}
              onfocus={(e) => e.currentTarget.select()}
              onkeydown={(e) => onPartKey(field.key, e)}
              onwheel={(e) => onPartWheel(field.key, e)}
            />
            <div class="time-spin-btns">
              <button
                class="time-spin-btn"
                onlostpointercapture={clearHold}
                onpointercancel={clearHold}
                onpointerdown={(e) => beginStep(e, field.key, 1)}
                onpointerup={clearHold}
                tabindex="-1"
                title={t("增加", "Increase")}
                type="button"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 8 6 4 9 8"></path>
                </svg>
              </button>
              <button
                class="time-spin-btn"
                onlostpointercapture={clearHold}
                onpointercancel={clearHold}
                onpointerdown={(e) => beginStep(e, field.key, -1)}
                onpointerup={clearHold}
                tabindex="-1"
                title={t("减少", "Decrease")}
                type="button"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 4 6 8 9 4"></path>
                </svg>
              </button>
            </div>
          </div>
          <span class="time-unit-label">{t(field.zh, field.en)}</span>
        {/each}
      </div>
      <button class="dbx-btn dbx-btn--primary" onclick={convertParts} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line">
      <input class="dbx-input time-mono" readonly placeholder={t("转换后的时间戳", "Converted timestamp")} value={partsOut} />
      {@render copyBtn("parts", partsOut, "复制转换后的时间戳", "Copy converted timestamp")}
    </div>
    {#if partsError}<p class="dbx-hint time-error">{partsError}</p>{/if}
  </section>

  <section class="time-section">
    <p class="time-label">{t("北京时间 → 时间戳（快速输入，支持常见格式）", "Beijing time → timestamp (common formats)")}</p>
    <p class="dbx-hint time-format-hint">
      {t(
        "例如 2026-09-18 20:31:17、20260918203117、2026/09/18 20:31:17、ISO 8601",
        "e.g. 2026-09-18 20:31:17, 20260918203117, 2026/09/18 20:31:17, ISO 8601",
      )}
    </p>
    <div class="time-line">
      <input
        class="dbx-input time-mono"
        spellcheck="false"
        autocomplete="off"
        placeholder="2026-09-18 20:31:17"
        bind:value={compactInput}
        onkeydown={onEnter(convertCompact)}
      />
      <button class="dbx-btn dbx-btn--primary" onclick={convertCompact} type="button">{t("转换", "Convert")}</button>
    </div>
    <div class="time-line">
      <input class="dbx-input time-mono" readonly placeholder={t("转换后的时间戳", "Converted timestamp")} value={compactOut} />
      {@render copyBtn("compact", compactOut, "复制转换后的时间戳", "Copy converted timestamp")}
    </div>
    {#if compactError}<p class="dbx-hint time-error">{compactError}</p>{/if}
  </section>
</div>

<style>
  .time-convert {
    display: flex;
    flex-direction: column;
    gap: 18px;
    max-width: 880px;
  }
  .time-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .time-label {
    margin: 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .time-line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
  }
  .time-mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .time-copy {
    width: 30px;
    padding: 0;
    flex-shrink: 0;
  }
  .time-units {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: center;
  }
  .time-radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
  }
  .time-radio input {
    margin: 0;
  }
  .time-parts {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) auto repeat(5, minmax(0, 1fr) auto);
    align-items: center;
    column-gap: 6px;
    row-gap: 6px;
    min-width: 0;
    width: 100%;
  }
  .time-parts.has-ms {
    grid-template-columns: minmax(0, 1.15fr) auto repeat(6, minmax(0, 1fr) auto);
  }
  .time-spin {
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    height: 30px;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-background, Canvas);
    overflow: hidden;
  }
  .time-spin.year {
    min-width: 0;
  }
  .time-spin:focus-within {
    outline: 2px solid var(--color-ring, var(--color-primary, #93c5fd));
    outline-offset: 1px;
    border-color: var(--color-ring, var(--color-primary, #93c5fd));
  }
  .time-part {
    min-width: 0;
    flex: 1;
    width: auto;
    height: 100%;
    border: 0;
    border-radius: 0;
    text-align: center;
    font-variant-numeric: tabular-nums;
    padding-left: 8px;
    padding-right: 4px;
    background: transparent;
  }
  .time-part:focus {
    outline: none;
    border: 0;
  }
  .time-spin-btns {
    display: flex;
    flex-direction: column;
    width: 20px;
    flex-shrink: 0;
    border-left: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
  }
  .time-spin-btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    cursor: pointer;
  }
  .time-spin-btn + .time-spin-btn {
    border-top: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
  }
  .time-spin-btn:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
    color: var(--color-foreground, CanvasText);
  }
  .time-unit-label {
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    flex-shrink: 0;
    white-space: nowrap;
  }
  .time-format-hint {
    margin: 0;
  }
  .time-error {
    margin: 0;
    color: var(--color-destructive, #dc2626);
  }
</style>
