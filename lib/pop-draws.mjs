// Sorteador POP: isolated from legacy promotional lucky numbers.
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export async function ensureDrawSchema(db){
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draws(id TEXT PRIMARY KEY,unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),title TEXT NOT NULL,prize_name TEXT NOT NULL,prize_location TEXT NOT NULL,draw_at TEXT NOT NULL,winners_count INTEGER NOT NULL DEFAULT 1 CHECK(winners_count BETWEEN 1 AND 50),automatic INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','completed','cancelled')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,completed_at TEXT)`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_entries(draw_id TEXT NOT NULL,number TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,attendance_ref TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(draw_id,number),FOREIGN KEY(draw_id) REFERENCES pop_draws(id))`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_winners(draw_id TEXT NOT NULL,position INTEGER NOT NULL,number TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,drawn_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(draw_id,position),UNIQUE(draw_id,member_id),FOREIGN KEY(draw_id,number) REFERENCES pop_draw_entries(draw_id,number))`).run();
 await db.prepare(`CREATE TABLE IF NOT EXISTS pop_draw_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,draw_id TEXT NOT NULL,action TEXT NOT NULL,details TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`).run();
}
export async function ensureClassDrawSchema(db){
 await ensureDrawSchema(db);
 await db.prepare("CREATE TABLE IF NOT EXISTS pop_draw_classes(draw_id TEXT NOT NULL,unit TEXT NOT NULL,session_id TEXT NOT NULL,activity_date TEXT NOT NULL,PRIMARY KEY(draw_id,unit,session_id))").run();
 await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS pop_draw_entry_attendance_unique ON pop_draw_entries(draw_id,attendance_ref)").run();
}
export async function reconcileClassDraw(db,id){
 await ensureClassDrawSchema(db);
 const draw=await db.prepare("SELECT * FROM pop_draws WHERE id=?").bind(id).first();
 if(!draw||draw.status!=="scheduled")return {ready:false,reason:"NOT_SCHEDULED"};
 const classes=(await db.prepare("SELECT c.session_id,c.activity_date,s.status FROM pop_draw_classes c LEFT JOIN evo_attendance_sessions s ON s.unit=c.unit AND s.id_activity_session=c.session_id WHERE c.draw_id=?").bind(id).all()).results||[];
 if(!classes.length)return {ready:false,reason:"NO_CLASSES"};
 if(classes.some(c=>c.status!=="done"))return {ready:false,reason:"ATTENDANCE_NOT_FINAL",classes:classes.length};
 const attendees=(await db.prepare("SELECT DISTINCT a.evo_member_id,a.id_activity_session FROM evo_member_attendance a JOIN pop_draw_classes c ON c.unit=a.unit AND c.session_id=a.id_activity_session WHERE c.draw_id=? AND a.unit=? ORDER BY a.evo_member_id,a.id_activity_session").bind(id,draw.unit).all()).results||[];
 const members=new Map();
 for(const a of attendees){const idMember=String(a.evo_member_id);if(members.has(idMember))continue;const member=await db.prepare("SELECT first_name,last_name FROM members WHERE CAST(evo_member_id AS TEXT)=? LIMIT 1").bind(idMember).first();members.set(idMember,[member?.first_name,member?.last_name].filter(Boolean).join(" ").trim()||"Aluno EVO "+idMember)}
 // A participant gets exactly one number per draw, even if attending multiple selected classes.
 const existing=(await db.prepare("SELECT member_id,number FROM pop_draw_entries WHERE draw_id=?").bind(id).all()).results||[];
 const used=new Set(existing.map(e=>String(e.member_id)));
 const statements=[];
 for(const memberId of members.keys()){if(used.has(memberId))continue;used.add(memberId);const attendanceRef="evo:"+memberId;statements.push(db.prepare("INSERT OR IGNORE INTO pop_draw_entries(draw_id,number,member_id,member_name,attendance_ref) VALUES(?,?,?,?,?)").bind(id,crypto.randomUUID(),memberId,members.get(memberId),attendanceRef))}
 for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
 return {ready:true,classes:classes.length,eligible:members.size,inserted:statements.length};
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
 const classCount=await db.prepare("SELECT COUNT(*) n FROM pop_draw_classes WHERE draw_id=?").bind(id).first().catch(()=>({n:0}));
 if(Number(classCount?.n||0)){const state=await reconcileClassDraw(db,id);if(!state.ready)throw Error(state.reason)}
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
 try{await ensureDrawSchema(env.DB);const now=new Date().toISOString();const active=(await env.DB.prepare("SELECT DISTINCT d.id FROM pop_draws d JOIN pop_draw_classes c ON c.draw_id=d.id WHERE d.status='scheduled' ORDER BY d.draw_at LIMIT 15").all().catch(()=>({results:[]}))).results||[];
 for(const a of active){try{await reconcileClassDraw(env.DB,a.id)}catch(e){console.error("POP_DRAW_SYNC_FAILED",a.id,String(e.message||e))}}
 const due=(await env.DB.prepare("SELECT id FROM pop_draws WHERE status='scheduled' AND automatic=1 AND draw_at<=? ORDER BY draw_at LIMIT 5").bind(now).all()).results||[];for(const x of due){try{await executePopDraw(env.DB,x.id,now)}catch(e){await env.DB.prepare("INSERT INTO pop_draw_logs(draw_id,action,details) VALUES(?,?,?)").bind(x.id,"error",String(e.message||e).slice(0,300)).run()}}}catch(e){console.error("POP_DRAW_TICK_FAILED",String(e.message||e))}
}
export async function popDrawAdmin(request,env,url){
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return respond({ok:false,error:"NAO_AUTORIZADO"},401);
 let verified;try{verified=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}})}catch{return respond({ok:false,error:"FALHA_AUTENTICACAO"},502)}
 const user=await verified.json().catch(()=>({}));if(!verified.ok||user.role!=="admin")return respond({ok:false,error:"ACESSO_RESTRITO"},403);
 try{
 await ensureDrawSchema(env.DB);
 if(request.method==="GET"&&url.searchParams.get("action")==="classes"){
 const unit=String(url.searchParams.get("unit")||"");const start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
 if(!["bike","gym"].includes(unit)||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start||Date.parse(end)-Date.parse(start)>31*86400000)return respond({ok:false,error:"FILTRO_INVALIDO"},400);
 const rows=(await env.DB.prepare("SELECT id_activity_session id,activity_date date,start_time time,activity_name activity,status FROM evo_attendance_sessions WHERE unit=? AND activity_date BETWEEN ? AND ? ORDER BY activity_date,start_time LIMIT 200").bind(unit,start,end).all()).results||[];return respond({ok:true,classes:rows});
 }
 if(request.method==="GET"&&url.searchParams.get("action")==="draw-classes"){await ensureClassDrawSchema(env.DB);const id=String(url.searchParams.get("id")||"");const classes=(await env.DB.prepare("SELECT session_id,activity_date,unit FROM pop_draw_classes WHERE draw_id=? ORDER BY activity_date").bind(id).all()).results||[];return respond({ok:true,classes})}
 if(request.method==="GET"){const draws=(await env.DB.prepare("SELECT d.*, (SELECT count(*) FROM pop_draw_entries e WHERE e.draw_id=d.id) participants FROM pop_draws d ORDER BY d.created_at DESC LIMIT 100").all()).results||[];const winners=(await env.DB.prepare("SELECT w.*,d.title,d.prize_name,d.unit,d.completed_at FROM pop_draw_winners w JOIN pop_draws d ON d.id=w.draw_id ORDER BY d.completed_at DESC,w.position LIMIT 30").all()).results||[];return respond({ok:true,draws,winners})}
 if(request.method!=="POST")return respond({ok:false,error:"METODO_INVALIDO"},405);
 const b=await request.json().catch(()=>({})),action=String(b.action||"");
 if(action==="create"){
 const unit=String(b.unit||""),title=String(b.title||"").trim(),prize=String(b.prizeName||"").trim(),place=String(b.prizeLocation||"").trim(),at=String(b.drawAt||""),count=Number(b.winnersCount||1);
 if(!["bike","gym"].includes(unit)||!title||!prize||!place||!Number.isFinite(Date.parse(at))||!Number.isInteger(count)||count<1||count>50)return respond({ok:false,error:"DADOS_INVALIDOS"},400);
 const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO pop_draws(id,unit,title,prize_name,prize_location,draw_at,winners_count,automatic,status) VALUES(?,?,?,?,?,?,?,?, 'draft')").bind(id,unit,title,prize,place,new Date(at).toISOString(),count,b.automatic?1:0).run();return respond({ok:true,id});
 }
 if(action==="create-class-promotion"){
 const unit=String(b.unit||""),title=String(b.title||"").trim(),prize=String(b.prizeName||"").trim(),place=String(b.prizeLocation||"").trim(),at=String(b.drawAt||""),count=Number(b.winnersCount||1),ids=[...new Set((Array.isArray(b.classIds)?b.classIds:[]).map(String))];
 if(!["bike","gym"].includes(unit)||!title||!prize||!place||!Number.isFinite(Date.parse(at))||Date.parse(at)<=Date.now()||!Number.isInteger(count)||count<1||count>50||!ids.length||ids.length>30||ids.some(x=>!/^[0-9]{1,20}$/.test(x)))return respond({ok:false,error:"DADOS_INVALIDOS"},400);
 await ensureClassDrawSchema(env.DB);
 const sessions=(await env.DB.prepare("SELECT id_activity_session,activity_date FROM evo_attendance_sessions WHERE unit=? AND id_activity_session IN ("+ids.map(()=>"?").join(",")+")").bind(unit,...ids).all()).results||[];
 if(sessions.length!==ids.length)return respond({ok:false,error:"AULA_NAO_ENCONTRADA_NO_D1"},400);
 if(sessions.some(x=>Date.parse(x.activity_date+"T23:59:59-03:00")>=Date.parse(at)))return respond({ok:false,error:"SORTEIO_ANTES_DA_AULA"},400);
 const id=crypto.randomUUID();
 const statements=[env.DB.prepare("INSERT INTO pop_draws(id,unit,title,prize_name,prize_location,draw_at,winners_count,automatic,status) VALUES(?,?,?,?,?,?,?,?,'scheduled')").bind(id,unit,title,prize,place,new Date(at).toISOString(),count,b.automatic?1:0),...sessions.map(x=>env.DB.prepare("INSERT INTO pop_draw_classes(draw_id,unit,session_id,activity_date) VALUES(?,?,?,?)").bind(id,unit,String(x.id_activity_session),x.activity_date))];
 await env.DB.batch(statements);return respond({ok:true,id,classes:sessions.length,status:"scheduled"});
 }
 if(action==="sync-entries"){const state=await reconcileClassDraw(env.DB,String(b.id||""));return respond({ok:true,...state})}
 if(action==="schedule"){const r=await env.DB.prepare("UPDATE pop_draws SET status='scheduled' WHERE id=? AND status='draft'").bind(String(b.id||"")).run();return respond({ok:!!r.meta?.changes},r.meta?.changes?200:409)}
 if(action==="draw"){const result=await executePopDraw(env.DB,String(b.id||""),new Date().toISOString(),true);return respond(result)}
 return respond({ok:false,error:"ACAO_INVALIDA"},400);
 }catch(e){return respond({ok:false,error:String(e.message||e)},409)}
}
