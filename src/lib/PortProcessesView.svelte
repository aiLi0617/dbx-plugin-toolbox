<script>
  import { pick } from "./i18n.js";
  import { invoke } from "./host.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let port = $state("3000");
  let protocol = $state("tcp");
  let busy = $state(false);
  let result = $state(null);
  let pending = $state(null);
  let error = $state("");
  let killed = $state(null);
  let signalSent = $state(null);
  let force = $state(false);
  const valid = $derived(/^\d+$/.test(String(port)) && Number(port) >= 1 && Number(port) <= 65535);
  const errors = {
    PORT_PLATFORM_UNSUPPORTED: ["此工具支持 Windows、macOS 和 Linux。", "This tool supports Windows, macOS, and Linux."],
    PORT_LSOF_MISSING: ["请先安装 lsof，再重新查询。", "Install lsof, then search again."],
    PORT_PIDFD_UNAVAILABLE: ["安全结束进程需要 Linux 5.3 或更高版本内核。", "Safe termination requires Linux kernel 5.3 or later."],
    PORT_INVALID: ["请输入 1–65535 之间的端口号。", "Enter a port number between 1 and 65535."],
    PORT_PROCESS_CHANGED: ["进程或端口占用已变化，请重新查询。", "The process or port ownership changed. Search again."],
    PORT_PROCESS_PROTECTED: ["无法结束系统进程、DBX 或工具箱自身。", "System processes, DBX, and the toolbox cannot be terminated."],
    PORT_TIMEOUT: ["操作超时，请重新查询端口状态。", "The operation timed out. Search again to check the port."],
    PORT_QUERY_FAILED: ["查询失败，请检查系统查询权限及 lsof 是否可用。", "Query failed. Check system permissions and lsof availability."],
    PORT_KILL_FAILED: ["结束失败，可能没有权限或进程已退出。请重新查询；受保护进程可能需要以管理员身份运行 DBX。", "Termination failed. Access may be denied or the process may have exited. Search again; protected processes may require running DBX as administrator."],
  };
  function showError(err) {
    const key = err?.message;
    error = key in errors ? key : String(key || err);
  }
  function reset() { result = null; pending = null; error = ""; killed = null; signalSent = null; force = false; }
  async function search() {
    if (busy || !valid) return;
    reset();
    busy = true;
    try { result = await invoke("toolbox/ports/list", { port: Number(port), protocol }); }
    catch (err) { showError(err); }
    finally { busy = false; }
  }
  async function terminate() {
    if (busy || !pending || !result) return;
    const target = pending;
    const query = { port: result.port, protocol: result.protocol };
    pending = null;
    busy = true;
    error = "";
    killed = null;
    signalSent = null;
    try {
      const response = await invoke("toolbox/ports/kill", { ...query, pid: target.pid, started: target.started, confirm: true, force: !result.supportsGraceful || force });
      if (response.killed) killed = target.pid;
      else signalSent = target.pid;
      result = null;
      result = await invoke("toolbox/ports/list", query);
    } catch (err) {
      result = null;
      showError(err);
    } finally { busy = false; }
  }
</script>

