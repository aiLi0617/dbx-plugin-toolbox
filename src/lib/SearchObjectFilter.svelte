<script>
  import { pick } from './i18n.js';
  let { locale = 'zh-CN', value = 'all', onChange } = $props();
</script>
<div class="objects" role="group" aria-label={pick(locale, '处理对象', 'Input type')}>
  <button class="dbx-btn" class:active={value === 'all'} aria-pressed={value === 'all'} type="button" onclick={() => onChange('all')}>{pick(locale, '全部', 'All')}</button>
  <button class="dbx-btn" class:active={value === 'text'} aria-pressed={value === 'text'} type="button" onclick={() => onChange('text')}>{pick(locale, '文本与数据', 'Text and data')}</button>
  <button class="dbx-btn" class:active={value === 'image'} aria-pressed={value === 'image'} type="button" onclick={() => onChange('image')}>{pick(locale, '图像', 'Images')}</button>
  <button class="dbx-btn" class:active={value === 'document'} aria-pressed={value === 'document'} type="button" onclick={() => onChange('document')}>{pick(locale, '文档', 'Documents')}</button>
</div>
<style>.objects{display:flex;flex-wrap:wrap;gap:5px;padding:6px 0}.objects button{font-size:11px;padding:4px 8px}.active{background:var(--color-accent);border-color:var(--color-primary)}</style>
