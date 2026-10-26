<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import {
    normalizeEmailList,
    extractLinks,
    palette,
  } from "./contentExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import NumeronymView from "./NumeronymView.svelte";
  import Select from "./Select.svelte";
  import FigletView from "./FigletView.svelte";
  import EmojiPickerView from "./EmojiPickerView.svelte";
  import EnglishNounsView from "./EnglishNounsView.svelte";
  import UrlExtractorView from "./UrlExtractorView.svelte";
  import LunarCalendarView from "./LunarCalendarView.svelte";
  let { toolId, locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    output = $state(""),
    error = $state(""),
    busy = $state(false),
    mode = $state("plural"),
    font = $state("Standard"),
    width = $state(80),
    align = $state("left"),
    gmail = $state(false),
    stripPlus = $state(false),
    lowerLocal = $state(false),
    keepQuery = $state(true),
    group = $state(false),
    color = $state("#15988f"),
    scheme = $state("complementary"),
    colors = $state([]),
    html = $state(""),
    editor = $state(null),
    link = $state("");
  let disposed = false,
    savedSelection;
  onDestroy(() => {
    disposed = true;
  });
  async function run() {
    output = "";
    error = "";
    busy = true;
    try {
      let result;
      if (toolId === "email-normalizer")
        result = normalizeEmailList(input, { gmail, stripPlus, lowerLocal });
      else if (toolId === "url-extractor")
        result = extractLinks(input, { keepQuery, group });
      else if (toolId === "color-palette") {
        colors = palette(color, scheme);
        result = {
          colors,
          css: colors.map((x, i) => `--color-${i + 1}: ${x.css};`).join("\n"),
        };
      } else {
        const lib = await loadAssetModule("content-tools");
        if (disposed) return;
        if (toolId === "figlet") result = lib.banner(input, font, width, align);
        else if (toolId === "english-plural")
          result = lib.englishNouns(input, mode === "singular");
      }
      if (!disposed)
        output =
          typeof result === "string" ? result : JSON.stringify(result, null, 2);
    } catch (e) {
      if (!disposed) error = localizeError(locale, e);
    } finally {
      if (!disposed) busy = false;
    }
  }
  function example() {
    input =
      {
        figlet: "DBX",
        "english-plural": "child mouse sheep",
        "email-normalizer": "User@EXAMPLE.COM",
        "url-extractor":
          "https://example.com/docs and mailto:hello@example.com",
      }[toolId] || "";
    output = "";
    error = "";
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    example();
  });
  // Rich text is built from native DOM editing; pasted HTML is always converted to text.
  function paste(event) {
    event.preventDefault();
    document.execCommand(
      "insertText",
      false,
      event.clipboardData.getData("text/plain"),
    );
    html = editor.innerHTML;
  }
  function command(name, value) {
    editor?.focus();
    if (savedSelection) {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(savedSelection);
    }
    document.execCommand(name, false, value);
    html = editor.innerHTML;
  }
  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor?.contains(selection.anchorNode))
      savedSelection = selection.getRangeAt(0).cloneRange();
  }
  function addLink() {
    try {
      const url = new URL(link);
      if (!["http:", "https:", "mailto:"].includes(url.protocol))
        throw new Error("Invalid link");
      command("createLink", url.href);
    } catch (e) {
      error = localizeError(locale, e);
    }
  }
</script>

