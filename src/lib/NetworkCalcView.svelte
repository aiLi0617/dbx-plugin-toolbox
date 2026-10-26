<script>
  import { localizeError, pick } from "./i18n.js";
  import Select from "./Select.svelte";
  import { calculateIpv4, calculateIpv6, integerToIpv4, maskToPrefix, previewSubnets, expandIpv4Range, generateIpv6Ula, generateMacAddress, lookupOui } from "./network.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let fallbackPrefix = $state(24);
  let maskInput = $state("");
  let integerInput = $state("");
  let addressFamily = $state("ipv4");
  let splitPrefix = $state(26);
  let rangeInput = $state("");
  let ula = $state("");
  let mac = $state("");
  let ouiInput = $state("");
  let copied = $state("");
  const rangeResult = $derived.by(() => { try { return { value: rangeInput ? expandIpv4Range(rangeInput) : [], error: "" }; } catch (error) { return { value: [], error: localizeError(locale, error) }; } });
  const ouiResult = $derived.by(() => { try { return { value: ouiInput ? lookupOui(ouiInput) : null, error: "" }; } catch (error) { return { value: null, error: localizeError(locale, error) }; } });

  function setAddressFamily(value) {
    addressFamily = value;
    fallbackPrefix = value === "ipv6" ? 64 : 24;
    splitPrefix = value === "ipv6" ? 66 : 26;
  }

  const result = $derived.by(() => {
    if (!input.trim()) return { value: null, error: "" };
    try { return { value: addressFamily === "ipv6" ? calculateIpv6(input, fallbackPrefix) : calculateIpv4(input, fallbackPrefix), error: "" }; }
    catch (error) { return { value: null, error: localizeError(locale, error) }; }
  });
  const maskResult = $derived.by(() => {
    if (!maskInput.trim()) return { value: null, error: "" };
    try { return { value: maskToPrefix(maskInput), error: "" }; }
    catch (error) { return { value: null, error: localizeError(locale, error) }; }
  });
  const integerResult = $derived.by(() => {
    if (!integerInput.trim()) return { value: "", error: "" };
    try { return { value: integerToIpv4(integerInput), error: "" }; }
    catch (error) { return { value: "", error: localizeError(locale, error) }; }
  });
  const splitResult = $derived.by(() => {
    if (!input.trim() || splitPrefix === "") return { value: null, error: "" };
    try { return { value: previewSubnets(input, Number(splitPrefix), 64), error: "" }; }
    catch (error) { return { value: null, error: localizeError(locale, error) }; }
  });
  const typeLabels = {
    private: ["私有地址", "Private"], public: ["公网地址", "Public"], loopback: ["环回地址", "Loopback"],
    "link-local": ["链路本地地址", "Link-local"], multicast: ["组播地址", "Multicast"],
    broadcast: ["广播地址", "Broadcast"], unspecified: ["未指定地址", "Unspecified"],
    "unique-local": ["唯一本地地址", "Unique local"], global: ["全球单播地址", "Global unicast"],
  };
  const typeLabel = (type) => t(...(typeLabels[type] || [type, type]));
  const number = (value) => new Intl.NumberFormat(locale).format(value);
  const examples = ["192.168.1.10/24", "10.0.0.1/8", "172.16.20.5/20"];
  async function copyValue(value, key) {
    if (!value || !navigator.clipboard) return;
    await navigator.clipboard.writeText(String(value));
    copied = key;
    setTimeout(() => { if (copied === key) copied = ""; }, 1400);
  }
</script>

