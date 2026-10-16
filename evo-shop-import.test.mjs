import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {pendingReasons,exportRow,reconcile,rowKey,returnStatus,saleDate,shopImport,loadOrders,headers} from './lib/evo-shop-import.mjs';
const settings={branchCode:'01',receipts:{pix:15,coins:1,mixed:7}};
const valid={id:'o1',unit:'bike',itemType:'product',memberName:'Ana Silva',cpf:'01234567890',officialName:'Água oficial',amountCents:350,originalCents:350,discountCents:0,currencyQuantity:0,paymentMode:'pix',status:'approved',externalState:'none',pixVerified:true,saleDate:'15/10/2026'};
test('eligibility: Pix, mixed, coins, cancellation, refund, incomplete, confirmed and test',()=>{
 assert.deepEqual(pendingReasons(valid,settings),[]);
 assert.deepEqual(pendingReasons({...valid,currencyQuantity:13,discountCents:169,amountCents:181,paymentMode:'mixed',externalState:'confirmed'},settings),[]);
 for(const patch of [{status:'cancelled'},{status:'refunded'},{cpf:''},{officialName:''},{importStatus:'confirmed'},{importStatus:'exported'},{isTest:true},{pixVerified:false},{fiscalRegisteredAt:'today'},{autoSaleId:123},{originalCents:351},{paymentMode:'mixed'}])assert.ok(pendingReasons({...valid,...patch},settings).length,JSON.stringify(patch));
 assert.ok(pendingReasons({...valid,currencyQuantity:27,discountCents:350,amountCents:0,paymentMode:'coins',externalState:'confirmed'},settings).some(x=>x.includes('zerado')));
 assert.ok(pendingReasons({...valid,currencyQuantity:13,discountCents:169,amountCents:181,paymentMode:'mixed',externalState:'confirmed'},{...settings,receipts:{pix:15}}).some(x=>x.includes('recebimento')));
});
test('official columns, CPF leading zero, item types and purchase timezone',()=>{
 const row=exportRow(valid,settings);assert.deepEqual(Object.keys(row),headers);assert.equal(row['CPF (CIN)'],'01234567890');assert.equal(row.PRODUTO,'Água oficial');assert.equal(row['SERVIÇO'],'');assert.equal(row.VALOR,3.5);
 const service=exportRow({...valid,itemType:'service'},settings);assert.equal(service.PRODUTO,'');assert.equal(service['SERVIÇO'],'Água oficial');
 assert.equal(saleDate('2026-10-16 01:30:00'),'15/10/2026');assert.equal(saleDate('not a date'),'');
});
test('return exact matching, rejection, unrecognized logs and duplicate ambiguity',()=>{
 const row=exportRow(valid,settings),snapshot=[{orderId:'o1',row}];
 assert.equal(returnStatus('Venda importada com sucesso'),'confirmed');assert.equal(returnStatus('Venda não importada: CPF inválido'),'rejected');assert.equal(returnStatus('Processando'),'review');
 assert.equal(reconcile(snapshot,[{row,log:'Venda importada com sucesso'}]).updates[0].status,'confirmed');
 for(const field of ['ID_FILIAL','DATA_VENDA','PRODUTO','VALOR'])assert.equal(reconcile(snapshot,[{row:{...row,[field]:'999'},log:'Venda importada com sucesso'}]).updates.length,0);
 assert.equal(reconcile([...snapshot,{orderId:'o2',row}],[{row,log:'Venda importada com sucesso'},{row,log:'Erro'}]).updates.length,0);
 assert.equal(reconcile([...snapshot,{orderId:'o2',row}],[{row,log:'Venda importada com sucesso'},{row,log:'Venda importada com sucesso'}]).updates.length,2);
});
function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id TEXT,gym_client_id TEXT,first_name TEXT,last_name TEXT);
 CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT,raw_json TEXT);
 CREATE TABLE club_pix_orders(id TEXT PRIMARY KEY,unit TEXT,item_type TEXT,item_id TEXT,member_id INTEGER,external_member_id TEXT,status TEXT,amount_cents INTEGER,original_cents INTEGER,discount_cents INTEGER,currency_quantity INTEGER,payment_mode TEXT,item_name TEXT,external_state TEXT,created_at TEXT,updated_at TEXT,provider_order_id TEXT,external_before INTEGER);
 CREATE TABLE club_pix_provider_events(order_id TEXT,provider_order_id TEXT,amount_cents INTEGER,provider_status TEXT);
 CREATE TABLE club_pix_fulfillment(order_id TEXT,delivery_state TEXT);
 CREATE TABLE club_fiscal_sale_entries(order_id TEXT,registered_at TEXT,registered_by TEXT);
 CREATE TABLE club_evo_product_sales(order_id TEXT,product_id TEXT,state TEXT,evo_sale_id INTEGER);
 CREATE TABLE app_content(content_key TEXT,content_json TEXT);
 CREATE TABLE evo_product_catalog(tenant_key TEXT,unit TEXT,evo_product_id TEXT,name TEXT);
 CREATE TABLE evo_service_catalog(unit TEXT,evo_service_id TEXT,service_name TEXT);
 CREATE TABLE aggregator_branch_defaults(unit TEXT,branch_code TEXT);
 INSERT INTO members VALUES(1,'bike-person','gym-person','Local','Name');
 INSERT INTO evo_member_master VALUES('bike','bike-person','{"name":"Ana Bike","document":"01234567890"}','{}'),('gym','gym-person','{"name":"Ana Gym","cpf":"09876543210"}','{}');
 INSERT INTO app_content VALUES('club-pop','{"products":[{"id":"p","unit":"bike","evoProductId":"1"}],"services":[{"id":"s","unit":"gym","evoServiceId":"2"}]}');
 INSERT INTO evo_product_catalog VALUES('default','bike','1','Produto oficial');
 INSERT INTO evo_service_catalog VALUES('gym','2','Serviço oficial');
 INSERT INTO club_pix_orders VALUES('bike-order','bike','product','p',1,NULL,'approved',350,350,0,0,'pix','Nome antigo','none','2026-10-16 01:30:00','now','provider1',NULL),('gym-order','gym','service','s',1,NULL,'approved',181,350,169,13,'mixed','Serviço antigo','confirmed','2026-10-16 12:00:00','now','provider2',NULL);
 INSERT INTO club_pix_provider_events VALUES('bike-order','provider1',350,'processed'),('gym-order','provider2',181,'processed');`);
 sql.exec(readFileSync('migrations/20261016_evo_shop_import.sql','utf8'));
 const prepare=q=>({bind(...params){return statement(q,params)},...statement(q,[])});
 const statement=(q,params)=>({async first(){return sql.prepare(q).get(...params)||null},async all(){return {results:sql.prepare(q).all(...params)}},async run(){const r=sql.prepare(q).run(...params);return {meta:{changes:Number(r.changes)}}}});
 const db={prepare,async batch(stm){sql.exec('BEGIN');try{const out=[];for(const s of stm)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db};
}
test('D1 lifecycle: units, snapshots, atomic duplicate prevention, return and retry',async()=>{
 const {sql,db}=fixture();
 for(const unit of ['bike','gym'])await shopImport(db,unit,'POST',{action:'settings',settings},{});
 const bike=await loadOrders(db,'bike'),gym=await loadOrders(db,'gym');assert.equal(bike.length,1);assert.equal(gym.length,1);assert.equal(gym[0].cpf,'09876543210');assert.equal(gym[0].memberName,'Ana Gym');assert.equal(gym[0].officialName,'Serviço oficial');
 await assert.rejects(shopImport(db,'bike','POST',{action:'export',orderIds:['gym-order']},{}));
 const batch=await shopImport(db,'bike','POST',{action:'export',orderIds:['bike-order']},{});
 assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'exported');
 await assert.rejects(shopImport(db,'bike','POST',{action:'export',orderIds:['bike-order']},{}));assert.equal(sql.prepare('SELECT count(*) n FROM club_evo_import_batches').get().n,1);
 await shopImport(db,'bike','POST',{action:'return',batchId:batch.batchId,entries:batch.snapshot.map(x=>({...x,log:'Venda não importada: erro no cadastro'}))},{});
 assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'rejected');
 const retry=await shopImport(db,'bike','POST',{action:'export',orderIds:['bike-order']},{});
 await shopImport(db,'bike','POST',{action:'return',batchId:batch.batchId,entries:batch.snapshot.map(x=>({...x,log:'Venda importada com sucesso'}))},{});
 assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'exported');
 await shopImport(db,'bike','POST',{action:'return',batchId:retry.batchId,entries:retry.snapshot.map(x=>({...x,log:'Venda importada com sucesso'}))},{});
 assert.equal(sql.prepare('SELECT status FROM club_evo_import_items').get().status,'confirmed');
 await assert.rejects(shopImport(db,'bike','POST',{action:'export',orderIds:['bike-order']},{}));
 const g=await shopImport(db,'gym','POST',{action:'export',orderIds:['gym-order']},{});assert.equal(g.snapshot[0].row.VALOR,1.81);assert.equal(g.snapshot[0].row.TIPO_RECEBIMENTO,7);
 assert.equal(sql.prepare('SELECT status FROM club_pix_orders WHERE id=?').get('gym-order').status,'approved');
});
test('transaction guard catches a sale changed between reading and writing',async()=>{
 const {sql,db}=fixture();await shopImport(db,'bike','POST',{action:'settings',settings},{});
 const batch=db.batch;db.batch=async stm=>{sql.exec("UPDATE club_pix_orders SET status='refunded'");return batch(stm)};
 await assert.rejects(shopImport(db,'bike','POST',{action:'export',orderIds:['bike-order']},{}));assert.equal(sql.prepare('SELECT count(*) n FROM club_evo_import_batches').get().n,0);
});
