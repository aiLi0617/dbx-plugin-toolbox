<script>
  import { pick } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import { calculatePercentage } from "./percentage.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let a = $state(""), b = $state(""), digits = $state(8);
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || appliedDemoRequest === demoRequest) return;
    appliedDemoRequest = demoRequest;
    a = "20";
    b = "80";
  });
  const empty = $derived(!a.trim() || !b.trim());
  const invalidA = $derived(Boolean(a.trim()) && !Number.isFinite(Number(a)));
  const invalidB = $derived(Boolean(b.trim()) && !Number.isFinite(Number(b)));
  const invalidDigits = $derived(!Number.isInteger(digits) || digits < 1 || digits > 15);
  const result = $derived.by(() => {
    if (empty || invalidA || invalidB || invalidDigits) return null;
    return calculatePercentage(a, b, digits);
  });
  const cards = $derived([
    { key: "percentOf", title: t("百分数值", "Percentage of a value"), question: t("X 的 Y% 是多少？", "What is Y% of X?"), formula: "X × Y ÷ 100", unit: "" },
    { key: "share", title: t("占比", "Proportion"), question: t("X 占 Y 的百分之几？", "What percent of Y is X?"), formula: "X ÷ Y × 100", unit: "%" },
    { key: "change", title: t("变化率", "Percentage change"), question: t("从 X 到 Y，变化了多少？", "What is the change from X to Y?"), formula: "(Y − X) ÷ |X| × 100", unit: "%" },
  ]);
  const summary = $derived(result ? cards.map(card => `${card.title}: ${result[card.key] === null ? "—" : result[card.key] + card.unit}`).join("\n") : "");
  function reason(key) {
    if (key === "share" && Number(b) === 0) return t("Y 为 0，无法计算占比", "Proportion is undefined when Y is 0");
    if (key === "change" && Number(a) === 0) return t("X 为 0，无法计算变化率", "Percentage change is undefined when X is 0");
    return t("结果超出数值范围", "Result is outside the numeric range");
  }
</script>

