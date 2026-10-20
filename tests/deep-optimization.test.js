import test from "node:test";
import assert from "node:assert/strict";
import { fileTypeReport, identifyFileType, lookupFileTypes } from "../src/lib/fileType.js";
import { incrementSemver, intersectSemverRanges, selectSemverCandidates } from "../src/lib/lazy/semver.js";
import { analyzePunycode } from "../src/lib/tools/encode.js";
import { analyzeUnicode, createUnifiedDiff, structuredDiff } from "../src/lib/tools/text.js";
import { analyzeMarkdownDocument, markdownToc, selfContainedMarkdownHtml } from "../src/lib/markdownDocument.js";
import { gzipCompressFile, gzipDecompressFile, inspectGzipHeader } from "../src/lib/gzip.js";

test("file reports support MIME lookup and extension-spoof warnings", () => {
  const detected = identifyFileType(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  const report = fileTypeReport(detected, { name: "invoice.pdf", size: 8, type: "application/pdf" });
  assert.equal(report.disguisedExtension, true);
  assert.equal(lookupFileTypes("application/pdf")[0].id, "pdf");
  assert.equal(lookupFileTypes(".png")[0].mime, "image/png");
});

test("Unicode analysis exposes bytes, graphemes, normalization, and spoofing risks", () => {
  const combining = analyzeUnicode("e\u0301");
  assert.equal(combining.codePoints, 2);
  assert.equal(combining.graphemes, 1);
  assert.equal(combining.normalization.NFC, "é");
  const risky = analyzeUnicode("a\u0430\u202E");
  assert.equal(risky.mixedScripts, true);
  assert.equal(risky.risks[0].risk, "invisible-or-bidi");
});

test("Punycode analysis validates labels and highlights mixed-script lookalikes", () => {
  const result = analyzePunycode("p\u0430ypal.com");
  assert.equal(result.labels.length, 2);
  assert.ok(result.warnings.length >= 1);
  assert.throws(() => analyzePunycode(`${"a".repeat(64)}.com`), /label/i);
});

test("unified and structured diffs preserve standard hunk metadata and stats", () => {
  const patch = createUnifiedDiff("a\nb\n", "a\nc\n", { context: 1 });
  assert.match(patch, /^--- before/m);
  assert.match(patch, /@@ -1,2 \+1,2 @@/);
  const value = structuredDiff("a\nb\n", "a\nc\n", { context: 1 });
  assert.deepEqual(value.stats, { additions: 1, deletions: 1, hunks: 1 });
  assert.equal(value.hunks[0].lines.includes("-b"), true);
});

test("SemVer supports increments, prereleases, range intersection, and candidate filtering", () => {
  assert.equal(incrementSemver("1.2.3", "minor"), "1.3.0");
  assert.equal(incrementSemver("1.2.3", "prepatch", "beta"), "1.2.4-beta.0");
  assert.equal(intersectSemverRanges("^1.2.0", ">=1.5 <2").intersects, true);
  assert.equal(intersectSemverRanges("^1", "^2").intersects, false);
  assert.deepEqual(selectSemverCandidates("1.0.0 1.5.0 2.0.0", "^1").candidates, ["1.0.0", "1.5.0"]);
});

test("Markdown analysis extracts front matter, TOC, statistics, and safe standalone HTML", () => {
  const value = analyzeMarkdownDocument("---\ntitle: Demo\n---\n# Hello\n\n## Details\nSome words here.");
  assert.equal(value.frontMatter, "title: Demo");
  assert.equal(value.headings.length, 2);
  assert.match(markdownToc(value.headings), /\[Details\]\(#details\)/);
  const html = selfContainedMarkdownHtml('<h1>Hello</h1><img src="https://example.com/x.png">');
  assert.match(html, /Content-Security-Policy/);
  assert.doesNotMatch(html, /https:\/\//);
});

test("Gzip file flow preserves binary bytes and reports its header and ratio", async () => {
  const input = new Blob([new Uint8Array([0,1,2,3,255,0,1,2,3])]);
  const compressed = await gzipCompressFile(input);
  assert.equal(inspectGzipHeader(new Uint8Array(await compressed.blob.arrayBuffer())).method, "DEFLATE");
  const restored = await gzipDecompressFile(compressed.blob);
  assert.deepEqual(new Uint8Array(await restored.blob.arrayBuffer()), new Uint8Array(await input.arrayBuffer()));
});
