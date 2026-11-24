import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {usefulLinks} from '../lib/useful-links-routes.mjs';
import {recordEvent,computeStats,cleanExtras,readExtras,ensureSessionTable,DEFAULT_WHATSAPP} from '../lib/aula-experimental.mjs';

function setup(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE useful_link_tracking_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, link_slug TEXT NOT NULL, session_id TEXT NOT NULL, event_type TEXT NOT NULL, step TEXT, period TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE useful_links (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL, name TEXT, target TEXT, enabled INTEGER DEFAULT 1, config_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
 const st=(q,p=[])=>({bind(...a){return st(q,a)},async first(){return sql.prepare(q).get(...p)||null},async all(){return {results:sql.prepare(q).all(...p)}},async run(){const r=sql.prepare(q).run(...p);return {meta:{changes:r.changes}}}});
 return {sql,db:{prepare:q=>st(q)}};
}
const ev=(session,event,extra={})=>({link:'aula-experimental',session,event,...extra});

test('events: only the known ones for this page are stored; browser and version go to a session row',async()=>{
 const {sql,db}=setup();
 assert.equal(await recordEvent(db,ev('s1','page_view',{browser:'instagram',variant:'v2'})),true);
 assert.equal(await recordEvent(db,ev('s1','step_view',{step:'Cadastro',period:'morning',browser:'chrome_android',variant:'v2'})),true);
 assert.equal(await recordEvent(db,ev('s2','page_view',{browser:'<script>',variant:'x'})),true,'unknown browser is stored as other');
 assert.equal(await recordEvent(db,ev('s1','help_click')),true);
 assert.equal(await recordEvent(db,{...ev('s1','page_view'),link:'outro'}),false);
 assert.equal(await recordEvent(db,ev('s1','drop table')),false);
 assert.equal(await recordEvent(db,ev('','page_view')),false);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM useful_link_tracking_v2').get().n,4);
 const rows=sql.prepare('SELECT session_id,browser,variant FROM useful_link_sessions ORDER BY session_id').all();
 assert.deepEqual(rows.map(r=>({...r})),[{session_id:'s1',browser:'instagram',variant:'v2'},{session_id:'s2',browser:'other',variant:'v1'}],'first event wins');
});

test('stats: funnel by period, unique sessions, browsers, versions and median times',async()=>{
 const {sql,db}=setup();
 const at=(session,event,t,step='',period='')=>sql.prepare('INSERT INTO useful_link_tracking_v2(link_slug,session_id,event_type,step,period,created_at) VALUES(?,?,?,?,?,?)').run('aula-experimental',session,event,step,period,t);
 const info=(session,browser,variant)=>sql.exec(`CREATE TABLE IF NOT EXISTS useful_link_sessions(link_slug TEXT NOT NULL,session_id TEXT NOT NULL,browser TEXT NOT NULL DEFAULT 'other',variant TEXT NOT NULL DEFAULT 'v1',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(link_slug,session_id));INSERT INTO useful_link_sessions(link_slug,session_id,browser,variant) VALUES('aula-experimental','${session}','${browser}','${variant}')`);
 const now=new Date(Date.now()-3600*1000).toISOString().slice(0,19).replace('T',' ');
 const plus=s=>new Date(Date.parse(now.replace(' ','T')+'Z')+s*1000).toISOString().slice(0,19).replace('T',' ');
 // morning, finished
 for(const [t,e,s,p] of [[0,'page_view','',''],[10,'period_selected','','morning'],[20,'rules_acknowledged','','morning'],[20,'step_view','Cadastro','morning'],[200,'self_reported_step','Cadastro','morning'],[200,'step_view','Agendamento gratuito','morning'],[320,'self_reported_step','Agendamento gratuito','morning'],[320,'self_reported_completion','','morning']])at('m1',e,plus(t),s,p);
 info('m1','chrome_android','v2');
 // evening, asked for help at payment; reloaded the page once
 for(const [t,e,s,p] of [[0,'page_view','',''],[5,'page_view','',''],[15,'period_selected','','evening'],[25,'rules_acknowledged','','evening'],[25,'step_view','Cadastro','evening'],[100,'self_reported_step','Cadastro','evening'],[100,'step_view','Pagamento','evening'],[160,'help_click','Pagamento','evening']])at('e1',e,plus(t),s,p);
 info('e1','instagram','v2');
 // old page, only opened
 at('o1','page_view',plus(0));
 // outside the window
 sql.prepare('INSERT INTO useful_link_tracking_v2(link_slug,session_id,event_type,created_at) VALUES(?,?,?,?)').run('aula-experimental','old','page_view','2020-01-01 00:00:00');
 const d=await computeStats(db,'aula-experimental','30');
 assert.equal(d.page_views,4,'raw opens (reload counted)');assert.equal(d.unique_sessions,3,'people');
 assert.deepEqual(d.funnel.chose,{t:2,m:1,e:1});assert.deepEqual(d.funnel.ack,{t:2,m:1,e:1});
 assert.deepEqual(d.funnel.cad,{t:2,m:1,e:1});assert.deepEqual(d.funnel.pay,{t:1,m:0,e:1});
 assert.deepEqual(d.funnel.agenda,{t:1,m:1,e:0});assert.deepEqual(d.funnel.done,{t:1,m:1,e:0});
 assert.deepEqual(d.funnel.help,{t:1,m:0,e:1});
 assert.equal(d.flow_completions,1);assert.equal(d.confirmed_conversions,null);assert.equal(d.help_sessions,1);
 const b=Object.fromEntries(d.browsers.map(x=>[x.k,x]));
 assert.deepEqual([b.chrome_android.sessions,b.chrome_android.completed],[1,1]);assert.deepEqual([b.instagram.sessions,b.instagram.completed],[1,0]);assert.deepEqual([b.unknown.sessions,b.unknown.completed],[1,0],'old page sessions have no browser');
 const v=Object.fromEntries(d.versions.map(x=>[x.k,x]));assert.equal(v.v2.sessions,2);assert.equal(v.v1.sessions,1);
 assert.deepEqual(d.medians,{start:23,cad:128,pay:null,agenda:120},'median seconds per step (start 20 s and 25 s, cadastro 180 s and 75 s, no payment finished)');
 const all=await computeStats(db,'aula-experimental','all');assert.equal(all.unique_sessions,4,'"all" includes the old session');
});

const secret='test-secret';
function adminReq(method,path,body){
 const claims=Buffer.from(JSON.stringify({role:'admin',route:'links-uteis',method,unit:'bike',t:Date.now()})).toString('base64url');
 const sig=crypto.createHmac('sha256',secret).update(claims).digest('hex');
 return new Request('https://w'+path,{method,headers:{'x-clubpop-proxy-auth':claims+'.'+sig,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
}
const call=(db,req)=>usefulLinks(req,{DB:db,AUTO_SYNC_SECRET:secret},new URL(req.url)).then(async r=>({status:r.status,body:await r.json()}));
const urls={login:'https://x.test/login',payment:'https://x.test/pay',morning:'https://x.test/am',agenda:'https://x.test/ag'};

test('settings: WhatsApp and final-screen note are validated, normalized, kept when omitted and public',async()=>{
 const {db}=setup();
 let r=await call(db,new Request('https://w/links-uteis/public-config'));
 assert.equal(r.body.whatsapp,DEFAULT_WHATSAPP);assert.equal(r.body.done_note,'');assert.match(r.body.login,/^https:/);
 r=await call(db,adminReq('PUT','/links-uteis/config',{...urls,whatsapp:'(11) 3052-1378',done_note:'  Chegue 10 min antes  '}));assert.equal(r.status,200);
 r=await call(db,new Request('https://w/links-uteis/public-config'));
 assert.equal(r.body.whatsapp,'551130521378','DDD + number get the country code');assert.equal(r.body.done_note,'Chegue 10 min antes');assert.equal(r.body.payment,urls.payment);
 r=await call(db,adminReq('PUT','/links-uteis/config',urls));assert.equal(r.status,200);
 r=await call(db,new Request('https://w/links-uteis/public-config'));assert.equal(r.body.whatsapp,'551130521378','an older admin page that omits the fields keeps them');assert.equal(r.body.done_note,'Chegue 10 min antes');
 assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,whatsapp:'123'}))).status,400);
 assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,done_note:'x'.repeat(501)}))).status,400);
 assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,login:'http://x.test'}))).status,400);
 r=await call(db,adminReq('PUT','/links-uteis/config',{...urls,whatsapp:''}));assert.equal(r.status,200);
 assert.equal((await call(db,new Request('https://w/links-uteis/public-config'))).body.whatsapp,DEFAULT_WHATSAPP,'empty goes back to the official number');
 assert.equal(cleanExtras({whatsapp:'+55 (11) 93052-1378'}).whatsapp,'5511930521378');
 assert.deepEqual(readExtras({whatsapp:'abc',done_note:7}),{whatsapp:DEFAULT_WHATSAPP,done_note:'',new_percent:50});
});

