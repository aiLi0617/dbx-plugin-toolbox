<script>
  import CopyButton from "./CopyButton.svelte";
  import { loadAssetModule } from "./assetModules.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN", demo = null, demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  let range = $state("");
  let includePrerelease = $state(false);
  let descending = $state(false);
  let onlyMatching = $state(false);
  let result = $state(null);
  let busy = $state(false);
  let error = $state("");
  let appliedDemoRequest = 0;

  const sortedVersions = $derived(result ? (descending ? [...result.sorted].reverse() : result.sorted) : []);
  const orderedEntries = $derived(result
    ? [...(descending ? [...result.sortedEntries].reverse() : result.sortedEntries), ...result.invalidEntries]
    : []);
  const visibleVersions = $derived(orderedEntries.filter((item) => !onlyMatching || !result?.rangeInput || result?.rangeError || item.satisfies === true));
  const copyText = $derived(sortedVersions.join("\n"));

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest || !demo) return;
    appliedDemoRequest = demoRequest;
    input = demo.input || "";
    range = demo.auxiliary || "";
  });

  $effect(() => {
    const source = input;
    const expression = range;
    const prerelease = includePrerelease;
    if (!source.trim() && !expression.trim()) {
      revision += 1;
      result = null;
      error = "";
      busy = false;
      return;
    }
    const timer = setTimeout(() => void analyze(source, expression, prerelease), 140);
    return () => clearTimeout(timer);
  });

  let revision = 0;

  async function analyze(source, expression, prerelease) {
    const currentRevision = ++revision;
    busy = true;
    error = "";
    try {
      if (new TextEncoder().encode(`${source}${expression}`).length > 1_000_000) {
        throw new Error(t("输入内容超过此工具的安全上限", "Input exceeds this tool's safe limit"));
      }
      const module = await loadAssetModule("semver");
      if (currentRevision !== revision) return;
      result = module.analyzeSemver(source, expression, { includePrerelease: prerelease });
    } catch (cause) {
      if (currentRevision !== revision) return;
      error = String(cause?.message || cause);
      result = null;
    } finally {
      if (currentRevision === revision) busy = false;
    }
  }

  function clear() {
    input = "";
    range = "";
    includePrerelease = false;
    onlyMatching = false;
    descending = false;
    result = null;
    error = "";
    revision += 1;
  }
</script>

