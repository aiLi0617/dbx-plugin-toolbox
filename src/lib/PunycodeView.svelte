<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { analyzePunycode } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  const pair = $derived.by(() => {
    try { return { ...analyzePunycode(input), error: "" }; }
    catch (cause) { return { unicode: "", ace: "", labels: [], warnings: [], error: cause?.message || t("请输入有效域名（Unicode 或 xn-- 编码）", "Enter a valid Unicode or xn-- domain") }; }
  });
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("域名", "Domain")}</span>
    <input class="dbx-input mono" spellcheck="false" placeholder="例子.example" bind:value={input} />
  </label>
  {#if pair.error}<p class="dbx-hint" role="alert">{pair.error}</p>{/if}
  <div class="rows">
    <div class="row">
      <span class="name">Unicode</span>
      <input class="dbx-input mono" readonly aria-label={t("Unicode 输出", "Unicode output")} value={pair.unicode} />
      <CopyButton {locale} text={pair.unicode} labelZh="复制 Unicode" labelEn="Copy Unicode" />
    </div>
    <div class="row">
      <span class="name">ACE</span>
      <input class="dbx-input mono" readonly aria-label={t("ACE 输出", "ACE output")} value={pair.ace} />
      <CopyButton {locale} text={pair.ace} labelZh="复制 ACE" labelEn="Copy ACE" />
    </div>
  </div>
  {#if pair.warnings?.length}<div class="warning" role="alert"><strong>{t("疑似仿冒风险","Possible spoofing risk")}</strong>{#each pair.warnings as warning}<span>{warning}</span>{/each}</div>{/if}
  {#if pair.labels?.length}<div class="labels"><div class="label-head"><span>#</span><span>Unicode</span><span>ACE</span><span>{t("长度","Length")}</span></div>{#each pair.labels as label}<div class:warn={label.mixedScripts||label.asciiLookalike} class="label-row"><span>{label.index}</span><code>{label.unicode}</code><code>{label.ace}</code><span>{label.bytes}/63</span></div>{/each}</div>{/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 820px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label,
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .label {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .warning{display:flex;flex-direction:column;gap:3px;padding:9px 11px;border-radius:8px;background:var(--color-warning-bg);color:var(--color-warning);font-size:12px}.labels{overflow:auto;border:1px solid var(--color-border);border-radius:8px}.label-head,.label-row{display:grid;grid-template-columns:34px minmax(100px,1fr) minmax(140px,1.4fr) 68px;gap:8px;padding:7px 9px}.label-head{background:var(--color-muted);color:var(--color-muted-foreground);font-size:11px}.label-row+.label-row{border-top:1px solid var(--color-border)}.label-row code{overflow:hidden;text-overflow:ellipsis}.label-row.warn{background:var(--color-warning-bg)}

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
    }
  }
</style>
