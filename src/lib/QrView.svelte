<script>
  import CopyButton from "./CopyButton.svelte";
  import { chrome, pick } from "./i18n.js";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import {
    CODE_TYPES,
    DM_VERSIONS,
    HANXIN_ECC_LEVELS,
    HANXIN_VERSIONS,
    PDF417_ECC_LEVELS,
    QR_ECC_LEVELS,
    QR_MARGINS,
    QR_SIZES,
    QR_STYLE_PRESETS,
    QR_VERSIONS,
    clampQrSize,
    matchQrStyle,
    dataUrlToBlob,
    renderBarcode,
    renderQrSvg,
    typeLabel,
  } from "./qrRender.js";
  import { invoke } from "./host.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  let codeType = $state("qr");
  let ecc = $state("M");
  let sizePreset = $state("400");
  let customPx = $state(800);
  let version = $state("auto");
  let margin = $state("4");
  let moduleStyle = $state("square");
  let dark = $state("#111111");
  let light = $state("#ffffff");
  let logoSrc = $state("");
  let logoName = $state("");
  let beautyOpen = $state(false);
  let image = $state("");
  let meta = $state(null);
  let error = $state("");
  let notice = $state("");
  let savedPath = $state("");
  let saving = $state(false);
  let logoInput = $state(null);
  let scanText = $state("");
  let scanError = $state("");
  let scanning = $state(false);
  let scanSeq = 0;
  const MAX_SCAN_FILE_BYTES = 10 * 1024 * 1024;

  const isQr = $derived(codeType === "qr");
  const showEcc = $derived(codeType !== "datamatrix");
  const showVersion = $derived(codeType !== "pdf417");
  const eccLevels = $derived(
    codeType === "hanxin" ? HANXIN_ECC_LEVELS : codeType === "pdf417" ? PDF417_ECC_LEVELS : QR_ECC_LEVELS,
  );
  const versionOptions = $derived(
    codeType === "hanxin" ? HANXIN_VERSIONS : codeType === "datamatrix" ? DM_VERSIONS : QR_VERSIONS,
  );
  const pixelSize = $derived(sizePreset === "custom" ? clampQrSize(customPx) : clampQrSize(sizePreset));
  const stylePreset = $derived(matchQrStyle(moduleStyle, dark, light));
  const styleName = $derived(stylePreset ? t(stylePreset.zh, stylePreset.en) : t("自定义", "Custom"));
  const eccInfo = $derived(eccLevels.find((item) => item.id === ecc) || eccLevels[0]);
  const typeName = $derived(typeLabel(codeType, locale));
  const summary = $derived(
    meta
      ? showEcc
        ? t(
            `${typeName}，${codeType === "pdf417" ? `纠错 ${eccInfo.id}` : `${eccInfo.pct}%容错`}，${meta.width}×${meta.height}px`,
            `${typeName}, ${codeType === "pdf417" ? `ECC ${eccInfo.id}` : `${eccInfo.pct}% ECC`}, ${meta.width}×${meta.height}px`,
          )
        : t(`${typeName}，${meta.width}×${meta.height}px`, `${typeName}, ${meta.width}×${meta.height}px`)
      : typeName,
  );
  const versionLabel = $derived(
    isQr && meta?.version ? `v${meta.version} (${meta.modules}×${meta.modules})` : "",
  );
  const versionCapacityError = $derived(
    Boolean(error) && version !== "auto" && /容量|capacity|too small|invalid size/i.test(error),
  );

  function onTypeChange(next) {
    codeType = next;
    version = "auto";
    if (next === "qr") ecc = "M";
    else if (next === "hanxin" || next === "pdf417") ecc = "2";
  }

  $effect(() => {
    const text = input;
    const type = codeType;
    const level = ecc;
    const width = pixelSize;
    const ver = version;
    const quiet = margin;
    const style = moduleStyle;
    const fg = dark;
    const bg = light;
    const logo = logoSrc;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!text.trim()) {
        if (!cancelled) {
          image = "";
          meta = null;
          error = "";
          savedPath = "";
        }
        return;
      }
      try {
        const result = await renderBarcode(text, {
          type,
          errorCorrectionLevel: level,
          width,
          version: ver === "auto" || !versionOptions.some((item) => item.id === ver) ? undefined : ver,
          margin: Number(quiet),
          moduleStyle: style,
          dark: fg,
          light: bg,
          logoSrc: logo,
        });
        if (cancelled) return;
        image = result.dataUrl;
        meta = result;
        error = "";
        savedPath = "";
      } catch (err) {
        if (cancelled) return;
        image = "";
        meta = null;
        error = friendlyError(err);
        savedPath = "";
      }
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  function friendlyError(err) {
    const msg = err?.message || String(err);
    if (msg === "logo") return t("无法读取 Logo 图片。", "Could not read the logo image.");
    if (/failed to fetch|dynamically imported module|loading chunk|load.*module/i.test(msg)) {
      return t("无法加载该码制。", "Could not load this barcode type.");
    }
    if (/too big|too large|too long|maximum length|cannot contain|cannot be encoded|overflow|insufficient.?capacity|invalid size/i.test(msg)) {
      return version !== "auto"
        ? codeType === "datamatrix"
          ? t(`内容超出 ${version.replace("x", "×")} Data Matrix 的容量，请使用「自动」或选择更大的码版本。`, `Content exceeds the ${version} Data Matrix capacity. Use Auto or choose a larger version.`)
          : t("数据超出当前码版本容量，请改成「自动」或降低容错率。", "Data exceeds this version. Switch version to Auto or lower error correction.")
        : t("数据太长，请降低容错率或缩短内容。", "Data is too long. Lower error correction or shorten the text.");
    }
    return msg;
  }

  function flash(next) {
    notice = next;
    window.setTimeout(() => {
      if (notice === next) notice = "";
    }, 1400);
  }

  function fileName() {
    const names = { qr: "qrcode.png", hanxin: "hanxin.png", pdf417: "pdf417.png", datamatrix: "datamatrix.png" };
    const fallback = names[codeType] || "barcode.png";
    const text = input.trim();
    try {
      const host = new URL(text).hostname.replace(/[^\w.-]+/g, "");
      if (host) return `${host}.png`;
    } catch {
      /* not a URL */
    }
    return fallback;
  }

  function pngBlob() {
    return dataUrlToBlob(image);
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function payloadBase64() {
    const comma = image.indexOf(",");
    return comma >= 0 ? image.slice(comma + 1) : image;
  }

  function svgPayloadBase64(svg) {
    const bytes = new TextEncoder().encode(svg);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  }

  function renderOptions() {
    return {
      errorCorrectionLevel: ecc,
      width: pixelSize,
      version: version === "auto" || !versionOptions.some((item) => item.id === version) ? undefined : version,
      margin: Number(margin),
      moduleStyle,
      dark,
      light,
      logoSrc,
    };
  }

  function inPluginHost() {
    return Boolean(window.dbxPlugin?.invoke);
  }

  async function downloadPng() {
    if (!image || saving) return;
    const name = fileName();
    saving = true;
    try {
      if (inPluginHost()) {
        const result = await invoke(
          "toolbox/save-file",
          { fileName: name, data: payloadBase64(), title: t("保存 PNG", "Save PNG") },
          120000,
        );
        if (result?.cancelled) return;
        savedPath = result?.path || "";
        flash("downloaded");
        return;
      }
      triggerDownload(pngBlob(), name);
      savedPath = "";
      flash("downloaded");
    } catch {
      savedPath = "";
      flash("download-failed");
    } finally {
      saving = false;
    }
  }

  async function revealSaved() {
    if (!savedPath) return;
    try {
      await invoke("toolbox/reveal-file", { path: savedPath });
    } catch {
      /* folder open is best-effort */
    }
  }

  async function copyPng() {
    if (!image) return;
    try {
      if (inPluginHost()) {
        await invoke("toolbox/copy-image", { data: payloadBase64() }, 30000);
        flash("copied");
        return;
      }
      const blob = pngBlob();
      const type = blob.type || "image/png";
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("image clipboard unavailable");
      }
      await navigator.clipboard.write([new ClipboardItem({ [type]: blob })]);
      flash("copied");
    } catch {
      flash("copy-failed");
    }
  }

  function applyPreset(preset) {
    moduleStyle = preset.moduleStyle;
    dark = preset.dark;
    light = preset.light;
  }

  function cycleStyle() {
    const idx = QR_STYLE_PRESETS.findIndex((item) => item.id === stylePreset?.id);
    applyPreset(QR_STYLE_PRESETS[(idx + 1) % QR_STYLE_PRESETS.length]);
  }

  function onLogo(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      error = t("请选择图片文件。", "Choose an image file.");
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      error = t("Logo 请小于 1.5 MB。", "Keep the logo under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoSrc = String(reader.result || "");
      logoName = file.name;
    };
    reader.onerror = () => {
      error = t("无法读取 Logo 图片。", "Could not read the logo image.");
    };
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    logoSrc = "";
    logoName = "";
    if (logoInput) logoInput.value = "";
  }

  function pickLogo() {
    logoInput?.click();
  }

  function eccOptionLabel(level) {
    if (codeType === "pdf417") return t(`级别 ${level.id}`, `Level ${level.id}`);
    if (codeType === "hanxin") return `L${level.id} · ${level.pct}%`;
    return `${level.id} · ${level.pct}%`;
  }

  function versionOptionLabel(item) {
    if (codeType === "datamatrix") return `${item.modules}×${item.modules}`;
    return `${item.id} (${item.modules}×${item.modules})`;
  }

  async function decodeImageBlob(blob) {
    const seq = ++scanSeq;
    scanText = "";
    scanError = "";
    if (!blob || blob.size > MAX_SCAN_FILE_BYTES) {
      scanError = t("图片不能超过 10 MB。", "Images are limited to 10 MB.");
      scanning = false;
      return;
    }
    scanning = true;
    try {
      if (typeof BarcodeDetector !== "undefined") {
        const supported = await BarcodeDetector.getSupportedFormats();
        const wanted = ["qr_code", "data_matrix", "pdf417"].filter((format) => supported.includes(format));
        if (wanted.length) {
          const detector = new BarcodeDetector({ formats: wanted });
          const bitmap = await createImageBitmap(blob);
          try {
            const hits = await detector.detect(bitmap);
            const detected = hits.map((hit) => hit.rawValue).filter(Boolean).join("\n");
            if (detected) {
              if (seq === scanSeq) scanText = detected;
              return detected;
            }
          } finally {
            bitmap.close?.();
          }
        }
      }
      const decoded = await decodeWithZxing(blob);
      if (seq === scanSeq) scanText = decoded;
      return decoded;
    } catch (err) {
      if (seq !== scanSeq) return;
      const message = err?.message || String(err);
      scanError = /notfound|no multiformat readers|no barcode/i.test(message)
        ? t("图片中未识别到 QR、Data Matrix 或 PDF417。汉信码暂不支持图片识别；请使用清晰、完整且边缘留白的图片。", "No QR, Data Matrix, or PDF417 code was found. Han Xin image decoding is not yet supported; use a clear, complete image with a quiet zone.")
        : message;
    } finally {
      if (seq === scanSeq) scanning = false;
    }
  }

  async function downloadSvg() {
    if (!image || saving || !isQr) return;
    saving = true;
    try {
      const result = await renderQrSvg(input, renderOptions());
      const name = fileName().replace(/\.png$/i, ".svg");
      if (inPluginHost()) {
        const saved = await invoke("toolbox/save-file", {
          fileName: name,
          mimeType: "image/svg+xml",
          data: svgPayloadBase64(result.svg),
          title: t("保存 SVG", "Save SVG"),
        }, 120000);
        if (saved?.cancelled) return;
        savedPath = saved?.path || "";
      } else {
        triggerDownload(new Blob([result.svg], { type: "image/svg+xml;charset=utf-8" }), name);
        savedPath = "";
      }
      flash("downloaded");
    } catch {
      savedPath = "";
      flash("download-failed");
    } finally {
      saving = false;
    }
  }

  async function decodeWithZxing(blob) {
    const [{ BarcodeFormat, BrowserMultiFormatReader }, { DecodeHintType }] = await Promise.all([
      import("@zxing/browser"),
      import("@zxing/library"),
    ]);
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints);
    const url = URL.createObjectURL(blob);
    let imageElement;
    try {
      imageElement = new Image();
      imageElement.src = url;
      await imageElement.decode();
      const sourceWidth = imageElement.naturalWidth || imageElement.width;
      const sourceHeight = imageElement.naturalHeight || imageElement.height;
      if (!sourceWidth || !sourceHeight) throw new Error("invalid image dimensions");

      // A QR exported at a size that is not an exact multiple of its module grid
      // can be visually perfect but still fail ZXing's detector. Try a small set
      // of deterministic, lossless variants before reporting that no code exists.
      const variants = [];
      const addVariant = (scale, quietModules, threshold = false) => {
        const scaledWidth = Math.max(1, Math.round(sourceWidth * scale));
        const scaledHeight = Math.max(1, Math.round(sourceHeight * scale));
        const quiet = Math.max(0, Math.round(Math.min(scaledWidth, scaledHeight) * quietModules));
        const width = scaledWidth + quiet * 2;
        const height = scaledHeight + quiet * 2;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: threshold });
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(
          imageElement,
          quiet,
          quiet,
          scaledWidth,
          scaledHeight,
        );
        if (threshold) {
          const pixels = ctx.getImageData(0, 0, width, height);
          for (let index = 0; index < pixels.data.length; index += 4) {
            const luminance = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
            const value = luminance < 180 ? 0 : 255;
            pixels.data[index] = value;
            pixels.data[index + 1] = value;
            pixels.data[index + 2] = value;
            pixels.data[index + 3] = 255;
          }
          ctx.putImageData(pixels, 0, 0);
        }
        variants.push(canvas);
      };

      const maxSide = Math.max(sourceWidth, sourceHeight);
      const scales = [...new Set([
        Math.min(1, 2048 / maxSide),
        Math.min(2, 2048 / maxSide),
        Math.min(3, 2048 / maxSide),
      ].map((value) => Number(value.toFixed(4))))];
      for (const scale of scales) addVariant(scale, 0);
      const strongestScale = scales[scales.length - 1];
      addVariant(strongestScale, 0.03);
      addVariant(strongestScale, 0.03, true);

      let lastError;
      for (const canvas of variants) {
        try {
          const result = reader.decodeFromCanvas(canvas);
          if (result?.getText()) return result.getText();
        } catch (err) {
          lastError = err;
        }
      }
      throw lastError || new Error("No barcode found");
    } finally {
      if (imageElement) imageElement.src = "";
      URL.revokeObjectURL(url);
    }
  }

  async function decodeImageFiles(files) {
    const values = [];
    for (const file of files) {
      const value = await decodeImageBlob(file);
      if (value) values.push(value.trim());
    }
    const unique = [...new Set(values.filter(Boolean))];
    if (unique.length > 1) scanText = unique.join("\n");
    if (unique.length) scanError = "";
  }

  function onScanFile(event) {
    const files = [...(event.currentTarget.files || [])];
    if (files.length) void decodeImageFiles(files);
    event.currentTarget.value = "";
  }

  function onScanPaste(event) {
    const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
    if (file) {
      event.preventDefault();
      decodeImageBlob(file);
    }
  }
