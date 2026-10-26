<script>
  import { pick } from "./i18n.js";
  import { ipv6Ula } from "./developerExpansion.js";
  import CopyButton from "./CopyButton.svelte";
  import Select from "./Select.svelte";
  import { planUlaSubnets } from "./ipv6Ula.js";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let amount = $state("1");
  let prefixes = $state([]);
  let selectedPrefix = $state("");
  let subnetStart = $state("0001");
  let subnetCount = $state(5);
  const subnetPlan = $derived(selectedPrefix ? planUlaSubnets(selectedPrefix, subnetStart, subnetCount) : { error: '', rows: [] });
  const subnetError = $derived(subnetPlan.error === 'start' ? t("子网 ID 请输入 0000–ffff 的十六进制数。", "Enter a hexadecimal subnet ID from 0000 to ffff.")
    : subnetPlan.error === 'count' ? t("子网数量必须是 1–1000 的整数。", "Subnet count must be an integer from 1 to 1000.")
    : subnetPlan.error === 'range' ? t("子网范围超出 ffff，请减小起始 ID 或数量。", "Subnet range exceeds ffff. Reduce the starting ID or count.")
    : subnetPlan.error ? t("请选择有效的 ULA /48 地址块。", "Select a valid ULA /48 block.") : "");
  let appliedDemoRequest = 0;

  function generate() {
    const count = Math.max(1, Math.min(100, Number(amount) || 1));
    const values = new Set();
    while (values.size < count) values.add(ipv6Ula());
    prefixes = [...values];
    selectedPrefix = prefixes[0];
  }


  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    generate();
  });
</script>

