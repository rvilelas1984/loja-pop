import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../tela-checkin.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('let cpConquestItems='),html.indexOf('function cpFitAwards()'));
function harness(fetch){
 const status={hidden:true,textContent:''};
 const ctx=vm.createContext({fetch,AbortSignal,console:{warn(){}},Date,Promise,day:()=> '2026-10-29',currentSessionId:'101',document:{getElementById:id=>id==='unitSelect'?{value:'bike'}:status,querySelector:()=>({classList:{remove(){}}})}});
 vm.runInContext(source,ctx);return {ctx,status,run:s=>vm.runInContext(s,ctx)};
}
const reply=payload=>({ok:true,json:async()=>({ok:true,...payload})});
test('initial render assigns the displayed session before fetching its highlights',()=>{
 const render=html.slice(html.indexOf('function render(data)'),html.indexOf('const formatTime='));
 assert.ok(render.indexOf('currentSessionId=a.idActivitySession')<render.indexOf('cpRefreshConquests()'));
});
test('only pending milestones for the selected class appear, at most ten',async()=>{
 const pending=Array.from({length:12},(_,i)=>({name:'Aluno '+i,sessionId:'101',type:'milestone',target:50}));
 pending.unshift({sessionId:'102',type:'milestone'},{sessionId:'101',type:'birthday'});
 const h=harness(async url=>reply(url.includes('settings')?{settings:{positionsSeconds:15,highlightsSeconds:10}}:{pending,daily:[{sessionId:'101',type:'milestone'}]}));
 await h.run('cpRefreshConquests()');assert.equal(h.run('cpConquestItems.length'),10);assert.equal(h.run('cpConquestItems[0].name'),'Aluno 0');assert.equal(h.status.hidden,false);assert.match(h.status.textContent,/10 destaque/);
});
test('a slow response from the previous class cannot replace the current highlights',async()=>{
 let release;let count=0;
 const h=harness(async url=>{if(url.includes('settings'))return reply({settings:{}});if(++count===1)return new Promise(r=>release=r);return reply({pending:[{sessionId:'102',type:'milestone',name:'Atual'}]});});
 const first=h.run('cpRefreshConquests()');h.run("currentSessionId='102'");await h.run('cpRefreshConquests()');release(reply({pending:[{sessionId:'101',type:'milestone',name:'Antigo'}]}));await first;
 assert.equal(h.run('cpConquestItems[0].name'),'Atual');
});
test('a temporary failure preserves verified items and reports failure, unlike an empty result',async()=>{
 let fail=false;const h=harness(async url=>{if(fail)throw Error('offline');return reply(url.includes('settings')?{settings:{}}:{pending:[{sessionId:'101',type:'milestone',name:'Verificado'}]});});
 await h.run('cpRefreshConquests()');fail=true;await h.run('cpRefreshConquests()');assert.equal(h.run('cpConquestItems.length'),1);assert.equal(h.status.hidden,false);
});
test('invalid timing settings fall back to 15 and 10 seconds',async()=>{
 const h=harness(async url=>reply(url.includes('settings')?{settings:{positionsSeconds:'bad',highlightsSeconds:null}}:{pending:[]}));await h.run('cpRefreshConquests()');assert.equal(h.run('cpTvSettings.positionsSeconds'),15);assert.equal(h.run('cpTvSettings.highlightsSeconds'),10);
});
test('all official Hall medals and trophies render with unique gradient IDs',()=>{
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(new URL('../hall-art.js',import.meta.url),'utf8'),ctx);const ids=new Set();
 for(let i=0;i<5;i++)for(let j=0;j<5;j++){const svg=vm.runInContext(`hallArt(${i},${j%4},${j===4})`,ctx);assert.match(svg,/<svg/);const id=svg.match(/id="([^"]+)"/)[1];assert.ok(!ids.has(id));ids.add(id);assert.ok(svg.includes('url(#'+id+')'));}
 assert.ok(html.includes('src="/hall-art.js"'));assert.ok(fs.readFileSync(new URL('../meu-hall-conquistas.html',import.meta.url),'utf8').includes('src="/hall-art.js"'));
});
test('every inline script parses',()=>{for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);});

test('empty pending list is distinguished from failed loading',async()=>{
 const h=harness(async url=>reply(url.includes('settings')?{settings:{}}:{pending:[]}));await h.run('cpRefreshConquests()');assert.match(h.status.textContent,/Sem conquistas pendentes/);
});
test('verified highlights enter the visible phase after 15 seconds',()=>{
 let now=16000;const classes=new Set(),card={innerHTML:'',style:{setProperty(){}}};
 const ctx=vm.createContext({Date:{now:()=>now},document:{hidden:false,querySelector:()=>({classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}}),getElementById:()=>card},requestAnimationFrame(){},cpFitAwards(){},esc:String,hallArt:()=>'<svg></svg>',cpConquestAt:0,cpConquestPhase:'positions',cpConquestItems:[{sessionId:'123',target:50,name:'Aluno teste',medal:'Constância'}],cpTvSettings:{positionsSeconds:15,highlightsSeconds:10,showEmpty:false},cpConquestShown:[]});
 const begin=html.indexOf('setInterval(()=>{const now='),end=html.indexOf('},1000);',begin);
 vm.runInContext('var tick='+html.slice(begin+'setInterval('.length,end+1),ctx);vm.runInContext('tick()',ctx);
 assert.ok(classes.has('cp-show-conquests'));assert.match(card.innerHTML,/Aluno teste/);assert.equal(ctx.cpConquestPhase,'conquests');
});
test('all mobile layout overrides are confined to the mobile breakpoint',()=>{
 const css=fs.readFileSync(new URL('../checkin-mobile.css',import.meta.url),'utf8');assert.match(css,/@media \(max-width:760px\)/);assert.match(html,/href="\/checkin-mobile.css"/);
 assert.ok(css.includes('body.cp-admin-ready .checkin-wrap>main.screen'));
});
