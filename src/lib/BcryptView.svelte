<script>
  import { onDestroy } from "svelte";
  import { pick, localizeError } from "./i18n.js";
  import { loadAssetModule } from "./assetModules.js";
  import CopyButton from "./CopyButton.svelte";
  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let mode = $state("generate"),
    password = $state(""),
    hash = $state(""),
    cost = $state(10);
  let visible = $state(false),
    busy = $state(false),
    error = $state("");
  let result = $state(null),
    executed = $state("");
  let disposed = false,
    revision = 0;
  const bytes = $derived(new TextEncoder().encode(password).length);
  const validCost = $derived(Number.isInteger(cost) && cost >= 4 && cost <= 12);
  const validHash = $derived(
    /^\$2[aby]\$(0[4-9]|1[0-2])\$[./A-Za-z0-9]{53}$/.test(hash),
  );
  const signature = $derived(
    JSON.stringify([mode, password, mode === "generate" ? cost : hash]),
  );
  const stale = $derived(result !== null && signature !== executed);
  const invalid = $derived(
    bytes > 72 || (mode === "generate" ? !validCost : !validHash),
  );
  async function run() {
    if (busy || invalid) return;
    const request = ++revision;
    const params = { mode, password, hash, cost, signature };
    busy = true;
    error = "";
    result = null;
    try {
      const lib = await loadAssetModule("security-tools");
      if (disposed || request !== revision) return;
      const value =
        params.mode === "generate"
          ? await lib.bcryptHash(params.password, params.cost)
          : await lib.bcryptVerify(params.password, params.hash);
      if (disposed || request !== revision) return;
      result = {
        mode: params.mode,
        value,
        cost:
          params.mode === "generate"
            ? params.cost
            : Number(params.hash.slice(4, 6)),
      };
      executed = params.signature;
    } catch (e) {
      if (!disposed && request === revision) error = localizeError(locale, e);
    } finally {
      if (!disposed && request === revision) busy = false;
    }
  }
  function runOnEnter(event) {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    run();
  }
  function switchMode(value) {
    mode = value;
    error = "";
    visible = false;
    result = null;
  }
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    revision++;
    busy = false;
    mode = "generate";
    password = "public-demo-password";
    hash = "";
    cost = 10;
    visible = false;
    result = null;
    error = "";
  });
  onDestroy(() => {
    disposed = true;
    revision++;
    password = "";
    hash = "";
    result = null;
  });
</script>

