import fs from "node:fs";
import { chrome, pick } from "../src/lib/i18n.js";

const messages = JSON.parse(fs.readFileSync(new URL("../src/lib/uiMessages.json", import.meta.url), "utf8"));
const budget = JSON.parse(fs.readFileSync(new URL("./i18n-fallback-budget.json", import.meta.url), "utf8"));
const locales = Object.keys(budget);
const failures = [];

for (const locale of locales) {
  let missing = 0;
  let englishFallbacks = 0;
  for (const entry of Object.values(messages)) {
    if (typeof entry?.[locale] !== "string" || !entry[locale].trim()) missing += 1;
    if (entry?.[locale] === entry?.en) englishFallbacks += 1;
  }
  if (missing) failures.push(`${locale}: ${missing} messages are missing`);
  if (englishFallbacks > budget[locale]) {
    failures.push(`${locale}: ${englishFallbacks} English fallbacks exceed the budget of ${budget[locale]}`);
  }

  const untranslatedChrome = Object.entries(chrome)
    .filter(([, value]) => value && typeof value === "object")
    .filter(([, value]) => pick(locale, value) === pick("en", value))
    .map(([key]) => key);
  if (untranslatedChrome.length) {
    failures.push(`${locale}: untranslated core chrome: ${untranslatedChrome.join(", ")}`);
  }
}

if (failures.length) {
  console.error(`i18n quality check failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`i18n quality check passed for ${locales.length} non-English locales; fallback budgets cannot regress`);
}
