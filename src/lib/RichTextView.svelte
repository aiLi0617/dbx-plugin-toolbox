<script>
  import { pick } from "./i18n.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { createRichTextHistory, normalizeRichTextLink, sanitizeRichText } from "./richText.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let editor = $state(null), savedSelection;
  let html = $state(""), source = $state(""), text = $state(""), link = $state("");
  let error = $state(""), status = $state(""), canUndo = $state(false), canRedo = $state(false);
  let active = $state({});
  let block = $state("");
  let sourceDirty = $derived(source !== html);
  const history = createRichTextHistory();
  const tools = $derived([
    ["bold", "B", t("加粗", "Bold")], ["italic", "I", t("斜体", "Italic")],
    ["underline", "U", t("下划线", "Underline")], ["strikeThrough", "S", t("删除线", "Strikethrough")],
    ["insertUnorderedList", "•", t("无序列表", "Bulleted list")], ["insertOrderedList", "1.", t("有序列表", "Numbered list")],
    ["justifyLeft", "≡", t("左对齐", "Align left")], ["justifyCenter", "≡", t("居中", "Align center")],
    ["justifyRight", "≡", t("右对齐", "Align right")], ["removeFormat", "Tx", t("清除格式", "Remove formatting")],
    ["unlink", "↛", t("移除链接", "Remove link")],
  ]);

  function refreshHistory() { canUndo = history.canUndo; canRedo = history.canRedo; }
  function rememberSelection() {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      if (editor?.contains(range.startContainer) && editor.contains(range.endContainer)) savedSelection = range.cloneRange();
    }
    const next = {};
    for (const name of ["bold", "italic", "underline", "strikeThrough", "insertUnorderedList", "insertOrderedList", "justifyLeft", "justifyCenter", "justifyRight"]) {
      try { next[name] = document.queryCommandState(name); } catch { next[name] = false; }
    }
    active = next;
  }
  function restoreSelection() {
    editor.focus();
    const range = savedSelection && editor.contains(savedSelection.startContainer) && editor.contains(savedSelection.endContainer)
      ? savedSelection : document.createRange();
    if (range !== savedSelection) { range.selectNodeContents(editor); range.collapse(false); }
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    return range;
  }
  function sync() {
    html = editor.innerHTML;
    source = html;
    text = editor.innerText;
    history.push(html); refreshHistory(); rememberSelection();
    error = ""; status = "";
  }
  function replaceContent(value) {
    editor.innerHTML = value;
    savedSelection = null;
    sync();
  }
  function command(name, value) {
    if (sourceDirty) return;
    try {
      restoreSelection();
      document.execCommand(name, false, value);
      sync();
    } catch {
      error = t("无法应用格式，请重新选择编辑区中的文字。", "Unable to apply formatting. Select the text in the editor again.");
    }
  }
  function travel(direction) {
    if (sourceDirty) return;
    editor.innerHTML = direction === "undo" ? history.undo() : history.redo();
    savedSelection = null;
    html = editor.innerHTML; source = html; text = editor.innerText;
    refreshHistory(); restoreSelection(); rememberSelection(); error = ""; status = "";
  }
  function paste(event) {
    event.preventDefault();
    const value = event.clipboardData?.getData("text/plain") || "";
    restoreSelection();
    if (!document.execCommand("insertText", false, value)) {
      const range = restoreSelection();
      range.deleteContents();
      const node = document.createTextNode(value);
      range.insertNode(node); range.setStartAfter(node); range.collapse(true);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    }
    sync();
  }
  function addLink() {
    const href = normalizeRichTextLink(link);
    if (!href) {
      error = t("请输入有效链接，支持网页地址、mailto: 和 tel:。", "Enter a valid link: a web address, mailto: or tel:.");
      return;
    }
    const range = restoreSelection();
    if (range.collapsed) {
      const anchor = document.createElement("a"); anchor.href = href; anchor.textContent = href;
      range.insertNode(anchor); range.setStartAfter(anchor); range.collapse(true);
      window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
      sync();
    } else command("createLink", href);
    link = "";
  }
  function applySource() {
    const clean = sanitizeRichText(source);
    replaceContent(clean);
    status = t("源码已应用；仅保留安全的文字、链接和排版。", "Source applied; only safe text, links and formatting are retained.");
  }
  function keydown(event) {
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
      event.preventDefault(); travel(event.key.toLowerCase() === "y" || event.shiftKey ? "redo" : "undo");
    }
  }
  function demo() {
    replaceContent(t("<h2>让想法有条理</h2><p>选中文字，试试<strong>加粗</strong>、<em>斜体</em>或添加链接。</p><ul><li>编辑富文本</li><li>查看和修改 HTML 源码</li><li>复制结果</li></ul>", "<h2>Give your ideas structure</h2><p>Select text to try <strong>bold</strong>, <em>italic</em> or a link.</p><ul><li>Edit rich text</li><li>View and edit HTML source</li><li>Copy the result</li></ul>"));
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (editor && demoRequest && demoRequest !== appliedDemoRequest) { appliedDemoRequest = demoRequest; demo(); }
  });
