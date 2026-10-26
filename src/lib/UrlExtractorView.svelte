<script>
  import { pick } from "./i18n.js";
  import { extractLinks, linkGroup } from "./contentExpansion.js";
  import CopyButton from "./CopyButton.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state("");
  let keepQuery = $state(true);
  let group = $state(false);
  let deduplicate = $state(true);
  let sort = $state(false);
  let appliedDemoRequest = 0;
  const links = $derived(extractLinks(input, { keepQuery, deduplicate, sort }));
  const domains = $derived(new Set(links.map(linkGroup)).size);
  const output = $derived(!links.length ? "" : group
    ? JSON.stringify(Object.groupBy(links, linkGroup), null, 2)
    : links.join("\n"));

  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    input = "[文档](https://example.com/docs?lang=zh#intro)\n<a href=\"https://example.com/search?q=dbx&amp;page=2\">Search</a>\nwww.example.com/path?q=1\n192.168.1.10:8080/api\nhttp://[::1]:3000/\nftp://files.example.com/archive.zip\nsftp://server.example.com/home\nwss://socket.example.com/live\nfile:///C:/Work/readme.txt\nmailto:hello@example.com\ntel:+8613800000000\nmagnet:?xt=urn:btih:0123456789abcdef\nhttps://example.com/docs?lang=zh#intro";
  });
</script>

