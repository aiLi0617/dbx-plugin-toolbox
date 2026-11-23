<script>
  import { tick } from "svelte";
  import { pick } from "./i18n.js";
  import { FAKE_DATA_COPY, FAKE_DATA_PRESET_COPY as copy } from "./fakeDataCopy.js";
  import {
    createFakeDataPreset, deleteFakeDataPreset, FAKE_DATA_PRESET_LIMIT, FakeDataPresetError,
    listFakeDataPresets, updateFakeDataPreset,
  } from "./fakeDataPresets.js";

  let { locale, visible, captureConfig, applyPreset, usePersonPreset, formatError } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const label = (text) => pick(locale, text);
  const menuId = $props.id();
  let root = $state(null);
  let trigger = $state(null);
  let menu = $state(null);
  let nameInput = $state(null);
  let open = $state(false);
  let busy = $state(false);
  let loaded = $state(false);
  let presets = $state.raw([]);
  let loadedId = $state(null);
  let mode = $state("list");
  let name = $state("");
  let pendingDelete = $state(null);
  let error = $state("");
  let message = $state("");
  const active = $derived(presets.find(({ id }) => id === loadedId));
  const templateLabel = $derived(label(copy.templates));
  const triggerLabel = $derived(active ? `${templateLabel} · ${active.name}` : templateLabel);
  const full = $derived(presets.length >= FAKE_DATA_PRESET_LIMIT);

  function setPresets(result) {
    presets = result.presets;
    if (loadedId && !presets.some(({ id }) => id === loadedId)) loadedId = null;
    loaded = true;
  }

  function describeError(cause) {
    if (cause instanceof FakeDataPresetError) return label(copy.errors[cause.code]);
    return formatError(cause);
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    try {
      setPresets(await listFakeDataPresets());
    } catch (cause) {
      loaded = false;
      error = describeError(cause);
    } finally {
      busy = false;
    }
  }

  function close(restoreFocus = false) {
    open = false;
    mode = "list";
    error = "";
    message = "";
    if (restoreFocus) trigger?.focus({ preventScroll: true });
  }

  async function toggle() {
    if (open) {
      if (!busy) close(true);
      return;
    }
    open = true;
    const pending = refresh();
    await tick();
    menu?.focus({ preventScroll: true });
    await pending;
  }

  $effect(() => {
    if (!visible && open && !busy) close();
    if (!visible || !open) return;
    function onOutside(event) {
      if (!busy && !event.composedPath().includes(root)) close();
    }
    function onEscape(event) {
      if (event.key !== "Escape" || event.defaultPrevented || busy) return;
      event.preventDefault();
      close(true);
    }
    const onOverlay = () => { if (!busy) close(); };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("toolbox-close-overlays", onOverlay);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("toolbox-close-overlays", onOverlay);
    };
  });

  function useBuiltin() {
    usePersonPreset();
    loadedId = null;
    close(true);
  }

  function load(preset) {
    try {
      applyPreset(preset.config);
      loadedId = preset.id;
      close(true);
    } catch (cause) {
      error = describeError(cause);
    }
  }

  async function startSave() {
    name = "";
    mode = "save";
    error = "";
    message = "";
    await tick();
    nameInput?.focus();
  }

  function startDelete(preset) {
    pendingDelete = preset;
    mode = "delete";
    error = "";
    message = "";
  }

  function back() {
    mode = "list";
    error = "";
    void tick().then(() => menu?.focus({ preventScroll: true }));
  }

  async function mutate(operation, feedback) {
    if (busy) return;
    busy = true;
    error = "";
    message = "";
    try {
      const result = await operation();
      setPresets(result);
      if (result.id) loadedId = result.id;
      mode = "list";
      message = label(feedback);
      await tick();
      menu?.focus({ preventScroll: true });
    } catch (cause) {
      error = describeError(cause);
      if (cause instanceof FakeDataPresetError && ["duplicate", "limit", "missing"].includes(cause.code)) {
        try { setPresets(await listFakeDataPresets()); } catch { /* Retain the original failure. */ }
      }
    } finally {
      busy = false;
    }
  }
</script>

