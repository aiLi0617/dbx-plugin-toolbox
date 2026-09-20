<script>
  import { onMount, tick } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { invoke, ready } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { moveId } from "./navigation.js";
  import { VAULT_AUTO_LOCK_MINUTES } from "./prefs.js";
  import { RSA_BIT_OPTIONS, RSA_PEM_FORMATS, generateRsaKeyPairPem, generateSymmetricKeyMaterial } from "./tools/generate.js";

  let {
    locale = "zh-CN",
    autoLockMinutes = 15,
    onAutoLockChange = () => {},
    onKeysChange = () => {},
  } = $props();

  let status = $state({ exists: false, unlocked: false });
  let keys = $state([]);
  let listQuery = $state("");
  let pointerDrag = $state(null);
  let password = $state("");
  let confirmPassword = $state("");
  let newPassword = $state("");
  let confirmNewPassword = $state("");
  let currentPassword = $state("");
  let error = $state("");
  let notice = $state("");
  let busy = $state(false);
  let createName = $state("");
  let createAlg = $state("aes-256");
  let createMode = $state("generate");
  let createBits = $state("2048");
  let createFormat = $state("pkcs8");
  let createMaterial = $state("");
  let reveal = $state(null);
  let pendingDelete = $state(null);
  let renameId = $state("");
  let renameName = $state("");
  let renameInput = $state(null);
  let panel = $state("create");

  const t = (zh, en) => pick(locale, zh, en);
  const autoLockOptions = $derived(VAULT_AUTO_LOCK_MINUTES.map((minutes) => ({
    value: minutes,
    label: minutes === 0 ? t("从不", "Never") : t(`${minutes} 分钟`, `${minutes} min`),
  })));
  const pasteExisting = $derived(createMode === "paste");
  const generatingAsym = $derived(!pasteExisting && (createAlg === "rsa-pem" || createAlg === "sm2"));
  const filteredKeys = $derived((() => {
    const query = listQuery.trim().toLowerCase();
    if (!query) return keys;
    return keys.filter((key) => {
      const hay = `${key.name} ${key.algorithm} ${key.fingerprint || ""}`.toLowerCase();
      return hay.includes(query);
    });
  })());
  const filtering = $derived(Boolean(listQuery.trim()));
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
    reveal = null;
    pendingDelete = null;
    cancelRename();
    pointerDrag = null;
    listQuery = "";
    password = "";
    confirmPassword = "";
    currentPassword = "";
    newPassword = "";
    confirmNewPassword = "";
    createMaterial = "";
  }

  function closeDialogs() {
    reveal = null;
    pendingDelete = null;
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

  function usesFor(algorithm) {
    if (algorithm === "aes-256" || algorithm === "aes-128" || algorithm === "sm4-128") {
      return t("对称加密 · XOR", "Symmetric · XOR");
    }
    if (algorithm === "hmac-sm3") {
      return t("HMAC · XOR", "HMAC · XOR");
    }
    if (String(algorithm || "").startsWith("hmac")) {
      return t("HMAC · JWT · XOR", "HMAC · JWT · XOR");
    }
    if (algorithm === "rsa-pem" || algorithm === "sm2") {
      return t("非对称加密", "Asymmetric cipher");
    }
    return t("加解密工具", "Cipher tools");
  }

  function algHint(algorithm) {
    if (algorithm === "aes-256" || algorithm === "aes-128") {
      return t("给「对称加密」选用，也可给 XOR 当字节密钥。", "For Symmetric cipher; XOR can reuse these byte keys.");
    }
    if (algorithm === "sm4-128") {
      return t("给「对称加密」选用，也可给 XOR 当字节密钥。", "For Symmetric cipher; XOR can reuse these byte keys.");
    }
    if (algorithm === "hmac-sm3") {
      return t("给 HMAC 选用，也可给 XOR 当字节密钥。", "For HMAC; XOR can reuse these byte keys.");
    }
    if (String(algorithm || "").startsWith("hmac")) {
      return t("给 HMAC、JWT 选用，也可给 XOR 当字节密钥。", "For HMAC and JWT; XOR can reuse these byte keys.");
    }
    if (algorithm === "rsa-pem") {
      return t("给「非对称加密」的 RSA 选用。随机生成可选位数和 PEM 格式。", "For RSA in Asymmetric cipher. Generate with a chosen bit length and PKCS#8 or PKCS#1 PEM.");
    }
    return t("给「非对称加密」的 SM2 选用。可随机生成或粘贴已有密钥。", "For SM2 in Asymmetric cipher. Generate a new key or paste an existing one.");
  }

  async function run(task) {
    if (busy) {
      fail({ message: t("请稍候，正在处理上一步操作", "Wait, another action is still running") });
      return;
    }
    busy = true;
    error = "";
    try {
      await task();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function refresh(announce = true) {
    status = await invoke("toolbox/keys/status");
    if (status.unlocked) {
      const listed = await invoke("toolbox/keys/list");
      keys = listed.keys || [];
    } else {
      keys = [];
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

  async function changePassword() {
    if (passwordTooShort(currentPassword) || passwordTooShort(newPassword)) {
      fail({ message: t("主密码至少 8 位", "Master password must be at least 8 characters") });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      fail({ message: t("两次输入的新密码不一致", "New passwords do not match") });
      return;
    }
    await run(async () => {
      await invoke("toolbox/keys/change-password", { currentPassword, newPassword }, 60000);
      currentPassword = "";
      newPassword = "";
      confirmNewPassword = "";
      ok(t("主密码已更新", "Master password updated"));
    });
  }

  async function createKey() {
    const name = createName.trim();
    if (!name) {
      fail({ message: t("请填写名称", "Enter a name") });
      return;
    }
    if (pasteExisting && !createMaterial.trim()) {
      fail({ message: t("请粘贴密钥材料", "Paste the key material") });
      return;
    }
    await run(async () => {
      let material = createMaterial;
      let generate = !pasteExisting;
      if (!pasteExisting && createAlg === "rsa-pem") {
        // RSA via WebCrypto locally — backend pure-Rust keygen is too slow for the UI.
        const pair = await generateRsaKeyPairPem(createBits, createFormat);
        material = pair.privateKey;
        generate = false;
      } else if (!pasteExisting && createAlg !== "sm2") {
        // AES / SM4 / HMAC: CSPRNG on the frontend; backend only validates + stores.
        material = generateSymmetricKeyMaterial(createAlg).material;
        generate = false;
      }
      await invoke("toolbox/keys/create", {
        name,
        algorithm: createAlg,
        generate,
        material,
        bits: createAlg === "rsa-pem" ? Number(createBits) : undefined,
        format: createAlg === "rsa-pem" ? createFormat : undefined,
      }, 30000);
      createName = "";
      createMaterial = "";
      createMode = "generate";
      ok(t("密钥已保存", "Key saved"));
      await refresh();
    });
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
    const row = event.currentTarget.closest("tr");
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
      ok(t("已删除", "Deleted"));
      await refresh();
    });
  }

  function onOverlayClick(event) {
    if (event.target === event.currentTarget) closeDialogs();
  }

  $effect(() => {
    if (!reveal && !pendingDelete) return;
    function onKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialogs();
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
      window.removeEventListener("toolbox-vault-change", onVaultChange);
    };
  });
</script>

<div class="vault">
  {#if !status.exists}
    {#if error}<div class="banner">{error}</div>{/if}
    <div class="gate">
      <p class="lead">
        {t("设置主密码（至少 8 位）后即可保存密钥，供加解密工具选用。", "Set a master password (8+ characters) to store keys for the cipher tools.")}
      </p>
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
      <p class="lead">
        {t("输入主密码解锁。", "Enter the master password to unlock.")}
      </p>
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
        <p class="lead">
          {t("对称加密、HMAC、JWT、XOR、非对称加密都从这里选用密钥。", "Symmetric, HMAC, JWT, XOR, and asymmetric cipher all pick keys here.")}
        </p>
      </div>
      <div class="status-actions">
        <label class="field auto-lock">
          <span>{t("自动锁定", "Auto-lock")}</span>
          <Select
            value={autoLockMinutes}
            options={autoLockOptions}
            onchange={(value) => onAutoLockChange(Number(value))}
          />
        </label>
        <button class="dbx-btn" disabled={busy} onclick={lock} type="button">{t("锁定", "Lock")}</button>
      </div>
    </div>
    {#if error}<div class="banner">{error}</div>{/if}
    {#if notice}<p class="dbx-hint notice">{notice}</p>{/if}

    {#if keys.length === 0}
      <p class="dbx-hint">{t("还没有密钥。添加 AES / SM4、HMAC、RSA / SM2，供加密、签名和 XOR 选用。", "No keys yet. Add AES/SM4, HMAC, or RSA/SM2 for cipher, signing, and XOR.")}</p>
    {:else}
      <div class="list-toolbar">
        <label class="field list-filter">
          <span>{t("筛选", "Filter")}</span>
          <input
            class="dbx-input"
            bind:value={listQuery}
            placeholder={t("按名称、算法或指纹筛选", "Filter by name, algorithm, or fingerprint")}
            aria-label={t("筛选密钥", "Filter keys")}
          />
        </label>
        <p class="dbx-hint list-meta">
          {#if filtering}
            {t(`显示 ${filteredKeys.length} / ${keys.length}`, `Showing ${filteredKeys.length} / ${keys.length}`)}
          {:else if canReorder}
            {t("拖动手柄或用 ↑↓ 调整顺序", "Drag the handle or use ↑↓ to reorder")}
          {:else}
            {t(`${keys.length} 把密钥`, `${keys.length} key${keys.length === 1 ? "" : "s"}`)}
          {/if}
        </p>
      </div>
      {#if filteredKeys.length === 0}
        <p class="dbx-hint">{t("没有匹配的密钥", "No matching keys")}</p>
      {:else}
        <div class="table-wrap" class:dragging={pointerDrag?.active}>
          <table class="dbx-table">
            <thead>
              <tr>
                <th class="drag-col" aria-hidden="true"></th>
                <th>{t("名称", "Name")}</th>
                <th>{t("算法", "Algorithm")}</th>
                <th>{t("用途", "Used by")}</th>
                <th>{t("指纹", "Fingerprint")}</th>
                <th>{t("创建时间", "Created")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each filteredKeys as key (key.id)}
                <tr
                  data-key-id={key.id}
                  class:dragging={pointerDrag?.active && pointerDrag.sourceId === key.id}
                  class:drop-target={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id}
                  class:drop-after={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id && pointerDrag.after}
                  class:drop-before={pointerDrag?.active && pointerDrag.targetId === key.id && pointerDrag.sourceId !== key.id && !pointerDrag.after}
                >
                  <td class="drag-col">
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
                  </td>
                  <td>
                    {#if renameId === key.id}
                      <input
                        class="dbx-input rename-input"
                        bind:this={renameInput}
                        bind:value={renameName}
                        aria-label={t("密钥名称", "Key name")}
                        onkeydown={onRenameKeydown}
                      />
                    {:else}
                      {key.name}
                    {/if}
                  </td>
                  <td>{key.algorithm}</td>
                  <td class="uses">{usesFor(key.algorithm)}</td>
                  <td class="mono" title={key.fingerprint}>{key.fingerprint}</td>
                  <td class="muted">{formatCreated(key.createdAt)}</td>
                  <td class="actions">
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
                      <button class="dbx-btn" disabled={busy} onclick={() => startRename(key)} type="button">{t("重命名", "Rename")}</button>
                      <button class="dbx-btn dbx-btn--danger" disabled={busy} onclick={() => askDelete(key)} type="button">{t("删除", "Delete")}</button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}

    <div class="seg" role="tablist">
      <button class:active={panel === "create"} aria-selected={panel === "create"} onclick={() => (panel = "create")} role="tab" type="button">{t("添加密钥", "Add key")}</button>
      <button class:active={panel === "password"} aria-selected={panel === "password"} onclick={() => (panel = "password")} role="tab" type="button">{t("主密码", "Master password")}</button>
    </div>

    {#if panel === "create"}
      <div class="stack add-form">
        <div class="options">
          <label class="field">
            <span>{t("名称", "Name")}</span>
            <input class="dbx-input" bind:value={createName} placeholder={t("例如：测试密钥", "e.g. test-key")} onkeydown={(event) => onEnter(event, createKey)} />
          </label>
          <label class="field">
            <span>{t("算法", "Algorithm")}</span>
            <Select
              bind:value={createAlg}
              options={[
                { value: "aes-256", label: "AES-256", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "aes-128", label: "AES-128", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "sm4-128", label: "SM4", group: t("对称加密 / XOR", "Symmetric / XOR") },
                { value: "hmac-sha1", label: "SHA-1", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha256", label: "SHA-256", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha384", label: "SHA-384", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sha512", label: "SHA-512", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "hmac-sm3", label: "SM3", group: t("HMAC / JWT", "HMAC / JWT") },
                { value: "rsa-pem", label: "RSA", group: t("非对称加密", "Asymmetric cipher") },
                { value: "sm2", label: "SM2", group: t("非对称加密", "Asymmetric cipher") },
              ]}
            />
          </label>
          <label class="field">
            <span>{t("方式", "How")}</span>
              <Select
                bind:value={createMode}
                options={[
                  { value: "generate", label: t("随机生成", "Generate") },
                  { value: "paste", label: t("粘贴已有密钥", "Paste existing") },
                ]}
              />
          </label>
          {#if createAlg === "rsa-pem" && !pasteExisting}
            <label class="field">
              <span>{t("位数", "Bits")}</span>
              <Select
                bind:value={createBits}
                options={RSA_BIT_OPTIONS.map((value) => ({ value, label: t(`${value} 位`, `${value}-bit`) }))}
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
          <button class="dbx-btn dbx-btn--primary save" disabled={busy} onclick={createKey} type="button">
            {#if busy}
              {generatingAsym ? t("生成中…", "Generating…") : t("保存中…", "Saving…")}
            {:else}
              {t("保存", "Save")}
            {/if}
          </button>
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
            <textarea class="dbx-textarea pem" bind:value={createMaterial} spellcheck="false" autocomplete="off" placeholder={createAlg === "rsa-pem" ? "-----BEGIN ... KEY-----" : ""}></textarea>
          </label>
        {/if}
        <p class="lead">{algHint(createAlg)}</p>
      </div>
    {:else}
      <div class="stack">
        <div class="options">
          <label class="field">
            <span>{t("当前主密码", "Current password")}</span>
            <input class="dbx-input" type="password" bind:value={currentPassword} autocomplete="current-password" onkeydown={(event) => onEnter(event, changePassword)} />
          </label>
          <label class="field">
            <span>{t("新主密码", "New password")}</span>
            <input class="dbx-input" type="password" bind:value={newPassword} autocomplete="new-password" onkeydown={(event) => onEnter(event, changePassword)} />
          </label>
          <label class="field">
            <span>{t("再输入一次", "Confirm new")}</span>
            <input class="dbx-input" type="password" bind:value={confirmNewPassword} autocomplete="new-password" onkeydown={(event) => onEnter(event, changePassword)} />
          </label>
          <button class="dbx-btn dbx-btn--primary save" disabled={busy} onclick={changePassword} type="button">
            {busy ? t("更新中…", "Updating…") : t("更新", "Update")}
          </button>
        </div>
      </div>
    {/if}
  {/if}

  {#if reveal || pendingDelete}
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
      {:else if pendingDelete}
        <div class="dialog danger" role="dialog" aria-modal="true" aria-labelledby="vault-delete-title">
          <div class="sheet-copy">
            <strong id="vault-delete-title">{t("删除密钥", "Delete key")}</strong>
            <p>
              {t(`确定删除「${pendingDelete.name}」？删除后不能恢复。`, `Delete “${pendingDelete.name}”? This cannot be undone.`)}
            </p>
          </div>
          <div class="inline">
            <button class="dbx-btn dbx-btn--danger" disabled={busy} onclick={confirmDelete} type="button">
              {busy ? t("删除中…", "Deleting…") : t("删除", "Delete")}
            </button>
            <button class="dbx-btn dbx-btn--ghost" onclick={closeDialogs} type="button">{t("取消", "Cancel")}</button>
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
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    flex: 1;
    width: 100%;
    max-width: 960px;
    overflow: auto;
  }
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
  .status-actions {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }
  .auto-lock :global(.dbx-custom-select) {
    min-width: 112px;
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
  .save { flex-shrink: 0; }
  .material { width: 100%; }
  .caption-row {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .table-wrap {
    overflow: auto;
    max-height: min(52vh, 480px);
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
  }
  .table-wrap.dragging { cursor: grabbing; user-select: none; }
  .table-wrap :global(.dbx-table) { margin: 0; }
  .table-wrap :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-card, var(--color-background, Canvas));
    box-shadow: 0 1px 0 var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
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
  .list-meta {
    margin: 0;
    flex: 0 0 auto;
  }
  .drag-col {
    width: 28px;
    padding-left: 4px !important;
    padding-right: 0 !important;
  }
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
  tr.dragging { opacity: 0.4; }
  tr.drop-before td { box-shadow: inset 0 2px 0 var(--color-primary, Highlight); }
  tr.drop-after td { box-shadow: inset 0 -2px 0 var(--color-primary, Highlight); }
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
    box-shadow: 0 12px 28px color-mix(in srgb, CanvasText 18%, transparent);
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
  .mono {
    font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
    white-space: nowrap;
  }
  .uses, .muted {
    white-space: nowrap;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .actions { justify-content: flex-end; flex-wrap: nowrap; white-space: nowrap; }
  .actions :global(.dbx-btn) {
    height: 26px;
    padding: 0 10px;
    font-size: 12px;
  }
  .rename-input { min-width: 180px; }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
  }
  .seg button {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
  }
  .seg button:last-child { border-right: 0; }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
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
    box-shadow: 0 16px 40px color-mix(in srgb, CanvasText 18%, transparent);
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
</style>
