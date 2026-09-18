<script>
  import IoSplit from "./IoSplit.svelte";
  import Select from "./Select.svelte";
  import { pick } from "./i18n.js";
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
      return { text: "", error: err?.message || String(err) };
    }
  });
</script>

{#if spec}
  <div class="page">
    {#if spec.options?.length}
      <div class="options">
        {#each spec.options as opt (opt.key)}
          {#if !opt.visibleWhen || opt.visibleWhen.values.includes(optionValues[opt.visibleWhen.key])}
            {#if opt.type === "checkbox"}
              <label class="check">
                <input type="checkbox" bind:checked={optionValues[opt.key]} />
                <span>{t(opt.zh, opt.en)}</span>
              </label>
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
      inputLabel={t(spec.inputZh, spec.inputEn)}
      outputLabel={t(spec.outputZh, spec.outputEn)}
    />
  </div>
{/if}

<style>
  .page {
    flex: 1;
    min-height: 0;
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
  }
  .field :global(.dbx-label) {
    color: var(--color-muted-foreground);
  }
  .field :global(.dbx-select),
  .field .dbx-input {
    width: auto;
    min-width: 160px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground);
    cursor: pointer;
  }
  .check input {
    margin: 0;
  }
</style>
