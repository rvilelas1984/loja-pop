// Pop Music Experience: eligibility (Bike only, Gym only, both units), survey rules (rhythms, 1-5 artists, official
// teachers, one atomic answer per month), privacy, monthly renewal, recovering last month and admin rankings.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../club-pop-worker.mjs';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync('tests/currency-schema.sql','utf8'));
sql.exec(`CREATE TABLE IF NOT EXISTS auth_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER,token_hash TEXT,expires_at TEXT,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS evo_member_contracts(unit TEXT,evo_member_id TEXT,id_membership TEXT,membership_name TEXT,membership_status TEXT,start_date TEXT,end_date TEXT,cancel_date TEXT);
CREATE TABLE IF NOT EXISTS evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,instructor_name TEXT,status TEXT,attendance_count INTEGER);`);
const stmt=(text,args=[])=>({text,args,bind:(...v)=>stmt(text,v),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)}),run:async()=>{const r=sql.prepare(text).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}});
// D1 batch is a transaction: all statements or none.
const DB={prepare:t=>stmt(t),batch:async list=>{sql.exec('BEGIN');try{const out=[];for(const s of list)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
const env={DB};
let adminRole='admin',adminPerms=['*'];
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,init)=>String(url).includes('/api/admin-auth?route=me')?Response.json({role:adminRole,permissions:adminPerms}):realFetch(url,init);
const call=async(path,body,token)=>{const r=await worker.fetch(new Request('https://worker'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});return {status:r.status,body:await r.json().catch(()=>({}))}};
const admin=async(q,body)=>{const r=await worker.fetch(new Request('https://worker/admin/pop-music?'+q,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-clubpop-admin-cookie':'s=1'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});return {status:r.status,body:await r.json().catch(()=>({}))}};
const sha=async v=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))).toString('hex');
async function student(id,bike,gym){sql.prepare("INSERT INTO members(id,evo_member_id,gym_client_id,cpf_hash,first_name,status) VALUES(?,?,?,?,?,'ACTIVE')").run(id,bike,gym,'h'+id,'Aluno'+id);
 const token='tok-'+id;sql.prepare("INSERT INTO auth_sessions(member_id,token_hash,expires_at) VALUES(?,?,'2099-01-01T00:00:00Z')").run(id,await sha(token));return token}

// Contracts: Bike only (1), Gym only (2), both units (3), Gym contract released for Bike by the shared-access rule (4).
sql.exec(`INSERT INTO evo_member_contracts(unit,evo_member_id,id_membership,membership_name,membership_status,start_date,end_date,cancel_date,contract_key,raw_json) VALUES('bike','100','10','Plano Bike','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}'),('gym','200','20','Plano Gym','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}'),
 ('bike','300','10','Plano Bike','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}'),('gym','301','20','Plano Gym','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}'),('gym','400','30','Gym + Bike','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}'),
 ('bike','500','10','Plano Bike','cancelled','2020-01-01','2020-02-01','2020-02-01','k'||random(),'{}')`);
sql.prepare("INSERT INTO club_settings(key,value) VALUES('shared_unit_access',?)").run(JSON.stringify({revision:'r1',rules:[{sourceUnit:'gym',contractId:'30'}]}));
// Official Bike Pop classes (teachers) and one Gym class (its teacher must not appear).
sql.exec(`INSERT INTO evo_attendance_sessions VALUES('bike','s1',date('now','-3 days'),'07:00','Bike','Douglas','done',18),('bike','s2',date('now','-2 days'),'19:00','Bike','Robinho','done',20),
 ('bike','s3',date('now','-1 days'),'08:00','Bike','Will','done',12),('gym','g1',date('now','-1 days'),'08:00','Funcional','Prof. Gym','done',9),('bike','old',date('now','-200 days'),'08:00','Bike','Antigo','done',5)`);
const tBike=await student(1,100,null),tGym=await student(2,null,'200'),tBoth=await student(3,300,'301'),tShared=await student(4,null,'400'),tOld=await student(5,500,null);

const realNow=Date.now;const at=iso=>{Date.now=()=>Date.parse(iso)};
// Before the first campaign (Dec 2026): eligible students see it closed.
at('2026-11-27T12:00:00Z');
let st=await call('/member/pop-music?action=status',null,tBike);assert.equal(st.status,200,JSON.stringify(st.body));assert.equal(st.body.open,false);assert.equal(st.body.opens,'2026-12');
assert.equal((await call('/member/pop-music?action=form',null,tBike)).body.error,'PESQUISA_AINDA_NAO_ABERTA');
// Eligibility: Gym only and inactive contracts are refused; both units and shared access are accepted; no session → 401.
at('2026-12-01T03:00:00Z'); // 00:00 in São Paulo: December campaign opens automatically.
assert.equal((await call('/member/pop-music?action=status',null,tGym)).body.error,'EXCLUSIVO_ALUNOS_BIKE_POP');
assert.equal((await call('/member/pop-music?action=status',null,tOld)).status,403);
assert.equal((await call('/member/pop-music?action=status',null,tBoth)).body.open,true);
assert.equal((await call('/member/pop-music?action=status',null,tShared)).body.month,'2026-12');
assert.equal((await call('/member/pop-music?action=status')).status,401);
at('2026-12-01T02:59:00Z');assert.equal((await call('/member/pop-music?action=status',null,tBike)).body.open,false,'still November in São Paulo');
at('2026-12-05T15:00:00Z');

// Form: full catalog without class names, official Bike teachers only.
const form=(await call('/member/pop-music?action=form',null,tBike)).body;assert.equal(form.ok,true,JSON.stringify(form));
assert.ok(form.rhythms.length>=10);assert.deepEqual(form.teachers,['Douglas','Robinho','Will']);
const R=slug=>form.rhythms.find(r=>r.slug===slug),A=(slug,name)=>R(slug).artists.find(a=>a.name===name).id;
assert.ok(form.rhythms.every(r=>r.artists.every(a=>!/ride|experience|aula/i.test(a.name))));
const pop=R('pop'),funk=R('funk'),rock=R('rock');
// Validation.
const sub=(t,rhythms,extra={})=>call('/member/pop-music?action=submit',{rhythms,...extra},t);
assert.equal((await sub(tBike,[])).body.error,'ESCOLHA_AO_MENOS_UM_RITMO');
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:[],teacher:'Douglas'}])).body.error,'ESCOLHA_AO_MENOS_UM_ARTISTA_POR_RITMO');
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:pop.artists.slice(0,6).map(a=>a.id),teacher:'Douglas'}])).body.error,'MAXIMO_5_ARTISTAS_POR_RITMO');
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:pop.artists.slice(0,5).map(a=>a.id),suggestions:['Banda Nova'],teacher:'Douglas'}])).body.error,'MAXIMO_5_ARTISTAS_POR_RITMO','suggestions count toward 5');
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:[A('rock','Queen')],teacher:'Douglas'}])).body.error,'ARTISTA_INVALIDO','artist must belong to the rhythm');
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:[A('pop','Dua Lipa')],teacher:'Prof. Gym'}])).body.error,'ESCOLHA_UM_PROFESSOR_POR_RITMO','only official Bike teachers');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM pm_votes').get().n,0,'nothing saved on invalid answers');
// Several rhythms, same teacher for two of them, a suggestion (also typed like a catalog artist → matched).
const ok=await sub(tBike,[{rhythm_id:pop.id,artist_ids:[A('pop','Dua Lipa'),A('pop','Bruno Mars')],teacher:'Douglas'},
 {rhythm_id:funk.id,artist_ids:[A('funk','Anitta')],suggestions:['MC Novo Talento','anitta'],teacher:'Douglas'},
 {rhythm_id:rock.id,artist_ids:[A('rock','Queen'),A('rock','Foo Fighters'),A('rock','Linkin Park'),A('rock','AC/DC'),A('rock','Bon Jovi')],teacher:'Will'}]);
