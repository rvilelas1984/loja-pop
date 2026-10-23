// Apuracao automatica auditavel. Nunca gera ou altera numeros da sorte.
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{"content-type":"application/json","cache-control":"no-store"}});
const normalize=x=>String(x??"").trim().toLowerCase();
const today=()=>new Date().toISOString().slice(0,10);
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
async function numbers(db,p){
 const row=await db.prepare("SELECT id FROM promotions WHERE slug=?").bind(String(p.id)).first();
 if(!row)throw Error("PROMOCAO_SEM_REGISTRO_D1_"+p.unit);
 return (await db.prepare("SELECT l.code,CAST(m.id AS TEXT) member_id,CAST(m.evo_member_id AS TEXT) evo_id FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id WHERE l.promotion_id=? AND l.status='ACTIVE' ORDER BY l.code").bind(row.id).all()).results||[];
}
function contractValid(c,accepted,cutoff){
 return accepted.has(String(c.id_membership))&&["active","1"].includes(normalize(c.membership_status))&&!c.cancel_date&&(!c.end_date||String(c.end_date).slice(0,10)>=cutoff);
}
async function run(db,promotions,p){
 await init(db);
 if(!p.drawAt||!Number.isFinite(Date.parse(p.drawAt)))throw Error("DATA_SORTEIO_INVALIDA");
 const linked=pair(promotions,p);
 if(p.combinedDraw?.enabled&&!linked)throw Error("UNIDADE_VINCULADA_NAO_ENCONTRADA");
 const units=linked?[p,linked]:[p];
 if(units.some(x=>x.eligibility?.mode!=="active_contract"||!Array.isArray(x.eligibility?.acceptedContracts)||!x.eligibility.acceptedContracts.length))throw Error("CONTRATOS_ELEGIVEIS_NAO_CONFIGURADOS");
 let id=crypto.randomUUID();
 const prior=await db.prepare("SELECT id,stage FROM lucky_draw_runs WHERE promotion_id=?").bind(String(p.id)).first();
 if(prior){
  if(prior.stage!=="blocked")return {skipped:true};
  id=prior.id;
  const claim=await db.prepare("UPDATE lucky_draw_runs SET stage='starting',details_json='{}' WHERE id=? AND stage='blocked'").bind(id).run();
  if(!claim.meta?.changes)return {skipped:true};
  await db.prepare("DELETE FROM lucky_draw_pool WHERE run_id=?").bind(id).run();
 }else{
  const claim=await db.prepare("INSERT OR IGNORE INTO lucky_draw_runs(id,promotion_id,linked_id,scheduled_at,stage) VALUES(?,?,?,?,?)").bind(id,String(p.id),linked?String(linked.id):null,String(p.drawAt),"starting").run();
  if(!claim.meta?.changes)return {skipped:true};
 }
 try{
  await log(db,id,"validating_contracts",{message:"Conferindo contratos sincronizados das unidades",units:units.map(x=>x.unit)});
  const pool=[],summary={},unknown=[];
  for(const u of units){
   const accepted=new Set(u.eligibility.acceptedContracts.map(String)),ns=await numbers(db,u),ids=[...new Set(ns.map(x=>x.evo_id).filter(Boolean))],map=new Map();
   for(let i=0;i<ids.length;i+=120){
    const batch=ids.slice(i,i+120);
    const rr=(await db.prepare("SELECT evo_member_id,id_membership,membership_status,cancel_date,end_date,synced_at FROM evo_member_contracts WHERE unit=? AND CAST(evo_member_id AS TEXT) IN ("+batch.map(()=>"?").join(",")+")").bind(u.unit,...batch).all()).results||[];
    for(const c of rr){const k=String(c.evo_member_id),v=map.get(k)||[];v.push(c);map.set(k,v)}
   }
   let acceptedNumbers=0,excluded=0;
   for(const n of ns){
    const cs=map.get(n.evo_id);
    // Fail closed: stale or missing D1 contracts are never interpreted as cancellations.
    if(!n.evo_id||!cs?.length||cs.some(c=>!c.synced_at||!Number.isFinite(Date.parse(String(c.synced_at).replace(" ","T")+"Z"))||Date.now()-Date.parse(String(c.synced_at).replace(" ","T")+"Z")>24*3600000)){unknown.push(u.unit+":"+n.evo_id);continue}
    if(cs.some(c=>contractValid(c,accepted,today()))){pool.push({promotionId:String(u.id),unit:u.unit,code:n.code,memberId:n.member_id,evoId:n.evo_id});acceptedNumbers++}else excluded++;
   }
   summary[u.unit]={registered:ns.length,eligible:acceptedNumbers,excluded,unknown:unknown.filter(x=>x.startsWith(u.unit+":")).length};
  }
  await log(db,id,"auditing_numbers",{summary,unknown:unknown.length});
  if(unknown.length)throw Error("CONTRATOS_SEM_VERIFICACAO_ATUALIZADA_"+unknown.length);
  if(!pool.length)throw Error("NENHUM_NUMERO_ELEGIVEL");
  pool.sort((a,b)=>a.unit.localeCompare(b.unit)||a.code.localeCompare(b.code));
  const hash=await hex(pool.map(x=>[x.promotionId,x.unit,x.code,x.memberId].join("|")).join("\n"));
  await log(db,id,"consolidating",{summary,eligibleNumbers:pool.length,poolHash:hash});
  for(let i=0;i<pool.length;i+=40){
   await db.batch(pool.slice(i,i+40).map(x=>db.prepare("INSERT INTO lucky_draw_pool(run_id,promotion_id,unit,code,member_id,evo_id) VALUES(?,?,?,?,?,?)").bind(id,x.promotionId,x.unit,x.code,x.memberId,x.evoId)));
  }
  const winner=pool[randomIndex(pool.length)];
  // Unique promotion claim guarantees no second winner; record only after the complete audit.
  await db.prepare("UPDATE lucky_draw_runs SET stage='completed',cutoff_at=?,pool_hash=?,winner_code=?,winner_unit=?,winner_member=?,completed_at=CURRENT_TIMESTAMP,details_json=? WHERE id=? AND stage='consolidating'").bind(new Date().toISOString(),hash,winner.code,winner.unit,winner.memberId,JSON.stringify({summary,eligibleNumbers:pool.length}),id).run();
  await db.prepare("INSERT INTO lucky_draw_events(run_id,stage,details_json) VALUES(?,?,?)").bind(id,"completed",JSON.stringify({code:winner.code,unit:winner.unit,memberId:winner.memberId,hash})).run();
  return {ok:true,id,winner,summary};
 }catch(e){await log(db,id,"blocked",{error:String(e.message||e)});return {ok:false,id,error:String(e.message||e)}}
}
async function promotions(env){const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();return JSON.parse(row?.content_json||"{}").promotions||[]}
export async function luckyDrawTick(env){
 try{
  const ps=(await promotions(env)).filter(p=>p.promotionType==="lucky_number"&&p.luckyNumber?.enabled&&p.drawAt&&Date.parse(p.drawAt)<=Date.now()&&p.status==="Ativo");
  for(const p of ps){
   if(ps.some(q=>q.id!==p.id&&q.combinedDraw?.enabled&&q.combinedDraw.unit===p.unit&&normalize(q.name)===normalize(p.name)))continue;
   try{await run(env.DB,ps,p)}catch(e){console.error("LUCKY_DRAW_TICK",p.id,String(e.message||e))}
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
