import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {allCaptureStatements,eventSources,eventParams,readEventCenter} from '../lib/event-center.mjs';
import {saveReservationSnapshot,saveProspectReservationSnapshot} from '../lib/reservation-sync.mjs';
import {receptionAction} from '../lib/checkout-fitcoins.mjs';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync(new URL('./fixtures/event-center-schema.sql',import.meta.url),'utf8'));
 sql.exec("INSERT INTO members(id,evo_member_id,first_name,cpf_hash) VALUES(1,123,'Aluno Teste','test');INSERT INTO app_content VALUES('club-pop','{}',CURRENT_TIMESTAMP)");
 for(const statement of allCaptureStatements())sql.exec(statement);
 const wrap=(text,args=[])=>({bind:(...args)=>wrap(text,args),async run(){const before=sql.prepare('select total_changes() n').get().n;const r=sql.prepare(text).run(...args);return {meta:{changes:sql.prepare('select total_changes() n').get().n-before,last_row_id:Number(r.lastInsertRowid)}}},async all(){return {results:sql.prepare(text).all(...args)}},async first(){return sql.prepare(text).get(...args)||null}});
 const db={prepare:wrap,async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const q of stmts)out.push(await q.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 return {sql,db};
}
const params=extra=>eventParams(new URLSearchParams({unit:'club',start:day,end:day,...extra}));
test('all deployed schema capture statements compile; no historical replay',()=>{
 const {sql}=fixture();assert.equal(sql.prepare('SELECT count(*) n FROM audit_log').get().n,0);assert.equal(eventSources.length,198);assert(allCaptureStatements().length>400);sql.close();
});
test('captures new client and opportunity once, ignores timestamp refresh and protects secrets',async()=>{
 const {sql,db}=fixture();sql.exec("INSERT INTO evo_daily_registrations(unit,category,evo_id,register_day,register_at,payload_json) VALUES('bike','client','456','2026-10-27','2026-10-27T11:00:00Z','{\"cpf\":\"secret\"}'),('gym','opportunity','456','2026-10-27',NULL,'{}')");
 sql.exec("UPDATE evo_daily_registrations SET updated_at='2099-01-01'");
 const rows=sql.prepare('SELECT action,metadata_json FROM audit_log').all();assert.equal(rows.length,2);assert(rows.some(r=>r.action==='cp.registration.client.detected'));assert(rows.some(r=>r.action==='cp.registration.opportunity.detected'));assert(!JSON.stringify(rows).includes('secret'));
 const r=await readEventCenter(db,params({unit:'bike'}));assert.equal(r.total,1);assert.equal(r.events[0].unit,'bike');assert.equal(r.events[0].occurredAt,'2026-10-27T11:00:00Z');sql.close();
});
test('attendance refresh cannot duplicate a presence; source day is separate from detection',async()=>{
 const {sql,db}=fixture();const insert="INSERT INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,raw_json) VALUES('bike','123','a','2026-10-20','{}')";sql.exec(insert);sql.exec("DELETE FROM evo_member_attendance");sql.exec(insert);sql.exec("UPDATE evo_member_attendance SET synced_at='2099-01-01'");
 assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.evo_member_attendance.created'").get().n,1);const r=await readEventCenter(db,params());assert.equal(r.events[0].occurredAt,null);assert.equal(r.events[0].data.attendance_date,'2026-10-20');sql.close();
});
test('reservation snapshots: identical, change, removal, rebooking, stale and malformed payloads',async()=>{
 const {sql,db}=fixture(),stamp=Date.now()-20000;const base={unit:'bike',sessionId:'88',date:day,time:'19:00',name:'Bike Pop',rows:[{idMember:123,name:'Aluno',slotNumber:1}]};
 await saveReservationSnapshot(db,{...base,observedAt:stamp});await saveReservationSnapshot(db,{...base,observedAt:stamp+1});assert.equal(sql.prepare('SELECT count(*) n FROM audit_log').get().n,1);
 await saveReservationSnapshot(db,{...base,rows:[{...base.rows[0],slotNumber:2}],observedAt:stamp+2});
 await saveReservationSnapshot(db,{...base,rows:[],observedAt:stamp+3});await saveReservationSnapshot(db,{...base,observedAt:stamp+1});assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,0);
 await saveReservationSnapshot(db,{...base,observedAt:stamp+4});await assert.rejects(saveReservationSnapshot(db,{...base,rows:null,observedAt:stamp+5}));
 assert.deepEqual(sql.prepare('SELECT action FROM audit_log ORDER BY id').all().map(r=>r.action),['detected','changed','removed','detected'].map(k=>'cp.checkin_reservation_snapshots.'+k));sql.close();
});
test('prospects use prospect identity, honor version and do not repeat on identical list',async()=>{
 const {sql,db}=fixture(),stamp=Date.now()-1000,b={unit:'gym',sessionId:'12',date:day,time:'08:00',name:'Aula',observedAt:stamp,rows:[{idProspect:456,name:'Teste'}]};
 sql.prepare('INSERT INTO checkin_snapshot_versions VALUES(?,?,?)').run('gym','12',stamp);await saveProspectReservationSnapshot(db,b);await saveProspectReservationSnapshot(db,b);await saveProspectReservationSnapshot(db,{...b,observedAt:stamp-1,rows:[]});assert.equal(sql.prepare('SELECT count(*) n FROM audit_log').get().n,1);const e=JSON.parse(sql.prepare('SELECT metadata_json FROM audit_log').get().metadata_json);assert.equal(e.prospect_id,'456');sql.close();
});
test('app page heartbeat does not create new navigation, no token or chat text in events',async()=>{
 const {sql,db}=fixture();sql.exec("INSERT INTO auth_sessions(member_id,token_hash,expires_at) VALUES(1,'PRIVATE_TOKEN','2099-01-01');INSERT INTO club_app_page_sessions VALUES('page-session','1','bike','missoes',1,1,1);UPDATE club_app_page_sessions SET last_seen=2;INSERT INTO class_chat_messages(unit,session_id,member_id,slot_number,content) VALUES('bike','a','1',1,'PRIVATE_MESSAGE')");
 assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action LIKE 'cp.club_app_page_sessions.%'").get().n,1);
 const r=await readEventCenter(db,params());assert(!JSON.stringify(r.events).includes('PRIVATE'));assert(r.events.some(x=>x.name==='Aluno Teste'));sql.close();
});
test('content changes are individual, same write deduplicates, updates and deletion are tracked',()=>{
 const {sql}=fixture();const put=x=>sql.prepare("UPDATE app_content SET content_json=? WHERE content_key='club-pop'").run(JSON.stringify(x));put({missionList:[{id:'m1',name:'Teste',unit:'bike',status:'Ativo'}]});put({missionList:[{id:'m1',name:'Teste',unit:'bike',status:'Ativo'}]});put({missionList:[{id:'m1',name:'Teste',unit:'bike',status:'Inativo'}]});put({missionList:[]});assert.deepEqual(sql.prepare("SELECT action FROM audit_log WHERE action LIKE 'cp.content.%' ORDER BY id").all().map(x=>x.action),['created','updated','deleted'].map(x=>'cp.content.missionList.'+x));sql.close();
});
test('filters, stable ten-item pagination, unknown tables and zero EVO calls',async()=>{
 const {sql,db}=fixture();for(let i=0;i<13;i++)sql.prepare("INSERT INTO class_chat_messages(unit,session_id,member_id,slot_number,content) VALUES('bike','a','1',1,?)").run('text'+i);sql.exec('CREATE TABLE new_business_source(id INTEGER)');
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('No outbound calls')};try{const a=await readEventCenter(db,params({type:'cp.class_chat_messages.created'})),b=await readEventCenter(db,params({type:'cp.class_chat_messages.created',page:'2'}));assert.equal(a.events.length,10);assert.equal(b.events.length,3);assert.equal(new Set([...a.events,...b.events].map(e=>e.id)).size,13);assert(a.sources.some(s=>s.table==='new_business_source'&&s.mode==='unmapped'));assert.equal((await readEventCenter(db,params({search:"' OR 1=1 --"}))).total,0);assert.equal((await readEventCenter(db,params({unit:'gym'}))).total,0);assert.equal(a.evoRequestsMade,0)}finally{globalThis.fetch=old;sql.close()}
});
test('invalid dates and pagination rejected',()=>{for(const x of [{start:'2026-02-30'},{unit:'x'},{page:'-1'},{page:'NaN'},{start:'2020-01-01'}])assert.throws(()=>params(x));});
test('checkout unique claim still succeeds with D1 counting audit trigger rows, duplicate claim stays blocked',async()=>{
 const {sql,db}=fixture();sql.exec("INSERT INTO club_pix_orders(id,member_id,unit,item_type,item_id,amount_cents,status,idempotency_key,reservation_state,external_member_id,external_state,external_before,currency_quantity) VALUES('test',1,'bike','product','p',0,'creating','test','held','123','review',322,27)");
 const order=sql.prepare("SELECT * FROM club_pix_orders WHERE id='test'").get();
 const details={checkedEvo:true,reason:'Conferido',evidence:'Teste local',actor:'test'};
 const r=await receptionAction(db,order,'coins_confirmed',async()=>{throw Error('Must not call EVO')},details);assert.equal(r.status,'approved');assert.equal(sql.prepare("SELECT status FROM club_pix_orders WHERE id='test'").get().status,'approved');
 await assert.rejects(()=>receptionAction(db,order,'coins_confirmed',async()=>{},details));sql.close();
});

