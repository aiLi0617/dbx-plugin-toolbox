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

  let result = $state({ matches: [], replaced: "", error: "" });
  let pending = $state(false);

  $effect(() => {
    const nextPattern = pattern;
    const nextFlags = flags;
    const nextInput = input;
    const nextReplacement = replacement;
    if (!nextPattern) {
      pending = false;
      result = { matches: [], replaced: nextInput, error: "" };
      return;
    }
    if (nextPattern.length > 10_000 || nextInput.length > INPUT_LIMITS.regex) {
      pending = false;
      result = { matches: [], error: t("输入过大", "Input is too large") };
      return;
    }
    pending = true;
    result = { ...untrack(() => result), error: "" };
    const worker = new RegexWorker();
    const timeout = window.setTimeout(() => {
      worker.terminate();
      pending = false;
      result = { matches: [], error: t("正则执行超时", "Regex execution timed out") };
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
      result = { matches: [], error: t("正则执行失败", "Regex execution failed") };
      worker.terminate();
    };
    worker.postMessage({ input: nextInput, pattern: nextPattern, flags: nextFlags, replacement: nextReplacement });
    return () => {
      window.clearTimeout(timeout);
      worker.terminate();
    };
  });
  const segs = $derived(result.error ? [] : regexSegments(input, result.matches));
</script>

<div class="page">
  <div class="options">
    <label class="field grow">
      <span>{t("表达式", "Pattern")}</span>
      <input class="dbx-input mono" spellcheck="false" placeholder="\\w+" bind:value={pattern} />
    </label>
    <label class="field replace">
      <span>{t("替换为", "Replace with")}</span>
      <input class="dbx-input mono" spellcheck="false" placeholder="$1" bind:value={replacement} />
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

  <label class="block">
    <span class="caption">{t("测试文本", "Test text")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" maxlength={INPUT_LIMITS.regex} bind:value={input}></textarea>
  </label>

  {#if result.error}
    <p class="error">{result.error}</p>
  {:else}
    <div class="preview" class:empty={!input}>
      {#if !input}
        <span class="hint">{t("输入文本后高亮匹配。", "Matches highlight as you type.")}</span>
      {:else}
        {#each segs as seg, i (`${i}-${seg.hit}`)}
          {#if seg.hit}<mark>{seg.text}</mark>{:else}{seg.text}{/if}
        {/each}
      {/if}
    </div>
    {#if pending}
      <p class="count" role="status">{t("正在匹配…", "Matching…")}</p>
    {:else}
      <p class="count">{t(`${result.matches.length} 处匹配`, `${result.matches.length} match(es)`)}</p>
    {/if}
    {#if result.truncated}<p class="count" role="status">{t("仅显示前 10,000 处匹配；替换结果仍处理全部匹配。", "Only the first 10,000 matches are shown; replacement still includes all matches.")}</p>{/if}
    <div class="replace-output">
      <div class="caption-row">
        <span class="caption">{t("替换结果", "Replacement result")}</span>
        <CopyButton {locale} text={result.replaced || ""} labelZh="复制结果" labelEn="Copy result" />
      </div>
      <textarea class="dbx-textarea replaced mono" readonly aria-label={t("替换结果", "Replacement result")} value={result.replaced || ""}></textarea>
    </div>
    {#if result.matches.length}
      <div class="table-wrap">
        <table class="dbx-table">
          <thead>
            <tr>
              <th>#</th>
              <th>index</th>
              <th>{t("文本", "Text")}</th>
              <th>groups</th>
            </tr>
          </thead>
          <tbody>
            {#each result.matches as m, i (i)}
              <tr>
                <td class="mono">{i + 1}</td>
                <td class="mono">{m.index}</td>
                <td class="mono">{m.text}</td>
                <td class="mono">{m.groups.filter(Boolean).join(", ")}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    flex: 1;
    min-height: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    margin: -6px 0 0;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 11px;
  }
  .count,
  .hint {
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    flex-shrink: 0;
  }
  .area {
    min-height: 88px;
    max-height: 160px;
  }
  .preview {
    flex: 1;
    min-height: 88px;
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
  .count {
    margin: 0;
    flex-shrink: 0;
  }
  .replace-output {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }
  .replaced {
    min-height: 72px;
    max-height: 150px;
    resize: vertical;
  }
  .table-wrap {
    max-height: 180px;
    overflow: auto;
    flex-shrink: 0;
  }
  .mono {
    font-family: var(--font-mono);
    word-break: break-all;
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
</style>
