<script>
  import { untrack } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { DEFAULT_SHORTCUTS, SHORTCUT_GROUPS, shortcutConflicts, shortcutFromEvent, shortcutLabel, toolShortcutAction } from "./shortcuts.js";

  let { locale = "zh-CN", shortcuts: draft = $bindable(DEFAULT_SHORTCUTS), tools = [], favorites = [], embedded = false, onClose, onSave } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const initialDraft = untrack(() => ({ ...draft }));
  let recording = $state("");
  let query = $state("");
  let activeFilter = $state("all");
  let saving = $state(false);
  let error = $state("");
  let confirmDiscard = $state(false);
  let dialogEl = $state(null);

  const conflicts = $derived(shortcutConflicts(draft));
  const labels = $derived({
    search: t("搜索工具", "Search tools"), home: t("返回首页", "Go home"), catalog: t("打开工具库", "Open tool library"),
    vault: t("打开密钥库", "Open key vault"), toggleSidebar: t("展开或收起侧栏", "Toggle sidebar"),
    previousTool: t("上一个已打开工具", "Previous open tool"), nextTool: t("下一个已打开工具", "Next open tool"),
    closeTool: t("关闭当前工具", "Close current tool"), toggleFavorite: t("收藏或取消收藏当前工具", "Toggle current tool favorite"),
    loadDemo: t("载入当前工具 Demo", "Load current tool demo"), settings: t("打开设置中心", "Open settings center"),
  });
  const groupLabels = $derived({ navigation: t("导航", "Navigation"), workspace: t("工作区", "Workspace"), tool: t("当前工具", "Current tool"), settings: t("设置", "Settings") });
  const normalizedQuery = $derived(query.trim().toLocaleLowerCase());
  const favoriteSet = $derived(new Set(favorites));
  const assignedCount = $derived(Object.values(draft).filter(Boolean).length);
  const customizedCount = $derived(Object.entries(draft).filter(([action, value]) => action.startsWith("tool:") ? Boolean(value) : value !== DEFAULT_SHORTCUTS[action]).length);
  const hasChanges = $derived(shortcutSignature(draft) !== shortcutSignature(initialDraft));

  function shortcutSignature(value) {
    return Object.entries(value || {}).filter(([, binding]) => binding !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([action, binding]) => `${action}:${binding}`).join("|");
  }
  function isCustomized(action) { return action.startsWith("tool:") ? Boolean(draft[action]) : draft[action] !== DEFAULT_SHORTCUTS[action]; }
  function matchesFilter(action) {
    if (activeFilter === "custom") return isCustomized(action);
    if (activeFilter === "conflicts") return conflicts.has(action);
    return activeFilter !== "tools" || action.startsWith("tool:");
  }

  const visibleGroups = $derived.by(() => activeFilter === "tools" ? [] : SHORTCUT_GROUPS.map((group) => ({
    ...group,
    actions: group.actions.filter((action) => matchesFilter(action) && (!normalizedQuery || labels[action].toLocaleLowerCase().includes(normalizedQuery))),
  })).filter((group) => group.actions.length));

  const visibleTools = $derived.by(() => {
    const ranked = tools.map((tool) => {
      const action = toolShortcutAction(tool.id);
      return { tool, action, bound: Boolean(draft[action]), favorite: favoriteSet.has(tool.id), label: pick(locale, tool.name) };
    }).filter((item) => matchesFilter(item.action))
      .filter((item) => !normalizedQuery || `${item.label} ${item.tool.id}`.toLocaleLowerCase().includes(normalizedQuery))
      .sort((a, b) => Number(b.bound) - Number(a.bound) || Number(b.favorite) - Number(a.favorite) || a.label.localeCompare(b.label));
    return normalizedQuery ? ranked.slice(0, 50) : ranked.filter((item) => item.bound || item.favorite).slice(0, 30);
  });
  const resultCount = $derived(visibleGroups.reduce((total, group) => total + group.actions.length, 0) + visibleTools.length);

  $effect(() => {
    if (embedded) return;
    const previous = document.activeElement;
    dialogEl?.focus();
    return () => previous?.isConnected && previous.focus?.();
  });

  function record(event, action) {
    event.preventDefault(); event.stopPropagation(); error = "";
    if (event.key === "Escape") { recording = ""; return; }
    if (event.key === "Backspace" || event.key === "Delete") { clearBinding(action); return; }
    const value = shortcutFromEvent(event);
    if (!value) { error = t("请使用带 Ctrl/Cmd、Alt 的组合键，或 F1–F12。", "Use a shortcut with Ctrl/Cmd or Alt, or press F1–F12."); return; }
    draft = { ...draft, [action]: value }; recording = "";
  }
  function clearBinding(action) {
    const next = { ...draft };
    if (action.startsWith("tool:")) delete next[action]; else next[action] = "";
    draft = next; recording = "";
  }
  function resetBinding(action) {
    if (action.startsWith("tool:")) clearBinding(action); else draft = { ...draft, [action]: DEFAULT_SHORTCUTS[action] };
    recording = "";
  }
  function restoreDefaults() {
    const toolBindings = Object.fromEntries(Object.entries(draft).filter(([action, value]) => action.startsWith("tool:") && value));
    draft = embedded ? { ...DEFAULT_SHORTCUTS } : { ...DEFAULT_SHORTCUTS, ...toolBindings }; recording = "";
  }
  function clearToolBindings() {
    draft = Object.fromEntries(Object.entries(draft).filter(([action]) => !action.startsWith("tool:"))); recording = "";
  }
  function requestClose() {
    recording = "";
    if (hasChanges) { confirmDiscard = true; return; }
    onClose?.();
  }
  function onDialogKeydown(event) {
    if (embedded) return;
    if (recording) return;
    if (event.key === "Escape") { event.preventDefault(); if (confirmDiscard) confirmDiscard = false; else requestClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = [...dialogEl.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  async function save() {
    if (conflicts.size || saving || !hasChanges) return;
    saving = true; error = "";
    try { await onSave?.({ ...draft }); onClose?.(); } catch (err) { error = localizeError(locale, err); } finally { saving = false; }
  }
</script>

{#snippet bindingRow(action, label, detail = "")}
  <div class="row" class:conflict={conflicts.has(action)} class:changed={isCustomized(action)}>
    <span class="row-label"><strong>{label}</strong>{#if detail}<em>{detail}</em>{/if}{#if conflicts.has(action)}<small>{t("与其他快捷键冲突", "Conflicts with another shortcut")}</small>{/if}</span>
    <button class="binding" class:recording={recording === action} type="button" aria-label={`${t("设置快捷键", "Set shortcut")} ${label}`} aria-pressed={recording === action} onclick={() => { recording = action; error = ""; confirmDiscard = false; }} onkeydown={(event) => recording === action && record(event, action)}>
      {#if recording === action}<i></i>{t("请按组合键…", "Press keys…")}{:else}<kbd>{draft[action] ? shortcutLabel(draft[action]) : t("未设置", "Not set")}</kbd>{/if}
    </button>
    <div class="row-actions">
      <button class="icon-button reset" class:visible={isCustomized(action)} type="button" disabled={!isCustomized(action)} aria-label={`${t("恢复默认", "Reset")} ${label}`} title={action.startsWith("tool:") ? t("移除直达快捷键", "Remove direct shortcut") : t("恢复默认", "Reset to default")} onclick={() => resetBinding(action)}>↺</button>
      <button class="icon-button" type="button" disabled={!draft[action]} aria-label={`${t("清除", "Clear")} ${label}`} title={t("清除", "Clear")} onclick={() => clearBinding(action)}>×</button>
    </div>
  </div>
{/snippet}

<div class="backdrop" class:embedded role="presentation" onclick={(event) => !embedded && event.target === event.currentTarget && requestClose()}>
  <div class="dialog" bind:this={dialogEl} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-labelledby="shortcut-title" tabindex="-1" onkeydown={onDialogKeydown}>
    <header>
      <div><h2 id="shortcut-title">{t("键盘快捷键", "Keyboard shortcuts")}</h2><p>{t("管理工作区动作，并为常用工具设置直达快捷键。", "Manage workspace actions and assign direct shortcuts to tools.")}</p></div>
      {#if embedded}<button class="dbx-btn reset-group" type="button" onclick={restoreDefaults}>↺ {t("恢复默认", "Restore defaults")}</button>{:else}<button class="close icon-button" type="button" aria-label={t("关闭", "Close")} onclick={requestClose}>×</button>{/if}
    </header>

    <div class="overview" aria-label={t("快捷键概览", "Shortcut overview")}>
      <div><strong>{assignedCount}</strong><span>{t("已设置", "Assigned")}</span></div>
      <button type="button" class:active={activeFilter === "custom"} onclick={() => (activeFilter = activeFilter === "custom" ? "all" : "custom")}><strong>{customizedCount}</strong><span>{t("已自定义", "Customized")}</span></button>
      <button type="button" class:active={activeFilter === "conflicts"} class:danger={conflicts.size} onclick={() => (activeFilter = activeFilter === "conflicts" ? "all" : "conflicts")}><strong>{conflicts.size}</strong><span>{t("冲突", "Conflicts")}</span></button>
    </div>

    <div class="controls">
      <div class="search-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
        <input bind:value={query} autocomplete="off" placeholder={t("搜索动作或工具…", "Search actions or tools…")} aria-label={t("搜索快捷键", "Search shortcuts")} />
        {#if query}<button type="button" aria-label={t("清空搜索", "Clear search")} onclick={() => (query = "")}>×</button>{/if}
      </div>
      <nav aria-label={t("筛选快捷键", "Filter shortcuts")}>
        <button type="button" class:active={activeFilter === "all"} onclick={() => (activeFilter = "all")}>{t("全部", "All")}</button>
        <button type="button" class:active={activeFilter === "custom"} onclick={() => (activeFilter = "custom")}>{t("已自定义", "Customized")}</button>
        <button type="button" class:active={activeFilter === "conflicts"} onclick={() => (activeFilter = "conflicts")}>{t("冲突", "Conflicts")}</button>
        <button type="button" class:active={activeFilter === "tools"} onclick={() => (activeFilter = "tools")}>{t("工具直达", "Tools")}</button>
      </nav>
      <span class="result-count">{resultCount} {t("项", "items")}</span>
    </div>

    {#if conflicts.size}<button class="conflict-banner" type="button" onclick={() => (activeFilter = "conflicts")}><span>!</span><span><strong>{t("存在重复快捷键", "Duplicate shortcuts detected")}</strong><small>{t("解决冲突后才能保存。", "Resolve conflicts before saving.")}</small></span><b>›</b></button>{/if}

    <div class="list">
      {#each visibleGroups as group}
        <section class="group"><h3>{groupLabels[group.id]}</h3>{#each group.actions as action}{@render bindingRow(action, labels[action])}{/each}</section>
      {/each}
      {#if activeFilter === "all" || activeFilter === "tools" || visibleTools.length || normalizedQuery}
        <section class="group tool-bindings">
          <div class="section-heading"><span><h3>{t("工具直达", "Open tools directly")}</h3><p>{t("搜索任意工具并绑定；未搜索时显示已绑定和收藏的工具。", "Search for any tool to bind it. Bound and favorite tools appear when the search is empty.")}</p></span>{#if Object.keys(draft).some((action) => action.startsWith("tool:"))}<button type="button" onclick={clearToolBindings}>{t("全部清除", "Clear all")}</button>{/if}</div>
          {#each visibleTools as item (item.tool.id)}{@render bindingRow(item.action, item.label, item.tool.id)}{:else}<div class="empty">{normalizedQuery ? t("没有匹配的工具", "No matching tools") : activeFilter === "custom" ? t("还没有自定义快捷键", "No customized shortcuts yet") : t("收藏工具或搜索工具后即可设置直达快捷键", "Favorite or search for a tool to assign a shortcut")}</div>{/each}
        </section>
      {/if}
      {#if !normalizedQuery && resultCount === 0 && (activeFilter === "conflicts" || (activeFilter === "custom" && !visibleTools.length))}
        <div class="empty state-empty"><strong>{activeFilter === "conflicts" ? t("没有快捷键冲突", "No shortcut conflicts") : t("还没有自定义快捷键", "No customized shortcuts yet")}</strong><span>{activeFilter === "conflicts" ? t("当前所有组合键都可以正常使用。", "Every assigned shortcut is unique.") : t("修改一个组合键后会显示在这里。", "Changed shortcuts will appear here.")}</span></div>
      {/if}
    </div>

    <div class="help-line" aria-live="polite">
      {#if recording}<strong>{t("正在录制：", "Recording: ")}{recording.startsWith("tool:") ? recording.slice(5) : labels[recording]}</strong>{:else}<span>{t("点击组合键开始录制；Esc 取消，Backspace / Delete 清除。", "Click a shortcut to record; Esc cancels, Backspace / Delete clears.")}</span>{/if}
      {#if error}<small class="error" role="alert">{error}</small>{/if}
    </div>

    {#if !embedded}<footer class:confirming={confirmDiscard}>
      {#if confirmDiscard}
        <p><strong>{t("放弃未保存的更改？", "Discard unsaved changes?")}</strong><span>{t("关闭后将无法恢复。", "Your changes will be lost.")}</span></p><span></span>
        <button class="dbx-btn dbx-btn--ghost" type="button" onclick={() => (confirmDiscard = false)}>{t("继续编辑", "Keep editing")}</button><button class="dbx-btn danger-button" type="button" onclick={onClose}>{t("放弃更改", "Discard")}</button>
      {:else}
        <button class="dbx-btn dbx-btn--ghost" type="button" onclick={restoreDefaults}>{t("恢复默认", "Restore defaults")}</button><span class="save-state">{hasChanges ? t("有未保存的更改", "Unsaved changes") : t("所有更改已保存", "All changes saved")}</span>
        <button class="dbx-btn dbx-btn--ghost" type="button" onclick={requestClose}>{t("取消", "Cancel")}</button><button class="dbx-btn" type="button" disabled={saving || conflicts.size > 0 || !hasChanges} onclick={save}>{saving ? t("保存中…", "Saving…") : t("保存更改", "Save changes")}</button>
      {/if}
    </footer>{/if}
  </div>
</div>

<style>
  .backdrop.embedded{position:static;display:block;padding:0;background:transparent}
  .embedded .dialog{width:100%;max-height:none;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none}
  .embedded header{padding:0 0 16px;align-items:center}
  .embedded header h2{font-size:16px}
  .embedded .reset-group{flex-shrink:0;border:1px solid var(--color-border);border-radius:7px;background:var(--color-background);color:var(--color-foreground)}
  .embedded .reset-group:hover{background:var(--color-accent);border-color:var(--color-ring)}
  .embedded .overview{margin:0 0 14px}
  .embedded .controls{grid-template-columns:minmax(0,1fr);padding:12px 0;background:transparent}
  .embedded .controls nav{width:fit-content}
  .embedded .result-count{display:none}
  .embedded .list{overflow:visible;min-height:0;padding:0 0 14px}
  .embedded .conflict-banner{margin:12px 0 0}
  .embedded .help-line{padding:10px 0}
  .embedded .row{grid-template-columns:minmax(0,1fr) minmax(112px,158px) 62px}
  .embedded .row-actions .icon-button{border:1px solid var(--color-border);background:var(--color-background)}
  .embedded .section-heading>button{padding:4px 8px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-background)}
  @media(max-width:640px){.embedded header{flex-wrap:wrap;gap:10px}.embedded .row{grid-template-columns:minmax(0,1fr) 112px 58px}.embedded .help-line{align-items:flex-start;flex-direction:column}}
  .backdrop{position:fixed;z-index:120;inset:0;display:grid;place-items:center;padding:20px;background:var(--dbx-overlay)}
  .dialog{display:flex;width:min(760px,100%);max-height:min(860px,calc(100vh - 40px));flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:16px;background:var(--color-popover,var(--color-background));box-shadow:0 24px 70px rgb(0 0 0/.25);outline:none}
  header{display:flex;flex:0 0 auto;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px 15px}h2{margin:0;font-size:19px;letter-spacing:-.01em}header p{margin:5px 0 0;color:var(--color-muted-foreground);font-size:12px}.icon-button,.search-row button{display:grid;place-items:center;border:0;background:transparent;color:var(--color-muted-foreground);cursor:pointer}.close{width:32px;height:32px;border-radius:8px;font-size:22px}.close:hover,.icon-button:hover:not(:disabled),.search-row button:hover{background:var(--color-muted);color:var(--color-foreground)}
  .overview{display:grid;flex:0 0 auto;grid-template-columns:repeat(3,1fr);gap:1px;margin:0 22px 14px;overflow:hidden;border:1px solid var(--color-border);border-radius:10px;background:var(--color-border)}.overview>div,.overview>button{display:flex;align-items:baseline;gap:7px;min-width:0;padding:10px 13px;border:0;background:var(--color-background);color:inherit;text-align:left}.overview>button{cursor:pointer}.overview>button:hover,.overview>button.active{background:color-mix(in srgb,var(--color-primary) 8%,var(--color-background))}.overview strong{font-size:17px}.overview span{color:var(--color-muted-foreground);font-size:11px}.overview .danger strong,.overview .danger span{color:var(--color-destructive)}
  .controls{display:grid;flex:0 0 auto;grid-template-columns:minmax(190px,1fr) auto auto;align-items:center;gap:10px;padding:12px 22px;border-block:1px solid var(--color-border);background:color-mix(in srgb,var(--color-muted) 35%,var(--color-background))}.search-row{display:flex;align-items:center;gap:8px;padding:0 9px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-background)}.search-row:focus-within{border-color:var(--color-primary)}.search-row svg{flex:none;color:var(--color-muted-foreground)}.search-row input{min-width:0;height:34px;flex:1;border:0;outline:0;background:transparent;color:inherit;font-size:12px}.search-row button{width:24px;height:24px;border-radius:6px;font-size:17px}.controls nav{display:flex;gap:3px;padding:3px;border-radius:8px;background:var(--color-muted)}.controls nav button{height:28px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:var(--color-muted-foreground);font-size:11px;cursor:pointer;white-space:nowrap}.controls nav button:hover{color:var(--color-foreground)}.controls nav button.active{background:var(--color-background);box-shadow:0 1px 3px rgb(0 0 0/.1);color:var(--color-foreground);font-weight:600}.result-count{color:var(--color-muted-foreground);font-size:10px;white-space:nowrap}
  .conflict-banner{display:flex;flex:0 0 auto;align-items:center;gap:10px;margin:12px 22px 0;padding:9px 11px;border:1px solid color-mix(in srgb,var(--color-destructive) 35%,var(--color-border));border-radius:9px;background:color-mix(in srgb,var(--color-destructive) 7%,var(--color-background));color:var(--color-foreground);text-align:left;cursor:pointer}.conflict-banner>span:first-child{display:grid;width:22px;height:22px;place-items:center;border-radius:50%;background:var(--color-destructive);color:white;font-weight:800}.conflict-banner>span:nth-child(2){display:flex;flex:1;flex-direction:column}.conflict-banner strong{font-size:12px}.conflict-banner small{color:var(--color-muted-foreground);font-size:10px}.conflict-banner b{color:var(--color-destructive);font-size:20px}
  .list{min-height:160px;overflow:auto;padding:3px 22px 14px}.group h3{margin:16px 0 5px;color:var(--color-muted-foreground);font-size:10px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}.section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:15px}.section-heading span{min-width:0}.section-heading h3{margin-bottom:2px}.section-heading p{margin:0 0 5px;color:var(--color-muted-foreground);font-size:10px;line-height:1.45}.section-heading>button{margin-bottom:5px;border:0;background:transparent;color:var(--color-muted-foreground);font-size:10px;cursor:pointer;white-space:nowrap}.section-heading>button:hover{color:var(--color-destructive)}
  .row{display:grid;grid-template-columns:minmax(0,1fr) 178px 62px;align-items:center;gap:10px;min-height:49px;border-bottom:1px solid var(--color-border)}.row.changed{background:linear-gradient(90deg,color-mix(in srgb,var(--color-primary) 4%,transparent),transparent 45%)}.row-label{display:flex;min-width:0;flex-direction:column;gap:2px}.row strong{font-size:12px}.row em{overflow:hidden;color:var(--color-muted-foreground);font:9px var(--font-mono);text-overflow:ellipsis;white-space:nowrap}.row small,.error{color:var(--color-destructive);font-size:10px}.binding{display:flex;min-height:32px;align-items:center;justify-content:center;gap:7px;padding:4px 9px;border:1px solid var(--color-border);border-radius:7px;background:var(--color-background);color:var(--color-foreground);font-size:11px;cursor:pointer}.binding kbd{font:600 11px var(--font-mono)}.binding:hover,.binding.recording{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 8%,var(--color-background))}.binding.recording{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--color-primary) 35%,transparent);font-weight:600}.binding.recording i{width:6px;height:6px;border-radius:50%;background:var(--color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 18%,transparent);animation:pulse 1.2s ease-in-out infinite}.row.conflict .binding{border-color:var(--color-destructive);background:color-mix(in srgb,var(--color-destructive) 5%,var(--color-background))}.row-actions{display:flex;justify-content:flex-end;gap:2px}.row-actions .icon-button{width:28px;height:28px;border-radius:6px;font-size:17px}.row-actions .reset{visibility:hidden;font-size:15px}.row-actions .reset.visible{visibility:visible}.icon-button:disabled{opacity:.22;cursor:default}.empty{padding:22px;border:1px dashed var(--color-border);border-radius:8px;color:var(--color-muted-foreground);font-size:11px;text-align:center}.state-empty{display:flex;margin-top:18px;flex-direction:column;gap:4px}.state-empty strong{color:var(--color-foreground);font-size:12px}
  .help-line{display:flex;min-height:35px;flex:0 0 auto;align-items:center;justify-content:space-between;gap:10px;padding:8px 22px;border-top:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:10px;line-height:1.4}.help-line strong{color:var(--color-primary)}
  footer{display:grid;flex:0 0 auto;grid-template-columns:auto 1fr auto auto;align-items:center;gap:8px;padding:13px 22px;border-top:1px solid var(--color-border);background:color-mix(in srgb,var(--color-muted) 22%,var(--color-background))}.save-state{color:var(--color-muted-foreground);font-size:10px}.danger-button{background:var(--color-destructive);border-color:var(--color-destructive);color:white}footer p{display:flex;margin:0;flex-direction:column}footer p strong{font-size:12px}footer p span{color:var(--color-muted-foreground);font-size:10px}
  @keyframes pulse{50%{opacity:.45;transform:scale(.8)}}
  @media(max-width:680px){.backdrop{padding:0;place-items:end center}.dialog{width:100%;max-height:100dvh;border-width:1px 0 0;border-radius:16px 16px 0 0}.overview{margin-inline:16px}.controls{grid-template-columns:1fr;padding-inline:16px}.controls nav{overflow-x:auto}.controls nav button{flex:1}.result-count{display:none}.list{padding-inline:16px}.conflict-banner{margin-inline:16px}.row{grid-template-columns:minmax(0,1fr) minmax(112px,145px) 58px}.help-line,footer,header{padding-inline:16px}.save-state{display:none}}
  @media(max-width:430px){header p{display:none}.overview>div,.overview>button{flex-direction:column;gap:1px;padding:8px 10px}.row{grid-template-columns:minmax(0,1fr) 116px 56px;gap:6px}.binding{padding-inline:5px}.binding kbd{font-size:10px}footer{grid-template-columns:1fr 1fr}footer>span{display:none}footer .dbx-btn{width:100%}footer .dbx-btn:first-child{display:none}footer.confirming p{grid-column:1/-1}.help-line{align-items:flex-start;flex-direction:column}}
</style>
