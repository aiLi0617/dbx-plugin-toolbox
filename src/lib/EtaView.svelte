<script>
  import { pick } from "./i18n.js";
  import { precision } from "./calculators.js";
  import { calculateEta, validateEta } from "./eta.js";
  import Select from "./Select.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let total = $state(""), completed = $state(""), elapsed = $state("");
  let unit = $state(1), submitted = $state(false);
  let snapshot = $state(null), rangeError = $state("");
  let appliedDemoRequest = 0;
  const source = $derived(JSON.stringify([total, completed, elapsed, unit]));
  const errors = $derived(validateEta(total, completed, elapsed, unit));
  // Keep the result responsive even when the host swallows a form click while
  // the iframe is initializing. Clicking still freezes a measured timestamp.
  const liveResult = $derived.by(() => {
    if (Object.keys(errors).length) return null;
    try { return calculateEta(total, completed, elapsed, unit); } catch { return null; }
  });
  const result = $derived(snapshot?.source === source ? snapshot.value : liveResult);
  const currentRangeError = $derived(rangeError === source);
  const format = (value) => String(precision(value, 8));

  function duration(seconds) {
    if (seconds === null) return "—";
    if (seconds > 0 && seconds < 1) return t("不足 1 秒", "Less than 1 second");
    let rest = Math.ceil(seconds);
    const days = Math.floor(rest / 86400); rest %= 86400;
    const hours = Math.floor(rest / 3600); rest %= 3600;
    const minutes = Math.floor(rest / 60), secs = rest % 60;
    return [days ? `${days} ${t("天", "d")}` : "", hours ? `${hours} ${t("小时", "h")}` : "", minutes ? `${minutes} ${t("分", "min")}` : "", secs || !seconds ? `${secs} ${t("秒", "s")}` : ""].filter(Boolean).join(" ");
  }
  function dateTime(value) {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(new Date(value));
  }
  function message(code) {
    if (code === "total") return t("总量必须是大于 0 的有限数值。", "Total must be a finite number greater than 0.");
    if (code === "completed") return t("已完成量必须是大于或等于 0 的有限数值。", "Completed must be a finite number greater than or equal to 0.");
    if (code === "exceeds") return t("已完成量不能超过总量。", "Completed cannot exceed total.");
    return t("已用时间必须是大于 0 的有限数值。", "Elapsed time must be a finite number greater than 0.");
  }
  function calculate() {
    submitted = true;
    // Read the fields at click time. This also avoids relying on a pending
    // derived-state flush when the button is clicked immediately after typing.
    const currentSource = JSON.stringify([total, completed, elapsed, unit]);
    const currentErrors = validateEta(total, completed, elapsed, unit);
    snapshot = null;
    rangeError = "";
    if (Object.keys(currentErrors).length) return;
    try { snapshot = { source: currentSource, value: calculateEta(total, completed, elapsed, unit) }; }
    catch { rangeError = currentSource; }
  }
  function clear() {
    total = completed = elapsed = "";
    snapshot = null;
    rangeError = "";
    submitted = false;
  }
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    total = "100"; completed = "40"; elapsed = "120"; unit = 1;
    calculate();
  });
</script>

