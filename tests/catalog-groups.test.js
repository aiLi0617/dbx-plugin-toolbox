import assert from "node:assert/strict";
import test from "node:test";
import { CATEGORY_ORDER, tools } from "../src/lib/catalog.js";
import { buildCatalogSections, CATALOG_TOOL_GROUPS, groupedCatalogTools, SECURITY_TOOL_GROUPS } from "../src/lib/catalogGroups.js";

const visibleTools = tools.filter((tool) => tool.catalogVisible !== false);

test("all catalog sections follow category order and include every visible tool once", () => {
  const sections = buildCatalogSections(visibleTools, "all");
  const sectionIds = sections.map((section) => section.id);
  const groupedIds = sections.flatMap((section) => section.tools.map((tool) => tool.id));

  assert.deepEqual(sectionIds, CATEGORY_ORDER);
  assert.ok(sections.every((section) => section.kind === "category" && section.category === section.id));
  assert.deepEqual(groupedIds, CATEGORY_ORDER.flatMap((category) => visibleTools.filter((tool) => tool.category === category).map((tool) => tool.id)));
  assert.deepEqual(new Set(groupedIds), new Set(visibleTools.map((tool) => tool.id)));
  assert.equal(groupedIds.length, new Set(groupedIds).size);
});

test("all catalog sections omit empty categories", () => {
  const sample = visibleTools.filter((tool) => tool.category === "developer");
  assert.deepEqual(buildCatalogSections(sample, "all").map((section) => section.id), ["developer"]);
});

test("security catalog groups every security tool exactly once", () => {
  const securityTools = visibleTools.filter((tool) => tool.category === "security");
  const groups = buildCatalogSections(securityTools, "security");
  const groupedIds = groups.flatMap((group) => group.tools.map((tool) => tool.id));
  assert.deepEqual(new Set(groupedIds), new Set(securityTools.map((tool) => tool.id)));
  assert.equal(groupedIds.length, new Set(groupedIds).size);
  assert.deepEqual(SECURITY_TOOL_GROUPS.find((group) => group.id === "common").toolIds, ["aes", "sm4", "rsa-oaep", "rsa-pkcs1", "sm2"]);
  assert.equal(SECURITY_TOOL_GROUPS.length, 7);
  assert.deepEqual(SECURITY_TOOL_GROUPS.find((group) => group.id === "specialized").toolIds, ["storage-crypto", "format-preserving"]);
  assert.equal(CATALOG_TOOL_GROUPS.security, SECURITY_TOOL_GROUPS);
  const configuredIds = SECURITY_TOOL_GROUPS.flatMap((group) => group.toolIds);
  assert.equal(configuredIds.length, new Set(configuredIds).size);
});

test("configured groups collect unknown tools under other", () => {
  const extra = { id: "new-security-tool", category: "security" };
  const groups = buildCatalogSections([extra], "security");
  assert.deepEqual(groups.map((group) => group.id), ["other"]);
  assert.deepEqual(groups[0].tools, [extra]);
});

test("catalog grouping stays flat while searching or without subgroup configuration", () => {
  const securityTools = visibleTools.filter((tool) => tool.category === "security");
  assert.equal(buildCatalogSections(securityTools, "security", "aes"), null);
  assert.equal(buildCatalogSections(securityTools, "security", "   aes   "), null);
  assert.equal(buildCatalogSections(visibleTools, "all", "aes"), null);
  assert.equal(buildCatalogSections(visibleTools, "developer"), null);
  assert.equal(buildCatalogSections(visibleTools, "unknown"), null);
  assert.equal(groupedCatalogTools, buildCatalogSections);
  assert.equal(tools.find((tool) => tool.id === "xor").category, "security");
});
