import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {adminGymRanking} from './lib/admin-gym-ranking.mjs';
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE members(id INTEGER,evo_member_id INTEGER,gym_client_id TEXT,presencas_legadas_gym INTEGER,first_name TEXT,last_name TEXT);
CREATE TABLE club_settings(key TEXT PRIMARY KEY,value TEXT);
CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT);
CREATE TABLE evo_member_attendance(unit TEXT,evo_member_id TEXT,attendance_key TEXT,id_activity_session TEXT,attendance_date TEXT);
INSERT INTO members VALUES(1,101,'201',0,'Aluno','A'),(2,201,NULL,48,'Aluno','A'),(3,102,'202',61,'Aluno','B'),(4,103,'203',46,'Aluno','C'),(5,203,NULL,0,'Aluno','C');`);
for(const [id,n] of [[101,11],[201,15],[102,12],[202,2],[103,3],[203,13]]){
 db.prepare('INSERT INTO evo_member_master VALUES(?,?,?)').run('gym',String(id),'{}');
 for(let i=0;i<n;i++)db.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?)').run('gym',String(id),`${id}-${i}`,`${id}-${i}`,'2026-10-17');
}
const binding={prepare(sql){return {bind(...params){return {sql,params}}}},async batch(stmts){return stmts.map(s=>({results:db.prepare(s.sql).all(...s.params)}))}};
const run=q=>adminGymRanking(binding,new URLSearchParams(q));
let r=await run('');assert.equal(r.total,3);assert.deepEqual(r.rows.map(x=>[x.stars,x.actual,x.position]),[[75,14,1],[74,26,2],[62,16,3]]);
// Duplicate session across linked IDs and Bike data must not add Gym stars.
db.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?)').run('gym','101','copy','201-0','2026-10-17');
db.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?)').run('bike','201','bike','bike','2026-10-17');
// Repeated official legacy on a duplicate profile is not a new historical period.
db.exec('UPDATE members SET presencas_legadas_gym=48 WHERE id=1');
r=await run('q=201');assert.equal(r.rows[0].stars,74);assert.equal(r.rows[0].legacy,48);assert.equal(r.rows[0].actual,26);assert.equal(r.rows[0].position,2);
r=await run('order=asc');assert.deepEqual(r.rows.map(x=>x.stars),[62,74,75]);
r=await run('min=75');assert.equal(r.total,1);assert.equal(r.rows[0].stars,75);
console.log('Gym ranking: linked IDs, unique classes, same-day classes, legacy deduplication, Bike isolation and positions OK');
