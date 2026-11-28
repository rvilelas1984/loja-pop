// Pop Games records: one ranking per race and per sex (Bike Pop).
// Desafio de Distância: time to complete the distance (one ranking per distance).
// Autódromo Pop: total time (one ranking per number of laps and lap length) and fastest lap (per lap length).
// The round result carries the bike number; the session knows who rode each bike (and their sex).
// Each student counts once per ranking, with their best mark; the admin can void a wrong mark.
import {participants} from './pop-live-operation.mjs';
const rows=async q=>(await q.all()).results||[];
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
const num=v=>Number(String(v??'').replace(/\D/g,''))||0;
let ready=false;
export async function ensureRecordTables(db){
 if(ready)return;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_records(id INTEGER PRIMARY KEY AUTOINCREMENT,session_id INTEGER NOT NULL,record_key TEXT NOT NULL,label TEXT NOT NULL,
   kind TEXT NOT NULL,sex TEXT,member_ref TEXT NOT NULL,name TEXT,value_s REAL NOT NULL,race_date TEXT,voided INTEGER NOT NULL DEFAULT 0,void_reason TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(session_id,record_key,member_ref))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_records_rank ON pop_live_records(record_key,sex,voided,value_s)'),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_records_member ON pop_live_records(member_ref)'),
  db.prepare('CREATE TABLE IF NOT EXISTS pop_live_records_rounds(session_id INTEGER PRIMARY KEY,processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)'),
 ]);
 ready=true;
}
const kmLabel=m=>m<1000?m+' m':(String(Math.round(m/100)/10).replace('.',','))+' km';
// Which rankings a finished round feeds, and which value of each placing counts (lower is better for all of them).
export function recordKinds(type,cfg){
 cfg=cfg||{};
 // Modo Disputa marks are stored one attempt at a time (recordAttempt), never again from the final result.
 if(cfg.duel)return [];
 if(type==='distance'){const m=Math.round(Number(cfg.m)||Number(cfg.km)*1000||0);if(!m)return [];
  return [{key:'distance:'+m,label:'Distância · '+kmLabel(m),kind:'total',value:p=>p.finish_s}]}
 if(type==='circuit'){const laps=Math.round(Number(cfg.laps)||0),lap=Math.round((Number(cfg.lap_km)||0)*1000);if(!laps||!lap)return [];
  return [{key:'circuit:'+laps+'x'+lap,label:'Autódromo · '+laps+(laps===1?' volta':' voltas'),kind:'total',value:p=>p.finish_s},
   {key:'circuit_lap:'+lap,label:'Autódromo · volta mais rápida',kind:'lap',value:p=>p.best_lap_s}]}
 return [];
}
async function ranking(db,key,sex,limit=10){
 return rows(db.prepare(`SELECT r.member_ref,(SELECT name FROM pop_live_records x WHERE x.member_ref=r.member_ref AND x.name IS NOT NULL ORDER BY x.id DESC LIMIT 1) name,MIN(r.value_s) best,
  (SELECT race_date FROM pop_live_records y WHERE y.member_ref=r.member_ref AND y.record_key=r.record_key AND y.voided=0 ORDER BY y.value_s,y.id LIMIT 1) race_date
  FROM pop_live_records r WHERE r.record_key=? AND r.sex=? AND r.voided=0 GROUP BY r.member_ref ORDER BY best,MIN(r.id) LIMIT ?`).bind(key,sex,limit));
}
async function positionOf(db,key,sex,ref){
 const me=await db.prepare('SELECT MIN(value_s) best FROM pop_live_records WHERE record_key=? AND sex=? AND voided=0 AND member_ref=?').bind(key,sex,ref).first();
 if(me?.best==null)return null;
 const ahead=await db.prepare('SELECT COUNT(*) n FROM (SELECT member_ref,MIN(value_s) b FROM pop_live_records WHERE record_key=? AND sex=? AND voided=0 GROUP BY member_ref) WHERE b<? AND member_ref<>?').bind(key,sex,me.best,ref).first();
 const total=await db.prepare('SELECT COUNT(DISTINCT member_ref) n FROM pop_live_records WHERE record_key=? AND sex=? AND voided=0').bind(key,sex).first();
 return {position:Number(ahead?.n||0)+1,best:me.best,of:Number(total?.n||0)};
}