test('routes: event is public, stats is admin only and returns the new funnel',async()=>{
 const {db}=setup();
 let r=await call(db,new Request('https://w/links-uteis/event',{method:'POST',body:JSON.stringify(ev('z','page_view',{browser:'safari_ios',variant:'v2'}))}));assert.deepEqual(r.body,{ok:true});
 r=await call(db,new Request('https://w/links-uteis/event',{method:'POST',body:JSON.stringify(ev('z','nope'))}));assert.equal(r.status,400);
 r=await call(db,new Request('https://w/links-uteis/stats?days=30'));assert.equal(r.status,403);
 r=await call(db,adminReq('GET','/links-uteis/stats?days=30'));assert.equal(r.status,200);assert.equal(r.body.unique_sessions,1);assert.equal(r.body.browsers[0].k,'safari_ios');
 assert.equal((await call(db,adminReq('GET','/links-uteis/stats?days=5'))).status,400);
});

import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const scripts=h=>[...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);

test('page: scripts parse, the rules confirmation is required, help goes to the official WhatsApp, old page kept',()=>{
 const h=read('aula-experimental/index.html');
 for(const code of scripts(h))assert.doesNotThrow(()=>new Function(code),'index.html script parses');
 assert.match(h,/<input type="checkbox" id="ack">/,'rules checkbox exists');
 assert.match(h,/id="go" type="button" disabled/,'Continuar starts disabled');
 assert.match(h,/\$\('go'\)\.onclick=\(\)=>\{if\(!\$\('ack'\)\.checked\)return;track\('rules_acknowledged'\)/,'cannot continue without the box');
 assert.match(h,/whatsapp:'551130521378'/,'official number is the default');
 assert.match(h,/pacote de 3 aulas por R\$ 45/,'package price');
 assert.doesNotMatch(h,/R\$ 25,00 ou pacote de <b>3 aulas experimentais por R\$ 25,00/,'old package price is gone');
 const old=read('aula-experimental/antiga.html');assert.match(old,/Li e estou ciente das regras/,'previous page is kept for rollback');
 for(const code of scripts(old))assert.doesNotThrow(()=>new Function(code));
 const adm=read('admin-links-uteis.html');for(const code of scripts(adm))assert.doesNotThrow(()=>new Function(code),'admin script parses');
});

test('A/B split: share of visitors on the new page is configurable (0-100), default 50, kept when omitted',async()=>{
 const {db}=setup();
 let r=await call(db,new Request('https://w/links-uteis/public-config'));assert.equal(r.body.new_percent,50,'half and half by default');
 assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,new_percent:30}))).status,200);
 assert.equal((await call(db,new Request('https://w/links-uteis/public-config'))).body.new_percent,30);
 assert.equal((await call(db,adminReq('PUT','/links-uteis/config',urls))).status,200);
 assert.equal((await call(db,new Request('https://w/links-uteis/public-config'))).body.new_percent,30,'an admin page that omits the field keeps it');
 for(const bad of [101,-1,12.5,'abc'])assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,new_percent:bad}))).status,400,'rejects '+bad);
 for(const ok of [0,100,'75'])assert.equal((await call(db,adminReq('PUT','/links-uteis/config',{...urls,new_percent:ok}))).status,200);
 assert.equal((await call(db,new Request('https://w/links-uteis/public-config'))).body.new_percent,75);
});