assert.equal(ok.status,200,JSON.stringify(ok.body));assert.equal(ok.body.choices.length,3);
assert.deepEqual(ok.body.choices.find(c=>c.rhythm_id===funk.id).artists.map(a=>a.name||a.suggestion),['Anitta','MC Novo Talento']);
// One answer per month (backend), even with a direct second submit.
assert.equal((await sub(tBike,[{rhythm_id:pop.id,artist_ids:[A('pop','Dua Lipa')],teacher:'Douglas'}])).body.error,'JA_RESPONDEU_ESTE_MES');
assert.equal((await call('/member/pop-music?action=form',null,tBike)).body.error,'JA_RESPONDEU_ESTE_MES');
assert.equal(sql.prepare('SELECT COUNT(*) n FROM pm_votes').get().n,1);
// Atomic: a failing detail row leaves no half answer.
const t6=await student(6,600,null);sql.exec("INSERT INTO evo_member_contracts(unit,evo_member_id,id_membership,membership_name,membership_status,start_date,end_date,cancel_date,contract_key,raw_json) VALUES('bike','600','10','Plano Bike','active','2020-01-01','2099-01-01',NULL,'k'||random(),'{}')");
sql.exec(`CREATE TRIGGER boom BEFORE INSERT ON pm_vote_artists WHEN NEW.artist_id=${A('pop','Rihanna')} BEGIN SELECT RAISE(ABORT,'x'); END`);
let crashed=false;try{const r=await sub(t6,[{rhythm_id:pop.id,artist_ids:[A('pop','Dua Lipa'),A('pop','Rihanna')],teacher:'Douglas'}]);crashed=r.status>=500}catch{crashed=true}
sql.exec('DROP TRIGGER boom');assert.ok(crashed);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM pm_votes WHERE member_id=6').get().n,0,'no half answer');assert.equal(sql.prepare('SELECT COUNT(*) n FROM pm_vote_rhythms').get().n,3);
st=(await call('/member/pop-music?action=status',null,tBike)).body;assert.equal(st.voted,true);assert.equal(st.next_month,'2027-01');
const mine=(await call('/member/pop-music?action=mine',null,tBike)).body;assert.equal(mine.choices.length,3);assert.deepEqual(mine.history,['2026-12']);
// Privacy: another student sees only their own (nothing), and cannot pass someone else's id.
const other=(await call('/member/pop-music?action=mine&member_id=1',null,tBoth)).body;assert.equal(other.voted,false);assert.deepEqual(other.choices,[]);
// Second student (both units) votes; the shared-access student too.
assert.equal((await sub(tBoth,[{rhythm_id:pop.id,artist_ids:[A('pop','Dua Lipa')],teacher:'Robinho'},{rhythm_id:funk.id,artist_ids:[A('funk','Ludmilla')],suggestions:['MC Novo Talento'],teacher:'Douglas'}])).status,200);
assert.equal((await sub(tShared,[{rhythm_id:pop.id,artist_ids:[A('pop','Taylor Swift')],teacher:'Douglas'}])).status,200);

