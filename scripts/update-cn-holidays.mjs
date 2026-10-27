// Run explicitly before a release: node scripts/update-cn-holidays.mjs 2024 2025 2026
// Fetch a pinned upstream revision, validate everything, then update bundled data.
import { mkdirSync, writeFileSync } from "node:fs";

const years = [...new Set(process.argv.slice(2).map(Number))].sort((a, b) => a - b);
if (!years.length || years.some((year) => !Number.isInteger(year) || year < 2007 || year > 9999)) {
  throw new Error("Provide explicit published years, for example: 2024 2025 2026");
}
async function read(url, json = true) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "dbx-plugin-toolbox" }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status}: ${url}`);
      return await (json ? response.json() : response.text());
    } catch (error) {
      if (attempt >= 2) throw error;
    }
  }
}
const { sha } = await read("https://api.github.com/repos/NateScarlet/holiday-cn/commits/master");
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid upstream revision");
const root = `https://raw.githubusercontent.com/NateScarlet/holiday-cn/${sha}`;
const entries = await Promise.all(years.map(async (year) => {
  const data = await read(`${root}/${year}.json`);
  if (data.year !== year || !Array.isArray(data.days) || !data.days.length || !Array.isArray(data.papers) || !data.papers.length) throw new Error(`Incomplete data: ${year}`);
  const seen = new Set();
  for (const row of data.days) {
    const ms = Date.parse(`${row.date}T00:00:00Z`);
    if (typeof row.isOffDay !== "boolean" || typeof row.name !== "string" || !row.name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== row.date || Number(row.date.slice(0, 4)) !== year || seen.has(row.date)) throw new Error(`Invalid or duplicate entry: ${row.date}`);
    seen.add(row.date);
  }
  for (const paper of data.papers) {
    const url = new URL(paper);
    if (url.protocol !== "https:" || !(url.hostname === "gov.cn" || url.hostname.endsWith(".gov.cn"))) throw new Error(`Invalid source: ${paper}`);
  }
  return { year, papers: data.papers, days: data.days };
}));
const license = await read(`${root}/LICENSE`, false);
if (!license.includes("MIT License") || !license.includes("NateScarlet")) throw new Error("Unexpected upstream license");
mkdirSync("src/lib/data", { recursive: true });
mkdirSync("assets/licenses", { recursive: true });
writeFileSync("src/lib/data/cn-holidays.json", JSON.stringify({ source: "https://github.com/NateScarlet/holiday-cn", revision: sha, updatedAt: new Date().toISOString().slice(0, 10), years: entries }, null, 2) + "\n");
writeFileSync("assets/licenses/holiday-cn.txt", license);
console.log(`Bundled China holiday calendars: ${years.join(", ")} @ ${sha}`);
