// Adapter for the existing EVO Fitcoins PUT debit/credit and reception workflow.
// An ambiguous remote result is never retried automatically.
const fail=message=>Object.assign(Error(message),{checkoutError:true,status:409});
const balanceValue=d=>{const x=Array.isArray(d)?d[0]:d;const values=[x?.totalFitCoins,x?.totalFitcoins,x?.fitcoins,x?.fitCoins,x?.balance,x?.saldo,x?.data?.totalFitCoins,x?.data?.totalFitcoins,x?.data?.fitcoins,x?.result?.totalFitCoins,x?.result?.totalFitcoins];for(const v of values){if(v!==null&&v!==undefined&&v!==''&&Number.isSafeInteger(Number(v))&&Number(v)>=0)return Number(v)}return null};
export const getBalance=async(evo,id)=>{const r=await evo('/api/v1/members/fitcoins?idMember='+encodeURIComponent(id),'GET');let d=null;try{d=await r.json()}catch{}let v=r.ok?balanceValue(d):null;if(v===null){const profile=await evo('/api/v1/members/'+encodeURIComponent(id),'GET');let p=null;try{p=await profile.json()}catch{}if(profile.ok)v=balanceValue(p)}if(v===null)throw fail('SALDO_FITCOINS_NAO_CONFIRMADO');return v};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function verifiedDebitBalance(evo,o,before){const expected=before-Number(o.currency_quantity);let after=null;for(let i=0;i<7;i++){if(i)await wait(Math.min(300*i,1400));try{after=await getBalance(evo,o.external_member_id)}catch{}if(after===expected)return after;}throw Object.assign(fail('DEBITO_FITCOINS_REQUER_CONFERENCIA'),{expectedBalance:expected,observedBalance:after})};
const movement=async(evo,order,refund)=>{const query=new URLSearchParams({idMember:order.external_member_id,type:refund?'1':'2',fitcoin:String(order.currency_quantity),reason:('Club Pop - '+(refund?'Estorno':'Resgate')+' - '+order.id).slice(0,120)});const r=await evo('/api/v1/members/fitcoins?'+query,'PUT');if(!r.ok)throw fail('MOVIMENTACAO_FITCOINS_REQUER_CONFERENCIA');
 // Both refund and debit use the same HTTP acknowledgement validation.
 const raw=await r.text();let result;try{result=JSON.parse(raw)}catch{result=raw}
 if(result===false||result?.success===false||result?.ok===false||result?.result===false||result?.error||/^(false|error|erro|failed)$/i.test(String(result?.result??result).trim()))throw fail('MOVIMENTACAO_FITCOINS_REQUER_CONFERENCIA');
 if(r.status!==200)throw fail('MOVIMENTACAO_FITCOINS_REQUER_CONFERENCIA');
 return {httpStatus:r.status,response:raw.slice(0,2000)};
};
const tx=(o,refund,before,after)=>({id:(refund?'tx-refund-':'tx-')+'checkout:'+o.id,reference:o.id,memberId:o.external_member_id,memberName:o.member_name||'',origin:refund?'refund':'store',description:o.item_name,paymentMethod:o.amount_cents?'FITCOINS_PIX':'FITCOINS',direction:refund?'credit':'debit',unit:o.unit,fitcoins:o.currency_quantity,cashAmount:o.amount_cents/100,cashStatus:refund&&o.amount_cents?'REFUND_PENDING':o.amount_cents?'PAID':'NONE',balanceBefore:before,balanceAfter:after,status:'COMPLETED',redemptionId:'checkout:'+o.id,createdAt:new Date().toISOString(),evoVerified:true});
function appendTx(db,t){return db.prepare("UPDATE app_content SET content_json=json_insert(json_set(content_json,'$.transactions',json(COALESCE(json_extract(content_json,'$.transactions'),'[]'))),'$.transactions[#]',json(?)),updated_at=CURRENT_TIMESTAMP WHERE content_key='club-pop' AND NOT EXISTS(SELECT 1 FROM json_each(content_json,'$.transactions') j WHERE json_extract(j.value,'$.id')=?)").bind(JSON.stringify(t),t.id)}
async function complete(db,o){await db.batch([db.prepare("UPDATE club_pix_orders SET status='approved',reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('approved','refunded') AND external_state='confirmed'").bind(o.id),db.prepare("INSERT OR IGNORE INTO club_pix_fulfillment(order_id,member_id,unit,delivery_state) VALUES(?,?,?,'ready')").bind(o.id,o.member_id,o.unit),appendTx(db,tx(o,false,o.external_before,o.external_after))]);}
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
  // EVO documents HTTP 200 as the completed mutation. A later balance read
  // must not invalidate that acknowledgement or trigger another debit.
  sent=true;const receipt=await movement(evo,o,false),after=before-Number(o.currency_quantity);
  await db.batch([db.prepare("INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json) VALUES('SYSTEM','checkout','FITCOINS_DEBIT_ACKNOWLEDGED','club_pix_orders',?,?)").bind(o.id,JSON.stringify({...receipt,balanceSource:'calculated_after_acknowledged_debit',before,after})),db.prepare("UPDATE club_pix_orders SET external_state='confirmed',external_after=? WHERE id=? AND external_state='running'").bind(after,o.id),db.prepare('UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1').bind(after,o.unit,o.external_member_id)]);
  o={...o,external_state:'confirmed',external_before:before,external_after:after};
 }catch(e){try{await db.prepare("INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json) VALUES('SYSTEM','checkout','FITCOINS_CONFIRMATION_PENDING','club_pix_orders',?,?)").bind(o.id,JSON.stringify({error:e.message,writeAttempted:sent,expectedBalance:e.expectedBalance??null,observedBalance:e.observedBalance??null})).run()}catch{}await db.prepare("UPDATE club_pix_orders SET external_state=? WHERE id=? AND external_state='running'").bind(sent?'review':'failed',o.id).run();throw e;}
 await complete(db,o);return {status:'approved',deliveryQueued:true};
}
export function receptionRecord(o){return {id:'checkout:'+o.id,receipt:o.id,sourceType:o.item_type,sourceId:o.item_id,title:o.item_name,memberId:o.external_member_id,memberName:o.member_name,unit:o.unit,fitcoins:o.currency_quantity,balanceBefore:o.external_before,balanceAfter:o.external_after,cashComplement:o.amount_cents/100,cashRefundPending:o.status==='refunded'&&o.amount_cents>0,paymentMethod:o.amount_cents?'FITCOINS_PIX':'FITCOINS',paymentStatus:o.external_state==='refunded'?'ESTORNADO':o.external_state==='alternate_paid'?'PAGO_OUTRA_FORMA':'PAGO',origin:'store',status:o.status==='refunded'?'ESTORNADO':o.delivery_state==='completed'?'CONCLUIDO':o.status==='approved'?(o.item_type==='service'?'AGUARDANDO_UTILIZACAO':'AGUARDANDO_ENTREGA'):'EM_CONFERENCIA',createdAt:o.created_at,checkout:true};}
export async function receptionAction(db,o,action,evo,details={}){
 const note=String(details.reason||'').trim(),actor=String(details.actor||'recepcao').slice(0,120);
 const audit=(name,meta)=>db.prepare("INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json) VALUES('staff',?,?,'club_pix_orders',?,?)").bind(actor,name,o.id,JSON.stringify(meta));
 if(action==='alternate_payment'){
  const method=String(details.paymentMethod||'').trim(),amount=Number(details.amount);
  if(o.status!=='approved'||o.external_state!=='refunded'||!method||method.length>120||!Number.isFinite(amount)||amount<=0)throw fail('PAGAMENTO_ALTERNATIVO_INVALIDO');
  const result=await db.prepare("UPDATE club_pix_orders SET external_state='alternate_paid',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved' AND external_state='refunded'").bind(o.id).run();
  if(result.meta.changes!==1)throw fail('PAGAMENTO_JA_REGISTRADO');
  await db.prepare("UPDATE club_pix_fulfillment SET delivery_state='ready',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state='blocked'").bind(o.id).run();
  await audit('CHECKOUT_PAGAMENTO_ALTERNATIVO',{method,amount,notes:String(details.notes||'').slice(0,500)}).run();
  return {ok:true,status:'alternate_paid'};
 }
 if(action==='refund_confirmed'){
  if(o.status!=='approved'||o.external_state!=='review'||String(details.evidence||'').trim().length<3)throw fail('CONFERENCIA_MANUAL_INVALIDA');
  return finalizeLocalRefund(db,o,audit);
 }
 if(action==='cancel_sale'){
  if(note.length<8)throw fail('JUSTIFICATIVA_OBRIGATORIA');
  const delivery=await db.prepare("SELECT delivery_state FROM club_pix_fulfillment WHERE order_id=?").bind(o.id).first();
  if(delivery?.delivery_state==='completed')throw fail('CANCELE_A_ENTREGA_ANTES');
  if(delivery?.delivery_state==='cancelled')return {ok:true,status:'cancelled',duplicate:true};
  if(['refunded','refund_pending'].includes(o.status))throw fail('VENDA_JA_ESTORNADA');
  if(['running','refunding'].includes(o.external_state))throw fail('CONFIRA_DEBITO_FITCOINS_ANTES_DE_CANCELAR');
  if(o.status==='approved'||o.status==='paid_pending_coins'){
    const change=await db.prepare("UPDATE club_pix_fulfillment SET delivery_state='cancelled',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state IN ('ready','blocked')").bind(o.id).run();
    if(change.meta.changes!==1)throw fail('CANCELAMENTO_NAO_DISPONIVEL');
    await db.prepare("UPDATE vouchers SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP WHERE member_id=? AND source_type='SHOP' AND source_id=? AND status NOT IN ('CANCELLED','REDEEMED')").bind(o.member_id,o.id).run();await audit('CHECKOUT_VENDA_CANCELADA',{reason:note,pixRefundRequired:Number(o.amount_cents)>0,coinsRefundRequired:o.external_state==='confirmed'}).run();
    return {ok:true,status:'cancelled',pixRefundRequired:Number(o.amount_cents)>0,coinsRefundRequired:o.external_state==='confirmed'};
  }
  if(!['selected','created','superseded','expired','pending','creating'].includes(o.status)||o.external_state!=='none'||o.provider_order_id)throw fail('CANCELAMENTO_REQUER_CONFERENCIA');
  const change=await db.prepare("UPDATE club_pix_orders SET status='cancelled',reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state='none' AND provider_order_id IS NULL AND status IN ('selected','created','superseded','expired','pending','creating')").bind(o.id).run();
  if(change.meta.changes!==1)throw fail('CANCELAMENTO_NAO_DISPONIVEL');
  await audit('CHECKOUT_VENDA_CANCELADA_SEM_COBRANCA',{reason:note}).run();return {ok:true,status:'cancelled',noCharge:true};
 }
 if(action==='undo_delivery'){
  if(o.status!=='approved'||note.length<8||details.returned!==true)throw fail('CONFIRME_DEVOLUCAO_E_JUSTIFICATIVA');
  const changed=await db.prepare("UPDATE club_pix_fulfillment SET delivery_state='ready',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state='completed' AND EXISTS(SELECT 1 FROM club_pix_orders WHERE id=? AND status='approved')").bind(o.id,o.id).run();
  if(changed.meta.changes!==1)throw fail('ENTREGA_NAO_REVERSIVEL');
  await audit('CHECKOUT_ENTREGA_CANCELADA',{reason:note,returned:true}).run();return {ok:true,status:'ready'};
 }
 if(action==='coins_check'){
  if(!['review','failed'].includes(o.external_state)||!['creating','paid_pending_coins'].includes(o.status)||!o.external_member_id||Number(o.currency_quantity)<1)throw fail('CONFERENCIA_NAO_DISPONIVEL');
  if(o.external_before===null||o.external_before===undefined)throw fail('SEM_SALDO_ANTERIOR_PARA_CONFERIR');
  const current=await getBalance(evo,o.external_member_id),expected=Number(o.external_before)-Number(o.currency_quantity);
  if(current!==expected)return {ok:true,status:'review',balance:current,expected,needsManualReview:true};
  const claim=await db.prepare("UPDATE club_pix_orders SET external_state='confirmed',external_after=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state IN ('review','failed') AND reservation_state='held' AND status IN ('creating','paid_pending_coins')").bind(current,o.id).run();
  if(claim.meta.changes!==1)throw fail('PEDIDO_JA_PROCESSADO');
  await db.prepare("UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1").bind(current,o.unit,o.external_member_id).run();
  await complete(db,{...o,external_state:'confirmed',external_after:current});
  await audit('CHECKOUT_FITCOINS_CONCILIADO',{balance:current,expected}).run();
  return {ok:true,status:'approved',balance:current};
 }
 if(action==='coins_confirmed'||action==='coins_retry'){
  if(!['review','failed'].includes(o.external_state)||!['creating','paid_pending_coins'].includes(o.status)||o.reservation_state!=='held'||!o.external_member_id||Number(o.currency_quantity)<1||note.length<8||details.checkedEvo!==true)throw fail('CONFERENCIA_MANUAL_INVALIDA');
  if(action==='coins_confirmed'){
   if(!String(details.evidence||'').trim())throw fail('INFORME_COMPROVANTE_EVO');
   // Staff has already checked the external debit. This action only reconciles D1.
   const before=Number(o.external_before),quantity=Number(o.currency_quantity),current=before-quantity;
   if(o.external_before==null||!Number.isSafeInteger(before)||!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(current)||current<0)throw fail('SEM_SALDO_ANTERIOR_VALIDO_PARA_CONFIRMAR');
   const claim=await db.prepare("UPDATE club_pix_orders SET external_state='confirmed',external_after=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state IN ('review','failed') AND reservation_state='held' AND status IN ('creating','paid_pending_coins')").bind(current,o.id).run();
   if(claim.meta.changes!==1)throw fail('PEDIDO_JA_PROCESSADO');
   await db.prepare("UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1").bind(current,o.unit,o.external_member_id).run();
   await complete(db,{...o,external_state:'confirmed',external_after:current});
   await audit('CHECKOUT_FITCOINS_CONFIRMADO_MANUALMENTE',{reason:note,evidence:String(details.evidence).slice(0,300),balance:current,balanceSource:'staff_confirmed_debit',before,quantity}).run();
   return {ok:true,status:'approved',balance:current};
  }
  if(details.noDebitVerified!==true)throw fail('CONFIRME_AUSENCIA_DE_DEBITO_EVO');
  const claim=await db.prepare("UPDATE club_pix_orders SET external_state='failed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state IN ('review','failed') AND reservation_state='held' AND status IN ('creating','paid_pending_coins')").bind(o.id).run();
  if(claim.meta.changes!==1)throw fail('PEDIDO_JA_PROCESSADO');
  await audit('CHECKOUT_FITCOINS_NOVA_TENTATIVA',{reason:note,verifiedNoDebit:true}).run();
  return {ok:true,...await settleFitcoins(db,o,evo)};
 }

 if(action==='confirm'){
  const r=await db.prepare("UPDATE club_pix_fulfillment SET delivery_state='completed',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state='ready' AND EXISTS(SELECT 1 FROM club_pix_orders WHERE id=? AND status='approved' AND external_state='confirmed')").bind(o.id,o.id).run();if(r.meta.changes!==1)throw fail('RESGATE_NAO_DISPONIVEL');return {ok:true};
 }
 if(action!=='refund')throw fail('ACAO_INVALIDA');
 if(o.status!=='approved'||Number(o.currency_quantity)<1)throw fail('ESTORNO_NAO_DISPONIVEL');
 if(o.external_state==='refunded')return {ok:true,duplicate:true};
 if(o.external_state==='review')throw fail('ESTORNO_EVO_EM_CONFERENCIA_USE_CONFIRMACAO_MANUAL');
 const claim=await db.prepare("UPDATE club_pix_orders SET external_state='refunding' WHERE id=? AND external_state='confirmed' AND status='approved' AND NOT EXISTS(SELECT 1 FROM club_pix_fulfillment WHERE order_id=? AND delivery_state='completed')").bind(o.id,o.id).run();
 if(claim.meta.changes!==1)throw fail('ESTORNO_BLOQUEADO');
 let sent=false;
 try{sent=true;await movement(evo,o,true);return await finalizeLocalRefund(db,o,audit);}
 catch(e){await db.prepare("UPDATE club_pix_orders SET external_state=? WHERE id=? AND external_state='refunding'").bind(sent?'review':'confirmed',o.id).run();throw e;}
}
async function finalizeLocalRefund(db,o,audit){
 const row=await db.prepare("SELECT fitcoins FROM evo_students WHERE unit=? AND evo_member_id=? AND is_current=1").bind(o.unit,o.external_member_id).first();
 if(!row||!Number.isSafeInteger(Number(row.fitcoins)))throw fail('SALDO_LOCAL_NAO_ENCONTRADO');
 const before=Number(row.fitcoins),after=before+Number(o.currency_quantity);
 const claim=await db.prepare("UPDATE club_pix_orders SET external_state='refunded',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved' AND external_state IN ('refunding','review')").bind(o.id).run();
 if(claim.meta.changes!==1)throw fail('ESTORNO_JA_PROCESSADO');
 await db.batch([db.prepare("UPDATE evo_students SET fitcoins=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=? AND is_current=1").bind(after,o.unit,o.external_member_id),db.prepare("UPDATE club_pix_fulfillment SET delivery_state='blocked',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state!='cancelled'").bind(o.id),appendTx(db,tx(o,true,before,after))]);
 await audit('CHECKOUT_FITCOINS_ESTORNADOS',{before,after,quantity:o.currency_quantity}).run();
 return {ok:true,status:'refunded',balance:after};
}