<div class="port-page">
  <p class="dbx-hint">{t("查询本机 TCP / UDP 端口占用，支持 Windows、macOS 和 Linux。", "Find local TCP / UDP port owners on Windows, macOS, and Linux.")}</p>
  <form class="port-form" onsubmit={(event) => { event.preventDefault(); search(); }}>
    <label>{t("端口号", "Port number")}<input class="dbx-input" inputmode="numeric" bind:value={port} oninput={reset} disabled={busy} placeholder="3000" /></label>
    <label>{t("协议", "Protocol")}<select class="dbx-input" bind:value={protocol} onchange={reset} disabled={busy}><option value="tcp">TCP</option><option value="udp">UDP</option></select></label>
    <button class="dbx-btn dbx-btn--primary" type="submit" disabled={busy || !valid}>{busy ? t("处理中…", "Working…") : t("查询端口", "Find port")}</button>
  </form>
  {#if !valid}<p class="error">{t(...errors.PORT_INVALID)}</p>{/if}
  {#if error}<p class="error" role="alert">{error in errors ? t(...errors[error]) : error}</p>{/if}
  {#if killed !== null}<p role="status">{t("已结束进程", "Process terminated")}: {killed}</p>{/if}
  {#if signalSent !== null}<p role="status">{t("已发送终止信号，进程可能仍在退出中；请重新查询，必要时选择强制结束。", "Termination signal sent. The process may still be exiting; search again and force termination if needed.")} PID {signalSent}</p>{/if}
  {#if result}
    {#if result.visibilityLimited}<p class="dbx-hint">{t("仅显示当前用户有权查看的进程；空列表不代表端口一定空闲。", "Only processes visible to the current user are shown; an empty list does not guarantee the port is free.")}</p>{/if}
    <p class="dbx-hint">{result.protocol.toUpperCase()} · {result.port} · {t("进程数", "Processes")}: {result.processes.length}</p>
    {#if result.processes.length === 0}
      <p role="status">{t("未发现可见的端口占用进程。", "No visible process is using this port.")}</p>
    {:else}
      <div class="table-scroll">
        <table>
          <thead><tr><th>PID</th><th>{t("进程名称", "Process name")}</th><th>{t("本地地址", "Local address")}</th><th>{t("状态", "State")}</th><th>{t("操作", "Actions")}</th></tr></thead>
          <tbody>{#each result.processes as process (process.pid)}
            <tr><td>{process.pid}</td><td>{process.name || "—"}</td><td>{process.addresses.join(", ")}</td><td>{process.states.join(", ")}</td><td>
              <button class="dbx-btn dbx-btn--danger" disabled={busy || !process.canKill} onclick={() => { pending = process; force = false; }}>{t("结束进程", "Terminate process")}</button>
              {#if !process.canKill}<span class="dbx-hint">{t("受保护或无法访问", "Protected or inaccessible")}</span>{/if}
            </td></tr>
          {/each}</tbody>
        </table>
      </div>
    {/if}
  {/if}
  {#if pending}
    <section class="confirm" role="alert" aria-label={t("确认结束进程", "Confirm termination")}>
      <strong>{t("确认结束进程", "Confirm termination")}: {pending.name} (PID {pending.pid})</strong>
      {#if result?.supportsGraceful}<label class="force-option"><input type="checkbox" bind:checked={force} />{t("强制结束（SIGKILL）", "Force termination (SIGKILL)")}</label>{/if}
      {#if !result?.supportsGraceful || force}<p>{t("将强制结束整个进程，该进程的所有端口都会关闭，未保存的数据可能丢失。", "This forcibly terminates the entire process and closes all its ports. Unsaved data may be lost.")}</p>{:else}<p>{t("将请求整个进程正常退出（SIGTERM），退出后会关闭其所有端口。", "Request a graceful process exit (SIGTERM), closing all its ports when it exits.")}</p>{/if}
      <div class="buttons"><button class="dbx-btn dbx-btn--danger" onclick={terminate}>{t("确认结束", "Confirm termination")}</button><button class="dbx-btn" onclick={() => { pending = null; }}>{t("取消", "Cancel")}</button></div>
    </section>
  {/if}
</div>

<style>
  .port-page { display: grid; gap: 16px; padding: 20px; }
  .port-form, .buttons { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; font-size: 13px; }
  input { width: 180px; }
  .force-option { display: flex; align-items: center; gap: 8px; }
  .force-option input { width: auto; }
  p { margin: 0; }
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
  th, td { padding: 12px; border-bottom: 1px solid var(--color-border); }
  td .dbx-hint { display: block; margin-top: 4px; }
  .error { color: var(--color-destructive); }
  .confirm { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--color-destructive); border-radius: 8px; }
</style>
