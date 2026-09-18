<script>
  import CopyButton from "./CopyButton.svelte";
  import { pick } from "./i18n.js";
  import { HASH_ALGORITHMS, hashText } from "./tools/generate.js";

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);

  let input = $state("");
  let digests = $state(Object.fromEntries(HASH_ALGORITHMS.map((alg) => [alg.id, ""])));
  let errors = $state({});

  $effect(() => {
    const text = input;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = {};
      const nextErrors = {};
      await Promise.all(
        HASH_ALGORITHMS.map(async (alg) => {
          try {
            next[alg.id] = await hashText(alg.id, text);
          } catch (err) {
            next[alg.id] = "";
            nextErrors[alg.id] = err?.message || String(err);
          }
        }),
      );
      if (cancelled) return;
      digests = next;
      errors = nextErrors;
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });
</script>

<div class="page">
  <label class="block">
    <span class="label">{t("输入", "Input")}</span>
    <textarea class="dbx-textarea area" spellcheck="false" bind:value={input}></textarea>
  </label>

  <div class="rows">
    {#each HASH_ALGORITHMS as alg (alg.id)}
      <div class="row">
        <span class="name">{alg.label}</span>
        <input
          class="dbx-input mono"
          class:invalid={Boolean(errors[alg.id])}
          readonly
          placeholder={errors[alg.id] || ""}
          title={errors[alg.id] || ""}
          value={digests[alg.id]}
        />
        <CopyButton {locale} text={digests[alg.id]} labelZh={`复制 ${alg.label}`} labelEn={`Copy ${alg.label}`} />
      </div>
    {/each}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 720px;
  }
  .block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .area {
    min-height: 96px;
    max-height: 240px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .name {
    font-size: 12px;
    font-weight: 500;
  }
  .invalid {
    border-color: var(--color-destructive, #dc2626);
    color: var(--color-destructive, #dc2626);
  }

  @media (max-width: 560px) {
    .row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .name {
      grid-column: 1 / -1;
    }
  }
</style>
