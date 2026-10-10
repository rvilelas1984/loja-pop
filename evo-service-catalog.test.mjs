import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from './club-pop-worker.mjs';
function fixture(t, pages, unit='bike') {
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE evo_service_catalog(unit TEXT,evo_service_id TEXT,service_name TEXT,price REAL,is_active INTEGER,raw_json TEXT,last_synced_at TEXT,PRIMARY KEY(unit,evo_service_id));
 CREATE TABLE evo_service_catalog_sync(unit TEXT PRIMARY KEY,last_success_at TEXT,last_count INTEGER);
 CREATE TABLE evo_unit_config(unit TEXT,dns TEXT,token TEXT,expires_at TEXT,enabled INTEGER);
 CREATE TABLE evo_request_log(unit TEXT,purpose TEXT,method TEXT,endpoint TEXT,status INTEGER,ok INTEGER);
 INSERT INTO evo_unit_config VALUES('bike','bike','bike-token','2099-01-01',1),('gym','gym','gym-token','2099-01-01',1);
 INSERT INTO evo_service_catalog VALUES('bike','9999','Anterior',10,1,'{}','old'),('gym','9999','Gym anterior',20,1,'{}','old');`);
 const wrap=(sql,args=[])=>({bind(...a){assert.ok(a.length<=100);return wrap(sql,a)},async first(){return db.prepare(sql).get(...args)},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}});
 const env={DB:{prepare:wrap,async batch(statements){db.exec('BEGIN');try{for(const s of statements)await s.run();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}}};
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/api/admin-auth'))return Response.json({role:'admin'});
  const u=new URL(url);assert.equal(u.pathname,'/api/v1/service');assert.equal(u.searchParams.get('take'),'50');assert.equal(Number(u.searchParams.get('skip')),calls*50);
  assert.equal(options.headers.Authorization,'Basic '+btoa(unit+':'+unit+'-token'));
  const page=pages[calls++];return typeof page==='number'?new Response('',{status:page}):Response.json(page);
 };
 t.after(()=>{globalThis.fetch=original;db.close()});
 return {db,calls:()=>calls,async request(method='POST',cookie='test'){const r=await worker.fetch(new Request('https://test/admin/evo-service-catalog?unit='+unit,{method,headers:cookie?{'x-clubpop-admin-cookie':cookie}:{}}),env);return {status:r.status,...await r.json()}}};
}
const service=id=>({idService:id,nameService:'Serviço '+id,value:39.9,inactive:false});
test('official fields, 121 services, pagination, inactive and unit isolation',async t=>{
 const rows=Array.from({length:121},(_,i)=>service(i+1));rows[0].inactive=true;rows[1].value=0;
 const f=fixture(t,[rows.slice(0,50),rows.slice(50,100),rows.slice(100)]);
 assert.equal((await f.request()).saved,121);assert.equal(f.calls(),3);
 assert.deepEqual({...f.db.prepare("SELECT service_name,price,is_active FROM evo_service_catalog WHERE unit='bike' AND evo_service_id='1'").get()},{service_name:'Serviço 1',price:39.9,is_active:0});
 assert.equal(f.db.prepare("SELECT price FROM evo_service_catalog WHERE unit='bike' AND evo_service_id='2'").get().price,0);
 assert.equal(f.db.prepare("SELECT is_active FROM evo_service_catalog WHERE unit='gym'").get().is_active,1);
 const read=await f.request('GET');assert.equal(read.services.length,122);assert.equal(read.requests,0);assert.equal(f.calls(),3);
});
test('Gym credentials and writes are separate',async t=>{const f=fixture(t,[[service(1)]],'gym');assert.equal((await f.request()).saved,1);assert.equal(f.db.prepare("SELECT is_active FROM evo_service_catalog WHERE unit='bike'").get().is_active,1)});
for(const [label,pages] of [['403',[403]],['invalid JSON shape',[{}]],['duplicate',[[service(1),service(1)]]],['null item',[[null]]],['later failure',[Array.from({length:50},(_,i)=>service(i+1)),403]]]){
 test(label+' preserves previous catalog',async t=>{const f=fixture(t,pages);const r=await f.request();assert.equal(r.ok,false);assert.equal(f.db.prepare('SELECT count(*) n FROM evo_service_catalog').get().n,2);assert.equal(f.db.prepare('SELECT count(*) n FROM evo_service_catalog_sync').get().n,0);if(label==='403')assert.match(r.message,/permissão Service/)});
}
test('empty successful catalog deactivates only selected unit',async t=>{const f=fixture(t,[[]]);assert.equal((await f.request()).saved,0);assert.equal(f.db.prepare("SELECT is_active FROM evo_service_catalog WHERE unit='bike'").get().is_active,0);assert.equal(f.db.prepare("SELECT is_active FROM evo_service_catalog WHERE unit='gym'").get().is_active,1)});
test('missing admin session prevents EVO call',async t=>{const f=fixture(t,[]);assert.equal((await f.request('POST','')).status,401);assert.equal(f.calls(),0)});
