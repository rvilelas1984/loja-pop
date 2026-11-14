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
if(!record||String(record.sessionId)!==String(id)||Date.now()-Number(record.savedAt||0)>30*60*1000||record.performance?.unit!=='bike'){
 try{
  const token=sessionStorage.getItem('clubpop_token');
  if(!token)throw Error('Sessão expirada');
  const response=await fetch('/api/auth?route=pop-fit&action=performance&id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.ok||data.performance?.unit!=='bike')throw Error(data.error||'Aula indisponível');
  record={sessionId:id,performance:data.performance,memberName:data.performance.member_name||data.performance.student_name||data.performance.full_name||'',savedAt:Date.now()};
  sessionStorage.setItem('bike_pop_performance_v32',JSON.stringify(record));
 }catch(e){fail('Não foi possível carregar os dados reais desta aula: '+e.message);return;}
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
 const seat=[p.bike_position,p.bike_number,p.bike_slot,p.seat_number,p.device_number,p.sensor_position].find(v=>v!==null&&v!==undefined&&/^(?:[1-9]|[12][0-9]|3[0-4])$/.test(String(v).trim()));
 second[1].innerHTML=seat==null?'— <small>bike</small>':String(Number(seat))+' <small>bike</small>';
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
if(Array.isArray(route)&&route.length){
 const groups=[['subida_ingreme','subida_moderada'],['plano','reta_rapida'],['recuperacao'],['sprint','sprint_intenso']];
 const total=route.reduce((a,x)=>a+Math.max(0,Number(x.km)||0),0);
 groups.forEach((k,i)=>{const km=route.filter(x=>k.includes(x.kind)).reduce((a,x)=>a+Math.max(0,Number(x.km)||0),0);const b=segments[i]?.querySelector('b'),small=segments[i]?.querySelector('small');if(b)b.textContent=number(km,2)+' km';if(small)small.textContent=total?'('+Math.round(km/total*100)+'%)':'—'});
}else{
 segments.forEach(el=>{const b=el.querySelector('b'),small=el.querySelector('small');if(b)b.textContent='—';if(small)small.textContent=''});
 const chart=sheet.querySelector('.route .chart');if(chart){chart.style.opacity='.25';chart.setAttribute('aria-label','Percurso não disponível para esta aula')}
}
const actions=document.createElement('div');actions.id='bike-v32-actions';
actions.style.cssText='display:flex;gap:12px;justify-content:center;max-width:864px;margin:18px auto 40px;padding:0 16px;flex-wrap:wrap';
actions.innerHTML='<button type="button" id="bike-save-png">Salvar PNG</button><button type="button" id="bike-share-png">Compartilhar</button>';
actions.querySelectorAll('button').forEach(b=>b.style.cssText='flex:1;min-width:135px;padding:14px;border:0;border-radius:12px;background:#ef4ba5;color:white;font-weight:800;font-size:15px');
sheet.after(actions);
const compact=document.createElement('style');
compact.textContent='@media(max-width:800px){.sheet{width:min(100%,calc((100dvh - 192px)*.5625))!important;margin-left:auto!important;margin-right:auto!important}#bike-v32-actions{margin:6px auto 8px!important;padding:0 12px!important;gap:8px!important}#bike-v32-actions button{padding:10px!important;font-size:14px!important;min-width:120px!important}}';
document.head.appendChild(compact);
const existing=sheet.querySelector('footer button.share');if(existing)existing.onclick=e=>{e.preventDefault();share()};
function loadCapture(){return new Promise((resolve,reject)=>{if(window.htmlToImage)return resolve();const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.13/html-to-image.min.js';sc.onload=resolve;sc.onerror=()=>reject(Error('Não foi possível carregar o gerador PNG'));document.head.appendChild(sc)})}
async function png(){await loadCapture();await document.fonts.ready;const width=sheet.offsetWidth,height=sheet.offsetHeight;const dataUrl=await htmlToImage.toPng(sheet,{pixelRatio:Math.max(2,2160/width),cacheBust:true,backgroundColor:'#180d26',canvasWidth:Math.round(width*Math.max(2,2160/width)),canvasHeight:Math.round(height*Math.max(2,2160/width))});const response=await fetch(dataUrl);return response.blob()}
const filename='bike-pop-desempenho-'+id+'.png';
async function save(){try{const blob=await png();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}catch(e){alert(e.message)}}
async function share(){try{const blob=await png();const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Meu desempenho Bike Pop'})}else{await save();alert('Imagem salva. Compartilhe pela galeria do celular.')}}catch(e){if(e.name!=='AbortError')alert(e.message)}}
document.getElementById('bike-save-png').onclick=save;
document.getElementById('bike-share-png').onclick=share;
})();