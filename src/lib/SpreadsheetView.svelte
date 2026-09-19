<script>
  import Select from "./Select.svelte";
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
  function renameSheet() {
    const current = active?.name || "Sheet1";
    const proposed = globalThis.prompt?.(t("重命名工作表", "Rename worksheet"), current)?.trim();
    if (!proposed || proposed === current) return;
    if (sheets.some((sheet, index) => index !== activeIndex && sheet.name.toLocaleLowerCase() === proposed.toLocaleLowerCase())) {
      error = t("工作表名称不能重复。", "Worksheet names must be unique.");
      return;
    }
    applySheets(sheets.map((sheet, index) => index === activeIndex ? { ...sheet, name: proposed.slice(0, 31) } : sheet));
  }
  function deleteSheet() {
    if (sheets.length <= 1) return;
    if (globalThis.confirm && !globalThis.confirm(t("删除当前工作表？", "Delete the current worksheet?"))) return;
    applySheets(sheets.filter((_, index) => index !== activeIndex));
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
  function download(data, name, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function exportXlsx() {
    error = ""; busy = true;
    try { download(await writeXlsx(sheets), "table.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
    catch (cause) { error = String(cause.message || cause); }
    finally { busy = false; }
  }
  function exportCsv() { download(`\uFEFF${gridToCsv(active.rows)}`, `${active.name}.csv`, "text/csv;charset=utf-8"); }
  function exportTsv() { download(`\uFEFF${gridToTsv(active.rows)}`, `${active.name}.tsv`, "text/tab-separated-values;charset=utf-8"); }
  function exportJson() { download(JSON.stringify(gridToObjects(active.rows, firstRowHeader), null, 2), `${active.name}.json`, "application/json;charset=utf-8"); }
  function columnName(index) {
    let name = "";
    for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
    return name;
  }
</script>

<div class="page">
  <div class="toolbar">
    <label class="dbx-btn file-button">
      {busy ? t("处理中…", "Working…") : t("打开表格", "Open spreadsheet")}
      <input type="file" accept=".xlsx,.csv,.tsv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,application/json" onchange={onFile} disabled={busy} />
    </label>
    <label class="field"><span>{t("工作表", "Worksheet")}</span><Select value={String(activeIndex)} options={sheetOptions} onchange={(value) => (activeIndex = Number(value))} /></label>
    <button class="dbx-btn" type="button" onclick={addSheet} disabled={busy}>{t("新增工作表", "New sheet")}</button>
    <button class="dbx-btn" type="button" onclick={renameSheet} disabled={busy}>{t("重命名", "Rename")}</button>
    <button class="dbx-btn" type="button" onclick={deleteSheet} disabled={busy || sheets.length <= 1}>{t("删除工作表", "Delete sheet")}</button>
    <button class="dbx-btn" type="button" onclick={undo} disabled={!undoStack.length}>{t("撤销", "Undo")}</button>
    <button class="dbx-btn" type="button" onclick={redo} disabled={!redoStack.length}>{t("重做", "Redo")}</button>
    <label class="search"><span>{t("搜索", "Search")}</span><input type="search" placeholder={t("筛选单元格", "Filter cells")} bind:value={searchQuery} /></label>
    <label class="check"><input type="checkbox" bind:checked={firstRowHeader} /> {t("首行作为 JSON 列名", "Use first row as JSON headers")}</label>
    <span class="spacer"></span>
    <button class="dbx-btn" type="button" onclick={exportCsv} disabled={busy}>{t("导出 CSV", "Export CSV")}</button>
    <button class="dbx-btn" type="button" onclick={exportTsv} disabled={busy}>{t("导出 TSV", "Export TSV")}</button>
    <button class="dbx-btn" type="button" onclick={exportJson} disabled={busy}>{t("导出 JSON", "Export JSON")}</button>
    <button class="dbx-btn dbx-btn--primary" type="button" onclick={exportXlsx} disabled={busy}>{t("导出 XLSX", "Export XLSX")}</button>
  </div>
  <div class="meta">
    <span>{fileName || t("新建表格", "New spreadsheet")}</span>
    <span>{rowCount} {t("行", "rows")} · {width} {t("列", "columns")}</span>
  </div>
  {#if error}<p class="error">{error}</p>{/if}
  <p class="dbx-hint limitation">{t("以数据表方式编辑：导入 XLSX 时读取单元格值，重新导出不会保留原文件的公式、样式、图片和合并单元格。", "Data-table editing: XLSX import reads cell values. Re-exporting does not preserve formulas, styles, images, or merged cells from the original file.")}</p>
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
    <span class="dbx-hint">{t("文件只在本机内存中处理，不会上传。", "Files are processed locally in memory and are not uploaded.")}</span>
  </div>
</div>

<style>
  .page { display: flex; flex: 1; min-height: 0; flex-direction: column; gap: 10px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-muted-foreground); }
  .field :global(.dbx-select) { min-width: 150px; }
  .search { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--color-muted-foreground); }
  .search input { width: 150px; height: 32px; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-background); color: var(--color-foreground); padding: 6px 8px; }
  .check { display: flex; align-items: center; min-height: 32px; gap: 6px; font-size: 12px; color: var(--color-muted-foreground); }
  .spacer { flex: 1; }.file-button { position: relative; overflow: hidden; cursor: pointer; }
  .file-button input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .meta, .footer-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--color-muted-foreground); }
  .limitation { margin: 0; }
  .table-wrap { flex: 1; min-height: 260px; overflow: auto; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-background); }
  table { min-width: 100%; border-collapse: separate; border-spacing: 0; table-layout: fixed; }
  th, td { min-width: 140px; height: 34px; border-right: 1px solid var(--color-border); border-bottom: 1px solid var(--color-border); padding: 0; }
  thead th { position: sticky; top: 0; z-index: 2; min-width: 140px; background: var(--color-muted); color: var(--color-muted-foreground); font: 600 11px var(--font-sans); }
  th.corner { left: 0; z-index: 4; min-width: 46px; width: 46px; }
  .row-head { position: sticky; left: 0; z-index: 1; min-width: 46px; width: 46px; background: var(--color-muted); color: var(--color-muted-foreground); font: 500 11px var(--font-sans); }
  th button { visibility: hidden; float: right; border: 0; background: transparent; color: var(--color-muted-foreground); cursor: pointer; }
  th:hover button { visibility: visible; }
  td input { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: 0; background: transparent; padding: 6px 8px; color: var(--color-foreground); font: 12px var(--font-mono); }
  td input:focus { box-shadow: inset 0 0 0 2px var(--color-primary); }
  .header-row td { background: color-mix(in srgb, var(--color-primary) 5%, var(--color-background)); }
  .header-row td input { font-weight: 600; }
  .empty { padding: 20px; text-align: center; color: var(--color-muted-foreground); }
  .footer-actions { justify-content: flex-start; }.footer-actions .dbx-hint { margin-left: auto; }
  .error { margin: 0; padding: 8px 10px; border-radius: 6px; color: var(--color-destructive); background: color-mix(in srgb, var(--color-destructive) 9%, transparent); font-size: 12px; }
  @media (max-width: 720px) { .spacer { display: none; width: 100%; }.footer-actions .dbx-hint { width: 100%; margin-left: 0; } }
</style>