<div class="expansion-page eta-page">
  <div class="workspace">
    <div class="panel input-panel">
      <div class="section-heading"><h3>{t("任务进度", "Task progress")}</h3><button class="dbx-btn dbx-btn--ghost" type="button" onclick={clear}>{t("清空", "Clear")}</button></div>
      <div class="quantity-fields">
        <label for="eta-total">{t("总量", "Total")}<input id="eta-total" class="dbx-input" inputmode="decimal" placeholder="100" bind:value={total} aria-invalid={Boolean(errors.total && (submitted || total.trim()))} aria-describedby="eta-total-hint"/>
          <small id="eta-total-hint" class:error={errors.total && (submitted || total.trim())}>{errors.total && (submitted || total.trim()) ? message(errors.total) : t("任务需要完成的总数量", "Total amount of work")}</small>
        </label>
        <label for="eta-completed">{t("已完成量", "Completed")}<input id="eta-completed" class="dbx-input" inputmode="decimal" placeholder="40" bind:value={completed} aria-invalid={Boolean(errors.completed && (submitted || completed.trim()))} aria-describedby="eta-completed-hint"/>
          <small id="eta-completed-hint" class:error={errors.completed && (submitted || completed.trim())}>{errors.completed && (submitted || completed.trim()) ? message(errors.completed) : t("与总量使用相同单位", "Use the same unit as total")}</small>
        </label>
      </div>
      <label for="eta-elapsed">{t("已用时间", "Elapsed time")}</label>
      <div class="elapsed-field"><input id="eta-elapsed" class="dbx-input" inputmode="decimal" placeholder="120" bind:value={elapsed} aria-invalid={Boolean(errors.elapsed && (submitted || elapsed.trim()))} aria-describedby="eta-elapsed-hint"/>
        <Select bind:value={unit} ariaLabel={t("时间单位", "Time unit")} options={[{ value: 1, label: t("秒", "Seconds") }, { value: 60, label: t("分钟", "Minutes") }, { value: 3600, label: t("小时", "Hours") }]} />
      </div>
      <small id="eta-elapsed-hint" class:error={errors.elapsed && (submitted || elapsed.trim())}>{errors.elapsed && (submitted || elapsed.trim()) ? message(errors.elapsed) : t("完成上述数量实际花费的时间", "Time actually spent completing this amount")}</small>
      <div class="form-footer"><span>{t("输入后自动更新预计时间 · 支持小数与科学计数法", "ETA updates as you type · Decimals and scientific notation supported")}</span></div>
      {#if currentRangeError}<p class="error" role="alert">{t("预计时间超出支持范围，请调整输入数值。", "The estimate is outside the supported range. Adjust the input values.")}</p>{/if}
    </div>

    <section class="panel result-panel" class:has-result={result} aria-label={t("预计结果", "Estimate")}>
      <div class="section-heading"><h3>{t("预计剩余时间", "Estimated time remaining")}</h3><span class="badge">{result ? result.completed === result.total ? t("已完成", "Complete") : t("按平均速度估算", "Based on average speed") : t("等待计算", "Awaiting calculation")}</span></div>
      <div class="estimate" aria-live="polite"><output>{result ? duration(result.remainingSeconds) : "—"}</output>
        <p>{result ? result.completed === 0 ? t("尚未完成任何数量，暂时无法估算完成时间。", "Complete some work before a completion time can be estimated.") : result.remaining === 0 ? t("任务已完成，无需等待。", "Task complete. No time remaining.") : t("保持当前平均速度时的预计耗时", "Time needed at the current average speed") : snapshot ? t("参数已更改，请重新计算。", "Inputs changed. Calculate again to update the estimate.") : t("输入任务进度后，计算预计完成时间。", "Enter your progress to estimate completion.")}</p>
      </div>
      <div class="completion"><span>{t("预计完成时间", "Estimated completion")}</span><strong>{result?.completion ? dateTime(result.completion) : "—"}</strong><small>{t("使用本地时区，计算时刻为估算起点", "Local time zone; estimate starts at calculation time")}</small></div>
      <div class="progress-label"><span>{t("完成进度", "Progress")}</span><strong>{result ? `${format(result.progress)}%` : "—"}</strong></div>
      <progress max="100" value={result?.progress ?? 0} aria-label={t("完成进度", "Progress")}></progress>
      <div class="progress-label"><span>{result ? `${format(result.completed)} / ${format(result.total)}` : "— / —"}</span><span>{t("剩余量", "Remaining work")} {result ? format(result.remaining) : "—"}</span></div>
    </section>
  </div>

  <div class="metrics">
    <div class="metric"><span>{t("平均速度", "Average speed")}</span><strong>{result ? format(result.rate) : "—"}<small>{t("单位 / 秒", "units / second")}</small></strong></div>
    <div class="metric"><span>{t("已用时间", "Elapsed time")}</span><strong>{result ? duration(result.elapsedSeconds) : "—"}</strong></div>
    <div class="metric"><span>{t("预计总耗时", "Estimated total duration")}</span><strong>{result ? duration(result.totalSeconds) : "—"}</strong></div>
  </div>
  <p class="note">{t("估算假设后续速度保持不变；进度更新后请重新计算。时长向上取整到秒。", "The estimate assumes a constant speed. Recalculate when progress changes. Durations round up to whole seconds.")}</p>
</div>

<style>
  .eta-page { gap: 14px; padding: 20px 24px; }
  h3, p { margin: 0; }
  h3 { font-size: 13px; font-weight: 600; }
  .workspace { display: grid; grid-template-columns: minmax(280px, .9fr) minmax(0, 1.1fr); gap: 14px; align-items: start; }
  .panel { border: 1px solid var(--color-border); border-radius: 10px; padding: 18px; background: var(--color-background); min-width: 0; }
  .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 28px; margin-bottom: 14px; }
  .quantity-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
  label { display: flex; flex-direction: column; gap: 9px; font-size: 13px; min-width: 0; }
  input { width: 100%; min-width: 0; font-variant-numeric: tabular-nums; }
  .quantity-fields input, .elapsed-field input { height: 42px; font-size: 20px; }
  small { font-size: 11px; line-height: 1.6; color: var(--color-muted-foreground); }
  .elapsed-field { display: grid; grid-template-columns: minmax(0, 1fr) 100px; gap: 10px; align-items: center; margin: 9px 0; }
  .form-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 18px; }
  .form-footer > span { color: var(--color-muted-foreground); font-size: 11px; }
  .result-panel { background: color-mix(in srgb, var(--color-primary) 3%, var(--color-background)); }
  .has-result { border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); }
  .badge { font-size: 10px; color: var(--color-muted-foreground); border: 1px solid var(--color-border); border-radius: 5px; padding: 3px 7px; }
  .estimate output { display: block; font-size: clamp(26px, 3vw, 36px); font-weight: 600; line-height: 1.4; color: var(--color-primary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .estimate p { margin: 7px 0 16px; line-height: 1.6; }
  .completion { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--color-border); padding-top: 14px; margin-bottom: 16px; }
  .completion > span, .progress-label { color: var(--color-muted-foreground); font-size: 12px; }
  .completion strong { font-size: 14px; line-height: 1.6; font-weight: 500; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .progress-label { display: flex; justify-content: space-between; gap: 12px; font-variant-numeric: tabular-nums; }
  .progress-label strong { color: var(--color-primary); }
  progress { appearance: none; display: block; height: 6px; width: 100%; border: 0; border-radius: 8px; overflow: hidden; margin: 10px 0; background: var(--color-muted); }
  progress::-webkit-progress-bar { background: var(--color-muted); }
  progress::-webkit-progress-value { background: var(--color-primary); border-radius: 8px; }
  progress::-moz-progress-bar { background: var(--color-primary); border-radius: 8px; }
  .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .metric { padding: 13px 15px; border: 1px solid var(--color-border); border-radius: 8px; min-width: 0; }
  .metric > span { color: var(--color-muted-foreground); font-size: 12px; }
  .metric strong { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-top: 10px; font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .note { line-height: 1.7; }
  .error { color: var(--color-destructive); }
  .input-panel > .error { margin-top: 12px; }
  input[aria-invalid="true"] { border-color: var(--color-destructive); }
  @container (max-width: 760px) { .workspace { grid-template-columns: 1fr; } }
  @container (max-width: 450px) { .metrics { grid-template-columns: 1fr; } .panel { padding: 16px; } .quantity-fields { grid-template-columns: 1fr; } }
</style>
