import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {options,quote} from '../lib/checkout.mjs';
import {credit} from '../lib/currency-ledger.mjs';
import worker from '../club-pop-worker.mjs';
const sqlite=new DatabaseSync(':memory:');
for(const file of ['tests/currency-schema.sql','migrations/20261011_currency_ledger.sql','migrations/20261010_club_pix_orders.sql','migrations/20261011_checkout_choices.sql','migrations/20261011_checkout_fitcoins.sql','migrations/20261015_evo_product_sales.sql'])sqlite.exec(readFileSync(file,'utf8'));
const db={prepare(sql){return{sql,args:[],bind(...a){this.args=a;return this},async first(){return sqlite.prepare(sql).get(...this.args)||null},async all(){return{results:sqlite.prepare(sql).all(...this.args)}},async run(){return{meta:{changes:sqlite.prepare(sql).run(...this.args).changes}}}}},async batch(stmts){sqlite.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sqlite.exec('COMMIT');return out}catch(e){sqlite.exec('ROLLBACK');throw e}}};
sqlite.exec("INSERT INTO members(id,evo_member_id,gym_client_id,cpf_hash,first_name,email) VALUES(1,100,'200','hash','Teste','test@example.com'); CREATE TABLE auth_sessions(member_id INTEGER,token_hash TEXT,revoked_at TEXT,expires_at TEXT); CREATE TABLE club_mp_credentials(unit TEXT,environment TEXT,access_token_cipher TEXT,webhook_secret_cipher TEXT); CREATE TABLE evo_unit_config(unit TEXT,dns TEXT,token TEXT,expires_at TEXT,enabled INTEGER); INSERT INTO evo_unit_config VALUES('bike','test','test','2099-01-01',1);");
const token='checkout-test',hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');sqlite.prepare('INSERT INTO auth_sessions VALUES(?,?,NULL,?)').run(1,hash,'2099-01-01T00:00:00Z');
sqlite.exec("INSERT INTO club_currencies(code,name,symbol,brl_value,source) VALUES('fitcoins','Fitcoins','FC',.13,'external'),('popcoins','Popcoins','PC',.13,'local'); INSERT INTO club_currency_units VALUES(1,'bike',1),(1,'gym',1),(2,'bike',1),(2,'gym',1); INSERT INTO evo_students VALUES('bike','100','Teste','Active',310,1,'run',CURRENT_TIMESTAMP),('gym','200','Teste','Active',80,1,'run',CURRENT_TIMESTAMP);");
const product={id:'water',name:'Água mineral',unit:'bike',status:'Ativo',price:3.50,stock:10,paymentMethod:'mixed',currencyPayment:{enabled:true,currency:'popcoins',maxDiscountPercent:100}},external={...product,id:'external',source:'evo',evoProductId:'26841',currencyPayment:{...product.currencyPayment,currency:'fitcoins'}},service={...product,id:'service'};
const catalog={products:[product,external,{...external,unit:'gym'}],services:[service]};
const writeCatalog=()=>sqlite.prepare("INSERT INTO app_content VALUES('club-pop',?,CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_json=excluded.content_json").run(JSON.stringify(catalog));writeCatalog();
const member={id:1,evo_member_id:100,gym_client_id:'200'},base={unit:'bike',itemType:'product',itemId:'water',currencyId:2,quantity:10,mode:'mixed'},money={memberId:1,currencyId:2,unit:'bike',amount:100,origin:'test',key:'seed'};
await credit(db,money);await credit(db,{...money,unit:'gym',amount:50,key:'gym'});
assert.equal((await options(db,member,{...base,itemId:'external'})).offers[0].balance,310);assert.equal((await options(db,member,{...base,itemId:'external',unit:'gym'})).offers[0].balance,80);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM club_currency_wallets WHERE currency_id=1').get().n,0);
await assert.rejects(()=>options(db,{...member,gym_client_id:null},{...base,unit:'gym'}),/NAO_VINCULADO/);await assert.rejects(()=>options(db,member,{...base,unit:'club'}),/PARAMETROS/);
const partial=await quote(db,member,base);assert.deepEqual([partial.originalCents,partial.discountCents,partial.pixCents],[350,130,220]);
const req=async(path,body,headers={})=>{const r=await worker.fetch(new Request('https://worker'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:await r.json()}};
const keyBytes=crypto.getRandomValues(new Uint8Array(32)),key=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
const cipher=async text=>{const iv=crypto.getRandomValues(new Uint8Array(12)),value=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('bike:production')},key,new TextEncoder().encode(text));return Buffer.from(iv).toString('base64')+'.'+Buffer.from(value).toString('base64')};
sqlite.prepare('INSERT INTO club_mp_credentials VALUES(?,?,?,?)').run('bike','production',await cipher('test-token'),await cipher('test-secret'));
const env={DB:db,CLUB_PIX_PRODUCTION_ENABLED:'true',MERCADOPAGO_CONFIG_ENCRYPTION_KEY:Buffer.from(keyBytes).toString('base64')};
sqlite.exec("CREATE TABLE audit_log(actor_type TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT); CREATE TABLE evo_product_catalog(tenant_key TEXT,unit TEXT,evo_product_id TEXT,stock_quantity REAL,last_synced_at TEXT);");
let salesPosts=0,remoteStock=54,saleRequest=null;
const originalFetch=globalThis.fetch;let providerCalls=0,evoBalance=310,evoWrites=0,failEvo=false;let adminScope=['bike'];const provider=new Map();
globalThis.fetch=async(url,init={})=>{
 if(String(url).includes('/api/admin-auth?route=me'))return Response.json({role:'reception',units:adminScope,permissions:['/admin-resgates.html']});
 if(String(url).startsWith('https://evo-integracao-api.w12app.com.br')){const u=new URL(url);if(u.pathname==='/api/v2/sales'&&init.method==='POST'){salesPosts++;saleRequest=JSON.parse(init.body);remoteStock--;return Response.json({sessionId:saleRequest.sessionId});}
 if(u.pathname==='/api/v1/product')return Response.json([{idProduct:26841,currentAmount:remoteStock}]);
 if(u.pathname==='/api/v1/sales/by-session-id')return Response.json({idVenda:salesPosts?987:0,idCliente:100,clienteContratos:[]});
 if(u.pathname==='/api/v2/sales/987')return Response.json({idSale:987,idMember:100,saleItens:[{idProduct:26841,quantity:1,saleValue:1.94}],receivables:[{status:{id:2},ammountPaid:1.94}]});
 if(init.method==='PUT'){evoWrites++;if(failEvo)throw Error('network after write');evoBalance+=(u.searchParams.get('type')==='1'?1:-1)*Number(u.searchParams.get('fitcoin'));return Response.json({ok:true});}return Response.json({totalFitCoins:evoBalance});}
 assert.match(String(url),/^https:\/\/api.mercadopago.com\/v1\/orders/);providerCalls++;if(init.method==='POST'){const b=JSON.parse(init.body),id='ORD'+provider.size,p={id,external_reference:b.external_reference,total_amount:b.total_amount,total_paid_amount:b.total_amount,status:'pending',transactions:{payments:[{status:'processed',payment_method:{id:'pix',qr_code:'test-qr'}}]}};provider.set(id,p);return Response.json(p)}return Response.json(provider.get(String(url).split('/').pop()))};
