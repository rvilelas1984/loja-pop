(function(){
"use strict";
let payload=null,unit="bike",category="all";
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=d=>/^\d{4}-\d{2}-\d{2}/.test(String(d||""))?String(d).slice(0,10).split("-").reverse().join("/"):"—";
const tag=s=>s==="wellhub"?"Wellhub":s==="totalpass"?"TotalPass":"Clientes";
const status=s=>s==="high"?"🔴 14+ dias sem aula":s==="attention"?"🟠 7+ dias sem aula":s==="no-first-class"?"🟡 Ainda não fez aula":"🟢 Acompanhamento";
const list=()=>payload?.students?.filter(s=>category==="all"||s.category===category)||[];
const card=(label,value)=>'<div class="stat" style="margin:0">'+esc(label)+'<b>'+esc(value)+'</b></div>';
const item=(s,extra)=>'<div style="border-top:1px solid #e7ebf0;padding:13px 0"><div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px"><div><strong>'+esc(s.name)+'</strong><br><small>'+tag(s.category)+' · Cadastro '+fmt(s.day)+' · EVO '+esc(s.id)+'</small></div><div>'+extra+'</div></div></div>';
function render(data,u){payload=data;unit=u;paint()}
function clear(){payload=null;if($("opportunityList"))$("opportunityList").innerHTML="";$("journeyContent").innerHTML="";$("retentionContent").innerHTML="";$("journeySummary").textContent="Consulta indisponível."}
function opportunities(rows){return payload?.opportunities?.length??"—"}
function paint(){
 if(!payload)return;
 const rows=list(),identified=rows.filter(s=>s.stage==="identified"),booked=rows.filter(s=>s.stage==="booking"),attended=rows.filter(s=>s.stage==="attendance"),converted=rows.filter(s=>s.converted);
 $("opportunityList").innerHTML=payload.opportunities?.length?payload.opportunities.map(o=>'<div style="padding:12px 0;border-top:1px solid #e7ebf0"><strong>'+esc(o.name||"Sem nome")+'</strong><br><small>EVO '+esc(o.id)+' · Cadastro '+fmt(o.day)+'</small></div>').join(""):'<p class="muted">Nenhuma oportunidade importada no período. Verifique a sincronização da EVO.</p>';
 $("journeySummary").textContent="Etapa atual de cada aluno, com histórico preservado. Reservas só aparecem quando já foram sincronizadas no D1.";
 const stats='<div class="stats" style="margin:10px 0">'+card("Aguardando agendamento",identified.length)+card("Agendaram, aguardando aula",booked.length)+card("Primeira presença realizada",attended.length)+card("Conversões para planos próprios",converted.length)+card("Com contrato ativo no D1",rows.filter(s=>s.contracts?.some(c=>c.active)).length)+'</div>';
 const stage=(title,arr,details)=>'<details open><summary>'+title+' ('+arr.length+')</summary>'+ (arr.length?arr.map(s=>item(s,details(s))).join(""):'<p class="muted">Nenhum aluno nesta etapa.</p>')+'</details>';
 const ranking={};for(const s of converted)if(s.firstContract)ranking[s.firstContract]=(ranking[s.firstContract]||0)+1;
 const rank='<details><summary>Contratos mais contratados</summary>'+(Object.entries(ranking).sort((a,b)=>b[1]-a[1]).map(([n,c])=>'<p>'+esc(n)+': <b>'+c+'</b></p>').join("")||'<p>Sem contratos próprios novos confirmados no período.</p>')+'</details>';
 $("journeyContent").innerHTML=stats+stage("👋 Identificados",identified,s=>'<small>Aguardando reserva identificada</small>')+stage("📅 Com agendamento",booked,s=>'<small>'+fmt(s.booking?.day)+' '+esc(s.booking?.time||"")+' · '+esc(s.booking?.activity||"")+'</small>')+stage("✅ Com presença",attended,s=>'<small>Primeira aula: '+fmt(s.firstAttendance)+' · '+s.attendanceCount+' presença(s)</small>')+rank;
 const monitored=attended.filter(s=>s.followupDay<=90).sort((a,b)=>(b.risk!=="normal")-(a.risk!=="normal")||b.daysSinceAttendance-a.daysSinceAttendance);
 const r30=(day)=>{const eligible=attended.filter(s=>s.retention?.[day]!==null);return eligible.length?eligible.filter(s=>s.retention[day]).length+"/"+eligible.length:"Em acompanhamento"};
 $("retentionContent").innerHTML='<div class="stats" style="margin:10px 0">'+card("Atenção necessária",rows.filter(s=>s.risk!=="normal").length)+card("Retenção 30 dias",r30("day30"))+card("Retenção 60 dias",r30("day60"))+card("Retenção 90 dias",r30("day90"))+'</div>'+(monitored.length?monitored.map(s=>'<details><summary>'+esc(s.name)+' · Dia '+s.followupDay+'/90 · '+status(s.risk)+'</summary><p><b>'+s.attendanceCount+' presenças</b> · '+s.weeklyAverage+' por semana (últimos 28 dias) · Última aula '+fmt(s.lastAttendance)+' · '+s.daysSinceAttendance+' dia(s) sem aula</p><p>Próxima reserva: '+(s.nextBooking?fmt(s.nextBooking.day)+' '+esc(s.nextBooking.time)+' · '+esc(s.nextBooking.activity):'Não identificada no D1')+'</p><p><button type="button" data-intervene="'+esc(s.id)+'" data-kind="contact">Registrar contato</button> <button type="button" data-intervene="'+esc(s.id)+'" data-kind="survey">Registrar pesquisa de satisfação</button></p>'+(s.interventions?.length?'<p><b>Histórico de intervenções</b></p>'+s.interventions.map(i=>'<p><small>'+esc(i.kind)+' · '+fmt(i.at)+' — '+esc(i.note)+'</small></p>').join(""):'<small>Sem intervenções registradas.</small>')+'</details>').join(""):'<p class="muted">Nenhuma presença registrada para iniciar os 90 dias.</p>');
 $("retentionContent").querySelectorAll("[data-intervene]").forEach(b=>b.addEventListener("click",async()=>{
 const id=b.dataset.intervene,kind=b.dataset.kind,note=prompt(kind==="survey"?"Registre o retorno do questionário de satisfação:":"Registre o contato realizado e o retorno do aluno:");
 if(!note?.trim())return;
 b.disabled=true;
 try{const r=await fetch("/api/evo-config?route=new-students-intervention",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({unit,id,kind,note:note.trim()})});const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||"Falha ao salvar");alert("Intervenção registrada no D1.");$("reload")?.click()}catch(e){alert("Não foi possível salvar: "+e.message)}finally{b.disabled=false}
 }));
}
window.cpNewStudentsJourney={render,clear,filter:v=>{category=v;paint()},opportunities};
})();