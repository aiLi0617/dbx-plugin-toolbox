<script>
  import { pick } from "./i18n.js";
  import Select from "./Select.svelte";
  import CopyButton from "./CopyButton.svelte";
  let {
    locale = "zh-CN", input = $bindable(""), passphrase = $bindable(""),
    mode = $bindable("generate"), count = $bindable(12), language = $bindable("en"),
    output = "", error = "", busy = false, stale = false, resultData = null,
    resultMode = "", run, clear,
  } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const modes = $derived([
    { value: "generate", label: t("生成", "Generate") },
    { value: "verify", label: t("校验", "Validate") },
    { value: "seed", label: t("派生种子", "Derive seed") },
  ]);
  const inputCount = $derived(input.trim() ? input.trim().split(/\s+/u).length : 0);
  const words = $derived(output && resultMode === "generate" ? output.trim().split(/\s+/u) : []);
</script>

<div class="expansion-page bip39-page">
  <div class="mode-switch" role="group" aria-label={t("模式", "Mode")}>
    {#each modes as item}
      <button type="button" class:active={mode === item.value} aria-pressed={mode === item.value} disabled={busy} onclick={() => mode = item.value}>{item.label}</button>
    {/each}
  </div>
  <section class="settings">
    <div class="parameter-row">
      <label><span>{t("词表", "Wordlist")}</span><Select bind:value={language} disabled={busy} ariaLabel={t("词表", "Wordlist")} options={[{value:"en",label:"English"},{value:"zh",label:"简体中文"}]} /></label>
      {#if mode === "generate"}
        <label><span>{t("单词数量", "Word count")}</span><Select bind:value={count} disabled={busy} ariaLabel={t("单词数量", "Word count")} options={[12,15,18,21,24].map(value => ({value,label:String(value)}))} /></label>
      {/if}
    </div>
    {#if mode !== "generate"}
      <label class="mnemonic-input">
        <span class="field-heading"><span>{t("助记词", "Mnemonic")}</span><span class="count">{inputCount} {t("个单词", "words")}</span></span>
        <textarea class="dbx-textarea" bind:value={input} rows="4" maxlength="4096" spellcheck="false" autocomplete="off" autocapitalize="off" disabled={busy} placeholder={t("输入助记词，以空格分隔", "Enter mnemonic words separated by spaces")}></textarea>
      </label>
    {/if}
    {#if mode === "seed"}
      <label><span>{t("可选口令", "Optional passphrase")}</span><input class="dbx-input" type="password" bind:value={passphrase} autocomplete="new-password" maxlength="1024" disabled={busy} /></label>
    {/if}
    <div class="actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy || (mode !== "generate" && !input.trim())}>
        {busy ? t("处理中…", "Working…") : mode === "generate" ? t("生成助记词", "Generate mnemonic") : mode === "verify" ? t("校验助记词", "Validate mnemonic") : t("派生种子", "Derive seed")}
      </button>
      <button class="dbx-btn dbx-btn--ghost" onclick={clear} disabled={busy || (!input && !passphrase && !output && !error)}>{t("清空", "Clear")}</button>
    </div>
  </section>
  <aside class="security-note">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"></path><path d="M12 8v5m0 3h.01"></path></svg>
    <p>{t("助记词和种子具有资产控制权，请只在可信环境中处理。离开页面后清除。", "Mnemonics and seeds control assets. Use a trusted environment. Values are cleared when leaving this page.")}</p>
  </aside>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if output && resultMode === mode}
    <section class="result" class:outdated={stale}>
      <div class="result-header">
        <h3>{resultMode === "generate" ? t("助记词", "Mnemonic") : resultMode === "verify" ? t("校验结果", "Validation result") : t("种子", "Seed")}</h3>
        {#if resultMode === "generate"}<span class="badge">{words.length} {t("个单词", "words")}</span>{:else if resultMode === "seed"}<span class="badge">512 bit · HEX</span>{/if}
        {#if resultMode !== "verify"}<div class="copy-action"><span>{t("复制", "Copy")}</span><CopyButton {locale} text={output} disabled={stale} /></div>{/if}
      </div>
      <p class="result-status" class:warning={stale} role="status">{stale ? t("结果已过期，请重新执行后复制。", "Result is outdated. Run again before copying.") : t("结果与当前参数一致", "Result matches the current parameters")}</p>
      {#if resultMode === "generate"}
        <ol class="word-grid">{#each words as word, index}<li><span class="word-index">{String(index + 1).padStart(2, "0")}</span><span>{word}</span></li>{/each}</ol>
      {:else if resultMode === "verify"}
        <div class="validation" class:valid={resultData?.valid} class:invalid={!resultData?.valid}>
          <span class="validation-icon" aria-hidden="true">{resultData?.valid ? "✓" : "!"}</span>
          <strong>{resultData?.valid ? t("助记词有效", "Valid mnemonic") : t("助记词无效", "Invalid mnemonic")}</strong>
        </div>
      {:else}<pre class="seed-value">{output}</pre>{/if}
    </section>
  {/if}
</div>

<style>
  .bip39-page{max-width:900px;gap:20px;padding:28px 24px 32px}
  .mode-switch{display:flex;gap:4px;padding:4px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-muted)}
  .mode-switch button{flex:1;min-width:0;padding:10px 8px;border:1px solid transparent;border-radius:var(--radius-md);background:transparent;color:var(--color-muted-foreground);font:500 13px var(--font-sans);cursor:pointer}
  .mode-switch button:hover{color:var(--color-foreground)}
  .mode-switch button.active{background:var(--color-card);border-color:var(--color-border);color:var(--color-foreground);box-shadow:0 1px 3px rgb(0 0 0 / .05)}
  button:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  button:disabled{cursor:default;opacity:.55}
  .settings{display:flex;flex-direction:column;gap:20px}
  .parameter-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
  label{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:550;min-width:0}
  .field-heading{display:flex;justify-content:space-between;gap:12px}
  .count{font-size:11px;font-weight:400;color:var(--color-muted-foreground)}
  textarea{font:13px/1.8 var(--font-mono);resize:vertical}
  .mnemonic-input textarea{min-height:112px;padding:12px 14px}
  .mnemonic-input textarea::placeholder{font-family:var(--font-sans);color:var(--color-muted-foreground)}
  .actions{display:flex;align-items:center;gap:10px}
  .actions .dbx-btn--primary{min-height:38px;min-width:160px;padding:8px 22px;font-weight:600}
  .security-note{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:1px solid color-mix(in srgb,var(--color-warning) 22%,var(--color-border));border-radius:var(--radius-md);background:var(--color-warning-bg)}
  .security-note svg{flex-shrink:0;color:var(--color-warning);margin-top:1px}
  .security-note p{margin:0;font-size:12px;line-height:1.65;color:var(--color-muted-foreground)}
  .result{padding:20px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card)}
  .result.outdated{border-color:var(--color-warning)}
  .result-header{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  h3{font-size:14px;margin:0;font-weight:650}
  .badge{padding:3px 7px;border-radius:var(--radius-sm);background:var(--color-muted);color:var(--color-muted-foreground);font:11px var(--font-mono)}
  .copy-action{margin-left:auto;display:flex;align-items:center;gap:4px;font-size:11px;color:var(--color-muted-foreground)}
  .result-status{margin:8px 0 16px;font-size:11px;line-height:1.6;color:var(--color-muted-foreground)}
  .result-status.warning{color:var(--color-warning)}
  .word-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0;padding:0;list-style:none}
  .word-grid li{display:flex;align-items:baseline;gap:12px;min-width:0;padding:13px 12px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-background);font:500 13px/1.5 var(--font-mono);overflow-wrap:anywhere}
  .word-index{font-size:10px;font-weight:400;color:var(--color-muted-foreground);flex-shrink:0;user-select:none}
  .seed-value{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--color-muted);border-radius:var(--radius-md);font:13px/1.8 var(--font-mono)}
  .validation{display:flex;gap:10px;align-items:center;padding:14px;border-radius:var(--radius-md);font-size:14px}
  .validation.valid{color:var(--color-success);background:var(--color-success-bg)}
  .validation.invalid,.error{color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 8%,var(--color-background))}
  .validation-icon{font-size:18px;font-weight:700}
  .error{margin:0;padding:12px 14px;border-radius:var(--radius-md);font-size:12px}
  @media(max-width:680px){.word-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(max-width:480px){.bip39-page{padding:18px 12px;gap:16px}.parameter-row{grid-template-columns:1fr;gap:12px}.result{padding:14px}.word-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.word-grid li{padding:11px 9px;gap:8px}.actions .dbx-btn--primary{flex:1;min-width:0}}
</style>