<div class="expansion-page percentage-page">
  <header class="intro">
    <span class="symbol" aria-hidden="true">%</span>
    <div><h2>{t("两个数，三种百分比", "Two values, three perspectives")}</h2>
      <p>{t("输入 X 和 Y，实时查看百分数值、占比与变化率。", "Enter X and Y to calculate a percentage, proportion and change instantly.")}</p></div>
  </header>

  <section class="inputs" aria-label={t("计算参数", "Calculation inputs")}>
    <div class="values">
      <label><span>{t("数值 X", "Value X")}</span><input class="dbx-input" inputmode="decimal" bind:value={a} placeholder="20" aria-invalid={invalidA} />
        <small>{t("作为计算数值或变化前的值", "The value or starting amount")}</small></label>
      <button class="dbx-btn swap" type="button" onclick={() => { [a, b] = [b, a]; }} title={t("交换 X 与 Y", "Swap X and Y")} aria-label={t("交换 X 与 Y", "Swap X and Y")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h16m-4-4 4 4-4 4M20 16H4m4-4-4 4 4 4" /></svg>
      </button>
      <label><span>{t("数值 Y", "Value Y")}</span><input class="dbx-input" inputmode="decimal" bind:value={b} placeholder="80" aria-invalid={invalidB} />
        <small>{t("作为百分数、总量或变化后的值", "The percentage, total or ending amount")}</small></label>
    </div>
    <div class="options">
      <label class="precision">{t("有效数字", "Significant digits")}<input class="dbx-input" type="number" min="1" max="15" step="1" bind:value={digits} aria-invalid={invalidDigits} /></label>
      <span class="live"><span aria-hidden="true">●</span> {t("实时计算", "Live calculation")}</span>
      <button class="dbx-btn dbx-btn--ghost" type="button" disabled={!a && !b} onclick={() => { a = ""; b = ""; }}>{t("清空", "Clear")}</button>
    </div>
  </section>

  {#if invalidA || invalidB}<p role="alert">{t("请输入有效的有限数值，支持负数、小数和科学计数法。", "Enter finite numbers. Negative values, decimals and scientific notation are supported.")}</p>
  {:else if invalidDigits}<p role="alert">{t("有效数字必须是 1 到 15 之间的整数。", "Significant digits must be an integer from 1 to 15.")}</p>{/if}

  <div class="result-heading"><h3>{t("计算结果", "Results")}</h3><div class="copy-all"><span>{t("复制全部", "Copy all")}</span><CopyButton {locale} text={summary} label={t("复制全部", "Copy all")} /></div></div>
  <div class="results">
    {#each cards as card, i}
      <article class="result-card">
        <div class="card-heading"><span class="index">0{i + 1}</span><h3>{card.title}</h3><CopyButton {locale} text={result && result[card.key] !== null ? `${result[card.key]}${card.unit}` : ""} label={`${t("复制", "Copy")} ${card.title}`} /></div>
        <p class="question">{card.question}</p>
        <div class="answer">{#if result && result[card.key] !== null}<output>{card.key === "change" && result.change > 0 ? "+" : ""}{result[card.key]}</output><span class="unit">{card.unit}</span>{:else}<span class="dash">—</span>{/if}</div>
        <p class="explanation">{#if result && result[card.key] === null}{reason(card.key)}{:else if !result}{t("输入两个数值后显示结果", "Enter both values to see the result")}{:else if card.key === "change"}{result.change > 0 ? t("增加", "Increase") : result.change < 0 ? t("减少", "Decrease") : t("无变化", "No change")}{:else}{`${a} ${card.key === "share" ? "÷" : "×"} ${b} ${card.key === "share" ? "×" : "÷"} 100`}{/if}</p>
        <code class="formula">{card.formula}{card.unit ? " (%)" : ""}</code>
      </article>
    {/each}
  </div>
  <p class="note">{t("变化率以 X 的绝对值为基数；有效数字仅影响结果显示。", "Percentage change uses the absolute value of X as its base. Significant digits only affect displayed results.")}</p>
</div>

<style>
  .percentage-page { gap: 20px; padding: 28px 24px; }
  .intro { display: flex; align-items: center; gap: 14px; }
  .symbol { display: grid; place-items: center; width: 44px; height: 44px; flex-shrink: 0; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-muted); font-size: 24px; }
  h2, h3, p { margin: 0; }
  h2 { font-size: 18px; font-weight: 600; }
  .intro p { margin-top: 5px; line-height: 1.6; }
  .inputs { border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card); }
  .values { display: grid; grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1fr); gap: 18px; align-items: start; padding: 22px; }
  label { display: flex; flex-direction: column; gap: 9px; font-size: 13px; min-width: 0; }
  .values input { height: 46px; font-size: 22px; font-variant-numeric: tabular-nums; }
  small { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.5; }
  .swap { margin-top: 30px; width: 36px; height: 36px; padding: 0; }
  .options { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 12px 22px; border-top: 1px solid var(--color-border); }
  .precision { flex-direction: row; align-items: center; gap: 10px; }
  .precision input { width: 68px; }
  .live { font-size: 12px; color: var(--color-muted-foreground); margin-left: auto; }
  .live > span { color: var(--color-success); font-size: 9px; }
  .result-heading, .copy-all, .card-heading { display: flex; align-items: center; gap: 8px; }
  h3 { font-size: 13px; font-weight: 600; }
  .result-heading { justify-content: space-between; margin-bottom: -8px; }
  .copy-all { font-size: 12px; color: var(--color-muted-foreground); }
  .results { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
  .result-card { min-width: 0; padding: 18px; border-radius: 10px; background: var(--color-card); }
  .card-heading h3 { flex: 1; }
  .index { font: 11px var(--font-mono); color: var(--color-muted-foreground); }
  .question { margin-top: 10px; line-height: 1.5; }
  .answer { display: flex; align-items: baseline; gap: 4px; margin: 18px 0 10px; min-height: 46px; overflow-wrap: anywhere; font: 600 34px var(--font-sans); font-variant-numeric: tabular-nums; }
  output { min-width: 0; }
  .unit { font-size: 20px; font-weight: 400; color: var(--color-muted-foreground); }
  .dash { color: var(--color-muted-foreground); }
  .explanation { min-height: 36px; line-height: 1.5; }
  .formula { display: block; border-top: 1px solid var(--color-border); padding-top: 14px; margin-top: 10px; font: 11px var(--font-mono); color: var(--color-muted-foreground); overflow-wrap: anywhere; }
  .note { line-height: 1.6; }
  input[aria-invalid="true"] { border-color: var(--color-destructive); }
  @container (max-width: 650px) { .results { grid-template-columns: 1fr; } .answer { margin-top: 12px; } .explanation { min-height: 18px; } }
  @container (max-width: 420px) { .values { grid-template-columns: 1fr; gap: 12px; padding: 16px; } .swap { margin: 0; justify-self: center; } .options { padding: 12px 16px; gap: 10px; } .live { margin-left: 0; } }
</style>
