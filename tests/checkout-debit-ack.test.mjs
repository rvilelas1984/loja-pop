import assert from 'node:assert/strict';
import {settleFitcoins} from '../lib/checkout-fitcoins.mjs';
async function scenario(itemType,amount,response,timeout=false){
 const order={id:'test',member_id:1,external_member_id:'965062',unit:'bike',item_type:itemType,currency_quantity:27,amount_cents:amount,status:amount?'paid_pending_coins':'creating',external_state:'none',reservation_state:'held'};
 const queries=[],calls=[];
 const db={prepare(sql){return {bind(...args){return {first:async()=>({...order}),run:async()=>{queries.push({sql,args});if(sql.includes("external_state='running'" )&&sql.startsWith('UPDATE')&&sql.includes("IN ('none','failed')")){if(order.external_state!=='none')return {meta:{changes:0}};order.external_state='running'}if(sql.includes('external_state=?'))order.external_state=args[0];return {meta:{changes:1}}}}}}},async batch(stmts){for(const s of stmts)await s.run();if(queries.some(q=>q.sql.includes("external_state='confirmed',external_after")))order.external_state='confirmed';if(queries.some(q=>q.sql.includes("SET status='approved'")))order.status='approved'}};
 const evo=async(path,method)=>{calls.push(method);if(method==='GET')return Response.json({totalFitcoins:322});if(timeout)throw Error('timeout');return response()};
 if(timeout||response().status!==200||response().headers.get('x-fail')){await assert.rejects(()=>settleFitcoins(db,order,evo));assert.equal(order.external_state,'review');assert.notEqual(order.status,'approved');await assert.rejects(()=>settleFitcoins(db,order,evo));assert.equal(calls.filter(x=>x==='PUT').length,1)}else{
 assert.equal((await settleFitcoins(db,order,evo)).status,'approved');assert.deepEqual(calls,['GET','PUT']);
 assert.equal((await settleFitcoins(db,order,evo)).status,'approved');assert.deepEqual(calls,['GET','PUT']);
 const audit=queries.find(q=>q.sql.includes('FITCOINS_DEBIT_ACKNOWLEDGED'));assert.equal(JSON.parse(audit.args[1]).httpStatus,200);assert.equal(JSON.parse(audit.args[1]).after,295);
 }
}
for(const type of ['product','service'])for(const amount of [0,181])await scenario(type,amount,()=>Response.json({result:'OK'}));
await scenario('product',0,()=>Response.json(true));
await scenario('product',0,()=>Response.json({error:'rejected'},{headers:{'x-fail':'1'}}));
await scenario('product',0,()=>Response.json(false,{headers:{'x-fail':'1'}}));
await scenario('product',0,()=>Response.json({error:'fail'},{status:400}));
await scenario('product',0,()=>Response.json({}),true);
console.log('PASS: products/services, coins/mixed, HTTP200 acknowledgement without second GET, explicit error and timeout review, no repeated PUT, persisted receipt. Mock only.');
