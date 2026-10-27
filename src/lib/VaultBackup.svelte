<script>
  import { onDestroy, onMount } from 'svelte';
  import { invoke } from './host.js';
  import { toBase64 } from './codec.js';
  import { pick, localizeError } from './i18n.js';
  let { locale = 'zh-CN', dirty = $bindable(false), updating = $bindable(false) } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let password = $state(''), preview = $state(null), file = $state(null), error = $state(''), notice = $state('');
  let vaultStatus = $state(null), unlockOpen = $state(false), unlockExists = $state(true), unlockPassword = $state(''), unlockConfirm = $state(''), unlockError = $state(''), unlockBusy = $state(false);
  let fileInput = $state(null);
  let exportOpen = $state(false);
  let disposed = false;
  $effect(() => { dirty = Boolean(password || preview || file || unlockPassword || unlockConfirm); });
  onMount(() => {
    let active = true;
    void invoke('toolbox/keys/status').then((status) => { if (active) vaultStatus = status; }).catch(() => {});
    return () => { active = false; };
  });
  async function openUnlock() {
    unlockError = '';
    try {
      const status = await invoke('toolbox/keys/status');
      vaultStatus = status;
      unlockExists = Boolean(status.exists);
      unlockPassword = '';
      unlockConfirm = '';
      unlockOpen = true;
    } catch (cause) { unlockError = localizeError(locale, cause); }
  }
  async function submitUnlock() {
    if (unlockBusy) return;
    if (Array.from(unlockPassword).length < 8) { unlockError = t('主密码至少 8 位', 'Master password must be at least 8 characters'); return; }
    if (!unlockExists && unlockPassword !== unlockConfirm) { unlockError = t('两次输入的主密码不一致', 'Passwords do not match'); return; }
    unlockBusy = true; unlockError = '';
    try {
      await invoke(unlockExists ? 'toolbox/keys/unlock' : 'toolbox/keys/setup', { password: unlockPassword }, 60000);
      vaultStatus = { ...(vaultStatus || {}), exists: true, unlocked: true };
      unlockPassword = ''; unlockConfirm = ''; unlockOpen = false;
    } catch (cause) { unlockError = localizeError(locale, cause); }
    finally { unlockBusy = false; }
  }
  onDestroy(() => { disposed = true; password = ''; unlockPassword = ''; unlockConfirm = ''; dirty = false; void invoke('toolbox/keys/restore/cancel').catch(() => {}); });
  async function run(action) {
    if (updating) return;
    updating = true; error = ''; notice = '';
    try {
      const status = await invoke('toolbox/keys/status');
      vaultStatus = status;
      if (!status.unlocked) throw new Error(t('请先创建或解锁密钥库。', 'Create or unlock the vault first.'));
      if (action === 'backup') {
        const result = await invoke('toolbox/keys/backup', { password, title: t('备份密钥库', 'Back up vault') }, 120000);
        if (!disposed && !result.cancelled) { notice = t('加密备份已保存。', 'Encrypted backup saved.'); exportOpen = false; }
      } else if (action === 'preview') {
        if (!file || file.size > 16 * 1024 * 1024) throw new Error(t('请选择不超过 16 MB 的加密备份。', 'Choose an encrypted backup up to 16 MB.'));
        await invoke('toolbox/keys/restore/begin');
        for (let offset = 0; offset < file.size; offset += 256 * 1024) {
          if (disposed) return;
          await invoke('toolbox/keys/restore/upload', { data: toBase64(new Uint8Array(await file.slice(offset, offset + 256 * 1024).arrayBuffer())) });
        }
        const result = await invoke('toolbox/keys/restore/preview', { password }, 120000);
        if (!disposed) preview = result;
      } else {
        await invoke('toolbox/keys/restore/commit', { token: preview.token });
        if (!disposed) { preview = null; file = null; notice = t('恢复完成，已有数据未被覆盖。', 'Restore complete. Existing data was preserved.'); window.dispatchEvent(new Event('toolbox-vault-change')); }
      }
    } catch (cause) { if (!disposed) { error = localizeError(locale, cause); preview = null; } }
    finally { password = ''; updating = false; }
  }
  async function cancel() { await invoke('toolbox/keys/restore/cancel').catch(() => {}); preview = null; file = null; password = ''; }
</script>

