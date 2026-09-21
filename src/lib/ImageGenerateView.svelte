<script>
  import { onDestroy } from "svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
  import { invoke } from "./host.js";
  import {
    buildFileName,
    generateSizedImage,
    humanFileSize,
    listAvailableFormats,
    MAX_CUSTOM_TEXT,
    MAX_TARGET_BYTES,
    MIN_TARGET_BYTES,
    OUTPUT_FORMATS,
    parseTargetBytes,
    resolveOutputFormat,
    sanitizeFileBase,
    SIZE_UNITS,
  } from "./imageGenerate.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let formatOptions = $state(OUTPUT_FORMATS.filter((item) => !item.optional).map((item) => ({ value: item.mime, label: item.label })));
  const unitOptions = SIZE_UNITS.map((value) => ({ value, label: value }));

  $effect(() => {
    listAvailableFormats().then((formats) => {
      formatOptions = formats.map((item) => ({ value: item.mime, label: item.label }));
    });
  });

  let width = $state(800);
  let height = $state(600);
  let sizeValue = $state(100);
  let sizeUnit = $state("KB");
  let format = $state("image/png");
  let background = $state("#d7e4f2");
  let foreground = $state("#1e293b");
  let transparent = $state(false);
  let showText = $state(true);
  let showBorder = $state(false);
  let customText = $state("");
  let fileBase = $state("placeholder");
  let resultUrl = $state("");
  let resultBlob = $state(null);
  let resultMeta = $state(null);
  let error = $state("");
  let notice = $state("");
  let generating = $state(false);
  let saving = $state(false);
  let savedNotes = $state([]);

  const formatMeta = $derived(resolveOutputFormat(format));
  const alphaSupported = $derived(formatMeta.supportsAlpha);
  const effectiveFileName = $derived(
    buildFileName(fileBase, resultMeta?.extension || formatMeta.extension, {
      width: resultMeta?.width || width,
      height: resultMeta?.height || height,
    }),
  );

  onDestroy(() => {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
  });

  function localizeError(cause) {
    const message = String(cause?.message || cause || "");
    if (/at least/.test(message)) return t(`目标大小至少 ${MIN_TARGET_BYTES} 字节`, `Target size must be at least ${MIN_TARGET_BYTES} bytes`);
    if (/Encoded image exceeds the 50 MB limit/.test(message)) {
      return t("压缩后超过 50 MB 上限，请减小宽高", "Encoded image exceeds the 50 MB limit; reduce dimensions");
    }
    if (/50 MB/.test(message)) return t("目标大小上限 50 MB", "Target size is limited to 50 MB");
    const mp = message.match(/got (\d+)×(\d+) = ([\d.]+) MP/);
    if (/40 megapixels/.test(message)) {
      return mp
        ? t(
          `像素过多：${mp[1]}×${mp[2]} ≈ ${mp[3]} MP，上限 4000 万像素（约 6324×6324）`,
          `Too many pixels: ${mp[1]}×${mp[2]} ≈ ${mp[3]} MP; limit is 40 megapixels (about 6324×6324)`,
        )
        : t("输出图片上限 4000 万像素（宽×高）", "Output image is limited to 40 megapixels (width × height)");
    }
    if (/12,000|12000/.test(message)) return t("单边最长 12,000 像素", "Each side is limited to 12,000 px");
    if (/Custom text is too long/.test(message)) {
      return t(`自定义文案最多 ${MAX_CUSTOM_TEXT} 个字符`, `Custom text is limited to ${MAX_CUSTOM_TEXT} characters`);
    }
    if (/exact target|too small for/.test(message)) {
      return t("无法精确命中目标大小，请略微调整目标体积", "Could not hit the exact target size; try a slightly different target");
    }
    return message || t("生成失败", "Generation failed");
  }

  function sizeAdjustNotice(result) {
    const notes = [];
    if (result?.dimensionAdjusted) {
      notes.push(t(
        `尺寸已限制为 ${result.width}×${result.height}（原 ${result.requestedWidth}×${result.requestedHeight}）`,
        `Dimensions limited to ${result.width}×${result.height} (was ${result.requestedWidth}×${result.requestedHeight})`,
      ));
    }
    if (result?.sizeAdjusted) {
      notes.push(t(
        `已生成 ${humanFileSize(result.size)}。目标 ${humanFileSize(result.requestedSize)} 小于当前宽高可压到的最小体积，已按最小值输出`,
        `Generated ${humanFileSize(result.size)}. Target ${humanFileSize(result.requestedSize)} is below the minimum for these dimensions, so the smallest possible size was used`,
      ));
    }
    return notes.join(" · ");
  }

  function sharedOptions(targetBytes) {
    return {
      width,
      height,
      targetBytes,
      background,
      foreground,
      transparent: transparent && alphaSupported,
      showText,
      showBorder,
      customText,
      fileBase,
    };
  }

  function applyResult(result) {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultBlob = result.blob;
    resultUrl = URL.createObjectURL(result.previewBlob || result.blob);
    resultMeta = result;
    width = result.width;
    height = result.height;
    format = result.mime;
    if (!fileBase.trim()) fileBase = result.fileBase;
    notice = sizeAdjustNotice(result);
  }

  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = "";
    resultBlob = null;
    resultMeta = null;
    notice = "";
  }

  async function generate() {
    if (generating) return;
    generating = true;
    error = "";
    notice = "";
    savedNotes = [];
    try {
      const result = await generateSizedImage({
        ...sharedOptions(parseTargetBytes(sizeValue, sizeUnit)),
        mime: format,
      });
      applyResult(result);
    } catch (cause) {
      error = localizeError(cause);
      clearResult();
    } finally {
      generating = false;
    }
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function blobBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function saveOne(result, title) {
    const name = buildFileName(fileBase || result.fileBase, result.extension, {
      width: result.width,
      height: result.height,
    });
    if (window.dbxPlugin?.invoke) {
      const saved = await invoke(
        "toolbox/save-file",
        {
          fileName: name,
          mimeType: result.mime,
          extension: result.extension,
          data: await blobBase64(result.blob),
          title: title || t("保存图片", "Save image"),
          binary: true,
        },
        120000,
      );
      if (saved?.cancelled) return null;
      return saved?.path ? `${name} → ${saved.path}` : name;
    }
    triggerDownload(result.blob, name);
    return name;
  }

  async function downloadResult() {
    if (!resultBlob || !resultMeta || saving || generating) return;
    saving = true;
    error = "";
    try {
      const note = await saveOne(resultMeta);
      savedNotes = note ? [note] : [];
    } catch (cause) {
      error = String(cause.message || cause);
    } finally {
      saving = false;
    }
  }

  function onFileBaseInput(event) {
    fileBase = event.currentTarget.value;
  }

  function commitFileBase() {
    fileBase = sanitizeFileBase(fileBase, `placeholder-${width}x${height}`);
  }

  const targetHint = $derived.by(() => {
    try {
      return humanFileSize(parseTargetBytes(sizeValue, sizeUnit));
    } catch {
      return "";
    }
  });
  const sizeMax = $derived(sizeUnit === "B" ? MAX_TARGET_BYTES : sizeUnit === "MB" ? 50 : 51200);
  const sizeMin = $derived(sizeUnit === "B" ? MIN_TARGET_BYTES : 1);
</script>

<div class="page">
  <aside class="panel">
    <div class="panel-scroll">
      <section class="block">
        <strong class="block-title">{t("尺寸与输出", "Size & output")}</strong>
        <div class="opts">
          <label class="field">
            <span>{t("宽度", "Width")}</span>
            <NumberInput {locale} class="size" min="1" max="12000" ariaLabel={t("宽度", "Width")} bind:value={width} />
          </label>
          <label class="field">
            <span>{t("高度", "Height")}</span>
            <NumberInput {locale} class="size" min="1" max="12000" ariaLabel={t("高度", "Height")} bind:value={height} />
          </label>
          <label class="field target">
            <span>{t("目标大小", "Target size")}</span>
            <div class="target-row">
              <NumberInput {locale} class="size" min={sizeMin} max={sizeMax} ariaLabel={t("目标大小", "Target size")} bind:value={sizeValue} />
              <Select bind:value={sizeUnit} options={unitOptions} />
            </div>
          </label>
          <label class="field">
            <span>{t("格式", "Format")}</span>
            <Select bind:value={format} options={formatOptions} />
          </label>
        </div>
      </section>

      <section class="block">
        <strong class="block-title">{t("外观", "Appearance")}</strong>
        <div class="opts">
          <label class="field">
            <span>{t("背景色", "Background")}</span>
            <input class="color-input" type="color" bind:value={background} disabled={transparent && alphaSupported} aria-label={t("背景色", "Background")} />
          </label>
          <label class="field">
            <span>{t("文字色", "Text color")}</span>
            <input class="color-input" type="color" bind:value={foreground} aria-label={t("文字色", "Text color")} />
          </label>
        </div>
        <div class="checks">
          <label class="check" class:disabled={!alphaSupported} title={!alphaSupported ? t("JPEG 不支持透明背景", "JPEG does not support transparency") : ""}>
            <input type="checkbox" bind:checked={transparent} disabled={!alphaSupported} />
            <span>{t("透明背景", "Transparent")}</span>
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={showText} />
            <span>{t("显示文字", "Text")}</span>
          </label>
          <label class="check">
            <input type="checkbox" bind:checked={showBorder} />
            <span>{t("显示边框", "Border")}</span>
          </label>
        </div>
        {#if !alphaSupported && transparent}
          <p class="note">{t("JPEG 将铺背景色，无法透明", "JPEG uses the background color; no transparency")}</p>
        {/if}
      </section>

      <section class="block">
        <strong class="block-title">{t("文案与文件", "Text & file")}</strong>
        <label class="field stretch">
          <span>{t("自定义文案", "Custom text")}</span>
          <input
            class="dbx-input"
            type="text"
            maxlength={MAX_CUSTOM_TEXT}
            disabled={!showText}
            bind:value={customText}
            placeholder={t("留空则显示尺寸与体积", "Leave blank to show dimensions and size")}
          />
        </label>
        <label class="field stretch">
          <span>{t("文件名", "File name")}</span>
          <input
            class="dbx-input"
            type="text"
            value={fileBase}
            oninput={onFileBaseInput}
            onblur={commitFileBase}
            placeholder="placeholder"
            aria-label={t("自定义文件名（不含扩展名）", "Custom file name without extension")}
          />
        </label>
      </section>

      <p class="hint">
        {t(
          "支持 PNG / JPEG / GIF / WebP / BMP / SVG / ICO / TIFF，环境支持时还有 AVIF。",
          "PNG, JPEG, GIF, WebP, BMP, SVG, ICO, TIFF, and AVIF when supported.",
        )}
        {#if targetHint}<span> · {t("目标", "Target")} {targetHint}</span>{/if}
      </p>
    </div>

    <div class="panel-footer">
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
      <div class="actions">
        <button class="dbx-btn dbx-btn--primary" type="button" onclick={generate} disabled={generating || saving}>
          {generating && !saving ? t("生成中…", "Generating…") : t("生成", "Generate")}
        </button>
        <button class="dbx-btn" type="button" onclick={downloadResult} disabled={!resultBlob || generating || saving}>
          {saving ? t("保存中…", "Saving…") : t("下载当前", "Download")}
        </button>
      </div>
    </div>
  </aside>

  <section class="preview-card">
    <div class="preview-head">
      <strong>{t("预览", "Preview")}</strong>
      {#if resultMeta}
        <div class="meta-line" title={`${resultMeta.mime} · ${effectiveFileName}`}>
          <span>{resultMeta.label}</span>
          <span>{resultMeta.width}×{resultMeta.height}</span>
          <span>{humanFileSize(resultMeta.size)}</span>
          <span class="mono">{resultMeta.mime}</span>
          <span class="mono name">{effectiveFileName}</span>
        </div>
      {/if}
    </div>

    <div class="stage checker">
      {#if resultUrl}
        <img src={resultUrl} alt={t("生成的图片预览", "Generated image preview")} />
      {:else}
        <span>{t("填写参数后点击生成", "Configure options, then generate")}</span>
      {/if}
    </div>

    {#if savedNotes.length}
      <ul class="saved">
        {#each savedNotes as note}
          <li>{t("已保存：", "Saved: ")}{note}</li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .page {
    display: grid;
    flex: 1;
    min-height: 0;
    grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
    gap: 14px;
  }
  .panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-card);
    overflow: hidden;
  }
  .panel-scroll {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    overflow: auto;
  }
  .panel-footer {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-muted) 35%, var(--color-card));
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .block-title {
    color: var(--color-foreground);
    font-size: 12px;
  }
  .opts, .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
  }
  .actions {
    gap: 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  .field.stretch { width: 100%; }
  .checks {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    min-height: 30px;
  }
  .field :global(.dbx-number.size) { width: 5.75rem; }
  .field :global(.dbx-custom-select) { width: auto; min-width: 96px; }
  .target-row { display: flex; gap: 6px; align-items: center; }
  .target-row :global(.dbx-custom-select) { min-width: 72px; }
  .color-input {
    width: 3.25rem;
    min-height: 30px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-background);
    padding: 2px;
  }
  .color-input:disabled { opacity: 0.45; }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground);
    cursor: pointer;
    white-space: nowrap;
  }
  .check.disabled { opacity: 0.55; cursor: not-allowed; }
  .check input { margin: 0; }
  .note, .hint, .error, .notice {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
  }
  .note, .hint { color: var(--color-muted-foreground); }
  .error {
    padding: 7px 10px;
    border-radius: 6px;
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 9%, transparent);
  }
  .notice {
    padding: 7px 10px;
    border-radius: 6px;
    color: var(--color-foreground);
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-muted));
  }
  .preview-card {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 8px;
  }
  .preview-head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .preview-head strong {
    flex-shrink: 0;
    color: var(--color-foreground);
    font-size: 13px;
  }
  .meta-line {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px 10px;
    min-width: 0;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  .meta-line span {
    max-width: 28ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-line .name { max-width: 36ch; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .stage {
    display: grid;
    flex: 1;
    min-height: 0;
    place-items: center;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 12px;
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .checker {
    background-color: var(--color-background);
    background-image:
      linear-gradient(45deg, var(--color-muted) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-muted) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-muted) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-muted) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0;
  }
  .stage img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .saved {
    flex-shrink: 0;
    margin: 0;
    padding-left: 1.1rem;
    color: var(--color-muted-foreground);
    font-size: 11px;
    line-height: 1.5;
  }
  .saved li { overflow-wrap: anywhere; }

  @media (max-width: 900px) {
    .page {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(280px, 1fr);
      overflow: auto;
    }
    .panel { overflow: visible; }
    .panel-scroll { overflow: visible; }
  }
</style>