</script>

<div class="rich-page">
  <div class="workspace">
    <section class="panel">
      <div class="heading"><h3>{t("富文本内容", "Rich text content")}</h3><div class="actions"><span class="badge">WYSIWYG</span><button class="dbx-btn" disabled={!html && !source} onclick={() => { replaceContent(""); link = ""; }}>{t("清空", "Clear")}</button></div></div>
      <div class="rich-toolbar" role="group" aria-label={t("排版工具", "Formatting tools")}>
        <button class="dbx-btn" title={t("撤销", "Undo")} aria-label={t("撤销", "Undo")} disabled={!canUndo || sourceDirty} onmousedown={(e) => e.preventDefault()} onclick={() => travel("undo")}>↶</button>
        <button class="dbx-btn" title={t("重做", "Redo")} aria-label={t("重做", "Redo")} disabled={!canRedo || sourceDirty} onmousedown={(e) => e.preventDefault()} onclick={() => travel("redo")}>↷</button>
        <Select class="block-select" bind:value={block} ariaLabel={t("段落样式", "Paragraph style")} placeholder={t("段落样式", "Paragraph style")} disabled={sourceDirty} options={[{value:"p",label:t("正文", "Paragraph")},{value:"h1",label:"H1"},{value:"h2",label:"H2"},{value:"h3",label:"H3"},{value:"blockquote",label:t("引用", "Quote")},{value:"pre",label:t("代码块", "Code block")}]} onchange={(value) => { command("formatBlock", value); block = ""; }} />
        {#each tools as [name, label, title]}<button class="dbx-btn format-button" class:active={active[name]} class:italic={name === "italic"} class:underline={name === "underline"} class:strike={name === "strikeThrough"} title={title} aria-label={title} aria-pressed={active[name] || false} disabled={sourceDirty} onmousedown={(e) => e.preventDefault()} onclick={() => command(name)}>{#if name.startsWith("justify")}<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 3h16M2 11h16" /><path d={name === "justifyLeft" ? "M2 7h10M2 15h10" : name === "justifyCenter" ? "M5 7h10M5 15h10" : "M8 7h10M8 15h10"} /></svg>{:else}{label}{/if}</button>{/each}
      </div>
      <form class="link-row" onsubmit={(e) => { e.preventDefault(); addLink(); }}>
        <input class="dbx-input" aria-label={t("链接地址", "Link URL")} placeholder="https://example.com" bind:value={link} disabled={sourceDirty} oninput={() => { error = ""; status = ""; }} />
        <button class="dbx-btn" type="submit" disabled={sourceDirty} onmousedown={(e) => e.preventDefault()}>{t("插入链接", "Insert link")}</button>
      </form>
      <div class="editor" role="textbox" aria-label={t("富文本内容", "Rich text content")} aria-multiline="true" aria-disabled={sourceDirty} contenteditable={!sourceDirty} tabindex="0" bind:this={editor} oninput={sync} onkeyup={rememberSelection} onmouseup={rememberSelection} onblur={rememberSelection} onkeydown={keydown} onbeforeinput={(e) => { if (["historyUndo", "historyRedo"].includes(e.inputType)) { e.preventDefault(); travel(e.inputType === "historyUndo" ? "undo" : "redo"); } }} onpaste={paste} ondrop={(e) => e.preventDefault()} onclick={(e) => { if (e.target.closest("a")) e.preventDefault(); }} data-placeholder={t("在这里开始输入，或点击「来个 DEMO」…", "Start typing here, or use the Demo action…")}></div>
      <div class="footer"><span>{t("字符数", "Characters")}: {Array.from(text).length}</span><span>{t("粘贴时保留纯文本", "Pastes as plain text")}</span><CopyButton {locale} text={text} labelZh="复制纯文本" labelEn="Copy plain text" /></div>
    </section>
    <section class="panel source-panel">
      <div class="heading"><h3>{t("HTML 源码", "HTML source")}</h3><div class="actions"><span class="badge">HTML</span><CopyButton {locale} text={source} labelZh="复制 HTML" labelEn="Copy HTML" /></div></div>
      <textarea class="source" aria-label={t("HTML 源码", "HTML source")} bind:value={source} spellcheck="false" placeholder="<p>…</p>" oninput={() => { error = ""; status = ""; }}></textarea>
      <div class="source-actions"><button class="dbx-btn dbx-btn--primary" disabled={!sourceDirty} onclick={applySource}>{t("应用源码", "Apply source")}</button><button class="dbx-btn" disabled={!sourceDirty} onclick={() => { source = html; error = ""; status = ""; }}>{t("放弃修改", "Discard changes")}</button></div>
      <p class="hint">{sourceDirty ? t("源码有未应用的修改。应用或放弃后可继续编辑富文本。", "Source has unapplied changes. Apply or discard them to continue rich text editing.") : t("源码随编辑实时更新；应用源码时会过滤脚本和不支持的标签。", "Source updates as you type. Applying source filters scripts and unsupported tags.")}</p>
    </section>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if status}<p class="status" role="status">{status}</p>{/if}
