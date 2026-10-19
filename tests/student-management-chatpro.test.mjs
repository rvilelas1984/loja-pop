import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
const html=readFileSync(new URL('../admin-gestao-alunos.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
const matches=vm.runInNewContext('('+html.match(/function matchesAbsence[\s\S]*?(?=\nfunction apply)/)[0]+')');
test('absence ranges are inclusive, disjoint and exclude unknown history',()=>{
 const buckets={'1-3':[1,2,3],'4-5':[4,5],'6-7':[6,7],'8-14':[8,9,10,11,12,13,14],'15-29':Array.from({length:15},(_,i)=>i+15),'30+':[30,31]};
 for(const [range,expected] of Object.entries(buckets))assert.deepEqual(Array.from({length:32},(_,i)=>i).filter(d=>matches(d,range)),expected);
 for(const range of Object.keys(buckets))for(const value of [null,undefined,'invalid'])assert.equal(matches(value,range),false);
});
const claim=vm.runInNewContext('('+worker.match(/async function claimStudentDispatch[\s\S]*?(?=\nasync function chatproAdminConfig)/)[0]+')');
function fixture(){const db=new DatabaseSync(':memory:');const env={DB:{prepare(sql){return {args:[],bind(...args){this.args=args;return this},async run(){const r=db.prepare(sql).run(...this.args);return {meta:{changes:Number(r.changes)}}},async first(){return db.prepare(sql).get(...this.args)}}}}};return {env,db};}
const body={unit:'bike',batchId:'12345678-1234-1234-1234-123456789abc',groupName:'Ausentes'};
test('dispatch claim blocks concurrent repeats and acknowledges accepted repeats',async()=>{
 const {env,db}=fixture();const a=await claim(env,body,'5511999999999',7,['bike']);assert.equal(typeof a.finish,'function');
 assert.equal((await claim(env,body,'5511999999999',7,['bike'])).status,409);
 await a.finish('accepted');assert.equal((await claim(env,body,'5511999999999',7,['bike'])).duplicate,true);
 assert.equal((await claim(env,body,'5511999999999',8,['bike'])).status,409);db.close();
});
test('uncertain delivery is never automatically resent; units and phones validated',async()=>{
 const {env,db}=fixture();assert.equal((await claim(env,{...body,unit:'gym'},'5511999999999',7,['bike'])).status,403);
 assert.equal((await claim(env,body,'invalid',7,['bike'])).status,400);
 const a=await claim(env,body,'5511999999999',7,['bike']);await a.finish('review');
 assert.equal((await claim(env,body,'5511999999999',7,['bike'])).status,409);db.close();
});
test('real ChatPro handler uses phone lookup and flow endpoint once per batch',async()=>{
 const {env,db}=fixture();const raw=new Uint8Array(32).fill(7),iv=new Uint8Array(12).fill(9);
 const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('chatpro:config')},key,new TextEncoder().encode('mock-api-key'));
 env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY=Buffer.from(raw).toString('base64');
 db.exec("CREATE TABLE club_chatpro_config(id INTEGER PRIMARY KEY,api_key_cipher TEXT,base_url TEXT,enabled INTEGER,enabled_units TEXT)");
 db.prepare('INSERT INTO club_chatpro_config VALUES(1,?,?,1,?)').run(Buffer.from(iv).toString('base64')+'.'+Buffer.from(encrypted).toString('base64'),'https://example.test/api','["bike"]');
 const original=env.DB.prepare;env.DB.prepare=sql=>{const st=original(sql);st.all=async()=>({results:db.prepare(sql).all(...st.args)});return st};
 let sends=0;const fetch=async(url,options)=>{
  if(url.includes('admin-auth'))return {ok:true,json:async()=>({role:'admin'})};
  if(url.includes('get_by_phone/5511999999999'))return {ok:true,json:async()=>({id:42})};
  assert.equal(url,'https://example.test/api/subscriber/42/send_flow/');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{flow:7});sends++;return {ok:true,json:async()=>({success:true})};
 };
 const handler=vm.runInNewContext('('+worker.match(/async function chatproAdminConfig[\s\S]*?(?=\nasync function mpAdminConfig)/)[0]+')',{crypto,atob,btoa,Uint8Array,TextEncoder,TextDecoder,AbortSignal,fetch,claimStudentDispatch:claim,chatproSafeApiUrl:()=>true});
 const invoke=async overrides=>handler(new Request('https://worker.test/admin/chatpro-config?action=send',{method:'POST',headers:{'x-clubpop-admin-cookie':'mock'},body:JSON.stringify({...body,phone:'5511999999999',flow:7,source:'student-management',confirm:true,...overrides})}),env,new URL('https://worker.test/admin/chatpro-config?action=send'),(data,status=200)=>({data,status}));
 assert.equal((await invoke({confirm:false})).status,400);assert.equal(sends,0);
 assert.equal((await invoke({})).data.ok,true);assert.equal((await invoke({})).data.duplicate,true);assert.equal(sends,1);db.close();
});