<section class="backup" aria-labelledby="backup-title">
  <header>
    <h3 id="backup-title">{t('密钥库', 'Key vault')}</h3>
    <p class="hint">{t('加密备份包含全部密钥和 TOTP。导出使用当前主密码；导入必须输入创建该备份时的主密码。偏好设置导出不包含这些密钥材料。', 'Encrypted backups include all keys and TOTP accounts. Export uses your current master password; import requires the password used when that backup was created. Preferences exports do not contain key material.')}</p>
  </header>
  {#if vaultStatus && !vaultStatus.unlocked}
    <div class="vault-required" role="status">
      <div>
        <strong>{t('需要先解锁密钥库', 'Unlock the vault to continue')}</strong>
        <p>{t('加密备份会读取或追加密钥和 TOTP。请先创建或解锁密钥库，再回来继续。', 'Encrypted backups read or append keys and TOTP accounts. Create or unlock the vault, then continue here.')}</p>
      </div>
      <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || unlockBusy} onclick={openUnlock}>{t('在此创建或解锁', 'Create or unlock here')}</button>
    </div>
    {#if unlockOpen}
      <div class="inline-unlock">
        <strong>{unlockExists ? t('解锁密钥库', 'Unlock key vault') : t('创建密钥库', 'Create key vault')}</strong>
        <p class="hint">{unlockExists ? t('输入主密码后即可继续备份。', 'Enter the master password to continue.') : t('设置至少 8 位主密码后即可继续备份。', 'Set a master password of at least 8 characters to continue.')}</p>
        <label class="password-field"><span>{t('主密码', 'Master password')}</span><input class="dbx-input" type="password" bind:value={unlockPassword} autocomplete={unlockExists ? 'current-password' : 'new-password'} disabled={unlockBusy} onkeydown={(event) => event.key === 'Enter' && submitUnlock()} /></label>
        {#if !unlockExists}<label class="password-field"><span>{t('再次输入主密码', 'Confirm master password')}</span><input class="dbx-input" type="password" bind:value={unlockConfirm} autocomplete="new-password" disabled={unlockBusy} onkeydown={(event) => event.key === 'Enter' && submitUnlock()} /></label>{/if}
        {#if unlockError}<p class="feedback error" role="alert">{unlockError}</p>{/if}
        <div class="actions"><button class="dbx-btn dbx-btn--primary" type="button" disabled={unlockBusy} onclick={submitUnlock}>{unlockBusy ? t('处理中…', 'Working…') : unlockExists ? t('解锁并继续', 'Unlock and continue') : t('创建并继续', 'Create and continue')}</button><button class="dbx-btn" type="button" disabled={unlockBusy} onclick={() => { unlockOpen = false; unlockPassword = ''; unlockConfirm = ''; }}>{t('取消', 'Cancel')}</button></div>
      </div>
    {/if}
  {/if}
  <div class="backup-form">
    <input bind:this={fileInput} class="file-input" type="file" accept=".dbxvault" tabindex="-1" aria-label={t('选择加密备份', 'Choose encrypted backup')} disabled={updating || !!preview} onchange={(e) => { const selected = e.currentTarget.files?.[0]; if (selected) { exportOpen = false; file = selected; password = ''; error = ''; notice = ''; } e.currentTarget.value = ''; }}/>
    {#if !file && !exportOpen}
      <section class="backup-panel">
        <h4>{t('导出加密备份', 'Export encrypted backup')}</h4>
        <p class="hint">{t('把当前密钥库和 TOTP 保存为 .dbxvault 文件。', 'Save the current vault and TOTP accounts as a .dbxvault file.')}</p>
        <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || !vaultStatus?.unlocked} onclick={() => { exportOpen = true; password = ''; error = ''; notice = ''; }}>{t('导出加密备份', 'Export encrypted backup')}</button>
      </section>
      <section class="backup-panel import-start">
        <h4>{t('导入加密备份', 'Import encrypted backup')}</h4>
        <p class="hint">{t('先选择 .dbxvault 文件，再输入该文件创建时使用的主密码。', 'Choose a .dbxvault file first, then enter the master password used to create it.')}</p>
        <button class="dbx-btn" type="button" disabled={updating || !vaultStatus?.unlocked} onclick={() => fileInput?.click()}>{t('选择备份文件', 'Choose backup file')}</button>
      </section>
    {:else if exportOpen}
      <section class="backup-panel">
        <h4>{t('导出加密备份', 'Export encrypted backup')}</h4>
        <p class="hint">{t('把当前密钥库和 TOTP 保存为 .dbxvault 文件。', 'Save the current vault and TOTP accounts as a .dbxvault file.')}</p>
        <label class="password-field">
          <span>{t('当前主密码（用于导出）', 'Current master password (for export)')}</span>
          <input class="dbx-input" type="password" bind:value={password} autocomplete="current-password" disabled={updating}/>
        </label>
        <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || !password} onclick={() => run('backup')}>{t('导出加密备份', 'Export encrypted backup')}</button>
        <button class="dbx-btn" type="button" disabled={updating} onclick={() => { exportOpen = false; password = ''; error = ''; }}>{t('取消', 'Cancel')}</button>
      </section>
    {:else}
      <section class="backup-panel import-panel">
        <div class="step-heading"><div><h4>{t('验证并预览导入', 'Verify and preview import')}</h4><p class="hint">{t('输入备份文件的主密码，先预览将新增和跳过的项目。', 'Enter the backup password to preview what will be added or skipped.')}</p></div></div>
        <div class="selected-file">
          <svg width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
          <div class="file-details"><strong>{file.name}</strong><small>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(file.size / 1024)} KB · .dbxvault</small></div>
        </div>
        <label class="password-field">
          <span>{t('备份文件的主密码（用于导入）', 'Backup file password (for import)')}</span>
          <input class="dbx-input" type="password" bind:value={password} autocomplete="current-password" disabled={updating || !!preview}/>
        </label>
        {#if preview}
          <div class="restore-preview" role="status">
            <p class="restore-preview-title">{t('备份内容', 'Backup contents')}</p>
            <div class="restore-stats" aria-label={t('备份内容统计', 'Backup contents summary')}>
              <div class="restore-stat">
                <span>{t('密钥', 'Keys')}</span>
                <strong>{preview.keys}</strong>
              </div>
              <div class="restore-stat">
                <span>TOTP</span>
                <strong>{preview.totp}</strong>
              </div>
              <div class="restore-stat restore-stat--success">
                <span>{t('新增', 'To add')}</span>
                <strong>{preview.addedKeys + preview.addedTotp}</strong>
              </div>
              <div class="restore-stat restore-stat--muted">
                <span>{t('跳过重复', 'Duplicates skipped')}</span>
                <strong>{preview.duplicates}</strong>
              </div>
            </div>
          </div>
        {/if}
        <div class="actions restore-actions">
          {#if preview}
            <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating} onclick={() => run('commit')}>{t('确认追加恢复', 'Confirm and append')}</button>
          {:else}
            <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || !password} onclick={() => run('preview')}>{t('验证密码并预览', 'Verify password and preview')}</button>
          {/if}
          <button class="dbx-btn" type="button" disabled={updating} onclick={cancel}>{t('重新选择', 'Choose another')}</button>
        </div>
      </section>
    {/if}
  </div>
  {#if unlockError && !unlockOpen}<p class="feedback error" role="alert">{unlockError}</p>{/if}
  {#if updating}<p class="feedback hint" role="status">{t('处理中…', 'Working…')}</p>{/if}
  {#if error}<p class="feedback error" role="alert">{error}</p>{/if}
  {#if notice}<p class="feedback notice" role="status">{notice}</p>{/if}
</section>

<style>
  .backup { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .vault-required { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--color-warning) 35%, var(--color-border)); border-radius: 9px; background: color-mix(in srgb, var(--color-warning) 8%, var(--color-card)); }
  .vault-required strong { font-size: 13px; }
  .vault-required p { margin: 4px 0 0; color: var(--color-muted-foreground); font-size: 12px; line-height: 1.55; }
  .inline-unlock { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background); }
  .inline-unlock > strong { font-size: 13px; }
  header { display: grid; gap: 10px; }
  h3, p { margin: 0; }
  h3 { font-size: 16px; line-height: 1.5; }
  .hint, .restore-preview p { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.7; }
  .backup-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; min-width: 0; }
  .backup-form:has(.import-panel), .backup-form:has(.password-field) { grid-template-columns: minmax(0, 1fr); }
  .backup-panel { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background); }
  .backup-panel > .dbx-btn { margin-top: auto; }
  .backup-panel h4 { margin: 0; font-size: 13px; }
  .backup-panel > .hint { margin: 0; }
  .step-heading { display: flex; align-items: flex-start; gap: 10px; }
  .step-heading h4 { margin-top: 1px; }
  .password-field { width: 100%; display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 12px; font-weight: 500; }
  .password-field input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 36px; }
  .file-input { display: none; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .actions .dbx-btn { min-height: 34px; height: auto; padding: 7px 12px; white-space: normal; text-align: center; line-height: 1.4; max-width: 100%; }
  .selected-file { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-muted); }
  .selected-file svg { flex: 0 0 auto; color: var(--color-muted-foreground); }
  .file-details { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .file-details strong { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
  .file-details small { color: var(--color-muted-foreground); font-size: 11px; }
  .restore-preview { display: grid; gap: 10px; width: 100%; box-sizing: border-box; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-muted); }
  .restore-preview-title { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.5; }
  .restore-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .restore-stat { display: flex; min-width: 0; flex-direction: column; gap: 5px; padding: 10px 11px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-background); }
  .restore-stat span { color: var(--color-muted-foreground); font-size: 11px; line-height: 1.35; overflow-wrap: anywhere; }
  .restore-stat strong { color: var(--color-foreground); font-size: 17px; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .restore-stat--success { border-color: color-mix(in srgb, var(--color-success) 35%, var(--color-border)); }
  .restore-stat--success strong { color: var(--color-success); }
  .restore-stat--muted strong { color: var(--color-muted-foreground); }
  .feedback { padding: 10px 12px; border-radius: 7px; background: var(--color-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
  .error { color: var(--color-destructive); }
  .notice { color: var(--color-success, var(--color-primary)); }
  @media (max-width: 480px) { .backup-form { grid-template-columns: minmax(0, 1fr); } .actions .dbx-btn { flex: 1 1 140px; } }
  @media (max-width: 560px) { .restore-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .vault-required { align-items: flex-start; flex-direction: column; } }
</style>
