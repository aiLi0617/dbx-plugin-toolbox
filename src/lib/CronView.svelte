<script>
  import CopyButton from "./CopyButton.svelte";
  import NumberInput from "./NumberInput.svelte";
  import Select from "./Select.svelte";
  import { isZh, pick } from "./i18n.js";
  import {
    CRON_FIELD_DEFS,
    CRON_FLAVORS,
    CRON_PRESETS,
    CRON_PRESET_PIN_COUNT,
    CRON_TIMEZONES,
    composeCron,
    explainCron,
    fieldValues,
    flavorById,
    formatCronRun,
    inferCronFlavor,
    migrateCronFields,
    parseCronFields,
    presetExpression,
    valueLabel,
  } from "./cron.js";

  function gridColumnsFromEl(grid) {
    const cols = getComputedStyle(grid).gridTemplateColumns;
    const n = cols ? cols.split(" ").filter(Boolean).length : 0;
    return n > 0 ? n : 12;
  }

  function rectBetween(values, a, b, cols) {
    const i = values.indexOf(a);
    const j = values.indexOf(b);
    if (i < 0 && j < 0) return [];
    if (i < 0) return [b];
    if (j < 0) return [a];
    const r1 = Math.floor(i / cols);
    const c1 = i % cols;
    const r2 = Math.floor(j / cols);
    const c2 = j % cols;
    const rLo = Math.min(r1, r2);
    const rHi = Math.max(r1, r2);
    const cLo = Math.min(c1, c2);
    const cHi = Math.max(c1, c2);
    const next = [];
    for (let row = rLo; row <= rHi; row++) {
      for (let col = cLo; col <= cHi; col++) {
        const idx = row * cols + col;
        if (idx >= 0 && idx < values.length) next.push(values[idx]);
      }
    }
    return next;
  }

  function brushSelection(selected, visited, add) {
    if (add) {
      const set = new Set(selected);
      for (const n of visited) set.add(n);
      return [...set].sort((a, b) => a - b);
    }
    const drop = new Set(visited);
    return selected.filter((n) => !drop.has(n));
  }

  let { locale = "zh-CN" } = $props();

  const t = (zh, en) => pick(locale, zh, en);
  const zh = $derived(isZh(locale));

  const DEFAULT_EXPR = "*/5 * * * *";

  let flavorId = $state("linux");
  let activeKey = $state("minute");
  let dayPriority = $state("day");
  let expression = $state(DEFAULT_EXPR);
  let fields = $state(parseCronFields(DEFAULT_EXPR, "linux"));
  let timezone = $state("Asia/Shanghai");
  let result = $state(null);
  let error = $state("");
  let dragging = $state(false);
  let dragAdd = $state(true);
  let dragStart = $state(null);
  let dragEnd = $state(null);
  let dragVisited = $state([]);
  let presetsOpen = $state(false);

  const flavor = $derived(flavorById(flavorId));
  const keys = $derived(flavor.keys);
  const def = $derived(CRON_FIELD_DEFS[activeKey]);
  const active = $derived(fields[activeKey]);
  const tzOption = $derived(timezone);
  const composed = $derived(composeCron(flavorId, fields, dayPriority));
  const visiblePresets = $derived(presetsOpen ? CRON_PRESETS : CRON_PRESETS.slice(0, CRON_PRESET_PIN_COUNT));
  const pickValues = $derived(fieldValues(activeKey, flavorId, active?.selected || []));
  const highlighted = $derived(
    dragging ? brushSelection(active?.selected || [], dragVisited, dragAdd) : (active?.selected || []),
  );
  const highlightedSet = $derived(new Set(highlighted));
  const selectedCount = $derived(highlighted.length);
  const activePreset = $derived(
    CRON_PRESETS.find((item) => {
      const fid = item.forceFlavor || flavorId;
      return presetExpression(item, fid) === expression.trim() && fid === flavorId;
    })?.id ?? "",
  );

  $effect(() => {
    const expr = expression;
    const tz = tzOption;
    const timer = setTimeout(() => {
      if (!expr.trim()) {
        result = null;
        error = "";
        return;
      }
      try {
        result = explainCron(expr, { tz, flavorId });
        error = "";
      } catch {
        result = null;
        error = t("不是有效的 Cron 表达式", "Not a valid cron expression");
      }
    }, 120);
    return () => clearTimeout(timer);
  });

  function tokenOf(key) {
    const index = keys.indexOf(key);
    return composed.split(/\s+/)[index] ?? "*";
  }

  function syncExpression() {
    expression = composeCron(flavorId, fields, dayPriority);
  }

  function patch(key, partial) {
    if (key === "day" || key === "weekday") dayPriority = key;
    fields = { ...fields, [key]: { ...fields[key], ...partial } };
    syncExpression();
  }

  function setMode(mode) {
    patch(activeKey, { mode });
  }

  function setFlavor(next) {
    if (next === flavorId) return;
    fields = migrateCronFields(fields, flavorId, next);
    flavorId = next;
    const nextKeys = flavorById(next).keys;
    if (!nextKeys.includes(activeKey)) activeKey = nextKeys.includes("minute") ? "minute" : nextKeys[0];
    syncExpression();
  }

  function applyExpression(expr, nextFlavor) {
    const inferred = nextFlavor || inferCronFlavor(expr, flavorId);
    flavorId = inferred;
    fields = parseCronFields(expr, inferred);
    const nextKeys = flavorById(inferred).keys;
    if (!nextKeys.includes(activeKey)) activeKey = nextKeys.includes("minute") ? "minute" : nextKeys[0];
    expression = expr;
  }

  function parseFromInput() {
    const expr = expression.trim();
    if (!expr) return;
    applyExpression(expr);
  }

  let parseTimer = 0;
  function queueParse() {
    window.clearTimeout(parseTimer);
    parseTimer = window.setTimeout(parseFromInput, 280);
  }

  function applyPreset(preset) {
    const nextFlavor = preset.forceFlavor || flavorId;
    applyExpression(presetExpression(preset, nextFlavor), nextFlavor);
  }

  function valueFromPoint(clientX, clientY, grid) {
    const gridRect = grid.getBoundingClientRect();
    if (
      clientX < gridRect.left - 6 ||
      clientX > gridRect.right + 6 ||
      clientY < gridRect.top - 6 ||
      clientY > gridRect.bottom + 6
    ) {
      return null;
    }
    let hit = null;
    let nearest = null;
    let nearestDist = Infinity;
    for (const node of grid.querySelectorAll("[data-cron-val]")) {
      const value = Number(node.dataset.cronVal);
      if (!Number.isFinite(value)) continue;
      const r = node.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        hit = value;
        break;
      }
      const dx = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      const dy = clientY < r.top ? r.top - clientY : clientY > r.bottom ? clientY - r.bottom : 0;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = value;
      }
    }
    return hit ?? nearest;
  }

  function onGridPointerDown(event) {
    if (event.button != null && event.button !== 0) return;
    const value = valueFromPoint(event.clientX, event.clientY, event.currentTarget);
    if (value == null) return;
    event.preventDefault();
    dragging = true;
    dragAdd = !(active?.selected || []).includes(value);
    dragStart = value;
    dragEnd = value;
    dragVisited = [value];
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* pointer may already be released */
    }
  }

  function onGridPointerMove(event) {
    if (!dragging) return;
    const value = valueFromPoint(event.clientX, event.clientY, event.currentTarget);
    if (value == null || value === dragEnd) return;
    dragVisited = rectBetween(pickValues, dragStart, value, gridColumnsFromEl(event.currentTarget));
    dragEnd = value;
  }

  function finishDrag(event) {
    if (!dragging) return;
    if (event?.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const next = brushSelection(active?.selected || [], dragVisited, dragAdd);
    dragging = false;
    dragStart = null;
    dragEnd = null;
    dragVisited = [];
    patch(activeKey, { mode: "specify", selected: next });
  }

  function selectAll() {
    patch(activeKey, { mode: "specify", selected: [...pickValues] });
  }

  function clearSelected() {
    patch(activeKey, { mode: "specify", selected: [] });
  }

  function num(key, prop, n, fallback) {
    patch(key, { [prop]: Number.isFinite(n) ? n : fallback });
  }

  function formatNext(iso) {
    try {
      return formatCronRun(iso, locale, tzOption);
    } catch {
      return { date: iso, weekday: "" };
    }
  }
</script>

<div class="cron">
  <nav class="flavors" aria-label={t("表达式类型", "Expression type")}>
    <p class="eyebrow">{t("表达式类型", "Type")}</p>
    {#each CRON_FLAVORS as item}
      <button class="flavor" class:active={flavorId === item.id} aria-pressed={flavorId === item.id} onclick={() => setFlavor(item.id)} type="button">
        {item.en}
      </button>
    {/each}
  </nav>

  <div class="cron-col">
    <section class="editor">
        <div class="tabs" role="tablist" style="--tab-count: {keys.length}">
          {#each keys as key}
            {@const item = CRON_FIELD_DEFS[key]}
            <button
              class="tab"
              class:active={activeKey === key}
              onclick={() => (activeKey = key)}
              role="tab"
              aria-selected={activeKey === key}
              type="button"
            >
              {t(item.tabZh, item.tabEn)}
            </button>
          {/each}
        </div>

        {#if def && active}
          <div class="modes">
            <label class="mode" class:on={active.mode === "every"}>
              <input checked={active.mode === "every"} name="cron-mode" onchange={() => setMode("every")} type="radio" />
              <span class="mode-name">{t(def.everyZh, def.everyEn)}</span>
              <span class="mode-desc">{t(`${def.zh}字段匹配每一${def.unitZh} (*)`, `Matches every ${def.unitEn} (*)`)}</span>
            </label>

            {#if activeKey === "day" || activeKey === "weekday"}
              <label class="mode" class:on={active.mode === "unset"}>
                <input checked={active.mode === "unset"} name="cron-mode" onchange={() => setMode("unset")} type="radio" />
                <span class="mode-name">{t("不指定", "Unspecified")}</span>
                <span class="mode-desc">{t("使用 ? 让另一个日期字段生效", "Use ? so the other date field applies")}</span>
              </label>
            {/if}

            <label class="mode" class:on={active.mode === "range"}>
              <input checked={active.mode === "range"} name="cron-mode" onchange={() => setMode("range")} type="radio" />
              <span class="mode-name">{t("范围", "Range")}</span>
              <span class="mode-desc mode-controls">
                {t("从", "From")}
                <NumberInput class="num" min={def.min} max={def.max} ariaLabel={t("范围起始", "Range start")} value={active.from} oninput={(n) => num(activeKey, "from", n, def.min)} />
                {t("到", "to")}
                <NumberInput class="num" min={def.min} max={def.max} ariaLabel={t("范围结束", "Range end")} value={active.to} oninput={(n) => num(activeKey, "to", n, def.max)} />
                {t(def.unitZh, def.unitEn)}
              </span>
            </label>

            <label class="mode" class:on={active.mode === "step"}>
              <input checked={active.mode === "step"} name="cron-mode" onchange={() => setMode("step")} type="radio" />
              <span class="mode-name">{t("周期", "Step")}</span>
              <span class="mode-desc mode-controls">
                {t("从", "From")}
                <NumberInput class="num" min={def.min} max={def.max} ariaLabel={t("周期起始", "Step start")} value={active.from} oninput={(n) => num(activeKey, "from", n, def.min)} />
                {t("开始，每", "every")}
                <NumberInput class="num" min="1" max={def.max} ariaLabel={t("周期间隔", "Step interval")} value={active.interval} oninput={(n) => num(activeKey, "interval", n, 1)} />
                {t(`${def.unitZh}执行一次`, `${def.unitEn}s`)}
              </span>
            </label>

            {#if activeKey === "day"}
              <label class="mode" class:on={active.mode === "nearest"}>
                <input checked={active.mode === "nearest"} name="cron-mode" onchange={() => setMode("nearest")} type="radio" />
                <span class="mode-name">{t("最近工作日", "Nearest weekday")}</span>
                <span class="mode-desc mode-controls">
                  {t("每月", "On")}
                  <NumberInput class="num" min={def.min} max={def.max} ariaLabel={t("最近工作日日期", "Nearest weekday day")} value={active.from} oninput={(n) => num(activeKey, "from", n, 1)} />
                  {t("号最近的工作日", "nearest weekday")}
                </span>
              </label>

              <label class="mode" class:on={active.mode === "last"}>
                <input checked={active.mode === "last"} name="cron-mode" onchange={() => setMode("last")} type="radio" />
                <span class="mode-name">{t("最后一天", "Last day")}</span>
                <span class="mode-desc">{t("当月最后一天", "Last day of the month")}</span>
              </label>

              <label class="mode" class:on={active.mode === "lastWeekday"}>
                <input checked={active.mode === "lastWeekday"} name="cron-mode" onchange={() => setMode("lastWeekday")} type="radio" />
                <span class="mode-name">{t("最后工作日", "Last weekday")}</span>
                <span class="mode-desc">{t("当月最后一个工作日", "Last weekday of the month")}</span>
              </label>
            {/if}

            <div class="mode specify" class:on={active.mode === "specify"}>
              <label class="mode-head">
                <input checked={active.mode === "specify"} name="cron-mode" onchange={() => setMode("specify")} type="radio" />
                <span class="mode-name">{t("指定", "Specific")}</span>
              </label>
              <div class="specify-rest">
                <span class="mode-desc">
                  {t(`已选择 ${selectedCount} 项`, `${selectedCount} selected`)}
                </span>
                <span class="specify-actions">
                  <span class="mode-desc">{t("按住拖动可批量选择", "Drag to select a range")}</span>
                  <button class="link" onclick={selectAll} type="button">{t("全选", "All")}</button>
                  <button class="link" onclick={clearSelected} type="button">{t("清空", "Clear")}</button>
                </span>
              </div>
              <div
                class="pick-grid"
                class:month={activeKey === "month"}
                class:weekday={activeKey === "weekday"}
                class:year={activeKey === "year"}
                class:dragging
                role="group"
                aria-label={t("按住拖动可批量选择", "Drag to select a range")}
                onpointercancel={finishDrag}
                onlostpointercapture={finishDrag}
                onpointerdown={onGridPointerDown}
                onpointermove={onGridPointerMove}
                onpointerup={finishDrag}
              >
                {#each pickValues as value}
                  <button class="pick" class:on={highlightedSet.has(value)} data-cron-val={value} draggable="false" tabindex="-1" type="button">
                    {valueLabel(activeKey, value, zh, flavorId)}
                  </button>
                {/each}
              </div>
            </div>

            {#if active.mode === "custom"}
              <label class="mode on">
                <span class="mode-name">{t("高级", "Advanced")}</span>
                <input
                  class="dbx-input mono custom"
                  spellcheck="false"
                  value={active.custom}
                  oninput={(event) => patch(activeKey, { custom: event.currentTarget.value })}
                />
              </label>
            {/if}
          </div>
        {/if}
      </section>

    <div class="tokens">
      <p class="label">{t("表达式字段", "Fields")}</p>
      <div class="token-row" style="--tab-count: {keys.length}">
        {#each keys as key}
          {@const item = CRON_FIELD_DEFS[key]}
          {@const token = tokenOf(key)}
          <button class="token" class:active={activeKey === key} onclick={() => (activeKey = key)} title={token} type="button">
            <span>{t(item.zh, item.en)}</span>
            <strong>{token}</strong>
          </button>
        {/each}
      </div>
    </div>

    <div class="expr-block">
      <p class="label">{t("Cron 表达式", "Cron expression")}</p>
      <div class="expr-row">
        <input
          class="dbx-input mono"
          spellcheck="false"
          autocomplete="off"
          aria-label={t("Cron 表达式", "Cron expression")}
          placeholder="*/5 * * * *"
          bind:value={expression}
          oninput={queueParse}
        />
        <CopyButton {locale} text={expression.trim()} labelZh="复制表达式" labelEn="Copy expression" />
        <button class="dbx-btn dbx-btn--primary" onclick={parseFromInput} type="button">{t("反解析", "Parse")}</button>
        <Select
          class="tz"
          bind:value={timezone}
          ariaLabel={t("计算时区", "Timezone")}
          options={CRON_TIMEZONES.map((zone) => ({ value: zone.id, label: t(zone.zh, zone.en) }))}
        />
      </div>
    </div>

    <div class="presets">
      <div class="preset-bar">
        <p class="label">{t("常用定时", "Presets")}</p>
        <span class="preset-hint">{t("点击即可快速应用", "Click to apply")}</span>
        <button class="preset-toggle" onclick={() => (presetsOpen = !presetsOpen)} type="button">
          {presetsOpen ? t("收起", "Less") : t("展开", "More")}
          <span class="chevron" class:open={presetsOpen} aria-hidden="true"></span>
        </button>
      </div>
      <div class="preset-row">
        {#each visiblePresets as item}
          <button class="preset" class:active={activePreset === item.id} onclick={() => applyPreset(item)} type="button">
            {t(item.zh, item.en)}
          </button>
        {/each}
      </div>
    </div>

    {#if error}
      <p class="dbx-hint error">{error}</p>
    {/if}
  </div>

  <aside class="next">
    <p class="next-title">{t("接下来 5 次", "Next 5 runs")}</p>
    <p class="dbx-hint next-sub">{t("按执行顺序", "In run order")}</p>
    {#if result}
      {#each result.next as iso, i}
        {@const run = formatNext(iso)}
        <div class="next-row">
          <span class="idx">{String(i + 1).padStart(2, "0")}</span>
          <span class="when">{run.date}</span>
          <span class="dow">{run.weekday}</span>
        </div>
      {/each}
    {:else}
      <p class="dbx-hint">{t("有效表达式才会列出时间。", "Next runs appear for a valid expression.")}</p>
    {/if}
  </aside>
</div>

<style>
  .cron {
    display: grid;
    grid-template-columns: 4.8rem minmax(0, 1fr) minmax(220px, 260px);
    gap: 14px 10px;
    align-items: start;
    max-width: 1080px;
  }
  .cron-col {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  .flavors {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .eyebrow {
    margin: 0 0 4px;
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .flavor {
    height: 30px;
    padding: 0 8px;
    border: 0;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: inherit;
    font-size: 12px;
    text-align: left;
  }
  .flavor:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .flavor.active {
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .editor {
    min-width: 0;
    padding: 10px 12px 12px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-lg, 10px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .tabs {
    display: grid;
    grid-template-columns: repeat(var(--tab-count, 5), minmax(0, 1fr));
    gap: 4px;
    margin-bottom: 10px;
    padding: 4px;
    border-radius: var(--radius-lg, 10px);
    background: var(--color-muted, color-mix(in srgb, CanvasText 6%, transparent));
  }
  .tab {
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 4px;
    border: 0;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tab:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .tab.active {
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
    box-shadow: 0 0 0 1px var(--dbx-selection-border);
  }
  .modes {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .mode {
    display: grid;
    grid-template-columns: 16px 10.5rem minmax(0, 1fr);
    gap: 8px 10px;
    align-items: center;
    min-height: 36px;
    padding: 8px 10px;
    border-radius: var(--radius-md, 8px);
    font-size: 13px;
  }
  .mode.specify {
    align-items: start;
  }
  .mode.on {
    background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  }
  .mode input[type="radio"] {
    margin: 0;
  }
  .mode-head {
    display: contents;
  }
  .mode-name {
    justify-self: start;
    text-align: left;
    font-size: 13px;
    white-space: nowrap;
  }
  .mode-desc {
    justify-self: start;
    text-align: left;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .mode-controls {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .mode-controls :global(.dbx-number.num) {
    width: 4.2rem;
    min-width: 4.2rem;
  }
  .mode-controls :global(.num .dbx-input) {
    height: 28px;
    padding: 0 18px 0 6px;
    text-align: center;
  }
  .specify-rest {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-width: 0;
  }
  .specify-rest .mode-desc {
    flex: 0 1 auto;
    min-width: 0;
  }
  .specify-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
    flex-shrink: 0;
  }
  .link {
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 12px;
    padding: 0;
  }
  .pick-grid {
    grid-column: 3;
    display: grid;
    margin-top: 2px;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 6px;
    user-select: none;
    touch-action: none;
    cursor: cell;
  }
  .pick-grid.dragging,
  .pick-grid.dragging .pick {
    cursor: grabbing;
  }
  .pick-grid.month {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .pick-grid.year {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  .pick-grid.weekday {
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .pick {
    min-width: 0;
    height: 28px;
    padding: 0 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-background, Canvas);
    color: inherit;
    font-size: 12px;
    cursor: cell;
    touch-action: none;
    user-select: none;
  }
  .pick:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .pick.on,
  .pick.on:hover {
    border-color: var(--dbx-selection-border);
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
  }
  .custom {
    grid-column: 2 / -1;
  }
  .label {
    margin: 0 0 6px;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .token-row {
    display: grid;
    grid-template-columns: repeat(var(--tab-count, 5), minmax(0, 1fr));
    gap: 8px;
  }
  .token {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: auto;
    min-width: 0;
    max-width: none;
    overflow: hidden;
    padding: 6px 8px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    background: var(--color-card, var(--color-background, Canvas));
    color: inherit;
    text-align: left;
  }
  .token span {
    font-size: 11px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .token strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 600;
  }
  .token.active {
    border-color: var(--dbx-selection-border);
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
  }
  .token.active span {
    color: var(--dbx-selection-foreground);
    opacity: 0.78;
  }
  .expr-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 30px auto auto;
    gap: 8px;
    align-items: center;
  }
  .expr-row :global(.tz) {
    width: auto;
    min-width: 10.5rem;
  }
  .preset-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .preset-bar .label {
    margin: 0;
    flex: 1;
  }
  .preset-hint {
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .preset-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: 999px;
    background: var(--color-card, var(--color-background, Canvas));
    color: var(--color-primary);
    font-size: 12px;
  }
  .chevron {
    width: 0;
    height: 0;
    border-left: 4px solid transparent;
    border-right: 4px solid transparent;
    border-top: 5px solid currentColor;
  }
  .chevron.open {
    transform: rotate(180deg);
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .preset {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: 999px;
    background: var(--color-card, var(--color-background, Canvas));
    color: inherit;
    font-size: 12px;
  }
  .preset:hover {
    background: var(--color-muted, color-mix(in srgb, CanvasText 8%, transparent));
  }
  .preset.active {
    border-color: var(--dbx-selection-border);
    background: var(--dbx-selection-background);
    color: var(--dbx-selection-foreground);
  }
  .error {
    margin: 0;
    color: var(--color-destructive);
  }
  .next {
    padding: 12px 14px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-lg, 10px);
    background: var(--color-card, var(--color-background, Canvas));
  }
  .next-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
  }
  .next-sub {
    margin: 4px 0 10px;
  }
  .next-row {
    display: grid;
    grid-template-columns: 1.6rem minmax(0, 1fr) auto;
    gap: 8px;
    align-items: baseline;
    padding: 6px 0;
    border-top: 1px solid var(--color-border, color-mix(in srgb, CanvasText 10%, transparent));
    font-variant-numeric: tabular-nums;
  }
  .idx {
    font-size: 12px;
    color: var(--color-primary);
  }
  .when {
    font-size: 12px;
    font-family: var(--font-mono);
  }
  .dow {
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }

  @media (max-width: 900px) {
    .cron {
      grid-template-columns: 1fr;
    }
    .flavors {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
    }
    .eyebrow {
      width: 100%;
    }
    .expr-row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .expr-row .dbx-btn,
    .expr-row :global(.tz) {
      grid-column: 1 / -1;
    }
    .pick-grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }
</style>
