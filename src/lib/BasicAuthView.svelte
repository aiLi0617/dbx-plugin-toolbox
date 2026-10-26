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
  let showPassword = $state(false);
  function invalidate() {
    output = "";
    error = "";
  }
  function clear() {
    username = "";
    password = "";
    showPassword = false;
    invalidate();
  }
  function generate() {
    output = "";
    error = "";
    try {
      output = basicAuth(username, password);
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
  function generateOnEnter(event) {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    generate();
  }
  function loadDemo() {
    username = "Aladdin";
    password = "open sesame";
    showPassword = false;
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

<div class="auth-page">
  <div class="auth-workspace">
    <section class="panel credentials">
      <div class="panel-heading">
        <div><h2>{t("认证凭据", "Credentials")}</h2><p>{t("输入用户名和密码，生成 HTTP Basic 认证头。", "Enter a username and password to generate an HTTP Basic header.")}</p></div>
        <span class="badge">UTF-8</span>
      </div>
      <label for="basic-username">{t("用户名", "Username")}</label>
      <input id="basic-username" class="dbx-input" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="4096" bind:value={username} oninput={invalidate} onkeydown={generateOnEnter} placeholder={t("输入用户名", "Enter username")} aria-describedby="username-hint" />
      <small id="username-hint">{t("用户名不能包含冒号（:）", "The username cannot contain a colon (:)")}</small>
      <label for="basic-password">{t("密码", "Password")}</label>
      <div class="password-field">
        <input id="basic-password" class="dbx-input" type={showPassword ? "text" : "password"} autocomplete="new-password" spellcheck="false" maxlength="4096" bind:value={password} oninput={invalidate} onkeydown={generateOnEnter} placeholder={t("输入密码", "Enter password")} />
        <button class="visibility" type="button" onclick={() => (showPassword = !showPassword)} aria-pressed={showPassword} aria-label={t("显示密码", "Show password")} title={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{#if showPassword}<path d="m3 3 18 18"/>{/if}</svg>
        </button>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button class="dbx-btn dbx-btn--primary generate" type="button" onclick={generate}>{t("生成认证头", "Generate header")}</button>
        <button class="dbx-btn" type="button" onclick={clear} disabled={!username && !password && !output && !error}>{t("清空", "Clear")}</button>
      </div>
    </section>

    <section class="panel result" aria-labelledby="basic-result-title">
      <div class="panel-heading">
        <div><h2 id="basic-result-title">{t("认证头", "Authorization header")}</h2><p>{t("复制后用于 HTTP 请求的 Authorization 字段。", "Copy this header into your HTTP request.")}</p></div>
        <div class="copy-action"><CopyButton {locale} text={output} labelZh="复制认证头" labelEn="Copy authorization header" /></div>
      </div>
      {#if output}
        <div class="code-area"><span class="code-label">HTTP</span><textarea class="header-output" aria-label={t("认证头", "Authorization header")} readonly value={output} spellcheck="false" onfocus={(event) => event.currentTarget.select()} onclick={(event) => { const field = event.currentTarget; if (field.selectionStart === field.selectionEnd) field.select(); }}></textarea></div>
      {:else}
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">&lt;/&gt;</span>
          <strong>{t("等待生成认证头", "Ready to generate")}</strong>
          <p>{t("填写左侧凭据后，点击「生成认证头」。", "Enter your credentials, then select Generate header.")}</p>
        </div>
      {/if}
      <div class="result-footer"><span class:ready={Boolean(output)} class="status-dot"></span><span role="status">{output ? t("已生成，可复制使用", "Generated and ready to copy") : t("生成结果将在此处显示", "Your generated header will appear here")}</span><code>Basic + Base64</code></div>
    </section>
  </div>
  <aside class="security-note">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/><path d="M12 8v5m0 3h.01"/></svg>
    <p>{t("Basic Auth 仅对凭据进行 Base64 编码，不提供加密保护。请通过 HTTPS 传输，避免泄露认证头。", "Basic Auth only Base64-encodes credentials; it does not encrypt them. Use HTTPS and keep the header private.")}</p>
  </aside>
</div>

<style>
  .auth-page { width:100%; max-width:1100px; min-height:0; margin:0 auto; padding:20px 16px; overflow:auto; }
  .auth-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.15fr); gap:18px; }
  .panel { min-width:0; margin:0; border:1px solid var(--color-border); border-radius:var(--radius-lg,10px); background:var(--color-card); padding:22px; }
  .panel-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:24px; }
  h2 { margin:0; font-size:15px; font-weight:600; line-height:1.5; }
  p { margin:6px 0 0; color:var(--color-muted-foreground); font-size:12px; line-height:1.7; }
  .badge { padding:3px 7px; border:1px solid var(--color-border); border-radius:var(--radius-sm); color:var(--color-muted-foreground); font:10px var(--font-mono); white-space:nowrap; }
  label { display:block; margin-bottom:8px; font-size:12px; font-weight:500; }
  .dbx-input { width:100%; height:38px; }
  small { display:block; margin:7px 0 20px; color:var(--color-muted-foreground); font-size:11px; }
  .password-field { position:relative; }
  .password-field input { padding-right:44px; }
  .visibility { position:absolute; top:1px; right:1px; display:grid; place-items:center; width:38px; height:36px; border:0; border-radius:var(--radius-md); background:transparent; color:var(--color-muted-foreground); cursor:pointer; }
  .visibility:hover { background:var(--color-accent); color:var(--color-foreground); }
  .visibility:focus-visible { outline:2px solid var(--color-ring); outline-offset:-3px; }
  .actions { display:flex; gap:10px; margin-top:24px; }
  .actions .dbx-btn { height:36px; }
  .generate { flex:1; }
  .error { color:var(--color-destructive); overflow-wrap:anywhere; }
  .result { display:flex; flex-direction:column; }
  .copy-action { flex-shrink:0; border:1px solid var(--color-border); border-radius:var(--radius-md); }
  .code-area { display:flex; flex-direction:column; flex:1; min-height:180px; border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-muted); overflow:hidden; }
  .code-area:focus-within { border-color:var(--color-ring); box-shadow:var(--dbx-focus-ring); }
  .code-label { padding:12px 14px 0; color:var(--color-muted-foreground); font:10px var(--font-mono); letter-spacing:.08em; }
  .header-output { display:block; flex:1; width:100%; min-height:140px; resize:none; padding:14px; border:0; border-radius:0; background:transparent; color:var(--color-foreground); font:12px/1.9 var(--font-mono); overflow-wrap:anywhere; }
  .header-output:focus { outline:none; box-shadow:none; }
  .empty-state { display:flex; flex:1; min-height:180px; padding:20px; flex-direction:column; align-items:center; justify-content:center; border:1px dashed var(--color-border); border-radius:var(--radius-md); text-align:center; }
  .empty-icon { display:grid; place-items:center; width:40px; height:40px; margin-bottom:14px; border-radius:10px; background:var(--color-muted); color:var(--color-muted-foreground); font:16px var(--font-mono); }
  .empty-state strong { font-size:13px; font-weight:500; }
  .result-footer { display:flex; align-items:center; flex-wrap:wrap; gap:7px; margin-top:16px; color:var(--color-muted-foreground); font-size:11px; }
  .result-footer code { margin-left:auto; font-size:10px; }
  .status-dot { width:6px; height:6px; border-radius:50%; background:var(--color-muted-foreground); }
  .status-dot.ready { background:var(--color-success); }
  .security-note { display:flex; align-items:flex-start; gap:10px; padding:14px 16px; margin-top:16px; border-radius:var(--radius-md); background:var(--color-warning-bg); color:var(--color-warning); }
  .security-note svg { flex-shrink:0; margin-top:1px; }
  .security-note p { margin:0; color:inherit; font-size:11px; }
  @media(max-width:760px) { .auth-workspace { grid-template-columns:1fr; gap:14px; } .auth-page { padding:12px; } .panel { padding:18px; } .panel-heading { margin-bottom:20px; } }
</style>