test('A/B split: only sessions that came through the split are compared, by the page they saw',async()=>{
 const {sql,db}=setup();
 const send=(session,event,x={})=>recordEvent(db,{link:'aula-experimental',session,event,...x});
 // arm A: previous page (v1), arm B: new page (v2). Two outside the test (no arm).
 for(const [id,variant,steps] of [['a1','v1',['cad','agenda','finished']],['a2','v1',['cad']],['a3','v1',[]],['b1','v2',['cad','agenda','finished','confirmed']],['b2','v2',['cad','agenda','help']],['b3','v2',['cad']],['b4','v2',[]]]){
  await send(id,'page_view',{variant,arm:'ab',browser:'chrome_android'});
  if(steps.includes('cad'))await send(id,'step_view',{step:'Cadastro',period:'morning',variant,arm:'ab'});
  if(steps.includes('agenda'))await send(id,'step_view',{step:'Agendamento gratuito',period:'morning',variant,arm:'ab'});
  if(steps.includes('finished'))await send(id,'self_reported_step',{step:'Agendamento gratuito',period:'morning',variant,arm:'ab'});
  if(steps.includes('confirmed'))await send(id,'self_reported_completion',{period:'morning',variant,arm:'ab'});
  if(steps.includes('help'))await send(id,'help_click',{step:'Horário',period:'morning',variant,arm:'ab'});
 }
 await send('x1','page_view',{variant:'v2'});await send('x1','self_reported_completion',{variant:'v2'});
 const d=await computeStats(db,'aula-experimental','30');
 const m=Object.fromEntries(d.ab.map(x=>[x.k,x]));
 assert.deepEqual({...m.v1},{k:'v1',sessions:3,cad:2,agenda:1,finished:1,confirmed:0,help:0});
 assert.deepEqual({...m.v2},{k:'v2',sessions:4,cad:3,agenda:2,finished:1,confirmed:1,help:1});
 assert.equal(d.versions.find(x=>x.k==='v2').sessions,5,'the general view still counts everyone');
});

