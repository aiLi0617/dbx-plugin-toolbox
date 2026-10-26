<script>
  import { pick } from "./i18n.js";
  import { temperatures, precision } from "./calculators.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let value = $state("25");
  let scale = $state("C");
  let digits = $state(8);
  const scales = [
    { id: "C", symbol: "°C", zh: "摄氏度", en: "Celsius", minimum: -273.15 },
    { id: "F", symbol: "°F", zh: "华氏度", en: "Fahrenheit", minimum: -459.67 },
    { id: "K", symbol: "K", zh: "开尔文", en: "Kelvin", minimum: 0 },
    { id: "R", symbol: "°R", zh: "兰金度", en: "Rankine", minimum: 0 },
  ];
  const selected = $derived(scales.find((item) => item.id === scale));
  const result = $derived.by(() => {
    if (!String(value).trim()) return { values: null, error: "" };
    if (!Number.isFinite(Number(value)))
      return {
        values: null,
        error: t("请输入有效的温度数值。", "Enter a valid temperature."),
      };
    if (!Number.isInteger(digits) || digits < 1 || digits > 15)
      return {
        values: null,
        error: t(
          "有效数字须为 1 到 15 的整数。",
          "Significant digits must be an integer from 1 to 15.",
        ),
      };
    if (Number(value) < selected.minimum)
      return {
        values: null,
        error:
          t(
            "温度不能低于绝对零度：",
            "Temperature cannot be below absolute zero: ",
          ) + `${selected.minimum} ${selected.symbol}`,
      };
    const values = temperatures(value, scale);
    if (Object.values(values).some((n) => !Number.isFinite(n)))
      return {
        values: null,
        error: t(
          "数值过大，请输入较小的温度。",
          "Value is too large. Enter a smaller temperature.",
        ),
      };
    return { values, error: "" };
  });
  const formatted = $derived(
    result.values
      ? Object.fromEntries(
          scales.map(({ id }) => [
            id,
            String(precision(result.values[id], digits)),
          ]),
        )
      : null,
  );
  const copyAll = $derived(
    formatted
      ? scales.map(({ id, symbol }) => `${formatted[id]} ${symbol}`).join("\n")
      : "",
  );
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    value = "25";
    scale = "C";
    digits = 8;
  });
  function preset(n) {
    scale = "C";
    value = String(n);
  }
</script>

