import assert from 'node:assert/strict';
import {database} from './currency-ledger.test.mjs';
import worker from '../club-pop-worker.mjs';
import {saveCurrency,localToday} from '../lib/currency-ledger.mjs';
const db=database(),env={DB:db},auth={role:'admin',units:['bike','gym','club'],permissions:['*']};
db.sqlite.exec("INSERT INTO members(id,evo_member_id,cpf_hash,first_name) VALUES(1,100,'h','Test'); CREATE TABLE auth_sessions(member_id INTEGER,token_hash TEXT,revoked_at TEXT,expires_at TEXT);");
const token='test-token',hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');db.sqlite.prepare('INSERT INTO auth_sessions VALUES(?,?,NULL,?)').run(1,hash,'2099-01-01T00:00:00Z');
await saveCurrency(db,auth,'bike',{code:'popcoins',name:'Popcoins',symbol:'PC',brl_value:.01,status:'active',units:['bike']});
const day=localToday(),mission={id:'mission-test',unit:'bike',status:'Ativo',start:day,end:day,type:'presence',requireDistinctDays:true,eligibility:'all',goals:[{id:'goal-1',value:1,rewardType:'currency',rewards:[{type:'currency',rewardId:1,amount:10}]}]};
db.sqlite.prepare('INSERT INTO app_content VALUES(?,?,CURRENT_TIMESTAMP)').run('club-pop',JSON.stringify({missionList:[mission],products:[]}));
db.sqlite.prepare('INSERT INTO evo_member_attendance VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)').run('bike','100','confirmed',day,'10:00','Bike','session','{"presenca":true}');
const savedFetch=globalThis.fetch;let calls=0;globalThis.fetch=async url=>{calls++;assert.equal(url,'https://loja-pop-green.vercel.app/api/admin-auth?route=me');return Response.json(auth);};
try{
 const req=()=>new Request('https://worker/mission-redemptions/claim',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({missionId:'mission-test',goalId:'goal-1'})});
 const first=await worker.fetch(req(),env);assert.equal(first.status,200,await first.clone().text());assert.equal((await first.json()).rewardType,'currency');assert.equal((await (await worker.fetch(req(),env)).json()).alreadyClaimed,true);assert.equal((await db.prepare('SELECT balance FROM club_currency_wallets').first()).balance,10);assert.equal(calls,0);
 const url='https://worker/admin/currencies?unit=bike&action=balances&currency=1';assert.equal((await worker.fetch(new Request(url),env)).status,401);
 const r=await worker.fetch(new Request(url,{headers:{'x-clubpop-admin-cookie':'test'}}),env);assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).stats.balance,10);assert.equal(calls,1);
 auth.units=['bike'];assert.equal((await worker.fetch(new Request(url.replace('unit=bike','unit=gym'),{headers:{'x-clubpop-admin-cookie':'test'}}),env)).status,403);
 const store=await worker.fetch(new Request('https://worker/currency-store?unit=gym',{headers:{Authorization:'Bearer '+token}}),env);assert.equal(store.status,403);
 console.log('PASS: real Worker routes, mission claim once, D1-only student flow, admin authentication and cross-unit denial.');
}finally{globalThis.fetch=savedFetch;}
