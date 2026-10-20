import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {projectContractSessions,isFutureReservation} from '../lib/session-contracts.mjs';
const now=new Date('2026-10-20T20:00:00Z');
const contract={idMemberMembership:7597229,concludedSessions:0,scheduledSessions:0,pendingSessions:8};
const row={id_activity_session:'19373062',contract_key:'7597229',confidence:'confirmed',attendance_date:'2026-10-22',start_time:'07:15',activity_name:'Bike Pop',raw_json:JSON.stringify({isFinalized:false,instructor:'Douglas'})};
test('confirmed links are scoped to contract and deduplicated; official balance stays unchanged',()=>{
 const [a,b]=projectContractSessions([contract,{...contract,idMemberMembership:2}],[row,row],now);
 assert.equal(a.contractReservations.length,1);assert.equal(b.contractReservations.length,0);
 assert.equal(a.pendingSessions,8);assert.equal(a.scheduledSessions,0);assert.equal(a.concludedSessions,0);
});
test('probable, ambiguous and unmatched links never become confirmed',()=>{
 for(const confidence of ['probable_unique','ambiguous','unmatched'])assert.equal(projectContractSessions([contract],[{...row,confidence}],now)[0].contractReservations.length,0);
});
test('cancellations, absences, finalized and past sessions are excluded',()=>{
 for(const flag of ['removed','suspended','cancelled','canceled','falta','faltaJustificada','isFinalized'])assert.equal(isFutureReservation({...row,raw_json:JSON.stringify({isFinalized:false,[flag]:true})},now),false);
 assert.equal(isFutureReservation({...row,attendance_date:'2026-10-19'},now),false);
 assert.equal(isFutureReservation({...row,raw_json:'{}'},now),false);
});
test('all inline dashboard scripts parse before commit',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');let count=0;
 for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=|application\/ld\+json/.test(attrs)&&code.trim()){const r=spawnSync(process.execPath,['--check','--input-type='+(/type=["']module/.test(attrs)?'module':'commonjs')],{input:code,encoding:'utf8'});assert.equal(r.status,0,r.stderr);count++;}
 assert.ok(count>0);assert.ok(!html.includes('function futureReservationsHTML'));
});
test('contract modal opens, escapes content and never displays another contract',async()=>{
 const {default:vm}=await import('node:vm');
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const code=html.slice(html.indexOf('const contractReservationCards='),html.indexOf('function renderContracts('));
 let dialog=null,click;
 const document={getElementById:()=>dialog,body:{appendChild:d=>{dialog=d}},addEventListener:(name,fn)=>{click=fn},createElement:()=>({addEventListener(){},setAttribute(){},showModal(){this.open=true},close(){this.open=false}})};
 const context=vm.createContext({document,dateBR:v=>v});vm.runInContext(code,context);
 vm.runInContext(`contractReservationCards.set('1',{name:'Pacote',contractReservations:[{date:'2026-10-22',time:'07:15',activity:'Bike <script>',instructor:'Douglas'}]});contractReservationCards.set('2',{name:'Outro',contractReservations:[{activity:'NÃO MOSTRAR'}]});openContractReservations('1');`,context);
 assert.equal(dialog.open,true);assert.ok(dialog.innerHTML.includes('Douglas'));assert.ok(dialog.innerHTML.includes('Bike &lt;script&gt;'));assert.ok(!dialog.innerHTML.includes('NÃO MOSTRAR'));
 vm.runInContext(`contractReservationCards.set('3',{name:'Sem confirmação',contractReservations:[]});openContractReservations('3');`,context);
 assert.ok(dialog.innerHTML.includes('Ainda não há aulas com vínculo confirmado'));assert.ok(!dialog.innerHTML.includes('Douglas'));assert.equal(typeof click,'function');
});
test('EVO v3 aliases merge with the detailed contract without creating a blank third card',async()=>{
 const {normalizeContracts}=await import('../lib/session-contracts.mjs');
 const summary={idMemberMemberShip:7597229,idMembership:112435,membershipStart:'2026-10-20',membershipEnd:'2026-11-19',nameMembership:'Pacote 8 Aulas (Parceiro)'};
 const detailed={...contract,startDate:'2026-10-20',endDate:'2026-11-19'};
 for(const rows of [[summary,detailed],[detailed,summary]]){
  const result=normalizeContracts([...rows,{idMemberMembership:7267520,concludedSessions:8,startDate:'2026-10-02',endDate:'2026-10-20'}]);
  assert.equal(result.length,2);
  const current=result.find(x=>Number(x.idMemberMembership)===7597229);
  assert.equal(current.startDate,'2026-10-20');assert.equal(current.endDate,'2026-11-19');assert.equal(current.pendingSessions,8);assert.equal(current.scheduledSessions,0);
 }
 assert.equal(normalizeContracts([{idMembership:112435}]).length,0);
 assert.equal(normalizeContracts([summary,{...detailed,cancelDate:'2026-10-21'}])[0].cancelDate,'2026-10-21');
});
