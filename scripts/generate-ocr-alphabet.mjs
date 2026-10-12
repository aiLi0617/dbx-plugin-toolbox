import { readFileSync, writeFileSync } from "node:fs";

const characters = readFileSync(new URL("../backend/models/ppocrv5-mobile-dict.txt", import.meta.url), "utf8")
  .replace(/\r/g, "")
  .split("\n")
  .filter((entry) => entry.length > 0)
  .map((entry) => Array.from(entry)[0] || "");
const alphabet = characters.join("");
writeFileSync(
  new URL("../backend/src/ocr_alphabet.rs", import.meta.url),
  `// Generated from ppocrv5-mobile-dict.txt.\npub const OCR_ALPHABET: &str = r##########"${alphabet}"##########;\n`,
);
console.log(`Generated ${characters.length} OCR labels`);
