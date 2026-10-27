<script>
  import { pick, localizeError } from "./i18n.js";
  import { businessDays } from "./calculators.js";
  import CopyButton from "./CopyButton.svelte";
  import DatePicker from "./DatePicker.svelte";
  import Select from "./Select.svelte";
  import { businessDayBreakdown, CN_CALENDAR_YEARS, CN_CALENDAR_SOURCE, CN_CALENDAR_PAPERS } from "./businessCalendar.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  function localDate(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  let mode = $state("difference");
  let calendar = $state("weekends");
  let start = $state(localDate());
  let end = $state(localDate(7));
  let startValid = $state(true), endValid = $state(true);
  let amount = $state(5);
  let weekends = $state([0, 6]);
  let holidays = $state("");
  let result = $state(null);
  let error = $state("");
  const weekdayLabels = $derived([
    t("周一", "Mon"), t("周二", "Tue"), t("周三", "Wed"),
    t("周四", "Thu"), t("周五", "Fri"), t("周六", "Sat"), t("周日", "Sun"),
  ]);
  const holidayDates = $derived([...new Set(holidays.split(/[\s,，;；]+/).filter(Boolean))]);
  const signature = $derived(JSON.stringify([mode, calendar, start, end, amount, weekends, holidays, startValid, endValid]));
  const current = $derived(result?.signature === signature ? result : null);
  const summary = $derived(current
    ? `${current.value.start} → ${current.value.end}\n${t("工作日", "Working days")}: ${current.value.workingDays ?? current.value.addedWorkingDays}`
    : "");

  function changeMode(value) {
    mode = value;
    error = "";
  }
  function toggleWeekend(day) {
    weekends = weekends.includes(day) ? weekends.filter((value) => value !== day) : [...weekends, day];
    error = "";
  }
  function calculate(event) {
    event?.preventDefault();
    result = null;
    error = "";
    if (!start || !startValid || (mode === "difference" && (!end || !endValid))) {
      error = t("请选择完整的日期。", "Select all required dates.");
      return;
    }
    if (calendar === "weekends" && weekends.length === 7) {
      error = t("请至少保留一个工作日。", "Keep at least one working weekday.");
      return;
    }
    if (mode === "add" && (amount === undefined || !Number.isInteger(Number(amount)) || Math.abs(Number(amount)) > 100000)) {
      error = t("工作日天数须为 -100000 到 100000 之间的整数。", "Working days must be an integer from -100000 to 100000.");
      return;
    }
    for (const date of holidayDates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
        error = t("节假日日期无效，请按 YYYY-MM-DD 格式填写真实日期。", "Invalid holiday. Enter real dates in YYYY-MM-DD format.");
        return;
      }
    }
    try {
      const value = businessDays(start, {
        ...(mode === "difference" ? { end } : { add: amount }),
        calendar, weekends, holidays: holidayDates,
      });
      const breakdown = businessDayBreakdown(value.start, value.end, { calendar, weekends, holidays: holidayDates });
      result = { value: { ...value, calendar, ...breakdown }, ...breakdown, signature };
    } catch (cause) {
      error = cause.code === "CALENDAR_YEAR_UNAVAILABLE"
        ? `${cause.year}：${t("该年份的中国大陆放假调休数据未内置，请调整日期或切换普通周末模式。", "Mainland China holiday data is not bundled for this year. Adjust the dates or switch to weekends only.")}`
        : localizeError(locale, cause);
    }
  }
  function reset() {
    mode = "difference";
    calendar = "weekends";
    start = localDate();
    end = localDate(7);
    amount = 5;
    weekends = [0, 6];
    holidays = "";
    result = null;
    error = "";
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    reset();
    start = "2026-10-23";
    end = "2026-10-30";
    calculate();
  });
</script>

