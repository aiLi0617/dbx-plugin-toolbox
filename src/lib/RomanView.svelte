<script>
  import { pick } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import { convertRomanLines } from "./romanBatch.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let editor;
  let gutter;
  const lineNumbers = $derived(Array.from({ length: input.split(/\r\n?|\n/).length }, (_, index) => index + 1));
  const rows = $derived(convertRomanLines(input));
  const successes = $derived(rows.filter(row => !row.error));
  const failed = $derived(rows.length - successes.length);
  const output = $derived(successes.map(row => row.result).join("\n"));
  const symbols = [["I", 1], ["V", 5], ["X", 10], ["L", 50], ["C", 100], ["D", 500], ["M", 1000]];
  const subtractive = [["IV", 4], ["IX", 9], ["XL", 40], ["XC", 90], ["CD", 400], ["CM", 900]];
  function locateLine(line) {
    if (!editor) return;
    const lines = input.split("\n");
    const start = lines.slice(0, line - 1).reduce((offset, value) => offset + value.length + 1, 0);
    editor.focus();
    editor.setSelectionRange(start, start + lines[line - 1].length);
    editor.scrollTop = Math.max(0, (line - 2) * 28);
    if (gutter) gutter.scrollTop = editor.scrollTop;
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = "2026\nMMXXVI\n49\nix";
  });
</script>

