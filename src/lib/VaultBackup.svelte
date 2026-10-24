<script>
  import { onDestroy } from 'svelte';
  import { invoke } from './host.js';
  import { toBase64 } from './codec.js';
  import { pick, localizeError } from './i18n.js';
  let { locale = 'zh-CN', dirty = $bindable(false), updating = $bindable(false) } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let password = $state(''), preview = $state(null), file = $state(null), error = $state(''), notice = $state('');
  let fileInput = $state(null);
  let disposed = false;
  $effect(() => { dirty = Boolean(password || preview || file); });
  onDestroy(() => { disposed = true; password = ''; void invoke('toolbox/keys/restore/cancel').catch(() => {}); });
  async function run(action) {
    if (updating) return;
    updating = true; error = ''; notice = '';
    try {
      const status = await invoke('toolbox/keys/status');
      if (!status.unlocked) throw new Error(t('请先创建或解锁密钥库。', 'Create or unlock the vault first.'));
      if (action === 'backup') {
        const result = await invoke('toolbox/keys/backup', { password, title: t('备份密钥库', 'Back up vault') }, 120000);
        if (!disposed && !result.cancelled) notice = t('加密备份已保存。', 'Encrypted backup saved.');
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
    <h3 id="backup-title">{t('备份与恢复', 'Backup and restore')}</h3>
    <p class="hint">{t('备份包含全部密钥和 TOTP。恢复需要备份时的主密码；以后改密不会更新旧备份。', 'Backups include all keys and TOTP accounts. Restore requires the master password used for that backup; password changes do not update old backups.')}</p>
  </header>
  <div class="backup-form">
    <label class="password-field">
      <span>{file ? t('备份文件的主密码', 'Backup master password') : t('当前主密码', 'Current master password')}</span>
      <input class="dbx-input" type="password" bind:value={password} autocomplete="current-password" disabled={updating || !!preview}/>
    </label>
    <input bind:this={fileInput} class="file-input" type="file" accept=".dbxvault" tabindex="-1" aria-label={t('选择加密备份', 'Choose encrypted backup')} disabled={updating || !!preview} onchange={(e) => { const selected = e.currentTarget.files?.[0]; if (selected) { file = selected; password = ''; error = ''; notice = ''; } e.currentTarget.value = ''; }}/>
    <div class="actions">
      {#if !file}
        <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || !password || !!preview} onclick={() => run('backup')}>{t('导出加密备份', 'Export encrypted backup')}</button>
      {/if}
      <button class="dbx-btn" type="button" disabled={updating || !!preview} onclick={() => fileInput?.click()}>{t('选择加密备份', 'Choose encrypted backup')}</button>
    </div>
    {#if file}
      <div class="selected-file">
        <svg width="20" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
        <div class="file-details"><strong>{file.name}</strong><small>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(file.size / 1024)} KB · .dbxvault</small></div>
      </div>
    {/if}
    {#if preview}
      <div class="restore-preview" role="status">
        <p>{t('密钥 / TOTP / 新增 / 跳过重复', 'Keys / TOTP / Added / Duplicates skipped')}</p>
        <strong>{preview.keys} / {preview.totp} / {preview.addedKeys + preview.addedTotp} / {preview.duplicates}</strong>
      </div>
    {/if}
    {#if file || preview}
      <div class="actions restore-actions">
        {#if preview}
          <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating} onclick={() => run('commit')}>{t('确认追加恢复', 'Confirm append restore')}</button>
        {:else}
          <button class="dbx-btn dbx-btn--primary" type="button" disabled={updating || !password} onclick={() => run('preview')}>{t('预览恢复', 'Preview restore')}</button>
        {/if}
        <button class="dbx-btn" type="button" disabled={updating} onclick={cancel}>{t('取消', 'Cancel')}</button>
      </div>
    {/if}
  </div>
  {#if updating}<p class="feedback hint" role="status">{t('处理中…', 'Working…')}</p>{/if}
  {#if error}<p class="feedback error" role="alert">{error}</p>{/if}
  {#if notice}<p class="feedback notice" role="status">{notice}</p>{/if}
</section>

<style>
  .backup { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  header { display: grid; gap: 10px; }
  h3, p { margin: 0; }
  h3 { font-size: 16px; line-height: 1.5; }
  .hint, .restore-preview p { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.7; }
  .backup-form { display: flex; flex-direction: column; align-items: stretch; gap: 16px; min-width: 0; padding: 20px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card, var(--color-background)); }
  .password-field { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: 12px; font-weight: 500; }
  .password-field input { width: 100%; min-width: 0; box-sizing: border-box; min-height: 36px; }
  .file-input { display: none; }
  .actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .actions .dbx-btn { min-height: 34px; height: auto; padding: 7px 12px; white-space: normal; text-align: center; line-height: 1.4; max-width: 100%; }
  .selected-file { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 12px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-muted); }
  .selected-file svg { flex: 0 0 auto; color: var(--color-muted-foreground); }
  .file-details { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .file-details strong { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
  .file-details small { color: var(--color-muted-foreground); font-size: 11px; }
  .restore-preview { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-muted); }
  .restore-preview strong { font-size: 16px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .feedback { padding: 10px 12px; border-radius: 7px; background: var(--color-muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
  .error { color: var(--color-destructive); }
  .notice { color: var(--color-success, var(--color-primary)); }
  @media (max-width: 480px) { .backup-form { padding: 14px; } .actions .dbx-btn { flex: 1 1 140px; } }
</style>
