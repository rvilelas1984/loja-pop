(async function(){
'use strict';
const stored=sessionStorage.getItem('bike_pop_performance_v32');
let record=null;try{record=JSON.parse(stored||'null')}catch{}
const id=new URLSearchParams(location.search).get('session')||record?.sessionId;
const sheet=document.querySelector('.sheet');
if(!sheet)return;
const fail=message=>{
 const warning=document.createElement('div');
 warning.style.cssText='margin:16px auto;padding:18px;max-width:650px;background:#280d37;color:white;border:1px solid #b45ac8;border-radius:12px;font:600 15px system-ui;text-align:center';
 warning.textContent=message+' ';
 const back=document.createElement('a');back.href='/pop-fit.html';back.textContent='Voltar ao Pop Fit';back.style.cssText='color:#ffb5e5;text-decoration:underline';
 warning.append(back);sheet.before(warning);
 sheet.style.display='none';
};
if(!id){fail('Não foi possível identificar a aula. Abra novamente pelo botão Ver seu desempenho.');return;}
// Atualiza os indicadores da aula a cada abertura: evita posição antiga no sessionStorage.
try{
 const token=sessionStorage.getItem('clubpop_token');
 if(!token)throw Error('Sessão expirada');
 const response=await fetch('/api/auth?route=pop-fit&action=performance&id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 const data=await response.json();
 if(!response.ok||!data.ok||data.performance?.unit!=='bike')throw Error(data.error||'Aula indisponível');
 record={sessionId:id,performance:data.performance,memberName:record?.memberName||data.performance.member_name||data.performance.student_name||data.performance.full_name||'',savedAt:Date.now()};
 sessionStorage.setItem('bike_pop_performance_v32',JSON.stringify(record));
}catch(e){
 if(!record||String(record.sessionId)!==String(id)||record.performance?.unit!=='bike'){
  fail('Não foi possível carregar os dados reais desta aula: '+e.message);return;
 }
 console.warn('Falha ao atualizar dados da aula; exibindo última versão carregada',e);
}
const p=record.performance;
async function setProfilePhoto(){
 try{
  const token=sessionStorage.getItem('clubpop_token');
  if(!token)return;
  const response=await fetch('/api/auth?route=profile-photo',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.photoUrl)return;
  const image=sheet.querySelector('.portrait img, .profile img, .avatar img, .photo img')||Array.from(sheet.querySelectorAll('img')).at(-1);
  if(!image)return;
  const candidate=new Image();candidate.crossOrigin='anonymous';candidate.src=data.photoUrl;
  await candidate.decode();
  image.src=data.photoUrl;image.crossOrigin='anonymous';
 }catch(e){console.warn('Foto do perfil indisponível',e)}
}
await setProfilePhoto();

if(!sheet)return;
const number=(v,d=0)=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const put=(selector,value)=>{const el=sheet.querySelector(selector);if(el)el.textContent=value};
const metrics=sheet.querySelectorAll('.metrics .metric .val');
const values=[[p.rpm_avg,0,'rpm'],[p.rpm_max,0,'rpm'],[p.speed_avg_kmh,1,'km/h'],[p.speed_max_kmh,1,'km/h']];
metrics.forEach((el,i)=>{if(values[i])el.innerHTML=number(values[i][0],values[i][1])+' <small>'+values[i][2]+'</small>'});
const second=sheet.querySelectorAll('.second .metric .val');
if(second[0])second[0].innerHTML=number(p.calories_estimated)+' <small>kcal</small>';
if(second[1]){
 const seatLabel=second[1].closest('.metric')?.querySelector('.title');
 if(seatLabel)seatLabel.innerHTML='Posição<br>na Sala';
 const seatIcon=second[1].closest('.metric')?.querySelector('.emoji');
 if(seatIcon)seatIcon.innerHTML="<svg aria-hidden=\"true\" viewBox=\"0 0 64 64\" width=\"40\" height=\"40\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" style=\"color:#ff4cbe;filter:drop-shadow(0 0 4px #ff4cbe)\"><g stroke=\"currentColor\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M7 54h50M12 56h7m29 0h7\" stroke-width=\"4.5\"/><circle cx=\"44\" cy=\"41\" r=\"13\" stroke-width=\"4.5\"/><circle cx=\"44\" cy=\"41\" r=\"5\" stroke-width=\"2.5\"/><path d=\"M20 38 13 21m7 17 24-24m0 0 6 29M20 38l24 3M13 21h-6m6 0 9 1M40 14h13l5-9m-8 9 4-8\" stroke-width=\"4\" /><path d=\"M10 17h16m-9 21-6 15m7-15 4 10m-6 0h10\" stroke-width=\"3.5\"/></g></svg>";
 const quality=(()=>{try{return typeof p.metric_quality_json==='string'?JSON.parse(p.metric_quality_json||'{}'):(p.metric_quality_json||{})}catch{return {}}})();
 const seat=[p.bike_position,p.bike_number,p.bike_slot,p.seat_number,p.device_number,p.sensor_position,quality.bike_position,quality.bike_number].find(v=>v!==null&&v!==undefined&&/^(?:[1-9]|[12][0-9]|3[0-4])$/.test(String(v).trim()));
 second[1].textContent=seat==null?'—':'Bike '+String(Number(seat));
}
if(second[2])second[2].textContent=number(p.monitored_members);
const distance=number(p.distance_km,2);
const hero=sheet.querySelector('.hero-metric .big');
if(hero)hero.innerHTML=distance+' <small style="font-size:4.5cqw">km</small>';
put('.route-head span b',distance+' km');
const date=new Date(p.starts_at||'');
if(!Number.isNaN(date.getTime()))put('.date span:last-child','▦  '+new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'America/Sao_Paulo'}).format(date).toUpperCase());
put('.student',record.memberName||'Aluno Bike Pop');
put('.class',(p.class_name||'Bike Pop')+'  ·  Aula finalizada');
const summary=sheet.querySelectorAll('.summary .part b');
if(summary[0])summary[0].textContent=p.duration_seconds==null?'—':Math.round(Number(p.duration_seconds)/60)+' min';
if(summary[1])summary[1].textContent=number(p.class_calories)+' kcal';
let route=null;try{route=JSON.parse(p.metric_quality_json||'{}').virtual_route}catch{}
const segments=sheet.querySelectorAll('.segments .segment');
const chart=sheet.querySelector('.route .chart');
const groups=[['subida_ingreme','subida_moderada'],['plano','reta_rapida'],['recuperacao'],['sprint','sprint_intenso']];
['Montanha','Reta','Recuperação','Sprint'].forEach((label,i)=>{const el=segments[i];if(!el)return;const title=el.querySelector('strong')||el.querySelector('.name')||Array.from(el.children).find(x=>/^(Subida|Reta|Descida|Sprint)$/i.test(x.textContent.trim()));if(title)title.textContent=label;else{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){if(/^(Subida|Reta|Descida|Sprint)$/.test(node.textContent.trim())){node.textContent=label;break}}}});
if(Array.isArray(route)&&route.some(x=>Number(x.seconds)>0)){
 const valid=route.filter(x=>Number(x.seconds)>0);
 const totalKm=valid.reduce((a,x)=>a+Math.max(0,Number(x.km)||0),0);
 const totalSeconds=valid.reduce((a,x)=>a+Math.max(0,Number(x.seconds)||0),0);
 groups.forEach((k,i)=>{
  const km=valid.filter(x=>k.includes(x.kind)).reduce((a,x)=>a+Math.max(0,Number(x.km)||0),0);
  const seconds=valid.filter(x=>k.includes(x.kind)).reduce((a,x)=>a+Math.max(0,Number(x.seconds)||0),0);
  const b=segments[i]?.querySelector('b'),small=segments[i]?.querySelector('small');
  if(b)b.textContent=number(km,2)+' km';
  if(small)small.textContent=totalSeconds?'('+Math.round(seconds/totalSeconds*100)+'%)':'—';
 });
 if(chart){
  // Mesmo perfil de RPM da versão anterior do Pop Fit, preservando a sequência da aula.
  const deltas={recuperacao:0,subida_ingreme:-28,subida_moderada:-14,plano:0,reta_rapida:0,sprint:23,sprint_intenso:34};
  let x=8,y=104;const points=[[x,y]];
  for(const segment of valid){
   const seconds=Math.max(0,Number(segment.seconds)||0);
   const nx=Math.min(752,x+744*seconds/Math.max(1,totalSeconds));
   y=Math.max(18,Math.min(130,y+(deltas[segment.kind]||0)*Math.min(1,seconds/30)));
   points.push([nx,y]);x=nx;
  }
  const sx=760/760,sy=160/160;
  const line=points.map(([px,py],i)=>(i?'L':'M')+px.toFixed(1)+' '+py.toFixed(1)).join(' ');
  const area=line+' L'+x.toFixed(1)+' 142 L8 142 Z';
  const ns='http://www.w3.org/2000/svg';
  const defs=chart.querySelector('defs');
  chart.replaceChildren();
  if(defs)chart.appendChild(defs);
  const fill=document.createElementNS(ns,'path');fill.setAttribute('d',area);fill.setAttribute('fill','url(#area)');chart.appendChild(fill);
  const path=document.createElementNS(ns,'path');path.setAttribute('d',line);path.setAttribute('fill','none');path.setAttribute('stroke','url(#stroke)');path.setAttribute('stroke-width','7');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');chart.appendChild(path);
  for(const [px,py] of [points[0],...points.slice(1,-1),points.at(-1)]){
   const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',String(px));circle.setAttribute('cy',String(py));circle.setAttribute('r','5');circle.setAttribute('fill','#fff');circle.setAttribute('stroke','#f85cff');circle.setAttribute('stroke-width','3');chart.appendChild(circle);
  }
  chart.style.opacity='1';
  chart.setAttribute('aria-label','Perfil virtual estimado pelas faixas de RPM da aula, sem medição de altitude');
 }
}else{
 segments.forEach(el=>{const b=el.querySelector('b'),small=el.querySelector('small');if(b)b.textContent='—';if(small)small.textContent=''});
 if(chart){chart.replaceChildren();chart.setAttribute('aria-label','Sem dados de RPM suficientes para reconstruir o percurso virtual');}
}
const actions=document.createElement('div');actions.id='bike-v32-actions';
actions.style.cssText='display:flex;gap:12px;justify-content:center;max-width:864px;margin:18px auto 40px;padding:0 16px;flex-wrap:wrap';
actions.innerHTML='<button type="button" id="bike-save-png">Salvar PNG</button><button type="button" id="bike-share-png">Compartilhar</button>';
actions.querySelectorAll('button').forEach(b=>b.style.cssText='flex:1;min-width:135px;padding:14px;border:0;border-radius:12px;background:#ef4ba5;color:white;font-weight:800;font-size:15px');
sheet.after(actions);
const compact=document.createElement('style');
compact.textContent='@media(max-width:800px){.sheet{width:min(100%,calc((100dvh - 192px)*.5625))!important;margin-left:auto!important;margin-right:auto!important}#bike-v32-actions{margin:6px auto 8px!important;padding:0 12px!important;gap:8px!important}#bike-v32-actions button{padding:10px!important;font-size:14px!important;min-width:120px!important}}';
document.head.appendChild(compact);
const editor=document.createElement('div');
editor.id='bike-v32-editor';
editor.style.cssText='max-width:864px;margin:8px auto 22px;padding:0 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:stretch;color:#fff;font:600 13px system-ui';
const nameBox=document.createElement('label');
nameBox.style.cssText='display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:#32113e;border:1px solid #a64caf;border-radius:12px;min-width:0';
nameBox.textContent='Nome na imagem';
const nameInput=document.createElement('input');
nameInput.type='text';nameInput.maxLength=50;nameInput.placeholder='Ex.: Nato, Cris';nameInput.value=record.memberName||'';
nameInput.setAttribute('aria-label','Nome ou apelido na imagem');
nameInput.style.cssText='width:100%;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid #8e4a9e;background:#1c082a;color:white;font:600 14px system-ui';
nameBox.appendChild(nameInput);
const photoBox=document.createElement('label');
photoBox.style.cssText='display:flex;flex-direction:column;gap:6px;padding:10px 12px;background:#32113e;border:1px solid #a64caf;border-radius:12px;cursor:pointer;min-width:0';
photoBox.textContent='Trocar foto';
const photoHint=document.createElement('span');
photoHint.textContent='Escolher da galeria';
photoHint.style.cssText='display:block;text-align:center;padding:9px 4px;border-radius:8px;background:#ef4ba5;color:white;font:700 14px system-ui';
const photoInput=document.createElement('input');
photoInput.type='file';photoInput.accept='image/*';photoInput.setAttribute('aria-label','Escolher foto da galeria');
photoInput.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
photoBox.append(photoHint,photoInput);
editor.append(nameBox,photoBox);
actions.after(editor);
const studentName=sheet.querySelector('.student');
nameInput.addEventListener('input',()=>{if(studentName)studentName.textContent=nameInput.value.trim()||record.memberName||'Aluno Bike Pop'});
let customPhotoUrl=null;
photoInput.addEventListener('change',async()=>{
 const file=photoInput.files?.[0];if(!file)return;
 photoInput.value='';
 if(!file.type.startsWith('image/')){alert('Selecione uma imagem válida.');return}
 const url=URL.createObjectURL(file);
 const img=sheet.querySelector('.portrait img, .profile img, .avatar img, .photo img')||Array.from(sheet.querySelectorAll('img')).at(-1);
 if(!img){URL.revokeObjectURL(url);alert('Não foi possível localizar a foto no cartão.');return}
 const source=new Image();
 try{source.src=url;await source.decode()}catch{URL.revokeObjectURL(url);alert('Não foi possível abrir a foto escolhida.');return}
 const overlay=document.createElement('div');
 overlay.style.cssText='position:fixed;inset:0;z-index:99999;background:#08020deb;display:flex;align-items:center;justify-content:center;padding:16px;font:600 15px system-ui;color:white';
 const panel=document.createElement('div');
 panel.style.cssText='width:min(100%,410px);background:#2a1036;border:1px solid #d14bca;border-radius:20px;padding:18px;box-shadow:0 16px 60px #000b;display:flex;flex-direction:column;gap:12px';
 const title=document.createElement('strong');title.textContent='Enquadrar sua foto';title.style.cssText='font-size:20px;text-align:center';
 const hint=document.createElement('span');hint.textContent='Arraste para posicionar o rosto e use o zoom.';hint.style.cssText='font-size:13px;text-align:center;color:#e9c7ed';
 const preview=document.createElement('canvas');preview.width=600;preview.height=600;
 preview.style.cssText='width:min(100%,320px);aspect-ratio:1;border-radius:50%;border:3px solid #ef4ba5;touch-action:none;align-self:center;cursor:grab;background:#19051e';
 const zoomLabel=document.createElement('label');zoomLabel.textContent='Zoom';zoomLabel.style.cssText='display:flex;gap:12px;align-items:center';
 const zoom=document.createElement('input');zoom.type='range';zoom.min='1';zoom.max='3';zoom.step='.01';zoom.value='1';zoom.style.cssText='flex:1;accent-color:#ef4ba5';zoomLabel.append(zoom);
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:10px';
 const cancel=document.createElement('button');cancel.textContent='Cancelar';
 const confirm=document.createElement('button');confirm.textContent='Usar esta foto';
 for(const button of [cancel,confirm])button.style.cssText='flex:1;border:0;border-radius:10px;padding:13px 8px;color:white;font-weight:800;background:#69336f';
 confirm.style.background='#ef4ba5';buttons.append(cancel,confirm);
 panel.append(title,hint,preview,zoomLabel,buttons);overlay.append(panel);document.body.append(overlay);
 const ctx=preview.getContext('2d');let dx=0,dy=0,scale=1;
 const base=Math.max(preview.width/source.naturalWidth,preview.height/source.naturalHeight);
 function draw(){
  const w=source.naturalWidth*base*scale,h=source.naturalHeight*base*scale;
  const maxX=Math.max(0,(w-preview.width)/2),maxY=Math.max(0,(h-preview.height)/2);
  dx=Math.max(-maxX,Math.min(maxX,dx));dy=Math.max(-maxY,Math.min(maxY,dy));
  ctx.clearRect(0,0,600,600);ctx.drawImage(source,(600-w)/2+dx,(600-h)/2+dy,w,h);
 }
 zoom.addEventListener('input',()=>{scale=Number(zoom.value);draw()});
 let last=null;
 preview.addEventListener('pointerdown',e=>{last={x:e.clientX,y:e.clientY};preview.setPointerCapture(e.pointerId)});
 preview.addEventListener('pointermove',e=>{if(!last)return;const rect=preview.getBoundingClientRect();dx+=(e.clientX-last.x)*600/rect.width;dy+=(e.clientY-last.y)*600/rect.height;last={x:e.clientX,y:e.clientY};draw()});
 const stop=()=>{last=null};preview.addEventListener('pointerup',stop);preview.addEventListener('pointercancel',stop);
 let pinch=null;
 preview.addEventListener('touchmove',e=>{if(e.touches.length!==2)return;const t=e.touches;const dist=Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);if(pinch){scale=Math.max(1,Math.min(3,scale*dist/pinch));zoom.value=String(scale);draw()}pinch=dist},{passive:true});
 preview.addEventListener('touchend',()=>{pinch=null});
 function close(){overlay.remove();URL.revokeObjectURL(url)}
 cancel.onclick=close;
 confirm.onclick=()=>{
  try{
   const cropped=preview.toDataURL('image/png');
   img.src=cropped;img.removeAttribute('crossorigin');
   if(customPhotoUrl){URL.revokeObjectURL(customPhotoUrl);customPhotoUrl=null}
   photoHint.textContent='Foto enquadrada';
   close();
  }catch(e){alert('Falha ao aplicar o enquadramento: '+(e?.message||String(e)))}
 };
 draw();
});