</script>

<div class="qr-workbench">
  <section class="dbx-card input-card">
    <label class="block">
      <span class="label">{t("内容", "Content")}</span>
      <textarea
        class="dbx-textarea content"
        spellcheck="false"
        bind:value={input}
        placeholder={t("文本或链接", "Text or URL")}
      ></textarea>
    </label>

    <div class="opts">
      <span class="opt-label">{t("码制", "Type")}</span>
      <Select
        value={codeType}
        options={CODE_TYPES.map((item) => ({ value: item.id, label: t(item.zh, item.en) }))}
        onchange={onTypeChange}
      />

      {#if showEcc}
        <span class="opt-label">{t("容错率", "ECC")}</span>
        <Select
          bind:value={ecc}
          options={eccLevels.map((level) => ({ value: level.id, label: eccOptionLabel(level) }))}
        />
      {/if}

      <span class="opt-label">{t("尺寸", "Size")}</span>
      <div class="size-cell">
        <Select
          bind:value={sizePreset}
          options={[
            ...QR_SIZES.map((px) => ({ value: String(px), label: `${px}×${px}px` })),
            { value: "custom", label: t("自定义尺寸", "Custom size") },
          ]}
        />
        {#if sizePreset === "custom"}
          <div class="custom-size">
            <NumberInput min="128" max="2048" step="1" bind:value={customPx} />
            <span class="px">px</span>
          </div>
        {/if}
      </div>

      {#if showVersion}
        <span class="opt-label">{t("码版本", "Version")}</span>
        <Select
          bind:value={version}
          options={[
            { value: "auto", label: t("自动", "Auto") },
            ...versionOptions.map((item) => ({ value: item.id, label: versionOptionLabel(item) })),
          ]}
        />
      {/if}

      <span class="opt-label">{t("码边距", "Quiet zone")}</span>
      <Select
        bind:value={margin}
        options={QR_MARGINS.map((n) => ({ value: String(n), label: t(`${n}个色块`, `${n} modules`) }))}
      />
    </div>

    <div class="pair">
      <button class="dbx-btn" onclick={pickLogo} type="button">{logoSrc ? t("更换 Logo", "Change logo") : t("上传 Logo", "Upload logo")}</button>
      <button class="dbx-btn" class:active={beautyOpen} aria-pressed={beautyOpen} onclick={() => (beautyOpen = !beautyOpen)} type="button">{t("二维码美化", "Style")}</button>
    </div>
    <input bind:this={logoInput} class="file" type="file" accept="image/*" onchange={onLogo} />

    {#if logoSrc}
      <div class="logo-chip">
        <img alt="" src={logoSrc} />
        <span title={logoName}>{logoName || t("Logo", "Logo")}</span>
        <button class="dbx-btn dbx-btn--ghost" onclick={clearLogo} type="button">{t("移除", "Remove")}</button>
      </div>
      {#if isQr && ecc !== "H"}
        <p class="dbx-hint">{t("带 Logo 时建议把容错率调到 30%。", "With a logo, 30% error correction scans more reliably.")}</p>
      {/if}
    {/if}

    {#if beautyOpen}
      <div class="beauty" class:colors-only={!isQr}>
        {#if isQr}
          <label class="field">
            <span class="label">{t("模块", "Modules")}</span>
            <Select
              bind:value={moduleStyle}
              options={[
                { value: "square", label: t("方形", "Square") },
                { value: "rounded", label: t("圆角", "Rounded") },
                { value: "dots", label: t("圆点", "Dots") },
              ]}
            />
          </label>
        {/if}
        <label class="field">
          <span class="label">{t("前景色", "Foreground")}</span>
          <input class="color" type="color" bind:value={dark} />
        </label>
        <label class="field">
          <span class="label">{t("背景色", "Background")}</span>
          <input class="color" type="color" bind:value={light} />
        </label>
      </div>
    {/if}

    <div class="scan" onpaste={onScanPaste} role="group" aria-label={t("图片识码", "Decode image") }>
      <div class="scan-head">
        <strong>{t("图片识码", "Decode image")}</strong>
        <label class="dbx-btn file-button">
          {scanning ? t("识别中…", "Detecting…") : t("选择或粘贴图片（可多选）", "Choose or paste images")}
          <input type="file" accept="image/*" multiple onchange={onScanFile} disabled={scanning} />
        </label>
      </div>
      {#if scanText}
        <div class="scan-result">
          <textarea class="dbx-textarea" readonly value={scanText}></textarea>
          <div class="scan-actions">
            <button class="dbx-btn" type="button" onclick={() => (input = scanText)}>{t("作为生成内容", "Use as content")}</button>
            <CopyButton {locale} text={scanText} labelZh="复制识别结果" labelEn="Copy decoded value" />
          </div>
        </div>
      {:else if scanError}
        <p class="dbx-hint fail">{scanError}</p>
      {:else}
        <p class="dbx-hint">{t("离线识别 QR、Data Matrix 与 PDF417，不上传图片；暂不支持汉信码识别。", "Decodes QR, Data Matrix, and PDF417 locally without uploading the image. Han Xin image decoding is not yet supported.")}</p>
      {/if}
    </div>
  </section>

  <section class="dbx-card qr-card">
    <div class="preview-head">
      <p class="style-line">
        {t("标签样式", "Style")}<span>：</span><strong>{styleName}</strong>
      </p>
      <button class="dbx-btn dbx-btn--ghost switch" onclick={cycleStyle} type="button">{t("切换", "Switch")}</button>
    </div>

    {#if error}
      <p class="dbx-hint fail">{error}</p>
      {#if versionCapacityError}
        <button class="dbx-btn dbx-btn--primary" type="button" onclick={() => (version = "auto")}>
          {t("改用自动尺寸", "Use automatic size")}
        </button>
      {/if}
    {:else if image}
      <div class="frame" style:background={light}>
        <img alt={typeName} src={image} />
      </div>
      <p class="meta">{summary}{#if versionLabel}<span> · {versionLabel}</span>{/if}</p>
      <div class="actions">
        <button class="dbx-btn dbx-btn--primary" onclick={downloadPng} type="button" disabled={saving}>
          {notice === "downloaded"
            ? savedPath
              ? t("已保存", "Saved")
              : t("已下载", "Downloaded")
            : t("下载 PNG", "Download PNG")}
        </button>
        {#if isQr}<button class="dbx-btn" onclick={downloadSvg} type="button" disabled={saving}>{t("下载 SVG", "Download SVG")}</button>{/if}
        <button
          class="dbx-btn dbx-btn--ghost copy-image-btn"
          onclick={copyPng}
          type="button"
          title={notice === "copied" ? t(chrome.copied.zh, chrome.copied.en) : t("复制图片", "Copy image")}
          aria-label={notice === "copied" ? t(chrome.copied.zh, chrome.copied.en) : t("复制图片", "Copy image")}
        >
          {#if notice === "copied"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
            </svg>
          {/if}
        </button>
      </div>
      {#if savedPath}
        <p class="dbx-hint saved-path">
          {t("已保存到", "Saved to")}
          <button class="path" onclick={revealSaved} type="button" title={t("打开所在文件夹", "Show in folder")}>
            {savedPath}
          </button>
        </p>
      {:else if notice === "copy-failed"}
        <p class="dbx-hint">{t("当前环境无法复制图片，请下载。", "This host cannot copy images. Download instead.")}</p>
      {:else if notice === "download-failed"}
        <p class="dbx-hint">{t("无法保存文件，请尝试复制图片。", "Could not save the file. Try copying the image.")}</p>
      {/if}
    {:else}
      <div class="frame empty" aria-hidden="true"></div>
      <p class="dbx-hint empty-hint">{t("输入文本后生成条码。", "Type text to generate a barcode.")}</p>
    {/if}
  </section>
</div>

<style>
  .qr-workbench {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(260px, 300px);
    gap: 12px;
    align-items: start;
    min-width: 0;
    max-width: 960px;
  }
  .input-card,
  .qr-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .block,
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label,
  .opt-label,
  .meta,
  .style-line {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .content {
    min-height: 88px;
    max-height: 200px;
    resize: vertical;
  }
  .opts {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr);
    gap: 8px 10px;
    align-items: center;
  }
  .opts :global(.dbx-select) {
    width: 100%;
    min-width: 0;
  }
  .opt-label {
    font-weight: 400;
  }
  .size-cell {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .custom-size {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .custom-size :global(.dbx-number) {
    flex: 1;
    min-width: 0;
  }
  .custom-size .px {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .pair .active {
    border-color: var(--dbx-selection-border);
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
  }
  .file {
    display: none;
  }
  .file-button { position: relative; overflow: hidden; cursor: pointer; }
  .file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .scan { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; border-top: 1px solid var(--color-border); }
  .scan-head, .scan-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .scan-head strong { font-size: 12px; }
  .scan-result { display: flex; flex-direction: column; gap: 8px; }
  .scan-result textarea { min-height: 64px; resize: vertical; }
  .logo-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .logo-chip img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    border-radius: 4px;
    background: #fff;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
  }
  .logo-chip span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .beauty {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px 12px;
    align-items: end;
  }
  .beauty :global(.dbx-select) {
    width: 100%;
    min-width: 0;
  }
  .beauty.colors-only {
    grid-template-columns: auto auto;
    justify-content: start;
  }
  .color {
    width: 42px;
    height: 30px;
    padding: 2px;
    border-radius: var(--radius-md, 8px);
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    background: var(--color-background, Canvas);
  }
  .preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .style-line {
    margin: 0;
    min-width: 0;
  }
  .style-line strong {
    color: var(--color-foreground, CanvasText);
    font-weight: 600;
  }
  .switch {
    height: 26px;
    padding: 0 8px;
    color: var(--color-primary);
  }
  .frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 228px;
    height: 228px;
    margin: 0 auto;
    padding: 12px;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 0 0 1px var(--color-border, color-mix(in srgb, CanvasText 12%, transparent));
  }
  .frame.empty {
    background: color-mix(in srgb, CanvasText 4%, var(--color-card, Canvas));
    border: 1px dashed var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    box-shadow: none;
  }
  .frame img {
    max-width: 204px;
    max-height: 204px;
    width: auto;
    height: auto;
    display: block;
    object-fit: contain;
  }
  .meta {
    margin: 0;
    text-align: center;
    font-weight: 400;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }
  .copy-image-btn {
    width: 30px;
    padding: 0;
  }
  .fail {
    margin: 0;
    color: var(--color-destructive);
  }
  .dbx-hint {
    margin: 0;
  }
  .saved-path {
    display: grid;
    gap: 4px;
    text-align: left;
    word-break: break-all;
  }
  .saved-path .path {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .empty-hint {
    text-align: center;
  }

  @media (max-width: 760px) {
    .qr-workbench {
      grid-template-columns: 1fr;
    }
  }
</style>
