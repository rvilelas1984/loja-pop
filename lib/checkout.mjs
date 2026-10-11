// Shared product/service quotes use D1 only; confirmation handles external debit.
const err=(message,status=409)=>Object.assign(Error(message),{checkoutError:true,status});
export const checkoutError=e=>e.checkoutError?e:/SALDO_|ESTOQUE_|MOEDA_EXTERNA_|RESERVA_|CARTEIRA_/.test(String(e.message))?err(String(e.message).match(/(?:SALDO|ESTOQUE|MOEDA_EXTERNA|RESERVA|CARTEIRA)_[A-Z_]+/)?.[0]||'CHECKOUT_INDISPONIVEL'):null;
const validKey=k=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k||'');
export function amounts(price,rate,percent,quantity){
 const originalCents=Math.round(Number(price)*100),rateMicros=Math.round(Number(rate)*10000),cap=Math.floor(originalCents*percent/100);
 if(!Number.isSafeInteger(originalCents)||originalCents<=0||!Number.isSafeInteger(rateMicros)||rateMicros<=0||!Number.isInteger(percent)||percent<1||percent>100||!Number.isSafeInteger(quantity)||quantity<0)throw err('CONFIGURACAO_INVALIDA');
 const maxCoins=percent===100?Math.ceil(originalCents*100/rateMicros):Math.floor(cap*100/rateMicros);
 if(quantity>maxCoins)throw err('LIMITE_DESCONTO_EXCEDIDO');
 const discountCents=Math.min(originalCents,Math.floor(quantity*rateMicros/100));
 return {originalCents,discountCents,pixCents:originalCents-discountCents,maxCoins,rateMicros};
}
async function itemFor(db,member,b){
 const unit=String(b.unit||''),type=String(b.itemType||''),id=String(b.itemId||'');
 if(!['bike','gym'].includes(unit)||!['product','service'].includes(type)||!id||id.length>128)throw err('PARAMETROS_INVALIDOS',400);
 if(!(unit==='gym'?member.gym_client_id:member.evo_member_id))throw err('ALUNO_NAO_VINCULADO_A_UNIDADE',403);
 const row=await db.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first(),content=JSON.parse(row?.content_json||'{}'),item=(content[type==='product'?'products':'services']||[]).find(x=>String(x.id)===id&&String(x.unit||'bike')===unit&&x.status==='Ativo');
 if(!item)throw err('ITEM_INDISPONIVEL',404);if(type==='product'&&Number(item.stock||0)<1)throw err('SEM_ESTOQUE');
 const price=Math.round(Number(item.price)*100);if(!Number.isSafeInteger(price)||price<=0)throw err('PRECO_INVALIDO');return {unit,type,id,item,price};
}
async function coinFor(db,member,context,excludeOrder=''){
 const {unit,item,price}=context,cfg=item.currencyPayment;
 if(!cfg?.enabled||!['mixed','both','fitcoins'].includes(String(item.paymentMethod||'')))return null;
 const c=await db.prepare("SELECT c.* FROM club_currencies c JOIN club_currency_units u ON u.currency_id=c.id WHERE c.code=? AND c.status='active' AND u.unit=? AND u.enabled=1").bind(String(cfg.currency||''),unit).first();if(!c)return null;
 const calc=amounts(price/100,c.brl_value,Number(cfg.maxDiscountPercent),0);let balance=null,updatedAt=null;
 if(c.source==='external'){const id=unit==='gym'?member.gym_client_id:member.evo_member_id,row=await db.prepare('SELECT fitcoins,updated_at FROM evo_students WHERE unit=? AND evo_member_id=? AND is_current=1').bind(unit,String(id)).first();if(row?.fitcoins!==null&&row?.fitcoins!==undefined&&Number.isFinite(Number(row.fitcoins)))balance=Math.max(0,Math.floor(Number(row.fitcoins)));updatedAt=row?.updated_at||null;const held=Number((await db.prepare("SELECT COALESCE(SUM(currency_quantity),0) n FROM club_pix_orders WHERE unit=? AND external_member_id=? AND reservation_state='held' AND id<>? AND external_state NOT IN ('confirmed','refunded') AND (external_state IN ('review','running') OR (choice_expires_at IS NOT NULL AND datetime(choice_expires_at)>datetime('now')))").bind(unit,String(id),excludeOrder).first())?.n||0);if(balance!==null)balance=Math.max(0,balance-held);}
 else{balance=Number((await db.prepare('SELECT balance FROM club_currency_wallets WHERE member_id=? AND unit=? AND currency_id=?').bind(member.id,unit,c.id).first())?.balance||0);const held=Number((await db.prepare("SELECT COALESCE(SUM(currency_quantity),0) n FROM club_pix_orders WHERE member_id=? AND unit=? AND currency_id=? AND reservation_state='held' AND id<>? AND (choice_expires_at IS NULL OR datetime(choice_expires_at)>datetime('now'))").bind(member.id,unit,c.id,excludeOrder).first())?.n||0);balance=Math.max(0,balance-held);}
 return {currency_id:c.id,currency_code:c.code,currency_name:c.name,source:c.source,brl_value:c.brl_value,balance,balanceUpdatedAt:updatedAt,maxCoins:Math.min(calc.maxCoins,balance||0),max_discount_percent:Number(cfg.maxDiscountPercent),canDebit:c.source==='local'||c.code==='fitcoins',reason:c.source==='external'&&c.code!=='fitcoins'?'MOEDA_EXTERNA_DEBITO_INDISPONIVEL':null};
}
export async function options(db,member,b){const ctx=await itemFor(db,member,b),coin=await coinFor(db,member,ctx);return {ok:true,offers:coin?[coin]:[],originalCents:ctx.price,paymentMethod:ctx.item.paymentMethod,evoRequestsMade:0};}
export async function quote(db,member,b){
 const ctx=await itemFor(db,member,b),{item,price}=ctx,quantity=Number(b.quantity||0),mode=String(b.mode|| (quantity>0?'mixed':'pix'));
 if(!Number.isSafeInteger(quantity)||quantity<0||!['pix','mixed','coins'].includes(mode))throw err('QUANTIDADE_INVALIDA',400);
 const method=String(item.paymentMethod||'fitcoins');
 if(mode==='pix'&&!['pix','both','mixed'].includes(method)||mode==='mixed'&&method!=='mixed'||mode==='coins'&&!['fitcoins','both','mixed'].includes(method))throw err('FORMA_PAGAMENTO_NAO_AUTORIZADA');
 if(mode==='pix'&&quantity!==0||mode!=='pix'&&quantity<1)throw err('QUANTIDADE_INVALIDA',400);
 const c=mode==='pix'?null:await coinFor(db,member,ctx,String(b.previousChoice||(b.save===true?b.key:'')||''));
 if(mode!=='pix'&&(!c||String(c.currency_id)!==String(b.currencyId)))throw err('MOEDA_INDISPONIVEL');
 if(c&&(c.balance===null||quantity>c.balance))throw err(c.balance===null?'SALDO_NAO_INFORMADO':'SALDO_INSUFICIENTE');
 const calculated=c?amounts(price/100,c.brl_value,c.max_discount_percent,quantity):{originalCents:price,discountCents:0,pixCents:price,rateMicros:null};
 const effectiveMode=mode==='mixed'&&calculated.pixCents===0?'coins':mode;
 if(mode==='coins'&&calculated.pixCents!==0)throw err('PAGAMENTO_INTEGRAL_EXIGE_MAIS_MOEDAS');
 if(c&&calculated.discountCents<1)throw err('DESCONTO_INVALIDO');
 const result={ok:true,...calculated,quantity,currencyId:c?.currency_id||null,currencyName:c?.currency_name||null,canPay:!c||c.canDebit,reason:c?.reason||null,mode:effectiveMode,evoRequestsMade:0};
 if(b.save!==true)return result;
 const key=String(b.key||'');if(!validKey(key))throw err('CHAVE_INVALIDA',400);
 const old=await db.prepare('SELECT * FROM club_pix_orders WHERE idempotency_key=?').bind(key).first();
 if(old){if(old.member_id!==member.id||old.unit!==ctx.unit||old.item_type!==ctx.type||old.item_id!==ctx.id||old.currency_quantity!==quantity||old.payment_mode!==effectiveMode||old.currency_id!==result.currencyId)throw err('CHAVE_JA_UTILIZADA');if(old.original_cents!==result.originalCents||old.discount_cents!==result.discountCents||old.amount_cents!==result.pixCents||old.currency_rate_micros!==result.rateMicros)throw err('CONDICOES_ALTERADAS_SALVE_NOVAMENTE');return {...result,orderId:old.id,expiresAt:old.choice_expires_at,canPay:result.canPay&&old.status==='selected'&&Date.parse(old.choice_expires_at)>Date.now()};}
 const expires=new Date(Date.now()+10*60000).toISOString(),stm=[];
 if(b.previousChoice)stm.push(db.prepare("UPDATE club_pix_orders SET status='superseded',reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=? AND unit=? AND item_type=? AND item_id=? AND status='selected' AND provider_order_id IS NULL").bind(String(b.previousChoice),member.id,ctx.unit,ctx.type,ctx.id));
 stm.push(db.prepare("INSERT INTO club_pix_orders(id,member_id,unit,item_type,item_id,amount_cents,status,idempotency_key,original_cents,discount_cents,currency_id,currency_quantity,currency_rate_micros,payment_mode,item_name,reservation_state,choice_expires_at,external_member_id) VALUES(?,?,?,?,?,?,'selected',?,?,?,?,?,?,?,?,?,?,?)").bind(key,member.id,ctx.unit,ctx.type,ctx.id,result.pixCents,key,result.originalCents,result.discountCents,result.currencyId,quantity,result.rateMicros,effectiveMode,item.name,result.canPay?'held':'none',expires,c?.source==='external'?String(ctx.unit==='gym'?member.gym_client_id:member.evo_member_id):null));
 await db.batch(stm);return {...result,orderId:key,expiresAt:expires};
}
export async function validateChoice(db,member,order){
 if(order.original_cents===null||order.original_cents===undefined)return false;
 if(order.status!=='selected')throw err('PEDIDO_NAO_DISPONIVEL');
 if(order.reservation_state!=='held')throw err('MOEDA_EXTERNA_DEBITO_INDISPONIVEL');
 if(!order.choice_expires_at||Date.parse(order.choice_expires_at)<=Date.now())throw err('ESCOLHA_EXPIRADA_SALVE_NOVAMENTE');
 const current=await quote(db,member,{unit:order.unit,itemType:order.item_type,itemId:order.item_id,quantity:order.currency_quantity,currencyId:order.currency_id,mode:order.payment_mode,previousChoice:order.id});
 if(!current.canPay)throw err('MOEDA_EXTERNA_DEBITO_INDISPONIVEL');
 if(current.originalCents!==order.original_cents||current.discountCents!==order.discount_cents||current.pixCents!==order.amount_cents||current.rateMicros!==order.currency_rate_micros)throw err('CONDICOES_ALTERADAS_SALVE_NOVAMENTE');return true;
}

// Presentation only: expiry must never release a possibly debited order.
export function customerOrderStatus(o,now=Date.now()){
 if(o.status==='selected'&&o.external_state==='none'&&!o.provider_order_id&&o.choice_expires_at&&Date.parse(o.choice_expires_at)<=now)return 'expired';
 if(['creating','paid_pending_coins'].includes(o.status)&&['running','review'].includes(o.external_state))return 'coins_review';
 return o.status;
}
