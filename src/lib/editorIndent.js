export function indentSelection(value, start, end, outdent = false) {
  if (!outdent && start === end) return { value: value.slice(0, start) + "  " + value.slice(end), start: start + 2, end: start + 2 };
  const first = start === 0 ? 0 : value.lastIndexOf("\n", start - 1) + 1;
  const lastPosition = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = value.indexOf("\n", lastPosition);
  const last = nextBreak < 0 ? value.length : nextBreak;
  const lines = value.slice(first, last).split("\n");
  const edits = [];
  let offset = first;
  const result = lines.map((line) => {
    const removed = outdent ? (line.match(/^(?:\t| {1,2})/)?.[0].length || 0) : 0;
    edits.push({ at: offset, removed });
    offset += line.length + 1;
    return outdent ? line.slice(removed) : "  " + line;
  }).join("\n");
  const mapPosition = (position) => position + edits.reduce((delta, edit) => {
    if (position < edit.at) return delta;
    return delta + (outdent ? -Math.min(edit.removed, position - edit.at) : 2);
  }, 0);
  return {
    value: value.slice(0, first) + result + value.slice(last),
    start: mapPosition(start),
    end: mapPosition(end),
  };
}
