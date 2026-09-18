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
    onchange,
  } = $props();

  let open = $state(false);
  let triggerEl = $state(null);
  let menuEl = $state(null);
  let activeIndex = $state(-1);
  let pos = $state({ top: 0, left: 0, width: 160, maxHeight: 240 });
  let search = "";
  let searchAt = 0;
  const uid = `dbx-sel-${Math.random().toString(36).slice(2, 9)}`;

  const selectedIndex = $derived(options.findIndex((opt) => String(opt.value) === String(value)));
  const selectedLabel = $derived(selectedIndex >= 0 ? options[selectedIndex].label : "");
  const shownLabel = $derived(selectedLabel || placeholder || "");
  const rows = $derived.by(() => {
    const out = [];
    let last = null;
    options.forEach((opt, index) => {
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
    if (!options.length) return -1;
    let i = from;
    for (let n = 0; n < options.length; n += 1) {
      i = (i + step + options.length) % options.length;
      if (!options[i]?.disabled) return i;
    }
    return from;
  }

  function place() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 128), vw - 16);
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
    activeIndex = selectedIndex >= 0 ? selectedIndex : firstEnabled(-1, 1);
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
    if (restoreFocus) triggerEl?.focus();
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
    activeIndex = next;
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
    activeIndex = hit;
    queueMicrotask(() => {
      menuEl?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
    });
  }

  async function onTriggerKey(event) {
    if (disabled) return;
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
      activeIndex = event.key === "Home" ? firstEnabled(-1, 1) : firstEnabled(options.length, -1);
      return;
    }
    if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      choose(options[activeIndex]);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!open) await openMenu();
      typeahead(event.key);
    }
  }

  $effect(() => {
    if (!open) return;
    const onWin = () => place();
    const onDown = (event) => {
      const path = event.composedPath();
      if (triggerEl && path.includes(triggerEl)) return;
      if (menuEl && path.includes(menuEl)) return;
      closeMenu(false);
    };
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  });
</script>

<div class="dbx-select {className}" class:open>
  <button
    bind:this={triggerEl}
    class="trigger"
    class:placeholder={!selectedLabel}
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
    onkeydown={onTriggerKey}
  >
    <span class="value">{shownLabel}</span>
    <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6"></path>
    </svg>
  </button>
</div>

{#if open}
  <div
    bind:this={menuEl}
    class="menu"
    id={uid}
    style="top:{pos.top}px;left:{pos.left}px;width:{pos.width}px;max-height:{pos.maxHeight}px"
    role="listbox"
    use:portal
  >
    {#each rows as row, i (`${row.type}-${row.index ?? i}`)}
      {#if row.type === "group"}
        <div class="group">{row.label}</div>
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
          onmousedown={(event) => event.preventDefault()}
          onpointerenter={() => {
            if (!row.disabled) activeIndex = row.index;
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
          <span class="item-label">{row.label}</span>
        </div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .dbx-select {
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
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    background: var(--color-background, Canvas);
    color: var(--color-foreground, CanvasText);
    font: inherit;
    font-size: 13px;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }
  .trigger:hover:not(:disabled) {
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 6%, transparent)));
  }
  .trigger:focus,
  .trigger:focus-visible,
  .open .trigger {
    outline: 2px solid var(--color-ring, var(--color-primary));
    outline-offset: 1px;
    border-color: var(--color-ring, var(--color-primary));
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
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .chevron {
    flex-shrink: 0;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    transition: transform 160ms ease;
  }
  .open .chevron {
    transform: rotate(180deg);
  }
  .menu {
    position: fixed;
    z-index: 80;
    box-sizing: border-box;
    padding: 4px;
    overflow: auto;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-popover, var(--color-card, var(--color-background, Canvas)));
    color: var(--color-popover-foreground, var(--color-foreground, CanvasText));
    box-shadow: 0 10px 28px color-mix(in srgb, CanvasText 16%, transparent);
    animation: dbx-select-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .group {
    padding: 6px 8px 4px 28px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
  }
  .item.active,
  .item:hover {
    background: var(--color-accent, var(--color-muted, color-mix(in srgb, var(--color-foreground, CanvasText) 6%, transparent)));
    color: var(--color-accent-foreground, var(--color-foreground, CanvasText));
  }
  .item[aria-disabled="true"] {
    opacity: 0.5;
    pointer-events: none;
  }
  .check {
    display: inline-flex;
    flex: 0 0 14px;
    width: 14px;
    height: 14px;
    color: var(--color-foreground, CanvasText);
  }
  .item-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @keyframes dbx-select-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
