// Run: node --test activity-center.test.mjs. Uses an isolated in-memory database only.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import crypto from 'node:crypto';
import worker,{activityParams,readActivityCenter,activityTypes} from './club-pop-worker.mjs';
import proxy from './api/admin-auth.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE members(id INTEGER PRIMARY KEY,first_name TEXT,last_name TEXT,evo_member_id INTEGER,gym_client_id TEXT);
 CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_type TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT,created_at TEXT);
 CREATE TABLE app_content(content_key TEXT,content_json TEXT);
 CREATE TABLE pop_fit_manual_activities(id INTEGER PRIMARY KEY,member_id INTEGER,created_at TEXT);
 CREATE TABLE pop_fit_images(id INTEGER PRIMARY KEY,member_id INTEGER,scope TEXT,created_at TEXT);
 CREATE TABLE redemptions(id INTEGER PRIMARY KEY,member_id INTEGER,unit TEXT,requested_at TEXT,completed_at TEXT);
 CREATE TABLE evo_member_attendance(unit TEXT,attendance_date TEXT,activity_name TEXT);
 CREATE TABLE evo_attendance_sessions(unit TEXT,status TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,attendance_count INTEGER);
 INSERT INTO members VALUES(1,'Test','Bike',123,NULL),(2,'Test','Gym',NULL,'123');
 INSERT INTO pop_fit_manual_activities VALUES(1,1,'2026-10-09 12:00:00');
 INSERT INTO pop_fit_images VALUES(1,1,'bike','2026-10-09 12:00:00'),(2,2,'gym','2026-10-09 12:00:00');
 INSERT INTO audit_log VALUES(1,'MEMBER','1','POP_FIT_IMAGE_GENERATED','POP_FIT_IMAGE','1','{"unit":"bike"}','2026-10-09 12:00:00'),
 (2,'MEMBER','1','POP_FIT_EDITED','POP_FIT_ENTRY','a','{"unit":"bike"}','2026-10-09 12:00:00'),
 (3,'MEMBER','1','POP_FIT_SHARE_CLICKED','POP_FIT_IMAGE','1','{"unit":"bike"}','2026-10-09 12:00:00'),
 (4,'AUTH',NULL,'FIRST_ACCESS_DATA_MISMATCH','AUTH',NULL,NULL,'2026-10-09 12:00:00'),
 (5,'MEMBER','1','POP_FIT_EDITED','POP_FIT_ENTRY','b','{"unit":"bike"}','2026-10-09 02:59:59'),
 (6,'MEMBER','1','POP_FIT_EDITED','POP_FIT_ENTRY','c','{"unit":"bike"}','2026-10-10 02:59:59'),
 (7,'MEMBER','1','POP_FIT_EDITED','POP_FIT_ENTRY','d','{"unit":"bike"}','2026-10-10 03:00:00');
 INSERT INTO redemptions VALUES(1,1,'bike','2026-10-09 12:00:00','2026-10-09 13:00:00');
 INSERT INTO evo_member_attendance(unit,attendance_date) VALUES('bike','2026-10-09'),('gym','2026-10-09');
 INSERT INTO evo_attendance_sessions(unit,status,activity_date) VALUES('bike','done','2026-10-09'),('gym','pending','2026-10-09');`);
 db.prepare('INSERT INTO app_content VALUES(?,?)').run('club-pop',JSON.stringify({redemptions:[{id:'shop1',memberId:123,unit:'gym',createdAt:'2026-10-09T12:00:00Z',completedAt:'2026-10-09T13:00:00Z'}],transactions:[{id:'grant',memberId:123,unit:'bike',createdAt:'2026-10-09T12:00:00Z',direction:'credit',origin:'mission',status:'COMPLETED',fitcoins:90},{id:'refund',unit:'bike',createdAt:'2026-10-09T12:00:00Z',direction:'credit',origin:'refund',status:'COMPLETED',fitcoins:100}]}));
 const env={DB:{prepare(sql){return {bind(...args){return {sql,args}}}},async batch(items){return items.map(x=>({results:db.prepare(x.sql).all(...x.args)}))}}};
 return {db,env};
}
const params=extra=>activityParams(new URLSearchParams({unit:'club',start:'2026-10-09',end:'2026-10-09',...extra}));
test('validates calendar, interval, unit, page, status and category',()=>{
 for(const x of [{start:'2026-02-30'},{start:'2024-01-01'},{unit:'other'},{page:'-1'},{page:'1.2'},{status:'pending'},{category:'whatever'},{origin:'EVO'}])assert.throws(()=>params(x));
 assert.equal(params().page,1);
});
test('all 11 types; missing sources remain unavailable; UTC bounds, dedup and refunds',async()=>{
 const {env,db}=fixture();const r=await readActivityCenter(env,params());const count=k=>r.metrics.find(x=>x.key===k);
 assert.equal(r.metrics.length,11);for(const k of ['reservation','cancellation','referral'])assert.equal(count(k).count,null);
 assert.equal(count('image_generated').count,2);assert.equal(count('workout_created').count,1);assert.equal(count('workout_edited').count,2);assert.equal(count('share_clicked').count,1);assert.equal(count('failure').count,1);assert.equal(count('reward_requested').count,2);assert.equal(count('reward_completed').count,2);assert.equal(count('fitcoins_granted').amount,90);assert.equal(r.attendance,2);assert.equal(r.classes,1);assert.equal(r.evoRequestsMade,0);db.close();
});
test('Bike/Gym isolation including equal EVO IDs; personal records only Club',async()=>{
 const {env,db}=fixture();const bike=await readActivityCenter(env,params({unit:'bike'})),gym=await readActivityCenter(env,params({unit:'gym'}));
 assert(bike.events.every(x=>x.unit==='bike'));assert(gym.events.every(x=>x.unit==='gym'));assert(gym.events.filter(x=>x.origin==='Conteúdo D1').every(x=>x.member_id===2));assert.equal(bike.metrics.find(x=>x.key==='workout_created').count,0);db.close();
});
test('filters apply equally to history/counts, no SQL injection, pagination stable',async()=>{
 const {env,db}=fixture();const r=await readActivityCenter(env,params({search:'Test Bike',category:'workout_edited',origin:'Pop Fit',status:'confirmed'}));assert.equal(r.total,2);assert.equal(r.events.length,2);
 assert.equal((await readActivityCenter(env,params({search:"' OR 1=1 --"}))).total,0);
 const insert=db.prepare("INSERT INTO audit_log(actor_type,actor_id,action,metadata_json,created_at) VALUES('MEMBER','1','POP_FIT_SHARE_CLICKED','{\"unit\":\"bike\"}','2026-10-09 12:00:00')");for(let i=0;i<60;i++)insert.run();
 const a=await readActivityCenter(env,params()),b=await readActivityCenter(env,params({page:'2'}));assert.equal(a.events.length,50);assert.equal(new Set([...a.events,...b.events].map(x=>x.id)).size,a.total);db.close();
});
test('Worker auth/method checks; authenticated route only D1 plus admin-session verification',async()=>{
 const saved=globalThis.fetch;let calls=0;const {env,db}=fixture();try{
 globalThis.fetch=async url=>{calls++;assert.equal(url,'https://loja-pop-green.vercel.app/api/admin-auth?route=me');return Response.json({role:'reception'})};
 const url='https://worker/admin/activity-center?'+new URLSearchParams({unit:'bike',start:'2026-10-09',end:'2026-10-09'});
 assert.equal((await worker.fetch(new Request(url),env)).status,401);assert.equal(calls,0);
 assert.equal((await worker.fetch(new Request(url,{method:'POST'}),env)).status,405);
 assert.equal((await worker.fetch(new Request(url,{headers:{'x-clubpop-admin-cookie':'test'}}),env)).status,403);
 globalThis.fetch=async url=>{assert.equal(url,'https://loja-pop-green.vercel.app/api/admin-auth?route=me');return Response.json({role:'admin'})};
 const r=await worker.fetch(new Request(url,{headers:{'x-clubpop-admin-cookie':'test'}}),env);assert.equal(r.status,200);assert.equal((await r.json()).evoRequestsMade,0);
 }finally{globalThis.fetch=saved;db.close()}
});
test('proxy denies absent/reception sessions; signed admin forwarded with no-store',async()=>{
 const saved=globalThis.fetch,old=process.env.ADMIN_KEY;process.env.ADMIN_KEY='local-test-key';
 const response=()=>({status(n){this.code=n;return this},setHeader(k,v){(this.headers??={})[k]=v;return this},send(v){this.body=JSON.parse(v);return this}});
 const cookie=role=>{const exp=String(Date.now()+60000),s=role+'.'+exp;return 'clubpop_admin='+s+'.'+crypto.createHmac('sha256',process.env.ADMIN_KEY).update(s).digest('hex')};
 try{globalThis.fetch=async()=>{throw Error('Unexpected network')};for(const c of ['',cookie('reception')]){const res=response();await proxy({method:'GET',query:{route:'activity-center'},headers:{cookie:c}},res);assert.equal(res.code,401)}
 globalThis.fetch=async(url,opt)=>{assert(url.includes('/admin/activity-center?'));assert.equal(opt.cache,'no-store');return Response.json({ok:true,evoRequestsMade:0})};
 const res=response();await proxy({method:'GET',query:{route:'activity-center',unit:'bike',start:'2026-10-09',end:'2026-10-09'},headers:{cookie:cookie('admin')}},res);assert.equal(res.code,200);assert.equal(res.headers['cache-control'],'no-store');
 }finally{globalThis.fetch=saved;if(old===undefined)delete process.env.ADMIN_KEY;else process.env.ADMIN_KEY=old}
});
test('Pop Fit real handlers: authentication, ownership, edits, image retention and share clicks; zero external calls',async()=>{
 const {env,db}=fixture();db.exec(`ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'ACTIVE';
 CREATE TABLE auth_sessions(token_hash TEXT,member_id INTEGER,revoked_at TEXT,expires_at TEXT);
 ALTER TABLE audit_log ADD COLUMN unused TEXT;
 DROP TABLE pop_fit_images;DROP TABLE pop_fit_manual_activities;
 ALTER TABLE evo_member_attendance ADD COLUMN evo_member_id TEXT;
 ALTER TABLE evo_member_attendance ADD COLUMN attendance_key TEXT;
 UPDATE evo_member_attendance SET evo_member_id='123',attendance_key='session1';
 DELETE FROM audit_log;`);
 db.prepare('INSERT INTO auth_sessions VALUES(?,?,NULL,?)').run(crypto.createHash('sha256').update('local-token').digest('hex'),1,'2099-01-01T00:00:00Z');
 env.DB.prepare=sql=>{const wrap=args=>({sql,args,first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{last_row_id:Number(r.lastInsertRowid),changes:r.changes}}}});return {...wrap([]),bind:(...args)=>wrap(args)}};
 const old=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External request forbidden')};
 const req=(body,unit='bike',method='POST',authenticated=true)=>worker.fetch(new Request('https://worker/member/pop-fit?scope='+unit,{method,headers:{'content-type':'application/json',...(authenticated?{authorization:'Bearer local-token'}:{})},body:JSON.stringify(body)}),env);
 try{
 assert.equal((await req({action:'share-click',imageId:1},'bike','POST',false)).status,401);
 for(let i=0;i<4;i++){const r=await req({action:'save-image',imageData:'data:image/jpeg;base64,AA=='});assert.equal(r.status,200);assert((await r.json()).imageId>0)}
 assert.equal(db.prepare('SELECT COUNT(*) n FROM pop_fit_images').get().n,3);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='POP_FIT_IMAGE_GENERATED'").get().n,4);
 assert.equal((await req({action:'share-click',imageId:4})).status,200);
 assert.equal((await req({action:'share-click',imageId:1})).status,404);
 assert.equal((await req({action:'share-click',imageId:4},'gym')).status,400);
 assert.equal((await req({unit:'bike',attendanceKey:'session1',weight:70,calories:300},'bike','PUT')).status,200);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='POP_FIT_EDITED'").get().n,1);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM audit_log WHERE action='POP_FIT_SHARE_CLICKED'").get().n,1);
 }finally{globalThis.fetch=old;db.close()}
});