<div class="temperature-page">
  <header class="intro">
    <div class="intro-icon" aria-hidden="true">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M14 14.8V5a3 3 0 0 0-6 0v9.8a5 5 0 1 0 6 0Z" /><path
          d="M11 8v9m7-12h3m-3 4h2"
        /></svg
      >
    </div>
    <div>
      
      <p>
        {t(
          "输入温度，实时查看四种温标的换算结果。",
          "Enter a temperature to convert between four scales instantly.",
        )}
      </p>
    </div>
  </header>

  <section class="input-panel" aria-label={t("温度输入", "Temperature input")}>
    <div class="fields">
      <label class="value-field" for="temperature-value"
        >{t("温度数值", "Temperature value")}
        <div class="value-control">
          <input
            id="temperature-value"
            class="dbx-input"
            bind:value
            inputmode="decimal"
            placeholder="25"
            aria-invalid={!!result.error}
            aria-describedby="temperature-hint temperature-error"
          /><span>{selected.symbol}</span>
        </div>
      </label>
      <div class="field">
        <span>{t("输入温标", "Input scale")}</span><Select
          bind:value={scale}
          ariaLabel={t("输入温标", "Input scale")}
          options={scales.map((item) => ({
            value: item.id,
            label: `${t(item.zh, item.en)} (${item.symbol})`,
          }))}
        />
      </div>
      <label for="temperature-digits"
        >{t("有效数字", "Significant digits")}<input
          id="temperature-digits"
          class="dbx-input"
          type="number"
          min="1"
          max="15"
          step="1"
          bind:value={digits}
        /></label
      >
    </div>
    <div class="presets">
      <span>{t("常用温度", "Quick presets")}</span>
      <button class="dbx-btn dbx-btn--ghost" onclick={() => preset(0)}
        >{t("冰点", "Freezing")} <b>0 °C</b></button
      >
      <button class="dbx-btn dbx-btn--ghost" onclick={() => preset(25)}
        >{t("室温", "Room")} <b>25 °C</b></button
      >
      <button class="dbx-btn dbx-btn--ghost" onclick={() => preset(100)}
        >{t("沸点", "Boiling")} <b>100 °C</b></button
      >
      <button class="dbx-btn dbx-btn--ghost" onclick={() => preset(-273.15)}
        >{t("绝对零度", "Absolute zero")} <b>−273.15 °C</b></button
      >
    </div>
    <p id="temperature-hint" class="hint">
      {t("最低温度", "Minimum temperature")}
      {selected.minimum}
      {selected.symbol} · {t(
        "水的冰点与沸点以标准大气压为参考。",
        "Water reference points assume standard atmospheric pressure.",
      )}
    </p>
    <div id="temperature-error">
      {#if result.error}<p class="error" role="alert">{result.error}</p>{/if}
    </div>
  </section>

  <section aria-label={t("换算结果", "Conversion results")}>
    <div class="results-heading">
      <h3>{t("换算结果", "Conversion results")}</h3>
      <div class="copy-all">
        <span>{t("复制全部", "Copy all")}</span><CopyButton
          {locale}
          text={copyAll}
          labelZh="复制全部"
          labelEn="Copy all"
        />
      </div>
    </div>
    <div class="results-grid">
      {#each scales as item}
        <article class:source={scale === item.id}>
          <div class="card-heading">
            <span>{t(item.zh, item.en)}</span>{#if scale === item.id}<span
                class="source-tag">{t("输入", "Input")}</span
              >{/if}<CopyButton
              {locale}
              text={formatted ? `${formatted[item.id]} ${item.symbol}` : ""}
              labelZh={`复制${item.zh}`}
              labelEn={`Copy ${item.en}`}
            />
          </div>
          <div class="reading">
            <output>{formatted ? formatted[item.id] : "—"}</output><span
              >{item.symbol}</span
            >
          </div>
          <p class="formula">
            {{
              C: "°C = K − 273.15",
              F: "°F = °C × 9/5 + 32",
              K: "K = °C + 273.15",
              R: "°R = K × 9/5",
            }[item.id]}
          </p>
        </article>
      {/each}
    </div>
    {#if !String(value).trim()}<p class="empty" role="status">
        {t(
          "输入温度数值后，结果将自动显示。",
          "Enter a temperature to see the results.",
        )}
      </p>{/if}
  </section>
</div>

<style>
  .temperature-page {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 8px 0;
  }
  .intro {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .intro-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius:var(--radius-lg);
    color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 9%, transparent);
    flex-shrink: 0;
  }
  
  .intro p {
    margin: 6px 0 0;
    line-height: 1.6;
  }
  .input-panel {
    padding: 22px;
    border: 1px solid var(--color-border);
    border-radius:var(--radius-lg);
    background: var(--color-card, var(--color-background));
  }
  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(
        100px,
        0.55fr
      );
    gap: 16px;
    align-items: end;
  }
  label,
  .field {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
    font-size: 13px;
  }
  .fields :global(.dbx-input),
  .fields :global(.dbx-custom-select),
  .fields :global(.trigger) {
    width: 100%;
    min-height: 40px;
  }
  .value-control {
    position: relative;
  }
  .value-control input {
    padding-right: 45px;
    font: 20px var(--font-mono);
  }
  .value-control > span {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-muted-foreground);
    pointer-events: none;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 18px;
  }
  .presets > span {
    font-size: 12px;
    color: var(--color-muted-foreground);
    margin-right: 6px;
  }
  .presets button {
    font-size: 12px;
    border: 1px solid var(--color-border);
    gap: 8px;
  }
  .presets b {
    font-weight: 500;
    color: var(--color-foreground);
  }
  .hint {
    margin: 14px 0 0;
    line-height: 1.7;
  }
  .error {
    margin: 12px 0 0;
    color: var(--color-destructive);
  }
  .results-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0;
  }
  .copy-all {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .results-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .results-grid article {
    padding: 18px 20px;
    border-radius:var(--radius-lg);
    min-width: 0;
    background: var(--color-card, var(--color-background));
  }
  .results-grid article.source {
    border-color: color-mix(
      in srgb,
      var(--color-primary) 45%,
      var(--color-border)
    );
    background: color-mix(
      in srgb,
      var(--color-primary) 4%,
      var(--color-background)
    );
  }
  .card-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .card-heading :global(.copy-btn) {
    margin-left: auto;
  }
  .source-tag {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
  }
  .reading {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 12px 0 16px;
  }
  output {
    font: clamp(22px, 3.3cqw, 32px) var(--font-mono);
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .reading > span {
    font-size: 16px;
    color: var(--color-muted-foreground);
    flex-shrink: 0;
  }
  .formula {
    border-top: 1px solid var(--color-border);
    padding-top: 12px;
    margin: 0;
    font-family: var(--font-mono);
  }
  .empty {
    text-align: center;
    margin-top: 18px;
  }
  @container (max-width: 640px) {
    .fields {
      grid-template-columns: minmax(0, 1fr) minmax(100px, 0.6fr);
    }
    .value-field {
      grid-column: 1 / -1;
    }
    .input-panel {
      padding: 16px;
    }
  }
  @container (max-width: 420px) {
    .results-grid {
      grid-template-columns: 1fr;
    }
    .intro {
      align-items: flex-start;
    }
    
  }
.temperature-page{padding:0;gap:12px}.intro-icon{display:none}.intro p{margin:0;font-size:12px;color:var(--color-muted-foreground)}.input-panel{padding:16px}
</style>
