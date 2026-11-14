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
if(!sheet)return;
const number=(v,d=0)=>v==null||v===''||!Number.isFinite(Number(v))?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const put=(selector,value)=>{const el=sheet.querySelector(selector);if(el)el.textContent=value};
const metrics=sheet.querySelectorAll('.metrics .metric .val');
const values=[[p.rpm_avg,0,'rpm'],[p.rpm_max,0,'rpm'],[p.speed_avg_kmh,1,'km/h'],[p.speed_max_kmh,1,'km/h']];
metrics.forEach((el,i)=>{if(values[i])el.innerHTML=number(values[i][0],values[i][1])+' <small>'+values[i][2]+'</small>'});
const second=sheet.querySelectorAll('.second .metric .val');
if(second[0])second[0].innerHTML=number(p.calories_estimated)+' <small>kcal</small>';
if(second[1])second[1].innerHTML=number(p.calorie_rank)+(p.calorie_rank==null?'':'º')+' <small>lugar</small>';
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
const existing=sheet.querySelector('footer button.share');if(existing)existing.onclick=e=>{e.preventDefault();share()};
function loadCapture(){return new Promise((resolve,reject)=>{if(window.html2canvas)return resolve();const sc=document.createElement('script');sc.src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';sc.onload=resolve;sc.onerror=()=>reject(Error('Não foi possível carregar o gerador PNG'));document.head.appendChild(sc)})}
async function png(){await loadCapture();await document.fonts.ready;const canvas=await html2canvas(sheet,{backgroundColor:null,scale:Math.max(2,2160/sheet.offsetWidth),useCORS:true,allowTaint:false,logging:false});return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao gerar PNG')),'image/png'))}
const filename='bike-pop-desempenho-'+id+'.png';
async function save(){try{const blob=await png();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000)}catch(e){alert(e.message)}}
async function share(){try{const blob=await png();const file=new File([blob],filename,{type:'image/png'});if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:'Meu desempenho Bike Pop'})}else{await save();alert('Imagem salva. Compartilhe pela galeria do celular.')}}catch(e){if(e.name!=='AbortError')alert(e.message)}}
document.getElementById('bike-save-png').onclick=save;
document.getElementById('bike-share-png').onclick=share;
})();