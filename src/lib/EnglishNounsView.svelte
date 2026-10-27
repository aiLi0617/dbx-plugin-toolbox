<script>
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import CopyButton from "./CopyButton.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let mode = $state("plural");
  let output = $state("");
  let busy = $state(false);
  let error = $state("");
  let changed = $state(0);
  let preview = $state([]);
  let appliedDemoRequest = 0;
  const words = $derived(input.match(/\b[A-Za-z]+\b/g) || []);

  function example() {
    input = mode === "plural"
      ? "child mouse person\ncity box leaf\nsheep fish species"
      : "children mice people\ncities boxes leaves\nsheep fish species";
  }
  function reverse() {
    if (!output || busy) return;
    input = output;
    mode = mode === "plural" ? "singular" : "plural";
  }

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    example();
  });

  $effect(() => {
    const text = input, singular = mode === "singular";
    let cancelled = false;
    output = "";
    error = "";
    changed = 0;
    preview = [];
    busy = Boolean(text.trim());
    const timer = setTimeout(async () => {
      if (!text.trim()) return;
      try {
        const { englishNouns } = await loadAssetModule("content-tools");
        if (cancelled) return;
        const source = text.match(/\b[A-Za-z]+\b/g) || [];
        const result = englishNouns(text, singular);
        const target = result.match(/\b[A-Za-z]+\b/g) || [];
        const seen = new Set();
        const rows = [];
        let count = 0;
        source.forEach((word, i) => {
          if (word !== target[i]) count++;
          if (word !== target[i] && rows.length < 8 && !seen.has(word)) {
            seen.add(word);
            rows.push({ source: word, target: target[i] });
          }
        });
        output = result;
        changed = count;
        preview = rows;
      } catch (e) {
        if (!cancelled) error = localizeError(locale, e);
      } finally {
        if (!cancelled) busy = false;
      }
    }, 160);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>

<div class="nouns-page">
  <div class="toolbar">
    <div class="mode-switch" role="group" aria-label={t("转换方向", "Direction")}>
      <button type="button" class:active={mode === "plural"} aria-pressed={mode === "plural"} onclick={() => (mode = "plural")}>{t("单数 → 复数", "Singular → Plural")}</button>
      <button type="button" class:active={mode === "singular"} aria-pressed={mode === "singular"} onclick={() => (mode = "singular")}>{t("复数 → 单数", "Plural → Singular")}</button>
    </div>
    <span class="live-tag"><i></i>{t("自动转换", "Auto convert")}</span>
  </div>

  <div class="workspace">
    <section class="panel" aria-labelledby="nouns-input-title">
      <header class="panel-heading"><h2 id="nouns-input-title">{t("输入", "Input")}</h2><button class="dbx-btn dbx-btn--ghost" type="button" disabled={!input} onclick={() => (input = "")}>{t("清空", "Clear")}</button></header>
      <textarea class="dbx-textarea editor" bind:value={input} maxlength="100000" spellcheck="false" aria-labelledby="nouns-input-title" aria-describedby="nouns-input-help" placeholder={mode === "plural" ? t("例如：child, mouse, city\nbox, leaf, sheep", "e.g. child, mouse, city\nbox, leaf, sheep") : t("例如：children, mice, cities\nboxes, leaves, sheep", "e.g. children, mice, cities\nboxes, leaves, sheep")}></textarea>
      <footer class="panel-footer"><span id="nouns-input-help">{t("支持空格、逗号或换行分隔", "Separate with spaces, commas or line breaks")}</span><span>{words.length} {t("个单词", "words")}</span></footer>
    </section>

    <section class="panel result-panel" aria-labelledby="nouns-output-title" aria-busy={busy}>
      <header class="panel-heading"><h2 id="nouns-output-title">{mode === "plural" ? t("复数结果", "Plural result") : t("单数结果", "Singular result")}</h2><div class="copy-action"><span>{t("复制", "Copy")}</span><CopyButton {locale} text={output} /></div></header>
      <div class="result-body">
        <textarea class="dbx-textarea editor" value={output} readonly spellcheck="false" aria-labelledby="nouns-output-title"></textarea>
        {#if !output}<div class="empty-state" role="status"><span class="empty-symbol" aria-hidden="true">Aa → Aa</span><strong>{busy ? t("正在转换…", "Converting…") : error ? t("转换失败", "Conversion failed") : t("转换结果将在这里显示", "Your result appears here")}</strong><p>{t("输入后自动转换", "Updates as you type")}</p></div>{/if}
      </div>
      <footer class="panel-footer"><span role="status">{busy ? t("正在转换…", "Converting…") : output ? `${changed} / ${words.length} ${t("个单词已变化", "words changed")}` : t("等待输入", "Waiting for input")}</span><button class="reverse" type="button" onclick={reverse} disabled={!output || busy}>{t("反向转换", "Reverse conversion")} <span aria-hidden="true">↔</span></button></footer>
    </section>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if preview.length}
    <div class="preview" aria-label={t("转换预览", "Conversion preview")}>
      <span class="preview-label">{t("变化预览", "Changes")}</span>
      {#each preview as row}<span class="word-pair"><code>{row.source}</code><span aria-hidden="true">→</span><code>{row.target}</code></span>{/each}
    </div>
  {/if}
  <details class="note">
    <summary><span aria-hidden="true">ⓘ</span>{t("处理规则", "How it works")}<svg class="note-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg></summary>
    <p>{t("保留原有大小写、标点和换行。逐词处理，不进行句子语法分析；建议输入名词列表。", "Preserves capitalization, punctuation and line breaks. Processes words individually without sentence grammar analysis; noun lists work best.")}</p>
  </details>
</div>

<style>
  .nouns-page{width:min(1180px,100%);margin:0 auto;padding:24px 28px;color:var(--color-foreground);container-type:inline-size}
  .live-tag{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;font-size:11px;color:var(--color-muted-foreground)}
  .live-tag i{width:6px;height:6px;background:var(--color-success);border-radius:50%}
  .toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
  .mode-switch{display:flex;padding:4px;gap:4px;border:1px solid var(--color-border);background:var(--color-muted);border-radius:var(--radius-lg)}
  .mode-switch button{border:1px solid transparent;background:transparent;color:var(--color-muted-foreground);padding:8px 18px;border-radius:var(--radius-md);font:inherit;font-size:12px;cursor:pointer}
  .mode-switch button.active{background:var(--color-card);color:var(--color-primary);border-color:var(--color-border);box-shadow:0 1px 3px rgb(0 0 0 / 5%)}
  .workspace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;min-height:clamp(420px,58vh,620px)}
  .panel{min-width:0;border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;background:var(--color-card);display:flex;flex-direction:column}
  .panel-heading{height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 16px;border-bottom:1px solid var(--color-border)}
  h2{margin:0;font-size:12px;font-weight:600;letter-spacing:.01em}
  .copy-action{display:flex;align-items:center;gap:6px;color:var(--color-muted-foreground);font-size:11px}
  .editor{display:block;width:100%;height:clamp(300px,52vh,560px);min-height:220px;resize:vertical;border:0!important;border-radius:0!important;background:transparent;padding:18px;font-family:var(--font-mono);font-size:14px;line-height:1.9;color:var(--color-foreground);box-shadow:none}
  .editor:focus-visible{outline:2px solid var(--color-ring);outline-offset:-2px}
  .editor::placeholder{color:var(--color-muted-foreground);opacity:.65}
  .result-body{position:relative;flex:1;display:flex}
  .result-body .editor{flex:1;resize:none;height:100%}
  .result-panel{background:color-mix(in srgb,var(--color-primary) 2%,var(--color-card))}
  .panel-footer{min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 16px;border-top:1px solid var(--color-border);font-size:11px;color:var(--color-muted-foreground)}
  .reverse{display:inline-flex;align-items:center;gap:6px;background:transparent;border:0;padding:0;font:inherit;color:var(--color-primary);cursor:pointer}
  .reverse:disabled{color:var(--color-muted-foreground);opacity:.5;cursor:default}
  .empty-state{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;pointer-events:none;color:var(--color-muted-foreground)}
  .empty-symbol{font-family:var(--font-mono);font-size:24px;opacity:.4}
  .empty-state strong{font-size:13px;font-weight:500}
  .empty-state p{font-size:12px;margin:0;line-height:1.6}
  .preview{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:18px}
  .preview-label{font-size:11px;color:var(--color-muted-foreground);margin-right:4px}
  .word-pair{display:inline-flex;align-items:center;gap:8px;padding:6px 9px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:11px;background:var(--color-card)}
  code{font-family:var(--font-mono);overflow-wrap:anywhere}
  .word-pair>span{color:var(--color-muted-foreground)}
  .word-pair code:last-of-type{color:var(--color-primary)}
  .note{margin-top:16px;color:var(--color-muted-foreground);font-size:12px;line-height:1.7}
  .note summary{display:inline-flex;align-items:center;gap:7px;cursor:pointer;list-style:none;user-select:none}
  .note summary::-webkit-details-marker{display:none}
  .note-chevron{width:13px;height:13px;margin-left:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(-90deg);transition:transform .15s ease}
  .note[open] .note-chevron{transform:rotate(0deg)}
  .note p{margin:8px 0 0 22px;max-width:760px}
  .error{font-size:12px;color:var(--color-destructive)}
  button:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  @container(max-width:720px){.workspace{grid-template-columns:1fr}.editor{height:240px}.result-body .editor{height:240px}.panel-footer{gap:8px}.mode-switch button{padding:8px 12px}}
  @media(max-width:600px){.nouns-page{padding:18px 14px}}
</style>
