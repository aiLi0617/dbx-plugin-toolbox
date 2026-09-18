export async function copyText(text) {
  const value = String(text ?? "");
  if (copyWithExecCommand(value)) return;
  await copyWithClipboardApi(value);
}

function copyWithExecCommand(value) {
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
  }
  return ok;
}

async function copyWithClipboardApi(value) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard is not available");
  }
  let timer = 0;
  try {
    await Promise.race([
      navigator.clipboard.writeText(value),
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error("clipboard timeout")), 400);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
