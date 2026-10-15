import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {salesSchema,salePayload,saleVerification,snapshotProductSale,syncProductSale} from './lib/evo-product-sales.mjs';
function fixture({state='waiting',status='approved',coins=12,external='confirmed'}={}){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE club_pix_orders(id TEXT PRIMARY KEY,member_id INTEGER,unit TEXT,item_type TEXT,item_id TEXT,status TEXT,external_state TEXT,currency_quantity INTEGER,provider_order_id TEXT,original_cents INTEGER,discount_cents INTEGER,amount_cents INTEGER);
 CREATE TABLE app_content(content_key TEXT,content_json TEXT);
 CREATE TABLE evo_product_catalog(tenant_key TEXT,unit TEXT,evo_product_id TEXT,stock_quantity REAL,last_synced_at TEXT);`+salesSchema);
 sql.prepare('INSERT INTO club_pix_orders VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('order-1',1,'bike','product','evo-bike-26841',status,external,coins,'mp-paid',350,coins?156:0,coins?194:350);
 const db={prepare(query){const args=[];return {bind(...values){args.push(...values);return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}}}}}};
 sql.prepare("INSERT INTO club_evo_product_sales(order_id,unit,product_id,member_evo_id,original_cents,discount_cents,pix_cents,fitcoins,session_id,state) VALUES('order-1','bike',26841,123,350,?,?,?,'order-1',?)").run(coins?156:0,coins?194:350,coins,state);
 const row=()=>sql.prepare('SELECT * FROM club_evo_product_sales').get();
 const calls=[];let posts=0;
 const evo=async(path,method,body)=>{
  calls.push({path,method,body});
  if(method==='POST'){posts++;return Response.json({sessionId:'order-1'});}
  if(path.includes('/product?'))return Response.json([{idProduct:26841,currentAmount:posts?53:54}]);
  if(path.includes('by-session'))return Response.json({idVenda:posts?987:0,idCliente:posts?123:0,clienteContratos:[]});
  if(path==='/api/v2/sales/987')return Response.json({idSale:987,idMember:123,removed:false,saleItens:[{idProduct:26841,quantity:1,saleValue:row().pix_cents/100}],receivables:[{status:{id:2},ammountPaid:row().pix_cents/100}]});
  throw Error('Unexpected endpoint '+path);
 };
 return {db,sql,row,calls,evo};
}
test('payload uses documented product fields and external bank transfer; preserves discount in D1',()=>{
 const f=fixture();assert.deepEqual(salePayload(f.row()),{idProduct:26841,productValue:1.94,productAmount:1,memberData:{idMember:123},payment:13,totalInstallments:1,sessionId:'order-1'});
 assert.throws(()=>salePayload({...f.row(),pix_cents:350}));
});
test('paid mixed order creates and verifies one sale, repeated request does not POST',async()=>{
 const f=fixture();assert.equal((await syncProductSale(f.db,'order-1',f.evo)).state,'confirmed');
 assert.equal(f.row().evo_sale_id,987);assert.equal(f.row().stock_before,54);assert.equal(f.row().stock_after,53);
 await syncProductSale(f.db,'order-1',f.evo,{retry:true});assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(f.sql.prepare('SELECT status,external_state FROM club_pix_orders').get().external_state,'confirmed');
});
test('concurrent webhook and cron claim only one remote sale',async()=>{
 const f=fixture();await Promise.all(Array.from({length:5},()=>syncProductSale(f.db,'order-1',f.evo)));
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('unpaid, refunded, cancelled and unconfirmed Fitcoins never call EVO',async()=>{
 for(const options of [{status:'pending'},{status:'refunded'},{status:'cancelled'},{external:'review'},{external:'refunded'}]){
  const f=fixture(options);assert.equal((await syncProductSale(f.db,'order-1',f.evo)).state,'not_eligible');assert.equal(f.calls.length,0);
 }
});
test('pure Pix qualifies without a Fitcoins debit',async()=>{
 const f=fixture({coins:0,external:'none'});assert.equal((await syncProductSale(f.db,'order-1',f.evo)).state,'confirmed');assert.equal(f.calls.find(c=>c.method==='POST').body.productValue,3.5);
});
test('historical order without snapshot never calls EVO',async()=>{
 const f=fixture();f.sql.exec('DELETE FROM club_evo_product_sales');assert.equal((await syncProductSale(f.db,'order-1',f.evo)).state,'not_eligible');assert.equal(f.calls.length,0);
});
test('timeout after send is ambiguous; retry only looks up and never resends',async()=>{
 const f=fixture();let posts=0;
 const remote=async(...args)=>{if(args[1]==='POST'){posts++;throw Error('timeout')}return f.evo(...args)};
 assert.equal((await syncProductSale(f.db,'order-1',remote)).state,'uncertain');
 f.sql.exec("UPDATE club_evo_product_sales SET sent_at='2026-01-01 00:00:00'");
 await syncProductSale(f.db,'order-1',remote,{retry:true});assert.equal(posts,1);assert.equal(f.row().state,'uncertain');
});
test('lost response recovers remote id by session without repeating POST',async()=>{
 const f=fixture({state:'uncertain'});f.sql.exec("UPDATE club_evo_product_sales SET stock_before=54,sent_at='2026-01-01 00:00:00'");
 const remote=async(path,method)=>{
  assert.equal(method,'GET');
  if(path.includes('by-session'))return Response.json(987);
  if(path.includes('/product?'))return Response.json([{idProduct:26841,currentAmount:53}]);
  return f.evo(path,method);
 };
 assert.equal((await syncProductSale(f.db,'order-1',remote)).state,'confirmed');
});
test('explicit retry after documented rejection checks session before POST',async()=>{
 const f=fixture();let reject=true;
 const remote=async(...a)=>a[1]==='POST'&&reject?Response.json({errors:[{value:'Permission denied'}]},{status:403}):f.evo(...a);
 assert.equal((await syncProductSale(f.db,'order-1',remote)).state,'rejected');
 const count=f.calls.length;await syncProductSale(f.db,'order-1',remote);assert.equal(f.calls.length,count);
 reject=false;assert.equal((await syncProductSale(f.db,'order-1',remote,{retry:true})).state,'confirmed');
});
test('mismatch or unknown payment does not claim verified success or resend sale',async()=>{
 const f=fixture();
 const remote=async(path,...rest)=>path==='/api/v2/sales/987'?Response.json({idSale:987,idMember:999,saleItens:[]}):f.evo(path,...rest);
 assert.equal((await syncProductSale(f.db,'order-1',remote)).state,'verify_pending');
 await syncProductSale(f.db,'order-1',remote,{retry:true});assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('snapshot is immutable and unit member comes from server identity',async()=>{
 const f=fixture({status:'selected'});f.sql.exec('DELETE FROM club_evo_product_sales');
 f.sql.prepare('INSERT INTO app_content VALUES(?,?)').run('club-pop',JSON.stringify({products:[{id:'evo-bike-26841',unit:'bike',source:'evo',evoProductId:'26841'}]}));
 await snapshotProductSale(f.db,'order-1',{id:1,evo_member_id:123,gym_client_id:999});
 assert.equal(f.row().member_evo_id,123);
 await snapshotProductSale(f.db,'order-1',{id:1,evo_member_id:456});assert.equal(f.row().member_evo_id,123);
});
