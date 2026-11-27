// Pop Live open to everyone: visitor account (signup), Pop Live-only session, student entering through Pop Live,
// first access telling "not found" apart, and the Pop Live dash data.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../club-pop-worker.mjs';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync('tests/currency-schema.sql','utf8'));
sql.exec(`CREATE TABLE IF NOT EXISTS auth_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER,token_hash TEXT,expires_at TEXT,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY,actor_type TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS evo_contract_catalog(tenant_key TEXT,unit TEXT,evo_contract_id TEXT,contract_name TEXT,is_active INTEGER);
CREATE TABLE IF NOT EXISTS evo_member_contracts(unit TEXT,evo_member_id TEXT,id_membership TEXT,membership_name TEXT,membership_status TEXT,start_date TEXT,end_date TEXT,cancel_date TEXT);
CREATE TABLE IF NOT EXISTS evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT,contacts_json TEXT,raw_json TEXT,is_current INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS gym_member_links(member_id INTEGER,gym_client_id TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,instructor_name TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS checkin_reservation_snapshots(unit TEXT,session_id TEXT,activity_date TEXT,evo_member_id TEXT,member_name TEXT,checked_in INTEGER,removed INTEGER,status TEXT,slot_number INTEGER);
CREATE TABLE IF NOT EXISTS pop_fit_profile(member_id INTEGER PRIMARY KEY,height REAL,initial_weight REAL,updated_at TEXT);
CREATE TABLE IF NOT EXISTS pop_fit_entries(member_id INTEGER,weight REAL,updated_at TEXT);
CREATE TABLE pop_live_sessions(id INTEGER PRIMARY KEY,source TEXT,source_class_id TEXT,unit TEXT,class_name TEXT,starts_at TEXT,teacher_name TEXT,duration_minutes INTEGER DEFAULT 60,goal_type TEXT,goal_value REAL,goal_zone INTEGER,status TEXT DEFAULT 'planned',updated_at TEXT);
CREATE TABLE pop_live_devices(id INTEGER PRIMARY KEY,reference_number TEXT,display_name TEXT,ble_identifier TEXT,active INTEGER,device_type TEXT,unit_bike INTEGER,unit_gym INTEGER);
CREATE TABLE pop_live_session_devices(session_id INTEGER,device_id INTEGER,member_id TEXT,connected_at TEXT,PRIMARY KEY(session_id,device_id));`);
for(const f of ['migrations/20261104_pop_live_operation.sql','migrations/20261105_pop_live_member_performance.sql','migrations/20261105_pop_live_health_overrides.sql','migrations/20261126_pop_live_games.sql'])sql.exec(readFileSync(f,'utf8'));
const stmt=(text,args=[])=>({bind:(...v)=>stmt(text,v),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)}),run:async()=>{const r=sql.prepare(text).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}});
const DB={prepare:t=>stmt(t),batch:async list=>{const out=[];for(const s of list)out.push(await s.run());return out}};
const env={DB};
const call=async(path,body,token)=>{const r=await worker.fetch(new Request('https://worker'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});return {status:r.status,body:await r.json().catch(()=>({}))}};

// A student (Bike Pop, active contract) and an upcoming class.
sql.exec(`INSERT INTO evo_contract_catalog VALUES('club-pop','bike','10','Plano Bike',1);
INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,membership_name,membership_status,start_date,end_date,cancel_date,raw_json) VALUES('bike','100','k1','10','Plano Bike','active','2020-01-01','2099-01-01',NULL,'{}');
INSERT INTO evo_member_master(unit,evo_member_id,personal_json,raw_json) VALUES('bike','100','{"firstName":"Ana","lastName":"Aluna","document":"52998224725","email":"ana@exemplo.com","birthDate":"1990-01-01"}','{}');
INSERT INTO evo_attendance_sessions VALUES('gym','555',date('now','-3 hours','+1 day'),'18:00:00','Funcional Pop','Prof. Léo','scheduled');
INSERT INTO pop_live_game_events(name,event_date,location) VALUES('Bike Pop Games 1ª Edição',date('now','-3 hours','+10 days'),'Bike Pop');`);

