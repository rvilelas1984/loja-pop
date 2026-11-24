import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureLayoutSchema,findLayout,rememberSessionActivity,sessionActivity,layoutName,layoutShape,activityIdOf} from '../lib/checkin-layout.mjs';
import {readCheckinMirror} from '../lib/checkin-mirror.mjs';

// Minimal D1-shaped wrapper over node:sqlite.
function d1(){
 const sql=new DatabaseSync(':memory:');
 // Production table before this change: no shape column.
 sql.exec("CREATE TABLE checkin_layouts(unit TEXT NOT NULL,activity_id TEXT NOT NULL,activity_name TEXT NOT NULL DEFAULT '',capacity INTEGER NOT NULL,rows_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,activity_id))");
 const st=(q,p=[])=>({bind(...a){return st(q,a)},async first(){return sql.prepare(q).get(...p)||null},async all(){return {results:sql.prepare(q).all(...p)}},async run(){const r=sql.prepare(q).run(...p);return {meta:{changes:r.changes}}}});
 return {sql,db:{prepare:q=>st(q)}};
}

test('shape column is added to an existing table, once, and keeps old rows',async()=>{
 const {sql,db}=d1();sql.exec("INSERT INTO checkin_layouts(unit,activity_id,activity_name,capacity,rows_json) VALUES('gym','77','JUMP',22,'[5,6,5,6]')");
 await ensureLayoutSchema(db);await ensureLayoutSchema(db);
 assert.ok(sql.prepare('PRAGMA table_info(checkin_layouts)').all().some(c=>c.name==='shape'));
 assert.deepEqual(await findLayout(db,'gym',{activityId:'77'}),{activityId:'77',activityName:'JUMP',capacity:22,rows:[5,6,5,6],shape:''});
});

test('layout is found by activity id, then by name (accents, case, extra words), never by a guess',async()=>{
 const {sql,db}=d1();await ensureLayoutSchema(db);
 sql.exec("INSERT INTO checkin_layouts(unit,activity_id,activity_name,capacity,rows_json,shape) VALUES('gym','77','Jump',22,'[5,6,5,6]','circle'),('gym','80','Step',20,'[5,5,5,5]','horizontal'),('gym','81','Jump Kids',12,'[4,4,4]','circle'),('bike','1','Bike Pop',34,'[8,8,9,9]','')");
 assert.equal((await findLayout(db,'gym',{activityId:'77',activityName:'Outra coisa'})).shape,'circle','id wins');
 assert.equal((await findLayout(db,'gym',{activityName:'JUMP'})).activityId,'77','case');
 assert.equal((await findLayout(db,'gym',{activityName:'Júmp '})).activityId,'77','accents and spaces');
 assert.equal((await findLayout(db,'gym',{activityName:'Jump Pop - 19h'})).activityId,'77','layout name inside the class name');
 assert.equal((await findLayout(db,'gym',{activityName:'Jump Kids Turma A'})).activityId,'81','the longest matching name wins');
 assert.equal(await findLayout(db,'gym',{activityName:'Pilates'}),null);
 assert.equal(await findLayout(db,'gym',{activityName:'Bike Pop'}),null,'other unit is never used');
 assert.equal(layoutName('  JÚMP-Pop!! '),'jump pop');
 assert.equal(layoutShape('circle'),'circle');assert.equal(layoutShape('<x>'),'');
 assert.equal(activityIdOf({idActivitie:5}),5);
});

test('TV mirror uses the session activity saved on update, and returns the shape',async()=>{
 const {sql,db}=d1();await ensureLayoutSchema(db);
 sql.exec("CREATE TABLE evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,instructor_name TEXT)");
 sql.exec("CREATE TABLE checkin_snapshot_versions(unit TEXT,session_id TEXT,observed_at INTEGER)");
 sql.exec("CREATE TABLE checkin_reservation_snapshots(unit TEXT,session_id TEXT,activity_date TEXT,slot_number INTEGER,evo_member_id TEXT,member_name TEXT,removed INTEGER,status TEXT,checked_in INTEGER)");
 // The agenda names the class differently from the EVO activity catalog.
 sql.exec("INSERT INTO evo_attendance_sessions VALUES('gym','555','2026-11-24','19:00','AULA DE TRAMPOLIM','Renato')");
 sql.exec("INSERT INTO checkin_snapshot_versions VALUES('gym','555',1)");
 sql.exec("INSERT INTO checkin_reservation_snapshots VALUES('gym','555','2026-11-24',1,'10','Bruna',0,'reserved',1)");
 sql.exec("INSERT INTO checkin_layouts(unit,activity_id,activity_name,capacity,rows_json,shape) VALUES('gym','77','Jump',22,'[5,6,5,6]','circle')");
 let m=await readCheckinMirror(db,'gym','2026-11-24','555');
 assert.equal(m.layout,undefined,'name alone cannot link it');
 assert.equal(await rememberSessionActivity(db,'gym','555',77),true);
 assert.equal(await sessionActivity(db,'gym','555'),'77');
 m=await readCheckinMirror(db,'gym','2026-11-24','555');
 assert.deepEqual(m.layout,{capacity:22,rows:[5,6,5,6],shape:'circle',activityId:'77'});
 assert.equal(await rememberSessionActivity(db,'gym','555','abc'),false,'invalid activity id is ignored');
 assert.equal(await sessionActivity(db,'gym','555'),'77');
});

test('check-in screen uses the saved shape, fits the places and drops the bike label for Gym',async()=>{
 const fs=await import('node:fs');const h=fs.readFileSync(new URL('../tela-checkin.html',import.meta.url),'utf8');
 assert.match(h,/cpApplyClassShape\(unit,a\.name,data\.layout\?\.shape\)/);
 assert.match(h,/\(unit==="gym"\?"":"B"\)\+n/);
 assert.match(h,/function cpFitSeats\(\)/);
 const c=fs.readFileSync(new URL('../admin-configuracoes.html',import.meta.url),'utf8');
 assert.match(c,/rows,shape:layoutShape\.value\}/,'Configurações saves the shape with the rows');
});