</div>

<style>
  .rich-page { width: 100%; max-width: 1380px; margin: 0 auto; padding: 24px; box-sizing: border-box; display: grid; gap: 20px; }
  .heading, .actions, .footer { display: flex; align-items: center; gap: 10px; }
  .heading { justify-content: space-between; }
  h3, p { margin: 0; } h3 { font-size: 14px; }
  .hint, .footer { color: var(--color-muted-foreground); font-size: 12px; line-height: 1.65; }
  .actions { flex-shrink: 0; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 18px; }
  .panel { border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-card); overflow: hidden; display: flex; flex-direction: column; min-width: 0; }
  .heading { padding: 16px; border-bottom: 1px solid var(--color-border); min-height: 28px; }
  .badge { font: 10px monospace; letter-spacing: .6px; color: var(--color-muted-foreground); background: var(--color-muted); padding: 4px 7px; border-radius: 4px; }
  .rich-toolbar { display: flex; flex-wrap: wrap; gap: 5px; padding: 12px; background: var(--color-muted); border-bottom: 1px solid var(--color-border); }
  .rich-toolbar .dbx-btn { min-width: 30px; padding: 0 8px; } .rich-toolbar :global(.block-select) { width: 115px; }
  .format-button.active { background: var(--dbx-selection-background); color: var(--dbx-selection-foreground); border-color: var(--dbx-selection-border); }
  .italic { font-style: italic; } .underline { text-decoration: underline; } .strike { text-decoration: line-through; }
  .link-row { display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid var(--color-border); } .link-row input { min-width: 0; flex: 1; }
  .editor { min-height: 330px; padding: 20px; outline: none; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.7; flex: 1; }
  .editor:focus-visible { box-shadow: var(--dbx-focus-ring); } .editor[aria-disabled="true"] { opacity: .6; }
  .editor:empty:before { content: attr(data-placeholder); color: var(--color-muted-foreground); pointer-events: none; }
  .editor :global(h1), .editor :global(h2), .editor :global(h3) { line-height: 1.3; margin: .6em 0; }
  .editor :global(p) { margin: .7em 0; } .editor :global(a) { color: var(--color-info); text-decoration: underline; }
  .editor :global(blockquote) { margin-left: 0; padding-left: 16px; border-left: 3px solid var(--color-border); color: var(--color-muted-foreground); }
  .editor :global(pre) { background: var(--color-muted); padding: 12px; white-space: pre-wrap; border-radius: 6px; }
  .footer { border-top: 1px solid var(--color-border); padding: 10px 14px; flex-wrap: wrap; justify-content: space-between; }
  .source { flex: 1; min-height: 375px; resize: vertical; border: 0; outline: none; background: var(--color-muted); color: var(--color-foreground); padding: 20px; font: 12px/1.8 var(--font-mono, monospace); box-sizing: border-box; tab-size: 2; }
  .source:focus-visible { box-shadow: var(--dbx-focus-ring); } .source-actions { display: flex; gap: 8px; padding: 14px 16px 8px; }
  .hint { padding: 0 16px 14px; min-height: 40px; } .error { color: var(--color-destructive); font-size: 13px; } .status { color: var(--color-muted-foreground); font-size: 13px; }
  @media (max-width: 1000px) { .workspace { grid-template-columns: minmax(0, 1fr); } .source { min-height: 240px; } }
  @media (max-width: 600px) { .rich-page { padding: 14px; } .link-row { flex-wrap: wrap; } .editor { min-height: 260px; } }
</style>
