<script>
  import KeySourceBar from "./KeySourceBar.svelte";
  import Select from "./Select.svelte";
  import CopyButton from "./CopyButton.svelte";
  import { invoke } from "./host.js";
  import { localizeError, pick } from "./i18n.js";
  import { keyCtx } from "./keySource.js";
  let { locale = "zh-CN" } = $props();
  const t = (zh,en) => pick(locale,zh,en);
  let algorithm=$state("rsa-pss-sha256"), op=$state("sign"), input=$state(""), signature=$state(""), output=$state(""), error=$state("");
  let source=$state("once"), material=$state(""), keyId=$state("");
  const algorithms=[{value:"rsa-pss-sha256",label:"RSA-PSS · SHA-256"},{value:"rsa-pkcs1-sha256",label:"RSA PKCS#1 v1.5 · SHA-256"},{value:"sm2-sm3",label:"SM2 · SM3"}];
  async function run(){error="";output="";try{const ctx=keyCtx(source,keyId,material);if(!ctx)throw new Error(t("请提供密钥","Provide a key"));const result=await invoke("toolbox/crypto",{action:"signature",algorithm,op,text:input,signature,...ctx});output=op==="verify"?(result.valid?t("签名有效","Signature valid"):t("签名无效","Signature invalid")):result.text||"";if(op==="sign")signature=output}catch(e){error=localizeError(locale,e)}}
</script>
<div class="page">
  <div class="options"><label><span>{t("算法","Algorithm")}</span><Select bind:value={algorithm} options={algorithms}/></label><label><span>{t("操作","Operation")}</span><Select bind:value={op} options={[{value:"sign",label:t("签名","Sign")},{value:"verify",label:t("验签","Verify")}]}/></label></div>
  <KeySourceBar {locale} picker={algorithm.startsWith("sm2")?"sm2":"rsa-pem"} multiline={true} bind:source bind:material bind:keyId />
  <label><span>{t("消息","Message")}</span><textarea class="dbx-textarea" bind:value={input}></textarea></label>
  {#if op==="verify"}<label><span>{t("签名（Base64）","Signature (Base64)")}</span><textarea class="dbx-textarea mono" bind:value={signature}></textarea></label>{/if}
  <button class="dbx-btn dbx-btn--primary" onclick={run}>{t("执行","Run")}</button>
  {#if error}<p class="error">{error}</p>{/if}
  {#if output}<div class="result"><textarea class="dbx-textarea mono" readonly value={output}></textarea><CopyButton {locale} text={output}/></div>{/if}
</div>
<style>.page{display:flex;flex:1;min-height:0;flex-direction:column;gap:12px;overflow:auto}.options{display:flex;flex-wrap:wrap;gap:12px}.options label,label{display:flex;flex-direction:column;gap:6px;font-size:12px}.page>label textarea{min-height:120px}.result{display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:8px}.error{color:var(--color-destructive)}.mono{font-family:var(--font-mono)}</style>
