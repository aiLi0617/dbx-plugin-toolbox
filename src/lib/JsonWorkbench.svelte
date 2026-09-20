<script>
  import { untrack } from "svelte";
  import { chrome, pick } from "./i18n.js";
  import { INPUT_LIMITS, inputLimitError } from "./inputLimits.js";
  import { copyText as copyToClipboard } from "./clipboard.js";
  import { parseLosslessJson, parseSafeJson, toSafeJsonValue, precisionErrorMessage } from "./jsonPrecision.js";
  import { jsonLanguages, convertJsonToLang } from "./jsonToLang.js";
  import { runJsonPath } from "./tools/convert.js";
  import JsonCodeEditor from "./JsonCodeEditor.svelte";
  import JsonTreeView from "./JsonTreeView.svelte";
  import Select from "./Select.svelte";
  import {
    addJsonEscape,
    chineseToUnicode,
    addChild,
    collapseAllPaths,
    defaultCollapsed,
    deletePath,
    formatJson,
    minifyJson,
    removeJsonEscape,
    renamePath,
    restoreKeyOrder,
    serializeJson,
    setPath,
    sortValue,
    unicodeToChinese,
  } from "./jsonOps.js";

  let { locale = "zh-CN", initialOptions = {} } = $props();

  let jsonText = $state("");
  let pretty = $state(true);
  let sortKeys = $state(false);
  let unsortedValue = $state(undefined);
  let showLineNumbers = $state(true);
  let moreOpen = $state(false);
  let moreEl = $state(null);
  let rightMode = $state("tree");
  let jsonPath = $state("");
  let textActionsHeight = $state(42);
  const formatLanguages = new Set(["yaml", "xml", "toml", "csv", "query"]);
  const availableLanguages = $derived(jsonLanguages.filter((lang) => rightMode === "convert" ? formatLanguages.has(lang.value) : !formatLanguages.has(lang.value)));
  let convertLang = $state("typescript");
  let tableName = $state("");
  let convertOut = $state("");
  let actionError = $state("");
  let parseError = $state("");
  let convertError = $state("");
  let parsed = $state(undefined);
  let collapsed = $state({});
  let copied = $state("");
  let seededFold = false;

  const zh = $derived(String(locale || "").toLowerCase().startsWith("zh"));
  const t = (zhText, en) => pick(locale, zhText, en);
  const rightError = $derived(actionError || parseError || (rightMode === "tree" ? "" : convertError));
  const inputError = $derived(inputLimitError(jsonText, INPUT_LIMITS.json, t("JSON 输入", "JSON input")));

  $effect(() => {
    if (initialOptions.mode === "extract") untrack(() => { rightMode = "extract"; });
  });

  $effect(() => {
    const text = jsonText;
    actionError = "";
    const timer = setTimeout(() => {
      if (!text.trim()) {
        parsed = undefined;
        parseError = "";
        seededFold = false;
        collapsed = {};
        return;
      }
      if (inputError) {
        parsed = undefined;
        parseError = inputError;
        return;
      }
      try {
        const value = parseSafeJson(text);
        parsed = value;
        parseError = "";
        if (!seededFold) {
          collapsed = defaultCollapsed(value);
          seededFold = true;
        }
      } catch (err) {
        parsed = undefined;
        parseError = precisionErrorMessage(err, locale);
      }
    }, 160);
    return () => clearTimeout(timer);
  });

  function flash(kind) {
    copied = kind;
    setTimeout(() => {
      if (copied === kind) copied = "";
    }, 1200);
  }

  function wrap(fn) {
    try {
      actionError = "";
      fn();
    } catch (err) {
      actionError = precisionErrorMessage(err, locale);
    }
  }

  function rewriteJson(dir) {
    jsonText = pretty ? formatJson(jsonText, 2, dir) : minifyJson(jsonText, dir);
  }

  function format() {
    wrap(() => {
      if (sortKeys) captureUnsorted();
      jsonText = formatJson(jsonText, 2, sortKeys);
      pretty = true;
    });
  }

  function minify() {
    wrap(() => {
      if (sortKeys) captureUnsorted();
      jsonText = minifyJson(jsonText, sortKeys);
      pretty = false;
    });
  }

  function captureUnsorted() {
    if (unsortedValue !== undefined) return;
    unsortedValue = parseLosslessJson(jsonText);
  }

  function setSortDir(dir, checked) {
    if (!checked) {
      if (sortKeys === dir) restoreUnsorted();
      return;
    }
    if (!jsonText.trim()) {
      sortKeys = dir;
      return;
    }
    wrap(() => {
      captureUnsorted();
      rewriteJson(dir);
      sortKeys = dir;
    });
  }

  function restoreUnsorted() {
    if (unsortedValue === undefined || !jsonText.trim()) {
      sortKeys = false;
      unsortedValue = undefined;
      return;
    }
    wrap(() => {
      jsonText = serializeJson(restoreKeyOrder(parseLosslessJson(jsonText), unsortedValue), pretty);
      sortKeys = false;
      unsortedValue = undefined;
    });
  }

  function toggleMore() {
    moreOpen = !moreOpen;
  }

  $effect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event) => {
      if (moreEl && !moreEl.contains(event.target)) moreOpen = false;
    };
    const onKey = (event) => {
      if (event.key === "Escape") moreOpen = false;
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  });

  function toUnicode() {
    wrap(() => {
      jsonText = chineseToUnicode(jsonText);
    });
  }

  function fromUnicode() {
    wrap(() => {
      jsonText = unicodeToChinese(jsonText);
    });
  }

  function escapeText() {
    wrap(() => {
      jsonText = addJsonEscape(jsonText);
      parsed = undefined;
      seededFold = false;
    });
  }

  function unescapeText() {
    wrap(() => {
      jsonText = removeJsonEscape(jsonText);
    });
  }

  function writeTree(next) {
    next = toSafeJsonValue(next);
    if (sortKeys && unsortedValue === undefined) {
      try {
        unsortedValue = parseLosslessJson(jsonText);
      } catch {
        /* keep going */
      }
    }
    const value = sortKeys ? sortValue(next, sortKeys) : next;
    jsonText = serializeJson(value, pretty);
    parsed = value;
    actionError = "";
  }

  function currentJson() {
    return parseSafeJson(jsonText);
  }

  function onToggle(path) {
    collapsed = { ...collapsed, [path]: !collapsed[path] };
  }

  function onDelete(path) {
    wrap(() => writeTree(deletePath(currentJson(), path)));
  }

  function onEdit(path, value) {
    wrap(() => writeTree(setPath(currentJson(), path, value)));
  }

  function onAdd(path) {
    wrap(() => {
      writeTree(addChild(currentJson(), path, locale));
      if (collapsed[path]) collapsed = { ...collapsed, [path]: false };
    });
  }

  function onRename(path, nextKey) {
    wrap(() => writeTree(renamePath(currentJson(), path, nextKey)));
  }

  function expandAll() {
    collapsed = {};
  }

  function collapseAll() {
    if (parsed === undefined) return;
    collapsed = collapseAllPaths(parsed);
  }

  async function copyText(text, kind) {
    if (!text) return;
    actionError = "";
    try {
      await copyToClipboard(text);
      flash(kind);
    } catch {
      actionError = t("复制失败，请选择文本后手动复制。", "Copy failed. Select the text and copy it manually.");
    }
  }

  function clearAll() {
    jsonText = "";
    convertOut = "";
    parsed = undefined;
    actionError = "";
    parseError = "";
    convertError = "";
    collapsed = {};
    seededFold = false;
    sortKeys = false;
    unsortedValue = undefined;
  }

  const MIN_PANE = 200;
  let splitEl = $state(null);
  let leftPct = $state(50);
  let dragging = $state(false);
  let dragStart = null;

  function splitWidth() {
    return splitEl?.getBoundingClientRect().width || 0;
  }

  function clampLeft(pct, total) {
    const width = total || splitWidth();
    if (width < MIN_PANE * 2 + 8) return 50;
    const minPct = (MIN_PANE / width) * 100;
    return Math.min(100 - minPct, Math.max(minPct, pct));
  }

  function onResizePointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const total = splitWidth();
    if (total < MIN_PANE * 2 + 8) return;
    dragStart = { x: event.clientX, pct: leftPct, total };
    dragging = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onResizePointerMove(event) {
    if (!dragStart) return;
    const dx = event.clientX - dragStart.x;
    leftPct = clampLeft(dragStart.pct + (dx / dragStart.total) * 100, dragStart.total);
  }

  function onResizePointerUp() {
    dragStart = null;
    dragging = false;
  }

  function onResizeKey(event) {
    const step = event.shiftKey ? 5 : 2;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      leftPct = clampLeft(leftPct - step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      leftPct = clampLeft(leftPct + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      leftPct = clampLeft(0);
    } else if (event.key === "End") {
      event.preventDefault();
      leftPct = clampLeft(100);
    }
  }

  $effect(() => {
    const el = splitEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (el.getBoundingClientRect().width <= 0) return;
      const next = clampLeft(leftPct, el.getBoundingClientRect().width);
      if (Math.abs(next - leftPct) > 0.05) leftPct = next;
    });
    ro.observe(el);
    return () => ro.disconnect();
  });

  $effect(() => {
    if (rightMode !== "convert" && rightMode !== "generate") return;
    const text = jsonText;
    const lang = convertLang;
    const table = tableName;
    const sort = sortKeys;
    convertOut = "";
    convertError = "";
    const timer = setTimeout(() => {
      if (!text.trim()) {
        convertOut = "";
        return;
      }
      try {
        convertOut = convertJsonToLang(text, lang, { table, sortKeys: sort });
      } catch (err) {
        convertOut = "";
        convertError = precisionErrorMessage(err, locale);
      }
    }, 180);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (rightMode !== "extract") return;
    const text = jsonText;
    const path = jsonPath;
    convertOut = "";
    convertError = "";
    const timer = setTimeout(() => {
      if (!text.trim()) {
        convertOut = "";
        return;
      }
      if (inputError) {
        convertOut = "";
        convertError = inputError;
        return;
      }
      try {
        convertOut = runJsonPath(text, path);
      } catch (err) {
        convertOut = "";
        convertError = precisionErrorMessage(err, locale);
      }
    }, 180);
    return () => clearTimeout(timer);
  });

  function showMode(mode) {
    rightMode = mode;
    if (mode === "convert" && !formatLanguages.has(convertLang)) convertLang = "yaml";
    if (mode === "generate" && formatLanguages.has(convertLang)) convertLang = "typescript";
  }