// Store the marks of one finished round. Returns what the projector shows: new records and each rider's position.
export async function recordRound(db,sid){
 await ensureRecordTables(db);
 const r=await db.prepare('SELECT r.game_type,r.config_json,r.result_json,s.starts_at,s.unit,s.source,s.id FROM pop_live_game_rounds r JOIN pop_live_sessions s ON s.id=r.session_id WHERE r.session_id=?').bind(sid).first();
 if(!r||!r.result_json)return {records:[],positions:[]};
 const kinds=recordKinds(r.game_type,parse(r.config_json)),res=parse(r.result_json);
 await db.prepare('INSERT OR IGNORE INTO pop_live_records_rounds(session_id) VALUES(?)').bind(sid).run();
 if(!kinds.length||!Array.isArray(res?.placings)||(r.unit&&r.unit!=='bike'))return {records:[],positions:[]};
 let people=[];try{people=await participants(db,{id:sid,unit:'bike',source:r.source,starts_at:r.starts_at})}catch{}
 const byBike=new Map(people.filter(p=>p.watch!=null).map(p=>[num(p.watch),p]));
 const date=String(r.starts_at||'').slice(0,10)||null,out={records:[],positions:[]};
 for(const k of kinds){
  const before=new Map();for(const sx of ['m','f'])before.set(sx,(await ranking(db,k.key,sx,1))[0]||null);
  const marks=[];
  for(const p of res.placings){const v=Number(k.value(p));if(!Number.isFinite(v)||v<=0||p.out_s!=null&&k.kind==='total')continue;
   const who=byBike.get(num(p.bike));if(!who)continue;
   const prev=await db.prepare('SELECT MIN(value_s) b FROM pop_live_records WHERE record_key=? AND member_ref=? AND voided=0').bind(k.key,String(who.member_id)).first();
   await db.prepare(`INSERT INTO pop_live_records(session_id,record_key,label,kind,sex,member_ref,name,value_s,race_date) VALUES(?,?,?,?,?,?,?,?,?)
    ON CONFLICT(session_id,record_key,member_ref) DO UPDATE SET value_s=excluded.value_s,sex=excluded.sex,name=excluded.name`).bind(sid,k.key,k.label,k.kind,who.sex||null,String(who.member_id),who.name||p.name||null,Math.round(v*100)/100,date).run();
   marks.push({who,v,prevBest:prev?.b??null});
  }
  for(const sx of ['m','f']){const top=(await ranking(db,k.key,sx,1))[0],old=before.get(sx);
   if(top&&marks.some(m=>String(m.who.member_id)===top.member_ref&&m.who.sex===sx)&&(!old||top.best<old.best))
    out.records.push({key:k.key,label:k.label,sex:sx,name:top.name,value_s:top.best,previous:old?{name:old.name,value_s:old.best}:null})}
  for(const m of marks){if(!m.who.sex)continue;const pos=await positionOf(db,k.key,m.who.sex,String(m.who.member_id));
   if(pos)out.positions.push({key:k.key,label:k.label,sex:m.who.sex,bike:num(m.who.watch),name:m.who.name,value_s:Math.round(m.v*100)/100,position:pos.position,of:pos.of,personal_best:m.prevBest==null||m.v<m.prevBest})}
 }
 return out;
}
// Modo Disputa: one bike, one competitor at a time, flying start after a warm-up lap.
// Its own ranking per distance (Disputa · 200 m), never mixed with the standing-start races; best attempt per person.
export async function recordAttempt(db,sid,who,m,time){
 await ensureRecordTables(db);
 m=Math.round(Number(m)||0);const v=Math.round(Number(time)*100)/100;
 if(!(m>=50&&m<=100000)||!(v>0&&v<36000))throw Object.assign(new Error('TENTATIVA_INVALIDA'),{status:400});
 const key='duel:'+m,label='Disputa · '+kmLabel(m),ref=String(who.member_id),sex=who.sex||null;
 const s=await db.prepare('SELECT starts_at FROM pop_live_sessions WHERE id=?').bind(sid).first();
 const old=sex?(await ranking(db,key,sex,1))[0]||null:null;
 const prev=await db.prepare('SELECT MIN(value_s) b FROM pop_live_records WHERE record_key=? AND member_ref=? AND voided=0').bind(key,ref).first();
 await db.prepare(`INSERT INTO pop_live_records(session_id,record_key,label,kind,sex,member_ref,name,value_s,race_date) VALUES(?,?,?,'duel',?,?,?,?,?)
  ON CONFLICT(session_id,record_key,member_ref) DO UPDATE SET value_s=MIN(value_s,excluded.value_s),sex=excluded.sex,name=excluded.name`).bind(sid,key,label,sex,ref,who.name||null,v,String(s?.starts_at||'').slice(0,10)||null).run();
 const out={records:[],positions:[]};
 if(!sex)return out;
 const top=(await ranking(db,key,sex,1))[0];
 if(top&&top.member_ref===ref&&(!old||top.best<old.best))out.records.push({key,label,sex,name:top.name,value_s:top.best,previous:old?{name:old.name,value_s:old.best}:null});
 const pos=await positionOf(db,key,sex,ref);
 if(pos)out.positions.push({key,label,sex,bike:num(who.watch),name:who.name,value_s:v,position:pos.position,of:pos.of,personal_best:prev?.b==null||v<prev.b});
 return out;
}
// Top marks of a Disputa distance, shown on the TV while the next competitor gets ready.
export async function duelBoard(db,m,limit=3){
 await ensureRecordTables(db);m=Math.round(Number(m)||0);
 const out={};for(const sx of ['m','f'])out[sx]=(await ranking(db,'duel:'+m,sx,limit)).map((r,i)=>({position:i+1,name:r.name,value_s:r.best}));
 return out;
}
// Every Disputa distance with its top marks by sex: the TV rotates them while nobody is on the bike.
export async function duelBoards(db,limit=5,maxKeys=8){
 await ensureRecordTables(db);
 const keys=await rows(db.prepare("SELECT DISTINCT record_key k FROM pop_live_records WHERE voided=0 AND record_key LIKE 'duel:%'"));
 const ms=keys.map(x=>Number(String(x.k).slice(5))).filter(n=>n>0).sort((a,b)=>a-b).slice(0,maxKeys),out={};
 for(const m of ms)out[m]=await duelBoard(db,m,limit);
 return out;
}
// Rounds finished before the records existed: processed once, lazily, when a ranking is read.
export async function backfillRecords(db,limit=40){
 await ensureRecordTables(db);
 const todo=await rows(db.prepare(`SELECT r.session_id FROM pop_live_game_rounds r WHERE r.result_json IS NOT NULL AND r.game_type IN ('distance','circuit')
  AND NOT EXISTS(SELECT 1 FROM pop_live_records_rounds p WHERE p.session_id=r.session_id) ORDER BY r.session_id LIMIT ?`).bind(limit));
 for(const t of todo){try{await recordRound(db,t.session_id)}catch{await db.prepare('INSERT OR IGNORE INTO pop_live_records_rounds(session_id) VALUES(?)').bind(t.session_id).run()}}
 return todo.length;
}
async function keysList(db){
 return rows(db.prepare(`SELECT record_key key,MAX(label) label,MAX(kind) kind,COUNT(DISTINCT CASE WHEN sex='m' THEN member_ref END) men,COUNT(DISTINCT CASE WHEN sex='f' THEN member_ref END) women
  FROM pop_live_records WHERE voided=0 GROUP BY record_key ORDER BY CASE WHEN record_key LIKE 'distance:%' THEN 0 WHEN record_key LIKE 'duel:%' THEN 2 ELSE 1 END,CAST(substr(record_key,instr(record_key,':')+1) AS INTEGER),record_key`));
}
const validKey=k=>/^(distance:\d{2,6}|duel:\d{2,6}|circuit:\d{1,3}x\d{2,6}|circuit_lap:\d{2,6})$/.test(String(k||''));

