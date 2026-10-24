<script>
  import { onMount, tick } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { invoke, ready } from "./host.js";
  import { L, localizeError, pick } from "./i18n.js";
  import { normalizeVaultKey } from "./keySource.js";
  import { moveId } from "./navigation.js";
  import { RSA_BIT_OPTIONS, RSA_PEM_FORMATS, generateRsaKeyPairPem, generateSymmetricKeyMaterial } from "./tools/generate.js";

  let {
    locale = "zh-CN",

    onKeysChange = () => {},
  } = $props();

  let status = $state({ exists: false, unlocked: false });
  let keys = $state([]);
  let listQuery = $state("");
  let keyType = $state("all");
  let pointerDrag = $state(null);
  let password = $state("");
  let confirmPassword = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  let createName = $state("");
  let createAlg = $state("aes-256");
  let createMode = $state("generate");
  let createBits = $state("2048");
  let createFormat = $state("pkcs8");
  let createMaterial = $state("");
  let createPublicMaterial = $state("");
  let purposeEdit = $state(null);
  let purposeError = $state("");
  let reveal = $state(null);
  let pendingDelete = $state(null);
  let renameId = $state("");
  let renameName = $state("");
  let renameInput = $state(null);
  let panel = $state("");
  let formError = $state("");
  let fieldErrors = $state({});
  let discardPending = $state(false);
  let highlightedKeyId = $state("");
  let managementDialog = $state(null);
  let managementTrigger;
  let highlightTimer;
  const formCopy = {
    keyType: L("Filter by key type", "密钥类型", "金鑰類型", "Filtrar por tipo de clave", "Filtra per tipo di chiave", "鍵の種類で絞り込み", "Filtrar por tipo de chave", "키 유형별 필터", "Anahtar türüne göre filtrele", "Açar növünə görə süzgəc"),
    unsaved: L("Discard unsaved changes?", "放弃未保存的更改？", "放棄未儲存的變更？", "¿Descartar los cambios sin guardar?", "Scartare le modifiche non salvate?", "未保存の変更を破棄しますか？", "Descartar alterações não salvas?", "저장하지 않은 변경 사항을 삭제할까요?", "Kaydedilmemiş değişiklikler silinsin mi?", "Saxlanmamış dəyişikliklər ləğv edilsin?"),
    discard: L("Discard changes", "放弃更改", "放棄變更", "Descartar cambios", "Scarta modifiche", "変更を破棄", "Descartar alterações", "변경 사항 삭제", "Değişiklikleri sil", "Dəyişiklikləri ləğv et"),
    keep: L("Keep editing", "继续编辑", "繼續編輯", "Seguir editando", "Continua a modificare", "編集を続ける", "Continuar editando", "계속 편집", "Düzenlemeye devam et", "Redaktəyə davam et"),
  };

  const t = (zh, en) => pick(locale, zh, en);
  const pasteExisting = $derived(createMode === "paste");
  const generatingAsym = $derived(!pasteExisting && (createAlg === "rsa-pem" || createAlg === "sm2"));
  const keyTypeOptions = $derived.by(() => {
    const types = new Map(keys.map((key) => [key.algorithm, key.displayType || key.algorithm]));
    if (keyType !== "all" && !types.has(keyType)) types.set(keyType, keyType.toUpperCase());
    return [{ value:"all", label:t("全部", "All") }, ...[...types].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }))];
  });
  const filteredKeys = $derived((() => {
    const query = listQuery.trim().toLowerCase();
    return keys.filter((key) => {
      if (keyType !== "all" && key.algorithm !== keyType) return false;
      if (!query) return true;
      const hay = `${key.name} ${key.algorithm} ${key.displayType || ""} ${(key.effectivePurposes || []).join(" ")} ${key.supportLevel || ""} ${key.fingerprint || ""}`.toLowerCase();
      return hay.includes(query);
    });
  })());
  const filtering = $derived(Boolean(listQuery.trim()) || keyType !== "all");
  const canReorder = $derived(!filtering && !busy && !renameId && keys.length > 1);
  const draggingKey = $derived(pointerDrag ? keys.find((key) => key.id === pointerDrag.sourceId) : null);

  function notify() {
    onKeysChange();
  }

  function onEnter(event, action) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      action();
    }
  }

  function errorText(err) {
    return localizeError(locale, err);
  }

  function passwordTooShort(value) {
    return Array.from(value || "").length < 8;
  }

  function fail(err) {
    error = errorText(err);
    notice = "";
  }

  function ok(message) {
    notice = message;
    error = "";
  }

  function resetSensitive() {
    clearManagement();
    highlightedKeyId = "";
    window.clearTimeout(highlightTimer);
    reveal = null;
    pendingDelete = null;
    cancelRename();
    pointerDrag = null;
    listQuery = "";
    keyType = "all";
    password = "";
    confirmPassword = "";
    createMaterial = "";
    createPublicMaterial = "";
    purposeEdit = null;
  }

  function closeDialogs() {
    if (panel) { requestCloseManagement(); return; }
    reveal = null;
    pendingDelete = null;
    purposeEdit = null;
  }

  function clearManagement() {
    panel = "";
    createName = "";
    createAlg = "aes-256";
    createMode = "generate";
    createBits = "2048";
    createFormat = "pkcs8";
    createMaterial = "";
    createPublicMaterial = "";
    formError = "";
    fieldErrors = {};
    discardPending = false;
  }

  async function openManagement(next, event) {
    if (busy) return;
    const trigger = panel ? managementTrigger : event?.currentTarget;
    closeDialogs();
    clearManagement();
    managementTrigger = trigger;
    error = "";
    panel = next;
    await tick();
    (managementDialog?.querySelector("input") || managementDialog?.querySelector("[role='combobox'], button:not(.management-close)"))?.focus();
  }

  function closeManagement() {
    if (busy) return;
    clearManagement();
    managementTrigger?.focus();
  }

  function requestCloseManagement() {
    if (busy) return;
    const dirty = panel === "create" && Boolean(createName || createMaterial || createPublicMaterial || createAlg !== "aes-256" || createMode !== "generate" || createBits !== "2048" || createFormat !== "pkcs8");
    if (dirty) discardPending = true;
    else closeManagement();
  }

  function formatCreated(value) {
    if (value == null || value === "") return "—";
    const raw = String(value).trim();
    const asNum = Number(raw);
    let date;
    if (/^\d+$/.test(raw) && Number.isFinite(asNum)) {
      date = new Date(asNum < 1e12 ? asNum * 1000 : asNum);
    } else {
      date = new Date(raw);
    }
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const PURPOSE_LABELS = {
    "aes-cipher": ["AES 通用加密", "AES cipher"], "sm4-cipher": ["SM4 国密加密", "SM4 cipher"],
    "aes-aead": ["AES 认证加密", "AES authenticated encryption"], "chacha-aead": ["ChaCha 认证加密", "ChaCha authenticated encryption"],
    "rsa-encrypt": ["RSA 加密", "RSA encryption"], "sm2-encrypt": ["SM2 加密", "SM2 encryption"],
    "rsa-sign": ["RSA 签名", "RSA signatures"], "sm2-sign": ["SM2 签名", "SM2 signatures"],
    hmac: ["HMAC", "HMAC"], "jwt-hmac": ["JWT-HMAC", "JWT-HMAC"], "jwt-rsa": ["JWT-RSA", "JWT-RSA"],
    "aes-mac": ["AES-MAC", "AES-MAC"], "aes-key-wrap": ["AES 密钥包装", "AES key wrap"],
    "aes-xts": ["AES-XTS", "AES-XTS"], "aes-ff1": ["AES-FF1", "AES-FF1"], hpke: ["HPKE", "HPKE"],
    "ml-kem": ["ML-KEM", "ML-KEM"], totp: ["TOTP", "TOTP"], "debug-xor": ["XOR 调试", "XOR debug"],
  };
  const purposeLabel = (purpose) => PURPOSE_LABELS[purpose] ? t(...PURPOSE_LABELS[purpose]) : purpose;
  function usesFor(key) {
    const labels = (key.effectivePurposes || []).map(purposeLabel);
    if (key.legacyPurposeState === "pending") labels.unshift(t("历史兼容 · 待确认", "Legacy · confirmation needed"));
    return labels.length > 2 ? `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}` : labels.join(" · ") || "—";
  }

  async function run(task, onError = fail) {
    if (busy) {
      fail({ message: t("请稍候，正在处理上一步操作", "Wait, another action is still running") });
      return;
    }
    busy = true;
    error = "";
    try {
      await task();
    } catch (err) {
      onError(err);
    } finally {
      busy = false;
    }
  }

  async function refresh(announce = true) {
    status = await invoke("toolbox/keys/status");
    if (status.unlocked) {
      const listed = await invoke("toolbox/keys/list");
      keys = (listed.keys || []).map(normalizeVaultKey);
    } else {
      keys = [];
      clearManagement();
    }
    if (announce) notify();
  }

  async function setup() {
    if (passwordTooShort(password)) {
      fail({ message: t("主密码至少 8 位", "Master password must be at least 8 characters") });
      return;
    }
    if (password !== confirmPassword) {
      fail({ message: t("两次输入的主密码不一致", "Passwords do not match") });
      return;
    }
    await run(async () => {
      await invoke("toolbox/keys/setup", { password }, 60000);
      resetSensitive();
      ok(t("密钥库已创建并解锁", "Vault created and unlocked"));
      await refresh();
    });
  }

  async function unlock() {
    if (passwordTooShort(password)) {
      fail({ message: t("主密码至少 8 位", "Master password must be at least 8 characters") });
      return;
    }
    await run(async () => {
      await invoke("toolbox/keys/unlock", { password }, 60000);
      password = "";
      ok(t("已解锁", "Unlocked"));
      await refresh();
    });
  }

  async function lock() {
    await run(async () => {
      await invoke("toolbox/keys/lock");
      resetSensitive();
      notice = "";
      await refresh();
    });
  }

  async function createKey() {
    if (busy || discardPending) return;
    const name = createName.trim();
    fieldErrors = {};
    formError = "";
    if (!name) {
      fieldErrors.createName = t("请填写名称", "Enter a name");
    }
    if (pasteExisting && !createMaterial.trim()) {
      fieldErrors.createMaterial = t("请粘贴密钥材料", "Paste the key material");
    }
    if (pasteExisting && ["hpke-x25519", "ml-kem-768", "ml-kem-1024"].includes(createAlg) && !createPublicMaterial.trim()) {
      fieldErrors.createPublicMaterial = t("请粘贴密钥材料", "Paste the key material");
    }
    if (Object.keys(fieldErrors).length) return;
    await run(async () => {
      let material = createMaterial;
      let generate = !pasteExisting;
      if (!pasteExisting && createAlg === "rsa-pem") {
        // RSA via WebCrypto locally — backend pure-Rust keygen is too slow for the UI.
        const pair = await generateRsaKeyPairPem(createBits, createFormat);
        material = pair.privateKey;
        generate = false;
      } else if (!pasteExisting && ["aes-128", "aes-192", "aes-256", "sm4-128", "hmac-sha1", "hmac-sha256", "hmac-sha384", "hmac-sha512", "hmac-sm3"].includes(createAlg)) {
        // AES / SM4 / HMAC: CSPRNG on the frontend; backend only validates + stores.
        material = generateSymmetricKeyMaterial(createAlg).material;
        generate = false;
      }
      const result = await invoke("toolbox/keys/create", {
        name,
        algorithm: createAlg,
        generate,
        material,
        publicMaterial: pasteExisting ? createPublicMaterial : "",
        bits: createAlg === "rsa-pem" ? Number(createBits) : undefined,
        format: createAlg === "rsa-pem" ? createFormat : undefined,
      }, 30000);
      createName = "";
      createMaterial = "";
      createPublicMaterial = "";
      createMode = "generate";
      clearManagement();
      ok(t("密钥已保存", "Key saved"));
      await refresh();
      listQuery = "";
      keyType = "all";
      highlightedKeyId = result.key?.id || "";
      await tick();
      document.querySelector(`[data-key-id="${CSS.escape(highlightedKeyId)}"]`)?.scrollIntoView({ block: "nearest" });
      window.clearTimeout(highlightTimer);
      highlightTimer = window.setTimeout(() => { highlightedKeyId = ""; }, 3000);
    }, (err) => { if (panel) formError = errorText(err); else fail(err); });
    if (!panel) { await tick(); managementTrigger?.focus(); }
  }

  async function startRename(key) {
    closeDialogs();
    renameId = key.id;
    renameName = key.name;
    error = "";
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  function cancelRename() {
    if (busy) return;
    renameId = "";
    renameName = "";
    error = "";
  }

  function onRenameKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void renameKey();
    }
  }

  async function renameKey() {
    const id = renameId;
    const name = renameName.trim();
    if (!name) {
      fail({ message: t("请填写名称", "Enter a name") });
      return;
    }
    const current = keys.find((key) => key.id === id);
    if (current?.name === name) {
      cancelRename();
      return;
    }
    await run(async () => {
      await invoke("toolbox/keys/rename", { id, name });
      renameId = "";
      renameName = "";
      ok(t("已重命名", "Renamed"));
      await refresh();
    });
  }

  function moveKeyLocal(sourceId, targetId, after) {
    const snapshot = keys.slice();
    const previous = keys.map((key) => key.id);
    const nextIds = moveId(previous, sourceId, targetId, after);
    if (nextIds.join("\0") === previous.join("\0")) return null;
    const byId = new Map(keys.map((key) => [key.id, key]));
    keys = nextIds.map((id) => byId.get(id)).filter(Boolean);
    return { nextIds, snapshot };
  }

  async function persistOrder(ids, snapshot) {
    await run(async () => {
      try {
        await invoke("toolbox/keys/reorder", { ids });
        notify();
      } catch (err) {
        keys = snapshot;
        throw err;
      }
    });
  }

  function pointerDown(event, key) {
    if (!canReorder || event.button !== 0) return;
    const row = event.currentTarget.closest("[data-key-id]");
    const rect = (row || event.currentTarget).getBoundingClientRect();
    pointerDrag = {
      pointerId: event.pointerId,
      sourceId: key.id,
      startX: event.clientX,
      startY: event.clientY,
      targetId: key.id,
      after: false,
      active: false,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
  }

  function pointerMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      pointerDrag = null;
      return;
    }
    const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
    if (!pointerDrag.active && distance < 5) return;
    if (!pointerDrag.active) event.currentTarget.setPointerCapture?.(event.pointerId);
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-key-id]");
    const rect = hit?.getBoundingClientRect();
    pointerDrag = {
      ...pointerDrag,
      active: true,
      x: event.clientX - pointerDrag.offsetX,
      y: event.clientY - pointerDrag.offsetY,
      targetId: hit?.dataset.keyId || pointerDrag.targetId,
      after: rect ? event.clientY > rect.top + rect.height / 2 : pointerDrag.after,
    };
    document.getSelection()?.removeAllRanges();
    event.preventDefault();
  }

  function pointerEnd(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const current = pointerDrag;
    pointerDrag = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!current.active || !current.targetId || current.targetId === current.sourceId) return;
    const moved = moveKeyLocal(current.sourceId, current.targetId, current.after);
    if (moved) void persistOrder(moved.nextIds, moved.snapshot);
  }

  function pointerCancel(event) {
    if (pointerDrag?.pointerId === event.pointerId) pointerDrag = null;
  }

  function pointerLeave() {
    if (pointerDrag && !pointerDrag.active) pointerDrag = null;
  }

  function keyMove(event, key) {
    if (!canReorder) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const at = keys.findIndex((entry) => entry.id === key.id);
    const target = keys[at + (event.key === "ArrowUp" ? -1 : 1)];
    if (!target) return;
    event.preventDefault();
    const moved = moveKeyLocal(key.id, target.id, event.key === "ArrowDown");
    if (moved) void persistOrder(moved.nextIds, moved.snapshot);
  }

  function askDelete(key) {
    cancelRename();
    reveal = null;
    pendingDelete = key;
  }

  function askExport(key) {
    cancelRename();
    pendingDelete = null;
    reveal = { key, material: "", publicKey: "", password: "", loading: false, mode: "secret" };
  }

  async function showPublic(key) {
    cancelRename();
    pendingDelete = null;
    reveal = { key, material: "", publicKey: "", password: "", loading: true, mode: "public" };
    await run(async () => {
      const result = await invoke("toolbox/keys/public", { id: key.id });
      if (reveal?.key?.id !== key.id || reveal?.mode !== "public") return;
      reveal = {
        key,
        material: "",
        publicKey: result.publicKey || "",
        password: "",
        loading: false,
        mode: "public",
      };
    });
    if (reveal?.key?.id === key.id && reveal?.mode === "public" && reveal.loading) {
      reveal = null;
    }
  }

  async function exportSecret() {
    const current = reveal;
    if (!current?.key || current.mode === "public") return;
    if (passwordTooShort(current.password)) {
      fail({ message: t("请输入当前主密码", "Enter the current master password") });
      return;
    }
    reveal = { ...current, loading: true };
    await run(async () => {
      const result = await invoke("toolbox/keys/export", {
        id: current.key.id,
        confirm: true,
        password: current.password,
      }, 60000);
      if (reveal?.key?.id !== current.key.id) return;
      reveal = {
        key: current.key,
        material: result.material || "",
        publicKey: result.publicMaterial || "",
        password: "",
        loading: false,
        mode: "secret",
      };
    });
    if (reveal?.key?.id === current.key.id) reveal = { ...reveal, password: "", loading: false };
  }

  async function confirmDelete() {
    const key = pendingDelete;
    if (!key) return;
    await run(async () => {
      await invoke("toolbox/keys/delete", { id: key.id, confirm: true });
      if (reveal?.key?.id === key.id) reveal = null;
      pendingDelete = null;
      notice = "";
      await refresh();
    });
  }

  function editPurposes(key) {
    error = "";
    purposeError = "";
    purposeEdit = { key, selected: [...(key.allowedPurposes ?? key.effectivePurposes ?? [])] };
  }

  function togglePurpose(purpose) {
    const selected = purposeEdit.selected.includes(purpose)
      ? purposeEdit.selected.filter((item) => item !== purpose)
      : [...purposeEdit.selected, purpose];
    purposeEdit = { ...purposeEdit, selected };
  }

  async function savePurposes() {
    const current = purposeEdit;
    if (!current) return;
    purposeError = "";
    await run(async () => {
      // The host uses structured cloning; Svelte's state array is a Proxy.
      await invoke("toolbox/keys/update-purposes", { id: current.key.id, allowedPurposes: [...current.selected] });
      purposeEdit = null;
      ok(t("用途已更新", "Purposes updated"));
      await refresh();
    }, (err) => {
      const unsupported = String(err?.code) === "-32601" || /method.*not found|unknown method/i.test(err?.message || "");
      purposeError = localizeError(locale, unsupported ? "Key purpose updates require a newer backend. Restart or update the plugin." : err);
    });
  }

  function onOverlayClick(event) {
    if (event.target === event.currentTarget) closeDialogs();
  }

  $effect(() => {
    if (!reveal && !pendingDelete && !purposeEdit && !panel) return;
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialogs();
      }
      if (event.key === "Tab" && managementDialog) {
        const controls = [...managementDialog.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex='0']")].filter((element) => element.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || !managementDialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !managementDialog.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  onMount(() => {
    let cancelled = false;
    const onVaultChange = () => {
      if (cancelled) return;
      reveal = null;
      void refresh(false).catch(fail);
    };
    window.addEventListener("toolbox-vault-change", onVaultChange);
    (async () => {
      try {
        await ready();
        if (!cancelled) await refresh();
      } catch (err) {
        if (!cancelled) fail(err);
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(highlightTimer);
      window.removeEventListener("toolbox-vault-change", onVaultChange);
    };
  });
</script>



<div class="vault">
  {#if !status.exists}
    {#if error}<div class="banner">{error}</div>{/if}
    <div class="gate">
      <div class="stack">
        <label class="field">
          <span>{t("主密码", "Master password")}</span>
          <input class="dbx-input" type="password" bind:value={password} autocomplete="new-password" onkeydown={(event) => onEnter(event, setup)} />
        </label>
        <label class="field">
          <span>{t("再输入一次", "Confirm password")}</span>
          <input class="dbx-input" type="password" bind:value={confirmPassword} autocomplete="new-password" onkeydown={(event) => onEnter(event, setup)} />
        </label>
        <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={setup} type="button">
          {busy ? t("创建中…", "Creating…") : t("创建密钥库", "Create vault")}
        </button>
      </div>
    </div>
  {:else if !status.unlocked}
    {#if error}<div class="banner">{error}</div>{/if}
    <div class="gate">
      <label class="field">
        <span>{t("主密码", "Master password")}</span>
        <div class="unlock-row">
          <input class="dbx-input" type="password" bind:value={password} autocomplete="current-password" onkeydown={(event) => onEnter(event, unlock)} />
          <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={unlock} type="button">
            {busy ? t("解锁中…", "Unlocking…") : t("解锁", "Unlock")}
          </button>
        </div>
      </label>
    </div>
  {:else}
    <div class="status">
      <div class="sheet-copy">
        <p class="lead strong">
          {t(`已解锁 · ${keys.length} 把密钥`, `Unlocked · ${keys.length} key${keys.length === 1 ? "" : "s"}`)}
        </p>
      </div>
      <div class="status-actions">
        {#if !keys.length}<button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={(event) => openManagement("create", event)} type="button">{t("添加密钥", "Add key")}</button>{/if}
        <button class="dbx-btn" disabled={busy} onclick={lock} type="button">{t("锁定", "Lock")}</button>
      </div>
    </div>
    {#if error}<div class="banner">{error}</div>{/if}
    {#if notice}<p class="dbx-hint notice">{notice}</p>{/if}

    {#if keys.length > 0}
      <div class="list-toolbar">
        <div class="list-filters">
        <label class="field list-filter">
          <span>{t("筛选", "Filter")}</span>
          <input
            class="dbx-input"
            bind:value={listQuery}
            placeholder={t("按名称、算法、用途、状态或指纹筛选", "Filter by name, algorithm, purpose, status, or fingerprint")}
            aria-label={t("筛选密钥", "Filter keys")}
          />
        </label>
        <label class="field type-filter"><span>{pick(locale, formCopy.keyType)}</span><Select bind:value={keyType} options={keyTypeOptions} ariaLabel={pick(locale, formCopy.keyType)} /></label>
        </div>
        <div class="list-toolbar-actions">{#if filtering}<p class="dbx-hint list-meta">{t(`显示 ${filteredKeys.length} / ${keys.length}`, `Showing ${filteredKeys.length} / ${keys.length}`)}</p>{/if}<button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={(event) => openManagement("create", event)} type="button">{t("添加密钥", "Add key")}</button></div>
      </div>
      {#if filteredKeys.length === 0}
        <p class="dbx-hint">{t("没有匹配的密钥", "No matching keys")}</p>
      {:else}
        <div class="key-list" class:dragging={pointerDrag?.active} role="table" aria-label={t("密钥库", "Vault")}>
          <div class="key-header" role="row">
            <span role="columnheader"></span>
            <span role="columnheader">{t("密钥名称", "Key name")}</span>
            <span role="columnheader">{t("大小 / 格式", "Size / format")}</span>
            <span role="columnheader">{t("用途", "Used by")}</span>
            <span role="columnheader">{t("创建时间", "Created")}</span>
            <span role="columnheader">{t("指纹", "Fingerprint")}</span>
            <span class="actions-heading" role="columnheader">{t("操作", "Actions")}</span>
          </div>
          {#each filteredKeys as key (key.id)}
            <div
              class="key-card"
              class:highlighted={highlightedKeyId === key.id}
              role="row"
              data-key-id={key.id}
              class:dragging={pointerDrag?.active && pointerDrag.sourceId === key.id}
              class:drop-target={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id}
              class:drop-after={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id && pointerDrag.after}
              class:drop-before={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id && !pointerDrag.after}
            >
              <button
                class="drag"
                type="button"
                disabled={!canReorder}
                onpointerdown={(event) => pointerDown(event, key)}
                onpointermove={pointerMove}
                onpointerup={pointerEnd}
                onpointercancel={pointerCancel}
                onpointerleave={pointerLeave}
                onkeydown={(event) => keyMove(event, key)}
                aria-label={t(`调整「${key.name}」顺序`, `Reorder “${key.name}”`)}
                title={filtering
                  ? t("筛选时不能排序", "Clear the filter to reorder")
                  : t("拖动或使用上下方向键排序", "Drag or use Up/Down to reorder")}
              >⠿</button>

              <div class="key-content">
                <div class="key-title" role="cell">
                  {#if renameId === key.id}
                    <input
                      class="dbx-input rename-input"
                      bind:this={renameInput}
                      bind:value={renameName}
                      aria-label={t("密钥名称", "Key name")}
                      onkeydown={onRenameKeydown}
                    />
                  {:else}
                    <strong>{key.name}</strong>
                  {/if}
                  <span class="key-type">{key.displayType || key.algorithm}</span>
                  {#if key.supportLevel === "compatibility"}<span class="key-compatibility">{t("兼容模式", "Compatibility")}</span>{/if}
                </div>
                <div class="key-details">
                  <span role="cell" title={t("大小 / 格式", "Size / format")}><small>{t("大小 / 格式", "Size / format")}</small><b>{key.bits ? `${key.bits} bit · ${key.format}` : key.format || "—"}</b></span>
                  <span role="cell" class="key-purpose" title={`${t("用途", "Used by")}: ${(key.effectivePurposes || []).map(purposeLabel).join(" · ")}`}><small>{t("用途", "Used by")}</small><b>{usesFor(key)}</b></span>
                  <span role="cell" title={t("创建时间", "Created")}><small>{t("创建时间", "Created")}</small><b>{formatCreated(key.createdAt)}</b></span>
                  <span role="cell" class="fingerprint" title={`${t("指纹", "Fingerprint")}: ${key.fingerprint}`}><small>{t("指纹", "Fingerprint")}</small><code>{key.fingerprint}</code></span>
                </div>
              </div>

              <div class="actions" role="cell">
                {#if renameId === key.id}
                  <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={renameKey} type="button">
                    {busy ? t("保存中…", "Saving…") : t("保存", "Save")}
                  </button>
                  <button class="dbx-btn dbx-btn--ghost" disabled={busy} onclick={cancelRename} type="button">{t("取消", "Cancel")}</button>
                {:else}
                  {#if key.kind === "asymmetric" || key.algorithm === "rsa-pem" || key.algorithm === "sm2"}
                    <button class="dbx-btn" disabled={busy} onclick={() => showPublic(key)} type="button">{t("公钥", "Public")}</button>
                  {/if}
                  <button class="dbx-btn" disabled={busy} onclick={() => askExport(key)} type="button">{t("原文", "Reveal")}</button>
                  {#if key.algorithm !== "totp-base32"}<button class="dbx-btn" disabled={busy} onclick={() => editPurposes(key)} type="button">{t("用途", "Purposes")}</button>{/if}
                  <button class="dbx-btn" disabled={busy} onclick={() => startRename(key)} type="button">{t("重命名", "Rename")}</button>
                  <button class="dbx-btn dbx-btn--danger" disabled={busy} onclick={() => askDelete(key)} type="button">{t("删除", "Delete")}</button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    {#if panel}
    <div class="overlay" onclick={onOverlayClick} role="presentation">
    <div class="dialog management-dialog" bind:this={managementDialog} role="dialog" aria-modal="true" aria-labelledby="vault-management-title" aria-busy={busy}>
      <div class="management-head"><strong id="vault-management-title">{t("添加密钥", "Add key")}</strong><button class="dbx-btn management-close" disabled={busy} type="button" onclick={requestCloseManagement}>{t("关闭", "Close")}</button></div>
      {#if discardPending}
        <div class="discard-notice" role="alert"><p>{pick(locale, formCopy.unsaved)}</p><div class="purpose-actions"><button class="dbx-btn" type="button" onclick={() => (discardPending = false)}>{pick(locale, formCopy.keep)}</button><button class="dbx-btn dbx-btn--danger" type="button" onclick={closeManagement}>{pick(locale, formCopy.discard)}</button></div></div>
      {/if}
      {#if formError}<div class="banner" role="alert">{formError}</div>{/if}
    {#if panel === "create"}
      <div class="stack add-form">
        <div class="dbx-tabs" role="tablist" aria-label={t("方式", "How")}>
          <button type="button" disabled={busy} role="tab" aria-selected={!pasteExisting} class:active={!pasteExisting} onclick={() => { createMode = "generate"; if (["hpke-x25519", "ml-kem-768", "ml-kem-1024"].includes(createAlg)) createAlg = "aes-256"; }}>{t("随机生成", "Generate")}</button>
          <button type="button" disabled={busy} role="tab" aria-selected={pasteExisting} class:active={pasteExisting} onclick={() => (createMode = "paste")}>{t("粘贴已有密钥", "Paste existing")}</button>
        </div>
        <fieldset disabled={busy} class="management-fields">
        <div class="options">
          <label class="field">
            <span>{t("名称", "Name")}</span>
            <input class="dbx-input" bind:value={createName} maxlength="128" aria-invalid={Boolean(fieldErrors.createName)} aria-describedby={fieldErrors.createName ? "create-name-error" : undefined} placeholder={t("例如：测试密钥", "e.g. test-key")} onkeydown={(event) => onEnter(event, createKey)} />
            {#if fieldErrors.createName}<small id="create-name-error" class="field-error">{fieldErrors.createName}</small>{/if}
          </label>
          <label class="field">
            <span>{t("算法", "Algorithm")}</span>
            <Select
              bind:value={createAlg}
              onchange={(value) => { if (["hpke-x25519", "ml-kem-768", "ml-kem-1024"].includes(value)) createMode = "paste"; }}
              options={[
                { value: "aes-256", label: "AES-256", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "aes-192", label: "AES-192", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "aes-128", label: "AES-128", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "sm4-128", label: "SM4", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "chacha20-256", label: "ChaCha20-256", group: t("认证加密", "Authenticated encryption") },
                { value: "aes-siv-512", label: "AES-SIV-512", group: t("认证加密", "Authenticated encryption") },
                { value: "aes-xts-256", label: "AES-XTS-256", group: t("专用加密", "Specialized encryption") },
                { value: "aes-xts-512", label: "AES-XTS-512", group: t("专用加密", "Specialized encryption") },
                { value: "hmac-sha1", label: "SHA-1", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha256", label: "SHA-256", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha384", label: "SHA-384", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha512", label: "SHA-512", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sm3", label: "SM3", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "rsa-pem", label: "RSA", group: t("非对称加密", "Asymmetric cipher") },
                { value: "sm2", label: "SM2", group: t("非对称加密", "Asymmetric cipher") },
                { value: "hpke-x25519", label: "HPKE-X25519", group: t("公钥 / KEM（导入）", "Public key / KEM (import)") },
                { value: "ml-kem-768", label: "ML-KEM-768", group: t("公钥 / KEM（导入）", "Public key / KEM (import)") },
                { value: "ml-kem-1024", label: "ML-KEM-1024", group: t("公钥 / KEM（导入）", "Public key / KEM (import)") },
              ].filter((item) => pasteExisting || !["hpke-x25519", "ml-kem-768", "ml-kem-1024"].includes(item.value))}
            />
          </label>
          {#if createAlg === "rsa-pem" && !pasteExisting}
            <label class="field">
              <span>{t("位数", "Bits")}</span>
              <Select
                bind:value={createBits}
                options={RSA_BIT_OPTIONS.map((value) => ({
                  value,
                  label: value === "8192"
                    ? t("8192 位（较慢）", "8192-bit (slow)")
                    : t(`${value} 位`, `${value}-bit`),
                }))}
              />
            </label>
            <label class="field">
              <span>{t("格式", "Format")}</span>
              <Select
                bind:value={createFormat}
                options={RSA_PEM_FORMATS.map((item) => ({ value: item.value, label: pick(locale, item.zh, item.en) }))}
              />
            </label>
          {/if}
        </div>
        {#if pasteExisting}
          <label class="field material">
            <span>
              {#if createAlg === "rsa-pem"}
                {t("RSA PEM（PKCS#8 或 PKCS#1；公钥加密 / 私钥解密）", "RSA PEM, PKCS#8 or PKCS#1 (public encrypt / private decrypt)")}
              {:else if createAlg === "sm2"}
                {t("SM2 密钥", "SM2 key")}
              {:else}
                {t("材料（hex / base64）", "Material (hex / base64)")}
              {/if}
            </span>
            <textarea class="dbx-textarea pem" bind:value={createMaterial} aria-invalid={Boolean(fieldErrors.createMaterial)} aria-describedby={fieldErrors.createMaterial ? "create-material-error" : undefined} spellcheck="false" autocomplete="off" placeholder={createAlg === "rsa-pem" ? "-----BEGIN ... KEY-----" : ""}></textarea>
            {#if fieldErrors.createMaterial}<small id="create-material-error" class="field-error">{fieldErrors.createMaterial}</small>{/if}
          </label>
          {#if ["hpke-x25519", "ml-kem-768", "ml-kem-1024"].includes(createAlg)}
            <label class="field material"><span>{t("公钥材料（Base64）", "Public key material (Base64)")}</span><textarea class="dbx-textarea pem" bind:value={createPublicMaterial} aria-invalid={Boolean(fieldErrors.createPublicMaterial)} aria-describedby={fieldErrors.createPublicMaterial ? "create-public-error" : undefined} spellcheck="false"></textarea>{#if fieldErrors.createPublicMaterial}<small id="create-public-error" class="field-error">{fieldErrors.createPublicMaterial}</small>{/if}</label>
          {/if}
        {/if}
        </fieldset>
        <div class="management-footer"><button class="dbx-btn" disabled={busy} onclick={requestCloseManagement} type="button">{t("取消", "Cancel")}</button><button class="dbx-btn dbx-btn--primary" disabled={busy || discardPending} onclick={createKey} type="button">{busy ? generatingAsym ? t("生成中…", "Generating…") : t("保存中…", "Saving…") : t("保存", "Save")}</button></div>
      </div>
    {/if}
    </div>
    </div>
    {/if}
  {/if}

  {#if reveal || pendingDelete || purposeEdit}
    <div class="overlay" onclick={onOverlayClick} role="presentation">
      {#if reveal}
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="vault-reveal-title">
          <div class="export-head">
            <div class="sheet-copy">
              <strong id="vault-reveal-title">
                {#if reveal.mode === "public"}
                  {t(`公钥 · ${reveal.key.name}`, `Public · ${reveal.key.name}`)}
                {:else}
                  {t(`原文 · ${reveal.key.name}`, `Secret · ${reveal.key.name}`)}
                {/if}
              </strong>
              <p>
                {#if reveal.mode === "public"}
                  {t("公钥可安全分享；关闭后会从界面清除。", "Public keys are safe to share. Closing clears them from the UI.")}
                {:else}
                  {t("关闭后会从界面清除。不要把原文留在屏幕上。", "Closing clears it from the UI. Do not leave the secret on screen.")}
                {/if}
              </p>
            </div>
            {#if reveal.mode === "public" ? reveal.publicKey : reveal.material}
              <CopyButton {locale} text={reveal.mode === "public" ? reveal.publicKey : reveal.material} />
            {/if}
            <button class="dbx-btn" onclick={closeDialogs} type="button">{t("关闭", "Close")}</button>
          </div>
          {#if reveal.loading}
            <p class="lead">{t("读取中…", "Reading…")}</p>
          {:else if reveal.mode === "public"}
            <textarea class="dbx-textarea pem" readonly value={reveal.publicKey}></textarea>
          {:else if !reveal.material}
            <label class="field">
              <span>{t("再次验证主密码", "Verify master password again")}</span>
              <input class="dbx-input" type="password" bind:value={reveal.password} autocomplete="current-password" onkeydown={(event) => onEnter(event, exportSecret)} />
            </label>
            <div class="inline">
              <button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={exportSecret} type="button">{busy ? t("验证中…", "Verifying…") : t("显示原文", "Show secret")}</button>
              <button class="dbx-btn dbx-btn--ghost" onclick={closeDialogs} type="button">{t("取消", "Cancel")}</button>
            </div>
          {:else}
            <textarea class="dbx-textarea pem" readonly value={reveal.material}></textarea>
            {#if reveal.publicKey}
              <label class="field material">
                <div class="caption-row">
                  <span>{t("对应公钥", "Public key")}</span>
                  <CopyButton {locale} text={reveal.publicKey} labelZh="复制公钥" labelEn="Copy public key" />
                </div>
                <textarea class="dbx-textarea pem" readonly value={reveal.publicKey}></textarea>
              </label>
            {/if}
          {/if}
        </div>
      {:else if purposeEdit}
        <div class="dialog" role="dialog" aria-modal="true">
          <strong>{t(`用途 · ${purposeEdit.key.name}`, `Purposes · ${purposeEdit.key.name}`)}</strong>
          <p>{t("只能在自动推导的能力范围内限制用途；XOR 调试默认不启用。", "Restrict purposes only within derived capabilities; XOR debug is disabled by default.")}</p>
          {#if purposeError}<div class="banner" role="alert">{purposeError}</div>{/if}
          <div class="purpose-list">
            {#each purposeEdit.key.capabilities || [] as purpose}
              <label><input type="checkbox" checked={purposeEdit.selected.includes(purpose)} onchange={() => togglePurpose(purpose)} /> {purposeLabel(purpose)}</label>
            {/each}
          </div>
          <div class="purpose-actions"><button class="dbx-btn dbx-btn--primary" disabled={busy} onclick={savePurposes}>{t("保存", "Save")}</button><button class="dbx-btn" onclick={() => (purposeEdit = null)}>{t("取消", "Cancel")}</button></div>
        </div>
      {:else if pendingDelete}
        <div class="dialog danger" role="dialog" aria-modal="true" aria-labelledby="vault-delete-title">
          <div class="sheet-copy">
            <strong id="vault-delete-title">{t("删除密钥", "Delete key")}</strong>
            <p>
              {t(`确定删除「${pendingDelete.name}」？删除后不能恢复。`, `Delete “${pendingDelete.name}”? This cannot be undone.`)}
            </p>
          </div>
          <div class="purpose-actions">
            <button class="dbx-btn dbx-btn--danger" disabled={busy} onclick={confirmDelete} type="button">
              {busy ? t("删除中…", "Deleting…") : t("删除", "Delete")}
            </button>
            <button class="dbx-btn dbx-btn--ghost" disabled={busy} onclick={closeDialogs} type="button">{t("取消", "Cancel")}</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if pointerDrag?.active && draggingKey}
    <div
      class="drag-ghost"
      style:left={`${pointerDrag.x}px`}
      style:top={`${pointerDrag.y}px`}
      style:width={`${pointerDrag.width}px`}
      style:height={`${pointerDrag.height}px`}
    >
      <span>⠿</span>
      <strong>{draggingKey.name}</strong>
      <small>{draggingKey.algorithm}</small>
    </div>
  {/if}
</div>

<style>
  .vault {
    container-type: inline-size;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    flex: 1;
    width: 100%;
    overflow: auto;
  }
  .vault > :global(*) { flex-shrink: 0; }
  .lead, .dialog p {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .lead.strong {
    font-size: 13px;
    font-weight: 600;
    color: inherit;
  }
  .notice { margin: 0; }
  .gate {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
  }
  .gate .stack > .dbx-btn { align-self: flex-start; }
  .unlock-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
    width: 100%;
  }
  .unlock-row .dbx-input {
    flex: 1 1 auto;
    min-width: 0;
  }
  .unlock-row .dbx-btn {
    flex: 0 0 auto;
    align-self: auto;
  }
  .stack, .add-form {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
    width: 100%;
  }
  .purpose-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.purpose-list label{font-size:12px}
  .purpose-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
  .options, .inline, .status, .export-head, .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }
  .status, .export-head {
    justify-content: space-between;
    align-items: flex-start;
  }
  .status {
    padding: 12px 14px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-card, Canvas) 92%, var(--color-primary, Highlight) 8%);
  }
  .status-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }
  .export-head { align-items: center; }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .field :global(.dbx-custom-select) {
    width: auto;
    min-width: 160px;
  }
  .field > span {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .material { width: 100%; }
  .caption-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .key-list {
    --key-columns:24px minmax(110px,1.2fr) minmax(90px,.8fr) minmax(100px,1.3fr) minmax(120px,1fr) minmax(120px,1.1fr) 300px;
    display: flex;
    flex-direction: column;
    flex: 1 0 160px;
    min-height: 160px;
    overflow: auto;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .key-list.dragging { cursor: grabbing; user-select: none; }
  .key-header { position:sticky; top:0; z-index:3; display:grid; grid-template-columns:var(--key-columns); align-items:center; gap:10px; flex-shrink:0; min-height:36px; padding:6px 12px 6px 6px; border-bottom:1px solid var(--color-border); background:var(--color-card); color:var(--color-muted-foreground); font-size:11px; }
  .actions-heading { text-align:right; }
  .key-card {
    position: relative;
    display: grid;
    grid-template-columns: var(--key-columns);
    gap: 10px;
    align-items: center;
    min-height: 60px;
    flex-shrink: 0;
    padding: 10px 12px 10px 6px;
    border-bottom: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
  }
  .key-card:last-child { border-bottom: 0; }
  .key-card:hover, .key-card:focus-within { z-index: 1; background:var(--color-muted, color-mix(in srgb, CanvasText 5%, transparent)); }
  .key-card.dragging { opacity: 0.4; }
  .key-card.highlighted { background:color-mix(in srgb,var(--color-primary) 6%,var(--color-card)); box-shadow:inset 2px 0 color-mix(in srgb,var(--color-primary) 40%,var(--color-border)); }
  .key-card.drop-before { box-shadow: inset 0 2px 0 var(--color-primary, Highlight); }
  .key-card.drop-after { box-shadow: inset 0 -2px 0 var(--color-primary, Highlight); }
  .key-card > .drag { grid-column:1; grid-row:1; align-self:center; }
  .key-content { display:contents; }
  .key-title { grid-column:2; grid-row:1; display:flex; min-width:0; align-items:flex-start; flex-direction:column; gap:4px; }
  .key-title strong { max-width:100%; overflow:hidden; font-size:13px; text-overflow:ellipsis; white-space:nowrap; }
  .key-title .rename-input { width:100%; min-width:0; }
  .key-type { flex:0 0 auto; padding:2px 7px; border-radius:999px; background:var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent)); color:var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size:10px; }
  .key-compatibility { flex:0 0 auto; padding:2px 7px; border-radius:999px; background:var(--color-warning-bg); color:var(--color-warning); font-size:10px; }
  .key-details { display:contents; }
  .key-details > span { grid-row:1; display:flex; min-width:0; align-items:center; gap:4px; }
  .key-details > span:nth-child(1) { grid-column:3; }
  .key-details > span:nth-child(2) { grid-column:4; }
  .key-details > span:nth-child(3) { grid-column:5; }
  .key-details > span:nth-child(4) { grid-column:6; }
  .key-details small { display:none; }
  .key-details small, .fingerprint small { color:var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size:10px; }
  .key-details b { overflow:hidden; color:var(--color-muted-foreground); font-size:11px; font-weight:400; line-height:1.5; text-overflow:ellipsis; white-space:nowrap; }
  .key-purpose b { color:var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); }
  .fingerprint { display:flex; min-width:0; align-items:center; gap:8px; }
  .fingerprint code { overflow:hidden; color:var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent)); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
  .add-form {
    padding: 14px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .list-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    align-items: flex-end;
    justify-content: space-between;
  }
  .list-filter {
    flex: 1 1 240px;
    max-width: 360px;
  }
  .list-filters { display:flex; flex:1 1 420px; flex-wrap:wrap; align-items:flex-end; gap:12px; }
  .type-filter { flex:0 1 180px; min-width:140px; }
  .type-filter :global(.dbx-custom-select) { width:100%; min-width:0; }
  .list-meta {
    margin: 0;
    flex: 0 0 auto;
  }
  .list-toolbar-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:12px; }
  .management-dialog { width:min(620px,100%); max-height:min(90dvh,760px); }
  .management-dialog > :global(*) { flex-shrink:0; }
  .management-head { display:flex; flex:0 0 auto; align-items:center; justify-content:space-between; gap:12px; }
  .management-head strong { font-size:14px; }
  .management-dialog .add-form { padding:0; border:0; background:transparent; }
  .management-fields { display:flex; min-width:0; flex-direction:column; gap:12px; margin:0; padding:0; border:0; }
  .management-fields .options { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
  .management-fields .field { min-width:0; }
  .management-fields .field :global(.dbx-custom-select) { width:100%; min-width:0; }
  .management-footer { display:flex; flex:0 0 auto; justify-content:flex-end; align-items:center; gap:8px; margin-top:4px; padding-top:12px; border-top:1px solid var(--color-border); }
  .field-error { color:var(--color-destructive); font-size:11px; line-height:1.5; }
  .discard-notice { padding:12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-muted); }
  .discard-notice p { margin:0 0 10px; font-size:12px; }
  .drag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    opacity: 0.45;
    cursor: grab;
    font: inherit;
  }
  .drag:hover:not(:disabled),
  .drag:focus-visible {
    opacity: 1;
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .drag:disabled {
    cursor: default;
    opacity: 0.25;
  }
  .drag:active:not(:disabled) { cursor: grabbing; }
  .drag-ghost {
    position: fixed;
    z-index: 40;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    pointer-events: none;
    border: 1px solid var(--color-primary, Highlight);
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    font-size: 12px;
  }
  .drag-ghost strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drag-ghost small {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .actions { grid-column:7; grid-row:1; min-width:0; align-self:center; justify-content:flex-end; align-items:center; align-content:center; flex-wrap:wrap; white-space:nowrap; }
  .actions :global(.dbx-btn) {
    height: 26px;
    padding: 0 10px;
    font-size: 12px;
  }
  .rename-input { min-width: 180px; }
  .pem {
    width: 100%;
    min-height: 96px;
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  }
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
    width: min(560px, 100%);
    max-height: min(80vh, 640px);
    overflow: auto;
    padding: 16px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .dialog.danger {
    width: min(420px, 100%);
    border-color: color-mix(in srgb, var(--color-destructive) 28%, transparent);
  }
  .sheet-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .sheet-copy strong { font-size: 13px; }
  @container (max-width: 1100px) {
    .key-header { display:none; }
    .key-card { grid-template-columns:24px minmax(0,1fr); }
    .key-content { grid-column:2; grid-row:1; display:flex; min-width:0; flex-direction:column; gap:8px; }
    .key-title { flex-direction:row; align-items:center; flex-wrap:wrap; }
    .key-card > .actions { grid-column:2; grid-row:2; }
    .key-details { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px 16px; }
    .key-details > span:nth-child(n) { grid-column:auto; grid-row:auto; align-items:flex-start; flex-direction:column; }
    .key-details small { display:block; }
  }
  @container (max-width: 560px) {
    .status, .status-actions { align-items:stretch; }
    .status { flex-direction:column; }
    .status-actions { flex-wrap:wrap; }
    .list-filter { max-width:none; }
    .key-card { gap:8px; padding:11px 10px 11px 4px; }
    .key-details { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .key-details b { white-space:normal; }
    .actions { gap:6px; }
    .actions :global(.dbx-btn) { flex:1 1 auto; }
    .options > .field { flex:1 1 100%; }
  }
  @media (max-width: 900px), (max-height: 640px) {
    .key-list { flex:0 0 auto; min-height:0; overflow:visible; }
  }
  @media (max-width:560px) {
    .overlay:has(.management-dialog) { padding:0; }
    .management-dialog { width:100%; height:100dvh; max-height:100dvh; border-radius:0; }
    .management-fields .options { grid-template-columns:1fr; }
    .management-dialog > .stack { flex:1 0 auto; }
    .management-footer { margin-top:auto; }
  }
</style>