<div class="url-extractor">
  <div class="intro">
    <p>{t("从纯文本、HTML 或 Markdown 中提取链接。", "Extract links from plain text, HTML, or Markdown.")}</p>
    <span class="live"><span aria-hidden="true"></span>{t("实时处理", "Live")}</span>
  </div>

  <div class="options" role="group" aria-label={t("提取选项", "Extraction options")}>
    <label><input type="checkbox" bind:checked={keepQuery} />{t("保留查询参数", "Keep query parameters")}</label>
    <label><input type="checkbox" bind:checked={group} />{t("按域名分组", "Group by domain")}</label>
    <label><input type="checkbox" bind:checked={deduplicate} />{t("自动去重", "Remove duplicates")}</label>
    <label><input type="checkbox" bind:checked={sort} />{t("排序", "Sort")}</label>
    <span class="format">{group ? "JSON" : t("每行一个链接", "One link per line")}</span>
  </div>
  {#if !keepQuery}<p class="option-hint">{t("将移除查询参数和片段标识（#）。", "Query parameters and fragments (#) will be removed.")}</p>{/if}

  <div class="panels">
    <section class="panel">
      <div class="panel-head">
        <label for="url-extractor-input">{t("输入文本", "Input text")}</label>
        <button type="button" class="dbx-btn dbx-btn--ghost clear" disabled={!input} onclick={() => input = ""}>{t("清空", "Clear")}</button>
      </div>
      <textarea id="url-extractor-input" class="dbx-textarea editor" bind:value={input} maxlength="100000" spellcheck="false" placeholder={t("粘贴包含 URL 的文本…", "Paste text containing URLs…")}></textarea>
      <div class="panel-foot"><span>{t("多协议 · 域名 · IP", "Protocols · Domains · IPs")}</span><span>{input.length.toLocaleString(locale)} / 100,000</span></div>
    </section>

    <section class="panel result">
      <div class="panel-head">
        <label for="url-extractor-output">{t("提取结果", "Extracted links")}</label>
        <div class="result-actions"><span class="format-badge">{group ? "JSON" : "TXT"}</span><CopyButton {locale} text={output} labelZh="复制全部" labelEn="Copy all" /></div>
      </div>
      {#if links.length}
        <textarea id="url-extractor-output" class="dbx-textarea editor" value={output} readonly spellcheck="false"></textarea>
      {:else}
        <div class="empty" role="status">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)"></path></svg>
          <strong>{input.trim() ? t("未找到链接", "No links found") : t("等待输入文本", "Waiting for input")}</strong>
          <span>{input.trim() ? t("请检查文本中是否包含有效的 URL。", "Check that the text contains valid URLs.") : t("粘贴文本后，提取结果会自动显示在这里。", "Paste text to see extracted links here automatically.")}</span>
        </div>
      {/if}
      <div class="panel-foot" role="status"><span>{t("链接", "Links")} <b>{links.length}</b></span><span>{t("分组", "Group")} <b>{domains}</b></span></div>
    </section>
  </div>
  <p class="support-note">{t("支持 HTTP(S)、FTP(S)、SFTP、WS(S)、SSH、file、自定义 scheme:// 链接，以及 mailto、tel、sms、magnet、urn、geo、news、bitcoin。裸域名、IP 和 // 开头的链接默认补全为 HTTPS；无主机名时按协议分组。", "Supports HTTP(S), FTP(S), SFTP, WS(S), SSH, file, custom scheme:// links, and mailto, tel, sms, magnet, urn, geo, news, bitcoin. Bare domains, IPs, and // links default to HTTPS; links without a hostname are grouped by scheme.")}</p>
</div>

<style>
  .url-extractor { width:100%; max-width:1240px; margin:0 auto; padding:24px 28px; display:flex; flex-direction:column; gap:16px; container-type:inline-size; }
  .intro, .options, .panel-head, .panel-foot, .result-actions { display:flex; align-items:center; gap:12px; }
  .intro { justify-content:space-between; }
  p { margin:0; color:var(--color-muted-foreground); font-size:12px; }
  .live { display:inline-flex; align-items:center; gap:6px; flex-shrink:0; font-size:11px; color:var(--color-muted-foreground); }
  .live > span { width:6px; height:6px; border-radius:50%; background:var(--color-success); }
  .options { flex-wrap:wrap; padding:12px; border:1px solid var(--color-border); border-radius:var(--radius-lg); background:var(--color-muted); gap:10px 24px; }
  .options label { display:inline-flex; align-items:center; gap:8px; min-height:24px; font-size:12px; cursor:pointer; }
  .options input { margin:0; flex-shrink:0; }
  .format { margin-left:auto; color:var(--color-muted-foreground); font-size:11px; }
  .option-hint { margin-top:-8px; }
  .support-note { line-height:1.8; overflow-wrap:anywhere; }
  .panels { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; }
  .panel { display:flex; flex-direction:column; min-width:0; border:1px solid var(--color-border); border-radius:var(--radius-lg); overflow:hidden; background:var(--color-card); }
  .panel-head { justify-content:space-between; min-height:48px; padding:8px 14px; border-bottom:1px solid var(--color-border); }
  .panel-head > label { font-size:12px; font-weight:600; }
  .clear { min-height:28px; padding:3px 8px; font-size:11px; }
  .format-badge { font-family:var(--font-mono); color:var(--color-muted-foreground); font-size:10px; padding:2px 6px; border:1px solid var(--color-border); border-radius:var(--radius-sm); }
  .editor { display:block; flex:1; width:100%; min-height:340px; padding:16px; border:0; border-radius:0; resize:vertical; font-family:var(--font-mono); font-size:12px; line-height:1.8; background:transparent; }
  .editor:focus-visible { outline:2px solid var(--color-ring); outline-offset:-2px; }
  .panel-foot { justify-content:space-between; min-height:36px; padding:8px 14px; border-top:1px solid var(--color-border); color:var(--color-muted-foreground); font-size:11px; gap:8px; }
  .panel-foot b { color:var(--color-foreground); font-weight:600; margin-left:4px; }
  .empty { flex:1; min-height:340px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:12px; padding:24px; text-align:center; color:var(--color-muted-foreground); }
  .empty strong { color:var(--color-foreground); font-size:13px; font-weight:500; }
  .empty span { max-width:260px; font-size:12px; line-height:1.7; }
  @container (max-width:700px) { .panels { grid-template-columns:minmax(0,1fr); } .editor, .empty { min-height:220px; } .format { display:none; } }
  @media (max-width:600px) { .url-extractor { padding:16px; } }
</style>
