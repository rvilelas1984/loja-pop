import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {memberUnitAccess,readAccessSettings,saveAccessSettings} from '../lib/unit-access.mjs';
import {memberAttendanceIds,unitAttendanceHistory,unitAttendanceRows,unitStars} from '../lib/unit-progress.mjs';

function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
 CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_type TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT);
 CREATE TABLE evo_contract_catalog(tenant_key TEXT,unit TEXT,evo_contract_id TEXT,contract_name TEXT,is_active INTEGER);
 CREATE TABLE evo_member_contracts(unit TEXT,evo_member_id TEXT,id_membership TEXT,membership_name TEXT,membership_status TEXT,start_date TEXT,end_date TEXT,cancel_date TEXT);
 CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id INTEGER,gym_client_id TEXT,cpf_hash TEXT,presencas_legadas_bike INTEGER,presencas_legadas_gym INTEGER);
 CREATE TABLE gym_member_links(member_id INTEGER,gym_client_id TEXT,status TEXT);
 CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT);
 CREATE TABLE evo_member_identity_aliases(unit TEXT,legacy_evo_member_id TEXT,principal_evo_member_id TEXT);
 CREATE TABLE evo_member_attendance(unit TEXT,evo_member_id TEXT,attendance_key TEXT,id_activity_session TEXT,attendance_date TEXT,start_time TEXT,activity_name TEXT,raw_json TEXT);
 CREATE TABLE bike_evo_historical_baseline(evo_member_id TEXT,baseline_count INTEGER);
 INSERT INTO evo_contract_catalog VALUES('club-pop','bike','10','Plano Bike',1),('club-pop','gym','20','Plano Gym',1);
 INSERT INTO evo_member_contracts VALUES('bike','100','10','Plano Bike','1','2020-01-01','2099-01-01',NULL),('gym','200','20','Plano Gym','active','2020-01-01','2099-01-01',NULL);`);
 const prepare=(text,args=[])=>({bind:(...values)=>prepare(text,values),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)}),run:async()=>({meta:sql.prepare(text).run(...args)})});
 const db={prepare,batch:async stmts=>{sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 return {sql,db};
}
const hash=cpf=>createHash('sha256').update(cpf).digest('hex');
function person(sql,{id=1,bike=100,gym=null,cpf='12345678901',name='Aluno Exemplo'}={}){
 const p={firstName:name.split(' ')[0],lastName:name.split(' ').slice(1).join(' '),document:cpf};
 sql.prepare('INSERT INTO members VALUES(?,?,?,?,0,0)').run(id,bike,gym,hash(cpf));
 if(bike)sql.prepare('INSERT INTO evo_member_master VALUES(?,?,?)').run('bike',String(bike),JSON.stringify(p));
 if(gym)sql.prepare('INSERT INTO evo_member_master VALUES(?,?,?)').run('gym',String(gym),JSON.stringify(p));
 return sql.prepare('SELECT * FROM members WHERE id=?').get(id);
}
function attendance(sql,unit,id,n,start=1,named=true){
 for(let i=0;i<n;i++)sql.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?,?,?,?)').run(unit,String(id),id+':'+(start+i),String(start+i),'2026-10-'+String(i+1).padStart(2,'0'),'17:15',unit==='bike'?'Bike Pop':'Ritbox',JSON.stringify(named?{raw:{name:'Aluno Exemplo'}}:{}));
}

test('no settings preserves direct access; eligible contract grants the other unit without creating a contract',async()=>{
 const {db,sql}=fixture();assert.deepEqual((await memberUnitAccess(db,100,null)).activeUnits,['bike']);
 await saveAccessSettings(db,{revision:null,rules:[{sourceUnit:'bike',contractId:'10'}]},'admin');
 assert.deepEqual((await memberUnitAccess(db,100,null)).activeUnits,['bike','gym']);
 assert.deepEqual((await memberUnitAccess(db,999,null)).activeUnits,[]);
 assert.equal(sql.prepare("SELECT COUNT(*) n FROM evo_member_contracts WHERE evo_member_id='100'").get().n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_log').get().n,1);
});
test('revocation, expiration, future start, cancellation, suspended and queued contracts do not grant access',async()=>{
 const {db,sql}=fixture();await saveAccessSettings(db,{revision:null,rules:[{sourceUnit:'bike',contractId:'10'}]},'admin');
 for(const [field,value] of [['membership_status','suspended'],['membership_status','2'],['membership_status','in queue'],['start_date','2099-01-01'],['end_date','2000-01-01'],['cancel_date','2000-01-01']]){
  const before=sql.prepare('SELECT '+field+' value FROM evo_member_contracts WHERE unit=\'bike\'').get().value;
  sql.prepare('UPDATE evo_member_contracts SET '+field+'=? WHERE unit=\'bike\'').run(value);
  assert.deepEqual((await memberUnitAccess(db,100,null)).activeUnits,[],field+':'+value);
  sql.prepare('UPDATE evo_member_contracts SET '+field+'=? WHERE unit=\'bike\'').run(before);
 }
 const current=await readAccessSettings(db);await saveAccessSettings(db,{revision:current.revision,rules:[]},'admin');
 assert.deepEqual((await memberUnitAccess(db,100,null)).activeUnits,['bike']);
 assert.deepEqual((await memberUnitAccess(db,100,200)).activeUnits,['bike','gym']);
});
test('Gym source works symmetrically and IDs are scoped by source unit',async()=>{
 const {db,sql}=fixture();await saveAccessSettings(db,{revision:null,rules:[{sourceUnit:'gym',contractId:'20'}]},'admin');
 assert.deepEqual((await memberUnitAccess(db,null,200)).activeUnits,['bike','gym']);
 sql.exec("UPDATE evo_member_contracts SET id_membership='20' WHERE unit='bike'");
 assert.deepEqual((await memberUnitAccess(db,100,null)).activeUnits,['bike']);
});
test('invalid/duplicate IDs and stale revisions do not change configuration',async()=>{
 const {db,sql}=fixture();const initial=await saveAccessSettings(db,{revision:null,rules:[]},'admin');
 for(const rules of [[{sourceUnit:'club',contractId:'10'}],[{sourceUnit:'bike',contractId:'999'}],[{sourceUnit:'bike',contractId:'10'},{sourceUnit:'bike',contractId:'10'}]])await assert.rejects(saveAccessSettings(db,{revision:initial.revision,rules},'admin'));
 await assert.rejects(saveAccessSettings(db,{revision:null,rules:[]},'admin'),/RECARREGUE/);
 assert.equal((await readAccessSettings(db)).revision,initial.revision);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM audit_log').get().n,1);
});
test('atomic audit failure rolls back configuration',async()=>{
 const {db,sql}=fixture();sql.exec('DROP TABLE audit_log');
 await assert.rejects(saveAccessSettings(db,{revision:null,rules:[{sourceUnit:'bike',contractId:'10'}]},'admin'));
 assert.equal((await readAccessSettings(db)).rules.length,0);
});
test('two IDs in Gym: 9 + 2 distinct sessions; duplicate session excluded; Bike remains 7',async()=>{
 const {db,sql}=fixture(),member=person(sql,{gym:'200'});
 attendance(sql,'bike',100,7);attendance(sql,'gym',100,9);attendance(sql,'gym',200,2,10);
 attendance(sql,'gym',200,1,1);
 const identity=await memberAttendanceIds(db,member,'gym');assert.deepEqual(identity.ids,['200','100']);
 assert.equal((await unitAttendanceRows(db,'gym',identity.ids,'2026-10')).length,11);
 assert.equal((await unitAttendanceHistory(db,member,'gym')).total,11);
 assert.equal((await unitAttendanceHistory(db,member,'gym',10)).items.length,1);
 assert.equal((await unitAttendanceHistory(db,member,'bike')).total,7);
 assert.equal((await unitStars(db,member,'gym',identity.ids)).total,11);
});
test('no Gym profile needed when a verified source and named target attendance establish identity',async()=>{
 const {db,sql}=fixture(),member=person(sql);attendance(sql,'gym',100,7);
 assert.deepEqual((await memberAttendanceIds(db,member,'gym')).ids,['100']);
 assert.equal((await unitAttendanceHistory(db,member,'gym')).total,7);
 assert.equal(sql.prepare('SELECT gym_client_id FROM members WHERE id=1').get().gym_client_id,null);
});
test('bare ID, unrelated CPF, conflicting target owner, or conflicting name cannot expose someone else’s history',async()=>{
 for(const kind of ['bare','cpf','owner','name','source']){
  const {db,sql}=fixture(),member=person(sql);attendance(sql,'gym',100,7,1,kind!=='bare');
  if(kind==='cpf')sql.prepare('INSERT INTO evo_member_master VALUES(?,?,?)').run('gym','100',JSON.stringify({document:'99999999999'}));
  if(kind==='owner')sql.exec("INSERT INTO members VALUES(2,999,'100','other',0,0)");
  if(kind==='name')sql.exec(`UPDATE evo_member_attendance SET raw_json='{"raw":{"name":"Outra Pessoa"}}'`);
  if(kind==='source')member.cpf_hash='placeholder';
  assert.deepEqual((await memberAttendanceIds(db,member,'gym')).ids,[],kind);
  assert.equal((await unitAttendanceHistory(db,member,'gym')).total,0);
 }
});
test('a matching target CPF establishes identity even without named attendance',async()=>{
 const {db,sql}=fixture(),member=person(sql);attendance(sql,'gym',100,3,1,false);
 sql.exec(`INSERT INTO evo_member_master VALUES('gym','100','{"document":"12345678901"}')`);
 assert.deepEqual((await memberAttendanceIds(db,member,'gym')).ids,['100']);
});
test('Bike baseline and legacy are not double counted; pending legacy is excluded',async()=>{
 const {db,sql}=fixture(),member=person(sql,{gym:'200'});attendance(sql,'bike',100,25);
 sql.exec("UPDATE members SET presencas_legadas_bike=110,presencas_legadas_gym=78; INSERT INTO bike_evo_historical_baseline VALUES('100',293)");
 assert.deepEqual(await unitStars(db,member,'bike',['100']),{legacy:110,actual:300,total:410});
 sql.exec(`INSERT INTO club_settings VALUES('attendance_legacy_review:gym:1','{"status":"pending"}',NULL)`);
 assert.equal((await unitStars(db,member,'gym',['200'])).legacy,0);
});
test('worker settings route requires administrator before any DB operation',async()=>{
 const source=readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      if (url.pathname === "/admin/shared-unit-access")');
 const end=source.indexOf('      if (url.pathname === "/admin/auto-link-history"',start);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('request','env','url','fetch','json','readAccessSettings','saveAccessSettings','accessCatalog','readJson',source.slice(start,end));
 const denied=()=>{throw Error('DB must not run')},json=(body,status=200)=>({body,status});
 for(const role of ['reception','teacher']){
  const result=await run(new Request('https://test/admin/shared-unit-access',{headers:{'x-clubpop-admin-cookie':'test'}}),{},new URL('https://test/admin/shared-unit-access'),async()=>({ok:true,json:async()=>({role})}),json,denied,denied,denied,denied);
  assert.equal(result.status,403);
 }
 const noCookie=await run(new Request('https://test/admin/shared-unit-access'),{},new URL('https://test/admin/shared-unit-access'),denied,json,denied,denied,denied,denied);
 assert.equal(noCookie.status,401);
});

test('student dashboard serves shared Gym attendance without inventing a Gym contract or balance',async()=>{
 const {db,sql}=fixture(),member=person(sql);attendance(sql,'gym',100,7);
 sql.exec(`ALTER TABLE members ADD COLUMN first_name TEXT; ALTER TABLE members ADD COLUMN last_name TEXT;
 ALTER TABLE evo_member_master ADD COLUMN financial_json TEXT; ALTER TABLE evo_member_master ADD COLUMN memberships_json TEXT;
 ALTER TABLE evo_member_master ADD COLUMN synced_at TEXT;
 ALTER TABLE evo_member_contracts ADD COLUMN id_member_membership TEXT; ALTER TABLE evo_member_contracts ADD COLUMN category_id TEXT;
 ALTER TABLE evo_member_contracts ADD COLUMN sale_date TEXT; ALTER TABLE evo_member_contracts ADD COLUMN is_additional INTEGER;
 ALTER TABLE evo_member_contracts ADD COLUMN raw_json TEXT; ALTER TABLE evo_member_contracts ADD COLUMN contract_key TEXT;
 CREATE TABLE evo_member_cache(unit TEXT,evo_member_id TEXT,payload_json TEXT,updated_at TEXT);
 CREATE TABLE evo_students(unit TEXT,evo_member_id TEXT,display_name TEXT,membership_status TEXT,fitcoins REAL,updated_at TEXT,is_current INTEGER);
 CREATE TABLE evo_sync_config(unit TEXT,sync_time TEXT,last_sync_at TEXT);
 CREATE TABLE evo_member_attendance_states(unit TEXT,evo_member_id TEXT,id_activity_session TEXT,attendance_date TEXT,activity_name TEXT,evo_status INTEGER,justified_absence INTEGER);`);
 const saved=await saveAccessSettings(db,{revision:null,rules:[{sourceUnit:'bike',contractId:'10'}]},'admin');
 const source=readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
 const start=source.indexOf('      if (url.pathname === "/member/evo-cache"');
 const end=source.indexOf('      // Diagnóstico do aluno logado',start);
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('request','env','url','authenticatedMember','memberUnitAccess','memberAttendanceIds','unitAttendanceRows','unitStars','memberSessionDetails','attachContractSessions','favoriteEquipmentFromRows','json',source.slice(start,end));
 const args=[new Request('https://test/member/evo-cache?unit=gym'),{DB:db},new URL('https://test/member/evo-cache?unit=gym'),async()=>member,memberUnitAccess,memberAttendanceIds,unitAttendanceRows,unitStars,async()=>({}),async()=>{},()=>null,(body,status=200)=>({body,status})];
 const result=await run(...args);assert.equal(result.status,200);assert.equal(result.body.data.attendance.attendanceCount,7);
 assert.equal(result.body.data.member.idMember,null);assert.deepEqual(result.body.data.member.memberships,[]);
 assert.equal(result.body.data.fitcoins,null);assert.equal(result.body.data.sharedAccess[0].sourceUnit,'bike');
 await saveAccessSettings(db,{revision:saved.revision,rules:[]},'admin');
 assert.equal((await run(...args)).status,403);
});

test('student unit selector uses permitted units even without a second financial ID',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const source=html.slice(html.indexOf('function setStudentUnitAccess('),html.indexOf('async function applyUnit('));
 let visible=false;const buttons=['bike','gym'].map(unit=>({dataset:{unit}}));
 const sandbox={allowedStudentUnits:[],linkedGymId:null,applyUnit:()=>{},document:{querySelector:()=>({classList:{toggle:(_name,value)=>visible=value}}),querySelectorAll:()=>buttons}};
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 sandbox.setStudentUnitAccess({activeUnits:['bike','gym'],gymMemberId:null});
 assert.equal(visible,true);assert.ok(buttons.every(b=>!b.disabled));assert.equal(sandbox.linkedGymId,null);
 sandbox.setStudentUnitAccess({activeUnits:['bike'],gymMemberId:'200'});
 assert.equal(visible,false);assert.equal(buttons[1].disabled,true);
 sandbox.setStudentUnitAccess({activeUnits:['gym'],gymMemberId:'200'});
 assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);
});


test('verified linked Gym legacy uses the highest import and honors pending reviews',async()=>{
 const {db,sql}=fixture(),member=person(sql,{gym:'200'});
 sql.prepare('INSERT INTO members VALUES(2,101,?, ?,0,80)').run('200',member.cpf_hash);
 sql.exec('UPDATE members SET presencas_legadas_gym=50 WHERE id=1');
 assert.equal((await unitStars(db,member,'gym',['200'])).legacy,80);
 sql.exec(`INSERT INTO club_settings VALUES('attendance_legacy_review:gym:2','{"status":"pending"}',NULL)`);
 assert.equal((await unitStars(db,member,'gym',['200'])).legacy,50);
});
