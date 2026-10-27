<script>
  import { tick } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { evaluateExpression, precision } from "./calculators.js";
  import CopyButton from "./CopyButton.svelte";
  import { DEFAULT_SHORTCUTS, shortcutLabel } from "./shortcuts.js";

  let { locale = "zh-CN", demoRequest = 0, calculateShortcut = DEFAULT_SHORTCUTS.calculate } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const historyLimit = 8;
  const calculateShortcutLabel = $derived(calculateShortcut ? shortcutLabel(calculateShortcut) : "");
  let input = $state("");
  let digits = $state(8);
  let result = $state(null);
  let error = $state(null);
  let history = $state([]);
  let editor;
  let appliedDemoRequest = 0;
  const validDigits = $derived(Number.isInteger(digits) && digits >= 1 && digits <= 15);
  const current = $derived(result !== null && result.source === input);
  const output = $derived(current && validDigits ? String(precision(result.value, digits)) : "");
  const currentError = $derived(error?.source === input ? error.message : "");
  const examples = ["sqrt(16) + 2^3", "2pi + 3(4 + 1)", "max(12, 8, 20) / 5", "5! / (3! * 2!)"];
  const shortcuts = ["(", ")", ",", "^", "!", "%", "pi", "e", "sqrt", "abs", "sin", "cos", "log", "ln", "min", "max", "pow", "round"];

  function calculate() {
    result = null;
    error = null;
    if (!input.trim() || !validDigits) return;
    try {
      const value = evaluateExpression(input);
      result = { source: input, value };
      history = [result, ...history.filter((item) => item.source !== input)].slice(0, historyLimit);
    } catch (cause) {
      const message = cause.message === "Invalid function arguments"
        ? t("函数参数数量不正确，请参考语法速查。", "Incorrect number of function arguments. See the quick reference.")
        : cause.message === "Factorial requires an integer from 0 to 170"
          ? t("阶乘仅支持 0–170 的整数。", "Factorials accept integers from 0 to 170.")
          : localizeError(locale, cause);
      error = { source: input, message };
    }
  }

  async function insert(token) {
    const start = editor?.selectionStart ?? input.length;
    const end = editor?.selectionEnd ?? start;
    const isFunction = token.length > 1 && !["pi", "tau", "phi"].includes(token);
    const selected = input.slice(start, end);
    const text = isFunction ? `${token}(${selected})` : token;
    input = input.slice(0, start) + text + input.slice(end);
    await tick();
    editor.focus();
    const caret = start + text.length - (isFunction && !selected ? 1 : 0);
    editor.setSelectionRange(caret, caret);
  }

  function useExample(source) {
    input = source;
    calculate();
  }

  function clear() {
    input = "";
    result = error = null;
    editor?.focus();
  }

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    useExample(examples[0]);
  });
</script>

