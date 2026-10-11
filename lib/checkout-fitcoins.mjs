// Adapter for the existing EVO Fitcoins PUT debit/credit and reception workflow.
// An ambiguous remote result is never retried automatically.
const fail=message=>Object.assign(Error(message),{checkoutError:true,status:409});
const getBalance=async(evo,id)=>{const r=await evo('/api/v1/members/'+encodeURIComponent(id),'GET'),d=await r.json(),v=(Array.isArray(d)?d[0]:d)?.totalFitCoins??(Array.isArray(d)?d[0]:d)?.totalFitcoins;if(!r.ok||v==null||!Number.isSafeInteger(Number(v))||Number(v)<0)throw fail('SALDO_FITCOINS_NAO_CONFIRMADO');return Number(v)};
const movement=async(evo,order,refund)=>{const query=new URLSearchParams({idMember:order.external_member_id,type:refund?'1':'2',fitcoin:String(order.currency_quantity),reason:('Club Pop - '+(refund?'Estorno':'Resgate')+' - '+order.id).slice(0,120)});const r=await evo('/api/v1/members/fitcoins?'+query,'PUT');if(!r.ok)throw fail('MOVIMENTACAO_FITCOINS_REQUER_CONFERENCIA');};
const tx=(o,refund,before,after)=>({id:(refund?'tx-refund-':'tx-')+'checkout:'+o.id,reference:o.id,memberId:o.external_member_id,memberName:o.member_name||'',origin:refund?'refund':'store',description:o.item_name,paymentMethod:o.amount_cents?'FITCOINS_PIX':'FITCOINS',direction:refund?'credit':'debit',unit:o.unit,fitcoins:o.currency_quantity,cashAmount:o.amount_cents/100,cashStatus:refund&&o.amount_cents?'REFUND_PENDING':o.amount_cents?'PAID':'NONE',balanceBefore:before,balanceAfter:after,status:'COMPLETED',redemptionId:'checkout:'+o.id,createdAt:new Date().toISOString(),evoVerified:true});
function appendTx(db,t){return db.prepare("UPDATE app_content SET content_json=json_insert(json_set(content_json,'$.transactions',json(COALESCE(json_extract(content_json,'$.transactions'),'[]'))),'$.transactions[#]',json(?)),updated_at=CURRENT_TIMESTAMP WHERE content_key='club-pop' AND NOT EXISTS(SELECT 1 FROM json_each(content_json,'$.transactions') j WHERE json_extract(j.value,'$.id')=?)").bind(JSON.stringify(t),t.id)}
async function complete(db,o){await db.batch([db.prepare("UPDATE club_pix_orders SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('approved','refunded') AND external_state='confirmed'").bind(o.id),db.prepare("INSERT OR IGNORE INTO club_pix_fulfillment(order_id,member_id,unit,delivery_state) VALUES(?,?,?,'ready')").bind(o.id,o.member_id,o.unit),appendTx(db,tx(o,false,o.external_before,o.external_after))]);}
export async function settleFitcoins(db,order,evo){
 let o=await db.prepare("SELECT o.*,trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')) member_name FROM club_pix_orders o JOIN members m ON m.id=o.member_id WHERE o.id=?").bind(order.id).first();
 if(o.status==='refunded')return {status:'refunded'};
 if(o.external_state==='confirmed'){await complete(db,o);return {status:'approved',deliveryQueued:true};}
 if(o.reservation_state!=='held'||!['creating','paid_pending_coins'].includes(o.status))throw fail('PEDIDO_NAO_DISPONIVEL');
 let claim;try{claim=await db.prepare("UPDATE club_pix_orders SET external_state='running',choice_expires_at=NULL WHERE id=? AND external_state IN ('none','failed') AND reservation_state='held' AND status IN ('creating','paid_pending_coins')").bind(o.id).run()}catch{throw fail('MOVIMENTACAO_FITCOINS_EM_PROCESSAMENTO')}
 if(claim.meta.changes!==1)throw fail('MOVIMENTACAO_FITCOINS_REQUER_CONFERENCIA');
 let sent=false;
 try{
  const before=await getBalance(evo,o.external_member_id);if(before<o.currency_quantity)throw fail('SALDO_INSUFICIENTE');
  await db.prepare('UPDATE club_pix_orders SET external_before=? WHERE id=?').bind(before,o.id).run();
  sent=true;await movement(evo,o,false);let after=null;for(let i=0;i<3;i++){after=await getBalance(evo,o.external_member_id);if(after===before-o.currency_quantity)break;}
  if(after!==before-o.currency_quantity)throw fail('DEBITO_FITCOINS_REQUER_CONFERENCIA');
  await db.batch([db.prepare("UPDATE club_pix_orders SET external_state='confirmed',external_after=? WHERE id=? AND external_state='running'").bind(after,o.id),db.prepare('UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1').bind(after,o.unit,o.external_member_id)]);
  o={...o,external_state:'confirmed',external_before:before,external_after:after};
 }catch(e){await db.prepare("UPDATE club_pix_orders SET external_state=? WHERE id=? AND external_state='running'").bind(sent?'review':'failed',o.id).run();throw e;}
 await complete(db,o);return {status:'approved',deliveryQueued:true};
}
export function receptionRecord(o){return {id:'checkout:'+o.id,receipt:o.id,sourceType:o.item_type,sourceId:o.item_id,title:o.item_name,memberId:o.external_member_id,memberName:o.member_name,unit:o.unit,fitcoins:o.currency_quantity,balanceBefore:o.external_before,balanceAfter:o.external_after,cashComplement:o.amount_cents/100,cashRefundPending:o.status==='refunded'&&o.amount_cents>0,paymentMethod:o.amount_cents?'FITCOINS_PIX':'FITCOINS',paymentStatus:o.status==='refunded'?'ESTORNADO':'PAGO',origin:'store',status:o.status==='refunded'?'ESTORNADO':o.delivery_state==='completed'?'CONCLUIDO':o.status==='approved'?(o.item_type==='service'?'AGUARDANDO_UTILIZACAO':'AGUARDANDO_ENTREGA'):'EM_CONFERENCIA',createdAt:o.created_at,checkout:true};}
export async function receptionAction(db,o,action,evo){
 if(action==='confirm'){
  const r=await db.prepare("UPDATE club_pix_fulfillment SET delivery_state='completed',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state='ready' AND EXISTS(SELECT 1 FROM club_pix_orders WHERE id=? AND status='approved' AND external_state='confirmed')").bind(o.id,o.id).run();if(r.meta.changes!==1)throw fail('RESGATE_NAO_DISPONIVEL');return {ok:true};
 }
 if(action!=='refund')throw fail('ACAO_INVALIDA');
 if(o.status==='refunded')return {ok:true,duplicate:true,cashRefundPending:o.amount_cents>0};
 // The update and delivery guard serialize refund against reception confirmation.
 let claim;try{claim=await db.prepare("UPDATE club_pix_orders SET external_state='refunding' WHERE id=? AND external_state='confirmed' AND NOT EXISTS(SELECT 1 FROM club_pix_fulfillment WHERE order_id=? AND delivery_state='completed')").bind(o.id,o.id).run()}catch{throw fail('MOVIMENTACAO_FITCOINS_EM_PROCESSAMENTO')}
 if(claim.meta.changes!==1)throw fail('ESTORNO_BLOQUEADO');let sent=false;
 try{
  const before=await getBalance(evo,o.external_member_id);sent=true;await movement(evo,o,true);let after=null;for(let i=0;i<3;i++){after=await getBalance(evo,o.external_member_id);if(after===before+o.currency_quantity)break;}
  if(after!==before+o.currency_quantity)throw fail('ESTORNO_FITCOINS_REQUER_CONFERENCIA');
  const wasApproved=o.status==='approved';
  await db.batch([db.prepare("UPDATE club_pix_orders SET status='refunded',external_state='refunded',reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state='refunding'").bind(o.id),db.prepare('UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1').bind(after,o.unit,o.external_member_id),db.prepare("UPDATE club_pix_fulfillment SET delivery_state='blocked',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(o.id),db.prepare("UPDATE redemptions SET status='REFUNDED' WHERE dedupe_key=?").bind('pix:'+o.id),appendTx(db,tx(o,true,before,after)),...(wasApproved&&o.item_type==='product'?[db.prepare("UPDATE app_content SET content_json=json_set(content_json,(SELECT '$.products['||j.key||'].stock' FROM json_each(content_json,'$.products') j WHERE CAST(json_extract(j.value,'$.id') AS TEXT)=? AND COALESCE(json_extract(j.value,'$.unit'),'bike')=?),(SELECT CAST(json_extract(j.value,'$.stock') AS INTEGER)+1 FROM json_each(content_json,'$.products') j WHERE CAST(json_extract(j.value,'$.id') AS TEXT)=? AND COALESCE(json_extract(j.value,'$.unit'),'bike')=?)) WHERE content_key='club-pop'").bind(o.item_id,o.unit,o.item_id,o.unit)]:[])]);
  return {ok:true,balance:after,cashRefundPending:o.amount_cents>0};
 }catch(e){await db.prepare("UPDATE club_pix_orders SET external_state=? WHERE id=? AND external_state='refunding'").bind(sent?'review':'confirmed',o.id).run();throw e;}
}