<div class="bcrypt-page">
  <div class="input-card">
    <div class="mode-switch" role="group" aria-label={t("模式", "Mode")}>
      <button
        type="button"
        class:active={mode === "generate"}
        aria-pressed={mode === "generate"}
        disabled={busy}
        onclick={() => switchMode("generate")}
        >{t("生成哈希", "Generate hash")}</button
      >
      <button
        type="button"
        class:active={mode === "verify"}
        aria-pressed={mode === "verify"}
        disabled={busy}
        onclick={() => switchMode("verify")}
        >{t("校验密码", "Verify password")}</button
      >
    </div>
    <div class="fields">
      <div class="field">
        <div class="label-row">
          <label for="bcrypt-password">{t("密码", "Password")}</label><span
            class:over-limit={bytes > 72}
            >{bytes} / 72 {t("字节", "bytes")}</span
          >
        </div>
        <div class="password-input">
          <input
            id="bcrypt-password"
            class="dbx-input"
            type={visible ? "text" : "password"}
            bind:value={password}
            onkeydown={runOnEnter}
            maxlength="256"
            autocomplete="new-password"
            spellcheck="false"
            placeholder={t("输入需要处理的密码", "Enter a password")}
            aria-invalid={bytes > 72}
            aria-describedby="bcrypt-password-hint"
          />
          <button
            class="visibility-toggle"
            type="button"
            aria-label={visible
              ? t("隐藏密码", "Hide password")
              : t("显示密码", "Show password")}
            aria-pressed={visible}
            title={visible
              ? t("隐藏密码", "Hide password")
              : t("显示密码", "Show password")}
            onclick={() => (visible = !visible)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
              <circle cx="12" cy="12" r="3" />
              {#if visible}<path d="m3 3 18 18" />{/if}
            </svg>
          </button>
        </div>
        <p class="hint" class:over-limit={bytes > 72} id="bcrypt-password-hint">
          {bytes > 72
            ? t(
                "密码超过 72 个 UTF-8 字节，请缩短后重试。",
                "Password exceeds 72 UTF-8 bytes. Shorten it and try again.",
              )
            : t(
                "最多 72 个 UTF-8 字节，中文等字符会占用多个字节。",
                "Up to 72 UTF-8 bytes. Some characters use more than one byte.",
              )}
        </p>
      </div>
      {#if mode === "generate"}
        <div class="cost-row">
          <div class="field cost-field">
            <label for="bcrypt-cost">{t("成本因子", "Cost factor")}</label
            ><input
              id="bcrypt-cost"
              class="dbx-input"
              type="number"
              min="4"
              max="12"
              step="1"
              bind:value={cost}
              onkeydown={runOnEnter}
              aria-invalid={!validCost}
              aria-describedby="bcrypt-cost-hint"
            />
          </div>
          <p class="hint" id="bcrypt-cost-hint">
            {t(
              "范围 4–12，默认 10。数值每增加 1，计算量约翻倍。",
              "Range 4–12, default 10. Each increment roughly doubles the work.",
            )}
          </p>
        </div>
      {:else}
        <div class="field">
          <div class="label-row">
            <label for="bcrypt-hash">{t("已有哈希", "Existing hash")}</label
            ><span>{hash.length} / 60</span>
          </div>
          <textarea
            id="bcrypt-hash"
            class="dbx-textarea hash-input"
            rows="3"
            bind:value={hash}
            onkeydown={runOnEnter}
            maxlength="256"
            spellcheck="false"
            placeholder="$2b$10$…"
            aria-invalid={!!hash && !validHash}
            aria-describedby="bcrypt-hash-hint"></textarea>
          <p class="hint" id="bcrypt-hash-hint">
            {hash && !validHash
              ? t(
                  "请输入 60 位 Bcrypt 哈希，成本因子需为 4–12。",
                  "Enter a 60-character Bcrypt hash with a cost factor of 4–12.",
                )
              : t(
                  "支持 $2a$、$2b$、$2y$，成本因子从哈希中读取。",
                  "Supports $2a$, $2b$ and $2y$. The cost factor is read from the hash.",
                )}
          </p>
        </div>
      {/if}
    </div>
    <div class="action-row">
      <span
        >{mode === "generate"
          ? t("自动生成随机盐值", "A random salt is generated automatically")
          : t(
              "密码与哈希匹配校验",
              "Check whether the password matches the hash",
            )}</span
      ><button
        class="dbx-btn dbx-btn--primary"
        type="button"
        onclick={run}
        disabled={busy || invalid}
        >{busy
          ? t("处理中…", "Working…")
          : mode === "generate"
            ? t("生成哈希", "Generate hash")
            : t("校验密码", "Verify password")}<span aria-hidden="true">→</span
        ></button
      >
    </div>
  </div>
  {#if error}<p class="error-message" role="alert">{error}</p>{/if}
  <section
    class="output-card"
    aria-label={t("结果", "Result")}
    aria-busy={busy}
  >
    <div class="output-heading">
      <h3>
        {mode === "verify"
          ? t("校验结果", "Verification result")
          : t("哈希结果", "Hash result")}
      </h3>
      {#if result && !stale}<span class="result-meta"
          >Bcrypt · {t("成本因子", "Cost factor")} {result.cost}</span
        >{/if}{#if result?.mode === "generate"}<CopyButton
          {locale}
          text={result.value}
          disabled={stale || busy}
        />{/if}
    </div>
    <div aria-live="polite">
      {#if busy}<div class="empty-result">
          {t("正在计算，请稍候…", "Computing, please wait…")}
        </div>
      {:else if result}
        {#if stale}<p class="stale-message" role="status">
            {t(
              "结果已过期，请重新执行后复制。",
              "Result is outdated. Run again before copying.",
            )}
          </p>{/if}
        {#if result.mode === "generate"}<textarea
            class="dbx-textarea hash-result"
            class:outdated={stale}
            readonly
            value={result.value}
            rows="2"
            aria-label={t("哈希结果", "Hash result")}
            spellcheck="false"></textarea>
          <p class="result-note">
            {t(
              "每次生成使用不同盐值，相同密码的哈希也会不同。",
              "Each hash uses a different salt, so the same password produces different hashes.",
            )}
          </p>
        {:else}<div
            class="verify-result"
            class:failed={!result.value}
            class:outdated={stale}
          >
            <span class="verify-icon" aria-hidden="true"
              >{result.value ? "✓" : "×"}</span
            >
            <div>
              <strong
                >{result.value
                  ? t("密码匹配", "Password matches")
                  : t("密码不匹配", "Password does not match")}</strong
              >
              <p>
                {result.value
                  ? t(
                      "该密码与提供的哈希一致。",
                      "The password matches the supplied hash.",
                    )
                  : t(
                      "该密码与提供的哈希不一致。",
                      "The password does not match the supplied hash.",
                    )}
              </p>
            </div>
          </div>{/if}
      {:else}<div class="empty-result">
          <span class="empty-symbol" aria-hidden="true">#</span>
          <p>
            {mode === "generate"
              ? t(
                  "生成的哈希将显示在这里",
                  "Your generated hash will appear here",
                )
              : t(
                  "校验结果将显示在这里",
                  "Your verification result will appear here",
                )}
          </p>
        </div>{/if}
    </div>
  </section>
</div>

<style>
  .bcrypt-page {
    width: 100%;
    max-width: 880px;
    margin: 0 auto;
    padding: 20px 24px 32px;
    display: flex;
    flex-direction: column;
    gap: var(--ui-gap, 12px);
    color: var(--color-foreground);
    box-sizing: border-box;
  }
  h3,
  p {
    margin: 0;
  }
  .input-card {
    padding: 16px;
  }
  .input-card,
  .output-card {
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-card);
  }
  .mode-switch {
    display: inline-flex;
    height: 30px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    width: fit-content;
    margin-bottom: 18px;
  }
  .mode-switch button {
    height: 100%;
    padding: 0 12px;
    border: 0;
    border-right: 1px solid var(--color-border);
    border-radius: 0;
    background: var(--dbx-control-background);
    color: var(--dbx-control-foreground);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .mode-switch button:last-child {
    border-right: 0;
  }
  .mode-switch button:hover:not(:disabled):not(.active) {
    background: var(--dbx-hover-background);
    color: var(--dbx-hover-foreground);
  }
  .mode-switch button.active {
    background: var(--dbx-selection-background);
    border-color: var(--dbx-selection-border);
    color: var(--dbx-selection-foreground);
    font-weight: 600;
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--ui-field-gap, 6px);
    min-width: 0;
  }
  label {
    font-size: 13px;
    font-weight: 600;
  }
  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .label-row span {
    font: 11px var(--font-mono);
    color: var(--color-muted-foreground);
  }
  .password-input {
    position: relative;
  }
  .password-input input {
    width: 100%;
    height: 30px;
    padding-right: 36px;
    box-sizing: border-box;
  }
  .visibility-toggle {
    display: grid;
    place-items: center;
    position: absolute;
    right: 4px;
    top: 3px;
    height: 24px;
    width: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-muted-foreground);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .visibility-toggle:hover {
    background: var(--color-muted);
  }
  .hint {
    font-size: 11px;
    color: var(--color-muted-foreground);
    line-height: 1.65;
  }
  .cost-row {
    display: flex;
    align-items: flex-end;
    gap: 18px;
  }
  .cost-field {
    width: 132px;
    flex-shrink: 0;
  }
  .cost-field input {
    height: 30px;
    width: 100%;
    box-sizing: border-box;
  }
  .cost-row > .hint {
    padding-bottom: 2px;
    max-width: 380px;
  }
  .hash-input {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    font: 13px/1.7 var(--font-mono);
    padding: 12px;
  }
  .action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--color-border);
    padding-top: 14px;
    margin-top: 18px;
  }
  .action-row > span {
    font-size: 11px;
    color: var(--color-muted-foreground);
  }
  .action-row button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 100px;
    font-weight: 500;
  }
  .action-row button:disabled,
  .mode-switch button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .output-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--color-muted);
  }
  h3 {
    font-size: 13px;
    font-weight: 600;
    margin-right: auto;
  }
  .result-meta {
    font-size: 11px;
    color: var(--color-muted-foreground);
  }
  .hash-result {
    display: block;
    width: calc(100% - 32px);
    box-sizing: border-box;
    margin: 16px 16px 0;
    padding: 10px;
    min-height: 78px;
    resize: vertical;
    word-break: break-all;
    font: 13px/1.8 var(--font-mono);
    background: var(--dbx-control-background);
  }
  .result-note {
    padding: 8px 16px 16px;
    font-size: 11px;
    line-height: 1.7;
    color: var(--color-muted-foreground);
  }
  .empty-result {
    min-height: 144px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 12px;
    color: var(--color-muted-foreground);
    padding: 16px;
    box-sizing: border-box;
  }
  .empty-symbol {
    font: 26px var(--font-mono);
    opacity: 0.35;
  }
  .verify-result {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px;
    padding: 16px;
    border-radius: var(--radius-md);
    background: var(--color-success-bg);
    color: var(--color-foreground);
  }
  .verify-icon {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    font-size: 18px;
    background: var(--color-success-bg);
    color: var(--color-success);
  }
  .verify-result strong {
    font-size: 14px;
  }
  .verify-result p {
    font-size: 12px;
    color: var(--color-muted-foreground);
    margin-top: 4px;
  }
  .verify-result.failed {
    background: color-mix(
      in srgb,
      var(--color-destructive) 6%,
      var(--color-card)
    );
  }
  .failed .verify-icon {
    color: var(--color-destructive);
    background: color-mix(
      in srgb,
      var(--color-destructive) 12%,
      var(--color-card)
    );
  }
  .stale-message {
    margin: 14px 18px 0;
    font-size: 12px;
    color: var(--color-muted-foreground);
  }
  .outdated {
    opacity: 0.5;
  }
  .error-message {
    padding: 12px 16px;
    border: 1px solid
      color-mix(in srgb, var(--color-destructive) 30%, var(--color-border));
    border-radius: var(--radius-md);
    color: var(--color-destructive);
    font-size: 12px;
  }
  .label-row .over-limit,
  .over-limit {
    color: var(--color-destructive);
  }
  button:focus-visible {
    outline: none;
    box-shadow: var(--dbx-focus-ring);
  }
  @media (max-width: 560px) {
    .bcrypt-page {
      padding: 18px 12px 28px;
      gap: 16px;
    }
    .input-card {
      padding: 16px;
    }
    .mode-switch {
      width: 100%;
      box-sizing: border-box;
    }
    .mode-switch button {
      flex: 1;
      padding: 0 12px;
    }
    .cost-row {
      align-items: stretch;
      flex-direction: column;
      gap: 8px;
    }
    .cost-field {
      width: 100%;
    }
    .action-row {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }
    .action-row button {
      width: 100%;
    }
    .result-meta {
      font-size: 10px;
    }
  }
</style>
