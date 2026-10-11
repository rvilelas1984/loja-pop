import assert from 'node:assert/strict';
import {receptionAction} from '../lib/checkout-fitcoins.mjs';
const order={id:'test',external_state:'review',status:'creating',reservation_state:'held',external_member_id:'965062',external_before:322,currency_quantity:27,unit:'bike',member_id:1,amount_cents:0};
const details={checkedEvo:true,reason:'Conferido no histórico EVO',evidence:'comprovante de teste',actor:'staff-test'};
let calls=0,claimed=false;const writes=[];
const db={prepare(sql){return {bind(...args){return {async run(){writes.push({sql,args});if(sql.includes("AND external_state IN ('review','failed')")){if(claimed)return {meta:{changes:0}};claimed=true}return {meta:{changes:1}}}}}}},async batch(stmts){for(const s of stmts)await s.run()}};
const evo=async()=>{calls++;throw Error('Manual confirmation must not call EVO')};
for(const item_type of ['product','service'])for(const amount_cents of [0,181]){
 claimed=false;writes.length=0;
 const result=await receptionAction(db,{...order,item_type,amount_cents,status:amount_cents?'paid_pending_coins':'creating'},'coins_confirmed',evo,details);
 assert.equal(result.status,'approved');assert.equal(result.balance,295);assert.equal(calls,0);
 const balance=writes.find(x=>x.sql.startsWith('UPDATE evo_students'));assert.deepEqual(balance.args,[295,'bike','965062']);
 assert(writes.some(x=>x.sql.includes("status='approved'")));
 const audit=writes.find(x=>x.args.includes('CHECKOUT_FITCOINS_CONFIRMADO_MANUALMENTE'));assert.equal(JSON.parse(audit.args.at(-1)).balanceSource,'staff_confirmed_debit');
 const count=writes.length;await assert.rejects(()=>receptionAction(db,order,'coins_confirmed',evo,details),/PEDIDO_JA_PROCESSADO/);assert.equal(writes.length,count+1);
}
for(const external_before of [null,undefined,10,NaN])await assert.rejects(()=>receptionAction(db,{...order,external_before},'coins_confirmed',evo,details),/SEM_SALDO/);
await assert.rejects(()=>receptionAction(db,order,'coins_confirmed',evo,{...details,checkedEvo:false}),/CONFERENCIA_MANUAL/);
await assert.rejects(()=>receptionAction(db,order,'coins_confirmed',evo,{...details,evidence:''}),/COMPROVANTE/);
assert.equal(calls,0);console.log('PASS: manual products/services/mixed confirmation, 322-27=295, scoped balance, audit, duplicate guard, invalid confirmation rejection, zero EVO calls.');
