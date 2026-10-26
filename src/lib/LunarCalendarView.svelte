<script>
  import { pick } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import DatePicker from "./DatePicker.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  let direction = $state("solar");
  let solarDate = $state(today());
  let solarValid = $state(true);
  let year = $state(2026), month = $state("1"), day = $state(1), leap = $state(false);
  let leapResolver = $state(null);
  const leapMonth = $derived(leapResolver ? leapResolver(Number(year)) : 0);
  let result = $state(null), error = $state(""), busy = $state(false);
  let appliedDemoRequest = 0;
  const monthNames = ["正月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "冬月", "腊月"];
  const json = $derived(result ? JSON.stringify(result, null, 2) : "");
  const requestJson = $derived(JSON.stringify(direction === "solar"
    ? { direction, solarDate }
    : { direction, year: Number(year), month: Number(month), day: Number(day), leap }, null, 2));
  const text = $derived(result ? `${t("公历", "Solar date")}: ${result.solar}\n${t("农历", "Lunar date")}: ${result.description}` : "");
  const weekday = $derived(result ? new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${result.solar}T12:00:00Z`)) : "");
  const canSelectLeap = $derived(direction === "lunar" && leapMonth > 0 && Number(month) === leapMonth);

  function reverse() {
    if (!result || busy) return;
    solarDate = result.solar;
    year = result.lunarYear;
    month = String(result.lunarMonth);
    day = result.lunarDay;
    leap = result.leapMonth;
    direction = direction === "solar" ? "lunar" : "solar";
  }
  function useToday() { direction = "solar"; solarDate = today(); }
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    direction = "solar";
    solarDate = "2026-02-17";
  });
  $effect(() => {
    let cancelled = false;
    loadAssetModule("content-tools").then((lib) => {
      if (!cancelled) leapResolver = lib.lunarLeapMonth;
    }).catch(() => {});
    return () => { cancelled = true; };
  });
  $effect(() => { if (leapResolver && !canSelectLeap && leap) leap = false; });
  $effect(() => {
    const values = { direction, solarDate, year: Number(year), month: Number(month), day: Number(day), leap };
    const empty = direction === "solar" ? !solarDate || !solarValid : year == null || day == null;
    let cancelled = false;
    result = null;
    error = "";
    busy = !empty;
    const timer = setTimeout(async () => {
      if (empty) return;
      try {
        const lib = await loadAssetModule("content-tools");
        if (values.direction === "lunar") {
          const available = lib.lunarLeapMonth(values.year);
          if (values.leap && available !== values.month) throw new Error("Invalid leap month");
        }
        const converted = lib.lunarConvert(values);
        if (!cancelled) result = converted;
      } catch {
        if (!cancelled) error = values.direction === "solar"
          ? t("请输入 1900–2100 年间的有效公历日期。", "Enter a valid solar date between 1900 and 2100.")
          : t("农历日期无效，请检查年份、月份、日期及闰月。并非每年都有闰月，部分月份只有 29 天。", "Invalid lunar date. Check the year, month, day and leap month. Some months have only 29 days and not every year has a leap month.");
      } finally { if (!cancelled) busy = false; }
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>

<div class="calendar-page">
  <div class="toolbar">
    <div class="mode-switch" role="group" aria-label={t("转换方向", "Direction")}>
      <button class:active={direction === "solar"} aria-pressed={direction === "solar"} onclick={() => (direction = "solar")}>{t("公历 → 农历", "Solar → Lunar")}</button>
      <button class:active={direction === "lunar"} aria-pressed={direction === "lunar"} onclick={() => (direction = "lunar")}>{t("农历 → 公历", "Lunar → Solar")}</button>
    </div>
    <span class="range">{t("当前农历数据范围", "Lunar data range")} <b>1900–2100</b></span>
  </div>

  <div class="workspace">
    <section class="panel input-panel" aria-labelledby="calendar-input-title">
      <header><div class="heading"><h2 id="calendar-input-title">{t("输入参数", "Input parameters")}</h2></div><button class="dbx-btn dbx-btn--ghost" onclick={useToday}>{t("今天", "Today")}</button></header>
      <div class="input-body">
        <p class="eyebrow">{direction === "solar" ? t("公历日期", "Solar date") : t("农历日期", "Lunar date")}</p>
        {#if direction === "solar"}
          <DatePicker bind:value={solarDate} bind:valid={solarValid} {locale} min="1900-01-01" max="2100-12-31" ariaLabel={t("公历日期", "Solar date")} />
        {:else}
          <div class="date-fields">
            <label>{t("年", "Year")}<input class="dbx-input" type="number" min="1900" max="2100" step="1" bind:value={year} aria-invalid={Boolean(error)} /></label>
            <div class="month-field"><span>{t("月", "Month")}</span><Select bind:value={month} ariaLabel={t("农历月份", "Lunar month")} options={monthNames.map((name, i) => ({ value: String(i + 1), label: locale.startsWith("zh") ? name : String(i + 1) }))} /></div>
            <label>{t("日", "Day")}<input class="dbx-input" type="number" min="1" max="30" step="1" bind:value={day} aria-invalid={Boolean(error)} /></label>
          </div>
          <label class="leap" class:disabled={!canSelectLeap} title={!leapMonth ? t("该年份没有闰月", "This year has no leap month") : canSelectLeap ? t(`闰${monthNames[leapMonth - 1]}`, `Leap month ${leapMonth}`) : t(`该年闰${monthNames[leapMonth - 1]}，当前月份不可选`, `This year has a leap ${monthNames[leapMonth - 1]}, not the selected month`)}><input type="checkbox" bind:checked={leap} disabled={!canSelectLeap} />{!leapMonth ? t("该年份无闰月", "No leap month in this year") : canSelectLeap ? t(`闰${monthNames[leapMonth - 1]}`, `Leap month ${leapMonth}`) : t(`仅闰${monthNames[leapMonth - 1]}可选`, `Only leap month ${leapMonth} is available`)}</label>
        {/if}
        <p class="help" id="calendar-help">{direction === "solar" ? t("选择或输入日期，自动换算为中国农历。", "Choose or enter a date to convert to the Chinese lunar calendar.") : t("输入农历年月日；仅在该月为闰月时勾选。", "Enter the lunar year, month and day. Select leap month only when applicable.")}</p>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
      </div>
      <footer><span class="live-dot" aria-hidden="true"></span>{t("本地自动转换", "Local auto convert")}</footer>
    </section>

    <section class="panel result-panel" aria-labelledby="calendar-result-title" aria-busy={busy}>
      <header><div class="heading"><h2 id="calendar-result-title">{t("转换结果", "Conversion result")}</h2></div><div class="copy"><span class="status" class:ready={result}>{result ? t("成功", "Ready") : busy ? t("处理中", "Running") : t("等待输入", "Idle")}</span><CopyButton {locale} text={text} /></div></header>
      <div class="result-body" aria-live="polite">
        {#if result}
          <p class="eyebrow">{direction === "solar" ? t("农历", "Lunar date") : t("公历", "Solar date")}</p>
          <div class="primary-date">{direction === "solar" ? result.description : result.solar}</div>
          <p class="secondary-date">{direction === "solar" ? result.solar : result.description}<span>·</span>{weekday}</p>
          <dl>
            <div><dt>{t("农历年份", "Lunar year")}</dt><dd>{result.lunarYear}</dd></div>
            <div><dt>{t("农历月份", "Lunar month")}</dt><dd>{result.leapMonth ? t("闰", "Leap ") : ""}{locale.startsWith("zh") ? monthNames[result.lunarMonth - 1] : result.lunarMonth}</dd></div>
            <div><dt>{t("农历日", "Lunar day")}</dt><dd>{result.lunarDay}</dd></div>
          </dl>
        {:else}
          <div class="empty"><span aria-hidden="true">◷</span><strong>{busy ? t("正在转换…", "Converting…") : t("等待有效日期", "Waiting for a valid date")}</strong><p>{t("日期的两种表达，在这里相遇。", "See the same day in both calendars.")}</p></div>
        {/if}
      </div>
      <footer><button class="reverse" disabled={!result || busy} onclick={reverse}>{t("以此结果反向转换", "Convert this result back")} <span aria-hidden="true">↔</span></button></footer>
    </section>
  </div>
  <details class="json-panel"><summary>{t("原始数据", "Raw data")}</summary><div class="json-grid"><div class="json-block"><div class="json-heading"><span><small>{t("输入载荷", "Input payload")}</small></span><CopyButton {locale} text={requestJson} labelZh="复制请求 JSON" labelEn="Copy request JSON" /></div><pre>{requestJson}</pre></div><div class="json-block"><div class="json-heading"><span><small>{t("转换响应", "Conversion response")}</small></span><CopyButton {locale} text={json} labelZh="复制响应 JSON" labelEn="Copy response JSON" /></div><pre>{json || "{}"}</pre></div></div></details>
</div>

<style>
  .calendar-page{width:min(1180px,100%);margin:0 auto;padding:24px 28px;color:var(--color-foreground);container-type:inline-size}
  .toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
  .mode-switch{display:flex;gap:4px;padding:4px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-muted)}
  .mode-switch button{font:inherit;font-size:12px;padding:9px 18px;border:1px solid transparent;border-radius:var(--radius-md);background:transparent;color:var(--color-muted-foreground);cursor:pointer}
  .mode-switch button.active{background:var(--color-card);border-color:var(--color-border);color:var(--color-primary);box-shadow:0 1px 3px rgb(0 0 0 / 4%)}
  .range{font-size:11px;color:var(--color-muted-foreground)}.range b{font-weight:500;font-variant-numeric:tabular-nums;margin-left:6px}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:18px}
  .panel{min-width:0;display:flex;flex-direction:column;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card);overflow:hidden}.input-panel{position:relative;z-index:2;overflow:visible}.result-panel{position:relative;z-index:1}
  header{height:54px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--color-border)}.heading{display:flex;align-items:center;gap:9px;min-width:0}h2{font-size:13px;font-weight:600;margin:0}
  .copy{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--color-muted-foreground)}.status{font:10px var(--font-mono);padding:3px 6px;border:1px solid var(--color-border);border-radius:3px}.status.ready{color:var(--color-success);border-color:color-mix(in srgb,var(--color-success) 35%,var(--color-border))}
  .input-body{padding:26px 22px;flex:1}.eyebrow{font-size:12px;color:var(--color-muted-foreground);margin:0 0 14px}
  .date-fields{display:grid;grid-template-columns:1.3fr 1fr .85fr;gap:12px}.date-fields label,.month-field{display:flex;flex-direction:column;gap:9px;font-size:12px;color:var(--color-muted-foreground);min-width:0}.date-fields input{width:100%;min-width:0}
  .leap{display:flex;gap:8px;align-items:center;margin-top:18px;font-size:12px}.leap input{accent-color:var(--color-primary)}.leap.disabled{color:var(--color-muted-foreground);opacity:.7}
  .help{font-size:12px;line-height:1.8;color:var(--color-muted-foreground);margin:16px 0 0}.error{font-size:12px;line-height:1.7;color:var(--color-destructive);margin:14px 0 0}
  footer{display:flex;align-items:center;gap:7px;min-height:46px;padding:12px 18px;border-top:1px solid var(--color-border);font-size:11px;color:var(--color-muted-foreground)}.live-dot{width:6px;height:6px;border-radius:50%;background:var(--color-success)}
  .result-panel{background:color-mix(in srgb,var(--color-primary) 3%,var(--color-card))}.result-body{padding:28px;flex:1;min-height:248px}.primary-date{font-size:clamp(23px,3cqi,32px);font-weight:600;line-height:1.5;letter-spacing:.02em;overflow-wrap:anywhere;color:var(--color-primary)}.secondary-date{font-size:13px;color:var(--color-muted-foreground);margin:10px 0 24px}.secondary-date span{margin:0 10px}
  dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding-top:20px;border-top:1px solid var(--color-border)}dt{font-size:11px;color:var(--color-muted-foreground)}dd{font-size:16px;margin:8px 0 0;font-weight:500}
  .reverse{font:inherit;color:var(--color-primary);background:none;border:0;padding:0;cursor:pointer;display:flex;align-items:center;gap:8px}.reverse:disabled{opacity:.45;cursor:default}
  .empty{min-height:192px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:var(--color-muted-foreground);gap:12px}.empty>span{font-size:32px;opacity:.5}.empty strong{font-size:13px;font-weight:500}.empty p{font-size:12px;margin:0}
  .json-panel{margin-top:18px;border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;background:color-mix(in srgb,var(--color-muted) 35%,var(--color-card))}summary{padding:15px 18px;font-size:12px;color:var(--color-foreground);font-weight:600;cursor:pointer}.json-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border-top:1px solid var(--color-border)}.json-block{min-width:0}.json-block+.json-block{border-left:1px solid var(--color-border)}.json-heading{display:flex;align-items:center;justify-content:space-between;padding:9px 12px 5px;font-size:10px;color:var(--color-muted-foreground)}.json-heading span{display:flex;flex-direction:column;gap:2px}.json-heading small{font-size:10px;font-weight:400}pre{margin:0;padding:6px 12px 16px;font:12px/1.8 var(--font-mono);white-space:pre-wrap;overflow-wrap:anywhere;color:var(--color-foreground)}
  button:focus-visible,summary:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  @container(max-width:720px){.workspace,.json-grid{grid-template-columns:1fr}.json-block+.json-block{border-left:0;border-top:1px solid var(--color-border)}.result-body{min-height:230px}.mode-switch button{padding:8px 12px}}
  @media(max-width:600px){.calendar-page{padding:18px 14px}.result-body,.input-body{padding:22px 18px}.copy>span{display:none}}
.calendar-page{padding:0}.toolbar{margin-bottom:12px}.workspace{gap:12px}.input-body,.result-body{padding:16px}.result-body{min-height:180px}.secondary-date{margin-bottom:12px}
</style>