<div class="ula-page">
  <header class="ula-header">
    <div><p>{t("生成独立地址块，再为内网分配连续子网。", "Generate address blocks and assign consecutive subnets to your network.")}</p></div>
    <span class="standard-tag">RFC 4193 <span aria-hidden="true">·</span> /48 → /64</span>
  </header>

  <div class="workspace">
    <section class="panel block-panel">
      <header class="panel-head">
        <div class="panel-title"><span class="step">1</span><h2>{t("生成地址块", "Generate blocks")}</h2>{#if prefixes.length}<span class="count">{prefixes.length}</span>{/if}</div>
        <div class="copy-action"><CopyButton {locale} text={prefixes.join("\n")} labelZh="复制全部地址块" labelEn="Copy all blocks" /></div>
      </header>
      <div class="generate-toolbar">
        <label><span>{t("数量", "Count")}</span><Select bind:value={amount} ariaLabel={t("生成数量", "Number of prefixes")} options={[1,5,10,20,50,100].map(n => ({value:String(n),label:String(n)}))} /></label>
        <button class="dbx-btn dbx-btn--primary" type="button" onclick={generate}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/></svg>{prefixes.length ? t("重新生成", "Regenerate") : t("生成地址块", "Generate blocks")}</button>
      </div>
      <p class="block-help">{prefixes.length ? t("点击地址块，在右侧规划其 /64 子网。", "Select a block to plan its /64 subnets.") : t("使用安全随机源生成 fd 开头的 /48 地址块。", "Generate fd-prefixed /48 blocks using secure randomness.")}</p>
      {#if prefixes.length}
        {#key prefixes[0]}
          <div class="block-list" role="group" aria-label={t("ULA 地址块", "ULA address block")}>
            {#each prefixes as prefix, index (prefix)}
              <div class="block-row" class:selected={selectedPrefix === prefix}>
                <button class="block-select" type="button" aria-pressed={selectedPrefix === prefix} onclick={() => (selectedPrefix = prefix)}>
                  <span class="selection-dot" aria-hidden="true">{selectedPrefix === prefix ? "✓" : String(index + 1).padStart(2, "0")}</span>
                  <code>{prefix}</code>
                  {#if selectedPrefix === prefix}<span class="selected-tag">{t("规划中", "Active")}</span>{/if}
                </button>
                <CopyButton {locale} text={prefix} />
              </div>
            {/each}
          </div>
        {/key}
      {:else}
        <div class="empty"><span class="empty-symbol" aria-hidden="true">/48</span><strong>{t("创建你的内网地址块", "Create your network block")}</strong><p>{t("从一个 /48 开始，可划分 65,536 个 /64 子网。", "Start with one /48, with room for 65,536 /64 subnets.")}</p></div>
      {/if}
      <footer class="panel-foot">{t("重新生成将替换本页的全部地址块。", "Regenerating replaces all blocks on this page.")}</footer>
    </section>

    <section class="panel planner-panel">
      <header class="panel-head"><div class="panel-title"><span class="step">2</span><h2>{t("规划子网", "Plan subnets")}</h2><span class="prefix-tag">/64</span></div><div class="copy-action"><span>{t("复制全部", "Copy all")}</span><CopyButton {locale} text={subnetPlan.rows.map(row => row.prefix).join("\n")} labelZh="复制全部子网" labelEn="Copy all subnets" /></div></header>
      {#if selectedPrefix}
        <div class="selected-block"><div><span>{t("当前地址块", "Selected block")}</span><code>{selectedPrefix}</code></div><CopyButton {locale} text={selectedPrefix} /></div>
        <div class="subnet-fields">
          <label><span>{t("起始子网 ID", "Starting subnet ID")} <small>HEX</small></span><input class="dbx-input" bind:value={subnetStart} maxlength="6" placeholder="0001" spellcheck="false" aria-describedby="subnet-help" aria-invalid={subnetPlan.error === 'start' || subnetPlan.error === 'range'} /></label>
          <label><span>{t("子网数量", "Subnet count")}</span><input class="dbx-input" type="number" min="1" max="1000" step="1" bind:value={subnetCount} aria-describedby="subnet-help" aria-invalid={subnetPlan.error === 'count' || subnetPlan.error === 'range'} /></label>
        </div>
        <p id="subnet-help" class="field-help">{t("ID 范围 0000–ffff；修改参数自动更新，地址块保持不变。", "ID range: 0000–ffff. Parameters update subnets without changing the block.")}</p>
        {#if subnetError}<div class="error" role="alert">{subnetError}</div>{:else}
          <div class="range-summary" role="status"><span><i></i>{subnetPlan.rows.length} {t("个子网", "subnets")}</span><code>{subnetPlan.rows[0]?.id} → {subnetPlan.rows.at(-1)?.id}</code></div>
          <div class="subnet-table" role="region" aria-label={t("子网列表", "Subnet list")}>
            <div class="subnet-row table-head"><span>{t("子网 ID", "Subnet ID")}</span><span>{t("子网前缀", "Subnet prefix")}</span><span></span></div>
            {#each subnetPlan.rows as row (row.prefix)}<div class="subnet-row"><code class="subnet-id">{row.id}</code><code>{row.prefix}</code><CopyButton {locale} text={row.prefix} /></div>{/each}
          </div>
        {/if}
      {:else}<div class="empty"><span class="empty-symbol" aria-hidden="true">/64</span><strong>{t("等待选择地址块", "Choose an address block")}</strong><p>{t("先生成 /48 地址块，即可在这里分配子网。", "Generate a /48 block to start assigning subnets here.")}</p></div>{/if}
    </section>
  </div>
  <footer class="page-note"><span aria-hidden="true">ⓘ</span><p>{t("ULA 用于内网通信，不在公网路由。生成结果仅保存在当前页面，请复制后使用。", "ULA is for internal communication and is not routed on the public Internet. Results stay on this page; copy them for use.")}</p></footer>
</div>

<style>
  .ula-page{width:min(1180px,100%);box-sizing:border-box;margin:0 auto;padding:24px 28px;color:var(--color-foreground);container-type:inline-size}
  .ula-header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px}
  .ula-header p{margin:7px 0 0;color:var(--color-muted-foreground);font-size:12px;line-height:1.6}.standard-tag{display:flex;align-items:center;gap:8px;flex-shrink:0;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-md);color:var(--color-muted-foreground);font:10px var(--font-mono)}
  .workspace{display:grid;grid-template-columns:minmax(300px,.85fr) minmax(0,1.15fr);gap:16px;align-items:stretch}.panel{display:flex;min-width:0;flex-direction:column;overflow:hidden;border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-card)}.panel-head{display:flex;min-height:57px;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;border-bottom:1px solid var(--color-border);box-sizing:border-box}.panel-title{display:flex;align-items:center;gap:8px;min-width:0}h2{margin:0;font-size:13px;font-weight:650}.step{display:grid;width:22px;height:22px;place-items:center;background:color-mix(in srgb,var(--color-primary) 10%,transparent);border-radius:var(--radius-md);color:var(--color-primary);font:600 11px var(--font-mono)}.count,.prefix-tag{padding:2px 6px;border-radius:var(--radius-md);background:var(--color-muted);color:var(--color-muted-foreground);font:10px var(--font-mono)}.copy-action{display:flex;align-items:center;gap:5px;color:var(--color-muted-foreground);font-size:11px}.copy-action :global(.copy-btn){height:28px;min-height:28px}
  .generate-toolbar{display:flex;align-items:flex-end;gap:10px;padding:16px 16px 0}.generate-toolbar label{display:flex;min-width:0;flex:1;flex-direction:column;gap:7px;color:var(--color-muted-foreground);font-size:11px}.generate-toolbar :global(.dbx-custom-select){width:100%}.generate-toolbar .dbx-btn{display:flex;min-height:32px;align-items:center;justify-content:center;gap:6px;font-size:12px;white-space:nowrap}.block-help{margin:10px 16px 14px;color:var(--color-muted-foreground);font-size:11px;line-height:1.6}.block-list{height:330px;overflow:auto;scrollbar-gutter:stable;border-top:1px solid var(--color-border)}.block-row{display:grid;grid-template-columns:minmax(0,1fr) 30px;align-items:center;gap:4px;min-height:48px;padding:0 10px 0 0;border-bottom:1px solid var(--color-border);border-left:3px solid transparent}.block-row.selected{border-left-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 7%,var(--color-card))}.block-row:hover{background:color-mix(in srgb,var(--color-primary) 4%,var(--color-card))}.block-select{display:flex;min-width:0;min-height:48px;align-items:center;gap:9px;padding:8px 5px 8px 10px;border:0;background:transparent;color:var(--color-foreground);text-align:left;cursor:pointer}.block-select code{overflow-wrap:anywhere;font:12px/1.5 var(--font-mono)}.block-select:focus-visible{outline:2px solid var(--color-primary);outline-offset:-2px}.selection-dot{display:grid;flex:0 0 20px;width:20px;height:20px;place-items:center;color:var(--color-muted-foreground);font:10px var(--font-mono)}.selected .selection-dot{border-radius:50%;background:var(--color-primary);color:var(--color-primary-foreground)}.selected .block-select code{color:var(--color-primary);font-weight:600}.selected-tag{margin-left:auto;flex-shrink:0;padding:3px 5px;border-radius:4px;background:color-mix(in srgb,var(--color-primary) 10%,transparent);color:var(--color-primary);font-size:10px}.panel-foot{margin-top:auto;padding:12px 16px;border-top:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:10px;line-height:1.6}
  .selected-block{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 16px;background:color-mix(in srgb,var(--color-primary) 5%,var(--color-card));border-bottom:1px solid var(--color-border)}.selected-block>div{display:flex;min-width:0;flex-direction:column;gap:5px}.selected-block span{font-size:10px;color:var(--color-muted-foreground)}.selected-block code{color:var(--color-primary);overflow-wrap:anywhere;font:600 14px/1.5 var(--font-mono)}.subnet-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:15px 16px 0}.subnet-fields label{display:flex;min-width:0;flex-direction:column;gap:7px;font-size:11px;color:var(--color-muted-foreground)}.subnet-fields label>span{display:flex;align-items:center;gap:6px}.subnet-fields small{font:9px var(--font-mono);border:1px solid var(--color-border);padding:1px 3px;border-radius:3px}.subnet-fields input{width:100%;font:12px var(--font-mono)}.field-help{margin:9px 16px 14px;color:var(--color-muted-foreground);font-size:10px;line-height:1.6}.range-summary{display:flex;align-items:center;justify-content:space-between;padding:9px 16px;border-top:1px solid var(--color-border);color:var(--color-muted-foreground);font-size:11px}.range-summary span{display:flex;align-items:center;gap:6px}.range-summary i{width:5px;height:5px;border-radius:50%;background:var(--color-primary)}.range-summary code{font:10px var(--font-mono)}.subnet-table{height:280px;overflow:auto;scrollbar-gutter:stable;border-top:1px solid var(--color-border)}.subnet-row{display:grid;grid-template-columns:65px minmax(0,1fr) 30px;align-items:center;gap:10px;min-height:43px;padding:4px 12px 4px 16px;box-sizing:border-box;border-bottom:1px solid var(--color-border)}.subnet-row code{overflow-wrap:anywhere;font:12px/1.5 var(--font-mono)}.subnet-row .subnet-id{color:var(--color-muted-foreground);font-size:11px}.table-head{position:sticky;z-index:1;top:0;min-height:31px;background:var(--color-card);color:var(--color-muted-foreground);font-size:10px}.error{margin:0 16px 16px;padding:12px;border-radius:var(--radius-md);background:color-mix(in srgb,var(--color-destructive) 7%,transparent);color:var(--color-destructive);font-size:12px;line-height:1.6}.empty{display:flex;min-height:280px;flex:1;align-items:center;justify-content:center;flex-direction:column;padding:24px;text-align:center}.empty-symbol{display:grid;width:48px;height:44px;place-items:center;margin-bottom:14px;border:1px dashed var(--color-border);border-radius:var(--radius-lg);background:var(--color-muted);color:var(--color-primary);font:14px var(--font-mono)}.empty strong{font-size:13px;font-weight:600}.empty p{max-width:280px;margin:7px 0 0;color:var(--color-muted-foreground);font-size:11px;line-height:1.7}.page-note{display:flex;align-items:flex-start;gap:8px;padding:14px 2px;color:var(--color-muted-foreground);font-size:11px;line-height:1.7}.page-note p{margin:0}
  @container(max-width:800px){.workspace{grid-template-columns:1fr}.block-list{height:auto;max-height:245px}.subnet-table{height:auto;max-height:320px}.ula-header{align-items:flex-start}.standard-tag{font-size:9px}.selected-tag{margin-left:auto}}
  @media(max-width:560px){.ula-page{padding:16px 12px}.ula-header{flex-direction:column;gap:10px}}
.ula-page{padding:0}.ula-header{margin-bottom:12px}.ula-header p{margin:0}.workspace{gap:12px}
</style>
