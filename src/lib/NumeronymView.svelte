<script>
  import { pick } from "./i18n.js";
  import { numeronym } from "./tools/text.js";
  import CopyButton from "./CopyButton.svelte";
  import { themedTooltip as tooltip } from "./themedTooltip.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const examples = ["internationalization", "accessibility", "kubernetes", "localization"];
  let input = $state("");
  let appliedDemoRequest = 0;
  const output = $derived(numeronym(input));
  const words = $derived(input.match(/\b[A-Za-z]{4,}\b/g) || []);
  const saved = $derived(input.length - output.length);
  const entries = $derived([...new Set(words)].slice(0, 100));

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = examples.slice(0, 3).join(" ");
  });
</script>

<div class="numeronym-tool">
  <header class="intro">
    <div><h1>{t("数字缩写", "Numeronym")}</h1><p>{t("保留单词首尾字母，用数字替换中间字母。输入即转换。", "Keep the first and last letters and replace the letters between them with a number. Converts as you type.")}</p></div>
    <span class="live-badge"><span aria-hidden="true"></span>{t("实时转换", "Live conversion")}</span>
  </header>

  <div class="examples" role="group" aria-label={t("常用示例", "Common examples")}>
    <span>{t("试一试", "Try it")}</span>
    {#each examples as word}
      <button type="button" class="example" onclick={() => (input = word)} title={word}><span>{word}</span><span aria-hidden="true">→</span><code>{numeronym(word)}</code></button>
    {/each}
  </div>

  <div class="workspace">
    <section class="panel">
      <header class="panel-head"><label for="numeronym-input">{t("原始文本", "Source text")}</label><button type="button" class="dbx-btn dbx-btn--ghost clear" aria-label={t("清空", "Clear")} use:tooltip={t("清空", "Clear")} disabled={!input} onclick={() => (input = "")}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button></header>
      <textarea id="numeronym-input" class="text-area" bind:value={input} maxlength="100000" spellcheck="false" placeholder={t("输入或粘贴英文单词、句子，支持多行文本…", "Type or paste English words, sentences, or multiple lines…")} aria-describedby="numeronym-rule"></textarea>
      <footer class="panel-foot"><span>{input.length.toLocaleString()} / 100,000 {t("字符", "characters")}</span><span>{t("保留格式与大小写", "Preserves formatting and case")}</span></footer>
    </section>

    <section class="panel result">
      <header class="panel-head"><label for="numeronym-output">{t("转换结果", "Converted text")}</label><div class="copy"><span>{t("复制结果", "Copy result")}</span><CopyButton {locale} text={output} labelZh="复制结果" labelEn="Copy result" /></div></header>
      <textarea id="numeronym-output" class="text-area" value={output} readonly spellcheck="false" placeholder={t("转换结果将在这里实时显示", "Your converted text appears here as you type")}></textarea>
      <footer class="panel-foot"><span>{output.length.toLocaleString()} {t("字符", "characters")}</span><span class="saving">{t("减少", "Saved")} {saved.toLocaleString()} {t("字符", "characters")}{#if input.length} · {Math.round(saved / input.length * 100)}%{/if}</span></footer>
    </section>
  </div>

  <div class="status" role="status" aria-live="polite">{#if !input}{t("输入文本或点击上方示例开始转换。", "Enter text or choose an example above to start.")}{:else if words.length}{t("已缩写", "Abbreviated")} {words.length.toLocaleString()} {t("个单词", "words")}{:else}{t("没有可缩写的单词，原文已保留。", "No eligible words found. The original text is preserved.")}{/if}</div>

  {#if entries.length}
    <details class="word-details" open>
      <summary>{t("逐词对照", "Word breakdown")}<span>{entries.length}{#if new Set(words).size > 100} / {new Set(words).size}{/if}</span></summary>
      <div class="word-list">
        {#each entries as word}<div class="word-row"><span>{word}</span><span class="arrow" aria-hidden="true">→</span><code>{numeronym(word)}</code></div>{/each}
      </div>
      {#if new Set(words).size > 100}<p class="limit-note">{t("仅展示前 100 个不同单词；上方结果包含全部转换。", "Showing the first 100 unique words; the result above contains all conversions.")}</p>{/if}
    </details>
  {/if}

  <p class="rule" id="numeronym-rule"><span class="rule-icon" aria-hidden="true">i</span><span>{t("转换规则：仅缩写 4 个及以上字母的英文单词。短词、数字、标点和换行保持不变；此转换不能还原原词。", "Only English words with 4 or more letters are abbreviated. Short words, numbers, punctuation, and line breaks stay unchanged. The original word cannot be recovered from its abbreviation.")}</span></p>
</div>

<style>
  .numeronym-tool{width:100%;min-width:0;color:var(--color-foreground);container-type:inline-size}
  .intro{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px}
  h1{font-size:21px;font-weight:650;line-height:1.4;margin:0 0 6px}
  .intro p{margin:0;line-height:1.8;max-width:650px}
  .live-badge{display:inline-flex;align-items:center;gap:7px;flex-shrink:0;font-size:11px;color:var(--color-muted-foreground);border:1px solid var(--color-border);border-radius:20px;padding:6px 10px;margin-top:3px}
  .live-badge>span{width:6px;height:6px;border-radius:50%;background:var(--color-primary)}
  .examples{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:20px}
  .examples>span{font-size:12px;color:var(--color-muted-foreground);margin-right:2px}
  .example{display:inline-flex;align-items:center;gap:8px;min-height:30px;padding:5px 10px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card);color:var(--color-muted-foreground);font-size:11px;cursor:pointer}
  .example code{color:var(--color-primary);font-weight:600}
  .example:hover{background:var(--color-accent);border-color:var(--color-primary)}
  .example:focus-visible,.text-area:focus-visible,summary:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
  .panel{min-width:0;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card)}
  .panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid var(--color-border);min-height:51px}
  .panel-head label{font-size:13px;font-weight:600}
  .clear{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;flex-shrink:0}
  .copy{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-muted-foreground)}
  .text-area{display:block;width:100%;min-height:230px;padding:16px;border:0;border-radius:0;resize:vertical;background:transparent;color:var(--color-foreground);font:13px/1.9 var(--font-mono);overflow-wrap:anywhere}
  .text-area::placeholder{color:var(--color-muted-foreground);font-size:12px}
  .text-area:focus{outline-offset:-2px}
  .result .text-area{background:var(--color-muted)}
  .panel-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px;padding:10px 14px;border-top:1px solid var(--color-border);font-size:11px;color:var(--color-muted-foreground)}
  .saving{color:var(--color-primary)}
  .status{font-size:12px;color:var(--color-muted-foreground);margin:12px 0 20px;min-height:18px}
  .word-details{border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden}
  summary{padding:12px 14px;font-size:12px;font-weight:600;cursor:pointer;background:var(--color-card)}
  summary>span{margin-left:8px;color:var(--color-muted-foreground);font-weight:400}
  .word-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;padding:0 14px 8px;max-height:240px;overflow:auto;border-top:1px solid var(--color-border)}
  .word-row{display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(40px,.35fr);align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--color-border);font:12px/1.6 var(--font-mono)}
  .word-row>span:first-child,.word-row code{overflow-wrap:anywhere}
  .arrow{color:var(--color-muted-foreground)}
  .word-row code{color:var(--color-primary);font-weight:600}
  .rule{display:flex;gap:9px;align-items:flex-start;line-height:1.8;margin:18px 0 0}
  .rule-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:15px;height:15px;border:1px solid var(--color-border);border-radius:50%;font-size:10px;margin-top:3px}
  .limit-note{padding:0 14px}
  @container (max-width:680px){.workspace{grid-template-columns:1fr}.text-area{min-height:170px}.word-list{grid-template-columns:1fr}.intro{flex-direction:column;gap:10px}.example>span:first-child{display:none}}
</style>