test('A/B split: an existing sessions table without the arm column is upgraded in place',async()=>{
 const {sql,db}=setup();
 sql.exec("CREATE TABLE useful_link_sessions(link_slug TEXT NOT NULL,session_id TEXT NOT NULL,browser TEXT NOT NULL DEFAULT 'other',variant TEXT NOT NULL DEFAULT 'v1',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(link_slug,session_id));INSERT INTO useful_link_sessions(link_slug,session_id,browser,variant) VALUES('aula-experimental','old','safari_ios','v2')");
 await ensureSessionTable(db);await ensureSessionTable(db);
 assert.ok(sql.prepare('PRAGMA table_info(useful_link_sessions)').all().some(c=>c.name==='arm'));
 assert.equal(sql.prepare("SELECT arm FROM useful_link_sessions WHERE session_id='old'").get().arm,'','old rows are outside the test');
 assert.equal(await recordEvent(db,{link:'aula-experimental',session:'n1',event:'page_view',variant:'v2',arm:'ab'}),true);
 assert.equal(sql.prepare("SELECT arm FROM useful_link_sessions WHERE session_id='n1'").get().arm,'ab');
});

test('A/B page split: fixed bucket per device, share from settings, no event before the decision, same measures on both pages',()=>{
 const h=read('aula-experimental/index.html'),old=read('aula-experimental/antiga.html'),adm=read('admin-links-uteis.html');
 for(const code of scripts(h))assert.doesNotThrow(()=>new Function(code));
 for(const code of scripts(old))assert.doesNotThrow(()=>new Function(code));
 assert.match(h,/ae-bucket/);assert.match(h,/bucket>=pct\)\{location\.replace\('\/aula-experimental\/antiga\.html'/,'higher buckets go to the previous page');
 assert.match(h,/Math\.floor\(Math\.random\(\)\*100\)/,'bucket 0-99');
 assert.match(h,/new_percent/);assert.match(h,/var pct=50/,'default is half and half');
 assert.match(h,/Promise\.resolve\(window\.__aeStay\)\.then\(stay=>\{if\(stay===false\)return;track\('page_view'\)/,'nothing is tracked before the decision');
 assert.match(h,/arm:AB\?'ab':''/);
 assert.match(old,/variant:'v1',arm:ARM,browser:BR/,'previous page tags its events');
 assert.match(old,/ae2-session/,'previous page keeps one id per device like the new one');
 assert.match(old,/get\('ab'\)==='1'/,'only visitors sent by the split count as test arm');
 assert.match(adm,/id="new_percent"/);assert.match(adm,/id="abtest"/);
});
