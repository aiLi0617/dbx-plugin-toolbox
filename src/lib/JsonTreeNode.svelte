<script>
  import { pick } from "./i18n.js";
  import JsonTreeNode from "./JsonTreeNode.svelte";
  import {
    addChild,
    childCount,
    deletePath,
    embeddedJsonParseError,
    encodePointer,
    hoverDistance,
    hoverRelation,
    hoverTint,
    isContainer,
    parseEmbeddedJsonInfo,
    parseTreeEdit,
    renamePath,
    serializeEmbeddedJson,
    setPath,
  } from "./jsonOps.js";
  import { isLosslessNumber } from "./jsonPrecision.js";

  let {
    value,
    path = "",
    keyName = undefined,
    isLast = true,
    collapsed = {},
    hoverPath = null,
    onToggle,
    onAdd,
    onDelete,
    onEdit,
    onRename,
    onHover,
    parseEmbedded = false,
    locale = "zh-CN",
    embeddedDepth = 0,
  } = $props();

  let editing = $state(false);
  let draft = $state("");
  let inputEl = $state(null);
  let editingKey = $state(false);
  let keyDraft = $state("");
  let keyInputEl = $state(null);

  const embeddedInfo = $derived(parseEmbedded && embeddedDepth < 8 ? parseEmbeddedJsonInfo(value, 8 - embeddedDepth) : undefined);
  const embeddedValue = $derived(embeddedInfo?.value);
  const embeddedError = $derived(parseEmbedded && embeddedDepth < 8 && !embeddedInfo ? embeddedJsonParseError(value, 8 - embeddedDepth) : "");
  const renderedValue = $derived(embeddedValue ?? value);
  const embedded = $derived(embeddedValue !== undefined);
  const container = $derived(isContainer(renderedValue));
  const count = $derived(childCount(renderedValue));
  const folded = $derived(Boolean(collapsed[path]));
  const isArray = $derived(Array.isArray(renderedValue));
  const entries = $derived(
    container
      ? isArray
        ? renderedValue.map((item, i) => [String(i), item])
        : Object.entries(renderedValue)
      : [],
  );
  const openBrace = $derived(isArray ? "[" : "{");
  const closeBrace = $derived(isArray ? "]" : "}");
  const t = (zh, en) => pick(locale, zh, en);
  const delLabel = $derived(t("删除", "Delete"));
  const addTitle = $derived(isArray ? t("添加元素", "Add item") : t("添加属性", "Add property"));
  const canDelete = $derived(path !== "");
  const relation = $derived(hoverRelation(path, hoverPath));
  const distance = $derived(hoverDistance(path, hoverPath));
  const tint = $derived(relation === "none" ? 0 : hoverTint(distance));
  const multilineValue = $derived(typeof value === "string" && /[\r\n]/.test(value));
  const editColumns = $derived(editColumnCount(draft, 60));
  const keyEditColumns = $derived(Math.min(40, Math.max(2, Array.from(keyDraft).length || 1)));

  function editColumnCount(text, max) {
    let longest = 0;
    for (const line of String(text).split(/\r\n|\r|\n/)) longest = Math.max(longest, Array.from(line).length);
    return Math.min(max, Math.max(2, longest || 1));
  }

  function displayValue(v) {
    if (typeof v === "string") return v;
    if (v === null) return "null";
    return String(v);
  }

  function startEdit() {
    if (container || !onEdit) return;
    draft = typeof value === "string" ? value : displayValue(value);
    editing = true;
    queueMicrotask(() => inputEl?.select());
  }

  function commit() {
    if (!editing) return;
    editing = false;
    onEdit?.(path, parseTreeEdit(draft, parseEmbedded, value));
  }

  function cancel() {
    editing = false;
  }

  function onEditKey(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function onMultilineEditKey(event) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function startKeyEdit() {
    if (keyName === undefined || !onRename) return;
    keyDraft = keyName;
    editingKey = true;
    queueMicrotask(() => keyInputEl?.select());
  }

  function commitKey() {
    if (!editingKey) return;
    editingKey = false;
    const next = keyDraft.trim();
    if (!next || next === keyName) return;
    onRename?.(path, next);
  }

  function cancelKey() {
    editingKey = false;
  }

  function onKeyNameKey(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitKey();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelKey();
    }
  }

  function embeddedPath(targetPath) {
    if (!path) return targetPath;
    if (targetPath === path) return "";
    return targetPath.startsWith(`${path}/`) ? targetPath.slice(path.length) : targetPath;
  }

  function writeEmbedded(next) {
    onEdit?.(path, serializeEmbeddedJson(next, embeddedInfo?.layers));
  }

  function addEmbedded(targetPath) {
    writeEmbedded(addChild(embeddedValue, embeddedPath(targetPath), locale));
  }

  function deleteEmbedded(targetPath) {
    writeEmbedded(deletePath(embeddedValue, embeddedPath(targetPath)));
  }

  function editEmbedded(targetPath, nextValue) {
    writeEmbedded(setPath(embeddedValue, embeddedPath(targetPath), nextValue));
  }

  function renameEmbedded(targetPath, nextKey) {
    writeEmbedded(renamePath(embeddedValue, embeddedPath(targetPath), nextKey));
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="json-node"
  class:hover-self={relation === "self"}
  class:hover-fill={relation !== "none"}
  style:--hover-tint={tint}
  onmouseenter={() => onHover?.(path)}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="json-line"
    onmouseenter={() => onHover?.(path)}
  >
    {#if keyName !== undefined}
      {#if editingKey}
        <input
          class="json-edit json-edit-key"
          bind:this={keyInputEl}
          bind:value={keyDraft}
          size={keyEditColumns}
          onblur={commitKey}
          onkeydown={onKeyNameKey}
        />
      {:else}
        <button class="json-key" onclick={startKeyEdit} type="button">{keyName}</button>
      {/if}
      <span class="json-colon"> : </span>
    {/if}

    {#if container}
      {#if count > 0}
        <button
          class="json-twist"
          class:is-folded={folded}
          onclick={() => onToggle?.(path)}
          type="button"
          aria-expanded={String(!folded)}
          title={folded ? t("展开", "Expand") : t("收起", "Collapse")}
        >
          <span class="json-twist-icon"></span>
        </button>
      {/if}
      <span class="json-brace">
        {#if embedded}<span class="json-embedded" title={t("原始值是 JSON 字符串，内部修改会自动写回字符串", "The original value is a JSON string; nested edits are written back to the string")}>{t("JSON 字符串", "JSON string")}</span>{/if}
        {#if count === 0}
          {openBrace}
        {:else}
          <span class="json-count" title={isArray ? `${count} items` : `${count} keys`}>{openBrace} {count}</span>
        {/if}
      </span>
      <button class="json-plus" onclick={() => embedded ? addEmbedded(path) : onAdd?.(path)} type="button" title={addTitle} aria-label={addTitle}>+</button>
      {#if folded || count === 0}
        <span class="json-brace">{closeBrace}</span>
      {/if}
      {#if canDelete && (folded || count === 0)}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
      {#if (folded || count === 0) && !isLast}<span class="json-comma">,</span>{/if}
    {:else if editing}
      {#if multilineValue}
        <span class="json-multiline-edit-shell">
          <span class="json-val json-val--string json-multiline-sizer" aria-hidden="true">{displayValue(value)}</span>
          <textarea
            class="json-edit json-edit-multiline"
            bind:this={inputEl}
            bind:value={draft}
            onblur={commit}
            onkeydown={onMultilineEditKey}
          ></textarea>
        </span>
      {:else}
        <input
          class="json-edit"
          bind:this={inputEl}
          bind:value={draft}
          size={editColumns}
          onblur={commit}
          onkeydown={onEditKey}
        />
      {/if}
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
      {#if !isLast}<span class="json-comma">,</span>{/if}
    {:else}
      {#if embeddedError}
        <span class="json-embedded-error" title={embeddedError}>{t("嵌套解析失败", "Nested parse failed")}</span>
      {/if}
      <button
        class="json-val"
        class:json-val--string={typeof value === "string"}
        class:json-val--empty-string={typeof value === "string" && value.length === 0}
        class:json-val--number={typeof value === "number" || typeof value === "bigint" || isLosslessNumber(value)}
        class:json-val--boolean={typeof value === "boolean"}
        class:json-val--null={value === null}
        onclick={startEdit}
        type="button"
      >{typeof value === "string" && value.length === 0 ? t("字符串值", "String value") : displayValue(value)}</button>
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
      {#if !isLast}<span class="json-comma">,</span>{/if}
    {/if}
  </div>

  {#if container && !folded && count > 0}
    <div class="json-children">
      {#each entries as [k, v], i (`${path}/${encodePointer(isArray ? String(i) : k)}`)}
        <JsonTreeNode
          value={v}
          path={`${path}/${encodePointer(isArray ? String(i) : k)}`}
          keyName={isArray ? undefined : k}
          isLast={i === entries.length - 1}
          {collapsed}
          {hoverPath}
          {onToggle}
          onAdd={embedded ? addEmbedded : onAdd}
          onDelete={embedded ? deleteEmbedded : onDelete}
          onEdit={embedded ? editEmbedded : onEdit}
          onRename={embedded ? renameEmbedded : onRename}
          {onHover}
          {parseEmbedded}
          {locale}
          embeddedDepth={embeddedDepth + (embeddedInfo?.layers ?? 0)}
        />
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="json-line json-close"
      onmouseenter={() => onHover?.(path)}
    >
      <span class="json-brace">{closeBrace}</span>
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
      {#if !isLast}<span class="json-comma">,</span>{/if}
    </div>
  {/if}
</div>

<style>
  .json-node {
    min-width: 0;
    border-radius: var(--radius-sm, 4px);
  }
  .json-node.hover-fill {
    background: color-mix(
      in srgb,
      var(--json-ink, CanvasText) calc(var(--hover-tint, 4) * 1%),
      transparent
    );
  }
  .json-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 2px;
    min-height: 24px;
    padding: 1px 4px 1px 0;
    border-radius: var(--radius-sm, 4px);
    width: 100%;
  }
  .json-children {
    padding-left: 18px;
    border-left: 1px solid color-mix(in srgb, var(--color-border, CanvasText) 72%, transparent);
    margin-left: 7px;
  }
  .json-key {
    border: 1px solid transparent;
    background: transparent;
    padding: 0 4px;
    font: inherit;
    color: var(--color-warning);
    font-weight: 500;
    cursor: text;
    border-radius: var(--radius-sm, 4px);
  }
  .json-key:hover {
    border-color: var(--color-border, color-mix(in srgb, CanvasText 20%, transparent));
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .json-colon,
  .json-comma,
  .json-brace {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 62%, transparent));
  }
  .json-count {
    font-variant-numeric: tabular-nums;
  }
  .json-embedded {
    display: inline-flex;
    align-items: center;
    height: 18px;
    margin-right: 5px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--color-info) 35%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-info) 10%, transparent);
    color: var(--color-info);
    font-family: var(--font-sans);
    font-size: 10px;
    line-height: 16px;
    white-space: nowrap;
  }
  .json-embedded-error {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 5px;
    border: 1px solid color-mix(in srgb, var(--color-destructive) 35%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-destructive) 9%, transparent);
    color: var(--color-destructive);
    font-family: var(--font-sans);
    font-size: 10px;
    line-height: 16px;
    white-space: nowrap;
  }
  .json-twist {
    flex: 0 0 20px;
    width: 20px;
    height: 20px;
    margin-right: 2px;
    border: 1px solid transparent;
    padding: 0;
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 55%, transparent));
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 4px);
  }
  .json-twist:hover {
    border-color: var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
  }
  .json-twist:focus-visible,
  .json-plus:focus-visible,
  .json-val:focus-visible,
  .json-key:focus-visible,
  .json-del:focus-visible {
    outline: none;
    box-shadow: var(--dbx-focus-ring);
  }
  .json-twist-icon {
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 4px 0 4px 6px;
    border-color: transparent transparent transparent currentColor;
    transform-origin: 35% 50%;
    transform: rotate(90deg);
  }
  .json-twist.is-folded .json-twist-icon {
    transform: rotate(0deg);
  }
  .json-plus {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 20px;
    width: 20px;
    height: 20px;
    border: 1px solid transparent;
    background: transparent;
    padding: 0;
    margin: 0;
    color: var(--color-primary, var(--color-foreground, CanvasText));
    font-size: 16px;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    border-radius: var(--radius-sm, 4px);
  }
  .json-plus:hover {
    border-color: var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
  }
  .json-val {
    min-height: 22px;
    border: 1px solid transparent;
    background: transparent;
    padding: 0 6px;
    font: inherit;
    text-align: left;
    cursor: text;
    max-width: 100%;
    word-break: break-word;
    white-space: pre-wrap;
    border-radius: var(--radius-sm, 4px);
  }
  .json-val:hover {
    border-color: var(--color-border, color-mix(in srgb, CanvasText 20%, transparent));
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .json-val--string {
    color: var(--color-success);
  }
  .json-val--empty-string {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 55%, transparent));
  }
  .json-val--number {
    color: var(--color-info);
  }
  .json-val--boolean,
  .json-val--null {
    color: var(--color-destructive);
  }
  .json-edit {
    flex: 0 1 auto;
    width: auto;
    min-width: 3ch;
    max-width: min(100%, 64ch);
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--color-ring, var(--color-primary));
    border-radius: var(--radius-sm, 4px);
    background: var(--color-background, Canvas);
    color: inherit;
    font: inherit;
  }
  .json-edit-key {
    min-width: 3ch;
    max-width: min(100%, 44ch);
    color: var(--color-warning);
    font-weight: 500;
  }
  .json-edit-multiline {
    position: absolute;
    inset: 0;
    width: 100%;
    max-width: none;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    line-height: 1.5;
    resize: none;
    overflow: auto;
  }
  .json-multiline-edit-shell {
    position: relative;
    display: inline-flex;
    min-width: 3ch;
    max-width: 100%;
  }
  .json-multiline-sizer {
    visibility: hidden;
    pointer-events: none;
  }
  .json-del {
    opacity: 0;
    pointer-events: none;
    flex: 0 0 auto;
    margin: 0 2px 0 5px;
    height: 20px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 4px);
    background: transparent;
    color: var(--color-destructive);
    font-size: 12px;
    line-height: 20px;
  }
  .json-node.hover-fill > .json-line .json-del,
  .json-node.hover-self > .json-line .json-del,
  .json-del:focus {
    opacity: 1;
    pointer-events: auto;
  }
  .json-del:hover {
    border-color: color-mix(in srgb, var(--color-destructive) 40%, transparent);
    background: color-mix(in srgb, var(--color-destructive) 12%, transparent);
  }
</style>
