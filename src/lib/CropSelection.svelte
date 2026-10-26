<script>
  import { pick } from './i18n.js';
  import { constrainCrop } from './cropGeometry.js';
  let { src, width, height, x = $bindable(0), y = $bindable(0), cropWidth = $bindable(1), cropHeight = $bindable(1), locale, onchange, disabled = false } = $props();
  const t = (zh,en) => pick(locale,zh,en);
  let surface, drag;
  function apply(rect) {
    const next = constrainCrop(rect,width,height);
    x=next.x; y=next.y; cropWidth=next.width; cropHeight=next.height;
    onchange?.();
  }
  $effect(() => {
    const next = constrainCrop({x,y,width:cropWidth,height:cropHeight},width,height);
    x=next.x; y=next.y; cropWidth=next.width; cropHeight=next.height;
  });
  function start(event,resize=false) {
    if(disabled || event.button !== 0 || drag) return;
    event.preventDefault(); event.stopPropagation();
    event.currentTarget.focus({preventScroll:true});
    const bounds=surface.getBoundingClientRect();
    if(!bounds.width || !bounds.height) return;
    drag={pointerId:event.pointerId,px:event.clientX,py:event.clientY,x,y,width:cropWidth,height:cropHeight,sx:width/bounds.width,sy:height/bounds.height,resize};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if(disabled || !drag || event.pointerId !== drag.pointerId) return;
    const dx=(event.clientX-drag.px)*drag.sx,dy=(event.clientY-drag.py)*drag.sy;
    apply(drag.resize ? {...drag,width:Math.min(width-drag.x,drag.width+dx),height:Math.min(height-drag.y,drag.height+dy)} : {...drag,x:drag.x+dx,y:drag.y+dy});
  }
  function finish(event) {
    if(!drag || event.pointerId !== drag.pointerId) return;
    drag=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event) {
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!delta || disabled) return;
    event.preventDefault(); event.stopPropagation();
    const step=event.shiftKey?10:1;
    apply(event.altKey ? {x,y,width:Math.min(width-x,cropWidth+delta[0]*step),height:Math.min(height-y,cropHeight+delta[1]*step)} : {x:x+delta[0]*step,y:y+delta[1]*step,width:cropWidth,height:cropHeight});
  }
</script>
<p class="sr-only" id="crop-instructions">{t("拖动选框移动，拖动右下角调整大小。点击选框或用 Tab 聚焦后：方向键移动 1 像素，Alt + 方向键调整大小，按住 Shift 改为 10 像素。", "Drag the selection to move or its bottom-right handle to resize. Click the selection or focus it with Tab: arrows move 1 pixel, Alt + arrows resize, and Shift changes the step to 10 pixels.")}</p>
<div class="crop-surface" bind:this={surface} style:aspect-ratio={`${width}/${height}`} style:width={`min(100%,600px,${Math.max(1, Math.round(300 * width / height))}px)`}>
  <img {src} alt={t("GIF 首帧", "First GIF frame")} draggable="false" />
  <button class="selection" type="button" {disabled} aria-describedby="crop-instructions" aria-label={t("裁剪区域", "Crop selection")} style:left={`${x/width*100}%`} style:top={`${y/height*100}%`} style:width={`${cropWidth/width*100}%`} style:height={`${cropHeight/height*100}%`} onpointerdown={start} onpointermove={move} onpointerup={finish} onpointercancel={finish} onlostpointercapture={finish} onkeydown={key}></button>
  <button class="resize" type="button" {disabled} aria-describedby="crop-instructions" aria-label={t("缩放裁剪区域", "Resize crop selection")} style:left={`${(x+cropWidth)/width*100}%`} style:top={`${(y+cropHeight)/height*100}%`} onpointerdown={event=>start(event,true)} onpointermove={move} onpointerup={finish} onpointercancel={finish} onlostpointercapture={finish} onkeydown={key}></button>
</div>
<style>
  p{font-size:12px;color:var(--color-muted-foreground)}.crop-surface{position:relative;width:min(100%,600px);max-width:100%;isolation:isolate;overflow:hidden;background:var(--color-muted);flex:none}.crop-surface img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none;image-rendering:pixelated}.selection{position:absolute;border:2px solid var(--color-primary);background:transparent;box-shadow:0 0 0 100vmax #0006;cursor:move;touch-action:none;min-width:0;min-height:0;padding:0}.resize{position:absolute;transform:translate(-100%,-100%);width:16px;height:16px;min-width:0;min-height:0;border:2px solid var(--color-primary-foreground);background:var(--color-primary);cursor:nwse-resize;touch-action:none;padding:0}.selection:focus-visible{outline:none;border-style:dashed}.resize:focus-visible{outline:none;box-shadow:var(--dbx-focus-ring)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
</style>
