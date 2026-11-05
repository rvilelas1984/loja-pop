import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {startReservationSync,processReservationSync,ensureReservationSchema} from '../lib/reservation-sync.mjs';
function database(){
 const sql=new DatabaseSync(':memory:');
 const wrap=(text,args=[])=>({bind:(...v)=>wrap(text,v),run:async()=>({meta:{changes:sql.prepare(text).run(...args).changes}}),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)})});
 const db={prepare:wrap,batch:async stm=>{const out=[];for(const q of stm)out.push(await q.run());return out}};
 sql.exec('CREATE TABLE evo_request_log(unit TEXT,purpose TEXT,method TEXT,endpoint TEXT,status INTEGER,ok INTEGER)');return {db,sql};
}
test('invalid session zero is reported without EVO detail request and valid classes still saved',async t=>{
 const {db,sql}=database();let details=[];
 await startReservationSync(db,'gym','invalid-test',true,new Date(Date.now()+86400000));
 t.mock.method(globalThis,'fetch',async url=>{const u=new URL(url);if(u.pathname.endsWith('/detail')){details.push(u.searchParams.get('idActivitySession'));return Response.json({idActivitySession:123,participants:[]})}return Response.json([{idActivitySession:0,startTime:'23:59',name:'Burn Pop',activityDate:u.searchParams.get('date')},{idActivitySession:123,startTime:'23:59',name:'Ritbox',activityDate:u.searchParams.get('date')}])});
 await processReservationSync({DB:db},'gym',async()=>({dns:'test',token:'test'}),10);
 const row=sql.prepare('SELECT status,detail FROM evo_sync_schedule_runs').get(),p=JSON.parse(row.detail);
 assert.equal(row.status,'done');assert.equal(p.classesSaved,1);assert.deepEqual(details,['123']);assert.ok(p.skippedWithoutSessionId>=1);
});
test('empty EVO response produces explicit failure without writing snapshot',async t=>{
 const {db,sql}=database();await ensureReservationSchema(db);await startReservationSync(db,'gym','empty-test',true,new Date(Date.now()+86400000));
 t.mock.method(globalThis,'fetch',async url=>{const u=new URL(url);return u.pathname.endsWith('/detail')?new Response(null,{status:204}):Response.json([{idActivitySession:123,startTime:'23:59',name:'Ritbox',activityDate:u.searchParams.get('date')}])});
 await processReservationSync({DB:db},'gym',async()=>({dns:'test',token:'test'}),10);
 const p=JSON.parse(sql.prepare('SELECT detail FROM evo_sync_schedule_runs').get().detail);
 assert.ok(p.failures.some(f=>f.error==='EVO_SEM_CONTEUDO'));assert.equal(p.classesSaved,0);assert.equal(sql.prepare('SELECT count(*) n FROM checkin_snapshot_versions').get().n,0);
});
test('429 respects Retry-After and resumes the same job without an immediate second EVO call',async t=>{
 const {db,sql}=database();let calls=0;
 await startReservationSync(db,'gym','rate-limit',false,new Date());
 t.mock.method(globalThis,'fetch',async()=>++calls===1?new Response(null,{status:429,headers:{'Retry-After':'1800'}}):Response.json([]));
 const run=()=>processReservationSync({DB:db},'gym',async()=>({dns:'test',token:'test'}));const before=Date.now();await run();
 const held=sql.prepare('SELECT state,lease_until FROM evo_reservation_jobs').get();assert.equal(held.state,'pending');assert.ok(held.lease_until>=before+1800000);await run();assert.equal(calls,1);
 sql.exec('UPDATE evo_reservation_jobs SET lease_until=0');await run();assert.equal(calls,2);assert.equal(sql.prepare('SELECT state FROM evo_reservation_jobs').get().state,'done');
});
