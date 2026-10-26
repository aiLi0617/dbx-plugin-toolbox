<script>
  import { pick, localizeError } from "./i18n.js";
  import { statistics, precision } from "./calculators.js";
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let digits = $state(8);
  let appliedDemoRequest = 0;

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = "1, 2, 3, 4, 5";
  });

  const calculation = $derived.by(() => {
    if (!input.trim()) return { result: null, error: "" };
    try {
      const result = statistics(input);
      // Reject overflow explicitly rather than displaying Infinity or JSON null.
      if (Object.values(result).some((value) => typeof value === "number" && !Number.isFinite(value))) {
        return { result: null, error: t("数值超出计算范围，请缩小数值后重试。", "Values exceed the calculation range. Use smaller numbers and try again.") };
      }
      return { result, error: "" };
    } catch (error) {
      return { result: null, error: localizeError(locale, error) };
    }
  });
  const result = $derived(calculation.result);
  const output = $derived(result ? JSON.stringify(result, (key, value) =>
    typeof value === "number" && key !== "count" ? precision(value, digits) : value, 2) : "");

  function format(value) {
    if (value === null) return "—";
    if (Array.isArray(value)) return value.length ? value.map(format).join(", ") : t("无众数", "No mode");
    return String(precision(value, digits));
  }

  const highlights = $derived([
    ["count", t("样本数量", "Sample count")],
    ["sum", t("总和", "Sum")],
    ["mean", t("平均值", "Mean")],
    ["median", t("中位数", "Median")],
  ]);
  const groups = $derived([
    { title: t("分布概览", "Distribution"), rows: [
      ["min", t("最小值", "Minimum")], ["max", t("最大值", "Maximum")],
      ["range", t("极差", "Range")], ["modes", t("众数", "Mode")],
    ] },
    { title: t("离散程度", "Dispersion"), rows: [
      ["populationVariance", t("总体方差", "Population variance")],
      ["populationStdDev", t("总体标准差", "Population standard deviation")],
      ["sampleVariance", t("样本方差", "Sample variance")],
      ["sampleStdDev", t("样本标准差", "Sample standard deviation")],
    ] },
  ]);
</script>

