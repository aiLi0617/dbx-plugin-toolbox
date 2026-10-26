<script>
  import { pick } from "./i18n.js";
  import { EMOJI } from "./contentExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let query = $state("");
  let category = $state("all");
  let skin = $state("");
  let selected = $state("");
  let recent = $state([]);
  let last = $state("");
  const categories = $derived([
    { id: "all", icon: "◉", label: t("全部", "All") },
    { id: "faces", icon: "😀", label: t("表情", "Faces") },
    { id: "people", icon: "👋", label: t("手势", "Gestures") },
    { id: "symbols", icon: "❤️", label: t("符号", "Symbols") },
    { id: "nature", icon: "🌱", label: t("自然", "Nature") },
    { id: "objects", icon: "💻", label: t("物品", "Objects") },
    { id: "food", icon: "☕", label: t("食物", "Food") },
  ]);
  // Keep search forgiving for the everyday Chinese words people actually type.
  // The catalog names remain compact, while aliases cover common synonyms.
  const aliases = {
    "😀": "开心 快乐 高兴 笑 微笑",
    "😂": "笑哭 笑死 开心",
    "😊": "开心 快乐 友好",
    "😍": "喜欢 爱心 爱 喜爱",
    "🥰": "喜欢 爱 幸福",
    "🤩": "惊喜 崇拜 厉害",
    "😢": "难过 伤心 哭",
    "😭": "伤心 难过 大哭",
    "😡": "生气 愤怒",
    "🥳": "开心 庆祝 派对",
    "👍": "赞 同意 好 可以",
    "👏": "鼓掌 赞 表扬",
    "🙏": "谢谢 感谢 拜托",
    "❤️": "爱心 喜欢 爱 红心",
    "💔": "伤心 心碎 失恋",
    "🔥": "火 热门 厉害",
    "✨": "闪亮 好看",
    "🌈": "彩虹",
    "🐱": "猫 小猫 宠物",
    "🐶": "狗 小狗 宠物",
    "🚀": "火箭 发射 太空",
    "💻": "电脑 编程 工作",
    "📱": "手机 电话",
    "🎉": "庆祝 派对 开心",
    "☕": "咖啡 饮料",
    "🍕": "披萨 美食",
    "🍔": "汉堡 美食",
  };
  const filtered = $derived(EMOJI.filter(([value, name, group]) =>
    (category === "all" || category === group) &&
    (!query.trim() || `${value} ${name} ${aliases[value] || ""} ${categories.find(item => item.id === group)?.label || ""}`.toLowerCase().includes(query.trim().toLowerCase()))));
  const groups = $derived(categories.slice(1).map(item => ({ ...item, rows: filtered.filter(row => row[2] === item.id) })).filter(item => item.rows.length));
  const count = $derived(Array.from(new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(selected)).length);
  const skinOptions = $derived([
    { value: "", label: t("默认", "Default") },
    { value: "🏻", label: "🏻 " + t("浅色", "Light") },
    { value: "🏼", label: "🏼 " + t("较浅", "Medium light") },
    { value: "🏽", label: "🏽 " + t("中等", "Medium") },
    { value: "🏾", label: "🏾 " + t("较深", "Medium dark") },
    { value: "🏿", label: "🏿 " + t("深色", "Dark") },
  ]);
  function choose(value) {
    selected += value;
    last = value;
    recent = [value, ...recent.filter(item => item !== value)].slice(0, 12);
  }
  function undo() {
    const segments = Array.from(new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(selected));
    selected = segments.slice(0, -1).map(item => item.segment).join("");
  }
</script>