<div class="page">
  <header class="intro">
    <div class="intro-badge"><span class="status-dot"></span>{t("离线运行", "Runs offline")}</div>
  </header>
  <section class="panel primary">
    <div class="panel-heading">
      <div><h2>{t("网段分析", "Network analysis")}</h2><span>{t("输入一个地址或 CIDR 开始", "Enter an address or CIDR to begin")}</span></div>
      {#if result.value}<button class="copy-action" type="button" onclick={() => copyValue(result.value.cidr, "cidr")}>{copied === "cidr" ? t("已复制", "Copied") : t("复制 CIDR", "Copy CIDR")}</button>{/if}
    </div>
    <div class="fields">
      <label class="field family"><span>{t("地址族", "Address family")}</span><Select value={addressFamily} onchange={setAddressFamily} ariaLabel={t("地址族", "Address family")} options={[{value:"ipv4",label:"IPv4"},{value:"ipv6",label:"IPv6"}]} /></label>
      <label class="field grow"><span>{addressFamily === "ipv6" ? t("IPv6 或 CIDR", "IPv6 or CIDR") : t("IPv4 或 CIDR", "IPv4 or CIDR")}</span><input class="dbx-input mono" bind:value={input} placeholder={addressFamily === "ipv6" ? t("例如 2001:db8::1/64", "For example, 2001:db8::1/64") : t("例如 192.168.1.10/24", "For example, 192.168.1.10/24")} /></label>
      <label class="field prefix"><span>{t("默认前缀", "Default prefix")}</span><input class="dbx-input" type="number" min="0" max={addressFamily === "ipv6" ? 128 : 32} bind:value={fallbackPrefix} /></label>
    </div>
    {#if addressFamily === "ipv4"}<div class="examples"><span>{t("试试：", "Try")}</span>{#each examples as example}<button type="button" onclick={() => (input = example)}>{example}</button>{/each}</div>{/if}
    {#if result.error}<p class="error">{result.error}</p>{/if}
    {#if result.value}
      {#if result.value.isBroadcast}
        <p class="notice warning">
          <strong>{t("这是当前网段的广播地址。", "This is the broadcast address of the subnet.")}</strong>
          {t(` 所属网段为 ${result.value.cidr}，通常不能分配给主机。`, ` It belongs to ${result.value.cidr} and normally cannot be assigned to a host.`)}
        </p>
      {/if}
      <div class="result-header"><span>{t("计算结果", "Calculated values")}</span><span class="result-meta">{t("实时更新", "Live")}</span></div>
      <div class="result-grid">
        <div><span>{t("所属网段", "Subnet")}</span><strong>{result.value.cidr}</strong></div>
        <div><span>{t("子网掩码", "Subnet mask")}</span><strong>{result.value.mask}</strong></div>
        <div><span>{t("网络地址", "Network")}</span><strong>{result.value.network}</strong></div>
        {#if result.value.broadcast}<div><span>{t("广播地址", "Broadcast")}</span><strong>{result.value.broadcast}</strong></div>{/if}
        <div><span>{t("首个可用地址", "First usable")}</span><strong>{result.value.firstHost}</strong></div>
        <div><span>{t("最后可用地址", "Last usable")}</span><strong>{result.value.lastHost}</strong></div>
        <div><span>{t("地址总数", "Total addresses")}</span><strong>{number(result.value.total)}</strong></div>
        <div><span>{t("可用地址数", "Usable addresses")}</span><strong>{number(result.value.usable)}</strong></div>
        <div><span>{t("通配掩码", "Wildcard mask")}</span><strong>{result.value.wildcard}</strong></div>
        <div><span>{t("地址类型", "Address type")}</span><strong>{typeLabel(result.value.type)}</strong></div>
      </div>
      <details>
        <summary>{t("地址表示", "Address representations")}</summary>
        <dl>
          <dt>{t("无符号整数", "Unsigned integer")}</dt><dd>{result.value.integer}</dd>
          <dt>{t("十六进制", "Hexadecimal")}</dt><dd>{result.value.hexadecimal}</dd>
          <dt>{t("二进制", "Binary")}</dt><dd>{result.value.binary}</dd>
        </dl>
      </details>
    {/if}
  </section>

  <section class="panel split-panel">
    <h3>{t("子网切分", "Subnet splitting")}</h3>
    <div class="compact-fields split-fields">
      <div class="field grow"><span>{t("目标前缀", "Target prefix")}</span><input class="dbx-input" type="number" min="0" max={addressFamily === "ipv6" ? 128 : 32} aria-label={t("目标前缀", "Target prefix")} bind:value={splitPrefix} /></div>
      <div class="field result-field"><span>{t("子网数量", "Subnet count")}</span><output class:empty={!splitResult.value}>{splitResult.value ? number(splitResult.value.total) : "—"}</output></div>
    </div>
    {#if splitResult.error}<p class="error">{splitResult.error}</p>{/if}
    {#if splitResult.value?.subnets.length}<div class="subnet-list">{#each splitResult.value.subnets as subnet}<code>{subnet}</code>{/each}</div>{/if}
    {#if splitResult.value?.truncated}<p class="notice warning">{t("为避免浏览器卡顿，最多显示 64 个子网。", "At most 64 subnets are shown to keep the browser responsive.")}</p>{/if}
  </section>

  <div class="secondary-grid">
    <section class="panel" class:hidden={addressFamily === "ipv6"}>
      <h3>{t("掩码转 CIDR", "Mask to CIDR")}</h3>
      <div class="compact-fields">
        <label class="field grow"><span>{t("子网掩码", "Subnet mask")}</span><input class="dbx-input mono" bind:value={maskInput} placeholder="255.255.255.0" /></label>
        <div class="field result-field"><span>{t("CIDR 前缀", "CIDR prefix")}</span><output class:empty={maskResult.value === null}>{maskResult.value === null ? "—" : `/${maskResult.value}`}</output></div>
      </div>
      {#if maskResult.error}<p class="error">{maskResult.error}</p>{/if}
    </section>
    <section class="panel" class:hidden={addressFamily === "ipv6"}>
      <h3>{t("整数转 IPv4", "Integer to IPv4")}</h3>
      <div class="compact-fields">
        <label class="field grow"><span>{t("无符号整数", "Unsigned integer")}</span><input class="dbx-input mono" bind:value={integerInput} inputmode="numeric" placeholder="3232235786" /></label>
        <div class="field result-field"><span>{t("IPv4 地址", "IPv4 address")}</span><output class:empty={!integerResult.value}>{integerResult.value || "—"}</output></div>
      </div>
      {#if integerResult.error}<p class="error">{integerResult.error}</p>{/if}
    </section>
  </div>
  <div class="secondary-grid">
    <section class="panel">
      <h3>{t("IPv4 范围展开", "Expand IPv4 range")}</h3>
      <label class="field"><span>{t("CIDR 或起止范围（最多 256 项）", "CIDR or start-end range (max 256)")}</span><input class="dbx-input mono" bind:value={rangeInput} placeholder="192.168.1.0/30" /></label>
      {#if rangeResult.error}
        <p class="error">{rangeResult.error}</p>
      {:else if rangeResult.value.length}
        <div class="subnet-list">{#each rangeResult.value as address}<code>{address}</code>{/each}</div>
      {:else}
        <div class="range-empty" aria-hidden="true"><span>—</span><small>{t("CIDR 或起止范围（最多 256 项）", "CIDR or start-end range (max 256)")}</small></div>
      {/if}
    </section>
    <section class="panel utility-panel">
      <h3>{t("本地网络标识", "Local network identities")}</h3>
      <div class="buttons"><button class="dbx-btn" type="button" onclick={() => (ula = generateIpv6Ula())}>{t("生成 IPv6 ULA", "Generate IPv6 ULA")}</button><button class="dbx-btn" type="button" onclick={() => (mac = generateMacAddress())}>{t("生成 MAC", "Generate MAC")}</button></div>
      {#if ula}<output>{ula}</output>{/if}{#if mac}<output>{mac}</output>{/if}
      <label class="field"><span>{t("离线 OUI 查询", "Offline OUI lookup")}</span><input class="dbx-input mono" bind:value={ouiInput} placeholder="00:1B:63:…" /></label>
      {#if ouiResult.error}<p class="error">{ouiResult.error}</p>{:else if ouiResult.value}<output>{ouiResult.value.prefix} · {ouiResult.value.vendor}</output>{/if}
    </section>
  </div>
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 16px; width: min(100%, 1040px); margin: 0 auto; padding: 8px 4px 28px; }
  .intro { display: flex; align-items: flex-end; justify-content: flex-end; gap: 20px; padding: 8px 4px 4px; }
  .intro-badge { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; padding: 6px 10px; border: 1px solid color-mix(in srgb, var(--color-success) 28%, var(--color-border)); border-radius: 999px; background: var(--color-success-bg); color: var(--color-success); font-size: 11px; font-weight: 600; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .panel { border: 1px solid var(--color-border); border-radius: 12px; background: var(--color-card); padding: 18px; box-shadow: 0 2px 8px rgb(0 0 0 / .025); }
  .primary { display: flex; flex-direction: column; gap: 14px; }
  .panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .panel-heading h2 { margin: 0; font-size: 16px; letter-spacing: -.01em; }
  .panel-heading span { display: block; margin-top: 3px; color: var(--color-muted-foreground); font-size: 12px; }
  .copy-action { border: 1px solid var(--color-border); border-radius: 6px; background: transparent; color: var(--color-muted-foreground); padding: 5px 9px; font-size: 11px; cursor: pointer; }
  .copy-action:hover { border-color: var(--color-primary); color: var(--color-foreground); background: var(--color-muted); }
  .fields, .secondary-grid { display: flex; gap: 12px; align-items: stretch; }
  .field { display: flex; flex-direction: column; gap: 6px; color: var(--color-muted-foreground); font-size: 12px; }
  .grow { flex: 1; }.prefix { width: 120px; }.family { width: 120px; }.hidden { display: none !important; }
  .examples { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: -2px; color: var(--color-muted-foreground); font-size: 11px; }
  .examples button { border: 1px solid var(--color-border); border-radius: 999px; background: var(--color-muted); color: var(--color-foreground); padding: 4px 9px; font-family: var(--font-mono); font-size: 11px; cursor: pointer; }
  .examples button:hover { border-color: var(--color-primary); background: var(--color-background); }
  .mono, strong, output, dd { font-family: var(--font-mono, ui-monospace, monospace); }
  .result-header { display: flex; justify-content: space-between; align-items: center; margin-top: 2px; color: var(--color-muted-foreground); font-size: 11px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
  .result-meta { margin: 0 !important; color: var(--color-success) !important; font-size: 10px !important; letter-spacing: .02em; }
  .result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-border); }
  .result-grid div { display: flex; flex-direction: column; gap: 5px; background: var(--color-background); padding: 12px; }
  .result-grid span, dt { color: var(--color-muted-foreground); font-size: 12px; }
  .result-grid strong { font-size: 14px; overflow-wrap: anywhere; }
  .secondary-grid > section { flex: 1 1 360px; display: flex; flex-direction: column; gap: 12px; }
  .utility-panel output { display: block; padding: 8px 10px; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-muted); overflow-wrap: anywhere; }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  .range-empty { flex: 1; min-height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; border: 1px dashed var(--color-border); border-radius: 6px; color: var(--color-muted-foreground); background: color-mix(in srgb, var(--color-muted) 35%, transparent); text-align: center; }
  .range-empty span { font-size: 18px; line-height: 1; }
  .range-empty small { font-size: 12px; }
  .compact-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(116px, 0.42fr); gap: 10px; align-items: end; }
  .result-field output { display: flex; align-items: center; min-height: 34px; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-muted); padding: 6px 10px; color: var(--color-foreground); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
  .result-field output.empty { color: var(--color-muted-foreground); font-weight: 400; }
  .split-panel { display: flex; flex-direction: column; gap: 12px; }
  .split-panel h3 { margin: 0; }
  .split-fields { max-width: 560px; }
  .subnet-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; max-height: 180px; overflow: auto; }
  .subnet-list code { border: 1px solid var(--color-border); border-radius: 5px; padding: 6px 8px; background: var(--color-muted); font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; }
  h3 { margin: 0; font-size: 14px; }
  .error { margin: 0; color: var(--color-destructive); font-size: 12px; }
  .notice { margin: 0; border: 1px solid var(--color-border); border-radius: 8px; padding: 10px 12px; font-size: 13px; }
  .notice.warning { border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); background: color-mix(in srgb, var(--color-warning) 9%, var(--color-background)); }
  details { font-size: 13px; } summary { cursor: pointer; color: var(--color-muted-foreground); }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; margin: 12px 0 0; }
  dt, dd { margin: 0; } dd { overflow-wrap: anywhere; }
  @media (max-width: 640px) { .page { padding-inline: 0; }.intro { align-items: flex-start; flex-direction: column; gap: 10px; }.intro-badge { align-self: flex-start; }.fields, .secondary-grid { flex-direction: column; align-items: stretch; }.prefix, .family { width: auto; }.compact-fields { grid-template-columns: 1fr; }.panel { padding: 14px; } }
</style>