<div class="statistics-page">
  <section class="input-panel" aria-label={t("数据输入", "Data input")}>
    <div class="section-heading">
      <label for="statistics-input">{t("数据输入", "Data input")}</label>
      <button class="dbx-btn dbx-btn--ghost" disabled={!input} onclick={() => { input = ""; }}>{t("清空", "Clear")}</button>
    </div>
    <textarea id="statistics-input" class="dbx-textarea numbers" bind:value={input} rows="5" maxlength="1000000" spellcheck="false"
      aria-describedby="statistics-input-hint" aria-invalid={!!calculation.error}
      placeholder={t("输入或粘贴数字，例如：1, 2, 3, 4, 5", "Enter or paste numbers, e.g. 1, 2, 3, 4, 5")}></textarea>
    <p id="statistics-input-hint" class="hint">{t("支持逗号、分号、空格或换行分隔，可输入负数、小数和科学计数法，最多 100,000 个数值。", "Separate numbers with commas, semicolons, spaces or newlines. Supports negative numbers, decimals and scientific notation, up to 100,000 values.")}</p>
    <div class="input-footer">
      <span class="live-note">{t("输入后自动计算", "Calculates as you type")}</span>
      <div class="precision-control">
        <span id="statistics-precision-label">{t("有效数字", "Significant digits")}</span>
        <NumberInput {locale} bind:value={digits} min={1} max={15} ariaLabel={t("有效数字", "Significant digits")} />
      </div>
    </div>
  </section>

  {#if calculation.error}
    <p class="error" role="alert">{calculation.error}</p>
  {:else if result}
    <section aria-label={t("统计结果", "Statistics results")} class="results">
      <div class="section-heading">
        <h2>{t("统计结果", "Statistics results")}</h2>
        <div class="result-actions">
          <span class="hint">{t("复制 JSON", "Copy JSON")}</span><CopyButton {locale} text={output} labelZh="复制 JSON" labelEn="Copy JSON" />
        </div>
      </div>
      <div class="highlights">
        {#each highlights as [key, label]}
          <div class="metric">
            <span class="metric-label">{label}</span>
            <strong>{key === "count" ? result.count : format(result[key])}</strong>
          </div>
        {/each}
      </div>
      <div class="groups">
        {#each groups as group}
          <section class="group">
            <h3>{group.title}</h3>
            <dl>
              {#each group.rows as [key, label]}
                <div class="metric-row"><dt>{label}</dt><dd>{format(result[key])}</dd></div>
              {/each}
            </dl>
          </section>
        {/each}
      </div>
      <p class="hint">{t("总体方差除以 n，样本方差除以 n − 1；样本不足 2 个时，样本方差和标准差不可用。", "Population variance uses n; sample variance uses n − 1. Sample variance and standard deviation require at least 2 values.")}</p>
    </section>
  {:else}
    <div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 4v16h16M8 16v-5m5 5V6m5 10V9" /></svg>
      <strong>{t("从一组数字开始", "Start with a set of numbers")}</strong>
      <p>{t("输入数据，即可查看平均值、中位数、方差等统计指标。", "Enter data to see the mean, median, variance and more.")}</p>
    </div>
  {/if}
</div>

<style>
  .statistics-page { width: 100%; max-width: 1120px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
  .input-panel { border: 1px solid var(--color-border); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px; background: var(--color-card); }
  .section-heading, .input-footer, .result-actions, .precision-control { display: flex; align-items: center; gap: 10px; }
  .section-heading, .input-footer { justify-content: space-between; }
  .section-heading label, h2 { font-size: 13px; font-weight: 600; margin: 0; }
  .numbers { min-height: 120px; resize: vertical; font-family: var(--font-mono); line-height: 1.7; }
  .hint, .live-note { font-size: 12px; line-height: 1.6; color: var(--color-muted-foreground); margin: 0; }
  .input-footer { border-top: 1px solid var(--color-border); padding-top: 12px; flex-wrap: wrap; }
  .precision-control { font-size: 12px; }
  .precision-control :global(.dbx-number) { width: 100px; }
  .results { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .highlights { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .metric { display: flex; flex-direction: column; gap: 10px; padding: 16px; border: 1px solid var(--color-border); background: var(--color-card); border-radius: 8px; min-width: 0; }
  .metric-label { font-size: 12px; color: var(--color-muted-foreground); }
  .metric strong { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .group { border: 1px solid var(--color-border); border-radius: 8px; min-width: 0; overflow: hidden; }
  h3 { font-size: 12px; font-weight: 600; margin: 0; padding: 12px 16px; background: var(--color-muted); }
  dl { margin: 0; padding: 0 16px; }
  .metric-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: baseline; gap: 16px; padding: 12px 0; font-size: 13px; }
  .metric-row + .metric-row { border-top: 1px solid var(--color-border); }
  dt { color: var(--color-muted-foreground); overflow-wrap: anywhere; }
  dd { margin: 0; text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; max-height: 150px; overflow-y: auto; }
  .empty-state { padding: 42px 16px; border: 1px dashed var(--color-border); border-radius: 8px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; color: var(--color-muted-foreground); }
  .empty-state strong { font-size: 14px; color: var(--color-foreground); }
  .empty-state p { margin: 0; font-size: 12px; line-height: 1.6; }
  .error { padding: 12px 16px; margin: 0; border-radius: 6px; background: color-mix(in srgb, var(--color-destructive) 8%, transparent); color: var(--color-destructive); font-size: 13px; }
  @media (max-width: 600px) { .highlights { grid-template-columns: repeat(2, minmax(0, 1fr)); } .groups { grid-template-columns: minmax(0, 1fr); } .metric strong { font-size: 20px; } .input-panel { padding: 12px; } }
</style>