<div class="emoji-page">
  <header class="intro">
    <div><h2>{t("选择表情", "Choose emoji")}</h2></div>
    <span class="total">{EMOJI.length} Emoji</span>
  </header>
  <div class="workspace">
    <section class="browser" aria-label={t("浏览表情", "Browse emoji")}>
      <div class="filters">
        <label class="search"><span>{t("搜索", "Search")}</span><input class="dbx-input" type="search" bind:value={query} placeholder={t("中文、英文或 Emoji", "Chinese, English or emoji")} /></label>
        <label class="skin"><span>{t("肤色", "Skin tone")}</span><Select bind:value={skin} ariaLabel={t("肤色", "Skin tone")} options={skinOptions} /></label>
      </div>
      <div class="categories" role="group" aria-label={t("类别", "Category")}>
        {#each categories as item}
          <button class:active={category === item.id} aria-pressed={category === item.id} onclick={() => category = item.id}><span aria-hidden="true">{item.icon}</span>{item.label}</button>
        {/each}
      </div>
      <div class="results-heading"><strong>{categories.find(item => item.id === category)?.label}</strong><span aria-live="polite">{filtered.length} / {EMOJI.length}</span></div>
      {#if !filtered.length}
        <div class="empty"><span aria-hidden="true">⌕</span><strong>{t("没有匹配项", "No matches")}</strong><button class="dbx-btn" onclick={() => { query = ""; category = "all"; }}>{t("清除筛选", "Clear filters")}</button></div>
      {:else}
        <div class="groups">
          {#each groups as group}
            <section class="group" aria-label={group.label}>
              <h3>{group.label}<span>{group.rows.length}</span></h3>
              <div class="emoji-grid">
                {#each group.rows as [value, name, , supportsSkin]}
                  {@const variant = value + (supportsSkin ? skin : "")}
                  <button class:chosen={last === variant} title={name} aria-label={name} onclick={() => choose(variant)}>{variant}</button>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      {/if}
    </section>
    <aside class="composer" aria-label={t("表情组合", "Emoji collection")}>
      <div class="composer-heading"><h3>{t("表情组合", "Emoji collection")}</h3><span aria-live="polite">{count}</span></div>
      <textarea class="dbx-textarea" bind:value={selected} aria-label={t("已选表情，可编辑", "Selected emoji, editable")} placeholder={t("点击表情添加…", "Click an emoji to add…")}></textarea>
      <div class="actions"><div class="copy"><CopyButton {locale} text={selected} labelZh="复制" labelEn="Copy" /><span>{t("复制", "Copy")}</span></div><button class="dbx-btn dbx-btn--ghost" disabled={!selected} onclick={undo}>{t("退格", "Backspace")}</button><button class="dbx-btn dbx-btn--ghost" disabled={!selected} onclick={() => { selected = ""; last = ""; }}>{t("清空", "Clear")}</button></div>
      <div class="recent"><h3>{t("最近使用", "Recently used")}</h3>
        {#if recent.length}<div class="emoji-grid">{#each recent as value}<button title={value} aria-label={value} onclick={() => choose(value)}>{value}</button>{/each}</div>
        {:else}<span class="recent-empty">{t("暂无", "None")}</span>{/if}
      </div>
    </aside>
  </div>
</div>

<style>
  .emoji-page{width:100%;max-width:1200px;margin:0 auto;padding:22px 28px;overflow:auto;color:var(--color-foreground)}
  .intro{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
  h2{font-size:20px;line-height:1.4;margin:0 0 6px;font-weight:650;letter-spacing:-.4px}
  .total{border:1px solid var(--color-border);border-radius:20px;padding:5px 10px;font-size:11px;white-space:nowrap;color:var(--color-muted-foreground)}
  .workspace{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
  .browser,.composer{border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card);min-width:0}
  .browser{padding:16px}.composer{padding:16px;position:sticky;top:0}
  .filters{display:flex;gap:12px;align-items:end}.filters label{display:flex;flex-direction:column;gap:7px;font-size:12px;min-width:0}.search{flex:1}.skin{width:120px;flex-shrink:0}
  .categories{display:flex;flex-wrap:wrap;gap:4px;padding:12px 0;border-bottom:1px solid var(--color-border)}
  .categories button{display:flex;align-items:center;gap:5px;padding:7px 9px;border:1px solid transparent;border-radius:var(--radius-md);background:transparent;color:var(--color-muted-foreground);font-size:12px;cursor:pointer}
  .categories button.active{color:var(--color-primary);border-color:color-mix(in srgb,var(--color-primary) 25%,transparent);background:color-mix(in srgb,var(--color-primary) 8%,var(--color-card))}
  .results-heading{display:flex;justify-content:space-between;align-items:center;padding:16px 0 4px;font-size:12px}.results-heading>span{color:var(--color-muted-foreground);font-variant-numeric:tabular-nums}
  .groups{display:flex;flex-direction:column;gap:16px;padding-top:12px}
  h3{font-size:12px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px}h3>span{font-size:11px;color:var(--color-muted-foreground);font-weight:400}
  .group h3{margin-bottom:9px;color:var(--color-muted-foreground)}
  .emoji-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:5px}
  .emoji-grid button{display:flex;align-items:center;justify-content:center;min-width:0;height:46px;padding:0;border:1px solid transparent;border-radius:var(--radius-lg);background:var(--color-muted);font-family:"Segoe UI Emoji","Apple Color Emoji",sans-serif;font-size:27px;cursor:pointer;transition:background 120ms,border-color 120ms}
  .emoji-grid button:hover,.categories button:hover{background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}
  .emoji-grid button.chosen{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 10%,var(--color-card))}
  button:focus-visible{outline:2px solid var(--color-ring);outline-offset:2px}
  .composer-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}.composer-heading>span{font-size:11px;color:var(--color-muted-foreground);font-variant-numeric:tabular-nums}
  textarea{width:100%;min-height:164px;resize:vertical;margin-top:14px;font-family:"Segoe UI Emoji","Apple Color Emoji",sans-serif;font-size:25px;line-height:1.7;padding:12px}
  textarea::placeholder{font-family:var(--font-sans,sans-serif);font-size:12px}
  .actions{display:flex;align-items:center;gap:3px;margin-top:8px}.actions>button{font-size:12px;padding:4px 8px}.copy{position:relative;display:flex;align-items:center;min-height:30px;padding:0 8px 0 32px;margin-right:auto;font-size:12px;color:var(--color-muted-foreground)}
  .copy :global(.copy-btn){position:absolute;inset:0;width:100%;justify-content:flex-start;padding-left:8px}.copy>span{pointer-events:none}
  .recent{border-top:1px solid var(--color-border);margin-top:16px;padding-top:14px}.recent h3{margin-bottom:10px}.recent-empty{font-size:12px;color:var(--color-muted-foreground)}
  .empty{display:flex;align-items:center;flex-direction:column;gap:10px;padding:48px 12px;text-align:center;font-size:13px}.empty>span{font-size:32px;color:var(--color-muted-foreground)}
  @media(max-width:900px){.workspace{grid-template-columns:minmax(0,1fr)}.composer{position:static}.composer textarea{min-height:100px}}
  @media(max-width:520px){.emoji-page{padding:16px 12px}.browser,.composer{padding:14px}.intro{align-items:start}h2{font-size:18px}.filters{flex-wrap:wrap}.skin{width:108px}.categories button{padding:6px}.emoji-grid{grid-template-columns:repeat(auto-fill,minmax(40px,1fr))}}
  @media(prefers-reduced-motion:reduce){.emoji-grid button{transition:none}}
</style>
