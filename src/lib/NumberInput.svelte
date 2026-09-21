<script>
  import { pick } from './i18n.js';
  let {
    locale = "zh-CN",
    value = $bindable(0),
    min = undefined,
    max = undefined,
    step = 1,
    class: className = "",
    disabled = false,
    ariaLabel = "",
    onchange,
    oninput,
  } = $props();

  let draft = $state(null);

  const lo = $derived(min == null || min === "" ? null : Number(min));
  const hi = $derived(max == null || max === "" ? null : Number(max));
  const stride = $derived(Number(step) > 0 ? Number(step) : 1);
  const shown = $derived(draft ?? String(value ?? ""));
  const atMin = $derived(lo != null && Number(value) <= lo);
  const atMax = $derived(hi != null && Number(value) >= hi);

  function clamp(n) {
    let x = Number(n);
    if (!Number.isFinite(x)) x = lo ?? 0;
    if (lo != null && x < lo) x = lo;
    if (hi != null && x > hi) x = hi;
    return x;
  }

  function emit(next, live) {
    const changed = next !== Number(value);
    value = next;
    if (changed) oninput?.(next);
    if (!live) onchange?.(next);
  }

  function commit(raw, live) {
    const trimmed = String(raw).trim();
    if (live) {
      if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") return;
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) return;
      emit(parsed, true);
      return;
    }
    draft = null;
    if (trimmed === "" || trimmed === "-" || trimmed === "." || trimmed === "-.") {
      emit(clamp(value), false);
      return;
    }
    const parsed = Number(trimmed);
    emit(clamp(Number.isFinite(parsed) ? parsed : value), false);
  }

  function bump(dir, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (disabled) return;
    draft = null;
    emit(clamp((Number(value) || 0) + dir * stride), false);
  }
</script>

<div class="dbx-number {className}">
  <input
    class="dbx-input spin"
    type="text"
    inputmode="numeric"
    value={shown}
    {disabled}
    aria-label={ariaLabel || undefined}
    aria-valuemin={lo ?? undefined}
    aria-valuemax={hi ?? undefined}
    aria-valuenow={Number.isFinite(Number(value)) ? Number(value) : undefined}
    role="spinbutton"
    oninput={(event) => {
      draft = event.currentTarget.value;
      commit(event.currentTarget.value, true);
    }}
    onblur={(event) => commit(event.currentTarget.value, false)}
    onkeydown={(event) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        bump(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        bump(-1);
      } else if (event.key === "Enter") {
        commit(event.currentTarget.value, false);
      }
    }}
  />
  <div class="stepper" aria-hidden="true">
    <button
      aria-label={pick(locale, "增加", "Increase")}
      disabled={disabled || atMax}
      onmousedown={(event) => event.preventDefault()}
      onclick={(event) => bump(1, event)}
      tabindex="-1"
      type="button"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 15 6-6 6 6"></path>
      </svg>
    </button>
    <button
      aria-label={pick(locale, "减少", "Decrease")}
      disabled={disabled || atMin}
      onmousedown={(event) => event.preventDefault()}
      onclick={(event) => bump(-1, event)}
      tabindex="-1"
      type="button"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 9 6 6 6-6"></path>
      </svg>
    </button>
  </div>
</div>

<style>
  .dbx-number {
    position: relative;
    display: inline-flex;
    width: 100%;
    min-width: 0;
    vertical-align: middle;
  }
  .spin {
    padding-right: 22px;
  }
  .stepper {
    position: absolute;
    top: 1px;
    right: 1px;
    bottom: 1px;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 18px;
    overflow: hidden;
    border-left: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
    border-radius: 0 var(--radius-md, 6px) var(--radius-md, 6px) 0;
  }
  .stepper button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: var(--color-background, Canvas);
    color: var(--color-muted-foreground, color-mix(in srgb, CanvasText 58%, transparent));
    line-height: 0;
    cursor: pointer;
  }
  .stepper button + button {
    border-top: 1px solid var(--color-input, var(--color-border, color-mix(in srgb, CanvasText 18%, transparent)));
  }
  .stepper button:hover:not(:disabled) {
    background: var(--color-muted, var(--color-accent, color-mix(in srgb, CanvasText 8%, transparent)));
    color: var(--color-foreground, CanvasText);
  }
  .stepper button:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
