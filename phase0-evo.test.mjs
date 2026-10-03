import test, {beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {getEvoTransport, serviceSignature, verifyServiceRequest} from './lib/evo-transport.js';
import configHandler from './api/evo-config.js';
import evoHandler from './api/evo.js';
import adminHandler from './api/evo-admin.js';
import checkinHandler from './api/tela-checkin.js';
import redemptionHandler from './api/redemption.js';
import {executeFitcoinReward} from './lib/fitcoin-reward.js';

const source=fs.readFileSync(new URL('./club-pop-worker.mjs',import.meta.url),'utf8');
const worker=await import('data:text/javascript;base64,'+Buffer.from(source+'\nexport {getEvoConfig,evoProfile,evoAttendance,findEvoMember,findGymEvoMember,missionProgressValue,allowedEvoTarget};').toString('base64'));
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const originalFetch=globalThis.fetch;
let config, env, calls, writes, catalog, balance, saved, upstreamStatus;
const validConfig=()=>({dns:'d1-bike',token:'d1-current-token',enabled:1,expires_at:'2099-12-31'});
function resMock(){return {statusCode:200,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},json(d){this.data=d;return this},send(d){this.data=typeof d==='string'?JSON.parse(d):d;return this}}}
async function invoke(handler,query={},body={},headers={},method='GET') {const res=resMock();await handler({query,body,headers,method},res);return res}
function cookie(role='admin'){const p=role+'.'+(Date.now()+60000);return 'clubpop_admin='+p+'.'+crypto.createHmac('sha256',process.env.ADMIN_KEY).update(p).digest('hex')}
beforeEach(()=>{
 process.env.ADMIN_KEY='test-only-service-key';process.env.EVO_DNS='legacy-must-not-be-used';process.env.EVO_TOKEN='legacy-must-not-be-used';process.env.GYM_EVO_DNS='gym-original';process.env.GYM_EVO_TOKEN='gym-token';
 config=validConfig();calls=[];writes=[];saved=[];balance=100;upstreamStatus=200;
 catalog={products:[{id:'p',name:'Produto',unit:'bike',status:'Ativo',fitcoins:10}],services:[{id:'s',name:'Serviço',unit:'bike',status:'Ativo',fitcoins:10,eligibility:{mode:'active_contract',acceptedContracts:['78686']}}],redemptions:[],transactions:[],missionList:[{id:'m',unit:'bike',name:'Missão',start:'2026-01-01',end:'2099-12-31',goals:[{id:'g',rewardType:'fitcoins',fitcoinAction:{enabled:true,amount:5,direction:'credit'}}]}],promotions:[{id:'p',unit:'bike',name:'Promoção',status:'Ativo',start:'2026-01-01',end:'2099-12-31',fitcoinAction:{enabled:true,amount:5,direction:'credit',attendance:0}}]};
 env={AUTH_PEPPER:'test-pepper',GYM_EVO_DNS:'gym-original',GYM_EVO_TOKEN:'gym-token',DB:{prepare(sql){let args=[];return {bind(...a){args=a;return this},async first(){if(sql.includes('evo_unit_config')){if(config instanceof Error)throw config;return config}if(sql.includes('COUNT'))return {n:0,total:1};return null},async all(){return {results:[]}},async run(){writes.push({sql,args});return {success:true}}}}}};
 Object.defineProperties(env,{EVO_DNS:{get(){throw Error('LEGACY DNS ACCESSED')}},EVO_TOKEN:{get(){throw Error('LEGACY TOKEN ACCESSED')}}});
 globalThis.fetch=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.pathname==='/internal/evo-bike')return worker.default.fetch(new Request(url,{...options}),env);
  if(url.pathname==='/api/evo-config'&&url.searchParams.get('route')==='verify-service'){
   const r=await invoke(configHandler,{route:'verify-service'},JSON.parse(options.body),options.headers,'POST');return response(r.data,r.statusCode);
  }
  if(url.pathname==='/api/admin-auth')return response({ok:true,role:'admin'});
  if(url.pathname==='/auth/me')return response({ok:true,member:{id:1,evoMemberId:7,gymMemberId:8,firstName:'Teste'}});
  if(url.hostname==='api.github.com'){
   if(options.method==='PUT'){const d=JSON.parse(options.body);catalog=JSON.parse(Buffer.from(d.content,'base64'));saved.push(structuredClone(catalog));return response({ok:true})}
   return response({sha:'fixture',content:Buffer.from(JSON.stringify(catalog)).toString('base64')});
  }
  assert.match(url.hostname,/^evo-integracao(?:-api)?\.w12app\.com\.br$/);
  const auth=new Headers(options.headers).get('Authorization');calls.push({url:String(url),method:options.method||'GET',auth});
  if(upstreamStatus!==200)return response({message:'Recusado'},upstreamStatus);
  if(url.pathname.endsWith('/fitcoins')&&options.method==='PUT'){balance+=(url.searchParams.get('type')==='1'?1:-1)*Number(url.searchParams.get('fitcoin'));return response({ok:true})}
  if(url.pathname.endsWith('/fitcoins'))return response({totalFitcoins:balance});
  if(url.pathname.endsWith('/schedule/detail'))return response({name:'Bike',startTime:'09:00',enrollments:[{idMember:7,name:'Aluno Teste',slotNumber:1}]});
  if(url.pathname.endsWith('/schedule'))return response([{idActivitySession:3,name:'Bike Pop',startTime:'09:00'}]);
  if(url.pathname.endsWith('/member/sessions'))return response([{idActivitySession:3,date:'2026-10-01',presenca:true,isFinalized:true}]);
  if(url.pathname.endsWith('/membership/category'))return response([{idCategory:1,name:'Plano'}]);
  if(url.pathname.endsWith('/membermembership'))return response([]);
  if(url.pathname.endsWith('/membership'))return response([{idMembership:78686,name:'Plano'}]);
  if(url.pathname.endsWith('/activities'))return response([{id:3,name:'Bike'}]);
  return response({idMember:7,firstName:'Aluno',lastName:'Teste',email:'test@example.invalid',birthDate:'1990-01-01',totalFitCoins:balance,memberships:[{idMembership:78686,endDate:'2099-12-31'}]});
 };
});
afterEach(()=>{globalThis.fetch=originalFetch});

