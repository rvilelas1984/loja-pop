// Bike Pop lifetime-stars celebration. Image and optional photo stay on the device.
export function initBikeStarsCelebration(card){
const themes=[
{bg:'#fffdf9',fg:'#301c36',accent:'#9634b2',muted:'#847787',chip:'#fff1d6',glow:'#ffdf93',frame:'#45265a'},
{bg:'#171121',fg:'#fffaf5',accent:'#f8ce6b',muted:'#bdb0c7',chip:'#352840',glow:'#75529d',frame:'#382140'},
{bg:'#faf1ff',fg:'#39204c',accent:'#853fb1',muted:'#86768e',chip:'#edd9fb',glow:'#d7a2fb',frame:'#543064'},
{bg:'#f8fffc',fg:'#123c39',accent:'#0c8476',muted:'#60817d',chip:'#d9f7eb',glow:'#b2f1d7',frame:'#143f40'},
{bg:'#fff9f7',fg:'#50283d',accent:'#c05181',muted:'#917784',chip:'#ffe2eb',glow:'#ffd2c0',frame:'#5b3048'}
];
const phrases=[
'{name}, cada pedalada conta uma história de dedicação. Você já realizou {count} aulas. Parabéns!',
'{name}, são {count} aulas de esforço, energia e superação. Essa conquista é toda sua!',
'{name}, você transformou constância em resultados. São {count} aulas para comemorar!',
'{name}, cada aula foi um passo adiante. Suas {count} aulas merecem muitos aplausos!',
'{name}, sua determinação inspira! Você já acumulou {count} aulas no Bike Pop.',
'{name}, que orgulho acompanhar sua jornada! {count} aulas conquistadas com dedicação.',
'{name}, você escolheu continuar, aula após aula. Hoje já são {count} motivos para celebrar!',
'{name}, sua energia faz parte da nossa história. Parabéns pelas {count} aulas!',
'{name}, ninguém pedala por você: essas {count} aulas são fruto do seu compromisso!',
'{name}, a melhor conquista é perceber o quanto você evoluiu. Parabéns pelas {count} aulas!',
'{name}, seu ritmo, sua força, sua jornada. Você já chegou a {count} aulas!',
'{name}, a consistência merece reconhecimento. Celebre suas {count} aulas no Bike Pop!'
];
const style=document.createElement('style');
style.textContent=`#bpCelebrate{position:fixed;inset:0;z-index:100000;background:#14081bd9;display:none;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(8px)}#bpCelebrate[hidden]{display:none!important}#bpCelebrate .bpFrame{width:min(100%,420px);max-height:calc(100dvh - 28px);overflow-y:auto;border-radius:29px;padding:10px;background:var(--frame);box-shadow:0 22px 75px #0a0319a8}#bpCelebrate .bpModal{position:relative;border-radius:23px;padding:28px 19px 20px;background:radial-gradient(circle at 50% 0%,var(--glow),transparent 47%),var(--bg);color:var(--fg);text-align:center}#bpCelebrate button{cursor:pointer;font:inherit}#bpCelebrate .bpClose{position:absolute;right:11px;top:11px;border:0;border-radius:50%;width:35px;height:35px;background:#a69a9a29;color:var(--fg);font-size:23px}#bpCelebrate .bpMedal{font-size:67px;margin:10px auto 6px;filter:drop-shadow(0 4px 3px #b6782366)}#bpCelebrate .bpEyebrow{color:var(--accent);font-size:10px;letter-spacing:1.7px;font-weight:900}#bpCelebrate h2{color:var(--fg);font-size:27px;margin:12px 0}#bpCelebrate .bpTotal{font-size:55px;font-weight:900;color:var(--accent);line-height:1.15}#bpCelebrate .bpSubtitle{font-size:11px;letter-spacing:1px;color:var(--muted);font-weight:800;margin:8px 0 14px}#bpCelebrate .bpLevel{display:inline-block;background:var(--chip);color:var(--accent);border-radius:30px;padding:8px 18px;font-size:13px;font-weight:850}#bpCelebrate .bpPortrait{display:none;width:94px;height:94px;border:4px solid #e9b749;border-radius:50%;object-fit:cover;margin:14px auto 0}#bpCelebrate .bpPhrase{color:var(--fg);font-size:15px;line-height:1.55;margin:18px 0}#bpCelebrate .bpControls{display:flex;gap:7px;margin:12px 0}#bpCelebrate .bpControls button{flex:1;background:var(--chip);color:var(--accent);border:0;border-radius:11px;padding:10px 5px;font-size:12px;font-weight:800}#bpCelebrate .bpShare{width:100%;background:linear-gradient(105deg,#8d3bbb,#bc61d2);color:white;border:0;border-radius:14px;padding:14px 6px;font-size:14px;font-weight:850}#bpCelebrate .bpStatus{font-size:12px;color:var(--muted);margin:10px 0;min-height:15px}#bpCelebrate .bpPreview{display:none;margin-top:12px}#bpCelebrate .bpPreview img{width:100%;border-radius:12px;max-height:55vh;object-fit:contain}#bpCelebrate .bpPreview button{margin:6px 2px;padding:10px;border:0;border-radius:10px;background:var(--chip);color:var(--accent);font-size:12px;font-weight:800}#bpCelebrate .bpFooter{color:var(--muted);font-size:11px;margin-top:13px}#bpCelebrate button:focus-visible{outline:3px solid #e4ac35;outline-offset:3px}`;
document.head.append(style);
const overlay=document.createElement('div');overlay.id='bpCelebrate';overlay.hidden=true;
overlay.innerHTML=`<div class="bpFrame"><section class="bpModal" role="dialog" aria-modal="true" aria-labelledby="bpTitle"><button type="button" class="bpClose" aria-label="Fechar">×</button><div class="bpMedal">🌟</div><div class="bpEyebrow">SUA JORNADA MERECE BRILHAR</div><h2 id="bpTitle"></h2><div class="bpTotal" id="bpTotal"></div><div class="bpSubtitle">AULAS REALIZADAS NO BIKE POP</div><div class="bpLevel" id="bpLevel"></div><img class="bpPortrait" id="bpPortrait" alt="Sua foto opcional"><p class="bpPhrase" id="bpPhrase"></p><div class="bpControls"><button id="bpPhoto" type="button">📷 Adicionar foto</button><button id="bpRemove" type="button" hidden>Remover foto</button></div><input id="bpFile" type="file" accept="image/*" hidden><button class="bpShare" id="bpGenerate" type="button">↗ Compartilhar minha conquista</button><div class="bpStatus" id="bpStatus" role="status"></div><div class="bpPreview" id="bpPreview"><img id="bpPreviewImage" alt="Prévia da arte de conquista"><button type="button" id="bpNativeShare">Compartilhar imagem</button><button type="button" id="bpDownload">Salvar PNG</button></div><div class="bpFooter">Cada aula é uma vitória na sua jornada.</div></section></div>`;
document.body.append(overlay);
const $=id=>overlay.querySelector('#'+id);let data=null,photo=null,themeIndex=-1,phraseIndex=-1,blob=null,previewUrl=null,previousFocus=null;
const pick=(length,last)=>length<2?0:(last+1+Math.floor(Math.random()*(length-1)))%length;
const phrase=()=>phrases[phraseIndex].replaceAll('{name}',data.name).replaceAll('{count}',data.total.toLocaleString('pt-BR'));
function render(){const t=themes[themeIndex];for(const k of ['bg','fg','accent','muted','chip','glow','frame'])overlay.style.setProperty('--'+k,t[k]);$('bpTitle').textContent='Parabéns, '+data.name+'!';$('bpTotal').textContent=data.total.toLocaleString('pt-BR')+' ⭐';$('bpLevel').textContent='✨ '+data.title;$('bpPhrase').textContent=phrase();$('bpPreview').style.display='none';blob=null}
function close(){overlay.hidden=true;overlay.style.display='none';document.body.style.overflow='';if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}photo=null;$('bpFile').value='';$('bpPortrait').style.display='none';$('bpRemove').hidden=true;previousFocus?.focus?.()}
function open(){if(!data||card.style.display==='none')return;previousFocus=document.activeElement;photo=null;$('bpFile').value='';$('bpPortrait').style.display='none';$('bpRemove').hidden=true;themeIndex=pick(themes.length,themeIndex);phraseIndex=pick(phrases.length,phraseIndex);render();$('bpStatus').textContent='';overlay.hidden=false;overlay.style.display='flex';document.body.style.overflow='hidden';overlay.querySelector('.bpClose').focus()}
card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
overlay.querySelector('.bpClose').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return}if(e.key==='Tab'){const focusable=[...overlay.querySelectorAll('button:not([hidden])')].filter(x=>x.offsetParent!==null);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
$('bpPhoto').onclick=()=>$('bpFile').click();$('bpRemove').onclick=()=>{photo=null;$('bpFile').value='';$('bpPortrait').style.display='none';$('bpRemove').hidden=true;$('bpPreview').style.display='none'};
$('bpFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>12*1024*1024){$('bpStatus').textContent='Escolha uma foto de até 12 MB.';return}const reader=new FileReader();reader.onload=()=>{photo=reader.result;$('bpPortrait').src=photo;$('bpPortrait').style.display='block';$('bpRemove').hidden=false;$('bpPreview').style.display='none'};reader.readAsDataURL(f)};
const rounded=(g,x,y,w,h,r)=>{g.beginPath();g.roundRect(x,y,w,h,r)};
function wrap(g,text,x,y,maxWidth,lineHeight,maxLines=99){
 const words=String(text).split(/\s+/),lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;
 if(g.measureText(next).width>maxWidth&&line){lines.push(line);line=word}else line=next}
 if(line)lines.push(line);
 for(const value of lines.slice(0,maxLines)){g.fillText(value,x,y);y+=lineHeight}
 return y;
}
function fitText(g,text,maxWidth,start,min=24){
 let size=start;while(size>min){g.font='800 '+size+'px system-ui';if(g.measureText(text).width<=maxWidth)break;size-=2}return size
}
function loadImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
async function generate(){
 // The PNG and its preview use the SAME rendered canvas, avoiding visual drift.
 const c=document.createElement('canvas');c.width=2160;c.height=3840;
 const g=c.getContext('2d');if(!g)throw Error('Canvas unavailable');g.scale(2,2);
 const t=themes[themeIndex],cx=540;
 g.fillStyle=t.frame;g.fillRect(0,0,1080,1920);
 g.save();rounded(g,55,65,970,1790,62);g.clip();
 g.fillStyle=t.bg;g.fillRect(55,65,970,1790);
 const glow=g.createRadialGradient(540,130,40,540,130,600);
 glow.addColorStop(0,t.glow);glow.addColorStop(1,t.bg+'00');
 g.fillStyle=glow;g.fillRect(55,65,970,900);g.restore();
 g.textAlign='center';g.textBaseline='alphabetic';
 // Use the same celebratory symbol and wording as the modal.
 g.font='170px system-ui';g.fillText('🌟',cx,335);
 g.fillStyle=t.accent;g.font='900 30px system-ui';
 g.fillText('SUA JORNADA MERECE BRILHAR',cx,430,820);
 g.fillStyle=t.fg;
 const heading='Parabéns, '+data.name+'!';
 // Match the modal's ~27px headline at 380px wide: 69px at 970px.
 // Wrap BEFORE shrinking; do not reduce the full name to a tiny single line.
 let headingSize=69,headingLines=[];
 function splitHeading(size){
  g.font='800 '+size+'px system-ui';
  const lines=[];let current='';
  for(const word of heading.split(/\s+/)){
   const candidate=current?current+' '+word:word;
   if(g.measureText(candidate)>820&&current){lines.push(current);current=word}
   else current=candidate;
  }
  if(current)lines.push(current);
  return lines;
 }
 headingLines=splitHeading(headingSize);
 while(headingLines.length>3&&headingSize>44){headingSize-=3;headingLines=splitHeading(headingSize)}
 const headingY=headingLines.length>1?500:535;
 g.font='800 '+headingSize+'px system-ui';
 headingLines.forEach((part,i)=>g.fillText(part,cx,headingY+i*(headingSize+13),820));
 const headingBottom=headingY+(headingLines.length-1)*(headingSize+13);
 const countY=Math.max(700,headingBottom+125);
 g.fillStyle=t.accent;g.font='900 140px system-ui';
 g.fillText(data.total.toLocaleString('pt-BR')+' ⭐',cx,countY,800);
 g.fillStyle=t.muted;g.font='bold 27px system-ui';
 g.fillText('AULAS REALIZADAS NO BIKE POP',cx,countY+65,830);
 const chipY=countY+109;
 g.fillStyle=t.chip;rounded(g,310,chipY,460,78,39);g.fill();
 g.fillStyle=t.accent;g.font='bold 37px system-ui';g.fillText('✨ '+data.title,cx,chipY+52,425);
 let y=chipY+170;
 if(photo){
  const im=await loadImage(photo),centerY=y+115;
  g.save();g.beginPath();g.arc(cx,centerY,113,0,Math.PI*2);g.clip();
  const side=Math.min(im.width,im.height),sx=(im.width-side)/2,sy=(im.height-side)/2;
  g.drawImage(im,sx,sy,side,side,cx-113,centerY-113,226,226);g.restore();
  g.strokeStyle='#E9B749';g.lineWidth=10;g.beginPath();g.arc(cx,centerY,113,0,Math.PI*2);g.stroke();y=centerY+172;
 }
 g.fillStyle=t.fg;g.font='38px system-ui';
 wrap(g,phrase(),cx,y,800,60,6);
 g.fillStyle=t.accent;g.font='bold 48px system-ui';
 g.fillText('STUDIO BIKE POP',cx,1675,820);
 g.fillStyle=t.muted;g.font='28px system-ui';
 g.fillText('Cada aula é uma vitória na sua jornada.',cx,1740,820);
 return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PNG unavailable')),'image/png'));
}
$('bpGenerate').onclick=async()=>{try{$('bpStatus').textContent='Preparando sua imagem...';blob=await generate();if(!blob)throw Error('Falha ao gerar PNG');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(blob);$('bpPreviewImage').src=previewUrl;$('bpPreview').style.display='block';$('bpStatus').textContent='Prévia exata do PNG em alta resolução (2160 × 3840).'}catch{$('bpStatus').textContent='Não foi possível gerar a imagem. Tente novamente.'}};
$('bpNativeShare').onclick=async()=>{if(!blob)return;const file=new File([blob],'minha-conquista-bike-pop.png',{type:'image/png'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'Minha conquista Bike Pop'});return}$('bpStatus').textContent='Compartilhamento direto indisponível. Use Salvar PNG.'}catch(e){if(e.name!=='AbortError')$('bpStatus').textContent='Não foi possível compartilhar. Use Salvar PNG.'}};
$('bpDownload').onclick=()=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='minha-conquista-bike-pop.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
return {setData(value){data=value},close};
}
