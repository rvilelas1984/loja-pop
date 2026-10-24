import {acquireDrawLease,releaseDrawLease} from './lucky-draw-data.mjs';
import {auditParticipants} from './lucky-draw-audit.mjs';
// Apuracao automatica auditavel. Nunca gera ou altera numeros da sorte.
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const normalize=x=>String(x??"").trim().toLowerCase();
function randomIndex(n){if(!Number.isSafeInteger(n)||n<1||n>0xffffffff)throw Error("POOL_INVALIDO");const max=4294967296,limit=max-max%n,b=new Uint32Array(1);do{crypto.getRandomValues(b)}while(b[0]>=limit);return b[0]%n}
const hex=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(n=>n.toString(16).padStart(2,"0")).join("");
async function init(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_runs(id TEXT PRIMARY KEY,promotion_id TEXT NOT NULL UNIQUE,linked_id TEXT,scheduled_at TEXT NOT NULL,cutoff_at TEXT,stage TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',pool_hash TEXT,winner_code TEXT,winner_unit TEXT,winner_member TEXT,completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_pool(run_id TEXT NOT NULL,promotion_id TEXT NOT NULL,unit TEXT NOT NULL,code TEXT NOT NULL,member_id TEXT NOT NULL,evo_id TEXT NOT NULL,PRIMARY KEY(run_id,promotion_id,code))").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_events(id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,stage TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
}
async function log(db,id,stage,details){
 await db.batch([db.prepare("UPDATE lucky_draw_runs SET stage=?,details_json=? WHERE id=? AND completed_at IS NULL").bind(stage,JSON.stringify(details),id),db.prepare("INSERT INTO lucky_draw_events(run_id,stage,details_json) VALUES(?,?,?)").bind(id,stage,JSON.stringify(details))]);
}
function pair(promotions,p){
 if(!p.combinedDraw?.enabled)return null;
 return promotions.find(q=>q.id!==p.id&&q.unit===p.combinedDraw.unit&&normalize(q.name)===normalize(p.name)&&q.promotionType==="lucky_number")||null;
}
async function run(db,promotions,p,adapters){
 await init(db);
 if(!p.drawAt||!Number.isFinite(Date.parse(p.drawAt)))throw Error("DATA_SORTEIO_INVALIDA");
 if(Date.parse(p.drawAt)>Date.now())return {skipped:true};
 const linked=pair(promotions,p);
 if(p.combinedDraw?.enabled&&!linked)throw Error("UNIDADE_VINCULADA_NAO_ENCONTRADA");
 const units=linked?[p,linked]:[p];
 if(units.some(x=>!x.drawAt||Date.parse(x.drawAt)>Date.now()))return {skipped:true};
 let id=crypto.randomUUID();
 const prior=await db.prepare("SELECT id,stage,details_json FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=?").bind(String(p.id),String(p.id)).first();
 if(prior){
  if(prior.stage!=="blocked"){
   if(prior.stage==='completed')return {skipped:true};
   const recovered=await db.prepare("UPDATE lucky_draw_runs SET stage='blocked' WHERE id=? AND stage=? AND COALESCE((SELECT MAX(created_at) FROM lucky_draw_events WHERE run_id=?),created_at)<datetime('now','-5 minutes')").bind(prior.id,prior.stage,prior.id).run();
   if(!recovered.meta?.changes)return {skipped:true};
  }
  id=prior.id;
  const claim=await db.prepare("UPDATE lucky_draw_runs SET stage='starting' WHERE id=? AND stage='blocked'").bind(id).run();
  if(!claim.meta?.changes)return {skipped:true};
  await db.prepare("DELETE FROM lucky_draw_pool WHERE run_id=?").bind(id).run();
 }else{
  const claim=await db.prepare("INSERT OR IGNORE INTO lucky_draw_runs(id,promotion_id,linked_id,scheduled_at,stage) VALUES(?,?,?,?,?)").bind(id,String(p.id),linked?String(linked.id):null,String(p.drawAt),"starting").run();
  if(!claim.meta?.changes)return {skipped:true};
 }
 try{
  const audited=await auditParticipants(db,units,adapters,(stage,details)=>log(db,id,stage,details).then(()=>adapters.heartbeat?.()),Number(JSON.parse(prior?.details_json||"{}").evoRequests||0));
  const {pool,summary,...metrics}=audited;
  if(!pool.length)throw Error("NENHUM_NUMERO_ELEGIVEL");
  pool.sort((a,b)=>a.unit.localeCompare(b.unit)||a.code.localeCompare(b.code));
  const hash=await hex(pool.map(x=>[x.promotionId,x.unit,x.code,x.memberId].join("|")).join("\n"));
  await log(db,id,"consolidating",{...metrics,summary,eligibleNumbers:pool.length,poolHash:hash,auditCompleted:true,percent:100});
  for(let i=0;i<pool.length;i+=40){
   await db.batch(pool.slice(i,i+40).map(x=>db.prepare("INSERT INTO lucky_draw_pool(run_id,promotion_id,unit,code,member_id,evo_id) VALUES(?,?,?,?,?,?)").bind(id,x.promotionId,x.unit,x.code,x.memberId,x.evoId)));
  }
  const current=await db.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();
  const configured=JSON.parse(current?.content_json||'{}').promotions||[];
  if(units.some(u=>JSON.stringify(configured.find(x=>String(x.id)===String(u.id)))!==JSON.stringify(u)))throw Error('CONFIGURACAO_ALTERADA_DURANTE_AUDITORIA');
  const winner=pool[randomIndex(pool.length)];
  // Unique promotion claim guarantees no second winner; record only after the complete audit.
  const committed=await db.prepare("UPDATE lucky_draw_runs SET stage='completed',cutoff_at=?,pool_hash=?,winner_code=?,winner_unit=?,winner_member=?,completed_at=CURRENT_TIMESTAMP,details_json=? WHERE id=? AND stage='consolidating'").bind(new Date().toISOString(),hash,winner.code,winner.unit,winner.memberId,JSON.stringify({...metrics,summary,eligibleNumbers:pool.length,auditCompleted:true,percent:100}),id).run();
  if(committed.meta?.changes!==1)throw Error("RESULTADO_NAO_REGISTRADO");
  await db.prepare("INSERT INTO lucky_draw_events(run_id,stage,details_json) VALUES(?,?,?)").bind(id,"completed",JSON.stringify({code:winner.code,unit:winner.unit,memberId:winner.memberId,hash})).run();
  return {ok:true,id,winner,summary};
 }catch(e){const state=await db.prepare("SELECT details_json FROM lucky_draw_runs WHERE id=?").bind(id).first();await log(db,id,"blocked",{...JSON.parse(state?.details_json||"{}"),error:String(e.message||e)});return {ok:false,id,error:String(e.message||e)}}
}
async function promotions(env){const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();return JSON.parse(row?.content_json||"{}").promotions||[]}
export async function luckyDrawTick(env,adapters){
 const all=await promotions(env),ps=all.filter(p=>p.promotionType==='lucky_number'&&p.luckyNumber?.enabled&&p.drawAt&&p.status==='Ativo'),handled=new Set();
 for(const selected of ps.sort((a,b)=>String(a.unit).localeCompare(String(b.unit)))){
  if(handled.has(String(selected.id))||Date.parse(selected.drawAt)>Date.now())continue;
  const primary=ps.find(q=>q.combinedDraw?.enabled&&pair(ps,q)?.id===selected.id)||selected;
  const linked=pair(ps,primary),units=(linked?[primary,linked]:[primary]).sort((a,b)=>a.unit.localeCompare(b.unit)),p=primary;
  for(const u of units)handled.add(String(u.id));
  if(units.some(u=>!u.drawAt||Date.parse(u.drawAt)>Date.now()))continue;
  if(p.combinedDraw?.enabled&&!linked)continue;
  await init(env.DB);
  const completed=await env.DB.prepare("SELECT stage FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=?").bind(String(p.id),String(p.id)).first();if(completed?.stage==='completed')continue;
  const key='preparation:'+p.id,token=await acquireDrawLease(env.DB,key);if(!token)continue;
  let details={};
  const save=async(stage,patch={})=>{
   details={...details,...patch};
   await env.DB.prepare("INSERT INTO lucky_draw_preparation(promotion_id,stage,details_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(promotion_id) DO UPDATE SET stage=excluded.stage,details_json=excluded.details_json,updated_at=CURRENT_TIMESTAMP").bind(String(p.id),stage,JSON.stringify(details)).run();
   await env.DB.prepare("UPDATE lucky_draw_leases SET expires_at=datetime('now','+180 seconds') WHERE lease_key=? AND token=?").bind(key,token).run();
  };
  try{
   await env.DB.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_preparation(promotion_id TEXT PRIMARY KEY,stage TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
   const previous=await env.DB.prepare('SELECT details_json FROM lucky_draw_preparation WHERE promotion_id=?').bind(String(p.id)).first();
   const old=JSON.parse(previous?.details_json||'{}');details=old.version===2?old:{version:2,startedAt:new Date().toISOString(),sync:[],generation:{},error:null};
   if(units.some(u=>!/^\d{4}-\d{2}-\d{2}$/.test(u.end||'')||Date.parse(u.end+'T23:59:59-03:00')>Date.now()))throw Error('PERIODO_PROMOCAO_NAO_ENCERRADO_OU_INVALIDO');
   const steps=[];for(const kind of ['student','contract'])for(const u of units)steps.push({kind,unit:u.unit});
   for(const u of units){const prior=new Date(u.end+'T12:00:00Z');prior.setUTCDate(prior.getUTCDate()-1);for(const date of [prior.toISOString().slice(0,10),u.end])steps.push({kind:'attendance',unit:u.unit,date})}
   const begun=Date.now();
   for(let idx=0;idx<steps.length;idx++){
    const step=steps[idx];if(details.sync[idx]?.done)continue;
    const min=step.date?new Date(step.date+'T23:59:59-03:00').toISOString().replace('T',' ').slice(0,19):new Date(Date.parse(details.startedAt)-2*3600000).toISOString().replace('T',' ').slice(0,19);
    const recent=await env.DB.prepare("SELECT scheduled_minute,status,detail,updated_at FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND status='done' AND updated_at>=? AND (? IS NULL OR CASE WHEN json_valid(detail) THEN json_extract(detail,'$.date') END=?) ORDER BY updated_at DESC LIMIT 1").bind(step.unit,step.kind,min,step.date||null,step.date||null).first();
    let result=recent;
    if(!result){
     const prior=details.sync[idx]||{},attempt=(prior.attempt||0)+1,runKey='draw-'+p.id+'-'+step.kind+'-'+step.unit+'-'+(step.date||'')+'-'+attempt;
     details.sync[idx]={...step,attempt,runKey,done:false};
     await save('syncing_data',{current:step,syncSteps:steps,error:null});
     await adapters.syncNow(step.kind,step.unit,runKey,step.date);
     result=await env.DB.prepare('SELECT status,detail,updated_at,scheduled_minute FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND scheduled_minute=?').bind(step.unit,step.kind,runKey).first();
    }
    if(result?.status!=='done')throw Error('SINCRONIZACAO_NAO_CONFIRMADA_'+step.kind+'_'+step.unit);
    details.sync[idx]={...step,done:true,run:result};await save('syncing_data',{current:step,syncSteps:steps,error:null});
    if(Date.now()-begun>35000)break;
   }
   if(details.sync.filter(x=>x?.done).length!==steps.length)continue;
   await save('generating_numbers',{syncCompleted:true,error:null});
   for(const u of units){
    if(details.generation[u.unit]?.done)continue;
    for(let batch=0;batch<4;batch++){
     const prior=details.generation[u.unit];await save('generating_numbers',{current:{kind:'numbers',unit:u.unit}});
     const data=await adapters.generate(u,prior?.nextSkip??0);
     details.generation[u.unit]={done:!!data.done,nextSkip:data.nextSkip,checked:Number(data.progress?.checked||0),total:Number(data.totalBase||0),generated:Number(data.progress?.generated||0),errors:Number(data.progress?.errors||0)};
     await save('generating_numbers');
     if(data.batch?.errors?.length||Number(data.progress?.errors||0)){details.generation[u.unit].done=false;details.generation[u.unit].nextSkip=0;throw Error('PENDENCIAS_GERACAO_'+u.unit+'_'+String(data.batch?.errors?.[0]?.error||''))}
     if(data.done||Date.now()-begun>35000)break;
    }
    if(!details.generation[u.unit]?.done||Date.now()-begun>35000)break;
   }
   if(!units.every(u=>details.generation[u.unit]?.done))continue;
   await save('generation_completed',{generationCompleted:true,current:{kind:'audit'}});
   const numberLeases=[];let outcome;
   try{for(const u of units){const t=await acquireDrawLease(env.DB,'numbers:'+u.id,300);if(!t)throw Error('GERACAO_EM_ANDAMENTO');numberLeases.push([u.id,t])}
    outcome=await run(env.DB,ps,p,{...adapters,heartbeat:async()=>{await save('auditing_numbers');for(const [id,t] of numberLeases)await env.DB.prepare("UPDATE lucky_draw_leases SET expires_at=datetime('now','+300 seconds') WHERE lease_key=? AND token=?").bind('numbers:'+id,t).run()}});
   }finally{for(const [id,t] of numberLeases)await releaseDrawLease(env.DB,'numbers:'+id,t)}
   if(outcome?.ok)await save('completed',{auditCompleted:true,runId:outcome.id,summary:outcome.summary});
   else if(outcome?.error){if(/NUMEROS_INCOMPLETOS/.test(outcome.error))details.generation={};await save('blocked',{generationCompleted:!(/NUMEROS_INCOMPLETOS/.test(outcome.error)),error:outcome.error,runId:outcome.id})}
  }catch(e){await save('blocked',{error:String(e.message||e)})}
  finally{await releaseDrawLease(env.DB,key,token)}
 }
}
export async function luckyDrawStatus(request,env,url){
 const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!cookie)return out({ok:false,error:"NAO_AUTORIZADO"},401);
 const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"}});
 if(!vr.ok||(await vr.json().catch(()=>({}))).role!=="admin")return out({ok:false,error:"ACESSO_RESTRITO"},403);
 await init(env.DB);
 const id=String(url.searchParams.get("promotion")||"");
 if(!id)return out({ok:false,error:"PROMOCAO_OBRIGATORIA"},400);
 const ps=await promotions(env),selected=ps.find(p=>String(p.id)===id),primary=selected&&(ps.find(q=>q.combinedDraw?.enabled&&pair(ps,q)?.id===selected.id)||selected);
 const prep=await env.DB.prepare("SELECT stage,details_json,updated_at FROM lucky_draw_preparation WHERE promotion_id=?").bind(String(primary?.id||id)).first().catch(()=>null);
 const row=await env.DB.prepare("SELECT * FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=? ORDER BY created_at DESC LIMIT 1").bind(id,id).first();
 if(!row)return out({ok:true,run:prep?{stage:prep.stage,details_json:prep.details_json,created_at:prep.updated_at}:null,preparation:prep,events:[]});
 const events=(await env.DB.prepare("SELECT stage,details_json,created_at FROM lucky_draw_events WHERE run_id=? ORDER BY id").bind(row.id).all()).results||[];
 let winner=null;
 if(row.stage==="completed"){
  winner=await env.DB.prepare("SELECT l.code,l.origin,l.reference_month,m.first_name,m.last_name,pa.occurred_at,ah.activity_name,ah.raw_json FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id JOIN promotions p ON p.id=l.promotion_id JOIN lucky_draw_pool dp ON dp.run_id=? AND dp.promotion_id=p.slug AND dp.code=l.code AND dp.member_id=CAST(pp.member_id AS TEXT) AND dp.unit=l.studio LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id LEFT JOIN attendance_history ah ON ah.attendance_key=pa.source_ref WHERE l.code=? AND m.id=? LIMIT 1").bind(row.id,row.winner_code,row.winner_member).first();
 }
 return out({ok:true,run:row.stage!=='completed'&&prep&&['syncing_data','generating_numbers','blocked'].includes(prep.stage)?{...row,stage:prep.stage,details_json:prep.details_json}:row,preparation:prep,events,winner});
}
