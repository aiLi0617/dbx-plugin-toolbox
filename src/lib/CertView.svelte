<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { inspectCert } from "./tools/encode.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let pem = $state("");
  let info = $state(null);
  let error = $state("");

  const fields = $derived.by(() => {
    if (!info) return [];
    if (info.kind === "certificate") {
      return [
        { zh: "主题", en: "Subject", value: info.subject },
        { zh: "颁发者", en: "Issuer", value: info.issuer },
        { zh: "序列号", en: "Serial", value: info.serial },
        { zh: "生效", en: "Not before", value: info.notBefore },
        { zh: "过期", en: "Not after", value: info.notAfter },
        { zh: "签名算法", en: "Signature", value: info.signatureAlgorithm },
      ];
    }
    if (info.kind === "ssh") {
      return [
        { zh: "类型", en: "Type", value: info.type },
        { zh: "注释", en: "Comment", value: info.comment },
        { zh: "SHA256", en: "SHA256", value: info.fingerprintSha256 },
        { zh: "MD5", en: "MD5", value: info.fingerprintMd5 },
        { zh: "字节", en: "Bytes", value: String(info.bytes ?? "") },
      ];
    }
    return [
      { zh: "标签", en: "Tag", value: info.tag },
      { zh: "字节", en: "Bytes", value: String(info.bytes ?? "") },
    ];
  });

  $effect(() => {
    const text = pem.trim();
    if (!text) {
      info = null;
      error = "";
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await inspectCert(text);
        if (cancelled) return;
        info = result;
        error = "";
      } catch (err) {
        if (cancelled) return;
        info = null;
        error = err?.message || String(err);
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("PEM 或 OpenSSH 公钥", "PEM or OpenSSH public key")}</span>
    <textarea
      class="dbx-textarea area"
      spellcheck="false"
      placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
      bind:value={pem}
    ></textarea>
  </label>
  {#if error}
    <p class="error">{error}</p>
  {:else if fields.length}
    <div class="rows">
      {#each fields as field (field.en)}
        <div class="row">
          <span class="name">{t(field.zh, field.en)}</span>
          <input class="dbx-input mono" readonly value={field.value || ""} />
          <CopyButton {locale} text={field.value || ""} labelZh={`复制${field.zh}`} labelEn={`Copy ${field.en}`} />
        </div>
      {/each}
    </div>
  {:else}
    <p class="dbx-hint">{t("粘贴证书或 SSH 公钥后会列出字段。", "Paste a certificate or SSH public key to inspect fields.")}</p>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label,
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .label {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .area {
    min-height: 140px;
    max-height: 260px;
    font-family: var(--font-mono);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .error {
    margin: 0;
    color: var(--color-destructive, #dc2626);
  }
  .dbx-hint {
    margin: 0;
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
    }
  }
</style>