// Student (Pop Live): list of races, a ranking by sex and the student's own position. refs = ids this student rides with.
export async function studentRecords(db,url,refs,sex){
 await backfillRecords(db);
 const keys=await keysList(db),key=validKey(url.searchParams.get('key'))?url.searchParams.get('key'):keys[0]?.key||null;
 let mySex=sex;if(!mySex&&refs.length){const r=await db.prepare(`SELECT sex FROM pop_live_records WHERE sex IS NOT NULL AND member_ref IN (${refs.map(()=>'?').join(',')}) LIMIT 1`).bind(...refs.map(String)).first();mySex=r?.sex||null}
 const sx=['m','f'].includes(url.searchParams.get('sex'))?url.searchParams.get('sex'):(mySex||'m');
 if(!key)return {ok:true,keys:[],key:null,sex:sx,ranking:[],me:null};
 const list=await ranking(db,key,sx,20);let me=null;
 for(const ref of refs){const pos=await positionOf(db,key,sx,String(ref));if(pos&&(!me||pos.best<me.best))me={...pos,member_ref:String(ref)}}
 if(me){const above=me.position>1?list[me.position-2]:null;me.gap_to_next=above?Math.round((me.best-above.best)*100)/100:null}
 return {ok:true,keys,key,sex:sx,ranking:list.map((x,i)=>({position:i+1,name:x.name,best:x.best,race_date:x.race_date,me:refs.map(String).includes(x.member_ref)})),me};
}

