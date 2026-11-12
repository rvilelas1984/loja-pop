/* Antes & Depois: isolated canvas model; existing export/text/sticker tools are reused. */
(function () {
  'use strict';
  const randomLayouts = [
    [[4,5],[57,14],[29,46]], [[56,3],[5,26],[56,49]],
    [[8,8],[53,34],[5,57]], [[31,2],[3,37],[58,51]],
    [[59,6],[5,17],[34,52]], [[4,50],[56,7],[30,27]]
  ];
  function frames(model, arrangement = 0) {
    if (model === 2 || model === 3) {
      const positions = model === 2 ? [[2,3],[31,16],[60,29]] : randomLayouts[arrangement % randomLayouts.length];
      return positions.map(([x,y]) => ({x:x*10.8,y:y*19.2,w:410.4,h:729.6}));
    }
    const count = model === 4 ? 4 : model === 0 ? 2 : 3;
    const columns = count === 4 ? 2 : count, gap = 18;
    const w = (1000-gap*(columns-1))/columns, h = w*16/9;
    const rows = count === 4 ? 2 : 1, top = (1840-(h*rows+gap*(rows-1)))/2;
    return Array.from({length:count}, (_,i) => ({x:40+(i%columns)*(w+gap),y:top+Math.floor(i/columns)*(h+gap),w,h}));
  }
  function contain(image, frame) {
    const scale = Math.min(frame.w/image.width, frame.h/image.height);
    const w=image.width*scale, h=image.height*scale;
    return {x:frame.x+(frame.w-w)/2,y:frame.y+(frame.h-h)/2,w,h};
  }
  function hit(block, x, y) {
    const dx=x-block.x, dy=y-block.y, a=block.angle;
    return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=180*block.scale && Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=(block.date?105:80)*block.scale;
  }
  const api = {frames, contain, hit};
  if (typeof module !== 'undefined' && module.exports) { module.exports=api; return; }
  const colors=[['#fffffff2','#231a2c'],['#ad5ae4','#fff'],['#ed5ca4','#fff'],['#24202bf2','#fff']];
  let arrangement=0, selected=-1, dragging=null;
  const blocks=[makeBlock('Antes',280,1325),makeBlock('Depois',800,1325)];
  function makeBlock(stage,x=540,y=960) {return {stage,weight:'',date:'',color:0,scale:1,angle:0,x,y};}
  const panel=document.createElement('div');panel.id='beforeAfterTools';panel.hidden=true;
  panel.innerHTML='<strong>Antes & Depois</strong><p class="note">Escolha as fotos na ordem da evolução. Elas aparecem inteiras, sem cortes. Toque em um bloco para editar ou arraste para posicionar.</p><div class="row"><button type="button" data-add="Antes">＋ Antes</button><button type="button" data-add="Durante">＋ Durante</button><button type="button" data-add="Depois">＋ Depois</button><button type="button" id="baShuffle">🔀 Embaralhar</button></div>';
  document.getElementById('popStoryToolbar').after(panel);
  const controls=document.createElement('div');controls.id='beforeAfterControls';controls.hidden=true;
  controls.innerHTML='<div class="two"><label>Etapa<input id="baStage" type="text" maxlength="32"></label><label>Peso (kg)<input id="baWeight" type="number" min="1" max="500" step="0.1" placeholder="Opcional"></label></div><label>Data opcional<input id="baDate" type="date"></label><div class="row" id="baColors"></div><div class="row"><button type="button" data-action="smaller" aria-label="Diminuir bloco">−</button><button type="button" data-action="rotate" aria-label="Girar bloco">↻</button><button type="button" data-action="bigger" aria-label="Aumentar bloco">＋</button><button type="button" data-action="horizontal">Centralizar ↔</button><button type="button" data-action="vertical">Centralizar ↕</button><button type="button" data-action="duplicate">Duplicar</button><button type="button" data-action="delete">Excluir</button><button type="button" data-action="done">OK</button></div>';
  document.body.append(controls);
  const style=document.createElement('style');style.textContent='#beforeAfterTools[hidden],#beforeAfterControls[hidden]{display:none!important}#beforeAfterTools{width:100%;padding:12px;border:1px solid #805586;border-radius:14px;background:#302039}#beforeAfterTools button,#beforeAfterControls button{padding:9px;font-size:12px}#beforeAfterControls{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:9998;width:min(420px,calc(100vw - 24px));max-height:65vh;overflow:auto;padding:12px;background:#251a32;border:1px solid #9c5a96;border-radius:14px;box-shadow:0 8px 25px #0009}#beforeAfterControls label{margin:4px 0 8px}#beforeAfterControls input{padding:7px;width:100%;background:#15101e;color:white;border:1px solid #775a87;border-radius:8px}#baColors{margin:8px 0}body.before-after-active #photoZoomSide,body.before-after-active #photoFraming{display:none!important}';document.head.append(style);
  const el=id=>document.getElementById(id);
  ['popTextOpen','stickersOpen'].forEach(id=>el(id)?.addEventListener('click',()=>{selected=-1;dragging=null;syncControls()}));
  function syncControls() {
    controls.hidden=layout!=='beforeAfter'||selected<0;
    if(controls.hidden)return;
    const b=blocks[selected];el('baStage').value=b.stage;el('baWeight').value=b.weight;el('baDate').value=b.date;
    [...el('baColors').children].forEach((button,i)=>button.setAttribute('aria-pressed',String(i===b.color)));
  }
  colors.forEach(([background,ink],i)=>{const button=document.createElement('button');button.type='button';button.textContent=['Branco','Roxo','Rosa','Escuro'][i];button.style.background=background;button.style.color=ink;button.onclick=()=>{if(selected<0)return;blocks[selected].color=i;syncControls();draw()};el('baColors').append(button)});
  [['baStage','stage'],['baWeight','weight'],['baDate','date']].forEach(([id,key])=>el(id).addEventListener('input',()=>{if(selected<0)return;blocks[selected][key]=el(id).value;draw()}));
  panel.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{blocks.push(makeBlock(button.dataset.add));selected=blocks.length-1;syncControls();draw()});
  el('baShuffle').onclick=()=>{arrangement=(arrangement+1)%randomLayouts.length;draw()};
  controls.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{
    const b=blocks[selected];if(!b)return;
    switch(button.dataset.action){
      case 'smaller':b.scale=Math.max(.55,b.scale-.1);break;
      case 'bigger':b.scale=Math.min(1.9,b.scale+.1);break;
      case 'rotate':b.angle=(b.angle+Math.PI/12)%(Math.PI*2);break;
      case 'horizontal':b.x=W/2;break;
      case 'vertical':b.y=H/2;break;
      case 'duplicate':blocks.push({...b,x:Math.min(900,b.x+55),y:Math.min(1750,b.y+55)});selected=blocks.length-1;break;
      case 'delete':blocks.splice(selected,1);selected=-1;break;
      case 'done':selected=-1;break;
    }syncControls();draw();
  });
  function point(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointerdown',e=>{
    if(layout!=='beforeAfter'||!el('popTextModal').hidden)return;
    const p=point(e);selected=blocks.findLastIndex(b=>hit(b,p.x,p.y));syncControls();
    if(selected<0)return;
    dragging={id:e.pointerId,dx:p.x-blocks[selected].x,dy:p.y-blocks[selected].y};canvas.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!dragging||dragging.id!==e.pointerId||selected<0)return;
    const p=point(e),b=blocks[selected],g=window.popCenterGuides?.snap(p.x-dragging.dx,p.y-dragging.dy);
    b.x=Math.max(80,Math.min(W-80,g?.x??p.x-dragging.dx));b.y=Math.max(80,Math.min(H-80,g?.y??p.y-dragging.dy));
    window.popCenterGuides?.show(canvas.getBoundingClientRect(),g?.sx,g?.sy);draw();e.preventDefault();e.stopImmediatePropagation();
  },true);
  ['pointerup','pointercancel'].forEach(name=>canvas.addEventListener(name,e=>{if(dragging?.id===e.pointerId){dragging=null;window.popCenterGuides?.hide();e.stopImmediatePropagation()}},true));
  window.popBeforeAfter={...api,sync(){
    const active=layout==='beforeAfter';panel.hidden=!active;document.body.classList.toggle('before-after-active',active);
    el('baShuffle').hidden=modelIndex!==3;if(!active){selected=-1;dragging=null;}syncControls();
  },paint(){
    photoRects.length=0;ctx.clearRect(0,0,W,H);
    fill(0,0,W,H,gradient(el('unit').value==='gym'?'#74184d':'#310d45','#140b2c'));
    frames(modelIndex,arrangement).forEach((frame,i)=>{
      fill(frame.x,frame.y,frame.w,frame.h,'#ffffff16',12);
      const image=photos[i];
      if(image){const r=contain(image,frame);ctx.drawImage(image,r.x,r.y,r.w,r.h)}
      else txt('FOTO '+(i+1),frame.x+frame.w/2,frame.y+frame.h/2,30,'#fff',700,'center',frame.w-20);
    });
    blocks.forEach(b=>{
      ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.angle);ctx.scale(b.scale,b.scale);
      const [bg,ink]=colors[b.color],h=b.date?210:160;
      fill(-180,-h/2,360,h,bg,24);
      txt(b.stage.toUpperCase(),0,-h/2+37,27,ink,800,'center',320);
      txt(b.weight?Number(b.weight).toLocaleString('pt-BR')+' kg':'— kg',0,-h/2+102,49,ink,900,'center',320);
      if(b.date)txt(b.date.split('-').reverse().join('/'),0,72,25,ink,600,'center',320);
      ctx.restore();
    });
    if(el('showBrand').checked)txt(el('unit').value==='gym'?'GYM POP':'BIKE POP',540,1870,36,'#fff',900,'center');
    el('variant').textContent='Antes & Depois · '+catalog.beforeAfter[modelIndex][0];
    window.popTextPaint?.();window.popStickerPaint?.();
  }};
})();
