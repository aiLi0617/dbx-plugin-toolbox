<script>
  import { onDestroy, onMount, tick } from "svelte";
  import { getCountryCallingCode } from "libphonenumber-js/max";
  import FakeDataPresets from "./FakeDataPresets.svelte";
  import FakeDataResult from "./FakeDataResult.svelte";
  import Select from "./Select.svelte";
  import { chrome, localizeError, pick } from "./i18n.js";
  import { reorderList } from "./imageBatch.js";
  import { validatePresetConfig } from "./fakeDataPresets.js";
  import { FAKE_DATA_COPY, FAKE_DATA_ERRORS, FAKE_DATA_GENERATION_COPY, FIELD_GROUPS } from "./fakeDataCopy.js";
  import {
    FAKE_ADDRESS_CITIES, FAKE_ADDRESS_TYPES, FAKE_CUSTOM_DATE_FORMAT, FAKE_DATE_FORMATS, FAKE_DATE_PATTERN_LIMIT, FAKE_DATETIME_FORMATS,
    FAKE_FIELD_DEFAULTS, FAKE_PHONE_REGIONS, FakeDataError,
    generateFakeRows, localFakeDate, parseFakeFields,
  } from "./fakeData.js";

  let { locale = "zh-CN", visible = true } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const label = (copy) => pick(locale, copy);
  function defaults(type) {
    const options = { ...FAKE_FIELD_DEFAULTS[type] };
    if (Object.hasOwn(options, "language")) options.language = locale.startsWith("zh") ? "zh-CN" : "en";
    return options;
  }
  const choices = (values, display = (value) => value) => values.map((value) => ({ value, label: display(value) }));
  const dateFormats = $derived([...choices(FAKE_DATE_FORMATS), { value: FAKE_CUSTOM_DATE_FORMAT, label: t("自定义", "Custom") }]);
  const datetimeFormats = $derived([...choices(FAKE_DATETIME_FORMATS), { value: FAKE_CUSTOM_DATE_FORMAT, label: t("自定义", "Custom") }]);
  const personFields = [
    ["name", "cnName"], ["age", "age"], ["mobile", "phone"], ["birthDate", "birthDate"], ["idCard", "idCard"],
  ];
  const commonTypes = ["name", "phone", "email", "date", "integer", "enum", "fixed"];
  const nameKeywords = {
    name: "cnName 中文姓名 英文全名 Chinese full name English full name",
    firstName: "中文名 英文名 Chinese given name English given name",
    lastName: "中文姓 英文姓 Chinese surname English surname",
  };
  const dataLanguages = [{ value: "zh-CN", label: "简体中文" }, { value: "en", label: "English" }];
  const editableTypes = new Set(Object.keys(FAKE_FIELD_DEFAULTS));

  let nextFieldId = 0;
  function fieldRow(name, type) {
    if (type === "cnName") return { id: ++nextFieldId, name, type: "name", options: { language: "zh-CN" } };
    return { id: ++nextFieldId, name, type, options: defaults(type) };
  }

  let fields = $state(["name", "email", "company", "date", "uuid"].map((type) => fieldRow(type, type)));
  let count = $state(12);
  let seed = $state("dbx-toolbox");
  let referenceDate = $state(localFakeDate());
  let format = $state("json");
  let rows = $state.raw([]);
  let generatedConfig = $state("");
  let error = $state.raw(null);
  let bulkError = $state.raw(null);
  let bulkText = $state("");
  let advancedOpen = $state(false);
  let openFieldId = $state(null);
  let settingsPanel = $state(null);
  let settingsPosition = $state(null);
  const activeField = $derived(fields.find(({ id }) => id === openFieldId));
  const viewId = $props.id();
  const settingsPanelId = `${viewId}-field-settings`;
  const settingsTitleId = `${settingsPanelId}-title`;
  let layout = $state(null);
  let fieldList = $state(null);
  let addFieldButton = $state(null);
  let fieldDrag = $state(null);
  let reorderAnnouncement = $state("");
  let dragFrame = 0;

  const needsReference = $derived(fields.some(({ type }) => ["age", "birthDate", "idCard"].includes(type)));
  const needsTestLabel = $derived(fields.some(({ type }) => type === "phone" || type === "idCard"));
  const configSignature = $derived(JSON.stringify([fields, count, seed, needsReference ? referenceDate : null]));
  const outputIsStale = $derived(rows.length > 0 && generatedConfig !== configSignature);
  const typeOptions = $derived.by(() => {
    const options = FIELD_GROUPS.flatMap(([group, types]) => Object.entries(types).map(([value, copy]) => ({
      value, label: label(copy), group: label(group), keywords: `${copy.en} ${copy["zh-CN"]} ${label(group)} ${nameKeywords[value] ?? ""}`,
    })));
    const common = commonTypes.map((type) => ({ ...options.find(({ value }) => value === type), group: label(FAKE_DATA_COPY.common) }));
    return [...common, ...options.filter(({ value }) => !commonTypes.includes(value))];
  });
  const phoneRegions = $derived.by(() => {
    const names = new Intl.DisplayNames([locale], { type: "region" });
    const english = new Intl.DisplayNames(["en"], { type: "region" });
    return FAKE_PHONE_REGIONS.map((region) => {
      const name = region === "CN" ? t("中国大陆", "China") : names.of(region);
      return { value: region, label: `${name} · +${getCountryCallingCode(region)}`, keywords: english.of(region) };
    }).sort((a, b) => a.label.localeCompare(b.label, locale));
  });
  const phoneFormats = $derived([
    { value: "national", label: label(FAKE_DATA_COPY.national) },
    { value: "international", label: label(FAKE_DATA_COPY.international) },
  ]);
  const cityOptions = $derived([
    { value: "", label: label(FAKE_DATA_COPY.anyCity) },
    ...choices(Object.keys(FAKE_ADDRESS_CITIES), (value) => {
      const city = FAKE_ADDRESS_CITIES[value].name;
      return locale.startsWith("zh") ? city : value[0].toUpperCase() + value.slice(1);
    }),
  ]);
  const timeUnits = $derived([
    { value: "seconds", label: t("秒", "Seconds") },
    { value: "milliseconds", label: t("毫秒", "Milliseconds") },
  ]);
  const fixedTypes = $derived([
    { value: "string", label: t("字符串", "String") },
    { value: "number", label: t("数字", "Number") },
    { value: "boolean", label: t("布尔值", "Boolean") },
    { value: "null", label: "null" },
  ]);
  const booleanValues = [{ value: true, label: "true" }, { value: false, label: "false" }];

  function settingsTrigger(id) {
    return fieldList?.querySelector(`[data-field-id="${id}"] .row-toggle`);
  }

  function closeFieldSettings(restoreFocus = false) {
    const trigger = restoreFocus ? settingsTrigger(openFieldId) : null;
    openFieldId = null;
    trigger?.focus({ preventScroll: true });
  }

  $effect(() => {
    const id = activeField?.id;
    if (!visible || id == null) return;
    const trigger = settingsTrigger(id);
    if (!trigger) return;
    const nameInput = trigger.closest(".field-main").querySelector(".field-name");
    const configuration = trigger.closest(".configuration");
    const viewport = layout;
    trigger.scrollIntoView({ block: "nearest", inline: "nearest" });

    function position(event) {
      if (event?.type === "scroll" && event.target instanceof Node && settingsPanel?.contains(event.target)) return;
      const anchor = trigger.getBoundingClientRect();
      const view = viewport.getBoundingClientRect();
      const edge = 8;
      const gap = 5;
      if (anchor.bottom <= view.top || anchor.top >= view.bottom) {
        closeFieldSettings();
        return;
      }
      const panel = configuration.getBoundingClientRect();
      const leftLimit = Math.max(edge, panel.left + edge);
      const rightLimit = Math.min(document.documentElement.clientWidth - edge, panel.right - edge);
      const clearLeft = nameInput.getBoundingClientRect().right + gap;
      const availableAfterName = rightLimit - clearLeft;
      const width = Math.min(320, rightLimit - leftLimit, Math.max(180, availableAfterName));
      const below = window.innerHeight - anchor.bottom - gap - edge;
      const above = anchor.top - gap - edge;
      const upward = below < 180 && above > below;
      settingsPosition = {
        width,
        left: Math.max(leftLimit, Math.min(anchor.left, rightLimit - width)),
        top: upward ? undefined : anchor.bottom + gap,
        bottom: upward ? window.innerHeight - anchor.top + gap : undefined,
        maxHeight: Math.max(0, upward ? above : below),
      };
    }

    function dismissOutside(event) {
      if (!trigger.contains(event.target) && !settingsPanel?.contains(event.target)) closeFieldSettings();
    }

    function dismissOnEscape(event) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      closeFieldSettings(true);
    }

    const closeOverlays = () => closeFieldSettings();
    position();
    void tick().then(() => {
      if (visible && openFieldId === id) settingsPanel?.focus({ preventScroll: true });
    });
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.addEventListener("toolbox-close-overlays", closeOverlays);
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("toolbox-close-overlays", closeOverlays);
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  });

  function run(nextSeed = seed) {
    error = null;
    try {
      rows = generateFakeRows(count, fields, { seed: nextSeed, referenceDate });
      seed = nextSeed;
      generatedConfig = configSignature;
    } catch (cause) {
      rows = [];
      error = cause;
      if (cause instanceof FakeDataError) {
        if (cause.code === "referenceDate") advancedOpen = true;
        const field = fields[cause.index];
        if (field && editableTypes.has(field.type) && !["name", "duplicate", "type"].includes(cause.code)) {
          openFieldId = field.id;
        }
      }
    }
  }

  function generateNewBatch() {
    const random = crypto.getRandomValues(new Uint32Array(2));
    const nextSeed = Array.from(random, (value) => value.toString(16).padStart(8, "0")).join("");
    run(nextSeed);
  }

  function errorText(cause, showIndex = true) {
    if (!(cause instanceof FakeDataError)) return localizeError(locale, cause);
    const message = label(FAKE_DATA_ERRORS[cause.code]);
    const field = cause.field || (showIndex && cause.index >= 0 ? t(`第 ${cause.index + 1} 个字段`, `Field ${cause.index + 1}`) : "");
    return field ? `${field} · ${message}` : message;
  }

  function onShortcut(event) {
    if (!visible || settingsPanel || event.defaultPrevented || event.isComposing || !(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    event.preventDefault();
    run();
  }

  async function addField() {
    const field = fieldRow("", "sentence");
    fields.push(field);
    error = null;
    openFieldId = null;
    await tick();
    fieldList?.querySelector(`[data-field-id="${field.id}"] .field-name`)?.focus();
  }

  function usePersonPreset() {
    fields = personFields.map(([name, type]) => fieldRow(name, type));
    bulkError = null;
    openFieldId = null;
    run();
  }

  function capturePresetConfig() {
    return { fields: $state.snapshot(fields), count, seed, format, referenceDate };
  }

  function applyPreset(draft) {
    const config = validatePresetConfig(draft);
    const generated = generateFakeRows(config.count, config.fields, config);
    fields = config.fields.map((field) => ({ ...field, id: ++nextFieldId }));
    count = config.count;
    seed = config.seed;
    format = config.format;
    referenceDate = config.referenceDate;
    rows = generated;
    generatedConfig = configSignature;
    error = null;
    bulkError = null;
    openFieldId = null;
  }

  function reorderField(sourceId, targetId, after) {
    const source = fields.findIndex(({ id }) => id === sourceId);
    const target = fields.findIndex(({ id }) => id === targetId);
    const next = reorderList(fields, source, target, after);
    if (next.every((field, index) => field === fields[index])) return;
    const name = fields[source].name || t(`第 ${source + 1} 个字段`, `Field ${source + 1}`);
    fields = next;
    error = null;
    reorderAnnouncement = label(chrome.reorderedItem(name));
  }

  function startFieldDrag(event, sourceId) {
    if (event.button !== 0 || fieldDrag) return;
    fieldDrag = { pointerId: event.pointerId, sourceId, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, targetId: null, after: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateDropTarget() {
    const hit = document.elementFromPoint(fieldDrag.x, fieldDrag.y)?.closest("[data-field-id]");
    if (!hit || !fieldList?.contains(hit)) {
      fieldDrag.targetId = null;
      return;
    }
    const rect = hit.getBoundingClientRect();
    fieldDrag.targetId = Number(hit.dataset.fieldId);
    fieldDrag.after = fieldDrag.y >= rect.top + rect.height / 2;
  }

  function scrollFieldDrag() {
    dragFrame = 0;
    if (!fieldDrag?.active || !layout || !fieldList) return;
    const bounds = layout.getBoundingClientRect();
    const listBounds = fieldList.getBoundingClientRect();
    if (fieldDrag.x < listBounds.left || fieldDrag.x > listBounds.right) return;
    const top = Math.max(0, bounds.top);
    const bottom = Math.min(window.innerHeight, bounds.bottom);
    const delta = fieldDrag.y < top + 30 ? -10 : fieldDrag.y > bottom - 30 ? 10 : 0;
    const before = layout.scrollTop;
    if (!delta) return;
    layout.scrollTop += delta;
    if (before === layout.scrollTop) return;
    updateDropTarget();
    dragFrame = requestAnimationFrame(scrollFieldDrag);
  }

  function moveFieldDrag(event) {
    if (fieldDrag?.pointerId !== event.pointerId) return;
    if (!fieldDrag.active && Math.abs(event.clientY - fieldDrag.startY) < 5) return;
    fieldDrag.active = true;
    fieldDrag.x = event.clientX;
    fieldDrag.y = event.clientY;
    updateDropTarget();
    if (!dragFrame) dragFrame = requestAnimationFrame(scrollFieldDrag);
  }

  function clearFieldDrag() {
    fieldDrag = null;
    if (dragFrame) cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  }

  function finishFieldDrag(event) {
    if (fieldDrag?.pointerId !== event.pointerId) return;
    if (fieldDrag.active) {
      fieldDrag.x = event.clientX;
      fieldDrag.y = event.clientY;
      updateDropTarget();
      reorderField(fieldDrag.sourceId, fieldDrag.targetId, fieldDrag.after);
    }
    clearFieldDrag();
  }

  function cancelFieldDrag(event) {
    if (fieldDrag?.pointerId === event.pointerId) clearFieldDrag();
  }

  function reorderWithKeyboard(event, index) {
    if (event.key === "Escape" && fieldDrag) clearFieldDrag();
    if (!["ArrowUp", "ArrowDown"].includes(event.key) || fieldDrag) return;
    event.preventDefault();
    const after = event.key === "ArrowDown";
    const target = fields[index + (after ? 1 : -1)];
    if (target) reorderField(fields[index].id, target.id, after);
  }

  async function removeField(index) {
    const [removed] = fields.splice(index, 1);
    error = null;
    if (openFieldId === removed.id) openFieldId = null;
    const next = fields[Math.min(index, fields.length - 1)];
    await tick();
    if (next) fieldList?.querySelector(`[data-field-id="${next.id}"] .remove-field`)?.focus();
    else addFieldButton?.focus();
  }

  function changeType(field, type) {
    field.type = type;
    field.options = defaults(type);
    if (openFieldId === field.id && !editableTypes.has(type)) openFieldId = null;
    error = null;
  }

  function changeFixedType(field, type) {
    const values = { string: "", number: 0, boolean: true, null: null };
    field.options.value = values[type];
  }

  function addBulkFields() {
    bulkError = null;
    try {
      const parsed = parseFakeFields(bulkText.trim().split(/[,，]|\r?\n/));
      if (fields.length + parsed.length > 50) throw new FakeDataError("fieldCount");
      const existing = new Set(fields.map((field) => field.name.trim()));
      for (const { name } of parsed) {
        if (existing.has(name)) throw new FakeDataError("duplicate", { field: name });
      }
      fields.push(...parsed.map(({ name, type }) => fieldRow(name, type)));
      bulkText = "";
      error = null;
    } catch (cause) {
      bulkError = cause;
    }
  }

  onMount(run);
  onDestroy(clearFieldDrag);
</script>

<svelte:window onkeydown={onShortcut} />

{#snippet selectOption(options, key, title, items, onchange = undefined, searchPlaceholder = "")}
  <div class="select-option">
    <span>{title}</span>
    <Select bind:value={options[key]} options={items} ariaLabel={title} fitTrigger menuContainer={settingsPanel}
      {onchange} {searchPlaceholder} searchEmptyLabel={t("未找到匹配结果", "No matches found")} />
  </div>
{/snippet}

{#snippet dateFormatOption(options, type)}
  {@const isDatetime = type === "datetime"}
  {@const example = isDatetime ? "YYYY-MM-DD HH:mm:ss" : "YYYY.MM.DD"}
  {@render selectOption(options, "format", t("日期格式", "Date format"), isDatetime ? datetimeFormats : dateFormats, (format) => {
    if (format === FAKE_CUSTOM_DATE_FORMAT) options.customFormat ??= example;
  })}
  {#if options.format === FAKE_CUSTOM_DATE_FORMAT}
    <label class="full-width">
      <span>{label(FAKE_DATA_GENERATION_COPY.customFormat)}</span>
      <input class="dbx-input mono" aria-label={label(FAKE_DATA_GENERATION_COPY.customFormat)} aria-describedby={`${viewId}-date-format-help`}
        bind:value={options.customFormat} maxlength={FAKE_DATE_PATTERN_LIMIT} placeholder={example} spellcheck="false" />
      <small class="help" id={`${viewId}-date-format-help`}>YYYY / YY · MM / M · DD / D{type !== "birthDate" ? " · HH:mm:ss" : ""}<br />{label(FAKE_DATA_GENERATION_COPY.customFormatHelp)}</small>
    </label>
  {/if}
{/snippet}

{#snippet numberOption(options, key, title, min = undefined, max = undefined, step = 1)}
  <label>
    <span>{title}</span>
    <input class="dbx-input" type="number" {min} {max} {step} bind:value={options[key]} />
  </label>
{/snippet}

{#snippet fieldSettings(field)}
  {@const options = field.options}
  <div class="field-options">
    {#if Object.hasOwn(options, "language")}
      {@render selectOption(options, "language", label(FAKE_DATA_COPY.outputLanguage), dataLanguages)}
    {/if}
    {#if field.type === "phone"}
      {@render selectOption(options, "region", t("国家 / 地区", "Country / region"), phoneRegions, undefined, label(FAKE_DATA_GENERATION_COPY.searchRegion))}
      {@render selectOption(options, "format", t("号码格式", "Phone format"), phoneFormats)}
    {:else if FAKE_ADDRESS_TYPES.includes(field.type)}
      {@render selectOption(options, "city", t("城市", "City"), cityOptions)}
    {:else if field.type === "birthDate"}
      {@render dateFormatOption(options, field.type)}
    {:else if ["date", "datetime", "timestamp"].includes(field.type)}
      <label>
        <span>{t("开始日期", "Start date")}</span>
        <input class="dbx-input" type="date" bind:value={options.start} />
      </label>
      <label>
        <span>{t("结束日期", "End date")}</span>
        <input class="dbx-input" type="date" bind:value={options.end} />
      </label>
      {#if field.type === "timestamp"}
        {@render selectOption(options, "unit", t("单位", "Unit"), timeUnits)}
      {:else}
        {@render dateFormatOption(options, field.type)}
      {/if}
    {:else if ["age", "integer", "number", "amount"].includes(field.type)}
      {@const isWhole = field.type === "age" || field.type === "integer"}
      {@const age = field.type === "age"}
      {@render numberOption(options, "min", t("最小值", "Minimum"), age ? 0 : undefined, age ? 120 : undefined, isWhole ? 1 : "any")}
      {@render numberOption(options, "max", t("最大值", "Maximum"), age ? 0 : undefined, age ? 120 : undefined, isWhole ? 1 : "any")}
      {#if !isWhole}{@render numberOption(options, "decimals", label(FAKE_DATA_COPY.decimals), 0, 8)}{/if}
    {:else if field.type === "sequence"}
      {@render numberOption(options, "start", t("起始值", "Start value"))}
      {@render numberOption(options, "step", label(FAKE_DATA_COPY.step))}
    {:else if field.type === "boolean"}
      {@render numberOption(options, "truePercent", label(FAKE_DATA_COPY.truePercent), 0, 100, "any")}
    {:else if field.type === "enum"}
      <label class="full-width">
        <span>{label(FAKE_DATA_COPY.choices)}</span>
        <textarea class="dbx-textarea" rows="3" bind:value={options.values}></textarea>
      </label>
    {:else if field.type === "sentence" || field.type === "paragraph"}
      {@render numberOption(options, "count", t("数量", "Count"), 1, 10)}
    {:else if field.type === "fixed"}
      {@render selectOption(options, "valueType", t("值类型", "Value type"), fixedTypes, (type) => changeFixedType(field, type))}
      {#if options.valueType === "boolean"}
        {@render selectOption(options, "value", t("值", "Value"), booleanValues)}
      {:else if options.valueType === "number"}
        {@render numberOption(options, "value", t("值", "Value"), undefined, undefined, "any")}
      {:else if options.valueType === "string"}
        <label>
          <span>{t("值", "Value")}</span>
          <input class="dbx-input mono" bind:value={options.value} />
        </label>
      {/if}
    {:else if field.type === "pattern"}
      <label class="full-width">
        <span>{t("模板", "Template")}</span>
        <input class="dbx-input mono" maxlength="256" bind:value={options.template} />
        <span class="help">{label(FAKE_DATA_COPY.patternHelp)}</span>
      </label>
    {/if}
  </div>
{/snippet}

<div class="fake-layout" bind:this={layout}>
  <form class="panel configuration" novalidate onsubmit={(event) => { event.preventDefault(); run(); }}>
    <div class="field-section">
      <header class="section-header">
        <h3>{label(FAKE_DATA_COPY.fields)}</h3>
        <FakeDataPresets {locale} {visible} captureConfig={capturePresetConfig} {applyPreset} {usePersonPreset} formatError={errorText} />
      </header>
      <span class="sr-only" aria-live="polite">{reorderAnnouncement}</span>
      {#if fields.length > 0}
        <div class="fields" bind:this={fieldList}>
          <div class="field-head" aria-hidden="true">
            <span>{t("字段名", "Field name")}</span>
            <span>{label(FAKE_DATA_COPY.fieldType)}</span>
            <span>{label(FAKE_DATA_COPY.fieldOptions)}</span>
          </div>
          {#each fields as field, index (field.id)}
            {@const fieldLabel = t(`第 ${index + 1} 个字段`, `Field ${index + 1}`)}
            {@const dropTarget = fieldDrag?.active && fieldDrag.targetId === field.id && fieldDrag.sourceId !== field.id}
            <div
              class="field-row"
              class:invalid={error?.index === index}
              class:dragging={fieldDrag?.active && fieldDrag.sourceId === field.id}
              class:drop-before={dropTarget && !fieldDrag.after}
              class:drop-after={dropTarget && fieldDrag.after}
              data-field-id={field.id}
              role="group"
              aria-label={fieldLabel}
            >
              <div class="field-main">
                <button
                  class="dbx-btn dbx-btn--ghost drag-handle"
                  type="button"
                  disabled={fields.length < 2}
                  title={label(FAKE_DATA_COPY.reorder)}
                  aria-label={`${fieldLabel} · ${label(FAKE_DATA_COPY.reorder)}`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  onpointerdown={(event) => startFieldDrag(event, field.id)}
                  onpointermove={moveFieldDrag}
                  onpointerup={finishFieldDrag}
                  onpointercancel={cancelFieldDrag}
                  onlostpointercapture={cancelFieldDrag}
                  onkeydown={(event) => reorderWithKeyboard(event, index)}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <circle cx="5" cy="3" r="1" /><circle cx="9" cy="3" r="1" />
                    <circle cx="5" cy="7" r="1" /><circle cx="9" cy="7" r="1" />
                    <circle cx="5" cy="11" r="1" /><circle cx="9" cy="11" r="1" />
                  </svg>
                </button>
                <input
                  class="dbx-input mono field-name"
                  aria-label={`${fieldLabel} · ${t("字段名", "Field name")}`}
                  aria-invalid={error?.index === index && ["name", "duplicate"].includes(error?.code)}
                  placeholder={t("字段名", "Field name")}
                  bind:value={field.name}
                />
                <Select
                  value={field.type}
                  options={typeOptions}
                  ariaLabel={`${fieldLabel} · ${label(FAKE_DATA_COPY.fieldType)}`}
                  searchPlaceholder={label(FAKE_DATA_COPY.searchType)}
                  searchEmptyLabel={t("未找到匹配结果", "No matches found")}
                  onchange={(type) => changeType(field, type)}
                />
                {#if editableTypes.has(field.type)}
                  <button
                    class="dbx-btn row-toggle"
                    type="button"
                    aria-label={`${fieldLabel} · ${label(FAKE_DATA_COPY.fieldOptions)}`}
                    title={label(FAKE_DATA_COPY.fieldOptions)}
                    aria-haspopup="dialog"
                    aria-expanded={openFieldId === field.id}
                    aria-controls={openFieldId === field.id ? settingsPanelId : undefined}
                    onclick={() => {
                      if (openFieldId === field.id) closeFieldSettings();
                      else openFieldId = field.id;
                    }}
                  >
                    <span>{label(FAKE_DATA_COPY.settings)}</span>
                    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="m4 6 4 4 4-4" />
                    </svg>
                  </button>
                {:else}
                  <span class="no-field-options" title={label(FAKE_DATA_COPY.noFieldOptions)}>{label(FAKE_DATA_COPY.noFieldOptions)}</span>
                {/if}
                <button
                  class="dbx-btn dbx-btn--ghost remove-field"
                  type="button"
                  aria-label={`${fieldLabel} · ${t("删除字段", "Remove field")}`}
                  title={t("删除字段", "Remove field")}
                  onclick={() => removeField(index)}
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
                  </svg>
                </button>
              </div>

              {#if error?.index === index}<p class="error field-error" role="alert">{errorText(error)}</p>{/if}
            </div>
          {/each}
        </div>
      {/if}
      <button class="dbx-btn dbx-btn--ghost add-field" type="button" bind:this={addFieldButton} onclick={addField} disabled={fields.length >= 50}>
        <span aria-hidden="true">+</span> {label(FAKE_DATA_COPY.add)}
      </button>
    </div>
    <div class="generate-bar">
      <label class="count-field">
        <span>{t("数量", "Count")}</span>
        <input class="dbx-input" type="number" min="1" max="1000" step="1" bind:value={count} />
      </label>
      <div class="generate-actions">
        <label class="seed-field">
          <span>{t("随机种子", "Seed")}</span>
          <input class="dbx-input mono" bind:value={seed} spellcheck="false" />
        </label>
        <button class="dbx-btn" type="button" onclick={generateNewBatch}>{label(FAKE_DATA_GENERATION_COPY.newBatch)}</button>
        <button class="dbx-btn dbx-btn--primary" type="submit">{t("生成数据", "Generate data")}</button>
      </div>
    </div>
    {#if error && !(error.index >= 0)}<p class="error" role="alert">{errorText(error)}</p>{/if}
    <details class="advanced" bind:open={advancedOpen}>
      <summary>{t("高级设置", "Advanced settings")}</summary>
      {#if needsReference}
        <div class="advanced-fields">
          <label>
            <span>{label(FAKE_DATA_COPY.reference)}</span>
            <input class="dbx-input" type="date" min="1900-01-01" max="9999-12-31" bind:value={referenceDate} />
          </label>
        </div>
      {/if}
      <div class="bulk">
        <label for="fake-bulk-fields">{label(FAKE_DATA_COPY.bulk)}</label>
        <div class="bulk-input">
          <input
            id="fake-bulk-fields"
            class="dbx-input mono"
            placeholder="name:cnName,age:age,mobile:phone"
            bind:value={bulkText}
            onkeydown={(event) => {
              if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.isComposing) return;
              event.preventDefault();
              if (bulkText.trim()) addBulkFields();
            }}
          />
          <button class="dbx-btn" type="button" onclick={addBulkFields} disabled={!bulkText.trim()}>{t("添加", "Add")}</button>
        </div>
        {#if bulkError}<p class="error" role="alert">{errorText(bulkError, false)}</p>{/if}
      </div>
    </details>
    {#if needsTestLabel}<p class="help">{label(FAKE_DATA_COPY.localOnly)}</p>{/if}
  </form>
  <FakeDataResult {locale} {rows} bind:format stale={outputIsStale} />
</div>

{#if visible && activeField && settingsPosition}
  <div
    class="field-settings-dropdown"
    id={settingsPanelId}
    bind:this={settingsPanel}
    role="dialog"
    aria-labelledby={settingsTitleId}
    tabindex="-1"
    style:left={`${settingsPosition.left}px`}
    style:width={`${settingsPosition.width}px`}
    style:top={settingsPosition.top == null ? undefined : `${settingsPosition.top}px`}
    style:bottom={settingsPosition.bottom == null ? undefined : `${settingsPosition.bottom}px`}
    style:max-height={`${settingsPosition.maxHeight}px`}
  >
    <header class="settings-header">
      <h3 id={settingsTitleId}>{label(FAKE_DATA_COPY.fieldOptions)}</h3>
      <span>{activeField.name || typeOptions.find(({ value }) => value === activeField.type)?.label}</span>
    </header>
    {@render fieldSettings(activeField)}
    {#if fields[error?.index]?.id === activeField.id}
      <p class="error" role="alert">{errorText(error)}</p>
    {/if}
    <footer class="settings-footer">
      <button class="dbx-btn" type="button" onclick={() => closeFieldSettings(true)}>{t("完成", "Done")}</button>
    </footer>
  </div>
{/if}

<style>
  .fake-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.28fr) minmax(280px, 1fr);
    align-items: start;
    gap: 12px;
    min-height: 0;
    flex: 1;
    overflow: auto;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--color-border);
    border-radius: 10px;
    background: var(--color-card);
  }
  .field-head, .field-main {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1.05fr) minmax(74px, .58fr) 28px;
    align-items: center;
    gap: 8px;
  }
  label, .select-option {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    color: var(--color-muted-foreground);
    font-size: 12px;
    font-weight: 500;
  }
  .panel :global(.dbx-custom-select) { min-width: 0; }
  .panel .dbx-input { min-width: 0; width: 100%; }
  .field-section { display: flex; flex-direction: column; gap: 8px; }
  .section-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h3 { margin: 0; font-size: 14px; }
  .fields {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-background);
  }
  .field-head {
    padding: 8px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-muted-foreground);
    font-size: 12px;
  }
  .field-head span:first-child { grid-column: 2; }
  .field-head span, .no-field-options { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .field-row {
    min-width: 0;
    padding: 6px 8px;
  }
  .field-row + .field-row { border-top: 1px solid var(--color-border); }
  .field-row.invalid { box-shadow: inset 2px 0 var(--color-destructive); }
  .field-row.dragging { opacity: .45; }
  .field-row.drop-before { box-shadow: inset 0 2px var(--color-primary); }
  .field-row.drop-after { box-shadow: inset 0 -2px var(--color-primary); }
  .drag-handle {
    width: 24px;
    padding: 0;
    color: var(--color-muted-foreground);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .drag-handle:active { cursor: grabbing; }
  .drag-handle:disabled { visibility: hidden; }
  .row-toggle {
    display: flex;
    justify-self: start;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    padding-inline: 6px;
    font-size: 12px;
  }
  .row-toggle span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row-toggle svg { flex: none; }
  .row-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
  .no-field-options { padding-inline: 6px; color: var(--color-muted-foreground); font-size: 12px; }
  .field-settings-dropdown {
    position: fixed;
    z-index: 130;
    box-sizing: border-box;
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-card);
    color: var(--color-foreground);
    outline: none;
  }
  .settings-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .settings-header h3 { flex: none; }
  .settings-header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-muted-foreground); font-size: 12px; }
  .settings-footer { display: flex; justify-content: flex-end; margin-top: 12px; }
  .field-settings-dropdown .error { margin-top: 8px; }
  .remove-field {
    grid-column: 5;
    width: 28px;
    padding: 0;
    color: var(--color-muted-foreground);
  }
  .remove-field:hover, .remove-field:focus-visible { color: var(--color-destructive); }
  .field-options, .advanced-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .field-options label, .field-options .select-option, .advanced-fields label { flex: 1 1 115px; }
  .field-options .dbx-input { width: 100%; min-width: 0; }
  .field-options :global(.dbx-custom-select) { min-width: 0; }
  .field-options .full-width { flex-basis: 100%; }
  .field-options textarea { width: 100%; resize: vertical; }
  .add-field { align-self: flex-start; }
  .generate-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .generate-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-inline-start: auto; }
  .seed-field { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 6px; width: clamp(154px, 22vw, 214px); white-space: nowrap; }
  .count-field { display: grid; grid-template-columns: auto 76px; align-items: center; gap: 8px; }
  .advanced { padding-top: 10px; border-top: 1px solid var(--color-border); }
  .advanced summary { width: fit-content; color: var(--color-muted-foreground); font-size: 12px; cursor: pointer; }
  .advanced-fields, .bulk { margin-top: 10px; }
  .bulk-input { display: flex; gap: 8px; margin-top: 4px; }
  .bulk-input input { flex: 1; }
  .bulk-input button { flex: none; white-space: nowrap; }
  .help, .error { margin: 0; font-size: 12px; line-height: 1.5; }
  .help { color: var(--color-muted-foreground); }
  .error { color: var(--color-destructive); overflow-wrap: anywhere; }
  .field-error, .bulk .error { margin-top: 6px; }
  @media (max-width: 860px) {
    .fake-layout { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 400px) {
    .panel { padding: 10px; }
    .field-head, .field-main { grid-template-columns: 20px minmax(0, 1fr) minmax(0, 1fr) minmax(66px, .58fr) 28px; gap: 5px; }
    .drag-handle { width: 20px; }
    .row-toggle { padding-inline: 3px; }
  }
</style>
