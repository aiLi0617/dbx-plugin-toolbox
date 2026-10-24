<script>
  import { onMount } from "svelte";
  import { invoke } from "./host.js";
  import { L, pick, localizeError } from "./i18n.js";

  let {
    locale = "zh-CN",
    dirty = $bindable(false),
    updating = $bindable(false),
  } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const copy = {
    title: L(
      "Change master password",
      "修改主密码",
      "修改主密碼",
      "Cambiar contraseña maestra",
      "Modifica password principale",
      "マスターパスワードを変更",
      "Alterar senha mestra",
      "마스터 비밀번호 변경",
      "Ana şifreyi değiştir",
      "Əsas parolu dəyiş",
    ),
    locked: L(
      "Open and unlock the key vault before changing its password.",
      "请先打开并解锁密钥库，再修改主密码。",
      "請先開啟並解鎖金鑰庫，再修改主密碼。",
      "Abre y desbloquea la bóveda antes de cambiar su contraseña.",
      "Apri e sblocca la cassaforte prima di modificarne la password.",
      "パスワードを変更する前に保管庫を開いてロックを解除してください。",
      "Abra e desbloqueie o cofre antes de alterar a senha.",
      "비밀번호를 변경하기 전에 보관소를 열고 잠금을 해제하세요.",
      "Parolasını değiştirmeden önce kasayı açın ve kilidini kaldırın.",
      "Parolu dəyişməzdən əvvəl anbarı açın və kilidini açın.",
    ),
    hint: L(
      "Use Update to change the password immediately. Passwords are never saved or exported with preferences.",
      "点击“更新”立即修改主密码；密码不会随偏好设置保存或导出。",
      "點擊「更新」立即修改主密碼；密碼不會隨偏好設定儲存或匯出。",
      "Usa Actualizar para cambiar la contraseña al instante. No se guarda ni exporta con las preferencias.",
      "Usa Aggiorna per cambiare subito la password. Le password non vengono salvate o esportate con le preferenze.",
      "更新ボタンで直ちに変更します。パスワードは設定と一緒に保存・エクスポートされません。",
      "Use Atualizar para alterar a senha imediatamente. Senhas não são salvas nem exportadas com as preferências.",
      "업데이트를 눌러 비밀번호를 즉시 변경합니다. 비밀번호는 설정과 함께 저장되거나 내보내지지 않습니다.",
      "Parolayı hemen değiştirmek için Güncelle'yi kullanın. Parolalar tercihlerle kaydedilmez veya dışa aktarılmaz.",
      "Parolu dərhal dəyişmək üçün Yenilə düyməsini istifadə edin. Parollar seçimlərlə saxlanmır və ixrac edilmir.",
    ),
  };
  let currentPassword = $state("");
  let newPassword = $state("");
  let confirmNewPassword = $state("");
  let fieldErrors = $state({});
  let error = $state("");
  let notice = $state("");
  let status = $state(null);
  let disposed = false;
  let statusSequence = 0;

  $effect(() => {
    dirty = Boolean(currentPassword || newPassword || confirmNewPassword);
  });
  onMount(() => {
    void refreshStatus();
    const onChange = () => {
      void refreshStatus();
    };
    window.addEventListener("toolbox-vault-change", onChange);
    return () => {
      disposed = true;
      clearSecrets();
      dirty = false;
      window.removeEventListener("toolbox-vault-change", onChange);
    };
  });

  function clearSecrets() {
    currentPassword = "";
    newPassword = "";
    confirmNewPassword = "";
    fieldErrors = {};
  }
  function resetForm() {
    clearSecrets();
    error = "";
    notice = "";
  }
  async function refreshStatus() {
    const seq = ++statusSequence;
    try {
      const next = await invoke("toolbox/keys/status");
      if (disposed || seq !== statusSequence) return;
      status = {
        exists: Boolean(next?.exists),
        unlocked: Boolean(next?.unlocked),
      };
      if (!status.unlocked) clearSecrets();
    } catch (err) {
      if (!disposed && seq === statusSequence) {
        status = null;
        clearSecrets();
        error = localizeError(locale, err);
      }
    }
  }
  function passwordTooShort(value) {
    return Array.from(value || "").length < 8;
  }
  async function changePassword(event) {
    event?.preventDefault();
    if (updating || !status?.unlocked) return;
    fieldErrors = {};
    error = "";
    notice = "";
    if (passwordTooShort(currentPassword))
      fieldErrors.currentPassword = t(
        "主密码至少 8 位",
        "Master password must be at least 8 characters",
      );
    if (passwordTooShort(newPassword))
      fieldErrors.newPassword = t(
        "主密码至少 8 位",
        "Master password must be at least 8 characters",
      );
    if (newPassword !== confirmNewPassword)
      fieldErrors.confirmNewPassword = t(
        "两次输入的新密码不一致",
        "New passwords do not match",
      );
    if (Object.keys(fieldErrors).length) return;
    updating = true;
    try {
      await invoke(
        "toolbox/keys/change-password",
        { currentPassword, newPassword },
        60000,
      );
      if (!disposed) {
        clearSecrets();
        notice = t("主密码已更新", "Master password updated");
        window.dispatchEvent(new Event("toolbox-vault-change"));
      }
    } catch (err) {
      if (!disposed) error = localizeError(locale, err);
    } finally {
      updating = false;
    }
  }