for(const [name,row,code] of [
 ['ausente',null,'EVO_NAO_CONFIGURADA'],['desativada',{...validConfig(),enabled:0},'EVO_CONFIG_DESATIVADA'],
 ['vencida',{...validConfig(),expires_at:'2000-01-01'},'CREDENCIAL_EVO_EXPIRADA'],['sem validade',{...validConfig(),expires_at:''},'EVO_VALIDADE_INVALIDA'],
 ['data impossível',{...validConfig(),expires_at:'2099-02-30'},'EVO_VALIDADE_INVALIDA'],['sem token',{...validConfig(),token:''},'EVO_CONFIG_INCOMPLETA'],
 ['D1 indisponível',new Error('database offline'),'EVO_CONFIG_INDISPONIVEL']
])test('configuração '+name+' bloqueia todas as entradas sem fallback nem alteração de histórico',async()=>{
 config=row;
 for(const run of [()=>worker.evoProfile(env,7),()=>worker.evoAttendance(env,7,'2026-10-01','2026-10-31',1),()=>worker.findEvoMember(env,'123'),()=>worker.missionProgressValue(env,{id:1,evo_member_id:7},{start:'2026-10-01',end:'2026-10-31'})])await assert.rejects(run,e=>e.code===code);
 for(const [handler,query] of [[evoHandler,{member:'7'}],[adminHandler,{kind:'contracts'}],[checkinHandler,{}]]){
  const r=await invoke(handler,query,{}, {cookie:cookie()});assert.equal(r.statusCode,503);assert.equal(r.data.error,code);
 }
 assert.equal(calls.length,0);assert.equal(writes.length,0);assert.equal(saved.length,0);
});
test('rotação, desativação e restauração D1 no mesmo processo, sem cache nem deploy',async()=>{
 await worker.evoProfile(env,7);config={...validConfig(),token:'rotated'};await worker.evoProfile(env,7);
 config.enabled=0;await assert.rejects(()=>worker.evoProfile(env,7));config.enabled=1;await worker.evoProfile(env,7);
 assert.deepEqual(calls.map(x=>x.auth),['Basic '+btoa('d1-bike:d1-current-token'),'Basic '+btoa('d1-bike:rotated'),'Basic '+btoa('d1-bike:rotated')]);
});
test('primeiro acesso/localização usa D1 nas duas chamadas EVO',async()=>{assert.equal((await worker.findEvoMember(env,'123')).idMember,7);assert.equal(calls.length,2);assert.ok(calls.every(x=>x.auth==='Basic '+btoa('d1-bike:d1-current-token')))});
test('presenças preservadas quando EVO recusa token',async()=>{upstreamStatus=401;await assert.rejects(()=>worker.evoAttendance(env,7,'2026-10-01','2026-10-31',1));assert.equal(writes.length,0)});
test('presenças válidas continuam sincronizando',async()=>{assert.equal((await worker.evoAttendance(env,7,'2026-10-01','2026-10-31',1)).length,1);assert.equal(writes.length,3)});
test('Worker Gym não consulta configuração Bike',async()=>{config=null;const member=await worker.findGymEvoMember(env,'123');assert.equal(member.idMember,7);assert.ok(calls.every(x=>x.auth==='Basic '+btoa('gym-original:gym-token')))});
for(const unit of ['bike','gym'])test('perfil, contratos, presenças e Fitcoins '+unit,async()=>{
 if(unit==='gym')config=null;
 const r=await invoke(evoHandler,{unit,member:'7'});assert.equal(r.statusCode,200);assert.equal(r.data.fitcoins,100);assert.equal(r.data.attendance.attendanceCount,1);assert.equal(r.data.member.memberships.length,1);
 assert.ok(calls.every(x=>x.auth==='Basic '+btoa(unit==='bike'?'d1-bike:d1-current-token':'gym-original:gym-token')));
});
for(const kind of ['contracts','contract_categories','contract_lab','activities','members','fitcoins'])test('ADM Bike '+kind,async()=>{const r=await invoke(adminHandler,{kind,idMember:'7'}, {},{cookie:cookie()});assert.equal(r.statusCode,200);assert.equal(r.data.ok,true);assert.ok(calls.length>0)});
for(const kind of ['gym_schedule','gym_session','fitcoins'])test('ADM Gym '+kind+' independente do Bike',async()=>{config=null;const r=await invoke(adminHandler,{unit:'gym',kind,idMember:'8',idActivitySession:'3'}, {},{cookie:cookie()});assert.equal(r.statusCode,200);assert.ok(calls.every(x=>x.auth==='Basic '+btoa('gym-original:gym-token')))});
test('Tela Check-in mantém grade e lugares',async()=>{const r=await invoke(checkinHandler);assert.equal(r.statusCode,200);assert.equal(r.data.current.enrollments[0].idMember,7);assert.equal(calls.length,2)});
for(const sourceType of ['product','service'])test('resgate '+sourceType+' debita e registra usando D1',async()=>{
 const r=await invoke(redemptionHandler,{}, {sourceType,sourceId:sourceType==='product'?'p':'s'}, {authorization:'Bearer fixture'},'POST');assert.equal(r.statusCode,200);assert.equal(balance,90);assert.equal(saved.length,1);assert.equal(catalog.redemptions.length,1);
});
test('estorno usa D1 e mantém histórico',async()=>{
 catalog.redemptions=[{id:'r',memberId:7,unit:'bike',fitcoins:10,status:'AGUARDANDO_ENTREGA',title:'Produto'}];
 const r=await invoke(redemptionHandler,{route:'admin'},{redemptionId:'r',action:'refund'},{cookie:cookie()},'POST');assert.equal(r.statusCode,200);assert.equal(balance,110);assert.equal(catalog.redemptions[0].status,'ESTORNADO');assert.equal(catalog.transactions.length,1);
});
test('resgate bloqueado não debita nem altera histórico',async()=>{config=null;const before=JSON.stringify(catalog);const r=await invoke(redemptionHandler,{}, {sourceType:'product',sourceId:'p'}, {authorization:'Bearer fixture'},'POST');assert.equal(r.statusCode,503);assert.equal(JSON.stringify(catalog),before);assert.equal(calls.length,0);assert.equal(saved.length,0)});
for(const source of ['mission','promotion'])test('recompensa '+source+' usa configuração D1',async()=>{const r=await executeFitcoinReward({bearer:'Bearer fixture',source,sourceId:source==='mission'?'m':'p',goalId:'g',validated:true});assert.equal(r.ok,true);assert.equal(balance,105);assert.equal(saved.length,1)});
test('recompensas indisponíveis preservam transações',async()=>{config=null;await assert.rejects(()=>executeFitcoinReward({bearer:'Bearer fixture',source:'mission',sourceId:'m',goalId:'g',validated:true}),e=>e.code==='EVO_NAO_CONFIGURADA');assert.equal(saved.length,0);assert.equal(balance,100)});
test('Recepção consulta histórico de resgates sem depender da EVO',async()=>{config=null;catalog.redemptions=[{id:'historico'}];const r=await invoke(redemptionHandler,{route:'admin'},{},{cookie:cookie('reception')});assert.equal(r.statusCode,200);assert.equal(r.data.redemptions[0].id,'historico');assert.equal(calls.length,0)});
test('assinatura rejeita conteúdo alterado, expiração e chave incorreta',()=>{const body='{"url":"x"}',ts=String(Date.now()),sig=serviceSignature(body,ts,'key');assert.equal(verifyServiceRequest(body,ts,sig,'key'),true);assert.equal(verifyServiceRequest(body+' ',ts,sig,'key'),false);assert.equal(verifyServiceRequest(body,ts,sig,'wrong'),false);assert.equal(verifyServiceRequest(body,String(Date.now()-31000),sig,'key'),false)});
test('gateway exige autenticação e não aceita destinos arbitrários',async()=>{
 let r=await worker.default.fetch(new Request('https://worker/internal/evo-bike',{method:'POST',body:'{}'}),env);assert.equal(r.status,401);
 for(const url of ['https://evil.invalid/api/v1/members/7','https://evo-integracao-api.w12app.com.br@evil.invalid/api/v1/members/7','http://evo-integracao-api.w12app.com.br/api/v1/members/7','https://evo-integracao-api.w12app.com.br/api/v1/admin']){
  const r=await getEvoTransport('bike').fetch(url);assert.equal(r.status,400);
 }
 assert.equal(calls.length,0);
});
test('gateway nunca devolve credenciais ao consumidor',async()=>{const r=await getEvoTransport('bike').fetch('https://evo-integracao-api.w12app.com.br/api/v1/members/7');const text=await r.text();assert.ok(!text.includes('d1-current-token'));assert.ok(!text.includes('d1-bike'))});
test('sincronização contratos/promoções bloqueia antes de escrever ou emitir números',async()=>{
 config=null;const r=await worker.default.fetch(new Request('https://worker/promotion-numbers/admin/sync-batch',{method:'POST',headers:{'x-clubpop-admin-cookie':'fixture'},body:JSON.stringify({promotionId:'promo-1790872798501'})}),env);assert.equal(r.status,503);assert.equal((await r.json()).error,'EVO_NAO_CONFIGURADA');assert.equal(writes.length,0);assert.equal(calls.length,0);
});
test('código Bike não possui referências legadas diretas ou interpoladas',()=>{
 assert.doesNotMatch(source,/env\.(?:EVO_DNS|EVO_TOKEN)/);
 for(const file of ['api/evo.js','api/evo-admin.js','api/redemption.js','api/tela-checkin.js','lib/fitcoin-reward.js'])assert.doesNotMatch(fs.readFileSync(new URL(file,import.meta.url),'utf8'),/process\.env.*(?:EVO_DNS|EVO_TOKEN|prefix)/);
});
test('primeiro acesso sem configuração responde erro controlado sem criar aluno',async()=>{
 config=null;const r=await worker.default.fetch(new Request('https://worker/auth/first-access',{method:'POST',body:JSON.stringify({cpf:'12345678901',email:'test@example.invalid',birthDate:'1990-01-01'})}),env);
 assert.equal(r.status,503);assert.equal((await r.json()).error,'EVO_NAO_CONFIGURADA');assert.equal(writes.length,0);
});
test('login de conta existente continua funcionando com integração Bike desativada',async()=>{
 config=null;const salt='fixture-salt',pin='123456',hash=crypto.pbkdf2Sync(pin,salt,100000,32,'sha256').toString('hex');
 const prepare=env.DB.prepare;env.DB.prepare=function(sql){const statement=prepare(sql);if(/SELECT \*\s+FROM members/.test(sql))statement.first=async()=>({id:1,evo_member_id:7,pin_hash:hash,pin_salt:salt,status:'ACTIVE'});return statement};
 const r=await worker.default.fetch(new Request('https://worker/auth/login',{method:'POST',body:JSON.stringify({cpf:'12345678901',pin})}),env);assert.equal(r.status,200);assert.equal((await r.json()).ok,true);assert.equal(calls.length,0);
});
test('ADM não expõe token e teste de conexão usa a camada central',async()=>{
 const headers={'x-clubpop-admin-cookie':'fixture'};let r=await worker.default.fetch(new Request('https://worker/admin/evo-config',{headers}),env);let d=await r.json();assert.equal(d.hasToken,true);assert.equal(d.token,undefined);
 r=await worker.default.fetch(new Request('https://worker/admin/evo-config',{method:'POST',headers}),env);assert.equal(r.status,200);assert.equal(calls.length,1);
 config.enabled=0;r=await worker.default.fetch(new Request('https://worker/admin/evo-config',{method:'POST',headers}),env);assert.equal(r.status,503);assert.equal(calls.length,1);
});
test('token recusado no caminho Vercel não tenta credenciais antigas',async()=>{
 upstreamStatus=401;const r=await invoke(evoHandler,{member:'7'});assert.equal(r.statusCode,401);assert.equal(calls.length,1);assert.equal(writes.length,0);
});
test('resgate Gym continua usando credenciais Gym com Bike indisponível',async()=>{
 config=null;catalog.products[0].unit='gym';const r=await invoke(redemptionHandler,{}, {unit:'gym',sourceType:'product',sourceId:'p'}, {authorization:'Bearer fixture'},'POST');assert.equal(r.statusCode,200);assert.equal(balance,90);assert.ok(calls.every(x=>x.auth==='Basic '+btoa('gym-original:gym-token')));
});
