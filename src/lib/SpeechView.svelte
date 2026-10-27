<script>
  import { onMount, onDestroy } from "svelte";
  import { pick } from "./i18n.js";
  import Select from "./Select.svelte";

  let { locale = "zh-CN", demoRequest = 0 } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  const demoText = t("你好，欢迎使用文字朗读。\n\n这是一段示例文本，你可以调整语速、音高和音量，然后点击开始朗读。", "Hello, and welcome to text to speech.\n\nThis sample lets you adjust the rate, pitch, and volume before starting playback.");
  let input = $state(""), voices = $state([]), voiceId = $state("");
  let rate = $state(1), pitch = $state(1), volume = $state(1);
  let status = $state("idle"), error = $state(""), supported = $state(true);
  let position = $state(0), spokenLength = $state(0);
  let synth, utterance;
  const active = $derived(status === "speaking" || status === "paused");
  const progress = $derived(spokenLength ? Math.min(100, Math.round(position / spokenLength * 100)) : 0);
  const statusText = $derived(status === "speaking" ? t("正在朗读", "Reading aloud") : status === "paused" ? t("已暂停", "Paused") : status === "done" ? t("朗读完成", "Finished reading") : t("准备就绪", "Ready"));
  let appliedDemoRequest = 0;
  $effect(() => {
    if (!demoRequest || demoRequest === appliedDemoRequest) return;
    appliedDemoRequest = demoRequest;
    example();
  });

  function refresh() {
    voices = (synth?.getVoices() || []).filter((v) => v.localService);
    if (!voices.some((v) => v.voiceURI === voiceId)) {
      const language = locale.toLowerCase();
      voiceId = (voices.find((v) => v.lang.toLowerCase() === language)
        || voices.find((v) => v.lang.toLowerCase().split("-")[0] === language.split("-")[0])
        || voices.find((v) => v.default) || voices[0])?.voiceURI || "";
    }
  }
  onMount(() => {
    synth = window.speechSynthesis;
    supported = Boolean(synth && window.SpeechSynthesisUtterance);
    refresh();
    synth?.addEventListener("voiceschanged", refresh);
    return () => synth?.removeEventListener("voiceschanged", refresh);
  });
  function stop() {
    // Ignore late completion/error callbacks from a cancelled utterance.
    utterance = null;
    synth?.cancel();
    status = "idle";
    position = 0;
    spokenLength = 0;
  }
  onDestroy(stop);
  function speak() {
    const voice = voices.find((v) => v.voiceURI === voiceId);
    if (!supported || !voice || !input.trim() || active) return;
    stop();
    error = "";
    const current = new window.SpeechSynthesisUtterance(input.trim());
    utterance = current;
    current.voice = voice;
    current.lang = voice.lang;
    current.rate = Number(rate);
    current.pitch = Number(pitch);
    current.volume = Number(volume);
    spokenLength = current.text.length;
    status = "speaking";
    current.onboundary = (event) => {
      if (utterance === current) position = event.charIndex;
    };
    current.onend = () => {
      if (utterance !== current) return;
      position = spokenLength;
      status = "done";
      utterance = null;
    };
    current.onerror = () => {
      if (utterance !== current) return;
      utterance = null;
      status = "idle";
      error = t("朗读失败，请检查系统语音设置后重试。", "Reading failed. Check your system speech settings and retry.");
    };
    try { synth.speak(current); }
    catch { current.onerror(); }
  }
  function togglePause() {
    if (!active) return;
    if (status === "paused") { synth.resume(); status = "speaking"; }
    else { synth.pause(); status = "paused"; }
  }
  function example() {
    input = t("给文字一个声音。\n\n在这里输入想听的内容，选择喜欢的语音，调整语速与音高，让阅读变得更轻松。", "Give your words a voice.\n\nEnter something to listen to, choose a voice, and adjust the speed and pitch to make reading easier.");
    error = "";
    status = "idle";
  }
</script>