</script>

<section class="password-settings" aria-labelledby="vault-password-title">
  <h4 id="vault-password-title">{pick(locale, copy.title)}</h4>
  <p class="hint">{pick(locale, copy.hint)}</p>
  {#if status && !status.unlocked}<p class="hint" role="status">
      {pick(locale, copy.locked)}
    </p>{/if}
  <form onsubmit={changePassword}>
    <fieldset disabled={updating || !status?.unlocked}>
      <label
        ><span>{t("当前主密码", "Current password")}</span><input
          class="dbx-input"
          type="password"
          bind:value={currentPassword}
          autocomplete="current-password"
          aria-invalid={Boolean(fieldErrors.currentPassword)}
          aria-describedby={fieldErrors.currentPassword
            ? "settings-current-password-error"
            : undefined}
        />{#if fieldErrors.currentPassword}<small
            id="settings-current-password-error"
            class="error">{fieldErrors.currentPassword}</small
          >{/if}</label
      >
      <label
        ><span>{t("新主密码", "New password")}</span><input
          class="dbx-input"
          type="password"
          bind:value={newPassword}
          autocomplete="new-password"
          aria-invalid={Boolean(fieldErrors.newPassword)}
          aria-describedby={fieldErrors.newPassword
            ? "settings-new-password-error"
            : undefined}
        />{#if fieldErrors.newPassword}<small
            id="settings-new-password-error"
            class="error">{fieldErrors.newPassword}</small
          >{/if}</label
      >
      <label
        ><span>{t("再输入一次", "Confirm new")}</span><input
          class="dbx-input"
          type="password"
          bind:value={confirmNewPassword}
          autocomplete="new-password"
          aria-invalid={Boolean(fieldErrors.confirmNewPassword)}
          aria-describedby={fieldErrors.confirmNewPassword
            ? "settings-confirm-password-error"
            : undefined}
        />{#if fieldErrors.confirmNewPassword}<small
            id="settings-confirm-password-error"
            class="error">{fieldErrors.confirmNewPassword}</small
          >{/if}</label
      >
      <div class="actions">
        <button class="dbx-btn dbx-btn--primary" type="submit"
          >{updating ? t("更新中…", "Updating…") : t("更新", "Update")}</button
        ><button class="dbx-btn" type="button" onclick={resetForm}
          >{t("清空", "Clear")}</button
        >
      </div>
    </fieldset>
  </form>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
</section>

<style>
  .password-settings {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
  }
  h4 {
    margin: 0 0 8px;
    font-size: 14px;
  }
  .hint {
    color: var(--color-muted-foreground);
    font-size: 12px;
    line-height: 1.6;
  }
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border: 0;
    margin: 14px 0 0;
    padding: 0;
    min-width: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .dbx-btn {
    min-height: 32px;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: var(--color-background);
    color: var(--color-foreground);
  }
  .dbx-btn:hover:not(:disabled) {
    background: var(--color-accent);
    border-color: var(--color-ring);
  }
  .dbx-btn--primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
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
  .error {
    color: var(--color-destructive);
    font-size: 12px;
  }
  .notice {
    color: var(--color-success);
    font-size: 12px;
  }
</style>
