<script>
  import { onDestroy, untrack } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import { validateIban } from "./securityExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import BcryptView from "./BcryptView.svelte";
  import Bip39Panel from "./Bip39Panel.svelte";
  import { resultSignature, resultIsCurrent } from "./sessionInteractions.js";
  let { toolId, locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    auxiliary = $state(""),
    passphrase = $state(""),
    mode = $state("generate"),
    cost = $state(10),
    count = $state(12),
    language = $state("en"),
    output = $state(""),
    error = $state(""),
    busy = $state(false);
  let disposed = false;
  let executed = $state("");
  let resultData = $state(null);
  let resultMode = $state("");
  let showPassword = $state(false);
  const strengthLabel = $derived(resultData && toolId === "password-strength" ? [t("非常弱", "Very weak"), t("弱", "Weak"), t("一般", "Fair"), t("强", "Strong"), t("很强", "Very strong")][resultData.score] : "");
  let rawOpen = $state(untrack(() => toolId !== "iban" && toolId !== "password-strength"));
  const ibanCharacterCount = $derived(input.replace(/[\s\u00a0]+/g, "").length);
  const ibanPreview = $derived(toolId === "iban" && input.trim() ? validateIban(input) : null);
  const signature = $derived(resultSignature([toolId, input, auxiliary, passphrase, mode, cost, count, language]));
  const stale = $derived(!!output && !resultIsCurrent(output, executed, signature));
  onDestroy(() => {
    disposed = true;
    resultData = null;
    input = "";
    auxiliary = "";
    passphrase = "";
    output = "";
  });
  async function run() {
    const requestSignature = signature;
    const params = { input, auxiliary, passphrase, mode, cost, count, language };
    output = "";
    error = "";
    busy = true;
    try {
      let result, generatedAccepted = false;
      if (toolId === "iban") result = validateIban(params.input);
      else {
        const lib = await loadAssetModule("security-tools");
        if (disposed) return;
        if (toolId === "bcrypt")
          result =
            params.mode === "verify"
              ? await lib.bcryptVerify(params.input, params.auxiliary)
              : await lib.bcryptHash(params.input, Number(params.cost));
        else if (toolId === "password-strength")
          result = lib.passwordStrength(params.input);
        else if (params.mode === "generate") {
          result = lib.bip39Generate(Number(params.count), params.language);
          if (signature === requestSignature) { input = result; generatedAccepted = true; }
        } else if (params.mode === "seed")
          result = await lib.bip39Seed(params.input, params.passphrase, params.language);
        else result = { valid: lib.bip39Validate(params.input, params.language) };
      }
      if (!disposed) {
        resultData = result;
        resultMode = params.mode;
        executed = generatedAccepted ? signature : requestSignature;
        output =
          typeof result === "string" ? result : JSON.stringify(result, null, 2);
      }
    } catch (e) {
      if (!disposed) error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  function example() {
    if (busy) return;
    if (toolId === "bip39") {
      output = "";
      error = "";
      resultData = null;
      executed = "";
      if (mode === "generate") return run();
      language = "en";
      passphrase = "";
      input = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      return;
    }
    showPassword = false;
    mode = "generate";
    input =
      toolId === "iban"
        ? "GB82 WEST 1234 5698 7654 32"
        : toolId === "bip39"
          ? "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
          : "public-demo-password";
    output = "";
    error = "";
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    untrack(() => example());
  });
</script>

{#if toolId === "bip39"}
  <Bip39Panel {locale} bind:input bind:passphrase bind:mode bind:count bind:language {output} {error} {busy} {stale} {resultData} {resultMode} {run}
    clear={() => { input = ""; passphrase = ""; output = ""; error = ""; resultData = null; executed = ""; }} />
{:else}
{#if toolId === "bcrypt"}
  <BcryptView {locale} {demoRequest} />
{:else}
<div class="expansion-page" class:iban-page={toolId === "iban"} class:strength-page={toolId === "password-strength"}>
  {#if toolId === "bcrypt" || toolId === "bip39"}<label
      >{t("模式", "Mode")}<Select bind:value={mode} ariaLabel={t("模式", "Mode")} options={[{value:"generate",label:t("生成", "Generate")},{value:"verify",label:t("校验", "Validate")},...(toolId === "bip39" ? [{value:"seed",label:t("派生种子", "Derive seed")}] : [])]} /></label
    >{/if}
  <div class="security-input-field" class:iban-input-label={toolId === "iban"}>
    <label for="security-main-input">{toolId === "iban"
      ? "IBAN"
      : toolId === "bip39"
        ? t("助记词", "Mnemonic")
        : t(
            "密码",
            "Password",
          )}</label>{#if toolId === "bip39" || toolId === "iban"}<textarea
        id="security-main-input"
        class="dbx-textarea"
        bind:value={input}
        maxlength="4096"
        rows="4"
        placeholder={toolId === "iban" ? "例如：GB82 WEST 1234 5698 7654 32" : undefined}
        spellcheck="false"
        aria-describedby={toolId === "iban" ? "iban-input-hint" : undefined}></textarea>{:else}<div class="password-input-wrap"><input
        id="security-main-input"
        class="dbx-input"
        type={showPassword ? "text" : "password"}
        autocomplete="new-password"
        spellcheck="false"
        autocapitalize="none"
        bind:value={input}
        maxlength="256"
        onkeydown={(event) => { if (event.key === "Enter" && !event.isComposing && !busy && input.length) run(); }}
      /><button class="password-eye" type="button" aria-controls="security-main-input" aria-pressed={showPassword}
        aria-label={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}
        title={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}
        onclick={() => showPassword = !showPassword}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          {#if showPassword}<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A11 11 0 0 1 12 5c7 0 10 7 10 7a17 17 0 0 1-3 4M6.5 6.5C3.5 8.5 2 12 2 12s3 7 10 7a11 11 0 0 0 5.5-1.5" />{:else}<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{/if}
        </svg>
      </button></div>{/if}
    {#if toolId === "password-strength"}<div class="strength-input-meta"><span>{t("建议使用更长且独一无二的密码", "Use a longer, unique password")}</span><span>{input.length} / 256</span></div>{/if}
  </div>
  {#if toolId === "bcrypt"}{#if mode === "verify"}<label
        >{t("已有哈希", "Existing hash")}<input
          class="dbx-input"
          bind:value={auxiliary}
          maxlength="60"
        /></label
      >{:else}<label
        >{t("成本因子", "Cost factor")}<input
          class="dbx-input"
          type="number"
          min="4"
          max="12"
          bind:value={cost}
        /></label
      >{/if}{/if}
  {#if toolId === "bip39"}<p>
      {t(
        "助记词和种子具有资产控制权，请只在可信环境中处理。离开页面后清除。",
        "Mnemonics and seeds control assets. Use a trusted environment. Values are cleared when leaving this page.",
      )}
    </p>
    <label
      >{t("词表", "Wordlist")}<Select bind:value={language} ariaLabel={t("词表", "Wordlist")} options={[{value:"en",label:"English"},{value:"zh",label:"简体中文"}]} /></label
    >{#if mode === "generate"}<Select bind:value={count} ariaLabel={t("单词数量", "Word count")} options={[12,15,18,21,24].map((value) => ({value,label:String(value)}))} />{/if}{#if mode === "seed"}<label
        >{t("可选口令", "Optional passphrase")}<input
          class="dbx-input"
          type="password"
          bind:value={passphrase}
          autocomplete="new-password"
          maxlength="1024"
        /></label
      >{/if}{/if}
  {#if toolId === "iban"}<div class="iban-input-meta" id="iban-input-hint">
      <span class="iban-count">{ibanCharacterCount} {t("字符", "characters")}</span>
    </div>{#if ibanPreview}<div class="iban-live-status" class:valid={ibanPreview.valid} class:invalid={!ibanPreview.valid} aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <span>{ibanPreview.valid ? t("IBAN 有效", "Valid IBAN") : t("IBAN 无效", "Invalid IBAN")}</span>
    </div>{/if}<p class="iban-disclaimer">
      {t(
        "仅校验格式和校验和，不验证账号存在或归属。",
        "Checks syntax and checksum only, not account existence or ownership.",
      )}
    </p>{/if}
  <button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy || (toolId === "password-strength" && !input.length)}
    >{busy ? t("处理中…", "Working…") : toolId === "password-strength" ? t("分析密码强度", "Analyze password strength") : t("执行", "Run")}</button
  >{#if error}<p role="alert">{error}</p>{/if}{#if output}
    <p role="status">{stale ? t("结果已过期，请重新执行后复制。", "Result is outdated. Run again before copying.") : t("结果与当前参数一致", "Result matches the current parameters")}</p>
    {#if toolId === "iban" && resultData}
      <section class="result-summary iban-result" class:valid={resultData.valid} class:invalid={!resultData.valid}>
        <div class="result-heading">
          <span class="status-icon" aria-hidden="true">{resultData.valid ? "✓" : "!"}</span>
          <div><strong>{resultData.valid ? t("IBAN 有效", "Valid IBAN") : t("IBAN 无效", "Invalid IBAN")}</strong></div>
        </div>
        <code class="formatted-iban">{resultData.formatted || resultData.iban}</code>
        <dl><div><dt>{t("国家代码", "Country code")}</dt><dd>{resultData.country || "—"}</dd></div><div><dt>{t("长度", "Length")}</dt><dd>{resultData.iban.length} <small>/ {resultData.expectedLength ?? "—"}</small></dd></div><div><dt>{t("校验和", "Checksum")}</dt><dd>{resultData.checksumValid ? t("通过", "Passed") : t("未通过", "Failed")}</dd></div></dl>
      </section>
    {:else if toolId === "password-strength" && resultData}
      <section class="result-summary strength-result" class:stale style:--strength-color={stale ? "var(--color-muted-foreground)" : resultData.score < 2 ? "var(--color-destructive)" : resultData.score === 2 ? "var(--color-warning)" : "var(--color-success)"}>
        <div class="strength-result-heading"><div><span class="strength-caption">{t("分析结果", "Analysis result")}</span><h3>{strengthLabel}</h3></div><span class="strength-score">{resultData.score}<small> / 4</small></span></div>
        <div class="strength-meter" role="meter" aria-label={t("密码强度", "Password strength")} aria-valuemin="0" aria-valuemax="4" aria-valuenow={resultData.score} aria-valuetext={strengthLabel}>
          {#each [0, 1, 2, 3] as segment}<span class:filled={segment < resultData.score}></span>{/each}
        </div>
        <dl class="strength-metrics"><div><dt>{t("密码长度", "Password length")}</dt><dd>{resultData.length}</dd></div><div><dt>{t("UTF-8 字节数", "UTF-8 bytes")}</dt><dd>{resultData.utf8Bytes}</dd></div><div><dt>{t("估算猜测次数", "Estimated guesses")}</dt><dd>{new Intl.NumberFormat(locale, { maximumSignificantDigits: 4, notation: resultData.guesses >= 1e12 ? "scientific" : "standard" }).format(resultData.guesses)}</dd></div></dl>
      <p class="strength-advice">{t("建议使用更长且独一无二的密码，避免常见词、重复字符和个人信息。", "Use a longer, unique password. Avoid common words, repeated characters and personal information.")}</p>
      {#if locale === "en"}{#if resultData.feedback?.warning}<p>{resultData.feedback.warning}</p>{/if}
      {#each resultData.feedback?.suggestions || [] as suggestion}<p>{suggestion}</p>{/each}{/if}</section>
    {/if}
    {#if toolId !== "iban" && toolId !== "password-strength"}<details bind:open={rawOpen}><summary>{t("原始结果", "Raw result")}</summary><textarea
      class="dbx-textarea"
      readonly
      value={output}
      rows="8"></textarea><CopyButton {locale} text={output} disabled={stale} /></details>{/if}{/if}
</div>

{/if}

{/if}

<style>
  .security-input-field{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px}
  .password-input-wrap{position:relative;display:flex;align-items:center}
  .password-input-wrap input{width:100%;padding-right:44px}
  .password-eye{position:absolute;right:5px;display:grid;place-items:center;width:30px;height:26px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--color-muted-foreground);cursor:pointer}
  .password-eye:hover{background:var(--color-muted);color:var(--color-foreground)}
  .password-eye:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
  .strength-page{max-width:860px;padding:28px 24px 36px;gap:16px}
  .strength-page .security-input-field{gap:9px}
  .strength-page .security-input-field>label{font-weight:600}
  .strength-page .password-input-wrap input{height:44px;font-family:var(--font-mono);font-size:15px;padding-left:13px}
  .strength-page .password-eye{width:34px;height:34px}
  .strength-input-meta{display:flex;justify-content:space-between;gap:12px;color:var(--color-muted-foreground);font-size:11px;line-height:1.5}
  .strength-input-meta span:last-child{white-space:nowrap;font-variant-numeric:tabular-nums}
  .strength-page>.dbx-btn--primary{min-height:40px;font-weight:600}
  .strength-page>[role="status"]{margin:0;font-size:11px}
  .result-summary.strength-result{padding:22px;border-radius:12px;border-color:color-mix(in srgb,var(--strength-color) 30%,var(--color-border));box-shadow:0 4px 16px rgb(0 0 0 / .03)}
  .strength-result-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}
  .strength-caption{color:var(--color-muted-foreground);font-size:11px}
  .strength-result h3{margin:6px 0 0;color:var(--strength-color);font-size:22px}
  .strength-score{color:var(--strength-color);font-size:30px;font-weight:650;font-variant-numeric:tabular-nums}
  .strength-score small{color:var(--color-muted-foreground);font-size:14px;font-weight:400}
  .strength-meter{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:18px 0}
  .strength-meter span{height:6px;border-radius:4px;background:var(--color-muted)}
  .strength-meter .filled{background:var(--strength-color)}
  .strength-metrics{grid-template-columns:1fr 1fr 1.5fr;margin:0;gap:12px}
  .strength-metrics>div{min-width:0;padding:12px;border-radius:8px;background:var(--color-muted)}
  .strength-metrics dt{color:var(--color-muted-foreground);font-size:11px;line-height:1.5}
  .strength-metrics dd{margin-top:7px;font:600 15px/1.5 var(--font-mono);font-variant-numeric:tabular-nums}
  .strength-result .strength-advice{margin:18px 0 0;padding-top:14px;border-top:1px solid var(--color-border);line-height:1.8}
  @media(max-width:560px){.strength-page{padding:20px 14px}.result-summary.strength-result{padding:16px}.strength-metrics{grid-template-columns:1fr 1fr}.strength-metrics>div:last-child{grid-column:1/-1}}
  .result-summary{padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}
  dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  dd{margin:0;overflow-wrap:anywhere}
  summary{cursor:pointer;margin-bottom:8px}
  .iban-page{gap:10px;max-width:920px;padding-top:20px}
  .iban-page .iban-input-label{gap:8px;font-size:13px;font-weight:600}
  .iban-page .iban-input-label textarea{min-height:112px;padding:14px 15px;font-family:var(--font-mono);font-size:15px;line-height:1.65;letter-spacing:.02em;resize:vertical}
  .iban-page .iban-input-label textarea::placeholder{font-family:var(--font-sans);font-size:13px;letter-spacing:0;color:var(--color-muted-foreground);opacity:.72}
  .iban-input-meta{display:flex;justify-content:space-between;gap:12px;margin-top:-3px;color:var(--color-muted-foreground);font-size:11px}
  .iban-count{font-family:var(--font-mono);white-space:nowrap}
  .iban-live-status{display:flex;align-items:center;gap:7px;margin-top:-2px;font-size:11px;color:var(--color-muted-foreground)}
  .iban-live-status.valid{color:#15803d}.iban-live-status.invalid{color:var(--color-destructive)}
  .status-dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .iban-disclaimer{margin:0;padding:9px 11px;border-left:3px solid color-mix(in srgb,var(--color-primary) 60%,transparent);border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:color-mix(in srgb,var(--color-primary) 6%,var(--color-background));line-height:1.5}
  .iban-page>.dbx-btn--primary{min-height:40px;margin-top:2px;font-weight:650}
  .iban-page>[role="status"]{margin:4px 0 0;color:var(--color-muted-foreground)}
  .iban-result{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:var(--radius-lg);box-shadow:0 2px 8px rgb(0 0 0 / .04)}
  .iban-result.valid{border-color:color-mix(in srgb,#16a34a 45%,var(--color-border));background:color-mix(in srgb,#16a34a 4%,var(--color-card))}
  .iban-result.invalid{border-color:color-mix(in srgb,var(--color-destructive) 45%,var(--color-border));background:color-mix(in srgb,var(--color-destructive) 4%,var(--color-card))}
  .result-heading{display:flex;align-items:center;gap:10px}
  .result-heading strong{display:block;font-size:16px;line-height:1.3}
  .status-icon{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:color-mix(in srgb,#16a34a 14%,transparent);color:#15803d;font-weight:800}
  .invalid .status-icon{background:color-mix(in srgb,var(--color-destructive) 12%,transparent);color:var(--color-destructive)}
  .formatted-iban{display:block;padding:11px 12px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--color-muted) 70%,var(--color-card));font:600 14px/1.5 var(--font-mono);letter-spacing:.04em;overflow-wrap:anywhere}
  .iban-result dl{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
  .iban-result dl>div{padding:9px 10px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--color-muted) 55%,var(--color-card))}
  .iban-result dt{color:var(--color-muted-foreground);font-size:11px}
  .iban-result dd{margin-top:4px;font:600 13px var(--font-mono)}
  .iban-result dd small{font:400 11px var(--font-sans);color:var(--color-muted-foreground)}
  @media(max-width:560px){.iban-result dl{grid-template-columns:1fr}.iban-page{padding:12px}.iban-page .iban-input-label textarea{min-height:96px}}
</style>
