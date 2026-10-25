import {loadJourneyPeople,loadJourneyFactsMany,journeyEvent,contactBlock,localParts,utcStamp,parseJSON} from './journey-data.mjs';
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const hash=async t=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(t))),b=>b.toString(16).padStart(2,'0')).join('');
export const authorizedByAdmin=a=>{const x=parseJSON(a.extra_text||'[]',[]);return !Array.isArray(x)&&x.authorizeAll===true};
export const modeOf=a=>{const x=parseJSON(a.extra_text||'[]',[]);return Array.isArray(x)?'delay':x.mode||'delay'};
export const schedulesOf=a=>{const x=parseJSON(a.extra_text||'[]',[]);return [{days:parseJSON(a.days_json||'[]',[]).map(String),time:a.time_hhmm},...(Array.isArray(x)?x:x.schedules||[])]};
export function eventSchedule(a,event,now=new Date()) {
 const mode=modeOf(a),target=new Date(localParts(event.at).day+'T12:00:00Z');
 target.setUTCDate(target.getUTCDate()+(mode==='delay'?Math.max(0,Number(a.delay_days)||0):0));
 const targetDay=target.toISOString().slice(0,10),weekday=String(target.getUTCDay());
 // No retroactive sends: instant events are observed today; scheduled events
 // must be observed by a configured time on the exact target calendar day.
 if(mode==='instant')return {targetDay:localParts(event.detectedAt||now).day,scheduledAt:event.detectedAt||new Date(now).toISOString(),reason:localParts(event.at).day<localParts(event.detectedAt||now).day?'EVENTO_ANTERIOR_IDENTIFICADO_COM_ATRASO':null};
 const slots=schedulesOf(a).filter(s=>s.days.includes(weekday)).map(s=>new Date(targetDay+'T'+s.time+':00-03:00').toISOString()).sort();
 const observed=event.detectedAt||event.syncedAt||new Date(now).toISOString();
 const scheduledAt=slots.find(t=>t>=event.at&&t>=observed)||null;
 return {targetDay,scheduledAt,reason:!slots.length?'DIA_SEM_PROGRAMACAO':!scheduledAt?'EVENTO_IDENTIFICADO_APOS_HORARIO':null};
}
export async function journeySnapshot(db,unit,now=new Date(),persist=false) {
 const people=await loadJourneyPeople(db,unit,now),facts=await loadJourneyFactsMany(db,unit,people,now);
 let aliases=await rows(db,'SELECT token,person_id FROM club_journey_identities WHERE unit=?',unit);
 const lookup=new Map(aliases.map(x=>[x.token,x.person_id])),writes=[];
 for(const p of people){
  p.hashes=await Promise.all(p.tokens.map(hash));
  const found=new Set(p.hashes.map(t=>lookup.get(t)).filter(Boolean));
  p.identityReason=p.ambiguous||found.size>1?'IDENTIDADE_AMBIGUA':null;
  p.personId=p.identityReason?null:[...found][0]||'person-'+await hash(unit+':'+(p.tokens.find(t=>t.startsWith('cpf:'))||p.tokens.find(t=>t.startsWith('email:'))||p.tokens[0]));
  if(persist&&p.personId)for(const token of p.hashes)if(!lookup.has(token))writes.push(db.prepare('INSERT OR IGNORE INTO club_journey_identities(unit,token,person_id) VALUES(?,?,?)').bind(unit,token,p.personId));
 }
 for(let i=0;i<writes.length;i+=100)await db.batch(writes.slice(i,i+100));
 if(writes.length){aliases=await rows(db,'SELECT token,person_id FROM club_journey_identities WHERE unit=?',unit);const current=new Map(aliases.map(x=>[x.token,x.person_id]));for(const p of people){const ids=new Set(p.hashes.map(t=>current.get(t)).filter(Boolean));if(ids.size>1){p.identityReason='IDENTIDADE_AMBIGUA';p.personId=null}else if(ids.size===1)p.personId=[...ids][0]}}
 const [stored,meta,consents,deliveries,manual]=await Promise.all([
  rows(db,'SELECT * FROM club_journey_events WHERE unit=?',unit),rows(db,'SELECT * FROM club_journey_event_details WHERE unit=?',unit),
  rows(db,'SELECT * FROM club_journey_consents WHERE unit=? AND revoked_at IS NULL AND consented_at<=? AND expires_at>?',unit,new Date(now).toISOString(),new Date(now).toISOString()),
  rows(db,'SELECT * FROM club_journey_deliveries WHERE unit=?',unit),
  rows(db,"SELECT phone,flow,status,created_at FROM student_management_dispatches WHERE unit=? AND status IN ('pending','review','accepted')",unit)
 ]);
 const ek=(id,key)=>id+'|'+key,eventMap=new Map(stored.map(e=>[ek(e.person_id,e.event_key),e])),metaMap=new Map(meta.map(e=>[ek(e.person_id,e.event_key),e]));
 const changes=[];
 for(const p of people){
  const f=facts.get(p.id);p.events=new Map();p.removed=f.contacts.some(c=>String(c.note).startsWith('[REMOVIDO_DA_JORNADA_NOVOS_ALUNOS]'));
  const observed=[];
  for(const rule of ['new','unbooked','booked','awaiting_attendance','no_show','attended','converted','inactive']){
   // Keep first attendance even when a later conversion changes current stage.
   const event=rule==='new'?{at:p.registeredAt,key:'registration:'+p.day}:journeyEvent(rule,p,rule==='attended'?{...f,converted:null}:f,now);if(!event)continue;
   const key=ek(p.personId,event.key),old=eventMap.get(key),detail=metaMap.get(key);
   const source=rule==='attended'?f.present[0]:null;
   const syncedAt=source?.synced_at?utcStamp(source.synced_at):null;
   const detectedAt=detail?.detected_at||(persist?new Date(now).toISOString():null);
   const at=old?.event_at||(rule==='booked'?(detectedAt||new Date(now).toISOString()):event.at);
   const ev={...event,at,syncedAt:detail?.synced_at||syncedAt,detectedAt,transitionAt:detail?.transition_at||null,rule,current:!!journeyEvent(rule,p,f,now)};
   p.events.set(rule,ev);observed.push(ev);
   if(persist&&p.personId&&!p.removed){
    if(!old)changes.push(db.prepare('INSERT OR IGNORE INTO club_journey_events(unit,person_id,event_key,event_at) VALUES(?,?,?,?)').bind(unit,p.personId,event.key,at));
    if(!detail)changes.push(db.prepare('INSERT OR IGNORE INTO club_journey_event_details(unit,person_id,event_key,rule,detected_at,synced_at,transition_at) VALUES(?,?,?,?,?,?,NULL)').bind(unit,p.personId,event.key,rule,detectedAt,syncedAt));
   }
  }
  // Retain events observed previously after progression; do not invent transitions.
  for(const e of stored.filter(e=>e.person_id===p.personId)){const d=metaMap.get(ek(p.personId,e.event_key));const rule=d?.rule||({'attendance':'attended','conversion':'converted','booking':'booked','no_show':'no_show','inactive':'inactive'})[e.event_key.split(':')[0]];if(rule&&!p.events.has(rule))p.events.set(rule,{key:e.event_key,at:e.event_at,detectedAt:d?.detected_at||null,syncedAt:d?.synced_at||null,transitionAt:d?.transition_at||null,rule,current:false});}
 }
 for(let i=0;i<changes.length;i+=100)await db.batch(changes.slice(i,i+100));
 return {people,facts,consents,deliveries,manual,now};
}
export function planFromSnapshot(snapshot,a,date=localParts(snapshot.now).day){
 const {people,facts,consents,deliveries,manual,now}=snapshot,items=[];
 for(const p of people){const event=p.events.get(a.rule);if(!event||p.removed)continue;
  // An automation never retroactively targets events predating its creation.
  const createdAt=Date.parse(String(a.created_at||'').replace(' ','T')+(String(a.created_at||'').includes('T')?'':'Z'));
  if(Number.isFinite(createdAt)&&Date.parse(modeOf(a)==='instant'?(event.detectedAt||event.at):event.at)<createdAt)continue;
  const schedule=eventSchedule(a,event,now),f=facts.get(p.id),reasons=[];
  if(a.rule==='attended'&&(!f.present.length||'attendance:'+f.present[0].day!==event.key))reasons.push('EVENTO_NAO_CONFIRMADO');
  if(!event.current&&a.rule!=='attended')reasons.push('FORA_DA_ETAPA_ATUAL');
  if(p.identityReason)reasons.push(p.identityReason);if(!p.phone)reasons.push('TELEFONE_INVALIDO');
  const consent=consents.find(c=>c.person_id===p.personId&&c.phone===p.phone);
  if(!consent&&!authorizedByAdmin(a))reasons.push('SEM_CONSENTIMENTO_COMPROVADO');
  const existing=deliveries.find(d=>d.person_id===p.personId&&(d.event_key===event.key||(a.rule==='attended'&&d.event_key.startsWith('attendance:')))&&(d.automation_id===a.id||d.flow_id===a.flow_id));
  if(existing&&existing.status!=='retry')reasons.push(existing.status==='accepted'?'MENSAGEM_JA_ACEITA':'ENVIO_ANTERIOR_EXIGE_CONFERENCIA');
  if(schedule.reason)reasons.push(schedule.reason);
  if(schedule.targetDay<localParts(now).day)reasons.push('EVENTO_FORA_DA_PROGRAMACAO');
  const recent=contactBlock(f,a.flow_id,event,now);if(recent)reasons.push(recent);
  const optout=f.contacts.find(c=>/não deseja contato|nao deseja contato|revogou.*whatsapp/i.test(c.note||'')&&(!consent||Date.parse(consent.consented_at)<=Date.parse(utcStamp(c.created_at))));
  if(optout)reasons.push('CLIENTE_SOLICITOU_NAO_RECEBER_CONTATOS');
  
  
  items.push({studentId:p.id,name:p.name,phone:p.phone,eventKey:event.key,eventAt:event.at,syncedAt:event.syncedAt,detectedAt:event.detectedAt,transitionAt:event.transitionAt,inStage:event.current,targetDay:schedule.targetDay,scheduledAt:schedule.scheduledAt,consent:!!consent,authorizedByAdmin:authorizedByAdmin(a),group:schedule.targetDay===date?'today':schedule.targetDay>date?'future':'past',status:existing?.status|| (reasons.length?'blocked':'pendente'),reason:reasons[0]||null,reasons,authorized:!reasons.length});
 }
 const history=deliveries.filter(d=>d.automation_id===a.id).map(d=>({studentId:d.student_id,name:people.find(p=>p.personId===d.person_id)?.name,status:d.status,createdAt:d.created_at,updatedAt:d.updated_at,detail:d.detail})).reverse();
 return {ok:true,items,history,timezone:'America/Sao_Paulo',date,summary:{inStage:items.filter(x=>x.inStage).length,today:items.filter(x=>x.group==='today').length,authorized:items.filter(x=>x.group==='today'&&x.authorized).length,blocked:items.filter(x=>x.group==='today'&&!x.authorized).length,sent:history.filter(x=>x.status==='accepted').length,future:items.filter(x=>x.group==='future').length},note:'Consulta sem envio. Horários em São Paulo. Identificação é a primeira observação registrada; transição desconhecida permanece sem horário. Aceito pelo ChatPro não confirma entrega ou leitura.'};
}
