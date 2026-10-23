// Sorteador POP: isolated from legacy promotional lucky numbers.
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export async function ensureDrawSchema(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draws(id TEXT PRIMARY KEY,unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),title TEXT NOT NULL,prize_name TEXT NOT NULL,prize_location TEXT NOT NULL,draw_at TEXT NOT NULL,winners_count INTEGER NOT NULL DEFAULT 1 CHECK(winners_count BETWEEN 1 AND 50),automatic INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','completed','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_entries(draw_id TEXT NOT NULL,number TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,attendance_ref TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(draw_id,number),FOREIGN KEY(draw_id) REFERENCES pop_draws(id))`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_winners(draw_id TEXT NOT NULL,position INTEGER NOT NULL,number TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,drawn_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(draw_id,position),UNIQUE(draw_id,member_id),FOREIGN KEY(draw_id,number) REFERENCES pop_draw_entries(draw_id,number))`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,draw_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}
function pickIndex(size){if(!Number.isSafeInteger(size)||size<1||size>0xffffffff)throw Error("INVALID_POOL_SIZE");const max=0x100000000,limit=max-(max%size),v=new Uint32Array(1);do{crypto.getRandomValues(v)}while(v[0]>=limit);return v[0]%size}
export function chooseWinners(entries,count){const pool=[...entries],winners=[],used=new Set();while(pool.length&&winners.length<count){const e=pool.splice(pickIndex(pool.length),1)[0];if(used.has(String(e.member_id)))continue;used.add(String(e.member_id));winners.push(e)}return winners}
export async function executePopDraw(db,id,now=new Date().toISOString(),manual=false){
 await ensureDrawSchema(db);
 const draw=await db.prepare("SELECT * FROM pop_draws WHERE id=?").bind(id).first();
 if(!draw)throw Error("SORTEIO_NAO_ENCONTRADO");
 if(draw.status==="completed")return {ok:true,alreadyCompleted:true,winners:(await db.prepare("SELECT * FROM pop_draw_winners WHERE draw_id=? ORDER BY position").bind(id).all()).results||[]};
 if(draw.status!=="scheduled")throw Error("SORTEIO_NAO_PROGRAMADO");
 if(!manual&&!draw.automatic)throw Error("SORTEIO_MANUAL");
 if(!manual&&Date.parse(draw.draw_at)>Date.parse(now))throw Error("AINDA_NAO_PROGRAMADO");
 const entries=(await db.prepare("SELECT number,member_id,member_name FROM pop_draw_entries WHERE draw_id=? ORDER BY number").bind(id).all()).results||[];
 if(!entries.length)throw Error("SEM_PARTICIPANTES_CONFIRMADOS");
 const winners=chooseWinners(entries,draw.winners_count);
 if(winners.length<draw.winners_count)throw Error("PARTICIPANTES_INSUFICIENTES");
 // Single D1 transaction: status claim, winners and audit are atomic; prevents duplicate runs.
 const stmts=[db.prepare("UPDATE pop_draws SET status='completed',completed_at=? WHERE id=? AND status='scheduled'").bind(now,id),...winners.map((w,i)=>db.prepare("INSERT INTO pop_draw_winners(draw_id,position,number,member_id,member_name) SELECT ?,?,?,?,? WHERE (SELECT status FROM pop_draws WHERE id=?)='completed'").bind(id,i+1,w.number,w.member_id,w.member_name,id)),db.prepare("INSERT INTO pop_draw_logs(draw_id,action,details) VALUES(?,?,?)").bind(id,"completed",JSON.stringify({manual,numberOfEntries:entries.length,winners:winners.map(w=>w.number)}))];
 await db.batch(stmts);
 return {ok:true,winners:winners.map((w,i)=>({position:i+1,...w}))};
}
export async function popDrawTick(env){
 try{await ensureDrawSchema(env.DB);const now=new Date().toISOString();const due=(await env.DB.prepare("SELECT id FROM pop_draws WHERE status='scheduled' AND automatic=1 AND draw_at<=? ORDER BY draw_at LIMIT 5").bind(now).all()).results||[];for(const x of due){try{await executePopDraw(env.DB,x.id,now)}catch(e){await env.DB.prepare("INSERT INTO pop_draw_logs(draw_id,action,details) VALUES(?,?,?)").bind(x.id,"error",String(e.message||e).slice(0,300)).run()}}}catch(e){console.error("POP_DRAW_TICK_FAILED",String(e.message||e))}
}
export async function popDrawAdmin(request,env,url){
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return respond({ok:false,error:"NAO_AUTORIZADO"},401);
 let verified;try{verified=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}})}catch{return respond({ok:false,error:"FALHA_AUTENTICACAO"},502)}
 const user=await verified.json().catch(()=>({}));if(!verified.ok||user.role!=="admin")return respond({ok:false,error:"ACESSO_RESTRITO"},403);
 try{
 await ensureDrawSchema(env.DB);
 if(request.method==="GET"){const draws=(await env.DB.prepare("SELECT d.*, (SELECT count(*) FROM pop_draw_entries e WHERE e.draw_id=d.id) participants FROM pop_draws d ORDER BY d.created_at DESC LIMIT 100").all()).results||[];const winners=(await env.DB.prepare("SELECT w.*,d.title,d.prize_name,d.unit,d.completed_at FROM pop_draw_winners w JOIN pop_draws d ON d.id=w.draw_id ORDER BY d.completed_at DESC,w.position LIMIT 30").all()).results||[];return respond({ok:true,draws,winners})}
 if(request.method!=="POST")return respond({ok:false,error:"METODO_INVALIDO"},405);
 const b=await request.json().catch(()=>({})),action=String(b.action||"");
 if(action==="create"){
 const unit=String(b.unit||""),title=String(b.title||"").trim(),prize=String(b.prizeName||"").trim(),place=String(b.prizeLocation||"").trim(),at=String(b.drawAt||""),count=Number(b.winnersCount||1);
 if(!["bike","gym"].includes(unit)||!title||!prize||!place||!Number.isFinite(Date.parse(at))||!Number.isInteger(count)||count<1||count>50)return respond({ok:false,error:"DADOS_INVALIDOS"},400);
 const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO pop_draws(id,unit,title,prize_name,prize_location,draw_at,winners_count,automatic,status) VALUES(?,?,?,?,?,?,?,?, 'draft')").bind(id,unit,title,prize,place,new Date(at).toISOString(),count,b.automatic?1:0).run();return respond({ok:true,id});
 }
 if(action==="schedule"){const r=await env.DB.prepare("UPDATE pop_draws SET status='scheduled' WHERE id=? AND status='draft'").bind(String(b.id||"")).run();return respond({ok:!!r.meta?.changes},r.meta?.changes?200:409)}
 if(action==="draw"){const result=await executePopDraw(env.DB,String(b.id||""),new Date().toISOString(),true);return respond(result)}
 return respond({ok:false,error:"ACAO_INVALIDA"},400);
 }catch(e){return respond({ok:false,error:String(e.message||e)},409)}
}
