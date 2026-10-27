<script>
  import { onMount } from "svelte";
  import "codemirror/lib/codemirror.css";
  import "codemirror/addon/fold/foldgutter.css";
  import { loadAssetModule } from "./assetModules.js";
  import { localizeError, pick } from "./i18n.js";

  let {
    value = $bindable(""),
    showLineNumbers = true,
    placeholder = "",
    ariaLabel = "",
    maxLength = 5_000_000,
    locale = "zh-CN",
    mode = "application/json",
  } = $props();

  let hostEl = $state(null);
  let editor = null;
  let applyingExternalValue = false;
  let tabMovesFocus = false;
  let loadError = $state("");

  const t = (zh, en) => pick(locale, zh, en);

  onMount(() => {
    let disposed = false;
    async function mountEditor() {
      try {
        // Vite serves the source module during local development. DBX builds
        // load the same self-contained module through the resource bridge so
        // CodeMirror never enters the home-page bundle.
        const module = import.meta.env.DEV
          ? await import("./lazy/codemirror.js")
          : await loadAssetModule("codemirror");
        if (disposed) return;
        const CodeMirror = module.default;
        editor = CodeMirror(hostEl, {
          value,
          mode,
          lineNumbers: showLineNumbers,
          lineWrapping: true,
          foldGutter: true,
          gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
          viewportMargin: 10,
          placeholder,
          tabSize: 2,
          indentUnit: 2,
          indentWithTabs: false,
          extraKeys: {
            Tab(cm) {
              if (tabMovesFocus) {
                tabMovesFocus = false;
                return CodeMirror.Pass;
              }
              cm.execCommand(cm.somethingSelected() ? "indentMore" : "insertSoftTab");
            },
            "Shift-Tab": "indentLess",
            Esc() {
              tabMovesFocus = true;
              return CodeMirror.Pass;
            },
          },
        });

        const input = editor.getInputField();
        input.setAttribute("aria-label", ariaLabel || t("JSON 文本编辑器", "JSON text editor"));
        input.setAttribute("title", t("Tab：缩进 · Shift+Tab：减少缩进 · Esc、Tab：移动焦点", "Tab: indent · Shift+Tab: outdent · Esc, Tab: move focus"));
        input.setAttribute("spellcheck", "false");

        editor.on("change", (cm) => {
          if (applyingExternalValue) return;
          // Native maxlength silently truncates large pasted logs. Validation is
          // reported by the workbench without mutating the editor's source text.
          value = cm.getValue();
        });

        editor.setSize("100%", "100%");
        requestAnimationFrame(() => editor?.refresh());
      } catch (err) {
        if (!disposed) loadError = localizeError(locale, err);
      }
    }

    mountEditor();

    return () => {
      disposed = true;
      editor = null;
    };
  });

  $effect(() => {
    const next = value;
    if (!editor || editor.getValue() === next) return;
    applyingExternalValue = true;
    const cursor = editor.getCursor();
    editor.setValue(next);
    editor.setCursor(cursor);
    applyingExternalValue = false;
  });

  $effect(() => {
    if (editor) editor.setOption("lineNumbers", showLineNumbers);
  });

  $effect(() => {
    if (editor) editor.setOption("mode", mode);
  });

  $effect(() => {
    if (editor) editor.setOption("placeholder", placeholder);
  });

  $effect(() => {
    maxLength;
    locale;
    if (!editor) return;
    const input = editor.getInputField();
    input.setAttribute("aria-label", ariaLabel || t("JSON 文本编辑器", "JSON text editor"));
    input.setAttribute("title", t("Tab：缩进 · Shift+Tab：减少缩进 · Esc、Tab：移动焦点", "Tab: indent · Shift+Tab: outdent · Esc, Tab: move focus"));
  });
</script>

<div class="json-code-editor" bind:this={hostEl}>
  {#if loadError}<p class="editor-load-error" role="status">{loadError}</p>{/if}
</div>

<style>
  .json-code-editor {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .json-code-editor :global(.CodeMirror) {
    width: 100%;
    height: 100%;
    background: transparent;
    color: var(--color-foreground, CanvasText);
    font-family: var(--font-mono);
    font-size: var(--dbx-editor-font-size, 13px);
    line-height: 20px;
  }
  .json-code-editor :global(.CodeMirror-scroll) {
    padding-bottom: var(--json-editor-bottom-space, 10px);
  }
  .json-code-editor :global(.CodeMirror-gutters) {
    border-right: 0;
    background: color-mix(in srgb, CanvasText 5%, transparent);
  }
  .json-code-editor :global(.CodeMirror-linenumber),
  .json-code-editor :global(.CodeMirror-foldgutter-open),
  .json-code-editor :global(.CodeMirror-foldgutter-folded) {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 48%, transparent));
  }
  .json-code-editor :global(.CodeMirror-lines) {
    padding: 10px 0 var(--json-editor-bottom-space, 10px);
  }
  .json-code-editor :global(.CodeMirror pre.CodeMirror-line),
  .json-code-editor :global(.CodeMirror pre.CodeMirror-line-like) {
    padding: 0 12px;
  }
  .json-code-editor :global(.CodeMirror-selected) {
    background: color-mix(in srgb, var(--color-primary) 28%, transparent);
  }
  .json-code-editor :global(.CodeMirror-focused .CodeMirror-selected) {
    background: color-mix(in srgb, var(--color-primary) 32%, transparent);
  }
  .json-code-editor :global(.CodeMirror-cursor) {
    border-left-color: var(--color-foreground, CanvasText);
  }
  .json-code-editor :global(.cm-property),
  .json-code-editor :global(.cm-string) {
    color: #a31515;
  }
  .json-code-editor :global(.cm-number) {
    color: #098658;
  }
  .json-code-editor :global(.cm-atom) {
    color: #0000ff;
  }
  :global([data-dbx-theme="dark"]) .json-code-editor :global(.cm-property) {
    color: #9cdcfe;
  }
  :global([data-dbx-theme="dark"]) .json-code-editor :global(.cm-string) {
    color: #ce9178;
  }
  :global([data-dbx-theme="dark"]) .json-code-editor :global(.cm-number) {
    color: #b5cea8;
  }
  :global([data-dbx-theme="dark"]) .json-code-editor :global(.cm-atom) {
    color: #569cd6;
  }
  .json-code-editor :global(.CodeMirror-placeholder) {
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 45%, transparent));
  }
  .editor-load-error {
    margin: 0;
    padding: 12px;
    color: var(--color-destructive);
    font-size: 12px;
  }
</style>
