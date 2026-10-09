<script>
  import CopyButton from "./CopyButton.svelte";
  import { chmodFromOctal, chmodFromSymbolic, chmodFromUmask, chmodSymbolicExpression } from "./developerUtilities.js";
  import { pick } from "./i18n.js";

  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);

  let mode = $state(chmodFromOctal("755"));
  let octalInput = $state("755");
  let symbolicInput = $state("rwxr-xr-x");
  let modeError = $state("");
  let umaskInput = $state("022");
  let umaskError = $state("");
  let umaskResult = $state(chmodFromUmask("022"));

  const groups = [
    { name: ["所有者", "Owner"], who: "u" },
    { name: ["用户组", "Group"], who: "g" },
    { name: ["其他用户", "Others"], who: "o" },
  ];
  const permissions = [
    { bit: 4, code: "r", name: ["读取", "Read"] },
    { bit: 2, code: "w", name: ["写入", "Write"] },
    { bit: 1, code: "x", name: ["执行", "Execute"] },
  ];
  const presets = [
    { mode: "755", label: ["可执行文件/目录", "Executable / directory"] },
    { mode: "644", label: ["普通文件", "Regular file"] },
    { mode: "600", label: ["私有文件", "Private file"] },
    { mode: "777", label: ["完全开放（危险）", "Fully open (risky)"] },
    { mode: "700", label: ["私有目录", "Private directory"] },
    { mode: "1777", label: ["粘滞位目录（/tmp）", "Sticky directory (/tmp)"] },
  ];

  const displayOctal = $derived(`0${mode.octal}`);
  const command = $derived(`chmod ${mode.octal}`);
  const symbolicMode = $derived(chmodSymbolicExpression(mode));

  function applyOctal(value) {
    octalInput = String(value ?? "");
    try {
      mode = chmodFromOctal(octalInput);
      symbolicInput = mode.symbolic;
      modeError = "";
    } catch {
      modeError = t("请输入 3–4 位八进制数（0–7）", "Enter 3–4 octal digits (0–7)");
    }
  }

  function applySymbolic(value) {
    symbolicInput = String(value ?? "");
    try {
      mode = chmodFromSymbolic(symbolicInput);
      octalInput = mode.octal;
      modeError = "";
    } catch {
      modeError = t("字符权限必须是 9 位，例如 rwxr-xr-x", "Symbolic permissions must contain 9 characters, such as rwxr-xr-x");
    }
  }

  function commitMode(special, digits) {
    mode = chmodFromOctal(`${special || ""}${digits.join("")}`);
    octalInput = mode.octal;
    symbolicInput = mode.symbolic;
    modeError = "";
  }

  function togglePermission(groupIndex, bit) {
    const digits = [...mode.digits];
    digits[groupIndex] ^= bit;
    commitMode(mode.special, digits);
  }

  function toggleSpecial(bit) {
    commitMode(mode.special ^ bit, [...mode.digits]);
  }

  function applyUmask(value) {
    umaskInput = String(value ?? "");
    try {
      umaskResult = chmodFromUmask(umaskInput);
      umaskError = "";
    } catch {
      umaskError = t("请输入最多 3 位八进制 umask（可带前导 0）", "Enter up to 3 octal umask digits, optionally prefixed with 0");
    }
  }
</script>

