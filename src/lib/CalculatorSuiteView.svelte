<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import {
    number,
    precision,
    evaluateExpression,
    UNITS,
    convertUnit,
    statistics,
    temperatures,
    businessDays,
    compoundInterest,
    compareBenchmarks,
  } from "./calculators.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  let { toolId, locale = "zh-CN" } = $props();
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
    mode = $state("difference"),
    weekends = $state("0,6"),
    output = $state(""),
    error = $state("");
  let elapsed = $state(0),
    running = $state(false),
    laps = $state([]);
  let timer,
    lastStart = 0,
    accumulated = 0;
  function pause() {
    if (running) {
      accumulated += performance.now() - lastStart;
      elapsed = accumulated;
      running = false;
      clearInterval(timer);
    }
  }
  function start() {
    if (running) return;
    lastStart = performance.now();
    running = true;
    timer = setInterval(
      () => (elapsed = accumulated + performance.now() - lastStart),
      31,
    );
  }
  onDestroy(() => clearInterval(timer));
  function reset() {
    pause();
    accumulated = 0;
    elapsed = 0;
    laps = [];
  }
  async function exportLaps() {
    try {
      await saveBlobThroughHost(
        new Blob(
          [
            "lap,total_ms,split_ms\n" +
              laps
                .map((x, i) => `${i + 1},${x},${x - (laps[i - 1] || 0)}`)
                .join("\n"),
          ],
          { type: "text/csv" },
        ),
        { fileName: "laps.csv" },
      );
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
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
      else if (toolId === "business-days") {
        const days = weekends
          .split(",")
          .filter((s) => s.trim())
          .map(number);
        if (days.some((n) => !Number.isInteger(n) || n < 0 || n > 6))
          throw new Error("Weekdays must be 0 to 6");
        result = businessDays(a, {
          ...(mode === "difference" ? { end: b } : { add: b }),
          weekends: days,
          holidays: input.split(/[\s,]+/).filter(Boolean),
        });
      } else if (toolId === "eta") {
        const total = number(a),
          done = number(b),
          seconds = number(c);
        if (total < 0 || done <= 0 || done > total || seconds <= 0)
          throw new Error("Invalid progress");
        const remainingSeconds = ((total - done) * seconds) / done;
        result = {
          remainingSeconds,
          completion: new Date(
            Date.now() + remainingSeconds * 1000,
          ).toISOString(),
          rate: done / seconds,
        };
      } else if (toolId === "benchmark") result = compareBenchmarks(input);
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
      eta: ["100", "40", "120"],
      "compound-interest": ["1000", "5", "10"],
      "business-days": ["2026-10-23", "2026-10-30", ""],
    }[toolId] || ["", "", ""];
    [a, b, c] = values;
  }
  const fieldLabels = {
    percentage: [
      ["X", "X"],
      ["Y", "Y"],
    ],
    eta: [
      ["总量", "Total"],
      ["已完成量", "Completed"],
      ["已用秒数", "Elapsed seconds"],
    ],
    "compound-interest": [
      ["本金", "Principal"],
      ["年利率（%）", "Annual rate (%)"],
      ["年数", "Years"],
    ],
    "business-days": [
      ["开始日期", "Start date"],
      ["结束日期 / 增加工作日", "End date / working days to add"],
    ],
  };
</script>

<div class="expansion-page">
  {#if toolId === "stopwatch"}
    <output class="stopwatch">{(elapsed / 1000).toFixed(3)} s</output>
    <div class="expansion-actions">
      <button class="dbx-btn" onclick={running ? pause : start}
        >{running ? t("暂停", "Pause") : t("开始", "Start")}</button
      ><button
        class="dbx-btn"
        disabled={!running}
        onclick={() => (laps = [...laps, elapsed])}>{t("计次", "Lap")}</button
      ><button class="dbx-btn" onclick={reset}>{t("重置", "Reset")}</button
      ><button class="dbx-btn" disabled={!laps.length} onclick={exportLaps}
        >{t("导出记录", "Export laps")}</button
      >
    </div>
    {#each laps as lap, i}<p>
        {i + 1}. {(lap / 1000).toFixed(3)} s · +{(
          (lap - (laps[i - 1] || 0)) /
          1000
        ).toFixed(3)} s
      </p>{/each}
  {:else}
    {#if ["math-expression", "statistics", "benchmark", "business-days"].includes(toolId)}<label
        >{toolId === "business-days"
          ? t(
              "节假日（YYYY-MM-DD，每行一个）",
              "Holidays (YYYY-MM-DD, one per line)",
            )
          : toolId === "benchmark"
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
    {#if toolId === "business-days"}<label
        >{t("模式", "Mode")}<select class="dbx-input" bind:value={mode}
          ><option value="difference"
            >{t("工作日差", "Working day difference")}</option
          ><option value="add">{t("增加工作日", "Add working days")}</option
          ></select
        ></label
      ><label
        >{t("周末（0=周日，6=周六）", "Weekends (0=Sunday, 6=Saturday)")}<input
          class="dbx-input"
          bind:value={weekends}
        /></label
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
        >{t("类别", "Category")}<select
          class="dbx-input"
          bind:value={category}
          onchange={() => {
            from = Object.keys(UNITS[category])[0];
            to = Object.keys(UNITS[category])[1];
          }}
          >{#each Object.keys(UNITS) as key}<option value={key}>{key}</option
            >{/each}</select
        ></label
      ><label
        >{t("从", "From")}<select class="dbx-input" bind:value={from}
          >{#each Object.keys(UNITS[category]) as key}<option>{key}</option
            >{/each}</select
        ></label
      ><label
        >{t("到", "To")}<select class="dbx-input" bind:value={to}
          >{#each Object.keys(UNITS[category]) as key}<option>{key}</option
            >{/each}</select
        ></label
      >{/if}
    {#if toolId === "temperature"}<select class="dbx-input" bind:value={scale}
        >{#each ["C", "F", "K", "R"] as s}<option>{s}</option>{/each}</select
      >{/if}
    {#if toolId === "compound-interest"}<label
        >{t("每年计息次数", "Compounding periods per year")}<select
          class="dbx-input"
          bind:value={d}
          >{#each [1, 2, 4, 12, 365] as value}<option>{value}</option
            >{/each}</select
        ></label
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
      <button class="dbx-btn" onclick={example}>{t("示例", "Example")}</button>
    </div>
    {#if output}<textarea class="dbx-textarea" value={output} readonly rows="12"
      ></textarea>{/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .stopwatch {
    font: 48px var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
</style>
