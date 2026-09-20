<script>
  let { text = "" } = $props();
  let label = $state(null);
  let open = $state(false);

  function truncated() {
    return Boolean(label && label.scrollWidth > label.clientWidth + 0.5);
  }
  function show() {
    if (truncated()) open = true;
  }
  function hide() {
    open = false;
  }
</script>

<span
  class="clip-tip"
  class:open
  role="group"
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
>
  <span class="label" bind:this={label}>{text}</span>
  {#if open}
    <span class="tip" role="tooltip">{text}</span>
  {/if}
</span>

<style>
  .clip-tip {
    position: relative;
    display: block;
    width: 100%;
    min-width: 0;
  }
  .label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tip {
    position: absolute;
    z-index: 40;
    left: 0;
    top: calc(100% + 6px);
    width: max-content;
    max-width: min(280px, 72vw);
    padding: 6px 8px;
    border: 1px solid var(--color-border, color-mix(in srgb, CanvasText 14%, transparent));
    border-radius: var(--radius-md, 6px);
    background: var(--color-popover, var(--color-card, var(--color-background, Canvas)));
    color: var(--color-popover-foreground, var(--color-foreground, CanvasText));
    box-shadow: 0 8px 24px color-mix(in srgb, CanvasText 14%, transparent);
    font-size: 11px;
    line-height: 1.4;
    white-space: normal;
    pointer-events: none;
    animation: clip-tip-in 140ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes clip-tip-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
