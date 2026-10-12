<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { parseTotpConfig, totpWindows } from "./codec.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  let secret = $state("");
  let digits = $state("6");
  let step = $state("30");
  let algorithm = $state("SHA-1");
  let revealSecret = $state(false);
  let windows = $state([]);
  let effectiveConfig = $state(null);
  let error = $state("");
  let remaining = $state(30);
  let activeStep = $state(30);

  $effect(() => {
    const raw = secret.trim();
    if (!raw) {
      windows = [];
      effectiveConfig = null;
      error = "";
      activeStep = Number(step);
      remaining = activeStep - (Math.floor(Date.now() / 1000) % activeStep);
      return;
    }
    let cancelled = false;
    let lastCounter = -1;
    const refresh = async () => {
      let config;
      try {
        config = parseTotpConfig(raw, { digits, step, algorithm });
      } catch {
        windows = [];
        effectiveConfig = null;
        error = t("不是有效的 TOTP 密钥或 URI", "Not a valid TOTP secret or URI");
        return;
      }
      const now = Date.now();
      remaining = config.step - (Math.floor(now / 1000) % config.step);
      activeStep = config.step;
      const counter = Math.floor(now / 1000 / config.step);
      if (counter === lastCounter) return;
      try {
        const result = await totpWindows(raw, config.digits, config.step, config.algorithm, now);
        if (cancelled) return;
        windows = result.windows;
        effectiveConfig = { digits: result.digits, step: result.step, algorithm: result.algorithm };
        error = "";
        lastCounter = counter;
      } catch {
        if (cancelled) return;
        windows = [];
        effectiveConfig = null;
        error = t("不是有效的 Base32 密钥", "Not a valid Base32 secret");
      }
    };
    refresh();
    const id = setInterval(refresh, 200);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  });

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
    return values.map((value) => ({ value, label: `${value}s` }));
  });
  const ratio = $derived(remaining / activeStep);

  function grouped(code) {
    if (!code) return "";
    return code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`;
  }
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("密钥（Base32）", "Secret (Base32)")}</span>
    <span class="secret-input-wrap">
      <input
        class="dbx-input mono secret-input"
        type={revealSecret ? "text" : "password"}
        spellcheck="false"
        autocomplete="off"
        placeholder="JBSWY3DPEHPK3PXP / otpauth://..."
        bind:value={secret}
      />
      <button
        class="secret-toggle"
        type="button"
        aria-pressed={revealSecret}
        aria-label={revealSecret ? t("隐藏密钥", "Hide secret") : t("显示密钥", "Show secret")}
        title={revealSecret ? t("隐藏密钥", "Hide secret") : t("显示密钥", "Show secret")}
        onclick={() => revealSecret = !revealSecret}
      >
        {#if revealSecret}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m3 3 18 18"></path>
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path>
            <path d="M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 9 4.1 10 8a10.8 10.8 0 0 1-2.2 4.1"></path>
            <path d="M6.6 6.6A11.1 11.1 0 0 0 2 12c1 3.9 5 8 10 8 1.6 0 3-.4 4.3-1"></path>
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        {/if}
      </button>
    </span>
  </label>
  <div class="totp-options">
    <label class="block"><span class="label">{t("位数", "Digits")}</span><Select value={shownDigits} onchange={(value) => digits = value} disabled={isUri} options={[{ value: "6", label: "6" }, { value: "8", label: "8" }]} /></label>
    <label class="block"><span class="label">{t("周期", "Period")}</span><Select value={shownStep} onchange={(value) => step = value} disabled={isUri} options={stepOptions} /></label>
    <label class="block"><span class="label">{t("算法", "Algorithm")}</span><Select value={shownAlgorithm} onchange={(value) => algorithm = value} disabled={isUri} options={["SHA-1", "SHA-256", "SHA-512"].map((value) => ({ value, label: value }))} /></label>
  </div>
  {#if isUri && effectiveConfig}
    <p class="dbx-hint config-hint">
      {t(
        `使用 URI 配置：${effectiveConfig.digits} 位 · ${effectiveConfig.step}s · ${effectiveConfig.algorithm}`,
        `Using URI settings: ${effectiveConfig.digits} digits · ${effectiveConfig.step}s · ${effectiveConfig.algorithm}`,
      )}
    </p>
  {/if}

  {#if error}
    <p class="dbx-hint error">{error}</p>
  {:else if currentWindow}
    <div class="window-grid">
      <section class="window-card secondary">
        <div class="window-heading">
          <span>{t("上一周期", "Previous")}</span>
          <span class="window-status">{t("已过期", "Expired")}</span>
        </div>
        <div class="code-row compact">
          <p class="code">{grouped(previousWindow?.code)}</p>
          <CopyButton {locale} text={previousWindow?.code || ""} labelZh="复制上一口令" labelEn="Copy previous code" />
        </div>
      </section>

      <section class="window-card current">
        <div class="window-heading">
          <span>{t("当前口令", "Current")}</span>
          <span class="window-status active">{t(`${remaining} 秒`, `${remaining}s`)}</span>
        </div>
        <div class="code-row">
          <p class="code primary-code" aria-live="polite">{grouped(currentWindow.code)}</p>
          <CopyButton {locale} text={currentWindow.code} labelZh="复制当前口令" labelEn="Copy current code" />
        </div>
      </section>

      <section class="window-card secondary">
        <div class="window-heading">
          <span>{t("下一周期", "Next")}</span>
          <span class="window-status">{t(`${remaining} 秒后生效`, `In ${remaining}s`)}</span>
        </div>
        <div class="code-row compact">
          <p class="code">{grouped(nextWindow?.code)}</p>
          <CopyButton {locale} text={nextWindow?.code || ""} labelZh="复制下一口令" labelEn="Copy next code" />
        </div>
      </section>
    </div>
    <div class="meter" title={t(`${remaining} 秒后刷新`, `Refreshes in ${remaining}s`)}>
      <div class="meter-fill" style:transform={`scaleX(${ratio})`}></div>
    </div>
    <p class="dbx-hint remain">{t("口令在本地生成；上一周期口令能否通过验证，取决于目标系统允许的验证时间窗口。", "Codes are generated locally. Whether the previous code is accepted depends on the verification window allowed by the target system.")}</p>
  {:else}
    <p class="dbx-hint">{t("粘贴身份验证器密钥后会显示当前口令。", "Paste an authenticator secret to see the current code.")}</p>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 420px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .secret-input-wrap { position: relative; display: block; }
  .secret-input { width: 100%; padding-right: 42px; }
  .secret-toggle {
    position: absolute;
    top: 50%;
    right: 5px;
    display: grid;
    width: 30px;
    height: 30px;
    padding: 0;
    place-items: center;
    transform: translateY(-50%);
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .secret-toggle:hover { background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent)); }
  .secret-toggle:focus-visible { outline: none; box-shadow: var(--dbx-focus-ring); }
  .totp-options { display: flex; flex-wrap: wrap; gap: 8px; }
  .totp-options :global(.dbx-custom-select) { width: auto; min-width: 100px; }
  .config-hint { margin: -4px 0 0; }
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .code-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .window-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .window-card {
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: 8px;
    background: var(--color-background, Canvas);
  }
  .window-card.current {
    grid-column: 1 / -1;
    grid-row: 1;
    border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background, Canvas));
  }
  .window-card.secondary { color: var(--color-muted-foreground); }
  .window-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
  }
  .window-status { font-weight: 400; white-space: nowrap; }
  .window-status.active { color: var(--color-primary); }
  .code {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }
  .primary-code { font-size: 28px; color: var(--color-foreground, CanvasText); }
  .compact :global(.dbx-btn) { flex: 0 0 auto; }
  .meter {
    height: 4px;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, CanvasText 12%, transparent);
  }
  .meter-fill {
    height: 100%;
    width: 100%;
    transform-origin: left center;
    background: var(--color-primary);
    transition: transform 200ms linear;
  }
  .remain {
    margin: 0;
  }
  @media (max-width: 360px) {
    .window-grid { grid-template-columns: 1fr; }
    .window-card.current { grid-column: 1; }
  }
</style>
