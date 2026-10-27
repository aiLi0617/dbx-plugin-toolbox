<script>
  import { pick, localizeError } from "./i18n.js";
  import { compareBenchmarks, precision } from "./calculators.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import NumberInput from "./NumberInput.svelte";
  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let metric = $state("throughput");
  let digits = $state(8);
  let appliedDemoRequest = 0;
  const safeDigits = $derived(Math.max(1, Math.min(15, Math.trunc(Number(digits) || 8))));
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = "A: 100, 110, 105\nB: 90, 95, 92\nC: 120, 118, 125";
  });
  const calculation = $derived.by(() => {
    if (!input.trim()) return { rows: [], error: "" };
    try {
      const rows = compareBenchmarks(input, { metric });
      if (rows.some(row => Object.values(row).some(value => typeof value === "number" && !Number.isFinite(value)))) {
        return { rows: [], error: t("数值超出计算范围，请缩小数值后重试。", "Values exceed the calculation range. Use smaller numbers and try again.") };
      }
      return { rows, error: "" };
    } catch (error) {
      return { rows: [], error: localizeError(locale, error) };
    }
  });
  const rows = $derived(calculation.rows);
  const total = $derived(rows.reduce((sum, row) => sum + row.count, 0));
  const output = $derived(rows.length ? JSON.stringify(rows, (key, value) => typeof value === "number" && !["count", "rank"].includes(key) ? precision(value, safeDigits) : value, 2) : "");
  const format = value => value == null ? "—" : String(precision(value, safeDigits));
</script>