test('conquests: first baseline never replays awards, crossing emits medal/trophy once, concurrent retry idempotent',async()=>{
 const {conquestStatements}=await import('../lib/conquest-events.mjs');const {db,sql}=fixture();
 await db.batch(conquestStatements(db,{unit:'bike',evoId:'123',stars:99}));assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action LIKE 'cp.conquest.%'").get().n,0);
 await db.batch(conquestStatements(db,{unit:'bike',evoId:'123',stars:100,previous:99}));await db.batch(conquestStatements(db,{unit:'bike',evoId:'123',stars:100,previous:99}));
 assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.conquest.medal.earned'").get().n,1);assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.conquest.trophy.earned'").get().n,1);
 const r=await readEventCenter(db,params());assert.equal(r.total,2);assert(r.events.every(e=>!e.key.startsWith('_cp.')));sql.close();
});
test('voucher usage timestamp is an event even when no status column changes',async()=>{
 const {db,sql}=fixture();sql.exec("INSERT INTO partner_code_vouchers(benefit_id,unit,member_id,member_name,code) VALUES('b','bike','1','Aluno','PRIVATE_CODE');UPDATE partner_code_vouchers SET used_at='2026-10-27T15:00:00Z' WHERE benefit_id='b'");const r=await readEventCenter(db,params({type:'cp.partner_code_vouchers.updated'}));assert.equal(r.total,1);assert.equal(r.events[0].occurredAt,'2026-10-27T15:00:00Z');assert(!JSON.stringify(r.events).includes('PRIVATE_CODE'));sql.close();
});
test('mixed invalid collection entries cannot break content saves',()=>{
 const {sql}=fixture();sql.prepare("UPDATE app_content SET content_json=? WHERE content_key='club-pop'").run(JSON.stringify({missionList:[null,3,'text',{id:'m',name:'safe'}]}));assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.content.missionList.created'").get().n,1);sql.close();
});

