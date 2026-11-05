import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import worker from './worker.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE pop_live_app_tokens(token,active);
CREATE TABLE pop_live_sessions(id INTEGER,unit,class_name,starts_at,status);
CREATE TABLE members(id INTEGER,birth_date,cpf_hash,gym_client_id,evo_member_id);
CREATE TABLE pop_live_devices(id INTEGER,reference_number,device_type,active,unit_gym,unit_bike);
CREATE TABLE pop_live_selected_members(session_id,member_id,unit,evo_member_id,PRIMARY KEY(session_id,member_id));
CREATE TABLE pop_live_session_devices(session_id,device_id,member_id,connected_at, UNIQUE(session_id,device_id),UNIQUE(session_id,member_id));
CREATE TABLE pop_live_health_overrides(member_id PRIMARY KEY,sex,updated_at);
CREATE TABLE evo_member_master(unit,evo_member_id,personal_json);
INSERT INTO pop_live_sessions VALUES(1,'gym','Burn teste','2026-11-05','planned');
INSERT INTO pop_live_devices VALUES(2,'28','heart_rate',1,1,0);`);
const key=crypto.randomUUID(),birth='1990-05-01',cpf='52998224725';
sql.prepare('INSERT INTO pop_live_app_tokens VALUES(?,1)').run(key);
sql.prepare('INSERT INTO members VALUES(1,?,?,42,NULL)').run(birth,createHash('sha256').update(cpf).digest('hex'));
const env={INVITE_SECRET:'test only',LIMIT:{limit:async()=>({success:true})},DB:{
 prepare(q){const st=sql.prepare(q);return {bind(...args){return {first:()=>st.get(...args),all:()=>({results:st.all(...args)}),run:()=>st.run(...args)}}}},
 batch(items){sql.exec('BEGIN');try{items.forEach(x=>x.run());sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}
}};
const send=(path,b,token='')=>worker.fetch(new Request('https://test'+path,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(b)}),env);
assert.equal((await send('/pop-live/sessions/1/invite',{})).status,403);
const {url}=await (await send('/pop-live/sessions/1/invite',{},key)).json();
const form={invite:new URL(url).hash.slice(1),cpf,birth};
assert.equal((await send('/buscar',{...form,birth:'1999-09-09'})).status,404);
assert.equal((await (await send('/buscar',form)).json()).devices.length,1);
assert.equal((await send('/entrar',{...form,device:2})).status,400);
for(let i=0;i<2;i++)assert.equal((await (await send('/entrar',{...form,device:2,sex:'f'})).json()).number,'28');
assert.equal(sql.prepare('SELECT count(*) n FROM pop_live_selected_members').get().n,1);
sql.exec("UPDATE pop_live_sessions SET status='running'");
assert.equal((await send('/buscar',form)).status,409);
console.log('PASS invite, identity, device, repeated entry and closed registration');
