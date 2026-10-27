<script>
  import ColorPicker from "./ColorPicker.svelte";
  import QRCode from "qrcode";
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { wifiPayload } from "./developerExpansion.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  import Select from "./Select.svelte";
  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let ssid = $state(""),
    password = $state(""),
    encryption = $state("WPA"),
    hidden = $state(false),
    size = $state(400),
    dark = $state("#111111"),
    light = $state("#ffffff");
  let preview = $state(""),
    svg = $state(""),
    png = $state(null),
    busy = $state(false),
    error = $state("");
  let revision = 0;
  onDestroy(() => {
    revision++;
  });
  function clear() {
    revision++;
    preview = "";
    svg = "";
    png = null;
  }
  function loadDemo() {
    clear();
    ssid = "DBX Guest";
    password = "public-demo";
    encryption = "WPA";
    hidden = false;
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    loadDemo();
  });
  async function generate() {
    const token = ++revision;
    busy = true;
    error = "";
    preview = "";
    svg = "";
    png = null;
    try {
      const payload = wifiPayload(ssid, password, encryption, hidden);
      const options = {
        width: Math.max(128, Math.min(1600, Number(size))),
        margin: 4,
        errorCorrectionLevel: "M",
        color: { dark, light },
      };
      const vector = await QRCode.toString(payload, {
        ...options,
        type: "svg",
      });
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, payload, options);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not encode image");
      if (token === revision) {
        svg = vector;
        png = blob;
        preview = canvas.toDataURL("image/png");
      }
    } catch (e) {
      if (token === revision) error = localizeError(locale, e);
    } finally {
      busy = false;
    }
  }
  async function save(format) {
    try {
      await saveBlobThroughHost(
        format === "svg" ? new Blob([svg], { type: "image/svg+xml" }) : png,
        { fileName: `wifi.${format}`, binary: true },
      );
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
</script>

<div class="expansion-page wifi-page">
  <div class="wifi-layout">
    <section class="wifi-card wifi-form-card" aria-label={t("二维码设置", "QR code settings")}>
      <div class="wifi-card-heading"><div><h4>{t("网络设置", "Network settings")}</h4><p>{t("这些信息会写入二维码内容。", "These details are encoded into the QR code.")}</p></div><span class="step-badge">01</span></div>
      <label>{t("网络名称", "Network name")}<input class="dbx-input" bind:value={ssid} oninput={clear} maxlength="32" /></label>
      <label>{t("加密方式", "Encryption")}<Select bind:value={encryption} ariaLabel={t("加密方式", "Encryption")} onchange={clear} options={[{value:"WPA",label:"WPA / WPA2"},{value:"WEP",label:"WEP"},{value:"nopass",label:t("开放网络", "Open network")}]} /></label>
      {#if encryption !== "nopass"}<label>{t("密码", "Password")}<input type="password" class="dbx-input" bind:value={password} oninput={clear} autocomplete="new-password" maxlength="256" /></label>{/if}
      <label class="wifi-check-row"><input type="checkbox" bind:checked={hidden} onchange={clear} /><span>{t("隐藏网络", "Hidden network")}</span></label>
      <div class="wifi-divider"></div>
      <div class="wifi-card-heading compact"><div><h4>{t("外观", "Appearance")}</h4><p>{t("调整尺寸和颜色。", "Tune the size and colors.")}</p></div><span class="step-badge">02</span></div>
      <div class="wifi-inline-fields">
        <label>{t("尺寸", "Size")}<input class="dbx-input" type="number" min="128" max="1600" bind:value={size} onchange={clear} /></label>
        <label>{t("前景色", "Foreground")}<ColorPicker bind:value={dark} oninput={clear} {locale} /></label>
        <label>{t("背景色", "Background")}<ColorPicker bind:value={light} oninput={clear} {locale} /></label>
      </div>
      <button class="dbx-btn dbx-btn--primary wifi-generate" onclick={generate} disabled={busy}>{t("生成二维码", "Generate QR code")}</button>
      {#if error}<p role="alert">{error}</p>{/if}
    </section>
    <section class="wifi-card wifi-preview-card" aria-label={t("二维码预览", "QR code preview")}>
      <div class="wifi-card-heading"><div><h4>{t("二维码预览", "QR preview")}</h4><p>{preview ? t("扫码即可连接此网络。", "Scan to connect to this network.") : t("生成后将在此处显示。", "Your code will appear here after generating.")}</p></div><span class="step-badge">03</span></div>
      {#if preview}<div class="wifi-preview-wrap"><img src={preview} alt={t("Wi-Fi 连接二维码", "Wi-Fi connection QR code")} width="300" /></div><div class="expansion-actions"><button class="dbx-btn" onclick={() => save("png")}>{t("导出 PNG", "Export PNG")}</button><button class="dbx-btn" onclick={() => save("svg")}>{t("导出 SVG", "Export SVG")}</button></div>{:else}<div class="wifi-empty"><div class="wifi-empty-icon">⌁</div><strong>{t("等待生成", "Ready when you are")}</strong><span>{t("设置完成后点击“生成二维码”", "Click “Generate QR code” when ready")}</span></div>{/if}
    </section>
  </div>
</div><style>
  .wifi-page{max-width:1120px;padding:20px 24px 40px;gap:20px}.wifi-card-heading p{margin:6px 0 0;color:var(--color-muted-foreground);font-size:12px}.wifi-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:16px}.wifi-card{min-width:0;padding:20px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-card);box-shadow:0 5px 18px rgb(0 0 0 / .04)}.wifi-form-card{display:flex;flex-direction:column;gap:14px}.wifi-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:3px}.wifi-card-heading h4{margin:0;font-size:14px;font-weight:650}.step-badge{display:inline-flex;align-items:center;justify-content:center;width:27px;height:22px;border-radius:6px;background:var(--color-muted);color:var(--color-muted-foreground);font-size:10px;font-weight:700}.wifi-page>.wifi-layout label{display:flex;flex-direction:column;gap:7px;min-width:0;color:var(--color-foreground);font-size:12px;font-weight:550}.wifi-page .dbx-input{height:36px}.wifi-check-row{flex-direction:row!important;align-items:center;gap:9px!important;padding:2px 0;color:var(--color-muted-foreground)!important;font-weight:450!important}.wifi-divider{height:1px;background:var(--color-border);margin:2px 0}.wifi-inline-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}.wifi-inline-fields label:last-child{grid-column:1/-1}.wifi-inline-fields :global(.dbx-color-trigger){width:100%;height:36px}.wifi-generate{width:100%;height:38px;margin-top:4px;border-radius:7px;font-weight:650}.wifi-preview-card{display:flex;flex-direction:column;min-height:440px}.wifi-preview-wrap{display:grid;place-items:center;flex:1;min-height:290px;margin:20px 0 16px;padding:22px;border:1px dashed var(--color-border);border-radius:10px;background:var(--color-background)}.wifi-preview-wrap img{display:block;width:min(100%,300px);height:auto;image-rendering:pixelated}.wifi-empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:290px;margin-top:20px;color:var(--color-muted-foreground);text-align:center}.wifi-empty-icon{display:grid;place-items:center;width:54px;height:54px;margin-bottom:8px;border:1px solid var(--color-border);border-radius:14px;color:var(--color-primary);font-size:28px;transform:rotate(45deg)}.wifi-empty strong{color:var(--color-foreground);font-size:13px}.wifi-empty span{font-size:11px}.wifi-preview-card .expansion-actions{justify-content:center}.wifi-page [role=alert]{margin:0}@media(max-width:720px){.wifi-page{padding:20px 14px 28px}.wifi-layout{grid-template-columns:1fr}.wifi-preview-card{min-height:360px}}@media(max-width:420px){.wifi-inline-fields{grid-template-columns:1fr}.wifi-inline-fields label:last-child{grid-column:auto}}
</style>
