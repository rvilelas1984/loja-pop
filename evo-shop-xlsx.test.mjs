import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {workbookFor,readReturn} from './lib/evo-shop-xlsx.mjs';
import {exportRow,reconcile,headers} from './lib/evo-shop-import.mjs';
const path=process.env.SHEETJS_TEST_PATH;
const XLSX=path?createRequire(import.meta.url)(path):null;
test('XLSX roundtrip: types, leading-zero CPF, column L beyond declared range, success/rejection',{skip:!XLSX},()=>{
 const o={memberName:'Ana Silva',cpf:'01234567890',amountCents:181,itemType:'product',officialName:'Água Mineral EVO',saleDate:'15/10/2026',paymentMode:'mixed'},settings={branchCode:'1',receipts:{mixed:7}};
 const snapshot=[{orderId:'p1',row:exportRow(o,settings)},{orderId:'s1',row:exportRow({...o,itemType:'service',officialName:'Aula EVO'},settings)}];
 const wb=workbookFor(XLSX,snapshot),bytes=XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),read=XLSX.read(bytes,{type:'buffer'}),ws=read.Sheets['Vendas EVO'];
 assert.deepEqual(XLSX.utils.sheet_to_json(ws,{header:1})[0],headers);assert.equal(ws.C2.t,'s');assert.equal(ws.C2.v,'01234567890');assert.equal(ws.D2.v,1.81);assert.equal(ws.E2.v,'');assert.equal(ws.F3.v,'');assert.equal(ws.H2.v,7);
 ws.L1={t:'s',v:'Log de importação'};ws.L2={t:'s',v:'Venda importada com sucesso'};ws.L3={t:'s',v:'Venda não importada: CPF inválido'};ws['!ref']='A1:L3';
 const returned=XLSX.write(read,{type:'array',bookType:'xlsx'}),entries=readReturn(XLSX,returned);assert.equal(entries.length,2);assert.deepEqual(reconcile(snapshot,entries).updates.map(x=>x.status),['confirmed','rejected']);
 const fake={...XLSX,read:()=>({...read,Sheets:{'Vendas EVO':{...ws,'!ref':'A1:K3'}}})};assert.equal(readReturn(fake,returned).length,2);
 assert.throws(()=>readReturn(XLSX,bytes),/coluna L/);
});
