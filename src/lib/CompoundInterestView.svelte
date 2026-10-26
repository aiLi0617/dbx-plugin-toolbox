<script>
  import { pick } from "./i18n.js";
  import { compoundInterest } from "./calculators.js";
  import Select from "./Select.svelte";
  import CopyButton from "./CopyButton.svelte";
  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let values = $state({
    principal: "1000",
    rate: "5",
    years: "10",
    monthly: "0",
  });
  let frequency = $state("12"),
    digits = $state(2),
    appliedDemoRequest = 0;
  function reset() {
    values = { principal: "1000", rate: "5", years: "10", monthly: "0" };
    frequency = "12";
    digits = 2;
  }
  $effect(() => {
    if (demoRequest && demoRequest !== appliedDemoRequest) {
      appliedDemoRequest = demoRequest;
      reset();
    }
  });
  const fields = $derived([
    {
      key: "principal",
      label: t("初始本金", "Initial principal"),
      valid: Number(values.principal) >= 0,
    },
    {
      key: "rate",
      label: t("年利率（%）", "Annual rate (%)"),
      valid: Number(values.rate) > -100,
    },
    {
      key: "years",
      label: t("投资年数", "Investment years"),
      valid: Number(values.years) >= 0 && Number(values.years) <= 200,
    },
    {
      key: "monthly",
      label: t("每月追加投入", "Monthly contribution"),
      valid: Number(values.monthly) >= 0,
    },
  ]);
  function invalidField(field) {
    return (
      !String(values[field.key]).trim() ||
      !Number.isFinite(Number(values[field.key])) ||
      !field.valid
    );
  }
  const invalid = $derived(fields.some(invalidField));
  const invalidDigits = $derived(
    !Number.isInteger(digits) || digits < 0 || digits > 8,
  );
  const result = $derived.by(() => {
    if (invalid || invalidDigits) return null;
    try {
      const value = compoundInterest(
        values.principal,
        values.rate,
        values.years,
        frequency,
        values.monthly,
      );
      return [value.total, value.principal, value.interest].every(
        Number.isFinite,
      )
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const rows = $derived.by(() => {
    if (!result) return [];
    const items = [];
    for (let month = 12; month < result.months; month += 12)
      items.push(
        compoundInterest(
          values.principal,
          values.rate,
          month / 12,
          frequency,
          values.monthly,
        ),
      );
    if (result.months) items.push(result);
    return items;
  });
  function format(value) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }
  const json = $derived(result ? JSON.stringify(result, null, 2) : "");
  const summary = $derived(
    result
      ? `${t("期末总额", "Final balance")}: ${format(result.total)}\n${t("累计投入", "Total contributions")}: ${format(result.principal)}\n${t("累计收益", "Total interest")}: ${format(result.interest)}\n${t("计算月数", "Calculated months")}: ${result.months}`
      : "",
  );
  const chart = $derived.by(() => {
    if (!result) return null;
    const points = [
      {
        months: 0,
        principal: Number(values.principal),
        total: Number(values.principal),
      },
      ...rows,
    ];
    const max = Math.max(1, ...points.flatMap((p) => [p.total, p.principal]));
    const path = (key) =>
      points
        .map(
          (p) =>
            `${30 + (p.months / Math.max(1, result.months)) * 600},${180 - (p[key] / max) * 150}`,
        )
        .join(" ");
    return { total: path("total"), principal: path("principal") };
  });
  const frequencies = $derived([
    { value: "1", label: t("每年 · 1 次", "Annually · 1 time") },
    { value: "2", label: t("每半年 · 2 次", "Semiannually · 2 times") },
    { value: "4", label: t("每季度 · 4 次", "Quarterly · 4 times") },
    { value: "12", label: t("每月 · 12 次", "Monthly · 12 times") },
    { value: "365", label: t("每日 · 365 次", "Daily · 365 times") },
  ]);
</script>

<div class="expansion-page compound-page">
  <div class="workspace">
    <section
      class="panel parameters"
      aria-label={t("计算参数", "Calculation inputs")}
    >
      <div class="heading">
        <h3>{t("投资参数", "Investment parameters")}</h3>
        <span class="live">{t("实时计算", "Live calculation")}</span>
      </div>
      <div class="fields">
        {#each fields as field}
          <label
            ><span>{field.label}</span><input
              class="dbx-input"
              inputmode="decimal"
              bind:value={values[field.key]}
              aria-invalid={invalidField(field)}
            />
            {#if field.key === "years"}<small
                >{t(
                  "0–200 年，按最接近的整月计算",
                  "0–200 years, rounded to the nearest month",
                )}</small
              >{:else if field.key === "monthly"}<small
                >{t(
                  "在每个月月底追加投入",
                  "Added at the end of each month",
                )}</small
              >{/if}</label
          >
        {/each}<label class="full"
          ><span>{t("计息频率", "Compounding frequency")}</span><Select
            bind:value={frequency}
            options={frequencies}
            ariaLabel={t("计息频率", "Compounding frequency")}
          /></label
        >
      </div>
      <div class="options">
        <label
          >{t("小数位数", "Decimal places")}<input
            class="dbx-input"
            type="number"
            min="0"
            max="8"
            step="1"
            bind:value={digits}
            aria-invalid={invalidDigits}
          /></label
        ><button class="dbx-btn dbx-btn--ghost" onclick={reset}
          >{t("重置", "Reset")}</button
        >
      </div>
      <p class="note">
        {t(
          "数学推算，不包含税费和产品费率。",
          "Mathematical projection; excludes taxes and product fees.",
        )}
      </p>
    </section>
    <section class="results" aria-label={t("计算结果", "Results")}>
      <div class="panel balance">
        <div class="heading">
          <h3>{t("期末总额", "Final balance")}</h3>
          <CopyButton
            {locale}
            text={summary}
            label={t("复制计算结果", "Copy calculation results")}
          />
        </div>
        <output class="total">{result ? format(result.total) : "—"}</output>
        <p class="duration">
          {result
            ? `${result.months} ${t("个月后的资金总额", "months of growth")}`
            : t("请检查计算参数", "Check your calculation inputs")}
        </p>
        {#if result && Math.abs(Number(values.years) * 12 - result.months) > 1e-8}<p class="hint" role="status">{t("按整月计算，输入期间已四舍五入为", "Calculated in whole months. The entered period was rounded to")} {result.months} {t("个月", "months")}。</p>{/if}
        <div class="metrics">
          <div>
            <span>{t("累计投入", "Total contributions")}</span><strong
              >{result ? format(result.principal) : "—"}</strong
            >
          </div>
          <div>
            <span>{t("累计收益", "Total interest")}</span><strong
              class:loss={result && result.interest < 0}
              >{result ? format(result.interest) : "—"}</strong
            >
          </div>
        </div>
      </div>
      <div class="panel growth">
        <div class="heading">
          <h3>{t("资金增长趋势", "Balance over time")}</h3>
          <div class="legend">
            <span><i class="total-key"></i>{t("总额", "Balance")}</span><span
              ><i></i>{t("投入", "Contributions")}</span
            >
          </div>
        </div>
        {#if chart}<svg
            viewBox="0 0 660 210"
            role="img"
            aria-label={t(
              "总额与累计投入随时间变化，具体数值见年度明细",
              "Balance and contributions over time; exact values are in the annual breakdown",
            )}
            ><path
              class="grid"
              d="M30 30H630 M30 80H630 M30 130H630 M30 180H630"
            /><polyline
              class="invested-line"
              points={chart.principal}
            /><polyline class="balance-line" points={chart.total} /><text
              x="30"
              y="202">0</text
            ><text x="630" y="202" text-anchor="end"
              >{result.months} {t("个月", "months")}</text
            ></svg
          >
        {:else}<div class="empty">
            {t(
              "输入有效参数后显示增长趋势",
              "Enter valid parameters to see the growth trend",
            )}
          </div>{/if}
      </div>
    </section>
  </div>
  {#if invalid}<p class="error" role="alert">
      {t(
        "请输入有效数值：本金和月投入不可为负，年利率须大于 −100%，年数须在 0–200 之间。",
        "Enter valid numbers: principal and monthly contributions must be nonnegative, annual rate must exceed −100%, and years must be between 0 and 200.",
      )}
    </p>
  {:else if invalidDigits}<p class="error" role="alert">
      {t(
        "小数位数必须是 0 到 8 之间的整数。",
        "Decimal places must be an integer from 0 to 8.",
      )}
    </p>
  {:else if !result}<p class="error" role="alert">
      {t(
        "结果超出数值范围，请减小金额、利率或年数。",
        "Result is outside the numeric range. Reduce the amount, rate or years.",
      )}
    </p>{/if}
  <details class="panel">
    <summary
      >{t("年度明细", "Annual breakdown")}<span
        >{rows.length} {t("条记录", "records")}</span
      ></summary
    >
    <div class="table-scroll">
      <table>
        <thead
          ><tr
            ><th>{t("月数", "Months")}</th><th
              >{t("累计投入", "Total contributions")}</th
            ><th>{t("累计收益", "Total interest")}</th><th
              >{t("期末总额", "Final balance")}</th
            ></tr
          ></thead
        ><tbody
          >{#each rows as row}<tr
              ><td>{row.months}</td><td>{format(row.principal)}</td><td
                >{format(row.interest)}</td
              ><td>{format(row.total)}</td></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </details>
  <details class="panel">
    <summary>{t("查看 JSON", "View JSON")}</summary>
    <div class="json-copy">
      <CopyButton {locale} text={json} label={t("复制 JSON", "Copy JSON")} />
    </div>
    <pre>{json || "{}"}</pre>
  </details>
</div>

<style>
  .compound-page {
    max-width: 1160px;
    gap: 20px;
    padding: 28px 24px;
  }
  h3,
  p {
    margin: 0;
  }
  h3 {
    font-size: 13px;
    font-weight: 600;
  }
  .note,
  .duration,
  small {
    color: var(--color-muted-foreground);
    font-size: 12px;
    line-height: 1.7;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.3fr);
    gap: 20px;
    align-items: stretch;
  }
  .panel {
    border: 1px solid var(--color-border);
    border-radius:var(--radius-lg);
    background: var(--color-card);
    min-width: 0;
  }
  .parameters,
  .balance,
  .growth {
    padding: 20px;
  }
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  .live {
    color: var(--color-primary);
    font-size: 11px;
    background: color-mix(in srgb, var(--color-primary) 9%, transparent);
    padding: 4px 8px;
    border-radius: 20px;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px 14px;
    margin: 24px 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
  }
  .fields input {
    height: 40px;
    font-size: 16px;
    font-variant-numeric: tabular-nums;
  }
  .full {
    grid-column: 1/-1;
  }
  .options {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    border-top: 1px solid var(--color-border);
    padding-top: 16px;
  }
  .options label {
    flex-direction: row;
    align-items: center;
  }
  .options input {
    width: 65px;
  }
  .note {
    margin-top: 16px;
  }
  .results {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .balance {
    background: linear-gradient(
      120deg,
      color-mix(in srgb, var(--color-primary) 6%, var(--color-card)),
      var(--color-card)
    );
  }
  .total {
    display: block;
    font-size: clamp(28px, 3.5vw, 42px);
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: -1px;
    margin: 16px 0 6px;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
    border-top: 1px solid var(--color-border);
    margin-top: 20px;
    padding-top: 18px;
  }
  .metrics span {
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .metrics strong {
    display: block;
    margin-top: 8px;
    font-size: 19px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  .metrics div:last-child strong {
    color: var(--color-primary);
  }
  .metrics div:last-child .loss {
    color: var(--color-destructive);
  }
  .legend,
  .legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .legend {
    gap: 14px;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  i {
    width: 14px;
    height: 3px;
    background: var(--color-muted-foreground);
    border-radius: 2px;
  }
  i.total-key {
    background: var(--color-primary);
  }
  svg {
    width: 100%;
    display: block;
    margin-top: 8px;
    overflow: visible;
  }
  .grid {
    stroke: var(--color-border);
    stroke-width: 1;
  }
  polyline {
    fill: none;
    stroke-width: 2.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .invested-line {
    stroke: var(--color-muted-foreground);
    stroke-dasharray: 5 4;
  }
  .balance-line {
    stroke: var(--color-primary);
  }
  text {
    fill: var(--color-muted-foreground);
    font-size: 12px;
  }
  .empty {
    min-height: 150px;
    display: grid;
    place-items: center;
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .error {
    border: 1px solid var(--color-destructive);
    padding: 12px;
    border-radius:var(--radius-lg);
    color: var(--color-destructive);
    line-height: 1.7;
    font-size: 12px;
  }
  summary {
    padding: 16px 20px;
    cursor: pointer;
    font-size: 13px;
  }
  summary span {
    float: right;
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .table-scroll {
    overflow: auto;
    max-height: 360px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    white-space: nowrap;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  th,
  td {
    padding: 12px 20px;
    text-align: right;
    border-top: 1px solid var(--color-border);
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  th {
    background: var(--color-muted);
    position: sticky;
    top: 0;
  }
  .json-copy {
    display: flex;
    justify-content: flex-end;
    padding: 0 16px;
  }
  pre {
    margin: 0;
    padding: 0 20px 20px;
    overflow: auto;
    font-size: 12px;
  }
  @media (max-width: 760px) {
    .workspace {
      grid-template-columns: 1fr;
    }
    .compound-page {
      padding: 20px 16px;
    }
  }
  @container (max-width:700px) {
    .workspace {
      grid-template-columns: 1fr;
    }
  }
  @container (max-width:330px) {
    .fields,
    .metrics {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 380px) {
    .fields,
    .metrics {
      grid-template-columns: 1fr;
    }
    .parameters,
    .balance,
    .growth {
      padding: 16px;
    }
  }
</style>