<div class="speech-page">
  <div class="intro">
    <div><p>{t("输入文本，使用系统本地语音朗读。", "Enter text and listen with a local system voice.")}</p></div>
    <span class="local-badge"><span aria-hidden="true">◉</span> {t("本地语音", "Local voices")}</span>
  </div>
  <div class="workspace">
    <section class="editor-panel" aria-labelledby="speech-text-title">
      <header class="panel-header"><h3 id="speech-text-title">{t("朗读文本", "Text to read")}</h3><div class="text-actions"><button class="dbx-btn dbx-btn--ghost icon-btn" aria-label={t("清空文本", "Clear text")} title={t("清空文本", "Clear text")} disabled={active || !input} onclick={() => { input = ""; stop(); error = ""; }}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13M9 7V4h6v3"/></svg></button></div></header>
      <textarea class="dbx-textarea editor" bind:value={input} readonly={active} maxlength="10000" aria-labelledby="speech-text-title" placeholder={t("在这里输入或粘贴需要朗读的文字…", "Type or paste the text you want to hear…")} spellcheck="false"></textarea>
      <footer class="editor-footer"><span>{active ? t("停止后可编辑文本", "Stop playback to edit text") : t("最多 10,000 字符", "Up to 10,000 characters")}</span><span>{input.length.toLocaleString()} / 10,000</span></footer>
    </section>
    <section class="settings-panel" aria-labelledby="speech-settings-title">
      <header class="panel-header"><h3 id="speech-settings-title">{t("语音设置", "Voice settings")}</h3><button class="dbx-btn dbx-btn--ghost" disabled={active || (rate === 1 && pitch === 1 && volume === 1)} onclick={() => { rate = 1; pitch = 1; volume = 1; }}>{t("重置", "Reset")}</button></header>
      <div class="settings-body">
        <div class="voice-field"><span class="field-label" id="speech-voice-label">{t("语音", "Voice")}</span><Select bind:value={voiceId} fitTrigger disabled={active || !voices.length} ariaLabel={t("语音", "Voice")} placeholder={t("没有可用的本地语音", "No local voices are available")} options={voices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} (${voice.lang})` }))} /></div>
        {#if !supported}<p class="notice" role="status">{t("当前环境不支持语音朗读。", "Speech synthesis is not supported in this environment.")}</p>
        {:else if !voices.length}<div class="notice" role="status"><p>{t("请在系统语言与语音设置中安装本地语音包，然后重试。", "Install a local voice pack in your system language and speech settings, then retry.")}</p><button class="dbx-btn" onclick={refresh}>{t("重试", "Retry")}</button></div>{/if}
        <div class="slider-field"><label for="speech-rate">{t("语速", "Rate")}<output>{Number(rate).toFixed(1)}×</output></label><input id="speech-rate" type="range" min="0.5" max="2" step="0.1" bind:value={rate} disabled={active} style:--dbx-range-progress={`${((rate - 0.5) / 1.5) * 100}%`} /><div class="range-ends"><span>{t("慢", "Slow")}</span><span>{t("快", "Fast")}</span></div></div>
        <div class="slider-field"><label for="speech-pitch">{t("音高", "Pitch")}<output>{Number(pitch).toFixed(1)}</output></label><input id="speech-pitch" type="range" min="0" max="2" step="0.1" bind:value={pitch} disabled={active} style:--dbx-range-progress={`${pitch / 2 * 100}%`} /><div class="range-ends"><span>{t("低", "Low")}</span><span>{t("高", "High")}</span></div></div>
        <div class="slider-field"><label for="speech-volume">{t("音量", "Volume")}<output>{Math.round(volume * 100)}%</output></label><input id="speech-volume" type="range" min="0" max="1" step="0.1" bind:value={volume} disabled={active} style:--dbx-range-progress={`${volume * 100}%`} /></div>
        <p class="settings-hint">{t("语音与参数在下次开始朗读时生效。", "Voice and settings apply when you start reading.")}</p>
      </div>
    </section>
  </div>
  <section class="player" aria-label={t("播放控制", "Playback controls")}>
    <div class="playback-status"><span class="status-dot" class:playing={status === "speaking"}></span><span role="status">{statusText}</span></div>
    <div class="playback-actions"><button class="dbx-btn dbx-btn--primary play-button" onclick={speak} disabled={!supported || !voices.length || !input.trim() || active}><span aria-hidden="true">▶</span>{status === "done" ? t("重新朗读", "Read again") : t("开始朗读", "Start reading")}</button><button class="dbx-btn" onclick={togglePause} disabled={!active}>{status === "paused" ? t("继续", "Resume") : t("暂停", "Pause")}</button><button class="dbx-btn" onclick={stop} disabled={!active}>{t("停止", "Stop")}</button></div>
    {#if active || status === "done"}<div class="progress-row"><progress max="100" value={progress} aria-label={t("朗读进度", "Reading progress")}></progress><span>{progress}%</span></div>{/if}
  </section>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .speech-page { width: 100%; max-width: 1160px; min-width: 0; margin: 0 auto; padding: 28px; box-sizing: border-box; }
  .intro { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }

  .intro p { margin: 0; color: var(--color-muted-foreground); font-size: 13px; line-height: 1.6; }
  .local-badge { display: inline-flex; gap: 6px; align-items: center; flex-shrink: 0; border: 1px solid var(--color-border); border-radius: 20px; padding: 6px 10px; font-size: 11px; color: var(--color-muted-foreground); }
  .local-badge > span { color: var(--color-primary); }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 300px); gap: 18px; min-width: 0; }
  .editor-panel, .settings-panel { min-width: 0; border: 1px solid var(--color-border); border-radius:var(--radius-lg); overflow: hidden; background: var(--color-background); }
  .editor-panel { display: flex; flex-direction: column; }
  .panel-header { min-height: 57px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 18px; border-bottom: 1px solid var(--color-border); }
  h3 { margin: 0; font-size: 13px; font-weight: 600; }
  .text-actions { display: flex; gap: 4px; }
  .panel-header .dbx-btn { font-size: 12px; padding: 4px 8px; min-height: 28px; }
  .editor { flex: 1; width: 100%; min-height: 320px; resize: vertical; border: 0; border-radius: 0; padding: 20px; font-size: 14px; line-height: 1.9; background: transparent; box-sizing: border-box; }
  .editor:focus-visible { outline: 1px solid var(--color-primary); outline-offset: -1px; box-shadow: none; }
  .editor::placeholder { color: var(--color-muted-foreground); }
  .editor-footer { display: flex; justify-content: space-between; gap: 12px; padding: 12px 18px; font-size: 11px; color: var(--color-muted-foreground); border-top: 1px solid var(--color-border); }
  .settings-body { min-width: 0; padding: 20px 18px; display: grid; gap: 24px; }
  .field-label { display: block; margin-bottom: 9px; font-size: 12px; font-weight: 500; }
  .voice-field, .slider-field, .settings-hint { min-width: 0; }
  .voice-field :global(.dbx-custom-select) { width: 100%; max-width: 100%; min-width: 0; }
  .voice-field :global(.dbx-custom-select .trigger) { min-width: 0; }
  .voice-field :global(.dbx-custom-select .value) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .slider-field label { display: flex; justify-content: space-between; align-items: center; font-size: 12px; margin-bottom: 10px; }
  output { color: var(--color-primary); font-variant-numeric: tabular-nums; font-size: 12px; font-weight: 600; background: var(--color-muted); border-radius:var(--radius-md); padding: 3px 7px; }
  .slider-field input { display: block; width: 100%; margin: 0; }
  .range-ends { display: flex; justify-content: space-between; margin-top: 8px; font-size: 10px; color: var(--color-muted-foreground); }
  .settings-hint { margin: 0; font-size: 11px; color: var(--color-muted-foreground); line-height: 1.6; }
  .notice { font-size: 12px; line-height: 1.7; padding: 12px; margin: 0; background: var(--color-muted); border-radius:var(--radius-lg); }
  .notice p { margin: 0 0 10px; }
  .player { min-width: 0; margin-top: 18px; padding: 18px 20px; border: 1px solid var(--color-border); border-radius:var(--radius-lg); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; background: var(--color-background); box-sizing: border-box; }
  .playback-status { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--color-muted-foreground); }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-muted-foreground); }
  .status-dot.playing { background: var(--color-primary); }
  .playback-actions { display: flex; gap: 8px; min-width: 0; }
  .play-button { display: inline-flex; align-items: center; gap: 8px; min-width: 116px; justify-content: center; }
  .progress-row { flex-basis: 100%; display: flex; align-items: center; gap: 12px; font-size: 11px; color: var(--color-muted-foreground); font-variant-numeric: tabular-nums; }
  progress { flex: 1 1 auto; min-width: 0; width: 100%; height: 5px; border: 0; border-radius:var(--radius-md); overflow: hidden; background: var(--color-muted); accent-color: var(--color-primary); }
  progress::-webkit-progress-bar { background: var(--color-muted); }
  progress::-webkit-progress-value { background: var(--color-primary); border-radius:var(--radius-md); }
  progress::-moz-progress-bar { background: var(--color-primary); }
  .error { color: var(--color-destructive); font-size: 12px; line-height: 1.7; }
  @media (max-width: 800px) { .speech-page { padding: 20px; } .workspace { grid-template-columns: minmax(0, 1fr); } .settings-body { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; } .voice-field, .notice, .settings-hint { grid-column: 1 / -1; } .editor { min-height: 250px; } }
  @media (max-width: 480px) { .speech-page { padding: 14px; }  .local-badge { display: none; } .settings-body { grid-template-columns: 1fr; } .player { padding: 16px; } .playback-status, .playback-actions { width: 100%; } .playback-actions .dbx-btn { flex: 1 1 0; min-width: 0; } .progress-row { gap: 8px; } .editor-footer { font-size: 10px; } }
.speech-page{padding:0}.intro{margin-bottom:12px}.workspace{gap:12px}.local-badge{padding:3px 7px}.editor{min-height:180px}
</style>
