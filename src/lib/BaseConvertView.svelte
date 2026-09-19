<script>
  import { untrack } from "svelte";
  import { copyText } from "./clipboard.js";
  import { chrome, pick } from "./i18n.js";
  import {
    clampRadix,
    CUSTOM_BASE_ID,
    describeInteger,
    formatBaseInteger,
    NUMBER_BASES,
    parseBaseInteger,
  } from "./tools/convert.js";

  let { locale = "zh-CN" } = $props();

  let values = $state(emptyValues());
  let customRadix = $state(36);
  let grouped = $state(true);
  let prefixes = $state(false);
  let number = $state(null);
  let invalidId = $state("");
  let copiedId = $state("");
  let info = $state(null);
  let copyError = $state("");

  const t = (zh, en) => pick(locale, zh, en);
  const formatOpts = $derived({ group: grouped, prefix: prefixes });

  function emptyValues() {
    return Object.fromEntries([...NUMBER_BASES.map((base) => [base.id, ""]), [CUSTOM_BASE_ID, ""]]);
  }

  function radixOf(id) {
    if (id === CUSTOM_BASE_ID) return clampRadix(customRadix);
    return NUMBER_BASES.find((base) => base.id === id)?.radix ?? null;
  }

  function paint(exceptId) {
    if (number == null) {
      info = null;
      return;
    }
    info = describeInteger(number);
    for (const base of NUMBER_BASES) {
      if (base.id === exceptId) continue;
      values[base.id] = formatBaseInteger(number, base.radix, formatOpts);
    }
    if (exceptId !== CUSTOM_BASE_ID) {
      const radix = clampRadix(customRadix);
      values[CUSTOM_BASE_ID] = radix ? formatBaseInteger(number, radix, { group: grouped, prefix: false }) : "";
    }
  }

  function update(fromId, text) {
    if (values[fromId] === text) return;
    values[fromId] = text;
    copiedId = "";
    copyError = "";
    if (!text.trim()) {
      invalidId = "";
      number = null;
      info = null;
      for (const key of Object.keys(values)) {
        if (key !== fromId) values[key] = "";
      }
      return;
    }
    const radix = radixOf(fromId);
    if (!radix) {
      invalidId = fromId;
      number = null;
      info = null;
      for (const key of Object.keys(values)) if (key !== fromId) values[key] = "";
      return;
    }
    try {
      number = parseBaseInteger(text, radix);
      invalidId = "";
      paint(fromId);
    } catch {
      invalidId = fromId;
      number = null;
      info = null;
      for (const key of Object.keys(values)) if (key !== fromId) values[key] = "";
    }
  }

  $effect(() => {
    grouped;
    prefixes;
    customRadix;
    untrack(() => {
      if (number == null || invalidId) return;
      paint(null);
    });
  });

  async function copy(id) {
    const text = values[id];
    if (!text || invalidId) return;
    try {
      await copyText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = "";
      }, 1200);
    } catch {
      copiedId = "";
      copyError = t("复制失败，请选择文本手动复制。", "Copy failed. Select the text and copy manually.");
    }
  }

  function clearAll() {
    invalidId = "";
    copiedId = "";
    number = null;
    info = null;
    values = emptyValues();
  }

  function copyLabel(name, done) {
    if (done) return t(`${name}已复制`, `Copied ${name}`);
    return t(`复制${name}`, `Copy ${name}`);
  }

  function customPlaceholder() {
    const radix = clampRadix(customRadix);
    if (!radix) return "";
    try {
      return formatBaseInteger(255n, radix, { group: grouped, prefix: false });
    } catch {
      return "";
    }
  }

  function stepRadix(delta) {
    const current = clampRadix(customRadix) ?? 2;
    customRadix = Math.min(36, Math.max(2, current + delta));
  }
</script>

