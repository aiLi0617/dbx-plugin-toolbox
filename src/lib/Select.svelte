<script>
  import { tick } from "svelte";

  let closeOpen = null;

  let {
    value = $bindable(""),
    options = [],
    class: className = "",
    disabled = false,
    ariaLabel = "",
    placeholder = "",
    fitTrigger = false,
    searchPlaceholder = "",
    searchEmptyLabel = "",
    onchange,
  } = $props();

  let open = $state(false);
  let controlEl = $state(null);
  let triggerEl = $state(null);
  let menuEl = $state(null);
  let query = $state("");
  let activeValue = $state(null);
  let keyboardFocus = $state(false);
  let pointerFocusing = false;
  let pos = $state({ top: 0, left: 0, width: 160, maxHeight: 240 });
  let search = "";
  let searchAt = 0;
  const uid = `dbx-sel-${Math.random().toString(36).slice(2, 9)}`;

  const selectedIndex = $derived(options.findIndex((opt) => String(opt.value) === String(value)));
  const selectedLabel = $derived(selectedIndex >= 0 ? options[selectedIndex].label : "");
  const shownLabel = $derived(selectedLabel || placeholder || "");
  const visibleOptions = $derived.by(() => {
    const term = query.trim().toLowerCase();
    return options.map((option, index) => ({ option, index })).filter(({ option }) =>
      !term || (option.searchable !== false && [option.label, option.group, option.value, option.keywords]
        .some((value) => String(value ?? "").toLowerCase().includes(term))));
  });
  const activeOption = $derived(visibleOptions.find(({ option }) => String(option.value) === activeValue && !option.disabled));
  const activeIndex = $derived(activeOption?.index ?? -1);
  const rows = $derived.by(() => {
    const out = [];
    let last = null;
    visibleOptions.forEach(({ option: opt, index }) => {
      const group = opt.group || "";
      if (group && group !== last) {
        out.push({ type: "group", label: group });
        last = group;
      }
      out.push({ type: "option", index, ...opt });
    });
    return out;
  });

  function portal(node) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function optionId(index) {
    return `${uid}-opt-${index}`;
  }

  function firstEnabled(from, step) {
    const enabled = visibleOptions.filter(({ option }) => !option.disabled);
    if (step > 0) return (enabled.find(({ index }) => index > from) ?? enabled[0])?.index ?? -1;
    return (enabled.findLast(({ index }) => index < from) ?? enabled.at(-1))?.index ?? -1;
  }

  function highlight(option) {
    activeValue = option && !option.disabled ? String(option.value) : null;
  }

  function place() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const triggerWidth = Math.max(rect.width, 128);
    let contentWidth = triggerWidth;
    if (menuEl && !fitTrigger) {
      const prevWidth = menuEl.style.width;
      menuEl.style.width = "max-content";
      contentWidth = Math.ceil(menuEl.getBoundingClientRect().width);
      menuEl.style.width = prevWidth;
    }
    const width = Math.min(Math.max(triggerWidth, contentWidth), vw - 16);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, vw - width - 8));
    const gap = 4;
    const below = vh - rect.bottom - 8;
    const above = rect.top - 8;
    const openUp = below < 160 && above > below;
    const maxHeight = Math.min(280, Math.max(120, openUp ? above : below));
    let top = openUp ? rect.top - gap - maxHeight : rect.bottom + gap;
    if (openUp && menuEl) {
      const height = Math.min(menuEl.scrollHeight, maxHeight);
      top = Math.max(8, rect.top - gap - height);
    }
    pos = { top, left, width, maxHeight };
  }

  async function openMenu() {
    if (disabled || open) return;
    closeOpen?.();
    open = true;
    const selected = options[selectedIndex];
    highlight(selected && !selected.disabled ? selected : options[firstEnabled(-1, 1)]);
    closeOpen = () => closeMenu(false);
    await tick();
    place();
    await tick();
    place();
    menuEl?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }

  function closeMenu(restoreFocus = true) {
    if (!open) return;
    open = false;
    if (closeOpen) closeOpen = null;
    search = "";
    query = "";
    activeValue = null;
    if (restoreFocus) {
      triggerEl?.focus({ preventScroll: true });
      if (searchPlaceholder) {
        void tick().then(() => {
          if (!open && triggerEl === document.activeElement) triggerEl?.select?.();
        });
      }
    }
  }

  function toggle() {
    if (open) closeMenu();
    else void openMenu();
  }

  function choose(opt) {
    if (!opt || opt.disabled) return;
    const next = opt.value;
    const changed = String(next) !== String(value);
    value = next;
    closeMenu();
    if (changed) onchange?.(next);
  }

  function move(step) {
    const next = firstEnabled(activeIndex, step);
    if (next < 0) return;
    highlight(options[next]);
    queueMicrotask(() => {
      menuEl?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
    });
  }

  function typeahead(char) {
    const now = Date.now();
    if (now - searchAt > 700) search = "";
    searchAt = now;
    search += char.toLowerCase();
    const start = activeIndex + 1;
    const order = options.map((_, i) => (start + i) % options.length);
    const hit = order.find((i) => !options[i].disabled && String(options[i].label || "").toLowerCase().startsWith(search));
    if (hit == null) return;
    highlight(options[hit]);
    queueMicrotask(() => {
      menuEl?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
    });
  }

  function onTriggerPointerDown() {
    pointerFocusing = true;
    keyboardFocus = false;
    setTimeout(() => {
      pointerFocusing = false;
    }, 0);
  }

  function onTriggerFocus() {
    keyboardFocus = !pointerFocusing;
  }

  async function filterOptions(event) {
    query = event.currentTarget.value;
    if (!open) void openMenu();
    highlight(options[firstEnabled(-1, 1)]);
    await tick();
    if (!open) return;
    menuEl?.scrollTo({ top: 0 });
    place();
  }

  function onSearchKey(event) {
    if (disabled || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    keyboardFocus = true;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (open) move(event.key === "ArrowUp" ? -1 : 1);
      else void openMenu();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open) choose(activeOption?.option);
      else void openMenu();
    } else if (open && event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  function onSearchFocus(event) {
    onTriggerFocus();
    if (!open) event.currentTarget.select();
  }

  function onSearchBlur(event) {
    keyboardFocus = false;
    if (!controlEl?.contains(event.relatedTarget) && !menuEl?.contains(event.relatedTarget)) closeMenu(false);
  }

  function toggleSearch() {
    triggerEl?.focus({ preventScroll: true });
    keyboardFocus = false;
    toggle();
  }

  async function onTriggerKey(event) {
    if (disabled) return;
    keyboardFocus = true;
    if (event.key === "Tab") {
      if (open) closeMenu(false);
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      closeMenu();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) await openMenu();
      move(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) await openMenu();
      const next = event.key === "Home" ? firstEnabled(-1, 1) : firstEnabled(options.length, -1);
      highlight(options[next]);
      return;
    }
    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      choose(activeOption?.option);
      return;
    }
    if (!searchPlaceholder && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!open) await openMenu();
      typeahead(event.key);
    }
  }

  $effect(() => {
    if (activeValue !== null && !activeOption) activeValue = null;
  });

  $effect(() => {
    if (!open) return;
    if (disabled) {
      closeMenu(false);
      return;
    }
    const onWin = () => place();
    const closeOverlay = () => closeMenu(false);
    const onDown = (event) => {
      const path = event.composedPath();
      if (controlEl && path.includes(controlEl)) return;
      if (menuEl && path.includes(menuEl)) return;
      closeMenu(false);
    };
    window.addEventListener("resize", onWin);
    window.addEventListener("toolbox-close-overlays", closeOverlay);
    window.addEventListener("scroll", onWin, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("toolbox-close-overlays", closeOverlay);
      window.removeEventListener("scroll", onWin, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  });
</script>

{#snippet chevron()}
  <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6"></path>
  </svg>
{/snippet}

<!-- Avoid the host kit's `.dbx-select` styles: this is a custom combobox, not a native select. -->
<div bind:this={controlEl} class="dbx-custom-select {className}" class:open>
  {#if searchPlaceholder}
    <div class="search-trigger">
      <input
        bind:this={triggerEl}
        class="trigger search-input"
        class:keyboard-focus={keyboardFocus}
        type="text"
        role="combobox"
        aria-label={ariaLabel || searchPlaceholder}
        aria-expanded={open}
        aria-controls={uid}
        aria-autocomplete="list"
        aria-activedescendant={open && activeOption ? optionId(activeOption.index) : undefined}
        placeholder={open ? searchPlaceholder : placeholder || searchPlaceholder}
        value={open ? query : selectedLabel}
        disabled={disabled}
        autocomplete="off"
        spellcheck="false"
        onclick={openMenu}
        oninput={filterOptions}
        onpointerdown={onTriggerPointerDown}
        onfocus={onSearchFocus}
        onblur={onSearchBlur}
        onkeydown={onSearchKey}
      />
      <button
        class="search-toggle"
        type="button"
        tabindex="-1"
        aria-label={searchPlaceholder}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={uid}
        disabled={disabled}
        onmousedown={(event) => event.preventDefault()}
        onclick={toggleSearch}
      >
        {@render chevron()}
      </button>
    </div>
  {:else}
    <button
      bind:this={triggerEl}
      class="trigger"
      class:placeholder={!selectedLabel}
      class:keyboard-focus={keyboardFocus}
      type="button"
      role="combobox"
      aria-autocomplete="none"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-controls={uid}
      aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
      aria-label={ariaLabel || undefined}
      disabled={disabled}
      onclick={toggle}
      onpointerdown={onTriggerPointerDown}
      onfocus={onTriggerFocus}
      onblur={() => (keyboardFocus = false)}
      onkeydown={onTriggerKey}
    >
      <span class="value">{shownLabel}</span>
      {@render chevron()}
    </button>
  {/if}
</div>

{#if open}
  <div
    bind:this={menuEl}
    class="menu"
    style="top:{pos.top}px;left:{pos.left}px;width:{pos.width}px;max-height:{pos.maxHeight}px"
    use:portal
  >
    {#if searchPlaceholder && !rows.length}
      <div class="search-empty" role="status">{searchEmptyLabel}</div>
    {/if}
    <div id={uid} class="option-list" role="listbox" aria-label={ariaLabel || undefined}>
    {#each rows as row, i (`${row.type}-${row.index ?? i}`)}
      {#if row.type === "group"}
        <div class="group" role="presentation">{row.label}</div>
      {:else}
        <div
          class="item"
          class:active={row.index === activeIndex}
          class:selected={String(row.value) === String(value)}
          data-active={row.index === activeIndex ? "true" : undefined}
          id={optionId(row.index)}
          role="option"
          tabindex="-1"
          aria-selected={String(row.value) === String(value)}
          aria-disabled={row.disabled ? "true" : undefined}
          onmousedown={(event) => {
            keyboardFocus = false;
            event.preventDefault();
          }}
          onpointerenter={() => {
            if (!row.disabled) highlight(row);
          }}
          onclick={() => choose(row)}
          onkeydown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(row);
            }
          }}
        >
          <span class="check" aria-hidden="true">
            {#if String(row.value) === String(value)}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
            {/if}
          </span>
          <span class="item-label" title={row.label}>{row.label}</span>
          {#if row.disabled}
            <svg class="disabled-mark" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9"></circle>
              <path d="m5.6 5.6 12.8 12.8"></path>
            </svg>
          {/if}
        </div>
      {/if}
    {/each}
    </div>
  </div>
{/if}

<style>
  .dbx-custom-select {
    display: inline-flex;
    width: 100%;
    min-width: 8.5rem;
    vertical-align: middle;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    height: 30px;
    padding: 0 8px 0 10px;
    border-radius: var(--radius-md, 6px);
    border: 1px solid var(--dbx-control-border);
    background: var(--dbx-control-background);
    color: var(--dbx-control-foreground);
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }
  .trigger:hover:not(:disabled) {
    background: var(--dbx-hover-background);
    color: var(--dbx-hover-foreground);
  }
  .trigger:focus {
    outline: none;
    box-shadow: none;
  }
  .trigger.keyboard-focus {
    border-color: var(--color-ring, var(--color-primary));
    outline: 1px solid var(--color-ring, var(--color-primary));
    outline-offset: -1px;
    box-shadow: none;
  }
  .trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .value {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trigger.placeholder .value {
    color: var(--color-muted-foreground);
  }
  .chevron {
    flex-shrink: 0;
    color: var(--color-muted-foreground);
    transition: transform 160ms ease;
  }
  .open .chevron {
    transform: rotate(180deg);
  }
  .menu {
    position: fixed;
    /* The menu is portaled to body, so it must sit above the settings dialog. */
    z-index: 140;
    box-sizing: border-box;
    padding: 4px;
    overflow: auto;
    border: 1px solid var(--color-border, var(--dbx-control-border));
    border-radius: var(--radius-md, 8px);
    background: var(--color-popover, var(--dbx-control-background));
    color: var(--color-popover-foreground, var(--dbx-control-foreground));
    /* The theme border separates the menu without an outer halo in either theme. */
    box-shadow: none;
    animation: dbx-select-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .search-trigger {
    position: relative;
    width: 100%;
  }
  .search-input {
    display: block;
    box-sizing: border-box;
    padding-right: 32px;
    cursor: text;
    text-overflow: ellipsis;
  }
  .search-input::placeholder {
    color: var(--color-muted-foreground);
  }
  .search-toggle {
    position: absolute;
    inset: 1px 1px 1px auto;
    display: grid;
    place-items: center;
    width: 28px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-md, 6px);
    background: transparent;
    cursor: pointer;
  }
  .search-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .search-empty {
    padding: 6px 8px;
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 9px 4px 3px;
    padding: 5px 8px 5px 9px;
    border-top: 1px solid color-mix(in srgb, var(--color-primary) 22%, transparent);
    border-left: 3px solid var(--color-primary);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    line-height: 1.2;
    color: var(--color-primary);
    white-space: nowrap;
  }
  .group:first-child {
    margin-top: 3px;
  }
  .group::after {
    content: "";
    flex: 1;
    min-width: 12px;
    height: 1px;
    background: color-mix(in srgb, var(--color-primary) 22%, transparent);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    margin: 0 4px;
    padding: 4px 8px 4px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .item.active:not([aria-disabled="true"]),
  .item:hover:not([aria-disabled="true"]) {
    background: var(--dbx-hover-background);
    color: var(--dbx-hover-foreground);
  }
  .item[aria-disabled="true"] {
    background: color-mix(in srgb, var(--color-muted) 42%, transparent);
    color: var(--color-muted-foreground);
    cursor: not-allowed;
    opacity: 0.72;
  }
  .check {
    display: inline-flex;
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    color: var(--dbx-control-foreground);
  }
  .item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .disabled-mark {
    flex: 0 0 13px;
    margin-left: auto;
    opacity: 0.8;
  }
  @keyframes dbx-select-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>