<div class="semver-page">
  <section class="input-panel">
    <div class="version-input">
      <div class="field-heading">
        <label for="semver-versions">{t("版本列表", "Versions")}</label>
        {#if input || range}<button class="clear-control" type="button" onclick={clear} title={t("清空版本和范围", "Clear versions and range")} aria-label={t("清空版本和范围", "Clear versions and range")}>×</button>{/if}
      </div>
      <textarea id="semver-versions" class="dbx-textarea mono" bind:value={input} spellcheck="false" placeholder={t("每行一个版本，也可用空格或逗号分隔", "One version per line, or separate with spaces or commas")}></textarea>
    </div>
    <div class="range-column">
      <label>
        <span>{t("版本范围（可选）", "Range (optional)")}</span>
        <input class="dbx-input mono" bind:value={range} spellcheck="false" placeholder="^1.0.0" aria-invalid={result?.rangeError ? "true" : "false"} />
      </label>
      <div class="range-presets" aria-label={t("范围快捷选项", "Range presets")}>
        {#each ["^1.0.0", "~1.0.0", ">=1.0.0", "1.x", "*"] as preset}
          <button type="button" class:active={range === preset} onclick={() => (range = preset)}>{preset}</button>
        {/each}
      </div>
      <label class="check"><input type="checkbox" bind:checked={includePrerelease} /> {t("范围匹配包含预发布版本", "Include prereleases in range matching")}</label>
    </div>
  </section>

  {#if error}<div class="banner" role="alert">{error}</div>{/if}
  {#if result?.rangeError}<div class="banner" role="alert">{t("版本范围无效，请检查表达式。", "Invalid version range; check the expression.")} <code>{result.rangeInput}</code></div>{/if}

  {#if result}
    <section class="summary" aria-live="polite">
      <div><span>{t("有效版本", "Valid versions")}</span><strong>{result.validCount}</strong>{#if result.invalidCount}<small>{t(`${result.invalidCount} 个无效`, `${result.invalidCount} invalid`)}</small>{/if}</div>
      <div><span>{t("最低版本", "Minimum")}</span><strong class="mono">{result.minimum || "—"}</strong>{#if result.minimumEquivalent.length > 1}<small>{t("多个版本优先级相同", "Multiple versions have equal precedence")}</small>{/if}</div>
      <div><span>{t("最高版本", "Maximum")}</span><strong class="mono">{result.maximum || "—"}</strong>{#if result.maximumEquivalent.length > 1}<small>{t("多个版本优先级相同", "Multiple versions have equal precedence")}</small>{/if}</div>
      <div class:highlight={Boolean(result.maximumSatisfying)}><span>{t("最高匹配版本", "Highest matching")}</span><strong class="mono">{result.maximumSatisfying || "—"}</strong><small>{range && !result.rangeError ? `${result.matching.length} / ${result.validCount}` : t("请填写有效范围", "Enter a valid range")}</small></div>
    </section>

    <section class="result-panel">
      <div class="result-toolbar">
        <div><strong>{t("分析结果", "Analysis")}{#if busy}<span class="working"> · {t("更新中…", "Updating…")}</span>{/if}</strong><span>{t("构建元数据不影响版本优先级", "Build metadata does not affect precedence")}</span></div>
        <div class="toolbar-actions">
          {#if range && !result.rangeError}<label class="check"><input type="checkbox" bind:checked={onlyMatching} /> {t("仅显示匹配项", "Matches only")}</label>{/if}
          <button class="dbx-btn compact" type="button" onclick={() => (descending = !descending)}>{descending ? t("降序", "Descending") : t("升序", "Ascending")} ↕</button>
          <div class="copy-wrap"><CopyButton {locale} text={copyText} labelZh="复制排序结果" labelEn="Copy sorted versions" /></div>
        </div>
      </div>

      {#if !result.versions.length}
        <div class="empty">{t("输入版本后将自动显示分析结果", "Analysis appears automatically when you enter versions")}</div>
      {:else if !visibleVersions.length}
        <div class="empty">{t("没有满足当前范围的版本", "No versions satisfy the current range")}</div>
      {:else}
        <div class="version-table">
          <div class="table-head"><span>{t("输入版本", "Input")}</span><span>{t("规范化", "Normalized")}</span><span>{t("标记", "Tags")}</span><span>{t("范围", "Range")}</span></div>
          {#each visibleVersions as item}
            <div class="version-row" class:invalid={!item.valid}>
              <code>{item.version}</code>
              <code>{item.normalized || "—"}</code>
              <div class="tags">
                {#if !item.valid}<span class="tag bad">{t("无效", "Invalid")}</span>{/if}
                {#if item.prerelease.length}<span class="tag pre">pre: {item.prerelease.join(".")}</span>{/if}
                {#if item.build.length}<span class="tag">build: {item.build.join(".")}</span>{/if}
                {#if item.valid && !item.prerelease.length && !item.build.length}<span class="muted">—</span>{/if}
              </div>
              <span class:yes={item.satisfies === true} class:no={item.satisfies === false}>{item.satisfies === null ? "—" : item.satisfies ? "✓" : "×"}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if sortedVersions.length}
        <details><summary>{t("查看排序结果", "View sorted versions")}</summary><pre>{copyText}</pre></details>
      {/if}
    </section>
  {/if}
</div>

<style>
  .semver-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;width:100%;max-width:1180px;margin:0 auto}.input-panel,.result-panel{border:1px solid var(--color-border);border-radius:var(--radius-lg,10px);background:var(--color-card,var(--color-background,Canvas))}.input-panel{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr);gap:14px;padding:14px}.input-panel label{display:flex;flex-direction:column;gap:6px;font-size:12px}.version-input{display:flex;min-width:0;flex-direction:column;gap:6px}.field-heading{display:flex;min-height:22px;align-items:center;justify-content:space-between;gap:8px}.field-heading label{display:block}.clear-control{display:grid;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--color-muted-foreground);font-size:17px;line-height:1;cursor:pointer;place-items:center}.clear-control:hover,.clear-control:focus-visible{background:var(--color-muted);color:var(--color-foreground)}.version-input textarea{min-height:126px;resize:vertical}.range-column{display:flex;flex-direction:column;gap:10px}.range-presets{display:flex;flex-wrap:wrap;gap:6px}.range-presets button{min-height:27px;padding:3px 8px;border:1px solid var(--color-border);border-radius:999px;background:transparent;color:var(--color-muted-foreground);font:11px var(--font-mono)}.range-presets button:hover,.range-presets button.active{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 8%,var(--color-background));color:var(--color-primary)}.check{display:flex!important;align-items:center;flex-direction:row!important;gap:6px!important;color:var(--color-muted-foreground);font-size:11px!important}.banner{padding:9px 11px;border-radius:8px;background:color-mix(in srgb,var(--color-destructive) 8%,transparent);color:var(--color-destructive);font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.summary>div{display:flex;min-width:0;min-height:82px;justify-content:center;flex-direction:column;gap:5px;padding:11px 13px;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.summary>div.highlight{border-color:color-mix(in srgb,var(--color-primary) 40%,var(--color-border));background:color-mix(in srgb,var(--color-primary) 7%,var(--color-background))}.summary span,.summary small{overflow:hidden;color:var(--color-muted-foreground);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.summary strong{overflow:hidden;font-size:16px;text-overflow:ellipsis;white-space:nowrap}.summary .highlight strong{color:var(--color-primary)}.result-panel{min-height:0;overflow:hidden}.result-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:10px 12px;border-bottom:1px solid var(--color-border)}.result-toolbar>div:first-child{display:flex;min-width:0;flex-direction:column;gap:2px}.result-toolbar strong{font-size:12px}.result-toolbar span{color:var(--color-muted-foreground);font-size:10px}.result-toolbar .working{color:var(--color-primary);font-weight:400}.toolbar-actions{display:flex;align-items:center;gap:8px}.compact{min-height:30px;padding:4px 9px;font-size:11px}.copy-wrap{position:relative}.copy-wrap :global(.copy-btn){height:30px;min-height:30px}.version-table{max-height:330px;overflow:auto}.table-head,.version-row{display:grid;grid-template-columns:minmax(140px,1fr) minmax(130px,1fr) minmax(160px,1.4fr) 54px;align-items:center;gap:10px;padding:9px 12px}.table-head{position:sticky;z-index:1;top:0;background:var(--color-muted);color:var(--color-muted-foreground);font-size:10px}.version-row{min-height:43px;border-top:1px solid var(--color-border);font-size:12px}.version-row.invalid{background:color-mix(in srgb,var(--color-destructive) 5%,transparent)}.version-row code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tags{display:flex;min-width:0;flex-wrap:wrap;gap:5px}.tag{max-width:100%;overflow:hidden;padding:2px 5px;border-radius:4px;background:var(--color-muted);color:var(--color-muted-foreground);font:9px var(--font-mono);text-overflow:ellipsis;white-space:nowrap}.tag.pre{background:color-mix(in srgb,var(--color-warning) 12%,transparent);color:var(--color-warning)}.tag.bad{background:color-mix(in srgb,var(--color-destructive) 10%,transparent);color:var(--color-destructive)}.muted{color:var(--color-muted-foreground)}.yes{color:var(--color-success);font-weight:700}.no{color:var(--color-destructive);font-weight:700}.empty{display:grid;min-height:150px;padding:24px;color:var(--color-muted-foreground);font-size:12px;place-items:center}details{border-top:1px solid var(--color-border);font-size:11px}summary{padding:9px 12px;color:var(--color-muted-foreground);cursor:pointer}pre{max-height:180px;margin:0;padding:10px 12px;overflow:auto;background:var(--color-muted);font-size:11px}@media(max-width:820px){.input-panel{grid-template-columns:1fr}.summary{grid-template-columns:repeat(2,1fr)}.result-toolbar{align-items:flex-start;flex-direction:column}.toolbar-actions{width:100%;flex-wrap:wrap}.table-head,.version-row{grid-template-columns:minmax(120px,1fr) minmax(110px,1fr) 48px}.table-head span:nth-child(3),.version-row .tags{display:none}}@media(max-width:520px){.summary{grid-template-columns:1fr 1fr}.table-head,.version-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr) 38px}.summary>div{min-height:72px}.toolbar-actions .check{flex:1 0 100%}}
</style>
