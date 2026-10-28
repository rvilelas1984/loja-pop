import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const worker=fs.readFileSync(new URL('../club-pop-worker.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../meus-numeros.html',import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const start=worker.indexOf('if(url.pathname==="/promotion-numbers/mine"'),end=worker.indexOf("if(['/promotion-numbers/sync'",start);
const handler=new (Object.getPrototypeOf(async()=>{}).constructor)('request','env','url','json','authenticatedMember','clubContentItem','ensurePromotion','canonicalEvoId','sha256',worker.slice(start,end));
function fixture(){
 const raw=new DatabaseSync(':memory:');raw.exec(`CREATE TABLE members(id INTEGER,evo_member_id INTEGER,gym_client_id TEXT,cpf_hash TEXT,cpf_last4 TEXT,status TEXT);
 CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT);
 CREATE TABLE promotions(id INTEGER,slug TEXT,name TEXT,start_at TEXT,end_at TEXT,status TEXT,rules_json TEXT);
 CREATE TABLE promotion_participants(id INTEGER,promotion_id INTEGER,member_id INTEGER);
 CREATE TABLE lucky_numbers(id INTEGER,promotion_id INTEGER,participant_id INTEGER,code TEXT,origin TEXT,issued_at TEXT,reference_month TEXT,status TEXT,studio TEXT);
 CREATE TABLE attendance_history(member_id INTEGER,unit TEXT,attendance_date TEXT);`);
 // Synthetic documents; the account/legacy-ID topology reproduces the reported case.
 const doc='12345678901';raw.prepare('INSERT INTO members VALUES(?,?,?,?,?,?)').run(592,1983050,'2225353',hash(doc),'8901','ACTIVE');
 raw.prepare('INSERT INTO members VALUES(?,?,?,?,?,?)').run(946,2225353,null,'legacy-gym','8901','ACTIVE');
 for(const [unit,id]of [['bike','1983050'],['gym','2225353']])raw.prepare('INSERT INTO evo_member_master VALUES(?,?,?)').run(unit,id,JSON.stringify({document:doc}));
 for(const [id,slug,name]of [[1,'bike-promo','Promoção Iphone 17'],[2,'gym-old','Promoção Iphone 17'],[3,'gym-promo','Promoção IPhone 17']])raw.prepare('INSERT INTO promotions VALUES(?,?,?,?,?,?,?)').run(id,slug,name,'2026-09-01','2026-10-31','ACTIVE','{}');
 let seq=0;for(const [id,pid,mid,count,unit]of [[1055,1,592,23,'bike'],[1695,2,946,1,'gym'],[2475,3,946,11,'gym']]){raw.prepare('INSERT INTO promotion_participants VALUES(?,?,?)').run(id,pid,mid);for(let n=0;n<count;n++){seq++;raw.prepare('INSERT INTO lucky_numbers VALUES(?,?,?,?,?,?,?,?,?)').run(seq,pid,id,unit+'-'+seq,'ATTENDANCE','2026-10-20','2026-10','ACTIVE',unit);}}
 const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return raw.prepare(sql).get(...args)||null},async all(){return {results:raw.prepare(sql).all(...args)}}}}};
 const mine=async(slug,memberId=592)=>handler({method:"GET"}, {DB},new URL('https://test/promotion-numbers/mine?promotion='+slug),(data,status=200)=>({data,status}),async()=>raw.prepare('SELECT * FROM members WHERE id=?').get(memberId),async(_,kind,key)=>({id:key,name:'Promoção Iphone 17',unit:key.startsWith('gym')?'gym':'bike',start:'2026-09-01',end:'2026-10-31',luckyNumber:{}}),async(_,p)=>raw.prepare('SELECT * FROM promotions WHERE slug=?').get(p.id),v=>String(v||''),async v=>hash(v));
 return {raw,mine};
}
test('client page compiles and uses the status DOM node rather than window.status',()=>{for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.match(html,/statusEl=document.getElementById\("status"\)/);assert.doesNotMatch(html,/\bstatus\.(?:className|textContent|innerHTML)/)});
test('login with Bike and Gym links reads 23 Bike and 12 Gym existing codes, without writes or duplication',async()=>{const {raw,mine}=fixture();const before=raw.prepare('SELECT count(*) n FROM lucky_numbers').get().n;for(const [slug,total]of [['bike-promo',23],['gym-promo',12],['gym-old',12]]){const r=await mine(slug);assert.equal(r.status,200);assert.equal(r.data.total,total);assert.equal(new Set(r.data.codes.map(x=>x.code)).size,total);}assert.equal(raw.prepare('SELECT count(*) n FROM lucky_numbers').get().n,before);raw.close();});
test('full verified CPF is required, even when old accounts share an EVO ID or CPF suffix',async()=>{const {raw,mine}=fixture();raw.prepare("UPDATE members SET cpf_hash=? WHERE id=946").run(hash('98765438901'));assert.equal((await mine('gym-promo')).data.total,0);raw.prepare("UPDATE members SET cpf_hash='legacy-gym' WHERE id=946").run();raw.prepare("UPDATE evo_member_master SET personal_json=? WHERE unit='gym'").run(JSON.stringify({document:'98765438901'}));assert.equal((await mine('gym-promo')).data.total,0);raw.close();});
test('canceled numbers stay hidden and unrelated promotions are excluded',async()=>{const {raw,mine}=fixture();raw.exec("UPDATE lucky_numbers SET status='INVALIDATED' WHERE studio='gym' AND id=(SELECT max(id) FROM lucky_numbers); UPDATE promotions SET name='Outra promoção' WHERE slug='gym-old'");assert.equal((await mine('gym-promo')).data.total,10);raw.close();});
