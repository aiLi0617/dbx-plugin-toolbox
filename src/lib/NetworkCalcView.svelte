<script>
  import { pick } from "./i18n.js";
  import { calculateIpv4, calculateIpv6, integerToIpv4, maskToPrefix, splitSubnets } from "./network.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let fallbackPrefix = $state(24);
  let maskInput = $state("");
  let integerInput = $state("");
  let addressFamily = $state("ipv4");
  let splitPrefix = $state(26);

  function setAddressFamily(value) {
    addressFamily = value;
    fallbackPrefix = value === "ipv6" ? 64 : 24;
    splitPrefix = value === "ipv6" ? 66 : 26;
  }

  const result = $derived.by(() => {
    if (!input.trim()) return { value: null, error: "" };
    try { return { value: addressFamily === "ipv6" ? calculateIpv6(input, fallbackPrefix) : calculateIpv4(input, fallbackPrefix), error: "" }; }
    catch (error) { return { value: null, error: String(error.message || error) }; }
  });
  const maskResult = $derived.by(() => {
    if (!maskInput.trim()) return { value: null, error: "" };
    try { return { value: maskToPrefix(maskInput), error: "" }; }
    catch (error) { return { value: null, error: String(error.message || error) }; }
  });
  const integerResult = $derived.by(() => {
    if (!integerInput.trim()) return { value: "", error: "" };
    try { return { value: integerToIpv4(integerInput), error: "" }; }
    catch (error) { return { value: "", error: String(error.message || error) }; }
  });
  const splitResult = $derived.by(() => {
    if (!input.trim() || splitPrefix === "") return { value: [], error: "" };
    try { return { value: splitSubnets(input, Number(splitPrefix), 64), error: "" }; }
    catch (error) { return { value: [], error: String(error.message || error) }; }
  });
  const typeLabels = {
    private: ["私有地址", "Private"], public: ["公网地址", "Public"], loopback: ["环回地址", "Loopback"],
    "link-local": ["链路本地地址", "Link-local"], multicast: ["组播地址", "Multicast"],
    broadcast: ["广播地址", "Broadcast"], unspecified: ["未指定地址", "Unspecified"],
    "unique-local": ["唯一本地地址", "Unique local"], global: ["全球单播地址", "Global unicast"],
  };
  const typeLabel = (type) => t(...(typeLabels[type] || [type, type]));
  const number = (value) => new Intl.NumberFormat(locale).format(value);
</script>

<div class="page">
  <section class="panel primary">
    <div class="fields">
      <label class="field family"><span>{t("地址族", "Address family")}</span><select class="dbx-input" value={addressFamily} onchange={(event) => setAddressFamily(event.currentTarget.value)}><option value="ipv4">IPv4</option><option value="ipv6">IPv6</option></select></label>
      <label class="field grow"><span>{addressFamily === "ipv6" ? t("IPv6 或 CIDR", "IPv6 or CIDR") : t("IPv4 或 CIDR", "IPv4 or CIDR")}</span><input class="dbx-input mono" bind:value={input} placeholder={addressFamily === "ipv6" ? t("例如 2001:db8::1/64", "For example, 2001:db8::1/64") : t("例如 192.168.1.10/24", "For example, 192.168.1.10/24")} /></label>
      <label class="field prefix"><span>{t("默认前缀", "Default prefix")}</span><input class="dbx-input" type="number" min="0" max={addressFamily === "ipv6" ? 128 : 32} bind:value={fallbackPrefix} /></label>
    </div>
    {#if result.error}<p class="error">{result.error}</p>{/if}
    {#if result.value}
      {#if result.value.isBroadcast}
        <p class="notice warning">
          <strong>{t("这是当前网段的广播地址。", "This is the broadcast address of the subnet.")}</strong>
          {t(` 所属网段为 ${result.value.cidr}，通常不能分配给主机。`, ` It belongs to ${result.value.cidr} and normally cannot be assigned to a host.`)}
        </p>
      {/if}
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
      <div class="field result-field"><span>{t("子网数量", "Subnet count")}</span><output class:empty={!splitResult.value.length}>{splitResult.value.length ? splitResult.value.length : "—"}</output></div>
    </div>
    {#if splitResult.error}<p class="error">{splitResult.error}</p>{/if}
    {#if splitResult.value.length}<div class="subnet-list">{#each splitResult.value as subnet}<code>{subnet}</code>{/each}</div>{/if}
    <p class="dbx-hint">{t("为避免浏览器卡顿，最多显示 64 个子网。", "At most 64 subnets are shown to keep the browser responsive.")}</p>
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
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 14px; }
  .panel { border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-card); padding: 16px; }
  .primary { display: flex; flex-direction: column; gap: 14px; }
  .fields, .secondary-grid { display: flex; gap: 12px; align-items: stretch; }
  .field { display: flex; flex-direction: column; gap: 6px; color: var(--color-muted-foreground); font-size: 12px; }
  .grow { flex: 1; }.prefix { width: 120px; }.family { width: 120px; }.hidden { display: none !important; }
  .mono, strong, output, dd { font-family: var(--font-mono, ui-monospace, monospace); }
  .result-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 1px; overflow: hidden; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-border); }
  .result-grid div { display: flex; flex-direction: column; gap: 5px; background: var(--color-background); padding: 12px; }
  .result-grid span, dt { color: var(--color-muted-foreground); font-size: 12px; }
  .result-grid strong { font-size: 14px; overflow-wrap: anywhere; }
  .secondary-grid > section { flex: 1 1 360px; display: flex; flex-direction: column; gap: 12px; }
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
  @media (max-width: 640px) { .fields, .secondary-grid { flex-direction: column; align-items: stretch; }.prefix { width: auto; }.compact-fields { grid-template-columns: 1fr; } }
</style>
