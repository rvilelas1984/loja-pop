import test from 'node:test';
import assert from 'node:assert/strict';
import {handleSharedContractAccess} from './lib/worker-shared-contract-access.mjs';

const originalFetch=globalThis.fetch;
const req=(method,body,cookie='session=test')=>new Request('https://worker.example/admin/shared-contract-access',{method,headers:{'x-clubpop-admin-cookie':cookie,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const env={DB:{prepare(sql){return {bind(...args){return this},async first(){return {ok:1}},async all(){return {results:[]}},async run(){return {success:true}}}}}};
test('não permite consulta sem cookie',async()=>{const response=await handleSharedContractAccess(req('GET',null,''),env);assert.equal(response.status,401)});
test('não permite alteração sem papel de administrador',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({role:'reception'}),{status:200});
 try{const response=await handleSharedContractAccess(req('PUT',{unit:'bike',contractId:'78217'}),env);assert.equal(response.status,403)}finally{globalThis.fetch=originalFetch}
});
test('rejeita contrato inválido antes de escrever',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({role:'admin'}),{status:200});
 try{const response=await handleSharedContractAccess(req('PUT',{unit:'bike',contractId:'invalid'}),env);assert.equal(response.status,400)}finally{globalThis.fetch=originalFetch}
});
test('consulta catálogo e regras com administrador válido',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({role:'admin'}),{status:200});
 try{const response=await handleSharedContractAccess(req('GET'),env);assert.equal(response.status,200);const data=await response.json();assert.equal(data.ok,true);assert.deepEqual(data.rules,[])}finally{globalThis.fetch=originalFetch}
});
