<script>
  import IoSplit from "./IoSplit.svelte";
  import { pick } from "./i18n.js";
  import { applyWhitespace, applyCaseStyle, CASE_STYLES, textStats, slugify, stripHtml } from "./tools/text.js";
  import { TEXT_ACTIONS } from "./textActions.js";

  let { locale = "zh-CN", initialAction = "trim" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const groups = [
    { id: "clean", zh: "清理", en: "Clean", actions: ["trim", "empty", "tabs", "spaces", "strip-html"] },
    { id: "lines", zh: "行处理", en: "Lines", actions: ["sort", "unique", "reverse", "shuffle", "prefix", "suffix", "number", "unnumber", "column", "filter-length"] },
    { id: "replace", zh: "替换", en: "Replace", actions: ["replace"] },
    { id: "case", zh: "大小写", en: "Case & naming", actions: ["upper", "lower", "title", "camel", "pascal", "snake", "kebab"] },
    { id: "convert", zh: "转换", en: "Convert", actions: ["full", "half", "slugify"] },
  ];
  let groupId = $state("clean");
  let mode = $state("trim");
  $effect(() => {
    const requested = initialAction || "trim";
    mode = requested;
    groupId = groups.find((group) => group.actions.includes(requested))?.id || "clean";
  });
  let affix = $state("");
  let find = $state("");
  let replace = $state("");
  let startNumber = $state(1);
  let numberWidth = $state(0);
  let numberSeparator = $state(". ");
  let column = $state(1);
  let delimiter = $state("");
  let minLength = $state(0);
  let maxLength = $state("");
  let input = $state("");
  let history = $state([]);
  const output = $derived.by(() => {
    if (mode === "stats") return input;
    if (mode === "slugify") return slugify(input);
    if (mode === "strip-html") return stripHtml(input);
    if (CASE_STYLES.some((style) => style.id === mode)) return applyCaseStyle(input, mode);
    return applyWhitespace(input, mode, {
      affix, find, replace, start: startNumber, width: numberWidth, separator: numberSeparator,
      column, delimiter, minLength, maxLength: maxLength === "" ? Infinity : maxLength,
    });
  });
  const inputStats = $derived(textStats(input));
  const outputStats = $derived(textStats(output));
  const actions = $derived((groups.find((group) => group.id === groupId)?.actions || []).map((id) => TEXT_ACTIONS.find((item) => item.id === id)));
  function selectGroup(group) {
    groupId = group.id;
    mode = group.actions[0];
  }
  function continueProcessing() {
    history = [...history.slice(-19), input];
    input = output;
    mode = "stats";
  }
  function undo() {
    input = history.at(-1);
    history = history.slice(0, -1);
    mode = "stats";
  }
</script>

<div class="page">
  <div class="group-bar">
    <div class="groups" role="group" aria-label={t("文本处理分类", "Text operation groups")}>
      {#each groups as group (group.id)}
        <button class:active={groupId === group.id} aria-pressed={groupId === group.id} onclick={() => selectGroup(group)} type="button">{t(group.zh, group.en)}</button>
      {/each}
    </div>
    <div class="history-actions">
      <button class="dbx-btn" disabled={input === output} onclick={continueProcessing} type="button">{t("将结果继续处理", "Use result as input")}</button>
      <button class="dbx-btn" disabled={!history.length} onclick={undo} type="button">{t("撤销处理", "Undo processing")}</button>
    </div>
  </div>
  {#if groupId !== "replace"}
    <div class="actions" role="group" aria-label={t("处理方式", "Operation")}>
      {#each actions as action (action.id)}
        <button class="dbx-btn" class:selected={mode === action.id} aria-pressed={mode === action.id} onclick={() => (mode = action.id)} type="button">{t(action.zh, action.en)}</button>
      {/each}
    </div>
  {/if}
  {#if mode === "stats"}
    <span class="hint">{t("选择下一步操作，继续处理当前文本。字数统计始终显示在底部。", "Choose an operation to continue. Text counts are always shown below.")}</span>
  {/if}
  {#if ["prefix", "suffix", "replace", "number", "column", "filter-length"].includes(mode)}
  <div class="options">
    {#if mode === "prefix" || mode === "suffix"}
      <label class="field grow"><span>{t("前后缀", "Affix")}</span><input class="dbx-input" bind:value={affix} /></label>
    {:else if mode === "replace"}
      <label class="field grow"><span>{t("查找", "Find")}</span><input class="dbx-input" bind:value={find} /></label>
      <label class="field grow"><span>{t("替换为", "Replace with")}</span><input class="dbx-input" bind:value={replace} /></label>
    {:else if mode === "number"}
      <label class="field"><span>{t("起始序号", "Start")}</span><input class="dbx-input small" type="number" bind:value={startNumber} /></label>
      <label class="field"><span>{t("补零位数", "Zero-pad width")}</span><input class="dbx-input small" type="number" min="0" max="12" bind:value={numberWidth} /></label>
      <label class="field grow"><span>{t("分隔符", "Separator")}</span><input class="dbx-input" bind:value={numberSeparator} /></label>
    {:else if mode === "column"}
      <label class="field"><span>{t("列号", "Column")}</span><input class="dbx-input small" type="number" min="1" bind:value={column} /></label>
      <label class="field grow"><span>{t("分隔符（留空表示空白）", "Delimiter (blank means whitespace)")}</span><input class="dbx-input" bind:value={delimiter} /></label>
    {:else if mode === "filter-length"}
      <label class="field"><span>{t("最短字符数", "Minimum length")}</span><input class="dbx-input small" type="number" min="0" bind:value={minLength} /></label>
      <label class="field"><span>{t("最长字符数（留空不限）", "Maximum length (blank for no limit)")}</span><input class="dbx-input small" type="number" min="0" bind:value={maxLength} /></label>
    {/if}
  </div>
  {/if}
  <IoSplit {locale} bind:input {output} />
  <div class="stats">
    {#each [[t("输入", "Input"), inputStats], [t("结果", "Result"), outputStats]] as [label, counts]}
      <span>{label} · {counts.chars} {t("字", "chars")} · {counts.words} {t("词", "words")} · {counts.lines} {t("行", "lines")} · {counts.bytes} {t("字节", "bytes")}</span>
    {/each}
  </div>
</div>

<style>
  .page { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  .group-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--color-border); padding-bottom: 10px; }
  .groups, .actions, .history-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .groups button { border: 0; border-radius: 6px; background: transparent; color: var(--color-muted-foreground); font: inherit; font-size: 13px; padding: 7px 12px; cursor: pointer; }
  .groups button:hover { background: var(--color-muted); color: var(--color-foreground); }
  .groups button.active { background: var(--color-primary); color: var(--color-primary-foreground); }
  .actions .selected { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary) 10%, var(--color-background)); color: var(--color-primary); }
  .hint { font-size: 12px; color: var(--color-muted-foreground); }
  .options { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
  .field { min-width: 180px; }
  .grow { flex: 1 1 160px; }
  .small { width: 120px; }
  .stats { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--color-muted-foreground); }
</style>
