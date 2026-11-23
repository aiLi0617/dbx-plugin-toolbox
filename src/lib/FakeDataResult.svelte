<script>
  import { onDestroy, untrack } from "svelte";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { copyText } from "./clipboard.js";
  import { formatFakeRows } from "./fakeData.js";
  import { FAKE_DATA_COPY, FAKE_DATA_RESULT_COPY as copy } from "./fakeDataCopy.js";
  import { chrome, pick } from "./i18n.js";

  let { locale, rows, format = $bindable("json"), stale } = $props();
  const label = (message) => pick(locale, message);
  const t = (zh, en) => pick(locale, zh, en);
  const perPage = 50;
  const formats = ["json", "csv", "tsv", "ndjson"].map((value) => ({ value, label: value.toUpperCase() }));
  let showTable = $state(true);
  let page = $state(0);
  let viewport = $state(null);
  let feedback = $state(null);
  let copyTimer;
  let copyRequest = 0;

  const viewOptions = $derived([{ value: "table", label: label(copy.table) }, ...formats]);
  const columns = $derived(Object.keys(rows[0] ?? {}));
  const lastPage = $derived(Math.max(0, Math.ceil(rows.length / perPage) - 1));
  const offset = $derived(Math.min(page, lastPage) * perPage);
  const visibleRows = $derived(showTable ? rows.slice(offset, offset + perPage) : []);
  const output = $derived(!showTable && rows.length ? formatFakeRows(rows, format) : "");
  const copyAll = $derived(`${label(copy.copyAll)} (${format.toUpperCase()})`);
  const status = $derived(feedback
    ? label(feedback.failed ? chrome.copyFailed : chrome.copied)
    : stale ? label(FAKE_DATA_COPY.stale) : "");

  $effect(() => {
    void rows;
    page = 0;
    untrack(() => viewport?.scrollTo({ top: 0, left: 0 }));
    resetFeedback();
  });

  function resetFeedback() {
    copyRequest += 1;
    clearTimeout(copyTimer);
    feedback = null;
  }

  function changeView(value) {
    showTable = value === "table";
    if (!showTable) format = value;
    resetFeedback();
  }

  function movePage(step) {
    page = Math.min(lastPage, Math.max(0, page + step));
    viewport?.scrollTo({ top: 0 });
    resetFeedback();
  }

  async function copyCell(value, rowIndex, column) {
    const request = ++copyRequest;
    clearTimeout(copyTimer);
    feedback = null;
    let failed = false;
    try {
      await copyText(String(value));
    } catch {
      failed = true;
    }
    if (request !== copyRequest) return;
    feedback = { rowIndex, column, failed };
    copyTimer = setTimeout(resetFeedback, failed ? 3500 : 2200);
  }

  onDestroy(() => {
    copyRequest += 1;
    clearTimeout(copyTimer);
  });
</script>