const existing=sheet.querySelector('footer button.share');if(existing)existing.onclick=e=>{e.preventDefault();share()};
function loadLibrary(globalName,url){return new Promise((resolve,reject)=>{if(window[globalName])return resolve(window[globalName]);const script=document.createElement('script');script.src=url;script.onload=()=>window[globalName]?resolve(window[globalName]):reject(new Error('Biblioteca de imagem não inicializou'));script.onerror=()=>reject(new Error('Falha ao carregar a biblioteca de imagem'));document.head.appendChild(script)})}
function describeError(e){return e instanceof Error?e.message:String(e||'Falha desconhecida na exportação')}
async function png(){
 await document.fonts.ready;
 const width=sheet.offsetWidth,height=sheet.offsetHeight;
 if(!width||!height)throw new Error('O cartão não está visível');
 const ratio=Math.min(3,Math.max(2,1440/width));
 const imageOptions={pixelRatio:ratio,cacheBust:false,backgroundColor:'#180d26',skipFonts:false};
 const errors=[];
 try{
  const lib=await loadLibrary('htmlToImage','https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js');
  const blob=await lib.toBlob(sheet,imageOptions);
  if(blob&&blob.size>10000)return blob;
  throw new Error('PNG gerado vazio');
 }catch(e){errors.push('Método 1: '+describeError(e));console.warn('Bike Pop exportação método 1',e)}
 try{
  const lib=await loadLibrary('domtoimage','https://cdnjs.cloudflare.com/ajax/libs/dom-to-image-more/3.3.0/dom-to-image-more.min.js');
  const blob=await lib.toBlob(sheet,{bgcolor:'#180d26',cacheBust:false,scale:ratio});
  if(blob&&blob.size>10000)return blob;
  throw new Error('PNG gerado vazio');
 }catch(e){errors.push('Método 2: '+describeError(e));console.warn('Bike Pop exportação método 2',e)}
 throw new Error('Não foi possível gerar a imagem. '+errors.join(' | '));
}
const filename='bike-pop-desempenho-'+id+'.png';
async function save(){try{const blob=await png();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}catch(e){alert(describeError(e))}}
async function share(){try{const blob=await png();const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Meu desempenho Bike Pop'})}else{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);alert('Compartilhamento direto indisponível neste navegador. PNG salvo para compartilhar pela galeria.')}}catch(e){if(e?.name!=='AbortError')alert(describeError(e))}}
document.getElementById('bike-save-png').onclick=save;
document.getElementById('bike-share-png').onclick=share;
})();