import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {canonicalEvoId,resolveEvoClubMember,memberAttendanceHistory} from '../lib/member-identity.mjs';
import {rankingBase} from '../lib/admin-gym-ranking.mjs';
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id INTEGER,gym_client_id TEXT,cpf_hash TEXT,email TEXT,first_name TEXT,last_name TEXT,presencas_legadas_gym INTEGER);
 CREATE TABLE gym_member_links(member_id INTEGER,gym_client_id TEXT,status TEXT);
 CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT,contacts_json TEXT);
 CREATE TABLE evo_member_attendance(unit TEXT,evo_member_id TEXT,attendance_key TEXT,id_activity_session TEXT,attendance_date TEXT,start_time TEXT,activity_name TEXT);
 CREATE TABLE club_settings(key TEXT,value TEXT);
 INSERT INTO members VALUES(489,1558222,'1498344','placeholder','test@example.com','Test','Student',0),(778,1498344,NULL,'evo-placeholder:1498344','test@example.com','Test','Student',78),
 (1,100,NULL,'placeholder','bike@example.com','Bike','Only',0),(2,NULL,'200','placeholder','gym@example.com','Gym','Only',0);
 INSERT INTO gym_member_links VALUES(489,'1498344','ACTIVE');
 INSERT INTO evo_member_master VALUES('gym','1498344','{}','[]'),('bike','1558222','{}','[]');
 INSERT INTO club_settings VALUES('attendance_legacy_review:gym:778','{"status":"pending"}');`);
 for(const [unit,id,n] of [['bike','1558222',24],['gym','1498344',21],['bike','100',1],['gym','200',2]])for(let i=0;i<n;i++)sql.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?,?,?)').run(unit,id,String(i),String(i),'2026-10-'+String(i+1).padStart(2,'0'),'07:15','Class');
 const prepare=(text,args=[])=>({bind:(...values)=>prepare(text,values),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)})});
 return {sql,db:{prepare}};
}
test('canonical string IDs preserve identity without turning malformed IDs into someone else',()=>{
 for(const value of [1498344,'1498344','1498344.0',' 1498344.00 '])assert.equal(canonicalEvoId(value),'1498344');
 assert.equal(canonicalEvoId('1498344.1'),'1498344.1');assert.equal(canonicalEvoId('abc1498344'),'abc1498344');
});
test('both units resolve to principal; internal and other-unit IDs are not aliases',async()=>{
 const {db}=fixture();assert.equal((await resolveEvoClubMember(db,'bike','1558222')).id,489);
 assert.equal((await resolveEvoClubMember(db,'gym','1498344.0')).id,489);
 assert.equal(await resolveEvoClubMember(db,'gym','489'),null);
 assert.equal(await resolveEvoClubMember(db,'gym','1558222'),null);
});
test('unique email fallback and conflict rejection',async()=>{
 const {db,sql}=fixture();sql.exec(`INSERT INTO evo_member_master VALUES('gym','300','{"email":"bike@example.com"}','[]')`);
 assert.equal((await resolveEvoClubMember(db,'gym','300')).id,1);
 sql.exec(`UPDATE members SET email='bike@example.com' WHERE id=2`);
 await assert.rejects(resolveEvoClubMember(db,'gym','300'),/AMBIGUA/);
});
test('official history: both units, pagination, single units, no duplicates or unproven legacy',async()=>{
 const {db,sql}=fixture(),member={id:489,evo_member_id:1558222,gym_client_id:'1498344.0'};
 sql.exec(`INSERT INTO evo_member_attendance SELECT unit,evo_member_id,'copy',id_activity_session,attendance_date,start_time,activity_name FROM evo_member_attendance WHERE unit='gym' AND attendance_key='0'`);
 assert.equal((await memberAttendanceHistory(db,member,'bike')).total,24);
 const gym=await memberAttendanceHistory(db,member,'gym');assert.equal(gym.total,21);assert.equal(gym.items.length,10);
 assert.equal((await memberAttendanceHistory(db,member,'gym',20)).items.length,1);
 assert.equal((await memberAttendanceHistory(db,{evo_member_id:100},'bike')).total,1);
 assert.equal((await memberAttendanceHistory(db,{gym_client_id:'200'},'gym')).total,2);
 assert.equal((await memberAttendanceHistory(db,{evo_member_id:100},'gym')).ok,false);
 const stars=sql.prepare(rankingBase+"SELECT * FROM totals WHERE evo_member_id='1498344'").get();
 assert.equal(stars.actual,21);assert.equal(stars.legacy,0);assert.equal(stars.stars,21);
 assert.equal(sql.prepare('SELECT presencas_legadas_gym n FROM members WHERE id=778').get().n,78);
});
