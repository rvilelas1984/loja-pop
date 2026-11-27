// Pop Games records: Distância (time per distance) and Autódromo (total per laps + fastest lap), by sex,
// best mark per student, new record detection for the projector, student position, void and recalculate.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {recordRound,studentRecords,adminRecords,recordKinds} from '../lib/pop-live-records.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE pop_live_sessions(id INTEGER PRIMARY KEY,source TEXT,source_class_id TEXT,unit TEXT,starts_at TEXT);
CREATE TABLE pop_live_game_rounds(session_id INTEGER PRIMARY KEY,event_id INTEGER,game_type TEXT,config_json TEXT,result_json TEXT);
CREATE TABLE pop_live_devices(id INTEGER PRIMARY KEY,reference_number TEXT,active INTEGER,device_type TEXT);
CREATE TABLE pop_live_session_devices(session_id INTEGER,device_id INTEGER,member_id TEXT);
CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id INTEGER,gym_client_id TEXT,first_name TEXT,last_name TEXT,birth_date TEXT);
CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT);
CREATE TABLE pop_live_health_overrides(member_id INTEGER,sex TEXT);
CREATE TABLE pop_fit_profile(member_id INTEGER,height REAL,initial_weight REAL);
CREATE TABLE pop_fit_weight_history(member_id INTEGER,weight_kg REAL,recorded_at TEXT,id INTEGER);
CREATE TABLE pop_fit_entries(member_id INTEGER,weight REAL,updated_at TEXT);
CREATE TABLE pop_live_manual_drafts(id INTEGER PRIMARY KEY,full_name TEXT,birth_date TEXT,weight_kg REAL,height_cm REAL,sex TEXT,status TEXT);
CREATE TABLE pop_live_session_exclusions(session_id INTEGER,member_id TEXT);
CREATE TABLE checkin_reservation_snapshots(unit TEXT,session_id TEXT,activity_date TEXT,evo_member_id TEXT,member_name TEXT,checked_in INTEGER,removed INTEGER,status TEXT,slot_number INTEGER);`);
const stmt=(t,a=[])=>({bind:(...v)=>stmt(t,v),first:async()=>sql.prepare(t).get(...a)||null,all:async()=>({results:sql.prepare(t).all(...a)}),run:async()=>{const r=sql.prepare(t).run(...a);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}});
const db={prepare:t=>stmt(t),batch:async l=>{for(const s of l)await s.run()}};
const json=(body,status=200)=>({status,body});
// Riders: Renato (M, member), Will (M), Jana (F), Marina (F), Bruno (no sex in the registration).
const people=[[1,'101','Renato','Vilelas','M'],[2,'102','Will','Santos','male'],[3,'103','Jana','Lima','Feminino'],[4,'104','Marina','Alves','F'],[5,'105','Bruno','Sem',null]];
for(const [id,evo,f,l,sx] of people){sql.prepare('INSERT INTO members VALUES(?,?,?,?,?,?)').run(id,Number(evo),null,f,l,'1990-01-01');sql.prepare("INSERT INTO evo_member_master VALUES('bike',?,?)").run(evo,JSON.stringify({gender:sx}));
 sql.prepare("INSERT INTO pop_live_devices VALUES(?,?,1,'cadence')").run(id,String(id).padStart(2,'0'))}
let sid=0;
async function round(type,cfg,placings,date){sid++;sql.prepare("INSERT INTO pop_live_sessions VALUES(?,'manual',?,'bike',?)").run(sid,'manual-'+sid,date+' 09:00');
 sql.prepare('INSERT INTO pop_live_game_rounds VALUES(?,1,?,?,?)').run(sid,type,JSON.stringify(cfg),JSON.stringify({placings}));
 for(const p of placings)sql.prepare('INSERT INTO pop_live_session_devices VALUES(?,?,?)').run(sid,p.bike,String(100+p.bike));
 return recordRound(db,sid)}
assert.deepEqual(recordKinds('distance',{m:500}).map(k=>k.key),['distance:500']);
assert.deepEqual(recordKinds('circuit',{laps:5,lap_km:1.2}).map(k=>k.key),['circuit:5x1200','circuit_lap:1200']);
assert.deepEqual(recordKinds('survival',{}),[]);

// First 500 m race: first records in both rankings; Bruno (no sex) stored but outside the rankings.
let o=await round('distance',{m:500},[{bike:1,name:'Renato',finish_s:39.4},{bike:2,name:'Will',finish_s:35.1},{bike:3,name:'Jana',finish_s:43.2},{bike:5,name:'Bruno',finish_s:30},{bike:4,name:'Marina',finish_s:null,out_s:null}],'2026-11-20');
assert.deepEqual(o.records.map(r=>[r.sex,r.name,r.value_s,r.previous]),[['m','Will Santos',35.1,null],['f','Jana Lima',43.2,null]]);
assert.deepEqual(o.positions.find(p=>p.name==='Renato Vilelas'),{key:'distance:500',label:'Distância · 500 m',sex:'m',bike:1,name:'Renato Vilelas',value_s:39.4,position:2,of:2,personal_best:true});
assert.ok(!o.positions.some(p=>p.name==='Marina Alves'),'did not finish');
// A 1 km race is its own ranking (never mixed with 500 m).
await round('distance',{m:1000},[{bike:1,name:'Renato',finish_s:70}],'2026-11-21');
// Second 500 m race: Jana beats her own record; Marina enters; Renato is slower (best mark kept).
o=await round('distance',{m:500},[{bike:3,name:'Jana',finish_s:41.8},{bike:4,name:'Marina',finish_s:44.9},{bike:1,name:'Renato',finish_s:41}],'2026-11-28');
assert.deepEqual(o.records,[{key:'distance:500',label:'Distância · 500 m',sex:'f',name:'Jana Lima',value_s:41.8,previous:{name:'Jana Lima',value_s:43.2}}]);
const ren=o.positions.find(p=>p.name==='Renato Vilelas');assert.equal(ren.personal_best,false);assert.equal(ren.position,2);
// Autódromo: total time per number of laps and fastest lap per track.
o=await round('circuit',{laps:5,lap_km:1.2},[{bike:1,name:'Renato',finish_s:600,best_lap_s:110.5,laps:5},{bike:2,name:'Will',finish_s:590,best_lap_s:112,laps:5}],'2026-11-28');
assert.deepEqual(o.records.map(r=>[r.key,r.name,r.value_s]),[['circuit:5x1200','Will Santos',590],['circuit_lap:1200','Renato Vilelas',110.5]]);
await round('circuit',{laps:3,lap_km:1.2},[{bike:2,name:'Will',finish_s:340,best_lap_s:109.9,laps:3}],'2026-11-29');
// Student view: list of races, their ranking (best per student) and own position with the gap to the next one.
const u=q=>new URL('https://x/?'+q);
let st=await studentRecords(db,u('key=distance:500'),['101','800000000001'],null);
assert.equal(st.sex,'m');assert.deepEqual(st.ranking.map(r=>[r.position,r.name,r.best,r.me]),[[1,'Will Santos',35.1,false],[2,'Renato Vilelas',39.4,true]]);
assert.equal(st.me.position,2);assert.equal(st.me.gap_to_next,4.3);
assert.deepEqual(st.keys.map(k=>k.key),['distance:500','distance:1000','circuit:3x1200','circuit:5x1200','circuit_lap:1200']);
st=await studentRecords(db,u('key=circuit_lap:1200&sex=m'),['101'],null);assert.deepEqual(st.ranking.map(r=>[r.name,r.best]),[['Will Santos',109.9],['Renato Vilelas',110.5]],'fastest lap across 3 and 5 lap races');
st=await studentRecords(db,u('key=distance:500&sex=f'),['101'],null);assert.deepEqual(st.ranking.map(r=>[r.name,r.best]),[['Jana Lima',41.8],['Marina Alves',44.9]]);assert.equal(st.me,null);
// Admin: students without sex listed; void a wrong mark and the ranking is rebuilt; recalculate keeps voids.
const A=async(q,body)=>adminRecords(new Request('https://x/?'+q,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined}),db,u(q),json);
let ad=(await A('key=distance:500&sex=m')).body;assert.deepEqual(ad.no_sex.map(x=>x.name),['Bruno Sem']);
const willMark=ad.marks.find(m=>m.name==='Will Santos');assert.equal((await A('',{op:'void',id:willMark.id})).body.ok,true);
st=await studentRecords(db,u('key=distance:500&sex=m'),['101'],null);assert.equal(st.ranking[0].name,'Renato Vilelas');assert.equal(st.me.position,1);
sql.exec("UPDATE evo_member_master SET personal_json='{\"gender\":\"M\"}' WHERE evo_member_id='105'");
await A('',{op:'recalculate'});
ad=(await A('key=distance:500&sex=m')).body;assert.deepEqual(ad.ranking.map(r=>r.name),['Bruno Sem','Renato Vilelas'],'Bruno enters after the sex is completed; Will stays voided');assert.equal(ad.no_sex.length,0);
console.log('PASS Pop Games records: distance and circuit (total + fastest lap) by sex, best mark per student, projector outcome, student position, void and recalculate');