</script>

<div class="json-workbench">
  <div class="json-split" class:dragging bind:this={splitEl} style:--left-pct="{leftPct}%">
    <section class="json-pane json-pane-left">
      <div class="json-pane-bar">
        <div class="json-pane-bar-start">
          <button class="dbx-btn" onclick={format} type="button">{t("格式化", "Format")}</button>
          <button class="dbx-btn" onclick={minify} type="button">{t("压缩", "Minify")}</button>
          <div class="json-more" bind:this={moreEl}>
            <button
              class="dbx-btn"
              class:active={moreOpen}
              aria-expanded={moreOpen}
              aria-haspopup="true"
              onclick={toggleMore}
              type="button"
            >
              {t("更多", "More")}
            </button>
            {#if moreOpen}
              <div class="json-more-menu" role="group" aria-label={t("更多选项", "More options")}>
                <label class="json-more-item">
                  <input type="checkbox" bind:checked={showLineNumbers} />
                  <span>{t("显示行号", "Line numbers")}</span>
                </label>
                <label class="json-more-item">
                  <input
                    type="checkbox"
                    checked={sortKeys === "asc"}
                    onchange={(event) => setSortDir("asc", event.currentTarget.checked)}
                  />
                  <span>{t("升序排列 key", "Sort keys A–Z")}</span>
                </label>
                <label class="json-more-item">
                  <input
                    type="checkbox"
                    checked={sortKeys === "desc"}
                    onchange={(event) => setSortDir("desc", event.currentTarget.checked)}
                  />
                  <span>{t("降序排列 key", "Sort keys Z–A")}</span>
                </label>
              </div>
            {/if}
          </div>
        </div>
        <div class="json-pane-bar-end">
          <button
            class="dbx-btn dbx-btn--ghost json-icon-btn"
            onclick={() => copyText(jsonText, "json")}
            type="button"
            title={copied === "json" ? t(chrome.copied.zh, chrome.copied.en) : t("复制", "Copy")}
            aria-label={copied === "json" ? t(chrome.copied.zh, chrome.copied.en) : t("复制", "Copy")}
          >
            {#if copied === "json"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
            {:else}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
            {/if}
          </button>
          <button
            class="dbx-btn dbx-btn--ghost json-icon-btn"
            onclick={clearAll}
            type="button"
            title={t(chrome.clear.zh, chrome.clear.en)}
            aria-label={t(chrome.clear.zh, chrome.clear.en)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="json-editor-wrap" style:--json-editor-bottom-space="{textActionsHeight + 24}px">
        <JsonCodeEditor bind:value={jsonText} {showLineNumbers} {locale} ariaLabel={t("JSON 文本编辑器", "JSON text editor")} maxLength={INPUT_LIMITS.json} placeholder={'{ "name": "dbx" }'} />
        <div class="json-text-actions" bind:clientHeight={textActionsHeight} role="group" aria-label={t("中文与转义", "Unicode and escaping")}>
          {#each [[toUnicode, "中文转 Unicode", "Chinese → Unicode"], [fromUnicode, "Unicode 转中文", "Unicode → Chinese"], [escapeText, "添加转义", "Escape"], [unescapeText, "去除转义", "Unescape"]] as [action, labelZh, labelEn]}
            <button class="dbx-btn" onclick={action} type="button">{t(labelZh, labelEn)}</button>
          {/each}
        </div>
      </div>
    </section>

    <button
      class="json-resizer"
      class:dragging
      type="button"
      aria-label={t("调整左右宽度", "Resize panes")}
      onpointerdown={onResizePointerDown}
      onpointermove={onResizePointerMove}
      onpointerup={onResizePointerUp}
      onpointercancel={onResizePointerUp}
      onkeydown={onResizeKey}
    ></button>

    <section class="json-pane json-pane-right">
      <div class="json-pane-bar">
        <div class="json-pane-bar-start">
          <div class="json-modes" role="group" aria-label={t("JSON 功能", "JSON tools")}>
            {#each [["tree", "树形编辑", "Tree"], ["extract", "路径提取", "Extract"], ["convert", "格式转换", "Convert"], ["generate", "代码生成", "Generate code"]] as [mode, labelZh, labelEn]}
              <button class="dbx-btn" class:active={rightMode === mode} aria-pressed={rightMode === mode} onclick={() => showMode(mode)} type="button">{t(labelZh, labelEn)}</button>
            {/each}
          </div>
          {#if rightMode === "extract"}
            <input
              class="dbx-input mono json-path-input"
              spellcheck="false"
              placeholder="$.items[*].id"
              bind:value={jsonPath}
              aria-label={t("JSONPath", "JSONPath")}
            />
          {:else if rightMode === "convert" || rightMode === "generate"}
            <Select
              class="json-lang-select"
              bind:value={convertLang}
              ariaLabel={t("目标语言", "Language")}
              options={availableLanguages.map((lang) => ({ value: lang.value, label: zh ? lang.zh : lang.en }))}
            />
            {#if convertLang === "mysql"}
              <input class="dbx-input json-table-input" placeholder="users" bind:value={tableName} aria-label={t("表名", "Table")} />
            {/if}
          {/if}
        </div>
        <div class="json-pane-bar-end">
          {#if rightMode === "tree"}
            <button
              class="dbx-btn"
              disabled={parsed === undefined}
              onclick={expandAll}
              type="button"
              title={t("展开全部节点", "Expand all nodes")}
            >
              {t("全展开", "Expand all")}
            </button>
            <button
              class="dbx-btn"
              disabled={parsed === undefined}
              onclick={collapseAll}
              type="button"
              title={t("折叠全部节点", "Collapse all nodes")}
            >
              {t("全折叠", "Collapse all")}
            </button>
          {:else}
            <button
              class="dbx-btn dbx-btn--ghost json-icon-btn"
              onclick={() => copyText(convertOut, "out")}
              type="button"
              title={copied === "out" ? t(chrome.copied.zh, chrome.copied.en) : t("复制输出", "Copy output")}
              aria-label={copied === "out" ? t(chrome.copied.zh, chrome.copied.en) : t("复制输出", "Copy output")}
            >
              {#if copied === "out"}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5"></path>
                </svg>
              {:else}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
              {/if}
            </button>
          {/if}
        </div>
      </div>

      <div class="json-result">
        {#if rightError}
          <p class="json-result-error" role="status">{rightError}</p>
        {/if}
        {#if rightMode === "tree"}
          {#if parsed !== undefined || !rightError}
            <JsonTreeView value={parsed} {collapsed} {onToggle} {onAdd} {onDelete} {onEdit} {onRename} {locale} />
          {/if}
        {:else}
          <pre class="out json-convert-out">{convertOut}</pre>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .json-modes { display: flex; flex-wrap: wrap; gap: 6px; }
  .json-modes .active { background: var(--dbx-selection-background); border-color: var(--dbx-selection-border); color: var(--dbx-selection-foreground); }
  .json-workbench {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .json-split {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 0;
  }
  .json-split.dragging {
    cursor: col-resize;
    user-select: none;
  }
  .json-pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .json-pane-left {
    flex: 0 0 var(--left-pct);
    width: var(--left-pct);
    min-width: 200px;
    max-width: calc(100% - 208px);
  }
  .json-pane-right {
    flex: 1 1 0;
    min-width: 200px;
  }
  .json-resizer {
    flex: 0 0 8px;
    width: 8px;
    margin: 0 2px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    cursor: col-resize;
    position: relative;
    touch-action: none;
    align-self: stretch;
  }
  .json-resizer::after {
    content: "";
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 3px;
    width: 2px;
    border-radius: 1px;
    background: var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
  }
  .json-resizer:hover::after,
  .json-resizer:focus-visible::after,
  .json-resizer.dragging::after {
    background: var(--color-primary);
  }
  .json-resizer:focus-visible {
    outline: 2px solid var(--color-ring, var(--color-primary));
    outline-offset: 1px;
  }
  .json-pane-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }
  .json-pane-bar-start {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-width: 0;
  }
  .json-pane-bar-end {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-left: auto;
    flex-shrink: 0;
  }
  .json-icon-btn {
    width: 30px;
    padding: 0;
  }
  .json-pane-bar :global(.dbx-btn.active) {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
  }
  .json-pane-bar :global(.json-lang-select) {
    width: auto;
    min-width: 148px;
    max-width: 200px;
    flex: 0 0 auto;
  }
  .json-pane-bar :global(input.json-table-input) {
    width: 120px;
    flex: 0 0 auto;
  }
  .json-pane-bar :global(input.json-path-input) {
    min-width: 12rem;
    max-width: 22rem;
    flex: 1 1 12rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .json-more {
    position: relative;
    flex-shrink: 0;
  }
  .json-more-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 12;
    min-width: 168px;
    padding: 6px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-popover, var(--color-card, var(--color-background, Canvas)));
    box-shadow: 0 10px 28px color-mix(in srgb, CanvasText 16%, transparent);
    transform-origin: top left;
    animation: json-more-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .json-more-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;
  }
  .json-more-item:hover {
    background: var(--color-accent, var(--color-muted, color-mix(in srgb, var(--color-foreground, CanvasText) 6%, transparent)));
  }
  .json-more-item input {
    margin: 0;
  }
  @keyframes json-more-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .json-result {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    overflow: hidden;
  }
  .json-result-error {
    margin: 0;
    padding: 12px;
    min-height: 0;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 13px;
    line-height: 1.6;
    color: var(--color-destructive);
  }
  .json-convert-out {
    flex: 1;
    min-height: 0;
    margin: 10px 12px 12px;
    overflow: auto;
    border: 0;
    padding: 0;
    background: transparent;
  }
  .json-editor-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .json-text-actions {
    position: absolute;
    left: 12px;
    bottom: 12px;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: max-content;
    max-width: calc(100% - 24px);
    box-sizing: border-box;
    padding: 6px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-popover, var(--color-card, var(--color-background, Canvas)));
    box-shadow: 0 4px 16px color-mix(in srgb, CanvasText 12%, transparent);
  }
  @media (max-width: 860px) {
    .json-split {
      flex-direction: column;
    }
    .json-pane-left,
    .json-pane-right {
      flex: 1 1 auto;
      width: auto;
      min-width: 0;
      max-width: none;
    }
    .json-resizer {
      display: none;
    }
  }
</style>
