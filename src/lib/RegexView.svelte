<script>
  import { untrack } from "svelte";
  import RegexWorker from "./regexWorker.js?worker&inline";
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { INPUT_LIMITS } from "./inputLimits.js";
  import { regexSegments } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let pattern = $state("");
  let flags = $state("g");
  let input = $state("");
  let replacement = $state("");
  /** @type {"match" | "replace"} */
  let resultPane = $state("match");

  let result = $state({ matches: [], replaced: "", truncated: false, error: "" });
  let pending = $state(false);

  $effect(() => {
    const nextPattern = pattern;
    const nextFlags = flags;
    const nextInput = input;
    const nextReplacement = replacement;
    if (!nextPattern) {
      pending = false;
      result = { matches: [], replaced: nextInput, truncated: false, error: "" };
      return;
    }
    if (nextPattern.length > 10_000 || nextInput.length > INPUT_LIMITS.regex) {
      pending = false;
      result = { matches: [], replaced: "", truncated: false, error: t("输入过大", "Input is too large") };
      return;
    }
    pending = true;
    result = { ...untrack(() => result), error: "" };
    const worker = new RegexWorker();
    const timeout = window.setTimeout(() => {
      worker.terminate();
      pending = false;
      result = { matches: [], replaced: "", truncated: false, error: t("正则执行超时", "Regex execution timed out") };
    }, 500);
    worker.onmessage = (event) => {
      window.clearTimeout(timeout);
      pending = false;
      result = event.data;
      worker.terminate();
    };
    worker.onerror = () => {
      window.clearTimeout(timeout);
      pending = false;
      result = { matches: [], replaced: "", truncated: false, error: t("正则执行失败", "Regex execution failed") };
      worker.terminate();
    };
    worker.postMessage({ input: nextInput, pattern: nextPattern, flags: nextFlags, replacement: nextReplacement });
    return () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
  });

  const segs = $derived(result.error ? [] : regexSegments(input, result.matches));
  const hasGroups = $derived(result.matches.some((m) => m.groups?.some(Boolean)));
  const matchStatus = $derived(
    pending
      ? t("正在匹配…", "Matching…")
      : t(`${result.matches.length} 处匹配`, `${result.matches.length} match(es)`),
  );
  const copyText = $derived(
    result.error ? "" : resultPane === "replace" ? result.replaced || "" : input,
  );

  function clearInput() {
    input = "";
  }
</script>

