export async function copyText(text) {
  const value = String(text ?? "");
  let clipboardError = null;
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await copyWithClipboardApi(value);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }
  if (typeof document !== "undefined" && copyWithExecCommand(value)) return;
  throw clipboardError || new Error("Clipboard is not available");
}

function copyWithExecCommand(value) {
  const previous = document.activeElement;
  const selection = previous && typeof previous.selectionStart === "number"
    ? [previous.selectionStart, previous.selectionEnd, previous.selectionDirection] : null;
  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:none;outline:none;background:transparent";
  document.body.appendChild(el);
  el.focus();
  el.select();
  el.setSelectionRange(0, el.value.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    el.remove();
    if (previous?.isConnected) {
      previous.focus({ preventScroll: true });
      if (selection) previous.setSelectionRange?.(...selection);
    }
  }
  return ok;
}

async function copyWithClipboardApi(value) {
  if (!globalThis.navigator?.clipboard?.writeText) {
    throw new Error("Clipboard is not available");
  }
  let timer = 0;
  // Multi-megabyte Data URLs can take noticeably longer than ordinary text.
  // Keep the fallback bounded without aborting healthy large clipboard writes at 400 ms.
  const timeoutMs = Math.min(10_000, Math.max(1_500, Math.ceil(value.length / 500_000) * 1_000));
  try {
    await Promise.race([
      globalThis.navigator.clipboard.writeText(value),
      new Promise((_, reject) => {
        timer = globalThis.setTimeout(() => reject(new Error("clipboard timeout")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
