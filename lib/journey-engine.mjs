import {journeySnapshot,planFromSnapshot,eventSchedule,modeOf} from './journey-plan.mjs';
import {parseJSON,localParts,loadJourneyPeople,loadJourneyFacts,resolvePerson,journeyEvent,contactBlock} from './journey-data.mjs';
import {rows,setupJourney,config,consentFor,authorizeAll,due,triggerMode} from './journey-automations.mjs';
const stamp=()=>new Date().toISOString();
async function logItem(db,run,p,status,detail){await db.prepare('INSERT INTO club_journey_automation_runs(unit,automation_id,student_id,slot,status,detail) VALUES(?,?,?,?,?,?) ON CONFLICT(unit,automation_id,student_id,slot) DO UPDATE SET status=excluded.status,detail=excluded.detail').bind(run.unit,run.automation_id,p.id,run.slot,status,JSON.stringify({name:p.name,...detail})).run();}
async function counts(db,run){
 // Derive counters from durable rows; a crash cannot double-count a student.
 const c=await db.prepare("SELECT SUM(CASE WHEN json_extract(detail,'$.eligible')=1 THEN 1 ELSE 0 END) eligible,SUM(status='accepted') accepted,SUM(status IN ('failed','uncertain')) failed,SUM(status IN ('ignored','blocked')) ignored FROM club_journey_automation_runs WHERE unit=? AND automation_id=? AND slot=?").bind(run.unit,run.automation_id,run.slot).first();
 await db.prepare('UPDATE club_journey_executions SET eligible=?,accepted=?,failed=?,ignored=? WHERE id=?').bind(c?.eligible||0,c?.accepted||0,c?.failed||0,c?.ignored||0,run.id).run();
}
async function processPerson(db,run,a,p,adapters,now,snapshot){
 let eligible=false;
 const block=(reason,status='blocked')=>logItem(db,run,p,status,{eligible,reason});
 const freshPerson=snapshot.people.find(x=>x.id===p.id);
 const f=snapshot.facts.get(p.id),event=freshPerson?.events.get(a.rule);
 if(!f)return block('FORA_DA_JORNADA','ignored');
 if(f.contacts.some(c=>String(c.note).startsWith('[REMOVIDO_DA_JORNADA_NOVOS_ALUNOS]')))return block('REMOVIDO_DA_JORNADA','ignored');
 if(a.rule==='attended'&&(!f.present.length||'attendance:'+f.present[0].day!==event?.key))return block('EVENTO_NAO_CONFIRMADO');
 if(!event||(!event.current&&a.rule!=='attended'))return block('FORA_DA_FASE','ignored');
 if(p.ambiguous)return block('IDENTIDADE_AMBIGUA');if(!p.phone)return block('TELEFONE_INVALIDO');
 let personId;try{personId=await resolvePerson(db,run.unit,p);}catch(e){return block(e.message);}
 const createdAt=Date.parse(String(a.created_at||'').replace(' ','T')+(String(a.created_at||'').includes('T')?'':'Z'));
 if(a.rule==='new'&&Date.parse(event.at)<Date.parse(a.activated_at||a.created_at))return block('CADASTRO_ANTERIOR_A_ATIVACAO','ignored');
 if(Number.isFinite(createdAt)&&Date.parse(modeOf(a)==='instant'?(event.detectedAt||event.at):event.at)<createdAt)return block('EVENTO_ANTERIOR_A_CRIACAO','ignored');
 const schedule=eventSchedule(a,event,now),slot=String(run.slot).startsWith('manual-')?localParts(now).slot:run.slot;
 if(schedule.reason||schedule.targetDay!==slot.slice(0,10)||!schedule.scheduledAt||Date.parse(schedule.scheduledAt)>+new Date(now))return block(schedule.reason||'EVENTO_FORA_DA_PROGRAMACAO');
 if(localParts(now).day!==schedule.targetDay)return block('EVENTO_FORA_DO_DIA');
 // A run at 10:00 cannot send an event first observed at 10:30 for an 11:00 slot.
 if(!String(run.slot).startsWith('manual-')&&Date.parse(schedule.scheduledAt)>=Date.parse(run.slot+':00-03:00')+60000)return block('EVENTO_IDENTIFICADO_APOS_HORARIO');
 if(!authorizeAll(a)&&!await consentFor(db,run.unit,personId,p.phone,now))return block('SEM_CONSENTIMENTO_COMPROVADO_OU_EXPIRADO');
 const optout=f.contacts.filter(c=>/não deseja contato|nao deseja contato|revogou.*whatsapp/i.test(c.note||'')).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
 if(optout){const consent=await db.prepare('SELECT MAX(consented_at) at FROM club_journey_consents WHERE unit=? AND person_id=? AND phone=? AND revoked_at IS NULL').bind(run.unit,personId,p.phone).first();if(authorizeAll(a)||!consent?.at||Date.parse(consent.at)<=Date.parse(optout.created_at.replace(' ','T')+'Z'))return block('CLIENTE_SOLICITOU_NAO_RECEBER_CONTATOS');}
 const existing=await db.prepare("SELECT * FROM club_journey_deliveries WHERE unit=? AND person_id=? AND (event_key=? OR (?='attended' AND event_key LIKE 'attendance:%')) AND (automation_id=? OR flow_id=?) LIMIT 1").bind(run.unit,personId,event.key,a.rule,a.id,a.flow_id).first();
 if(existing&&existing.status!=='retry'){
  if(existing.execution_id===run.id&&existing.status==='accepted')return logItem(db,run,p,'accepted',{eligible:true,reason:'ACEITO_PELO_CHATPRO',deliveryId:existing.id,deliveryConfirmed:false});
  if(existing.execution_id===run.id&&['sending','uncertain'].includes(existing.status))return logItem(db,run,p,'uncertain',{eligible:true,reason:'EXECUCAO_INTERROMPIDA_CONFERIR_CHATPRO',deliveryId:existing.id});
  return block(existing.status==='accepted'?'EVENTO_JA_ACEITO':'ENVIO_ANTERIOR_EXIGE_CONFERENCIA');
 }
 const reason=contactBlock(f,a.flow_id,event,now);if(reason)return block(reason);
 
 
 
 
 eligible=true;
 const current=await config(db,run.unit,a.id);if(!current?.enabled||current.deleted||current.revision!==run.revision)return block('AUTOMACAO_PAUSADA_OU_EDITADA');
 const at=new Date(now).toISOString();let deliveryId;
 if(existing){const claim=await db.prepare("UPDATE club_journey_deliveries SET status='sending',execution_id=?,updated_at=? WHERE id=? AND status='retry'").bind(run.id,at,existing.id).run();if(!claim.meta?.changes)return block('RESERVA_CONCORRENTE');deliveryId=existing.id;}
 else{const claim=await db.prepare("INSERT OR IGNORE INTO club_journey_deliveries(unit,automation_id,person_id,student_id,phone,flow_id,event_key,execution_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'sending',?,?)").bind(run.unit,a.id,personId,p.id,p.phone,a.flow_id,event.key,run.id,at,at).run();if(!claim.meta?.changes)return block('EVENTO_JA_RESERVADO');deliveryId=claim.meta.last_row_id;}
 try{
  const result=await adapters.send({unit:run.unit,studentId:p.id,studentName:p.name,phone:p.phone,flow:Number(a.flow_id),hasOptIn:true,journey:true,batchId:'journey-'+deliveryId},async()=>{
   const checkNow=adapters.clock?adapters.clock():new Date(),fresh=await config(db,run.unit,a.id);
   if(!fresh?.enabled||fresh.deleted||fresh.revision!==run.revision)throw Error('AUTOMACAO_PAUSADA_OU_EDITADA');
   if(!authorizeAll(a)&&!await consentFor(db,run.unit,personId,p.phone,checkNow))throw Error('CONSENTIMENTO_REVOGADO_OU_EXPIRADO');
   const freshPeople=await loadJourneyPeople(db,run.unit,checkNow),freshPerson=freshPeople.find(x=>x.id===p.id);
   if(!freshPerson||freshPerson.phone!==p.phone||freshPerson.ambiguous)throw Error('IDENTIDADE_OU_TELEFONE_ALTERADO');
   const freshFacts=await loadJourneyFacts(db,run.unit,freshPerson,checkNow);
   if(journeyEvent(a.rule,freshPerson,a.rule==='attended'?{...freshFacts,converted:null}:freshFacts,checkNow)?.key!==event.key)throw Error('FASE_ALTERADA');
   if(contactBlock(freshFacts,a.flow_id,event,checkNow))throw Error('CONTATO_RECENTE');
  });
  await db.prepare("UPDATE club_journey_deliveries SET status='accepted',detail=?,updated_at=? WHERE id=?").bind(JSON.stringify({provider:'ChatPro',deliveryConfirmed:false,contactCreated:!!result.contactCreated,linkedIds:p.ids}),stamp(),deliveryId).run();
  let contactRecorded=true;
  for(const id of p.ids){const contact=await adapters.recordContact({unit:run.unit,studentId:id,journey:true,batchId:'journey-'+deliveryId,hasOptIn:true},Number(a.flow_id));if(!contact.contactRecorded)contactRecorded=false;}
  if(contactRecorded)await db.prepare('UPDATE club_journey_deliveries SET contact_recorded=1 WHERE id=?').bind(deliveryId).run();
  await logItem(db,run,p,'accepted',{eligible:true,reason:contactRecorded?'ACEITO_PELO_CHATPRO':'ACEITO_HISTORICO_PENDENTE',deliveryId,deliveryConfirmed:false});
 }catch(e){
  const accepted=await db.prepare('SELECT status FROM club_journey_deliveries WHERE id=?').bind(deliveryId).first();
  if(accepted?.status==='accepted'){await logItem(db,run,p,'accepted',{eligible:true,reason:'ACEITO_HISTORICO_PENDENTE',deliveryId,deliveryConfirmed:false});return {sent:true};}
  const status=e.beforeSend===true?'failed_before_send':'uncertain';
  await db.prepare('UPDATE club_journey_deliveries SET status=?,detail=?,updated_at=? WHERE id=?').bind(status,String(e.message||'FALHA_CHATPRO').slice(0,200),stamp(),deliveryId).run();
  await logItem(db,run,p,status==='uncertain'?'uncertain':'failed',{eligible:true,reason:String(e.message||'FALHA_CHATPRO').slice(0,200),deliveryId,retrySafe:status==='failed_before_send'});
 }return {sent:true};
}
export async function journeyAutomationTick(env,adapters,options={}){
 const db=env.DB,now=options.now?new Date(options.now):new Date(),at=now.toISOString(),token=crypto.randomUUID(),deadline=Date.now()+20000;
 await setupJourney(db);
 const lease=await db.prepare('UPDATE club_journey_engine SET lease_token=?,lease_until=?,last_tick=? WHERE id=1 AND (lease_until IS NULL OR lease_until<?)').bind(token,new Date(+now+600000).toISOString(),at,at).run();if(!lease.meta?.changes)return {locked:true};
 try{
  await db.prepare("UPDATE club_journey_deliveries SET status='uncertain',detail='EXECUCAO_INTERROMPIDA_CONFERIR_CHATPRO' WHERE status='sending' AND updated_at<?").bind(new Date(+now-600000).toISOString()).run();
  const engine=await db.prepare('SELECT last_scan FROM club_journey_engine WHERE id=1').first(),start=engine?.last_scan?Math.max(Date.parse(engine.last_scan)+60000,+now-10*60000):+now;
  const autos=await rows(db,'SELECT a.*,COALESCE(s.revision,1) revision,s.activated_at FROM club_journey_automations a LEFT JOIN club_journey_automation_state s ON s.automation_id=a.id WHERE a.enabled=1 AND COALESCE(s.deleted,0)=0');
  // Scheduled rules retain their existing calendar behavior. Instant rules are
  // driven by newly persisted journey events rather than one scan per minute.
  for(const a of autos.filter(a=>triggerMode(a)!=='instant'))for(let t=Math.floor(start/60000)*60000;t<=+now;t+=60000){if(a.activated_at&&t<Date.parse(a.activated_at))continue;if(due(a,new Date(t)))await db.prepare('INSERT OR IGNORE INTO club_journey_executions(unit,automation_id,revision,slot,created_at) VALUES(?,?,?,?,?)').bind(a.unit,a.id,a.revision,localParts(t).slot,at).run();}
  await db.prepare('UPDATE club_journey_engine SET last_scan=?,last_error=NULL WHERE id=1 AND lease_token=?').bind(new Date(Math.floor(+now/60000)*60000).toISOString(),token).run();
  const repair=await rows(db,"SELECT * FROM club_journey_deliveries WHERE status='accepted' AND contact_recorded=0 ORDER BY id LIMIT 10");
  for(const d of repair){let recorded=true;for(const id of parseJSON(d.detail,{}).linkedIds||[d.student_id]){const r=await adapters.recordContact({unit:d.unit,studentId:id,journey:true,batchId:'journey-'+d.id,hasOptIn:true},Number(d.flow_id));if(!r.contactRecorded)recorded=false;}if(recorded)await db.prepare('UPDATE club_journey_deliveries SET contact_recorded=1 WHERE id=?').bind(d.id).run();}
  // The journey is the producer, independent of whether any WhatsApp automation exists.
  // Both studios must persist stage events even while all automations are disabled/deleted.
  const snapshots=new Map();for(const unit of ['bike','gym'])snapshots.set(unit,await journeySnapshot(db,unit,now,true));
  // Prioritize live events: old large batches must not starve newly detected students.
  // Snapshot persistence is the event producer. Only first detections from
  // today, after activation, can enqueue an instant WhatsApp delivery.
  for(const a of autos.filter(a=>triggerMode(a)==='instant')){
   const snapshot=snapshots.get(a.unit);if(!snapshot)continue;
   const detected=await rows(db,"SELECT person_id,event_key,detected_at FROM club_journey_event_details WHERE unit=? AND rule=? AND detected_at>=? AND detected_at<=? ORDER BY detected_at DESC LIMIT 200",a.unit,a.rule,new Date(+now-86400000).toISOString(),at);
   const byPerson=new Map(snapshot.people.filter(p=>p.personId&&!p.removed).map(p=>[p.personId,p]));
   const grouped=new Map();
   for(const e of detected){
    const p=byPerson.get(e.person_id),event=p?.events.get(a.rule);
    if(!p||!event||event.key!==e.event_key||!event.current&&a.rule!=='attended')continue;
    if(Date.parse(e.detected_at)<Date.parse(a.created_at)||a.activated_at&&Date.parse(e.detected_at)<Date.parse(a.activated_at))continue;
    // Never enqueue registrations that predate this automation, even if the journey event was backfilled later.
    if(a.rule==='new'&&Date.parse(event.at)<Date.parse(a.activated_at||a.created_at))continue;
    const schedule=eventSchedule(a,event,now);if(schedule.reason||schedule.targetDay!==localParts(now).day)continue;
    const slot=localParts(new Date(e.detected_at)).slot;
    if(!grouped.has(slot))grouped.set(slot,new Set());
    grouped.get(slot).add(p.id);
   }
   for(const [slot,ids] of grouped){
    const existing=await db.prepare('SELECT id,status,people_json FROM club_journey_executions WHERE unit=? AND automation_id=? AND slot=?').bind(a.unit,a.id,slot).first();
    if(existing){
     if(!['queued','running'].includes(existing.status))continue;
     const all=new Set([...(parseJSON(existing.people_json,[])||[]),...ids]);
     await db.prepare('UPDATE club_journey_executions SET people_json=? WHERE id=?').bind(JSON.stringify([...all]),existing.id).run();
    }else await db.prepare("INSERT OR IGNORE INTO club_journey_executions(unit,automation_id,revision,slot,people_json,created_at) VALUES(?,?,?,?,?,?)").bind(a.unit,a.id,a.revision,slot,JSON.stringify([...ids]),at).run();
   }
  }
  const pending=await rows(db,"SELECT * FROM club_journey_executions WHERE status IN ('queued','running') ORDER BY CASE WHEN people_json IS NOT NULL AND length(people_json)<500 THEN 0 ELSE 1 END, id DESC LIMIT 10");let sends=0,processed=0;
  for(const run of pending){
   if(Date.now()>deadline||sends>=3||processed>=8)break;
   const a=await config(db,run.unit,run.automation_id);
   if(!a?.enabled||a.deleted||a.revision!==run.revision||+now-Date.parse(run.created_at)>86400000){await db.prepare("UPDATE club_journey_executions SET status='cancelled',detail='PAUSADA_EDITADA_OU_JANELA_EXPIRADA',finished_at=? WHERE id=?").bind(at,run.id).run();continue;}
   const snapshot=snapshots.get(run.unit),people=snapshot.people,byId=new Map(people.map(p=>[p.id,p]));let ids=parseJSON(run.people_json,null);
   if(!ids){
    const plan=planFromSnapshot(snapshot,a,run.slot.slice(0,10));
    ids=plan.items.filter(p=>p.group==='today'&&p.scheduledAt&&Date.parse(p.scheduledAt)<=Date.parse(run.slot+':00-03:00')).map(p=>p.studentId);
    await db.prepare("UPDATE club_journey_executions SET people_json=?,status='running' WHERE id=?").bind(JSON.stringify(ids),run.id).run();
   }
   await db.prepare('INSERT OR IGNORE INTO club_journey_execution_details(execution_id,started_at,candidates) VALUES(?,?,?)').bind(run.id,at,ids.length).run();
   for(let i=run.cursor;i<ids.length;i++){
    if(Date.now()>deadline||sends>=3||processed>=8)break;
    const p=byId.get(ids[i]),prior=await db.prepare('SELECT id FROM club_journey_automation_runs WHERE unit=? AND automation_id=? AND student_id=? AND slot=?').bind(run.unit,a.id,ids[i],run.slot).first();
    if(!prior){if(p){const result=await processPerson(db,run,a,p,adapters,now,snapshot);if(result?.sent)sends++;}else await logItem(db,run,{id:ids[i]},'ignored',{eligible:false,reason:'FORA_DA_JORNADA_ATUAL'});}
    processed++;run.cursor=i+1;await db.prepare('UPDATE club_journey_executions SET cursor=? WHERE id=?').bind(run.cursor,run.id).run();
   }
   await counts(db,run);if(run.cursor>=ids.length)await db.prepare("UPDATE club_journey_executions SET status=CASE WHEN failed>0 THEN 'error' ELSE 'completed' END,finished_at=? WHERE id=?").bind(stamp(),run.id).run();
  }return {ok:true,processed,sends};
 }catch(e){await db.prepare('UPDATE club_journey_engine SET last_error=? WHERE id=1 AND lease_token=?').bind(String(e.message||'FALHA_MOTOR').slice(0,200),token).run();console.error('JOURNEY_ENGINE_ERROR',String(e.message).slice(0,200));return {ok:false,error:String(e.message)};}
 finally{await db.prepare('UPDATE club_journey_engine SET lease_token=NULL,lease_until=NULL WHERE id=1 AND lease_token=?').bind(token).run();}
}
