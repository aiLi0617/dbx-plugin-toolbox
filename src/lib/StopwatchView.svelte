<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  import { createStopwatch, formatStopwatch, lapRows, lapsCsv } from "./stopwatch.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const clock = createStopwatch();
  let elapsed = $state(0), running = $state(false), laps = $state([]);
  let error = $state(""), exporting = $state(false), demo = $state(false);
  let timer, demoOffset = 0, appliedDemoRequest = 0;
  const rows = $derived(lapRows(laps));
  const stats = $derived(rows.reduce((s, row) => ({
    best: Math.min(s.best, row.split), worst: Math.max(s.worst, row.split), sum: s.sum + row.split,
  }), { best: Infinity, worst: 0, sum: 0 }));
  const currentLap = $derived(elapsed - (laps.at(-1) || 0));
  function read() { return demoOffset + clock.read(); }
  function start() {
    if (running) return;
    clock.start();
    running = true;
    timer = setInterval(() => { elapsed = read(); }, 31);
  }
  function pause() {
    if (!running) return;
    clock.pause();
    elapsed = read();
    running = false;
    clearInterval(timer);
  }
  function reset() {
    pause(); clock.reset(); demoOffset = 0;
    elapsed = 0; laps = []; error = ""; demo = false;
  }
  function lap() {
    if (!running) return;
    elapsed = read();
    laps = [...laps, elapsed];
  }
  async function exportLaps() {
    if (!laps.length || exporting) return;
    exporting = true; error = "";
    try {
      await saveBlobThroughHost(new Blob([lapsCsv(laps)], { type: "text/csv;charset=utf-8" }), { fileName: "laps.csv", extension: "csv" });
    } catch (e) { error = localizeError(locale, e); }
    finally { exporting = false; }
  }
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    reset();
    laps = [12480, 24120, 37250, 49300, 62170, 74110];
    demoOffset = 77329; elapsed = demoOffset; demo = true;
  });
  onDestroy(() => clearInterval(timer));
</script>