<div class="form-menu-anchor" bind:this={root}>
  <button class="dbx-btn form-trigger" type="button" bind:this={trigger} aria-expanded={open && visible}
    aria-label={triggerLabel} title={active ? triggerLabel : undefined}
    aria-controls={open && visible ? menuId : undefined} onclick={toggle}>
    <span class="template-label">{templateLabel}</span>
    {#if active}<span class="form-title active-template">{active.name}</span>{/if}
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
  </button>
  {#if open && visible}
    <div class="form-menu" id={menuId} role="group" aria-label={templateLabel} tabindex="-1" bind:this={menu}>
      {#if mode === "save"}
        <strong class="prompt-title">{label(copy.save)}</strong>
        <label>
          {label(copy.name)}
          <input class="dbx-input" bind:this={nameInput} bind:value={name} disabled={busy}
            onkeydown={(event) => {
              if (event.key !== "Enter" || event.isComposing) return;
              event.preventDefault();
              if (name.trim()) void mutate(() => createFakeDataPreset(name, captureConfig()), copy.saved);
            }} />
        </label>
        <div class="prompt-actions">
          <button class="dbx-btn" type="button" onclick={back} disabled={busy}>{t("取消", "Cancel")}</button>
          <button class="dbx-btn dbx-btn--primary" type="button" disabled={busy || !name.trim()}
            onclick={() => mutate(() => createFakeDataPreset(name, captureConfig()), copy.saved)}>{t("保存", "Save")}</button>
        </div>
      {:else if mode === "delete"}
        <strong class="prompt-title">{label(copy.confirm)}</strong>
        <strong class="form-title" title={pendingDelete.name}>{pendingDelete.name}</strong>
        <div class="prompt-actions">
          <button class="dbx-btn" type="button" onclick={back} disabled={busy}>{t("取消", "Cancel")}</button>
          <button class="dbx-btn delete-form" type="button" disabled={busy}
            onclick={() => mutate(() => deleteFakeDataPreset(pendingDelete.id), copy.deleted)}>{t("删除", "Delete")}</button>
        </div>
      {:else}
        <div class="built-in">
          <h4>{label(copy.builtin)}</h4>
          <button class="dbx-btn dbx-btn--ghost form-action" type="button" onclick={useBuiltin} disabled={busy}>{label(FAKE_DATA_COPY.person)}</button>
        </div>
        <div class="saved-forms">
          <div class="list-heading">
            <h4>{label(copy.mine)}</h4>
            <span class="form-count">{presets.length} / {FAKE_DATA_PRESET_LIMIT}</span>
          </div>
          {#if loaded && presets.length === 0}<p class="muted empty-forms">{label(copy.empty)}</p>{/if}
          {#each presets as preset (preset.id)}
            <div class="saved-row">
              <button class="dbx-btn dbx-btn--ghost form-action" class:selected={preset.id === loadedId} type="button" disabled={busy}
                title={preset.name} aria-current={preset.id === loadedId ? "true" : undefined} onclick={() => load(preset)}>
                <span class="form-title">{preset.name}</span>
                {#if preset.id === loadedId}
                  <svg class="loaded-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3.5 8 3 3 6-6" /></svg>
                {/if}
              </button>
              <button class="dbx-btn dbx-btn--ghost delete-icon" type="button" disabled={busy || !loaded}
                aria-label={`${label(copy.remove)} · ${preset.name}`} title={label(copy.remove)} onclick={() => startDelete(preset)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                </svg>
              </button>
            </div>
          {/each}
        </div>
        <div class="form-commands">
          {#if active}
            <button class="dbx-btn dbx-btn--primary command" type="button" title={active.name} disabled={busy || !loaded}
              onclick={() => mutate(() => updateFakeDataPreset(active.id, captureConfig()), copy.saved)}>{label(copy.update)}</button>
          {/if}
          <button class="dbx-btn command" class:dbx-btn--primary={!active} type="button" disabled={busy || !loaded || full} onclick={startSave}>{label(copy.save)}</button>
          {#if full}<p class="muted">{label(copy.errors.limit)}</p>{/if}
        </div>
      {/if}
      {#if busy}<p class="muted" role="status">{t("处理中…", "Working…")}</p>{/if}
      {#if error}<p class="form-error" role="alert">{error}</p>{/if}
      {#if message}<p class="muted" role="status">{message}</p>{/if}
    </div>
  {/if}
</div>

<style>
  .form-menu-anchor { position: relative; min-width: 0; }
  .form-trigger { display: flex; gap: 6px; max-width: min(220px, 100%); }
  .form-trigger svg, .template-label, .loaded-check { flex: none; }
  .template-label { white-space: nowrap; }
  .active-template { min-width: 0; color: var(--color-muted-foreground); }
  .form-trigger[aria-expanded="true"] svg { transform: rotate(180deg); }
  .form-menu {
    position: absolute;
    inset-inline-end: 0;
    top: calc(100% + 5px);
    z-index: 125;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(280px, calc(100vw - 44px));
    max-height: min(520px, 70vh);
    overflow: auto;
    padding: 10px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-card);
    color: var(--color-foreground);
    outline: none;
  }
  .form-menu label { display: grid; gap: 6px; font-size: 12px; }
  .form-menu input { width: 100%; }
  .form-menu p { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
  .list-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .list-heading, h4 { margin: 0; }
  h4 { padding: 3px 7px; color: var(--color-muted-foreground); font-size: 11px; font-weight: 500; }
  .form-count { padding-inline: 7px; color: var(--color-muted-foreground); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .empty-forms { padding: 5px 7px; }
  .form-commands { display: grid; gap: 6px; border-top: 1px solid var(--color-border); padding-top: 8px; }
  .command { width: 100%; height: auto; min-height: 30px; padding-block: 4px; white-space: normal; text-align: center; line-height: 1.3; }
  .prompt-title { font-size: 13px; }
  .saved-row { display: flex; gap: 4px; }
  .form-action { justify-content: space-between; width: 100%; min-width: 0; padding-inline: 7px; text-align: start; }
  .form-action.selected { background: var(--color-muted); color: var(--color-foreground); font-weight: 600; }
  .form-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .delete-icon { flex: 0 0 27px; padding: 0; color: var(--color-muted-foreground); }
  .delete-icon:hover, .delete-form, .form-error { color: var(--color-destructive); }
  .muted { color: var(--color-muted-foreground); }
  .prompt-actions { display: flex; justify-content: flex-end; gap: 6px; }
</style>
