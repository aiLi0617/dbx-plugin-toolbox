<script>
  import { sessionState } from "./sessionState.js";
  import { onMount } from "svelte";
  import { taskManager } from "./taskManager.js";
  import { tools } from "./catalog.js";
  import { pick } from "./i18n.js";
  let { locale = "zh-CN", sessions = {}, onTool, onClose } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let confirmClear = $state(false), actionError = $state("");
  async function saveResult(id) { actionError = ""; try { await sessionState.export(id); } catch { actionError = t("保存失败，结果已保留。", "Save failed. The result was preserved."); } }
  let tasks = $state([]), open = $state(false), clock = $state(Date.now());
  const running = $derived(tasks.filter((task) => ["queued", "running", "cancelling"].includes(task.state)).length);
  const pdfSessions = $derived(Object.entries(sessions).filter(([, state]) => state.pdfSessionActive));
  async function closeTool(id) {
    actionError = "";
    try { await onClose?.(id); }
    catch { actionError = t("释放失败，请重试。内容已保留。", "Could not release the session. Retry; your content was preserved."); }
  }
  const states = $derived({ queued: t("排队中", "Queued"), running: t("处理中…", "Processing…"), cancelling: t("正在取消并清理…", "Cancelling and cleaning up…"), cancelled: t("已取消", "Cancelled"), complete: t("已完成", "Completed"), failed: t("失败，请返回工具查看详情", "Failed; return to the tool for details") });
  const stages = $derived({ prepare: t("准备中…", "Preparing…"), upload: t("传输文件…", "Transferring files…"), inspect: t("读取文档…", "Reading document…"), decode: t("解码中…", "Decoding…"), transform: t("处理帧…", "Processing frames…"), encode: t("编码中…", "Encoding…"), process: t("处理文档…", "Processing document…"), write: t("写入结果…", "Writing result…"), render: t("渲染页面…", "Rendering pages…") });
  onMount(() => {
    const off = taskManager.subscribe((value) => { tasks = value; });
    const timer = setInterval(() => { clock = Date.now(); }, 1000);
    return () => { off(); clearInterval(timer); };
  });
  const title = (id) => { const tool = tools.find((item) => item.id === id); return tool ? pick(locale, tool.name) : id; };
  const elapsed = (task) => Math.max(0, Math.floor(((task.endedAt ?? clock) - (task.startedAt ?? task.createdAt)) / 1000));
</script>

{#if tasks.length || pdfSessions.length}
  <aside class="task-center" aria-label={t("任务管理", "Task manager")}>
    <button class="dbx-btn toggle" type="button" aria-expanded={open} onclick={() => open = !open}>
      {t("任务管理", "Task manager")} · {running || tasks.length || pdfSessions.length} <span aria-hidden="true">{open ? "▾" : "▴"}</span>
    </button>
    {#if open}
      <div class="task-list">
        <div class="task-head"><strong>{t("本次会话任务", "Session tasks")}</strong><button class="dbx-btn" type="button" onclick={() => { if (tasks.some(task => sessions[task.toolId]?.hasUnsavedResult)) confirmClear = true; else taskManager.clearFinished(); }}>{t("清除已结束任务", "Clear finished tasks")}</button></div>
        {#if confirmClear}<div role="alert"><p>{t("部分结果尚未保存。清除记录后，结果仍保留在工具页面。", "Some results are unsaved. Clearing records keeps results in their tool pages.")}</p><button class="dbx-btn" type="button" onclick={() => { taskManager.clearFinished(); confirmClear = false; }}>{t("确认清除记录", "Confirm clear records")}</button><button class="dbx-btn" type="button" onclick={() => confirmClear = false}>{t("取消", "Cancel")}</button></div>{/if}
        {#if actionError}<p role="alert">{actionError}</p>{/if}
        {#if pdfSessions.length}<section aria-label={t("PDF 会话", "PDF sessions")}>
          <strong>{t("PDF 会话", "PDF sessions")} · {pdfSessions.length}/4</strong>
          {#each pdfSessions as [id, state] (id)}<div class="task-row">
            <strong>{title(id)}</strong>
            <span>{state.busy ? t("处理中…", "Working…") : state.hasUnsavedResult ? t("结果尚未保存", "Result not saved") : t("可重新读取原文件", "Source files can be read again")}</span>
            <button class="dbx-btn" type="button" onclick={() => onTool?.(id)}>{t("返回工具", "Return to tool")}</button>
            {#if state.canExport && !state.busy}<button class="dbx-btn" type="button" onclick={() => saveResult(id)}>{t("保存结果", "Save result")}</button>{/if}
            <button class="dbx-btn" type="button" onclick={() => closeTool(id)}>{t("关闭并释放", "Close and release")}</button>
          </div>{/each}
        </section>{/if}
        {#each [...tasks].reverse() as task (task.id)}
          <div class="task-row">
            <div class="task-title"><strong>{title(task.toolId)}</strong><small>{elapsed(task)}s</small></div>
            <div class="task-status" role="status">{task.state === "running" ? (stages[task.stage] || states.running) : states[task.state]}</div>
            <button class="dbx-btn" type="button" onclick={() => onTool?.(task.toolId)}>{t("返回工具", "Return to tool")}</button>
            {#if tasks.findLast(item => item.toolId === task.toolId)?.id === task.id && sessions[task.toolId]?.hasUnsavedResult && sessions[task.toolId]?.canExport && !sessions[task.toolId]?.busy}<button class="dbx-btn" type="button" onclick={() => saveResult(task.toolId)}>{t("保存结果", "Save result")}</button>{/if}
            {#if task.state === "failed"}<p role="alert">{task.errorCode === "TASK_TIMEOUT" ? t("处理超时，请重试或选择较小文件。", "Processing timed out. Retry or choose a smaller file.") : t("处理失败。请返回工具查看原因并重新处理。", "Processing failed. Return to the tool for details and retry.")}</p>{#if tasks.findLast(item => item.toolId === task.toolId)?.id === task.id && sessions[task.toolId]?.canRetry && !sessions[task.toolId]?.busy}<button class="dbx-btn" type="button" onclick={() => sessionState.retry(task.toolId)}>{t("重试", "Retry")}</button>{/if}{/if}
            {#if task.state === "running"}<progress max="1" value={task.progress ?? undefined} aria-label={title(task.toolId)}></progress>{/if}
            {#if task.state === "queued" || task.state === "running"}<button class="dbx-btn" type="button" onclick={() => taskManager.cancel(task.id)}>{t("取消", "Cancel")}</button>{/if}
          </div>
        {/each}
      </div>
    {/if}
  </aside>
{/if}

<style>
  .task-center{position:relative;flex:none;min-height:38px;padding:4px 12px;border-top:1px solid var(--color-border);display:flex;justify-content:flex-end;background:var(--color-background)}
  .toggle{background:var(--color-popover);border:1px solid var(--color-border);gap:12px}
  .task-list{position:absolute;right:12px;bottom:100%;z-index:70;width:min(360px,calc(100vw - 32px));max-height:50vh;overflow:auto;background:var(--color-popover);color:var(--color-popover-foreground);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:12px}
  .task-head,.task-title{display:flex;align-items:center;justify-content:space-between;gap:10px}.task-head{font-size:12px}.task-head button,.task-row button{font-size:11px;padding:3px 8px}
  .task-row{display:grid;gap:7px;border-top:1px solid var(--color-border);padding:12px 0;margin-top:8px}.task-row strong{font-size:12px}.task-row button{justify-self:end}.task-status,small{font-size:11px;color:var(--color-muted-foreground)}progress{width:100%;height:6px;accent-color:var(--color-primary)}
</style>
