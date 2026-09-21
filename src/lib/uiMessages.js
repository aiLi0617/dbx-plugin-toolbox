import messages from './uiMessages.json' with { type: 'json' };

const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const templates = Object.entries(messages)
  .filter(([source]) => /\{\d+\}/.test(source))
  .map(([source, translations]) => {
    const slots = [...source.matchAll(/\{(\d+)\}/g)].map(match => match[1]);
    const parts = source.split(/\{\d+\}/);
    const numeric = source === '{0}s';
    return {
      slots, translations,
      specificity: parts.join('').length,
      pattern: new RegExp('^' + parts.map(escapeRegex).join(numeric ? '(\\d+)' : '([\\s\\S]*?)') + '$'),
    };
  })
  .sort((a, b) => b.specificity - a.specificity);

/** Translate bundled UI copy only. Captured values are preserved verbatim. */
export function translateMessage(locale, source) {
  if (typeof source !== 'string') return null;
  if (locale === 'en') return source;
  const exact = messages[source]?.[locale];
  if (exact) return exact;
  for (const { pattern, slots, translations } of templates) {
    const translated = translations[locale];
    if (!translated) continue;
    const match = pattern.exec(source);
    if (!match) continue;
    const values = Object.fromEntries(slots.map((slot, i) => [slot, match[i + 1]]));
    return translated.replace(/\{(\d+)\}/g, (_, slot) => values[slot] ?? `{${slot}}`);
  }
  return null;
}

export { messages as UI_MESSAGES };
