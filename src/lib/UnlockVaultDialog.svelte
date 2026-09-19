<script>
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";

  let { locale = "zh-CN", purpose = "save", open = $bindable(false), onUnlocked = () => {} } = $props();

  let exists = $state(true);
  let password = $state("");
  let confirmPassword = $state("");
  let error = $state("");
  let busy = $state(false);

  const t = (zh, en) => pick(locale, zh, en);

  $effect(() => {
    if (!open) return;
    password = "";
    confirmPassword = "";
    error = "";
    busy = false;
    exists = true;
    let cancelled = false;
    (async () => {
      try {
        const status = await invoke("toolbox/keys/status");
        if (!cancelled) exists = Boolean(status.exists);
      } catch (err) {
        if (!cancelled) error = localizeError(locale, err);
      }
    })();
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  });

  function close() {
    if (busy) return;
    open = false;
    password = "";
    confirmPassword = "";
    error = "";
  }

  function onEnter(event, action) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      action();
    }
  }

  function tooShort(value) {
    return Array.from(value || "").length < 8;
  }

  function onOverlayClick(event) {
    if (event.target === event.currentTarget) close();
  }

  async function submit() {
    if (busy) return;
    if (tooShort(password)) {
      error = t("主密码至少 8 位", "Master password must be at least 8 characters");
      return;
    }
    if (!exists && password !== confirmPassword) {
      error = t("两次输入的主密码不一致", "Passwords do not match");
      return;
    }
    busy = true;
    error = "";
    try {
      if (exists) {
        await invoke("toolbox/keys/unlock", { password }, 60000);
      } else {
        await invoke("toolbox/keys/setup", { password }, 60000);
      }
      password = "";
      confirmPassword = "";
      open = false;
      onUnlocked();
    } catch (err) {
      error = localizeError(locale, err);
    } finally {
      busy = false;
    }
  }
</script>

{#if open}
  <div class="overlay" onclick={onOverlayClick} role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="unlock-vault-title">
      <div class="copy">
        <strong id="unlock-vault-title">
          {exists ? t("解锁密钥库", "Unlock key vault") : t("创建密钥库", "Create key vault")}
        </strong>
        <p>
          {exists
            ? purpose === "select"
              ? t("解锁后即可选择已保存的密钥。", "Unlock the vault to choose a saved key.")
              : t("写入密钥前需要先解锁。", "Unlock the vault before saving a key.")
            : t("还没有密钥库。设置主密码（至少 8 位）后即可保存。", "No vault yet. Set a master password (8+ characters) to save the key.")}
        </p>
      </div>
      {#if error}<div class="banner">{error}</div>{/if}
      <label class="field">
        <span>{t("主密码", "Master password")}</span>
        {#if exists}
          <div class="unlock-row">
            <input class="dbx-input" type="password" bind:value={password} autocomplete="current-password" onkeydown={(event) => onEnter(event, submit)} />
            <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={submit} type="button">
              {busy ? t("解锁中…", "Unlocking…") : t("解锁", "Unlock")}
            </button>
          </div>
        {:else}
          <input class="dbx-input" type="password" bind:value={password} autocomplete="new-password" onkeydown={(event) => onEnter(event, submit)} />
        {/if}
      </label>
      {#if !exists}
        <label class="field">
          <span>{t("再输入一次", "Confirm password")}</span>
          <input class="dbx-input" type="password" bind:value={confirmPassword} autocomplete="new-password" onkeydown={(event) => onEnter(event, submit)} />
        </label>
        <div class="actions">
          <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={submit} type="button">
            {busy ? t("创建中…", "Creating…") : t("创建并继续", "Create and continue")}
          </button>
          <button class="dbx-btn dbx-btn--ghost" disabled={busy} onclick={close} type="button">{t("取消", "Cancel")}</button>
        </div>
      {:else}
        <div class="actions">
          <button class="dbx-btn dbx-btn--ghost" disabled={busy} onclick={close} type="button">{t("取消", "Cancel")}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: color-mix(in srgb, CanvasText 28%, transparent);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(420px, 100%);
    padding: 16px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    box-shadow: 0 16px 40px color-mix(in srgb, CanvasText 18%, transparent);
  }
  .copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .copy strong { font-size: 13px; }
  .copy p, .field > span {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .banner {
    font-size: 12px;
    color: var(--color-destructive, #dc2626);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .unlock-row, .actions {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }
  .unlock-row .dbx-input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .unlock-row .dbx-btn, .actions .dbx-btn {
    flex: 0 0 auto;
  }
</style>
