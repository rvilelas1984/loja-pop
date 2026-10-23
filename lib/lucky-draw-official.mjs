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
 await db.batch([db.prepare("UPDATE lucky_draw_runs SET stage=?,details_json=? WHERE id=?").bind(stage,JSON.stringify(details),id),db.prepare("INSERT INTO lucky_draw_events(run_id,stage,details_json) VALUES(?,?,?)").bind(id,stage,JSON.stringify(details))]);
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
   const recovered=await db.prepare("UPDATE lucky_draw_runs SET stage='blocked' WHERE id=? AND stage=? AND COALESCE((SELECT MAX(created_at) FROM lucky_draw_events WHERE run_id=?),created_at)<datetime('now','-30 minutes')").bind(prior.id,prior.stage,prior.id).run();
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
  const audited=await auditParticipants(db,units,adapters,(stage,details)=>log(db,id,stage,details),Number(JSON.parse(prior?.details_json||"{}").evoRequests||0));
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
  await db.prepare("UPDATE lucky_draw_runs SET stage='completed',cutoff_at=?,pool_hash=?,winner_code=?,winner_unit=?,winner_member=?,completed_at=CURRENT_TIMESTAMP,details_json=? WHERE id=? AND stage='consolidating'").bind(new Date().toISOString(),hash,winner.code,winner.unit,winner.memberId,JSON.stringify({...metrics,summary,eligibleNumbers:pool.length,auditCompleted:true,percent:100}),id).run();
  await db.prepare("INSERT INTO lucky_draw_events(run_id,stage,details_json) VALUES(?,?,?)").bind(id,"completed",JSON.stringify({code:winner.code,unit:winner.unit,memberId:winner.memberId,hash})).run();
  return {ok:true,id,winner,summary};
 }catch(e){const state=await db.prepare("SELECT details_json FROM lucky_draw_runs WHERE id=?").bind(id).first();await log(db,id,"blocked",{...JSON.parse(state?.details_json||"{}"),error:String(e.message||e)});return {ok:false,id,error:String(e.message||e)}}
}
async function promotions(env){const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();return JSON.parse(row?.content_json||"{}").promotions||[]}
export async function luckyDrawTick(env,adapters){
 try{
  const ps=(await promotions(env)).filter(p=>p.promotionType==="lucky_number"&&p.luckyNumber?.enabled&&p.drawAt&&p.status==="Ativo");
  for(const p of ps){
   if(Date.parse(p.drawAt)>Date.now())continue;
   if(ps.some(q=>q.id!==p.id&&q.combinedDraw?.enabled&&q.combinedDraw.unit===p.unit&&normalize(q.name)===normalize(p.name)&&(!p.combinedDraw?.enabled||String(q.id)<String(p.id))))continue;
   try{
    const existing=await env.DB.prepare("SELECT stage FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=? LIMIT 1").bind(String(p.id),String(p.id)).first();
    if(existing?.stage==='completed')continue;
    const linked=pair(ps,p),units=linked?[p,linked]:[p];
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_preparation(promotion_id TEXT PRIMARY KEY,stage TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
    const save=async(stage,details)=>env.DB.prepare("INSERT INTO lucky_draw_preparation(promotion_id,stage,details_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(promotion_id) DO UPDATE SET stage=excluded.stage,details_json=excluded.details_json,updated_at=CURRENT_TIMESTAMP").bind(String(p.id),stage,JSON.stringify(details)).run();
    // Execute the SAME existing EVO sync implementations as the automation center.
    // Persist each completed step so a cron retry never repeats an EVO request.
    const previous=await env.DB.prepare("SELECT stage,details_json FROM lucky_draw_preparation WHERE promotion_id=?").bind(String(p.id)).first();
    const prior=JSON.parse(previous?.details_json||'{}');
    if(!prior.syncCompleted){
      if(!adapters?.syncNow)throw Error('SINCRONIZACAO_IMEDIATA_INDISPONIVEL');
      const drawDay=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.drawAt));
      const yesterday=new Date(drawDay+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
      const days=[yesterday.toISOString().slice(0,10),drawDay];
      const steps=[];
      for(const kind of ['student','contract'])for(const u of units)steps.push({kind,unit:u.unit});
      for(const day of days)for(const u of units)steps.push({kind:'attendance',unit:u.unit,date:day});
      // A successful Automation Center run within the TWO HOURS BEFORE the draw
      // can satisfy the same source-data gate without repeating EVO requests.
      // Never accept runs after the scheduled draw or runs with unknown status.
      const drawTime=Date.parse(p.drawAt);
      const minTime=new Date(drawTime-2*60*60*1000).toISOString().replace('T',' ').slice(0,19);
      const maxTime=new Date(drawTime).toISOString().replace('T',' ').slice(0,19);
      const statuses=await Promise.all(steps.map(async step=>{
        const key='draw-'+String(p.id)+'-'+step.kind+'-'+step.unit+(step.date?'-'+step.date:'');
        const exact=await env.DB.prepare("SELECT status FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND scheduled_minute=?").bind(step.unit,step.kind,key).first();
        if(exact?.status==='done')return exact;
        // Attendance is date-scoped: a generic sync cannot prove that BOTH
        // required dates were covered, so only reuse date-specific records.
        const scoped=step.kind==='attendance'
          ?await env.DB.prepare("SELECT status FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND status='done' AND updated_at BETWEEN ? AND ? AND (scheduled_minute LIKE ? OR scheduled_minute LIKE ?) ORDER BY updated_at DESC LIMIT 1").bind(step.unit,step.kind,minTime,maxTime,'%'+step.date+'%','%'+step.date.replaceAll('-','')+'%').first()
          :await env.DB.prepare("SELECT status FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND status='done' AND updated_at BETWEEN ? AND ? ORDER BY updated_at DESC LIMIT 1").bind(step.unit,step.kind,minTime,maxTime).first();
        return scoped||exact;
      }));
      // Resume from persisted successful runs, not a volatile progress counter.
      // Continue through transitions in this invocation; a later cron safely resumes
      // any unfinished step if Worker execution is interrupted.
      for(let idx=0;idx<steps.length;idx++){
        if(statuses[idx]?.status==='done')continue;
        const step=steps[idx],key='draw-'+String(p.id)+'-'+step.kind+'-'+step.unit+(step.date?'-'+step.date:'');
        await save('syncing_data',{syncIndex:idx,syncTotal:steps.length,syncCompleted:false,current:step,phase:1,phasePercent:Math.round(idx/steps.length*100)});
        const result=await adapters.syncNow(step.kind,step.unit,key,step.date);
        const confirmed=await env.DB.prepare("SELECT status FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND scheduled_minute=?").bind(step.unit,step.kind,key).first();
        if(confirmed?.status!=='done')throw Error('SINCRONIZACAO_NAO_CONFIRMADA_'+step.kind+'_'+step.unit+(step.date?'_'+step.date:''));
        statuses[idx]=confirmed;
        await save('syncing_data',{syncIndex:idx+1,syncTotal:steps.length,syncCompleted:false,completed:step,phase:1,phasePercent:Math.round((idx+1)/steps.length*100)});
      }
      await save('syncing_data',{syncIndex:steps.length,syncTotal:steps.length,syncCompleted:true,phase:1,phasePercent:100});
    }
    // Freeze the source-data gate before the existing number generator runs.
    // Daily attendance sync remains the source of truth; never rescan a full month.
    const cutoff=new Date(p.drawAt);
    const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(cutoff);
    const prev=new Date(localDate+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()-1);
    const prevDate=prev.toISOString().slice(0,10);
    const freshness=[];
    for(const u of units){
     const student=await env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit=? AND is_current=1").bind(u.unit).first();
     const contract=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) latest FROM evo_member_contracts WHERE unit=?").bind(u.unit).first();
     const attendance=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) latest FROM evo_attendance_sessions WHERE unit=? AND activity_date BETWEEN ? AND ?").bind(u.unit,prevDate,localDate).first();
     freshness.push({unit:u.unit,students:Number(student?.n||0),contracts:Number(contract?.n||0),contractsLatest:contract?.latest||null,lastTwoDaysSessions:Number(attendance?.n||0),attendanceLatest:attendance?.latest||null});
    }
    await save('updating_data',{phase:1,phasePercent:0,units:freshness,checked:freshness.reduce((n,x)=>n+x.students,0),total:freshness.reduce((n,x)=>n+x.students,0),note:'Base D1 localizada; sincronização EVO extraordinária ainda não confirmada'});
    if(freshness.some(x=>!x.students||!x.contracts))throw Error('BASE_D1_INCOMPLETA_ALUNOS_OU_CONTRATOS');
    await save('validating_contracts',{phase:2,phasePercent:0,units:freshness,note:'Contratos localizados no D1; elegibilidade individual ainda pendente'});
    await save('auditing_numbers',{phase:3,phasePercent:0,units:freshness,note:'Histórico D1 preservado; conferência individual ainda pendente'});
    const summaries=[];
    let ready=true;
    for(const u of units){
     if(!env.AUTO_SYNC_SECRET)throw Error("SEGREDO_SINCRONIZACAO_AUSENTE");
     const endpoint="https://club-pop-api.renato-vilelas-personal.workers.dev/promotion-numbers/admin/generate-batch";
     const state=await env.DB.prepare("SELECT status,checked,generated,errors FROM promotion_number_update_state WHERE promotion_slug=?").bind(String(u.id)).first().catch(()=>null);
     if(state?.status==='COMPLETE'&&Number(state.errors||0)===0){
      summaries.push({unit:u.unit,done:true,checked:Number(state.checked||0),generated:Number(state.generated||0)});
      continue;
     }
     let data=null;
     // A bounded number of batches per cron avoids exhausting Worker execution time.
     for(let batch=0;batch<4;batch++){
      const resp=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","x-auto-sync-secret":env.AUTO_SYNC_SECRET},body:JSON.stringify({promotionId:u.id,take:10})});
      data=await resp.json().catch(()=>({}));
      if(!resp.ok||!data.ok)throw Error("GERACAO_NUMEROS_"+u.unit+"_"+String(data.error||resp.status));
      if(data.batch?.errors?.length||Number(data.progress?.errors||0)>0)throw Error("PENDENCIAS_GERACAO_"+u.unit);
      if(data.done)break;
     }
     summaries.push({unit:u.unit,done:!!data?.done,checked:Number(data?.progress?.checked||0),generated:Number(data?.progress?.generated||0)});
     if(!data?.done)ready=false;
    }
    const checked=summaries.reduce((n,u)=>n+u.checked,0);
    const generated=summaries.reduce((n,u)=>n+u.generated,0);
    const totalRows=await Promise.all(units.map(u=>env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit=? AND is_current=1").bind(u.unit).first()));
    const total=totalRows.reduce((n,r)=>n+Number(r?.n||0),0);
    const details={total,checked,generated,units:summaries,percent:total?Math.min(99,Math.round(checked/total*100)):0};
    await save(ready?'generation_completed':'generating_numbers',details);
    if(!ready)continue;
    await run(env.DB,ps,p,adapters);
   }catch(e){
    console.error("LUCKY_DRAW_TICK",p.id,String(e.message||e));
    try{await env.DB.prepare("INSERT INTO lucky_draw_preparation(promotion_id,stage,details_json,updated_at) VALUES(?,'blocked',?,CURRENT_TIMESTAMP) ON CONFLICT(promotion_id) DO UPDATE SET stage='blocked',details_json=excluded.details_json,updated_at=CURRENT_TIMESTAMP").bind(String(p.id),JSON.stringify({error:String(e.message||e)})).run()}catch{}
   }
  }
 }catch(e){console.error("LUCKY_DRAW_TICK",String(e.message||e))}
}
export async function luckyDrawStatus(request,env,url){
 const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!cookie)return out({ok:false,error:"NAO_AUTORIZADO"},401);
 const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"}});
 if(!vr.ok||(await vr.json().catch(()=>({}))).role!=="admin")return out({ok:false,error:"ACESSO_RESTRITO"},403);
 await init(env.DB);
 const id=String(url.searchParams.get("promotion")||"");
 if(!id)return out({ok:false,error:"PROMOCAO_OBRIGATORIA"},400);
 const prep=await env.DB.prepare("SELECT stage,details_json,updated_at FROM lucky_draw_preparation WHERE promotion_id=?").bind(id).first().catch(()=>null);
 const row=await env.DB.prepare("SELECT * FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=? ORDER BY created_at DESC LIMIT 1").bind(id,id).first();
 if(prep&&(!row||row.stage!=='completed')&&['syncing_data','updating_data','validating_contracts','auditing_numbers','generating_numbers','generation_completed','blocked'].includes(prep.stage)){
  return out({ok:true,run:{stage:prep.stage,details_json:prep.details_json,created_at:prep.updated_at},events:[]});
 }
 if(!row){
  const prep=await env.DB.prepare("SELECT stage,details_json,updated_at FROM lucky_draw_preparation WHERE promotion_id=?").bind(id).first().catch(()=>null);
  return out({ok:true,run:prep?{stage:prep.stage,details_json:prep.details_json,created_at:prep.updated_at}:null,events:[]});
 }
 const events=(await env.DB.prepare("SELECT stage,details_json,created_at FROM lucky_draw_events WHERE run_id=? ORDER BY id").bind(row.id).all()).results||[];
 let winner=null;
 if(row.stage==="completed"){
  winner=await env.DB.prepare("SELECT l.code,l.origin,l.reference_month,m.first_name,m.last_name,pa.occurred_at,ah.activity_name,ah.raw_json FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id LEFT JOIN attendance_history ah ON ah.attendance_key=pa.source_ref WHERE l.code=? AND m.id=? LIMIT 1").bind(row.winner_code,row.winner_member).first();
 }
 return out({ok:true,run:row,events,winner});
}
