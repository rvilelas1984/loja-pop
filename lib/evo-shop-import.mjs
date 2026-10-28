// Manual spreadsheet sales only. No payment, stock, wallet or EVO mutation.
export const headers = ['ID_FILIAL','NOME','CPF (CIN)','VALOR','SERVIÇO','PRODUTO','DATA_VENDA','TIPO_RECEBIMENTO','TID','NSU','AUTORIZAÇÃO'];
export const norm = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const parse = v => {try{return JSON.parse(v||'{}')}catch{return {}}};
export const cpfDigits = v => String(v??'').replace(/\D/g,'');
export function saleDate(v) {
 const s=String(v||'');
 if(!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s))return '';
 const d=new Date(s.replace(' ','T')+(/(?:Z|[+-]\d{2}:\d{2})$/.test(s)?'':'Z'));
 if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function receiptFor(o,settings) {return Number(settings.receipts?.[o.paymentMode]||settings.receipts?.pix||15)}
export function pendingReasons(o,settings={}) {
 const reasons=[];
 if(o.isTest)reasons.push('Pedido de teste');
 if(o.status!=='approved')reasons.push('Compra não aprovada: '+o.status);
 if(o.fiscalRegisteredAt||o.autoSaleState==='confirmed'||o.autoSaleId)reasons.push('Venda já registrada');
 if(o.importStatus==='confirmed')reasons.push('Confirmada na EVO');
 if(['exported','review'].includes(o.importStatus))reasons.push('Aguardando conferência do lote anterior');
 if(!o.memberName?.trim())reasons.push('Nome do aluno ausente no cadastro');
 if(!/^\d{11}$/.test(o.cpf||''))reasons.push('CPF incompleto no cadastro EVO');
 if(!o.officialName)reasons.push('Vínculo com catálogo oficial EVO ausente');
 if(!o.saleDate)reasons.push('Data original inválida');
 if(![o.amountCents,o.originalCents,o.discountCents,o.currencyQuantity].every(n=>Number.isSafeInteger(n)&&n>=0)||o.originalCents!==o.amountCents+o.discountCents)reasons.push('Valores financeiros inconsistentes');
 if(o.amountCents===0)reasons.push('Valor zerado — não exportar');
 if(!['pix','coins','mixed'].includes(o.paymentMode)||o.paymentMode!==(o.currencyQuantity>0?(o.amountCents>0?'mixed':'coins'):'pix'))reasons.push('Forma de pagamento inconsistente');
 if(!/^\d{1,12}$/.test(settings.branchCode||''))reasons.push('Configure o ID da filial');
 if(!Number.isInteger(receiptFor(o,settings))||receiptFor(o,settings)<1||receiptFor(o,settings)>999)reasons.push('Configure o recebimento de '+({pix:'Pix',coins:'Fitcoins',mixed:'Misto'}[o.paymentMode]||'pagamento'));
 return reasons;
}
export function exportRow(o,settings) {return Object.fromEntries(headers.map((h,i)=>[h,[settings.branchCode,o.memberName,o.cpf,o.amountCents/100,o.itemType==='service'?o.officialName:'',o.itemType==='product'?o.officialName:'',o.saleDate,receiptFor(o,settings),'','',''][i]]))}
export function rowKey(r) {
 return JSON.stringify([String(r.ID_FILIAL).trim(),norm(r.NOME),cpfDigits(r['CPF (CIN)']).padStart(11,'0'),Math.round(Number(r.VALOR)*100),norm(r['SERVIÇO']),norm(r.PRODUTO),String(r.DATA_VENDA).trim(),Number(r.TIPO_RECEBIMENTO)]);
}
export function returnStatus(log) {
 const s=String(log||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/^venda\s+importada\s+com\s+sucesso[.!\s]*$/.test(s))return 'confirmed';
 if(/nao\s+importad|rejeitad|erro|falha|invalid|invalido|nao\s+encontrad/.test(s))return 'rejected';
 return 'review';
}
export function reconcile(snapshot,entries) {
 const groups=new Map(),input=new Map();
 for(const x of snapshot){const key=rowKey(x.row);groups.set(key,[...(groups.get(key)||[]),x])}
 for(const x of entries){const key=rowKey(x.row);input.set(key,[...(input.get(key)||[]),x])}
 const updates=[];let unmatched=0;
 for(const [key,group] of input){const originals=groups.get(key);if(!originals){unmatched+=group.length;continue}
 // Identical official rows cannot be disambiguated by position after EVO sorts a file.
 const outcomes=new Set(group.map(x=>returnStatus(x.log)));
 if(group.length!==originals.length||outcomes.size!==1){unmatched+=group.length;continue}
 const status=returnStatus(group[0].log),log=[...new Set(group.map(x=>String(x.log).slice(0,2000)))].join(' | ');
 for(const x of originals)updates.push({orderId:x.orderId,status,log});
 }
 return {updates,unmatched};
}
export async function loadSettings(db,unit) {
 const row=await db.prepare('SELECT branch_code,receipts_json FROM club_evo_import_settings WHERE unit=?').bind(unit).first();
 const fallback=row?null:await db.prepare('SELECT branch_code FROM aggregator_branch_defaults WHERE unit=?').bind(unit).first();
 return {branchCode:row?.branch_code||fallback?.branch_code||'',receipts:{pix:15,coins:15,mixed:15,...Object.fromEntries(Object.entries(parse(row?.receipts_json)).filter(([,v])=>v!==''&&v!=null))}};
}
export async function loadOrders(db,unit,{audit=false}={}) {
 const cutoffRow=await db.prepare('SELECT cutoff_at FROM club_evo_shop_cutoff WHERE id=1').first();
 const cutoff=String(cutoffRow?.cutoff_at||'');
 const sql=`SELECT o.*,m.first_name,m.last_name,e.personal_json,e.raw_json,
 f.delivery_state,fs.registered_at fiscal_registered_at,fs.registered_by fiscal_registered_by,
 s.product_id snapshot_product_id,s.state auto_sale_state,s.evo_sale_id,
 i.status import_status,i.return_log,i.batch_id,
 EXISTS(SELECT 1 FROM club_pix_provider_events p WHERE p.order_id=o.id AND p.provider_order_id=o.provider_order_id AND p.amount_cents=o.amount_cents AND p.provider_status IN ('processed','approved','paid')) pix_verified
 FROM club_pix_orders o LEFT JOIN members m ON m.id=o.member_id
 LEFT JOIN evo_member_master e ON e.unit=o.unit AND e.evo_member_id=COALESCE(NULLIF(o.external_member_id,''),CAST(CASE WHEN o.unit='gym' THEN m.gym_client_id ELSE m.evo_member_id END AS TEXT))
 LEFT JOIN club_pix_fulfillment f ON f.order_id=o.id LEFT JOIN club_fiscal_sale_entries fs ON fs.order_id=o.id
 LEFT JOIN club_evo_product_sales s ON s.order_id=o.id LEFT JOIN club_evo_import_items i ON i.order_id=o.id
 WHERE (?='club' OR o.unit=?) ORDER BY o.created_at DESC,o.id`;
 const rows=(await db.prepare(sql).bind(unit,unit).all()).results||[];
 if(audit){const archive=await db.prepare("SELECT 1 found FROM sqlite_master WHERE name='club_pix_orders_test_archive_20261011'").first();if(archive){const old=(await db.prepare("SELECT * FROM club_pix_orders_test_archive_20261011 WHERE (?='club' OR unit=?) AND id NOT IN (SELECT id FROM club_pix_orders)").bind(unit,unit).all()).results||[];rows.push(...old.map(x=>({...x,archived_test:1})))}}
 const content=parse((await db.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first())?.content_json);
 const products=(await db.prepare("SELECT unit,evo_product_id,name FROM evo_product_catalog WHERE tenant_key='default'").all()).results||[];
 const services=(await db.prepare('SELECT unit,evo_service_id,service_name FROM evo_service_catalog').all()).results||[];
 return rows.filter(o=>!cutoff||String(o.created_at||'')>=cutoff).map(o=>{
 const p=parse(o.personal_json),raw=parse(o.raw_json),catalog=(content[o.item_type==='product'?'products':'services']||[]).find(x=>String(x.id)===o.item_id&&String(x.unit||'bike')===o.unit);
 const evoId=o.item_type==='product'?(o.snapshot_product_id||catalog?.evoProductId):catalog?.evoServiceId;
 const official=o.item_type==='product'?products.find(x=>x.unit===o.unit&&String(x.evo_product_id)===String(evoId))?.name:services.find(x=>x.unit===o.unit&&String(x.evo_service_id)===String(evoId))?.service_name;
 return {id:o.id,unit:o.unit,memberId:o.member_id,memberName:String(p.name||[p.firstName||o.first_name,p.lastName||o.last_name].filter(Boolean).join(' ')||raw.name||[raw.firstName,raw.lastName].filter(Boolean).join(' ')).trim(),cpf:cpfDigits(p.document||p.cpf||raw.document||raw.cpf),itemType:o.item_type,itemId:o.item_id,storedItemName:o.item_name,itemName:catalog?.name,officialName:official||'',amountCents:o.amount_cents,originalCents:o.original_cents??(o.currency_quantity===0?o.amount_cents:null),discountCents:o.discount_cents,currencyQuantity:o.currency_quantity,paymentMode:o.payment_mode||(o.currency_quantity>0?(o.amount_cents>0?'mixed':'coins'):'pix'),status:o.status,externalState:o.external_state,externalBefore:o.external_before,deliveryState:o.delivery_state,fiscalRegisteredAt:o.fiscal_registered_at,fiscalRegisteredBy:o.fiscal_registered_by,autoSaleState:o.auto_sale_state,autoSaleId:o.evo_sale_id,createdAt:o.created_at,updatedAt:o.updated_at,saleDate:saleDate(o.created_at),importStatus:o.import_status||'',returnLog:o.return_log||'',batchId:o.batch_id||'',pixVerified:!!o.pix_verified,isTest:!!o.archived_test||/(?:^|[\s:_-])(test|teste|sandbox)(?:$|[\s:_-])/i.test([o.id,o.item_name,o.provider_order_id].join(' '))};
 });
}
const fail=(message,status=409)=>Object.assign(Error(message),{status});
export async function shopImport(db,unit,method,body,actor) {
 if(method==='GET') {
 const settings=await loadSettings(db,unit),orders=await loadOrders(db,unit,{audit:true});
 const batches=(await db.prepare("SELECT id,unit,branch_code,state,created_at,reviewed_at,snapshot_json,return_json FROM club_evo_import_batches WHERE unit=? ORDER BY created_at DESC,id DESC").bind(unit).all()).results||[];
 return {ok:true,settings,orders:orders.map(o=>({...o,reasons:pendingReasons(o,settings)})),batches:batches.map(b=>({...b,snapshot:parse(b.snapshot_json),returns:parse(b.return_json),snapshot_json:undefined,return_json:undefined}))};
 }
 if(body.action==='settings') {
 const settings=body.settings||{},receipts={};
 if(!/^\d{1,12}$/.test(settings.branchCode||''))throw fail('ID da filial inválido',400);
 for(const key of ['pix','coins','mixed']){const v=settings.receipts?.[key];if(v!==''&&v!=null&&(!Number.isInteger(Number(v))||Number(v)<1||Number(v)>999))throw fail('Código de recebimento inválido',400);receipts[key]=v===''||v==null?15:Number(v)}
 await db.prepare('INSERT INTO club_evo_import_settings(unit,branch_code,receipts_json) VALUES(?,?,?) ON CONFLICT(unit) DO UPDATE SET branch_code=excluded.branch_code,receipts_json=excluded.receipts_json,updated_at=CURRENT_TIMESTAMP').bind(unit,settings.branchCode,JSON.stringify(receipts)).run();return {ok:true};
 }
 if(body.action==='export') {
 const ids=body.orderIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)throw fail('Selecione de 1 a 100 pedidos distintos',400);
 const settings=await loadSettings(db,unit),orders=await loadOrders(db,unit),selected=ids.map(id=>orders.find(o=>o.id===id));
 for(let i=0;i<selected.length;i++){const o=selected[i];if(!o||!['product','service'].includes(o.itemType))throw fail('Pedido não encontrado na unidade');const reasons=pendingReasons(o,settings);if(reasons.length)throw fail('Pedido '+o.id+': '+reasons.join('; '))}
 const id=crypto.randomUUID(),snapshot=selected.map(o=>({orderId:o.id,row:exportRow(o,settings)}));
 const stm=[db.prepare('INSERT INTO club_evo_import_batches(id,unit,branch_code,created_by,snapshot_json) VALUES(?,?,?,?,?)').bind(id,unit,settings.branchCode,String(actor.name||actor.id||'admin'),JSON.stringify(snapshot))];
 for(const o of selected)stm.push(db.prepare(`INSERT INTO club_evo_import_items(order_id,unit,batch_id,item_type,item_name,member_name,cpf,value_cents,sale_date,receipt_code) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET batch_id=excluded.batch_id,item_name=excluded.item_name,member_name=excluded.member_name,cpf=excluded.cpf,value_cents=excluded.value_cents,sale_date=excluded.sale_date,receipt_code=excluded.receipt_code,status='exported',return_log=NULL,checked_at=NULL`).bind(o.id,unit,id,o.itemType,o.officialName,o.memberName,o.cpf,o.amountCents,o.saleDate,receiptFor(o,settings)));
 try{await db.batch(stm)}catch{throw fail('Os pedidos mudaram ou já estão em outro lote. Atualize a página.')}
 return {ok:true,batchId:id,snapshot};
 }
 if(body.action==='return') {
 if(!Array.isArray(body.entries)||!body.entries.length||body.entries.length>500)throw fail('Devolutiva vazia ou acima de 500 linhas',400);
 const batch=await db.prepare('SELECT * FROM club_evo_import_batches WHERE id=? AND unit=?').bind(String(body.batchId||''),unit).first();if(!batch)throw fail('Lote não encontrado',404);
 const snapshot=parse(batch.snapshot_json);if(!Array.isArray(snapshot))throw fail('Lote sem arquivo original');
 const {updates,unmatched}=reconcile(snapshot,body.entries);
 if(!updates.length)throw fail('Nenhuma linha corresponde integralmente ao lote selecionado');
 const stm=updates.map(x=>db.prepare("UPDATE club_evo_import_items SET status=?,return_log=?,checked_at=CURRENT_TIMESTAMP WHERE order_id=? AND unit=? AND batch_id=? AND status IN ('exported','review')").bind(x.status,x.log,x.orderId,unit,batch.id));
 // A historical batch cannot overwrite a newer retry or a terminal confirmation/rejection.
 stm.push(db.prepare("UPDATE club_evo_import_batches SET state=CASE WHEN (SELECT count(*) FROM club_evo_import_items WHERE batch_id=? AND status='confirmed')=json_array_length(snapshot_json) THEN 'confirmed' ELSE 'partial' END,reviewed_at=CURRENT_TIMESTAMP,return_json=json_insert(CASE WHEN json_type(return_json)='array' THEN return_json ELSE '[]' END,'$[#]',json(?)) WHERE id=? AND unit=?").bind(batch.id,JSON.stringify({updates,unmatched}),batch.id,unit));
 const results=await db.batch(stm);return {ok:true,matched:updates.length,changed:results.slice(0,-1).reduce((n,r)=>n+(r.meta?.changes?1:0),0),unmatched};
 }
 throw fail('Ação inválida',400);
}
