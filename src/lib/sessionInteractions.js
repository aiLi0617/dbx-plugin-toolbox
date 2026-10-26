export function shouldTrackEdit(event, sensitive = false) {
  const target = event.target;
  return !sensitive && !['file', 'search'].includes(target.type) && !target.closest?.('[data-navigation]');
}
export function resultSignature(params) { return JSON.stringify(params); }
export function resultIsCurrent(output, executed, current) { return Boolean(output) && executed === current; }