{#if toolId === "figlet"}
  <FigletView {locale} {demoRequest} />
{:else if toolId === "english-plural"}
  <EnglishNounsView {locale} {demoRequest} />
{:else if toolId === "url-extractor"}
  <UrlExtractorView {locale} {demoRequest} />
{:else if toolId === "emoji-picker"}
  <EmojiPickerView {locale} />
{:else if toolId === "lunar-calendar"}
  <LunarCalendarView {locale} {demoRequest} />
{:else}
<div class="expansion-page" class:content-workspace={!["numeronym", "emoji-picker", "rich-text", "lunar-calendar"].includes(toolId)} class:numeronym-page={toolId === "numeronym"} class:email-normalizer-page={toolId === "email-normalizer"}>
  {#if toolId === "numeronym"}
    <NumeronymView {locale} {demoRequest} />
  {:else if toolId === "rich-text"}
    <div class="expansion-actions">
      {#each [["bold", "B"], ["italic", "I"], ["formatBlock", "H2"], ["insertUnorderedList", "•"], ["insertOrderedList", "1."]] as [cmd, label]}<button
          class="dbx-btn"
          onmousedown={(e) => e.preventDefault()}
          onclick={() => command(cmd, cmd === "formatBlock" ? "h2" : undefined)}
          >{label}</button
        >{/each}
    </div>
    <label
      >{t("链接地址", "Link URL")}<input
        class="dbx-input"
        bind:value={link}
      /></label
    ><button
      class="dbx-btn"
      onmousedown={(e) => e.preventDefault()}
      onclick={addLink}>{t("插入链接", "Insert link")}</button
    >
    <div
      class="editor dbx-textarea"
      role="textbox"
      aria-label={t("富文本内容", "Rich text content")}
      contenteditable="true"
      tabindex="0"
      bind:this={editor}
      onpaste={paste}
      onkeyup={rememberSelection}
      onmouseup={rememberSelection}
      ondrop={(e) => e.preventDefault()}
      oninput={() => (html = editor.innerHTML)}
    ></div>
    <label
      >{t("HTML 源码", "HTML source")}<textarea
        class="dbx-textarea"
        value={html}
        readonly
        rows="8"></textarea></label
    ><CopyButton {locale} text={html} />
  {:else}
    {#if toolId === "color-palette"}<label
        >{t("基础色", "Base color")}<input
          type="color"
          bind:value={color}
        /></label
      ><Select bind:value={scheme} ariaLabel={t("配色方案", "Color scheme")} options={["complementary", "analogous", "triadic", "tetradic", "monochrome"].map((value) => ({value,label:value}))} />
    {:else}<label
        >{t("输入", "Input")}<textarea
          class="dbx-textarea"
          bind:value={input}
          maxlength={toolId === "figlet" ? 200 : 100000}
          rows="6"></textarea></label
      >{/if}
    {#if toolId === "figlet"}<Select bind:value={font} ariaLabel={t("字体", "Font")} options={["Standard", "Slant", "Small"].map((value) => ({value,label:value}))} /><label
        >{t("宽度", "Width")}<input
          class="dbx-input"
          type="number"
          min="20"
          max="200"
          bind:value={width}
        /></label
      ><Select bind:value={align} ariaLabel={t("对齐", "Alignment")} options={["left", "center", "right"].map((value) => ({value,label:value}))} />{/if}
    {#if toolId === "english-plural"}<Select bind:value={mode} ariaLabel={t("模式", "Mode")} options={[{value:"plural",label:t("转复数", "Pluralize")},{value:"singular",label:t("转单数", "Singularize")}]} />{/if}
    {#if toolId === "email-normalizer"}<div class="tool-options email-options" role="group" aria-label="Email normalization options"><label
        ><input type="checkbox" bind:checked={gmail} />{t(
          "启用 Gmail 专属规则",
          "Enable Gmail-specific rules",
        )}</label
      ><label
        ><input type="checkbox" bind:checked={stripPlus} disabled={!gmail} />{t(
          "移除 Gmail 加号别名",
          "Remove Gmail plus aliases",
        )}</label
      ><label
        ><input type="checkbox" bind:checked={lowerLocal} />{t(
          "用户名转小写（可能改变含义）",
          "Lowercase local part (may change meaning)",
        )}</label
      ></div>{/if}
    {#if toolId === "url-extractor"}<label
        ><input type="checkbox" bind:checked={keepQuery} />{t(
          "保留查询参数",
          "Keep query parameters",
        )}</label
      ><label
        ><input type="checkbox" bind:checked={group} />{t(
          "按域名分组",
          "Group by domain",
        )}</label
      >{/if}
    <div class="expansion-actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run} disabled={busy}
        >{t("执行", "Run")}</button
      ><CopyButton {locale} text={output} />
    </div>
    {#if toolId === "color-palette"}<div class="swatches">
        {#each colors as item}<div
            style:background={item.css}
            title={item.css}
          ></div>{/each}
      </div>{/if}
    {#if output}<textarea
        class="dbx-textarea mono result-panel"
        value={output}
        readonly
        rows="12"
        wrap="off"></textarea>{/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>
{/if}

<style>
  .swatches {
    display: flex;
    height: 90px;
  }
  .swatches div {
    flex: 1;
  }
  .editor {
    min-height: 220px;
    overflow: auto;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .content-workspace{max-width:1100px}
  .numeronym-page{max-width:1180px;padding:24px 28px}
  @media (max-width:600px){.numeronym-page{padding:16px}}
  @container (min-width: 760px){
    .content-workspace{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);align-content:start}
    .content-workspace>.expansion-actions,.content-workspace>[role="alert"]{grid-column:1/-1}
    .content-workspace>.result-panel{grid-column:2;grid-row:1 / span 5;min-height:260px}
  }
  .email-normalizer-page{max-width:1180px;padding:22px 28px;gap:16px}
  .email-normalizer-page>.email-options{display:flex;flex-wrap:wrap;gap:8px;align-items:stretch}
  .email-options label{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:7px 11px;border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-card);font-size:12px;cursor:pointer;transition:border-color 120ms ease,background 120ms ease}
  .email-options label:hover{border-color:var(--color-ring);background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}
  .email-options label:has(input:checked){border-color:var(--dbx-selection-border);background:color-mix(in srgb,var(--dbx-selection-background) 10%,var(--color-card))}
  .email-options label:has(input:disabled){opacity:.55;cursor:not-allowed}
  .email-options input{margin:0!important;accent-color:var(--color-primary)}
  .email-normalizer-page .expansion-actions{padding-top:2px}
  .email-normalizer-page .expansion-actions .dbx-btn{min-width:72px}
  .email-normalizer-page>.result-panel{min-height:320px;max-height:520px;resize:vertical}
  @container (min-width:760px){
    .email-normalizer-page{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.95fr);align-content:start}
    .email-normalizer-page>.email-options,.email-normalizer-page>.expansion-actions,.email-normalizer-page>[role=alert]{grid-column:1}
    .email-normalizer-page>.result-panel{grid-column:2;grid-row:1 / span 3;height:100%;min-height:360px}
  }
  @container (max-width:759px){.email-normalizer-page>.result-panel{min-height:220px}}
</style>
