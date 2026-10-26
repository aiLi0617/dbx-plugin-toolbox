import bcrypt from "bcryptjs";
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
} from "@scure/bip39";
import { wordlist as english } from "@scure/bip39/wordlists/english.js";
import { wordlist as chinese } from "@scure/bip39/wordlists/simplified-chinese.js";
import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";
const strengthChecker = new ZxcvbnFactory({
  translations: en.translations,
  graphs: common.adjacencyGraphs,
  dictionary: { ...common.dictionary, ...en.dictionary },
});
export async function bcryptHash(value, cost = 10) {
  if (typeof value !== "string") throw new Error("Password must be text");
  if (new TextEncoder().encode(value).length > 72)
    throw new Error("Bcrypt password exceeds 72 UTF-8 bytes");
  if (!Number.isInteger(cost) || cost < 4 || cost > 12)
    throw new Error("Bcrypt cost must be 4 to 12");
  return bcrypt.hash(value, cost);
}
export async function bcryptVerify(value, hash) {
  if (typeof value !== "string" || typeof hash !== "string")
    throw new Error("Password and hash must be text");
  if (new TextEncoder().encode(value).length > 72)
    throw new Error("Bcrypt password exceeds 72 UTF-8 bytes");
  if (!/^\$2[aby]\$(0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(hash))
    throw new Error("Invalid or unsupported Bcrypt hash");
  return bcrypt.compare(value, hash);
}
export function passwordStrength(value) {
  if (typeof value !== "string") throw new Error("Password must be text");
  if (value.length > 256) throw new Error("Password exceeds 256 characters");
  const r = strengthChecker.check(value);
  return {
    score: r.score,
    guesses: r.guesses,
    guessesLog10: r.guessesLog10,
    length: value.length,
    utf8Bytes: new TextEncoder().encode(value).length,
    crackTimesDisplay: r.crackTimesDisplay,
    feedback: r.feedback,
  };
}
const words = (language) => (language === "zh" ? chinese : english);
export function bip39Generate(count = 12, language = "en") {
  if (!["en", "zh"].includes(language)) throw new Error("Unsupported wordlist");
  if (![12, 15, 18, 21, 24].includes(count))
    throw new Error("Invalid word count");
  return generateMnemonic(words(language), (count / 3) * 32);
}
export function bip39Validate(value, language = "en") {
  if (!["en", "zh"].includes(language)) throw new Error("Unsupported wordlist");
  if (typeof value !== "string" || value.length > 4096) return false;
  return validateMnemonic(value.normalize("NFKD").trim().replace(/\s+/g, " "), words(language));
}
export async function bip39Seed(value, password = "", language = "en") {
  if (!bip39Validate(value, language)) throw new Error("Invalid mnemonic");
  if (typeof password !== "string" || password.length > 1024) throw new Error("Passphrase is too long");
  const bytes = await mnemonicToSeed(value.normalize("NFKD").trim().replace(/\s+/g, " "), password.normalize("NFKD"));
  const output = [...bytes]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  bytes.fill(0);
  return output;
}
