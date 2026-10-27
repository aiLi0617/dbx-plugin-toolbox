let nextId = 0;

// A top-layer tooltip avoids clipping inside scrollable account lists.
export function themedTooltip(node, text = "") {
  const doc = node.ownerDocument;
  const win = doc.defaultView;
  let tip, timer;
  const id = `dbx-tooltip-${++nextId}`;
  function hide() {
    win.clearTimeout(timer);
    tip?.remove(); tip = null;
    const ids = (node.getAttribute("aria-describedby") || "").split(/\s+/).filter(value => value && value !== id);
    if (ids.length) node.setAttribute("aria-describedby", ids.join(" "));
    else node.removeAttribute("aria-describedby");
  }
  function show() {
    hide();
    if (!text) return;
    timer = win.setTimeout(() => {
      if (!node.isConnected) return;
      tip = doc.createElement("div");
      tip.id = id; tip.setAttribute("role", "tooltip"); tip.setAttribute("popover", "manual");
      tip.textContent = text;
      tip.style.cssText = "position:fixed;inset:auto;margin:0;box-sizing:border-box;z-index:10000;max-width:min(360px,calc(100vw - 16px));max-height:min(280px,calc(100vh - 16px));overflow:hidden;padding:8px 10px;border:1px solid var(--color-border);border-radius:var(--radius-md,6px);background:var(--color-popover,var(--color-card));color:var(--color-popover-foreground,var(--color-foreground));box-shadow:var(--dbx-shadow-sm);font-family:var(--font-sans);font-size:12px;font-weight:400;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;pointer-events:none";
      doc.body.append(tip); tip.showPopover?.();
      const anchor = node.getBoundingClientRect(), box = tip.getBoundingClientRect();
      const left = Math.max(8, Math.min(anchor.left, win.innerWidth - box.width - 8));
      const below = anchor.bottom + 6;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(8, below + box.height <= win.innerHeight - 8 ? below : anchor.top - box.height - 6)}px`;
      node.setAttribute("aria-describedby", [node.getAttribute("aria-describedby"), id].filter(Boolean).join(" "));
    }, 250);
  }
  function keydown(event) { if (event.key === "Escape") hide(); }
  node.addEventListener("mouseenter", show); node.addEventListener("mouseleave", hide);
  node.addEventListener("focusin", show); node.addEventListener("focusout", hide);
  node.addEventListener("pointerdown", hide);
  doc.addEventListener("keydown", keydown); doc.addEventListener("scroll", hide, true);
  win.addEventListener("resize", hide); win.addEventListener("blur", hide);
  return {
    update(value) { if (value !== text) { text = value; hide(); } },
    destroy() {
      hide();
      node.removeEventListener("mouseenter", show); node.removeEventListener("mouseleave", hide);
      node.removeEventListener("focusin", show); node.removeEventListener("focusout", hide);
      node.removeEventListener("pointerdown", hide);
      doc.removeEventListener("keydown", keydown); doc.removeEventListener("scroll", hide, true);
      win.removeEventListener("resize", hide); win.removeEventListener("blur", hide);
    },
  };
}
