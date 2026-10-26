// Registration uses the English source as an explicit offline fallback.
export function needsTranslation(message, locale) {
  if (message.en === message['zh-CN']) return false;
  const text = message[locale];
  return typeof text !== 'string' || !text.trim() || text === message.en;
}

export function mergeSourceTranslations(current = {}, extracted) {
  const merged = { ...current, en: extracted.en, 'zh-CN': extracted['zh-CN'] };
  for (const [locale, text] of Object.entries(extracted)) {
    if (typeof text !== 'string' || !text.trim()) continue;
    if (!current[locale]?.trim() || current[locale] === extracted.en) merged[locale] = text;
  }
  return merged;
}
