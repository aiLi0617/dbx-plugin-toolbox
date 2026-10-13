export function rangeProgressPercent({ min = 0, max = 100, value = 0 } = {}) {
  const lower = Number(min);
  const upper = Number(max);
  const current = Number(value);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) return 0;
  if (!Number.isFinite(current)) return 0;
  return Math.min(100, Math.max(0, ((current - lower) / (upper - lower)) * 100));
}

function syncRange(input) {
  if (!input?.matches?.('input[type="range"]')) return;
  input.style.setProperty("--dbx-range-progress", `${rangeProgressPercent(input)}%`);
}

function syncRanges(root) {
  syncRange(root);
  root?.querySelectorAll?.('input[type="range"]').forEach(syncRange);
}

export function installRangeProgress(root = document) {
  const onValueChange = (event) => syncRange(event.target);
  root.addEventListener("input", onValueChange, true);
  root.addEventListener("change", onValueChange, true);
  root.addEventListener("pointerdown", onValueChange, true);
  syncRanges(root);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) syncRanges(node);
    }
  });
  observer.observe(root.documentElement || root, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    root.removeEventListener("input", onValueChange, true);
    root.removeEventListener("change", onValueChange, true);
    root.removeEventListener("pointerdown", onValueChange, true);
  };
}
