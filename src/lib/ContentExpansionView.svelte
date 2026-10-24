<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import { numeronym } from "./tools/text.js";
  import {
    normalizeEmailList,
    extractLinks,
    palette,
    EMOJI,
  } from "./contentExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  let { toolId, locale = "zh-CN" } = $props();
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
    skin = $state(""),
    emojiCategory = $state("all"),
    selected = $state(""),
    direction = $state("solar"),
    year = $state(2026),
    month = $state(1),
    day = $state(1),
    leap = $state(false),
    html = $state(""),
    editor = $state(null),
    link = $state("");
  let disposed = false,
    savedSelection;
  onDestroy(() => {
    disposed = true;
  });
  const emoji = $derived(
    EMOJI.filter(
      (row) =>
        (emojiCategory === "all" || row[2] === emojiCategory) &&
        (!input || row[1].toLowerCase().includes(input.toLowerCase())),
    ),
  );
  async function run() {
    output = "";
    error = "";
    busy = true;
    try {
      let result;
      if (toolId === "numeronym") result = numeronym(input);
      else if (toolId === "email-normalizer")
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
        else if (toolId === "lunar-calendar")
          result = lib.lunarConvert({
            solarDate: input,
            year: Number(year),
            month: Number(month),
            day: Number(day),
            leap,
            direction,
          });
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
        numeronym: "internationalization accessibility kubernetes",
        "english-plural": "child mouse sheep",
        "email-normalizer": "User@EXAMPLE.COM",
        "url-extractor":
          "https://example.com/docs and mailto:hello@example.com",
        "lunar-calendar": "2026-02-17",
      }[toolId] || "";
    output = "";
    error = "";
  }
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

<div class="expansion-page">
  {#if toolId === "emoji-picker"}
    <label
      >{t("搜索", "Search")}<input
        class="dbx-input"
        bind:value={input}
      /></label
    ><label
      >{t("类别", "Category")}<select
        class="dbx-input"
        bind:value={emojiCategory}
        >{#each ["all", "faces", "people", "symbols", "nature", "objects", "food"] as cat}<option
            >{cat}</option
          >{/each}</select
      ></label
    ><label
      >{t("肤色", "Skin tone")}<select class="dbx-input" bind:value={skin}
        >{#each ["", "🏻", "🏼", "🏽", "🏾", "🏿"] as tone}<option value={tone}
            >{tone || t("默认", "Default")}</option
          >{/each}</select
      ></label
    >
    <div class="emoji-grid">
      {#each emoji as [value, name, , supportsSkin]}<button
          class="dbx-btn"
          title={name}
          onclick={() => (selected += value + (supportsSkin ? skin : ""))}
          >{value}{supportsSkin ? skin : ""}</button
        >{/each}
    </div>
    <textarea class="dbx-textarea" bind:value={selected}></textarea><CopyButton
      {locale}
      text={selected}
    /><button class="dbx-btn" onclick={() => (selected = "")}
      >{t("清空", "Clear")}</button
    >
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
      ><select class="dbx-input" bind:value={scheme}
        >{#each ["complementary", "analogous", "triadic", "tetradic", "monochrome"] as value}<option
            >{value}</option
          >{/each}</select
      >
    {:else if toolId === "lunar-calendar"}<select
        class="dbx-input"
        bind:value={direction}
        ><option value="solar">{t("阳历转农历", "Solar to lunar")}</option
        ><option value="lunar">{t("农历转阳历", "Lunar to solar")}</option
        ></select
      >
      <p>1900–2100</p>
      {#if direction === "solar"}<input
          class="dbx-input"
          type="date"
          min="1900-01-01"
          max="2100-12-31"
          bind:value={input}
        />{:else}<label
          >{t("年", "Year")}<input
            class="dbx-input"
            type="number"
            bind:value={year}
          /></label
        ><label
          >{t("月", "Month")}<input
            class="dbx-input"
            type="number"
            min="1"
            max="12"
            bind:value={month}
          /></label
        ><label
          >{t("日", "Day")}<input
            class="dbx-input"
            type="number"
            min="1"
            max="30"
            bind:value={day}
          /></label
        ><label
          ><input type="checkbox" bind:checked={leap} />{t(
            "闰月",
            "Leap month",
          )}</label
        >{/if}
    {:else}<label
        >{t("输入", "Input")}<textarea
          class="dbx-textarea"
          bind:value={input}
          maxlength={toolId === "figlet" ? 200 : 100000}
          rows="6"></textarea></label
      >{/if}
    {#if toolId === "figlet"}<select class="dbx-input" bind:value={font}
        >{#each ["Standard", "Slant", "Small"] as value}<option>{value}</option
          >{/each}</select
      ><label
        >{t("宽度", "Width")}<input
          class="dbx-input"
          type="number"
          min="20"
          max="200"
          bind:value={width}
        /></label
      ><select class="dbx-input" bind:value={align}
        >{#each ["left", "center", "right"] as value}<option>{value}</option
          >{/each}</select
      >{/if}
    {#if toolId === "english-plural"}<select class="dbx-input" bind:value={mode}
        ><option value="plural">{t("转复数", "Pluralize")}</option><option
          value="singular">{t("转单数", "Singularize")}</option
        ></select
      >{/if}
    {#if toolId === "email-normalizer"}<label
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
      >{/if}
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
      <button class="dbx-btn" onclick={example}>{t("示例", "Example")}</button>
    </div>
    {#if toolId === "color-palette"}<div class="swatches">
        {#each colors as item}<div
            style:background={item.css}
            title={item.css}
          ></div>{/each}
      </div>{/if}
    {#if output}<textarea
        class="dbx-textarea mono"
        value={output}
        readonly
        rows="12"
        wrap="off"></textarea>{/if}
  {/if}
  {#if error}<p role="alert">{error}</p>{/if}
</div>

<style>
  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
    gap: 8px;
  }
  .emoji-grid button {
    font-size: 26px;
  }
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
</style>
