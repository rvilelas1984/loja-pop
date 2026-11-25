import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../club-pop-worker.mjs';

const sha=async v=>Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))).toString('hex');
function env(){
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE members(id INTEGER PRIMARY KEY AUTOINCREMENT,evo_member_id INTEGER,gym_client_id TEXT,cpf_hash TEXT,cpf_last4 TEXT,first_name TEXT,last_name TEXT,email TEXT,birth_date TEXT,status TEXT DEFAULT 'ACTIVE',updated_at TEXT);CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,is_current INTEGER,personal_json TEXT,raw_json TEXT,synced_at TEXT);CREATE TABLE gym_member_links(gym_client_id TEXT PRIMARY KEY,member_id INTEGER,link_source TEXT,status TEXT)");
 const st=(q,p=[])=>({bind(...a){return st(q,a)},async first(){return sql.prepare(q).get(...p)||null},async all(){return {results:sql.prepare(q).all(...p)}},async run(){const r=sql.prepare(q).run(...p);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}});
 return {sql,env:{DB:{prepare:q=>st(q)}}};
}
const call=(e,cpf)=>worker.fetch(new Request('https://w/admin/evo-student-sync-one',{method:'POST',headers:{'x-clubpop-admin-cookie':'c','Content-Type':'application/json'},body:JSON.stringify({unit:'bike',member:{idMember:2069738,name:'Kettlyn Lourenço da Silva',firstName:'Kettlyn',lastName:'Lourenço da Silva',document:cpf}})}),e);
async function run(fn){const saved=globalThis.fetch;globalThis.fetch=async()=>Response.json({role:'admin'});try{await fn()}finally{globalThis.fetch=saved}}

test('a provisional EVO member receives the real CPF instead of a false conflict',()=>run(async()=>{
 const {sql,env:e}=env();sql.exec("INSERT INTO members(id,evo_member_id,cpf_hash,first_name,last_name) VALUES(618,2069738,'evo-placeholder:2069738','Kettlyn','X')");
 const r=await call(e,'48057027886');assert.equal(r.status,200,await r.clone().text());
 const m=sql.prepare('SELECT cpf_hash,cpf_last4,last_name FROM members WHERE id=618').get();
 assert.equal(m.cpf_hash,await sha('48057027886'));assert.equal(m.cpf_last4,'7886');assert.equal(m.last_name,'Lourenço da Silva');
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM members').get().n,1,'no duplicate member');
}));

test('a real CPF that differs still blocks the update',()=>run(async()=>{
 const {sql,env:e}=env();const other=await sha('11111111111');sql.exec(`INSERT INTO members(id,evo_member_id,cpf_hash,first_name) VALUES(618,2069738,'${other}','Kettlyn')`);
 const r=await call(e,'48057027886');assert.equal(r.status,409);assert.equal((await r.json()).error,'CONFLITO_CPF_ID_EVO');
 assert.equal(sql.prepare('SELECT cpf_hash FROM members WHERE id=618').get().cpf_hash,other);
}));

test('the real CPF already owned by another member still blocks the placeholder upgrade',()=>run(async()=>{
 const {sql,env:e}=env();sql.exec(`INSERT INTO members(id,evo_member_id,cpf_hash,first_name) VALUES(618,2069738,'evo-placeholder:2069738','K'),(700,555,'${await sha('48057027886')}','Outra')`);
 const r=await call(e,'48057027886');assert.equal(r.status,409);assert.equal((await r.json()).error,'CADASTROS_CONFLITANTES');
 assert.match(sql.prepare('SELECT cpf_hash FROM members WHERE id=618').get().cpf_hash,/^evo-placeholder/);
}));

// Manual activation (confirm step) has the same comparison.
const TOKEN='11111111-2222-3333-4444-555555555555';
function activation(){
 const x=env();x.sql.exec("CREATE TABLE club_manual_activation_pending(token TEXT PRIMARY KEY,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,profile_json TEXT NOT NULL,source TEXT NOT NULL,expires_at TEXT NOT NULL);CREATE TABLE club_manual_activations(unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,member_id INTEGER,actor TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,evo_member_id));ALTER TABLE members ADD COLUMN pin_hash TEXT");
 x.sql.prepare("INSERT INTO club_manual_activation_pending VALUES(?,?,?,?,?,?)").run(TOKEN,'bike','2069738',JSON.stringify({firstName:'Kettlyn',lastName:'Lourenço da Silva',document:'48057027886'}),'EVO','2099-01-01T00:00:00Z');
 return x;
}
const confirm=e=>worker.fetch(new Request('https://w/admin/manual-student-activation',{method:'POST',headers:{'x-clubpop-admin-cookie':'c','Content-Type':'application/json'},body:JSON.stringify({unit:'bike',action:'confirm',token:TOKEN})}),e);
async function runAdmin(fn){const saved=globalThis.fetch;globalThis.fetch=async()=>Response.json({role:'admin',name:'t',units:['bike','gym'],permissions:['*']});try{await fn()}finally{globalThis.fetch=saved}}

test('manual activation upgrades a provisional member instead of a false conflict',()=>runAdmin(async()=>{
 const {sql,env:e}=activation();sql.exec("INSERT INTO members(id,evo_member_id,cpf_hash,first_name) VALUES(618,2069738,'evo-placeholder:2069738','K')");
 const r=await confirm(e);assert.equal(r.status,200,await r.clone().text());
 const m=sql.prepare('SELECT cpf_hash,cpf_last4 FROM members WHERE id=618').get();
 assert.equal(m.cpf_hash,await sha('48057027886'));assert.equal(m.cpf_last4,'7886');assert.equal(sql.prepare('SELECT COUNT(*) n FROM members').get().n,1);
}));

test('manual activation still blocks a different real CPF',()=>runAdmin(async()=>{
 const {sql,env:e}=activation();sql.exec(`INSERT INTO members(id,evo_member_id,cpf_hash,first_name) VALUES(618,2069738,'${await sha('11111111111')}','K')`);
 const r=await confirm(e);assert.equal(r.status,409);assert.equal((await r.json()).error,'CADASTRO_JA_VINCULADO_A_OUTRO_CPF');
}));
