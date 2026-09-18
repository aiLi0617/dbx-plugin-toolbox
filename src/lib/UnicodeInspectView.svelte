<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { inspectUnicodeRows } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const rows = $derived(inspectUnicodeRows(input));
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("文本", "Text")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" bind:value={input} placeholder={t("粘贴要检查的字符", "Paste characters to inspect")}></textarea>
  </label>

  {#if rows.length}
    <table class="dbx-table">
      <thead>
        <tr>
          <th>{t("字符", "Char")}</th>
          <th>Unicode</th>
          <th>{t("十进制", "Decimal")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row, i (i)}
          <tr>
            <td class="glyph">{row.char}</td>
            <td class="mono">{row.hex}</td>
            <td class="mono">{row.dec}</td>
            <td class="copy">
              <CopyButton {locale} text={row.hex} labelZh="复制码位" labelEn="Copy code point" />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {:else}
    <p class="dbx-hint">{t("输入后会列出每个字符的码位。", "Each character’s code point will appear here.")}</p>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 560px;
  }
  .block {
    display: flex;
    flex-direction: column;
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
</style>
