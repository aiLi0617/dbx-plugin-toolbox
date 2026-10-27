export function validateEta(total, completed, elapsed, unit = 1) {
  const errors = {};
  const read = (value) => String(value ?? "").trim() === "" ? NaN : Number(value);
  const a = read(total), b = read(completed), c = read(elapsed);
  if (!Number.isFinite(a) || a <= 0) errors.total = "total";
  if (!Number.isFinite(b) || b < 0) errors.completed = "completed";
  else if (!errors.total && b > a) errors.completed = "exceeds";
  if (!Number.isFinite(c) || c <= 0 || ![1, 60, 3600].includes(Number(unit)) || !Number.isFinite(c * Number(unit))) errors.elapsed = "elapsed";
  return errors;
}

// `now` is the measurement time, so rendering or changing precision cannot move ETA.
export function calculateEta(total, completed, elapsed, unit = 1, now = Date.now()) {
  if (Object.keys(validateEta(total, completed, elapsed, unit)).length) throw new RangeError("Invalid progress");
  total = Number(total);
  completed = Number(completed);
  const elapsedSeconds = Number(elapsed) * Number(unit);
  const remaining = total - completed;
  const rate = completed / elapsedSeconds;
  const remainingSeconds = completed === 0 ? null : (remaining / completed) * elapsedSeconds;
  const totalSeconds = remainingSeconds === null ? null : elapsedSeconds + remainingSeconds;
  const completionMs = remainingSeconds === null ? null : now + remainingSeconds * 1000;
  if (!Number.isFinite(rate) || (completed > 0 && rate === 0) ||
      (remainingSeconds !== null && (!Number.isFinite(remainingSeconds) || !Number.isFinite(totalSeconds) || !Number.isFinite(completionMs) || Math.abs(completionMs) > 8.64e15))) {
    throw new RangeError("ETA outside supported range");
  }
  return {
    total, completed, remaining, elapsedSeconds,
    progress: completed / total * 100,
    rate, remainingSeconds, totalSeconds,
    completion: completionMs === null ? null : new Date(completionMs).toISOString(),
    measuredAt: new Date(now).toISOString(),
  };
}
