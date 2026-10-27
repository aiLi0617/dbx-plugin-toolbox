<script module>
  let closeActivePicker = null;
</script>

<script>
  import { pick } from "./i18n.js";
  let { value = $bindable(""), valid = $bindable(true), locale = "zh-CN", min = "1900-01-01", max = "2100-12-31", ariaLabel = "" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let open = $state(false);
  let pickerElement = $state(null);
  let triggerElement = $state(null);
  let draft = $state(value);
  let lastValue = $state(value);
  let touched = $state(false);
  const errorId = `date-error-${Math.random().toString(36).slice(2)}`;
  const draftValid = $derived(Boolean(validIso(draft.trim())));
  $effect(() => { valid = draftValid && draft.trim() === value; });
  let viewMode = $state("calendar");
  let viewYear = $state(2026);
  let viewMonth = $state(1);
  let yearPage = $state(2020);
  function utcDate(year, month, day) { const date = new Date(0); date.setUTCFullYear(year, month, day); return date; }
  const dateFrom = (text) => {
    const [year, month, day] = String(text || "").split("-").map(Number);
    return year && month && day ? utcDate(year, month - 1, day) : null;
  };
  const iso = (date) => `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const selectedDate = $derived(dateFrom(value));
  const title = $derived(new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(utcDate(viewYear, viewMonth - 1, 1)));
  const monthTitle = $derived(new Intl.DateTimeFormat(locale, { month: "numeric", timeZone: "UTC" }).format(utcDate(viewYear, viewMonth - 1, 1)));
  const yearTitle = $derived(new Intl.DateTimeFormat(locale, { year: "numeric", timeZone: "UTC" }).format(utcDate(viewYear, 0, 1)));
  const yearCells = $derived(Array.from({ length: 12 }, (_, index) => yearPage + index));
  const monthCells = $derived(Array.from({ length: 12 }, (_, index) => ({ month: index + 1, label: new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(utcDate(viewYear, index, 1)) })));
  const displayValue = $derived(selectedDate ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(selectedDate) : "");
  const cells = $derived.by(() => {
    const first = utcDate(viewYear, viewMonth - 1, 1);
    const offset = first.getUTCDay();
    const days = utcDate(viewYear, viewMonth, 0).getUTCDate();
    const out = [];
    const rows = offset + days > 35 ? 6 : 5;
    for (let i = 0; i < rows * 7; i += 1) {
      const day = i - offset + 1;
      const date = utcDate(viewYear, viewMonth - 1, day);
      out.push({ date, day: date.getUTCDate(), current: date.getUTCMonth() === viewMonth - 1, disabled: iso(date) < min || iso(date) > max });
    }
    return out;
  });
  const weekdays = $derived(Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + i)))));
  function openPicker() {
    if (open) { open = false; return; }
    closeActivePicker?.();
    const date = selectedDate || new Date();
    viewYear = date.getUTCFullYear(); viewMonth = date.getUTCMonth() + 1; yearPage = Math.floor(viewYear / 12) * 12; viewMode = "calendar"; open = true;
  }
  function validIso(text) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = dateFrom(text);
    return date && iso(date) === text && text >= min && text <= max;
  }
  function commitDraft() {
    const next = draft.trim();
    touched = true;
    if (validIso(next)) { value = next; draft = next; open = false; touched = false; }
  }
  function shift(delta) {
    const next = utcDate(viewYear, viewMonth - 1 + delta, 1);
    viewYear = next.getUTCFullYear(); viewMonth = next.getUTCMonth() + 1;
  }
  function shiftYears(delta) { if (viewMode === "months") viewYear = Math.max(Number(min.slice(0, 4)), Math.min(Number(max.slice(0, 4)), viewYear + delta)); else yearPage = Math.max(Math.floor(Number(min.slice(0, 4)) / 12) * 12, Math.min(Math.floor(Number(max.slice(0, 4)) / 12) * 12, yearPage + delta * 12)); }
  function chooseYear(year) { viewYear = year; viewMode = "calendar"; }
  function chooseMonth(month) { viewMonth = month; viewMode = "calendar"; }
  function choose(cell) { if (!cell.disabled) { value = iso(cell.date); draft = value; touched = false; open = false; } }
  function chooseToday() { const now = new Date(); const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); if (iso(date) >= min && iso(date) <= max) choose({ date, disabled: false }); }
  $effect(() => { if (value !== lastValue) { lastValue = value; draft = value; touched = false; } });
  $effect(() => {
    if (!open) return;
    const close = () => { open = false; };
    closeActivePicker = close;
    const onOutside = (event) => {
      if (!event.composedPath().includes(pickerElement)) close();
    };
    const onKeydown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      triggerElement?.focus();
    };
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("focusin", onOutside, true);
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("focusin", onOutside, true);
      document.removeEventListener("keydown", onKeydown);
      if (closeActivePicker === close) closeActivePicker = null;
    };
  });
</script>

<div class="date-picker" role="group" bind:this={pickerElement}>
  <div class="date-trigger" class:placeholder={!displayValue} class:active={open}>
    <input class="date-text" value={draft} placeholder="YYYY-MM-DD" inputmode="numeric" aria-label={ariaLabel} aria-invalid={touched && !draftValid} aria-describedby={touched && !draftValid ? errorId : undefined} aria-haspopup="dialog" aria-expanded={open} oninput={(event) => { draft = event.currentTarget.value; touched = true; }} onblur={commitDraft} onkeydown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitDraft(); } }} />
    <button type="button" class="calendar-trigger" bind:this={triggerElement} aria-label={ariaLabel} aria-haspopup="dialog" aria-expanded={open} onclick={openPicker}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg></button>
  </div>
  {#if touched && !draftValid}<p class="date-error" id={errorId} role="alert">{t("请输入有效日期（YYYY-MM-DD），范围：", "Enter a valid date (YYYY-MM-DD), within: ")}{min} – {max}</p>{/if}
  {#if open}
    <div class="date-popover" role="dialog" aria-label={ariaLabel}>
      <div class="date-toolbar"><button type="button" class="nav" aria-label={viewMode === "years" ? t("上一组年份", "Previous years") : viewMode === "months" ? t("上一年", "Previous year") : t("上个月", "Previous month")} onclick={() => viewMode === "years" || viewMode === "months" ? shiftYears(-1) : shift(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7"/></svg></button>{#if viewMode === "years"}<strong>{yearPage}–{yearPage + 11}</strong>{:else if viewMode === "months"}<button type="button" class="title-button" onclick={() => (viewMode = "years")} aria-label={t("选择年份", "Choose year")}>{yearTitle}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>{:else}<div class="period-select"><button type="button" class="title-button" onclick={() => (viewMode = "years")} aria-label={t("选择年份", "Choose year")}>{viewYear}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><button type="button" class="title-button" onclick={() => (viewMode = "months")} aria-label={t("选择月份", "Choose month")}>{monthTitle}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>{/if}<button type="button" class="nav" aria-label={viewMode === "years" ? t("下一组年份", "Next years") : viewMode === "months" ? t("下一年", "Next year") : t("下个月", "Next month")} onclick={() => viewMode === "years" || viewMode === "months" ? shiftYears(1) : shift(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7"/></svg></button></div>
      {#if viewMode === "calendar"}<div class="weekday-row">{#each weekdays as weekday}<span>{weekday}</span>{/each}</div>
        <div class="day-grid">
          {#each cells as cell}<button type="button" class:outside={!cell.current} class:selected={selectedDate && iso(selectedDate) === iso(cell.date)} disabled={cell.disabled} aria-label={iso(cell.date)} aria-current={selectedDate && iso(selectedDate) === iso(cell.date) ? "date" : undefined} onclick={() => choose(cell)}>{cell.day}</button>{/each}
        </div>
      {:else if viewMode === "months"}<div class="month-grid">{#each monthCells as item}<button type="button" class:selected={item.month === viewMonth} onclick={() => chooseMonth(item.month)}>{item.label}</button>{/each}</div>
      {:else}<div class="year-grid">{#each yearCells as year}<button type="button" class:selected={year === viewYear} disabled={year < Number(min.slice(0, 4)) || year > Number(max.slice(0, 4))} onclick={() => chooseYear(year)}>{year}</button>{/each}</div>{/if}
      <div class="date-footer"><button type="button" onclick={() => (open = false)}>{t("关闭", "Close")}</button><button type="button" onclick={chooseToday}>{t("今天", "Today")}</button></div>
    </div>
  {/if}
</div>

<style>
  .date-picker{position:relative;width:100%}.date-trigger{display:flex;align-items:center;width:100%;min-height:44px;padding:0 8px 0 12px;border:1px solid var(--dbx-control-border,var(--color-input));border-radius:var(--radius-md);background:var(--dbx-control-background,var(--color-background));color:var(--dbx-control-foreground,var(--color-foreground));font:inherit;font-size:16px;font-variant-numeric:tabular-nums}.date-trigger:hover,.date-trigger.active{border-color:var(--color-ring,var(--color-primary))}.date-trigger:has(:focus-visible){outline:none;box-shadow:var(--dbx-focus-ring)}.date-trigger.placeholder{color:var(--color-muted-foreground)}.date-text{width:100%;min-width:0;height:40px;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-variant-numeric:tabular-nums;outline:none}.date-text::placeholder{color:var(--color-muted-foreground);opacity:.75}.calendar-trigger{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;flex:none;padding:0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-muted-foreground);cursor:pointer}.calendar-trigger:hover{background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}.calendar-trigger:focus-visible{outline:none;box-shadow:var(--dbx-focus-ring)}.calendar-trigger svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
  .date-popover{position:absolute;z-index:20;top:calc(100% + 8px);left:0;width:100%;box-sizing:border-box;padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-popover,var(--color-card));color:var(--color-popover-foreground,var(--color-foreground));box-shadow:var(--dbx-shadow-md);animation:date-pop .12s ease-out;overflow:hidden;overscroll-behavior:contain;scrollbar-width:none}.date-popover::-webkit-scrollbar{display:none}.date-toolbar{display:grid;grid-template-columns:32px 1fr 32px;align-items:center;gap:4px;margin-bottom:10px}.date-toolbar strong,.title-button{text-align:center;font-size:13px;font-weight:600}.period-select{display:flex;justify-content:center;align-items:center;gap:2px}.period-select .title-button{padding:0 5px}.nav,.title-button{appearance:none;height:30px;padding:0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-muted-foreground);cursor:pointer}.nav{width:32px}.nav svg,.title-button svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px}.nav:hover,.title-button:hover,.date-footer button:hover{background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}.weekday-row,.day-grid,.year-grid,.month-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.month-grid,.year-grid{grid-template-columns:repeat(4,1fr)}.weekday-row{margin-bottom:4px}.weekday-row span{text-align:center;font-size:10px;color:var(--color-muted-foreground)}.day-grid button,.year-grid button,.month-grid button{height:30px;white-space:nowrap;border:1px solid transparent;border-radius:var(--radius-sm);background:transparent;color:var(--color-foreground);font:12px var(--font-sans);cursor:pointer}.day-grid button:hover:not(:disabled),.year-grid button:hover:not(:disabled),.month-grid button:hover:not(:disabled){background:var(--dbx-hover-background);color:var(--dbx-hover-foreground)}.day-grid button.outside{color:var(--color-muted-foreground);opacity:.6}.day-grid button.selected,.year-grid button.selected,.month-grid button.selected{background:var(--color-primary);color:var(--color-primary-foreground);font-weight:600}.day-grid button:disabled,.year-grid button:disabled,.month-grid button:disabled{opacity:.28;cursor:not-allowed}.day-grid button:focus-visible,.year-grid button:focus-visible,.month-grid button:focus-visible,.nav:focus-visible,.title-button:focus-visible,.date-footer button:focus-visible{outline:none;box-shadow:var(--dbx-focus-ring)}.date-footer{display:flex;justify-content:space-between;margin-top:10px;padding-top:10px;border-top:1px solid var(--color-border)}.date-footer button{padding:5px 7px;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--color-primary);font:12px var(--font-sans);cursor:pointer}@keyframes date-pop{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
.date-error{margin:6px 0 0;color:var(--color-destructive);font-size:12px;line-height:1.5}.date-trigger:has([aria-invalid="true"]){border-color:var(--color-destructive)}
</style>
