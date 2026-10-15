// Sales only: never calls Mercado Pago or the Fitcoins mutation endpoint.
// Contract: https://api.abcevo.com/create-a-new-sale-32242756e0
export const salesSchema = `CREATE TABLE IF NOT EXISTS club_evo_product_sales (
 order_id TEXT PRIMARY KEY, unit TEXT NOT NULL, product_id INTEGER NOT NULL,
 member_evo_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity=1),
 original_cents INTEGER NOT NULL, discount_cents INTEGER NOT NULL, pix_cents INTEGER NOT NULL,
 fitcoins INTEGER NOT NULL, provider_order_id TEXT, session_id TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'waiting', attempts INTEGER NOT NULL DEFAULT 0, checks INTEGER NOT NULL DEFAULT 0,
 evo_sale_id INTEGER, request_json TEXT, response_json TEXT, last_error TEXT,
 stock_before REAL, stock_after REAL, verification_json TEXT,
 sent_at TEXT, checked_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(unit,evo_sale_id)
)`;
const positive = n => Number.isSafeInteger(Number(n)) && Number(n)>0;
const cents = n => Number.isSafeInteger(Number(n)) && Number(n)>=0;
const paidSQL = `o.status='approved' AND ((o.currency_quantity>0 AND o.external_state='confirmed') OR (o.currency_quantity=0 AND o.external_state='none'))`;
export function salePayload(s) {
 if(!positive(s.product_id)||!positive(s.member_evo_id)||s.quantity!==1||
    ![s.original_cents,s.discount_cents,s.pix_cents,s.fitcoins].every(cents)||
    s.original_cents!==s.discount_cents+s.pix_cents||!positive(s.original_cents))throw Error('EVO_SALE_VALUES_INVALID');
 // EVO has no originalValue/fitcoinsDiscount fields. Retain the breakdown in D1;
 // productValue is the final price. 13 is documented bank transfer (Pix already
 // received externally); do not initiate EVO's Pix gateway or send fake card data.
 return {idProduct:s.product_id,productValue:s.pix_cents/100,productAmount:1,
   memberData:{idMember:s.member_evo_id},payment:s.pix_cents>0?13:5,
   totalInstallments:1,sessionId:s.session_id};
}
export async function snapshotProductSale(db,orderId,member) {
 const o=await db.prepare('SELECT * FROM club_pix_orders WHERE id=? AND member_id=?').bind(orderId,member.id).first();
 if(!o||o.item_type!=='product'||o.status!=='selected')return;
 const row=await db.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();
 const p=(JSON.parse(row?.content_json||'{}').products||[]).find(p=>String(p.id)===o.item_id&&String(p.unit||'bike')===o.unit);
 if(!p||!(p.source==='evo'||p.origin==='evo')||!p.evoProductId)return;
 const s={product_id:Number(p.evoProductId),member_evo_id:Number(o.unit==='gym'?member.gym_client_id:member.evo_member_id),quantity:1,
  original_cents:o.original_cents,discount_cents:o.discount_cents,pix_cents:o.amount_cents,fitcoins:o.currency_quantity,session_id:o.id};
 salePayload(s);
 await db.prepare(`INSERT OR IGNORE INTO club_evo_product_sales(order_id,unit,product_id,member_evo_id,original_cents,discount_cents,pix_cents,fitcoins,session_id)
 VALUES(?,?,?,?,?,?,?,?,?)`).bind(o.id,o.unit,s.product_id,s.member_evo_id,s.original_cents,s.discount_cents,s.pix_cents,s.fitcoins,o.id).run();
}
export function saleVerification(s,sale) {
 const items=sale?.saleItens;
 const item=Array.isArray(items)&&items.length===1?items[0]:null;
 const matches=Number(sale?.idSale)===Number(s.evo_sale_id)&&Number(sale?.idMember)===s.member_evo_id&&sale.removed!==true&&
  Number(item?.idProduct)===s.product_id&&Number(item?.quantity)===s.quantity&&Math.round(Number(item?.saleValue)*100)===s.pix_cents;
 const received=Array.isArray(sale?.receivables)&&sale.receivables.length>0&&sale.receivables.every(r=>Number(r.status?.id)===2)&&
  Math.round(sale.receivables.reduce((sum,r)=>sum+Number(r.ammountPaid||0),0)*100)===s.pix_cents;
 return {saleMatches:!!matches,paymentReceived:s.pix_cents===0||received};
}
export async function syncProductSale(db,orderId,evo,{retry=false}={}) {
 let s=await db.prepare(`SELECT s.* FROM club_evo_product_sales s JOIN club_pix_orders o ON o.id=s.order_id WHERE s.order_id=? AND ${paidSQL}`).bind(orderId).first();
 if(!s)return {state:'not_eligible'};
 if(s.state==='confirmed')return {state:s.state,idSale:s.evo_sale_id};
 const save=async(state,error=null)=>{
  await db.prepare('UPDATE club_evo_product_sales SET state=?,last_error=?,checks=checks+1,checked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE order_id=?').bind(state,error,orderId).run();
  return {state,idSale:s.evo_sale_id||null,error};
 };
 const read=async path=>{const r=await evo(path,'GET');if(!r.ok)throw Error('EVO_SALE_READ_HTTP_'+r.status);return r.json()};
 const lookup=async()=>{
  // No date filter: recovery must also work after midnight and on later days.
  const result=await read('/api/v1/sales/by-session-id?sessionId='+encodeURIComponent(s.session_id));
  // Live read-only validation returns {idVenda,idCliente,clienteContratos};
  // the published OpenAPI instead advertises an integer. Accept both confirmed contracts.
  const id=typeof result==='number'?result:result?.idVenda;
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<0)throw Error('EVO_SESSION_RESPONSE_INVALID');
  return id;
 };
 const stock=async()=>{
  const products=await read('/api/v1/product?idProduct='+s.product_id+'&take=1&skip=0&onlySellable=false');
  const p=Array.isArray(products)?products.find(p=>Number(p.idProduct)===s.product_id):null;
  if(!p||p.currentAmount===null||p.currentAmount===undefined||!Number.isFinite(Number(p.currentAmount)))throw Error('EVO_STOCK_UNAVAILABLE');
  return Number(p.currentAmount);
 };
 const remember=async id=>{
  s.evo_sale_id=id;
  await db.prepare("UPDATE club_evo_product_sales SET evo_sale_id=?,state='verify_pending',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(id,orderId).run();
 };
 try {
  if(s.evo_sale_id){
   // Never POST a sale for an order with a remote identifier, even if validation failed.
  }else if(s.state==='sending'||s.state==='uncertain'){
   if(s.sent_at&&Date.now()-Date.parse(s.sent_at+'Z')<60000)return {state:s.state};
   const id=await lookup();
   if(!id)return save('uncertain','EVO_SALE_RESULT_UNCERTAIN_NO_RESEND');
   await remember(id);
  }else{
   if(s.state==='rejected'&&!retry)return {state:s.state,error:s.last_error};
   if(!['waiting','rejected'].includes(s.state))return {state:s.state};
   if(s.state==='rejected'){
    const id=await lookup();
    if(id)await remember(id);
   }
   if(!s.evo_sale_id){
    const payload=salePayload(s),before=await stock();
    if(before<s.quantity)return save('waiting','EVO_PRODUCT_OUT_OF_STOCK');
    // Persist the claim BEFORE the remote POST. Never reclaim a sending lease.
    const claim=await db.prepare(`UPDATE club_evo_product_sales SET state='sending',attempts=attempts+1,request_json=?,stock_before=?,sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,provider_order_id=(SELECT provider_order_id FROM club_pix_orders WHERE id=?)
     WHERE order_id=? AND state=? AND evo_sale_id IS NULL AND EXISTS(SELECT 1 FROM club_pix_orders o WHERE o.id=? AND ${paidSQL})`)
     .bind(JSON.stringify(payload),before,orderId,orderId,s.state,orderId).run();
    if(claim.meta.changes!==1)return {state:'in_progress'};
    s.state='sending';s.stock_before=before;
    let r;
    try { r=await evo('/api/v2/sales','POST',payload); }
    catch {return save('uncertain','EVO_SALE_NETWORK_UNCERTAIN');}
    let result;try{result=await r.json()}catch{return save('uncertain','EVO_SALE_RESPONSE_INVALID');}
    await db.prepare('UPDATE club_evo_product_sales SET response_json=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?').bind(JSON.stringify(result).slice(0,12000),orderId).run();
    if(!r.ok){
     // Documented domain validation/auth errors can be retried explicitly. A
     // server error is ambiguous and is only reconciled by session, never resent.
     const rejected=[400,401,403,422].includes(r.status)&&Array.isArray(result?.errors);
     return save(rejected?'rejected':'uncertain','EVO_SALE_HTTP_'+r.status+': '+JSON.stringify(result?.errors||result).slice(0,1500));
    }
    // Swagger's POST response schema omits the sale ID. Resolve through the
    // validated by-session-id response instead of guessing POST response fields.
    const id=await lookup();
    if(!id)return save('uncertain','EVO_SALE_ID_PENDING');
    await remember(id);
   }
  }
  const sale=await read('/api/v2/sales/'+s.evo_sale_id);
  const verification=saleVerification(s,sale);
  const after=await stock();
  verification.stockDecreased=s.stock_before!==null&&after<=Number(s.stock_before)-s.quantity;
  await db.prepare('UPDATE club_evo_product_sales SET stock_after=?,verification_json=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=?').bind(after,JSON.stringify(verification),orderId).run();
  if(verification.saleMatches){
   await db.prepare("UPDATE evo_product_catalog SET stock_quantity=?,last_synced_at=CURRENT_TIMESTAMP WHERE tenant_key='default' AND unit=? AND evo_product_id=?").bind(after,s.unit,String(s.product_id)).run();
  }
  return save(verification.saleMatches&&verification.paymentReceived&&verification.stockDecreased?'confirmed':'verify_pending',
   verification.saleMatches&&verification.paymentReceived&&verification.stockDecreased?null:'EVO_SALE_VERIFICATION_PENDING');
 }catch(e){return save(s.evo_sale_id?'verify_pending':s.state==='sending'?'uncertain':s.state,String(e.message).slice(0,1600));}
}
