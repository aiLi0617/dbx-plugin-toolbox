<script>
  import JsonTreeNode from "./JsonTreeNode.svelte";
  import { childCount, encodePointer, hoverDistance, hoverRelation, hoverTint, isContainer, parseLeaf } from "./jsonOps.js";

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
    locale = "zh-CN",
  } = $props();

  let editing = $state(false);
  let draft = $state("");
  let inputEl = $state(null);
  let editingKey = $state(false);
  let keyDraft = $state("");
  let keyInputEl = $state(null);

  const container = $derived(isContainer(value));
  const count = $derived(childCount(value));
  const folded = $derived(Boolean(collapsed[path]));
  const isArray = $derived(Array.isArray(value));
  const entries = $derived(
    container
      ? isArray
        ? value.map((item, i) => [String(i), item])
        : Object.entries(value)
      : [],
  );
  const openBrace = $derived(isArray ? "[" : "{");
  const closeBrace = $derived(isArray ? "]" : "}");
  const delLabel = $derived(locale.toLowerCase().startsWith("zh") ? "删除" : "Delete");
  const zh = $derived(locale.toLowerCase().startsWith("zh"));
  const addTitle = $derived(isArray ? (zh ? "添加元素" : "Add item") : (zh ? "添加属性" : "Add property"));
  const canDelete = $derived(path !== "");
  const relation = $derived(hoverRelation(path, hoverPath));
  const distance = $derived(hoverDistance(path, hoverPath));
  const tint = $derived(relation === "none" ? 0 : hoverTint(distance));

  function displayValue(v) {
    if (typeof v === "string") return JSON.stringify(v);
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
    onEdit?.(path, parseLeaf(draft));
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
          title={folded ? (zh ? "展开" : "Expand") : (zh ? "收起" : "Collapse")}
        >
          <span class="json-twist-icon"></span>
        </button>
      {/if}
      <span class="json-brace">
        {#if count === 0}
          {openBrace}
        {:else}
          <span class="json-count" title={isArray ? `${count} items` : `${count} keys`}>{openBrace} {count}</span>
        {/if}
      </span>
      <button class="json-plus" onclick={() => onAdd?.(path)} type="button" title={addTitle} aria-label={addTitle}>+</button>
      {#if folded || count === 0}
        <span class="json-brace">{closeBrace}</span>
        {#if !isLast}<span class="json-comma">,</span>{/if}
      {/if}
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
    {:else if editing}
      <input
        class="json-edit"
        bind:this={inputEl}
        bind:value={draft}
        onblur={commit}
        onkeydown={onEditKey}
      />
      {#if !isLast}<span class="json-comma">,</span>{/if}
    {:else}
      <button
        class="json-val"
        class:json-val--string={typeof value === "string"}
        class:json-val--number={typeof value === "number"}
        class:json-val--boolean={typeof value === "boolean"}
        class:json-val--null={value === null}
        onclick={startEdit}
        type="button"
      >{displayValue(value)}</button>
      {#if !isLast}<span class="json-comma">,</span>{/if}
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
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
          {onAdd}
          {onDelete}
          {onEdit}
          {onRename}
          {onHover}
          {locale}
        />
      {/each}
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="json-line json-close"
      onmouseenter={() => onHover?.(path)}
    >
      <span class="json-brace">{closeBrace}</span>
      {#if !isLast}<span class="json-comma">,</span>{/if}
      {#if canDelete}
        <button class="json-del" onclick={() => onDelete?.(path)} type="button">{delLabel}</button>
      {/if}
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
      var(--color-accent, var(--color-muted, var(--json-ink, CanvasText))) calc(var(--hover-tint, 4) * 1%),
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
  }
  .json-children {
    padding-left: 18px;
    border-left: 1px solid color-mix(in srgb, var(--color-border, CanvasText) 72%, transparent);
    margin-left: 7px;
  }
  .json-key {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    color: var(--color-warning);
    font-weight: 500;
    cursor: text;
    border-radius: var(--radius-sm, 4px);
  }
  .json-key:hover {
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
    outline: 2px solid var(--color-ring, var(--color-primary));
    outline-offset: 1px;
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
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    text-align: left;
    cursor: text;
    max-width: 100%;
    word-break: break-word;
    white-space: pre-wrap;
    border-radius: var(--radius-sm, 4px);
  }
  .json-val:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .json-val--string {
    color: var(--color-success);
  }
  .json-val--number {
    color: var(--color-info);
  }
  .json-val--boolean,
  .json-val--null {
    color: var(--color-destructive);
  }
  .json-edit {
    min-width: 8em;
    max-width: 100%;
    height: 22px;
    padding: 0 6px;
    border: 1px solid var(--color-ring, var(--color-primary));
    border-radius: var(--radius-sm, 4px);
    background: var(--color-background, Canvas);
    color: inherit;
    font: inherit;
  }
  .json-edit-key {
    min-width: 6em;
    color: var(--color-warning);
    font-weight: 500;
  }
  .json-del {
    opacity: 0;
    pointer-events: none;
    margin-left: auto;
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