const save=async b=>{const x=await req('/checkout/mixed/quote',{...base,...b,save:true,key:crypto.randomUUID()});assert.equal(x.status,200,JSON.stringify(x));return x.data};
const wallet=()=>sqlite.prepare("SELECT balance FROM club_currency_wallets WHERE member_id=1 AND currency_id=2 AND unit='bike'").get().balance;
const order=id=>sqlite.prepare('SELECT * FROM club_pix_orders WHERE id=?').get(id);
const stock=()=>JSON.parse(sqlite.prepare('SELECT content_json FROM app_content').get().content_json).products[0].stock;
const webhook=async(p,ms=true,valid=true)=>{const ts=String(ms?Date.now():Math.floor(Date.now()/1000)),rid='test-event',k=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']),sig=Buffer.from(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode('id:'+p.id.toLowerCase()+';request-id:'+rid+';ts:'+ts+';'))).toString('hex');return req('/checkout/pix/webhook?data.id='+p.id,{}, {'x-request-id':rid,'x-signature':'ts='+ts+',v1='+(valid?sig:'00')})};
try {
 const choice=await save({itemId:'external',currencyId:1,quantity:12});
 assert.equal(choice.pixCents,194);assert.equal(salesPosts,0);assert.equal(evoWrites,0);
 const snapshot=()=>sqlite.prepare('SELECT * FROM club_evo_product_sales WHERE order_id=?').get(choice.orderId);
 assert.equal(snapshot().state,'waiting');assert.equal(snapshot().original_cents,350);assert.equal(snapshot().discount_cents,156);
 const created=await req('/checkout/pix/create',{orderId:choice.orderId});assert.equal(created.status,200);
 const p=provider.get(created.data.providerOrderId);assert.equal(p.total_amount,'1.94');assert.equal(salesPosts,0);
 p.status='processed';const paid=await webhook(p);assert.equal(paid.status,200,JSON.stringify(paid));
 assert.equal(evoWrites,1);assert.equal(evoBalance,298);assert.equal(salesPosts,1);
 assert.equal(snapshot().state,'confirmed');assert.equal(snapshot().evo_sale_id,987);assert.equal(remoteStock,53);
 assert.equal(saleRequest.productValue,1.94);assert.equal(saleRequest.memberData.idMember,100);assert.equal(saleRequest.idProduct,26841);
 await webhook(p);await webhook(p);assert.equal(evoWrites,1);assert.equal(salesPosts,1);
 const providerBefore=providerCalls;
 const denied=await req('/admin/checkout-redemptions',{redemptionId:'checkout:'+choice.orderId,action:'evo_sale_retry'},{'x-clubpop-admin-cookie':'admin=test'});
 assert.equal(denied.status,403);assert.equal(providerCalls,providerBefore);assert.equal(evoWrites,1);
 console.log('PASS Worker integration: 12 Fitcoins + Pix 1.94, durable snapshot, signed payment webhook, one debit, one sale, verified stock 54 to 53, repeated webhook safe, reception cannot retry sale. All providers mocked.');
} finally {globalThis.fetch=originalFetch}