<div class="math-page">

  <div class="workspace">
    <div class="main-column">
      <section class="panel input-panel" aria-label={t("表达式", "Expression")}>
        <div class="panel-heading">
          <label for="math-expression-input">{t("表达式", "Expression")}</label>
          <button class="text-button" onclick={clear} disabled={!input}>{t("清空", "Clear")}</button>
        </div>
        <textarea
          id="math-expression-input"
          class="dbx-textarea expression"
          bind:this={editor}
          bind:value={input}
          maxlength="10000"
          rows="3"
          placeholder="sqrt(16) + 2^3"
          spellcheck="false"
          aria-invalid={!!currentError}
          aria-describedby={currentError ? "math-expression-error" : "math-expression-hint"}
        ></textarea>
        <div class="shortcuts" aria-label={t("常用函数与符号", "Common functions and symbols")}>
          {#each shortcuts as token}
            <button class="token" onclick={() => insert(token)} aria-label={t(`插入 ${token}`, `Insert ${token}`)}>{token}</button>
          {/each}
        </div>
        <div class="controls">
          <label class="precision" for="math-digits">
            {t("有效数字", "Significant digits")}
            <input id="math-digits" class="dbx-input" type="number" min="1" max="15" step="1" bind:value={digits} aria-invalid={!validDigits} aria-describedby={!validDigits ? "math-digits-error" : undefined} />
          </label>
          <button class="dbx-btn dbx-btn--primary calculate" onclick={calculate} disabled={!input.trim() || !validDigits} title={calculateShortcutLabel || undefined}>
            {t("计算", "Calculate")} <span aria-hidden="true">↵</span>
          </button>
        </div>
        {#if !validDigits}<p id="math-digits-error" class="error" role="alert">{t("有效数字需为 1–15 的整数。", "Significant digits must be an integer from 1 to 15.")}</p>{/if}
        <p id="math-expression-hint" class="hint">{#if calculateShortcutLabel}<kbd>{calculateShortcutLabel}</kbd> {t("页面内计算 · 三角函数使用弧度", "Calculate anywhere on this page · Trigonometric functions use radians")}{:else}{t("三角函数使用弧度", "Trigonometric functions use radians")}{/if}</p>
      </section>

      <section class="panel result-panel" class:has-result={!!output} aria-label={t("计算结果", "Calculation result")}>
        <div class="panel-heading">
          <h3>{t("计算结果", "Calculation result")}</h3>
          <CopyButton {locale} text={output} labelZh="复制结果" labelEn="Copy result" />
        </div>
        <div class="result-body" aria-live="polite" aria-atomic="true">
          {#if currentError}
            <p id="math-expression-error" class="error" role="alert">{currentError}</p>
            <p class="hint">{t("请检查表达式中的函数、运算符和括号。", "Check the functions, operators, and parentheses in your expression.")}</p>
          {:else if output}
            <output class="result-value">{output}</output>
            <p class="hint">{t(`按 ${digits} 位有效数字显示`, `Displayed with ${digits} significant digits`)}</p>
          {:else}
            <span class="empty-value" aria-hidden="true">—</span>
            <p class="hint">{input.trim() ? t("表达式已就绪，点击计算查看结果。", "Expression ready. Calculate to see the result.") : t("输入表达式，或选择下方示例开始。", "Enter an expression or choose an example below.")}</p>
          {/if}
        </div>
      </section>

      <div class="examples">
        <span>{t("试一试", "Try an example")}</span>
        <div>{#each examples as source}<button class="example" onclick={() => useExample(source)}>{source}</button>{/each}</div>
      </div>
    </div>

    <aside class="side-column">
      <section class="panel history">
        <div class="panel-heading">
          <h3>{t("最近计算", "Recent calculations")} <span class="history-count">{history.length} / {historyLimit}</span></h3>
          {#if history.length}<button class="text-button" onclick={() => history = []}>{t("清除记录", "Clear history")}</button>{/if}
        </div>
        {#if history.length}
          <ul>{#each history as item}<li><button class="history-item" onclick={() => useExample(item.source)} title={item.source}><span>{item.source}</span><strong>= {String(precision(item.value, validDigits ? digits : 8))}</strong></button></li>{/each}</ul>
        {:else}
          <p class="hint">{t("本次打开期间的计算会显示在这里，点击可再次使用。", "Calculations from this session appear here. Click one to reuse it.")}</p>
        {/if}
      </section>
      <details class="panel reference">
        <summary>{t("语法速查", "Quick reference")}<span class="hint">{t("函数、常量与运算规则", "Functions, constants, and operators")}</span></summary>
        <dl>
          <div><dt>{t("基础运算", "Arithmetic")}</dt><dd><code>+ − * /</code></dd></div>
          <div><dt>{t("幂 / 取余 / 阶乘", "Power / remainder / factorial")}</dt><dd><code>2^3 = 2**3 · 10%3 · 5!</code></dd></div>
          <div><dt>{t("隐式乘法", "Implicit multiplication")}</dt><dd><code>2pi · 3(4 + 1) · (2 + 1)(4 − 1)</code></dd></div>
          <div><dt>{t("常量", "Constants")}</dt><dd><code>pi / π · e · tau · phi</code></dd></div>
          <div><dt>{t("科学函数", "Scientific functions")}</dt><dd><code>sqrt · cbrt · abs · exp<br />ln · log · log2 · log10</code></dd></div>
          <div><dt>{t("多参数函数", "Functions with multiple arguments")}</dt><dd><code>min(1, 2) · max(1, 2)<br />pow(2, 3) · hypot(3, 4)<br />atan2(1, 1)</code></dd></div>
          <div><dt>{t("三角函数（弧度）", "Trigonometry (radians)")}</dt><dd><code>sin · cos · tan<br />asin · acos · atan</code></dd></div>
          <div><dt>{t("双曲函数", "Hyperbolic functions")}</dt><dd><code>sinh · cosh · tanh</code></dd></div>
          <div><dt>{t("取整与符号", "Rounding and sign")}</dt><dd><code>floor · ceil · round · trunc · sign</code></dd></div>
        </dl>
        <p class="hint">{t("函数需带括号；log 为常用对数，ln 为自然对数。", "Functions require parentheses; log is base 10 and ln is the natural logarithm.")}</p>
        <p class="hint">{t("% 表示取余；隐式乘法与 * 同级，按从左到右计算。阶乘仅支持 0–170 的整数。", "% means remainder. Implicit multiplication has the same precedence as * and is evaluated left to right. Factorials accept integers from 0 to 170.")}</p>
      </details>

    </aside>
  </div>
</div>

<style>
  .math-page { container-type: inline-size; width: 100%; max-width: 1240px; margin: 0 auto; padding: 16px 20px; overflow: auto; min-height: 0; color: var(--color-foreground); }
  .workspace, .side-column { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .main-column { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr); border: 1px solid var(--color-border); border-radius: 8px; min-width: 0; overflow: hidden; }
  .panel { background: var(--color-background); padding: 18px 20px; min-width: 0; }
  .input-panel { display: flex; flex-direction: column; }
  .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 30px; margin-bottom: 12px; }
  h3, .panel-heading > label { margin: 0; font-size: 13px; font-weight: 600; }
  .text-button { border: 0; background: transparent; padding: 4px 0; color: var(--color-muted-foreground); font-size: 12px; cursor: pointer; }
  .text-button:hover { color: var(--color-primary); }
  button:disabled { opacity: .45; cursor: default; }
  .expression { width: 100%; min-height: 110px; resize: vertical; font: 16px/1.8 var(--font-mono); padding: 12px; background: var(--color-background); }
  .shortcuts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
  .token, .example { border: 1px solid var(--color-border); border-radius: 5px; color: var(--color-foreground); background: var(--color-background); cursor: pointer; font: 12px var(--font-mono); }
  .token { min-width: 33px; padding: 6px 9px; }
  .token:hover, .example:hover, .history-item:hover { background: var(--color-muted); color: var(--color-primary); }
  button:focus-visible { outline: 1px solid var(--color-ring); outline-offset: 2px; }
  .controls { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
  .precision { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--color-muted-foreground); }
  .precision input { width: 72px; color: var(--color-foreground); }
  .calculate { min-width: 102px; gap: 22px; color: var(--color-primary-foreground); }
  .calculate span { opacity: .65; }
  .hint { font-size: 12px; line-height: 1.7; color: var(--color-muted-foreground); margin: 10px 0 0; overflow-wrap: anywhere; }
  .result-panel { display: flex; flex-direction: column; border-left: 1px solid var(--color-border); background: var(--color-muted); }
  .result-panel.has-result { background: color-mix(in srgb, var(--color-primary) 4%, var(--color-background)); }
  .result-body { display: flex; flex: 1; flex-direction: column; justify-content: center; padding: 20px 0 32px; }
  .result-value { display: block; font: 500 clamp(28px, 4cqi, 44px)/1.4 var(--font-mono); color: var(--color-primary); overflow-wrap: anywhere; user-select: text; }
  .empty-value { font: 30px var(--font-mono); color: var(--color-muted-foreground); }
  .error { color: var(--color-destructive); font-size: 13px; line-height: 1.7; margin: 0; overflow-wrap: anywhere; }
  .examples { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 12px; padding: 12px 20px; border-top: 1px solid var(--color-border); }
  .examples > span { flex-shrink: 0; color: var(--color-muted-foreground); font-size: 12px; }
  .examples > div { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
  .example { padding: 6px 8px; }
  .reference { border: 1px solid var(--color-border); border-radius: 8px; padding: 14px 20px; }
  summary { cursor: pointer; font-size: 12px; font-weight: 600; }
  summary .hint { margin-left: 12px; font-weight: 400; }
  summary:focus-visible { outline: 1px solid var(--color-ring); outline-offset: 4px; }
  dl { margin: 20px 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 24px; }
  dl > div { min-width: 0; overflow-wrap: anywhere; }
  dt { font-size: 11px; color: var(--color-muted-foreground); margin-bottom: 5px; }
  dd { margin: 0; font-size: 12px; line-height: 1.7; }
  code { font-family: var(--font-mono); }
  .reference > .hint { border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 16px; }
  .history { padding: 0 2px; }
  .history .panel-heading { margin-bottom: 0; }
  .history-count { margin-left: 6px; color: var(--color-muted-foreground); font: 11px var(--font-mono); }
  kbd { font: 11px var(--font-mono); }
  .history > .hint { margin-top: 4px; }
  ul { padding: 0; margin: 4px 0 0; list-style: none; max-height: 244px; overflow: auto; }
  li + li { border-top: 1px solid var(--color-border); }
  .history-item { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; width: 100%; text-align: start; background: transparent; border: 0; color: var(--color-foreground); padding: 10px 8px; cursor: pointer; font: 12px/1.5 var(--font-mono); }
  .history-item span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .history-item strong { flex-shrink: 0; color: var(--color-primary); font-weight: 500; overflow-wrap: anywhere; max-width: 50%; }
  @container (max-width: 720px) { .main-column { grid-template-columns: minmax(0, 1fr); } .result-panel { border-left: 0; border-top: 1px solid var(--color-border); } .result-body { padding: 4px 0 10px; min-height: 90px; } dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @container (max-width: 420px) { .panel { padding: 14px; } .history { padding: 0 2px; } .precision { gap: 6px; } .calculate { min-width: 88px; gap: 12px; } .examples { flex-direction: column; gap: 8px; padding: 12px 14px; } summary .hint { display: none; } dl { grid-template-columns: minmax(0, 1fr); } }
  @media (max-width: 520px) { .math-page { padding: 16px 12px; } }
</style>
