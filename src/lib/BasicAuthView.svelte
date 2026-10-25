<script>
  import { pick, localizeError } from "./i18n.js";
  import { basicAuth } from "./developerExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let username = $state(""),
    password = $state(""),
    output = $state(""),
    error = $state("");
  function generate() {
    output = "";
    error = "";
    try {
      output = basicAuth(username, password);
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
  function loadDemo() {
    username = "Aladdin";
    password = "open sesame";
    output = "";
    error = "";
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    loadDemo();
  });
</script>

<div class="expansion-page">
  <label
    >{t("用户名", "Username")}<input
      class="dbx-input"
      autocomplete="off"
      maxlength="4096"
      bind:value={username}
      oninput={() => (output = "")}
    /></label
  >
  <label
    >{t("密码", "Password")}<input
      class="dbx-input"
      type="password"
      autocomplete="new-password"
      maxlength="4096"
      bind:value={password}
      oninput={() => (output = "")}
    /></label
  >
  <p>
    {t(
      "UTF-8 编码；Basic Auth 是编码，不提供加密保护。",
      "UTF-8 encoding; Basic Auth encodes credentials and does not encrypt them.",
    )}
  </p>
  <button class="dbx-btn dbx-btn--primary" onclick={generate}
    >{t("生成认证头", "Generate header")}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
  {#if output}<textarea class="dbx-textarea" readonly value={output}
    ></textarea><CopyButton {locale} text={output} />{/if}
</div>