<div class="chmod-page">
  <section class="mode-toolbar" aria-label={t("权限模式", "Permission mode")}>
    <label class="octal-field">
      <span>{t("八进制", "Octal")}</span>
      <input class="dbx-input mono octal-input" value={octalInput} oninput={(event) => applyOctal(event.currentTarget.value)} inputmode="numeric" maxlength="6" spellcheck="false" aria-invalid={modeError ? "true" : "false"} />
    </label>
    <div class="special-toggles">
      <label><input type="checkbox" checked={(mode.special & 4) !== 0} onchange={() => toggleSpecial(4)} /> setuid</label>
      <label><input type="checkbox" checked={(mode.special & 2) !== 0} onchange={() => toggleSpecial(2)} /> setgid</label>
      <label><input type="checkbox" checked={(mode.special & 1) !== 0} onchange={() => toggleSpecial(1)} /> {t("粘滞位", "sticky")}</label>
    </div>
    <div class="command-chip"><span class="status-dot"></span><code>{command}</code><CopyButton {locale} text={command} /></div>
  </section>
  {#if modeError}<div class="inline-error" role="alert">{modeError}</div>{/if}

  <section class="mode-summary" aria-live="polite">
    <div class="primary-result">
      <strong>{displayOctal}</strong>
      <input class="symbolic-input" value={symbolicInput} oninput={(event) => applySymbolic(event.currentTarget.value)} maxlength="9" spellcheck="false" aria-label={t("字符权限", "Symbolic permissions")} aria-invalid={modeError ? "true" : "false"} />
    </div>
    <div class="secondary-result"><span>{t("符号模式", "Symbolic mode")}</span><code>{symbolicMode}</code><CopyButton {locale} text={symbolicMode} /></div>
  </section>

  <div class="permission-grid">
    {#each groups as group, groupIndex}
      <fieldset class="permission-group">
        <legend>{t(...group.name)} <code>{group.who}</code></legend>
        {#each permissions as permission}
          <label class:enabled={(mode.digits[groupIndex] & permission.bit) !== 0}>
            <input type="checkbox" checked={(mode.digits[groupIndex] & permission.bit) !== 0} onchange={() => togglePermission(groupIndex, permission.bit)} />
            <code>{permission.code}</code><span>{t(...permission.name)}</span>
          </label>
        {/each}
      </fieldset>
    {/each}
  </div>

  <section class="presets-panel">
    <h3>{t("常用预设", "Common presets")}</h3>
    <div class="preset-list">
      {#each presets as preset}
        <button type="button" class:active={mode.octal === preset.mode} onclick={() => applyOctal(preset.mode)}>
          <code>{preset.mode}</code><span>{chmodFromOctal(preset.mode).symbolic}</span><small>{t(...preset.label)}</small>
        </button>
      {/each}
    </div>
  </section>

  <section class="umask-panel">
    <div class="umask-heading">
      <div><h3>umask</h3><p>{t("新建文件按 0666、新建目录按 0777 扣除掩码位。", "New files start from 0666 and directories from 0777, then masked bits are removed.")}</p></div>
      <label><span>{t("掩码", "Mask")}</span><input class="dbx-input mono" value={umaskInput} oninput={(event) => applyUmask(event.currentTarget.value)} inputmode="numeric" maxlength="6" /></label>
    </div>
    {#if umaskError}
      <div class="inline-error" role="alert">{umaskError}</div>
    {:else}
      <div class="umask-results">
        <div><span>{t("普通文件", "Regular file")}</span><strong>{umaskResult.file.octal}</strong><code>{umaskResult.file.symbolic}</code></div>
        <div><span>{t("目录", "Directory")}</span><strong>{umaskResult.directory.octal}</strong><code>{umaskResult.directory.symbolic}</code></div>
      </div>
    {/if}
  </section>
</div>

<style>
  .chmod-page{display:flex;flex-direction:column;gap:12px;width:100%;max-width:1180px;margin:0 auto}.mode-toolbar,.mode-summary,.permission-group,.presets-panel,.umask-panel{border:1px solid var(--color-border);border-radius:var(--radius-lg,10px);background:var(--color-card,var(--color-background,Canvas))}.mode-toolbar{display:flex;align-items:center;gap:18px;padding:10px 12px}.octal-field{display:flex;align-items:center;gap:9px;font-size:12px;color:var(--color-muted-foreground)}.octal-input{width:100px;font-size:15px;font-weight:650;color:var(--color-primary)}.special-toggles{display:flex;align-items:center;gap:14px;flex:1}.special-toggles label{display:flex;align-items:center;gap:6px;font-size:12px}.command-chip{display:flex;align-items:center;gap:7px;padding:3px 5px 3px 10px;border-radius:999px;background:color-mix(in srgb,var(--color-primary) 10%,var(--color-background));color:var(--color-primary);font-size:12px}.status-dot{width:7px;height:7px;border-radius:50%;background:var(--color-primary)}.command-chip :global(.copy-btn){width:24px;height:24px;min-height:24px}.inline-error{font-size:12px;color:var(--color-destructive)}.mode-summary{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-height:150px;padding:22px;background:color-mix(in srgb,var(--color-primary) 6%,var(--color-background))}.primary-result{display:flex;align-items:baseline;justify-content:center;gap:24px}.primary-result strong{color:var(--color-primary);font-family:var(--font-mono);font-size:34px;font-weight:500}.symbolic-input{width:190px;padding:2px 6px;border:1px solid transparent;border-radius:var(--radius-sm,5px);outline:0;background:transparent;color:var(--color-foreground);font-family:var(--font-mono);font-size:24px;font-weight:650;letter-spacing:2px}.symbolic-input:hover,.symbolic-input:focus{border-color:var(--color-border);background:var(--color-background)}.symbolic-input[aria-invalid="true"]{border-color:var(--color-destructive)}.secondary-result{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-muted-foreground)}.secondary-result code{color:var(--color-foreground)}.secondary-result :global(.copy-btn){width:24px;height:24px;min-height:24px}.permission-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.permission-group{min-width:0;padding:10px 14px 14px}.permission-group legend{padding:0 4px;font-size:12px;font-weight:650}.permission-group legend code{margin-left:4px;color:var(--color-muted-foreground)}.permission-group>label{display:grid;grid-template-columns:auto 24px 1fr;align-items:center;gap:8px;margin-top:7px;padding:10px 12px;border:1px solid transparent;border-radius:var(--radius-md,7px);background:var(--color-muted);font-size:12px}.permission-group>label.enabled{border-color:color-mix(in srgb,var(--color-primary) 35%,transparent);background:color-mix(in srgb,var(--color-primary) 8%,var(--color-background));color:var(--color-primary)}.permission-group>label code{font-weight:700}.permission-group>label span{text-align:right}.presets-panel,.umask-panel{padding:0 14px 12px}.presets-panel h3,.umask-panel h3{margin:0;padding:10px 0 8px;font-size:12px}.preset-list{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:7px}.preset-list button{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:2px 8px;min-width:0;padding:9px 10px;border:1px solid var(--color-border);border-radius:var(--radius-md,7px);background:transparent;color:inherit;text-align:left}.preset-list button:hover,.preset-list button.active{border-color:var(--color-primary);background:color-mix(in srgb,var(--color-primary) 7%,var(--color-background))}.preset-list code{color:var(--color-primary);font-weight:700}.preset-list span{overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.preset-list small{grid-column:1/-1;color:var(--color-muted-foreground);font-size:10px}.umask-heading{display:flex;align-items:end;justify-content:space-between;gap:16px}.umask-heading p{margin:0 0 8px;color:var(--color-muted-foreground);font-size:11px}.umask-heading label{display:flex;align-items:center;gap:8px;font-size:12px}.umask-heading input{width:90px}.umask-results{display:grid;grid-template-columns:1fr 1fr;gap:8px}.umask-results>div{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:12px;padding:10px 12px;border-radius:var(--radius-md,7px);background:var(--color-muted)}.umask-results span{font-size:12px;color:var(--color-muted-foreground)}.umask-results strong{font-family:var(--font-mono);color:var(--color-primary)}.umask-results code{font-size:12px}@media(max-width:900px){.mode-toolbar{align-items:flex-start;flex-wrap:wrap}.special-toggles{order:3;flex-basis:100%}.permission-grid{grid-template-columns:1fr}.preset-list{grid-template-columns:repeat(3,1fr)}}@media(max-width:560px){.command-chip{margin-left:auto}.primary-result{gap:12px}.primary-result strong{font-size:28px}.symbolic-input{width:160px;font-size:18px}.preset-list{grid-template-columns:repeat(2,1fr)}.umask-heading{align-items:flex-start;flex-direction:column}.umask-results{grid-template-columns:1fr}}
</style>
