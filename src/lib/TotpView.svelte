<script>
  import { onMount, onDestroy } from "svelte";
  import { totpLabels } from "./totpStore.js";
  import CopyButton from "./CopyButton.svelte";
  import { themedTooltip } from "./themedTooltip.js";
  import Select from "./Select.svelte";

  import { parseTotpConfig } from "./codec.js";
  import { pick, localizeError } from "./i18n.js";
  import { invoke } from "./host.js";

  let { locale = "zh-CN", onVaultChange } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  let secret = $state("");
  let digits = $state("6");
  let step = $state("30");
  let algorithm = $state("SHA-1");
  let windows = $state([]);
  let effectiveConfig = $state(null);
  let error = $state("");
  let secretFocused = $state(false);
  let formatError = $state(false);
  let remaining = $state(30);
  let activeStep = $state(30);
  let savedExists = $state(false);
  let savedUnlocked = $state(false);
  let savedEntries = $state([]);
  let selectedId = $state("");
  let storePassword = $state("");
  let storeError = $state("");
  let saveName = $state("");
  let saveNote = $state("");
  let saveIssuer = $state("");
  let saveAccount = $state("");
  let saveError = $state("");
  let editError = $state("");
  let accountDialog = $state();
  let saving = $state(false);
  let generating = $state(false);

  let busy = $state(false);
  let storeReady = $state(false);
  let protection = $state("vault");
  let confirmPassword = $state("");
  let unlockOpen = $state(false);
  let unlockDialog = $state();
  let saveOpen = $state(false);
  let showSecret = $state(false);
  let query = $state("");
  let managing = $state(false);
  let editing = $state(null);
  let pendingDelete = $state(null);
  let deleteDialog = $state();
  let deleteError = $state("");
  let infoMode = $state("");

  let infoDialog = $state();
  let dragId = $state("");
  let dragTargetId = $state("");
  let revealedSecret = $state("");
  let revealBusy = $state(false);
  let revealError = $state("");
  let revealTimer;
  let revealVersion = 0;
  let disposed = false;
  let revision = 0;

  function clearCodes() { windows = []; effectiveConfig = null; error = ""; formatError = false; generating = false; }
  function clearSensitive() {

    infoMode = "";
    hideSavedSecret(); dragId = ""; dragTargetId = "";
    revision++;
    secret = ""; storePassword = ""; confirmPassword = ""; editing = null; pendingDelete = null; deleteError = "";
    saveName = ""; saveNote = ""; saveIssuer = ""; saveAccount = ""; saveError = ""; editError = ""; query = "";
    selectedId = ""; savedEntries = []; savedUnlocked = false;
    showSecret = false; saveOpen = false; unlockOpen = false; clearCodes();
  }
  async function refreshSaved(token = revision) {
    const status = await invoke("toolbox/totp/status");
    if (disposed || token !== revision) return;
    if (!status.unlocked && savedUnlocked) {
      clearSensitive();
      savedExists = Boolean(status.exists); storeReady = true;
      return;
    }
    const result = status.unlocked ? await invoke("toolbox/totp/list") : { entries: [] };
    if (disposed || token !== revision) return;
    savedExists = Boolean(status.exists);
    savedUnlocked = Boolean(status.unlocked);
    protection = status.protection;
    savedEntries = result.entries || [];
    storeReady = true;
    if (selectedId && !savedEntries.some(entry => entry.id === selectedId)) { selectedId = ""; clearCodes(); }

  }
  async function retrySaved() {
    storeError = "";
    try { await refreshSaved(); } catch (err) { if (!disposed) storeError = localizeError(locale, err); }
  }
  async function unlockSaved() {
    if (busy || !storeReady) return;
    storeError = ""; busy = true;
    const token = revision;
    try {
      if (!savedExists && storePassword !== confirmPassword) throw new Error(t("两次密码不一致", "Passwords do not match"));
      await invoke(savedExists ? "toolbox/keys/unlock" : "toolbox/keys/setup", { password: storePassword });
      window.dispatchEvent(new Event("toolbox-vault-change")); onVaultChange?.();
      await refreshSaved(token);
      if (!disposed && token === revision) {
        unlockOpen = false;
        if (secret.trim()) beginSave();

      }
    } catch (err) { if (!disposed && token === revision) storeError = localizeError(locale, err); }
    finally { storePassword = ""; confirmPassword = ""; busy = false; }
  }
  function manualInput() {
    infoMode = "";
    hideSavedSecret();
    selectedId = ""; showSecret = false; clearCodes();
  }
  function beginSave() {
    if (!savedUnlocked) { unlockOpen = true; return; }
    const labels = totpLabels(secret);
    saveName = labels.account || labels.issuer || t("未命名 TOTP", "Unnamed TOTP");
    saveIssuer = labels.issuer; saveAccount = labels.account;
    saveNote = ""; saveError = ""; editing = null; saveOpen = true;
  }
  function beginEdit(entry) {
    editing = { id: entry.id, name: entry.name, issuer: entry.issuer, account: entry.account, note: entry.note || "" };
    editError = ""; saveOpen = false; pendingDelete = null;
  }
  function clearDraft() {
    saveOpen = false; editing = null; saveName = ""; saveNote = ""; saveIssuer = ""; saveAccount = ""; saveError = ""; editError = "";
  }
  function cancelAccount() {
    if (!busy && !saving) clearDraft();
  }
  function submitAccount() {
    void (editing ? updateSaved() : saveCurrent());
  }
  function accountKeydown(event) {
    if (event.key === "Enter" && !event.isComposing && event.target.tagName === "INPUT") {
      event.preventDefault(); submitAccount();
    }
  }
  function validateDraft(name, note, issuer = "", account = "") {
    if (!name.trim() || Array.from(name.trim()).length > 128 || /[\x00-\x1f\x7f-\x9f]/.test(name.trim()) ||
        Array.from(issuer.trim()).length > 128 || Array.from(account.trim()).length > 256 || /[\x00-\x1f\x7f-\x9f]/.test(issuer.trim() + account.trim())) {
      return t("名称必填且最多 128 字符，请检查账户信息。", "A name is required (up to 128 characters). Check the account details.");
    }
    if (Array.from(note).length > 500 || /[\x00-\x09\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(note)) {
      return t("备注最多 500 字符，仅支持文本和换行。", "Notes allow up to 500 characters, with text and line breaks only.");
    }
    return "";
  }
  async function saveCurrent() {
    if (saving || busy) return;
    saveError = validateDraft(saveName, saveNote, saveIssuer, saveAccount);
    if (saveError) return;
    const token = revision;
    try {
      const config = parseTotpConfig(secret.trim(), { digits, step, algorithm });
      const labels = totpLabels(secret);
      saving = true;
      if (!savedUnlocked) throw new Error("Key vault is locked");
      if (disposed || token !== revision) return;
      const result = await invoke("toolbox/totp/save", {
        name: saveName.trim(), note: saveNote.trim(),
        issuer: saveIssuer.trim(), account: saveAccount.trim(), secret: config.secret, digits: config.digits, period: config.step, algorithm: config.algorithm,
      });
      if (disposed || token !== revision) return;
      // A successful write must remain successful even if the list refresh fails.
      // Keep the returned metadata so a retry cannot create a duplicate account.
      const entry = result.entry;
      savedEntries = [...savedEntries.filter(item => item.id !== entry.id), entry];
      savedExists = true; savedUnlocked = true; protection = "vault";
      secret = ""; clearDraft(); showSecret = false; clearCodes(); selectedId = entry.id;
      try { await refreshSaved(token); }
      catch (err) { if (!disposed && token === revision) storeError = localizeError(locale, err); }
    } catch (err) { if (!disposed && token === revision) saveError = localizeError(locale, err); }
    finally { saving = false; }
  }
  function selectSaved(entry) {
    infoMode = "";
    hideSavedSecret();
    clearCodes(); secret = ""; showSecret = false; saveOpen = false; selectedId = entry.id;
  }
  async function mutateSaved(method, params) {
    if (busy || saving) return false;
    busy = true; storeError = "";
    const token = revision;
    try {
      await invoke(`toolbox/totp/${method}`, params);
      if (disposed || token !== revision) return false;
      await refreshSaved(token);
      return !disposed && token === revision;
    } catch (err) {
      if (!disposed && token === revision) storeError = localizeError(locale, err);
      return false;
    } finally { busy = false; }
  }
  async function deleteSaved() {
    if (!pendingDelete) return;
    deleteError = "";
    const id = pendingDelete.id;
    if (await mutateSaved("delete", { id })) {
      if (selectedId === id) { selectedId = ""; clearCodes(); }
      pendingDelete = null;
    } else if (!disposed && pendingDelete) { deleteError = storeError; storeError = ""; }
  }
  async function updateSaved() {
    if (!editing || busy || saving) return;
    editError = validateDraft(editing.name, editing.note || "", editing.issuer, editing.account);
    if (editError) return;
    if (await mutateSaved("save", { id: editing.id, name: editing.name.trim(), issuer: editing.issuer.trim(), account: editing.account.trim(), note: (editing.note || "").trim() })) clearDraft();
    else if (!disposed && editing) { editError = storeError; storeError = ""; }
  }
  async function moveSaved(index, delta) {
    const ids = savedEntries.map(e => e.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await mutateSaved("reorder", { ids });
  }
  function hideSavedSecret() {
    revealVersion++; clearTimeout(revealTimer); revealedSecret = ""; revealBusy = false; revealError = "";
  }
  async function revealSavedSecret() {
    if (revealedSecret || revealBusy) { hideSavedSecret(); return; }
    const id = selectedId, token = revision, version = ++revealVersion;
    revealBusy = true; revealError = "";
    try {
      const result = await invoke("toolbox/totp/reveal", { id });
      if (disposed || token !== revision || version !== revealVersion || selectedId !== id) return;
      if (typeof result?.secret !== "string" || !result.secret) throw new Error("Method not found");
      revealedSecret = result.secret;
      revealTimer = setTimeout(hideSavedSecret, 30000);
    } catch (err) {
      if (!disposed && token === revision && version === revealVersion) {
        const unsupported = /method not found|unknown.*(?:method|operation)|not implemented|-32601/i.test(`${err?.code || ""} ${err?.message || ""}`);
        revealError = unsupported
          ? t("显示密钥需要新版后端，请重启插件后重试。", "Showing secrets requires the updated backend. Restart the plugin and retry.")
          : localizeError(locale, err);
      }
    }
    finally { if (version === revealVersion) revealBusy = false; }
  }
  function startDrag(event, id) {
    if (busy || saving || event.button !== 0) return;
    event.preventDefault(); dragId = id; dragTargetId = "";
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function trackDrag(event) {
    if (!dragId) return;
    dragTargetId = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest('[data-totp-id]')?.dataset.totpId || "";
  }
  function finishDrag(event) {
    const target = dragTargetId; dragTargetId = "";
    void dropSaved(event, target);
  }
  async function dropSaved(event, targetId) {
    event.preventDefault();
    const sourceId = dragId; dragId = "";
    if (!sourceId || sourceId === targetId || busy || saving) return;
    const ids = savedEntries.map(entry => entry.id).filter(id => id !== sourceId);
    const at = ids.indexOf(targetId);
    if (at < 0 || !savedEntries.some(entry => entry.id === sourceId)) return;
    ids.splice(at, 0, sourceId);
    await mutateSaved("reorder", { ids });
  }
  onMount(() => {
    void refreshSaved(revision).catch(err => { if (!disposed) storeError = localizeError(locale, err); });
    const onVaultChange = (event) => {
      hideSavedSecret();
      if (event.detail?.unlocked === false) { clearSensitive(); return; }
      const token = revision;
      void invoke("toolbox/totp/status").then(status => {
        if (!disposed && token === revision) { if (!status.unlocked) clearSensitive(); else void refreshSaved(); }
      }).catch(() => { if (!disposed) clearSensitive(); });
    };
    let checking = false;
    const statusTimer = setInterval(async () => {
      if (checking || !savedUnlocked) return;
      checking = true;
      const token = revision;
      try {
        const status = await invoke("toolbox/totp/status");
        if (!disposed && token === revision && !status.unlocked) clearSensitive();
      } catch { if (!disposed && token === revision) clearSensitive(); }
      finally { checking = false; }
    }, 1000);
    const onClose = () => { clearSensitive(); void invoke("toolbox/totp/lock").catch(() => {}); };
    window.addEventListener("toolbox-vault-change", onVaultChange);
    window.addEventListener("toolbox-workbench-lock", onClose);
    window.addEventListener("pagehide", onClose);
    return () => {
      clearInterval(statusTimer);
      window.removeEventListener("toolbox-vault-change", onVaultChange);
      window.removeEventListener("toolbox-workbench-lock", onClose);
      window.removeEventListener("pagehide", onClose);
    };
  });
  $effect(() => {
    if (!deleteDialog) return;
    if (pendingDelete && !deleteDialog.open) deleteDialog.showModal();
    else if (!pendingDelete && deleteDialog.open) deleteDialog.close();
  });
  onDestroy(() => { disposed = true; clearSensitive(); });
  $effect(() => {
    if (!infoDialog) return;
    if (infoMode && !infoDialog.open) infoDialog.showModal();
    else if (!infoMode && infoDialog.open) infoDialog.close();
  });

  $effect(() => {
    if (!unlockDialog) return;
    if (unlockOpen && !unlockDialog.open) unlockDialog.showModal();
    else if (!unlockOpen && unlockDialog.open) unlockDialog.close();
  });
  $effect(() => {
    if (!accountDialog) return;
    if ((saveOpen || editing) && !accountDialog.open) accountDialog.showModal();
    else if (!saveOpen && !editing && accountDialog.open) accountDialog.close();
  });

  $effect(() => {
    if (selectedId) return;
    const token = revision;
    const raw = secret.trim();
    // Read settings before the debounce, so edits always cancel an old request.
    const options = { digits, step, algorithm };
    clearCodes();
    if (!raw) {
      windows = [];
      effectiveConfig = null;
      error = "";
      activeStep = Number(step);
      remaining = activeStep - (Math.floor(Date.now() / 1000) % activeStep);
      return;
    }
    generating = true;
    let cancelled = false;
    let lastCounter = -1;
    let pending = false;
    let invalidInput = false;
    const refresh = async () => {
      if (pending || invalidInput) return;
      pending = true;
      let config;
      try {
        config = parseTotpConfig(raw, options);
      } catch {
        windows = [];
        effectiveConfig = null;
        formatError = true; error = t("不是有效的 TOTP 密钥或 URI", "Not a valid TOTP secret or URI");
        generating = false; pending = false; invalidInput = true;
        return;
      }
      const now = Date.now();
      remaining = config.step - (Math.floor(now / 1000) % config.step);
      activeStep = config.step;
      const counter = Math.floor(now / 1000 / config.step);
      if (counter === lastCounter) { pending = false; return; }
      try {
        const result = await invoke("toolbox/totp/manual", { secret: config.secret, digits: config.digits, period: config.step, algorithm: config.algorithm });
        result.step = result.period;
        if (cancelled || disposed || token !== revision) return;
        windows = result.windows;
        effectiveConfig = { digits: result.digits, step: result.step, algorithm: result.algorithm };
        error = "";
        lastCounter = counter;
      } catch (err) {
        if (cancelled || disposed || token !== revision) return;
        windows = [];
        effectiveConfig = null;
        formatError = false;
        error = localizeError(locale, err);
        invalidInput = true;
      } finally { pending = false; if (!cancelled && !disposed && token === revision) generating = false; }
    };
    let id;
    const debounce = setTimeout(() => { void refresh(); id = setInterval(refresh, 200); }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearInterval(id);
    };
  });

  $effect(() => {
    if (!selectedId || !savedUnlocked) return;
    const idSnapshot = selectedId, token = revision;
    clearCodes();
    generating = true;
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await invoke("toolbox/totp/generate", { id: idSnapshot });
        if (cancelled || disposed || token !== revision) return;
        windows = result.windows || [];
        effectiveConfig = { digits: result.digits, step: result.period, algorithm: result.algorithm };
        activeStep = result.period;
        remaining = result.remaining;
        error = "";
      } catch (err) {
        if (!cancelled && !disposed && token === revision) { clearCodes(); error = localizeError(locale, err); }
      } finally { pending = false; if (!cancelled && !disposed && token === revision) generating = false; }
    };
    void refresh();
    const id = setInterval(refresh, 1000);
    return () => { cancelled = true; clearInterval(id); };
  });

  const visibleError = $derived(formatError && secretFocused ? "" : error);
  const isUri = $derived(/^otpauth:\/\//i.test(secret.trim()));
  const previousWindow = $derived(windows.find((item) => item.offset === -1));
  const currentWindow = $derived(windows.find((item) => item.offset === 0));
  const nextWindow = $derived(windows.find((item) => item.offset === 1));
  const shownDigits = $derived(isUri && effectiveConfig ? String(effectiveConfig.digits) : digits);
  const shownStep = $derived(isUri && effectiveConfig ? String(effectiveConfig.step) : step);
  const shownAlgorithm = $derived(isUri && effectiveConfig ? effectiveConfig.algorithm : algorithm);
  const stepOptions = $derived.by(() => {
    const values = ["30", "60"];
    if (isUri && effectiveConfig && !values.includes(String(effectiveConfig.step))) values.push(String(effectiveConfig.step));
    return values.map(value => ({ value, label: value + "s" }));
  });
  const ratio = $derived(Math.max(0, Math.min(1, remaining / activeStep)));
  const selectedEntry = $derived(savedEntries.find(entry => entry.id === selectedId));
  const labels = $derived(totpLabels(secret));
  const filteredEntries = $derived(savedEntries.filter(entry =>
    `${entry.name} ${entry.issuer} ${entry.account} ${entry.note || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));

  function grouped(code) {
    if (!code) return "";
    return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`;
  }
</script>
{#snippet eyeIcon(visible)}
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{#if visible}<path d="m3 3 18 18"/>{/if}</svg>
{/snippet}

<div class="totp-page">
  <div class="workspace">


    <main class="generator">
      <section class="input-panel">
        <div class="panel-heading">
          <div class="heading-title"><strong use:themedTooltip={selectedEntry?.name || undefined}>{selectedEntry?.name || t("手动输入", "Manual input")}</strong></div>
          {#if selectedId}<button class="dbx-btn" type="button" disabled={busy || saving} onclick={manualInput}>{t("手动输入", "Manual input")}</button>{/if}
        </div>
        <div class="input-content">
        {#if selectedEntry}
          <div class="saved-key-field"><p class="account-detail" use:themedTooltip={[selectedEntry.issuer, selectedEntry.account].filter(Boolean).join(" · ")}>{[selectedEntry.issuer, selectedEntry.account].filter(Boolean).join(" · ") || t("TOTP 密钥", "TOTP secret")}</p>
          <div class="saved-secret"><input class="dbx-input" aria-label={t("TOTP 密钥", "TOTP secret")} type={revealedSecret ? "text" : "password"} value={revealedSecret} placeholder="••••••••••••••••" readonly autocomplete="off" /><button class="dbx-btn eye-button" type="button" onclick={revealSavedSecret} disabled={revealBusy} aria-pressed={!!revealedSecret} aria-label={revealedSecret ? t("隐藏", "Hide") : t("显示", "Show")} use:themedTooltip={revealedSecret ? t("隐藏", "Hide") : t("显示", "Show")}>{@render eyeIcon(!!revealedSecret)}</button><CopyButton themedTooltip={true} {locale} text={revealedSecret} /></div>
          </div><div class="note-slot">{#if revealError}<span class="reveal-error" use:themedTooltip={revealError} role="alert">{revealError}</span>{:else if selectedEntry.note}<button class="note-preview" use:themedTooltip={selectedEntry.note} type="button" aria-haspopup="dialog" onclick={() => infoMode = "note"}>{t("备注", "Note")} · {selectedEntry.note}</button>{/if}</div>
          <div class="config-badges"><span>{selectedEntry.digits} {t("位数", "Digits")}</span><span>{selectedEntry.period}s</span><span>{selectedEntry.algorithm}</span></div>
        {:else}
          <label class="field"><span>{t("密钥（Base32 / otpauth URI）", "Secret (Base32 / otpauth URI)")}</span>
            <div class="secret-row"><input class="dbx-input" type={showSecret ? "text" : "password"} aria-label={t("密钥（Base32 / otpauth URI）", "Secret (Base32 / otpauth URI)")} bind:value={secret} onfocus={() => secretFocused = true} onblur={() => secretFocused = false} disabled={saving} autocomplete="off" spellcheck="false" placeholder="JBSWY3DPEHPK3PXP / otpauth://..." />
              <button class="dbx-btn eye-button" type="button" aria-pressed={showSecret} disabled={saving || !secret} onclick={() => showSecret = !showSecret} aria-label={showSecret ? t("隐藏", "Hide") : t("显示", "Show")} use:themedTooltip={showSecret ? t("隐藏", "Hide") : t("显示", "Show")}>{@render eyeIcon(showSecret)}</button>
              <button class="dbx-btn dbx-btn--ghost" type="button" disabled={saving || !secret} onclick={() => { secret = ""; showSecret = false; saveOpen = false; clearCodes(); }}>{t("清空", "Clear")}</button>
              <button class="dbx-btn" type="button" disabled={!currentWindow || !!error || generating || saving || busy || !storeReady} aria-haspopup="dialog" onclick={beginSave}>＋ {t("保存账户", "Save account")}</button>
            </div>
          </label>

          <div class="totp-options">
            <label class="field"><span>{t("位数", "Digits")}</span><Select value={shownDigits} onchange={value => digits = value} disabled={isUri || saving} options={[{value:"6",label:"6"},{value:"8",label:"8"}]} /></label>
            <label class="field"><span>{t("周期", "Period")}</span><Select value={shownStep} onchange={value => step = value} disabled={isUri || saving} options={stepOptions} /></label>
            <label class="field"><span>{t("算法", "Algorithm")}</span><Select value={shownAlgorithm} onchange={value => algorithm = value} disabled={isUri || saving} options={["SHA-1","SHA-256","SHA-512"].map(value=>({value,label:value}))} /></label>
          </div>

        {/if}
        </div>
      </section>

      <section class="code-panel" class:expiring={currentWindow && remaining <= 5} aria-busy={generating} aria-label={t("当前口令", "Current")}>
          <div class="code-heading"><span>{t("当前口令", "Current")}</span><div class="countdown" style:--progress={`${currentWindow ? ratio * 360 : 0}deg`} aria-label={currentWindow ? t(`${remaining} 秒后刷新`, `Refreshes in ${remaining}s`) : t("等待输入密钥", "Waiting for a secret")}><span>{currentWindow ? remaining : "—"}<small>s</small></span></div></div>
          <div class="code-row"><p class="code primary-code" class:placeholder={!currentWindow} aria-live="polite">{currentWindow ? grouped(currentWindow.code) : "··· ···"}</p><CopyButton themedTooltip={true} {locale} text={currentWindow?.code || ""} labelZh="复制当前口令" labelEn="Copy current code" /></div>
          <div class="code-bottom" class:code-error={!!visibleError} role={visibleError ? "alert" : "status"}><span class="status-dot"></span><span>{visibleError || (generating ? t("正在解析…", "Parsing…") : currentWindow ? t("自动刷新", "Auto refresh") : t("等待输入密钥", "Waiting for a secret"))}</span><span>{currentWindow ? `${activeStep}s` : ""}</span></div>
          <div class="meter" aria-hidden="true"><div style:transform={`scaleX(${currentWindow ? ratio : 0})`}></div></div>
      </section>
      <section class="adjacent-panel" aria-label={t("相邻周期口令", "Adjacent codes")}><h3>{t("相邻周期口令", "Adjacent codes")}</h3><div class="adjacent-grid">
        <section><div class="window-heading"><span>{t("上一周期", "Previous")}</span><small>{previousWindow?.code ? t("已过期", "Expired") : "—"}</small></div><div class="code-row"><span class="code" class:placeholder={!previousWindow?.code}>{grouped(previousWindow?.code) || "··· ···"}</span><CopyButton themedTooltip={true} {locale} text={previousWindow?.code || ""} labelZh="复制上一口令" labelEn="Copy previous code" /></div></section>
        <section><div class="window-heading"><span>{t("下一周期", "Next")}</span><small>{nextWindow?.code ? t(`${remaining} 秒后生效`, `In ${remaining}s`) : "—"}</small></div><div class="code-row"><span class="code" class:placeholder={!nextWindow?.code}>{grouped(nextWindow?.code) || "··· ···"}</span><CopyButton themedTooltip={true} {locale} text={nextWindow?.code || ""} labelZh="复制下一口令" labelEn="Copy next code" /></div></section>
      </div><p class="dbx-hint">{t("上一周期口令能否使用，取决于目标系统允许的时间窗口。", "Acceptance of previous codes depends on the target system's time window.")}</p></section>
    </main>
    <aside class="accounts-panel" aria-label={t("已保存 TOTP", "Saved TOTP")}>
      <div class="panel-heading">
        <div class="heading-title"><strong>{t("已保存 TOTP", "Saved TOTP")}</strong>{#if savedUnlocked}<span class="count">{savedEntries.length}</span>{/if}</div>
        {#if savedEntries.length}<button class="dbx-btn dbx-btn--ghost" type="button" aria-pressed={managing} onclick={() => managing = !managing}>{managing ? t("完成", "Done") : t("管理", "Manage")}</button>{/if}
      </div>
      {#if !storeReady && !storeError}
        <p class="loading-note" role="status">{t("正在读取账户…", "Loading accounts…")}</p>
      {:else if !savedUnlocked}
        <div class="account-empty">
          <svg class="empty-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          <strong>{t("已有账户需要解锁", "Unlock your saved accounts")}</strong>
          <p>{t("已保存账户与密钥库共用主密码、锁定状态和备份。", "Saved accounts share the vault master password, lock state and backup.")}</p>
          <button class="dbx-btn" type="button" onclick={() => unlockOpen = true}>{t("解锁已有账户", "Unlock saved accounts")}</button>
        </div>
      {:else if savedEntries.length}
        <input class="dbx-input account-search" type="search" bind:value={query} placeholder={t("搜索账户", "Search accounts")} aria-label={t("搜索账户", "Search accounts")} />
        <div class="account-list">
          {#each filteredEntries as entry (entry.id)}
            <div class="account-item" data-totp-id={entry.id} class:active={selectedId === entry.id} class:drop-target={dragTargetId === entry.id && dragId !== entry.id}>
                <button class="dbx-btn dbx-btn--ghost drag-handle" type="button" disabled={busy || saving} aria-label={t("拖动排序", "Drag to reorder")} use:themedTooltip={t("拖动排序", "Drag to reorder")} onpointerdown={(event) => startDrag(event, entry.id)} onpointermove={trackDrag} onpointerup={finishDrag} onpointercancel={() => { dragId = ""; dragTargetId = ""; }}>⠿</button>
              <button class="account-select" type="button" aria-pressed={selectedId === entry.id} disabled={busy || saving} onclick={() => selectSaved(entry)} ondragover={(event) => { if (dragId) event.preventDefault(); }} ondrop={(event) => void dropSaved(event, entry.id)}>
                <span class="account-avatar" aria-hidden="true">{(entry.issuer || entry.name).slice(0, 1).toUpperCase()}</span>
                <span class="account-copy"><strong use:themedTooltip={entry.name}>{entry.name}</strong><small use:themedTooltip={[entry.issuer, entry.account].filter(Boolean).join(" · ")}>{[entry.issuer, entry.account].filter(Boolean).join(" · ") || t("未标记账户", "Unlabeled account")}</small>{#if entry.note}<span class="list-note" use:themedTooltip={entry.note}>{entry.note}</span>{/if}</span>
                {#if selectedId === entry.id}<span class="selected-mark" aria-hidden="true">✓</span>{/if}
              </button>
              <div class="account-actions" class:management-hidden={!managing}>
                <button class="dbx-btn dbx-btn--ghost" type="button" disabled={busy || saving} onclick={() => beginEdit(entry)}>{t("编辑", "Edit")}</button>
                <button class="dbx-btn dbx-btn--ghost danger" type="button" disabled={busy || saving} onclick={() => { deleteError = ""; pendingDelete = entry; editing = null; }}>{t("删除", "Delete")}</button>
              </div>
            </div>
          {/each}
          {#if !filteredEntries.length}<p class="empty-search dbx-hint">{t("没有匹配的账户", "No matching accounts")}</p>{/if}
        </div>
      {:else}
        <div class="account-empty">
          <svg class="empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h5M8 16h3"/></svg>
          <strong>{t("还没有保存的 TOTP。", "No saved TOTP entries yet.")}</strong>
          <p>{t("输入密钥生成验证码后，可将账户保存在这里。", "Generate a code from a secret, then save the account here.")}</p>
        </div>
      {/if}
      {#if storeError && !unlockOpen}<div class="inline-error" role="alert"><span>{storeError}</span><button class="dbx-btn" type="button" disabled={busy || saving} onclick={retrySaved}>{t("重试", "Retry")}</button></div>{/if}
      <div class="protection-note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z"/><path d="m8 12 3 3 5-6"/></svg><span>{t("密钥库主密码保护 · 本机加密保存", "Vault master password · Encrypted locally")}</span></div>
    </aside>
  </div>
  <dialog class="migration-dialog" bind:this={unlockDialog} aria-labelledby="totp-unlock-title" oncancel={(event) => { if (busy) event.preventDefault(); }} onclose={() => { unlockOpen = false; storePassword = ""; confirmPassword = ""; }}>
    <div class="migration-form">
      <h2 id="totp-unlock-title">{savedExists ? t("解锁密钥库", "Unlock vault") : t("创建密钥库", "Create vault")}</h2>
      <p>{t("已保存账户与密钥库共用主密码、锁定状态和备份。", "Saved accounts share the vault master password, lock state and backup.")}</p>
      <label>{t("主密码", "Master password")}<input class="dbx-input" type="password" bind:value={storePassword} minlength="8" required autocomplete={savedExists ? "current-password" : "new-password"} disabled={busy}/></label>
      {#if !savedExists}<label>{t("确认主密码", "Confirm master password")}<input class="dbx-input" type="password" bind:value={confirmPassword} required autocomplete="new-password" disabled={busy}/></label>{/if}
      {#if storeError}<p role="alert">{storeError}</p>{/if}
      <div class="form-actions"><button class="dbx-btn" type="button" disabled={busy} onclick={() => unlockOpen = false}>{t("取消", "Cancel")}</button><button class="dbx-btn dbx-btn--primary" type="button" onclick={() => void unlockSaved()} disabled={busy}>{savedExists ? t("解锁", "Unlock") : t("创建", "Create")}</button></div>
    </div>
  </dialog>
<dialog class="account-dialog info-dialog" bind:this={infoDialog} aria-label={t("备注", "Note")} onclose={() => { if (!infoDialog.open) infoMode = ""; }}><div class="account-form"><h2>{t("备注", "Note")}</h2><p class="full-note">{selectedEntry?.note || ""}</p><div class="form-actions"><button class="dbx-btn" type="button" onclick={() => infoMode = ""}>{t("完成", "Done")}</button></div></div></dialog>
  <dialog class="account-dialog" bind:this={accountDialog} aria-label={editing ? t("编辑账户", "Edit account") : t("保存账户", "Save account")} onkeydown={accountKeydown} oncancel={(event) => { if (busy || saving) event.preventDefault(); }} onclose={() => { if (!accountDialog.open) clearDraft(); }}>
    <div class="account-form">
      <h2>{editing ? t("编辑账户", "Edit account") : t("保存账户", "Save account")}</h2>
      {#if editing}
        <label class="field"><span>{t("名称", "Name")}</span><input class="dbx-input" bind:value={editing.name} required disabled={busy} /></label>
        <div class="edit-fields"><label class="field"><span>{t("服务名称", "Service name")}</span><input class="dbx-input" bind:value={editing.issuer} disabled={busy}/></label><label class="field"><span>{t("账户", "Account")}</span><input class="dbx-input" bind:value={editing.account} disabled={busy}/></label></div>
        <label class="field"><span>{t("备注（可选）", "Note (optional)")}</span><textarea class="dbx-input" bind:value={editing.note} rows="4" disabled={busy}></textarea></label>
        <span class="field-limit">{Array.from(editing.note || "").length} / 500</span>
        {#if editError}<p class="inline-error" role="alert">{editError}</p>{/if}
      {:else}
        <label class="field"><span>{t("名称", "Name")}</span><input class="dbx-input" bind:value={saveName} required disabled={saving}/></label>
        <div class="edit-fields"><label class="field"><span>{t("服务名称", "Service name")}</span><input class="dbx-input" bind:value={saveIssuer} maxlength="128" disabled={saving}/></label><label class="field"><span>{t("账户", "Account")}</span><input class="dbx-input" bind:value={saveAccount} maxlength="256" disabled={saving}/></label></div>
        <label class="field"><span>{t("备注（可选）", "Note (optional)")}</span><textarea class="dbx-input" bind:value={saveNote} rows="4" disabled={saving}></textarea></label>
        <span class="field-limit">{Array.from(saveNote).length} / 500</span>
        {#if saveError}<p class="inline-error" role="alert">{saveError}</p>{/if}
      {/if}
      <div class="form-actions"><button class="dbx-btn" type="button" disabled={busy || saving} onclick={cancelAccount}>{t("取消", "Cancel")}</button><button class="dbx-btn dbx-btn--primary" type="button" onclick={submitAccount} disabled={busy || saving}>{busy || saving ? t("保存中…", "Saving…") : t("保存", "Save")}</button></div>
    </div>
  </dialog>
  <dialog class="account-dialog" bind:this={deleteDialog} aria-label={t("确认删除", "Confirm deletion")} oncancel={(event) => { if (busy) event.preventDefault(); }} onclose={() => { if (!deleteDialog.open) { pendingDelete = null; deleteError = ""; } }}>
    <div class="account-form"><h2>{t("确认删除", "Confirm deletion")}</h2>
      {#if pendingDelete}<p class="full-note">{t(`删除 ${pendingDelete.name}？请确认你有其他恢复方式。`, `Delete ${pendingDelete.name}? Make sure you have another recovery method.`)}</p>{/if}
      {#if deleteError}<p class="inline-error" role="alert">{deleteError}</p>{/if}
      <div class="form-actions"><button class="dbx-btn" type="button" disabled={busy} onclick={() => pendingDelete = null}>{t("取消", "Cancel")}</button><button class="dbx-btn danger" type="button" disabled={busy || !pendingDelete} onclick={deleteSaved}>{t("确认删除", "Confirm deletion")}</button></div>
    </div>
  </dialog>
</div>

<style>
  .totp-page { width:100%; max-width:1200px; display:flex; flex-direction:column; gap:16px; container-type:inline-size; }
  .workspace { display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:20px; align-items:start; }
  .accounts-panel,.input-panel,.management-panel { min-width:0; border:1px solid var(--color-border); border-radius:10px; background:var(--color-card,var(--color-background)); }
  .accounts-panel { display:flex; flex-direction:column; overflow:hidden; }
  .panel-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:34px; }
  .heading-title { flex:1; display:flex; gap:8px; align-items:center; min-width:0; }
  .panel-heading strong { min-width:0; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .panel-heading>.dbx-btn { flex-shrink:0; white-space:nowrap; }
  .accounts-panel>.panel-heading { padding:12px 14px; border-bottom:1px solid var(--color-border); }
  .count { display:grid; place-items:center; min-width:20px; height:20px; padding:0 4px; border-radius:5px; font-size:11px; color:var(--color-muted-foreground); background:var(--color-muted); }
  .account-empty { padding:32px 20px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:12px; }
  .empty-icon { color:var(--color-muted-foreground); opacity:.65; }
  .account-empty strong { font-size:12px; font-weight:500; }
  .account-empty p { margin:0; color:var(--color-muted-foreground); font-size:12px; line-height:1.7; }
  .account-search { margin:12px; width:calc(100% - 24px); }
  .account-list { display:flex; flex-direction:column; gap:4px; padding:0 8px 8px; max-height:450px; overflow:auto; }
  .account-item { flex-shrink:0; min-width:0; display:grid; grid-template-columns:24px minmax(0,1fr) 40px; align-items:center; min-height:72px; border:1px solid transparent; border-radius:7px; }
  .account-item.active { border-color:color-mix(in srgb,var(--color-primary) 30%,var(--color-border)); background:color-mix(in srgb,var(--color-primary) 7%,var(--color-background)); }
  .account-select { box-sizing:border-box; overflow:hidden; min-width:0; width:100%; display:flex; align-items:center; gap:10px; padding:10px 8px; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
  .account-select:hover { background:var(--color-accent); border-radius:6px; }
  .account-avatar { display:grid; place-items:center; width:32px; height:32px; flex-shrink:0; border:1px solid var(--color-border); border-radius:8px; background:var(--color-background); font-size:13px; font-weight:600; color:var(--color-muted-foreground); }
  .account-copy { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .account-copy strong,.account-copy small { display:block; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .account-copy strong { font-size:12px; font-weight:500; }
  .account-copy small { font-size:11px; color:var(--color-muted-foreground); }
  .list-note { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; white-space:pre-wrap; font-size:11px; line-height:1.6; color:var(--color-muted-foreground); }
  .selected-mark { flex-shrink:0; color:var(--color-primary); }
  .account-actions { display:flex; flex-direction:column; gap:2px; padding:4px 2px; }
  .management-hidden { visibility:hidden; pointer-events:none; }
  .account-actions .dbx-btn { width:100%; min-width:0; min-height:26px; padding:2px 4px; font-size:11px; white-space:nowrap; }
  .drag-handle { cursor:grab; margin:0; padding:0; width:24px; min-width:0; touch-action:none; }
  .account-item.drop-target { outline:2px dashed var(--color-primary); outline-offset:-2px; }
  .drag-handle:active { cursor:grabbing; }
  .saved-secret { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .saved-secret input { min-width:0; flex:1; font-family:var(--font-mono); }
  .protection-note { margin-top:auto; display:flex; gap:6px; padding:12px 14px; border-top:1px solid var(--color-border); font-size:11px; line-height:1.5; color:var(--color-muted-foreground); }
  .protection-note svg { flex-shrink:0; }
  .generator { min-width:0; display:flex; flex-direction:column; gap:16px; }
  .input-panel { height:176px; box-sizing:border-box; padding:12px 16px; display:flex; flex-direction:column; gap:6px; }
  .input-panel>.panel-heading { flex-shrink:0; min-height:28px; }
  .totp-options { display:grid; grid-template-columns:1fr 1fr 1.4fr; gap:12px; flex-shrink:0; }
  .totp-options :global(.dbx-custom-select) { width:100%; }
  .input-content { flex:1; min-height:0; display:flex; flex-direction:column; gap:4px; }
  .input-content .field { gap:4px; line-height:16px; }
  .input-content>.field,.input-content>.config-badges { flex-shrink:0; }
  .field { display:flex; flex-direction:column; gap:7px; min-width:0; font-size:12px; }
  .field>span { color:var(--color-muted-foreground); }
  .eye-button { display:inline-flex; align-items:center; justify-content:center; width:30px; min-width:30px; padding:0; flex-shrink:0; }
  .secret-row { display:flex; align-items:center; gap:6px; }
  .secret-row .dbx-input { flex:1; min-width:0; }
  .secret-row .dbx-btn { flex-shrink:0; }
  .form-actions { display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .saved-key-field { min-width:0; display:flex; flex-direction:column; gap:7px; }
  .account-detail { margin:0; font-size:12px; line-height:18px; height:18px; color:var(--color-muted-foreground); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .note-slot { height:18px; flex-shrink:0; min-width:0; }
  .reveal-error { display:block; color:var(--color-destructive); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .note-preview { display:block; width:100%; padding:0; border:0; background:transparent; color:var(--color-muted-foreground); text-align:left; font:inherit; font-size:11px; line-height:18px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer; }
  .note-preview:hover { color:var(--color-primary); text-decoration:underline; }
  .full-note { margin:0; max-height:50vh; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; line-height:1.8; }
  .config-badges { display:flex; align-items:center; min-height:30px; flex-wrap:wrap; gap:6px; margin-top:auto; }
  .config-badges span { padding:3px 7px; border-radius:4px; background:var(--color-muted); font-size:11px; color:var(--color-muted-foreground); }
  .code-panel { position:relative; padding:20px 24px 0; overflow:hidden; border:1px solid color-mix(in srgb,var(--color-primary) 28%,var(--color-border)); border-radius:10px; background:color-mix(in srgb,var(--color-primary) 3%,var(--color-background)); }
  .code-heading { display:flex; align-items:center; justify-content:space-between; font-size:12px; font-weight:500; }
  .countdown { display:grid; place-items:center; width:40px; height:40px; border-radius:50%; background:conic-gradient(var(--color-primary) var(--progress),var(--color-border) 0); }
  .countdown>span { display:flex; align-items:baseline; justify-content:center; gap:1px; width:34px; height:34px; line-height:34px; border-radius:50%; background:var(--color-background); font-size:12px; font-variant-numeric:tabular-nums; }
  .countdown small { font-size:9px; opacity:.7; }
  .code-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .code { font-family:var(--font-mono); font-size:20px; font-weight:500; font-variant-numeric:tabular-nums; letter-spacing:.08em; }
  .primary-code { margin:12px 0 18px; font-size:clamp(30px,5cqi,48px); letter-spacing:.1em; font-weight:600; }
  .code-panel :global(.copy-btn) { width:38px; height:38px; min-height:38px; border:1px solid var(--color-border); background:var(--color-background); }
  .code-bottom { display:flex; align-items:center; gap:6px; min-height:44px; padding-bottom:12px; box-sizing:border-box; color:var(--color-muted-foreground); font-size:11px; line-height:1.6; }
  .code-bottom>span:nth-child(2) { flex:1; min-width:0; overflow-wrap:anywhere; }
  .code-error { color:var(--color-destructive); }
  .code-bottom>span:last-child { margin-left:auto; }
  .status-dot { width:5px; height:5px; flex-shrink:0; border-radius:50%; background:currentColor; }
  .meter { height:3px; margin:0 -24px; background:var(--color-border); }
  .meter>div { height:100%; width:100%; background:var(--color-primary); transform-origin:left; transition:transform 200ms linear; }
  .expiring .countdown { background:conic-gradient(var(--color-warning) var(--progress),var(--color-border) 0); }
  .expiring .meter>div { background:var(--color-warning); }
  .placeholder { color:var(--color-muted-foreground); opacity:.45; }
  .adjacent-panel { padding:0 4px; color:var(--color-muted-foreground); }
  .adjacent-panel h3 { font-size:12px; font-weight:500; margin:0; }
  .adjacent-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:12px; }
  .adjacent-grid>section { padding:12px; border:1px solid var(--color-border); border-radius:7px; }
  .window-heading { display:flex; justify-content:space-between; gap:6px; font-size:11px; margin-bottom:8px; }
  .window-heading small { font-size:10px; }
  .adjacent-panel p { font-size:11px; line-height:1.6; }
  .management-panel { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
  .management-panel form { display:flex; flex-direction:column; gap:14px; }
  .migration-dialog,.account-dialog { width:min(420px,calc(100% - 32px)); max-height:calc(100% - 32px); padding:24px; box-sizing:border-box; border:1px solid var(--color-border); border-radius:14px; color:var(--color-foreground); background:var(--color-background); box-shadow:0 20px 70px #0003; }
  .migration-dialog::backdrop,.account-dialog::backdrop { background:#0005; }
  .account-dialog { width:min(460px,calc(100% - 32px)); }
  .account-form { display:flex; flex-direction:column; gap:16px; }
  .account-form h2 { margin:0 0 4px; font-size:17px; font-weight:600; }
  .account-form textarea { width:100%; min-height:90px; resize:vertical; line-height:1.7; }
  .account-form .inline-error { padding:0; }
  .field-limit { margin-top:-10px; text-align:right; font-size:11px; color:var(--color-muted-foreground); }
  .migration-form { display:flex; flex-direction:column; gap:16px; }
  .dialog-icon { display:grid; place-items:center; width:42px; height:42px; border-radius:12px; color:var(--color-primary); background:color-mix(in srgb,var(--color-primary) 9%,var(--color-background)); }
  .migration-form h2 { margin:0; font-size:17px; font-weight:600; }
  .migration-form p { margin:0; font-size:12px; line-height:1.8; color:var(--color-muted-foreground); }
  .migration-form .password-hint { margin-top:-8px; font-size:11px; }
  .migration-form .inline-error { padding:0; color:var(--color-destructive); }
  .migration-form .form-actions { margin-top:4px; }
  .loading-note { padding:32px 20px; text-align:center; color:var(--color-muted-foreground); font-size:12px; }
  .edit-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .inline-error { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0; padding:12px; color:var(--color-destructive); font-size:12px; line-height:1.6; overflow-wrap:anywhere; }
  .danger { color:var(--color-destructive); }
  .empty-search { text-align:center; padding:16px 8px; }
  @container (width < 900px) { .workspace { grid-template-columns:minmax(0,1fr); gap:16px; } .account-empty { padding:20px; } }
  @container (max-width:600px) { .adjacent-grid { grid-template-columns:1fr; } }
  @media (max-width:480px) { .account-dialog .edit-fields { grid-template-columns:1fr; } }
  @container (max-width:390px) { .input-panel { padding:12px 14px; } .code-panel { padding:16px 16px 0; } .meter { margin:0 -16px; } .adjacent-grid { grid-template-columns:1fr; } }
  @media (prefers-reduced-motion:reduce) { .meter>div { transition:none; } }
</style>
