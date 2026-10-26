<script>
  import { onDestroy, untrack } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import { validateIban } from "./securityExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
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
  let rawOpen = $state(untrack(() => toolId !== "iban" && toolId !== "password-strength"));
  const signature = $derived(resultSignature([toolId, input, auxiliary, passphrase, mode, cost, count, language]));
  const stale = $derived(!!output && !resultIsCurrent(output, executed, signature));
  onDestroy(() => {
    disposed = true;
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
    mode = toolId === "bip39" ? "verify" : "generate";
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
    example();
  });
</script>

<div class="expansion-page">
  {#if toolId === "bcrypt" || toolId === "bip39"}<label
      >{t("模式", "Mode")}<Select bind:value={mode} ariaLabel={t("模式", "Mode")} options={[{value:"generate",label:t("生成", "Generate")},{value:"verify",label:t("校验", "Validate")},...(toolId === "bip39" ? [{value:"seed",label:t("派生种子", "Derive seed")}] : [])]} /></label
    >{/if}
  <label
    >{toolId === "iban"
      ? "IBAN"
      : toolId === "bip39"
        ? t("助记词", "Mnemonic")
        : t(
            "密码",
            "Password",
          )}{#if toolId === "bip39" || toolId === "iban"}<textarea
        class="dbx-textarea"
        bind:value={input}
        maxlength="4096"
        rows="4"></textarea>{:else}<input
        class="dbx-input"
        type="password"
        autocomplete="new-password"
        bind:value={input}
        maxlength="256"
      />{/if}</label
  >
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
  {#if toolId === "iban"}<p>
      {t(
        "仅校验格式和校验和，不验证账号存在或归属。",
        "Checks syntax and checksum only, not account existence or ownership.",
      )}
    </p>{/if}
  <button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy}
    >{busy ? t("处理中…", "Working…") : t("执行", "Run")}</button
  >{#if error}<p role="alert">{error}</p>{/if}{#if output}
    <p role="status">{stale ? t("结果已过期，请重新执行后复制。", "Result is outdated. Run again before copying.") : t("结果与当前参数一致", "Result matches the current parameters")}</p>
    {#if toolId === "iban" && resultData}
      <section class="result-summary"><strong>{resultData.valid ? t("IBAN 有效", "Valid IBAN") : t("IBAN 无效", "Invalid IBAN")}</strong>
      <dl><dt>{t("国家代码", "Country code")}</dt><dd>{resultData.country}</dd><dt>{t("长度 / 预期长度", "Length / expected length")}</dt><dd>{resultData.iban.length} / {resultData.expectedLength}</dd><dt>{t("校验和", "Checksum")}</dt><dd>{resultData.checksumValid ? t("通过", "Passed") : t("未通过", "Failed")}</dd></dl></section>
    {:else if toolId === "password-strength" && resultData}
      <section class="result-summary"><strong>{[t("非常弱", "Very weak"),t("弱", "Weak"),t("一般", "Fair"),t("强", "Strong"),t("很强", "Very strong")][resultData.score]} · {resultData.score}/4</strong>
      <p>{t("估算猜测次数", "Estimated guesses")}: {resultData.guesses}</p>
      <p>{t("建议使用更长且独一无二的密码，避免常见词、重复字符和个人信息。", "Use a longer, unique password. Avoid common words, repeated characters and personal information.")}</p>
      {#if locale === "en"}{#if resultData.feedback?.warning}<p>{resultData.feedback.warning}</p>{/if}
      {#each resultData.feedback?.suggestions || [] as suggestion}<p>{suggestion}</p>{/each}{/if}</section>
    {/if}
    <details bind:open={rawOpen}><summary>{t("原始结果", "Raw result")}</summary><textarea
      class="dbx-textarea"
      readonly
      value={output}
      rows="8"></textarea><CopyButton {locale} text={output} disabled={stale} /></details>{/if}
</div>

<style>.result-summary{padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card)}dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}dd{margin:0;overflow-wrap:anywhere}summary{cursor:pointer;margin-bottom:8px}</style>
