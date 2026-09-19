self.onmessage = (event) => {
  const { input, pattern, flags, replacement = "" } = event.data || {};
  try {
    const re = new RegExp(pattern || ".*", flags || "");
    const text = String(input ?? "");
    const matches = [];
    let truncated = false;
    if (re.global) {
      for (const match of text.matchAll(re)) {
        if (matches.length >= 10_000) { truncated = true; break; }
        matches.push({ index: match.index ?? 0, text: match[0], groups: match.slice(1) });
      }
    } else {
      const match = text.match(re);
      if (match) matches.push({ index: match.index ?? 0, text: match[0], groups: match.slice(1) });
    }
    const replaced = text.replace(re, String(replacement));
    self.postMessage({ matches, replaced, truncated, error: "" });
  } catch (error) {
    self.postMessage({ matches: [], replaced: "", error: error?.message || String(error) });
  }
};
