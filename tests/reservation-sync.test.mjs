import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {ensureReservationSchema,saveReservationSnapshot,startReservationSync,processReservationSync,reservationTime,reservationDates,reservationParticipants,normalizeReservations} from '../lib/reservation-sync.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');
 const wrap=(text,args=[])=>({bind:(...v)=>wrap(text,v),run:async()=>({meta:{changes:sql.prepare(text).run(...args).changes}}),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)})});
 const db={prepare:wrap,batch:async stm=>{sql.exec('BEGIN');try{const out=[];for(const q of stm)out.push(await q.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 sql.exec('CREATE TABLE evo_request_log(unit TEXT,purpose TEXT,method TEXT,endpoint TEXT,status INTEGER,ok INTEGER)');
 return {db,sql};
}
const row={idMember:975709,slotNumber:5,name:'Cristiane da Silva de Deus'};
const base={unit:'bike',sessionId:'123',date:'2026-10-23',time:'07:15',name:'Bike Pop',rows:[row]};
test('normalizes EVO times with seconds, AM/PM and validates lists',()=>{
 assert.equal(reservationTime('07:15:00 AM'),'07:15');assert.equal(reservationTime('07:15 PM'),'19:15');assert.equal(reservationTime('12:00 AM'),'00:00');assert.throws(()=>reservationTime('25:00'));
 assert.throws(()=>reservationParticipants({message:'error'}));assert.deepEqual(reservationParticipants({participants:[]}),[]);
 assert.deepEqual(reservationDates(new Date('2026-10-23T01:00:00Z')),['2026-10-22','2026-10-23']);
 assert.equal(normalizeReservations([{...row,removed:'false'}],'bike').length,1);
 assert.equal(normalizeReservations([{...row,removed:true}],'bike').length,0);
 assert.equal(normalizeReservations([{...row,status:'cancelled'}],'bike').length,0);
});
test('real SQL: replacement removes access, empty list clears, stale snapshots never restore it',async()=>{
 const {db,sql}=database();await ensureReservationSchema(db);const t=Date.now()-1000;
 await saveReservationSnapshot(db,{...base,observedAt:t});assert.equal(sql.prepare('SELECT slot_number FROM checkin_reservation_snapshots').get().slot_number,5);
 await saveReservationSnapshot(db,{...base,rows:[],observedAt:t+1});assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,0);
 const stale=await saveReservationSnapshot(db,{...base,observedAt:t});assert.equal(stale.superseded,true);assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,0);
 await saveReservationSnapshot(db,{...base,observedAt:t+2});await assert.rejects(saveReservationSnapshot(db,{...base,rows:[{...row,slotNumber:null}],observedAt:t+3}));assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,1);
 await saveReservationSnapshot(db,{...base,rows:[{...row,removed:true}],observedAt:t+4});assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,0);
});
test('jobs resume by batches, deduplicate manual clicks, count real requests and record success',async t=>{
 const {db,sql}=database(),now=new Date();let calls=0;
 t.mock.method(globalThis,'fetch',async url=>{calls++;const u=new URL(url);return Response.json(u.pathname.endsWith('/detail')?{idActivitySession:123,participants:[row]}:[{idActivitySession:123,activityDate:u.searchParams.get('date'),startTime:'23:59',name:'Bike Pop'}]);});
 const first=await startReservationSync(db,'bike','test',true,now);assert.equal(first.started,true);
 assert.equal((await startReservationSync(db,'bike','second',true,now)).started,false);
 const config=async()=>({dns:'test',token:'test'});
 await processReservationSync({DB:db},'bike',config,1);
 assert.equal(sql.prepare('SELECT state FROM evo_reservation_jobs').get().state,'pending');
 await processReservationSync({DB:db},'bike',config,3);
 const log=sql.prepare('SELECT * FROM evo_sync_schedule_runs').get(),detail=JSON.parse(log.detail);
 assert.equal(log.status,'done');assert.equal(detail.requests,calls);assert.equal(calls,3);assert.equal(detail.classesSaved,1);assert.ok(detail.finishedAt);assert.equal(detail.manual,true);
 assert.equal(sql.prepare('SELECT count(*) n FROM evo_request_log').get().n,3);
 assert.equal(sql.prepare('SELECT evo_member_id FROM checkin_reservation_snapshots').get().evo_member_id,'975709');
 await processReservationSync({DB:db},'bike',config);assert.equal(calls,3);
 assert.equal((await startReservationSync(db,'bike','test',false,now)).started,false);
});
test('failed detail preserves old reservation and reports failure rather than false success',async t=>{
 const {db,sql}=database();await ensureReservationSchema(db);await saveReservationSnapshot(db,base);
 t.mock.method(globalThis,'fetch',async url=>{const u=new URL(url);return u.pathname.endsWith('/detail')?new Response('{}',{status:503}):Response.json([{idActivitySession:123,activityDate:u.searchParams.get('date'),startTime:'23:59',name:'Bike Pop'}]);});
 await startReservationSync(db,'bike','fail',true);
 await processReservationSync({DB:db},'bike',async()=>({dns:'t',token:'t'}),3);
 const log=sql.prepare('SELECT * FROM evo_sync_schedule_runs').get(),q=JSON.parse(log.detail);
 assert.equal(log.status,'failed');assert.equal(q.requests,3);assert.match(q.failures[0].error,/503/);assert.equal(sql.prepare('SELECT count(*) n FROM checkin_reservation_snapshots').get().n,1);
});
test('network failure counts attempts; active lease prevents overlapping worker requests',async t=>{
 const {db,sql}=database();await startReservationSync(db,'bike','network',true);
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('network');});
 sql.prepare('UPDATE evo_reservation_jobs SET lease_until=?').run(Date.now()+60000);
 await processReservationSync({DB:db},'bike',async()=>({dns:'t',token:'t'}));assert.equal(calls,0);
 sql.prepare('UPDATE evo_reservation_jobs SET lease_until=0').run();
 await processReservationSync({DB:db},'bike',async()=>({dns:'t',token:'t'}));
 assert.equal(calls,2);const log=sql.prepare('SELECT * FROM evo_sync_schedule_runs').get();assert.equal(log.status,'failed');assert.equal(JSON.parse(log.detail).requests,2);
});
test('worker: student sees tomorrow without EVO, check-in removal immediately revokes chat',async t=>{
 const {default:worker}=await import('../club-pop-worker.mjs');
 const {db,sql}=database();await ensureReservationSchema(db);
 sql.exec("CREATE TABLE members(id INTEGER,evo_member_id INTEGER,gym_client_id TEXT,status TEXT);CREATE TABLE auth_sessions(member_id INTEGER,token_hash TEXT,revoked_at TEXT,expires_at TEXT);INSERT INTO members VALUES(1,975709,NULL,'ACTIVE');");
 const token='fixture-only',hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 sql.prepare('INSERT INTO auth_sessions VALUES(?,?,NULL,?)').run(1,hash,new Date(Date.now()+86400000).toISOString());
 const env={DB:db,CLUBPOP_CHECKIN_SYNC_TOKEN:'fixture-secret'};
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Unexpected external request');});
 const date=reservationDates()[1],stamp=Date.now()-5000;
 await saveReservationSnapshot(db,{...base,date,observedAt:stamp});
 const headers={Authorization:'Bearer '+token};
 const next=await (await worker.fetch(new Request('https://local/student-next-class?unit=bike',{headers}),env)).json();assert.equal(next.reservation.slot_number,5);assert.equal(next.reservation.activity_date,date);assert.equal(next.evoRequestsMade,0);
 await worker.fetch(new Request('https://local/class-chat?unit=bike&session_id=123',{headers}),env);
 sql.prepare("INSERT INTO class_chat_settings(unit,enabled,test_member_id,open_before) VALUES('bike',1,'975709',1440)").run();
 const chat=await worker.fetch(new Request('https://local/class-chat?unit=bike&session_id=123',{headers}),env);assert.equal(chat.status,200);
 const cleared=await worker.fetch(new Request('https://local/checkin-snapshot',{method:'POST',headers:{Authorization:'Bearer fixture-secret','Content-Type':'application/json'},body:JSON.stringify({unit:'bike',date,session:{idActivitySession:'123',startTime:'07:15:00'},enrollments:[],observedAt:stamp+1})}),env);assert.equal(cleared.status,200);
 const blocked=await worker.fetch(new Request('https://local/class-chat?unit=bike&session_id=123',{headers}),env);assert.equal(blocked.status,403);assert.equal((await blocked.json()).error,'RESERVA_NAO_ENCONTRADA');
 const gone=await (await worker.fetch(new Request('https://local/student-next-class?unit=bike',{headers}),env)).json();assert.equal(gone.reservation,null);
 const unauth=await worker.fetch(new Request('https://local/admin/evo-reservation-run',{method:'POST'}),env);assert.equal(unauth.status,401);
});
