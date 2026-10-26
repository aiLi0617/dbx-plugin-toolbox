<script>
  import { inspectHostIntegration } from "./hostIntegrationProbe.js";
  import manifest from "../../manifest.json";
  import { copyText } from "./clipboard.js";
  import { onMount, untrack, tick } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { normalizeLocale } from "./locale.js";
  import { DEFAULT_SHORTCUTS, shortcutConflicts } from "./shortcuts.js";
  import {
    DEFAULT_RECENT_TOOL_LIMIT,
    VAULT_AUTO_LOCK_MINUTES,
  } from "./prefs.js";
  import { themeAppearance, invoke, observeEnvironment } from "./host.js";
  import ShortcutSettings from "./ShortcutSettings.svelte";
  import SettingsConfirmation from "./SettingsConfirmation.svelte";
  import Select from "./Select.svelte";
  import VaultBackup from "./VaultBackup.svelte";
  import VaultPasswordSettings from "./VaultPasswordSettings.svelte";
  import {
    defaultSettings,
    exportSettings,
    parseSettingsFile,
    MAX_SETTINGS_BYTES,
  } from "./settingsTransfer.js";
  import { saveBlobThroughHost } from "./fileSave.js";

  let {
    locale = "zh-CN",
    shortcuts = DEFAULT_SHORTCUTS,
    tools = [],
    favorites = [],
    sidebarCollapsed = false,
    recentCollapsed = false,
    recentToolLimit = DEFAULT_RECENT_TOOL_LIMIT,
    vaultAutoLockMinutes = 15,
    preferencesVersion = null,
    onClose,
    onSave,
    onOpenVault,
    initialTab = "general",
  } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const languageName = $derived(new Intl.DisplayNames([normalizeLocale(locale)], { type: "language" }).of(normalizeLocale(locale)));
  const initial = untrack(() => ({
    shortcuts: { ...shortcuts },
    sidebarCollapsed,
    recentCollapsed,
    recentToolLimit,
    vaultAutoLockMinutes,
    favoriteToolIds: [...favorites],
  }));
  let draft = $state(structuredClone(initial));
  let baseline = $state(JSON.stringify(initial));
  let tab = $state(untrack(() => initialTab));
  let fileInput = $state(null);
  let dialog = $state(null);
  let busy = $state(false);
  let passwordDirty = $state(false);
  let passwordBusy = $state(false);
  let backupDirty = $state(false), backupBusy = $state(false);
  let pendingImport = $state(null);
  let clearRecent = $state(false);
  let confirmation = $state("");
  let closeTarget = $state("close");
  let version = $state(null);
  let backendAvailable = $state(false);
  let appearance = $state("light");
  let diagnostics = $state(null);
  let notice = $state("");
  let error = $state("");
  const hasChanges = $derived(
    JSON.stringify(draft) !== baseline || clearRecent,
  );
  const hasShortcutConflicts = $derived(
    shortcutConflicts(draft.shortcuts).size > 0,
  );
  const boundTools = $derived(
    tools.filter((tool) => draft.shortcuts[`tool:${tool.id}`]),
  );

  onMount(() => {
    const previous = document.activeElement;
    dialog?.focus();
    let disposed = false;
    const off = observeEnvironment(() => {
      appearance = themeAppearance();
    });
    void invoke("toolbox/prefs/get")
      .then((result) => {
        if (!disposed) {
          version = result?.version ?? null;
          backendAvailable = true;
        }
      })
      .catch(() => {});
    // Reuse the device-info collector without pulling its tool bundle into startup.
    void import("./utilitySuite.js")
      .then(({ collectClientDiagnostics }) => {
        if (!disposed) diagnostics = collectClientDiagnostics();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off();
      if (previous?.isConnected) previous.focus?.();
    };
  });

  function finishClose() {
    if (closeTarget === "vault") onOpenVault?.();
    else onClose?.();
  }
  function requestClose(target = "close") {
    if (busy || passwordBusy || backupBusy) return;
    closeTarget = target;
    if (hasChanges || passwordDirty || backupDirty || pendingImport) confirmation = "discard";
    else finishClose();
  }
  function keydown(event) {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (busy || passwordBusy || backupBusy) return;
      if (confirmation) confirmation = "";
      else if (pendingImport) pendingImport = null;
      else requestClose();
    }
    if (event.key !== "Tab") return;
    const items = [
      ...dialog.querySelectorAll(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
      ),
    ].filter((el) => el.getClientRects().length);
    const first = items[0],
      last = items.at(-1);
    if (!first) {
      event.preventDefault();
      return;
    }
    if (!items.includes(document.activeElement)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialog)
    ) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === last || document.activeElement === dialog)
    ) {
      event.preventDefault();
      first.focus();
    }
  }
  async function save() {
    if (
      busy ||
      passwordBusy || backupBusy ||
      !hasChanges ||
      pendingImport ||
      hasShortcutConflicts
    )
      return;
    busy = true;
    error = "";
    notice = "";
    try {
      await onSave?.(JSON.parse(JSON.stringify(draft)), { clearRecent });
      baseline = JSON.stringify(draft);
      clearRecent = false;
    } catch (err) {
      error = localizeError(locale, err);
    } finally {
      busy = false;
      await tick();
      dialog?.focus();
    }
  }

  async function copyDiagnostics() {
    try {
      const platform = String(diagnostics?.platform || '');
      await copyText(JSON.stringify({plugin: manifest.id, version: manifest.version, backendConnected: backendAvailable, integration: inspectHostIntegration(window.dbxPlugin), locale, platform: /win/i.test(platform) ? 'Windows' : /mac/i.test(platform) ? 'macOS' : /linux/i.test(platform) ? 'Linux' : 'Other'}, null, 2));
      notice = t('脱敏诊断信息已复制。', 'Sanitized diagnostics copied.');
    } catch (cause) { error = localizeError(locale, cause); }
  }
  async function exportPreferences() {
    busy = true;
    error = "";
    notice = "";
    try {
      const blob = new Blob([exportSettings(draft)], {
        type: "application/json",
      });
      if (window.dbxPlugin?.invoke) {
        const result = await saveBlobThroughHost(blob, {
          fileName: "dbx-toolbox-preferences.json",
          extension: "json",
          mimeType: "application/json",
          binary: true,
          title: t("导出偏好", "Export preferences"),
        });
        if (result?.cancelled || result?.canceled) return;
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "dbx-toolbox-preferences.json";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notice = t("偏好设置已导出。", "Preferences exported.");
    } catch (err) {
      error = localizeError(locale, err);
    } finally {
      busy = false;
      await tick();
      dialog?.focus();
    }
  }
  function importPreferences() {
    fileInput?.click();
  }
  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    pendingImport = null;
    busy = true;
    error = "";
    notice = "";
    try {
      if (file.size > MAX_SETTINGS_BYTES)
        throw new Error("Invalid preferences file");
      pendingImport = parseSettingsFile(await file.text());
    } catch (err) {
      error = localizeError(locale, err);
    } finally {
      busy = false;
      await tick();
      dialog?.focus();
    }
  }
  function acceptImport() {
    draft = pendingImport;
    pendingImport = null;
    notice = t(
      "导入已载入草稿，请保存更改。",
      "Import loaded into draft. Save changes to apply.",
    );
  }
  function resetInterface() {
    draft.sidebarCollapsed = false;
    draft.recentCollapsed = false;
    draft.recentToolLimit = DEFAULT_RECENT_TOOL_LIMIT;
  }
  function resetVault() {
    draft.vaultAutoLockMinutes = 15;
  }
  function clearPreferences() {
    draft = defaultSettings();
    clearRecent = true;
    pendingImport = null;
    confirmation = "";
    notice = t(
      "清除操作已加入草稿，请保存更改。",
      "Preference clearing is pending. Save changes to apply.",
    );
  }