<section class="result">
  <header>
    <div class="result-heading">
      <h3>{t("结果", "Result")}</h3>
      <span class="result-status" class:failed={feedback?.failed} role="status" title={status || undefined}>{status}</span>
    </div>
    <div class="result-actions">
      <Select value={showTable ? "table" : format} options={viewOptions} ariaLabel={label(copy.view)} onchange={changeView} />
      <CopyButton {locale} label={{ en: copyAll }} getText={() => output || formatFakeRows(rows, format)} disabled={!rows.length} />
    </div>
  </header>

  {#if showTable}
    <div class="result-viewport" bind:this={viewport} role="region" aria-label={label(copy.table)}>
      {#if rows.length}
        <table aria-label={t("结果", "Result")}>
          <thead>
            <tr>
              <th class="record-number" scope="col">#</th>
              {#each columns as column (column)}<th scope="col"><span>{column}</span></th>{/each}
            </tr>
          </thead>
          <tbody>
            {#each visibleRows as row, index}
              {@const rowIndex = offset + index}
              <tr>
                <th class="record-number" scope="row">{rowIndex + 1}</th>
                {#each columns as column (column)}
                  {@const value = row[column]}
                  {@const copied = feedback?.rowIndex === rowIndex && feedback.column === column && !feedback.failed}
                  <td>
                    <button class="result-cell" class:copied class:is-empty={value === ""} type="button"
                      title={label(copied ? chrome.copied : copy.copyValue)} onclick={() => copyCell(value, rowIndex, column)}>
                      <span>{value === "" ? label(copy.emptyString) : String(value)}</span>
                      {#if copied}
                        <svg class="copied-mark" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                          <path d="m3.5 8 3 3 6-6" />
                        </svg>
                      {/if}
                    </button>
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="empty">{label(copy.empty)}</p>
      {/if}
    </div>
    {#if lastPage > 0}
      <footer>
        <span>{offset + 1}–{Math.min(offset + perPage, rows.length)} / {rows.length}</span>
        <button class="dbx-btn dbx-btn--ghost" type="button" aria-label={label(copy.previous)} title={label(copy.previous)}
          disabled={page === 0} onclick={() => movePage(-1)}>‹</button>
        <button class="dbx-btn dbx-btn--ghost" type="button" aria-label={label(copy.next)} title={label(copy.next)}
          disabled={page === lastPage} onclick={() => movePage(1)}>›</button>
      </footer>
    {/if}
  {:else}
    <textarea class="dbx-textarea mono" aria-label={t("结果", "Result")} value={output} readonly spellcheck="false"></textarea>
  {/if}
</section>

<style>
  .result {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 360px;
    height: 100%;
    max-height: max(360px, 100%);
    padding: 14px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-card);
  }
  header, .result-heading, .result-actions { display: flex; align-items: center; gap: 6px; }
  header { justify-content: space-between; gap: 8px; }
  .result-heading { flex: 1; min-width: 0; }
  h3 { flex: none; margin: 0; font-size: 14px; }
  .result-actions { flex: none; }
  .result-actions :global(.dbx-custom-select) { width: 90px; min-width: 0; }
  .result-status {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-muted-foreground);
    font-size: 11px;
  }
  .result-status.failed { color: var(--color-destructive); }
  .result-viewport, textarea { flex: 1; min-height: 240px; }
  .result-viewport {
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-background);
  }
  textarea { resize: none; white-space: pre; }
  table { min-width: 100%; border-collapse: separate; border-spacing: 0; text-align: start; font-size: 12px; }
  thead { position: sticky; top: 0; z-index: 1; }
  th, td { padding: 0; border-bottom: 1px solid var(--color-border); }
  th + th, td { border-inline-start: 1px solid var(--color-border); }
  tbody tr:last-child > * { border-bottom: 0; }
  thead th { padding: 8px 10px; background: var(--color-muted); text-align: start; font-weight: 600; }
  thead th span { display: block; max-width: 22rem; overflow-wrap: anywhere; }
  .record-number { width: 1%; padding-inline: 10px; color: var(--color-muted-foreground); text-align: end; font-weight: 400; }
  .result-cell {
    position: relative;
    display: block;
    width: 100%;
    min-width: 5rem;
    padding: 8px 26px 8px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font: 12px/1.45 var(--font-mono);
    text-align: start;
    cursor: pointer;
  }
  .result-cell span {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    max-width: 22rem;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .result-cell:hover:not(.copied) { background: var(--dbx-hover-background); }
  td:has(> .result-cell.copied) { background: var(--color-success-bg); }
  .copied-mark {
    position: absolute;
    top: 50%;
    inset-inline-end: 8px;
    transform: translateY(-50%);
    color: var(--color-success);
  }
  .result-cell:focus-visible, .result-viewport:focus-visible { outline: 1px solid var(--color-ring, var(--color-primary)); outline-offset: -1px; }
  .result-cell.is-empty, .empty, footer { color: var(--color-muted-foreground); }
  .empty { margin: 0; padding: 14px; font-size: 12px; }
  footer { display: flex; align-items: center; justify-content: flex-end; gap: 6px; font-size: 12px; }
  footer button { width: 26px; padding: 0; font-size: 16px; }
  @media (max-width: 860px) {
    .result { position: static; height: auto; max-height: none; }
    .result-viewport { max-height: 360px; min-height: 0; }
    textarea { min-height: 300px; }
  }
  @media (max-width: 400px) { .result { padding: 10px; } }
</style>