<div class="benchmark-page"><label class="metric-choice"><span>{t("比较指标", "Comparison metric")}</span><Select bind:value={metric} ariaLabel={t("比较指标", "Comparison metric")} options={[{value:"throughput",label:t("吞吐量：越高越好（次/秒）", "Throughput: higher is better (ops/s)")},{value:"latency",label:t("耗时：越低越好（毫秒）", "Latency: lower is better (ms)")}]} /></label>
  <section class="panel" aria-label={t("数据输入", "Data input")}>
    <div class="heading"><label for="benchmark-input">{t("测试样本", "Benchmark samples")}</label><button class="dbx-btn dbx-btn--ghost" disabled={!input} onclick={() => { input = ""; }}>{t("清空", "Clear")}</button></div>
    <textarea id="benchmark-input" class="dbx-textarea" bind:value={input} rows="5" maxlength="1000000" spellcheck="false" aria-invalid={!!calculation.error} aria-describedby="benchmark-hint" placeholder={"A: 100, 110, 105\nB: 90, 95, 92"}></textarea>
    <p id="benchmark-hint" class="hint">{metric === "latency" ? t("每行一组：名称: 样本1, 样本2。输入正数耗时（毫秒），数值越小越好。", "One group per line: name: sample1, sample2. Enter positive durations (ms); lower is better.") : t("每行一组：名称: 样本1, 样本2。输入正数吞吐量（次/秒），数值越大越好。", "One group per line: name: sample1, sample2. Enter positive throughput values (ops/s); higher is better.")}</p>
    <div class="footer"><span class="hint">{metric === "latency" ? t("输入后自动比较，按平均值升序排列", "Compares as you type, sorted by ascending mean") : t("输入后自动比较，按平均值降序排列", "Compares as you type, sorted by descending mean")}</span><div class="precision"><span>{t("有效数字", "Significant digits")}</span><NumberInput {locale} bind:value={digits} min={1} max={15} ariaLabel={t("有效数字", "Significant digits")} /></div></div>
  </section>
  {#if calculation.error}
    <p class="error" role="alert">{calculation.error}</p>
  {:else if rows.length}
    <section class="results" aria-label={t("对比结果", "Comparison results")}>
      <div class="heading"><h2>{t("对比结果", "Comparison results")}</h2><div class="copy"><span class="hint">{t("复制 JSON", "Copy JSON")}</span><CopyButton {locale} text={output} labelZh="复制 JSON" labelEn="Copy JSON" /></div></div>
      <div class="summary">
        <div class="metric"><span>{metric === "latency" ? t("最低平均耗时", "Lowest mean latency") : t("最高平均吞吐量", "Highest mean throughput")}</span><strong class="winner">{rows[0].name}</strong><small>{format(rows[0].mean)} {metric === "latency" ? "ms" : "ops/s"}</small></div>
        <div class="metric"><span>{t("测试组数", "Benchmark groups")}</span><strong>{rows.length}</strong><small>{t("按均值比较", "Compared by mean")}</small></div>
        <div class="metric"><span>{t("样本总数", "Total samples")}</span><strong>{total}</strong><small>{t("所有测试组", "Across all groups")}</small></div>
      </div>
      <section class="panel" aria-label={t("相对性能", "Relative performance")}>
        <div class="heading"><h3>{t("相对性能", "Relative performance")}</h3><span class="hint">{t("最快组 = 100%", "Fastest group = 100%")}</span></div>
        {#each rows as row, i}
          <div class="chart-row"><span class="group-name" title={row.name}>{row.name}</span><div class="track"><div class="bar" class:best={i === 0} style:width={`${row.relativeToFastest * 100}%`}></div></div><span class="ratio">{format(row.relativeToFastest * 100)}%</span></div>
        {/each}
      </section>
      <div class="table-wrap"><table>
        <caption>{metric === "latency" ? t("各组统计明细 · 耗时单位：毫秒", "Group statistics · latency in ms") : t("各组统计明细 · 吞吐量单位：次/秒", "Group statistics · throughput in ops/s")}</caption>
        <thead><tr><th scope="col">{t("排名", "Rank")}</th><th scope="col">{t("名称", "Name")}</th><th scope="col">{t("样本数量", "Sample count")}</th><th scope="col">{t("平均值", "Mean")}</th><th scope="col">{t("中位数", "Median")}</th><th scope="col">{t("最小值", "Minimum")}</th><th scope="col">{t("最大值", "Maximum")}</th><th scope="col">{t("总体标准差", "Population standard deviation")}</th><th scope="col">{t("变异系数", "Coefficient of variation")}</th></tr></thead>
        <tbody>{#each rows as row, i}<tr class:leading={i === 0}><td><span class="rank" class:first={i === 0}>{row.rank}</span></td><th scope="row" class="name-cell">{row.name}</th><td>{row.count}</td><td class="mean">{format(row.mean)}</td><td>{format(row.median)}</td><td>{format(row.min)}</td><td>{format(row.max)}</td><td>{format(row.populationStdDev)}</td><td>{format(row.populationStdDev / row.mean * 100)}%</td></tr>{/each}</tbody>
      </table></div>
      <p class="hint">{t("变异系数 = 总体标准差 / 平均值，越小表示样本越稳定。单个样本无法反映波动；排名仅比较均值，不代表统计显著性。", "Coefficient of variation = population standard deviation / mean; lower means more consistent samples. A single sample cannot describe variability. Ranking compares means only, without statistical significance testing.")}</p>
      <details><summary>{t("查看 JSON", "View JSON")}</summary><textarea class="dbx-textarea json" readonly value={output} rows="10" aria-label={t("对比结果 JSON", "Comparison results JSON")}></textarea></details>
    </section>
  {:else}
    <div class="empty-state"><span class="empty-icon" aria-hidden="true">▂ ▅ ▇</span><strong>{t("比较每一组测试的表现", "Compare your benchmark groups")}</strong><p>{t("粘贴测试样本，即可查看排名、吞吐量和稳定性。", "Paste benchmark samples to see ranking, throughput and consistency.")}</p></div>
  {/if}
</div>

<style>
  .benchmark-page { width: 100%; max-width: 1120px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; box-sizing: border-box; }
  .panel { border: 1px solid var(--color-border); border-radius:var(--radius-lg); padding: 16px; background: var(--color-card); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .heading, .footer, .precision, .copy { display: flex; align-items: center; gap: 10px; }
  .heading, .footer { justify-content: space-between; flex-wrap: wrap; }
  label, h2, h3 { margin: 0; font-size: 13px; font-weight: 600; }
  textarea { width: 100%; font-family: var(--font-mono); line-height: 1.7; resize: vertical; }
  .hint { margin: 0; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.7; }
  .footer { border-top: 1px solid var(--color-border); padding-top: 12px; }
  .precision { font-size: 12px; }
  .precision :global(.dbx-number) { width: 90px; }
  .results { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .metric { display: flex; flex-direction: column; gap: 8px; padding: 16px; border-radius:var(--radius-lg); border: 1px solid var(--color-border); background: var(--color-card); min-width: 0; }
  .metric span, .metric small { color: var(--color-muted-foreground); font-size: 12px; }
  .metric strong { font-size: 26px; font-weight: 600; overflow-wrap: anywhere; }
  .winner, .mean { color: var(--color-primary); }
  .chart-row { display: grid; grid-template-columns: minmax(60px, 140px) minmax(0, 1fr) minmax(85px, auto); gap: 16px; align-items: center; font-size: 12px; }
  .group-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { height: 10px; border-radius: 3px; background: var(--color-muted); overflow: hidden; }
  .bar { height: 100%; min-width: 2px; border-radius: 3px; background: color-mix(in srgb, var(--color-primary) 45%, var(--color-muted)); }
  .bar.best { background: var(--color-primary); }
  .ratio { text-align: right; font-family: var(--font-mono); overflow-wrap: anywhere; }
  .table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius:var(--radius-lg); }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  caption { text-align: left; padding: 14px 16px; font-weight: 600; }
  th, td { padding: 12px 14px; text-align: right; border-top: 1px solid var(--color-border); white-space: nowrap; }
  thead { color: var(--color-muted-foreground); background: var(--color-muted); }
  thead th { font-weight: 500; }
  td { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  th:first-child, td:first-child, th:nth-child(2) { text-align: left; }
  .name-cell { max-width: 220px; white-space: normal; overflow-wrap: anywhere; font-weight: 500; }
  .leading { background: color-mix(in srgb, var(--color-primary) 4%, transparent); }
  .rank { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border-radius: 4px; background: var(--color-muted); }
  .rank.first { background: var(--color-primary); color: var(--color-primary-foreground); }
  details { border-top: 1px solid var(--color-border); padding-top: 14px; }
  summary { cursor: pointer; font-size: 12px; color: var(--color-muted-foreground); width: fit-content; }
  .json { margin-top: 12px; }
  .empty-state { padding: 40px 16px; border: 1px dashed var(--color-border); border-radius:var(--radius-lg); display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .empty-icon { font-size: 28px; color: var(--color-primary); }
  .empty-state strong { font-size: 14px; }
  .empty-state p { margin: 0; font-size: 12px; color: var(--color-muted-foreground); line-height: 1.7; }
  .error { padding: 12px 16px; margin: 0; border-radius:var(--radius-md); color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 8%, transparent); font-size: 13px; }
  @media (max-width: 600px) { .benchmark-page { padding: 16px; } .summary { grid-template-columns: minmax(0, 1fr); } .chart-row { grid-template-columns: 60px minmax(0, 1fr) 85px; gap: 8px; } .metric strong { font-size: 22px; } }
.metric-choice{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px}.metric-choice :global(.dbx-custom-select){min-width:240px}
</style>
