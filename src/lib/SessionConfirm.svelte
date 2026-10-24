<script>
  import { onMount, untrack } from 'svelte';
  import { pick } from './i18n.js';
  let { locale = 'zh-CN', request, onAnswer } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let dialog, working = $state(false), error = $state(''), selected = $state(untrack(() => request.ids?.[0] || request.id));
  onMount(() => dialog.showModal());
  async function save() {
    working = true; error = '';
    try { if (await request.save(selected)) onAnswer({ action: 'discard', id: selected }); else error = t('内容已保留，请完成导出后继续。', 'Your content was preserved. Complete the export to continue.'); }
    catch { error = t('导出失败，内容已保留。', 'Export failed. Your content was preserved.'); }
    finally { working = false; }
  }
</script>
<dialog bind:this={dialog} oncancel={(event) => { event.preventDefault(); if (!working) onAnswer({ action: 'cancel' }); }} aria-labelledby="session-confirm-title">
  <h2 id="session-confirm-title">{t('保留当前工作', 'Protect your work')}</h2>
  <p>{request.busy ? t('任务仍在运行。可以保留任务并隐藏页面，或取消任务后关闭。', 'A task is still running. Keep it in the background or cancel it before closing.') : t('此操作会释放或覆盖未保存内容。内容仅在当前工作台会话保留。', 'This action will release or replace unsaved content. Content is kept only in this workbench session.')}</p>
  {#if request.ids}<label>{t('选择要关闭的页面', 'Choose a page to close')}<select class="dbx-input" bind:value={selected}>{#each request.ids as id}<option value={id}>{request.name(id)}</option>{/each}</select></label>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  <div class="actions">
    <button class="dbx-btn" type="button" disabled={working} onclick={() => onAnswer({ action: 'cancel' })}>{t('取消', 'Cancel')}</button>
    {#if request.busy}<button class="dbx-btn" type="button" onclick={() => onAnswer({ action: 'hide', id: selected })}>{t('保留任务并隐藏', 'Keep task and hide')}</button>{/if}
    {#if request.canExport(selected)}<button class="dbx-btn" type="button" disabled={working} onclick={save}>{t('导出后继续', 'Export and continue')}</button>{/if}
    <button class="dbx-btn" type="button" disabled={working} onclick={() => onAnswer({ action: 'discard', id: selected })}>{request.busy ? t('取消任务并关闭', 'Cancel task and close') : t('放弃并继续', 'Discard and continue')}</button>
  </div>
</dialog>
<style>dialog{max-width:min(520px,90vw);background:var(--color-popover);color:var(--color-popover-foreground);border:1px solid var(--color-border);border-radius:12px;padding:24px}dialog::backdrop{background:var(--dbx-overlay)}h2{font-size:17px}p{line-height:1.6;font-size:13px}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px}label{display:grid;gap:8px}</style>
