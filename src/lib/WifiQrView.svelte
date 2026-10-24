<script>
  import QRCode from "qrcode";
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { wifiPayload } from "./developerExpansion.js";
  import { saveBlobThroughHost } from "./fileSave.js";
  let { locale = "zh-CN" } = $props();
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

<div class="expansion-page">
  <label
    >{t("网络名称", "Network name")}<input
      class="dbx-input"
      bind:value={ssid}
      oninput={clear}
      maxlength="32"
    /></label
  >
  <label
    >{t("加密方式", "Encryption")}<select
      class="dbx-input"
      bind:value={encryption}
      onchange={clear}
      ><option value="WPA">WPA / WPA2</option><option value="WEP">WEP</option
      ><option value="nopass">{t("开放网络", "Open network")}</option></select
    ></label
  >
  {#if encryption !== "nopass"}<label
      >{t("密码", "Password")}<input
        type="password"
        class="dbx-input"
        bind:value={password}
        oninput={clear}
        autocomplete="new-password"
        maxlength="256"
      /></label
    >{/if}
  <label
    ><input type="checkbox" bind:checked={hidden} onchange={clear} />{t(
      "隐藏网络",
      "Hidden network",
    )}</label
  >
  <label
    >{t("尺寸", "Size")}<input
      class="dbx-input"
      type="number"
      min="128"
      max="1600"
      bind:value={size}
      onchange={clear}
    /></label
  >
  <label
    >{t("前景色", "Foreground")}<input
      type="color"
      bind:value={dark}
      oninput={clear}
    /></label
  ><label
    >{t("背景色", "Background")}<input
      type="color"
      bind:value={light}
      oninput={clear}
    /></label
  >
  <button class="dbx-btn dbx-btn--primary" onclick={generate} disabled={busy}
    >{t("生成二维码", "Generate QR code")}</button
  >
  <button
    class="dbx-btn"
    disabled={busy}
    onclick={() => {
      clear();
      ssid = "DBX Guest";
      password = "public-demo";
      encryption = "WPA";
      hidden = false;
    }}>{t("示例", "Example")}</button
  >
  {#if error}<p role="alert">{error}</p>{/if}
  {#if preview}<img
      src={preview}
      alt={t("Wi-Fi 连接二维码", "Wi-Fi connection QR code")}
      width="300"
    />
    <div class="expansion-actions">
      <button class="dbx-btn" onclick={() => save("png")}
        >{t("导出 PNG", "Export PNG")}</button
      ><button class="dbx-btn" onclick={() => save("svg")}
        >{t("导出 SVG", "Export SVG")}</button
      >
    </div>{/if}
</div>
