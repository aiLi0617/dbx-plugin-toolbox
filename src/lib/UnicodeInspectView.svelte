<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { analyzeUnicode, inspectUnicodeRows } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const rows = $derived(inspectUnicodeRows(input));
  const analysis = $derived(analyzeUnicode(input));
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("文本", "Text")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" bind:value={input} placeholder={t("粘贴要检查的字符", "Paste characters to inspect")}></textarea>
  </label>

  {#if rows.length}
    <div class="summary">
      <span>{t("码位", "Code points")} <b>{analysis.codePoints}</b></span><span>{t("字素簇", "Graphemes")} <b>{analysis.graphemes}</b></span><span>UTF-8 <b>{analysis.utf8Bytes} B</b></span><span>{t("脚本", "Scripts")} <b>{analysis.scripts.join(" / ") || "Common"}</b></span>
    </div>
    {#if analysis.mixedScripts || analysis.risks.length}<div class="warning">{analysis.mixedScripts?t("检测到混合脚本字符；请检查疑似仿冒文本。","Mixed scripts detected; review the text for possible spoofing."):""} {analysis.risks.length?t(`发现 ${analysis.risks.length} 个不可见、Bidi 或控制字符。`,`Found ${analysis.risks.length} invisible, bidi, or control characters.`):""}</div>{/if}
    <div class="normalization">{#each Object.entries(analysis.normalization) as [form, value]}<div><b>{form}</b><code>{value}</code><CopyButton {locale} text={value} labelZh="复制" labelEn="Copy" /></div>{/each}</div>
    <div class="table-wrap">
      <table class="dbx-table">
        <thead>
          <tr>
            <th>{t("字符", "Char")}</th>
            <th>Unicode</th>
            <th>{t("十进制", "Decimal")}</th>
            <th>UTF-8</th>
            <th>{t("字素簇 / 脚本", "Cluster / script")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (i)}
            <tr>
              <td class="glyph">{row.char}</td>
              <td class="mono">{row.hex}</td>
              <td class="mono">{row.dec}</td>
              <td class="mono">{row.utf8}</td>
              <td><span class:risky={row.risk}>{row.cluster} · {row.script}{row.risk?` · ${row.risk}`:""}</span></td>
              <td class="copy">
                <CopyButton {locale} text={row.hex} labelZh="复制码位" labelEn="Copy code point" />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <p class="dbx-hint">{t("输入后会列出每个字符的码位。", "Each character’s code point will appear here.")}</p>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    flex-direction: column;
    gap: 12px;
    max-width: 980px;
    width: 100%;
    overflow: hidden;
  }
  .block {
    display: flex;
    flex-direction: column;
    flex: 0 0 auto;
    gap: 6px;
  }
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .area {
    min-height: 72px;
    max-height: 160px;
    resize: vertical;
  }
  .table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .table-wrap :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-background, Canvas);
  }
  .glyph {
    font-size: 16px;
    width: 3rem;
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .copy {
    width: 36px;
    text-align: right;
  }
  .summary{display:flex;flex-wrap:wrap;gap:8px}.summary span{padding:6px 9px;border-radius:7px;background:var(--color-muted);font-size:12px}.warning{padding:9px 11px;border-radius:8px;background:var(--color-warning-bg);color:var(--color-warning);font-size:12px}.normalization{display:grid;grid-template-columns:1fr 1fr;gap:6px}.normalization>div{display:grid;grid-template-columns:48px minmax(0,1fr) 30px;align-items:center;gap:7px;padding:6px 8px;border:1px solid var(--color-border);border-radius:7px}.normalization code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.risky{color:var(--color-warning);font-weight:600}@media(max-width:640px){.normalization{grid-template-columns:1fr}}
</style>
