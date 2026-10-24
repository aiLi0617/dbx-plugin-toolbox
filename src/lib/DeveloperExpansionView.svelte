<script>
  import { pick, localizeError } from "./i18n.js";
  import {
    jsonStructureDiff,
    yamlDocuments,
    treeRows,
    decodeSafeLink,
    toRoman,
    fromRoman,
    randomMac,
    ipv6Ula,
    ipv4Range,
    summarizeIpv4,
    REGEX_REFERENCE,
  } from "./developerExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import TreeNode from "./TreeNode.svelte";
  let { toolId, locale = "zh-CN", onOpenTool } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    secondary = $state(""),
    output = $state(""),
    error = $state(""),
    trees = $state([]),
    count = $state(5),
    separator = $state(":"),
    mode = $state("summarize");
  function run() {
    output = "";
    error = "";
    trees = [];
    try {
      if (toolId === "json-diff")
        output = JSON.stringify(jsonStructureDiff(input, secondary), null, 2);
      else if (toolId === "yaml-tree")
        trees = yamlDocuments(input).map((v, i) =>
          treeRows(v, `document[${i + 1}]`),
        );
      else if (toolId === "safelink")
        output = input
          .split(/\r?\n/)
          .filter((s) => s.trim())
          .map(decodeSafeLink)
          .join("\n");
      else if (toolId === "roman")
        output = input
          .split(/\r?\n/)
          .map((s) => (/^\d+$/.test(s.trim()) ? toRoman(s) : fromRoman(s)))
          .join("\n");
      else if (toolId === "mac-generator")
        output = randomMac(Number(count), input, separator);
      else if (toolId === "ipv6-ula") output = ipv6Ula();
      else if (toolId === "ipv4-range")
        output = (
          mode === "expand"
            ? ipv4Range(input, secondary, { expand: true })
            : summarizeIpv4(input)
        ).join("\n");
    } catch (e) {
      error = localizeError(locale, e);
      if (toolId === 'yaml-tree' && e.line && e.column)
        error += ` [${e.line}:${e.column}]`;
    }
  }
  function demo() {
    input =
      {
        "json-diff": '{"name":"DBX","version":1}',
        "yaml-tree":
          "name: DBX\nfeatures:\n  - JSON\n  - YAML\n---\nactive: true",
        safelink: "https://example.com/",
        roman: "2026\nMMXXVI",
        "mac-generator": "",
        "ipv4-range": "192.168.1.0/25\n192.168.1.128/25",
      }[toolId] || "";
    secondary =
      toolId === "json-diff"
        ? ' {"version":2,"name":"DBX"}'
        : toolId === "ipv4-range" && mode === "expand"
          ? "192.168.1.10"
          : "";
    if (toolId === "ipv4-range" && mode === "expand") input = "192.168.1.1";
    output = "";
    trees = [];
  }
</script>

<div class="expansion-page">
  {#if toolId === "regex-reference"}
    {#each REGEX_REFERENCE as [zh, en, pattern, sample]}<article>
        <h3>{t(zh, en)}</h3>
        <code>{pattern}</code>
        <p>{sample}</p>
        <CopyButton {locale} text={pattern} /><button
          class="dbx-btn"
          onclick={() =>
            onOpenTool?.("regex", { pattern, input: sample, flags: "g" })}
          >{t("在正则测试中打开", "Open in regex tester")}</button
        >
      </article>{/each}
  {:else}
    {#if toolId === "ipv4-range"}<select class="dbx-input" bind:value={mode}
        ><option value="summarize">{t("汇总 CIDR", "Summarize CIDRs")}</option
        ><option value="expand"
          >{t("展开地址范围", "Expand address range")}</option
        ></select
      >{/if}
    {#if toolId !== "ipv6-ula"}<label
        >{toolId === "mac-generator"
          ? t("MAC 前缀（可留空）", "MAC prefix (optional)")
          : t("输入", "Input")}<textarea
          class="dbx-textarea"
          bind:value={input}
          maxlength="1000000"
          rows="8"></textarea></label
      >{/if}
    {#if toolId === "json-diff" || (toolId === "ipv4-range" && mode === "expand")}<label
        >{toolId === "json-diff"
          ? t("第二份 JSON", "Second JSON")
          : t("结束地址", "End address")}<textarea
          class="dbx-textarea"
          bind:value={secondary}
          rows="8"
          maxlength="1000000"></textarea></label
      >{/if}
    {#if toolId === "mac-generator"}<label
        >{t("数量", "Count")}<input
          class="dbx-input"
          type="number"
          min="1"
          max="1000"
          bind:value={count}
        /></label
      ><select class="dbx-input" bind:value={separator}
        ><option value=":">AA:BB:CC:DD:EE:FF</option><option value="-"
          >AA-BB-CC-DD-EE-FF</option
        ><option value=".">AABB.CCDD.EEFF</option></select
      >{/if}
    <div class="expansion-actions">
      <button class="dbx-btn dbx-btn--primary" onclick={run}
        >{t("执行", "Run")}</button
      ><button class="dbx-btn" onclick={demo}>{t("示例", "Example")}</button
      ><CopyButton {locale} text={output} />
    </div>
    {#if error}<p role="alert">{error}</p>{/if}
    {#if output}<textarea class="dbx-textarea" readonly value={output} rows="12"
      ></textarea>{/if}
    {#each trees as node}<TreeNode {node} {locale} />{/each}
  {/if}
</div>
