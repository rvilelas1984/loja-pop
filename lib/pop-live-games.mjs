// Pop Games: events (e.g. "Bike Pop Games 1ª Edição") and their rounds (games).
// Every round is a manual Bike Pop Live session, so check-in (CPF lookup, guest pre-registration),
// cadence sensors, start, finish and Pop Fit results reuse the class flow unchanged.
// The game type, its configuration and the final placings live in pop_live_game_rounds.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const rows=async q=>(await q.all()).results||[];
const parse=x=>{try{return JSON.parse(x||'{}')}catch{return {}}};
export const GAME_TYPES={distance:'Desafio de Distância',circuit:'Autódromo Pop',survival:'Sobrevivência',relay:'Revezamento'};

export async function ensureGameTables(db){
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_game_events(id INTEGER PRIMARY KEY,name TEXT NOT NULL,event_date TEXT NOT NULL,location TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_game_rounds(session_id INTEGER PRIMARY KEY,event_id INTEGER NOT NULL,game_type TEXT NOT NULL,
   config_json TEXT NOT NULL,result_json TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_game_rounds_event ON pop_live_game_rounds(event_id)')
 ]);
}

const text=(v,max)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);

// Values are typed by the teacher; only impossible ones are refused here (the tablet validates in detail).
export function validateGameConfig(type,config){
 if(!GAME_TYPES[type])fail('JOGO_INVALIDO');
 if(!config||typeof config!=='object'||Array.isArray(config))fail('CONFIGURACAO_INVALIDA');
 const raw=JSON.stringify(config);if(raw.length>4000)fail('CONFIGURACAO_INVALIDA');
 const out={};
 for(const [k,v] of Object.entries(config)){
  if(!/^[a-z_]{1,24}$/i.test(k))fail('CONFIGURACAO_INVALIDA');
  if(typeof v==='number'){if(!Number.isFinite(v)||v<0||v>100000)fail('CONFIGURACAO_INVALIDA');out[k]=v}
  else if(typeof v==='string')out[k]=text(v,40);
  else if(typeof v==='boolean')out[k]=v;
  else fail('CONFIGURACAO_INVALIDA');
 }
 return out;
}

async function eventRounds(db,id){
 return rows(db.prepare(`SELECT r.session_id,r.game_type,r.config_json,r.result_json IS NOT NULL has_result,s.status,s.class_name,s.starts_at
  FROM pop_live_game_rounds r JOIN pop_live_sessions s ON s.id=r.session_id WHERE r.event_id=? ORDER BY r.session_id`).bind(id))
  .then(list=>list.map(r=>({session_id:r.session_id,class_id:'manual-'+r.session_id,game_type:r.game_type,title:GAME_TYPES[r.game_type]||r.game_type,
   config:parse(r.config_json),status:r.status,has_result:!!r.has_result,starts_at:r.starts_at})));
}

export async function popLiveGames(request,db,path,b,json){
 await ensureGameTables(db);
 if(path==='/pop-live/games/events'){
  if(request.method==='GET'){
   const events=await rows(db.prepare(`SELECT e.id,e.name,e.event_date,e.location,COUNT(r.session_id) rounds,
     SUM(CASE WHEN s.status IN ('finished','closed') THEN 1 ELSE 0 END) done
     FROM pop_live_game_events e LEFT JOIN pop_live_game_rounds r ON r.event_id=e.id LEFT JOIN pop_live_sessions s ON s.id=r.session_id
     GROUP BY e.id ORDER BY e.id DESC LIMIT 20`));
   return json({ok:true,events:events.map(e=>({...e,rounds:Number(e.rounds)||0,done:Number(e.done)||0}))});
  }
  if(request.method!=='POST')fail('METODO_INVALIDO',405);
  const name=text(b.name,120);if(name.length<3)fail('NOME_DO_EVENTO_OBRIGATORIO');
  const date=String(b.event_date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))fail('DATA_INVALIDA');
  const r=await db.prepare('INSERT INTO pop_live_game_events(name,event_date,location) VALUES(?,?,?)').bind(name,date,text(b.location,120)||null).run();
  const id=Number(r.meta?.last_row_id);
  const event=await db.prepare('SELECT id,name,event_date,location FROM pop_live_game_events WHERE id=?').bind(id).first();
  return json({ok:true,event:{...event,rounds:[]}});
 }
 const ev=path.match(/^\/pop-live\/games\/events\/(\d+)$/);
 if(ev){
  if(request.method!=='GET')fail('METODO_INVALIDO',405);
  const event=await db.prepare('SELECT id,name,event_date,location FROM pop_live_game_events WHERE id=?').bind(Number(ev[1])).first();
  if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
  return json({ok:true,event:{...event,rounds:await eventRounds(db,event.id)}});
 }
 if(path==='/pop-live/games/rounds'){
  if(request.method!=='POST')fail('METODO_INVALIDO',405);
  const event=await db.prepare('SELECT id,name FROM pop_live_game_events WHERE id=?').bind(Number(b.event_id)||0).first();
  if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
  const config=validateGameConfig(String(b.game_type),b.config);
  const title=GAME_TYPES[b.game_type];
  const created=await db.prepare("INSERT INTO pop_live_sessions(source,unit,class_name,starts_at,teacher_name) VALUES('manual','bike',?,datetime('now','-3 hours'),?)")
   .bind(text(event.name+' · '+title,160),text(b.teacher,80)||null).run();
  const sid=Number(created.meta?.last_row_id);
  await db.prepare('INSERT INTO pop_live_game_rounds(session_id,event_id,game_type,config_json) VALUES(?,?,?,?)').bind(sid,event.id,b.game_type,JSON.stringify(config)).run();
  return json({ok:true,round:{session_id:sid,class_id:'manual-'+sid,event_id:event.id,event_name:event.name,game_type:b.game_type,title,config}});
 }
 const res=path.match(/^\/pop-live\/games\/rounds\/(\d+)(?:\/(result))?$/);
 if(res){
  const sid=Number(res[1]);
  const round=await db.prepare('SELECT r.*,e.name event_name FROM pop_live_game_rounds r JOIN pop_live_game_events e ON e.id=r.event_id WHERE r.session_id=?').bind(sid).first();
  if(!round)fail('PROVA_NAO_ENCONTRADA',404);
  if(!res[2]){
   if(request.method!=='GET')fail('METODO_INVALIDO',405);
   return json({ok:true,round:{session_id:sid,class_id:'manual-'+sid,event_id:round.event_id,event_name:round.event_name,game_type:round.game_type,title:GAME_TYPES[round.game_type],config:parse(round.config_json),result:round.result_json?parse(round.result_json):null}});
  }
  if(request.method!=='POST')fail('METODO_INVALIDO',405);
  const s=await db.prepare('SELECT status,operation_key FROM pop_live_sessions WHERE id=?').bind(sid).first();
  if(!s||!['finished','closed'].includes(s.status))fail('FINALIZE_ANTES_DE_SALVAR',409);
  if(!s.operation_key||s.operation_key!==b.operation_key)fail('SESSAO_EM_OUTRO_APARELHO',409);
  const result=b.result;
  if(!result||typeof result!=='object'||!Array.isArray(result.placings)||result.placings.length>200)fail('RESULTADO_INVALIDO');
  const raw=JSON.stringify(result);if(raw.length>65000)fail('RESULTADO_INVALIDO');
  await db.prepare('UPDATE pop_live_game_rounds SET result_json=? WHERE session_id=?').bind(raw,sid).run();
  return json({ok:true,saved:true});
 }
 fail('ROTA_INVALIDA',404);
}
