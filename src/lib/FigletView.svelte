<script>
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let font = $state("Standard");
  let width = $state(80);
  let align = $state("left");
  let output = $state("");
  let error = $state("");
  let busy = $state(false);
  let appliedDemoRequest = 0;
  const lines = $derived(output ? output.split("\n") : []);
  const columns = $derived(lines.reduce((max, line) => Math.max(max, line.length), 0));

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = "DBX";
    font = "Standard";
    width = 80;
    align = "left";
  });

  $effect(() => {
    const text = input, selectedFont = font, selectedWidth = width, selectedAlign = align;
    // Each edit invalidates pending work, including a still-loading asset module.
    let cancelled = false;
    output = "";
    error = "";
    busy = Boolean(text.trim());
    const timer = setTimeout(async () => {
      if (!text.trim()) return;
      try {
        const lib = await loadAssetModule("content-tools");
        if (cancelled) return;
        output = lib.banner(text, selectedFont, selectedWidth, selectedAlign);
      } catch (e) {
        if (!cancelled) error = localizeError(locale, e);
      } finally {
        if (!cancelled) busy = false;
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  });
</script>

<div class="figlet-page">
  <header class="page-heading">
    <div><h1>{t("Figlet 字符横幅", "Figlet banner")}</h1><p>{t("将文字转换为 ASCII 艺术字，适用于终端、注释与 README。", "Turn text into ASCII art for terminals, comments and README files.")}</p></div>
    <span class="format-tag">ASCII ART</span>
  </header>

  <div class="workspace">
    <section class="panel settings-panel" aria-labelledby="figlet-input-heading">
      <header class="panel-heading"><h2 id="figlet-input-heading">{t("输入文字", "Input text")}</h2><span class="counter">{input.length} / 200</span></header>
      <div class="settings-body">
        <textarea class="dbx-textarea text-input" bind:value={input} maxlength="200" rows="4" spellcheck="false" placeholder="HELLO WORLD" aria-labelledby="figlet-input-heading" aria-describedby="figlet-input-help"></textarea>
        <p class="hint" id="figlet-input-help">{t("支持英文字母、数字、半角符号与换行，最多 200 个字符。", "Use letters, numbers, ASCII symbols and line breaks, up to 200 characters.")}</p>

        <div class="field"><span id="figlet-font-label">{t("字体", "Font")}</span><Select bind:value={font} ariaLabel={t("字体", "Font")} options={[{ value: "Standard", label: t("Standard · 经典", "Standard · Classic") }, { value: "Slant", label: t("Slant · 斜体", "Slant · Slanted") }, { value: "Small", label: t("Small · 紧凑", "Small · Compact") }]} /></div>
        <label class="field"><span>{t("横幅宽度", "Banner width")}<small>20–200</small></span><input class="dbx-input" type="number" min="20" max="200" step="1" bind:value={width} aria-describedby="figlet-width-help" /></label>
        <p class="hint" id="figlet-width-help">{t("以字符列计，较长文字将按宽度换行。", "Measured in character columns. Longer text wraps to fit.")}</p>
        <div class="field"><span id="figlet-alignment-label">{t("对齐方式", "Alignment")}</span><div class="alignment" role="group" aria-labelledby="figlet-alignment-label">
          {#each [{ value: "left", label: t("左对齐", "Left") }, { value: "center", label: t("居中", "Center") }, { value: "right", label: t("右对齐", "Right") }] as option}
            <button type="button" class:active={align === option.value} aria-pressed={align === option.value} onclick={() => (align = option.value)}>{option.label}</button>
          {/each}
        </div></div>
        <div class="input-actions"><span><i></i>{t("修改后自动生成", "Updates automatically")}</span><button class="dbx-btn dbx-btn--ghost" type="button" disabled={!input} onclick={() => (input = "")}>{t("清空", "Clear")}</button></div>
      </div>
    </section>

    <section class="panel preview-panel" aria-labelledby="figlet-preview-heading" aria-busy={busy}>
      <header class="panel-heading"><div class="preview-title"><h2 id="figlet-preview-heading">{t("横幅预览", "Banner preview")}</h2><span class="font-tag">{font}</span></div><div class="copy-action"><span>{t("复制", "Copy")}</span><CopyButton {locale} text={output} /></div></header>
      {#if output}
        <textarea class="banner-output" value={output} readonly wrap="off" spellcheck="false" aria-labelledby="figlet-preview-heading"></textarea>
      {:else}
        <div class="empty-preview">
          <span class="empty-symbol" aria-hidden="true">Aa</span>
          <strong>{busy ? t("正在生成…", "Generating…") : error ? t("请调整输入或参数", "Check your text or settings") : t("让文字更有表现力", "Give your text character")}</strong>
          <p>{t("在左侧输入文字，即可在这里预览字符横幅。", "Enter text in the input panel to preview your ASCII banner here.")}</p>
          {#if !busy && !error}<button class="dbx-btn" type="button" onclick={() => (input = "HELLO")}>{t("试试示例", "Try an example")}</button>{/if}
        </div>
      {/if}
      <footer class="preview-footer"><span role="status">{busy ? t("正在生成…", "Generating…") : output ? `${columns} × ${lines.length}` : t("等待输入", "Waiting for input")}</span><span>{t("等宽显示 · 保留空格与换行", "Monospace · Preserves spaces and line breaks")}</span></footer>
    </section>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .figlet-page{width:min(1180px,100%);margin:0 auto;padding:26px 28px;box-sizing:border-box;color:var(--color-foreground);container-type:inline-size}
  .page-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.025em}.page-heading p{margin:8px 0 0;font-size:12px;line-height:1.7;color:var(--color-muted-foreground)}.format-tag{flex-shrink:0;padding:6px 9px;border:1px solid var(--color-border);border-radius:6px;color:var(--color-muted-foreground);font:10px var(--font-mono);letter-spacing:.08em}
  .workspace{display:grid;grid-template-columns:minmax(270px,.72fr) minmax(0,1.28fr);gap:18px;align-items:stretch}.panel{min-width:0;overflow:hidden;border:1px solid var(--color-border);border-radius:10px;background:var(--color-card)}.panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:54px;padding:10px 16px;border-bottom:1px solid var(--color-border);box-sizing:border-box}h2{margin:0;font-size:13px;font-weight:600}.counter{font:11px var(--font-mono);color:var(--color-muted-foreground)}.settings-body{padding:16px}.text-input{width:100%;min-height:108px;resize:vertical;font:14px/1.7 var(--font-mono)}.hint{margin:8px 0 18px;font-size:11px;line-height:1.7;color:var(--color-muted-foreground)}.field{display:flex;flex-direction:column;gap:9px;margin-top:18px;font-size:12px}.field>span{display:flex;align-items:center;justify-content:space-between;gap:8px}.field small{color:var(--color-muted-foreground);font:10px var(--font-mono)}.field :global(.dbx-custom-select){width:100%;max-width:none}.field input{width:100%;font-family:var(--font-mono)}.alignment{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;background:var(--color-muted);border:1px solid var(--color-border);border-radius:7px}.alignment button{padding:7px 4px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--color-muted-foreground);font:inherit;cursor:pointer}.alignment button:hover{color:var(--color-foreground)}.alignment button.active{background:var(--color-card);color:var(--color-primary);border-color:var(--color-border)}.alignment button:focus-visible{outline:2px solid var(--color-ring);outline-offset:1px}.input-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:22px;padding-top:14px;border-top:1px solid var(--color-border)}.input-actions>span{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--color-muted-foreground)}.input-actions i{width:5px;height:5px;border-radius:50%;background:var(--color-primary)}
  .preview-panel{display:flex;flex-direction:column}.preview-title,.copy-action{display:flex;align-items:center;gap:9px}.font-tag{border:1px solid var(--color-border);border-radius:4px;padding:3px 6px;font:10px var(--font-mono);color:var(--color-muted-foreground)}.copy-action{font-size:11px;color:var(--color-muted-foreground)}.banner-output{display:block;flex:1;width:100%;min-height:350px;padding:28px 22px;box-sizing:border-box;border:0;border-radius:0;resize:none;background:color-mix(in srgb,var(--color-muted) 30%,var(--color-card));color:var(--color-foreground);font:13px/1.4 var(--font-mono);white-space:pre;tab-size:4}.banner-output:focus-visible{outline:2px solid var(--color-ring);outline-offset:-2px}.preview-footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:auto;padding:12px 16px;border-top:1px solid var(--color-border);font-size:10px;line-height:1.5;color:var(--color-muted-foreground)}.preview-footer>span:first-child{font-family:var(--font-mono)}.empty-preview{display:flex;flex:1;min-height:350px;align-items:center;justify-content:center;flex-direction:column;padding:28px;text-align:center;box-sizing:border-box;background:color-mix(in srgb,var(--color-muted) 30%,var(--color-card))}.empty-symbol{display:grid;width:58px;height:54px;place-items:center;margin-bottom:18px;border:1px dashed var(--color-border);border-radius:10px;font:24px var(--font-mono);color:var(--color-primary)}.empty-preview strong{font-size:14px;font-weight:600}.empty-preview p{max-width:280px;margin:9px 0 18px;font-size:12px;line-height:1.8;color:var(--color-muted-foreground)}.error{padding:12px 16px;border:1px solid color-mix(in srgb,var(--color-destructive) 25%,transparent);border-radius:7px;background:color-mix(in srgb,var(--color-destructive) 6%,transparent);color:var(--color-destructive);font-size:12px;line-height:1.6}
  @container(max-width:760px){.workspace{grid-template-columns:1fr}.banner-output,.empty-preview{min-height:280px}.page-heading{align-items:flex-start}.format-tag{display:none}}
  @media(max-width:560px){.figlet-page{padding:18px 12px}h1{font-size:20px}.panel-heading{padding-inline:12px}.settings-body{padding:12px}}
</style>