// Admin (Central Pop Live → Recordes): rankings with every mark, void/restore, students without sex.
export async function adminRecords(request,db,url,json){
 await backfillRecords(db,200);
 if(request.method==='GET'){
  const keys=await keysList(db),key=validKey(url.searchParams.get('key'))?url.searchParams.get('key'):keys[0]?.key||null,sx=['m','f'].includes(url.searchParams.get('sex'))?url.searchParams.get('sex'):'m';
  const marks=key?await rows(db.prepare(`SELECT id,session_id,member_ref,name,value_s,race_date,voided,void_reason FROM pop_live_records WHERE record_key=? AND sex=? ORDER BY voided,value_s,id LIMIT 300`).bind(key,sx)):[];
  const noSex=await rows(db.prepare(`SELECT member_ref,MAX(name) name,COUNT(*) marks FROM pop_live_records WHERE sex IS NULL AND voided=0 GROUP BY member_ref ORDER BY name LIMIT 100`));
  return json({ok:true,keys,key,sex:sx,ranking:key?await ranking(db,key,sx,50):[],marks,no_sex:noSex});
 }
 let b={};try{b=await request.json()}catch{}
 if(b.op==='void'||b.op==='restore'){await db.prepare('UPDATE pop_live_records SET voided=?,void_reason=? WHERE id=?').bind(b.op==='void'?1:0,b.op==='void'?String(b.reason||'Anulada pelo admin').slice(0,120):null,Number(b.id)).run();return json({ok:true})}
 if(b.op==='recalculate'){ // e.g. after completing the sex in the registration: rebuild from the saved rounds, keeping voided marks voided
  const voided=await rows(db.prepare('SELECT session_id,record_key,member_ref,void_reason FROM pop_live_records WHERE voided=1'));
  await db.batch([db.prepare('DELETE FROM pop_live_records'),db.prepare('DELETE FROM pop_live_records_rounds')]);
  let n=0;while(await backfillRecords(db,100))n++;
  for(const v of voided)await db.prepare('UPDATE pop_live_records SET voided=1,void_reason=? WHERE session_id=? AND record_key=? AND member_ref=?').bind(v.void_reason,v.session_id,v.record_key,v.member_ref).run();
  return json({ok:true})}
 return json({ok:false,error:'OPERACAO_INVALIDA'},400);
}
