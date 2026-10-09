<script>
  import CopyButton from "./CopyButton.svelte";
  import { HTTP_STATUS_CLASSES, HTTP_STATUS_COUNT, searchHttpStatuses } from "./developerUtilities.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const classEntries = Object.entries(HTTP_STATUS_CLASSES);

  let query = $state("");
  let activeClass = $state("all");
  let searchInput = $state(null);
  let appliedInitialQuery = $state("");

  $effect(() => {
    const next = String(initialOptions.query || "").trim();
    if (next && next !== appliedInitialQuery) {
      query = next;
      const classMatch = next.toLowerCase().match(/^([1-5])xx$/);
      activeClass = classMatch ? `${classMatch[1]}xx` : "all";
      appliedInitialQuery = next;
    }
  });

  const filtered = $derived.by(() => {
    const matches = searchHttpStatuses(query);
    return activeClass === "all" ? matches : matches.filter((item) => item.category === activeClass);
  });

  const groups = $derived.by(() => classEntries
    .map(([id, meta]) => ({ id, meta, items: filtered.filter((item) => item.category === id) }))
    .filter((group) => group.items.length));

  function clearSearch() {
    query = "";
    activeClass = "all";
    searchInput?.focus();
  }
</script>

<div class="status-page">
  <header class="intro">
    <div>
      <h2>{t("HTTP 状态码速查", "HTTP status reference")}</h2>
      <p>{t("按状态码、英文名称、中文含义或分类即时查找。所有数据均在本地查询。", "Search instantly by code, name, meaning, or class. All lookups stay on this device.")}</p>
    </div>
    <span class="offline-badge">{t("离线 · IANA 快照", "Offline · IANA snapshot")}</span>
  </header>

  <div class="search-panel">
    <label class="search-box">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path>
      </svg>
      <span class="sr-only">{t("搜索状态码", "Search status codes")}</span>
      <input
        bind:this={searchInput}
        bind:value={query}
        type="search"
        autocomplete="off"
        placeholder={t("例如：404、未找到、Too Many Requests、5xx", "Try 404, Not Found, Too Many Requests, or 5xx")}
      />
      {#if query}<button class="clear" type="button" onclick={clearSearch} aria-label={t("清空搜索", "Clear search")}>×</button>{/if}
    </label>

    <div class="class-filters" aria-label={t("状态码分类", "Status code classes")}>
      <button class:active={activeClass === "all"} type="button" onclick={() => (activeClass = "all")}>
        {t("全部", "All")} <span>{HTTP_STATUS_COUNT}</span>
      </button>
      {#each classEntries as [id, meta]}
        <button class:active={activeClass === id} type="button" onclick={() => (activeClass = id)}>
          <strong>{id}</strong> {pick(locale, meta.label)}
        </button>
      {/each}
    </div>
  </div>

  <div class="result-summary" role="status" aria-live="polite">
    {#if query || activeClass !== "all"}
      {t(`找到 ${filtered.length} 个状态码`, `${filtered.length} status code${filtered.length === 1 ? "" : "s"} found`)}
    {:else}
      {t(`共 ${HTTP_STATUS_COUNT} 个已登记状态码`, `${HTTP_STATUS_COUNT} registered status codes`)}
    {/if}
  </div>

  <div class="results">
    {#each groups as group (group.id)}
      <section class="status-group">
        <div class="group-heading">
          <span class={`class-dot class-${group.id[0]}`}></span>
          <h3>{group.id} · {pick(locale, group.meta.label)}</h3>
          <p>{pick(locale, group.meta.description)}</p>
          <span class="group-count">{group.items.length}</span>
        </div>
        <div class="status-list">
          {#each group.items as item (item.code)}
            <article class={`status-row class-${item.category[0]}`}>
              <div class="code">{item.code}</div>
              <div class="status-content">
                <div class="name-row">
                  <strong>{item.name}</strong>
                  {#if item.temporary}<span class="flag warning">{t("临时登记", "Temporary")}</span>{/if}
                  {#if item.obsolete}<span class="flag muted">{t("已废弃", "Obsolete")}</span>{/if}
                  {#if item.unused}<span class="flag muted">{t("未使用", "Unused")}</span>{/if}
                </div>
                <p>{pick(locale, item.summary)}</p>
              </div>
              <div class="copy"><CopyButton {locale} text={`${item.code} ${item.name}`} /></div>
            </article>
          {/each}
        </div>
      </section>
    {:else}
      <div class="empty">
        <strong>{t("没有匹配的状态码", "No matching status codes")}</strong>
        <p>{t("可以尝试状态码、英文名称、中文含义，或 1xx–5xx 分类。", "Try a numeric code, an English name, a meaning, or a class from 1xx to 5xx.")}</p>
        <button class="dbx-btn" type="button" onclick={clearSearch}>{t("清空筛选", "Clear filters")}</button>
      </div>
    {/each}
  </div>

  <footer class="source-note">
    {t("名称与登记状态依据 IANA HTTP Status Code Registry 离线快照（2025-09-15）；104 为截至 2026-11-13 的临时登记。", "Names and registration states follow an offline snapshot of the IANA HTTP Status Code Registry (2025-09-15); 104 is temporarily registered through 2026-11-13.")}
  </footer>
</div>

<style>
  .status-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:14px;width:100%}.intro{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.intro h2{margin:0 0 4px;font-size:18px;line-height:1.35}.intro p,.group-heading p,.status-content p,.empty p{margin:0;color:var(--color-muted-foreground);font-size:12px;line-height:1.55}.offline-badge{flex:0 0 auto;padding:4px 8px;border:1px solid var(--color-border);border-radius:999px;background:var(--color-muted);color:var(--color-muted-foreground);font-size:10px;font-weight:600}.search-panel{display:flex;flex-direction:column;gap:9px;padding:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-card)}.search-box{display:flex;align-items:center;gap:9px;height:42px;padding:0 11px;border:1px solid var(--color-input,var(--color-border));border-radius:8px;background:var(--color-background);color:var(--color-muted-foreground)}.search-box:focus-within{border-color:var(--color-ring,var(--color-primary))}.search-box input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--color-foreground);font:inherit}.search-box input::-webkit-search-cancel-button{display:none}.clear{display:grid;width:24px;height:24px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--color-muted-foreground);font-size:18px;line-height:1;place-items:center}.clear:hover{background:var(--color-muted);color:var(--color-foreground)}.class-filters{display:flex;flex-wrap:wrap;gap:6px}.class-filters button{display:flex;align-items:center;gap:5px;min-height:28px;padding:4px 9px;border:1px solid var(--color-border);border-radius:999px;background:transparent;color:var(--color-muted-foreground);font-size:11px}.class-filters button:hover{background:var(--color-muted);color:var(--color-foreground)}.class-filters button.active{border-color:color-mix(in srgb,var(--color-primary) 45%,var(--color-border));background:color-mix(in srgb,var(--color-primary) 11%,var(--color-background));color:var(--color-primary)}.class-filters span{font-size:10px;opacity:.72}.result-summary{min-height:16px;color:var(--color-muted-foreground);font-size:11px}.results{min-height:0;overflow:auto;padding-right:3px}.status-group{margin-bottom:16px}.group-heading{display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:8px;margin-bottom:7px;padding:0 4px}.group-heading h3{margin:0;font-size:12px}.class-dot{width:8px;height:8px;border-radius:999px;background:var(--class-color)}.group-count{color:var(--color-muted-foreground);font-size:10px}.status-list{overflow:hidden;border:1px solid var(--color-border);border-radius:9px;background:var(--color-card)}.status-row{--class-color:var(--color-primary);display:grid;grid-template-columns:66px minmax(0,1fr) 36px;align-items:center;gap:12px;min-height:66px;padding:10px 10px 10px 0;border-left:3px solid var(--class-color)}.status-row+.status-row{border-top:1px solid var(--color-border)}.status-row:hover{background:color-mix(in srgb,var(--class-color) 5%,transparent)}.code{color:var(--class-color);font:700 20px/1 ui-monospace,SFMono-Regular,Consolas,monospace;text-align:center}.status-content{min-width:0}.name-row{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:3px}.name-row strong{font-size:13px}.flag{padding:2px 5px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase}.flag.warning{background:var(--color-warning-bg);color:var(--color-warning)}.flag.muted{background:var(--color-muted);color:var(--color-muted-foreground)}.copy{position:relative;display:flex;justify-content:flex-end}.class-1{--class-color:rgb(100 116 139)}.class-2{--class-color:var(--color-success)}.class-3{--class-color:rgb(14 165 233)}.class-4{--class-color:var(--color-warning)}.class-5{--class-color:var(--color-destructive)}.empty{display:flex;min-height:220px;align-items:center;justify-content:center;flex-direction:column;gap:7px;padding:30px;border:1px dashed var(--color-border);border-radius:10px;text-align:center}.source-note{padding:8px 2px 0;border-top:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:10px;line-height:1.5}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}@media(max-width:720px){.intro{flex-direction:column;gap:8px}.group-heading{grid-template-columns:auto auto 1fr}.group-heading p{display:none}.status-row{grid-template-columns:56px minmax(0,1fr) 32px;gap:8px}.code{font-size:17px}.class-filters button{padding-inline:7px}.class-filters button:not(.active){font-size:0}.class-filters button:not(.active) strong{font-size:11px}}
</style>
