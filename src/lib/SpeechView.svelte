<script>
  import { onMount, onDestroy } from "svelte";
  import { pick } from "./i18n.js";
  let { locale = "zh-CN" } = $props();
  const t = (zh, en) => pick(locale, zh, en);
  let input = $state(""),
    voices = $state([]),
    voiceId = $state(""),
    rate = $state(1),
    pitch = $state(1),
    error = $state("");
  let synth;
  function refresh() {
    voices = (synth?.getVoices() || []).filter((v) => v.localService);
    if (!voices.some((v) => v.voiceURI === voiceId))
      voiceId = voices[0]?.voiceURI || "";
  }
  onMount(() => {
    synth = window.speechSynthesis;
    refresh();
    synth?.addEventListener("voiceschanged", refresh);
    return () => synth?.removeEventListener("voiceschanged", refresh);
  });
  onDestroy(() => synth?.cancel());
  function speak() {
    error = "";
    synth?.cancel();
    const voice = voices.find((v) => v.voiceURI === voiceId);
    if (!voice || !input.trim()) return;
    const utterance = new SpeechSynthesisUtterance(input);
    utterance.voice = voice;
    utterance.rate = Number(rate);
    utterance.pitch = Number(pitch);
    utterance.onerror = () => (error = t("朗读失败", "Read aloud failed"));
    synth.speak(utterance);
  }
</script>

<div class="expansion-page">
  <label
    >{t("文本", "Text")}<textarea
      class="dbx-textarea"
      bind:value={input}
      maxlength="10000"
      rows="10"></textarea></label
  >{#if !voices.length}<p role="status">
      {t("没有可用的本地语音", "No local voices are available")}<br/>{t("请在系统语言与语音设置中安装本地语音包，然后重试。", "Install a local voice pack in your system language and speech settings, then retry.")}<button class="dbx-btn" type="button" onclick={refresh}>{t("重试", "Retry")}</button>
    </p>{:else}<select class="dbx-input" bind:value={voiceId}
      >{#each voices as voice}<option value={voice.voiceURI}
          >{voice.name} ({voice.lang})</option
        >{/each}</select
    >{/if}<label
    >{t("语速", "Rate")}<input
      type="range"
      min="0.5"
      max="2"
      step="0.1"
      bind:value={rate}
      style:--dbx-range-progress={`${((rate - 0.5) / 1.5) * 100}%`}
    /></label
  ><label
    >{t("音高", "Pitch")}<input
      type="range"
      min="0"
      max="2"
      step="0.1"
      bind:value={pitch}
      style:--dbx-range-progress={`${(pitch / 2) * 100}%`}
    /></label
  >
  <div class="expansion-actions">
    <button class="dbx-btn" onclick={speak} disabled={!voices.length || !input.trim()}
      >{t("朗读", "Read aloud")}</button
    ><button class="dbx-btn" onclick={() => synth?.pause()}
      >{t("暂停", "Pause")}</button
    ><button class="dbx-btn" onclick={() => synth?.resume()}
      >{t("继续", "Resume")}</button
    ><button class="dbx-btn" onclick={() => synth?.cancel()}
      >{t("停止", "Stop")}</button
    >
  </div>
  {#if error}<p role="alert">{error}</p>{/if}
</div>