<div class="business-page">
  <div class="workspace">
    <form class="settings panel" onsubmit={calculate} oninput={() => { error = ""; }}>
      <div class="mode-switch" role="group" aria-label={t("计算模式", "Calculation mode")}>
        <button type="button" class:active={mode === "difference"} aria-pressed={mode === "difference"} onclick={() => changeMode("difference")}>{t("工作日差", "Working day difference")}</button>
        <button type="button" class:active={mode === "add"} aria-pressed={mode === "add"} onclick={() => changeMode("add")}>{t("推算日期", "Find a date")}</button>
      </div>

      <section>
        <h3><span class="step">01</span>{t("日期设置", "Dates")}</h3>
        <div class="date-fields">
          <label>{t("开始日期", "Start date")}
            <DatePicker bind:value={start} bind:valid={startValid} {locale} min="0001-01-01" max="9999-12-31" ariaLabel={t("开始日期", "Start date")} />
          </label>
          {#if mode === "difference"}
            <label>{t("结束日期", "End date")}
              <DatePicker bind:value={end} bind:valid={endValid} {locale} min="0001-01-01" max="9999-12-31" ariaLabel={t("结束日期", "End date")} />
            </label>
          {:else}
            <label for="business-amount">{t("增加工作日", "Add working days")}
              <input id="business-amount" class="dbx-input" type="number" min="-100000" max="100000" step="1" bind:value={amount} required />
            </label>
          {/if}
        </div>
        <p class="hint">{mode === "difference" ? t("不含开始日期，包含结束日期；倒序计算返回负数。", "Excludes the start, includes the end. Reverse ranges return a negative count.") : t("输入负数可向前推算；输入 0 保持开始日期。", "Use a negative number to go backwards; 0 keeps the start date.")}</p>
      </section>

      <section>
        <h3><span class="step">02</span>{t("排除规则", "Exclusions")}</h3>
        <div class="calendar-field">
          <span class="calendar-label">{t("工作日历", "Work calendar")}</span>
          <Select bind:value={calendar} ariaLabel={t("工作日历", "Work calendar")} onchange={() => { error = ""; }} options={[
            { value: "weekends", label: t("普通周末（自定义）", "Weekends only (custom)") },
            { value: "cn", label: t("中国大陆放假调休", "Mainland China holidays and make-up workdays") },
          ]} />
          {#if calendar === "cn"}
            <p class="hint">{t("内置年份", "Bundled years")}：{CN_CALENDAR_YEARS.join("、")} · {t("离线可用，随插件更新", "Available offline; updated with the plugin")}</p>
            <p class="hint">{t("采用周六、周日休息及国家公布的放假调休安排，补班日计入工作日。", "Uses Saturday/Sunday weekends and published national holiday schedules, including make-up workdays.")}</p>
          {/if}
        </div>
        {#if calendar === "weekends"}
        <fieldset>
          <legend>{t("周末休息日", "Weekend days")}</legend>
          <div class="weekdays">
            {#each weekdayLabels as label, i}
              {@const day = (i + 1) % 7}
              <button type="button" class:selected={weekends.includes(day)} aria-pressed={weekends.includes(day)} onclick={() => toggleWeekend(day)}>{label}</button>
            {/each}
          </div>
          <p class="hint">{t("选中的星期不计入工作日。", "Selected weekdays are excluded from the count.")}</p>
        </fieldset>
        {/if}
        <div class="holiday-heading"><label for="business-holidays">{t("自定义节假日", "Custom holidays")}<span class="optional">{t("选填", "Optional holidays")}</span></label><span class="count">{holidayDates.length}</span></div>
        <textarea id="business-holidays" class="dbx-textarea" bind:value={holidays} rows="3" maxlength="100000" placeholder={t("YYYY-MM-DD，每行一个日期", "YYYY-MM-DD, one date per line")}></textarea>
        <p class="hint">{calendar === "cn"
          ? t("可额外添加休息日，优先于调休补班安排；重复日期只计一次。", "Add extra days off; these override make-up workdays. Duplicates count once.")
          : t("仅使用你填写的节假日，不自动加载法定假期或调休。重复日期只计一次。", "Uses only your holidays; public holidays and make-up workdays are not loaded automatically. Duplicates count once.")}</p>
      </section>

      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <!-- DBX omits allow-forms from its sandbox; invoke calculation directly. -->
      <div class="actions"><button class="dbx-btn dbx-btn--primary" type="button" onclick={calculate}>{t("计算", "Calculate")} <span aria-hidden="true">→</span></button><button class="dbx-btn dbx-btn--ghost" type="button" onclick={reset}>{t("重置", "Reset")}</button></div>
    </form>

    <aside class="result panel" aria-label={t("计算结果", "Calculation result")}>
      <div class="result-heading"><h3>{t("计算结果", "Calculation result")}</h3>{#if current}<CopyButton {locale} text={summary} />{/if}</div>
      <div aria-live="polite">
        {#if current}
          <div class="hero">
            <span class="eyebrow">{mode === "difference" ? t("相隔工作日", "Working day difference") : t("推算后的日期", "Resulting date")}</span>
            {#if mode === "difference"}<div class="hero-value">{current.value.workingDays}<span>{t("天", "days")}</span></div>
            {:else}<div class="hero-date">{current.value.end}</div><span class="weekday-result">{new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${current.value.end}T00:00:00Z`))}</span>{/if}
            <div class="date-range"><span>{current.value.start}</span><span aria-hidden="true">→</span><span>{current.value.end}</span></div>
          </div>
          <dl>
            <div><dt>{t("日历天数", "Calendar days")}</dt><dd>{current.total}</dd></div>
            <div><dt>{t("排除周末", "Weekend days excluded")}</dt><dd>{current.weekendCount}</dd></div>
            <div><dt>{t("排除节假日", "Holidays excluded")}</dt><dd>{current.holidayCount}</dd></div>
            {#if calendar === "cn"}<div><dt>{t("计入调休补班", "Make-up workdays included")}</dt><dd>{current.makeupCount}</dd></div>{/if}
            <div class="total"><dt>{t("工作日", "Working days")}</dt><dd>{Math.abs(current.value.workingDays ?? current.value.addedWorkingDays)}</dd></div>
          </dl>
          <p class="hint result-note">{t("节假日与周末重叠时不重复扣除。", "Holidays on weekends are not subtracted twice.")}</p>
        {:else}
          <div class="empty"><div class="empty-symbol" aria-hidden="true">↗</div><strong>{t("让日期更有计划", "Make every day count")}</strong><p>{t("设置日期和休息日，点击计算查看工作日与日期明细。", "Set your dates and days off, then calculate to see the breakdown.")}</p></div>
        {/if}
      </div>
      <div class="convention"><span aria-hidden="true">ⓘ</span><p>{t("从开始日期向目标方向逐日计算，不含开始日期；按所选日历和自定义休息日判断工作日。", "Counts towards the target, excluding the start date, using the selected calendar and custom days off.")}</p></div>
      {#if calendar === "cn"}<details class="sources"><summary>{t("日历数据来源", "Calendar data sources")}</summary>
        <p><a href={CN_CALENDAR_SOURCE} target="_blank" rel="noopener noreferrer">holiday-cn</a> · {t("依据国务院办公厅年度放假通知整理", "Compiled from annual State Council holiday notices")}</p>
        {#each CN_CALENDAR_PAPERS as paper}<p><a href={paper.url} target="_blank" rel="noopener noreferrer">{paper.year} · {t("放假安排通知", "Holiday schedule notice")}</a></p>{/each}
      </details>{/if}
    </aside>
  </div>
</div>

<style>
  .business-page { width:100%; max-width:1100px; margin:0 auto; padding:28px 24px; overflow:auto; container-type:inline-size; color:var(--color-foreground); }
  p { margin:0; font-size:12px; color:var(--color-muted-foreground); line-height:1.7; }
  .workspace { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(290px,1fr); gap:20px; align-items:start; }
  .panel { border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-card); min-width:0; }
  .settings { padding:22px; display:flex; flex-direction:column; gap:24px; }
  .mode-switch { display:flex; gap:4px; padding:4px; background:var(--color-muted); border-radius:var(--radius-lg); }
  .mode-switch button { flex:1; min-width:0; padding:9px 8px; border:1px solid transparent; background:transparent; border-radius:var(--radius-md); color:var(--color-muted-foreground); font:inherit; font-size:13px; cursor:pointer; }
  .mode-switch button.active { background:var(--color-card); border-color:var(--color-border); color:var(--color-foreground); font-weight:600; box-shadow:0 1px 3px rgb(0 0 0 / .04); }
  h3 { display:flex; align-items:center; gap:9px; margin:0 0 16px; font-size:13px; font-weight:600; }
  .step { font:11px var(--font-mono); color:var(--color-muted-foreground); }
  .date-fields { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  label { display:flex; flex-direction:column; gap:8px; font-size:12px; min-width:0; }
  .dbx-input { width:100%; min-width:0; min-height:38px; font-variant-numeric:tabular-nums; }
  .hint { margin-top:9px; font-size:11px; }
  .calendar-field { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
  .calendar-label { font-size:12px; }
  .calendar-field .hint { margin-top:0; }
  .sources p { margin-top:8px; }
  .sources a { color:var(--color-info); text-decoration:underline; text-underline-offset:3px; }
  fieldset { padding:0; margin:0 0 20px; border:0; min-width:0; }
  legend { padding:0; margin-bottom:10px; font-size:12px; }
  .weekdays { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:5px; }
  .weekdays button { min-height:35px; padding:4px 1px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-card); color:var(--color-muted-foreground); font:inherit; font-size:12px; cursor:pointer; }
  .weekdays button.selected { border-color:var(--dbx-selection-border); background:var(--dbx-selection-background); color:var(--dbx-selection-foreground); }
  button:focus-visible, summary:focus-visible { outline:2px solid var(--color-ring); outline-offset:3px; }
  .weekdays button:hover, .mode-switch button:not(.active):hover { border-color:var(--color-ring); }
  .holiday-heading { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
  .holiday-heading label { flex-direction:row; align-items:center; }
  .optional, .count { font-size:10px; color:var(--color-muted-foreground); }
  .count { background:var(--color-muted); padding:2px 7px; border-radius:var(--radius-sm); font-variant-numeric:tabular-nums; }
  textarea { display:block; width:100%; min-height:88px; resize:vertical; font:12px/1.7 var(--font-mono); }
  .actions { display:flex; gap:8px; padding-top:18px; border-top:1px solid var(--color-border); }
  .actions .dbx-btn { min-height:36px; padding-inline:18px; gap:22px; }
  .error { color:var(--color-destructive); overflow-wrap:anywhere; }
  .result { padding:22px; }
  .result-heading { display:flex; justify-content:space-between; align-items:center; min-height:30px; margin-bottom:18px; }
  .result-heading h3 { margin:0; }
  .hero { padding:22px 12px; text-align:center; background:var(--color-muted); border-radius:var(--radius-md); }
  .eyebrow { font-size:11px; color:var(--color-muted-foreground); }
  .hero-value { margin:8px 0 18px; font-size:64px; line-height:1.1; font-weight:600; letter-spacing:-2px; font-variant-numeric:tabular-nums; }
  .hero-value span { margin-left:9px; font-size:13px; font-weight:400; letter-spacing:0; color:var(--color-muted-foreground); }
  .hero-date { margin:12px 0 6px; font-size:29px; font-weight:600; font-variant-numeric:tabular-nums; letter-spacing:-.7px; }
  .weekday-result { display:block; font-size:12px; color:var(--color-muted-foreground); margin-bottom:16px; }
  .date-range { display:flex; flex-wrap:wrap; justify-content:center; gap:9px; font:11px/1.7 var(--font-mono); color:var(--color-muted-foreground); }
  dl { margin:18px 0 0; font-size:12px; }
  dl div { display:flex; justify-content:space-between; gap:12px; padding:10px 0; }
  dt { color:var(--color-muted-foreground); }
  dd { margin:0; font-variant-numeric:tabular-nums; font-weight:500; }
  dl .total { margin-top:4px; border-top:1px solid var(--color-border); font-weight:600; }
  .total dt { color:var(--color-foreground); }
  .result-note { margin-top:0; }
  .empty { min-height:286px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:24px 10px; }
  .empty-symbol { display:grid; place-items:center; width:48px; height:48px; font-size:28px; color:var(--color-muted-foreground); background:var(--color-muted); border-radius:50%; margin-bottom:18px; }
  .empty strong { font-size:14px; font-weight:500; margin-bottom:9px; }
  .empty p { max-width:240px; }
  .convention { display:flex; gap:8px; margin-top:20px; padding-top:16px; border-top:1px solid var(--color-border); color:var(--color-muted-foreground); }
  .convention p { font-size:11px; }
  details { margin-top:18px; border-top:1px solid var(--color-border); padding-top:14px; }
  summary { font-size:11px; color:var(--color-muted-foreground); cursor:pointer; }
  @container (max-width:760px) { .workspace { grid-template-columns:1fr; } .empty { min-height:180px; } }
  @container (max-width:420px) { .date-fields { grid-template-columns:1fr; } .settings,.result { padding:16px; } }
  @media (max-width:480px) { .business-page { padding:18px 12px; } }
</style>
