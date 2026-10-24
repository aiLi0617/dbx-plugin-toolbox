<script>
  import { onMount } from 'svelte';
  let { title, description = '', cancelLabel, confirmLabel, onCancel, onConfirm } = $props();
  let dialog, cancelButton;
  onMount(() => {
    const previous = document.activeElement;
    dialog.showModal();
    cancelButton.focus();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus?.();
    };
  });
</script>

<dialog bind:this={dialog} class="settings-confirmation" aria-labelledby="settings-confirmation-title" aria-describedby={description ? 'settings-confirmation-description' : undefined} oncancel={(event) => { event.preventDefault(); onCancel(); }}>
  <h2 id="settings-confirmation-title">{title}</h2>
  {#if description}<p id="settings-confirmation-description">{description}</p>{/if}
  <div class="confirmation-actions">
    <button bind:this={cancelButton} class="dbx-btn" type="button" onclick={onCancel}>{cancelLabel}</button>
    <button class="dbx-btn confirm-action" type="button" onclick={onConfirm}>{confirmLabel}</button>
  </div>
</dialog>

<style>
  .settings-confirmation { box-sizing: border-box; width: min(420px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); margin: auto; padding: 24px; overflow: auto; border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-popover, var(--color-card)); color: var(--color-popover-foreground, var(--color-foreground)); box-shadow: 0 24px 80px #0003; }
  .settings-confirmation::backdrop { background: var(--dbx-overlay, #0006); }
  h2 { margin: 0; font-size: 17px; line-height: 1.5; }
  p { margin: 12px 0 0; color: var(--color-muted-foreground); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
  .confirmation-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 24px; }
  .dbx-btn { height: auto; min-height: 34px; padding: 7px 12px; border: 1px solid var(--color-border); border-radius: 7px; background: var(--color-background); color: var(--color-foreground); white-space: normal; }
  .dbx-btn:hover { background: var(--color-accent); }
  .confirm-action { border-color: var(--color-destructive); color: var(--color-destructive); }
  .confirm-action:hover { background: color-mix(in srgb, var(--color-destructive) 10%, var(--color-background)); }
  .dbx-btn:focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
</style>
