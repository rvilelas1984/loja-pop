import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './tests/evo-shop-fixture.mjs';
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
test('Worker authorizes unit, role, method and signed claims before D1 access',async()=>{
 const {default:worker}=await import('./club-pop-worker.mjs');const {createHmac}=await import('node:crypto');const secret='fixture-only-secret';
 const request=(claims,unit='bike',method='GET')=>{const c=Buffer.from(JSON.stringify(claims)).toString('base64url');return new Request('https://worker.test/admin/shop-sales-import?unit='+unit,{method,headers:{'x-clubpop-proxy-auth':c+'.'+createHmac('sha256',secret).update(c).digest('hex')}})};
 const validClaims={role:'admin',units:['bike'],unit:'bike',route:'shop-sales-import',method:'GET',t:Date.now()};
 for(const patch of [{role:'reception'},{units:['gym']},{unit:'gym'},{route:'teacher-view'},{method:'POST'},{t:0}]){const r=await worker.fetch(request({...validClaims,...patch}),{AUTO_SYNC_SECRET:secret,DB:{prepare(){throw Error('must not access DB')}}});assert.equal(r.status,403)}
 const {db}=fixture();const r=await worker.fetch(request(validClaims),{AUTO_SYNC_SECRET:secret,DB:db});assert.equal(r.status,200);const d=await r.json();assert.equal(d.orders.length,1);assert.equal(d.orders[0].unit,'bike');
});
