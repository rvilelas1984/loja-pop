import {journeySnapshot,planFromSnapshot,eventSchedule} from './journey-plan.mjs';
import {parseJSON,localParts,loadJourneyPeople,loadJourneyFacts,resolvePerson,journeyEvent} from './journey-data.mjs';
export const RULES=['new','unbooked','booked','awaiting_attendance','no_show','attended','converted','inactive'];
export const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];

/**
 * Read the first-attendance cohort directly from D1 before loading per-student
 * facts. This is only a candidate filter: the existing journeyEvent, identity,
 * consent and delivery checks remain authoritative.
 */
export async function journeyCandidates(db,unit,a,now=new Date()){
 return (await journeySnapshot(db,unit,now)).people;
}

export const SCHEMA=[
 `CREATE TABLE IF NOT EXISTS club_journey_execution_details(execution_id INTEGER PRIMARY KEY,started_at TEXT NOT NULL,candidates INTEGER NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS club_journey_event_details(unit TEXT NOT NULL,person_id TEXT NOT NULL,event_key TEXT NOT NULL,rule TEXT NOT NULL,detected_at TEXT NOT NULL,synced_at TEXT,transition_at TEXT,PRIMARY KEY(unit,person_id,event_key))`,

 `CREATE TABLE IF NOT EXISTS club_journey_automations(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,name TEXT NOT NULL,rule TEXT NOT NULL,flow_id TEXT NOT NULL,days_json TEXT NOT NULL,time_hhmm TEXT NOT NULL,delay_days INTEGER NOT NULL DEFAULT 0,extra_text TEXT NOT NULL DEFAULT '',enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
 `CREATE TABLE IF NOT EXISTS club_journey_automation_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,automation_id INTEGER NOT NULL,student_id TEXT,slot TEXT NOT NULL,status TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,automation_id,student_id,slot))`,
 `CREATE TABLE IF NOT EXISTS club_journey_automation_state(automation_id INTEGER PRIMARY KEY,unit TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,activated_at TEXT)`,
 `CREATE TABLE IF NOT EXISTS club_journey_executions(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,automation_id INTEGER NOT NULL,revision INTEGER NOT NULL,slot TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',people_json TEXT,cursor INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,accepted INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,ignored INTEGER NOT NULL DEFAULT 0,detail TEXT,created_at TEXT NOT NULL,finished_at TEXT,UNIQUE(unit,automation_id,slot))`,
 `CREATE TABLE IF NOT EXISTS club_journey_identities(unit TEXT NOT NULL,token TEXT NOT NULL,person_id TEXT NOT NULL,PRIMARY KEY(unit,token))`,
 `CREATE TABLE IF NOT EXISTS club_journey_consents(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,person_id TEXT NOT NULL,student_id TEXT NOT NULL,phone TEXT NOT NULL,evidence TEXT NOT NULL,consented_at TEXT NOT NULL,expires_at TEXT NOT NULL,revoked_at TEXT,actor TEXT NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS idx_journey_consents_person ON club_journey_consents(unit,person_id,phone)`,
 `CREATE TABLE IF NOT EXISTS club_journey_events(unit TEXT NOT NULL,person_id TEXT NOT NULL,event_key TEXT NOT NULL,event_at TEXT NOT NULL,PRIMARY KEY(unit,person_id,event_key))`,
 `CREATE TABLE IF NOT EXISTS club_journey_deliveries(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,automation_id INTEGER NOT NULL,person_id TEXT NOT NULL,student_id TEXT NOT NULL,phone TEXT NOT NULL,flow_id TEXT NOT NULL,event_key TEXT NOT NULL,execution_id INTEGER NOT NULL,status TEXT NOT NULL,detail TEXT,contact_recorded INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(unit,automation_id,person_id,event_key),UNIQUE(unit,person_id,flow_id,event_key))`,
 `CREATE TABLE IF NOT EXISTS club_journey_engine(id INTEGER PRIMARY KEY CHECK(id=1),lease_token TEXT,lease_until TEXT,last_tick TEXT,last_scan TEXT,last_error TEXT)`,
 `INSERT OR IGNORE INTO club_journey_engine(id) VALUES(1)`,
 `CREATE INDEX IF NOT EXISTS idx_journey_events_time ON club_journey_events(unit,event_at)`,
 `CREATE INDEX IF NOT EXISTS idx_journey_execution_status ON club_journey_executions(status,id)`,
 `CREATE TABLE IF NOT EXISTS club_new_student_interventions(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`
];
export async function setupJourney(db){await db.batch(SCHEMA.map(sql=>db.prepare(sql)));}
export function schedulesFor(a){const raw=parseJSON(a.extra_text||a.extra||'[]',[]),extra=Array.isArray(raw)?raw:(raw.schedules||[]);return [{days:parseJSON(a.days_json||JSON.stringify(a.days||[]),[]).map(String),time:a.time_hhmm||a.time},...extra];}
export const authorizeAll=a=>{const raw=parseJSON(a.extra_text||a.extra||'[]',[]);return !Array.isArray(raw)&&raw.authorizeAll===true;};
export const triggerMode=a=>{const raw=parseJSON(a.extra_text||a.extra||'[]',[]);return Array.isArray(raw)?'delay':(raw.mode||'delay');};
export function validateSchedules(input){
 if(!Array.isArray(input)||!input.length||input.length>12)throw Error('INFORME_ATE_12_COMBINACOES');
 return input.map(x=>{if(!Array.isArray(x.days)||!x.days.length||x.days.length>7||x.days.some(d=>!/^[0-6]$/.test(String(d)))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x.time)))throw Error('DIAS_OU_HORARIO_INVALIDOS');return {days:[...new Set(x.days.map(String))].sort(),time:x.time};});
}
export function nextExecution(a,now=new Date()){
 const schedule=schedulesFor(a),start=+new Date(now);
 for(let i=0;i<9;i++){const day=localParts(start+i*86400000).day,weekday=String(new Date(day+'T12:00:00Z').getUTCDay());const candidates=schedule.filter(s=>s.days.includes(weekday)).map(s=>new Date(day+'T'+s.time+':00-03:00')).filter(d=>+d>start).sort((a,b)=>a-b);if(candidates.length)return candidates[0].toISOString();}return null;
}
// One event-day rule shared by the scheduler and the recipient preview.
// Date is always evaluated in the unit's Sao Paulo timezone, never from admin filters.
export function journeyEventTargetDay(a,event){
 if(!event?.at||!Number.isFinite(Date.parse(event.at)))return null;
 const eventDay=localParts(event.at).day,mode=triggerMode(a);
 if(mode!=='delay')return eventDay;
 const delay=Math.max(0,Number(a.delay_days)||0);
 const utc=new Date(eventDay+'T12:00:00Z');utc.setUTCDate(utc.getUTCDate()+delay);
 return utc.toISOString().slice(0,10);
}
export function journeyEventMatchesSlot(a,event,slot,now=new Date()){
 const target=journeyEventTargetDay(a,event);
 if(!target)return false;
 const slotDay=String(slot).slice(0,10);
 if(triggerMode(a)==='instant')return target===slotDay;
 return target===slotDay&&localParts(event.at).day<=slotDay;
}
export const due=(a,date)=>{const p=localParts(date);return schedulesFor(a).some(s=>s.days.includes(p.weekday)&&s.time===p.time);};
export async function config(db,unit,id){return db.prepare('SELECT a.*,COALESCE(s.revision,1) revision,COALESCE(s.deleted,0) deleted,s.activated_at FROM club_journey_automations a LEFT JOIN club_journey_automation_state s ON s.automation_id=a.id WHERE a.unit=? AND a.id=?').bind(unit,id).first();}
export async function consentFor(db,unit,personId,phone,now){return db.prepare('SELECT id FROM club_journey_consents WHERE unit=? AND person_id=? AND phone=? AND revoked_at IS NULL AND consented_at<=? AND expires_at>? ORDER BY id DESC LIMIT 1').bind(unit,personId,phone,new Date(now).toISOString(),new Date(now).toISOString()).first();}
export async function journeyListing(db,unit,now=new Date()){
 const autos=await rows(db,'SELECT a.* FROM club_journey_automations a LEFT JOIN club_journey_automation_state s ON s.automation_id=a.id WHERE a.unit=? AND COALESCE(s.deleted,0)=0 ORDER BY a.id DESC',unit);
 const executions=await rows(db,'SELECT e.*,a.name,a.rule,a.flow_id flowId FROM club_journey_executions e JOIN club_journey_automations a ON a.id=e.automation_id WHERE e.unit=? ORDER BY e.id DESC LIMIT 100',unit);
 const engine=await db.prepare('SELECT last_tick,last_error FROM club_journey_engine WHERE id=1').first();
 return {ok:true,unit,timezone:'America/Sao_Paulo',engine:{lastTick:engine?.last_tick,error:engine?.last_error,operational:!!engine?.last_tick&&+new Date(now)-Date.parse(engine.last_tick)<180000},automations:autos.map(a=>{const last=executions.find(e=>e.automation_id===a.id);return {id:a.id,name:a.name,rule:a.rule,flowId:a.flow_id,days:parseJSON(a.days_json,[]),time:a.time_hhmm,delay:a.delay_days,triggerMode:triggerMode(a),authorizeAll:authorizeAll(a),extra:a.extra_text,schedules:schedulesFor(a),enabled:!!a.enabled,status:!a.enabled?'Pausada':last?.status==='error'||last?.failed>0?'Erro':'Ativa',nextExecution:a.enabled?nextExecution(a,now):null,last:last?{...last,people_json:undefined}:null};}),runs:executions.map(e=>({...e,candidates:parseJSON(e.people_json,[])?.length??0,people_json:undefined}))};
}
export async function mutateJourney(db,unit,b,actor,adapters={},now=new Date()){
 const action=String(b.action||''),at=new Date(now).toISOString();
 if(action==='executions'){const offset=Math.max(0,Math.floor(Number(b.offset)||0));return {ok:true,runs:(await rows(db,'SELECT e.*,a.name,a.rule,a.flow_id flowId FROM club_journey_executions e JOIN club_journey_automations a ON a.id=e.automation_id WHERE e.unit=? ORDER BY e.id DESC LIMIT 100 OFFSET ?',unit,offset)).map(e=>({...e,people_json:undefined})),offset};}
 if(action==='history'){
  const run=await db.prepare('SELECT e.*,d.started_at startedAt,COALESCE(d.candidates,json_array_length(e.people_json)) candidates FROM club_journey_executions e LEFT JOIN club_journey_execution_details d ON d.execution_id=e.id WHERE e.unit=? AND e.id=?').bind(unit,Number(b.runId)).first();if(!run)throw Error('EXECUCAO_NAO_ENCONTRADA');
  const offset=Math.max(0,Math.floor(Number(b.offset)||0));return {ok:true,history:await rows(db,'SELECT student_id studentId,status,detail,created_at createdAt FROM club_journey_automation_runs WHERE unit=? AND automation_id=? AND slot=? ORDER BY id LIMIT 100 OFFSET ?',unit,run.automation_id,run.slot,offset),run:{...run,people_json:undefined},offset};
 }
 if(action==='consents')return {ok:true,consents:await rows(db,'SELECT id,student_id studentId,phone,evidence,consented_at consentedAt,expires_at expiresAt,revoked_at revokedAt FROM club_journey_consents WHERE unit=? ORDER BY id DESC LIMIT 200',unit)};
 if(actor.role!=='admin')throw Error('SOMENTE_ADMINISTRADOR');
 if(action==='consent'){
  const evidence=String(b.evidence||'').trim(),consentedAt=new Date(b.consentedAt),expiresAt=new Date(b.expiresAt);
  if(b.confirm!==true||evidence.length<10||evidence.length>1000||!Number.isFinite(+consentedAt)||!Number.isFinite(+expiresAt)||+consentedAt>+new Date(now)||+expiresAt<=+new Date(now)||+expiresAt<=+consentedAt)throw Error('AUTORIZACAO_COMPROVADA_E_VALIDADE_OBRIGATORIAS');
  const p=(await loadJourneyPeople(db,unit,now)).find(x=>x.id===String(b.studentId));if(!p||!p.phone||p.phone!==String(b.phone))throw Error('ALUNO_OU_TELEFONE_NAO_CONFIRMADO');
  const personId=await resolvePerson(db,unit,p);
  await db.batch([db.prepare('UPDATE club_journey_consents SET revoked_at=? WHERE unit=? AND person_id=? AND phone=? AND revoked_at IS NULL').bind(at,unit,personId,p.phone),db.prepare('INSERT INTO club_journey_consents(unit,person_id,student_id,phone,evidence,consented_at,expires_at,actor,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(unit,personId,p.id,p.phone,evidence,consentedAt.toISOString(),expiresAt.toISOString(),String(actor.email||actor.username||actor.id||'admin'),at)]);return {ok:true};
 }
 if(action==='revoke'){await db.prepare('UPDATE club_journey_consents SET revoked_at=? WHERE unit=? AND id=? AND revoked_at IS NULL').bind(at,unit,Number(b.id)).run();return {ok:true};}
 if(action==='preview'||action==='dispatch-plan'){
  const a=await config(db,unit,Number(b.id));if(!a||a.deleted)throw Error('AUTOMACAO_NAO_ENCONTRADA');
  const date=b.date||localParts(now).day;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('DATA_INVALIDA');
  const plan=planFromSnapshot(await journeySnapshot(db,unit,now),a,date);
  return action==='preview'?{...plan,preview:plan.items}:plan;
 }
 if(action==='execute-now'){
  const a=await config(db,unit,Number(b.id));if(!a||a.deleted||!a.enabled)throw Error('AUTOMACAO_DEVE_ESTAR_ATIVA');
  if(b.confirm!==true)throw Error('CONFIRMACAO_OBRIGATORIA');
  const plan=planFromSnapshot(await journeySnapshot(db,unit,now,true),a);
  const eligible=plan.items.filter(p=>p.authorized&&p.group==='today'&&p.scheduledAt&&Date.parse(p.scheduledAt)<=+new Date(now)).map(p=>p.studentId);
  if(!eligible.length)return {ok:true,queued:false,count:0,note:'Nenhum destinatário elegível e autorizado para este horário.'};
  if(eligible.length>50)throw Error('LIMITE_50_ALUNOS_POR_ANTECIPACAO');
  const slot='manual-'+localParts(now).slot.replace(/[^0-9]/g,'')+'-'+crypto.randomUUID().slice(0,8);
  await db.prepare('INSERT INTO club_journey_executions(unit,automation_id,revision,slot,people_json,created_at,detail) VALUES(?,?,?,?,?,?,?)').bind(unit,a.id,a.revision,slot,JSON.stringify(eligible),at,'EXECUCAO_MANUAL_NA_PROGRAMACAO').run();
  return {ok:true,queued:true,count:eligible.length,note:'Execução enfileirada; o motor revalidará consentimento, fase e duplicidade antes de enviar.'};
 }
 if(action==='save'){
  const name=String(b.name||'').trim(),rule=String(b.rule||''),flow=String(b.flowId||''),delay=Number(b.delay),mode=String(b.triggerMode||'delay'),authorize=b.authorizeAll===true,schedule=mode==='instant'?[{days:['0','1','2','3','4','5','6'],time:'00:00'}]:validateSchedules(b.schedules||[{days:b.days,time:b.time}]);
  if(!['instant','day','delay'].includes(mode)||!name||name.length>120||!RULES.includes(rule)||!/^\d{1,15}$/.test(flow)||!Number.isSafeInteger(Number(flow))||Number(flow)<=0||!Number.isInteger(delay)||delay<0||delay>90)throw Error('CONFIGURACAO_INVALIDA');
  if(adapters.validateFlow)await adapters.validateFlow(unit,flow);
  if(b.id){const a=await config(db,unit,Number(b.id));if(!a||a.deleted)throw Error('AUTOMACAO_NAO_ENCONTRADA');await db.batch([db.prepare('UPDATE club_journey_automations SET name=?,rule=?,flow_id=?,days_json=?,time_hhmm=?,delay_days=?,extra_text=?,enabled=0,updated_at=? WHERE id=? AND unit=?').bind(name,rule,flow,JSON.stringify(schedule[0].days),schedule[0].time,delay,JSON.stringify({mode,authorizeAll:authorize,authorizedBy:authorize?String(actor.email||actor.username||actor.id||'admin'):null,authorizedAt:authorize?at:null,schedules:schedule.slice(1)}),at,a.id,unit),db.prepare('INSERT INTO club_journey_automation_state(automation_id,unit,revision) VALUES(?,?,2) ON CONFLICT(automation_id) DO UPDATE SET revision=revision+1,activated_at=NULL').bind(a.id,unit)]);}
  else await db.prepare('INSERT INTO club_journey_automations(unit,name,rule,flow_id,days_json,time_hhmm,delay_days,extra_text,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,?)').bind(unit,name,rule,flow,JSON.stringify(schedule[0].days),schedule[0].time,delay,JSON.stringify({mode,authorizeAll:authorize,authorizedBy:authorize?String(actor.email||actor.username||actor.id||'admin'):null,authorizedAt:authorize?at:null,schedules:schedule.slice(1)}),at,at).run();return {ok:true};
 }
 const a=await config(db,unit,Number(b.id));if(!a||a.deleted)throw Error('AUTOMACAO_NAO_ENCONTRADA');
 if(action==='duplicate'){await db.prepare('INSERT INTO club_journey_automations(unit,name,rule,flow_id,days_json,time_hhmm,delay_days,extra_text,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,0,?,?)').bind(unit,(a.name+' (cópia)').slice(0,120),a.rule,a.flow_id,a.days_json,a.time_hhmm,a.delay_days,a.extra_text,at,at).run();return {ok:true};}
 if(['enable','disable','delete'].includes(action)){
  if(action==='enable'){if(triggerMode(a)!=='instant')validateSchedules(schedulesFor(a));if(adapters.validateFlow)await adapters.validateFlow(unit,a.flow_id);}
  await db.batch([db.prepare('UPDATE club_journey_automations SET enabled=?,updated_at=? WHERE id=? AND unit=?').bind(action==='enable'?1:0,at,a.id,unit),db.prepare('INSERT INTO club_journey_automation_state(automation_id,unit,deleted,activated_at) VALUES(?,?,?,?) ON CONFLICT(automation_id) DO UPDATE SET deleted=excluded.deleted,activated_at=excluded.activated_at,revision=revision+1').bind(a.id,unit,action==='delete'?1:0,action==='enable'?at:null)]);return {ok:true};
 }
 // An unknown/accepted provider outcome must never be blindly replayed.
 if(action==='retry'){await db.prepare("UPDATE club_journey_deliveries SET status='retry',updated_at=? WHERE unit=? AND automation_id=? AND status='failed_before_send'").bind(at,unit,a.id).run();return {ok:true};}
 throw Error('ACAO_INVALIDA');
}
export async function journeyAutomationAdmin(request,env,url,adapters={}){
 const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 const ck=request.headers.get('x-clubpop-admin-cookie')||'';if(!ck)return respond({ok:false,error:'NAO_AUTORIZADO'},401);
 let actor;try{const r=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:ck,Accept:'application/json'}});actor=await r.json();if(!r.ok)return respond({ok:false,error:'NAO_AUTORIZADO'},401);}catch{return respond({ok:false,error:'FALHA_AUTENTICACAO'},503);}
 const unit=String(url.searchParams.get('unit')||'');if(!['admin','reception'].includes(actor.role)||!['bike','gym'].includes(unit)||!actor.units?.includes(unit))return respond({ok:false,error:'UNIDADE_NAO_AUTORIZADA'},403);
 try{await setupJourney(env.DB);if(request.method==='GET')return respond(await journeyListing(env.DB,unit));if(request.method!=='POST')return respond({ok:false,error:'METODO_INVALIDO'},405);const b=await request.json(),result=await mutateJourney(env.DB,unit,b,actor,adapters);if(['history','consents','preview','executions','dispatch-plan','execute-now'].includes(b.action))return respond(result);return respond({...await journeyListing(env.DB,unit),...result});}catch(e){return respond({ok:false,error:String(e.message||'FALHA_AUTOMACAO').slice(0,180)},e.message==='SOMENTE_ADMINISTRADOR'?403:400);}
}