<div class="page">
  <div class="options">
    <label class="field grow">
      <span>{t("表达式", "Pattern")}</span>
      <input class="dbx-input mono" spellcheck="false" placeholder="\\w+" bind:value={pattern} />
    </label>
    <label class="field replace">
      <span>{t("替换为", "Replace with")}</span>
      <input
        class="dbx-input mono"
        spellcheck="false"
        placeholder="$1"
        bind:value={replacement}
        onfocus={() => (resultPane = "replace")}
      />
    </label>
    <label class="field flags">
      <span>{t("标志", "Flags")}</span>
      <input
        class="dbx-input mono"
        spellcheck="false"
        placeholder="g"
        aria-describedby="regex-flags-help"
        title={t("g：全局匹配；i：忽略大小写；m：多行模式", "g: global; i: ignore case; m: multiline")}
        bind:value={flags}
      />
    </label>
  </div>
  <p class="flag-help" id="regex-flags-help">
    {t("标志：g 全部匹配 · i 忽略大小写 · m 多行模式", "Flags: g global · i ignore case · m multiline")}
  </p>

  <div class="workspace">
    <div class="pane-head">
      <span class="caption">{t("测试文本", "Test text")}</span>
      <button class="dbx-btn dbx-btn--ghost small-action" type="button" disabled={!input} onclick={clearInput}>
        {t("清空", "Clear")}
      </button>
    </div>
    <div class="pane-head">
      <div class="seg" role="tablist" aria-label={t("结果", "Result")}>
        <button
          type="button"
          role="tab"
          class:active={resultPane === "match"}
          aria-selected={resultPane === "match"}
          onclick={() => (resultPane = "match")}
        >{t("匹配预览", "Matches")}</button>
        <button
          type="button"
          role="tab"
          class:active={resultPane === "replace"}
          aria-selected={resultPane === "replace"}
          onclick={() => (resultPane = "replace")}
        >{t("替换结果", "Replace")}</button>
      </div>
      <span class="count" role="status">{matchStatus}</span>
      <CopyButton
        {locale}
        text={copyText}
        labelZh={resultPane === "replace" ? "复制结果" : "复制原文"}
        labelEn={resultPane === "replace" ? "Copy result" : "Copy text"}
      />
    </div>

    <textarea
      class="dbx-textarea area"
      spellcheck="false"
      maxlength={INPUT_LIMITS.regex}
      aria-label={t("测试文本", "Test text")}
      bind:value={input}
    ></textarea>

    {#if result.error}
      <p class="error panel" role="alert">{result.error}</p>
    {:else if resultPane === "match"}
      <div class="preview panel" class:empty={!input}>
        {#if !input}
          <span class="hint">{t("输入文本后高亮匹配。", "Matches highlight as you type.")}</span>
        {:else}
          {#each segs as seg, i (`${i}-${seg.hit}`)}
            {#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
          {/each}
        {/if}
      </div>
    {:else}
      <textarea
        class="dbx-textarea panel replaced mono"
        readonly
        tabindex="-1"
        aria-label={t("替换结果", "Replacement result")}
        placeholder={t("替换结果会显示在这里", "Replacement appears here")}
        value={result.replaced || ""}
      ></textarea>
    {/if}
  </div>

  {#if result.truncated}
    <p class="note" role="status">
      {t("仅显示前 10,000 处匹配；替换结果仍处理全部匹配。", "Only the first 10,000 matches are shown; replacement still includes all matches.")}
    </p>
  {/if}

  {#if !result.error && result.matches.length}
    <div class="table-wrap">
      <table class="dbx-table">
        <thead>
          <tr>
            <th class="col-num">#</th>
            <th class="col-index">index</th>
            <th>{t("文本", "Text")}</th>
            {#if hasGroups}<th>groups</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each result.matches as m, i (i)}
            {@const groupsText = m.groups.filter(Boolean).join(", ")}
            <tr>
              <td class="mono col-num">{i + 1}</td>
              <td class="mono col-index">{m.index}</td>
              <td class="mono"><span class="clip" title={m.text}>{m.text}</span></td>
              {#if hasGroups}
                <td class="mono"><span class="clip" title={groupsText}>{groupsText}</span></td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
  }
  .grow {
    flex: 2 1 220px;
    min-width: min(180px, 100%);
    max-width: 480px;
  }
  .field :global(.dbx-input) {
    width: 100%;
    min-width: 0;
  }
  .flags {
    flex: 0 1 6rem;
    min-width: 4.5rem;
  }
  .replace {
    flex: 1 1 180px;
    min-width: min(140px, 100%);
    max-width: 320px;
  }
  .flag-help {
    margin: -4px 0 0;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 11px;
    flex-shrink: 0;
  }
  .workspace {
    flex: 1 1 auto;
    min-height: 180px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: 28px minmax(0, 1fr);
    column-gap: var(--ui-gap, 12px);
    row-gap: var(--ui-field-gap, 6px);
    align-items: stretch;
  }
  .pane-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }
  .pane-head .caption {
    margin-right: auto;
  }
  .pane-head :global(.copy-btn) {
    width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
  }
  .small-action {
    height: 28px;
    min-height: 28px;
    padding: 0 8px;
    font-size: 12px;
  }
  .seg {
    display: inline-flex;
    flex-shrink: 0;
    height: 28px;
    box-sizing: border-box;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }
  .seg button {
    height: 100%;
    padding: 0 10px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .count,
  .hint,
  .note {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .count {
    margin-right: auto;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .note {
    flex-shrink: 0;
  }
  .area,
  .panel {
    width: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    resize: none;
    line-height: 1.45;
  }
  .preview {
    overflow: auto;
    padding: 10px 12px;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono);
  }
  .preview.empty {
    display: flex;
  }
  .preview mark {
    background: color-mix(in srgb, var(--color-primary) 28%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  .replaced {
    font-family: var(--font-mono);
    background: color-mix(in srgb, var(--color-muted, CanvasText) 4%, var(--color-background, Canvas));
  }
  .table-wrap {
    flex: 0 0 auto;
    max-height: 7.5rem;
    overflow: auto;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 14%, transparent)));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .table-wrap :global(table) {
    margin: 0;
  }
  .table-wrap :global(th),
  .table-wrap :global(td) {
    padding: 4px 8px;
    vertical-align: middle;
  }
  .table-wrap :global(thead th) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--color-card, var(--color-background, Canvas));
  }
  .col-num,
  .col-index {
    width: 1%;
    white-space: nowrap;
  }
  .clip {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 0;
    min-width: 100%;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .error {
    color: var(--color-destructive);
  }
  .error.panel {
    overflow: auto;
    padding: 10px 12px;
    white-space: pre-wrap;
    word-break: break-word;
    border: 1px solid color-mix(in srgb, var(--color-destructive) 28%, transparent);
    border-radius: var(--radius-md, 8px);
    background: color-mix(in srgb, var(--color-destructive) 10%, var(--color-background, Canvas));
  }
  @container (max-width: 520px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 28px minmax(120px, 1fr) 28px minmax(120px, 1fr);
    }
    .pane-head:nth-child(1) { grid-row: 1; }
    .pane-head:nth-child(2) { grid-row: 3; }
    .area { grid-row: 2; }
    .panel { grid-row: 4; }
    .table-wrap {
      max-height: 6rem;
    }
  }
</style>