<div class="expansion-page stopwatch-page">
  <section class="timer-card" aria-label={t("秒表", "Stopwatch")}>
    <div class="timer-top"><span>{t("总用时", "Total elapsed")}</span><span class="status" class:active={running} role="status"><i></i>{running ? t("计时中", "Running") : elapsed ? t("已暂停", "Paused") : t("准备就绪", "Ready")}</span></div>
    <output class="time" aria-live="off">{formatStopwatch(elapsed)}</output>
    <div class="current"><span>{t("当前分圈", "Current lap")}</span><strong>{formatStopwatch(currentLap)}</strong></div>
    <div class="controls">
      <button class="dbx-btn dbx-btn--primary main-control" onclick={running ? pause : start}><span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span>{running ? t("暂停", "Pause") : elapsed ? t("继续计时", "Resume timer") : t("开始计时", "Start timer")}</button>
      <button class="dbx-btn" disabled={!running} onclick={lap}>{t("计次", "Lap")}</button>
      <button class="dbx-btn dbx-btn--ghost" disabled={!elapsed && !running} onclick={reset}>{t("重置", "Reset")}</button>
    </div>
    {#if demo}<p class="demo-note">{t("示例记录 · 点击重置开始新的计时", "Sample records · Reset to start a new session")}</p>{/if}
  </section>

  <div class="statistics">
    <div><span>{t("已完成分圈", "Completed laps")}</span><strong>{String(laps.length).padStart(2, "0")}</strong></div>
    <div><span>{t("最快分圈", "Fastest lap")}</span><strong class="best">{laps.length ? formatStopwatch(stats.best) : "—"}</strong></div>
    <div><span>{t("平均分圈", "Average lap")}</span><strong>{laps.length ? formatStopwatch(stats.sum / laps.length) : "—"}</strong></div>
    <div><span>{t("最慢分圈", "Slowest lap")}</span><strong>{laps.length ? formatStopwatch(stats.worst) : "—"}</strong></div>
  </div>

  <section class="records" aria-label={t("计次记录", "Lap records")}>
    <div class="records-heading"><div><h3>{t("计次记录", "Lap records")} <span class="count">{laps.length}</span></h3>{#if rows.length > 4}<p class="scroll-hint">{t("向下滚动查看更多记录", "Scroll down to see more laps")}</p>{/if}</div><button class="dbx-btn" disabled={!laps.length || exporting} onclick={exportLaps}>{exporting ? t("正在导出…", "Exporting…") : t("导出 CSV", "Export CSV")}</button></div>
    {#if rows.length}
      <div class="table-scroll" role="region" aria-label={t("可滚动的计次记录", "Scrollable lap records")}><table><thead><tr><th>{t("圈次", "Lap number")}</th><th>{t("分圈用时", "Lap time")}</th><th>{t("累计用时", "Cumulative time")}</th></tr></thead><tbody>
        {#each rows.toReversed() as row (row.number)}
          <tr class:fastest={rows.length > 1 && row.split === stats.best}><td><span class="lap-number">{String(row.number).padStart(2, "0")}</span>{#if rows.length > 1 && row.split === stats.best}<span class="best-label">{t("最快", "Fastest")}</span>{/if}</td><td>{formatStopwatch(row.split)}</td><td>{formatStopwatch(row.total)}</td></tr>
        {/each}
      </tbody></table></div>
    {:else}
      <div class="empty"><span aria-hidden="true">◷</span><h3>{t("还没有计次记录", "No laps yet")}</h3><p>{t("开始计时后，点击「计次」记录每一圈用时。", "Start the timer, then click Lap to record each interval.")}</p></div>
    {/if}
  </section>
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .stopwatch-page { flex: 1 1 auto; min-height: 0; width: 100%; max-width: 920px; align-self: center; gap: 18px; padding: 20px 24px 32px; overflow-y: auto; overflow-x: hidden; scrollbar-gutter: stable; }
  h3, p { margin: 0; }
  .timer-card { padding: 22px 28px 28px; border: 1px solid var(--color-border); border-radius:var(--radius-lg); background: var(--color-card); text-align: center; }
  .timer-top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--color-muted-foreground); }
  .status { display: inline-flex; align-items: center; gap: 6px; background: var(--color-muted); padding: 5px 9px; border-radius: 20px; }
  .status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .status.active, .best { color: var(--color-success); }
  .status.active { background: var(--color-success-bg); }
  .time { display: block; margin: 24px 0 12px; color: var(--color-foreground); font: 500 clamp(32px, 6vw, 68px)/1.2 var(--font-mono); font-variant-numeric: tabular-nums; letter-spacing: -2px; overflow-wrap: anywhere; }
  .current { display: flex; justify-content: center; gap: 12px; align-items: center; font-size: 12px; color: var(--color-muted-foreground); }
  .current strong { font: 14px var(--font-mono); color: var(--color-foreground); }
  .controls { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin-top: 26px; }
  .controls button { min-width: 88px; min-height: 38px; }
  .controls .main-control { min-width: 142px; gap: 9px; }
  .demo-note { margin-top: 16px; }
  .statistics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .statistics > div { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding: 16px 18px; border: 1px solid var(--color-border); border-radius:var(--radius-lg); background: var(--color-card); }
  .statistics span { color: var(--color-muted-foreground); font-size: 12px; }
  .statistics strong { font: 500 18px var(--font-mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .records { border: 1px solid var(--color-border); border-radius:var(--radius-lg); background: var(--color-card); overflow: hidden; }
  .records-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 20px; }
  .scroll-hint { margin-top: 5px; font-size: 11px; color: var(--color-muted-foreground); }
  h3 { font-size: 13px; font-weight: 600; }
  .count { margin-left: 7px; color: var(--color-muted-foreground); font: 12px var(--font-mono); }
  /* Keep a stable four-row viewport so scrolling remains discoverable even
     with only a handful of laps. Older rows stay available in this region. */
  .table-scroll { width: 100%; height: 236px; overflow-x: auto; overflow-y: scroll; overscroll-behavior: contain; scrollbar-gutter: stable; scrollbar-color: var(--color-muted-foreground) transparent; }
  table { width: 100%; border-collapse: collapse; white-space: nowrap; text-align: right; font-size: 13px; }
  th { position: sticky; top: 0; background: var(--color-muted); color: var(--color-muted-foreground); font-size: 11px; font-weight: 500; z-index: 1; }
  th, td { padding: 12px 20px; border-top: 1px solid var(--color-border); }
  th:first-child, td:first-child { text-align: left; }
  td { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  td:last-child { color: var(--color-muted-foreground); }
  tr.fastest { background: var(--color-success-bg); }
  tr.fastest td:nth-child(2) { color: var(--color-success); }
  .lap-number { color: var(--color-muted-foreground); }
  .best-label { margin-left: 10px; font: 11px var(--font-sans); color: var(--color-success); }
  .empty { display: flex; flex: 0 0 236px; height: 236px !important; min-height: 236px; flex-direction: column; align-items: center; justify-content: center; padding: 24px 18px; text-align: center; border-top: 1px solid var(--color-border); }
  .empty > span { display: block; font-size: 28px; color: var(--color-muted-foreground); margin-bottom: 10px; }
  .empty p { margin-top: 8px; line-height: 1.6; }
  @media (max-width: 600px) {
    .stopwatch-page { padding: 14px 12px 24px; gap: 14px; }
    .timer-card { padding: 16px 14px 22px; }
    .statistics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .statistics > div { padding: 14px; }
    .statistics strong { font-size: 16px; }
    th, td { padding: 12px; }
    .records-heading { padding: 12px; }
    .empty { flex-basis: 220px; height: 220px !important; min-height: 220px; }
    .best-label { display: block; margin: 3px 0 0; }
  }
</style>