<div class="roman-page">
  <div class="workspace">
    <section class="panel input-panel" aria-labelledby="roman-input-label">
      <div class="panel-head"><div class="panel-heading"><label id="roman-input-label" for="roman-input">{t("输入", "Input")}</label><span class="range">1–3999 / I–MMMCMXCIX</span></div>
        <div class="input-actions"><CopyButton {locale} text={input} /><button class="dbx-btn dbx-btn--ghost" type="button" data-replaces-content disabled={!input} title={t("清空", "Clear")} aria-label={t("清空", "Clear")} onclick={() => input = ""}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"></path></svg></button></div></div>
      <div class="editor-shell">
        <div class="line-numbers" bind:this={gutter} aria-hidden="true">{#each lineNumbers as number}<div>{number}</div>{/each}</div>
        <textarea id="roman-input" bind:this={editor} bind:value={input} onscroll={() => { if (gutter) gutter.scrollTop = editor.scrollTop; }} maxlength="10000" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-describedby="roman-input-hint" placeholder={'2026\nMMXXVI\n49\nix'}></textarea>
      </div>
      <div class="panel-foot" id="roman-input-hint">{t("整数与罗马数字双向转换，每行一项，自动识别。", "Convert integers and Roman numerals in either direction. One value per line, automatically detected.")}</div>
    </section>

    <section class="panel result-panel" aria-labelledby="roman-results-label">
      <div class="panel-head"><h2 id="roman-results-label">{t("转换结果", "Conversion results")}</h2>
        <div class="copy-action"><span>{t("复制成功结果", "Copy successful results")}</span><CopyButton {locale} text={output} labelZh="复制成功结果" labelEn="Copy successful results" /></div></div>
      <div class="results">
        {#if rows.length}
          <table><thead><tr><th class="line">{t("行", "Line")}</th><th>{t("输入", "Input")}</th><th>{t("转换结果", "Conversion results")}</th><th><span class="sr-only">{t("复制", "Copy")}</span></th></tr></thead>
            <tbody>{#each rows as row (row.line)}<tr class:invalid={row.error}>
              <td class="line"><button class="line-link" type="button" aria-label={`${t("行", "Line")} ${row.line}`} onclick={() => locateLine(row.line)}>{row.line}</button></td><td><code>{row.input}</code></td>
              <td>{#if row.error}<span class="error">{row.error === "range" ? t("请输入 1–3999 的整数", "Enter an integer from 1 to 3999") : t("无效的罗马数字，请使用标准写法（如 IV、IX）", "Invalid Roman numeral. Use standard notation, e.g. IV or IX.")}</span>{:else}<code class="value">{row.result}</code>{/if}</td>
              <td>{#if !row.error}<CopyButton {locale} text={row.result} />{/if}</td>
            </tr>{/each}</tbody>
          </table>
        {:else}
          <div class="empty"><span class="empty-symbol" aria-hidden="true">XIV <span>⇄</span> 14</span><strong>{t("等待输入", "Waiting for input")}</strong><p>{t("输入数字或罗马数字，即时查看转换结果。", "Enter a number or Roman numeral to see the result instantly.")}</p><div class="examples" aria-label={t("示例", "Example")}>{#each ["2026", "MMXXVI", "49", "ix"] as sample}<button class="dbx-btn example" type="button" data-replaces-content onclick={() => input = sample}>{sample}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"></path></svg></button>{/each}</div></div>
        {/if}
      </div>
      <div class="panel-foot status" role="status" aria-live="polite"><span class:has-results={successes.length > 0}><i aria-hidden="true"></i>{t("转换成功", "Converted")}: {successes.length}</span><span class:has-errors={failed > 0}><i aria-hidden="true"></i>{t("无效输入", "Invalid inputs")}: {failed}</span></div>
    </section>
  </div>

  <section class="reference" aria-labelledby="roman-reference-label">
    <h2 id="roman-reference-label">{t("符号速查", "Symbol reference")}</h2>
    <div class="symbols">{#each symbols as [symbol, value]}<div><code>{symbol}</code><span>{value}</span></div>{/each}</div>
    <div class="subtractive" aria-label={t("示例", "Example")}>{#each subtractive as [symbol, value]}<span><code>{symbol}</code><span>=</span>{value}</span>{/each}</div>
    <p>{t("支持混合输入与小写字母，自动忽略空行。", "Mix numbers and lowercase numerals; blank lines are ignored.")}</p>
  </section>
</div>

<style>
  .roman-page{display:flex;flex-direction:column;gap:12px;width:100%;margin:0 auto;padding:16px;overflow:auto;min-width:0;min-height:0;flex:1;container-type:inline-size}
  p{font-size:12px;line-height:1.7;color:var(--color-muted-foreground);margin:0}
  .panel-heading{display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;min-width:0}
  .range{font:10px var(--font-mono);color:var(--color-muted-foreground)}
  .workspace{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;flex:1;min-height:360px;border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden}
  .panel{display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background:var(--color-background)}
  .input-panel{border-right:1px solid var(--color-border)}
  .panel-head{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:44px;padding:7px 12px;border-bottom:1px solid var(--color-border);flex-shrink:0}
  h2,label{font-size:13px;font-weight:600;margin:0}.copy-action{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--color-muted-foreground)}
  .input-actions{display:flex;align-items:center;gap:4px}.input-actions>.dbx-btn{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;min-height:30px;padding:0}
  .editor-shell{display:flex;flex:1;min-height:260px;height:260px;overflow:hidden}.editor-shell:has(textarea:focus-visible){box-shadow:inset 0 0 0 1px var(--color-ring)}
  .line-numbers{flex:0 0 44px;padding:16px 8px;overflow:hidden;scrollbar-width:none;text-align:right;color:var(--color-muted-foreground);background:color-mix(in srgb,var(--color-muted) 45%,transparent);border-right:1px solid var(--color-border);font:11px/28px var(--font-mono);user-select:none}.line-numbers>div{height:28px}
  textarea{width:100%;min-width:0;flex:1;min-height:0;border:0;resize:none;background:transparent;color:var(--color-foreground);padding:16px 12px;font:14px/28px var(--font-mono);border-radius:0;outline:none;white-space:pre;overflow:auto}
  textarea::placeholder{color:var(--color-muted-foreground);opacity:.55}
  .panel-foot{min-height:38px;padding:10px 12px;border-top:1px solid var(--color-border);font-size:11px;color:var(--color-muted-foreground);line-height:1.5;flex-shrink:0}
  .results{height:260px;flex:1;overflow:auto}.status{display:flex;gap:18px;flex-wrap:wrap}.has-errors,.error{color:var(--color-destructive)}
  .status>span{display:inline-flex;align-items:center;gap:6px}.status i{width:5px;height:5px;background:currentColor;border-radius:50%}.has-results{color:var(--color-success)}
  .line-link{font:inherit;color:inherit;border:0;background:transparent;padding:4px;cursor:pointer;border-radius:var(--radius-sm)}.line-link:hover{background:var(--color-accent);color:var(--color-foreground)}button:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  table{border-collapse:collapse;width:100%;table-layout:fixed;text-align:left;font-size:13px}th{font-size:11px;font-weight:500;color:var(--color-muted-foreground);background:var(--color-muted);position:sticky;top:0;z-index:1}th,td{padding:10px 12px;border-bottom:1px solid var(--color-border);overflow-wrap:anywhere}th:last-child{width:46px}td:last-child{padding:6px}.line{width:44px;color:var(--color-muted-foreground);font:11px var(--font-mono)}code{font-family:var(--font-mono)}.value{font-weight:600}.error{font-size:12px;line-height:1.6}.invalid{background:color-mix(in srgb,var(--color-destructive) 4%,transparent)}
  .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;height:100%;min-height:260px;padding:24px}.empty strong{font-size:13px;font-weight:500}.empty-symbol{font:26px var(--font-mono);color:var(--color-muted-foreground);margin-bottom:4px}.empty-symbol span{font-size:20px;padding:0 8px;opacity:.5}
  .examples{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:4px}.example{gap:12px;padding:6px 10px;font:11px var(--font-mono)}.example svg{flex-shrink:0;color:var(--color-muted-foreground)}
  .reference{padding:14px 16px;border:1px solid var(--color-border);border-radius:var(--radius-lg);flex-shrink:0}.reference h2{font-size:12px;color:var(--color-muted-foreground)}.symbols{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:12px 0}.symbols>div{display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 6px;background:var(--color-muted);border-radius:var(--radius-md)}.symbols code{font-size:15px;font-weight:600}.symbols span{font:11px var(--font-mono);color:var(--color-muted-foreground)}.reference p{font-size:11px}
  .subtractive{display:flex;flex-wrap:wrap;gap:8px 24px;padding:0 0 12px;margin-bottom:10px;border-bottom:1px solid var(--color-border);font:11px var(--font-mono);color:var(--color-muted-foreground)}.subtractive>span{display:inline-flex;align-items:center;gap:8px}.subtractive code{color:var(--color-foreground)}
  @container(max-width:760px){.workspace{grid-template-columns:1fr;flex:none}.symbols>div{flex-direction:column;gap:6px}.panel{min-height:340px}.input-panel{border-right:0;border-bottom:1px solid var(--color-border)}}
  @container(max-width:420px){.panel-heading{gap:4px}.range{font-size:9px}.copy-action>span{display:none}.symbols{gap:4px}.symbols>div{padding:8px 2px}.subtractive{gap:8px 16px}.panel-foot{min-height:44px}}
  @media(max-width:600px){.roman-page{padding:12px;gap:12px}.reference{padding:12px}}
</style>
