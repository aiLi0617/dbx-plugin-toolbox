<script>
  import { tick } from "svelte";
  import Select from "./Select.svelte";
  import { toBase64 } from "./codec.js";
  import { invoke } from "./host.js";
  import { pick } from "./i18n.js";
  import { csvToGrid, gridToCsv, gridToObjects, gridToTsv, objectsToGrid, readXlsx, spreadsheetLimits, tsvToGrid, writeXlsx } from "./spreadsheet.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let sheets = $state([{ name: "Sheet1", rows: [["列1", "列2", "列3"], ["", "", ""]] }]);
  let activeIndex = $state(0);
  let firstRowHeader = $state(true);
  let busy = $state(false);
  let error = $state("");
  let fileName = $state("");
  let searchQuery = $state("");
  let undoStack = $state([]);
  let redoStack = $state([]);
  let renameOpen = $state(false);
  let renameValue = $state("");
  let renameInput = $state(null);
  let deleteOpen = $state(false);
  const active = $derived(sheets[activeIndex] || sheets[0]);
  const sheetOptions = $derived(sheets.map((sheet, index) => ({ value: String(index), label: sheet.name })));
  const width = $derived(Math.max(1, ...(active?.rows || []).map((row) => row.length)));
  const rowCount = $derived(active?.rows?.length || 0);
  const visibleRows = $derived((active?.rows || []).map((row, rowIndex) => ({ row, rowIndex })).filter(({ row }) => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return !query || row.some((cell) => String(cell ?? "").toLocaleLowerCase().includes(query));
  }));

  function cloneSheets(value) {
    return value.map((sheet) => ({ name: sheet.name, rows: sheet.rows.map((row) => [...row]) }));
  }
  function applySheets(next, record = true) {
    if (record) {
      undoStack = [...undoStack.slice(-49), cloneSheets(sheets)];
      redoStack = [];
    }
    sheets = next;
    activeIndex = Math.min(activeIndex, Math.max(0, next.length - 1));
  }
  function resetSheets(next) {
    sheets = next;
    activeIndex = 0;
    undoStack = [];
    redoStack = [];
  }
  function undo() {
    const previous = undoStack.at(-1);
    if (!previous) return;
    redoStack = [...redoStack, cloneSheets(sheets)];
    undoStack = undoStack.slice(0, -1);
    sheets = cloneSheets(previous);
    activeIndex = Math.min(activeIndex, sheets.length - 1);
  }
  function redo() {
    const next = redoStack.at(-1);
    if (!next) return;
    undoStack = [...undoStack, cloneSheets(sheets)];
    redoStack = redoStack.slice(0, -1);
    sheets = cloneSheets(next);
    activeIndex = Math.min(activeIndex, sheets.length - 1);
  }

  function updateCell(rowIndex, columnIndex, value) {
    const next = sheets.map((sheet, index) => index === activeIndex
      ? { ...sheet, rows: sheet.rows.map((row, rowAt) => rowAt === rowIndex
        ? Array.from({ length: Math.max(width, columnIndex + 1) }, (_, colAt) => colAt === columnIndex ? value : row[colAt] ?? "")
        : row) }
      : sheet);
    applySheets(next);
  }
  function addRow() {
    if (rowCount >= spreadsheetLimits.rows) return;
    applySheets(sheets.map((sheet, index) => index === activeIndex ? { ...sheet, rows: [...sheet.rows, Array(width).fill("")] } : sheet));
  }
  function addColumn() {
    if (width >= spreadsheetLimits.columns) return;
    applySheets(sheets.map((sheet, index) => index === activeIndex
      ? { ...sheet, rows: (sheet.rows.length ? sheet.rows : [[]]).map((row) => [...row, ""]) }
      : sheet));
  }
  function deleteRow(index) {
    applySheets(sheets.map((sheet, sheetIndex) => sheetIndex === activeIndex ? { ...sheet, rows: sheet.rows.filter((_, rowIndex) => rowIndex !== index) } : sheet));
  }
  function deleteColumn(index) {
    applySheets(sheets.map((sheet, sheetIndex) => sheetIndex === activeIndex
      ? { ...sheet, rows: sheet.rows.map((row) => row.filter((_, columnIndex) => columnIndex !== index)) }
      : sheet));
  }
  function addSheet() {
    const used = new Set(sheets.map((sheet) => sheet.name.toLocaleLowerCase()));
    let name = `Sheet${sheets.length + 1}`;
    for (let suffix = 2; used.has(name.toLocaleLowerCase()); suffix += 1) name = `Sheet${sheets.length + 1}_${suffix}`;
    applySheets([...sheets, { name, rows: [["", "", ""]] }]);
    activeIndex = sheets.length - 1;
  }
  async function openRename() {
    error = "";
    renameValue = active?.name || "Sheet1";
    renameOpen = true;
    deleteOpen = false;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }
  function closeDialogs() {
    renameOpen = false;
    deleteOpen = false;
  }
  function submitRename() {
    const proposed = renameValue.trim();
    if (!proposed) {
      error = t("工作表名称不能为空。", "Worksheet name cannot be empty.");
      return;
    }
    const current = active?.name || "Sheet1";
    if (proposed === current) {
      closeDialogs();
      return;
    }
    if (sheets.some((sheet, index) => index !== activeIndex && sheet.name.toLocaleLowerCase() === proposed.toLocaleLowerCase())) {
      error = t("工作表名称不能重复。", "Worksheet names must be unique.");
      return;
    }
    error = "";
    applySheets(sheets.map((sheet, index) => index === activeIndex ? { ...sheet, name: proposed.slice(0, 31) } : sheet));
    closeDialogs();
  }
  function openDelete() {
    if (sheets.length <= 1) return;
    error = "";
    deleteOpen = true;
    renameOpen = false;
  }
  function confirmDelete() {
    if (sheets.length <= 1) {
      closeDialogs();
      return;
    }
    applySheets(sheets.filter((_, index) => index !== activeIndex));
    closeDialogs();
  }
  function onPaste(event, rowIndex, columnIndex) {
    const text = event.clipboardData?.getData("text/plain");
    if (text == null || (!text.includes("\t") && !text.includes("\n") && !text.includes("\r"))) return;
    event.preventDefault();
    const pasted = tsvToGrid(text);
    if (!pasted.length) return;
    const nextRows = active.rows.map((row) => [...row]);
    for (let rowOffset = 0; rowOffset < pasted.length && rowIndex + rowOffset < spreadsheetLimits.rows; rowOffset += 1) {
      const source = pasted[rowOffset];
      const target = nextRows[rowIndex + rowOffset] || [];
      for (let columnOffset = 0; columnOffset < source.length && columnIndex + columnOffset < spreadsheetLimits.columns; columnOffset += 1) {
        target[columnIndex + columnOffset] = source[columnOffset] ?? "";
      }
      nextRows[rowIndex + rowOffset] = target;
    }
    applySheets(sheets.map((sheet, index) => index === activeIndex ? { ...sheet, rows: nextRows } : sheet));
  }
  async function onFile(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    error = ""; busy = true;
    try {
      if (file.size > spreadsheetLimits.fileBytes) throw new Error(t("表格文件不能超过 50 MB。", "The spreadsheet must be 50 MB or smaller."));
      const extension = file.name.split(".").pop()?.toLowerCase();
      let next;
      if (extension === "xlsx") next = await readXlsx(await file.arrayBuffer());
      else if (extension === "csv") next = [{ name: file.name.replace(/\.csv$/i, "") || "Sheet1", rows: csvToGrid(await file.text()) }];
      else if (extension === "tsv") next = [{ name: file.name.replace(/\.tsv$/i, "") || "Sheet1", rows: tsvToGrid(await file.text()) }];
      else if (extension === "json") next = [{ name: file.name.replace(/\.json$/i, "") || "Sheet1", rows: objectsToGrid(JSON.parse(await file.text())) }];
      else throw new Error(t("请选择 XLSX、CSV、TSV 或 JSON 文件。", "Choose an XLSX, CSV, TSV, or JSON file."));
      resetSheets(next.map((sheet) => ({ ...sheet, rows: sheet.rows.length ? sheet.rows : [[""]] })));
      fileName = file.name; searchQuery = "";
    } catch (cause) { error = String(cause.message || cause); }
    finally { busy = false; }
  }
  function inPluginHost() {
    return Boolean(window.dbxPlugin?.invoke);
  }
  function browserDownload(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function saveExport(bytes, name, mimeType, title, extension) {
    error = "";
    busy = true;
    try {
      if (inPluginHost()) {
        const result = await invoke(
          "toolbox/save-file",
          { fileName: name, mimeType, extension, data: toBase64(bytes), title, binary: true },
          120000,
        );
        if (result?.cancelled) return;
        return;
      }
      browserDownload(bytes, name, mimeType);
    } catch (cause) {
      error = String(cause.message || cause) || t("导出失败。", "Export failed.");
    } finally {
      busy = false;
    }
  }
  async function exportXlsx() {
    error = "";
    busy = true;
    try {
      const bytes = await writeXlsx(sheets);
      const fileName = `${active?.name || "table"}.xlsx`;
      if (inPluginHost()) {
        const result = await invoke(
          "toolbox/save-file",
          {
            fileName,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            extension: "xlsx",
            data: toBase64(bytes),
            title: t("导出 XLSX", "Export XLSX"),
            binary: true,
          },
          120000,
        );
        if (result?.cancelled) return;
        return;
      }
      browserDownload(bytes, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (cause) {
      error = String(cause.message || cause) || t("导出失败。", "Export failed.");
    } finally {
      busy = false;
    }
  }
  function textBytes(text) {
    return new TextEncoder().encode(text);
  }
  async function exportCsv() {
    await saveExport(textBytes(`\uFEFF${gridToCsv(active.rows)}`), `${active.name}.csv`, "text/csv", t("导出 CSV", "Export CSV"), "csv");
  }
  async function exportTsv() {
    await saveExport(textBytes(`\uFEFF${gridToTsv(active.rows)}`), `${active.name}.tsv`, "text/tab-separated-values", t("导出 TSV", "Export TSV"), "tsv");
  }
  async function exportJson() {
    await saveExport(
      textBytes(JSON.stringify(gridToObjects(active.rows, firstRowHeader), null, 2)),
      `${active.name}.json`,
      "application/json",
      t("导出 JSON", "Export JSON"),
      "json",
    );
  }
  function columnName(index) {
    let name = "";
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }
  function onDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialogs();
      return;
    }
    if (event.key === "Enter" && renameOpen) {
      event.preventDefault();
      submitRename();
    }
  }
</script>

<div class="page">
  <div class="controls">
    <div class="toolbar-row">
      <div class="group">
        <label class="dbx-btn file-button">
          {busy ? t("处理中…", "Working…") : t("打开表格", "Open spreadsheet")}
          <input type="file" accept=".xlsx,.csv,.tsv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,application/json" onchange={onFile} disabled={busy} />
        </label>
        <label class="field">
          <span>{t("工作表", "Worksheet")}</span>
          <Select value={String(activeIndex)} options={sheetOptions} onchange={(value) => (activeIndex = Number(value))} />
        </label>
        <div class="btn-cluster" role="group" aria-label={t("工作表操作", "Worksheet actions")}>
          <button class="dbx-btn" type="button" onclick={addSheet} disabled={busy} title={t("新增工作表", "New sheet")}>{t("新增", "New")}</button>
          <button class="dbx-btn" type="button" onclick={openRename} disabled={busy} title={t("重命名工作表", "Rename sheet")}>{t("重命名", "Rename")}</button>
          <button class="dbx-btn" type="button" onclick={openDelete} disabled={busy || sheets.length <= 1} title={t("删除工作表", "Delete sheet")}>{t("删除", "Delete")}</button>
        </div>
      </div>
      <span class="divider" aria-hidden="true"></span>
      <div class="group history" role="group" aria-label={t("编辑历史", "Edit history")}>
        <button class="dbx-btn" type="button" onclick={undo} disabled={!undoStack.length} title={t("撤销上一步更改", "Undo last change")}>{t("撤销", "Undo")}</button>
        <button class="dbx-btn" type="button" onclick={redo} disabled={!redoStack.length} title={t("恢复刚才撤销的更改", "Restore the undone change")}>{t("恢复", "Redo")}</button>
      </div>
      <span class="spacer"></span>
      <div class="group export" role="group" aria-label={t("导出", "Export")}>
        <div class="btn-cluster">
          <button class="dbx-btn" type="button" onclick={exportCsv} disabled={busy} title={t("导出 CSV", "Export CSV")}>CSV</button>
          <button class="dbx-btn" type="button" onclick={exportTsv} disabled={busy} title={t("导出 TSV", "Export TSV")}>TSV</button>
          <button class="dbx-btn" type="button" onclick={exportJson} disabled={busy} title={t("导出 JSON", "Export JSON")}>JSON</button>
        </div>
        <button class="dbx-btn dbx-btn--primary" type="button" onclick={exportXlsx} disabled={busy}>{t("导出 XLSX", "Export XLSX")}</button>
      </div>
    </div>
    <div class="toolbar-row secondary">
      <label class="search">
        <span>{t("搜索", "Search")}</span>
        <input class="dbx-input" type="search" placeholder={t("筛选单元格", "Filter cells")} bind:value={searchQuery} />
      </label>
      <label class="check"><input type="checkbox" bind:checked={firstRowHeader} /> {t("首行作为 JSON 列名", "Use first row as JSON headers")}</label>
      <span class="dbx-hint local-hint">{t("文件只在本机内存中处理，不会上传。", "Files are processed locally in memory and are not uploaded.")}</span>
    </div>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="notice info">
    {t("以数据表方式编辑：导入 XLSX 时读取单元格值，重新导出不会保留原文件的公式、样式、图片和合并单元格。", "Data-table editing: XLSX import reads cell values. Re-exporting does not preserve formulas, styles, images, or merged cells from the original file.")}
  </p>

  <div class="sheet-panel">
    <div class="meta">
      <div class="meta-title">
        <strong>{fileName || t("新建表格", "New spreadsheet")}</strong>
        {#if fileName}<span class="meta-sheet">{active?.name}</span>{/if}
      </div>
      <span class="meta-stats">{rowCount} {t("行", "rows")} · {width} {t("列", "columns")}{#if searchQuery.trim()} · {t("已筛选", "Filtered")}{/if}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th class="corner"></th>{#each Array(width) as _, column}<th><span>{columnName(column)}</span><button title={t("删除此列", "Delete column")} onclick={() => deleteColumn(column)} type="button">×</button></th>{/each}</tr></thead>
        <tbody>
          {#each visibleRows as item (item.rowIndex)}
            {@const row = item.row}
            {@const rowIndex = item.rowIndex}
            <tr class:header-row={firstRowHeader && rowIndex === 0}>
              <th class="row-head"><span>{rowIndex + 1}</span><button title={t("删除此行", "Delete row")} onclick={() => deleteRow(rowIndex)} type="button">×</button></th>
              {#each Array(width) as _, columnIndex}<td><input value={row[columnIndex] ?? ""} onchange={(event) => updateCell(rowIndex, columnIndex, event.currentTarget.value)} onpaste={(event) => onPaste(event, rowIndex, columnIndex)} aria-label={`${columnName(columnIndex)}${rowIndex + 1}`} /></td>{/each}
            </tr>
          {/each}
          {#if !visibleRows.length}<tr><td class="empty" colspan={width + 1}>{t("没有匹配的单元格。", "No matching cells.")}</td></tr>{/if}
        </tbody>
      </table>
    </div>
    <div class="footer-actions">
      <button class="dbx-btn" type="button" onclick={addRow} disabled={rowCount >= spreadsheetLimits.rows}>{t("添加一行", "Add row")}</button>
      <button class="dbx-btn" type="button" onclick={addColumn} disabled={width >= spreadsheetLimits.columns}>{t("添加一列", "Add column")}</button>
    </div>
  </div>

  {#if renameOpen || deleteOpen}
    <div class="overlay" role="presentation" onclick={closeDialogs} onkeydown={onDialogKeydown}>
      {#if renameOpen}
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="sheet-rename-title" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={onDialogKeydown}>
          <strong id="sheet-rename-title">{t("重命名工作表", "Rename worksheet")}</strong>
          <label class="field">
            <span>{t("名称", "Name")}</span>
            <input class="dbx-input" bind:this={renameInput} bind:value={renameValue} maxlength="31" />
          </label>
          <div class="dialog-actions">
            <button class="dbx-btn dbx-btn--primary" type="button" onclick={submitRename}>{t("确定", "OK")}</button>
            <button class="dbx-btn dbx-btn--ghost" type="button" onclick={closeDialogs}>{t("取消", "Cancel")}</button>
          </div>
        </div>
      {:else}
        <div class="dialog danger" role="dialog" aria-modal="true" aria-labelledby="sheet-delete-title" tabindex="-1" onclick={(event) => event.stopPropagation()} onkeydown={onDialogKeydown}>
          <strong id="sheet-delete-title">{t("删除工作表", "Delete worksheet")}</strong>
          <p>{t(`确定删除「${active?.name || ""}」？删除后可用撤销恢复。`, `Delete “${active?.name || ""}”? You can undo this.`)}</p>
          <div class="dialog-actions">
            <button class="dbx-btn dbx-btn--danger" type="button" onclick={confirmDelete}>{t("删除", "Delete")}</button>
            <button class="dbx-btn dbx-btn--ghost" type="button" onclick={closeDialogs}>{t("取消", "Cancel")}</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .page {
    container-type: inline-size;
    position: relative;
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 8px);
    background: var(--color-card, var(--color-background));
  }
  .toolbar-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
    min-width: 0;
  }
  .toolbar-row.secondary { align-items: center; }
  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
    min-width: 0;
  }
  .group.history { align-items: center; }
  .group.export { margin-left: auto; align-items: center; }
  .divider {
    display: none;
    width: 1px;
    height: 30px;
    margin: 0 2px;
    background: var(--color-border);
    align-self: flex-end;
  }
  .spacer { flex: 1 1 8px; min-width: 8px; }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground);
  }
  .field :global(.dbx-select) { min-width: 140px; }
  .search {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground);
  }
  .search input {
    width: min(220px, 100%);
    min-width: 160px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .local-hint { margin-left: auto; }
  .btn-cluster {
    display: inline-flex;
    align-items: stretch;
  }
  .btn-cluster .dbx-btn {
    border-radius: 0;
    margin-left: -1px;
  }
  .btn-cluster .dbx-btn:first-child {
    margin-left: 0;
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }
  .btn-cluster .dbx-btn:last-child {
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }
  .btn-cluster .dbx-btn:focus-visible { z-index: 1; }
  .file-button { position: relative; overflow: hidden; cursor: pointer; }
  .file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .notice {
    margin: 0;
    flex-shrink: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    padding: 8px 12px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-muted-foreground);
  }
  .notice.info {
    border-color: color-mix(in srgb, var(--color-info) 40%, var(--color-border));
    background: var(--color-info-bg);
    color: color-mix(in srgb, var(--color-info) 55%, var(--color-foreground));
  }
  .sheet-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 8px);
    background: var(--color-card, var(--color-background));
    overflow: hidden;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
    flex-shrink: 0;
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-muted) 55%, var(--color-background));
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .meta-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .meta-title strong {
    color: var(--color-foreground);
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta-sheet {
    flex-shrink: 0;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font-size: 11px;
    font-weight: 500;
  }
  .meta-stats {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .table-wrap {
    flex: 1;
    min-height: 260px;
    overflow: auto;
    background: var(--color-background);
  }
  table { min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  th, td { min-width: 140px; height: 34px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); padding: 0; }
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    min-width: 140px;
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font: 600 11px var(--font-sans);
  }
  th.corner { left: 0; z-index: 4; min-width: 46px; width: 46px; }
  .row-head {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 46px;
    width: 46px;
    background: var(--color-muted);
    color: var(--color-muted-foreground);
    font: 500 11px var(--font-sans);
  }
  th button {
    visibility: hidden;
    float: right;
    border: 0;
    background: transparent;
    color: var(--color-muted-foreground);
    cursor: pointer;
  }
  th:hover button { visibility: visible; }
  td input {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: 0;
    outline: 0;
    background: transparent;
    padding: 6px 8px;
    color: var(--color-foreground);
    font: 12px var(--font-mono);
  }
  td input:focus { box-shadow: inset 0 0 0 2px var(--color-primary); }
  .header-row td { background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background)); }
  .header-row td input { font-weight: 600; }
  .empty { padding: 28px 20px; text-align: center; color: var(--color-muted-foreground); }
  .footer-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    padding: 8px 12px;
    border-top: 1px solid var(--color-border);
    background: color-mix(in srgb, var(--color-muted) 40%, var(--color-background));
  }
  .error {
    margin: 0;
    padding: 8px 10px;
    border-radius: var(--radius-md, 6px);
    color: var(--color-destructive);
    background: color-mix(in srgb, var(--color-destructive) 9%, transparent);
    font-size: 12px;
  }
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--color-foreground) 28%, transparent);
  }
  .dialog {
    width: min(360px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 8px);
    background: var(--color-popover, var(--color-card, var(--color-background)));
    box-shadow: 0 16px 40px color-mix(in srgb, CanvasText 18%, transparent);
  }
  .dialog strong { font-size: 14px; color: var(--color-foreground); }
  .dialog p { margin: 0; font-size: 13px; color: var(--color-muted-foreground); line-height: 1.45; }
  .dialog.danger { border-color: color-mix(in srgb, var(--color-destructive) 35%, var(--color-border)); }
  .dialog-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  @container (min-width: 860px) {
    .divider { display: block; }
  }
  @container (max-width: 720px) {
    .group.export { margin-left: 0; width: 100%; }
    .local-hint { width: 100%; margin-left: 0; }
    .spacer { display: none; }
  }
</style>
