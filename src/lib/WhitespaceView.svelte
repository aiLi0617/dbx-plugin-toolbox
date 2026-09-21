<script>
  import IoSplit from "./IoSplit.svelte";
  import { pick } from "./i18n.js";
  import { applyWhitespace, LINE_ROW_MODES, LINE_SPACE_MODES, PUNCT_MODES, TEXT_CLEANUP_KINDS } from "./tools/text.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let kind = $state("lines");
  let lineMode = $state("trim");
  let punctMode = $state("full");
  let affix = $state("");
  let find = $state("");
  let replace = $state("");
  let input = $state("");

  const mode = $derived(kind === "replace" ? "replace" : kind === "punct" ? punctMode : lineMode);
  const output = $derived(applyWhitespace(input, mode, { affix, find, replace }));
</script>

<div class="page">
  <div class="options">
    <div class="field">
      <span>{t("类型", "Kind")}</span>
      <div class="seg" role="group" aria-label={t("类型", "Kind")}>
        {#each TEXT_CLEANUP_KINDS as item (item.value)}
          <button
            class:active={kind === item.value}
            aria-pressed={kind === item.value}
            onclick={() => (kind = item.value)}
            type="button"
          >{t(item.zh, item.en)}</button>
        {/each}
      </div>
    </div>

    {#if kind === "lines"}
      <div class="field">
        <span>{t("空白", "Space")}</span>
        <div class="seg" role="group" aria-label={t("空白", "Space")}>
          {#each LINE_SPACE_MODES as item (item.value)}
            <button
              class:active={lineMode === item.value}
              aria-pressed={lineMode === item.value}
              onclick={() => (lineMode = item.value)}
              type="button"
            >{t(item.zh, item.en)}</button>
          {/each}
        </div>
      </div>
      <div class="field">
        <span>{t("行", "Lines")}</span>
        <div class="seg" role="group" aria-label={t("行", "Lines")}>
          {#each LINE_ROW_MODES as item (item.value)}
            <button
              class:active={lineMode === item.value}
              aria-pressed={lineMode === item.value}
              onclick={() => (lineMode = item.value)}
              type="button"
            >{t(item.zh, item.en)}</button>
          {/each}
        </div>
      </div>
      {#if lineMode === "prefix" || lineMode === "suffix"}
        <label class="field">
          <span>{t("前后缀", "Affix")}</span>
          <input class="dbx-input" bind:value={affix} />
        </label>
      {/if}
    {:else if kind === "replace"}
      <label class="field grow">
        <span>{t("查找", "Find")}</span>
        <input class="dbx-input" placeholder={t("查找", "Find")} bind:value={find} />
      </label>
      <label class="field grow">
        <span>{t("替换", "Replace")}</span>
        <input class="dbx-input" placeholder={t("替换", "Replace")} bind:value={replace} />
      </label>
    {:else}
      <div class="field">
        <span>{t("方向", "Direction")}</span>
        <div class="seg" role="group" aria-label={t("方向", "Direction")}>
          {#each PUNCT_MODES as item (item.value)}
            <button
              class:active={punctMode === item.value}
              aria-pressed={punctMode === item.value}
              onclick={() => (punctMode = item.value)}
              type="button"
            >{t(item.zh, item.en)}</button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
  <IoSplit {locale} bind:input {output} />
</div>

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
  .field .dbx-input {
    width: auto;
    min-width: 160px;
  }
  .grow {
    flex: 1 1 160px;
    min-width: 160px;
  }
  .grow .dbx-input {
    width: 100%;
  }
  .seg {
    display: inline-flex;
    height: 30px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    width: fit-content;
    max-width: 100%;
  }
  .seg button {
    height: 100%;
    padding: 0 10px;
    border: 0;
    border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 18%, transparent));
    background: var(--color-background, Canvas);
    color: inherit;
    font: inherit;
    font-size: 13px;
    white-space: nowrap;
    cursor: pointer;
  }
  .seg button:last-child {
    border-right: 0;
  }
  .seg button:hover:not(.active) {
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
  }
  .seg button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
</style>
