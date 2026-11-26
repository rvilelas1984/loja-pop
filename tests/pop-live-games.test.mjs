// Pop Games routes: events, rounds as manual Bike sessions, result storage, classes list exclusion.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {popLiveOperation} from '../lib/pop-live-operation.mjs';
import {validateGameConfig} from '../lib/pop-live-games.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec(`
CREATE TABLE pop_live_app_tokens(token TEXT PRIMARY KEY,active INTEGER);
CREATE TABLE evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,instructor_name TEXT,status TEXT);
CREATE TABLE pop_live_sessions(id INTEGER PRIMARY KEY,source TEXT,source_class_id TEXT,unit TEXT,class_name TEXT,starts_at TEXT,teacher_name TEXT,duration_minutes INTEGER DEFAULT 60,goal_type TEXT,goal_value REAL,goal_zone INTEGER,status TEXT DEFAULT 'planned',rules_json TEXT,operation_key TEXT,started_at INTEGER,finished_at INTEGER,results_json TEXT,closed_at INTEGER,close_key TEXT,updated_at TEXT);
`);
const token='11111111-1111-4111-8111-111111111111';
sql.prepare('INSERT INTO pop_live_app_tokens VALUES(?,1)').run(token);
const DB={prepare(query){let params=[];return {bind(...p){params=p;return this},async first(){return sql.prepare(query).get(...params)||null},async all(){return {results:sql.prepare(query).all(...params)}},async run(){const r=sql.prepare(query).run(...params);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}}}},async batch(list){for(const q of list)await q.run();return []}};
const json=(b,status=200)=>({status,body:b});
const call=async(path,data,t=token)=>popLiveOperation(new Request('https://test'+path,{method:data?'POST':'GET',headers:{authorization:'Bearer '+t},body:data?JSON.stringify(data):undefined}),{DB},new URL('https://test'+path),json);
assert.equal((await call('/pop-live/games/events',null,'bad')).status,401);
assert.equal((await call('/pop-live/games/events',{name:'X',event_date:'2026-11-26'})).body.error,'NOME_DO_EVENTO_OBRIGATORIO');
assert.equal((await call('/pop-live/games/events',{name:'Bike Pop Games 1ª Edição',event_date:'26/11/2026'})).body.error,'DATA_INVALIDA');
const ev=(await call('/pop-live/games/events',{name:'Bike Pop Games 1ª Edição',event_date:'2026-11-26',location:'Club Pop'})).body.event;
assert.equal(ev.name,'Bike Pop Games 1ª Edição');
assert.equal((await call('/pop-live/games/rounds',{event_id:ev.id,game_type:'tetris',config:{}})).body.error,'JOGO_INVALIDO');
assert.equal((await call('/pop-live/games/rounds',{event_id:ev.id,game_type:'distance',config:{km:-1}})).body.error,'CONFIGURACAO_INVALIDA');
const r=(await call('/pop-live/games/rounds',{event_id:ev.id,game_type:'circuit',config:{laps:12,lap_km:1.2,end:'top3',limit_min:0,tol_s:20}})).body.round;
assert.equal(r.class_id,'manual-'+r.session_id);assert.equal(r.title,'Autódromo Pop');
const s=sql.prepare('SELECT * FROM pop_live_sessions WHERE id=?').get(r.session_id);
assert.equal(s.source,'manual');assert.equal(s.unit,'bike');assert.equal(s.class_name,'Bike Pop Games 1ª Edição · Autódromo Pop');
// The round opens through the normal class flow, but is not listed among Bike classes.
assert.equal((await call('/pop-live/sessions',{unit:'bike',class_id:r.class_id})).body.session.id,r.session_id);
assert.ok(!(await call('/pop-live/classes?unit=bike')).body.classes.some(c=>c.id===r.class_id));
const list=(await call('/pop-live/games/events')).body.events;assert.equal(list[0].rounds,1);assert.equal(list[0].done,0);
const detail=(await call('/pop-live/games/events/'+ev.id)).body.event;assert.equal(detail.rounds[0].game_type,'circuit');assert.equal(detail.rounds[0].config.laps,12);
// Result only after finish and only from the device that runs the round.
const key='22222222-2222-4222-8222-222222222222';
assert.equal((await call('/pop-live/games/rounds/'+r.session_id+'/result',{operation_key:key,result:{placings:[]}})).body.error,'FINALIZE_ANTES_DE_SALVAR');
sql.prepare("UPDATE pop_live_sessions SET status='finished',operation_key=? WHERE id=?").run(key,r.session_id);
assert.equal((await call('/pop-live/games/rounds/'+r.session_id+'/result',{operation_key:'33333333-3333-4333-8333-333333333333',result:{placings:[]}})).body.error,'SESSAO_EM_OUTRO_APARELHO');
assert.equal((await call('/pop-live/games/rounds/'+r.session_id+'/result',{operation_key:key,result:{placings:[{bike:3,name:'Ana',finish_s:1800}]}})).body.saved,true);
assert.equal((await call('/pop-live/games/rounds/'+r.session_id)).body.round.result.placings[0].name,'Ana');
assert.equal((await call('/pop-live/games/events')).body.events[0].done,1);
assert.throws(()=>validateGameConfig('survival',{rpm:'80'.repeat(3000)}));
console.log('PASS Pop Games routes: events, rounds as manual Bike sessions, hidden from classes, result storage');