// Admin rankings with real data only.
let rk=(await admin('action=rankings&month=2026-12')).body;assert.equal(rk.ok,true,JSON.stringify(rk));
assert.equal(rk.participants,3);assert.equal(rk.eligible,4,'bike 100, 300, 600 and the shared gym 400 (cancelled 500 out)');assert.equal(rk.participation_pct,75);
assert.equal(rk.rhythms[0].name,'Pop Internacional');assert.equal(rk.rhythms[0].votes,3);
assert.equal(rk.artists[0].name,'Dua Lipa');assert.equal(rk.artists[0].votes,2);
assert.equal(rk.artists.find(a=>a.name==='MC Novo Talento').votes,2);assert.equal(rk.artists.find(a=>a.name==='MC Novo Talento').suggested,1);
assert.equal(rk.teachers_by_rhythm.find(t=>t.rhythm==='Pop Internacional'&&t.teacher==='Douglas').votes,2);
assert.ok(rk.artists_by_teacher.some(x=>x.teacher==='Will'&&x.name==='Queen'));
assert.equal(rk.suggestions[0].name,'MC Novo Talento');
assert.equal((await admin('action=rankings&month=2026-12&teacher=Robinho')).body.participants,1,'filter by teacher');
assert.equal((await admin('action=rankings&month=2026-12&rhythm='+rock.id)).body.participants,1,'filter by rhythm');
assert.equal((await admin('action=rankings&month=2026-11')).body.participants,0,'empty month shows zero, no invented data');

