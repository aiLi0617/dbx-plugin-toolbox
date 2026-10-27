// Store exact click times; round only for display and export.
export function createStopwatch(now = () => performance.now()) {
  let accumulated = 0;
  let startedAt = null;
  return {
    read() { return accumulated + (startedAt === null ? 0 : now() - startedAt); },
    start() { if (startedAt === null) startedAt = now(); },
    pause() {
      accumulated = this.read();
      startedAt = null;
      return accumulated;
    },
    reset() { accumulated = 0; startedAt = null; },
  };
}

export function formatStopwatch(milliseconds) {
  const total = Math.max(0, Math.floor(milliseconds));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor(total / 60000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(total % 1000).padStart(3, "0")}`;
}

export function lapRows(laps) {
  return laps.map((total, i) => ({ number: i + 1, total, split: total - (laps[i - 1] || 0) }));
}

export function lapsCsv(laps) {
  return "lap,total_ms,split_ms\r\n" + lapRows(laps)
    .map(({ number, total, split }) => `${number},${total.toFixed(3)},${split.toFixed(3)}`).join("\r\n");
}
