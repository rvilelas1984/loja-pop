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
   try{await run(env.DB,ps,p,adapters)}catch(e){console.error("LUCKY_DRAW_TICK",p.id,String(e.message||e))}
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
 const row=await env.DB.prepare("SELECT * FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=? ORDER BY created_at DESC LIMIT 1").bind(id,id).first();
 if(!row)return out({ok:true,run:null,events:[]});
 const events=(await env.DB.prepare("SELECT stage,details_json,created_at FROM lucky_draw_events WHERE run_id=? ORDER BY id").bind(row.id).all()).results||[];
 let winner=null;
 if(row.stage==="completed"){
  winner=await env.DB.prepare("SELECT l.code,l.origin,l.reference_month,m.first_name,m.last_name,pa.occurred_at,ah.activity_name,ah.raw_json FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id LEFT JOIN attendance_history ah ON ah.attendance_key=pa.source_ref WHERE l.code=? AND m.id=? LIMIT 1").bind(row.winner_code,row.winner_member).first();
 }
 return out({ok:true,run:row,events,winner});
}