// Catalog: suggestion incorporated, artist deactivated keeps history, reception is read-only.
const cat=(await admin('action=catalog')).body;const sg=cat.suggestions.find(s=>s.name==='MC Novo Talento');
assert.equal((await admin('',{op:'suggestion_add',id:sg.id})).status,200);
const queen=A('rock','Queen');assert.equal((await admin('',{op:'artist_active',id:queen,active:false})).status,200);
assert.equal((await admin('',{op:'artist_save',name:'Pabllo Vittar',rhythm_ids:[funk.id]})).body.error,'ARTISTA_JA_EXISTE');
const nw=(await admin('',{op:'artist_save',name:'Banda Teste Real',rhythm_ids:[rock.id]})).body;assert.ok(nw.id);
assert.ok((await admin('action=rankings&month=2026-12')).body.artists.some(a=>a.name==='Queen'),'history kept after deactivation');
adminRole='reception';adminPerms=['/tela-checkin.html'];assert.equal((await admin('action=overview')).status,403);
adminPerms=['/admin-playlists.html'];assert.equal((await admin('action=overview')).status,200);assert.equal((await admin('',{op:'artist_active',id:queen,active:true})).body.error,'APENAS_ADMIN');
adminRole='admin';adminPerms=['*'];
// Themed class linked to the official class: occupancy compared with regular classes of the same teacher.
sql.exec(`INSERT INTO evo_attendance_sessions VALUES('bike','d1','2026-12-10','07:00','Bike','Douglas','done',30),('bike','d2','2026-12-11','07:00','Bike','Douglas','done',20),('bike','d3','2026-12-12','07:00','Bike','Douglas','done',10)`);
const ta=await admin('',{op:'themed_add',month:'2026-12',teacher:'Douglas',class_name:'Divas do Pop',rhythm_id:pop.id,class_date:'2026-12-10',evo_session_id:'d1',artists:'Dua Lipa'});assert.equal(ta.status,200);assert.equal(ta.body.notified,3,'students who asked for Pop');
// The student sees "your request became a class": rhythm, the teacher they chose, their artists; only for matching requests.
assert.equal((await admin('',{op:'themed_add',month:'2026-12',teacher:'Will',class_name:'Rock Ride',rhythm_id:rock.id,class_date:'2026-12-20',class_time:'19:00'})).body.notified,1);
let th1=(await call('/member/pop-music?action=status',null,tBike)).body.themed;assert.deepEqual(th1.map(t=>t.class_name),['Divas do Pop','Rock Ride']);
assert.equal(th1[0].your_teacher,true);assert.deepEqual(th1[0].your_artists,['Dua Lipa']);assert.equal(th1[1].your_teacher,true);
assert.deepEqual((await call('/member/pop-music?action=status',null,tShared)).body.themed.map(t=>t.class_name),['Divas do Pop'],'no rock request, no rock notice');
assert.equal((await call('/member/pop-music?action=status',null,tShared)).body.themed[0].your_teacher,true);
assert.equal((await call('/member/pop-music?action=mine',null,tBike)).body.themed.length,2);
const th=(await admin('action=themed&month=2026-12')).body;assert.equal(th.list[0].attendance,30);assert.equal(th.list.length,2);assert.deepEqual(th.comparison,{themed_avg:30,themed_classes:1,regular_avg:15,regular_classes:2});
assert.equal((await admin('action=themed&month=2027-01')).body.comparison,null,'no fake indicators');

// Monthly renewal: January opens alone; recovering December returns the old answer (without inactive Queen) and saves nothing until confirmed.
at('2027-01-01T03:30:00Z');
st=(await call('/member/pop-music?action=status',null,tBike)).body;assert.equal(st.month,'2027-01');assert.equal(st.voted,false);assert.equal(st.previous_month,'2026-12');
const rec=(await call('/member/pop-music?action=form&previous=1',null,tBike)).body;assert.equal(rec.previous.month,'2026-12');
assert.ok(!rec.rhythms.find(r=>r.id===rock.id).artists.some(a=>a.name==='Queen'),'inactive artist out of the form');
assert.ok(rec.rhythms.find(r=>r.id===funk.id).artists.some(a=>a.name==='MC Novo Talento'),'incorporated suggestion is now in the catalog');
assert.equal(sql.prepare("SELECT COUNT(*) n FROM pm_votes WHERE month='2027-01'").get().n,0,'nothing saved without confirmation');
const again=await sub(tBike,[{rhythm_id:rock.id,artist_ids:[A('rock','Foo Fighters')],teacher:'Will'}],{recovered_from:'2026-12'});assert.equal(again.status,200);
assert.deepEqual((await call('/member/pop-music?action=mine',null,tBike)).body.history,['2027-01','2026-12'],'monthly history preserved');
assert.equal((await call('/member/pop-music?action=mine&month=2026-12',null,tBike)).body.choices.length,3);
Date.now=realNow;globalThis.fetch=realFetch;
console.log('PASS Pop Music Experience: eligibility, survey rules, atomic monthly answer, privacy, renewal and recovery, admin rankings, catalog and themed classes');
