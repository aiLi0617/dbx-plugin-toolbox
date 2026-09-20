<script>
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { localizeError, pick } from "./i18n.js";
  import { LIVE_IO_TOOLS } from "./liveIo.js";

  let { locale = "zh-CN", toolId = "quoted-printable" } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const spec = $derived(LIVE_IO_TOOLS[toolId]);

  let input = $state("");
  let optionValues = $state({});

  $effect(() => {
    optionValues = { ...(LIVE_IO_TOOLS[toolId]?.defaults || {}) };
  });

  const result = $derived.by(() => {
    if (!spec) return { text: "", error: "" };
    try {
      return { text: spec.transform(input, optionValues) || "", error: "" };
    } catch (err) {
      return { text: "", error: localizeError(locale, err) };
    }
  });

  const labels = $derived.by(() => {
    if (!spec) return { input: "", output: "", inputPlaceholder: "", outputPlaceholder: "" };
    const resolved = typeof spec.labels === "function" ? spec.labels(optionValues) : null;
    return {
      input: t(resolved?.inputZh ?? spec.inputZh, resolved?.inputEn ?? spec.inputEn),
      output: t(resolved?.outputZh ?? spec.outputZh, resolved?.outputEn ?? spec.outputEn),
      inputPlaceholder: t(
        resolved?.inputPlaceholderZh ?? spec.inputPlaceholderZh ?? "",
        resolved?.inputPlaceholderEn ?? spec.inputPlaceholderEn ?? "",
      ),
      outputPlaceholder: t(
        resolved?.outputPlaceholderZh ?? spec.outputPlaceholderZh ?? "输入后自动转换",
        resolved?.outputPlaceholderEn ?? spec.outputPlaceholderEn ?? "Updates as you type",
      ),
    };
  });

  function useAsSegment(opt) {
    return opt.type === "select" && (opt.ui === "segment" || (opt.values?.length ?? 0) <= 3);
  }
</script>

{#if spec}
  <div class="page">
    {#if spec.options?.length}
      <div class="options">
        {#each spec.options as opt (opt.key)}
          {#if Object.hasOwn(optionValues, opt.key) && (!opt.visibleWhen || opt.visibleWhen.values.includes(optionValues[opt.visibleWhen.key]))}
            {#if opt.type === "checkbox"}
              <label class="check">
                <input type="checkbox" bind:checked={optionValues[opt.key]} />
                <span>{t(opt.zh, opt.en)}</span>
              </label>
            {:else if useAsSegment(opt)}
              <div class="seg" role="tablist" aria-label={t(opt.zh, opt.en)}>
                {#each opt.values as value (value.value)}
                  <button
                    class:active={optionValues[opt.key] === value.value}
                    aria-selected={optionValues[opt.key] === value.value}
                    onclick={() => (optionValues = { ...optionValues, [opt.key]: value.value })}
                    role="tab"
                    type="button"
                  >{t(value.zh, value.en)}</button>
                {/each}
              </div>
            {:else}
              <label class="field">
                <span class="dbx-label">{t(opt.zh, opt.en)}</span>
                {#if opt.type === "select"}
                  <Select
                    bind:value={optionValues[opt.key]}
                    options={opt.values.map((value) => ({ value: value.value, label: t(value.zh, value.en) }))}
                  />
                {:else}
                  <input class="dbx-input" type="text" placeholder={opt.placeholder || ""} bind:value={optionValues[opt.key]} />
                {/if}
              </label>
            {/if}
          {/if}
        {/each}
      </div>
    {/if}
    <IoSplit
      {locale}
      bind:input
      output={result.text}
      error={result.error}
      inputLabel={labels.input}
      outputLabel={labels.output}
      inputPlaceholder={labels.inputPlaceholder}
      outputPlaceholder={labels.outputPlaceholder}
    />
  </div>
{/if}

<style>
  .page {
    container-type: inline-size;
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 12px;
    align-items: center;
    flex-shrink: 0;
    min-height: 28px;
  }
  .field :global(.dbx-label) {
    color: var(--color-muted-foreground);
  }
  .field :global(.dbx-custom-select),
  .field .dbx-input {
    width: auto;
    min-width: 160px;
  }
  .seg {
    display: inline-flex;
    flex-wrap: wrap;
    flex-shrink: 0;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
    max-width: 100%;
  }
  .seg button {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .seg button:last-child { border-right: 0; }
  .seg button:hover:not(.active) {
    background: var(--color-muted, color-mix(in srgb, CanvasText 6%, transparent));
  }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground);
    cursor: pointer;
  }
  .check input {
    margin: 0;
  }
</style>