<div class="base-convert">
  {#if copyError}<p class="dbx-hint" role="alert">{copyError}</p>{/if}
  <div class="base-head">
    <div class="base-info-card" aria-label={t("当前值信息", "Current value information")}>
      <div class="base-info-item">
        <span class="base-info-label">{t("位宽", "Bits")}</span>
        <span class="base-info-value">{info ? `${info.bits} bit` : "—"}</span>
      </div>
      <div class="base-info-item">
        <span class="base-info-label">{t("字节数", "Bytes")}</span>
        <span class="base-info-value">{info ? `${info.bytes} B` : "—"}</span>
      </div>
      <div class="base-info-item">
        <span class="base-info-label">{t("字符", "Character")}</span>
        <span class="base-info-value base-info-glyph">{info?.glyph ? `'${info.glyph}'` : "—"}</span>
      </div>
      <div class="base-info-item">
        <span class="base-info-label">Unicode</span>
        <span class="base-info-value">{info?.code || "—"}</span>
      </div>
    </div>
    <button class="dbx-btn clear-action" onclick={clearAll} type="button">{t("清空", "Clear")}</button>
  </div>

  <div class="base-opts">
    <label class="base-opt">
      <input type="checkbox" bind:checked={grouped} />
      <span>{t("分组", "Group")}</span>
    </label>
    <label class="base-opt">
      <input type="checkbox" bind:checked={prefixes} />
      <span>{t("0x / 0b 前缀", "0x / 0b prefix")}</span>
    </label>
  </div>

  <div class="base-rows">
    {#each NUMBER_BASES as base (base.id)}
      {@const done = copiedId === base.id}
      {@const name = t(base.zh, base.en)}
      <div class="base-row">
        <label class="base-label" for="base-{base.id}">
          <span class="base-name">{name}</span>
          <span class="base-short">{base.short}</span>
        </label>
        <input
          id="base-{base.id}"
          class="dbx-input base-input"
          class:invalid={invalidId === base.id}
          spellcheck="false"
          autocomplete="off"
          placeholder={base.placeholder}
          value={values[base.id]}
          oninput={(event) => update(base.id, event.currentTarget.value)}
        />
        <button
          class="dbx-btn dbx-btn--ghost base-copy"
          disabled={!values[base.id] || invalidId === base.id}
          onclick={() => copy(base.id)}
          title={done ? t(chrome.copied.zh, chrome.copied.en) : copyLabel(name, false)}
          aria-label={copyLabel(name, done)}
          type="button"
        >
          {#if done}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          {/if}
        </button>
      </div>
    {/each}

    {#each [CUSTOM_BASE_ID] as id (id)}
      {@const customDone = copiedId === id}
      {@const customName = t(`进制 ${clampRadix(customRadix) || "—"}`, `Base ${clampRadix(customRadix) || "—"}`)}
      <div class="base-row">
        <div class="base-label">
          <label class="base-name" for="base-radix">{t("任意进制", "Any base")}</label>
          <div class="base-radix-group">
            <input
              id="base-radix"
              class="dbx-input base-radix"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="2"
              autocomplete="off"
              spellcheck="false"
              bind:value={customRadix}
              onkeydown={(event) => {
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  stepRadix(1);
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  stepRadix(-1);
                }
              }}
              title={t("2 到 36 进制", "Radix 2 to 36")}
            />
            <span class="base-radix-spinners">
              <button
                type="button"
                tabindex="-1"
                aria-label={t("进制加一", "Increase radix")}
                onclick={() => stepRadix(1)}
              >
                <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true">
                  <path d="M4 1 7.4 5.2H.6Z" fill="currentColor"></path>
                </svg>
              </button>
              <button
                type="button"
                tabindex="-1"
                aria-label={t("进制减一", "Decrease radix")}
                onclick={() => stepRadix(-1)}
              >
                <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true">
                  <path d="M4 5 7.4.8H.6Z" fill="currentColor"></path>
                </svg>
              </button>
            </span>
          </div>
        </div>
        <input
          id="base-custom"
          class="dbx-input base-input"
          class:invalid={invalidId === id}
          spellcheck="false"
          autocomplete="off"
          placeholder={customPlaceholder()}
          aria-label={t("任意进制数值", "Custom base value")}
          value={values[id]}
          oninput={(event) => update(id, event.currentTarget.value)}
        />
        <button
          class="dbx-btn dbx-btn--ghost base-copy"
          disabled={!values[id] || invalidId === id}
          onclick={() => copy(id)}
          title={customDone ? t(chrome.copied.zh, chrome.copied.en) : copyLabel(customName, false)}
          aria-label={copyLabel(customName, customDone)}
          type="button"
        >
          {#if customDone}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5"></path>
            </svg>
          {:else}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          {/if}
        </button>
      </div>
    {/each}
  </div>

  {#if invalidId}
    <p class="dbx-hint base-error">
      {t("不是有效的数字，请检查当前进制。", "Not a valid number for this base.")}
    </p>
  {/if}
</div>

<style>
  .base-convert {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 560px;
  }
  .base-head {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }
  .clear-action {
    flex: 0 0 auto;
    min-width: 72px;
  }
  .base-info-card {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    flex: 1 1 auto;
    min-width: 0;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    background: var(--color-muted, color-mix(in srgb, CanvasText 4%, transparent));
  }
  .base-info-item {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    padding: 8px 10px;
  }
  .base-info-item + .base-info-item {
    border-left: 1px solid var(--color-border, color-mix(in srgb, CanvasText 12%, transparent));
  }
  .base-info-label {
    overflow: hidden;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .base-info-value {
    overflow: hidden;
    color: var(--color-foreground, CanvasText);
    font-family: var(--font-mono);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .base-info-glyph {
    font-family: var(--font-sans, system-ui, sans-serif);
  }
  .base-opts {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 16px;
    align-items: center;
  }
  .base-opt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 12px;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    cursor: pointer;
  }
  .base-opt input {
    margin: 0;
  }
  .base-rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .base-row {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr) 30px;
    gap: 8px;
    align-items: center;
  }
  .base-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    min-width: 7.5rem;
    line-height: 1.2;
  }
  .base-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-foreground, CanvasText);
  }
  .base-short {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
  }
  .base-radix-group {
    display: inline-flex;
    align-items: stretch;
    height: 30px;
    flex: 0 0 auto;
    border: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
    background: var(--color-background, Canvas);
  }
  .base-radix-group:focus-within {
    outline: 2px solid var(--color-ring, var(--color-primary));
    outline-offset: -1px;
  }
  .base-radix {
    width: 2.55rem;
    min-width: 2.55rem;
    flex: 0 0 2.55rem;
    height: 28px;
    box-sizing: border-box;
    padding: 0 4px;
    text-align: center;
    font-variant-numeric: tabular-nums;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .base-radix:focus {
    outline: none;
  }
  .base-radix-spinners {
    display: flex;
    flex-direction: column;
    width: 16px;
    flex: 0 0 16px;
    border-left: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
  }
  .base-radix-spinners button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    cursor: pointer;
    line-height: 0;
  }
  .base-radix-spinners button + button {
    border-top: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
  }
  .base-radix-spinners button:hover {
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
    color: var(--color-foreground, CanvasText);
  }
  .base-input {
    font-family: var(--font-mono);
  }
  .base-input.invalid {
    border-color: var(--color-destructive);
  }
  .base-copy {
    width: 30px;
    padding: 0;
    flex-shrink: 0;
  }
  .base-error {
    margin: 0;
    color: var(--color-destructive);
  }

  @media (max-width: 560px) {
    .base-head {
      align-items: stretch;
      flex-direction: column;
    }
    .base-info-card {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .base-info-item + .base-info-item {
      border-left: 0;
    }
    .base-info-item:nth-child(odd) {
      border-right: 1px solid var(--color-border, color-mix(in srgb, CanvasText 12%, transparent));
    }
    .base-info-item:nth-child(n + 3) {
      border-top: 1px solid var(--color-border, color-mix(in srgb, CanvasText 12%, transparent));
    }
    .base-row {
      grid-template-columns: minmax(0, 1fr) 30px;
    }
    .base-label {
      grid-column: 1 / -1;
    }
  }
</style>
