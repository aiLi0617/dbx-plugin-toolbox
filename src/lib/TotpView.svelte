<script>
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { parseTotpConfig, totp } from "./codec.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  let secret = $state("");
  let digits = $state("6");
  let step = $state("30");
  let algorithm = $state("SHA-1");
  let code = $state("");
  let error = $state("");
  let remaining = $state(30);
  let activeStep = $state(30);

  $effect(() => {
    const raw = secret.trim();
    if (!raw) {
      code = "";
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
        code = "";
        error = t("不是有效的 TOTP 密钥或 URI", "Not a valid TOTP secret or URI");
        return;
      }
      remaining = config.step - (Math.floor(Date.now() / 1000) % config.step);
      activeStep = config.step;
      const counter = Math.floor(Date.now() / 1000 / config.step);
      if (counter === lastCounter) return;
      try {
        const next = await totp(raw, config.digits, config.step, config.algorithm);
        if (cancelled) return;
        code = next;
        error = "";
        lastCounter = counter;
      } catch {
        if (cancelled) return;
        code = "";
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

  const grouped = $derived(code ? (code.length === 8 ? `${code.slice(0, 4)} ${code.slice(4)}` : `${code.slice(0, 3)} ${code.slice(3)}`) : "");
  const ratio = $derived(remaining / activeStep);
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("密钥（Base32）", "Secret (Base32)")}</span>
    <input
      class="dbx-input mono"
      type="password"
      spellcheck="false"
      autocomplete="off"
      placeholder="JBSWY3DPEHPK3PXP / otpauth://..."
      bind:value={secret}
    />
  </label>
  <div class="totp-options">
    <label class="block"><span class="label">{t("位数", "Digits")}</span><Select bind:value={digits} options={[{ value: "6", label: "6" }, { value: "8", label: "8" }]} /></label>
    <label class="block"><span class="label">{t("周期", "Period")}</span><Select bind:value={step} options={[{ value: "30", label: "30s" }, { value: "60", label: "60s" }]} /></label>
    <label class="block"><span class="label">{t("算法", "Algorithm")}</span><Select bind:value={algorithm} options={["SHA-1", "SHA-256", "SHA-512"].map((value) => ({ value, label: value }))} /></label>
  </div>

  {#if error}
    <p class="dbx-hint error">{error}</p>
  {:else if grouped}
    <div class="code-row">
      <p class="code" aria-live="polite">{grouped}</p>
      <CopyButton {locale} text={code} labelZh="复制口令" labelEn="Copy code" />
    </div>
    <div class="meter" title={t(`${remaining} 秒后刷新`, `Refreshes in ${remaining}s`)}>
      <div class="meter-fill" style:transform={`scaleX(${ratio})`}></div>
    </div>
    <p class="dbx-hint remain">{t(`${remaining} 秒后刷新`, `Refreshes in ${remaining}s`)}</p>
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
  .totp-options { display: flex; flex-wrap: wrap; gap: 8px; }
  .totp-options :global(.dbx-select) { width: auto; min-width: 100px; }
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .error {
    margin: 0;
    color: var(--color-destructive, #dc2626);
  }
  .code-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .code {
    margin: 0;
    font-family: var(--font-mono);
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.08em;
    font-variant-numeric: tabular-nums;
  }
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
    background: var(--color-primary, #2563eb);
    transition: transform 200ms linear;
  }
  .remain {
    margin: 0;
  }
</style>