test('new central endpoint enforces admin session and unit scope; no EVO request',async()=>{
 const {default:worker}=await import('../club-pop-worker.mjs');const {db,sql}=fixture(),old=globalThis.fetch;let calls=0;
 const base='https://worker/admin/activity-center?view=events&start='+day+'&end='+day;
 try{globalThis.fetch=async url=>{calls++;assert.equal(url,'https://loja-pop-green.vercel.app/api/admin-auth?route=me');return Response.json({role:'admin',units:['bike']})};
 assert.equal((await worker.fetch(new Request(base+'&unit=bike'),{DB:db})).status,401);assert.equal(calls,0);
 for(const unit of ['gym','club'])assert.equal((await worker.fetch(new Request(base+'&unit='+unit,{headers:{'x-clubpop-admin-cookie':'test'}}),{DB:db})).status,403);
 const response=await worker.fetch(new Request(base+'&unit=bike',{headers:{'x-clubpop-admin-cookie':'test'}}),{DB:db});assert.equal(response.status,200);assert.equal((await response.json()).evoRequestsMade,0);
 }finally{globalThis.fetch=old;sql.close()}
});
test('lazily created mission source gets capture before first operation',async()=>{
 const {ensureEventSourceCapture}=await import('../lib/event-center.mjs');const {db,sql}=fixture();sql.exec('CREATE TABLE club_mission_final_choice (member_id INTEGER,mission_id TEXT,period_key TEXT,goal_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(member_id,mission_id,period_key))');await ensureEventSourceCapture(db,'club_mission_final_choice');sql.exec("INSERT INTO club_mission_final_choice(member_id,mission_id,period_key,goal_id) VALUES(1,'m','month','12')");assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.club_mission_final_choice.created'").get().n,1);sql.close();
});
test('200 reservations keep capture parameters bounded and preserve atomicity',async()=>{
 const {db,sql}=fixture();const rows=Array.from({length:200},(_,i)=>({idMember:i+1,slotNumber:i+1,name:'Test'}));await saveReservationSnapshot(db,{unit:'bike',sessionId:'20',date:day,time:'20:00',name:'Bike',rows});assert.equal(sql.prepare("SELECT count(*) n FROM audit_log WHERE action='cp.checkin_reservation_snapshots.detected'").get().n,200);sql.close();
});
test('production query plan uses member primary key and large origin filters fit D1 parameters',async()=>{
 const {sql,db}=fixture(),seen=[];
 const observed={prepare(text){let statement=db.prepare(text);return {bind(...args){assert(args.length<=100,'D1 parameter limit');statement=statement.bind(...args);return this},all(){seen.push(text);return statement.all()}}}};
 await readEventCenter(observed,params({origin:eventSources.find(s=>s.mode==='trigger').origin}));
 const count=seen.find(s=>s.startsWith('SELECT a.action,COUNT'));
 assert(!count.includes('JOIN members'),'unfiltered counts must not resolve names');
 const history=seen.find(s=>s.startsWith('SELECT a.id,a.action'));
 const plan=sql.prepare('EXPLAIN QUERY PLAN '+history).all(...['2000-01-01','2099-01-01',JSON.stringify(['cp.example']),0]);
 assert(plan.some(r=>/SEARCH m USING INTEGER PRIMARY KEY/.test(r.detail)),JSON.stringify(plan));
 sql.close();
});
