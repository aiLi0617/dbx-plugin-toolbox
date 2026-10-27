<script>
  import { pick, localizeError } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import BusinessDaysView from "./BusinessDaysView.svelte";
  import TemperatureView from "./TemperatureView.svelte";
  import NumericStatisticsView from "./NumericStatisticsView.svelte";
  import UnitConverterView from "./UnitConverterView.svelte";
  import PercentageView from "./PercentageView.svelte";
  import MathExpressionView from "./MathExpressionView.svelte";
  import { DEFAULT_SHORTCUTS } from "./shortcuts.js";
  import CompoundInterestView from "./CompoundInterestView.svelte";
  import BenchmarkView from "./BenchmarkView.svelte";
  import EtaView from "./EtaView.svelte";
  import {
    number,
    precision,
    evaluateExpression,
    UNITS,
    convertUnit,
    statistics,
    temperatures,
    compoundInterest,
    compareBenchmarks,
  } from "./calculators.js";
  import StopwatchView from "./StopwatchView.svelte";
  let { toolId, locale = "zh-CN", demoRequest = 0, calculateShortcut = DEFAULT_SHORTCUTS.calculate } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    a = $state(""),
    b = $state(""),
    c = $state(""),
    d = $state("12"),
    e = $state("0"),
    digits = $state(8),
    category = $state("length"),
    from = $state("m"),
    to = $state("km"),
    scale = $state("C"),
    output = $state(""),
    error = $state("");
  function run() {
    error = "";
    output = "";
    try {
      let result;
      if (toolId === "math-expression") result = evaluateExpression(input);
      else if (toolId === "unit-converter")
        result = {
          value: convertUnit(a, category, from, to),
          formula: `${a} ${from} × ${UNITS[category][from]} / ${UNITS[category][to]} ${to}`,
        };
      else if (toolId === "percentage") {
        const x = number(a),
          y = number(b);
        result = {
          percentOf: (x * y) / 100,
          formulaPercent: "X × Y / 100",
          share: y === 0 ? null : (x / y) * 100,
          formulaShare: "X / Y × 100",
          change: x === 0 ? null : ((y - x) / Math.abs(x)) * 100,
          formulaChange: "(Y − X) / |X| × 100",
        };
      } else if (toolId === "statistics") result = statistics(input);
      else if (toolId === "temperature") result = temperatures(a, scale);
      else if (toolId === "benchmark") result = compareBenchmarks(input);
      else if (toolId === "compound-interest")
        result = compoundInterest(a, b, c, d, e);
      output = JSON.stringify(
        result,
        (_, v) => (typeof v === "number" ? precision(v, Number(digits)) : v),
        2,
      );
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
  function example() {
    output = "";
    error = "";
    input =
      toolId === "math-expression"
        ? "sqrt(16) + 2^3"
        : toolId === "benchmark"
          ? "A: 100,110,105\nB: 90,95,92"
          : toolId === "statistics"
            ? "1, 2, 3, 4, 5"
            : "";
    const values = {
      "unit-converter": ["1024", "", ""],
      percentage: ["20", "80", ""],
      temperature: ["25", "", ""],
      "compound-interest": ["1000", "5", "10"],
    }[toolId] || ["", "", ""];
    [a, b, c] = values;
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    example();
  });
  const fieldLabels = {
      "compound-interest": [
      ["本金", "Principal"],
      ["年利率（%）", "Annual rate (%)"],
      ["年数", "Years"],
    ],
  };
</script>

{#if toolId === "compound-interest"}
  <CompoundInterestView {locale} {demoRequest} />
{:else if toolId === "eta"}
  <EtaView {locale} {demoRequest} />
{:else if toolId === "math-expression"}
  <MathExpressionView {locale} {demoRequest} {calculateShortcut} />
{:else if toolId === "stopwatch"}
  <StopwatchView {locale} {demoRequest} />
{:else}
{#if toolId === "percentage"}
  <PercentageView {locale} {demoRequest} />
{:else}
{#if toolId === "unit-converter"}
  <UnitConverterView {locale} {demoRequest} />
{:else}
{#if toolId === "statistics"}
  <NumericStatisticsView {locale} {demoRequest} />
{:else}
{#if toolId === "business-days"}
  <BusinessDaysView {locale} {demoRequest} />
{:else if toolId === "benchmark"}
  <BenchmarkView {locale} {demoRequest} />
{:else}
<div class="expansion-page" class:temperature-host={toolId === "temperature"}>
  {#if toolId === "temperature"}
    <TemperatureView {locale} {demoRequest} />
  {:else}
    {#if ["math-expression", "statistics", "benchmark"].includes(toolId)}<label
        >{toolId === "benchmark"
            ? t("每行：名称: 样本1, 样本2", "Each line: name: sample1, sample2")
            : t("输入", "Input")}<textarea
          class="dbx-textarea"
          bind:value={input}
          maxlength="1000000"
          rows="6"
          placeholder={toolId === "math-expression"
            ? "sqrt(16) + 2^3"
            : toolId === "benchmark"
              ? "A: 100, 110, 105\nB: 90, 95, 92"
              : ""}></textarea></label
      >{/if}
    {#if ["unit-converter", "temperature"].includes(toolId)}<label
        >{t("数值", "Value")}<input class="dbx-input" bind:value={a} /></label
      >{:else if fieldLabels[toolId]}<label
        >{t(...fieldLabels[toolId][0])}<input
          class="dbx-input"
          bind:value={a}
        /></label
      ><label
        >{t(...fieldLabels[toolId][1])}<input
          class="dbx-input"
          bind:value={b}
        /></label
      >{#if fieldLabels[toolId][2]}<label
          >{t(...fieldLabels[toolId][2])}<input
            class="dbx-input"
            bind:value={c}
          /></label
        >{/if}{/if}
    {#if toolId === "unit-converter"}<label
      >{t("类别", "Category")}<Select bind:value={category} ariaLabel={t("类别", "Category")} onchange={() => {
            from = Object.keys(UNITS[category])[0];
            to = Object.keys(UNITS[category])[1];
          }} options={Object.keys(UNITS).map((value) => ({value,label:value}))} /></label
      ><label
        >{t("从", "From")}<Select bind:value={from} ariaLabel={t("从", "From")} options={Object.keys(UNITS[category]).map((value) => ({value,label:value}))} /></label
      ><label
        >{t("到", "To")}<Select bind:value={to} ariaLabel={t("到", "To")} options={Object.keys(UNITS[category]).map((value) => ({value,label:value}))} /></label
      >{/if}
    {#if toolId === "temperature"}<Select bind:value={scale} ariaLabel={t("温标", "Scale")} options={["C","F","K","R"].map((value) => ({value,label:value}))} />{/if}
    {#if toolId === "compound-interest"}<label
        >{t("每年计息次数", "Compounding periods per year")}<Select bind:value={d} ariaLabel={t("每年计息次数", "Compounding periods per year")} options={[1,2,4,12,365].map((value) => ({value,label:String(value)}))} /></label
      ><label
        >{t("每月月底投入", "Monthly contribution at month end")}<input
          class="dbx-input"
          bind:value={e}
        /></label
      >
      <p>
        {t(
          "数学推算，不包含税费和产品费率。",
          "Mathematical projection; excludes taxes and product fees.",
        )}
      </p>{/if}
    <label
      >{t("有效数字", "Significant digits")}<input
        class="dbx-input"
        type="number"
        min="1"
        max="15"
        bind:value={digits}
      /></label
    >
    <div class="expansion-actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run}
        >{t("计算", "Calculate")}</button
      ><CopyButton {locale} text={output} />
    </div>
    {#if output}<textarea class="dbx-textarea" value={output} readonly rows="12"
      ></textarea>{/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>
{/if}
{/if}
{/if}
{/if}
{/if}

<style>.temperature-host{padding:0;max-width:none}</style>
