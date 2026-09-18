<script>
  import { pick } from "./i18n.js";
  import { regexSegments, testRegex } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let pattern = $state("");
  let flags = $state("g");
  let input = $state("");

  const result = $derived.by(() => {
    if (!pattern) return { matches: [], error: "" };
    try {
      const next = testRegex(input, pattern, flags);
      return { ...next, error: "" };
    } catch (err) {
      return { matches: [], error: err?.message || String(err) };
    }
  });
  const segs = $derived(result.error ? [] : regexSegments(input, result.matches));
</script>

<div class="page">
  <div class="options">
    <label class="field grow">
      <span>{t("表达式", "Pattern")}</span>
      <input class="dbx-input mono" spellcheck="false" placeholder="\\w+" bind:value={pattern} />
    </label>
    <label class="field flags">
      <span>{t("标志", "Flags")}</span>
      <input class="dbx-input mono" spellcheck="false" placeholder="g" bind:value={flags} />
    </label>
  </div>

  <label class="block">
    <span class="caption">{t("测试文本", "Test text")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" bind:value={input}></textarea>
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
    <p class="count">{t(`${result.matches.length} 处匹配`, `${result.matches.length} match(es)`)}</p>
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
    flex-wrap: nowrap;
    gap: var(--ui-gap, 12px);
    align-items: flex-end;
    flex-shrink: 0;
    min-width: 0;
    max-width: 100%;
  }
  .grow {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 480px;
  }
  .grow .dbx-input {
    width: 100%;
    min-width: 0;
  }
  .flags {
    width: 6rem;
    flex: 0 0 6rem;
  }
  .flags .dbx-input {
    width: 100%;
    min-width: 0;
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
    background: color-mix(in srgb, var(--color-primary, #2563eb) 28%, transparent);
    color: inherit;
    border-radius: 2px;
  }
  .count {
    margin: 0;
    flex-shrink: 0;
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
    color: var(--color-destructive, #dc2626);
  }
</style>
