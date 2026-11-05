import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../tela-checkin.html',import.meta.url),'utf8');
test('unit switch discards old response and loads selected unit after pending request',async()=>{
 let selected='bike',resolve,requests=[],renders=[];
 const c=vm.createContext({URLSearchParams,document:{getElementById:()=>({value:selected}),querySelector:()=>null},els:{status:{}},sessionStorage:{setItem(){}},localStorage:{getItem:()=>null},cached:()=>null,dailySchedule:()=>[],dailySnapshotKey:u=>u,storeCache(){},render:d=>renders.push(d.unit),fetch:async url=>{requests.push(url);if(requests.length===1)return await new Promise(r=>resolve=r);return {ok:true,json:async()=>({ok:true,unit:'gym',snapshot:{ok:false}})};}});
 vm.runInContext('let cpUnitEpoch=0,cpUnitReload=false,currentSessionId=null,currentStart=null,autoReloadKey="";'+html.slice(html.indexOf('async function load(reason='),html.indexOf('async function refreshGrade')),c);
 const pending=vm.runInContext('load("initial")',c);selected='gym';vm.runInContext('cpUnitEpoch++;load("initial")',c);
 resolve({ok:true,json:async()=>({ok:true,unit:'bike'})});await pending;await new Promise(r=>setImmediate(r));
 assert.deepEqual(renders,['gym']);assert.equal(requests.length,2);assert.match(requests[1],/unit=gym/);
});