</script>

<div
  class="settings-backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && requestClose()}
>
  <div
    class="settings-dialog"
    bind:this={dialog}
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
    tabindex="-1"
    onkeydown={keydown}
  >
    <header>
      <div>
        <span class="eyebrow">DBX TOOLBOX</span>
        <h2 id="settings-title">{t("设置", "Settings")}</h2>
      </div>
      <button
        class="dbx-btn dbx-btn--ghost"
        disabled={busy || passwordBusy || backupBusy || Boolean(confirmation)}
        aria-label={t("关闭", "Close")}
        type="button"
        onclick={() => requestClose()}>×</button
      >
    </header>
    <fieldset
      class="settings-fields"
      disabled={busy || passwordBusy || backupBusy || Boolean(confirmation)}
    >
      <div class="settings-body">
        <nav
          class="settings-nav"
          aria-label={t("设置分组", "Settings sections")}
        >
          <button
            class:active={tab === "general"}
            onclick={() => (tab = "general")}
            >{t("界面偏好", "Interface")}</button
          >
          <button
            class:active={tab === "shortcuts"}
            onclick={() => (tab = "shortcuts")}
            >{t("快捷键", "Shortcuts")}</button
          >
          <button class:active={tab === "vault"} onclick={() => (tab = "vault")}
            >{t("密钥库", "Key vault")}</button
          >
          <button class:active={tab === "backup"} onclick={() => (tab = "backup")}>{t("备份与恢复", "Backup and restore")}</button>
          <button class:active={tab === "data"} onclick={() => (tab = "data")}
            >{t("诊断信息", "Diagnostics")}</button
          >
        </nav>
        <main class="settings-content">
          {#if tab === "general"}
            <h3>{t("界面偏好", "Interface preferences")}</h3>
            <div class="setting-row">
              <span
                ><strong>{t("侧栏默认状态", "Default sidebar state")}</strong
                ><small
                  >{t(
                    "控制启动时侧栏是否收起。",
                    "Whether the sidebar starts collapsed.",
                  )}</small
                ></span
              ><button
                class="dbx-btn"
                type="button"
                aria-pressed={draft.sidebarCollapsed}
                onclick={() =>
                  (draft.sidebarCollapsed = !draft.sidebarCollapsed)}
                >{draft.sidebarCollapsed
                  ? t("已收起", "Collapsed")
                  : t("已展开", "Expanded")}</button
              >
            </div>
            <div class="setting-row">
              <span
                ><strong>{t("最近使用分组", "Recent tools section")}</strong
                ><small
                  >{t(
                    "控制左侧最近使用列表默认是否折叠。",
                    "Whether the recent tools list starts collapsed.",
                  )}</small
                ></span
              ><button
                class="dbx-btn"
                type="button"
                aria-pressed={draft.recentCollapsed}
                onclick={() => (draft.recentCollapsed = !draft.recentCollapsed)}
                >{draft.recentCollapsed
                  ? t("已收起", "Collapsed")
                  : t("已展开", "Expanded")}</button
              >
            </div>
            <div class="setting-row readonly">
              <span
                ><strong>{t("语言", "Language")}</strong><small
                  >{t(
                    "由 DBX 宿主控制。",
                    "Controlled by the DBX host.",
                  )}</small
                ></span
              ><span class="setting-value">{languageName}</span>
            </div>
            <div class="setting-row readonly">
              <span
                ><strong>{t("主题", "Theme")}</strong><small
                  >{t(
                    "跟随 DBX 宿主主题。",
                    "Follows the DBX host theme.",
                  )}</small
                ></span
              ><span class="setting-value">{appearance === "dark" ? t("深色", "Dark") : t("浅色", "Light")}</span>
            </div>
            <button
              class="dbx-btn dbx-btn--ghost reset-interface"
              type="button"
              onclick={resetInterface}
              >{t("恢复界面默认", "Reset interface")}</button
            >
          {:else if tab === "shortcuts"}
            <ShortcutSettings
              embedded
              {locale}
              bind:shortcuts={draft.shortcuts}
              {tools}
              favorites={draft.favoriteToolIds}
            />
          {:else if tab === "vault"}
            <h3>{t("密钥库", "Key vault")}</h3>
            <div class="setting-row">
              <span
                ><strong>{t("自动锁定", "Auto-lock")}</strong><small
                  >{t(
                    "无操作后自动锁定密钥库。",
                    "Lock the vault after inactivity.",
                  )}</small
                ></span
              ><Select
                ariaLabel={t("自动锁定", "Auto-lock")}
                value={draft.vaultAutoLockMinutes}
                options={VAULT_AUTO_LOCK_MINUTES.map((value) => ({
                  value,
                  label: value === 0 ? t("从不", "Never") : `${value} min`,
                }))}
                onchange={(value) =>
                  (draft.vaultAutoLockMinutes = Number(value))}
              />
            </div>
            <div class="actions">
              <button
                class="dbx-btn dbx-btn--primary"
                type="button"
                onclick={() => requestClose("vault")}
                >{t("打开密钥库", "Open key vault")}</button
              ><button
                class="dbx-btn dbx-btn--ghost"
                type="button"
                onclick={resetVault}>{t("恢复默认", "Reset")}</button
              >
            </div>

            <VaultPasswordSettings
              {locale}
              bind:dirty={passwordDirty}
              bind:updating={passwordBusy}
            />
          {:else if tab === "backup"}
            <section class="preferences-transfer" aria-labelledby="preferences-title">
              <h3 id="preferences-title">{t("偏好设置", "Preferences")}</h3>
              <p class="hint data-help">{t("偏好导出只包含界面、快捷键、收藏和锁定时长；密钥与 TOTP 请使用“备份与恢复”中的加密备份。", "Preferences export contains interface, shortcuts, favorites and auto-lock settings. Use the encrypted backup in “Backup and restore” for keys and TOTP.")}</p>
              <div class="actions">
                <button
                  class="dbx-btn dbx-btn--primary"
                  type="button"
                  onclick={exportPreferences}
                  >{t("导出偏好", "Export preferences")}</button
                ><button class="dbx-btn" type="button" onclick={importPreferences}
                  >{t("导入偏好", "Import preferences")}</button
                >
              </div>
              <input
                class="visually-hidden"
                bind:this={fileInput}
                type="file"
                accept="application/json"
                onchange={onImport}
              />
              {#if pendingImport}
                <div class="diagnostic-card" role="status">
                  <strong>{t("导入预览", "Import preview")}</strong>
                  <p class="hint">
                    {t(
                      "将替换快捷键、界面、密钥库偏好及收藏，不修改密钥材料。",
                      "Replaces shortcuts, interface, vault preferences and favorites. Key material is unchanged.",
                    )}
                  </p>
                  <dl>
                    <dt>{t("已绑定快捷键", "Assigned shortcuts")}</dt>
                    <dd>
                      {Object.values(pendingImport.shortcuts).filter(Boolean)
                        .length}
                    </dd>
                    <dt>{t("收藏", "Favorites")}</dt>
                    <dd>{pendingImport.favoriteToolIds.length}</dd>
                    <dt>{t("自动锁定", "Auto-lock")}</dt>
                    <dd>{pendingImport.vaultAutoLockMinutes} min</dd>
                  </dl>
                  <div class="actions">
                    <button class="dbx-btn" type="button" onclick={acceptImport}
                      >{t("载入草稿", "Load into draft")}</button
                    ><button
                      class="dbx-btn dbx-btn--ghost"
                      type="button"
                      onclick={() => (pendingImport = null)}
                      >{t("取消", "Cancel")}</button
                    >
                  </div>
                </div>
              {/if}
            </section>
            <div class="backup-section">
              <VaultBackup {locale} bind:dirty={backupDirty} bind:updating={backupBusy} />
            </div>
            <section class="preferences-reset" aria-labelledby="preferences-reset-title">
              <h3 id="preferences-reset-title">{t("重置偏好设置", "Reset preferences")}</h3>
              <p class="hint">{t("恢复默认设置，并清空收藏和最近记录；密钥库内容保留。点击“保存更改”后生效。", "Restore default settings and clear favorites and recents. Vault contents are kept. Click “Save changes” to apply.")}</p>
              <button class="dbx-btn reset-preferences" type="button" onclick={() => (confirmation = "clear")}>{t("重置偏好设置", "Reset preferences")}</button>
            </section>
          {:else}
            <h3>{t("诊断信息", "Diagnostics")}</h3>
            <div class="diagnostic-card">
              <strong>{t("诊断信息", "Diagnostics")}</strong><p>{t('插件版本', 'Plugin version')}: {manifest.version}</p><button class="dbx-btn" type="button" onclick={copyDiagnostics}>{t('复制脱敏诊断信息', 'Copy sanitized diagnostics')}</button>
              <dl>
                <dt>{t("偏好版本", "Preferences version")}</dt>
                <dd>
                  {preferencesVersion ?? version ?? t("不可用", "Unavailable")}
                </dd>
                <dt>{t("后端", "Backend")}</dt>
                <dd>
                  {backendAvailable
                    ? t("已连接", "Connected")
                    : t("不可用", "Unavailable")}
                </dd>
                <dt>{t("用户代理", "User agent")}</dt>
                <dd>{diagnostics?.userAgent || "—"}</dd>
                <dt>{t("平台", "Platform")}</dt>
                <dd>{diagnostics?.platform || "—"}</dd>
                <dt>{t("时区", "Time zone")}</dt>
                <dd>{diagnostics?.timezone || "—"}</dd>
                <dt>{t("绑定工具", "Bound tools")}</dt>
                <dd>{boundTools.length}</dd>
              </dl>
            </div>
            <details><summary>{t('已知限制与更新说明', 'Known limits and release notes')}</summary><p>{t('本次更新：统一密钥库与 TOTP、加密备份恢复、会话保护和后台任务。', 'This update: unified vault and TOTP, encrypted backups, session protection and background tasks.')}</p><p>{t('工作台关闭后会话内容不会恢复。表格仅保留单元格值。OCR 模型由用户主动下载，处理内容保留在本机。', 'Session content is not restored after closing the workbench. Spreadsheets retain cell values only. OCR models download at your request; processed content stays local.')}</p></details>
          {/if}
            {#if notice}<p class="notice" role="status">
              {notice}
            </p>{/if}{#if error}<p class="error" role="alert">{error}</p>{/if}
        </main>
      </div>
    </fieldset>
    <footer>
        <span class="hint"
          >{hasShortcutConflicts
            ? t("解决冲突后才能保存。", "Resolve conflicts before saving.")
            : hasChanges || passwordDirty || backupDirty
              ? t("有未保存的更改", "Unsaved changes")
              : t("所有更改已保存", "All changes saved")}</span
        ><button
          class="dbx-btn"
          disabled={busy || passwordBusy || backupBusy}
          type="button"
          onclick={() => requestClose()}>{t("关闭", "Close")}</button
        ><button
          class="dbx-btn dbx-btn--primary"
          disabled={busy ||
            passwordBusy || backupBusy ||
            Boolean(confirmation) ||
            !hasChanges ||
            Boolean(pendingImport) ||
            hasShortcutConflicts}
          type="button"
          onclick={save}
          >{busy
            ? t("保存中…", "Saving…")
            : t("保存更改", "Save changes")}</button
        >

    </footer>
  </div>
</div>

{#if confirmation}
  <SettingsConfirmation
    title={confirmation === "discard" ? t("放弃未保存的更改？", "Discard unsaved changes?") : t("重置偏好设置", "Reset preferences")}
    description={confirmation === "clear" ? t("恢复默认设置，并清空收藏和最近记录；密钥库内容保留。点击“保存更改”后生效。", "Restore default settings and clear favorites and recents. Vault contents are kept. Click “Save changes” to apply.") : ""}
    cancelLabel={confirmation === "discard" ? t("继续编辑", "Keep editing") : t("取消", "Cancel")}
    confirmLabel={confirmation === "discard" ? t("放弃更改", "Discard") : t("重置偏好设置", "Reset preferences")}
    onCancel={() => (confirmation = "")}
    onConfirm={confirmation === "discard" ? finishClose : clearPreferences}
  />
{/if}

<style>
  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--dbx-overlay);
  }
  .settings-fields {
    display: flex;
    flex: 1;
    min-height: 0;
    border: 0;
    margin: 0;
    padding: 0;
  }
  .settings-body {
    flex: 1;
  }
  .settings-content {
    min-height: 0;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 16px 24px;
    border-top: 1px solid var(--color-border);
  }
  footer > span {
    margin-right: auto;
    font-size: 12px;
  }
  .diagnostic-card dd {
    white-space: normal !important;
    overflow-wrap: anywhere;
  }
  .actions {
    flex-wrap: wrap;
  }
  .settings-dialog {
    display: flex;
    width: min(860px, 100%);
    height: min(680px, calc(100dvh - 48px));
    max-height: min(720px, calc(100vh - 48px));
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: 16px;
    background: var(--color-card);
    box-shadow: 0 24px 80px color-mix(in srgb, #000 28%, transparent);
  }
  .dbx-btn {
    min-height: 32px;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: var(--color-background);
    color: var(--color-foreground);
  }
  .dbx-btn:hover:not(:disabled) {
    border-color: var(--color-ring);
    background: var(--color-accent);
    color: var(--color-accent-foreground);
  }
  .dbx-btn--primary {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-primary-foreground);
  }
  .dbx-btn--primary:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--color-primary) 88%,
      var(--color-background)
    );
    color: var(--color-primary-foreground);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid var(--color-border);
  }
  h2 {
    margin-top: 4px;
    font-size: 22px;
  }
  .eyebrow {
    color: var(--color-primary);
    font-size: 10px;
    font-weight: 750;
    letter-spacing: 0.12em;
  }
  .settings-body {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
  }
  .settings-nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border-right: 1px solid var(--color-border);
    background: var(--color-muted);
  }
  .settings-nav button {
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--color-muted-foreground);
    text-align: left;
    cursor: pointer;
  }
  .settings-nav button.active,
  .settings-nav button:hover {
    background: color-mix(in srgb, var(--color-primary) 11%, transparent);
    color: var(--color-primary);
  }
  .settings-content {
    overflow: auto;
    padding: 24px;
  }
  .settings-content h3 {
    margin-bottom: 16px;
    font-size: 16px;
  }
  .reset-interface {
    margin-top: 16px;
  }
  .backup-section,
  .preferences-reset {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--color-border);
  }
  .preferences-reset .hint {
    line-height: 1.6;
    margin-bottom: 16px;
  }
  .reset-preferences {
    color: var(--color-destructive);
  }
  .data-help {
    max-width: 620px;
    margin: -8px 0 16px;
    line-height: 1.6;
  }
  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 15px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .setting-row span {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .setting-row small,
  .hint {
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .setting-row :global(.dbx-custom-select) {
    min-width: 110px;
  }
  .setting-value {
    padding: 4px 7px;
    border-radius: 5px;
    background: var(--color-muted);
    font-size: 12px;
  }
  .diagnostic-card {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 16px 0;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-muted);
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 20px;
  }
  .diagnostic-card {
    display: block;
  }
  .diagnostic-card dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 16px;
    margin-top: 12px;
    font-size: 12px;
  }
  .diagnostic-card dt {
    color: var(--color-muted-foreground);
  }
  .diagnostic-card dd {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .notice {
    color: var(--color-success, var(--color-primary));
    font-size: 12px;
  }
  .error {
    color: var(--color-destructive);
    font-size: 12px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  @media (max-width: 640px) {
    .settings-body {
      grid-template-columns: 1fr;
    }
    .settings-nav {
      flex-direction: row;
      overflow: auto;
      border-right: 0;
      border-bottom: 1px solid var(--color-border);
    }
    .settings-nav button {
      white-space: nowrap;
    }
    .settings-content {
      padding: 18px;
    }
    .setting-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }
  }
</style>
