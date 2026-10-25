<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import { validateIban } from "./securityExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
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
  onDestroy(() => {
    disposed = true;
    input = "";
    auxiliary = "";
    passphrase = "";
    output = "";
  });
  async function run() {
    output = "";
    error = "";
    busy = true;
    try {
      let result;
      if (toolId === "iban") result = validateIban(input);
      else {
        const lib = await loadAssetModule("security-tools");
        if (disposed) return;
        if (toolId === "bcrypt")
          result =
            mode === "verify"
              ? await lib.bcryptVerify(input, auxiliary)
              : await lib.bcryptHash(input, Number(cost));
        else if (toolId === "password-strength")
          result = lib.passwordStrength(input);
        else if (mode === "generate") {
          result = lib.bip39Generate(Number(count), language);
          input = result;
        } else if (mode === "seed")
          result = await lib.bip39Seed(input, passphrase, language);
        else result = { valid: lib.bip39Validate(input, language) };
      }
      if (!disposed)
        output =
          typeof result === "string" ? result : JSON.stringify(result, null, 2);
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
      >{t("模式", "Mode")}<Select bind:value={mode} ariaLabel={t("模式", "Mode")} onchange={() => (output = "")} options={[{value:"generate",label:t("生成", "Generate")},{value:"verify",label:t("校验", "Validate")},...(toolId === "bip39" ? [{value:"seed",label:t("派生种子", "Derive seed")}] : [])]} /></label
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
  >{#if error}<p role="alert">{error}</p>{/if}{#if output}<textarea
      class="dbx-textarea"
      readonly
      value={output}
      rows="8"></textarea><CopyButton {locale} text={output} />{/if}
</div>