const visitor={name:'Marina Alves',cpf:'11144477735',birthDate:'1994-04-12',sex:'f',phone:'11955550123',email:'marina@exemplo.com',pin:'258036',terms:true};
// Validation and the student guard.
assert.equal((await call('/auth/pop-live-signup',{...visitor,cpf:'11111111111'})).body.error,'CPF_INVALIDO');
assert.equal((await call('/auth/pop-live-signup',{...visitor,terms:false})).body.error,'ACEITE_OS_TERMOS');
assert.equal((await call('/auth/pop-live-signup',{...visitor,cpf:'52998224725'})).body.error,'ALUNO_ENCONTRADO_USE_PRIMEIRO_ACESSO');
// First access through Pop Live tells "not found" apart, so the app can offer the signup.
assert.equal((await call('/auth/first-access',{cpf:visitor.cpf,email:visitor.email,birthDate:visitor.birthDate,app:'live'})).body.error,'NAO_ENCONTRADO');
assert.equal((await call('/auth/first-access',{cpf:visitor.cpf,email:visitor.email,birthDate:visitor.birthDate})).body.error,'DADOS_NAO_CONFEREM');

// Visitor account: Pop Live session.
const s=await call('/auth/pop-live-signup',visitor);assert.equal(s.status,200,JSON.stringify(s.body));assert.equal(s.body.member.scope,'live');
const vt=s.body.token;
assert.equal((await call('/auth/pop-live-signup',visitor)).body.error,'CONTA_JA_CRIADA');
const me=await call('/auth/me',null,vt);assert.equal(me.status,200);assert.equal(me.body.member.scope,'live');assert.equal(me.body.member.firstName,'Marina');
// Only Pop Live and Pop Fit: Club routes refuse the visitor session.
assert.equal((await call('/member/stars?unit=bike',null,vt)).status,401);
assert.equal((await call('/member/evo-cache?unit=bike',null,vt)).status,401);
// Pop Live classes in any unit, with the cross-unit id; dash with events and Pop Fit summary.
const cl=await call('/pop-live/student?unit=gym&action=classes',null,vt);assert.equal(cl.status,200,JSON.stringify(cl.body));assert.equal(cl.body.classes[0].id,'555');
const dash=await call('/pop-live/student?unit=gym&action=dash',null,vt);assert.equal(dash.status,200);assert.equal(dash.body.visitor,true);assert.equal(dash.body.scope,'live');
assert.equal(dash.body.events[0].name,'Bike Pop Games 1ª Edição');assert.deepEqual(dash.body.fit.week_classes,0);
const health=await call('/pop-live/student?unit=gym&action=health',null,vt);assert.equal(health.body.health.sex,'F');assert.equal(health.body.health.birth_date,'1994-04-12');

// Login: the Club Pop entry keeps the rule (no contract → refused); the Pop Live entry lets the visitor in.
assert.equal((await call('/auth/login',{cpf:visitor.cpf,pin:visitor.pin})).body.error,'CONTRATO_INATIVO');
const li=await call('/auth/login',{cpf:visitor.cpf,pin:visitor.pin,app:'live'});assert.equal(li.status,200);assert.equal(li.body.member.scope,'live');

// A student entering through Pop Live: first access + PIN, full (Club) session.
const fa=await call('/auth/first-access',{cpf:'52998224725',email:'ana@exemplo.com',birthDate:'1990-01-01',app:'live'});assert.equal(fa.status,200,JSON.stringify(fa.body));
const cp=await call('/auth/create-pin',{challenge:fa.body.challenge,pin:'147258',app:'live'});assert.equal(cp.status,200);assert.equal(cp.body.scope,'club');assert.ok(cp.body.token);
assert.equal((await call('/auth/me',null,cp.body.token)).body.member.scope,'club');
const sl=await call('/auth/login',{cpf:'52998224725',pin:'147258',app:'live'});assert.equal(sl.body.member.scope,'club');
console.log('PASS Pop Live access: visitor signup, Pop Live-only session, Club rule kept, student through Pop Live, dash data');
