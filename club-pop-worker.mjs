import {drawCandidates,ensureDrawMember,drawAttendance,ticketSession,acquireDrawLease,releaseDrawLease} from './lib/lucky-draw-data.mjs';
import { partnerMedia } from "./lib/partner-media.mjs";
import {popDrawAdmin,popDrawTick} from './lib/pop-draws.mjs';
import {luckyDrawTick,luckyDrawStatus} from './lib/lucky-draw-official.mjs';
import {flashClasses} from './lib/flash-mission-classes.mjs';
import {journeyAutomationAdmin} from './lib/journey-automations.mjs';
import {journeyAutomationTick} from './lib/journey-engine.mjs';
import {equipmentMaintenance} from './lib/equipment-maintenance.mjs';
import { ensureReservationSchema, startReservationSync, processReservationSync, saveReservationSnapshot, saveProspectReservationSnapshot, reservationTime } from './lib/reservation-sync.mjs';
import { attachContractSessions } from './lib/session-contracts.mjs';
import {usefulLinks} from './lib/useful-links-routes.mjs';
import {adminBikeRanking} from './lib/admin-bike-ranking.mjs';
import {communityChallenges} from './lib/community-challenges.mjs';
import {adminCommunityMissions} from './lib/admin-community-missions.mjs';
import {hallConquests} from './lib/hall-conquests.mjs';
import {adminGymRanking,rankingBase} from './lib/admin-gym-ranking.mjs';
import {loadOrders as loadShopOrders, shopImport} from './lib/evo-shop-import.mjs';
async function verifyProxyAuth(request,env,unit,route){const signed=request.headers.get("x-clubpop-proxy-auth")||"";if(!signed||!env.AUTO_SYNC_SECRET)return null;const parts=signed.split(".");if(parts.length!==2)return null;const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.AUTO_SYNC_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const bytes=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(parts[0])));const expected=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");if(expected.length!==parts[1].length)return null;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^parts[1].charCodeAt(i);if(diff)return null;let actor;try{actor=JSON.parse(atob(parts[0].replace(/-/g,"+").replace(/_/g,"/")))}catch{return null}if(!Number.isFinite(actor.t)||Math.abs(Date.now()-actor.t)>120000||actor.unit!==unit||actor.route!==route||actor.method!==request.method||!Array.isArray(actor.units)||!(unit==="all"&&route==="teacher-view"?actor.units.some(u=>u==="bike"||u==="gym"):actor.units.includes(unit)))return null;return actor}
import { snapshotProductSale, syncProductSale } from './lib/evo-product-sales.mjs';
import { ensureTeacherLinks, validateTeacherLinks, teacherView } from "./lib/teacher-view.mjs";
function favoriteEquipmentFromRows(rows,unit,activity){const type=unit==="bike"?"B":/step/i.test(activity||"")?"S":/jump/i.test(activity||"")?"J":null;if(!type)return "Livre";const selected=rows.filter(r=>unit==="bike"||(type==="S"?/step/i.test(r.activity||""):/jump/i.test(r.activity||"")));const nums=selected.map(r=>Number(r.slotNumber)).filter(n=>Number.isInteger(n)&&n>0);if(!nums.length)return "—";const counts={};for(const n of nums)counts[n]=(counts[n]||0)+1;const [num,count]=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];return count/nums.length>=0.55?type+num:"—"}
import {benefitVouchers} from './lib/benefit-vouchers.mjs';
import {settleFitcoins,receptionRecord,receptionAction} from './lib/checkout-fitcoins.mjs';
import { options as checkoutOptions, quote as checkoutQuote, validateChoice, checkoutError, customerOrderStatus } from './lib/checkout.mjs';
import { currencyAdmin, currencyStudent, currencyRewardTick, currencyMissionProgress, activeCurrency, ledgerStatements, localToday } from './lib/currency-ledger.mjs';

// Same unit credentials, endpoint and request accounting as the existing Fitcoins transport.
async function checkoutEvo(env,unit){
 const cfg=await getEvoConfig(env,unit);
 return async(path,method)=>{
  const response=await fetch("https://evo-integracao-api.w12app.com.br"+path,{method,headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json",...(method==="GET"?{"Cache-Control":"no-cache"}:{})},cache:"no-store",signal:AbortSignal.timeout(15000)});
  try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,?,?,?,?)").bind(unit,"fitcoins",method,path.split("?")[0],response.status,response.ok?1:0).run()}catch{}
  return response;
 };
}

// Isolated sales transport: reuses unit credentials, never the payment/debit adapter.
async function syncCheckoutSale(env,orderId,options={}) {
 // EVO product sale integration paused: manual reception workflow only.
 return {state:'manual_only',remoteSaleCreated:false};
 try {
  let cfg;
  return await syncProductSale(env.DB,orderId,async(path,method,payload)=>{
   if(!cfg){const row=await env.DB.prepare('SELECT unit FROM club_evo_product_sales WHERE order_id=?').bind(orderId).first();cfg=await getEvoConfig(env,row.unit);}
   let response;
   try {response=await fetch('https://evo-integracao-api.w12app.com.br'+path,{method,headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json','Content-Type':'application/json',culture:'pt-BR'},...(payload?{body:JSON.stringify(payload)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});return response;}
   finally {try{await env.DB.prepare('INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,?,?,?,?)').bind(cfg.unit,'product_sale',method,path.split('?')[0],response?.status||0,response?.ok?1:0).run()}catch{}}
  },options);
 }catch {return {state:'pending',error:'EVO_SALE_SYNC_UNAVAILABLE'};}
}
async function settleCheckout(env,order) {
 const result=await settleFitcoins(env.DB,order,await checkoutEvo(env,order.unit));
 return {...result,evoSale:result.status==='approved'?await syncCheckoutSale(env,order.id):null};
}
async function productSalesTick(env) {
 try {
  // Only snapshots made by the new checkout; historical orders are never scanned.
  const rows=await env.DB.prepare("SELECT s.order_id FROM club_evo_product_sales s JOIN club_pix_orders o ON o.id=s.order_id WHERE o.status='approved' AND ((o.currency_quantity>0 AND o.external_state='confirmed') OR (o.currency_quantity=0 AND o.external_state='none')) AND s.checks<4 AND s.state IN ('waiting','sending','uncertain','verify_pending') AND (s.checked_at IS NULL OR datetime(s.checked_at)<datetime('now','-10 minutes')) ORDER BY s.created_at LIMIT 3").all();
  for(const row of rows.results||[])await syncCheckoutSale(env,row.order_id);
 }catch {console.error('EVO_PRODUCT_SALES_TICK_FAILED');}
}

// Production Mercado Pago credentials are encrypted per unit in D1.
async function clubPixCredentials(env,unit){
 if(!["bike","gym"].includes(unit)||!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return null;
 const row=await env.DB.prepare("SELECT access_token_cipher,webhook_secret_cipher FROM club_mp_credentials WHERE unit=? AND environment='production'").bind(unit).first();
 if(!row?.access_token_cipher||!row?.webhook_secret_cipher)return null;
 const raw=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),c=>c.charCodeAt(0));
 if(raw.length!==32)throw Error("PIX_CRYPTO_KEY_INVALID");
 const key=await crypto.subtle.importKey("raw",raw,"AES-GCM",false,["decrypt"]);
 const decode=v=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
 const decrypt=async v=>{const [iv,cipher]=v.split(".");return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(unit+":production")},key,decode(cipher)))};
 return {token:await decrypt(row.access_token_cipher),secret:await decrypt(row.webhook_secret_cipher)};
}
async function clubPixReconcile(env,order,result){
 if(String(result.id)!==String(order.provider_order_id)||String(result.external_reference)!==String(order.id)||Math.round(Number(result.total_amount)*100)!==Number(order.amount_cents))throw Error("PIX_PROVIDER_MISMATCH");
 if(order.status==="refunded")return {status:"refunded",fulfilled:false};
 const raw=String(result.status||"").toLowerCase();
 const next=raw==="processed"?"approved":raw==="cancelled"?"cancelled":raw==="expired"?"expired":raw==="failed"?"rejected":"pending";
 if(next==="approved"&&order.original_cents!=null){
   const payments=result.transactions?.payments||[];
   if(Math.round(Number(result.total_paid_amount)*100)!==Number(order.amount_cents)||!payments.length||payments.some(p=>p.status!=="processed"||p.payment_method?.id!=="pix")||(result.currency_id&&result.currency_id!=="BRL"))throw Error("PIX_PAYMENT_UNCONFIRMED");
 }
 if(next==="approved"&&order.external_member_id){
   if(order.status==="approved")return {status:"approved",deliveryQueued:true,evoSale:await syncCheckoutSale(env,order.id)};
   if(order.external_state==="review"||order.external_state==="running")return {status:"paid_pending_coins",coinsState:"review",fulfilled:false};
   await env.DB.prepare("UPDATE club_pix_orders SET status='paid_pending_coins',choice_expires_at=NULL WHERE id=? AND status NOT IN ('approved','refunded') AND reservation_state='held'").bind(order.id).run();
   return settleCheckout(env,order);
 }
 if(next!=="approved"&&order.external_member_id&&order.external_state!=="none")return {status:order.status,fulfilled:false};
 if(next==="approved"){
   // Atomic, idempotent fulfillment: a single pending redemption per paid order.
   // Existing Central de Resgates handles physical delivery after payment.
   await env.DB.batch([
    env.DB.prepare("UPDATE club_pix_orders SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='approved'").bind(order.id),
    env.DB.prepare("INSERT OR IGNORE INTO club_pix_fulfillment(order_id,member_id,unit,delivery_state) VALUES(?,?,?,'ready')").bind(order.id,order.member_id,order.unit),
    env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,fitcoins,status,source_type,source_id,title,details,cash_amount,unit,dedupe_key) SELECT ?,?,?,0,'PENDING','PIX',?,?,?, ?,?,? WHERE NOT EXISTS (SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(order.member_id,order.item_type,order.item_id,order.item_id,"Compra Pix "+order.item_type,"Pagamento confirmado • Pedido "+order.id,Number(order.amount_cents)/100,order.unit,"pix:"+order.id,"pix:"+order.id)
   ]);
 }else{
   await env.DB.prepare("UPDATE club_pix_orders SET status=?,reservation_state=CASE WHEN ? IN ('cancelled','expired','rejected') THEN 'released' ELSE reservation_state END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status NOT IN ('approved')").bind(next,next,order.id).run();
 }
 return {status:next,fulfilled:false,deliveryQueued:next==="approved",evoSale:next==="approved"?await syncCheckoutSale(env,order.id):null};
}

// Encrypted Mercado Pago configuration. No secret is ever returned to the browser.

function chatproSafeApiUrl(value){
 try{
  const u=new URL(value);
  if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port||u.href.length>2048)return false;
  const host=u.hostname.toLowerCase().replace(/\.$/,"");
  if(!host||host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal")||host.endsWith(".test")||host.endsWith(".invalid")||host.endsWith(".example")||host.endsWith(".onion"))return false;
  if(host.includes(":")||/^\d+(?:\.\d+){0,3}$/.test(host)||!host.includes("."))return false;
  if(!/^[a-z0-9.-]+$/.test(host)||host.split(".").some(part=>!part||part.startsWith("-")||part.endsWith("-")))return false;
  return true;
 }catch{return false}
}
async function claimStudentDispatch(env,b,phone,flow,enabledUnits){
 const unit=String(b.unit||""),batch=String(b.batchId||""),name=String(b.groupName||"").trim();
 if(!["bike","gym"].includes(unit)||!enabledUnits.includes(unit))return {error:"CHATPRO_NAO_HABILITADO_NESTA_UNIDADE",status:403};
 if(!/^[0-9a-f-]{36}$/i.test(batch)||!name||name.length>80||!/^55\d{10,11}$/.test(phone)||b.subscriber_id)return {error:"GRUPO_OU_TELEFONE_INVALIDO",status:400};
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS student_management_dispatches(batch_id TEXT NOT NULL,phone TEXT NOT NULL,unit TEXT NOT NULL,group_name TEXT NOT NULL,flow INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(batch_id,phone))").run();
 const inserted=await env.DB.prepare("INSERT OR IGNORE INTO student_management_dispatches(batch_id,phone,unit,group_name,flow) VALUES(?,?,?,?,?)").bind(batch,phone,unit,name,flow).run();
 if(!inserted.meta?.changes){
  const previous=await env.DB.prepare("SELECT unit,flow,status FROM student_management_dispatches WHERE batch_id=? AND phone=?").bind(batch,phone).first();
  if(previous?.unit===unit&&previous?.flow===flow&&previous?.status==='accepted')return {duplicate:true};
  return {error:"ENVIO_JA_PROCESSADO_OU_INCERTO_CONFIRA_NO_CHATPRO",status:409};
 }
 return {finish:async status=>env.DB.prepare("UPDATE student_management_dispatches SET status=?,updated_at=CURRENT_TIMESTAMP WHERE batch_id=? AND phone=?").bind(status,batch,phone).run()};
}

async function resolveChatproSubscriber(call,phone,options={}){
 let sub;
 try{sub=await call("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/")}
 catch(e){if(e.status!==404)throw Object.assign(new Error("CONSULTA_CONTATO: "+e.message),{status:e.status});}
 if(sub?.id)return {id:String(sub.id),created:false};
 if(options.allowCreate!==true)throw new Error("CONTATO_NAO_CADASTRADO_NO_CHATPRO");
 if(options.hasOptIn!==true)throw new Error("AUTORIZACAO_WHATSAPP_NECESSARIA_PARA_CADASTRO");
 const parts=String(options.name||"").trim().split(/\s+/).filter(Boolean);
 if(!parts.length)throw new Error("NOME_NECESSARIO_PARA_CADASTRO");
 let created=true;
 try{await call("/subscriber/","POST",{phone,first_name:parts[0].slice(0,255),last_name:parts.slice(1).join(" ").slice(0,255),has_opt_in_whatsapp:true});}
 catch(e){if(e.status!==401)throw new Error("CADASTRO_CONTATO: "+e.message);created=false;}
 // The create response does not guarantee an ID; look up the exact phone again.
 try{sub=await call("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/")}
 catch(e){throw new Error("CONFIRMACAO_CADASTRO: "+e.message);}
 if(!sub?.id)throw new Error("CADASTRO_SEM_ID_CONFIRMADO");
 return {id:String(sub.id),created};
}
async function recordJourneyChatproContact(env,b,flow){
 if(b.journey!==true)return {contactRecorded:false};
 const marker="[CHATPRO:"+b.batchId+":"+String(b.studentId)+"]";
 const note=marker+" WhatsApp · Fluxo "+flow+" · Aceito pelo ChatPro (entrega não confirmada)"+(b.hasOptIn===true?" · Autorização WhatsApp confirmada pelo administrador":"");
 try{
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_new_student_interventions(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await env.DB.prepare("INSERT INTO club_new_student_interventions(unit,evo_member_id,kind,note) SELECT ?,?,'contact',? WHERE NOT EXISTS(SELECT 1 FROM club_new_student_interventions WHERE unit=? AND evo_member_id=? AND note=?)").bind(b.unit,String(b.studentId),note,b.unit,String(b.studentId),note).run();
 const row=await env.DB.prepare("SELECT created_at FROM club_new_student_interventions WHERE unit=? AND evo_member_id=? AND note=? ORDER BY id DESC LIMIT 1").bind(b.unit,String(b.studentId),note).first();
 return {contactRecorded:true,contactAt:row?.created_at||null};
 }catch{return {contactRecorded:false,contactWarning:"ENVIO_ACEITO_MAS_HISTORICO_NAO_REGISTRADO"};}
}
// Transport shared with manual flow delivery; automation never changes credentials.
async function chatproRequest(base,apiKey,path,method="GET",payload){
 const r=await fetch(base.replace(/\/$/,"")+path,{method,redirect:"manual",headers:{"API-KEY":apiKey,Accept:"application/json","Content-Type":"application/json"},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 if(r.status>=300&&r.status<400)throw Error("REDIRECIONAMENTO_BLOQUEADO");
 if(!r.ok)throw Object.assign(Error("CHATPRO_HTTP_"+r.status),{status:r.status});
 // A successful empty body is still accepted; do not turn it into a retry.
 const text=await r.text();if(!text)return {};try{return JSON.parse(text)}catch{return {accepted:true}};
}
function journeyChatproAdapters(env){
 const transport=async(unit)=>{
  const cfg=await env.DB.prepare('SELECT * FROM club_chatpro_config WHERE id=1').first();
  let units=[];try{units=JSON.parse(cfg?.enabled_units||'[]')}catch{}
  if(!cfg?.enabled||!units.includes(unit))throw Error('CHATPRO_UNIDADE_NAO_ATIVADA');
  if(!chatproSafeApiUrl(cfg.base_url))throw Error('URL_API_INVALIDA');
  if(!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)throw Error('CHAVE_CRIPTOGRAFIA_NAO_CONFIGURADA');
  const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey('raw',decode(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),'AES-GCM',false,['decrypt']);
  const [iv,cipher]=cfg.api_key_cipher.split('.'),apiKey=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode('chatpro:config')},key,decode(cipher)));
  return (path,method,payload)=>chatproRequest(cfg.base_url,apiKey,path,method,payload);
 };
 return {
  async validateFlow(unit,flow){const call=await transport(unit),data=await call('/flows/');const items=Array.isArray(data)?data:data.results||data.flows||data.data||[];if(!Array.isArray(items)||!items.some(x=>String(x.id||x.flow_id)===String(flow)))throw Error('FLUXO_NAO_ENCONTRADO_NO_CHATPRO');},
  async send(b,beforeSend){
   let call,sub;
   try{call=await transport(b.unit);await beforeSend();sub=await resolveChatproSubscriber(call,b.phone,{allowCreate:true,hasOptIn:b.hasOptIn,name:b.studentName});await beforeSend();}
   catch(e){e.beforeSend=true;throw e;}
   // Once send_flow begins, every ambiguous failure requires manual review.
   await call('/subscriber/'+encodeURIComponent(sub.id)+'/send_flow/','POST',{flow:b.flow});return {contactCreated:sub.created};
  },
  recordContact:(b,flow)=>recordJourneyChatproContact(env,b,flow)
 };
}
async function chatproAdminConfig(request,env,url,json){
 const respond=(data,status=200)=>json(data,status);
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!ck)return respond({ok:false,error:"NAO_AUTORIZADO"},401);
 let vr;try{vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}})}catch{return respond({ok:false,error:"FALHA_AUTENTICACAO"},502)}
 const vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return respond({ok:false,error:"NAO_AUTORIZADO"},403);
 if(!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return respond({ok:false,error:"CHAVE_CRIPTOGRAFIA_NAO_CONFIGURADA"},503);
 const bytes=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),x=>x.charCodeAt(0));
 if(bytes.length!==32)return respond({ok:false,error:"CHAVE_CRIPTOGRAFIA_INVALIDA"},503);
 const key=await crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["encrypt","decrypt"]);
 const enc=x=>btoa(String.fromCharCode(...x)),dec=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
 const encrypt=async value=>{const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode("chatpro:config")},key,new TextEncoder().encode(value)));return enc(iv)+"."+enc(cipher)};
 const decrypt=async value=>{const [iv,cipher]=value.split(".");return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:dec(iv),additionalData:new TextEncoder().encode("chatpro:config")},key,dec(cipher)))};
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_chatpro_config(id INTEGER PRIMARY KEY CHECK(id=1),api_key_cipher TEXT NOT NULL,base_url TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 const columns=await env.DB.prepare("PRAGMA table_info(club_chatpro_config)").all();
 if(!(columns.results||[]).some(c=>c.name==="enabled_units"))await env.DB.prepare("ALTER TABLE club_chatpro_config ADD COLUMN enabled_units TEXT NOT NULL DEFAULT '[\"bike\"]'").run();
 const record=await env.DB.prepare("SELECT * FROM club_chatpro_config WHERE id=1").first();
 const enabledUnits=(()=>{try{const a=JSON.parse(record?.enabled_units||'["bike"]');return Array.isArray(a)?a.filter(x=>["bike","gym","club"].includes(x)):["bike"]}catch{return ["bike"]}})();
 const action=url.searchParams.get("action")||"status";
 if(request.method==="GET"&&action==="status")return respond({ok:true,configured:!!record?.api_key_cipher,enabled:!!record?.enabled,baseUrl:record?.base_url||"https://conectawebhook.com.br/api/v1/webhook",updatedAt:record?.updated_at||null,enabledUnits});
 if(request.method==="PUT"&&action==="units"){
  const b=await request.json().catch(()=>({}));
  if(!Array.isArray(b.units)||!b.units.length||b.units.some(x=>!["bike","gym","club"].includes(x)))return respond({ok:false,error:"UNIDADES_INVALIDAS"},400);
  if(!record)return respond({ok:false,error:"CONFIGURACAO_AUSENTE"},404);
  const units=[...new Set(b.units)];
  await env.DB.prepare("UPDATE club_chatpro_config SET enabled_units=?,updated_at=CURRENT_TIMESTAMP WHERE id=1").bind(JSON.stringify(units)).run();
  return respond({ok:true,enabledUnits:units,message:"Unidades autorizadas atualizadas sem alterar a conexão."});
 }


 if(["new-students-status","new-students-save","movement-status"].includes(action)){
  const unit=url.searchParams.get("unit")||"bike";
  if(!["bike","gym"].includes(unit))return respond({ok:false,error:"UNIDADE_INVALIDA"},400);
  if(action==="movement-status"){
   const month=url.searchParams.get("month")||new Date().toISOString().slice(0,7);
   if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))return respond({ok:false,error:"MES_INVALIDO"},400);
   const people=(await env.DB.prepare("SELECT mm.evo_member_id id,COALESCE(json_extract(mm.raw_json,'$.registerDate'),'') registered,CASE WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='5' OR upper(c.membership_name) LIKE '%TOTALPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'totalpass' WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='4' OR upper(c.membership_name) LIKE '%WELLHUB%' OR upper(c.membership_name) LIKE '%GYMPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'wellhub' ELSE 'common' END category,COALESCE(m.first_name,'') first_name,COALESCE(m.last_name,'') last_name,mm.contacts_json contacts FROM evo_member_master mm LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) WHERE mm.unit=? AND mm.is_current=1 AND EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours')))").bind(unit).all()).results||[];
   const result={new:{wellhub:0,totalpass:0,common:0},returned:{wellhub:0,totalpass:0,common:0},unverified:0};
   for(const p of people){const reg=String(p.registered||"").slice(0,7);if(reg===month)result.new[p.category]++;else if(reg&&reg<month){
     const contracts=(await env.DB.prepare("SELECT date(COALESCE(NULLIF(sale_date,''),NULLIF(start_date,''))) start,date(end_date) end FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND COALESCE(sale_date,start_date) IS NOT NULL ORDER BY start").bind(unit,p.id).all()).results||[];
     const start=contracts.filter(c=>c.start&&c.start.slice(0,7)===month);
     const previous=contracts.filter(c=>c.end&&c.end<month+"-01");
     if(start.length&&previous.length&&previous.every(c=>c.end<month+"-01"))result.returned[p.category]++;
   }else if(!reg)result.unverified++}
   return respond({ok:true,unit,month,...result,source:"D1",note:"Retornos exigem contrato anterior encerrado e novo contrato no mês; histórico incompleto pode subestimar."});
  }
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_new_config(unit TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,flows_json TEXT NOT NULL DEFAULT '{}',times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_new_dispatch(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,send_date TEXT NOT NULL,evo_member_id TEXT NOT NULL,category TEXT NOT NULL,scheduled_time TEXT NOT NULL,flow_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'reserved',sent_at TEXT,error TEXT,UNIQUE(unit,evo_member_id))").run();
  if(action==="new-students-save"&&request.method==="PUT"){
   const b=await request.json().catch(()=>({})),times=Array.isArray(b.times)?[...new Set(b.times)].sort():[],flows=b.flows||{};
   if(times.length>12||times.some(t=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||["wellhub","totalpass","common"].some(k=>String(flows[k]||"").length>100)||b.enabled===true&&(!times.length||["wellhub","totalpass","common"].some(k=>!/^\d+$/.test(String(flows[k]||"")))))return respond({ok:false,error:"CONFIGURACAO_INVALIDA"},400);
   await env.DB.prepare("INSERT INTO club_whatsapp_new_config(unit,enabled,flows_json,times_json,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET enabled=excluded.enabled,flows_json=excluded.flows_json,times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,b.enabled===true?1:0,JSON.stringify({wellhub:String(flows.wellhub||""),totalpass:String(flows.totalpass||""),common:String(flows.common||"")}),JSON.stringify(times)).run();
   return respond({ok:true,enabled:b.enabled===true,message:"Configuração salva."});
  }
  if(action==="new-students-status"&&request.method==="GET"){
   const cfg=await env.DB.prepare("SELECT * FROM club_whatsapp_new_config WHERE unit=?").bind(unit).first();
   const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date());
   const people=(await env.DB.prepare("SELECT mm.evo_member_id id,COALESCE(json_extract(mm.raw_json,'$.registerDate'),'') registered,CASE WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='5' OR upper(c.membership_name) LIKE '%TOTALPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'totalpass' WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='4' OR upper(c.membership_name) LIKE '%WELLHUB%' OR upper(c.membership_name) LIKE '%GYMPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'wellhub' ELSE 'common' END category,COALESCE(m.first_name,'') first_name,COALESCE(m.last_name,'') last_name,mm.contacts_json contacts FROM evo_member_master mm LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) WHERE mm.unit=? AND mm.is_current=1 AND EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours')))").bind(unit).all()).results||[];
   const today=people.filter(p=>String(p.registered||"").slice(0,10)===date);const last=await env.DB.prepare("SELECT MAX(synced_at) lastSync FROM evo_member_master WHERE unit=? AND is_current=1").bind(unit).first();
   const logs=(await env.DB.prepare("SELECT scheduled_time,category,COUNT(*) total,SUM(status='sent') sent,SUM(status='failed') failed FROM club_whatsapp_new_dispatch WHERE unit=? AND send_date=? GROUP BY scheduled_time,category ORDER BY scheduled_time,category").bind(unit,date).all()).results||[];
   return respond({ok:true,unit,date,lastSync:last?.lastSync||null,total:today.length,groups:{wellhub:today.filter(p=>p.category==="wellhub").length,totalpass:today.filter(p=>p.category==="totalpass").length,common:today.filter(p=>p.category==="common").length},names:today.slice(0,100).map(p=>({name:[p.first_name,p.last_name].filter(Boolean).join(" ")||"Aluno",category:p.category})),enabled:!!cfg?.enabled,flows:JSON.parse(cfg?.flows_json||"{}"),times:JSON.parse(cfg?.times_json||"[]"),logs});
  }
  return respond({ok:false,error:"METODO_INVALIDO"},405);
 }
 if(action==="birthday-status"&&request.method==="GET"){
  const unit=url.searchParams.get("unit")||"bike";
  if(!["bike","gym","club"].includes(unit))return respond({ok:false,error:"UNIDADE_INVALIDA"},400);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_birthday_config(unit TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,flow_id TEXT NOT NULL DEFAULT '',times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_birthday_dispatch(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,send_date TEXT NOT NULL,member_id INTEGER NOT NULL,scheduled_time TEXT NOT NULL,flow_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'reserved',sent_at TEXT,error TEXT,UNIQUE(unit,send_date,member_id))").run();
  const cfg=await env.DB.prepare("SELECT enabled,flow_id,times_json FROM club_whatsapp_birthday_config WHERE unit=?").bind(unit).first();
  const active=await env.DB.prepare("SELECT COUNT(DISTINCT c.evo_member_id) n FROM evo_member_contracts c JOIN evo_member_master mm ON mm.unit=c.unit AND CAST(mm.evo_member_id AS TEXT)=CAST(c.evo_member_id AS TEXT) AND mm.is_current=1 WHERE c.unit=? AND lower(c.membership_status) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))").bind(unit).first();
  const birthdaySql="FROM evo_member_master mm JOIN members m ON CAST(m.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) WHERE mm.unit=? AND mm.is_current=1 AND m.status='ACTIVE' AND strftime('%m-%d',COALESCE(json_extract(mm.personal_json,'$.birthDate'),json_extract(mm.personal_json,'$.dateBirth'),json_extract(mm.raw_json,'$.birthDate')))=strftime('%m-%d',date('now','-3 hours')) AND EXISTS (SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND CAST(c.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) AND lower(c.membership_status) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours')))";
  const birthdays=await env.DB.prepare("SELECT COUNT(DISTINCT m.id) n "+birthdaySql).bind(unit).first();
  const people=await env.DB.prepare("SELECT DISTINCT m.id,m.first_name,m.last_name "+birthdaySql+" ORDER BY m.first_name,m.last_name LIMIT 500").bind(unit).all();
  const logs=await env.DB.prepare("SELECT scheduled_time,COUNT(*) total,SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM club_whatsapp_birthday_dispatch WHERE unit=? AND send_date=date('now','-3 hours') GROUP BY scheduled_time ORDER BY scheduled_time").bind(unit).all();
  return respond({ok:true,unit,activeMembers:Number(active?.n||0),birthdays:Number(birthdays?.n||0),birthdayNames:(people.results||[]).map(m=>({id:m.id,name:[m.first_name,m.last_name].filter(Boolean).join(" ").trim()||"Aluno sem nome"})),flowId:cfg?.flow_id||"",enabled:!!cfg?.enabled,times:JSON.parse(cfg?.times_json||"[]"),logs:logs.results||[],dispatchEngineActive:true,preview:(JSON.parse(cfg?.times_json||"[]")).map((time,i,arr)=>({time,planned:Math.floor(Number(birthdays?.n||0)/arr.length)+(i<Number(birthdays?.n||0)%arr.length?1:0),sent:0})),enabledUnits});
 }
 if(action==="birthday-save"&&request.method==="PUT"){
  const b=await request.json().catch(()=>({}));
  if(!["bike","gym","club"].includes(b.unit)||!Array.isArray(b.times)||b.times.length>12||b.times.some(t=>typeof t!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))return respond({ok:false,error:"CONFIGURACAO_INVALIDA"},400);
  const times=[...new Set(b.times)].sort(),flow=String(b.flowId||"").trim();
  if(flow.length>100|| (b.enabled===true&&!/^\d+$/.test(flow)))return respond({ok:false,error:"FLUXO_INVALIDO"},400);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_birthday_config(unit TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,flow_id TEXT NOT NULL DEFAULT '',times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("INSERT INTO club_whatsapp_birthday_config(unit,enabled,flow_id,times_json,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET enabled=excluded.enabled,flow_id=excluded.flow_id,times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(b.unit,b.enabled===true?1:0,flow,JSON.stringify(times)).run();
  return respond({ok:true,message:b.enabled===true?"Automação ativada para os próximos horários.":"Automação desativada.",times,enabled:b.enabled===true,dispatchEngineActive:true});
 }
 if(request.method==="PUT"&&action==="save"){
  const b=await request.json().catch(()=>({}));
  const token=String(b.apiKey||"").trim();
  const baseUrl=String(b.baseUrl||record?.base_url||"https://conectawebhook.com.br/api/v1/webhook").trim().replace(/\/$/,"");
  if(!chatproSafeApiUrl(baseUrl))return respond({ok:false,error:"URL_API_INVALIDA_OU_NAO_SEGURA"},400);
  if(token.length>1024)return respond({ok:false,error:"CHAVE_INVALIDA"},400);
  if(!token&&!record?.api_key_cipher)return respond({ok:false,error:"INFORME_API_KEY"},400);
  const cipher=token?await encrypt(token):record.api_key_cipher;
  await env.DB.prepare("INSERT INTO club_chatpro_config(id,api_key_cipher,base_url,enabled) VALUES(1,?,?,0) ON CONFLICT(id) DO UPDATE SET api_key_cipher=excluded.api_key_cipher,base_url=excluded.base_url,enabled=0,updated_at=CURRENT_TIMESTAMP").bind(cipher,baseUrl).run();
  return respond({ok:true,configured:true,enabled:false,message:"Credenciais salvas. Teste a conexão antes de ativar."});
 }
 if(request.method==="POST"&&(action==="find"||action==="send"||action==="flows")){
  if(!record?.enabled||!record?.api_key_cipher)return respond({ok:false,error:"CHATPRO_NAO_ATIVADO"},409);
  if(!chatproSafeApiUrl(record.base_url))return respond({ok:false,error:"URL_API_INVALIDA"},400);
  const b=await request.json().catch(()=>({}));
  const phone=String(b.phone||"").replace(/\D/g,"");
  let sid=String(b.subscriber_id||"").trim();
  if((action==="find"||(action==="send"&&!sid))&&(phone.length<10||phone.length>15))return respond({ok:false,error:"TELEFONE_INVALIDO"},400);
  if(sid&&!/^[a-zA-Z0-9_-]{1,80}$/.test(sid))return respond({ok:false,error:"SUBSCRIBER_ID_INVALIDO"},400);
  if(action==="send"&&b.confirm!==true)return respond({ok:false,error:"CONFIRMACAO_ENVIO_OBRIGATORIA"},400);
  const flow=Number(b.flow);
  if(action==="send"&&(!Number.isSafeInteger(flow)||flow<=0))return respond({ok:false,error:"FLUXO_INVALIDO"},400);
  let apiKey;try{apiKey=await decrypt(record.api_key_cipher)}catch{return respond({ok:false,error:"FALHA_DESCRIPTOGRAFIA"},500)}
  const base=record.base_url.replace(/\/$/,"");
  const call=(path,method="GET",payload)=>chatproRequest(base,apiKey,path,method,payload);
  if(action==="send"&&b.journey===true&&(b.source!=="student-management"||!/^\d+$/.test(String(b.studentId||""))))return respond({ok:false,error:"ALUNO_DA_JORNADA_INVALIDO"},400);
  let dispatch;
  if(action==="send"&&b.source==="student-management"){
   dispatch=await claimStudentDispatch(env,b,phone,flow,enabledUnits);
   if(dispatch.error)return respond({ok:false,error:dispatch.error},dispatch.status);
   if(dispatch.duplicate)return respond({ok:true,duplicate:true,flow,...await recordJourneyChatproContact(env,b,flow)});
  }
  try{
   if(action==="flows"){const flows=await call("/flows/");return respond({ok:true,flows})}
   if(action==="find"){const subscriber=await call("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/");return respond({ok:true,subscriber})}
   let contactCreated=false;
   if(!sid){const sub=await resolveChatproSubscriber(call,phone,{allowCreate:b.journey===true,hasOptIn:b.hasOptIn,name:b.studentName});sid=sub.id;contactCreated=sub.created;}
   let result;try{result=await call("/subscriber/"+encodeURIComponent(sid)+"/send_flow/","POST",{flow});}catch(e){throw new Error("ENVIO_FLUXO: "+e.message);}
   // Never turn a successful provider response into a retryable send failure.
   let dispatchWarning;try{if(dispatch)await dispatch.finish("accepted");}catch{dispatchWarning="ENVIO_ACEITO_REGISTRO_DO_LOTE_PENDENTE";}
   const contact=await recordJourneyChatproContact(env,b,flow);
   return respond({ok:true,subscriber_id:sid,flow,result,contactCreated,dispatchWarning,...contact});
  }catch(e){if(dispatch)await dispatch.finish("review").catch(()=>{});return respond({ok:false,error:e.message||"CHATPRO_INDISPONIVEL"},502)}
 }
 if(request.method==="POST"&&action==="test"){
  if(!record?.api_key_cipher)return respond({ok:false,error:"CREDENCIAIS_AUSENTES"},400);
  let keyText;try{keyText=await decrypt(record.api_key_cipher)}catch{return respond({ok:false,error:"FALHA_DESCRIPTOGRAFIA"},500)}
  if(!chatproSafeApiUrl(record.base_url))return respond({ok:false,error:"URL_API_INVALIDA_OU_NAO_SEGURA"},400);
  let r;try{r=await fetch(record.base_url.replace(/\/$/,"")+"/flows/",{redirect:"manual",headers:{"API-KEY":keyText,Accept:"application/json"},signal:AbortSignal.timeout(10000)})}catch{return respond({ok:false,error:"SERVICO_INDISPONIVEL"},502)}
  if(r.status>=300&&r.status<400)return respond({ok:false,error:"CHATPRO_REDIRECIONAMENTO_BLOQUEADO"},502);
  if(!r.ok)return respond({ok:false,error:"CHATPRO_HTTP_"+r.status},502);
  await env.DB.prepare("UPDATE club_chatpro_config SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=1").run();
  return respond({ok:true,configured:true,enabled:true,message:"Conexão validada. Integração ativada."});
 }
 return respond({ok:false,error:"ACAO_INVALIDA"},400);
}

async function mpAdminConfig(request,env,url,json){
 const respond=(data,status=200)=>json(data,status);
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!ck)return respond({ok:false,error:"NAO_AUTORIZADO"},401);
 let vr;try{vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}})}catch{return respond({ok:false,error:"FALHA_AUTENTICACAO"},502)}
 const vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return respond({ok:false,error:"NAO_AUTORIZADO"},403);
 const unit=url.searchParams.get("unit"),environment=url.searchParams.get("environment")||"test",action=url.searchParams.get("action")||"status";
 if(!["bike","gym","club"].includes(unit)||!["test","production"].includes(environment))return respond({ok:false,error:"PARAMETROS_INVALIDOS"},400);
 if(!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return respond({ok:false,error:"CHAVE_CRIPTOGRAFIA_NAO_CONFIGURADA"},503);
 const keyBytes=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),x=>x.charCodeAt(0));
 if(keyBytes.length!==32)return respond({ok:false,error:"CHAVE_CRIPTOGRAFIA_INVALIDA"},503);
 const key=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["encrypt","decrypt"]);
 const encode=x=>btoa(String.fromCharCode(...x));
 const decode=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
 const encrypt=async value=>{const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(unit+":"+environment)},key,new TextEncoder().encode(value)));return encode(iv)+"."+encode(cipher)};
 const decrypt=async value=>{const [iv,cipher]=value.split(".");return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(unit+":"+environment)},key,decode(cipher)))};
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_mp_credentials(unit TEXT NOT NULL,environment TEXT NOT NULL,access_token_cipher TEXT,webhook_secret_cipher TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,environment))").run();
 const record=await env.DB.prepare("SELECT * FROM club_mp_credentials WHERE unit=? AND environment=?").bind(unit,environment).first();
 if(request.method==="GET"&&action==="status")return respond({ok:true,configured:!!record?.access_token_cipher,webhookConfigured:!!record?.webhook_secret_cipher,environment,unit,paymentsEnabled:false});
 if(request.method==="PUT"&&action==="save"){
  const b=await request.json().catch(()=>({}));
  const token=String(b.accessToken||"").trim(),secret=String(b.webhookSecret||"").trim();
  if((token&&(token.length>512||(environment==="test"?!token.startsWith("TEST-"):!token.startsWith("APP_USR-"))))||(secret&&secret.length>512))return respond({ok:false,error:"CREDENCIAL_INCOMPATIVEL_COM_AMBIENTE"},400);
  if(!token&&!secret)return respond({ok:false,error:"CREDENCIAL_OBRIGATORIA"},400);
  const encryptedToken=token?await encrypt(token):record?.access_token_cipher||null;
  const encryptedSecret=secret?await encrypt(secret):record?.webhook_secret_cipher||null;
  await env.DB.prepare("INSERT INTO club_mp_credentials(unit,environment,access_token_cipher,webhook_secret_cipher) VALUES(?,?,?,?) ON CONFLICT(unit,environment) DO UPDATE SET access_token_cipher=excluded.access_token_cipher,webhook_secret_cipher=excluded.webhook_secret_cipher,updated_at=CURRENT_TIMESTAMP").bind(unit,environment,encryptedToken,encryptedSecret).run();
  return respond({ok:true,saved:true,paymentsEnabled:false});
 }
 if(request.method==="POST"&&action==="pix-readiness"){
  if(!record?.access_token_cipher)return respond({ok:false,error:"TOKEN_NAO_CADASTRADO"},409);
  const token=await decrypt(record.access_token_cipher);
  const response=await fetch("https://api.mercadopago.com/v1/payment_methods",{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(10000)}).catch(()=>null);
  if(!response)return respond({ok:false,error:"PROVEDOR_INDISPONIVEL"},502);
  if(!response.ok)return respond({ok:false,error:"CONSULTA_METODOS_FALHOU",providerStatus:response.status},502);
  const methods=await response.json().catch(()=>[]);
  if(!Array.isArray(methods))return respond({ok:false,error:"RESPOSTA_METODOS_INVALIDA"},502);
  const pix=methods.find(x=>String(x.id||"").toLowerCase()==="pix");
  return respond({ok:true,unit,environment,pixAvailable:!!pix,methodType:pix?.payment_type_id||null,credentialsConfigured:true,webhookConfigured:!!record.webhook_secret_cipher,paymentsEnabled:false,canCreateCharge:false,message:pix?"Pix aparece na listagem de métodos. A geração de QR Code ainda precisa ser testada.":"Consulta concluída, mas esta listagem não confirma a disponibilidade de Pix via Orders. É necessário testar a criação controlada de um pedido."});
 }
 if(request.method==="POST"&&action==="test"){
  if(!record?.access_token_cipher)return respond({ok:false,error:"TOKEN_NAO_CADASTRADO"},409);
  const token=await decrypt(record.access_token_cipher);
  const response=await fetch("https://api.mercadopago.com/users/me",{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(8000)}).catch(()=>null);
  if(!response)return respond({ok:false,error:"PROVEDOR_INDISPONIVEL"},502);
  return response.ok?respond({ok:true,message:"Conexão autenticada com Mercado Pago. Pix ainda desativado."}):respond({ok:false,error:"TOKEN_RECUSADO",providerStatus:response.status},409);
 }
 return respond({ok:false,error:"OPERACAO_INVALIDA"},405);
}
function attendanceInstructorName(d){for(const v of [d?.instructor,d?.instructorName,d?.teacher,d?.teacherName,d?.employeeName,d?.employee?.name,d?.instructor?.name,d?.instructors?.[0]?.name]){if(typeof v==="string"&&v.trim())return v.trim().slice(0,160)}return null}
function attendanceClassFinished(date,time,now=new Date()) {const x=String(time||"").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);if(!x||!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;let h=Number(x[1]),minute=Number(x[2]);if(x[3]){if(h<1||h>12)return false;h=h%12+(x[3].toUpperCase()==="PM"?12:0)}if(h>23||minute>59)return false;const local=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),v=t=>local.find(p=>p.type===t)?.value||"";const today=v("year")+"-"+v("month")+"-"+v("day");if(date<today)return true;if(date>today)return false;return h*60+minute+60<=Number(v("hour"))*60+Number(v("minute"));}
const ALLOWED_ORIGINS = new Set([
  "https://loja-pop-green.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);




// Accept a short delay in the minute-based Cron trigger, without replaying old schedules.
// The stored scheduled minute remains the configured time for idempotency.
function dueScheduledMinute(times, now, timeZone="America/Sao_Paulo") {
  const local=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
  const get=t=>local.find(x=>x.type===t)?.value||"";
  const date=get("year")+"-"+get("month")+"-"+get("day");
  const current=Number(get("hour"))*60+Number(get("minute"));
  for(const t of times){
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))continue;
    const [h,m]=t.split(":").map(Number),scheduled=h*60+m;
    if(current>=scheduled&&current-scheduled<=5)return date+"T"+t;
  }
  return null;
}

// Shared weekday rule for current and future scheduled tasks (0=Sunday, 6=Saturday).
// No saved weekday row defaults to Monday-Saturday; no EVO request is made on skipped days.
async function dueScheduledCombination(db,kind,unit,times,now){const row=await db.prepare("SELECT times_json FROM evo_sync_schedules WHERE unit=? AND kind=?").bind(unit,kind+"_combinations").first();if(!row)return dueScheduledMinute(times,now);let groups=[];try{groups=JSON.parse(row.times_json||"[]")}catch{return null}const day=scheduledWeekday(now);return dueScheduledMinute([...new Set(groups.filter(g=>Array.isArray(g.days)&&g.days.includes(day)).flatMap(g=>Array.isArray(g.times)?g.times:[]))].sort(),now)}
function scheduledWeekday(now=new Date()){const weekday=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",weekday:"short"}).format(now);return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(weekday)}
function scheduledDaysAllowed(days,now=new Date()){return Array.isArray(days)&&days.includes(scheduledWeekday(now))}
async function loadScheduledWeekdays(db,kind){const rows=(await db.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind=?").bind(kind+"_days").all()).results||[];const out=new Map();for(const r of rows){try{const days=JSON.parse(r.times_json);out.set(r.unit,Array.isArray(days)?days:[1,2,3,4,5,6])}catch{out.set(r.unit,[1,2,3,4,5,6])}}return out}

// Scheduled contract refresh: starts at skip=0 on every run; uses the same EVO
// query and the same D1 ingestion endpoint as manual synchronization.
async function runScheduledContractSync(env,forceUnit=null,forceKey=null){
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  const now=new Date(),rows=(forceUnit?[{unit:forceUnit,times_json:'[]'}]:(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='contract'").all()).results||[]),days=await loadScheduledWeekdays(env.DB,"contract");
  for(const row of rows){
    const unit=row.unit==="gym"?"gym":"bike";
    if(!forceUnit&&!scheduledDaysAllowed(days.get(unit)||[1,2,3,4,5,6],now))continue;
    let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}
    const due=forceKey||await dueScheduledCombination(env.DB,"contract",unit,times,now);if(!due)continue;
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'contract',?,'pending')").bind(unit,due).run();
    if(!claim.meta?.changes)continue;
    let requests=0,skip=0,saved=0;
    try{
      const cfg=await getEvoConfig(env,unit);
      for(let page=0;page<40;page++){
        const endpoint="/api/v3/membermembership?statusMemberMembership=1&showVips=true&showAggregators=true&take=600&skip="+skip;
        const evo=await fetch("https://evo-integracao-api.w12app.com.br"+endpoint,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(25000)});
        requests++;
        try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'contract_schedule','GET',?,?,?)").bind(unit,"/api/v3/membermembership",evo.status,evo.ok?1:0).run()}catch{}
        if(!evo.ok)throw Error("EVO_HTTP_"+evo.status);
        const batch=await evo.json();
        if(!Array.isArray(batch)||batch.length>600)throw Error("EVO_RESPOSTA_INVALIDA");
        const done=batch.length===0;
        const ingest=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/admin/evo-contracts-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-auto-sync-secret":String(env.AUTO_SYNC_SECRET||"")},body:JSON.stringify({unit,skip,rows:batch,done,nextSkip:skip+batch.length})});
        const result=await ingest.json().catch(()=>({}));
        if(!ingest.ok||!result.ok)throw Error(result.error||"FALHA_GRAVAR_CONTRATOS");
        saved+=Number(result.saved||0);skip+=batch.length;
        if(done){
          await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='contract' AND scheduled_minute=?").bind(JSON.stringify({requests,records:saved,checkpoint:skip}),unit,due).run();
          break;
        }
        if(page===39)throw Error("LIMITE_SEGURO_DE_PAGINAS");
      }
    }catch(e){
      await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='contract' AND scheduled_minute=?").bind(JSON.stringify({requests,records:saved,checkpoint:skip,error:String(e.message||e)}).slice(0,1000),unit,due).run();
    }
  }
}
async function recordCatalogManualRun(env,unit,kind,records,requests){await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();const key=new Date().toISOString().replace("Z","")+"-manual-"+crypto.randomUUID();await env.DB.prepare("INSERT INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status,detail) VALUES(?,?,?,'done',?)").bind(unit,kind,key,JSON.stringify({manual:true,records,requests})).run()}

async function syncEvoModalities(env,unit){
 const cfg=await getEvoConfig(env,unit),headers={Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"};
 const all=[];let requests=0,complete=false;
 for(let skip=0;requests<20;skip+=100){
  const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities?take=100&skip="+skip,{headers,signal:AbortSignal.timeout(20000)});requests++;
  try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'modalities_catalog','GET','/api/v1/activities',?,?)").bind(unit,r.status,r.ok?1:0).run()}catch{}
  if(!r.ok)throw Error("EVO_MODALIDADES_HTTP_"+r.status);
  const d=await r.json(),items=Array.isArray(d)?d:Array.isArray(d?.data)?d.data:Array.isArray(d?.items)?d.items:Array.isArray(d?.list)?d.list:Array.isArray(d?.lista)?d.lista:null;
  if(!items||items.length>100)throw Error("FORMATO_MODALIDADES_DESCONHECIDO");
  all.push(...items);if(items.length<100){complete=true;break}
 }
 if(!complete||!all.length)throw Error("CATALOGO_MODALIDADES_INCOMPLETO");
 const seen=new Set(),writes=[env.DB.prepare("UPDATE evo_modalities_catalog SET is_active=0 WHERE unit=?").bind(unit)];
 for(const x of all){
  const id=String(x?.idActivity??x?.idActivitie??x?.id??"").trim(),name=String(x?.nameActivity??x?.name??x?.description??x?.activityName??"").trim();
  if(!/^\d+$/.test(id)||!name||name.length>250||seen.has(id))throw Error("MODALIDADE_INVALIDA");
  seen.add(id);const active=x?.active===false||x?.isActive===false||x?.inactive===true?0:1;
  writes.push(env.DB.prepare("INSERT INTO evo_modalities_catalog(unit,evo_activity_id,activity_name,is_active,raw_json,last_synced_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_activity_id) DO UPDATE SET activity_name=excluded.activity_name,is_active=excluded.is_active,raw_json=excluded.raw_json,last_synced_at=CURRENT_TIMESTAMP").bind(unit,id,name,active,JSON.stringify(x)));
 }
 writes.push(env.DB.prepare("INSERT INTO evo_modalities_catalog_sync(unit,last_success_at,last_count,last_requests) VALUES(?,CURRENT_TIMESTAMP,?,?) ON CONFLICT(unit) DO UPDATE SET last_success_at=excluded.last_success_at,last_count=excluded.last_count,last_requests=excluded.last_requests").bind(unit,all.length,requests));
 await env.DB.batch(writes);return {saved:all.length,requests};
}

async function runScheduledCatalogSync(env){
 const now=new Date();
 for(const kind of ["contract_catalog","service_catalog","modalities_catalog"]){
  const days=await loadScheduledWeekdays(env.DB,kind);
  const rows=(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind=?").bind(kind).all()).results||[];
  for(const row of rows){
   const unit=row.unit==="gym"?"gym":"bike";
   if(!scheduledDaysAllowed(days.get(unit)||[1,2,3,4,5,6],now))continue;
   let times=[];try{times=JSON.parse(row.times_json)}catch{}
   const due=await dueScheduledCombination(env.DB,kind,unit,times,now);if(!due)continue;
   const claim=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,?,?,'pending')").bind(unit,kind,due).run();
   if(!claim.meta?.changes)continue;
   let requests=0;
   try{
    if(kind==="modalities_catalog"){const result=await syncEvoModalities(env,unit);await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind=? AND scheduled_minute=?").bind(JSON.stringify(result),unit,kind,due).run();continue;}
    const cfg=await getEvoConfig(env,unit),auth={Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"};
    const all=[];
    if(kind==="contract_catalog"){
     const endpoint="/api/v3/membership?active=true&take=200&skip=0";
     const r=await fetch("https://evo-integracao-api.w12app.com.br"+endpoint,{headers:auth,signal:AbortSignal.timeout(20000)});requests++;
     await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'contract_catalog_schedule','GET',?,?,?)").bind(unit,"/api/v3/membership",r.status,r.ok?1:0).run();
     if(!r.ok)throw Error("EVO_HTTP_"+r.status);
     const data=await r.json(),list=Array.isArray(data?.lista)?data.lista:Array.isArray(data?.list)?data.list:Array.isArray(data)?data:null;
     if(!list||!list.length||list.length>200||Number(data?.qtde??list.length)!==list.length)throw Error("LISTA_CONTRATOS_INCOMPLETA");
     for(const x of list)all.push({id:x.idMembership??x.id,name:x.nameMembership??x.name??x.description??x.displayName,categoryId:x.idCategoryMembership??x.idMembershipCategory??x.categoryId??x.category?.id??null,category:x.categoryName??x.nameCategory??x.category?.name??"Sem categoria"});
    }else{
     let done=false;
     for(let skip=0;requests<20;skip+=50){
      const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v1/service?take=50&skip="+skip,{headers:auth,signal:AbortSignal.timeout(15000)});requests++;
      await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'services_catalog','GET',?,?,?)").bind(unit,"/api/v1/service",r.status,r.ok?1:0).run();
      if(!r.ok)throw Error("EVO_HTTP_"+r.status);
      const data=await r.json(),list=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.items)?data.items:null;
      if(!list||list.length>50)throw Error("SERVICOS_INVALIDOS");
      all.push(...list);if(list.length<50){done=true;break}
     }
     if(!done)throw Error("PAGINACAO_INCOMPLETA");
    }
    if(!all.length)throw Error("CATALOGO_VAZIO");
    const seen=new Set(),writes=[];
    for(const x of all){
     const id=String(kind==="contract_catalog"?x.id:x.idService??x.id??""),name=String(kind==="contract_catalog"?x.name:x.nameService??x.name??x.description??x.serviceName??"").trim();
     if(!/^\d+$/.test(id)||!name||name.length>250||seen.has(id))throw Error("CATALOGO_INVALIDO");
     seen.add(id);
     if(kind==="contract_catalog")writes.push(env.DB.prepare("INSERT INTO evo_contract_catalog(tenant_key,unit,evo_contract_id,contract_name,category_id,category_name,is_active,last_seen_at,last_synced_at,inactive_since) VALUES('club-pop',?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT(tenant_key,unit,evo_contract_id) DO UPDATE SET contract_name=excluded.contract_name,category_id=excluded.category_id,category_name=excluded.category_name,is_active=1,last_seen_at=CURRENT_TIMESTAMP,last_synced_at=CURRENT_TIMESTAMP,inactive_since=NULL").bind(unit,id,name,x.categoryId==null?null:String(x.categoryId),String(x.category||"Sem categoria")));
     else {const price=x.value??x.price??x.saleValue??null;writes.push(env.DB.prepare("INSERT INTO evo_service_catalog(unit,evo_service_id,service_name,price,is_active,raw_json,last_synced_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_service_id) DO UPDATE SET service_name=excluded.service_name,price=excluded.price,is_active=excluded.is_active,raw_json=excluded.raw_json,last_synced_at=CURRENT_TIMESTAMP").bind(unit,id,name,price===null?null:Number(price),x.inactive===true||x.active===false||x.isActive===false?0:1,JSON.stringify(x)))}
    }
    if(kind==="contract_catalog"){
     writes.push(env.DB.prepare("UPDATE evo_contract_catalog SET is_active=0,inactive_since=COALESCE(inactive_since,CURRENT_TIMESTAMP) WHERE tenant_key='club-pop' AND unit=? AND evo_contract_id NOT IN ("+all.map(()=>"?").join(",")+")").bind(unit,...Array.from(seen)));
     writes.push(env.DB.prepare("INSERT INTO evo_contract_catalog_sync(tenant_key,unit,last_attempt_at,last_success_at,last_result,last_count,last_error) VALUES('club-pop',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ok',?,NULL) ON CONFLICT(tenant_key,unit) DO UPDATE SET last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,last_result='ok',last_count=excluded.last_count,last_error=NULL").bind(unit,all.length));
    }else writes.push(env.DB.prepare("INSERT INTO evo_service_catalog_sync(unit,last_success_at,last_count) VALUES(?,CURRENT_TIMESTAMP,?) ON CONFLICT(unit) DO UPDATE SET last_success_at=CURRENT_TIMESTAMP,last_count=excluded.last_count").bind(unit,all.length));
    await env.DB.batch(writes);
    await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind=? AND scheduled_minute=?").bind(JSON.stringify({records:all.length,requests}),unit,kind,due).run();
   }catch(e){await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind=? AND scheduled_minute=?").bind(JSON.stringify({requests,error:String(e.message||e)}).slice(0,900),unit,kind,due).run()}
  }
 }
}
// Repair abandoned automatic-run records without triggering an EVO sync.
// A run with no completion record must never be reported as successful.
async function reconcileAbandonedAutomaticRuns(db){
  const rows=(await db.prepare("SELECT unit,kind,scheduled_minute FROM evo_sync_schedule_runs WHERE status='pending' AND kind IN ('attendance','contract','contract_catalog','service_catalog','modalities_catalog','instructor_link') AND updated_at<datetime('now','-45 minutes') LIMIT 60").all()).results||[];
  for(const row of rows){
    await db.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind=? AND scheduled_minute=? AND status='pending'").bind(JSON.stringify({error:'EXECUCAO_INTERROMPIDA_SEM_CONFIRMACAO',note:'Execução sem conclusão registrada; nenhuma requisição EVO foi realizada para corrigir o histórico'}),row.unit,row.kind,row.scheduled_minute).run();
  }
}
async function runScheduledStudentSync(env,forceUnit=null,forceKey=null) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  // Reconcile orphaned scheduled runs without calling EVO. An interrupted Worker can
  // leave a run pending even if the Vercel endpoint completed successfully.
  const orphaned=(await env.DB.prepare("SELECT unit,scheduled_minute,updated_at FROM evo_sync_schedule_runs WHERE kind='student' AND status='pending' AND updated_at<datetime('now','-30 minutes') LIMIT 40").all()).results||[];
  for(const job of orphaned){
    const state=await env.DB.prepare("SELECT last_sync_at,last_sync_status,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(job.unit).first();
    const completed=state?.last_sync_at&&Date.parse(String(state.last_sync_at).replace(' ','T')+'Z')>=Date.parse(String(job.updated_at).replace(' ','T')+'Z')&&String(state.last_sync_status||'').toLowerCase()==='ok';
    await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=? AND status='pending'").bind(completed?'done':'failed',JSON.stringify(completed?{recoveredFromSyncState:true,requests:Number(state.last_sync_requests||0),note:'Concluída segundo estado de sincronização; execução original interrompida'}:{error:'EXECUCAO_INTERROMPIDA_SEM_CONFIRMACAO',note:'Worker não registrou conclusão; não foram feitas novas chamadas EVO'}),job.unit,job.scheduled_minute).run();
  }
  const now=new Date(), parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),get=t=>parts.find(x=>x.type===t)?.value||"";
  const hm=get("hour")+":"+get("minute"), minuteKey=get("year")+"-"+get("month")+"-"+get("day")+"T"+hm;
  const rows=(forceUnit?[{unit:forceUnit,times_json:'[]'}]:(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='student'").all()).results||[]);const weekdays=await loadScheduledWeekdays(env.DB,"student");
  for(const row of rows){if(!forceUnit&&!scheduledDaysAllowed(weekdays.get(row.unit)||[1,2,3,4,5,6],now))continue;let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}const dueKey=forceKey||await dueScheduledCombination(env.DB,"student",row.unit,times,now);if(!dueKey)continue;const unit=row.unit==="gym"?"gym":"bike";
    const ins=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'student',?,'pending')").bind(unit,dueKey).run();if(!ins.meta?.changes)continue;
    const attemptStarted=Date.now();
    try{
      let runId="",requests=0,finished=false,last=null;
      for(let page=0;page<260;page++){
        const response=await fetch("https://loja-pop-green.vercel.app/api/evo-config?route=auto-sync-students-batch&unit="+unit,{method:"POST",headers:{"x-auto-sync-secret":String(env.AUTO_SYNC_SECRET||""),"Content-Type":"application/json"},body:JSON.stringify({unit,runId})});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||!data.ok)throw Error("ALUNOS_LOTE_HTTP_"+response.status+"_"+String(data.error||"FALHA").slice(0,120));
        requests+=Number(data.requests||0);runId=String(data.runId||runId);last=data;
        if(data.done){finished=true;break}
      }
      if(!finished)throw Error("ALUNOS_LOTES_NAO_CONCLUIDOS");
      await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=?").bind(JSON.stringify({requests,total:last?.total??null,runId}),unit,dueKey).run();
    }catch(e){
      const after=await env.DB.prepare("SELECT last_sync_at,last_sync_status,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(unit).first();
      if(after?.last_sync_at&&Date.parse(String(after.last_sync_at).replace(" ","T")+(/Z$|[+-]\d\d:\d\d$/.test(after.last_sync_at)?"":"Z"))>=attemptStarted&&String(after.last_sync_status||"").toLowerCase()==="ok"){
        await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=?").bind(JSON.stringify({http:null,error:null,total:null,requests:Number(after.last_sync_requests||0),recoveredFromSyncState:true,transportError:String(e.message||e).slice(0,180)}),unit,dueKey).run();
      }else await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=?").bind(String(e.message||e).slice(0,500),unit,dueKey).run();
    }
  }
}


async function backfillMissingAttendanceInstructors(env,manualUnit=null,manualRunKey=null){
  if(!env.DB)return;
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_instructor_backfill_attempts(unit TEXT NOT NULL,id_activity_session TEXT NOT NULL,attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL,detail TEXT,PRIMARY KEY(unit,id_activity_session))").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  const now=new Date(),today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
  const schedules=manualUnit?[{unit:manualUnit,times_json:'[]'}]:(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='instructor_link'").all()).results||[],weekdays=manualUnit?new Map():await loadScheduledWeekdays(env.DB,"instructor_link");
  for(const schedule of schedules){
    const unit=schedule.unit==="gym"?"gym":"bike";
    if(!manualUnit&&!scheduledDaysAllowed(weekdays.get(unit)||[1,2,3,4,5,6],now))continue;
    let times=[];try{times=JSON.parse(schedule.times_json||"[]")}catch{}
    const due=manualUnit?(manualRunKey||"manual-"+now.toISOString()+"-"+crypto.randomUUID()):await dueScheduledCombination(env.DB,"instructor_link",unit,times,now);if(!due)continue;
    const claim=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'instructor_link',?,'pending')").bind(unit,due).run();
    if(!claim.meta?.changes)continue;
    let checked=0,linked=0,requests=0,missing=0;
    try{
      // Only consult EVO for sessions without a verified instructor; never overwrite an existing name.
      const rows=(await env.DB.prepare("SELECT s.id_activity_session FROM evo_attendance_sessions s LEFT JOIN evo_instructor_backfill_attempts a ON a.unit=s.unit AND a.id_activity_session=s.id_activity_session WHERE s.unit=? AND s.activity_date>=date(?,'-14 days') AND s.activity_date<=? AND (s.instructor_name IS NULL OR trim(s.instructor_name)='') AND (a.id_activity_session IS NULL OR (a.status IN ('missing','error') AND a.attempted_at<datetime('now','-1 day'))) ORDER BY s.activity_date DESC,s.start_time DESC LIMIT 5").bind(unit,today,today).all()).results||[];
      if(rows.length){
        const cfg=await getEvoConfig(env,unit);
        for(const row of rows){
          checked++;
          const endpoint="/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(row.id_activity_session);
          try{
            const response=await fetch("https://evo-integracao-api.w12app.com.br"+endpoint,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"},signal:AbortSignal.timeout(15000)});requests++;
            await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'instructor_backfill','GET',?,?,?)").bind(unit,"/api/v1/activities/schedule/detail",response.status,response.ok?1:0).run();
            if(!response.ok)throw Error("EVO_HTTP_"+response.status);
            const payload=await response.json(),d=Array.isArray(payload)&&payload.length===1?payload[0]:payload;
            if(String(d?.idActivitySession??d?.idActivitieSession??"")!==String(row.id_activity_session))throw Error("SESSION_ID_MISMATCH");
            const instructor=attendanceInstructorName(d);
            if(instructor){const update=await env.DB.prepare("UPDATE evo_attendance_sessions SET instructor_name=? WHERE unit=? AND id_activity_session=? AND (instructor_name IS NULL OR trim(instructor_name)='')").bind(instructor,unit,row.id_activity_session).run();linked+=update.meta?.changes||0}
            else missing++;
            await env.DB.prepare("INSERT OR REPLACE INTO evo_instructor_backfill_attempts(unit,id_activity_session,attempted_at,status,detail) VALUES(?,?,CURRENT_TIMESTAMP,?,?)").bind(unit,row.id_activity_session,instructor?"found":"missing",instructor||"Professor ausente no detalhe").run();
          }catch(error){
            await env.DB.prepare("INSERT OR REPLACE INTO evo_instructor_backfill_attempts(unit,id_activity_session,attempted_at,status,detail) VALUES(?,?,CURRENT_TIMESTAMP,'error',?)").bind(unit,row.id_activity_session,String(error?.message||error).slice(0,200)).run();
          }
        }
      }
      await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='instructor_link' AND scheduled_minute=?").bind(JSON.stringify({checked,linked,missing,requests,manual:!!manualUnit}),unit,due).run();
    }catch(error){await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='instructor_link' AND scheduled_minute=?").bind(JSON.stringify({checked,linked,requests,error:String(error.message||error)}),unit,due).run()}
  }
}
async function memberSessionDetails(db,unit,id){
  const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
  const q=await db.prepare("SELECT attendance_date,start_time,activity_name,evo_status,synced_at,raw_json FROM evo_member_attendance_states WHERE unit=? AND evo_member_id=? AND attendance_date>=? AND attendance_date<? ORDER BY attendance_date DESC,start_time DESC LIMIT 200").bind(unit,String(id),month+'-01',month+'-32').all();
  return {month,partial:true,items:(q.results||[]).map(r=>{let raw={};try{raw=JSON.parse(r.raw_json)}catch{}const aid=Number(raw.idActivitie??raw.idActivity),service=unit==='bike'&&[28475,28625].includes(aid);return {date:r.attendance_date,time:r.start_time,activity:r.activity_name,status:r.evo_status,updatedAt:r.synced_at,category:service?'Serviços':unit==='bike'&&(aid===17413||r.activity_name==='Bike Pop')?'Aulas':'Outras atividades',replacement:typeof raw.isReplacement==='boolean'?raw.isReplacement:null}})};
}

async function runScheduledReservationSync(env) {
  await ensureReservationSchema(env.DB);
  const rows=(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='reservation'").all()).results||[];
  const days=await loadScheduledWeekdays(env.DB,'reservation'),now=new Date();
  for(const row of rows){
    if(!['bike','gym'].includes(row.unit)||!scheduledDaysAllowed(days.get(row.unit)||[1,2,3,4,5,6],now))continue;
    let times=[];try{times=JSON.parse(row.times_json)}catch{}
    const due=await dueScheduledCombination(env.DB,"reservation",row.unit,times,now);
    if(due)await startReservationSync(env.DB,row.unit,due,false,now);
  }
  // Continue existing work even after its scheduled minute, without a browser open.
  for(const unit of ['bike','gym'])await processReservationSync(env,unit,getEvoConfig);
}

async function runScheduledAttendanceSync(env,forceUnit=null,forceKey=null,forceDate=null) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  const now=new Date(), parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),get=t=>parts.find(x=>x.type===t)?.value||"";
  const hm=get("hour")+":"+get("minute"), date=forceDate||get("year")+"-"+get("month")+"-"+get("day"), minuteKey=date+"T"+hm;
  const rows=(forceUnit?[{unit:forceUnit,times_json:'[]'}]:(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='attendance'").all()).results||[]);const weekdays=await loadScheduledWeekdays(env.DB,"attendance");
  for(const row of rows){if(!forceUnit&&!scheduledDaysAllowed(weekdays.get(row.unit)||[1,2,3,4,5,6],now))continue;let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}const dueKey=forceKey||await dueScheduledCombination(env.DB,"attendance",row.unit,times,now);if(!dueKey)continue;const unit=row.unit==="gym"?"gym":"bike";
    const ins=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'attendance',?,'pending')").bind(unit,dueKey).run();if(!ins.meta?.changes)continue;
    let requests=0,classesFound=0,newClasses=0,saved=0;
    try{
      const cfg=await getEvoConfig(env,unit);
      const evo=async (url,purpose)=>{requests++;const u=new URL(url),r=await fetch(u.href,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"}});try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,?,?)").bind(unit,purpose,u.pathname,r.status,r.ok?1:0).run()}catch{}return r};
      const sr=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+encodeURIComponent(date)+"&showFullWeek=false&onlyAvailables=false&take=100","schedule");if(!sr.ok)throw new Error("EVO_GRADE_HTTP_"+sr.status);
      const raw=await sr.json(),list=Array.isArray(raw)?raw:(Array.isArray(raw?.data)?raw.data:[]),sessions=[],diagnostic={returned:list.length,dateMatch:0,status6:0,validId:0,sample:[]};
      for(const s of list){const d=String(s?.activityDate||s?.date||"").slice(0,10),id=s?.idAtividadeSessao??s?.idActivitySession??s?.idActivitieSession,dm=d===date,st6=[4,6].includes(Number(s?.status)),vi=Number.isSafeInteger(Number(id))&&Number(id)>0;if(dm)diagnostic.dateMatch++;if(st6)diagnostic.status6++;if(vi)diagnostic.validId++;if(diagnostic.sample.length<5)diagnostic.sample.push({date:d,status:s?.status??null,id:id??null});if(dm&&st6&&vi)sessions.push({id:String(id),date:d})}
      // Reaproveita a mesma resposta da grade EVO para a Visao dos Professores.
      // Nunca transforma uma aula futura em presenca nem substitui aulas ja finalizadas.
      const futureStatements=[];let futureDetailLookups=0;
      for(const item of list){
        const day=String(item?.activityDate||item?.date||"").slice(0,10);
        const sid=item?.idAtividadeSessao??item?.idActivitySession??item?.idActivitieSession;
        if(day!==date||!Number.isSafeInteger(Number(sid))||Number(sid)<=0||[4,6].includes(Number(item?.status)))continue;
        let instructor=attendanceInstructorName(item);
        // Algumas grades EVO omitem o professor. Só consulta o detalhe quando
        // existe reserva no D1 para a mesma aula; nunca deduz pelo horário.
        if(!instructor && String(sid) && futureDetailLookups<3){
          const known=await env.DB.prepare("SELECT 1 AS found FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? LIMIT 1").bind(unit,String(sid)).first();
          if(known){
            futureDetailLookups++;
            const detailResponse=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(String(sid)),"future_instructor_detail");
            if(detailResponse.ok){
              const payload=await detailResponse.json(),detail=Array.isArray(payload)?payload[0]:payload;
              if(String(detail?.idActivitySession??detail?.idActivitieSession??detail?.idAtividadeSessao??"")===String(sid))instructor=attendanceInstructorName(detail);
            }
          }
        }
        const rawTime=String(item?.startTime||item?.time||item?.activityStartTime||"").trim();
        const match=rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
        if(!instructor||!match)continue;
        let hour=Number(match[1]);if(match[3])hour=hour%12+(match[3].toUpperCase()==="PM"?12:0);
        if(hour>23||Number(match[2])>59)continue;
        const startTime=String(hour).padStart(2,"0")+":"+match[2];
        const activity=String(item?.name||item?.activityName||item?.activity?.name||"Aula").slice(0,200);
        futureStatements.push(env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,instructor_name,synced_at) VALUES(?,?,?,?,?,'scheduled',0,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,instructor_name=excluded.instructor_name,synced_at=CURRENT_TIMESTAMP WHERE evo_attendance_sessions.status='scheduled'").bind(unit,String(sid),day,startTime,activity,instructor));
      }
      for(let i=0;i<futureStatements.length;i+=40)await env.DB.batch(futureStatements.slice(i,i+40));
      const unique=[...new Map(sessions.map(x=>[x.id,x])).values()];classesFound=unique.length;
      let done=new Set();if(unique.length){const ids=unique.map(x=>x.id),q=await env.DB.prepare("SELECT id_activity_session FROM evo_attendance_sessions WHERE unit=? AND status='done' AND id_activity_session IN ("+ids.map(()=>"?").join(",")+")").bind(unit,...ids).all();done=new Set((q.results||[]).map(x=>String(x.id_activity_session)))}
      const pending=unique.filter(x=>!done.has(x.id));newClasses=pending.length;
      for(const s of pending){const dr=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(s.id),"checkin_detail");if(!dr.ok)throw new Error("EVO_DETALHE_HTTP_"+dr.status);const payload=await dr.json(),d=Array.isArray(payload)&&payload.length===1?payload[0]:payload;if(!d||String(d.idActivitySession)!==s.id||![4,6].includes(Number(d.status))||!Array.isArray(d.enrollments))throw new Error("DETALHE_AULA_INVALIDO");
        const mt=String(d.startTime||"").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);if(!mt)throw new Error("HORARIO_AULA_INVALIDO");let h=Number(mt[1]);if(mt[3])h=h%12+(mt[3].toUpperCase()==="PM"?12:0);const st=String(h).padStart(2,"0")+":"+mt[2],stm=[],absenceStatements=[];if(!attendanceClassFinished(date,st,now))continue;
        for(const e of d.enrollments){if(e.removed===true||!Number.isSafeInteger(e.idMember)||e.idMember<=0)continue;
        const state=Number(e.status);if(e.status!==null&&e.status!==undefined&&[0,1,2].includes(state)){absenceStatements.push(env.DB.prepare("INSERT INTO evo_member_attendance_states(unit,evo_member_id,id_activity_session,attendance_date,start_time,activity_name,evo_status,justified_absence,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,id_activity_session) DO UPDATE SET attendance_date=excluded.attendance_date,start_time=excluded.start_time,activity_name=excluded.activity_name,evo_status=excluded.evo_status,justified_absence=excluded.justified_absence,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP").bind(unit,String(e.idMember),s.id,date,st,String(d.name||""),state,state===2?1:0,JSON.stringify({...e,idActivity:d.idActivity,isReplacement:e.replacement})));}if(e.status!==0)continue;const mid=String(e.idMember),x={id:mid,date,startTime:st,activity:String(d.name||"").slice(0,200),idActivitySession:s.id,presenca:true,isFinalized:true};stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,mid,s.id,date,st,x.activity,s.id,JSON.stringify(x)))}
        if(stm.length)for(let i=0;i<stm.length;i+=40)await env.DB.batch(stm.slice(i,i+40));if(absenceStatements.length)for(let i=0;i<absenceStatements.length;i+=40)await env.DB.batch(absenceStatements.slice(i,i+40));saved+=stm.length;
        await env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,instructor_name,synced_at) VALUES(?,?,?,?,?, 'done',?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,status='done',attendance_count=excluded.attendance_count,instructor_name=COALESCE(excluded.instructor_name,evo_attendance_sessions.instructor_name),synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,date,st,String(d.name||"").slice(0,200),stm.length,attendanceInstructorName(d)).run();
      }
      await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='attendance' AND scheduled_minute=?").bind(JSON.stringify({date,requests,classesFound,newClasses,presencesSaved:saved,diagnostic}).slice(0,1000),unit,dueKey).run();
    }catch(e){await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='attendance' AND scheduled_minute=?").bind(JSON.stringify({date,requests,classesFound,newClasses,presencesSaved:saved,error:String(e.message||e)}).slice(0,1000),unit,dueKey).run()}
  }
}



async function whatsappNewStudentsTick(env){
 if(!env.DB||!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return;
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_new_config(unit TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,flows_json TEXT NOT NULL DEFAULT '{}',times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_new_dispatch(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,send_date TEXT NOT NULL,evo_member_id TEXT NOT NULL,category TEXT NOT NULL,scheduled_time TEXT NOT NULL,flow_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'reserved',sent_at TEXT,error TEXT,UNIQUE(unit,evo_member_id))").run();
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),g=k=>parts.find(p=>p.type===k)?.value||"",date=g("year")+"-"+g("month")+"-"+g("day"),time=g("hour")+":"+g("minute");
 const configs=(await env.DB.prepare("SELECT * FROM club_whatsapp_new_config WHERE enabled=1").all()).results||[];
 if(!configs.length)return;
 const chat=await env.DB.prepare("SELECT * FROM club_chatpro_config WHERE id=1").first();
 if(!chat?.enabled||!chat.api_key_cipher||!chatproSafeApiUrl(chat.base_url))return;
 const allowed=JSON.parse(chat.enabled_units||'["bike"]');
 const bytes=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),c=>c.charCodeAt(0)),key=await crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["decrypt"]);
 const [iv,cipher]=chat.api_key_cipher.split("."),dec=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
 const token=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:dec(iv),additionalData:new TextEncoder().encode("chatpro:config")},key,dec(cipher)));
 const call=async(path,method="GET",body)=>{const r=await fetch(chat.base_url.replace(/\/$/,"")+path,{method,redirect:"manual",headers:{"API-KEY":token,Accept:"application/json","Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("CHATPRO_HTTP_"+r.status);return r.json()};
 for(const cfg of configs){if(!allowed.includes(cfg.unit))continue;const times=JSON.parse(cfg.times_json||"[]"),flows=JSON.parse(cfg.flows_json||"{}");if(!times.includes(time))continue;
  const all=(await env.DB.prepare("SELECT mm.evo_member_id id,COALESCE(json_extract(mm.raw_json,'$.registerDate'),'') registered,CASE WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='5' OR upper(c.membership_name) LIKE '%TOTALPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'totalpass' WHEN EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND (c.category_id='4' OR upper(c.membership_name) LIKE '%WELLHUB%' OR upper(c.membership_name) LIKE '%GYMPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) THEN 'wellhub' ELSE 'common' END category,COALESCE(m.first_name,'') first_name,COALESCE(m.last_name,'') last_name,mm.contacts_json contacts FROM evo_member_master mm LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) WHERE mm.unit=? AND mm.is_current=1 AND EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=mm.unit AND c.evo_member_id=mm.evo_member_id AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours')))").bind(cfg.unit).all()).results||[],today=all.filter(p=>String(p.registered||"").slice(0,10)===date),slot=times.indexOf(time);
  for(let i=0;i<today.length;i++){if(i%times.length!==slot)continue;const p=today[i],flow=String(flows[p.category]||"");if(!/^\d+$/.test(flow))continue;
   let phone="";try{const contacts=JSON.parse(p.contacts||"[]"),cell=contacts.find(x=>String(x.contactType||"").toLowerCase()==="cellphone");phone=(String(cell?.ddi||"55")+String(cell?.description||"")).replace(/\D/g,"");if(phone.length<12||phone.length>13)phone=""}catch{}
   if(!phone)continue;
   const claim=await env.DB.prepare("INSERT OR IGNORE INTO club_whatsapp_new_dispatch(unit,send_date,evo_member_id,category,scheduled_time,flow_id,status) VALUES(?,?,?,?,?,?,'reserved')").bind(cfg.unit,date,String(p.id),p.category,time,flow).run();if(!claim.meta?.changes)continue;
   try{const sub=await call("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/");if(!sub?.id)throw Error("CONTATO_NAO_ENCONTRADO");await call("/subscriber/"+encodeURIComponent(String(sub.id))+"/send_flow/","POST",{flow:Number(flow)});await env.DB.prepare("UPDATE club_whatsapp_new_dispatch SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE unit=? AND evo_member_id=?").bind(cfg.unit,String(p.id)).run()}
   catch(e){await env.DB.prepare("UPDATE club_whatsapp_new_dispatch SET status='failed',error=? WHERE unit=? AND evo_member_id=?").bind(String(e.message||e).slice(0,300),cfg.unit,String(p.id)).run()}
  }
 }
}
async function whatsappBirthdayTick(env){
 if(!env.DB||!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return;
 const now=new Date(),parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now);
 const get=k=>parts.find(x=>x.type===k)?.value||"",date=get("year")+"-"+get("month")+"-"+get("day"),time=get("hour")+":"+get("minute");
 const configs=(await env.DB.prepare("SELECT unit,flow_id,times_json FROM club_whatsapp_birthday_config WHERE enabled=1").all()).results||[];
 if(!configs.length)return;
 const config=await env.DB.prepare("SELECT api_key_cipher,base_url,enabled,enabled_units FROM club_chatpro_config WHERE id=1").first();
 if(!config?.enabled||!config.api_key_cipher||!chatproSafeApiUrl(config.base_url))return;
 const allowed=JSON.parse(config.enabled_units||'["bike"]');
 const bytes=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),x=>x.charCodeAt(0));
 const key=await crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["decrypt"]);
 const [iv,cipher]=config.api_key_cipher.split(".");
 const dec=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
 const token=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:dec(iv),additionalData:new TextEncoder().encode("chatpro:config")},key,dec(cipher)));
 const call=async(path,method="GET",body)=>{const r=await fetch(config.base_url.replace(/\/$/,"")+path,{method,redirect:"manual",headers:{"API-KEY":token,Accept:"application/json","Content-Type":"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("CHATPRO_HTTP_"+r.status);return r.json()};
 for(const cfg of configs){
  if(!allowed.includes(cfg.unit)||!/^\d+$/.test(cfg.flow_id))continue;
  let times;try{times=JSON.parse(cfg.times_json)}catch{continue}
  if(!Array.isArray(times)||!times.length)continue;
  times=[...new Set(times.filter(x=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(x))))].sort();
  const due=times.filter(x=>x<=time);
  if(!due.length)continue;
  const people=(await env.DB.prepare("SELECT DISTINCT m.id,mm.contacts_json FROM members m JOIN evo_member_master mm ON mm.unit=? AND mm.is_current=1 AND CAST(mm.evo_member_id AS TEXT)=CAST(m.evo_member_id AS TEXT) WHERE m.status='ACTIVE' AND strftime('%m-%d',COALESCE(json_extract(mm.personal_json,'$.birthDate'),json_extract(mm.personal_json,'$.dateBirth'),json_extract(mm.raw_json,'$.birthDate')))=substr(?,6,5) AND EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=? AND CAST(c.evo_member_id AS TEXT)=CAST(m.evo_member_id AS TEXT) AND lower(c.membership_status) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=?)) ORDER BY m.id").bind(cfg.unit,date,cfg.unit,date).all()).results||[];
  const pending=[];
  for(let index=0;index<times.length;index++){
   const scheduledTime=times[index];
   if(scheduledTime>time)continue;
   for(let i=index;i<people.length;i+=times.length)pending.push({person:people[i],scheduledTime});
  }
  for(const job of pending){
   const p=job.person,scheduledTime=job.scheduledTime;
   let phone="";try{const contacts=JSON.parse(p.contacts_json||"[]");const cell=contacts.find(x=>String(x.contactType||"").toLowerCase()==="cellphone");phone=String(cell?.ddi||"55")+String(cell?.description||"").replace(/\D/g,"");phone=phone.replace(/\D/g,"");if(phone.length<12||phone.length>13)phone=""}catch{}
   if(!phone)continue;
   const claim=await env.DB.prepare("INSERT OR IGNORE INTO club_whatsapp_birthday_dispatch(unit,send_date,member_id,scheduled_time,flow_id,status) VALUES(?,?,?,?,?,'reserved')").bind(cfg.unit,date,p.id,scheduledTime,cfg.flow_id).run();
   if(!claim.meta?.changes)continue;
   try{const sub=await call("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/");if(!sub?.id)throw Error("CONTATO_NAO_ENCONTRADO");await call("/subscriber/"+encodeURIComponent(String(sub.id))+"/send_flow/","POST",{flow:Number(cfg.flow_id)});await env.DB.prepare("UPDATE club_whatsapp_birthday_dispatch SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE unit=? AND send_date=? AND member_id=?").bind(cfg.unit,date,p.id).run()}
   catch(e){await env.DB.prepare("UPDATE club_whatsapp_birthday_dispatch SET status='failed',error=? WHERE unit=? AND send_date=? AND member_id=?").bind(String(e.message||e).slice(0,300),cfg.unit,date,p.id).run()}
  }
 }
}

async function runScheduledRegistrationSync(env,kind="opportunity"){
 const db=env.DB,now=new Date(),days=await loadScheduledWeekdays(db,kind);
 const rows=(await db.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='"+kind+"'").all()).results||[];
 for(const row of rows){
  const unit=row.unit;if(!["bike","gym"].includes(unit)||!scheduledDaysAllowed(days.get(unit)||[1,2,3,4,5,6],now))continue;
  let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}
  const due=await dueScheduledCombination(db,kind,unit,times,now);if(!due)continue;
  const claim=await db.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'"+kind+"',?,'pending')").bind(unit,due).run();
  if(!claim.meta?.changes)continue;
  let requests=0,found=0,saved=0;
  try{
   const cfg=await getEvoConfig(env,unit),day=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(now),all=[];
   for(let skip=0;skip<500;skip+=50){
    const endpoint=(kind==="client"?"/api/v2/members":"/api/v1/prospects")+"?registerDateStart="+day+"&registerDateEnd="+day+"&take=50&skip="+skip;
    const response=await fetch("https://evo-integracao-api.w12app.com.br"+endpoint,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(20000)});
    requests++;
    await db.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'registration_schedule','GET',?,?,?)").bind(unit,kind==="client"?"/api/v2/members":"/api/v1/prospects",response.status,response.ok?1:0).run();
    if(!response.ok)throw Error("EVO_HTTP_"+response.status);
    const data=await response.json(),list=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.items)?data.items:null;
    if(!list)throw Error("FORMATO_EVO_INVALIDO");all.push(...list);if(list.length<50)break;
   }
   found=all.length;
   await db.prepare("CREATE TABLE IF NOT EXISTS evo_daily_registrations (unit TEXT NOT NULL,category TEXT NOT NULL,evo_id TEXT NOT NULL,register_day TEXT NOT NULL,register_at TEXT,display_name TEXT,payload_json TEXT NOT NULL,first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,category,evo_id))").run();
   for(const m of all){
    const id=String(m?.idMember??m?.idProspect??m?.id??""),date=String(m?.registerDate??m?.registrationDate??m?.createdAt??m?.createDate??"");
    const valid=/^\d{4}-\d{2}-\d{2}/.test(date)?date.slice(0,10)===day:/^\d{2}\/\d{2}\/\d{4}/.test(date)?date.slice(6,10)+"-"+date.slice(3,5)+"-"+date.slice(0,2)===day:false;
    if(!id||id.length>100||!valid)continue;
    const name=[m?.firstName??m?.name??"",m?.lastName??""].filter(Boolean).join(" ").slice(0,200);
    await db.prepare("INSERT INTO evo_daily_registrations(unit,category,evo_id,register_day,register_at,display_name,payload_json) VALUES(?,'"+kind+"',?,?,?,?,?) ON CONFLICT(unit,category,evo_id) DO UPDATE SET register_day=excluded.register_day,register_at=excluded.register_at,display_name=excluded.display_name,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(unit,id,day,date,name,JSON.stringify(m)).run();saved++;
   }
   await db.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='"+kind+"' AND scheduled_minute=?").bind(JSON.stringify({manual:false,requests,found,saved}),unit,due).run();
  }catch(e){
   await db.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='"+kind+"' AND scheduled_minute=?").bind(JSON.stringify({manual:false,requests,found,saved,error:String(e.message||e).slice(0,180)}),unit,due).run();
  }
 }
}
export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.all([popDrawTick(env),journeyAutomationTick(env,journeyChatproAdapters(env)),reconcileAbandonedAutomaticRuns(env.DB),runScheduledStudentSync(env).then(()=>runScheduledContractSync(env)).then(()=>runScheduledAttendanceSync(env)).then(()=>luckyDrawTick(env,{generate:async(p,skip)=>{const r=await generatePromotionBatch(new Request('https://internal/promotion-numbers/admin/generate-batch',{method:'POST',headers:{'Content-Type':'application/json','x-auto-sync-secret':env.AUTO_SYNC_SECRET},body:JSON.stringify({promotionId:p.id,take:10,...(skip==null?{}:{skip})})}),env);const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'GERACAO_HTTP_'+r.status);return d;},profile:(id,unit,beforeRequest)=>evoProfile(env,id,unit,{beforeRequest}),attendance:(id,start,end,unit,beforeRequest)=>evoAttendance(env,id,start,end,null,unit,{beforeRequest,paginate:true}),syncNow:async(kind,unit,key,date)=>{if(kind==="student")await runScheduledStudentSync(env,unit,key);else if(kind==="contract")await runScheduledContractSync(env,unit,key);else if(kind==="attendance")await runScheduledAttendanceSync(env,unit,key,date);const row=await env.DB.prepare("SELECT status,detail FROM evo_sync_schedule_runs WHERE unit=? AND kind=? AND scheduled_minute=?").bind(unit,kind,key).first();if(row?.status!=="done")throw Error("SINCRONIZACAO_"+kind+"_"+unit+"_"+String(row?.detail||row?.status||"SEM_RESULTADO").slice(0,180));return row;}})),runScheduledRegistrationSync(env,"opportunity"),runScheduledRegistrationSync(env,"client"),runScheduledReservationSync(env),runScheduledCatalogSync(env),backfillMissingAttendanceInstructors(env),voucherBatchTick(env),currencyRewardTick(env),whatsappBirthdayTick(env),whatsappNewStudentsTick(env),productSalesTick(env)])); },
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";

      const cors = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
          ? origin
          : "https://loja-pop-green.vercel.app",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const json = (data, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });






      // Authenticated first-party analytics; page-specific sessions, no EVO traffic.
      if(url.pathname==="/member/app-analytics"&&request.method==="POST"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));
        const unit=["bike","gym"].includes(b.unit)?b.unit:null;
        const sid=String(b.sessionId||"");
        const page=String(b.page||"").replace(/[^a-z0-9_-]/gi,"").slice(0,48);
        if(!unit||!page||!/^[a-f0-9-]{36}$/i.test(sid))return json({ok:false,error:"DADOS_INVALIDOS"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_app_page_sessions (session_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, unit TEXT NOT NULL, page TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, page_views INTEGER NOT NULL DEFAULT 1)").run();
        const now=Math.floor(Date.now()/1000);
        await env.DB.prepare("INSERT INTO club_app_page_sessions(session_id,member_id,unit,page,first_seen,last_seen) VALUES(?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen WHERE member_id=excluded.member_id AND unit=excluded.unit AND page=excluded.page").bind(sid,String(member.id),unit,page,now,now).run();
        return json({ok:true});
      }
      // Member access ledger for administrative Analytics. Uses existing login sessions
      // and first-party page activity; no EVO calls and no extra member polling.
      if(url.pathname==="/admin/member-accesses"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"})}catch{return json({ok:false,error:"AUTH_INDISPONIVEL"},502)}
        const au=await ar.json().catch(()=>({}));
        if(!ar.ok||au.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=url.searchParams.get("unit")||"club";
        if(!["bike","gym","club"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(unit!=="club"&&!(au.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        const limit=Math.min(100,Math.max(1,Number(url.searchParams.get("limit"))||10));
        const offset=Math.max(0,Number(url.searchParams.get("offset"))||0);
        const where=unit==="bike"?"WHERE m.evo_member_id IS NOT NULL":unit==="gym"?"WHERE m.gym_client_id IS NOT NULL":"";
        const query=`SELECT m.id,m.first_name,m.last_name,m.evo_member_id,m.gym_client_id,
          MIN(s.created_at) AS first_access,MAX(s.created_at) AS last_access,
          MAX(CASE WHEN s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS valid_session
          FROM members m JOIN auth_sessions s ON s.member_id=m.id ${where}
          GROUP BY m.id ORDER BY last_access DESC LIMIT ? OFFSET ?`;
        const rows=await env.DB.prepare(query).bind(limit,offset).all();
        // An unexpired login is NOT proof of being online. Activity must be recent.
        const now=Math.floor(Date.now()/1000);
        const list=[];
        for(const m of rows.results||[]){
          let lastActivity=null;
          try{
            const a=await env.DB.prepare("SELECT MAX(last_seen) AS seen FROM club_app_page_sessions WHERE member_id=?"+(unit==="club"?"":" AND unit=?")).bind(...(unit==="club"?[String(m.id)]:[String(m.id),unit])).first();
            lastActivity=a?.seen??null;
          }catch{}
          list.push({id:m.id,name:[m.first_name,m.last_name].filter(Boolean).join(" "),evoMemberId:m.evo_member_id,gymMemberId:m.gym_client_id,firstAccess:m.first_access,lastAccess:m.last_access,lastActivity:lastActivity?new Date(Number(lastActivity)*1000).toISOString():null,status:m.valid_session&&lastActivity&&Number(lastActivity)>=now-300?"online":"offline"});
        }
        // Aggregate independently from pagination: distinct members who have logged in.
        const summary=await env.DB.prepare(`SELECT COUNT(DISTINCT m.id) AS total,
          MAX(s.created_at) AS last_access
          FROM members m JOIN auth_sessions s ON s.member_id=m.id ${where}`).first();
        const latest=list[0]||null;
        return json({ok:true,unit,limit,offset,students:list,
          summary:{total:Number(summary?.total||0),lastStudent:latest?.name||null,lastAccess:summary?.last_access||null},
          updatedAt:new Date().toISOString(),onlineRule:"authenticated activity in last 5 minutes",historicalNote:"First and last access derived from existing auth_sessions"});
      }

      if(url.pathname==="/admin/app-analytics"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"})}catch{return json({ok:false,error:"AUTH_INDISPONIVEL"},502)}
        const au=await ar.json().catch(()=>({}));
        if(!ar.ok||au.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=url.searchParams.get("unit")||"club",days=Math.min(30,Math.max(1,Number(url.searchParams.get("days"))||1));
        if(!["bike","gym","club"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(unit!=="club"&&!(au.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_app_page_sessions (session_id TEXT PRIMARY KEY, member_id TEXT NOT NULL, unit TEXT NOT NULL, page TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, page_views INTEGER NOT NULL DEFAULT 1)").run();
        const now=Math.floor(Date.now()/1000),from=now-days*86400,filter=unit==="club"?"":" AND unit=?";
        const args=unit==="club"?[from]:[from,unit];
        const rows=await env.DB.prepare("SELECT session_id,member_id,unit,page,first_seen,last_seen,page_views FROM club_app_page_sessions WHERE last_seen>=?"+filter+" ORDER BY last_seen DESC LIMIT 10000").bind(...args).all();
        const list=rows.results||[],active=list.filter(x=>x.last_seen>=now-30);
        const unique=a=>new Set(a.map(x=>x.member_id)).size;
        const average=a=>a.length?Math.round(a.reduce((sum,x)=>sum+Math.max(0,x.last_seen-x.first_seen),0)/a.length):0;
        const groups=new Map();
        for(const x of list){if(!groups.has(x.page))groups.set(x.page,[]);groups.get(x.page).push(x)}
        const pages=Array.from(groups,([name,items])=>({name,online:unique(items.filter(x=>x.last_seen>=now-30)),visitors:unique(items),visits:items.length,averageSeconds:average(items)})).sort((a,b)=>b.visits-a.visits);
        return json({ok:true,unit,days,online:unique(active),visitors:unique(list),sessions:list.length,averageSeconds:average(list),pages,updatedAt:new Date().toISOString(),note:list.length===10000?"LIMITED_TO_10000_SESSIONS":null});
      }

      if(url.pathname === "/admin/media-token" || url.pathname === "/tv/upload" || url.pathname.startsWith("/tv/files/")) return partnerMedia(request,env,json,cors);

      // Partner TV campaigns: public active creatives, tracked QR redirects, authenticated reporting.
      if(url.pathname.startsWith("/tv/")||url.pathname==="/admin/tv-campaigns"){
        const route=url.pathname,unit=url.searchParams.get("unit")||"bike";
        const table=()=>env.DB.prepare("CREATE TABLE IF NOT EXISTS tv_campaign_events(id INTEGER PRIMARY KEY AUTOINCREMENT,campaign_id TEXT NOT NULL,kind TEXT NOT NULL,unit TEXT NOT NULL,visitor_key TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const config=async()=>{const c=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();return JSON.parse(c?.content_json||"{}")};
        function tvDriveId(value){try{const u=new URL(value);if(!["drive.google.com","docs.google.com"].includes(u.hostname))return "";const parts=u.pathname.split("/");const i=parts.indexOf("d");return (i>=0&&parts[i+1])||u.searchParams.get("id")||""}catch{return ""}}
        const campaigns=async()=>{const c=await config();return Array.isArray(c.partnerTvCampaigns)?c.partnerTvCampaigns:[]};
        const tvToday=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day};
        const eligible=(c,u)=>{const today=tvToday();return c.active!==false&&(c.unit==="club"||c.unit===u)&&(!c.startDate||String(c.startDate).slice(0,10)<=today)&&(!c.endDate||String(c.endDate).slice(0,10)>=today)};
        if(route==="/tv/media"&&request.method==="GET"){
          const id=url.searchParams.get("id")||"",fileId=tvDriveId(id);
          if(!fileId)return new Response("Arquivo inválido",{status:400,headers:cors});
          const allowed=(await campaigns()).some(c=>c.imageUrl===id&&["bike","gym"].some(u=>eligible(c,u)));
          if(!allowed)return new Response("Mídia indisponível",{status:404,headers:cors});
          try{const response=await fetch("https://drive.google.com/thumbnail?id="+encodeURIComponent(fileId)+"&sz=w2000",{redirect:"follow"});const type=response.headers.get("content-type")||"";
          if(!response.ok||!type.startsWith("image/"))return new Response("Imagem do Drive indisponível",{status:502,headers:cors});
          return new Response(response.body,{headers:{...cors,"Content-Type":type,"Cache-Control":"public,max-age=300","X-Content-Type-Options":"nosniff"}});
          }catch{return new Response("Falha ao carregar imagem",{status:502,headers:cors})}
        }
        if(route==="/tv/campaigns"&&request.method==="GET"){
          if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
          const all=await campaigns(),c=await config(),partners=c.partners||[];
          return json({ok:true,campaigns:all.filter(x=>eligible(x,unit)&&partners.some(p=>String(p.id)===String(x.partnerId)&&p.active!==false)).map(x=>({id:x.id,mediaType:x.mediaType === "video" ? "video" : "image",partnerName:partners.find(p=>String(p.id)===String(x.partnerId))?.name||"Parceiro",imageUrl:tvDriveId(x.imageUrl)?"/tv/media?id="+encodeURIComponent(x.imageUrl):x.imageUrl,cta:x.cta||"Aponte a câmera e saiba mais",footerColor:x.footerColor||"#ffffff",footerTextColor:x.footerTextColor||"#142334",seconds:Math.min(60,Math.max(5,Number(x.seconds)||10))}))});
        }
        if(route==="/tv/scan"&&request.method==="GET"){
          const id=url.searchParams.get("id")||"",all=await campaigns(),c=all.find(x=>x.id===id),content=await config(),partner=(content.partners||[]).find(p=>String(p.id)===String(c?.partnerId));
          if(!c||!partner||partner.active===false||!["bike","gym","club"].includes(c.unit)||!["bike","gym"].some(u=>eligible(c,u)))return new Response("Campanha indisponível",{status:404,headers:cors});
          let dest;try{dest=new URL(c.destinationUrl);if(dest.protocol!=="https:")throw Error()}catch{return new Response("Destino inválido",{status:400,headers:cors})}
          await table();const key=request.headers.get("cf-connecting-ip")||"unknown";const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key+"|"+new Date().toISOString().slice(0,10)+"|"+id));const visitor=Array.from(new Uint8Array(digest)).slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("");
          await env.DB.prepare("INSERT INTO tv_campaign_events(campaign_id,kind,unit,visitor_key) VALUES(?,'scan',?,?)").bind(id,c.unit,visitor).run();
          return Response.redirect(dest.href,302);
        }
        if(route==="/admin/tv-campaigns"||route==="/tv/impression"){
          const ck=request.headers.get("x-clubpop-admin-cookie")||"";
          if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
          let vr;try{vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck},cache:"no-store"})}catch{return json({ok:false,error:"AUTH_INDISPONIVEL"},502)}
          const user=await vr.json().catch(()=>({}));if(!vr.ok||!["admin","reception"].includes(user.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
          await table();
          if(route==="/tv/impression"&&request.method==="POST"){
            const body=await request.json().catch(()=>({})),id=String(body.id||"").slice(0,120),u=String(body.unit||"");
            if(!["bike","gym"].includes(u)||!(await campaigns()).some(x=>x.id===id&&eligible(x,u)))return json({ok:false,error:"CAMPANHA_INVALIDA"},400);
            await env.DB.prepare("INSERT INTO tv_campaign_events(campaign_id,kind,unit) VALUES(?,'impression',?)").bind(id,u).run();return json({ok:true});
          }
          if(route==="/admin/tv-campaigns"&&request.method==="GET"){
            if(user.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
            const month=url.searchParams.get("month")||new Date().toISOString().slice(0,7);
            if(!/^\\d{4}-\\d{2}$/.test(month))return json({ok:false,error:"MES_INVALIDO"},400);
            const result=await env.DB.prepare("SELECT campaign_id id,kind,COUNT(*) count,COUNT(DISTINCT CASE WHEN kind='scan' THEN visitor_key END) uniqueScans FROM tv_campaign_events WHERE substr(created_at,1,7)=? GROUP BY campaign_id,kind").bind(month).all();
            return json({ok:true,rows:result.results||[],month});
          }
        }
      }
      if(url.pathname==="/admin/lucky-draw-status")return luckyDrawStatus(request,env,url);
      if(url.pathname==="/admin/pop-draws")return popDrawAdmin(request,env,url);
      if(url.pathname.startsWith("/links-uteis/")) return usefulLinks(request,env,url);
      if(url.pathname==="/member/community-challenges") return communityChallenges(request,env,url);
      if(url.pathname==="/admin/aggregator-branch-default"&&["GET","PUT"].includes(request.method)){const signed=request.headers.get("x-clubpop-proxy-auth")||"";let admin=null;if(signed){const parts=signed.split(".");if(parts.length!==2||!env.AUTO_SYNC_SECRET)return json({ok:false,error:"NAO_AUTORIZADO"},403);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.AUTO_SYNC_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(parts[0])));const expected=Array.from(sig,b=>b.toString(16).padStart(2,"0")).join("");let diff=expected.length===parts[1].length?0:1;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^((parts[1].charCodeAt(i)||0));if(diff)return json({ok:false,error:"NAO_AUTORIZADO"},403);try{admin=JSON.parse(atob(parts[0].replace(/-/g,"+").replace(/_/g,"/")))}catch{return json({ok:false,error:"NAO_AUTORIZADO"},403)}if(!Number.isFinite(admin.t)||Math.abs(Date.now()-admin.t)>120000||admin.role!=="admin"||admin.unit!==String(url.searchParams.get("unit")||"bike")||!Array.isArray(admin.units))return json({ok:false,error:"NAO_AUTORIZADO"},403)}else{const cookie=request.headers.get("x-clubpop-admin-cookie")||"";if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}admin=await ar.json().catch(()=>({}));if(!ar.ok||admin.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403)};const unit=String(url.searchParams.get("unit")||"");if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},403);await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_branch_defaults(unit TEXT PRIMARY KEY,branch_code TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();if(request.method==="GET"){const row=await env.DB.prepare("SELECT branch_code FROM aggregator_branch_defaults WHERE unit=?").bind(unit).first();return json({ok:true,branchCode:row?.branch_code||""})}const body=await request.json().catch(()=>({})),code=String(body.branchCode||"").trim();if(!/^\d{1,12}$/.test(code))return json({ok:false,error:"ID_FILIAL_INVALIDO"},400);await env.DB.prepare("INSERT INTO aggregator_branch_defaults(unit,branch_code,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET branch_code=excluded.branch_code,updated_at=CURRENT_TIMESTAMP").bind(unit,code).run();return json({ok:true,branchCode:code})}
      // Central de Vendas dos Agregadores: auditoria somente no D1, sem chamadas EVO.
      if(url.pathname==="/admin/aggregator-sales-batch"&&["GET","POST"].includes(request.method)){const signed=request.headers.get("x-clubpop-proxy-auth")||"";let admin=null;if(signed){const parts=signed.split(".");if(parts.length!==2||!env.AUTO_SYNC_SECRET)return json({ok:false,error:"NAO_AUTORIZADO"},403);const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.AUTO_SYNC_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(parts[0])));const expected=Array.from(sig,b=>b.toString(16).padStart(2,"0")).join("");let diff=expected.length===parts[1].length?0:1;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^((parts[1].charCodeAt(i)||0));if(diff)return json({ok:false,error:"NAO_AUTORIZADO"},403);try{admin=JSON.parse(atob(parts[0].replace(/-/g,"+").replace(/_/g,"/")))}catch{return json({ok:false,error:"NAO_AUTORIZADO"},403)}if(!Number.isFinite(admin.t)||Math.abs(Date.now()-admin.t)>120000||admin.role!=="admin"||admin.unit!==String(url.searchParams.get("unit")||"bike")||!Array.isArray(admin.units))return json({ok:false,error:"NAO_AUTORIZADO"},403)}else{const cookie=request.headers.get("x-clubpop-admin-cookie")||"";if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}admin=await ar.json().catch(()=>({}));if(!ar.ok||admin.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403)};const unit=String(url.searchParams.get("unit")||"bike"),month=String(url.searchParams.get("month")||"2026-09");if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit)||!/^\d{4}-\d{2}$/.test(month))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_sales_batches(unit TEXT NOT NULL,competence TEXT NOT NULL,rows_json TEXT NOT NULL,audit_json TEXT,official INTEGER NOT NULL DEFAULT 1,saved_by TEXT,saved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,competence))").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_sales_history(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,competence TEXT NOT NULL,origin TEXT,total INTEGER NOT NULL DEFAULT 0,success INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_sales_evo_returns(unit TEXT NOT NULL,competence TEXT NOT NULL,origin TEXT NOT NULL,cpf TEXT NOT NULL,value_cents INTEGER NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,competence,origin,cpf,value_cents))").run();if(request.method==="GET"){const b=await env.DB.prepare("SELECT unit,competence,rows_json,audit_json,official,saved_by,saved_at,updated_at FROM aggregator_sales_batches WHERE unit=? AND competence=?").bind(unit,month).first(),h=await env.DB.prepare("SELECT * FROM aggregator_sales_history WHERE unit=? AND competence=? ORDER BY id DESC LIMIT 30").bind(unit,month).all();const ev=await env.DB.prepare("SELECT origin,cpf,value_cents,status,reason,checked_at FROM aggregator_sales_evo_returns WHERE unit=? AND competence=?").bind(unit,month).all();return json({ok:true,batch:b?{...b,rows:JSON.parse(b.rows_json||"[]"),audit:b.audit_json?JSON.parse(b.audit_json):null}:null,history:h.results||[],evoReturns:ev.results||[]})}const b=await readJson(request),rows=Array.isArray(b.rows)?b.rows.slice(0,3000):[];if(String(b.action)==="close_zero_sales"){const origin=String(b.origin||"");if(!["Wellhub","TotalPass"].includes(origin))return json({ok:false,error:"ORIGEM_INVALIDA"},400);const official=await env.DB.prepare("SELECT rows_json,audit_json FROM aggregator_sales_batches WHERE unit=? AND competence=?").bind(unit,month).first();if(!official)return json({ok:false,error:"LOTE_NAO_SALVO"},400);const audited=JSON.parse(official.audit_json||"{}").rows||[];const source=audited.length?audited.filter(x=>x.origin===origin&&Number(x.value)===0):JSON.parse(official.rows_json||"[]").filter(x=>x.origin===origin&&Number(x.value)===0);const allowed=new Set(source.map(x=>String(x.d1Cpf||x.cpf||"").replace(/\D/g,"").padStart(11,"0")));let closed=0;for(const e of (Array.isArray(b.entries)?b.entries:[]).slice(0,3000)){const cpf=String(e.cpf||"").replace(/\D/g,"").padStart(11,"0");if(!allowed.has(cpf))continue;await env.DB.prepare("INSERT INTO aggregator_sales_evo_returns(unit,competence,origin,cpf,value_cents,status,reason,checked_at) VALUES(?,?,?,?,0,'zero_closed','Baixa administrativa: valor zerado, sem venda EVO',CURRENT_TIMESTAMP) ON CONFLICT(unit,competence,origin,cpf,value_cents) DO UPDATE SET status=excluded.status,reason=excluded.reason,checked_at=CURRENT_TIMESTAMP WHERE aggregator_sales_evo_returns.status!='success'").bind(unit,month,origin,cpf).run();closed++}return json({ok:closed>0,closed,error:closed?undefined:"NENHUM_REGISTRO_ZERADO_CORRESPONDENTE"})}if(String(b.action)==="import_evo_return"){const origin=String(b.origin||"");if(!["Wellhub","TotalPass"].includes(origin))return json({ok:false,error:"ORIGEM_INVALIDA"},400);const entries=Array.isArray(b.entries)?b.entries.slice(0,3000):[];if(!entries.length)return json({ok:false,error:"RETORNO_VAZIO"},400);const official=await env.DB.prepare("SELECT rows_json,audit_json FROM aggregator_sales_batches WHERE unit=? AND competence=?").bind(unit,month).first();if(!official)return json({ok:false,error:"SALVE_LOTE_OFICIAL_ANTES_DA_CONFERENCIA"},400);const normCpf=x=>{const digits=String(x??"").replace(/\D/g,"");return digits?digits.padStart(11,"0"):""};const audited=JSON.parse(official.audit_json||"{}").rows||[];const source=audited.length?audited.filter(x=>x.origin===origin&&Number(x.value)>0):JSON.parse(official.rows_json||"[]").filter(x=>x.origin===origin&&Number(x.value)>0);const saleKey=(cpf,cents)=>cpf+"|"+cents;const bySale=new Map();for(const x of source){const cpf=normCpf(x.d1Cpf||x.cpf),cents=Math.round(Number(x.value||0)*100),key=saleKey(cpf,cents),arr=bySale.get(key)||[];arr.push(x);bySale.set(key,arr)}const normName=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");const byNameValue=new Map();for(const row of source){const cents=Math.round(Number(row.value||0)*100);for(const name of [row.d1Name,row.name]){const k=normName(name)+"|"+cents;if(!normName(name))continue;const arr=byNameValue.get(k)||[];if(!arr.includes(row))arr.push(row);byNameValue.set(k,arr)}}const byAltCpf=new Map();for(const row of source){const cents=Math.round(Number(row.value||0)*100);for(const c of [row.cpf,row.d1Cpf]){if(!c)continue;const k=saleKey(normCpf(c),cents),arr=byAltCpf.get(k)||[];if(!arr.includes(row))arr.push(row);byAltCpf.set(k,arr)}}const inputCounts=new Map();for(const x of entries){const key=saleKey(normCpf(x.cpf),Math.round(Number(x.value||0)*100));inputCounts.set(key,(inputCounts.get(key)||0)+1)}let success=0,failed=0,unmatched=0,valueDifferences=0;const unmatchedExamples=[],matchedTargets=new Set();for(const x of entries){const cpf=normCpf(x.cpf),cents=Math.round(Number(x.value||0)*100),log=String(x.log||"").trim().slice(0,1000),key=saleKey(cpf,cents),primary=bySale.get(key)||[],alternates=byAltCpf.get(key)||[],named=byNameValue.get(normName(x.name)+"|"+cents)||[];const unique=arr=>arr.length===1?arr[0]:null;let target=unique(primary)||unique(alternates);if(!target&&primary.length===0&&alternates.length===0)target=unique(named);const matches=primary.length?primary:alternates.length?alternates:named;const targetCpf=target?normCpf(target.d1Cpf||target.cpf):"";const targetKey=target?saleKey(targetCpf,Math.round(Number(target.value||0)*100)):"";if(!log||!cents||!target||inputCounts.get(key)!==1||matchedTargets.has(targetKey)){unmatched++;if(unmatchedExamples.length<5)unmatchedExamples.push({cpf,value:x.value,name:x.name,reason:!log?"LOG IMPORTAÇÃO ausente":!cents?"Valor inválido":matches.length===0?"CPF e valor não encontrados no lote oficial":matches.length>1?"Mais de uma venda possível no lote oficial":"Registro repetido no retorno"});continue}matchedTargets.add(targetKey);const officialCents=Math.round(Number(target.value)*100);if(officialCents!==cents)valueDifferences++;const ok=log.trim().toLocaleLowerCase("pt-BR")==="venda importada com sucesso",status=ok?"success":"failed";await env.DB.prepare("INSERT INTO aggregator_sales_evo_returns(unit,competence,origin,cpf,value_cents,status,reason,checked_at) VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,competence,origin,cpf,value_cents) DO UPDATE SET status=excluded.status,reason=excluded.reason,checked_at=CURRENT_TIMESTAMP").bind(unit,month,origin,targetCpf,officialCents,status,log).run();if(ok)success++;else failed++}return json({ok:true,total:entries.length,success,failed,unmatched,valueDifferences,unmatchedExamples})}if(String(b.action)==="save_official"){if(!rows.length)return json({ok:false,error:"SEM_REGISTROS"},400);await env.DB.prepare("INSERT INTO aggregator_sales_batches(unit,competence,rows_json,audit_json,official,saved_by,saved_at,updated_at) VALUES(?,?,?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(unit,competence) DO UPDATE SET rows_json=excluded.rows_json,audit_json=excluded.audit_json,official=1,saved_by=excluded.saved_by,updated_at=CURRENT_TIMESTAMP").bind(unit,month,JSON.stringify(rows),b.audit?JSON.stringify(b.audit):null,String(admin.email||admin.name||"admin")).run();return json({ok:true,total:rows.length,competence:month})}return json({ok:false,error:"ACAO_INVALIDA"},400)}
      if(url.pathname==="/admin/tasks"&&["GET","POST"].includes(request.method)){
const requestedUnit=String(url.searchParams.get("unit")||"bike");let actor=await verifyProxyAuth(request,env,requestedUnit,"tasks");if(!actor){if(request.headers.get("x-clubpop-proxy-auth"))return json({ok:false,error:"NAO_AUTORIZADO"},403);const cookie=request.headers.get("x-clubpop-admin-cookie")||"";if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}actor=await ar.json().catch(()=>({}));if(!ar.ok)return json({ok:false,error:"NAO_AUTORIZADO"},403)}
if(!["admin","reception"].includes(actor.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
const unit=String(url.searchParams.get("unit")||"bike");
if(!["bike","gym","club"].includes(unit)||!(actor.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_PERMITIDA"},403);
const db=env.DB;
await db.prepare("CREATE TABLE IF NOT EXISTS club_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,source TEXT NOT NULL,source_key TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,problem TEXT NOT NULL,evo_member_id TEXT,aggregator_origin TEXT,aggregator_id TEXT,assigned_staff_id INTEGER,assigned_name TEXT,status TEXT NOT NULL DEFAULT 'pending',completed_by INTEGER,completed_name TEXT,completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,source,source_key))").run();
for(const col of ["notes TEXT","priority TEXT DEFAULT 'normal'","student_name TEXT","student_cpf TEXT","last_action_by TEXT","last_action_at TEXT"]){try{await db.prepare("ALTER TABLE club_tasks ADD COLUMN "+col).run()}catch(e){if(!/duplicate column/i.test(String(e)))throw e}}
await db.prepare("CREATE TABLE IF NOT EXISTS club_task_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,title))").run();
await db.prepare("CREATE TABLE IF NOT EXISTS club_task_history(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id INTEGER NOT NULL,unit TEXT NOT NULL,actor_name TEXT NOT NULL,old_status TEXT,new_status TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
const staffRows=async()=>{const r=await db.prepare("SELECT id,name,role,units_json FROM staff_users WHERE enabled=1 AND role='reception' ORDER BY name").all().catch(()=>({results:[]}));return(r.results||[]).filter(x=>{try{return JSON.parse(x.units_json||"[]").includes(unit)}catch{return false}}).map(x=>({id:x.id,name:x.name,role:x.role}))};
if(request.method==="GET"){
const lookup=String(url.searchParams.get("studentId")||"").trim();
if(lookup){if(actor.role!=="admin")return json({ok:false,error:"SEM_PERMISSAO"},403);if(!/^\d{1,15}$/.test(lookup))return json({ok:false,error:"ID_INVALIDO"},400);const student=await db.prepare("SELECT evo_member_id id,display_name name FROM evo_students WHERE unit=? AND evo_member_id=? ORDER BY is_current DESC LIMIT 1").bind(unit,lookup).first();return json({ok:true,student:student||null})}
let sql="SELECT * FROM club_tasks WHERE unit=?",args=[unit];
if(actor.role==="reception"){if(!actor.id)return json({ok:true,tasks:[],role:actor.role,name:actor.name});sql+=" AND assigned_staff_id=?";args.push(Number(actor.id))}
sql+=" ORDER BY updated_at DESC";const q=await db.prepare(sql).bind(...args).all();
const missing=(q.results||[]).filter(t=>t.source==="aggregator_sales"&&!t.student_cpf);
if(missing.length){
  const batches=await db.prepare("SELECT rows_json FROM aggregator_sales_batches WHERE unit=? ORDER BY competence DESC LIMIT 12").bind(unit).all().catch(()=>({results:[]}));
  const normalize=v=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
  const normalizeCpf=v=>{const digits=String(v??"").replace(/[^0-9]/g,"");return digits.length>=1&&digits.length<=11?digits.padStart(11,"0"):null};
  const byId=new Map(),byName=new Map();
  for(const batch of batches.results||[]){let rows=[];try{rows=JSON.parse(batch.rows_json||"[]")}catch{};if(!Array.isArray(rows))continue;
    for(const r of rows){const origin=normalize(r.origin||r.source||r.aggregator),aid=normalize(r.aggregatorId||r.aggregator_id||r.id),name=normalize(r.name||r.student_name||r.studentName),cpf=normalizeCpf(r.cpf||r.documento||r.numeroDocumento||r.numero_documento||r.document||r.documentNumber);
      if(!origin||!cpf||/^0+$/.test(cpf))continue;
      if(aid){const key=origin+"|"+aid;if(!byId.has(key))byId.set(key,new Set());byId.get(key).add(cpf)}
      if(name){const key=origin+"|"+name;if(!byName.has(key))byName.set(key,new Set());byName.get(key).add(cpf)}
    }
  }
  for(const t of missing){const origin=normalize(t.aggregator_origin||String(t.source_key||"").split("|")[0]);const aid=normalize(t.aggregator_id||String(t.source_key||"").split("|").slice(1).join("|"));const name=normalize(t.student_name||t.title);const exact=byId.get(origin+"|"+aid);const candidates=exact&&exact.size===1?exact:byName.get(origin+"|"+name);if(!candidates||candidates.size!==1)continue;
    const cpf=[...candidates][0];await db.prepare("UPDATE club_tasks SET student_cpf=? WHERE id=? AND (student_cpf IS NULL OR student_cpf='')").bind(cpf,t.id).run();t.student_cpf=cpf;
  }
}
const staff=actor.role==="admin"?await staffRows():[];
const templates=actor.role==="admin"?(await db.prepare("SELECT title FROM club_task_templates WHERE unit=? ORDER BY title").bind(unit).all()).results.map(x=>x.title):[];
return json({ok:true,role:actor.role,name:actor.name,tasks:q.results||[],staff,templates});
}
const body=await readJson(request),action=String(body.action||""),keys=Array.isArray(body.sourceKeys)?body.sourceKeys.map(String).slice(0,500):[];
if(action==="create"){
if(actor.role!=="admin")return json({ok:false,error:"SEM_PERMISSAO"},403);
const title=String(body.title||"").trim().slice(0,150),notes=String(body.notes||"").trim().slice(0,2000),priority=String(body.priority||"normal"),id=String(body.studentId||"").trim(),staffId=Number(body.staffId);
if(!title||!["normal","high","urgent"].includes(priority)||!Number.isSafeInteger(staffId)||staffId<1||(id&&!/^\d{1,15}$/.test(id)))return json({ok:false,error:"DADOS_INVALIDOS"},400);
const staff=(await staffRows()).find(x=>x.id===staffId);if(!staff)return json({ok:false,error:"RECEPCIONISTA_INVALIDO"},400);
let student=null;if(id){student=await db.prepare("SELECT evo_member_id id,display_name name FROM evo_students WHERE unit=? AND evo_member_id=? ORDER BY is_current DESC LIMIT 1").bind(unit,id).first();if(!student)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404)}
const sourceKey="manual:"+crypto.randomUUID();
const result=await db.prepare("INSERT INTO club_tasks(unit,source,source_key,category,title,problem,evo_member_id,student_name,assigned_staff_id,assigned_name,status,notes,priority,last_action_by,last_action_at) VALUES(?,'manual',?,'manual',?,?,?,?,?,?,'delegated',?,?,?,CURRENT_TIMESTAMP)").bind(unit,sourceKey,title,title,student?.id||null,student?.name||null,staff.id,staff.name,notes,priority,String(actor.name||"Administrador")).run();
if(body.saveTemplate)await db.prepare("INSERT OR IGNORE INTO club_task_templates(unit,title) VALUES(?,?)").bind(unit,title).run();
await db.prepare("INSERT INTO club_task_history(task_id,unit,actor_name,old_status,new_status) VALUES(?,?,?,NULL,'delegated')").bind(result.meta.last_row_id,unit,String(actor.name||"Administrador")).run();
return json({ok:true,id:result.meta.last_row_id,sourceKey});
}
if(action==="delegate"){
if(actor.role!=="admin"||!keys.length||!Number.isInteger(Number(body.staffId)))return json({ok:false,error:"DELEGACAO_INVALIDA"},400);
const staff=(await staffRows()).find(x=>x.id===Number(body.staffId));if(!staff)return json({ok:false,error:"RECEPCIONISTA_INVALIDO"},400);
let changed=0;for(const key of keys){const r=await db.prepare("UPDATE club_tasks SET assigned_staff_id=?,assigned_name=?,status='delegated',completed_by=NULL,completed_name=NULL,completed_at=NULL,last_action_by=?,last_action_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND source_key=? AND status!='closed'").bind(staff.id,staff.name,String(actor.name||"Administrador"),unit,key).run();changed+=Number(r.meta?.changes||0)}return json({ok:true,changed})}
if(["validate","return"].includes(action)){
if(actor.role!=="admin"||keys.length!==1)return json({ok:false,error:"SEM_PERMISSAO"},403);
const task=await db.prepare("SELECT id,status FROM club_tasks WHERE unit=? AND source_key=?").bind(unit,keys[0]).first();
if(!task||task.status!=="waiting_validation")return json({ok:false,error:"TAREFA_NAO_AGUARDANDO_VALIDACAO"},409);
const next=action==="validate"?"closed":"delegated",note=String(body.notes||"").trim().slice(0,1000);
if(action==="return"&&!note)return json({ok:false,error:"JUSTIFICATIVA_OBRIGATORIA"},400);
const result=await db.prepare("UPDATE club_tasks SET status=?,last_action_by=?,last_action_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,notes=CASE WHEN ?='return' THEN COALESCE(notes,'')||char(10)||? ELSE notes END WHERE id=? AND status='waiting_validation'").bind(next,String(actor.name||"Administrador"),action,note?"Devolvida pelo administrador: "+note:"",task.id).run();
if(!result.meta?.changes)return json({ok:false,error:"TAREFA_JA_ATUALIZADA"},409);
await db.prepare("INSERT INTO club_task_history(task_id,unit,actor_name,old_status,new_status) VALUES(?,?,?,?,?)").bind(task.id,unit,String(actor.name||"Administrador"),"waiting_validation",next).run();
return json({ok:true,changed:1,status:next});
}
if(["in_progress","no_response","complete"].includes(action)){
if(actor.role!=="reception"||!actor.id||keys.length!==1)return json({ok:false,error:"ACAO_INVALIDA"},400);
const key=keys[0],task=await db.prepare("SELECT id,status FROM club_tasks WHERE unit=? AND source_key=? AND assigned_staff_id=?").bind(unit,key,Number(actor.id)).first();
if(!task||!["delegated","in_progress","no_response"].includes(task.status))return json({ok:false,error:"TAREFA_INDISPONIVEL"},409);
const next=action==="complete"?"waiting_validation":action;
await db.prepare("UPDATE club_tasks SET status=?,completed_by=?,completed_name=?,completed_at=CASE WHEN ?='waiting_validation' THEN CURRENT_TIMESTAMP ELSE NULL END,last_action_by=?,last_action_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(next,action==="complete"?Number(actor.id):null,action==="complete"?String(actor.name||"Recepção"):null,next,String(actor.name||"Recepção"),task.id).run();
await db.prepare("INSERT INTO club_task_history(task_id,unit,actor_name,old_status,new_status) VALUES(?,?,?,?,?)").bind(task.id,unit,String(actor.name||"Recepção"),task.status,next).run();
return json({ok:true,changed:1,status:next});
}
return json({ok:false,error:"ACAO_INVALIDA"},400);
}
      if(url.pathname==="/admin/aggregator-sales-match" && request.method==="POST"){
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}
        const admin=await ar.json().catch(()=>({}));if(!ar.ok||admin.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const input=await readJson(request),unit=String(input.unit||"bike").toLowerCase();
        if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_PERMITIDA"},403);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_member_links(unit TEXT NOT NULL,origin TEXT NOT NULL,aggregator_id TEXT NOT NULL,evo_member_id TEXT NOT NULL,confirmed_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,origin,aggregator_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS aggregator_member_rejections(unit TEXT NOT NULL,origin TEXT NOT NULL,aggregator_id TEXT NOT NULL,evo_member_id TEXT NOT NULL,rejected_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,origin,aggregator_id,evo_member_id))").run();
        if(String(input.action||"")==="reject_link"){
          const origin=String(input.origin||""),aggregatorId=String(input.aggregatorId||"").trim(),evoMemberId=String(input.evoMemberId||"").trim();
          if(!["Wellhub","TotalPass"].includes(origin)||!aggregatorId||!/^\d+$/.test(evoMemberId))return json({ok:false,error:"VINCULO_INVALIDO"},400);
          await env.DB.prepare("INSERT OR IGNORE INTO aggregator_member_rejections(unit,origin,aggregator_id,evo_member_id,rejected_by) VALUES(?,?,?,?,?)").bind(unit,origin,aggregatorId,evoMemberId,String(admin.email||admin.name||"admin")).run();
          return json({ok:true,unit,origin,aggregatorId,evoMemberId,evoRequests:0});
        }
        if(String(input.action||"")==="confirm_link"){
          const origin=String(input.origin||""),aggregatorId=String(input.aggregatorId||"").trim(),evoMemberId=String(input.evoMemberId||"").trim();
          if(!["Wellhub","TotalPass"].includes(origin)||!aggregatorId||!/^\d+$/.test(evoMemberId))return json({ok:false,error:"VINCULO_INVALIDO"},400);
          const exists=await env.DB.prepare("SELECT 1 ok FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,evoMemberId).first();
          if(!exists)return json({ok:false,error:"ALUNO_D1_NAO_ENCONTRADO"},404);
          await env.DB.prepare("INSERT INTO aggregator_member_links(unit,origin,aggregator_id,evo_member_id,confirmed_by,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,origin,aggregator_id) DO UPDATE SET evo_member_id=excluded.evo_member_id,confirmed_by=excluded.confirmed_by,updated_at=CURRENT_TIMESTAMP").bind(unit,origin,aggregatorId,evoMemberId,String(admin.email||admin.name||"admin")).run();
          return json({ok:true,unit,origin,aggregatorId,evoMemberId,evoRequests:0});
        }
        const rows=Array.isArray(input.rows)?input.rows.slice(0,2500):[];if(!rows.length)return json({ok:false,error:"SEM_REGISTROS"},400);
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim(),digits=v=>String(v||"").replace(/\D/g,"");
        const master=(await env.DB.prepare("SELECT mm.evo_member_id,mm.personal_json,mm.integrations_json,mm.raw_json,mm.is_current,COALESCE(m.first_name,'') first_name,COALESCE(m.last_name,'') last_name FROM evo_member_master mm LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=CAST(mm.evo_member_id AS TEXT) WHERE mm.unit=?").bind(unit).all()).results||[];
        const people=master.map(x=>{let p={},r={},ig={};try{p=JSON.parse(x.personal_json||"{}")}catch{}try{r=JSON.parse(x.raw_json||"{}")}catch{}try{ig=JSON.parse(x.integrations_json||"{}")}catch{}const name=String(p.name||[p.firstName||x.first_name,p.lastName||x.last_name].filter(Boolean).join(" ")||r.name||r.firstName||"").trim(),cpf=digits(p.document||p.cpf||r.document||r.cpf||""),gympassId=String(ig.gympassId??p.gympassId??r.gympassId??"").trim(),codeTotalpass=String(ig.codeTotalpass??p.codeTotalpass??r.codeTotalpass??"").trim();return {evoMemberId:String(x.evo_member_id),name,cpf,nameKey:norm(name),isCurrent:Number(x.is_current)===1,gympassId,codeTotalpass}}),byCpf=new Map(),byName=new Map(),byWellhubId=new Map(),byTotalpassId=new Map();
        for(const p of people){if(p.cpf.length===11)byCpf.set(p.cpf,p);if(p.gympassId)byWellhubId.set(p.gympassId,p);if(p.codeTotalpass)byTotalpassId.set(p.codeTotalpass,p);if(p.nameKey){const a=byName.get(p.nameKey)||[];a.push(p);byName.set(p.nameKey,a)}}
        const saved=(await env.DB.prepare("SELECT origin,aggregator_id,evo_member_id FROM aggregator_member_links WHERE unit=?").bind(unit).all()).results||[],bySaved=new Map(saved.map(x=>[String(x.origin)+"|"+String(x.aggregator_id),String(x.evo_member_id)])),byEvo=new Map(people.map(p=>[p.evoMemberId,p]));
        const nameParts=s=>norm(s).split(" ").filter(x=>x.length>1&&!["de","da","do","das","dos","e"].includes(x));
        const similarity=(a,b)=>{const aa=nameParts(a),bb=nameParts(b);if(!aa.length||!bb.length||aa[0]!==bb[0])return 0;let score=0,weight=0;const max=Math.max(aa.length,bb.length);for(let i=0;i<max;i++){const w=i===0?5:i===1?3:i===2?2:1;weight+=w;if(aa[i]&&bb[i]&&aa[i]===bb[i])score+=w}const tailA=new Set(aa.slice(1)),tailB=new Set(bb.slice(1));let shared=0;for(const x of tailA)if(tailB.has(x))shared++;return Math.min(1,(score/weight)*0.75+(shared/Math.max(1,Math.max(tailA.size,tailB.size)))*0.25)};
        const rejected=(await env.DB.prepare("SELECT origin,aggregator_id,evo_member_id FROM aggregator_member_rejections WHERE unit=?").bind(unit).all()).results||[],rejectedSet=new Set(rejected.map(x=>String(x.origin)+"|"+String(x.aggregator_id)+"|"+String(x.evo_member_id)));const suggestions=(name,origin,aggregatorId)=>people.map(p=>({p,score:similarity(name,p.name)})).filter(x=>x.score>=0.5&&!rejectedSet.has(origin+"|"+aggregatorId+"|"+x.p.evoMemberId)).sort((a,b)=>b.score-a.score).slice(0,8).map(x=>({evoMemberId:x.p.evoMemberId,name:x.p.name,cpf:x.p.cpf?("***.***.***-"+x.p.cpf.slice(-2)):"—",score:Math.round(x.score*100),inactive:!x.p.isCurrent}));
        const result=rows.map((r,i)=>{const name=String(r.name||"").trim(),cpf=digits(r.cpf),nameKey=norm(name),aggregatorId=String(r.aggregatorId||"").trim(),origin=String(r.origin||"");let p=null,match="none";const savedId=aggregatorId?bySaved.get(origin+"|"+aggregatorId):null;if(savedId&&byEvo.has(savedId)){p=byEvo.get(savedId);match="confirmed_aggregator_id"}else if(origin==="Wellhub"&&aggregatorId&&byWellhubId.has(aggregatorId)){p=byWellhubId.get(aggregatorId);match="wellhub_id"}else if(origin==="TotalPass"&&aggregatorId&&byTotalpassId.has(aggregatorId)){p=byTotalpassId.get(aggregatorId);match="totalpass_id"}else if(cpf.length===11&&byCpf.has(cpf)){p=byCpf.get(cpf);match="cpf"}else if(nameKey){const a=byName.get(nameKey)||[];if(a.length===1){p=a[0];match="name"}else if(a.length===0){const np=nameParts(name),strong=people.filter(q=>{const qp=nameParts(q.name);if(np.length<2||qp.length<2||np[0]!==qp[0]||np[1]!==qp[1])return false;const min=Math.min(np.length,qp.length);for(let j=0;j<min;j++)if(np[j]!==qp[j])return false;return true});if(strong.length===1){p=strong[0];match="name_prefix_unique"}}}const missingCpf=!!p&&!/^\d{11}$/.test(p.cpf);const status=p?(missingCpf?"missing_cpf":"ready"):(nameKey&&(byName.get(nameKey)||[]).length>1?"ambiguous":"not_found");return {index:i,name,cpf,aggregatorId,origin,value:Number(r.value||0),checkins:Number(r.checkins||0),status,match,evoMemberId:p?.evoMemberId||null,d1Name:p?.name||null,d1Cpf:p?.cpf||null,d1Inactive:p?!p.isCurrent:null,suggestions:!p&&origin==="Wellhub"?suggestions(name,origin,aggregatorId):[]}});
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_tasks(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,source TEXT NOT NULL,source_key TEXT NOT NULL,category TEXT NOT NULL,title TEXT NOT NULL,problem TEXT NOT NULL,evo_member_id TEXT,aggregator_origin TEXT,aggregator_id TEXT,assigned_staff_id INTEGER,assigned_name TEXT,status TEXT NOT NULL DEFAULT 'pending',completed_by INTEGER,completed_name TEXT,completed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(unit,source,source_key))").run();
        const taskStatements=result.map(x=>{const sk=x.origin+"|"+(x.aggregatorId||("row-"+x.index)),problem=x.status==="missing_cpf"?"CPF ausente no cadastro EVO":x.status==="ambiguous"?"Revisar correspondência do cliente":"Localizar ou cadastrar cliente no EVO";return x.status==="ready"?env.DB.prepare("UPDATE club_tasks SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE unit=? AND source='aggregator_sales' AND source_key=?").bind(unit,sk):env.DB.prepare("INSERT INTO club_tasks(unit,source,source_key,category,title,problem,evo_member_id,aggregator_origin,aggregator_id,student_cpf,status) VALUES(?,'aggregator_sales',?,'regularizacao_cliente',?,?,?,?,?,?,'pending') ON CONFLICT(unit,source,source_key) DO UPDATE SET title=excluded.title,problem=excluded.problem,evo_member_id=excluded.evo_member_id,aggregator_origin=excluded.aggregator_origin,aggregator_id=excluded.aggregator_id,student_cpf=excluded.student_cpf,status=CASE WHEN club_tasks.status='closed' THEN 'pending' ELSE club_tasks.status END,updated_at=CURRENT_TIMESTAMP").bind(unit,sk,x.name,problem,x.evoMemberId||null,x.origin,x.aggregatorId||null,x.cpf||null)});
        for(let i=0;i<taskStatements.length;i+=80)await env.DB.batch(taskStatements.slice(i,i+80));
        const counts={total:result.length,ready:result.filter(x=>x.status==="ready").length,missingCpf:result.filter(x=>x.status==="missing_cpf").length,ambiguous:result.filter(x=>x.status==="ambiguous").length,notFound:result.filter(x=>x.status==="not_found").length};
        return json({ok:true,unit,source:"D1",evoRequests:0,counts,rows:result});
      }

      // Ativação pontual: pesquisa D1 antes de qualquer chamada EVO.
      // Reset manual do PIN: apenas equipe autenticada e autorizada na página Alunos.
      if(url.pathname==="/admin/student-pin-reset" && request.method==="POST"){
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}
        const admin=await ar.json().catch(()=>({}));
        if(!ar.ok||!["admin","reception"].includes(admin.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        if(admin.role!=="admin"&&!(admin.permissions||[]).some(p=>["*","/admin-alunos-evo.html"].includes(p)))return json({ok:false,error:"SEM_PERMISSAO_ALUNOS"},403);
        const body=await readJson(request),unit=String(body.unit||""),evoId=String(body.evoMemberId||"").trim();
        if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_PERMITIDA"},403);
        if(!/^\d{1,15}$/.test(evoId)||body.confirm!==true)return json({ok:false,error:"CONFIRMACAO_OU_ID_INVALIDO"},400);
        const column=unit==="bike"?"evo_member_id":"gym_client_id";
        const member=await env.DB.prepare("SELECT id,pin_hash FROM members WHERE "+column+"=? LIMIT 1").bind(evoId).first();
        if(!member||!member.pin_hash)return json({ok:false,error:"ALUNO_SEM_PIN_CADASTRADO"},404);
        const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
        const pin=String(100000+(bytes[0]%900000));
        const salt=randomToken(16),hash=await hashPin(pin,salt);
        await env.DB.batch([
          env.DB.prepare("UPDATE members SET pin_hash=?,pin_salt=?,pin_created_at=CURRENT_TIMESTAMP,failed_login_attempts=0,locked_until=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(hash,salt,member.id),
          env.DB.prepare("UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE member_id=? AND revoked_at IS NULL").bind(member.id)
        ]);
        await audit(env,"ADMIN",String(admin.id||admin.name||"staff"),"STUDENT_PIN_RESET:"+String(member.id));
        return json({ok:true,pin,memberId:member.id,message:"PIN atualizado. Copie agora; ele não será exibido novamente."});
      }
      if(url.pathname==="/admin/manual-student-activation" && ["GET","POST"].includes(request.method)){
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let ar;try{ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}
        const admin=await ar.json().catch(()=>({}));
        if(!ar.ok||!["admin","reception"].includes(admin.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const input=request.method==="POST"?await readJson(request):{};
        const unit=String(input.unit||url.searchParams.get("unit")||"bike");
        if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_PERMITIDA"},403);
        const permissions=admin.permissions||[];
        if(admin.role!=="admin"&&!permissions.some(p=>["*","/admin-alunos-evo.html"].includes(p)))return json({ok:false,error:"SEM_PERMISSAO_ALUNOS"},403);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_manual_activations(unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,member_id INTEGER,actor TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,evo_member_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_manual_activation_pending(token TEXT PRIMARY KEY,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,profile_json TEXT NOT NULL,source TEXT NOT NULL,expires_at TEXT NOT NULL)").run();
        const statusSQL="EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=a.unit AND c.evo_member_id=a.evo_member_id AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours')))";
        if(request.method==="GET"){
          const r=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN "+statusSQL+" THEN 1 ELSE 0 END) active FROM club_manual_activations a WHERE a.unit=?").bind(unit).first();
          return json({ok:true,total:Number(r?.total||0),active:Number(r?.active||0),inactive:Number(r?.total||0)-Number(r?.active||0)});
        }
        if(input.action==="lookup"){
          const mode=String(input.mode||"cpf"),value=String(input.value||"").replace(/\D/g,"");
          if(!["cpf","id"].includes(mode)||(mode==="cpf"?!/^\d{11}$/.test(value):!/^[1-9]\d{0,11}$/.test(value)))return json({ok:false,error:"CPF_OU_ID_INVALIDO"},400);
          let row=mode==="id"?await env.DB.prepare("SELECT * FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,value).first():await env.DB.prepare("SELECT * FROM evo_member_master WHERE unit=? AND replace(replace(json_extract(personal_json,'$.document'),'.',''),'-','')=? LIMIT 1").bind(unit,value).first();
          let source="D1",profile,evoRequests=0;
          if(row){profile=JSON.parse(row.raw_json||"{}");profile={...JSON.parse(row.personal_json||"{}"),...profile,idMember:row.evo_member_id};}
          else{
            source="EVO";
            const cfg=await getEvoConfig(env,unit);
            const auth="Basic "+btoa(cfg.dns+":"+cfg.token);
            const path=mode==="cpf"?"/api/v1/members/basic?document="+encodeURIComponent(value):"/api/v2/members/"+encodeURIComponent(value);
            evoRequests++;
            const evo=await fetch("https://evo-integracao.w12app.com.br"+path,{headers:{Authorization:auth,Accept:"application/json"}});
            if(!evo.ok)return json({ok:false,error:"EVO_CONSULTA_"+evo.status},502);
            const raw=await evo.json(),obj=Array.isArray(raw)?raw[0]:raw;
            profile=obj?.member||obj?.data||obj;
            if(!profile?.idMember)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404);
          }
          const id=String(profile.idMember||row?.evo_member_id||"");
          const personal=row?JSON.parse(row.personal_json||"{}"):profile;
          const cpf=normalizeCpf(personal.document||profile.document||profile.cpf||"");
          const firstName=String(personal.firstName||profile.firstName||profile.name||"");
          const lastName=String(personal.lastName||profile.lastName||"");
          if(!id||!firstName||!(cpf.length===11))return json({ok:false,error:"CADASTRO_INCOMPLETO_NA_EVO"},422);
          if(mode==="cpf"&&cpf!==value||mode==="id"&&id!==value)return json({ok:false,error:"DADOS_DIVERGENTES"},409);
          const token=crypto.randomUUID(),expiry=new Date(Date.now()+10*60*1000).toISOString();
          await env.DB.prepare("INSERT INTO club_manual_activation_pending(token,unit,evo_member_id,profile_json,source,expires_at) VALUES(?,?,?,?,?,?)").bind(token,unit,id,JSON.stringify({...profile,...personal,idMember:id,document:cpf}),source,expiry).run();
          const already=await env.DB.prepare("SELECT id,pin_hash FROM members WHERE cpf_hash=? LIMIT 1").bind(await sha256(cpf)).first();
          const linked=await env.DB.prepare("SELECT 1 found FROM club_manual_activations WHERE unit=? AND evo_member_id=?").bind(unit,id).first();
          const contract=await env.DB.prepare("SELECT 1 found FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND lower(COALESCE(membership_status,'')) IN ('active','1') AND (end_date IS NULL OR date(end_date)>=date('now','-3 hours')) LIMIT 1").bind(unit,id).first();
          return json({ok:true,token,student:{name:(firstName+" "+lastName).trim(),id,cpfMasked:"***.***."+cpf.slice(6,9)+"-**",unit,source:source==="D1"?"Club Pop":"EVO",evoRequests,status:contract?"Ativo":"Inativo",alreadyActivated:!!linked,hasAccount:!!already,hasPin:!!already?.pin_hash}});
        }
        if(input.action==="confirm"){
          const token=String(input.token||"");
          if(!/^[a-f0-9-]{36}$/i.test(token))return json({ok:false,error:"CONFIRMACAO_INVALIDA"},400);
          const pending=await env.DB.prepare("SELECT * FROM club_manual_activation_pending WHERE token=? AND unit=? AND expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(token,unit).first();
          if(!pending)return json({ok:false,error:"BUSCA_EXPIRADA_REFAZER"},409);
          const p=JSON.parse(pending.profile_json),cpf=normalizeCpf(p.document||p.cpf),id=pending.evo_member_id;
          if(!/^\d{11}$/.test(cpf))return json({ok:false,error:"CPF_NAO_DISPONIVEL"},422);
          const hash=await sha256(cpf),existing=await env.DB.prepare("SELECT id,pin_hash,evo_member_id,gym_client_id FROM members WHERE cpf_hash=? LIMIT 1").bind(hash).first();
          const collision=await env.DB.prepare("SELECT id,cpf_hash FROM members WHERE "+(unit==="bike"?"evo_member_id":"gym_client_id")+"=? LIMIT 1").bind(unit==="bike"?Number(id):id).first();
          if(collision&&collision.cpf_hash!==hash)return json({ok:false,error:"CADASTRO_JA_VINCULADO_A_OUTRO_CPF"},409);
          const name=String(p.firstName||p.name||""),last=String(p.lastName||"");
          if(existing){
            const linked=unit==="bike"?existing.evo_member_id:existing.gym_client_id;
            if(linked&&String(linked)!==id)return json({ok:false,error:"CPF_JA_VINCULADO_A_OUTRO_ID"},409);
            await env.DB.prepare("UPDATE members SET "+(unit==="bike"?"evo_member_id":"gym_client_id")+"=?,first_name=?,last_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(unit==="bike"?Number(id):id,name,last,existing.id).run();
          }else{
            await env.DB.prepare("INSERT INTO members(evo_member_id,gym_client_id,cpf_hash,cpf_last4,first_name,last_name,email,birth_date) VALUES(?,?,?,?,?,?,?,?)").bind(unit==="bike"?Number(id):null,unit==="gym"?id:null,hash,cpf.slice(-4),name,last,normalizeEmail(p.email||p.emailAddress||""),normalizeDate(p.birthDate||"")).run();
          }
          const member=await env.DB.prepare("SELECT id,pin_hash FROM members WHERE cpf_hash=?").bind(hash).first();
          if(!existing || !(unit==="bike"?existing.evo_member_id:existing.gym_client_id))await env.DB.prepare("INSERT OR IGNORE INTO club_manual_activations(unit,evo_member_id,member_id,actor) VALUES(?,?,?,?)").bind(unit,id,member.id,String(admin.name||admin.role)).run();
          await env.DB.prepare("DELETE FROM club_manual_activation_pending WHERE token=?").bind(token).run();
          await audit(env,"ADMIN",String(admin.name||admin.role),"MANUAL_STUDENT_CONFIRMED","MEMBER",String(member.id),JSON.stringify({unit,evoMemberId:id,source:pending.source}));
          return json({ok:true,hasPin:!!member.pin_hash,message:member.pin_hash?"Aluno já possui PIN e pode entrar.":"Aluno liberado para primeiro acesso. Informe CPF, e-mail e nascimento no aplicativo."});
        }
        return json({ok:false,error:"ACAO_INVALIDA"},400);
      }

      if(url.pathname==="/benefit-vouchers" || url.pathname==="/admin/benefit-vouchers")return benefitVouchers(request,env,url.pathname.startsWith("/admin/")?null:await authenticatedMember(request,env),json);
      if(url.pathname==="/currency-store")return currencyStudent(request,env,await authenticatedMember(request,env),json);
      if(url.pathname==="/partner-campaign-event"&&request.method==="POST"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"SESSAO_INVALIDA"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase(),body=await request.json().catch(()=>({}));
        if(!["bike","gym"].includes(unit)||!["view","partner_click"].includes(body.event)||!/^benefit-[a-zA-Z0-9_-]+$/.test(String(body.benefitId||"")))return json({ok:false,error:"DADOS_INVALIDOS"},400);
        const content=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
        const benefit=(JSON.parse(content?.content_json||"{}").benefits||[]).find(b=>String(b.id)===String(body.benefitId)&&String(b.unit||"bike").toLowerCase()===unit&&b.status==="Ativo");
        if(!benefit)return json({ok:false,error:"BENEFICIO_INDISPONIVEL"},404);
        if(body.event==="partner_click"&&(!benefit.partnerVoucher?.partnerLinkEnabled||!/^https:\/\//i.test(benefit.partnerVoucher?.partnerLinkUrl||"")))return json({ok:false,error:"LINK_INDISPONIVEL"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_campaign_events(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,event_type TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,event_type,day))").run();
        const day=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
        await env.DB.prepare("INSERT OR IGNORE INTO partner_campaign_events(benefit_id,unit,member_id,event_type,day) VALUES(?,?,?,?,?)").bind(String(body.benefitId),unit,String(member.id),body.event,day).run();
        return json({ok:true});
      }
      if(url.pathname==="/admin/partner-performance"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const auth=await ar.json().catch(()=>({}));
        if(!ar.ok||auth.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const perms=auth.permissions||auth.user?.permissions||[];
        if(Array.isArray(perms)&&perms.length&&!perms.some(p=>p==="*"||p==="/admin-beneficios.html"))return json({ok:false,error:"SEM_PERMISSAO"},403);
        const unit=(url.searchParams.get("unit")||"club").toLowerCase(),partnerId=String(url.searchParams.get("partnerId")||""),month=String(url.searchParams.get("month")||"");
        if(!["club","bike","gym"].includes(unit)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!partnerId)return json({ok:false,error:"FILTRO_INVALIDO"},400);
        const raw=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
        const content=JSON.parse(raw?.content_json||"{}"),partner=(content.partners||[]).find(x=>String(x.id)===partnerId);
        if(!partner)return json({ok:false,error:"PARCEIRO_NAO_ENCONTRADO"},404);
        const offers=(content.benefits||[]).filter(x=>(String(x.partnerId||"")===partnerId||(!x.partnerId&&String(x.partner||"").trim().toLowerCase()===String(partner.name||"").trim().toLowerCase()))&&(unit==="club"||String(x.unit||"bike").toLowerCase()===unit));
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_campaign_events(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,event_type TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,event_type,day))").run();
        const totals=[];
        for(const b of offers){
          const bu=String(b.unit||"bike").toLowerCase(),id=String(b.id);
          const events=await env.DB.prepare("SELECT event_type,COUNT(*) AS n,COUNT(DISTINCT member_id) AS people FROM partner_campaign_events WHERE benefit_id=? AND unit=? AND substr(day,1,7)=? GROUP BY event_type").bind(id,bu,month).all();
          const e=Object.fromEntries((events.results||[]).map(x=>[x.event_type,{count:Number(x.n),people:Number(x.people)}]));
          const [codes,daily,once]=await Promise.all([
            env.DB.prepare("SELECT COUNT(*) AS issued,SUM(CASE WHEN used_at IS NOT NULL AND substr(used_at,1,7)=? THEN 1 ELSE 0 END) AS used FROM partner_code_vouchers WHERE benefit_id=? AND unit=? AND substr(created_at,1,7)=?").bind(month,id,bu,month).first().catch(()=>({issued:0,used:0})),
            env.DB.prepare("SELECT COUNT(*) AS n FROM partner_daily_redemptions WHERE benefit_id=? AND unit=? AND substr(local_date,1,7)=?").bind(id,bu,month).first().catch(()=>({n:0})),
            env.DB.prepare("SELECT COUNT(*) AS n FROM partner_once_redemptions WHERE benefit_id=? AND unit=? AND substr(used_at,1,7)=?").bind(id,bu,month).first().catch(()=>({n:0}))
          ]);
          totals.push({id,title:b.title||"Benefício",unit:bu,views:e.view?.count||0,uniqueViews:e.view?.people||0,clicks:e.partner_click?.count||0,uniqueClicks:e.partner_click?.people||0,issued:Number(codes?.issued||0),used:Number(codes?.used||0)+Number(daily?.n||0)+Number(once?.n||0)});
        }
        const sum=k=>totals.reduce((n,x)=>n+Number(x[k]||0),0);
        return json({ok:true,partner:{id:partner.id,name:partner.name,site:partner.site||"",instagram:partner.instagram||""},month,unit,offers:totals,totals:{benefits:totals.length,views:sum("views"),clicks:sum("clicks"),issued:sum("issued"),used:sum("used"),uniqueViewsByOffer:sum("uniqueViews")}});
      }
      if(url.pathname==="/admin/partner-voucher-history"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const response=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const auth=await response.json().catch(()=>({}));
        if(!response.ok||auth.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const perms=auth.permissions||auth.user?.permissions||[];
        if(Array.isArray(perms)&&perms.length&&!perms.some(p=>p==="*"||p==="/admin-beneficios.html"))return json({ok:false,error:"SEM_PERMISSAO"},403);
        const unit=(url.searchParams.get("unit")||"club").toLowerCase();
        if(!["club","bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_daily_redemptions(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,partner_name TEXT NOT NULL,benefit_title TEXT NOT NULL,local_date TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,local_date))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_once_redemptions(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,partner_name TEXT NOT NULL,benefit_title TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_code_vouchers(benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,used_at TEXT,PRIMARY KEY(benefit_id,unit,member_id))").run();
        const filter=unit==="club"?"":" WHERE unit=?";
        const queries=[
          "SELECT benefit_id,unit,member_id,member_name,partner_name,benefit_title,'Presencial diário' AS mode,used_at AS date,'Utilizado' AS status,NULL AS code FROM partner_daily_redemptions"+filter,
          "SELECT benefit_id,unit,member_id,member_name,partner_name,benefit_title,'Presencial único' AS mode,used_at AS date,'Utilizado' AS status,NULL AS code FROM partner_once_redemptions"+filter,
          "SELECT benefit_id,unit,member_id,member_name,'' AS partner_name,'' AS benefit_title,'Código + WhatsApp' AS mode,created_at AS date,CASE WHEN used_at IS NULL THEN 'Emitido' ELSE 'Utilizado' END AS status,code FROM partner_code_vouchers"+filter
        ];
        const result=await Promise.all(queries.map(q=>{const p=env.DB.prepare(q);return(unit==="club"?p:p.bind(unit)).all()}));
        const content=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
        const benefits=JSON.parse(content?.content_json||"{}").benefits||[];
        const rows=result.flatMap((r,i)=>(r.results||[]).map(x=>{const b=benefits.find(y=>String(y.id)===String(x.benefit_id)&&String(y.unit||"bike").toLowerCase()===x.unit);return {...x,partner_name:x.partner_name||b?.partner||"",benefit_title:x.benefit_title||b?.title||""}}));
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_campaign_events(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,event_type TEXT NOT NULL,day TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,event_type,day))").run();
        const ev=await (unit==="club"?env.DB.prepare("SELECT event_type,COUNT(*) AS total FROM partner_campaign_events GROUP BY event_type"):env.DB.prepare("SELECT event_type,COUNT(*) AS total FROM partner_campaign_events WHERE unit=? GROUP BY event_type").bind(unit)).all();
        const metrics=Object.fromEntries((ev.results||[]).map(r=>[r.event_type,Number(r.total)]));
        const campaign={views:metrics.view||0,clicks:metrics.partner_click||0,issued:rows.filter(r=>r.mode==="Código + WhatsApp").length,used:rows.filter(r=>r.status==="Utilizado").length};
        return json({ok:true,rows,campaign});
      }
      if(url.pathname==="/admin/currencies"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const response=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const auth=await response.json().catch(()=>({}));
        if(!response.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        return currencyAdmin(request,env,auth,json);
      }

      if (url.pathname === "/admin/voucher-automation" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase(),voucherType=String(url.searchParams.get("type")||"contract").toLowerCase();
        if(!["bike","gym"].includes(unit)||!["contract","service"].includes(voucherType))return json({ok:false,error:"UNIDADE_OU_TIPO_INVALIDO"},400);
        if(voucherType==="service")await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_voucher_service_automation (unit TEXT PRIMARY KEY CHECK(unit IN (\'bike\',\'gym\')),value TEXT NOT NULL)").run();
        if(request.method==="PUT"){
          const b=await request.json().catch(()=>({})),dailyLimit=Number(b.dailyLimit),times=b.times,days=b.days===undefined?null:b.days;if(days!==null&&(!Array.isArray(days)||!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6)))return json({ok:false,error:'DIAS_INVALIDOS'},400);
          if(!Number.isInteger(dailyLimit)||dailyLimit<0||dailyLimit>(voucherType==="service"?1000:100)||typeof b.enabled!=="boolean"||!Array.isArray(times)||times.length>24||times.some(t=>typeof t!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))return json({ok:false,error:"CONFIGURACAO_INVALIDA"},400);
          const clean=[...new Set(times)].sort();
          await env.DB.prepare("INSERT INTO "+(voucherType==="service"?"club_voucher_service_automation":"club_voucher_automation")+"(unit,value) VALUES(?,?) ON CONFLICT(unit) DO UPDATE SET value=excluded.value").bind(unit,JSON.stringify({...(await voucherSettings(env,unit,voucherType)),enabled:b.enabled,dailyLimit,times:clean,batchTime:clean[0]||'22:00',...(days!==null?{days}:{})})).run();
        }
        const config=await voucherSettings(env,unit,voucherType),stats=await env.DB.prepare("SELECT delivery_mode,status,COUNT(*) total FROM club_voucher_requests WHERE unit=? GROUP BY delivery_mode,status").bind(unit).all();
        const history=await env.DB.prepare("SELECT b.id,b.model_id,b.requested_quantity,b.evo_voucher_id,b.status,b.created_at,b.completed_at FROM club_voucher_batches b JOIN club_voucher_models m ON m.id=b.model_id AND m.unit=b.unit WHERE b.unit=? AND (CASE WHEN substr(m.contract_ids_json,1,1)='{' THEN 'service' ELSE 'contract' END)=? ORDER BY b.id DESC LIMIT 30").bind(unit,voucherType).all();
        const queued=await env.DB.prepare("SELECT COUNT(*) AS total FROM club_voucher_requests r JOIN club_voucher_models m ON m.id=r.model_id AND m.unit=r.unit WHERE r.unit=? AND r.delivery_mode='batch' AND r.status='pending' AND r.batch_id IS NULL AND (CASE WHEN substr(m.contract_ids_json,1,1)='{' THEN 'service' ELSE 'contract' END)=?").bind(unit,voucherType).first();
        return json({ok:true,unit,config,stats:stats.results||[],history:history.results||[],nextBatchCount:Number(queued?.total||0)});
      }
      if (url.pathname === "/admin/voucher-run-now" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"").toLowerCase(),type=String(b.type||"").toLowerCase();
        if(!["bike","gym"].includes(unit)||!["contract","service"].includes(type))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const result=await voucherBatchTick(env,{unit,type,force:true});
        return json({ok:true,...result});
      }
      if (url.pathname === "/admin/club-voucher-manual" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"").toLowerCase(),modelId=Number(b.modelId),resumeBatchId=Number(b.resumeBatchId||0);
        if(!["bike","gym"].includes(unit)||!Number.isSafeInteger(modelId)||modelId<1||(!resumeBatchId&&(!Number.isInteger(b.quantity)||![1,5,10,50].includes(b.quantity))))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const model=await env.DB.prepare("SELECT * FROM club_voucher_models WHERE id=? AND unit=? AND enabled=1").bind(modelId,unit).first();
        if(!model)return json({ok:false,error:"MODELO_NAO_ENCONTRADO"},404);
        const selection=voucherSelection(model.contract_ids_json),fields=voucherPayloadSelection(selection);
        const catalog=selection.kind==="service"?await env.DB.prepare("SELECT evo_service_id id FROM evo_service_catalog WHERE unit=? AND is_active=1").bind(unit).all():await env.DB.prepare("SELECT DISTINCT id_membership id FROM evo_member_contracts WHERE unit=? AND id_membership IS NOT NULL").bind(unit).all();
        const allowed=new Set((catalog.results||[]).map(x=>Number(x.id)));
        if(!resumeBatchId&&selection.ids.some(x=>!allowed.has(x)))return json({ok:false,error:"ITEM_NAO_ENCONTRADO_NO_D1"},400);
        const cfg=await getEvoConfig(env,unit);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_voucher_manual_codes(batch_id INTEGER NOT NULL,unit TEXT NOT NULL,code TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(batch_id,code))").run();
        let batchId,voucherId,quantity,createdNow=false;
        if(resumeBatchId){
          const existing=await env.DB.prepare("SELECT id,evo_voucher_id,requested_quantity,status FROM club_voucher_batches WHERE id=? AND unit=? AND model_id=?").bind(resumeBatchId,unit,modelId).first();
          if(!existing||!existing.evo_voucher_id||!["awaiting_codes","completed"].includes(existing.status))return json({ok:false,error:"LOTE_NAO_DISPONIVEL_PARA_CONSULTA"},409);
          const linked=await env.DB.prepare("SELECT COUNT(*) n FROM club_voucher_requests WHERE batch_id=?").bind(resumeBatchId).first();
          if(Number(linked?.n)>0)return json({ok:false,error:"LOTE_AUTOMATICO_NAO_PODE_SER_RECUPERADO_COMO_MANUAL"},409);
          batchId=existing.id;voucherId=Number(existing.evo_voucher_id);quantity=Number(existing.requested_quantity);
        }else{
          const lock=await env.DB.prepare("INSERT INTO club_voucher_batches(unit,model_id,requested_quantity,status) SELECT ?,?,?,'creating' WHERE NOT EXISTS(SELECT 1 FROM club_voucher_batches WHERE unit=? AND model_id=? AND status IN ('creating','awaiting_codes','review_required'))").bind(unit,modelId,b.quantity,unit,modelId).run();
          if(!lock.meta.changes)return json({ok:false,error:"EMISSAO_PENDENTE_CONFERENCIA",evoRequestsMade:0},409);
          batchId=lock.meta.last_row_id;quantity=b.quantity;
          const now=new Date(),until=new Date(now.getTime()+Number(model.validity_days)*86400000);
          const payload={nome:voucherName(unit,model.name,batchId)+"M",qtde:quantity,flUtilizarSite:true,flCodigoUnico:quantity===1,flIlimitado:false,inicio:now.toISOString(),validade:until.toISOString(),tipoDesconto:model.discount_type,valor:model.discount_value,...fields};
          try{
            const created=await voucherEvoCall(env,cfg,"/api/v2/voucher","POST",payload);
            voucherId=Number(created?.voucherId);
            if(!Number.isSafeInteger(voucherId)||voucherId<1)throw voucherError("EVO_NAO_RETORNOU_ID");
            await env.DB.prepare("UPDATE club_voucher_batches SET evo_voucher_id=?,status='awaiting_codes' WHERE id=?").bind(voucherId,batchId).run();
            createdNow=true;
          }catch(e){
            await env.DB.prepare("UPDATE club_voucher_batches SET status='review_required' WHERE id=?").bind(batchId).run();
            return json({ok:false,error:"EMISSAO_EXIGE_CONFERENCIA_NA_EVO",batchId,detail:String(e?.message||e),evoRequestsMade:1},502);
          }
        }
        try{
          const data=await voucherEvoCall(env,cfg,"/api/v1/voucher/get-codes-by-voucher-id/"+voucherId+"?take="+quantity+"&skip=0","GET");
          const rows=Array.isArray(data?.list)?data.list:[];const allCodes=rows.filter(x=>Number(x.voucherId)===voucherId&&typeof x.voucherCode==="string"&&x.voucherCode.trim()).map(x=>x.voucherCode.trim());
          const codeDiagnostics={returnedRows:rows.length,matchingCodes:allCodes.length,reportedQuantity:Number(data?.quantity??-1)};
          if(allCodes.length!==quantity||new Set(allCodes).size!==quantity)return json({ok:true,voucherId,batchId,status:"awaiting_codes",warning:"CODIGOS_PENDENTES_CONFERENCIA",codeDiagnostics,evoRequestsMade:createdNow?2:1});
          for(const code of allCodes)await env.DB.prepare("INSERT OR IGNORE INTO club_voucher_manual_codes(batch_id,unit,code) VALUES(?,?,?)").bind(batchId,unit,code).run();
          const persisted=await env.DB.prepare("SELECT COUNT(*) n FROM club_voucher_manual_codes WHERE batch_id=? AND unit=?").bind(batchId,unit).first();
          if(Number(persisted?.n)!==quantity)return json({ok:false,error:"CODIGOS_D1_INCOMPLETOS",batchId,voucherId},409);
          await env.DB.prepare("UPDATE club_voucher_batches SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(batchId).run();
          return json({ok:true,voucherId,batchId,code:allCodes[0],codes:allCodes,status:"completed",evoRequestsMade:createdNow?2:1});
        }catch(e){
          return json({ok:true,voucherId,batchId,status:"awaiting_codes",warning:"CONSULTA_CODIGOS_PENDENTE",detail:String(e?.message||e),evoRequestsMade:createdNow?2:1});
        }
      }
      if (url.pathname === "/admin/club-voucher-status" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const [rq,cq,bq]=await Promise.all([
          env.DB.prepare("SELECT id,source_type sourceType,source_id sourceId,status,delivery_mode deliveryMode,evo_voucher_id evoVoucherId,assigned_code assignedCode,created_at createdAt FROM club_voucher_requests WHERE unit=? ORDER BY id DESC LIMIT 100").bind(unit).all(),
          env.DB.prepare("SELECT status,COUNT(*) n FROM club_voucher_codes WHERE unit=? GROUP BY status").bind(unit).all(),
          env.DB.prepare("SELECT status,COUNT(*) n FROM club_voucher_batches WHERE unit=? GROUP BY status").bind(unit).all()
        ]);
        const requests=rq.results||[],codes=cq.results||[],batches=bq.results||[];
        const manualPending=await env.DB.prepare("SELECT b.id,b.model_id,b.requested_quantity,b.evo_voucher_id,b.status FROM club_voucher_batches b WHERE b.unit=? AND b.status='awaiting_codes' AND b.evo_voucher_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM club_voucher_requests r WHERE r.batch_id=b.id AND r.unit=b.unit) ORDER BY b.id DESC LIMIT 20").bind(unit).all();
        return json({ok:true,unit,requests,codes,batches,manualPending:manualPending.results||[],counts:{requests:requests.length,waiting:requests.filter(x=>x.status==="pending").length,issued:requests.filter(x=>x.evoVoucherId).length}});
      }
      if (url.pathname === "/admin/club-voucher-models" && ["GET","POST","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=request.method==="GET"?{}:await request.json().catch(()=>null);
        if(!b)return json({ok:false,error:"JSON_INVALIDO"},400);
        const unit=String(request.method==="GET"?url.searchParams.get("unit"):b.unit||"").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(request.method==="GET"){
          const q=await env.DB.prepare("SELECT id,unit,name,COALESCE(NULLIF(public_name,''),name) publicName,discount_type discountType,discount_value discountValue,validity_days validityDays,contract_ids_json contractIdsJson,enabled,created_at createdAt FROM club_voucher_models WHERE unit=? ORDER BY id DESC").bind(unit).all();
          return json({ok:true,unit,models:(q.results||[]).map(x=>{const selection=voucherSelection(x.contractIdsJson);return {...x,selectionType:selection.kind,contractIds:selection.kind==="contract"?selection.ids:[],serviceIds:selection.kind==="service"?selection.ids:[]}})});
        }
        const name=String(b.name||"").trim(),publicName=String(b.publicName||b.name||"").trim(),type=Number(b.discountType),value=Number(b.discountValue),days=Number(b.validityDays),selectionType=String(b.selectionType||"contract").toLowerCase(),ids=Array.isArray(selectionType==="service"?b.serviceIds:b.contractIds)?[...new Set((selectionType==="service"?b.serviceIds:b.contractIds).map(Number))]:[];
        if(!["contract","service"].includes(selectionType)||name.length<3||name.length>100||publicName.length<3||publicName.length>100||![1,2].includes(type)||!Number.isFinite(value)||value<=0||(type===1&&value>100)||!Number.isInteger(days)||days<1||days>365||!ids.length||ids.length>100||ids.some(x=>!Number.isSafeInteger(x)||x<=0))return json({ok:false,error:"MODELO_INVALIDO"},400);
        const known=selectionType==="service"?await env.DB.prepare("SELECT evo_service_id id FROM evo_service_catalog WHERE unit=? AND is_active=1").bind(unit).all():await env.DB.prepare("SELECT DISTINCT id_membership id FROM evo_member_contracts WHERE unit=? AND id_membership IS NOT NULL").bind(unit).all();
        const allowed=new Set((known.results||[]).map(x=>String(x.id)));
        if(ids.some(x=>!allowed.has(String(x))))return json({ok:false,error:selectionType==="service"?"SERVICO_NAO_ENCONTRADO_NO_D1":"CONTRATO_NAO_ENCONTRADO_NO_D1"},400);
        const storedIds=JSON.stringify(selectionType==="service"?{kind:"service",ids}:ids);
        if(request.method==="POST"){
          const q=await env.DB.prepare("INSERT INTO club_voucher_models(unit,name,public_name,discount_type,discount_value,validity_days,contract_ids_json) VALUES(?,?,?,?,?,?,?)").bind(unit,name,publicName,type,value,days,storedIds).run();
          return json({ok:true,id:q.meta.last_row_id,unit});
        }
        const id=Number(b.id);
        if(!Number.isSafeInteger(id)||id<=0)return json({ok:false,error:"ID_INVALIDO"},400);
        const q=await env.DB.prepare("UPDATE club_voucher_models SET name=?,public_name=?,discount_type=?,discount_value=?,validity_days=?,contract_ids_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND unit=?").bind(name,publicName,type,value,days,storedIds,id,unit).run();
        return json({ok:!!q.meta.changes,id,unit,error:q.meta.changes?undefined:"MODELO_NAO_ENCONTRADO"},q.meta.changes?200:404);
      }
      // Authenticated server-to-server transport: credentials remain inside this Worker.
      if ((url.pathname === "/internal/evo-bike" || url.pathname === "/internal/evo-unit") && request.method === "POST") {
        const body = await request.text();
        if (body.length > 8192) return json({ok:false,error:"REQUISICAO_INVALIDA"},400);
        const timestamp = request.headers.get("x-evo-timestamp") || "";
        const signature = request.headers.get("x-evo-signature") || "";
        if (!/^\d+$/.test(timestamp) || Math.abs(Date.now()-Number(timestamp))>30000 || !/^[a-f0-9]{64}$/.test(signature)) return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let operation; try { operation=JSON.parse(body); } catch { return json({ok:false,error:"REQUISICAO_INVALIDA"},400); }
        const target=allowedEvoTarget(operation.url,operation.method);
        if (!target) return json({ok:false,error:"OPERACAO_EVO_NAO_PERMITIDA"},400);
        const requestedUnit=url.pathname==="/internal/evo-bike"?"bike":String(operation.unit||"bike").toLowerCase();
        const cfg=await getEvoConfig(env,requestedUnit);
        if(target.pathname==="/api/v2/sales"&&operation.method==="POST"){const p=operation.payload;const keys=["idProduct","productAmount","memberData","payment","totalInstallments","sessionId","productValue","discount","discountValue","productDiscount"];if(!p||typeof p!=="object"||Array.isArray(p)||Object.keys(p).some(k=>!keys.includes(k))||!/^clubpop-lab-[a-f0-9-]{36}$/.test(String(p.sessionId||""))||!Number.isSafeInteger(p.idProduct)||p.idProduct<=0||p.productAmount!==1||!Number.isSafeInteger(p.memberData?.idMember)||p.memberData.idMember<=0||p.payment!==15||p.totalInstallments!==1||!["bike","gym"].includes(requestedUnit)||Object.entries(p).some(([k,v])=>["productValue","discount","discountValue","productDiscount"].includes(k)&&(!Number.isFinite(v)||v<0||v>1000)))return json({ok:false,error:"LAB_EVO_SALE_INVALID"},400);}
        const isVoucherCreate=target.pathname==="/api/v2/voucher"&&operation.method==="POST";
        if(isVoucherCreate){
          const v=operation.payload;
          const service=v?.flContrato===false, ids=service?v?.idsServicos:v?.idsContratos;
          if(!v||typeof v!=="object"||Array.isArray(v)||typeof v.flContrato!=="boolean"||!Array.isArray(ids)||!ids.length||ids.some(x=>!Number.isSafeInteger(x)||x<=0)||!/^.{3,100}$/.test(String(v.nome||""))||!Number.isFinite(v.valor)||v.valor<=0||![1,2].includes(v.tipoDesconto)||v.tipoDesconto===1&&v.valor>100||!v.inicio||!v.validade||!Number.isInteger(v.qtde)||v.qtde<1||v.qtde>50||v.flIlimitado!==false)return json({ok:false,error:"VOUCHER_INVALIDO"},400);
          const known=service?await env.DB.prepare("SELECT evo_service_id id FROM evo_service_catalog WHERE unit=? AND is_active=1").bind(requestedUnit).all():await env.DB.prepare("SELECT DISTINCT id_membership id FROM evo_member_contracts WHERE unit=? AND id_membership IS NOT NULL").bind(requestedUnit).all();
          const allowed=new Set((known.results||[]).map(x=>String(x.id)));
          if(ids.some(x=>!allowed.has(String(x))))return json({ok:false,error:service?"SERVICO_NAO_ENCONTRADO_NO_D1":"CONTRATO_NAO_ENCONTRADO_NO_D1"},400);
        }
        if(target.pathname==="/api/v1/members/fitcoins"&&operation.method==="PUT"){
          const held=await env.DB.prepare("SELECT id FROM club_pix_orders WHERE unit=? AND external_member_id=? AND ((reservation_state='held' AND (choice_expires_at IS NULL OR datetime(choice_expires_at)>datetime('now'))) OR external_state IN ('running','review','refunding')) LIMIT 1").bind(requestedUnit,target.searchParams.get("idMember")||"").first();
          if(held)return json({ok:false,error:"FITCOINS_RESERVADOS_EM_COMPRA"},409);
        }
        const isLabSale=target.pathname==="/api/v2/sales"&&operation.method==="POST";
        const upstream=await fetch(target.href,{method:operation.method,headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json",...(isVoucherCreate?{"Content-Type":"application/json-patch+json"}:isLabSale?{"Content-Type":"application/json"}:{})},...(isVoucherCreate||isLabSale?{body:JSON.stringify(operation.payload)}:{})});
        try { const p=target.pathname.toLowerCase(), purpose=(p==="/api/v2/management/activeclients"||(p==="/api/v2/members"&&target.searchParams.get("status")==="1"))?"student_sync":p.includes("/membermembership")?"contracts":p==="/api/v1/activities"?"activities_catalog":p.includes("/activities/schedule/detail")?"checkin_detail":p.includes("/activities/schedule")?"schedule":p==="/api/v2/voucher"?"voucher_create":p.includes("/fitcoins")?"fitcoins":p.includes("/member/sessions")?"attendance":p.includes("/members/")||p==="/api/v2/members"?"member_profile":"other"; await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,?,?,?,?)").bind(requestedUnit,purpose,String(operation.method||"GET").toUpperCase(),target.pathname,upstream.status,upstream.ok?1:0).run(); } catch {}
        if (target.pathname === "/api/v2/management/activeclients") {
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
              "Cache-Control": "no-store",
            },
          });
        }
        const upstreamBody = await upstream.text();
        // Diagnóstico temporário e isolado: preserva o payload bruto já recebido na sincronização
        // para o cliente-controle 983786, sem nova chamada à EVO e sem alterar a resposta.
        if (requestedUnit === "bike" && target.pathname.toLowerCase() === "/api/v2/members" && target.searchParams.get("status") === "1" && upstream.ok) {
          try {
            const members = JSON.parse(upstreamBody);
            const sample = Array.isArray(members) ? members.find(m => String(m?.idMember) === "983786") : null;
            if (sample) {
              await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_payload_diagnostic (unit TEXT NOT NULL, evo_member_id TEXT NOT NULL, payload_json TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(unit,evo_member_id))").run();
              await env.DB.prepare("INSERT INTO evo_sync_payload_diagnostic(unit,evo_member_id,payload_json,captured_at) VALUES('bike','983786',?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,captured_at=CURRENT_TIMESTAMP").bind(JSON.stringify(sample)).run();
            }
          } catch {}
        }
        return new Response(upstreamBody, {status: upstream.status, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
      }

      // Stars are visible by default; only the authenticated student can opt out.
      if(url.pathname==="/member/checkin-stars-privacy"&&["GET","PUT"].includes(request.method)){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS checkin_stars_privacy(member_id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        if(request.method==="PUT"){
          const body=await request.json().catch(()=>({}));
          if(typeof body.enabled!=="boolean")return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
          await env.DB.prepare("INSERT INTO checkin_stars_privacy(member_id,enabled,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(member_id) DO UPDATE SET enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP").bind(member.id,body.enabled?1:0).run();
        }
        const row=await env.DB.prepare("SELECT enabled FROM checkin_stars_privacy WHERE member_id=?").bind(member.id).first();
        return json({ok:true,enabled:row?Number(row.enabled)===1:true});
      }
      if(url.pathname==="/admin/checkin-stars"&&request.method==="POST"){
        const unit=String(url.searchParams.get("unit")||"");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const actor=await verifyProxyAuth(request,env,unit,"checkin-stars");
        if(!actor||!["admin","reception"].includes(actor.role)||actor.role==="reception"&&!((actor.permissions||[]).includes("*")||(actor.permissions||[]).includes("/tela-checkin.html")))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const body=await request.json().catch(()=>({}));
        if(!Array.isArray(body.ids)||body.ids.length>100)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const ids=[...new Set(body.ids.map(String).filter(x=>/^\d{1,16}$/.test(x)))];
        if(!ids.length)return json({ok:true,stars:{}});
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS checkin_stars_privacy(member_id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const base=unit==="gym"?rankingBase:(await import('./lib/admin-bike-ranking.mjs')).rankingBase;
        const marks=ids.map(()=>"?").join(",");
        const sql=base+"SELECT t.evo_member_id,MAX(t.stars) stars FROM totals t LEFT JOIN members m ON "+(unit==="gym"?"(CAST(m.gym_client_id AS TEXT)=t.evo_member_id OR CAST(m.evo_member_id AS TEXT)=t.evo_member_id)":"CAST(m.evo_member_id AS TEXT)=t.evo_member_id")+" LEFT JOIN checkin_stars_privacy p ON p.member_id=m.id WHERE COALESCE(p.enabled,1)=1 AND t.stars>0 AND t.evo_member_id IN ("+marks+") GROUP BY t.evo_member_id";
        const rows=(await env.DB.prepare(sql).bind(...ids).all()).results||[];
        const stars=Object.fromEntries(rows.map(x=>[String(x.evo_member_id),Number(x.stars)]));
        return json({ok:true,stars});
      }
      if(url.pathname==="/admin/hall-conquests/display"&&request.method==="POST"){
        const unit=url.searchParams.get("unit");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const actor=await verifyProxyAuth(request,env,unit,"hall-conquests");
        if(!actor||actor.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        try{
          const body=await request.json(),memberId=String(body.evoMemberId||""),sessionId=String(body.sessionId||""),earnedDate=String(body.earnedDate||""),date=String(body.date||""),target=Number(body.target);
          if(!/^\d+$/.test(memberId)||!/^\d+$/.test(sessionId)||!/^\d{4}-\d{2}-\d{2}$/.test(earnedDate)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(target)||target<1||earnedDate>=date)return json({ok:false,error:"DADOS_INVALIDOS"},400);
          const eligible=await env.DB.prepare("SELECT 1 FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? AND activity_date=? AND evo_member_id=? AND removed=0 LIMIT 1").bind(unit,sessionId,date,memberId).first();
          if(!eligible)return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},409);
          await env.DB.prepare("INSERT OR IGNORE INTO conquest_tv_display(unit,evo_member_id,target,earned_date,displayed_date,session_id) VALUES(?,?,?,?,?,?)").bind(unit,memberId,target,earnedDate,date,sessionId).run();
          return json({ok:true});
        }catch{return json({ok:false,error:"REGISTRO_INDISPONIVEL"},500)}
      }
      if(url.pathname==="/admin/hall-conquests/settings"&&["GET","POST"].includes(request.method)){
        const unit=url.searchParams.get("unit");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const actor=await verifyProxyAuth(request,env,unit,"hall-conquests");
        if(!actor||!["admin","reception"].includes(actor.role)||request.method==="POST"&&actor.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        try{
          if(request.method==="POST"){
            const body=await request.json(),positions=Number(body.positionsSeconds),highlights=Number(body.highlightsSeconds);
            if(!Number.isInteger(positions)||positions<5||positions>60||!Number.isInteger(highlights)||highlights<5||highlights>60||typeof body.showEmpty!=="boolean")return json({ok:false,error:"CONFIGURACAO_INVALIDA"},400);
            await env.DB.prepare("INSERT INTO conquest_tv_settings(unit,show_empty,positions_seconds,highlights_seconds,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET show_empty=excluded.show_empty,positions_seconds=excluded.positions_seconds,highlights_seconds=excluded.highlights_seconds,updated_at=CURRENT_TIMESTAMP").bind(unit,body.showEmpty?1:0,positions,highlights).run();
          }
          const row=await env.DB.prepare("SELECT show_empty,positions_seconds,highlights_seconds FROM conquest_tv_settings WHERE unit=?").bind(unit).first();
          return json({ok:true,settings:{showEmpty:!!row?.show_empty,positionsSeconds:row?.positions_seconds??15,highlightsSeconds:row?.highlights_seconds??10}});
        }catch{return json({ok:false,error:"CONFIGURACAO_INDISPONIVEL"},500)}
      }
      if(url.pathname==="/admin/hall-conquests"&&request.method==="GET"){
        const unit=url.searchParams.get("unit");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const actor=await verifyProxyAuth(request,env,unit,"hall-conquests");
        if(!actor||!["admin","reception"].includes(actor.role)||actor.role==="reception"&&!((actor.permissions||[]).includes("*")||(actor.permissions||[]).includes("/admin-alunos-evo.html")))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        try{return json(await hallConquests(env.DB,unit,url.searchParams.get("date")))}catch{return json({ok:false,error:"CONSULTA_INDISPONIVEL"},500)}
      }
      if(url.pathname==="/admin/community-missions"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=url.searchParams.get("unit")||"club";
        if(!["club","bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        try{return json(await adminCommunityMissions(env.DB,unit,url.searchParams.get("id")||""))}catch(e){return json({ok:false,error:"RELATORIO_INDISPONIVEL"},500)}
      }
      if(url.pathname==="/admin/bike-stars"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(vd.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        if(vd.role==="reception"&&(!(vd.permissions||[]).some(p=>p==="*"||p==="/admin-alunos-evo.html")||!(vd.units||[]).includes("bike")))return json({ok:false,error:"SEM_PERMISSAO_ALUNOS"},403);
        return json(await adminBikeRanking(env.DB,url.searchParams));
      }
      if(url.pathname==="/admin/gym-stars"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(vd.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        if(vd.role==="reception"&&(!(vd.permissions||[]).some(p=>p==="*"||p==="/admin-alunos-evo.html")||!(vd.units||[]).includes("gym")))return json({ok:false,error:"SEM_PERMISSAO_ALUNOS"},403);
        return json(await adminGymRanking(env.DB,url.searchParams));
      }
      // Student-only lifetime stars, read from D1; never calls EVO.
      if (url.pathname === "/member/stars" && request.method === "GET") {
        const auth=request.headers.get("Authorization")||"";
        if(!auth.startsWith("Bearer "))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const tokenHash=await sha256(auth.slice(7));
        const session=await env.DB.prepare("SELECT m.id,m.evo_member_id,COALESCE(NULLIF(m.gym_client_id,''),g.gym_client_id) AS gym_client_id,m.first_name,m.last_name FROM auth_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
        if(!session)return json({ok:false,error:"SESSAO_INVALIDA"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        const evoId=unit==="gym"?session.gym_client_id:session.evo_member_id;
        if(!evoId)return json({ok:false,error:"UNIDADE_NAO_VINCULADA"},404);
        let legacy=0,actual=0;
        if(unit==="gym"){
          const starRow=await env.DB.prepare(rankingBase+"SELECT legacy,actual,stars FROM totals WHERE evo_member_id=? LIMIT 1").bind(String(evoId)).first();
          if(!starRow)return json({ok:false,error:"ALUNO_SEM_RANKING"},404);
          legacy=Number(starRow.legacy||0);actual=Number(starRow.actual||0);
        }else{
          const starRow=await env.DB.prepare("SELECT COALESCE(m.presencas_legadas_bike,0) AS legacy,MAX((SELECT COUNT(*) FROM evo_member_attendance a WHERE a.unit='bike' AND a.evo_member_id=CAST(m.evo_member_id AS TEXT)),COALESCE((SELECT baseline_count FROM bike_evo_historical_baseline b WHERE b.evo_member_id=CAST(m.evo_member_id AS TEXT)),0)+(SELECT COUNT(*) FROM evo_member_attendance a WHERE a.unit='bike' AND a.evo_member_id=CAST(m.evo_member_id AS TEXT) AND a.attendance_date>'2026-10-18')) AS actual FROM members m WHERE m.id=?").bind(session.id).first();
          legacy=Number(starRow?.legacy||0);actual=Number(starRow?.actual||0);
        }
        return json({ok:true,unit,memberId:session.id,name:[session.first_name,session.last_name].filter(Boolean).join(" ").trim()||"Aluno",stars:{legacy,actual,total:legacy+actual},source:"d1",evoRequestsMade:0});
      }
      // Cache de leitura do Dashboard: nunca chama a EVO.
      if (url.pathname === "/member/evo-cache" && request.method === "GET") {
        const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const tokenHash=await sha256(auth.slice(7));
        const session=await env.DB.prepare("SELECT m.id,m.evo_member_id,COALESCE(m.gym_client_id,g.gym_client_id) AS gym_client_id FROM auth_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
        if(!session)return json({ok:false,error:"SESSAO_INVALIDA"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",evoId=unit==="gym"?session.gym_client_id:session.evo_member_id;
        if(!evoId)return json({ok:false,error:"UNIDADE_NAO_VINCULADA"},404);
        if(unit==="bike"){
          const parse=v=>{try{return JSON.parse(v||"{}")}catch{return {}}};
          const cache=await env.DB.prepare("SELECT payload_json,updated_at FROM evo_member_cache WHERE unit='bike' AND evo_member_id=?").bind(String(evoId)).first();
          const master=await env.DB.prepare("SELECT personal_json,financial_json,memberships_json,synced_at FROM evo_member_master WHERE unit='bike' AND evo_member_id=?").bind(String(evoId)).first();
          const base=await env.DB.prepare("SELECT first_name,last_name FROM members WHERE id=?").bind(session.id).first();
          const data=parse(cache?.payload_json),personal=parse(master?.personal_json),financial=parse(master?.financial_json);
          data.member={idMember:evoId,firstName:personal.firstName||base?.first_name||"Aluno",lastName:personal.lastName||base?.last_name||"",branchName:"Studio Bike Pop",memberships:parse(master?.memberships_json),...(data.member||{})};
          if(!Array.isArray(data.member.memberships))data.member.memberships=[];
          const studentBalance=await env.DB.prepare("SELECT fitcoins FROM evo_students WHERE unit='bike' AND evo_member_id=? AND is_current=1 LIMIT 1").bind(String(evoId)).first();
          const coin=[studentBalance?.fitcoins,data.fitcoins,financial.totalFitCoins,financial.totalFitcoins].find(v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)));data.fitcoins=coin===undefined?null:Number(coin);
          const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),part=t=>parts.find(p=>p.type===t).value,month=part("year")+"-"+part("month"),today=month+"-"+part("day");
          const q=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session,json_extract(raw_json,'$.raw.slotNumber') AS slotNumber FROM evo_member_attendance WHERE unit='bike' AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(String(evoId),month).all();
          const rows=(q.results||[]).map(a=>({date:a.attendance_date,startTime:a.start_time,activity:a.activity_name,idActivitySession:a.id_activity_session,slotNumber:a.slotNumber,presenca:true,isFinalized:true})),times={},acts={},days=new Set();
          for(const a of rows){days.add(a.date);if(a.startTime)times[a.startTime]=(times[a.startTime]||0)+1;if(a.activity)acts[a.activity]=(acts[a.activity]||0)+1}
          const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||null,monday=new Date(today+"T00:00:00Z");monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=rows.filter(a=>a.date>=monday.toISOString().slice(0,10)&&a.date<=today);
          data.sessionDetails=await memberSessionDetails(env.DB,unit,evoId);
          await attachContractSessions(env.DB,unit,evoId,data);
          data.attendance={ok:true,period:{month},attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),favoriteEquipment:favoriteEquipmentFromRows(rows,unit,top(acts)),currentWeek:{attendanceCount:week.length,distinctDays:new Set(week.map(a=>a.date)).size},attendance:rows};
          const starRow=await env.DB.prepare("SELECT COALESCE(m.presencas_legadas_bike,0) AS legacy,MAX((SELECT COUNT(*) FROM evo_member_attendance e WHERE e.unit='bike' AND e.evo_member_id=CAST(m.evo_member_id AS TEXT)),COALESCE((SELECT baseline_count FROM bike_evo_historical_baseline b WHERE b.evo_member_id=CAST(m.evo_member_id AS TEXT)),0)+(SELECT COUNT(*) FROM evo_member_attendance e WHERE e.unit='bike' AND e.evo_member_id=CAST(m.evo_member_id AS TEXT) AND e.attendance_date>'2026-10-18')) AS current_count FROM members m WHERE m.id=?").bind(session.id).first();
          data.bikeStars={total:Number(starRow?.legacy||0)+Number(starRow?.current_count||0),legacy:Number(starRow?.legacy||0),current:Number(starRow?.current_count||0)};
          const sync=await env.DB.prepare("SELECT sync_time,last_sync_at FROM evo_sync_config WHERE unit='bike'").first();
          return json({ok:true,unit,cached:true,source:"d1",evoRequestsMade:0,updatedAt:cache?.updated_at||master?.synced_at||null,sync:{syncTime:sync?.sync_time||null,lastSyncAt:sync?.last_sync_at||null},data});
        }
        const parse=v=>{try{return JSON.parse(v||"{}")}catch{return{}}};
        const [cache,master,student,contracts,base,sync]=await Promise.all([
          env.DB.prepare("SELECT payload_json,updated_at FROM evo_member_cache WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(evoId)).first(),
          env.DB.prepare("SELECT personal_json,financial_json,memberships_json,synced_at FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(evoId)).first(),
          env.DB.prepare("SELECT display_name,membership_status,fitcoins,updated_at FROM evo_students WHERE unit=? AND evo_member_id=? AND is_current=1 LIMIT 1").bind(unit,String(evoId)).first(),
          env.DB.prepare("SELECT id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json FROM evo_member_contracts WHERE unit=? AND evo_member_id=? ORDER BY start_date DESC,contract_key DESC").bind(unit,String(evoId)).all(),
          env.DB.prepare("SELECT first_name,last_name FROM members WHERE id=? LIMIT 1").bind(session.id).first(),
          env.DB.prepare("SELECT sync_time,last_sync_at FROM evo_sync_config WHERE unit=? LIMIT 1").bind(unit).first()
        ]);
        const data=parse(cache?.payload_json),personal=parse(master?.personal_json),financial=parse(master?.financial_json),masterMemberships=parse(master?.memberships_json),cachedMember=data.member&&typeof data.member==="object"?data.member:{};
        const display=String(student?.display_name||"").trim().split(/\s+/),fallbackFirst=display.shift()||base?.first_name||"Aluno",fallbackLast=display.join(" ")||base?.last_name||"";
        const absenceRows=await env.DB.prepare("SELECT id_activity_session,attendance_date,activity_name,evo_status,justified_absence FROM evo_member_attendance_states WHERE unit=? AND evo_member_id=? AND evo_status IN (1,2) AND LOWER(TRIM(activity_name))='bike pop'").bind(unit,String(evoId)).all();
        const absences=absenceRows.results||[];
        const contractRecords=(contracts?.results||[]).map(x=>({row:x,raw:parse(x.raw_json)}));
        const eligibleAt=(date)=>contractRecords.filter(({row:x,raw})=>{
          const name=String(raw.nameMembership??raw.name??x.membership_name??"").toUpperCase();
          const status=String(x.membership_status??raw.membershipStatus??"").toLowerCase();
          const start=String(raw.startDate??x.start_date??"").slice(0,10),end=String(raw.endDate??x.end_date??"9999-12-31").slice(0,10);
          return status==="active"&&!/WELLHUB|GYMPASS|TOTAL\s*PASS|TOTALPASS|MASSAGEM|SERVIÇO|SERVICO/.test(name)&&raw.limitless!==true&&Number(raw.concludedSessions)>0&&start<=date&&date<=end;
        });
        const attributed=new Map();
        for(const absence of absences){
          const candidates=eligibleAt(absence.attendance_date);
          if(candidates.length!==1)continue; // Never duplicate an absence across overlapping contracts.
          const id=String(candidates[0].row.id_member_membership||"");
          if(!id)continue;
          const list=attributed.get(id)||[];list.push(absence);attributed.set(id,list);
        }
        const projected=contractRecords.map(({row:x,raw})=>{
          const linked=attributed.get(String(x.id_member_membership||""))||[];
          const isEligible=String(x.membership_status??raw.membershipStatus??"").toLowerCase()==="active"&&!/WELLHUB|GYMPASS|TOTAL\s*PASS|TOTALPASS|MASSAGEM|SERVIÇO|SERVICO/.test(String(raw.nameMembership??raw.name??x.membership_name??"").toUpperCase())&&raw.limitless!==true;
          return {...raw,idMembership:raw.idMembership??x.id_membership,idMemberMembership:raw.idMemberMembership??x.id_member_membership,idCategoryMembership:raw.idCategoryMembership??x.category_id,nameMembership:raw.nameMembership??raw.name??x.membership_name,membershipStatus:raw.membershipStatus??raw.statusMemberMembership??x.membership_status,startDate:raw.startDate??x.start_date,endDate:raw.endDate??x.end_date,cancelDate:raw.cancelDate??x.cancel_date,saleDate:raw.saleDate??x.sale_date,flAdditionalMembership:raw.flAdditionalMembership??!!x.is_additional,absenceAudit:isEligible?{unjustified:linked.filter(a=>a.evo_status===1&&a.justified_absence===0).length,justified:linked.filter(a=>a.justified_absence===1).length,partial:true,attribution:"unique_eligible_contract_in_d1"}:null};
        }),unitMemberships=projected.length?projected:(Array.isArray(masterMemberships)?masterMemberships:[]);
        data.member={idMember:evoId,firstName:personal.firstName||cachedMember.firstName||fallbackFirst,lastName:personal.lastName||cachedMember.lastName||fallbackLast,branchName:unit==="gym"?"Studio Gym Pop":"Studio Bike Pop",membershipStatus:student?.membership_status||cachedMember.membershipStatus||null,memberships:unitMemberships};
        const coin=[student?.fitcoins,financial.totalFitCoins,financial.totalFitcoins].find(v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)));data.fitcoins=coin===undefined?null:Number(coin);
        const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),part=t=>parts.find(p=>p.type===t).value,month=part("year")+"-"+part("month"),today=month+"-"+part("day");
        const q=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session,json_extract(raw_json,'$.raw.slotNumber') AS slotNumber FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,String(evoId),month).all();
        const rows=(q.results||[]).map(a=>({date:a.attendance_date,startTime:a.start_time,activity:a.activity_name,idActivitySession:a.id_activity_session,slotNumber:a.slotNumber,presenca:true,isFinalized:true})),times={},acts={},days=new Set();
        for(const a of rows){days.add(String(a.date).slice(0,10));if(a.startTime)times[a.startTime]=(times[a.startTime]||0)+1;if(a.activity)acts[a.activity]=(acts[a.activity]||0)+1}
        const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||null,monday=new Date(today+"T00:00:00Z");monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=rows.filter(a=>String(a.date).slice(0,10)>=monday.toISOString().slice(0,10)&&String(a.date).slice(0,10)<=today);
        data.sessionDetails=await memberSessionDetails(env.DB,unit,evoId);
        await attachContractSessions(env.DB,unit,evoId,data);
          data.attendance={ok:true,period:{month},attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),favoriteEquipment:favoriteEquipmentFromRows(rows,unit,top(acts)),currentWeek:{attendanceCount:week.length,distinctDays:new Set(week.map(a=>String(a.date).slice(0,10))).size},attendance:rows};
        return json({ok:true,unit,cached:!!cache,source:"d1-unified",evoRequestsMade:0,coverage:{cache:!!cache,master:!!master,student:!!student,contracts:projected.length,attendance:rows.length},updatedAt:cache?.updated_at||master?.synced_at||student?.updated_at||null,sync:{syncTime:sync?.sync_time||null,lastSyncAt:sync?.last_sync_at||null},data});
      }

      // Diagnóstico do aluno logado: somente D1, sem requisição EVO.
      if (url.pathname === "/member/d1-diagnostic" && request.method === "GET") {
        const auth=request.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const tokenHash=await sha256(auth.slice(7));const s=await env.DB.prepare("SELECT m.id,m.evo_member_id,m.gym_client_id,COALESCE(m.gym_client_id,g.gym_client_id) gym_resolved_id FROM auth_sessions a JOIN members m ON m.id=a.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE a.token_hash=? AND a.revoked_at IS NULL AND a.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();if(!s)return json({ok:false,error:"SESSAO_INVALIDA"},401);
        const inspect=async(unit,id)=>{if(!id)return {unit,linked:false,id:null,master:false,cache:false,attendance:0,contracts:0};const [master,cache,attendance,contracts]=await Promise.all([env.DB.prepare("SELECT 1 ok FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(id)).first(),env.DB.prepare("SELECT 1 ok FROM evo_member_cache WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(id)).first(),env.DB.prepare("SELECT COUNT(*) n FROM evo_member_attendance WHERE unit=? AND evo_member_id=?").bind(unit,String(id)).first(),env.DB.prepare("SELECT COUNT(*) n FROM evo_member_contracts WHERE unit=? AND evo_member_id=?").bind(unit,String(id)).first()]);return {unit,linked:true,id:String(id),master:!!master,cache:!!cache,attendance:Number(attendance?.n||0),contracts:Number(contracts?.n||0)}};
        return json({ok:true,source:"d1",evoRequestsMade:0,memberId:s.id,links:{bike:s.evo_member_id||null,gymMemberColumn:s.gym_client_id||null,gymResolved:s.gym_resolved_id||null},units:{bike:await inspect("bike",s.evo_member_id),gym:await inspect("gym",s.gym_resolved_id)}});
      }


      // Importação CSV EVO: somente novos IDs, sem consultas EVO e sem alterar contratos.
      if (url.pathname === "/admin/evo-csv-import" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));
        const unit=String(b.unit||"");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const members=Array.isArray(b.members)?b.members:[];
        if(!members.length||members.length>50)return json({ok:false,error:"LOTE_INVALIDO_MAX_50"},400);
        let inserted=0,existing=0,invalid=0;
        const safe=(x,n=250)=>String(x??"").trim().slice(0,n);
        for(const m of members){
          const id=safe(m.IDCLIENTE,30);
          if(!/^\d+$/.test(id)){invalid++;continue}
          const name=safe(m.NOME,240),parts=name.split(/\s+/);
          const cpf=safe(m["CPF (CIN)"],20).replace(/\D/g,"");
          const birth=safe(m["DATA DE NASCIMENTO"],40);
          const dateBR=x=>{const z=String(x||"").match(/^(\d{2})\/(\d{2})\/(\d{4})/);return z?z[3]+"-"+z[2]+"-"+z[1]:null};
          const personal={idMember:Number(id),firstName:parts.shift()||"",lastName:parts.join(" "),document:cpf||null,birthDate:dateBR(birth),registerDate:dateBR(m["DATA DO CADASTRO"])};
          const contacts={email:safe(m["E-MAIL"],250),phone:safe(m.TELEFONE,80)};
          const integrations={gympassId:safe(m["WELLHUB ID"],120)||null,idBranch:unit==="bike"?8347:null,branchName:unit==="bike"?"STUDIO BIKE POP":"STUDIO GYM POP"};
          const meta={source:"CLIENTES.csv",sourceType:"evo_inactive_csv",statusCliente:safe(m.STATUSCLIENTE,60),importDate:new Date().toISOString()};
          // Nunca sobrescrever alunos atuais nem reclassificar cadastros existentes.
          const result=await env.DB.prepare("INSERT OR IGNORE INTO evo_member_master(unit,evo_member_id,is_current,personal_json,contacts_json,address_json,access_json,financial_json,integrations_json,memberships_json,metadata_json,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)")
            .bind(unit,id,0,JSON.stringify(personal),JSON.stringify(contacts),"{}","{}","{}",JSON.stringify(integrations),"[]",JSON.stringify(meta),JSON.stringify(m)).run();
          if(Number(result.meta?.changes||0)>0)inserted++;else existing++;
        }
        return json({ok:true,unit,received:members.length,inserted,existing,invalid,evoRequests:0});
      }

      // Recebe um lote coletivo já obtido da EVO pelo transporte central e materializa snapshots no D1.
      if (url.pathname === "/admin/evo-sync-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike",members=Array.isArray(b.members)?b.members:[];
        if(!members.length)return json({ok:false,error:"LOTE_VAZIO"},400);
        const month=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
        const ar=await env.DB.prepare("SELECT evo_member_id,attendance_date,activity_name,raw_json FROM attendance_history WHERE unit=? AND substr(attendance_date,1,7)=?").bind(unit,month).all(),by={};
        for(const a of ar.results||[]){const k=String(a.evo_member_id);(by[k]||(by[k]=[])).push(a)}
        const statements=[];
        for(const x of members){const id=x.idMember??x.id??null;if(id==null)continue;const rows=by[String(id)]||[],times={},acts={},days=new Set();for(const a of rows){days.add(String(a.attendance_date).slice(0,10));if(a.activity_name)acts[a.activity_name]=(acts[a.activity_name]||0)+1;try{const j=JSON.parse(a.raw_json||"{}"),t=j.startTime||j.startDate;if(t)times[String(t).slice(11,16)]=(times[String(t).slice(11,16)]||0)+1}catch{}}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
          const payload={member:x,fitcoins:Number(x.totalFitCoins??x.totalFitcoins??0),attendance:{ok:true,attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),attendance:rows}};
          statements.push(env.DB.prepare("INSERT INTO evo_member_cache(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(unit,String(id),JSON.stringify(payload)));
        }
        for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
        await env.DB.prepare("UPDATE evo_sync_config SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=?,updated_at=CURRENT_TIMESTAMP WHERE unit=?").bind(Number(b.requests||0),unit).run();
        return json({ok:true,unit,saved:statements.length});
      }

      // Leitura agregada de presencas por aula no D1; nao consulta EVO.
      if(url.pathname==="/admin/daily-attendance"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||""),month=String(url.searchParams.get("month")||"");
        if(!["bike","gym"].includes(unit)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const q=await env.DB.prepare("SELECT activity_date AS date,SUM(COALESCE(attendance_count,0)) AS count,COUNT(*) AS sessions FROM evo_attendance_sessions WHERE unit=? AND status='done' AND substr(activity_date,1,7)=? GROUP BY activity_date ORDER BY activity_date DESC").bind(unit,month).all();
        return json({ok:true,source:"d1",evoRequestsMade:0,unit,month,days:(q.results||[]).map(r=>({date:r.date,count:Number(r.count||0),sessions:Number(r.sessions||0)}))});
      }
      if(url.pathname==="/admin/evo-student-sync-one"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck},cache:"no-store"}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||""),x=b.member||{},evoId=Number(x.idMember||x.id||b.idMember);
        if(!["bike","gym"].includes(unit)||!Number.isSafeInteger(evoId)||evoId<=0)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const email=String(x.email||x.emailAddress||x.mail||"").trim().toLowerCase()||null,birth=String(x.birthDate||x.dateBirth||x.birthdate||x.birthday||"").slice(0,10)||null,full=String(x.name||"").trim(),first=String(x.firstName||full).trim(),last=String(x.lastName||"").trim(),cpf=String(x.document||x.cpf||"").replace(/\D/g,""),now=new Date().toISOString();
        const before=await env.DB.prepare("SELECT id,email,birth_date FROM members WHERE evo_member_id=? LIMIT 1").bind(evoId).first();
        let memberId=before?.id||null;
        if(memberId){
          await env.DB.prepare("UPDATE members SET first_name=?,last_name=?,email=?,birth_date=?,cpf_last4=COALESCE(?,cpf_last4),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(first,last,email,birth,cpf?cpf.slice(-4):null,memberId).run();
        }else if(/^\d{11}$/.test(cpf)){
          const byCpf=await env.DB.prepare("SELECT id,evo_member_id,email,birth_date FROM members WHERE cpf_last4=? ORDER BY updated_at DESC LIMIT 20").bind(cpf.slice(-4)).all();
          const exact=(byCpf.results||[]).find(r=>Number(r.evo_member_id)===evoId);
          if(exact){memberId=exact.id;await env.DB.prepare("UPDATE members SET first_name=?,last_name=?,email=?,birth_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(first,last,email,birth,memberId).run()}
        }
        const master=await env.DB.prepare("SELECT personal_json FROM evo_member_master WHERE unit=? AND CAST(evo_member_id AS TEXT)=? LIMIT 1").bind(unit,String(evoId)).first();
        let personal={};try{personal=JSON.parse(master?.personal_json||"{}")}catch{}
        personal={...personal,...x,idMember:evoId,document:cpf||personal.document||null};
        if(master){
          await env.DB.prepare("UPDATE evo_member_master SET personal_json=?,raw_json=?,synced_at=?,is_current=1 WHERE unit=? AND CAST(evo_member_id AS TEXT)=?").bind(JSON.stringify(personal),JSON.stringify(x),now,unit,String(evoId)).run();
        }else{
          await env.DB.prepare("INSERT INTO evo_member_master(unit,evo_member_id,is_current,personal_json,raw_json,synced_at) VALUES(?,?,1,?,?,?)").bind(unit,String(evoId),JSON.stringify(personal),JSON.stringify(x),now).run();
        }
        const norm=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
        const peers=(await env.DB.prepare("SELECT evo_member_id,is_current,personal_json FROM evo_member_master WHERE unit=? AND CAST(evo_member_id AS TEXT)<>?").bind(unit,String(evoId)).all()).results||[];
        const currentName=norm([first,last].filter(Boolean).join(" ")),matches=[];
        for(const row of peers){let p={};try{p=JSON.parse(row.personal_json||"{}")}catch{}const pc=String(p.document||p.cpf||"").replace(/\D/g,""),pn=String(p.name||[p.firstName,p.lastName].filter(Boolean).join(" ")).trim(),sameCpf=/^\d{11}$/.test(cpf)&&pc===cpf,sameName=currentName&&norm(pn)===currentName;if(sameCpf||sameName)matches.push({evoMemberId:String(row.evo_member_id),name:pn||"Aluno",cpf:pc||null,isCurrent:Number(row.is_current)===1,reasons:[sameCpf?"CPF":"",sameName?"nome":""].filter(Boolean)})}
        return json({ok:true,unit,idMember:evoId,memberId,name:[first,last].filter(Boolean).join(" "),cpf:cpf||null,hasCpf:/^\d{11}$/.test(cpf),createdInMaster:!master,before:{email:before?.email||null,birthDate:before?.birth_date||null},after:{email,birthDate:birth,cpfUpdated:/^\d{11}$/.test(cpf)},matches:matches.slice(0,10),updatedAt:now});
      }
      if(url.pathname==="/admin/evo-student-merge"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck},cache:"no-store"}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||""),principal=String(b.principalId||"").replace(/\D/g,""),legacy=String(b.legacyId||"").replace(/\D/g,"");
        if(!["bike","gym"].includes(unit)||!principal||!legacy||principal===legacy)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const rows=(await env.DB.prepare("SELECT evo_member_id,personal_json FROM evo_member_master WHERE unit=? AND CAST(evo_member_id AS TEXT) IN (?,?)").bind(unit,principal,legacy).all()).results||[];if(rows.length!==2)return json({ok:false,error:"PERFIL_D1_NAO_ENCONTRADO"},404);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_member_identity_aliases(unit TEXT NOT NULL,legacy_evo_member_id TEXT NOT NULL,principal_evo_member_id TEXT NOT NULL,merged_by TEXT,merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,legacy_evo_member_id))").run();
        const statements=[
          env.DB.prepare("INSERT INTO evo_member_identity_aliases(unit,legacy_evo_member_id,principal_evo_member_id,merged_by,merged_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,legacy_evo_member_id) DO UPDATE SET principal_evo_member_id=excluded.principal_evo_member_id,merged_by=excluded.merged_by,merged_at=CURRENT_TIMESTAMP").bind(unit,legacy,principal,String(vd.email||vd.name||"admin")),
          env.DB.prepare("UPDATE evo_member_master SET is_current=CASE WHEN CAST(evo_member_id AS TEXT)=? THEN 1 ELSE 0 END WHERE unit=? AND CAST(evo_member_id AS TEXT) IN (?,?)").bind(principal,unit,principal,legacy),
          env.DB.prepare("UPDATE aggregator_member_links SET evo_member_id=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND CAST(evo_member_id AS TEXT)=?").bind(principal,unit,legacy),
          env.DB.prepare("UPDATE club_tasks SET evo_member_id=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND CAST(evo_member_id AS TEXT)=?").bind(principal,unit,legacy)
        ];
        await env.DB.batch(statements);
        return json({ok:true,unit,principalId:principal,legacyId:legacy,evoRequests:0});
      }
      if(url.pathname==="/admin/teachers"){
        if(!["GET","POST"].includes(request.method))return json({ok:false,error:"METHOD"},405);
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"UNAUTHORIZED"},401);
        const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck},cache:"no-store"});
        const user=await auth.json().catch(()=>({}));
        if(!auth.ok||user.role!=="admin")return json({ok:false,error:"FORBIDDEN"},403);
        const p=url.searchParams,unit=p.get("unit")||"club",month=p.get("month")||"";
        if(!["bike","gym","club"].includes(unit)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return json({ok:false,error:"PARAMS"},400);
        const units=unit==="club"?["bike","gym"]:[unit],start=month+"-01",end=month+"-31";
        if(request.method==="POST"){
          const body=await request.json().catch(()=>({}));const u=String(body.unit||"");
          if(!units.includes(u))return json({ok:false,error:"UNIT"},400);
          if(body.action==="paid"){
            const weekStart=String(body.weekStart||""),weekEnd=String(body.weekEnd||""),name=String(body.teacher||"").trim();
            if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)||!/^\d{4}-\d{2}-\d{2}$/.test(weekEnd)||weekStart.slice(0,7)!==month||weekEnd.slice(0,7)!==month||!name||name.length>120)return json({ok:false,error:"PARAMS"},400);
            const key=name.toLocaleLowerCase("pt-BR"),paid=body.paid===true?1:0;
            await env.DB.prepare("INSERT INTO teacher_weekly_payments(unit,month,week_start,week_end,teacher_key,teacher_name,paid,paid_at,updated_at) VALUES(?,?,?,?,?,?,?,CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END,CURRENT_TIMESTAMP) ON CONFLICT(unit,month,week_start,teacher_key) DO UPDATE SET paid=excluded.paid,paid_at=excluded.paid_at,updated_at=CURRENT_TIMESTAMP").bind(u,month,weekStart,weekEnd,key,name,paid,paid).run();
            return json({ok:true});
          }
          if(body.action==="override"){
            const id=String(body.id||""),name=body.teacher===null?null:String(body.teacher||"").trim();
            if(!id||id.length>100||(name!==null&&name.length>120))return json({ok:false,error:"PARAMS"},400);
            const row=await env.DB.prepare("SELECT id_activity_session FROM evo_attendance_sessions WHERE unit=? AND id_activity_session=? AND substr(activity_date,1,7)=?").bind(u,id,month).first();
            if(!row)return json({ok:false,error:"CLASS_NOT_FOUND"},404);
            const attendance=body.attendance===null?null:Number(body.attendance),capacity=body.capacity===null?null:Number(body.capacity);
            if((attendance!==null&&(!Number.isInteger(attendance)||attendance<0||attendance>1000))||(capacity!==null&&(!Number.isInteger(capacity)||capacity<1||capacity>1000)))return json({ok:false,error:"NUMBERS"},400);
            await env.DB.prepare("INSERT INTO teacher_payment_overrides(unit,id_activity_session,teacher_name,attendance_count,capacity,teacher_absent,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET teacher_name=excluded.teacher_name,attendance_count=excluded.attendance_count,capacity=excluded.capacity,teacher_absent=excluded.teacher_absent,updated_at=CURRENT_TIMESTAMP").bind(u,id,name,attendance,capacity,body.absent===true?1:0).run();
            return json({ok:true});
          }
          if(body.action==="settings"){
            const category=String(body.category||'').trim(),capacity=Number(body.capacity),ticket=Number(body.ticketCents),bands=body.bands,margin=Number(body.margin);
            if(!category||category.length>100||!Number.isFinite(margin)||margin<0||margin>100||!Number.isInteger(capacity)||capacity<1||capacity>1000||!Number.isInteger(ticket)||ticket<0||ticket>100000||!Array.isArray(bands)||bands.length>12||bands.some(b=>!Number.isFinite(Number(b.pct))||Number(b.pct)<0||Number(b.pct)>999||!Number.isInteger(Number(b.cents))||Number(b.cents)<0))return json({ok:false,error:"SETTINGS"},400);
            await env.DB.prepare("INSERT INTO teacher_payment_settings(unit,category,capacity,ticket_cents,bands_json,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,category) DO UPDATE SET capacity=excluded.capacity,ticket_cents=excluded.ticket_cents,bands_json=excluded.bands_json,updated_at=CURRENT_TIMESTAMP").bind(u,category,capacity,ticket,JSON.stringify({bands,margin})).run();return json({ok:true});
          }
          return json({ok:false,error:"ACTION"},400);
        }
        const placeholders=units.map(()=>"?").join(",");
        const sessions=await env.DB.prepare("SELECT s.unit,s.id_activity_session AS id,s.activity_date AS date,s.start_time AS time,COALESCE(o.activity_name,s.activity_name) AS activity,s.status,COALESCE(o.attendance_count,s.attendance_count) AS attendance,COALESCE(o.teacher_name,s.instructor_name) AS teacher,o.capacity,o.teacher_absent AS absent FROM evo_attendance_sessions s LEFT JOIN teacher_payment_overrides o ON o.unit=s.unit AND o.id_activity_session=s.id_activity_session WHERE s.unit IN ("+placeholders+") AND s.activity_date>=? AND s.activity_date<=? ORDER BY s.activity_date,s.start_time").bind(...units,start,end).all();
        const settings=await env.DB.prepare("SELECT unit,category,capacity,ticket_cents,bands_json FROM teacher_payment_settings WHERE unit IN ("+placeholders+")").bind(...units).all();
        const payments=await env.DB.prepare("SELECT unit,month,week_start,week_end,teacher_name,paid,paid_at,paid_amount_cents FROM teacher_weekly_payments WHERE unit IN ("+placeholders+") AND month=?").bind(...units,month).all();
        const activities=await env.DB.prepare("SELECT DISTINCT unit,activity_name AS name FROM evo_attendance_sessions WHERE unit IN ("+placeholders+") AND activity_name IS NOT NULL AND trim(activity_name)<>'' ORDER BY unit,name").bind(...units).all();
        const names=await env.DB.prepare("SELECT unit,instructor_name AS name,COUNT(*) AS classes FROM evo_attendance_sessions WHERE unit IN ("+placeholders+") AND instructor_name IS NOT NULL AND trim(instructor_name)<>'' GROUP BY unit,instructor_name ORDER BY unit,name").bind(...units).all();
        return json({ok:true,source:"d1",evoRequestsMade:0,unit,month,sessions:sessions.results||[],settings:settings.results||[],payments:payments.results||[],teachers:names.results||[],activities:activities.results||[]});
      }
      if(url.pathname==="/admin/activity-center"){
        if(request.method!=="GET")return json({ok:false,error:"METODO_INVALIDO"},405);
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        let params;try{params=activityParams(url.searchParams)}catch{return json({ok:false,error:"PARAMETROS_INVALIDOS"},400)}
        return json(await readActivityCenter(env,params));
      }
      // Relatos beta: identidade do aluno deriva exclusivamente da sessão autenticada.
      if(url.pathname==="/student-issues"&&["GET","POST"].includes(request.method)){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT id,area,description,status,priority,created_at,updated_at,resolved_at FROM student_issue_reports WHERE member_id=? AND unit=? ORDER BY id DESC LIMIT 50").bind(String(member.id),unit).all();
          const items=rows.results||[];
          if(items.length){
            const ids=items.map(x=>x.id);
            const events=await env.DB.prepare("SELECT report_id,note,created_at FROM student_issue_report_events WHERE report_id IN ("+ids.map(()=>"?").join(",")+") AND visibility='public' AND actor_type='admin' AND note IS NOT NULL AND TRIM(note)<>'' ORDER BY id ASC").bind(...ids).all();
            for(const item of items)item.responses=(events.results||[]).filter(e=>e.report_id===item.id).map(e=>({message:e.note,created_at:e.created_at}));
          }
          return json({ok:true,items});
        }
        let body;try{body=await request.json()}catch{return json({ok:false,error:"JSON_INVALIDO"},400)}
        const area=String(body?.area||""),description=String(body?.description||"").trim();
        if(!["dashboard","missoes","presencas","brasoes","estrelas","vouchers","beneficios","loja","perfil","outros"].includes(area)||description.length<10||description.length>3000)return json({ok:false,error:"RELATO_INVALIDO"},400);
        const name=[member.first_name,member.last_name].filter(Boolean).join(" ").trim()||"Aluno";
        const evoId=unit==="gym"?(member.gym_client_id||null):(member.evo_member_id||null);
        const result=await env.DB.prepare("INSERT INTO student_issue_reports(member_id,evo_member_id,member_name,unit,area,description) VALUES(?,?,?,?,?,?)").bind(String(member.id),evoId==null?null:String(evoId),name,unit,area,description).run();
        const id=result.meta?.last_row_id;
        await env.DB.prepare("INSERT INTO student_issue_report_events(report_id,actor_type,actor_id,event_type,note) VALUES(?,'student',?,'created',NULL)").bind(id,String(member.id)).run();
        return json({ok:true,id},201);
      }
      if(url.pathname==="/admin/student-issues"&&["GET","POST"].includes(request.method)){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const admin=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(admin.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        if(admin.role!=="admin"&&!((admin.permissions||[]).includes("*")||(admin.permissions||[]).includes("/admin-relatos-alunos.html")))return json({ok:false,error:"SEM_PERMISSAO"},403);
        const unit=String(url.searchParams.get("unit")||"club");
        if(!["bike","gym","club"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(unit!=="club"&&admin.units?.length&&!admin.units.includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        if(request.method==="GET"){
          const status=String(url.searchParams.get("status")||"");
          if(status&&!["aberto","em_analise","aguardando_aluno","resolvido","encerrado"].includes(status))return json({ok:false,error:"STATUS_INVALIDO"},400);
          const clauses=[],bind=[];
          if(unit!=="club"){clauses.push("unit=?");bind.push(unit)}
          else if(admin.role!=="admin"&&admin.units?.length){clauses.push("unit IN ("+admin.units.map(()=>"?").join(",")+")");bind.push(...admin.units)}
          if(status){clauses.push("status=?");bind.push(status)}
          const q="SELECT * FROM student_issue_reports"+(clauses.length?" WHERE "+clauses.join(" AND "):"")+" ORDER BY id DESC LIMIT 200";
          const rows=await env.DB.prepare(q).bind(...bind).all();
          return json({ok:true,items:rows.results||[]});
        }
        let body;try{body=await request.json()}catch{return json({ok:false,error:"JSON_INVALIDO"},400)}
        const id=Number(body?.id),status=String(body?.status||""),priority=String(body?.priority||""),note=String(body?.note||"").trim(),visibility=body?.visibility==="internal"?"internal":"public";
        if(!Number.isSafeInteger(id)||id<1||!["aberto","em_analise","aguardando_aluno","resolvido","encerrado"].includes(status)||!["baixa","media","alta","critica"].includes(priority)||note.length>3000)return json({ok:false,error:"DADOS_INVALIDOS"},400);
        const current=await env.DB.prepare("SELECT id,unit,status,priority FROM student_issue_reports WHERE id=?").bind(id).first();
        if(!current)return json({ok:false,error:"NAO_ENCONTRADO"},404);
        if((unit!=="club"&&current.unit!==unit)||(admin.role!=="admin"&&admin.units?.length&&!admin.units.includes(current.unit)))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        await env.DB.prepare("UPDATE student_issue_reports SET status=?,priority=?,updated_at=CURRENT_TIMESTAMP,resolved_at=CASE WHEN ?='resolvido' THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=?").bind(status,priority,status,id).run();
        await env.DB.prepare("INSERT INTO student_issue_report_events(report_id,actor_type,actor_id,event_type,note,visibility) VALUES(?,'admin',?,'updated',?,?)").bind(id,String(admin.name||admin.role),note||("Situação: "+status+"; prioridade: "+priority),note?visibility:"internal").run();
        return json({ok:true,id});
      }

      // Central de tutoriais: conteúdo publicado acessível somente a alunos autenticados.
      if(url.pathname==="/student/tutorials"&&request.method==="GET"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const rows=await env.DB.prepare("SELECT id,title,description,category,unit,drive_file_id,sort_order FROM student_tutorial_videos WHERE published=1 AND (unit='all' OR unit=?) ORDER BY sort_order ASC,id DESC").bind(unit).all();
        return json({ok:true,items:rows.results||[]});
      }
      if(url.pathname==="/admin/tutorials"&&["GET","POST","DELETE"].includes(request.method)){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const admin=await vr.json().catch(()=>({}));
        if(!vr.ok||admin.role!=="admin")return json({ok:false,error:"SEM_PERMISSAO"},403);
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT * FROM student_tutorial_videos ORDER BY sort_order ASC,id DESC").all();
          return json({ok:true,items:rows.results||[]});
        }
        let body;try{body=await request.json()}catch{return json({ok:false,error:"JSON_INVALIDO"},400)}
        const id=Number(body?.id||0);
        if(request.method==="DELETE"){
          if(!Number.isSafeInteger(id)||id<1)return json({ok:false,error:"ID_INVALIDO"},400);
          const deleted=await env.DB.prepare("DELETE FROM student_tutorial_videos WHERE id=?").bind(id).run();
          return json({ok:true,deleted:deleted.meta?.changes||0});
        }
        const title=String(body?.title||"").trim(),description=String(body?.description||"").trim(),category=String(body?.category||"").trim(),unit=String(body?.unit||"all");
        const published=body?.published===false||body?.published===0?0:1,sortOrder=Number(body?.sort_order||0);
        const link=String(body?.drive_url||"").trim();
        let driveId="";
        try{
          const u=new URL(link);
          if(!["drive.google.com","docs.google.com"].includes(u.hostname)||u.protocol!=="https:")throw Error("link");
          const m=u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/)||u.pathname.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
          driveId=m?.[1]||((u.pathname==="/open"||u.pathname==="/uc")?u.searchParams.get("id"):"")||"";
        }catch{}
        if(!title||title.length>120||description.length>700||!category||category.length>60||!["all","bike","gym"].includes(unit)||!Number.isSafeInteger(sortOrder)||sortOrder<0||sortOrder>9999||!/^[a-zA-Z0-9_-]{10,}$/.test(driveId))return json({ok:false,error:"DADOS_INVALIDOS_OU_LINK_DRIVE_INVALIDO"},400);
        if(id){
          const updated=await env.DB.prepare("UPDATE student_tutorial_videos SET title=?,description=?,category=?,unit=?,drive_file_id=?,sort_order=?,published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(title,description,category,unit,driveId,sortOrder,published,id).run();
          if(!updated.meta?.changes)return json({ok:false,error:"NAO_ENCONTRADO"},404);
          return json({ok:true,id});
        }
        const inserted=await env.DB.prepare("INSERT INTO student_tutorial_videos(title,description,category,unit,drive_file_id,sort_order,published) VALUES(?,?,?,?,?,?,?)").bind(title,description,category,unit,driveId,sortOrder,published).run();
        return json({ok:true,id:inserted.meta?.last_row_id},201);
      }
      // Desempenho semanal: leitura de aulas confirmadas no D1, sem EVO.
      if(url.pathname==="/admin/class-performance"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=url.searchParams.get("unit"),start=url.searchParams.get("start"),end=url.searchParams.get("end");
        if(!["bike","gym"].includes(unit)||!/^\d{4}-\d{2}-\d{2}$/.test(start||"")||!/^\d{4}-\d{2}-\d{2}$/.test(end||"")||start>end||Date.parse(end)-Date.parse(start)>366*86400000)return json({ok:false,error:"FILTROS_INVALIDOS"},400);
        const q=await env.DB.prepare("SELECT activity_date date,start_time time,COALESCE(attendance_count,0) count,id_activity_session sessionId,activity_name name FROM evo_attendance_sessions WHERE unit=? AND status='done' AND activity_date>=? AND activity_date<=? ORDER BY activity_date,start_time LIMIT 10000").bind(unit,start,end).all();
        return json({ok:true,unit,start,end,source:"D1",classes:q.results||[],truncated:(q.results||[]).length===10000});
      }
      if(url.pathname==="/admin/weekly-attendance"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||""),start=String(url.searchParams.get("start")||"");
        if(!["bike","gym","club"].includes(unit)||!/^\d{4}-\d{2}-\d{2}$/.test(start))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const end=new Date(start+"T12:00:00Z");if(Number.isNaN(end.getTime()))return json({ok:false,error:"DATA_INVALIDA"},400);end.setUTCDate(end.getUTCDate()+6);
        const endDate=end.toISOString().slice(0,10);
        const sql="SELECT unit,activity_date AS date,start_time AS time,COALESCE(attendance_count,0) AS count FROM evo_attendance_sessions WHERE status='done' AND activity_date>=? AND activity_date<=?"+(unit==="club"?"":" AND unit=?")+" ORDER BY activity_date,start_time";
        const q=await env.DB.prepare(sql).bind(...(unit==="club"?[start,endDate]:[start,endDate,unit])).all();
        return json({ok:true,unit,start,end:endDate,source:"d1",evoRequestsMade:0,classes:(q.results||[]).map(x=>({unit:x.unit,date:x.date,time:x.time,count:Number(x.count||0)}))});
      }
      // Diagnóstico econômico do Dashboard: lê somente o D1 e calcula quantas chamadas de sessões ainda faltariam.
      if (url.pathname === "/admin/evo-dashboard-diagnostic" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(vd.role)||vd.role==="reception"&&!(vd.permissions||[]).includes("/admin-alunos-evo.html"))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        if(unit!=="bike")return json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"},423);
        const now=new Date(),month=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(now).slice(0,7),start=month+"-01",today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(now);
        const current=await env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit=? AND is_current=1").bind(unit).first();
        const linked=await env.DB.prepare("SELECT COUNT(DISTINCT es.evo_member_id) n FROM evo_students es JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id WHERE es.unit=? AND es.is_current=1").bind(unit).first();
        const covered=await env.DB.prepare("SELECT COUNT(DISTINCT es.evo_member_id) n FROM evo_students es JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id JOIN attendance_sync_ranges r ON r.member_id=m.id AND r.unit=? WHERE es.unit=? AND es.is_current=1 AND r.start_date<=? AND r.end_date>=?").bind(unit,unit,start,today).first();
        const attendanceRows=await env.DB.prepare("SELECT COUNT(*) n FROM attendance_history WHERE unit=? AND attendance_date BETWEEN ? AND ?").bind(unit,start,today).first();
        const total=Number(current?.n||0),linkedMembers=Number(linked?.n||0),coveredMembers=Number(covered?.n||0),missing=Math.max(0,linkedMembers-coveredMembers);
        return json({ok:true,unit,period:{start,end:today},population:{current:total,linked:linkedMembers},attendance:{coveredMembers,missingMembers:missing,rows:Number(attendanceRows?.n||0),estimatedRequests:missing,endpoint:"/api/v2/activities/member/sessions"},alreadyAvailable:{profile:true,contracts:true,contractDates:true,categories:true,fitcoins:true,lastAccess:true,aggregators:true},calculatedLocally:{attendanceCount:true,distinctDays:true,favoriteTime:true,favoriteActivity:true},evoRequestsMade:0,note:"Diagnóstico somente D1. Nenhuma requisição EVO foi executada."});
      }

      if(url.pathname==="/admin/evo-attendance-reconcile-member"&&request.method==="POST"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);const b=await request.json().catch(()=>({})),unit=b.unit==="gym"?"gym":"bike",id=String(b.idMember||""),start=String(b.start||""),end=String(b.end||""),rows=b.rows;if(!/^\d+$/.test(id)||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end||!Array.isArray(rows)||rows.length>200)return json({ok:false,error:"DADOS_INVALIDOS"},400);const existing=await env.DB.prepare("SELECT id_activity_session,attendance_date,start_time FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ?").bind(unit,id,start,end).all();const keys=new Set((existing.results||[]).map(x=>String(x.id_activity_session||"")));let saved=0,skipped=0;for(const x of rows){const sid=String(x.idActivitySession||""),date=String(x.date||""),time=String(x.startTime||"");if(!/^\d+$/.test(sid)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>end||keys.has(sid)){skipped++;continue}const payload={id,date,startTime:time,activity:String(x.activity||"").slice(0,200),idActivitySession:sid,presenca:true,isFinalized:true};await env.DB.prepare("INSERT OR IGNORE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,sid,date,time,payload.activity,sid,JSON.stringify(payload)).run();keys.add(sid);saved++}return json({ok:true,saved,skipped,total:rows.length,unit,idMember:id})}
      if(url.pathname==="/admin/evo-attendance-state-reconcile"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=b.unit,id=String(b.idMember||""),start=String(b.start||""),end=String(b.end||""),skip=Number(b.skip||0),take=50;
        const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
        if(!["bike","gym"].includes(unit)||!/^\d+$/.test(id)||!validDate(start)||!validDate(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>31||!Number.isInteger(skip)||skip<0||skip>1000)return json({ok:false,error:"Informe aluno, unidade e período de até 31 dias"},400);
        const known=await env.DB.prepare("SELECT evo_member_id FROM evo_member_master WHERE unit=? AND evo_member_id=?").bind(unit,id).first();
        if(!known)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO_NA_UNIDADE"},404);
        const cfg=await getEvoConfig(env,unit),qs=new URLSearchParams({idMember:id,dateStart:start,dateEnd:end,take:String(take),skip:String(skip)});
        const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?"+qs,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"}});
        await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,'attendance_state_reconcile','GET','/api/v2/activities/member/sessions',?,?)").bind(unit,r.status,r.ok?1:0).run();
        if(!r.ok)return json({ok:false,error:"EVO_HTTP_"+r.status,requests:1},502);
        const data=await r.json(),rows=Array.isArray(data)?data:data.items??data.data;
        if(!Array.isArray(rows)||rows.length>take)return json({ok:false,error:"RETORNO_EVO_INVALIDO",requests:1},502);
        const statements=[],found=[];
        for(const x of rows){
          const sid=String(x.idActivitieSession??x.idActivitySession??""),date=String(x.date||"").slice(0,10);
          if(!/^\d+$/.test(sid)||!validDate(date)||date<start||date>end)return json({ok:false,error:"SESSAO_EVO_INVALIDA",requests:1},502);
          const finalized=x.isFinalized===true,status=finalized?(x.faltaJustificada===true?2:x.falta===true?1:x.presenca===true?0:-1):-1;
          const label=status===2?"Falta justificada":status===1?"Falta":status===0?"Presença":finalized?"Não informado":"Sessão não finalizada";
          statements.push(env.DB.prepare("INSERT INTO evo_member_attendance_states(unit,evo_member_id,id_activity_session,attendance_date,start_time,activity_name,evo_status,justified_absence,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,id_activity_session) DO UPDATE SET attendance_date=excluded.attendance_date,start_time=excluded.start_time,activity_name=excluded.activity_name,evo_status=excluded.evo_status,justified_absence=excluded.justified_absence,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP").bind(unit,id,sid,date,String(x.startTime||""),String(x.activitieName||x.activityName||""),status,x.faltaJustificada===true?1:x.faltaJustificada===false?0:null,JSON.stringify(x)));
          found.push({sessionId:sid,date,time:x.startTime,activity:x.activitieName,status:label,replacement:x.isReplacement??null,finalized});
        }
        for(let i=0;i<statements.length;i+=40)await env.DB.batch(statements.slice(i,i+40));
        return json({ok:true,requests:1,saved:found.length,found,nextSkip:rows.length===take?skip+rows.length:null,hasMore:rows.length===take,note:"Histórico por aluno e período; não altera presenças nem estrelas. Página completa requer continuar."});
      }
      if (url.pathname === "/admin/evo-attendance-member" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        const idMember=String(url.searchParams.get("idMember")||"").replace(/\D/g,"");
        const start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
        if(unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);
        if(!idMember||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const q=await env.DB.prepare("SELECT id_activity_session AS idActivitySession, attendance_date AS date, start_time AS startTime, activity_name AS activity FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,idMember,start,end).all();
        return json({ok:true,unit,idMember,start,end,total:(q.results||[]).length,rows:q.results||[]});
      }

      if(url.pathname==="/admin/evo-attendance-import-queue" && request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
        if(!Array.isArray(b.sessions)||b.sessions.length>100||b.sessions.some(s=>!s||!/^\d+$/.test(String(s.id))||!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))))return json({ok:false,error:"SESSOES_INVALIDAS"},400);
        const stm=b.sessions.map(s=>env.DB.prepare("INSERT INTO evo_attendance_import_queue(unit,id_activity_session,activity_date,status) VALUES(?,?,?,'pending') ON CONFLICT(unit,id_activity_session) DO NOTHING").bind(unit,String(s.id),s.date));
        if(stm.length)await env.DB.batch(stm);return json({ok:true,received:b.sessions.length});
      }

      // Incremental Bike attendance: D1 session ledger + idempotent class attendance ingest.
      if (url.pathname === "/admin/evo-attendance-import-queue" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
if(!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return json({ok:false,error:"PERIODO_INVALIDO"},400);
        const from=start+"-01",[y,m]=end.split("-").map(Number),to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
        const q=await env.DB.prepare("SELECT id_activity_session id,activity_date date,status FROM evo_attendance_import_queue WHERE unit=? AND activity_date BETWEEN ? AND ? ORDER BY activity_date,id_activity_session").bind(unit,from,to).all();
        return json({ok:true,sessions:(q.results||[]).map(x=>({id:String(x.id),date:x.date,status:x.status}))});
      }
      if (url.pathname === "/admin/evo-attendance-sessions" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
        const ids=Array.isArray(b.sessionIds)?b.sessionIds.map(String).filter(x=>/^\d+$/.test(x)).slice(0,100):[];
        if(!ids.length)return json({ok:true,processed:[]});
        const q=await env.DB.prepare("SELECT id_activity_session FROM evo_attendance_sessions WHERE unit=? AND status='done' AND id_activity_session IN ("+ids.map(()=>"?").join(",")+")").bind(unit,...ids).all();
        return json({ok:true,processed:(q.results||[]).map(x=>String(x.id_activity_session))});
      }
      if(url.pathname==="/admin/evo-attendance-states-summary"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||""),start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
        if(unit!=="bike"||!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const from=start+"-01",to=end+"-31";
        const q=await env.DB.prepare("SELECT evo_status,justified_absence,COUNT(*) total FROM evo_member_attendance_states WHERE unit=? AND attendance_date BETWEEN ? AND ? GROUP BY evo_status,justified_absence").bind(unit,from,to).all();
        const ad=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,evo_status,justified_absence,id_activity_session,CASE WHEN LOWER(activity_name) LIKE '%bike pop%' THEN 'bike_class' WHEN LOWER(activity_name) LIKE '%massagem%' THEN 'other_service' ELSE 'unclassified' END activity_group FROM evo_member_attendance_states WHERE unit=? AND evo_member_id='1800958' AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time").bind(unit,from,to).all();
        const total=await env.DB.prepare("SELECT COUNT(DISTINCT id_activity_session) aulas,COUNT(*) registros FROM evo_member_attendance_states WHERE unit=? AND attendance_date BETWEEN ? AND ?").bind(unit,from,to).first();
        const grouped=await env.DB.prepare("SELECT CASE WHEN LOWER(activity_name) LIKE '%bike pop%' THEN 'bike_class' WHEN LOWER(activity_name) LIKE '%massagem%' THEN 'other_service' ELSE 'unclassified' END activity_group,evo_status,justified_absence,COUNT(*) total FROM evo_member_attendance_states WHERE unit=? AND attendance_date BETWEEN ? AND ? GROUP BY activity_group,evo_status,justified_absence").bind(unit,from,to).all();
        return json({ok:true,unit,start,end,totals:total||{},byStatus:q.results||[],byActivity:grouped.results||[],adriana:{idMember:"1800958",rows:ad.results||[]}});
      }
      if (url.pathname === "/admin/evo-attendance-ingest-class" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
        const sid=String(b.sessionId||""),date=String(b.date||"").slice(0,10),rows=Array.isArray(b.rows)?b.rows:[];if(!/^\d+$/.test(sid)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||rows.length>100)return json({ok:false,error:"LOTE_PRESENCAS_INVALIDO"},400);
        if(!attendanceClassFinished(date,b.startTime))return json({ok:false,error:"AULA_AINDA_NAO_FINALIZADA"},409);
        const prior=await env.DB.prepare("SELECT status FROM evo_attendance_sessions WHERE unit=? AND id_activity_session=?").bind(unit,sid).first();if(prior?.status==="done"&&!Array.isArray(b.enrollmentStates)){await env.DB.prepare("UPDATE evo_attendance_import_queue SET status='done',last_error=NULL WHERE unit=? AND id_activity_session=?").bind(unit,sid).run();return json({ok:true,alreadyProcessed:true,saved:0});}
        const stateRows=Array.isArray(b.enrollmentStates)?b.enrollmentStates:[];if(stateRows.length>100)return json({ok:false,error:"ESTADOS_INVALIDOS"},400);
        const stateStatements=[];for(const e of stateRows){const memberId=String(e.idMember??e.id??"");const status=Number(e.status);if(!/^[0-9]+$/.test(memberId)||!Number.isInteger(status)||e.removed===true)continue;stateStatements.push(env.DB.prepare("INSERT INTO evo_member_attendance_states(unit,evo_member_id,id_activity_session,attendance_date,start_time,activity_name,evo_status,justified_absence,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,id_activity_session) DO UPDATE SET evo_status=excluded.evo_status,justified_absence=excluded.justified_absence,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP").bind(unit,memberId,sid,date,b.startTime||null,b.activity||null,status,e.justifiedAbsence===true?1:e.justifiedAbsence===false?0:null,JSON.stringify(e)))}
        if(stateStatements.length)for(let i=0;i<stateStatements.length;i+=40)await env.DB.batch(stateStatements.slice(i,i+40));
        if(prior?.status==="done")return json({ok:true,alreadyProcessed:true,saved:0,statesSaved:stateStatements.length});
        const stm=[];for(const x of rows){const id=String(x.id||"");if(!/^\d+$/.test(id)||String(x.idActivitySession)!==sid||String(x.date).slice(0,10)!==date)continue;stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,sid,date,x.startTime||null,x.activity||null,sid,JSON.stringify(x)))}
        if(stm.length)for(let i=0;i<stm.length;i+=40)await env.DB.batch(stm.slice(i,i+40));
        await env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,instructor_name,synced_at) VALUES(?,?,?,?,?, 'done',?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,status='done',attendance_count=excluded.attendance_count,instructor_name=COALESCE(NULLIF(trim(evo_attendance_sessions.instructor_name),''),excluded.instructor_name),synced_at=CURRENT_TIMESTAMP").bind(unit,sid,date,b.startTime||null,b.activity||null,stm.length,attendanceInstructorName({instructorName:b.instructorName})).run();
        await env.DB.prepare("UPDATE evo_attendance_import_queue SET status='done',attempts=attempts+1,last_error=NULL WHERE unit=? AND id_activity_session=?").bind(unit,sid).run();
        return json({ok:true,alreadyProcessed:false,saved:stm.length});
      }

      if (url.pathname === "/admin/evo-test-presence" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase(),id=String(b.id||"").trim(),rows=Array.isArray(b.rows)?b.rows:[];if(unit!=="bike")return json({ok:false,error:"TESTE_GYM_BLOQUEADO"},423);if(!/^[0-9]+$/.test(id))return json({ok:false,error:"ID_CLIENTE_INVALIDO"},400);
        const start=String(b.period?.dateStart||"").slice(0,10),end=String(b.period?.dateEnd||"").slice(0,10);await env.DB.prepare("DELETE FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ?").bind(unit,id,start,end).run();
        const stm=[];for(const [i,x] of rows.entries()){const date=String(x.date||"").slice(0,10);if(!date)continue;const sid=x.idActivitySession??null,key=sid!=null?String(sid):date+"|"+String(x.startTime||"")+"|"+String(x.activity||"")+"|"+i;stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,key,date,x.startTime||null,x.activity||null,sid==null?null:String(sid),JSON.stringify(x)))}if(stm.length)await env.DB.batch(stm);
        const q=await env.DB.prepare("SELECT attendance_date,start_time,activity_name FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time").bind(unit,id,start,end).all(),saved=q.results||[],times={},acts={},days=new Set();for(const x of saved){days.add(x.attendance_date);if(x.start_time)times[x.start_time]=(times[x.start_time]||0)+1;if(x.activity_name)acts[x.activity_name]=(acts[x.activity_name]||0)+1}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
        return json({ok:true,saved:saved.length,summary:{attendanceCount:saved.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),consistency:days.size+" dia(s) com presença"}});
      }

      // Visualização administrativa de um cliente já salvo no D1. Zero chamadas EVO.
      if (url.pathname === "/admin/evo-test-client" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",id=String(url.searchParams.get("id")||"").trim();
        if(unit!=="bike")return json({ok:false,error:"TESTE_GYM_BLOQUEADO"},423);
        if(!/^[0-9]+$/.test(id))return json({ok:false,error:"ID_CLIENTE_INVALIDO"},400);
        const m=await env.DB.prepare("SELECT evo_member_id,is_current,personal_json,contacts_json,address_json,access_json,financial_json,integrations_json,memberships_json,metadata_json,raw_json,source_run_id,evo_updated_at,synced_at FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,id).first();
        if(!m)return json({ok:false,error:"CLIENTE_AINDA_NAO_SALVO_NA_NOVA_BASE",hint:"Execute SINCRONIZAR DADOS EVO uma vez para preencher a tabela completa."},404);
        const contracts=await env.DB.prepare("SELECT contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,synced_at FROM evo_member_contracts WHERE unit=? AND evo_member_id=? ORDER BY COALESCE(start_date,'') DESC,contract_key DESC").bind(unit,id).all();
        const requestedMonth=String(url.searchParams.get("month")||""),month=/^[0-9]{4}-[0-9]{2}$/.test(requestedMonth)?requestedMonth:new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7),att=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session AS idActivitySession FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,id,month).all(),ar=att.results||[],times={},acts={},days=new Set();for(const x of ar){days.add(x.attendance_date);if(x.start_time)times[x.start_time]=(times[x.start_time]||0)+1;if(x.activity_name)acts[x.activity_name]=(acts[x.activity_name]||0)+1}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null,attendanceSummary={attendanceCount:ar.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),consistency:ar.length?days.size+" dia(s) com presença":null};
        const parse=v=>{try{return JSON.parse(v)}catch{return v}};
        return json({ok:true,unit,evoRequestsMade:0,memberId:id,isCurrent:Boolean(m.is_current),syncedAt:m.synced_at,evoUpdatedAt:m.evo_updated_at,sourceRunId:m.source_run_id,attendanceMonth:month,attendanceRows:ar,categories:{personal:parse(m.personal_json),contacts:parse(m.contacts_json),address:parse(m.address_json),access:parse(m.access_json),financial:parse(m.financial_json),integrations:parse(m.integrations_json),memberships:parse(m.memberships_json),metadata:parse(m.metadata_json)},contracts:(contracts.results||[]).map(x=>({...x,raw:parse(x.raw_json),raw_json:undefined})),attendanceSummary,raw:parse(m.raw_json)});
      }

      // Usuários internos do Club Pop: e-mail + PIN + permissões. D1 é a fonte persistente.
      if(url.pathname==="/staff/legacy-access"&&request.method==="GET"){
        const settings=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='club_reception_access'").first();
        const row=settings?await env.DB.prepare("SELECT units_json,permissions_json FROM club_reception_access WHERE id=1").first():null;
        return json({ok:true,units:row?JSON.parse(row.units_json):["bike"],permissions:row?JSON.parse(row.permissions_json):["/tela-checkin.html","/admin-resgates.html","/admin-transacoes.html","/admin-numeros-sorte.html","/admin-alunos-evo.html"]});
      }
      if(url.pathname==="/staff/teacher-view"){
        const unit=String(url.searchParams.get("unit")||"bike");let vd=await verifyProxyAuth(request,env,unit,"teacher-view");if(!vd){if(request.headers.get("x-clubpop-proxy-auth"))return json({ok:false,error:"NAO_AUTORIZADO"},403);const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);let vr;try{vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me&includeTeacher=1",{headers:{Cookie:ck},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}vd=await vr.json().catch(()=>({}));if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401)}
        return teacherView(request,env,vd);
      }
      if (url.pathname === "/staff/login" && request.method === "POST") {
        const b=await request.json().catch(()=>({})),email=String(b.email||"").trim().toLowerCase(),pin=String(b.pin||"").trim();
        if(!email||!/^\d{4,8}$/.test(pin))return json({ok:false,error:"CREDENCIAIS_INVALIDAS"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS staff_users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,pin_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'reception',units_json TEXT NOT NULL DEFAULT '[\"bike\"]',permissions_json TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const u=await env.DB.prepare("SELECT id,name,email,pin_hash,role,units_json,permissions_json,enabled FROM staff_users WHERE lower(email)=? LIMIT 1").bind(email).first();
        if(!u||!u.enabled)return json({ok:false,error:"ACESSO_NEGADO"},401);
        const enc=new TextEncoder(),hex=a=>Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join(""),pb=async(p,s,it=100000)=>hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(s),iterations:it},await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]),256));
        let valid=false;if(String(u.pin_hash).startsWith("pbkdf2$")){const [,it,salt,hash]=String(u.pin_hash).split("$");valid=await pb(pin,salt,Number(it))===hash}else{const legacy=hex(await crypto.subtle.digest("SHA-256",enc.encode(pin)));valid=legacy===u.pin_hash;if(valid){const salt=crypto.randomUUID().replaceAll("-",""),hash=await pb(pin,salt);await env.DB.prepare("UPDATE staff_users SET pin_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind("pbkdf2$100000$"+salt+"$"+hash,u.id).run()}}
        if(!valid)return json({ok:false,error:"PIN_INVALIDO"},401);
        const parse=v=>{try{return JSON.parse(v||"[]")}catch{return []}};
        return json({ok:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,units:parse(u.units_json),permissions:parse(u.permissions_json)}});
      }
      if (url.pathname === "/admin/staff-users" && ["GET","POST","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"",trustedRole=request.headers.get("x-clubpop-admin-role")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        {const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS staff_users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,pin_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'reception',units_json TEXT NOT NULL DEFAULT '[\"bike\"]',permissions_json TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        await ensureTeacherLinks(env.DB);
        const parse=v=>{try{return JSON.parse(v||"[]")}catch{return []}},safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,teacherLinks:JSON.parse(u.teacher_links_json||"{}"),units:parse(u.units_json),permissions:parse(u.permissions_json),enabled:Boolean(u.enabled),createdAt:u.created_at,updatedAt:u.updated_at});
        if(request.method==="GET"){const q=await env.DB.prepare("SELECT id,name,email,role,teacher_links_json,units_json,permissions_json,enabled,created_at,updated_at FROM staff_users ORDER BY enabled DESC,name").all();const settings=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='club_reception_access'").first();const legacy=settings?await env.DB.prepare("SELECT units_json,permissions_json FROM club_reception_access WHERE id=1").first():null;return json({ok:true,users:(q.results||[]).map(safe),legacyAccess:legacy?{units:parse(legacy.units_json),permissions:parse(legacy.permissions_json)}:null});}
        if(request.method==="PUT"){
          const preview=await request.clone().json().catch(()=>({}));
          if(preview.id==="legacy-reception"){
            const name=String(preview.name||"").trim(),email=String(preview.email||"").trim().toLowerCase(),pin=String(preview.pin||"").trim();
            const units=Array.isArray(preview.units)?[...new Set(preview.units.filter(x=>["bike","gym","club"].includes(x)))]:[];
            const permissions=Array.isArray(preview.permissions)?[...new Set(preview.permissions.map(String).filter(Boolean))]:[];
            if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!units.length||!permissions.length)return json({ok:false,error:"DADOS_INVALIDOS"},400);
            if(!/^\d{4,8}$/.test(pin))return json({ok:false,error:"PIN_OBRIGATORIO_4_A_8_DIGITOS"},400);
            const enc=new TextEncoder(),salt=crypto.randomUUID().replaceAll("-",""),key=await crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},key,256),hx=Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,"0")).join(""),hash="pbkdf2$100000$"+salt+"$"+hx;
            let created;
            try{created=await env.DB.prepare("INSERT INTO staff_users(name,email,pin_hash,role,units_json,permissions_json,enabled) VALUES(?,?,?,'reception',?,?,1) RETURNING id").bind(name,email,hash,JSON.stringify(units),JSON.stringify(permissions)).first();}
            catch(e){const msg=String(e?.message||e);return json({ok:false,error:/unique/i.test(msg)?"EMAIL_JA_CADASTRADO":"FALHA_AO_MIGRAR_RECEPCAO",detail:msg.slice(0,160)},/unique/i.test(msg)?409:500)}
            await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_reception_access(id INTEGER PRIMARY KEY CHECK(id=1),units_json TEXT NOT NULL,permissions_json TEXT NOT NULL,updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
            await env.DB.prepare("INSERT INTO club_reception_access(id,units_json,permissions_json) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET units_json=excluded.units_json,permissions_json=excluded.permissions_json,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(units),JSON.stringify(permissions)).run();
            return json({ok:true,id:created?.id,migrated:true});
          }
        }
        const b=await request.json().catch(()=>({})),name=String(b.name||"").trim(),email=String(b.email||"").trim().toLowerCase(),pin=String(b.pin||"").trim(),role=b.role==="admin"?"admin":b.role==="teacher"?"teacher":"reception",units=Array.isArray(b.units)?[...new Set(b.units.filter(x=>["bike","gym","club"].includes(x)))]:["bike"],permissions=role==="teacher"?["/visao-professores.html"]:Array.isArray(b.permissions)?[...new Set(b.permissions.map(String).filter(Boolean))]:[];
        if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!units.length||!permissions.length)return json({ok:false,error:"DADOS_INVALIDOS"},400);
        const teacherLinks=role==="teacher"?await validateTeacherLinks(env.DB,units,b.teacherLinks):{};
        if(!teacherLinks)return json({ok:false,error:"VINCULE_UM_PROFESSOR_VALIDO_EM_CADA_UNIDADE"},400);
        const makeHash=async value=>{const enc=new TextEncoder(),salt=crypto.randomUUID().replaceAll("-",""),key=await crypto.subtle.importKey("raw",enc.encode(value),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:100000},key,256),hx=Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,"0")).join("");return "pbkdf2$100000$"+salt+"$"+hx};
        let hash=null;if(pin){if(!/^\d{4,8}$/.test(pin))return json({ok:false,error:"PIN_DEVE_TER_4_A_8_DIGITOS"},400);hash=await makeHash(pin);}
        if(request.method==="POST"){
          if(!hash)return json({ok:false,error:"PIN_OBRIGATORIO"},400);
          try{const q=await env.DB.prepare("INSERT INTO staff_users(name,email,pin_hash,role,units_json,permissions_json,teacher_links_json,enabled) VALUES(?,?,?,?,?,?,?,1) RETURNING id").bind(name,email,hash,role,JSON.stringify(units),JSON.stringify(permissions),JSON.stringify(teacherLinks)).first();return json({ok:true,id:q?.id});}
          catch(e){const msg=String(e?.message||e);return json({ok:false,error:/unique/i.test(msg)?"EMAIL_JA_CADASTRADO":"FALHA_AO_SALVAR",detail:msg.slice(0,160)},/unique/i.test(msg)?409:500)}
        }
        const id=Number(b.id);if(!Number.isInteger(id)||id<1)return json({ok:false,error:"USUARIO_INVALIDO"},400);const enabled=b.enabled===false?0:1;
        const exists=await env.DB.prepare("SELECT id FROM staff_users WHERE id=?").bind(id).first();if(!exists)return json({ok:false,error:"USUARIO_NAO_ENCONTRADO"},404);
        try{
          if(hash)await env.DB.prepare("UPDATE staff_users SET name=?,email=?,pin_hash=?,role=?,units_json=?,permissions_json=?,teacher_links_json=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,email,hash,role,JSON.stringify(units),JSON.stringify(permissions),JSON.stringify(teacherLinks),enabled,id).run();
          else await env.DB.prepare("UPDATE staff_users SET name=?,email=?,role=?,units_json=?,permissions_json=?,teacher_links_json=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,email,role,JSON.stringify(units),JSON.stringify(permissions),JSON.stringify(teacherLinks),enabled,id).run();
          return json({ok:true,id});
        }catch(e){const msg=String(e?.message||e);return json({ok:false,error:/unique/i.test(msg)?"EMAIL_JA_CADASTRADO":"FALHA_AO_SALVAR",detail:msg.slice(0,160)},/unique/i.test(msg)?409:500)}
      }

      // Registra disparos manuais no mesmo histórico operacional; não chama a EVO.
      if (url.pathname === "/admin/evo-automation-run-log" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike",kind=["student","attendance","opportunity","client"].includes(String(b.kind))?String(b.kind):"";if(!kind)return json({ok:false,error:"TIPO_INVALIDO"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
        const now=new Date(),p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(now),g=t=>p.find(x=>x.type===t)?.value||"",key=g("year")+"-"+g("month")+"-"+g("day")+"T"+g("hour")+":"+g("minute")+":"+g("second")+"-manual-"+crypto.randomUUID().slice(0,6),status=["done","failed","pending"].includes(String(b.status))?String(b.status):"done";
        await env.DB.prepare("INSERT INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status,detail,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,kind,key,status,JSON.stringify(b.detail||{}).slice(0,1000)).run();return json({ok:true});
      }

      // Execução manual isolada da vinculação de professores; exige administrador autenticado.
      if(url.pathname==="/admin/evo-instructor-link-run"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!vd.authenticated||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const body=await request.json().catch(()=>({})),unit=String(body.unit||"");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const runKey="manual-"+new Date().toISOString()+"-"+crypto.randomUUID();
        await backfillMissingAttendanceInstructors(env,unit,runKey);
        const row=await env.DB.prepare("SELECT status,detail,updated_at FROM evo_sync_schedule_runs WHERE unit=? AND kind='instructor_link' AND scheduled_minute=?").bind(unit,runKey).first();
        const detail=JSON.parse(row?.detail||"{}");
        return json({ok:row?.status==="done",status:row?.status,...detail,updated_at:row?.updated_at});
      }

      if(url.pathname==='/admin/evo-reservation-run'&&request.method==='POST'){
        const ck=request.headers.get('x-clubpop-admin-cookie')||'';
        if(!ck)return json({ok:false,error:'NAO_AUTORIZADO'},401);
        const vr=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:ck,Accept:'application/json'}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!vd.authenticated||vd.role!=='admin')return json({ok:false,error:'NAO_AUTORIZADO'},403);
        const body=await request.json().catch(()=>({})),unit=body.unit;
        if(!['bike','gym'].includes(unit))return json({ok:false,error:'UNIDADE_INVALIDA'},400);
        const result=await startReservationSync(env.DB,unit,'manual-'+new Date().toISOString()+'-'+crypto.randomUUID(),true);
        ctx.waitUntil(processReservationSync(env,unit,getEvoConfig,12));
        return json(result,202);
      }

      // Histórico das execuções automáticas. Somente D1; não consome EVO.
      if (url.pathname === "/admin/evo-automation-runs" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!vd.authenticated)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const requestedUnit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        if(!["bike","gym"].includes(requestedUnit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const permitted=vd.role==="admin" || (vd.role==="reception" && Array.isArray(vd.permissions) && vd.permissions.includes("/admin-alunos-evo.html"));
        if(!permitted)return json({ok:false,error:"SEM_PERMISSAO_ALUNOS"},403);
        if(vd.role!=="admin" && (!Array.isArray(vd.units)||!vd.units.includes(requestedUnit)))return json({ok:false,error:"UNIDADE_SEM_ACESSO"},403);
        const unit=requestedUnit;
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
        const rr=await env.DB.prepare("SELECT unit,kind,scheduled_minute,status,detail,updated_at FROM evo_sync_schedule_runs WHERE unit=? ORDER BY updated_at DESC,scheduled_minute DESC LIMIT 200").bind(unit).all();
        return json({ok:true,runs:rr.results||[]});
      }

      // Histórico de contratos manuais; registra apenas metadados, sem consultar a EVO.
      if(url.pathname==="/admin/evo-contracts-run-log"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const status=b.status==="done"?"done":"failed",requests=Math.max(0,Math.min(1000,Number(b.requests)||0)),records=Math.max(0,Math.min(1000000,Number(b.records)||0)),checkpoint=Math.max(0,Number(b.checkpoint)||0);
        const detail=JSON.stringify({manual:true,requests,records,checkpoint,error:String(b.error||"").slice(0,150)});
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
        const now=new Date(),stamp=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"medium"}).format(now).replace(" ","T");
        await env.DB.prepare("INSERT INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status,detail) VALUES(?,'contract',?,?,?)").bind(unit,stamp+"-manual-"+crypto.randomUUID().slice(0,8),status,detail).run();
        return json({ok:true});
      }

      // Horários operacionais persistidos no D1. Consultar/salvar não chama a EVO.
      if (url.pathname === "/admin/evo-sync-schedules" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedules(unit TEXT NOT NULL,kind TEXT NOT NULL,times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind))").run();if(request.method==="PUT"){const q=await request.json().catch(()=>({})),kind=["student","opportunity","client","attendance","contract","contract_catalog","service_catalog","modalities_catalog","instructor_link","reservation"].includes(String(q.kind))?String(q.kind):"",times=Array.isArray(q.times)?[...new Set(q.times.map(String).filter(x=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort():[];if(!kind||times.length>12)return json({ok:false,error:"HORARIOS_INVALIDOS"},400);const days=Array.isArray(q.days)?[...new Set(q.days.map(Number))].sort((a,b)=>a-b):null;if(days!==null&&(!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6)))return json({ok:false,error:"DIAS_INVALIDOS"},400);await env.DB.prepare("INSERT INTO evo_sync_schedules(unit,kind,times_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,kind) DO UPDATE SET times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,kind,JSON.stringify(times)).run();const combinations=q.combinations;if(combinations!==undefined){if(!Array.isArray(combinations)||combinations.length>20||combinations.some(g=>!Array.isArray(g.days)||!g.days.length||g.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Array.isArray(g.times)||!g.times.length||g.times.some(t=>typeof t!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))))return json({ok:false,error:"COMBINACOES_INVALIDAS"},400);await env.DB.prepare("INSERT INTO evo_sync_schedules(unit,kind,times_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,kind) DO UPDATE SET times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,kind+"_combinations",JSON.stringify(combinations)).run();}if(days!==null)await env.DB.prepare("INSERT INTO evo_sync_schedules(unit,kind,times_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,kind) DO UPDATE SET times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,kind+"_days",JSON.stringify(days)).run();}const rr=await env.DB.prepare("SELECT kind,times_json FROM evo_sync_schedules WHERE unit=?").bind(unit).all(),out={student:[],opportunity:[],attendance:[],contract:[],contract_catalog:[],service_catalog:[],modalities_catalog:[],instructor_link:[],reservation:[],combinations:{},days:{student:[1,2,3,4,5,6],opportunity:[1,2,3,4,5,6],attendance:[1,2,3,4,5,6],contract:[1,2,3,4,5,6],contract_catalog:[1,2,3,4,5,6],service_catalog:[1,2,3,4,5,6],modalities_catalog:[1,2,3,4,5,6],instructor_link:[1,2,3,4,5,6],reservation:[1,2,3,4,5,6]}};for(const x of rr.results||[]){try{if(x.kind.endsWith("_combinations"))out.combinations[x.kind.slice(0,-13)]=JSON.parse(x.times_json||"[]");else if(x.kind.endsWith("_days"))out.days[x.kind.slice(0,-5)]=JSON.parse(x.times_json||"[]");else out[x.kind]=JSON.parse(x.times_json||"[]")}catch{}}return json({ok:true,unit,...out});
      }
      if (url.pathname === "/admin/mission-modalities" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const rows=await env.DB.prepare("SELECT DISTINCT TRIM(activity_name) AS name FROM evo_attendance_sessions WHERE unit=? AND activity_name IS NOT NULL AND TRIM(activity_name)<>'' UNION SELECT DISTINCT TRIM(activity_name) AS name FROM evo_member_attendance WHERE unit=? AND activity_name IS NOT NULL AND TRIM(activity_name)<>'' UNION SELECT DISTINCT TRIM(activity_name) AS name FROM evo_modalities_catalog WHERE unit=? AND is_active=1 AND TRIM(activity_name)<>'' ORDER BY name").bind(unit,unit,unit).all();
        return json({ok:true,source:"d1",evoRequestsMade:0,unit,modalities:(rows.results||[]).map(x=>x.name)});
      }
      if (url.pathname === "/admin/evo-sync-summary" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",month=new Date().toISOString().slice(0,7),aa=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) lastAt FROM evo_member_attendance WHERE unit=? AND substr(attendance_date,1,7)=?").bind(unit,month).first(),ss=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) lastAt FROM evo_attendance_sessions WHERE unit=? AND substr(activity_date,1,7)=? AND status='done'").bind(unit,month).first(),pp=await env.DB.prepare("SELECT COUNT(*) n FROM evo_attendance_sessions WHERE unit=? AND substr(activity_date,1,7)=? AND status<>'done'").bind(unit,month).first();return json({ok:true,unit,month,attendanceMonth:Number(aa?.n||0),sessionsMonth:Number(ss?.n||0),pending:Number(pp?.n||0),lastAttendanceAt:aa?.lastAt||ss?.lastAt||null});
      }

      // Configuração da sincronização econômica por unidade. Não executa EVO ao consultar/salvar.
      if (url.pathname === "/admin/evo-sync-config" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        if(request.method==="PUT"){const b=await request.json().catch(()=>({})),tm=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(b.syncTime||""))?String(b.syncTime):null;if(!tm)return json({ok:false,error:"HORARIO_INVALIDO"},400);await env.DB.prepare("INSERT INTO evo_sync_config(unit,sync_time,enabled,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET sync_time=excluded.sync_time,updated_at=CURRENT_TIMESTAMP").bind(unit,tm).run();}
        const c=await env.DB.prepare("SELECT unit,sync_time,enabled,last_sync_at,last_sync_status,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(unit).first();
        return json({ok:true,config:c||{unit,sync_time:unit==="gym"?"04:30":"04:00",enabled:1,last_sync_at:null,last_sync_status:null,last_sync_requests:0}});
      }

      // Consulta administrativa do consumo real de requisições EVO.
      if (url.pathname === "/admin/evo-requests" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        const days=Math.max(1,Math.min(60,Number(url.searchParams.get("days")||14)));
        const daily=await env.DB.prepare("SELECT date(datetime(created_at, '-3 hours')) AS day, COUNT(*) AS total, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors FROM evo_request_log WHERE unit=? AND datetime(created_at) >= datetime('now', ?) GROUP BY day ORDER BY day DESC").bind(unit,"-"+days+" days").all();
        const purposes=await env.DB.prepare("SELECT purpose,COUNT(*) AS total FROM evo_request_log WHERE unit=? AND date(datetime(created_at, '-3 hours'))=date(datetime('now', '-3 hours')) GROUP BY purpose ORDER BY total DESC").bind(unit).all();
        const recent=await env.DB.prepare("SELECT id,purpose,method,endpoint,status,ok,created_at AS createdAt FROM evo_request_log WHERE unit=? ORDER BY id DESC LIMIT 100").bind(unit).all();
        return json({ok:true,unit,limit:100,daily:daily.results||[],purposes:purposes.results||[],recent:recent.results||[]});
      }

      // Configuração genérica da Tela de Check-in por unidade + atividade.
      if (url.pathname === "/admin/checkin-layouts" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
        if(request.method==="GET"){const r=await env.DB.prepare("SELECT unit,activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson,updated_at AS updatedAt FROM checkin_layouts WHERE unit=? ORDER BY activity_name").bind(unit).all();return json({ok:true,unit,items:(r.results||[]).map(x=>({...x,rows:JSON.parse(x.rowsJson||"[]")}))});}
        const b=await readJson(request),activityId=String(b.activityId||"").trim().slice(0,120),activityName=String(b.activityName||"").trim().slice(0,160),capacity=Number(b.capacity),rows=Array.isArray(b.rows)?b.rows.map(Number):[];
        if(!activityId||!activityName||!Number.isInteger(capacity)||capacity<1||capacity>200||!rows.length||rows.some(x=>!Number.isInteger(x)||x<1||x>50)||rows.reduce((a,b)=>a+b,0)!==capacity)return json({ok:false,error:"LAYOUT_INVALIDO"},400);
        await env.DB.prepare("INSERT INTO checkin_layouts(unit,activity_id,activity_name,capacity,rows_json,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,activity_id) DO UPDATE SET activity_name=excluded.activity_name,capacity=excluded.capacity,rows_json=excluded.rows_json,updated_at=CURRENT_TIMESTAMP").bind(unit,activityId,activityName,capacity,JSON.stringify(rows)).run();
        return json({ok:true,unit,activityId,activityName,capacity,rows});
      }
      if (url.pathname === "/checkin-layout" && request.method === "GET") {
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40),activityId=String(url.searchParams.get("activityId")||""),activityName=String(url.searchParams.get("activityName")||"");
        let x=null;if(activityId)x=await env.DB.prepare("SELECT activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson FROM checkin_layouts WHERE unit=? AND activity_id=? LIMIT 1").bind(unit,activityId).first();
        if(!x&&activityName)x=await env.DB.prepare("SELECT activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson FROM checkin_layouts WHERE unit=? AND lower(activity_name)=lower(?) LIMIT 1").bind(unit,activityName).first();
        return json({ok:true,unit,layout:x?{activityId:x.activityId,activityName:x.activityName,capacity:Number(x.capacity),rows:JSON.parse(x.rowsJson||"[]")}:null});
      }

      
      if (url.pathname === "/admin/evo-vip-checkpoint" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const x=await request.json().catch(()=>({}));if(String(x.unit||"bike")!=="bike")return json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"},423);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_vip_diagnostic_checkpoint (unit TEXT PRIMARY KEY, next_skip INTEGER NOT NULL DEFAULT 0, contracts INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, vip_json TEXT NOT NULL DEFAULT '[]', details_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        if(x.action==="load"){const q=await env.DB.prepare("SELECT next_skip,contracts,requests,vip_json,details_json,updated_at FROM evo_vip_diagnostic_checkpoint WHERE unit='bike'").first();return json({ok:true,checkpoint:q||null});}
        if(x.action==="reset"){await env.DB.prepare("DELETE FROM evo_vip_diagnostic_checkpoint WHERE unit='bike'").run();return json({ok:true,reset:true});}
        if(x.action!=="save")return json({ok:false,error:"ACAO_INVALIDA"},400);
        const ids=[...new Set((Array.isArray(x.vipIds)?x.vipIds:[]).map(Number).filter(Number.isInteger))],details=Array.isArray(x.details)?x.details.slice(-200):[];
        await env.DB.prepare("INSERT INTO evo_vip_diagnostic_checkpoint(unit,next_skip,contracts,requests,vip_json,details_json,updated_at) VALUES('bike',?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,contracts=excluded.contracts,requests=excluded.requests,vip_json=excluded.vip_json,details_json=excluded.details_json,updated_at=CURRENT_TIMESTAMP").bind(Number(x.nextSkip||0),Number(x.contracts||0),Number(x.requests||0),JSON.stringify(ids),JSON.stringify(details)).run();
        return json({ok:true,saved:true,nextSkip:Number(x.nextSkip||0),contracts:Number(x.contracts||0),vipCount:ids.length});
      }

      // Additive daily registration snapshot: independent from the active student mirror.
      if (url.pathname === "/internal/evo-daily-registrations" && request.method === "POST") {
        const secret=request.headers.get("x-auto-sync-secret")||"";
        if(!secret||secret!==String(env.AUTO_SYNC_SECRET||""))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const body=await request.json().catch(()=>({}));
        if(!["bike","gym"].includes(body.unit)||!["client","opportunity"].includes(body.category)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(body.day||"")||!Array.isArray(body.rows)||body.rows.length>100)return json({ok:false,error:"PARAMETROS_INVALIDOS"},422);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_daily_registrations (unit TEXT NOT NULL, category TEXT NOT NULL, evo_id TEXT NOT NULL, register_day TEXT NOT NULL, register_at TEXT, display_name TEXT, payload_json TEXT NOT NULL, first_seen_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(unit,category,evo_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_daily_registration_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,day TEXT NOT NULL,category TEXT NOT NULL,found INTEGER NOT NULL,inserted INTEGER NOT NULL,requests INTEGER NOT NULL,status TEXT NOT NULL,error TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
        const clean=body.rows.map(m=>{const id=String(m?.idMember??m?.idProspect??m?.id??"");const date=String(m?.registerDate??m?.registrationDate??m?.createdAt??m?.createDate??"");return {id,date,name:[m?.firstName??m?.name??"",m?.lastName??""].filter(Boolean).join(" ").slice(0,200),raw:m}}).filter(m=>m.id.length>0&&m.id.length<=100&&(/^\d{4}-\d{2}-\d{2}/.test(m.date)?m.date.slice(0,10)===body.day:/^\d{2}\/\d{2}\/\d{4}/.test(m.date)?m.date.slice(6,10)+"-"+m.date.slice(3,5)+"-"+m.date.slice(0,2)===body.day:false));
        let inserted=0;
        for(const m of clean){const prior=await env.DB.prepare("SELECT 1 FROM evo_daily_registrations WHERE unit=? AND category=? AND evo_id=?").bind(body.unit,body.category,m.id).first();if(!prior)inserted++;
          await env.DB.prepare("INSERT INTO evo_daily_registrations(unit,category,evo_id,register_day,register_at,display_name,payload_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(unit,category,evo_id) DO UPDATE SET register_day=excluded.register_day,register_at=excluded.register_at,display_name=excluded.display_name,payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(body.unit,body.category,m.id,body.day,m.date,m.name,JSON.stringify(m.raw)).run();
        }
        await env.DB.prepare("INSERT INTO evo_daily_registration_runs(unit,day,category,found,inserted,requests,status) VALUES(?,?,?,?,?,?,'ok')").bind(body.unit,body.day,body.category,clean.length,inserted,Number(body.requests||0)).run();
        return json({ok:true,unit:body.unit,category:body.category,day:body.day,found:clean.length,inserted,requests:Number(body.requests||0)});
      }

      // Read-only new-student journey: category comes from EVO identifiers or existing contracts.
      // Contract status never removes a same-day registration from this cohort.
      if (url.pathname === "/admin/equipment-maintenance") return equipmentMaintenance(request,env,url);
      if(url.pathname==="/admin/flash-mission-classes")return flashClasses(request,env,url);
      if(url.pathname==="/admin/journey-automations")return journeyAutomationAdmin(request,env,url,journeyChatproAdapters(env));
      if (url.pathname === "/admin/new-students" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(String(vd.role||"")))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const day=String(url.searchParams.get("day")||"");
        const from=String(url.searchParams.get("from")||day),to=String(url.searchParams.get("to")||day);
        if(!from||!to||!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Math.round((Date.parse(to)-Date.parse(from))/86400000)>366)return json({ok:false,error:"PERIODO_INVALIDO"},400);
        const opportunityRows=(await env.DB.prepare("SELECT evo_id id,register_day day,register_at registeredAt,display_name name FROM evo_daily_registrations WHERE unit=? AND category='opportunity' AND register_day BETWEEN ? AND ? ORDER BY register_at DESC LIMIT 500").bind(unit,from,to).all()).results||[];
        const opportunities=opportunityRows.map(r=>({id:r.id,name:r.name,day:r.day,registeredAt:r.registeredAt}));
        const rows=(await env.DB.prepare(`SELECT r.category source,r.evo_id id,r.register_day day,r.register_at registeredAt,r.display_name name,
          COALESCE(NULLIF(json_extract(r.payload_json,'$.gympassId'),''),NULLIF(json_extract(mm.integrations_json,'$.gympassId'),'')) wellhubId,
          COALESCE(NULLIF(json_extract(r.payload_json,'$.codeTotalpass'),''),NULLIF(json_extract(mm.integrations_json,'$.codeTotalpass'),'')) totalpassId,
          EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=r.unit AND c.evo_member_id=r.evo_id AND (c.category_id='4' OR upper(c.membership_name) LIKE '%WELLHUB%' OR upper(c.membership_name) LIKE '%GYMPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) wellhubContract,
          EXISTS(SELECT 1 FROM evo_member_contracts c WHERE c.unit=r.unit AND c.evo_member_id=r.evo_id AND (c.category_id='5' OR upper(c.membership_name) LIKE '%TOTALPASS%') AND lower(COALESCE(c.membership_status,'')) IN ('active','1') AND (c.end_date IS NULL OR date(c.end_date)>=date('now','-3 hours'))) totalpassContract
          FROM evo_daily_registrations r LEFT JOIN evo_member_master mm ON mm.unit=r.unit AND mm.evo_member_id=r.evo_id AND mm.is_current=1
          WHERE r.unit=? AND r.category IN ('client','opportunity') AND r.register_day BETWEEN ? AND ? ORDER BY CASE WHEN r.category='client' THEN 0 ELSE 1 END,r.register_at DESC LIMIT 500`).bind(unit,from,to).all()).results||[];
        const normalizeIdentity=v=>String(v||"").trim().toLowerCase();
        const memberLookup=(await env.DB.prepare("SELECT evo_member_id id,personal_json details,contacts_json contacts FROM evo_member_master WHERE unit=? AND is_current=1").bind(unit).all()).results||[];
        const memberByDocument=new Map(),memberByEmail=new Map();
        for(const member of memberLookup){
          let details={};try{details=JSON.parse(member.details||"{}")}catch{}
          const document=String(details.document||"").replace(/[^0-9]/g,"");
          const email=normalizeIdentity(details.email);
          for(const [map,key] of [[memberByDocument,document],[memberByEmail,email]]){
            if(!key)continue;
            if(!map.has(key))map.set(key,[]);
            map.get(key).push(String(member.id));
          }
        }
        const memberPhone=new Map();
        const normalizeBrazilPhone=raw=>{
          const original=String(raw||'').trim(),digits=original.replace(/\D/g,'');
          if(!digits)return {phoneOriginal:original||null,phoneNormalized:null,phoneStatus:'missing'};
          let national=digits;
          if(national.startsWith('0055'))national=national.slice(4);
          else if(national.startsWith('55')&&(national.length===12||national.length===13))national=national.slice(2);
          if(!/^\d{10,11}$/.test(national)||national[0]==='0'||national[1]==='0')return {phoneOriginal:original,phoneNormalized:null,phoneStatus:'invalid'};
          const subscriber=national.slice(2);
          if(subscriber.length===9&&subscriber[0]!=='9')return {phoneOriginal:original,phoneNormalized:null,phoneStatus:'invalid'};
          return {phoneOriginal:original,phoneNormalized:'55'+national,phoneStatus:'valid'};
        };
        const extractPhone=(...sources)=>{
          const valid=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.length>=10&&digits.length<=13?String(value).trim():null};
          for(const source of sources){
            let v=source;
            if(typeof v==='string'&&/^[\s]*[\[{]/.test(v)){try{v=JSON.parse(v)}catch{}}
            if(!v||typeof v!=='object')continue;
            const contacts=Array.isArray(v)?v:Array.isArray(v.contacts)?v.contacts:Array.isArray(v.phones)?v.phones:[];
            for(const c of contacts){
              const kind=String(c.contactType||c.type||'').toLowerCase();
              if(/e-mail|email|mail/.test(kind))continue;
              const phone=valid(c.description||c.number||c.value||c.phone);
              if(phone&&(/cell|mobile|celular|whats|phone|telefone|fone/.test(kind)||Number(c.idContactType)===2))return phone;
            }
            const candidates=[v.cellPhone,v.cellphone,v.mobile,v.mobilePhone,v.phone,v.phoneNumber,v.telephone,v.whatsapp,v.whatsApp,v.celular,v.telefone,v.phone1,v.phone2,v.contactPhone,v.contacts?.cellPhone,v.contacts?.mobile,v.contacts?.phone];
            for(const c of candidates){const phone=valid(typeof c==='object'?(c?.number||c?.value):c);if(phone)return phone}
          }
          return null
        };
        for(const m of memberLookup){let p={},c={};try{p=JSON.parse(m.details||'{}')}catch{}try{c=JSON.parse(m.contacts||'{}')}catch{}const phone=extractPhone(c,p);if(phone)memberPhone.set(String(m.id),phone)}
        const linkedMembers=new Map();
        for(const candidate of rows.filter(x=>x.source==="opportunity")){
          const record=await env.DB.prepare("SELECT payload_json FROM evo_daily_registrations WHERE unit=? AND category='opportunity' AND evo_id=?").bind(unit,String(candidate.id)).first();
          let data={};try{data=JSON.parse(record?.payload_json||"{}")}catch{}
          const document=String(data.document||data.cpf||"").replace(/[^0-9]/g,"");
          const email=normalizeIdentity(data.email);
          const docs=document.length===11?memberByDocument.get(document):null;
          const mails=email.includes("@")?memberByEmail.get(email):null;
          const ids=docs?.length?docs:mails;
          if(ids?.length===1&&ids[0]!==String(candidate.id))linkedMembers.set(String(candidate.id),ids[0]);
        }
        const linkedClientIds=new Set(linkedMembers.values());const seen=new Set();const students=rows.filter(r=>{if(r.source==='client'&&linkedClientIds.has(String(r.id)))return false;const key=String(r.id);if(seen.has(key))return false;seen.add(key);return true}).map(r=>{const category=r.source==="opportunity"?"opportunity":r.totalpassId||r.totalpassContract?"totalpass":r.wellhubId||r.wellhubContract?"wellhub":"other";return {id:r.id,source:r.source,name:r.name,registeredAt:r.registeredAt,day:r.day,category,wellhubId:r.wellhubId||null,totalpassId:r.totalpassId||null,contractFound:category==="totalpass"?!!r.totalpassContract:category==="wellhub"?!!r.wellhubContract:null,contractAlert:category==="totalpass"?!!r.totalpassId&&!r.totalpassContract:category==="wellhub"?!!r.wellhubId&&!r.wellhubContract:false}});
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_prospect_reservations(unit TEXT NOT NULL,session_id TEXT NOT NULL,prospect_id TEXT NOT NULL,activity_date TEXT NOT NULL,start_time TEXT NOT NULL,activity_name TEXT,member_name TEXT,status TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,session_id,prospect_id))").run();
        const [attendanceQuery,bookingQuery,contractQuery]=await Promise.all([
          env.DB.prepare("SELECT a.evo_member_id id,a.attendance_date day,a.start_time time,a.activity_name activity FROM evo_member_attendance a WHERE a.unit=? AND a.attendance_date>=? AND a.attendance_date<=date('now','-3 hours') AND EXISTS(SELECT 1 FROM evo_daily_registrations r WHERE r.unit=a.unit AND r.evo_id=a.evo_member_id AND r.category IN ('client','opportunity') AND r.register_day BETWEEN ? AND ?) ORDER BY a.attendance_date,a.start_time").bind(unit,from,from,to).all(),
          env.DB.prepare("SELECT b.evo_member_id id,b.activity_date day,b.start_time time,b.activity_name activity,b.session_id session FROM checkin_reservation_snapshots b WHERE b.unit=? AND b.removed=0 AND (b.status IS NULL OR lower(b.status) NOT IN ('cancelled','canceled','cancelado','cancelada')) AND EXISTS(SELECT 1 FROM evo_daily_registrations r WHERE r.unit=b.unit AND r.evo_id=b.evo_member_id AND r.category IN ('client','opportunity') AND r.register_day BETWEEN ? AND ?) ORDER BY b.activity_date,b.start_time").bind(unit,from,to).all(),
          env.DB.prepare("SELECT c.evo_member_id id,c.membership_name name,c.membership_status status,c.start_date startDate,c.end_date endDate,c.cancel_date cancelDate,c.category_id category FROM evo_member_contracts c WHERE c.unit=? AND EXISTS(SELECT 1 FROM evo_daily_registrations r WHERE r.unit=c.unit AND r.evo_id=c.evo_member_id AND r.category IN ('client','opportunity') AND r.register_day BETWEEN ? AND ?)").bind(unit,from,to).all()
        ]);
        const byId=(items)=>{const map=new Map();for(const x of items.results||[]){const k=String(x.id);if(!map.has(k))map.set(k,[]);map.get(k).push(x)}return map};
        const attendanceBy=byId(attendanceQuery),bookingBy=byId(bookingQuery),contractBy=byId(contractQuery);
        const prospectBookings=(await env.DB.prepare("SELECT p.prospect_id id,p.activity_date day,p.start_time time,p.activity_name activity,p.session_id session FROM evo_prospect_reservations p WHERE p.unit=? AND EXISTS(SELECT 1 FROM evo_daily_registrations r WHERE r.unit=p.unit AND r.category='opportunity' AND r.evo_id=p.prospect_id AND r.register_day BETWEEN ? AND ?) ORDER BY p.activity_date,p.start_time").bind(unit,from,to).all()).results||[];
        const prospectBookingBy=byId({results:prospectBookings});
        const now=new Date(Date.now()-3*3600000).toISOString().slice(0,10),days=(a,b)=>Math.floor((Date.parse(b+"T12:00:00Z")-Date.parse(a+"T12:00:00Z"))/86400000);
        const ranking=new Map();
        for(const st of students){
          const linkedId=linkedMembers.get(String(st.id));
          const extraAttend=linkedId?(await env.DB.prepare("SELECT attendance_date day,start_time time,activity_name activity FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date>=? ORDER BY attendance_date,start_time").bind(unit,linkedId,st.day).all()).results||[]:[];
          const attend=[...(attendanceBy.get(String(st.id))||[]),...extraAttend].filter(x=>String(x.day)>=st.day);
          const bookings=[...(bookingBy.get(String(st.id))||[]),...(st.category==="opportunity"?(prospectBookingBy.get(String(st.id))||[]):[])].filter(x=>String(x.day)>=st.day).sort((a,b)=>String(a.day).localeCompare(String(b.day))||String(a.time).localeCompare(String(b.time)));
          const extraContracts=linkedId?(await env.DB.prepare("SELECT membership_name name,membership_status status,start_date startDate,end_date endDate,cancel_date cancelDate,category_id category FROM evo_member_contracts WHERE unit=? AND evo_member_id=?").bind(unit,linkedId).all()).results||[]:[];
          const contracts=[...(contractBy.get(String(st.id))||[]),...extraContracts];
          let registrationPayload={};try{const rr=await env.DB.prepare("SELECT payload_json FROM evo_daily_registrations WHERE unit=? AND evo_id=? AND category=? ORDER BY register_at DESC LIMIT 1").bind(unit,String(st.id),st.category==='opportunity'?'opportunity':'client').first();registrationPayload=JSON.parse(rr?.payload_json||'{}')}catch{}
          st.phone=memberPhone.get(String(st.id))|| (linkedId?memberPhone.get(String(linkedId)):null)||extractPhone(registrationPayload);
          Object.assign(st,normalizeBrazilPhone(st.phone));
          st.convertedMemberId=linkedId||null;
          const first=attend[0]?.day||null,last=attend[attend.length-1]?.day||null;
          const future=bookings.filter(x=>String(x.day)>=now);
          const recent=attend.filter(x=>days(String(x.day),now)<=27);
          const direct=contracts.filter(c=>!/(wellhub|gympass|total\s*pass)/i.test(String(c.name||""))&&!["4","5"].includes(String(c.category)));
          const converted=direct.filter(c=>String(c.startDate||"").slice(0,10)>=st.day);
          const active=contracts.filter(c=>["1","active","ativo"].includes(String(c.status||"").toLowerCase())&&(!c.startDate||String(c.startDate).slice(0,10)<=now)&&(!c.endDate||String(c.endDate).slice(0,10)>=now)&&(!c.cancelDate||String(c.cancelDate).slice(0,10)>now));
          st.contractFound=["other","opportunity"].includes(st.category)?active.length>0:st.contractFound;
          st.contractAlert=!["other","opportunity"].includes(st.category)&&!active.some(c=>st.category==="wellhub"?/(wellhub|gympass)/i.test(String(c.name||""))||String(c.category)==="4":/(total\s*pass)/i.test(String(c.name||""))||String(c.category)==="5");
          st.booking=bookings[0]||null;st.nextBooking=future[0]||null;st.firstAttendance=first;st.lastAttendance=last;st.attendanceCount=attend.length;st.weeklyAverage=Math.round(recent.length/4*10)/10;st.daysSinceAttendance=last?days(last,now):null;st.followupDay=first?Math.max(0,days(first,now)):null;st.retention={day30:first&&days(first,now)>=30?attend.some(a=>days(first,String(a.day))>=23&&days(first,String(a.day))<=37):null,day60:first&&days(first,now)>=60?attend.some(a=>days(first,String(a.day))>=53&&days(first,String(a.day))<=67):null,day90:first&&days(first,now)>=90?attend.some(a=>days(first,String(a.day))>=83&&days(first,String(a.day))<=97):null};
          st.stage=first?"attendance":bookings.length?"booking":"identified";
          st.risk=first&&st.daysSinceAttendance>=14?"high":first&&st.daysSinceAttendance>=7?"attention":!first&&days(st.day,now)>=7?"no-first-class":"normal";
          st.contracts=contracts.map(c=>({name:c.name,startDate:c.startDate,status:c.status,active:active.includes(c)}));
          st.converted=converted.length>0;st.firstContract=converted[0]?.name||null;
          if(st.converted)for(const c of converted){const name=String(c.name||"Plano não identificado");ranking.set(name,(ranking.get(name)||0)+1)}
        }
        const metrics={identified:students.filter(s=>s.stage==="identified").length,booked:students.filter(s=>s.stage==="booking").length,attended:students.filter(s=>s.stage==="attendance").length,everBooked:students.filter(s=>s.booking).length,everAttended:students.filter(s=>s.firstAttendance).length,converted:students.filter(s=>s.converted).length,activeContracts:students.filter(s=>s.contracts.some(c=>c.active)).length,opportunities:students.filter(s=>s.category==="other"&&!s.converted).length,attention:students.filter(s=>s.risk!=="normal").length,contractRanking:[...ranking.entries()].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}))};
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_new_student_interventions(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const logs=(await env.DB.prepare("SELECT evo_member_id id,kind,note,created_at at FROM club_new_student_interventions WHERE unit=? AND evo_member_id IN (SELECT evo_id FROM evo_daily_registrations WHERE unit=? AND category IN ('client','opportunity') AND register_day BETWEEN ? AND ?) ORDER BY created_at DESC LIMIT 500").bind(unit,unit,from,to).all().catch(()=>({results:[]}))).results||[];
        const logBy=byId(logs);for(const st of students)st.interventions=logBy.get(String(st.id))||[];
        return json({ok:true,unit,from,to,students,opportunities,metrics,counts:{total:students.length,wellhub:students.filter(x=>x.category==="wellhub").length,totalpass:students.filter(x=>x.category==="totalpass").length,other:students.filter(x=>x.category==="other").length,opportunity:students.filter(x=>x.category==="opportunity").length},note:"Cadastro permanece na jornada independentemente do contrato. Disparos ChatPro nao sao executados por esta rota."});
      }

      if(url.pathname==="/admin/new-students/interventions"&&request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),actor=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(String(actor.role||"")))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||""),id=String(b.id||""),kind=String(b.kind||""),note=String(b.note||"").trim();
        if(!["bike","gym"].includes(unit)||!/^[0-9]{1,15}$/.test(id)||!["contact","survey","response","followup"].includes(kind)||!note||note.length>1000)return json({ok:false,error:"DADOS_INVALIDOS"},400);
        if(actor.units?.length&&!actor.units.includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        const registered=await env.DB.prepare("SELECT 1 found FROM evo_daily_registrations WHERE unit=? AND evo_id=? AND category IN ('client','opportunity') LIMIT 1").bind(unit,id).first();
        if(!registered)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_new_student_interventions(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,kind TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        await env.DB.prepare("INSERT INTO club_new_student_interventions(unit,evo_member_id,kind,note) VALUES(?,?,?,?)").bind(unit,id,kind,note).run();
        return json({ok:true});
      }
      if (url.pathname === "/internal/evo-current-job" && request.method === "POST") {
        const secret=request.headers.get("x-auto-sync-secret")||"";if(!secret||secret!==String(env.AUTO_SYNC_SECRET||""))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const result=await currentStudentJob(env,await request.json());return json(result,result.status||200);
      }

      if (url.pathname === "/admin/evo-current-job" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const result=await currentStudentJob(env,await request.json());return json(result,result.status||200);
      }

      if (url.pathname === "/admin/evo-contracts-summary" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const q=await env.DB.prepare("SELECT COUNT(*) contracts,COUNT(DISTINCT evo_member_id) members,COUNT(DISTINCT CASE WHEN category_id IN ('4','5') THEN evo_member_id END) aggregators,MAX(synced_at) last_sync_at FROM evo_member_contracts WHERE unit=? AND lower(COALESCE(membership_status,''))='active'").bind(unit).first();
        const cp=await env.DB.prepare("SELECT next_skip,updated_at FROM evo_contract_sync_checkpoint WHERE unit=?").bind(unit).first();
        return json({ok:true,unit,summary:{contracts:Number(q?.contracts||0),members:Number(q?.members||0),aggregators:Number(q?.aggregators||0)},lastSyncAt:q?.last_sync_at||null,checkpoint:Number(cp?.next_skip||0),checkpointUpdatedAt:cp?.updated_at||null,evoRequestsMade:0});
      }

      if (url.pathname === "/admin/evo-contract-categories" && ["GET","POST"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase(),tenant="club-pop";
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(request.method==="GET"){
          const q=await env.DB.prepare("SELECT category_id id,category_name name,last_synced_at syncedAt FROM evo_contract_categories WHERE tenant_key=? AND unit=? ORDER BY lower(category_name)").bind(tenant,unit).all();
          const m=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) linked FROM evo_contract_catalog WHERE tenant_key=? AND unit=? AND is_active=1").bind(tenant,unit).first();
          return json({ok:true,unit,categories:q.results||[],contracts:Number(m?.total||0),linked:Number(m?.linked||0),evoRequestsMade:0});
        }
        const body=await request.json().catch(()=>({})),list=body.categories;
        if(!Array.isArray(list)||!list.length||list.length>300||body.complete!==true)return json({ok:false,error:"CATEGORIAS_INCOMPLETAS"},422);
        const ids=new Set(),categories=[];
        for(const c of list){const id=String(c.id??"").trim(),name=String(c.name??"").trim();if(!/^\d+$/.test(id)||!name||name.length>200||ids.has(id))return json({ok:false,error:"CATEGORIA_INVALIDA"},422);ids.add(id);categories.push({id,name});}
        const statements=categories.map(c=>env.DB.prepare("INSERT INTO evo_contract_categories(tenant_key,unit,category_id,category_name,source,last_synced_at) VALUES(?,?,?,?,'evo',CURRENT_TIMESTAMP) ON CONFLICT(tenant_key,unit,category_id) DO UPDATE SET category_name=excluded.category_name,last_synced_at=CURRENT_TIMESTAMP").bind(tenant,unit,c.id,c.name));
        await env.DB.batch(statements);
        const q=await env.DB.prepare("SELECT c.evo_contract_id id,MIN(m.category_id) categoryId,COUNT(DISTINCT m.category_id) variants FROM evo_contract_catalog c JOIN evo_member_contracts m ON m.unit=c.unit AND CAST(m.id_membership AS TEXT)=c.evo_contract_id WHERE c.tenant_key=? AND c.unit=? AND m.category_id IS NOT NULL GROUP BY c.evo_contract_id").bind(tenant,unit).all();
        const known=new Map(categories.map(c=>[c.id,c.name]));
        const matches=(q.results||[]).filter(x=>Number(x.variants)===1&&known.has(String(x.categoryId)));
        if(matches.length)await env.DB.batch(matches.map(x=>env.DB.prepare("UPDATE evo_contract_catalog SET category_id=?,category_name=? WHERE tenant_key=? AND unit=? AND evo_contract_id=? AND (category_id IS NULL OR category_id=?)").bind(String(x.categoryId),known.get(String(x.categoryId)),tenant,unit,String(x.id),String(x.categoryId))));
        const summary=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END) linked FROM evo_contract_catalog WHERE tenant_key=? AND unit=? AND is_active=1").bind(tenant,unit).first();
        return json({ok:true,unit,categoriesSaved:categories.length,linked:Number(summary?.linked||0),contracts:Number(summary?.total||0),evoRequestsMade:0});
      }

      if (url.pathname === "/admin/evo-contract-catalog" && ["GET","POST"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const tenant="club-pop";
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT evo_contract_id id,contract_name name,category_id categoryId,category_name category,is_active active,last_synced_at syncedAt FROM evo_contract_catalog WHERE tenant_key=? AND unit=? ORDER BY lower(contract_name),evo_contract_id").bind(tenant,unit).all();
          const meta=await env.DB.prepare("SELECT last_success_at lastSuccessAt,last_count lastCount,last_error lastError FROM evo_contract_catalog_sync WHERE tenant_key=? AND unit=?").bind(tenant,unit).first();
          const contracts=(rows.results||[]).map(x=>({id:x.id,name:x.name,categoryId:x.categoryId,category:x.category||"Sem categoria",inactive:Number(x.active)!==1}));
          return json({ok:true,unit,contracts,lastSyncAt:meta?.lastSuccessAt||null,source:"evo_contract_catalog",evoRequestsMade:0});
        }
        const body=await request.json().catch(()=>({}));
        const list=body.contracts;
        if(!Array.isArray(list)||!body.complete||list.length<1||list.length>200||!Number.isSafeInteger(Number(body.reportedTotal))||Number(body.reportedTotal)!==list.length)return json({ok:false,error:"CATALOGO_INCOMPLETO_OU_INVALIDO"},422);
        const seen=new Set(),rows=[];
        for(const c of list){
          const id=String(c.id??"").trim(),name=String(c.name||"").trim();
          if(!/^\d+$/.test(id)||!name||name.length>250||seen.has(id))return json({ok:false,error:"CONTRATO_INVALIDO_OU_DUPLICADO"},422);
          seen.add(id);
          rows.push({id,name,categoryId:c.categoryId==null?null:String(c.categoryId).slice(0,100),category:String(c.category||"Sem categoria").slice(0,200)});
        }
        const statements=rows.map(c=>env.DB.prepare("INSERT INTO evo_contract_catalog (tenant_key,unit,evo_contract_id,contract_name,category_id,category_name,is_active,last_seen_at,last_synced_at,inactive_since) VALUES (?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL) ON CONFLICT(tenant_key,unit,evo_contract_id) DO UPDATE SET contract_name=excluded.contract_name,category_id=excluded.category_id,category_name=excluded.category_name,is_active=1,last_seen_at=CURRENT_TIMESTAMP,last_synced_at=CURRENT_TIMESTAMP,inactive_since=NULL").bind(tenant,unit,c.id,c.name,c.categoryId,c.category));
        statements.push(env.DB.prepare("UPDATE evo_contract_catalog SET is_active=0,inactive_since=COALESCE(inactive_since,CURRENT_TIMESTAMP),last_synced_at=CURRENT_TIMESTAMP WHERE tenant_key=? AND unit=? AND evo_contract_id NOT IN ("+rows.map(()=>"?").join(",")+")").bind(tenant,unit,...rows.map(c=>c.id)));
        statements.push(env.DB.prepare("INSERT INTO evo_contract_catalog_sync(tenant_key,unit,last_attempt_at,last_success_at,last_result,last_count,last_error) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'ok',?,NULL) ON CONFLICT(tenant_key,unit) DO UPDATE SET last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,last_result='ok',last_count=excluded.last_count,last_error=NULL").bind(tenant,unit,rows.length));
        await env.DB.batch(statements);
        await recordCatalogManualRun(env,unit,"contract_catalog",rows.length,1);return json({ok:true,unit,saved:rows.length,evoRequestsMade:1});
      }

      if (url.pathname === "/admin/evo-product-catalog" && ["GET","POST"].includes(request.method)) {
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store"});
        const session=await auth.json().catch(()=>({}));
        if(!auth.ok||session.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        if(unit!=="bike")return json({ok:false,error:"APENAS_BIKE_NESTA_FASE"},400);
        const tenant="default";
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT evo_product_id id,name,sku,barcode,price_cents priceCents,stock_quantity stock,active,last_synced_at syncedAt FROM evo_product_catalog WHERE tenant_key=? AND unit=? ORDER BY lower(name)").bind(tenant,unit).all();
          const meta=await env.DB.prepare("SELECT last_success_at lastSuccessAt,last_count lastCount,request_count requestCount,last_error lastError FROM evo_product_sync WHERE tenant_key=? AND unit=?").bind(tenant,unit).first();
          return json({ok:true,unit,products:rows.results||[],lastSyncAt:meta?.lastSuccessAt||null,lastCount:meta?.lastCount||0,lastRequestCount:meta?.requestCount||0,lastError:meta?.lastError||null,evoRequestsMade:0});
        }
        const cfg=await getEvoConfig(env,unit);
        const endpoint="/api/v1/product",base="https://evo-integracao-api.w12app.com.br"+endpoint;
        const all=[];let skip=0,requests=0,done=false;
        while(requests<20){
          let response;
          try{response=await fetch(base+"?take=50&skip="+skip+"&onlySellable=false",{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"},signal:AbortSignal.timeout(15000)});}
          catch(e){requests++;try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,0,0)").bind(unit,"products_catalog",endpoint).run()}catch{}return json({ok:false,error:"EVO_PRODUTOS_REDE",requests},502);}
          requests++;
          try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,?,?)").bind(unit,"products_catalog",endpoint,response.status,response.ok?1:0).run()}catch{}
          if(!response.ok)return json({ok:false,error:"EVO_PRODUTOS_HTTP_"+response.status,requests,message:"Catálogo anterior preservado. Verifique permissão Product na EVO."},502);
          const payload=await response.json().catch(()=>null);
          const items=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.items)?payload.items:null;
          if(!items||items.length>50)return json({ok:false,error:"FORMATO_PRODUTOS_EVO_INVALIDO",requests},502);
          all.push(...items);
          if(items.length<50){done=true;break;}
          skip+=items.length;
        }
        if(!done)return json({ok:false,error:"PAGINACAO_PRODUTOS_INCOMPLETA",requests},422);
        const normalized=[],seen=new Set();
        for(const item of all){
          if(!item||typeof item!=="object")return json({ok:false,error:"PRODUTO_INVALIDO",requests},422);
          const id=String(item.idProduct??"").trim(),name=String(item.nameProduct??"").trim();
          if(!/^[0-9]+$/.test(id)||!name||name.length>250||seen.has(id))return json({ok:false,error:"PRODUTO_INVALIDO",requests},422);
          seen.add(id);
          const value=item.value==null?null:Number(item.value),stock=item.currentAmount==null?null:Number(item.currentAmount);
          if((value!==null&&(!Number.isFinite(value)||value<0))||(stock!==null&&!Number.isFinite(stock)))return json({ok:false,error:"PRECO_OU_ESTOQUE_INVALIDO",requests},422);
          normalized.push({id,name,sku:item.code==null?null:String(item.code),price:value===null?null:Math.round(value*100),stock,active:item.active===false?0:1,raw:JSON.stringify(item)});
        }
        const writes=[env.DB.prepare("UPDATE evo_product_catalog SET active=0 WHERE tenant_key=? AND unit=?").bind(tenant,unit)];
        for(const p of normalized)writes.push(env.DB.prepare("INSERT INTO evo_product_catalog(tenant_key,unit,evo_product_id,name,sku,price_cents,stock_quantity,active,raw_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_key,unit,evo_product_id) DO UPDATE SET name=excluded.name,sku=excluded.sku,price_cents=excluded.price_cents,stock_quantity=excluded.stock_quantity,active=excluded.active,raw_json=excluded.raw_json,last_seen_at=CURRENT_TIMESTAMP,last_synced_at=CURRENT_TIMESTAMP").bind(tenant,unit,p.id,p.name,p.sku,p.price,p.stock,p.active,p.raw));
        writes.push(env.DB.prepare("INSERT INTO evo_product_sync(tenant_key,unit,last_attempt_at,last_success_at,last_count,last_error,request_count) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,NULL,?) ON CONFLICT(tenant_key,unit) DO UPDATE SET last_attempt_at=CURRENT_TIMESTAMP,last_success_at=CURRENT_TIMESTAMP,last_count=excluded.last_count,last_error=NULL,request_count=excluded.request_count").bind(tenant,unit,normalized.length,requests));
        await env.DB.batch(writes);
        return json({ok:true,unit,saved:normalized.length,requests});
      }


      if(url.pathname==="/admin/evo-modalities-catalog"&&["GET","POST"].includes(request.method)){
       const ck=request.headers.get("x-clubpop-admin-cookie")||"";
       if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
       const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
       const au=await ar.json().catch(()=>({}));
       if(!ar.ok||au.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
       const unit=String(url.searchParams.get("unit")||"").toLowerCase();
       if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
       if(request.method==="GET"){
        const rows=await env.DB.prepare("SELECT evo_activity_id id,activity_name name,is_active active,last_synced_at syncedAt FROM evo_modalities_catalog WHERE unit=? ORDER BY lower(activity_name)").bind(unit).all();
        const meta=await env.DB.prepare("SELECT last_success_at lastSuccessAt,last_count lastCount,last_requests lastRequests FROM evo_modalities_catalog_sync WHERE unit=?").bind(unit).first();
        return json({ok:true,unit,modalities:rows.results||[],lastSyncAt:meta?.lastSuccessAt||null,lastCount:meta?.lastCount||0,lastRequests:meta?.lastRequests||0,requests:0});
       }
       try{const result=await syncEvoModalities(env,unit);await recordCatalogManualRun(env,unit,"modalities_catalog",result.saved,result.requests);return json({ok:true,unit,...result})}
       catch(e){return json({ok:false,error:String(e?.message||e)},502)}
      }

      if (url.pathname === "/admin/evo-service-catalog" && ["GET","POST"].includes(request.method)) {
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"}});
        const session=await auth.json().catch(()=>({}));
        if(!auth.ok||session.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT evo_service_id id,service_name name,price,is_active active,last_synced_at syncedAt FROM evo_service_catalog WHERE unit=? ORDER BY lower(service_name)").bind(unit).all();
          const meta=await env.DB.prepare("SELECT last_success_at lastSuccessAt,last_count lastCount FROM evo_service_catalog_sync WHERE unit=?").bind(unit).first();
          return json({ok:true,unit,services:rows.results||[],lastSyncAt:meta?.lastSuccessAt||null,requests:0});
        }
        const cfg=await getEvoConfig(env,unit);
        const base="https://evo-integracao-api.w12app.com.br/api/v1/service";
        const all=[];let skip=0,requests=0,done=false;
        while(requests<20){
          const response=await fetch(base+"?take=50&skip="+skip,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"},signal:AbortSignal.timeout(15000)});
          requests++;
          try { await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,?,?)").bind(unit,"services_catalog","/api/v1/service",response.status,response.ok?1:0).run(); } catch {}
          if(!response.ok)return json({ok:false,error:"EVO_SERVICOS_HTTP_"+response.status,requests,...(response.status===403?{message:"A EVO negou acesso aos serviços desta unidade (403). Em EVO → Configurações → Integrações → API EVO, edite o token utilizado e confira a permissão Service → GET /api/v1/service. Se já estiver habilitada, solicite a verificação ao suporte EVO. O catálogo anterior foi preservado."}:{})},502);
          const payload=await response.json().catch(()=>null);
          const items=Array.isArray(payload)?payload:Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.items)?payload.items:null;
          if(!items||items.length>50)return json({ok:false,error:"FORMATO_SERVICOS_EVO_NAO_RECONHECIDO",requests},502);
          all.push(...items);
          if(items.length<50){done=true;break;}
          skip+=items.length;
        }
        if(!done)return json({ok:false,error:"PAGINACAO_SERVICOS_INCOMPLETA",requests},422);
        const seen=new Set(),normalized=[];
        for(const item of all){
          if(!item||typeof item!=="object")return json({ok:false,error:"SERVICO_EVO_INVALIDO",requests},422);
          const id=String(item.idService??item.id??"").trim();
          const name=String(item.nameService??item.name??item.description??item.serviceName??"").trim();
          if(!/^\d+$/.test(id)||!name||name.length>250||seen.has(id))return json({ok:false,error:"SERVICO_EVO_INVALIDO",requests},422);
          seen.add(id);
          const rawPrice=item.value??item.price??item.saleValue??null;
          const price=rawPrice===null?null:Number(rawPrice);
          normalized.push({id,name,price:Number.isFinite(price)?price:null,active:item.inactive===true||item.active===false||item.isActive===false?0:1,raw:JSON.stringify(item)});
        }
        const writes=normalized.map(s=>env.DB.prepare("INSERT INTO evo_service_catalog(unit,evo_service_id,service_name,price,is_active,raw_json,last_synced_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_service_id) DO UPDATE SET service_name=excluded.service_name,price=excluded.price,is_active=excluded.is_active,raw_json=excluded.raw_json,last_synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,s.name,s.price,s.active,s.raw));
        // Keep each statement below D1's parameter limit, even for large catalogs.
        // The batch is atomic: a failed write restores the previous catalog.
        writes.unshift(env.DB.prepare("UPDATE evo_service_catalog SET is_active=0 WHERE unit=?").bind(unit));
        writes.push(env.DB.prepare("INSERT INTO evo_service_catalog_sync(unit,last_success_at,last_count) VALUES(?,CURRENT_TIMESTAMP,?) ON CONFLICT(unit) DO UPDATE SET last_success_at=CURRENT_TIMESTAMP,last_count=excluded.last_count").bind(unit,normalized.length));
        await env.DB.batch(writes);
        await recordCatalogManualRun(env,unit,"service_catalog",normalized.length,requests);
        return json({ok:true,unit,saved:normalized.length,requests});
      }

      if (url.pathname === "/admin/evo-contracts-list" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const q=await env.DB.prepare("SELECT id_membership id,membership_name name,category_id,MAX(CASE WHEN lower(COALESCE(membership_status,'')) IN ('active','1') THEN 1 ELSE 0 END) is_active FROM evo_member_contracts WHERE unit=? AND COALESCE(id_membership,'')<>'' GROUP BY id_membership,membership_name,category_id ORDER BY lower(COALESCE(membership_name,'')),CAST(id_membership AS INTEGER)").bind(unit).all();
        const categoryNames={"1":"VIP","4":"Wellhub","5":"Totalpass"},contracts=(q.results||[]).map(x=>({id:String(x.id),name:x.name||String(x.id),categoryId:x.category_id==null?null:String(x.category_id),category:x.category_id==null?"Sem categoria":(categoryNames[String(x.category_id)]||("Categoria "+x.category_id)),inactive:Number(x.is_active||0)!==1}));
        return json({ok:true,unit,contracts,evoRequestsMade:0});
      }

      if (url.pathname === "/admin/evo-contracts-checkpoint" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const q=await env.DB.prepare("SELECT next_skip,updated_at FROM evo_contract_sync_checkpoint WHERE unit=?").bind(unit).first();
        return json({ok:true,unit,nextSkip:Number(q?.next_skip||0),updatedAt:q?.updated_at||null});
      }

      if (url.pathname === "/admin/evo-contracts-reset" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));if(!["bike","gym"].includes(b.unit)||b.confirm!=="INICIAR_NOVA_VARREDURA")return json({ok:false,error:"REINICIO_NAO_CONFIRMADO"},422);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const prev=await env.DB.prepare("SELECT next_skip FROM evo_contract_sync_checkpoint WHERE unit=?").bind(b.unit).first();
        await env.DB.prepare("INSERT INTO evo_contract_sync_checkpoint(unit,next_skip,updated_at) VALUES(?,0,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=0,updated_at=CURRENT_TIMESTAMP").bind(b.unit).run();
        return json({ok:true,unit:b.unit,previousCheckpoint:Number(prev?.next_skip||0),nextSkip:0,contractsPreserved:true});
      }

      if (url.pathname === "/admin/evo-contracts-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";const internal=!!env.AUTO_SYNC_SECRET&&request.headers.get("x-auto-sync-secret")===String(env.AUTO_SYNC_SECRET);
        if(!internal){if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401)}
        const b=await request.json().catch(()=>({})),rawUnit=String(b.unit||"").toLowerCase();if(!["bike","gym"].includes(rawUnit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);const unit=rawUnit,rows=Array.isArray(b.rows)?b.rows:[];
        if(rows.length>600)return json({ok:false,error:"LOTE_CONTRATOS_INVALIDO"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        // Cada varredura completa recebe uma geração. Apenas uma varredura contínua e concluída
        // pode desativar contratos ausentes da lista de ativos da EVO.
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_generation(unit TEXT PRIMARY KEY,run_id TEXT NOT NULL,next_skip INTEGER NOT NULL DEFAULT 0,completed INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const requestedSkip=Number(b.skip)||0;
        let generation=await env.DB.prepare("SELECT run_id,next_skip,completed FROM evo_contract_sync_generation WHERE unit=?").bind(unit).first();
        if(requestedSkip===0&&rows.length){
          const runId=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO evo_contract_sync_generation(unit,run_id,next_skip,completed,updated_at) VALUES(?,?,0,0,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET run_id=excluded.run_id,next_skip=0,completed=0,updated_at=CURRENT_TIMESTAMP").bind(unit,runId).run();
          generation={run_id:runId,next_skip:0,completed:0};
        }
        const validSequence=!!generation&&!generation.completed&&requestedSkip===Number(generation.next_skip);
        if(!validSequence&&rows.length)return json({ok:false,error:"VARREDURA_FORA_DE_SEQUENCIA",expectedSkip:generation?.next_skip??0},409);
        const stm=[];for(const x of rows){const mid=String(x.idMember||""),mm=String(x.idMemberMembership??x.idMembershipMember??x.id??""),im=String(x.idMembership??"");if(!/^\d+$/.test(mid))continue;const key=mm&&mm!=="undefined"&&mm!=="null"?mm:[im,x.startDate||x.startDateMembership||"",x.endDate||x.endDateMembership||""].join(":");stm.push(env.DB.prepare("INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,source_run_id,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,contract_key) DO UPDATE SET id_membership=excluded.id_membership,id_member_membership=excluded.id_member_membership,category_id=excluded.category_id,membership_name=excluded.membership_name,membership_status=excluded.membership_status,start_date=excluded.start_date,end_date=excluded.end_date,cancel_date=excluded.cancel_date,sale_date=excluded.sale_date,is_additional=excluded.is_additional,raw_json=excluded.raw_json,source_run_id=excluded.source_run_id,synced_at=CURRENT_TIMESTAMP").bind(unit,mid,key,im||null,mm||null,String(x.idCategoryMembership??x.idMembershipCategory??"" )||null,String(x.nameMembership??x.membershipName??x.name??"").slice(0,200)||null,String(x.statusMemberMembership??x.status??"active"),x.startDate??x.startDateMembership??null,x.endDate??x.endDateMembership??null,x.cancelDate??x.cancellationDate??null,x.saleDate??null,x.isAdditional?1:0,JSON.stringify(x),generation?.run_id||null))}
        if(stm.length)await env.DB.batch(stm);
        const nextSkip=Math.max(Number(b.nextSkip)||0,Number(b.skip)||0);await env.DB.prepare("INSERT INTO evo_contract_sync_checkpoint(unit,next_skip,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,updated_at=CURRENT_TIMESTAMP").bind(unit,nextSkip).run();
        if(validSequence&&rows.length)await env.DB.prepare("UPDATE evo_contract_sync_generation SET next_skip=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND run_id=?").bind(requestedSkip+rows.length,unit,generation.run_id).run();
        let deactivated=0;
        if(b.done&&validSequence&&(requestedSkip+rows.length)>0){
          // A EVO retorna somente ativos (status=1) nessa varredura. Ausência comprovada
          // após a última página significa que o contrato não está mais ativo.
          const changed=await env.DB.prepare("UPDATE evo_member_contracts SET membership_status='2',synced_at=CURRENT_TIMESTAMP WHERE unit=? AND membership_status IN ('1','active') AND COALESCE(source_run_id,'')<>?").bind(unit,generation.run_id).run();
          deactivated=Number(changed.meta?.changes||0);
          await env.DB.prepare("UPDATE evo_contract_sync_generation SET completed=1,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND run_id=?").bind(unit,generation.run_id).run();
        }
        if(b.done){
          // Contratos complementam a classificação operacional sem apagar as fontes já homologadas do cadastro.
          // Somente alunos presentes no espelho atual recebem categorias derivadas de contrato.
          await env.DB.batch([
            env.DB.prepare("INSERT OR REPLACE INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,c.evo_member_id,'aggregator','gympass','active_contract_category' FROM evo_member_contracts c JOIN evo_students s ON s.unit=c.unit AND s.evo_member_id=c.evo_member_id AND s.is_current=1 WHERE c.unit=? AND c.category_id='4' AND lower(COALESCE(c.membership_status,'')) IN ('active','1')").bind(unit,unit),
            env.DB.prepare("INSERT OR REPLACE INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,c.evo_member_id,'aggregator','totalpass','active_contract_category' FROM evo_member_contracts c JOIN evo_students s ON s.unit=c.unit AND s.evo_member_id=c.evo_member_id AND s.is_current=1 WHERE c.unit=? AND c.category_id='5' AND lower(COALESCE(c.membership_status,''))='active'").bind(unit,unit),
            env.DB.prepare("INSERT INTO evo_sync_config(unit,last_sync_at,last_sync_status,updated_at) VALUES(?,CURRENT_TIMESTAMP,'contracts_ok',CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='contracts_ok',updated_at=CURRENT_TIMESTAMP").bind(unit)
          ]);
        }
        const q=await env.DB.prepare("SELECT COUNT(*) contracts,COUNT(DISTINCT evo_member_id) members,COUNT(DISTINCT CASE WHEN category_id IN ('4','5') THEN evo_member_id END) aggregators FROM evo_member_contracts WHERE unit=? AND lower(COALESCE(membership_status,'')) IN ('active','1')").bind(unit).first();
        return json({ok:true,unit,saved:stm.length,deactivated,summary:{contracts:Number(q?.contracts||0),members:Number(q?.members||0),aggregators:Number(q?.aggregators||0)}});
      }



      if(url.pathname==="/admin/student-segments"&&["GET","POST","DELETE"].includes(request.method)){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const admin=await vr.json().catch(()=>({}));
        if(!vr.ok||admin.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=url.searchParams.get("unit")==="gym"?"gym":"bike";
        if(admin.units?.length&&!admin.units.includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        if(request.method==="GET"){const list=(await env.DB.prepare("SELECT id,name,filters_json,created_at,updated_at FROM student_management_segments WHERE unit=? ORDER BY updated_at DESC LIMIT 100").bind(unit).all()).results;return json({ok:true,segments:list.map(x=>({...x,filters:JSON.parse(x.filters_json||"{}")}))})}
        if(request.method==="DELETE"){const id=Number(url.searchParams.get("id"));if(!Number.isSafeInteger(id)||id<1)return json({ok:false,error:"ID_INVALIDO"},400);await env.DB.prepare("DELETE FROM student_management_segments WHERE unit=? AND id=?").bind(unit,id).run();return json({ok:true})}
        const data=await request.json().catch(()=>({})),name=String(data.name||"").trim();
        if(!name||name.length>80||!data.filters||typeof data.filters!=="object"||Array.isArray(data.filters))return json({ok:false,error:"DADOS_INVALIDOS"},400);
        const allowed=["search","absence","period","hour","category","weekday","modality","classes","contactable","window","habitModality","habitDays","habitMinimum","habitState","habitWindow"];
        const clean={};for(const k of allowed){if(data.filters[k]!==undefined)clean[k]=String(data.filters[k]).slice(0,100)}
        const serialized=JSON.stringify(clean);
        if(data.id){const id=Number(data.id);if(!Number.isSafeInteger(id)||id<1)return json({ok:false,error:"ID_INVALIDO"},400);const result=await env.DB.prepare("UPDATE student_management_segments SET name=?,filters_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND unit=?").bind(name,serialized,id,unit).run();if(!result.meta?.changes)return json({ok:false,error:"SEGMENTO_NAO_ENCONTRADO"},404);return json({ok:true,id})}
        const result=await env.DB.prepare("INSERT INTO student_management_segments(unit,name,filters_json) VALUES(?,?,?)").bind(unit,name,serialized).run();return json({ok:true,id:result.meta?.last_row_id});
      }
      // Gestão de Alunos: segmentos de retenção calculados exclusivamente no D1.
      if(url.pathname==="/admin/student-management"&&request.method==="GET"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const admin=await auth.json().catch(()=>({}));
        if(!auth.ok||!["admin","reception"].includes(admin.role))return json({ok:false,error:"NAO_AUTORIZADO"},403);
        if(admin.role!=="admin"&&!((admin.permissions||[]).includes("*")||(admin.permissions||[]).includes("/admin-alunos-evo.html")||(admin.permissions||[]).includes("/admin-gestao-alunos.html")))return json({ok:false,error:"SEM_PERMISSAO"},403);
        const unit=url.searchParams.get("unit")==="gym"?"gym":"bike";
        if(admin.units?.length&&!admin.units.includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        const windowDays=[30,60,90].includes(Number(url.searchParams.get("window")))?Number(url.searchParams.get("window")):90;
        const contracts=(await env.DB.prepare(`
          SELECT c.evo_member_id,
          GROUP_CONCAT(DISTINCT c.membership_name) contracts,
          GROUP_CONCAT(DISTINCT COALESCE(cat.category_name,c.category_id,'')) categories
          FROM evo_member_contracts c LEFT JOIN evo_contract_catalog cat ON cat.unit=c.unit AND cat.evo_contract_id=c.id_membership
          WHERE c.unit=? AND lower(c.membership_status) IN ('1','active','ativo')
          AND (c.cancel_date IS NULL OR c.cancel_date='' OR substr(c.cancel_date,1,10)>date('now','-3 hours'))
          AND (c.start_date IS NULL OR c.start_date='' OR substr(c.start_date,1,10)<=date('now','-3 hours'))
          AND (c.end_date IS NULL OR c.end_date='' OR substr(c.end_date,1,10)>=date('now','-3 hours'))
          GROUP BY c.evo_member_id
        `).bind(unit).all()).results||[];
        const ids=new Set(contracts.map(x=>String(x.evo_member_id)));
        const master=(await env.DB.prepare("SELECT evo_member_id,personal_json,contacts_json FROM evo_member_master WHERE unit=? AND is_current=1").bind(unit).all()).results||[];
        const attendance=(await env.DB.prepare("SELECT a.evo_member_id,a.attendance_date,a.start_time,a.activity_name,s.instructor_name FROM evo_member_attendance a LEFT JOIN evo_attendance_sessions s ON s.unit=a.unit AND s.id_activity_session=a.id_activity_session WHERE a.unit=? AND a.attendance_date>=date('now','-180 days','-3 hours')").bind(unit).all()).results||[];
        // Reservas futuras já espelhadas no D1; nenhuma requisição adicional à EVO.
        // Ausência de registro não comprova ausência de agendamento.
        const futureBookings=(await env.DB.prepare(`
          SELECT evo_member_id,activity_date,start_time,activity_name
          FROM checkin_reservation_snapshots
          WHERE unit=? AND removed=0 AND evo_member_id IS NOT NULL AND evo_member_id!=''
            AND activity_date>=date('now','-3 hours') AND activity_date<=date('now','-3 hours','+30 days')
            AND (activity_date>date('now','-3 hours') OR COALESCE(start_time,'23:59')>=time('now','-3 hours'))
          ORDER BY activity_date,start_time
        `).bind(unit).all()).results||[];
        const nextBookingById=new Map();
        for(const booking of futureBookings){const id=String(booking.evo_member_id);if(ids.has(id)&&!nextBookingById.has(id))nextBookingById.set(id,{date:booking.activity_date,time:booking.start_time,activity:booking.activity_name})}
        const grouped=new Map();
        for(const a of attendance){const id=String(a.evo_member_id);if(!ids.has(id))continue;let list=grouped.get(id);if(!list){list=[];grouped.set(id,list)}list.push(a)}
        const counts=new Map(contracts.map(c=>[String(c.evo_member_id),c]));
        const today=new Date(Date.now()-3*3600000).toISOString().slice(0,10);
        const rows=master.filter(m=>ids.has(String(m.evo_member_id))).map(m=>{
          let p={};try{p=JSON.parse(m.personal_json||"{}")}catch{}
          let contacts=[];try{contacts=JSON.parse(m.contacts_json||"[]")}catch{}
          const events=grouped.get(String(m.evo_member_id))||[];
          const byHour={},byDay={},byPeriod={},byActivity={},modalityHistory={};let last="";
          for(const a of events){const date=String(a.attendance_date||"").slice(0,10);if(date>last)last=date; if(date<new Date(Date.parse(today+"T12:00:00Z")-(windowDays-1)*86400000).toISOString().slice(0,10))continue;
            const hour=String(a.start_time||"").slice(0,5);
            if(/^\d{2}:\d{2}$/.test(hour)){byHour[hour]=(byHour[hour]||0)+1;const h=Number(hour.slice(0,2)),period=h<12?"manha":h<18?"tarde":"noite";byPeriod[period]=(byPeriod[period]||0)+1}
            if(/^\d{4}-\d{2}-\d{2}$/.test(date)){const day=new Date(date+"T12:00:00Z").getUTCDay();byDay[day]=(byDay[day]||0)+1}
            const activity=String(a.activity_name||"").trim();if(activity)byActivity[activity]=(byActivity[activity]||0)+1;
          }
                    for(const a of events){const activity=String(a.activity_name||"").trim(),date=String(a.attendance_date||"").slice(0,10);if(!activity||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;const key=activity.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();if(!modalityHistory[key])modalityHistory[key]={name:activity,dates:[],sessions:[]};modalityHistory[key].dates.push(date);modalityHistory[key].sessions.push({date,time:String(a.start_time||"").slice(0,5),instructor:String(a.instructor_name||"").trim()})}
          const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0]?.[0]||"";
          const days=last?Math.floor((Date.parse(today+"T12:00:00Z")-Date.parse(last+"T12:00:00Z"))/86400000):null;
          const c=counts.get(String(m.evo_member_id));
          // D1 stores imported contacts as {email,phone} and EVO contacts as an array.
          const phoneContacts=Array.isArray(contacts)?contacts:(contacts&&typeof contacts==="object"?[{description:contacts.phone}]:[]);
          const phone=phoneContacts.filter(x=>x&&typeof x==="object"&&!/email|e-mail/i.test(String(x.contactType||""))).map(x=>String(x.description||"").replace(/\D/g,"")).find(x=>x.length>=10&&x.length<=13)||"";
          return {id:String(m.evo_member_id),name:[p.firstName,p.lastName].filter(Boolean).join(" ")||p.registerName||"Aluno",contracts:c?.contracts||"",categories:c?.categories||"",lastPresence:last,daysAbsent:days,period:top(byPeriod),hour:top(byHour),weekday:top(byDay),modality:top(byActivity),classes:events.filter(a=>String(a.attendance_date||"").slice(0,10)>=new Date(Date.parse(today+"T12:00:00Z")-(windowDays-1)*86400000).toISOString().slice(0,10)).length,modalityHistory:Object.values(modalityHistory),historyDays:180,phone:phone||null,nextBooking:nextBookingById.get(String(m.evo_member_id))||null};
        });
        return json({ok:true,unit,windowDays,total:rows.length,rows,source:"d1",notes:"Hábitos calculados na janela selecionada; histórico de modalidades limitado aos últimos 180 dias. Contatos exigem confirmação antes de enviar."});
      }
      // Espelho administrativo de alunos EVO: leitura exclusiva do D1, sem chamada à EVO.
      if (url.pathname === "/admin/evo-students" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        return json(await currentStudentsView(env,unit));
        const q=await env.DB.prepare(`SELECT
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.gympassId') IS NULL AND json_extract(payload_json,'$.member.codeTotalpass') IS NULL THEN 1 ELSE 0 END) active,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND (json_extract(payload_json,'$.member.gympassId') IS NOT NULL OR json_extract(payload_json,'$.member.codeTotalpass') IS NOT NULL) THEN 1 ELSE 0 END) aggregators,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.gympassId') IS NOT NULL THEN 1 ELSE 0 END) gympass,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.codeTotalpass') IS NOT NULL THEN 1 ELSE 0 END) totalpass,
          SUM(CASE WHEN lower(COALESCE(json_extract(payload_json,'$.member.status'),'')) LIKE '%suspend%' THEN 1 ELSE 0 END) suspended,
          SUM(CASE WHEN lower(COALESCE(json_extract(payload_json,'$.member.membershipStatus'),'')) LIKE '%vip%' THEN 1 ELSE 0 END) vip,
          COUNT(*) total, MAX(updated_at) updatedAt FROM evo_member_cache WHERE unit=?`).bind(unit).first();
        const cfg=await env.DB.prepare("SELECT last_sync_at,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(unit).first();
        const lg=await env.DB.prepare("SELECT added,changed,removed,requests,details,datetime(created_at,'-3 hours') createdAt FROM evo_student_sync_log WHERE unit=? ORDER BY id DESC LIMIT 20").bind(unit).all();
        return json({ok:true,unit,counts:{active:Number(q?.active||0),aggregators:Number(q?.aggregators||0),gympass:Number(q?.gympass||0),totalpass:Number(q?.totalpass||0),suspended:Number(q?.suspended||0),vip:Number(q?.vip||0),total:Number(q?.total||0)},lastSyncAt:cfg?.last_sync_at||q?.updatedAt||null,lastRequests:Number(cfg?.last_sync_requests||0),logs:lg.results||[],source:"d1"});
      }


      if (url.pathname === "/admin/evo-students-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({})); if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const x=await request.json().catch(()=>({})),unit=String(x.unit||"bike").toLowerCase()==="gym"?"gym":"bike"; if(unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"},423);
        const members=Array.isArray(x.members)?x.members:[],reqs=Number(x.requests||0),reset=x.reset===true,done=x.done===true,nextSkip=Number(x.nextSkip||0);
        if(reset){await env.DB.prepare("DELETE FROM evo_student_sync_stage WHERE unit=?").bind(unit).run();await env.DB.prepare("DELETE FROM evo_student_sync_state WHERE unit=?").bind(unit).run();}
        const statements=[];for(const m of members){const id=String(m.idMember||m.id||"");if(!id)continue;const minimal={member:{idMember:Number(id),firstName:m.firstName||m.registerName||"",lastName:m.lastName||m.registerLastName||"",status:m.status||null,accessBlocked:m.accessBlocked??null,membershipStatus:m.membershipStatus||null,gympassId:m.gympassId||null,codeTotalpass:m.codeTotalpass||null,contractName:m.contractName||"",contractType:m.contractType||"",idContractType:m.idContractType??null,idMembership:m.idMembership??null,idMembershipCategory:m.idMembershipCategory??null,membershipCategoryName:m.membershipCategoryName||"",contractStart:m.contractStart||"",contractEnd:m.contractEnd||""},fitcoins:m.totalFitCoins??null};statements.push(env.DB.prepare("INSERT INTO evo_student_sync_stage(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(unit,id,JSON.stringify(minimal)));}for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
        const os=await env.DB.prepare("SELECT links_processed,requests FROM evo_student_sync_state WHERE unit=?").bind(unit).first(),linksProcessed=(reset?0:Number(os?.links_processed||0))+Number(x.batchLinks??members.length),totalRequests=(reset?0:Number(os?.requests||0))+reqs;await env.DB.prepare("INSERT INTO evo_student_sync_state(unit,next_skip,links_processed,requests,started_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,links_processed=excluded.links_processed,requests=excluded.requests,updated_at=CURRENT_TIMESTAMP").bind(unit,nextSkip,linksProcessed,totalRequests).run();
        const staged=await env.DB.prepare("SELECT COUNT(*) n FROM evo_student_sync_stage WHERE unit=?").bind(unit).first();if(!done)return json({ok:true,unit,staged:Number(staged?.n||0),linksProcessed,requests:totalRequests,nextSkip,done:false});
        const before=await env.DB.prepare("SELECT evo_member_id,payload_json FROM evo_member_cache WHERE unit=?").bind(unit).all(),stage=await env.DB.prepare("SELECT evo_member_id,payload_json FROM evo_student_sync_stage WHERE unit=?").bind(unit).all(),prev=new Map((before.results||[]).map(r=>[String(r.evo_member_id),r.payload_json])),fresh=new Map((stage.results||[]).map(r=>[String(r.evo_member_id),r.payload_json]));let added=0,changed=0,removed=0;for(const [id,p] of fresh){if(!prev.has(id))added++;else if(prev.get(id)!==p)changed++;}for(const id of prev.keys())if(!fresh.has(id))removed++;
        await env.DB.prepare("DELETE FROM evo_member_cache WHERE unit=?").bind(unit).run();const promote=[];for(const [id,p] of fresh)promote.push(env.DB.prepare("INSERT INTO evo_member_cache(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,p));for(let i=0;i<promote.length;i+=50)await env.DB.batch(promote.slice(i,i+50));
        await env.DB.prepare("INSERT INTO evo_student_sync_log(unit,added,changed,removed,requests,details) VALUES(?,?,?,?,?,?)").bind(unit,added,changed,removed,totalRequests,JSON.stringify({received:fresh.size,linksProcessed})).run();await env.DB.prepare("INSERT INTO evo_sync_config(unit,last_sync_at,last_sync_status,last_sync_requests) VALUES(?,CURRENT_TIMESTAMP,'ok',?) ON CONFLICT(unit) DO UPDATE SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=excluded.last_sync_requests").bind(unit,totalRequests).run();await env.DB.prepare("DELETE FROM evo_student_sync_stage WHERE unit=?").bind(unit).run();await env.DB.prepare("DELETE FROM evo_student_sync_state WHERE unit=?").bind(unit).run();return json({ok:true,unit,saved:fresh.size,added,changed,removed,requests:totalRequests,linksProcessed,done:true});
      }

// =====================================================
      // HEALTH CHECK
      // =====================================================

      if (request.method === "GET" && url.pathname === "/") {
        return json({
          ok: true,
          service: "CLUB POP API",
          version: "1.0.0",
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const db = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM members"
        ).first();

        return json({
          ok: true,
          service: "CLUB POP API",
          database: "connected",
          members: Number(db?.total || 0),
        });
      }

      // =====================================================
      // PRIMEIRO ACESSO - VALIDAR DADOS NA EVO
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/first-access"
      ) {
        const body = await readJson(request);

        const cpf = normalizeCpf(body.cpf);
        const email = normalizeEmail(body.email);
        const birthDate = normalizeDate(body.birthDate);

        if (!validCpfShape(cpf)) {
          return json({ ok: false, error: "CPF_INVALIDO" }, 400);
        }

        if (!email || !birthDate) {
          return json(
            { ok: false, error: "DADOS_INCOMPLETOS" },
            400
          );
        }

        const cpfHash = await sha256(cpf);

        const existing = await env.DB.prepare(`
          SELECT id, pin_hash
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        if (existing?.pin_hash) {
          return json({
            ok: false,
            error: "CONTA_JA_CRIADA",
            hasAccount: true,
          }, 409);
        }

        const local=await clubFindLocal(env,cpf,email,birthDate);
        if(local.incomplete)return json({ok:false,error:"CADASTRO_INCOMPLETO",whatsappUrl:CLUB_DATA_URL},409);
        if(!local.matched)return json({ok:false,error:"DADOS_NAO_CONFEREM"},401);
        const bike=local.profiles.find(p=>p.unit==="bike");
        const gym=local.profiles.find(p=>p.unit==="gym");
        const evoMember={idMember:bike?.id||null,firstName:bike?.first||gym?.first||"",lastName:bike?.last||gym?.last||""};
        const activeUnits=await clubActiveUnits(env,bike?.id,gym?.id);
        // Conta pode ser criada mesmo sem contrato ativo; acesso é bloqueado no login e em /auth/me.
        const challenge = randomToken(32);
        const challengeHash = await sha256(challenge);
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        const firstName =
          evoMember.firstName ||
          evoMember.name ||
          "";

        const lastName =
          evoMember.lastName ||
          "";

        const evoId = bike?Number(bike.id):null;

        const target = existing || await env.DB.prepare("SELECT id FROM members WHERE evo_member_id = ? OR (? IS NOT NULL AND CAST(gym_client_id AS INTEGER)=?) LIMIT 1").bind(evoId,gym?.id||null,gym?.id?Number(gym.id):null).first();
        if (target?.id) {
          await env.DB.prepare(`
            UPDATE members
            SET evo_member_id = ?,
                cpf_hash = ?,
                cpf_last4 = ?,
                first_name = ?,
                last_name = ?,
                email = ?,
                birth_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            evoId,
            cpfHash,
            cpf.slice(-4),
            firstName,
            lastName,
            email,
            birthDate,
            target.id
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO members (
              evo_member_id,
              cpf_hash,
              cpf_last4,
              first_name,
              last_name,
              email,
              birth_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            evoId,
            cpfHash,
            cpf.slice(-4),
            firstName,
            lastName,
            email,
            birthDate
          ).run();
        }

        const member = await env.DB.prepare(`
          SELECT id
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        if(gym?.id)await env.DB.prepare("UPDATE members SET gym_client_id=? WHERE id=?").bind(clubCanonicalId(gym.id),member.id).run();
        // Reutilizamos auth_sessions para o desafio temporário.
        await env.DB.prepare(`
          INSERT INTO auth_sessions (
            member_id,
            token_hash,
            expires_at
          )
          VALUES (?, ?, ?)
        `).bind(
          member.id,
          challengeHash,
          expires
        ).run();

        await audit(
          env,
          "MEMBER",
          String(member.id),
          "FIRST_ACCESS_VALIDATED"
        );

        return json({
          ok: true,
          validated: true,
          challenge,
          expiresIn: 600,
          activeUnits,
          member: {
            firstName,
          },
        });
      }

      // =====================================================
      // CRIAR PIN
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/create-pin"
      ) {
        const body = await readJson(request);

        const challenge = String(body.challenge || "");
        const pin = String(body.pin || "");

        if (!/^\d{6}$/.test(pin)) {
          return json({
            ok: false,
            error: "PIN_DEVE_TER_6_NUMEROS",
          }, 400);
        }

        const challengeHash = await sha256(challenge);

        const session = await env.DB.prepare(`
          SELECT
            s.id,
            s.member_id,
            s.expires_at,
            s.revoked_at,
            m.pin_hash
          FROM auth_sessions s
          JOIN members m ON m.id = s.member_id
          WHERE s.token_hash = ?
          LIMIT 1
        `).bind(challengeHash).first();

        if (
          !session ||
          session.revoked_at ||
          new Date(session.expires_at).getTime() < Date.now()
        ) {
          return json({
            ok: false,
            error: "VALIDACAO_EXPIRADA",
          }, 401);
        }

        if (session.pin_hash) {
          return json({
            ok: false,
            error: "PIN_JA_CRIADO",
          }, 409);
        }

        const salt = randomToken(16);
        const pinHash = await hashPin(pin, salt);

        await env.DB.prepare(`
          UPDATE members
          SET pin_hash = ?,
              pin_salt = ?,
              pin_created_at = CURRENT_TIMESTAMP,
              failed_login_attempts = 0,
              locked_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          pinHash,
          salt,
          session.member_id
        ).run();

        await env.DB.prepare(`
          UPDATE auth_sessions
          SET revoked_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(session.id).run();

        const registered=await env.DB.prepare("SELECT evo_member_id,gym_client_id FROM members WHERE id=?").bind(session.member_id).first();
        const activeUnits=await clubActiveUnits(env,registered?.evo_member_id,registered?.gym_client_id);
        const auth = activeUnits.length?await createSession(env, session.member_id):null;

        await audit(
          env,
          "MEMBER",
          String(session.member_id),
          "PIN_CREATED"
        );

        return json({
          ok: true,
          accountCreated: true,
          token: auth?.token||null,
          expiresAt: auth?.expiresAt||null,
          activeUnits,
          accessBlocked:!activeUnits.length,
          whatsappUrl:!activeUnits.length?CLUB_RECEPTION_URL:null,
        });
      }

      // =====================================================
      // LOGIN CPF + PIN
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/login"
      ) {
        const body = await readJson(request);

        const cpf = normalizeCpf(body.cpf);
        const pin = String(body.pin || "");

        if (!validCpfShape(cpf) || !/^\d{6}$/.test(pin)) {
          return json({
            ok: false,
            error: "CREDENCIAIS_INVALIDAS",
          }, 401);
        }

        const cpfHash = await sha256(cpf);

        const member = await env.DB.prepare(`
          SELECT *
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        if (!member?.pin_hash || !member?.pin_salt) {          return json({
            ok: false,
            error: "PRIMEIRO_ACESSO_NECESSARIO",
          }, 401);
        }

        if (
          member.locked_until &&
          new Date(member.locked_until).getTime() > Date.now()
        ) {
          return json({
            ok: false,
            error: "ACESSO_TEMPORARIAMENTE_BLOQUEADO",
            lockedUntil: member.locked_until,
          }, 423);
        }

        const candidate = await hashPin(pin, member.pin_salt);

        if (!safeEqual(candidate, member.pin_hash)) {
          const attempts =
            Number(member.failed_login_attempts || 0) + 1;

          if (attempts >= 5) {
            const lockedUntil =
              new Date(Date.now() + 15 * 60 * 1000).toISOString();

            await env.DB.prepare(`
              UPDATE members
              SET failed_login_attempts = 0,
                  locked_until = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(
              lockedUntil,
              member.id
            ).run();

            await audit(
              env,
              "MEMBER",
              String(member.id),
              "LOGIN_TEMPORARILY_LOCKED"
            );

            return json({
              ok: false,
              error: "ACESSO_TEMPORARIAMENTE_BLOQUEADO",
              lockedUntil,
            }, 423);
          }

          await env.DB.prepare(`
            UPDATE members
            SET failed_login_attempts = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            attempts,
            member.id
          ).run();

          return json({
            ok: false,
            error: "CREDENCIAIS_INVALIDAS",
            attemptsRemaining: 5 - attempts,
          }, 401);
        }

        await env.DB.prepare(`
          UPDATE members
          SET failed_login_attempts = 0,
              locked_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(member.id).run();

        const activeUnits=await clubActiveUnits(env,member.evo_member_id,member.gym_client_id);
        if(!activeUnits.length)return json({ok:false,error:"CONTRATO_INATIVO",whatsappUrl:CLUB_RECEPTION_URL},403);
        const auth = await createSession(env, member.id);

        await audit(
          env,
          "MEMBER",
          String(member.id),
          "LOGIN_SUCCESS"
        );

        return json({
          ok: true,
          token: auth.token,
          expiresAt: auth.expiresAt,
          member: {...publicMember(member),activeUnits},
        });
      }

      // =====================================================
      // USUÁRIO LOGADO
      // =====================================================

      if (
        request.method === "GET" &&
        url.pathname === "/auth/me"
      ) {
        const member = await authenticatedMember(request, env);

        if (!member) {
          return json({
            ok: false,
            error: "NAO_AUTORIZADO",
          }, 401);
        }

        const activeUnits=await clubActiveUnits(env,member.evo_member_id,member.gym_client_id);
        if(!activeUnits.length)return json({ok:false,error:"CONTRATO_INATIVO",whatsappUrl:CLUB_RECEPTION_URL},403);
        return json({ok:true,member:{...publicMember(member),activeUnits}});
      }

      // =====================================================
      // ADMIN - CONSULTAR / VINCULAR GYM POP
      // =====================================================
      if (request.method === "POST" && url.pathname === "/admin/member-gym-link") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const body=await readJson(request),cpf=normalizeCpf(body.cpf),action=String(body.action||"status");
        if(!validCpfShape(cpf))return json({ok:false,error:"CPF_INVALIDO"},400);
        const cpfHash=await sha256(cpf);
        const member=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id,first_name,last_name,email,status FROM members WHERE cpf_hash=? LIMIT 1").bind(cpfHash).first();
        if(!member)return json({ok:false,error:"ALUNO_CLUB_POP_NAO_ENCONTRADO"},404);
        const base={id:member.id,name:[member.first_name,member.last_name].filter(Boolean).join(" "),email:member.email||null,bikeMemberId:member.evo_member_id||null,gymMemberId:member.gym_client_id||null,bikeLinked:!!member.evo_member_id,gymLinked:!!member.gym_client_id};
        if(action==="status")return json({ok:true,member:base});
        if(action!=="link")return json({ok:false,error:"ACAO_INVALIDA"},400);
        if(member.gym_client_id)return json({ok:true,alreadyLinked:true,linked:true,member:base});
        const gymMember=await findGymEvoMember(env,cpf);
        if(!gymMember?.idMember)return json({ok:false,error:"GYM_CADASTRO_NAO_ENCONTRADO",member:base},404);
        const gymId=Number(gymMember.idMember);
        if(!Number.isFinite(gymId))return json({ok:false,error:"GYM_ID_INVALIDO"},502);
        const collision=await env.DB.prepare("SELECT id FROM members WHERE gym_client_id=? AND id<>? LIMIT 1").bind(gymId,member.id).first();
        if(collision)return json({ok:false,error:"GYM_JA_VINCULADO_A_OUTRA_CONTA"},409);
        await env.DB.prepare("UPDATE members SET gym_client_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(gymId,member.id).run();
        await audit(env,"ADMIN",String(member.id),"GYM_LINKED_BY_ADMIN","GYM_LINK",String(gymId));
        return json({ok:true,linked:true,member:{...base,gymMemberId:gymId,gymLinked:true}});
      }

      // =====================================================
      // VINCULAR GYM POP
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/member/link-gym"
      ) {
        const member = await authenticatedMember(request, env);

        if (!member) {
          return json({ ok: false, error: "NAO_AUTORIZADO" }, 401);
        }

        const body = await readJson(request);
        const cpf = normalizeCpf(body.cpf);

        if (!validCpfShape(cpf)) {
          return json({ ok: false, error: "CPF_INVALIDO" }, 400);
        }

        const cpfHash = await sha256(cpf);
        if (!safeEqual(cpfHash, String(member.cpf_hash || ""))) {
          await audit(env, "MEMBER", String(member.id), "GYM_LINK_CPF_MISMATCH", "GYM_LINK");
          return json({ ok: false, error: "DADOS_NAO_CONFEREM" }, 401);
        }

        const gymMember = await findGymEvoMember(env, cpf);
        if (!gymMember?.idMember) {
          await audit(env, "MEMBER", String(member.id), "GYM_MEMBER_NOT_FOUND", "GYM_LINK");
          return json({ ok: false, error: "GYM_CADASTRO_NAO_ENCONTRADO" }, 404);
        }

        const gymId = Number(gymMember.idMember);
        if (!Number.isFinite(gymId)) {
          return json({ ok: false, error: "GYM_ID_INVALIDO" }, 502);
        }

        const collision = await env.DB.prepare(`
          SELECT id FROM members
          WHERE gym_client_id = ? AND id <> ?
          LIMIT 1
        `).bind(gymId, member.id).first();

        if (collision) {
          await audit(env, "MEMBER", String(member.id), "GYM_LINK_CONFLICT", "GYM_LINK", String(gymId));
          return json({ ok: false, error: "GYM_JA_VINCULADO" }, 409);
        }

        await env.DB.prepare(`
          UPDATE members
          SET gym_client_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(gymId, member.id).run();

        await audit(env, "MEMBER", String(member.id), "GYM_LINKED", "GYM_LINK", String(gymId));

        return json({ ok: true, linked: true, gymMemberId: gymId });
      }


      // =====================================================
      // GERENCIAMENTO DE UNIDADES / VINCULOS (D1, SEM EVO)
      // =====================================================
      if (url.pathname === "/public/unit-theme" && request.method === "GET") {
        const unit=["bike","gym","club"].includes(String(url.searchParams.get("unit")||""))?String(url.searchParams.get("unit")):"bike";
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS unit_ui_config(unit TEXT PRIMARY KEY, background_color TEXT NOT NULL, header_color TEXT, logo_data TEXT, favicon_data TEXT, logo_link TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        for(const q of ["ALTER TABLE unit_ui_config ADD COLUMN header_color TEXT","ALTER TABLE unit_ui_config ADD COLUMN logo_data TEXT","ALTER TABLE unit_ui_config ADD COLUMN favicon_data TEXT","ALTER TABLE unit_ui_config ADD COLUMN logo_link TEXT"]){try{await env.DB.prepare(q).run()}catch{}}
        const defaults={bike:"#dcc8ff",gym:"#ffc4df",club:"#bfe9d2"};
        const row=await env.DB.prepare("SELECT background_color,header_color,logo_data,favicon_data,logo_link,updated_at FROM unit_ui_config WHERE unit=? LIMIT 1").bind(unit).first();
        return json({ok:true,unit,backgroundColor:row?.background_color||defaults[unit],headerColor:row?.header_color||"#ffffff",logoData:row?.logo_data||"",faviconData:row?.favicon_data||"",logoLink:row?.logo_link||"",updatedAt:row?.updated_at||null});
      }

      if (url.pathname === "/admin/unit-management" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=["bike","gym","club"].includes(String(url.searchParams.get("unit")||""))?String(url.searchParams.get("unit")):"bike";
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS unit_ui_config(unit TEXT PRIMARY KEY, background_color TEXT NOT NULL, header_color TEXT, logo_data TEXT, favicon_data TEXT, logo_link TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        for(const q of ["ALTER TABLE unit_ui_config ADD COLUMN header_color TEXT","ALTER TABLE unit_ui_config ADD COLUMN logo_data TEXT","ALTER TABLE unit_ui_config ADD COLUMN favicon_data TEXT","ALTER TABLE unit_ui_config ADD COLUMN logo_link TEXT"]){try{await env.DB.prepare(q).run()}catch{}}
        const defaults={bike:"#dcc8ff",gym:"#ffc4df",club:"#bfe9d2"};
        if(request.method==="PUT"){
          const b=await readJson(request),color=String(b.backgroundColor||"").trim(),headerColor=String(b.headerColor||"#ffffff").trim(),logoData=String(b.logoData||""),faviconData=String(b.faviconData||""),logoLink=String(b.logoLink||"").trim();
          if(!/^#[0-9a-fA-F]{6}$/.test(color)||!/^#[0-9a-fA-F]{6}$/.test(headerColor))return json({ok:false,error:"COR_INVALIDA"},400);
          if(logoData.length>1450000||faviconData.length>430000)return json({ok:false,error:"IMAGEM_MUITO_GRANDE"},413);
          if(logoData&&!/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/i.test(logoData))return json({ok:false,error:"LOGO_INVALIDA"},400);
          if(faviconData&&!/^data:image\/(?:png|x-icon|vnd\.microsoft\.icon|webp|svg\+xml);base64,/i.test(faviconData))return json({ok:false,error:"FAVICON_INVALIDO"},400);
          if(logoLink&&!/^https?:\/\//i.test(logoLink))return json({ok:false,error:"LINK_LOGO_INVALIDO"},400);
          await env.DB.prepare("INSERT INTO unit_ui_config(unit,background_color,header_color,logo_data,favicon_data,logo_link,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET background_color=excluded.background_color,header_color=excluded.header_color,logo_data=excluded.logo_data,favicon_data=excluded.favicon_data,logo_link=excluded.logo_link,updated_at=CURRENT_TIMESTAMP").bind(unit,color,headerColor,logoData,faviconData,logoLink).run();
          await audit(env,"ADMIN",null,"UNIT_IDENTITY_UPDATED","UNIT",unit,{backgroundColor:color,headerColor,hasLogo:!!logoData,hasFavicon:!!faviconData,logoLink:logoLink||null});
        }
        const row=await env.DB.prepare("SELECT background_color,header_color,logo_data,favicon_data,logo_link,updated_at FROM unit_ui_config WHERE unit=? LIMIT 1").bind(unit).first();
        return json({ok:true,unit,backgroundColor:row?.background_color||defaults[unit],headerColor:row?.header_color||"#ffffff",logoData:row?.logo_data||"",faviconData:row?.favicon_data||"",logoLink:row?.logo_link||"",updatedAt:row?.updated_at||null});
      }

      if (url.pathname === "/admin/auto-link-history" && request.method==="GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const rows=(await env.DB.prepare("SELECT id,action,actor_type,actor_id,entity_id,metadata_json,created_at FROM audit_log WHERE action IN ('AUTO_LINK_RUN','UNIT_LINK_UPDATED') ORDER BY id DESC LIMIT 50").all()).results||[];
        const items=rows.map(r=>{let d={};try{d=JSON.parse(r.metadata_json||"{}")}catch{}return {id:r.id,at:r.created_at,mode:r.action==="AUTO_LINK_RUN"?"automatic":"manual",actor:r.actor_type||null,memberId:r.entity_id||null,candidates:Number(d.candidates||0),linked:Number(d.created||0),pending:Number(d.skipped||0),conflicts:Number(d.conflicts||0),bikeId:d.bikeId||null,gymId:d.gymId||null,trigger:d.trigger||null,evoRequestsMade:0}});
        return json({ok:true,items,evoRequestsMade:0});
      }

      if (url.pathname === "/admin/auto-link" && ["GET","PUT","POST"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const setting=await env.DB.prepare("SELECT value,updated_at FROM club_settings WHERE key='auto_member_link' LIMIT 1").first();
        if(request.method==="PUT"){const b=await readJson(request),enabled=!!b.enabled;await env.DB.prepare("INSERT INTO club_settings(key,value,updated_at) VALUES('auto_member_link',?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(enabled?"1":"0").run();await audit(env,"ADMIN",null,"AUTO_LINK_SETTING","SYSTEM","auto_member_link",{enabled});const initial=enabled?await runAutoLinkD1(env,{trigger:"activation",actorType:"ADMIN"}):null;return json({ok:true,enabled,initial,evoRequestsMade:0});}
        const summarize=async()=>{const linked=await env.DB.prepare("SELECT COUNT(*) n FROM gym_member_links WHERE status='ACTIVE' AND link_source IN ('AUTO_D1_CPF','ADMIN_D1')").first();const pairs=await env.DB.prepare("WITH b AS(SELECT json_extract(personal_json,'$.document') cpf,COUNT(*) n FROM evo_member_master WHERE unit='bike' AND is_current=1 AND length(json_extract(personal_json,'$.document'))=11 GROUP BY cpf),g AS(SELECT json_extract(personal_json,'$.document') cpf,COUNT(*) n FROM evo_member_master WHERE unit='gym' AND is_current=1 AND length(json_extract(personal_json,'$.document'))=11 GROUP BY cpf) SELECT SUM(CASE WHEN b.n=1 AND g.n=1 THEN 1 ELSE 0 END) uniquePairs,SUM(CASE WHEN b.n<>1 OR g.n<>1 THEN 1 ELSE 0 END) conflicts FROM b JOIN g USING(cpf)").first();const last=await env.DB.prepare("SELECT created_at FROM audit_log WHERE action='AUTO_LINK_RUN' ORDER BY id DESC LIMIT 1").first();return {linked:Number(linked?.n||0),pending:Math.max(0,Number(pairs?.uniquePairs||0)-Number(linked?.n||0)),conflicts:Number(pairs?.conflicts||0),lastRunAt:last?.created_at||null};};
        if(request.method==="GET")return json({ok:true,enabled:setting?.value==="1",...(await summarize()),evoRequestsMade:0});
        const enabled=setting?.value==="1";if(!enabled&&url.searchParams.get("action")!=="run")return json({ok:false,error:"VINCULO_AUTOMATICO_DESATIVADO"},409);
        const result=await runAutoLinkD1(env,{trigger:"manual_button",actorType:"ADMIN",force:url.searchParams.get("action")==="run"});
        if(result.skippedRun)return json({ok:false,error:"VINCULO_AUTOMATICO_DESATIVADO"},409);
        return json({...result,...(await summarize())});
      }

      if (url.pathname === "/admin/member-link" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const normId=v=>{const n=Number(String(v??"").trim());return Number.isFinite(n)&&n>0?String(Math.trunc(n)):""};
        if(request.method==="GET"){
          const cpf=normalizeCpf(url.searchParams.get("cpf")||"");
          if(!validCpfShape(cpf))return json({ok:false,error:"CPF_INVALIDO"},400);
          const cpfHash=await sha256(cpf);
          const member=await env.DB.prepare("SELECT id,first_name,last_name,evo_member_id,gym_client_id FROM members WHERE cpf_hash=? LIMIT 1").bind(cpfHash).first();
          const bike=await env.DB.prepare("SELECT evo_member_id,personal_json FROM evo_member_master WHERE unit='bike' AND json_extract(personal_json,'$.document')=? AND is_current=1 LIMIT 1").bind(cpf).first();
          const gym=await env.DB.prepare("SELECT evo_member_id,personal_json FROM evo_member_master WHERE unit='gym' AND json_extract(personal_json,'$.document')=? AND is_current=1 LIMIT 1").bind(cpf).first();
          const name=r=>{try{const p=JSON.parse(r?.personal_json||"{}");return [p.firstName,p.lastName].filter(Boolean).join(" ")}catch{return""}};
          return json({ok:true,member:member?{id:member.id,name:[member.first_name,member.last_name].filter(Boolean).join(" "),bikeId:normId(member.evo_member_id),gymId:normId(member.gym_client_id)}:null,suggestion:{bike:bike?{id:normId(bike.evo_member_id),name:name(bike)}:null,gym:gym?{id:normId(gym.evo_member_id),name:name(gym)}:null}});
        }
        const b=await readJson(request),memberId=Number(b.memberId||0),bikeId=normId(b.bikeId),gymId=normId(b.gymId);
        if(!memberId||(!bikeId&&!gymId))return json({ok:false,error:"VINCULO_INVALIDO"},400);
        const member=await env.DB.prepare("SELECT id FROM members WHERE id=? LIMIT 1").bind(memberId).first();if(!member)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404);
        if(bikeId){const exists=await env.DB.prepare("SELECT 1 ok FROM evo_member_master WHERE unit='bike' AND evo_member_id=? AND is_current=1 LIMIT 1").bind(bikeId).first();if(!exists)return json({ok:false,error:"BIKE_ID_NAO_ENCONTRADO"},404);}
        if(gymId){const exists=await env.DB.prepare("SELECT 1 ok FROM evo_member_master WHERE unit='gym' AND evo_member_id=? AND is_current=1 LIMIT 1").bind(gymId).first();if(!exists)return json({ok:false,error:"GYM_ID_NAO_ENCONTRADO"},404);const collision=await env.DB.prepare("SELECT id FROM members WHERE CAST(gym_client_id AS TEXT)=? AND id<>? LIMIT 1").bind(gymId,memberId).first();if(collision)return json({ok:false,error:"GYM_JA_VINCULADO"},409);}
        await env.DB.prepare("UPDATE members SET evo_member_id=COALESCE(?,evo_member_id),gym_client_id=COALESCE(?,gym_client_id),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(bikeId||null,gymId||null,memberId).run();
        if(gymId){await env.DB.prepare("INSERT INTO gym_member_links(gym_client_id,member_id,link_source,status,linked_at) VALUES(?,?,'ADMIN_D1','ACTIVE',CURRENT_TIMESTAMP) ON CONFLICT(gym_client_id) DO UPDATE SET member_id=excluded.member_id,link_source='ADMIN_D1',status='ACTIVE',linked_at=CURRENT_TIMESTAMP").bind(gymId,memberId).run();}
        await audit(env,"ADMIN",String(memberId),"UNIT_LINK_UPDATED","MEMBER",String(memberId),{bikeId:bikeId||null,gymId:gymId||null});
        return json({ok:true,memberId,bikeId:bikeId||null,gymId:gymId||null});
      }

      // =====================================================
      if(url.pathname==="/admin/checkout-redemptions"&&["GET","POST"].includes(request.method)){
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),auth=await ar.json().catch(()=>({}));
        if(!ar.ok||!["admin","reception"].includes(auth.role)||!Array.isArray(auth.units)||!auth.permissions?.some(p=>p==="*"||p==="/admin-resgates.html"||request.method==="GET"&&p==="/admin-transacoes.html"))return json({ok:false,error:"SEM_PERMISSAO"},403);
        const scopes=auth.units.filter(u=>["bike","gym"].includes(u));if(!scopes.length)return json({ok:true,redemptions:[],transactions:[]});
        if(request.method==="GET"){
          const rows=(await env.DB.prepare("SELECT o.*,trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')) member_name,f.delivery_state FROM club_pix_orders o JOIN members m ON m.id=o.member_id LEFT JOIN club_pix_fulfillment f ON f.order_id=o.id WHERE o.external_member_id IS NOT NULL AND o.external_state NOT IN ('none','failed') AND o.unit IN ("+scopes.map(()=>"?").join(',')+") ORDER BY o.created_at DESC LIMIT 500").bind(...scopes).all()).results||[];
          const content=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();
          const transactions=(JSON.parse(content?.content_json||'{}').transactions||[]).filter(t=>String(t.redemptionId||'').startsWith('checkout:')&&scopes.includes(t.unit));
          return json({ok:true,redemptions:rows.map(receptionRecord),transactions});
        }
        const b=await request.json(),id=String(b.redemptionId||'').replace(/^checkout:/,'');
        if(b.action==='evo_sale_retry'){
          const sale=await env.DB.prepare('SELECT unit FROM club_evo_product_sales WHERE order_id=?').bind(id).first();
          if(auth.role!=='admin'||!sale||!scopes.includes(sale.unit))return json({ok:false,error:'SEM_PERMISSAO'},403);
          const result=await syncCheckoutSale(env,id,{retry:true});
          return json({ok:true,evoSale:result,pixCharged:false,fitcoinsDebited:false});
        }
        const o=await env.DB.prepare("SELECT o.*,trim(coalesce(m.first_name,'')||' '||coalesce(m.last_name,'')) member_name FROM club_pix_orders o JOIN members m ON m.id=o.member_id WHERE o.id=? AND o.external_member_id IS NOT NULL").bind(id).first();
        if(!o||!scopes.includes(o.unit))return json({ok:false,error:"RESGATE_NAO_ENCONTRADO"},404);
        try{return json(await receptionAction(env.DB,o,String(b.action||''),['refund','coins_check','coins_retry'].includes(String(b.action||''))?await checkoutEvo(env,o.unit):null,{...b,actor:String(auth.id||auth.email||auth.name||'recepcao')}));}catch(e){return json({ok:false,error:e.checkoutError?e.message:"FITCOINS_REQUER_CONFERENCIA"},409)}
      }

      if(url.pathname==="/checkout/service-voucher"&&["GET","POST"].includes(request.method)){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=request.method==="POST"?await request.json().catch(()=>({})):{orderId:url.searchParams.get("orderId")};
        const id=String(b.orderId||"");
        if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
        const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE id=? AND member_id=? AND item_type='service'").bind(id,member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        if(order.status!=="approved"||!["confirmed","alternate_paid"].includes(order.external_state))return json({ok:false,error:"PAGAMENTO_NAO_CONFIRMADO"},409);
        const fulfillment=await env.DB.prepare("SELECT delivery_state FROM club_pix_fulfillment WHERE order_id=?").bind(id).first();
        if(fulfillment?.delivery_state==="cancelled"||fulfillment?.delivery_state==="blocked")return json({ok:false,error:"ENTREGA_BLOQUEADA"},409);
        try{return json(await checkoutServiceVoucher(env,order,request.method==="POST"))}
        catch(e){return json({ok:false,error:e.message||"VOUCHER_INDISPONIVEL"},409)}
      }

      // Shared checkout: D1 balances, authoritative amounts and durable choices.
      if((url.pathname==="/checkout/mixed/options"&&request.method==="GET")||(["/checkout/mixed/quote","/checkout/pix/draft"].includes(url.pathname)&&request.method==="POST")){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        try{
          if(request.method==="GET")return json(await checkoutOptions(env.DB,member,Object.fromEntries(url.searchParams)));
          let body=await request.json();
          if(url.pathname.endsWith("/draft")){
            if(Number(body.fitcoinsToUse||0)!==0)return json({ok:false,error:"SALVE_ESCOLHA_COM_MOEDAS"},409);
            body={...body,quantity:0,mode:"pix",save:true,key:crypto.randomUUID()};
          }
          const choice=await checkoutQuote(env.DB,member,body);
          // Automatic EVO product sale snapshots paused; checkout remains unchanged.
          return json({...choice,amountCents:choice.pixCents});
        }catch(e){const known=checkoutError(e);if(known)return json({ok:false,error:known.message},known.status);throw e;}
      }

      // Conciliação administrativa de vendas EVO: leitura sem efeitos financeiros.
      // Status das vendas novas; pedidos históricos continuam sem envio automático.
      if(url.pathname==="/admin/evo-product-sales/pending"&&request.method==="GET"){
        const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let auth;try{auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store"})}catch{return json({ok:false,error:"AUTENTICACAO_INDISPONIVEL"},502)}
        const admin=await auth.json().catch(()=>({}));
        if(!auth.ok||admin.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
        const unit=String(url.searchParams.get("unit")||"bike");
        if(!["bike","gym"].includes(unit)||!(admin.units||[]).includes(unit))return json({ok:false,error:"UNIDADE_NAO_AUTORIZADA"},403);
        const [orders,content]=await Promise.all([
          env.DB.prepare("SELECT o.id,o.unit,o.item_id,o.item_name,o.external_member_id,o.original_cents,o.discount_cents,o.amount_cents,o.currency_quantity,o.status,o.external_state,o.created_at,s.state sale_state,s.evo_sale_id,s.last_error,s.stock_before,s.stock_after,s.member_evo_id FROM club_pix_orders o LEFT JOIN club_evo_product_sales s ON s.order_id=o.id WHERE o.unit=? AND o.item_type='product' AND o.status='approved' AND (o.external_state='confirmed' OR o.currency_quantity=0) ORDER BY o.created_at DESC LIMIT 100").bind(unit).all(),
          env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first()
        ]);
        const products=JSON.parse(content?.content_json||"{}").products||[];
        const result=(orders.results||[]).map(o=>{const p=products.find(x=>String(x.id)===String(o.item_id)&&String(x.unit||"bike")===unit);if(!p||!p.evoProductId||!(p.source==="evo"||p.origin==="evo"))return null;return {orderId:o.id,unit:o.unit,productId:String(p.evoProductId),productName:o.item_name,originalCents:o.original_cents,fitcoinsDiscountCents:o.discount_cents,pixCents:o.amount_cents,fitcoinsUsed:o.currency_quantity,memberEvoId:o.member_evo_id||o.external_member_id,status:o.sale_state||"PENDENTE_CONCILIACAO_EVO",evoSaleId:o.evo_sale_id||null,error:o.last_error||null,stockBefore:o.stock_before,stockAfter:o.stock_after,createdAt:o.created_at}}).filter(Boolean);
        return json({ok:true,unit,remoteSalesCreated:result.some(o=>o.evoSaleId),orders:result,note:"Novos pedidos são enviados após pagamento confirmado. Nova tentativa administrativa: evo_sale_retry. Pedidos históricos não são reenviados."});
      }

      // Simulacao segura da conciliacao EVO: sem Pix, debito, estoque ou venda remota.
      if(url.pathname==="/checkout/evo-product/test"&&request.method==="POST"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));
        if(!["bike","gym"].includes(String(b.unit||""))||!String(b.itemId||""))return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        try{
          const result=await checkoutQuote(env.DB,member,{...b,itemType:"product",save:false});
          const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();
          const product=(JSON.parse(row?.content_json||"{}").products||[]).find(p=>String(p.id)===String(b.itemId)&&String(p.unit||"bike")===String(b.unit));
          if(!product||product.source!=="evo"&&product.origin!=="evo"||!product.evoProductId)return json({ok:false,error:"PRODUTO_NAO_VINCULADO_EVO"},409);
          return json({ok:true,simulation:true,remoteSaleCreated:false,pixCharged:false,coinsDebited:false,stockChanged:false,order:{evoProductId:String(product.evoProductId),originalCents:result.originalCents,fitcoinsDiscountCents:result.discountCents,pixPaymentCents:result.pixCents,netSaleCents:result.pixCents,currencyQuantity:result.quantity},note:"Simulacao contabil. Envio da venda EVO depende de validacao do contrato da API."});
        }catch(e){const known=checkoutError(e);return json({ok:false,error:known?.message||"SIMULACAO_INDISPONIVEL"},known?.status||409)}
      }

      // Test-only Mercado Pago Orders API. Disabled unless explicitly enabled in Worker.
      if (["/checkout/pix/create","/checkout/coins/confirm"].includes(url.pathname) && request.method === "POST") {

        
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));
        const id=String(b.orderId||"");
        if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
        const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE id=? AND member_id=? LIMIT 1").bind(id,member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        const coinsOnly=url.pathname==="/checkout/coins/confirm";
        if(coinsOnly&&(order.payment_mode!=="coins"||Number(order.amount_cents)!==0||Number(order.currency_quantity)<1))return json({ok:false,error:"PAGAMENTO_NAO_E_MOEDAS"},409);
        if(!coinsOnly&&(Number(order.amount_cents)===0||order.payment_mode==="coins"))return json({ok:false,error:"PAGAMENTO_NAO_E_PIX"},409);
        if(coinsOnly&&!order.external_member_id)return json({ok:false,error:"DEBITO_MOEDA_LOCAL_NAO_INTEGRADO"},409);

        if(order.provider_order_id)return json({ok:true,orderId:id,providerOrderId:order.provider_order_id,status:order.status});
        if(order.status==="approved")return json({ok:true,orderId:id,status:"approved",amountCents:order.amount_cents});
        if(order.external_member_id&&order.amount_cents===0&&order.status==='creating'&&['failed','confirmed'].includes(order.external_state)){
          try{return json({ok:true,orderId:id,amountCents:0,...await settleCheckout(env,{...order,status:'creating'})});}catch{return json({ok:false,error:"FITCOINS_REQUER_CONFERENCIA",orderId:id},409)}
        }
        let savedChoice=false;
        try{savedChoice=await validateChoice(env.DB,member,order);}catch(e){const known=checkoutError(e);if(known)return json({ok:false,error:known.message},known.status);throw e;}
        if(order.external_member_id)await getEvoConfig(env,order.unit);
        if(savedChoice&&order.amount_cents===0&&order.external_member_id){
          const claim=await env.DB.prepare("UPDATE club_pix_orders SET status='creating',choice_expires_at=NULL WHERE id=? AND status='selected' AND reservation_state='held' AND datetime(choice_expires_at)>datetime('now')").bind(id).run();
          if(claim.meta.changes!==1)return json({ok:false,error:"ESCOLHA_EXPIRADA_SALVE_NOVAMENTE"},409);
          try{return json({ok:true,orderId:id,amountCents:0,...await settleCheckout(env,order)});}catch(e){return json({ok:false,error:"FITCOINS_REQUER_CONFERENCIA",orderId:id},409)}
        }
        if(savedChoice&&order.amount_cents===0){
          try{
            const settled=await env.DB.prepare("UPDATE club_pix_orders SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=? AND status='selected' AND reservation_state='held' AND datetime(choice_expires_at)>datetime('now')").bind(id,member.id).run();
            if(Number(settled.meta?.changes)!==1)return json({ok:false,error:"ESCOLHA_EXPIRADA_SALVE_NOVAMENTE"},409);
            return json({ok:true,orderId:id,status:"approved",amountCents:0,deliveryQueued:true});
          }catch(e){const known=checkoutError(e);if(known)return json({ok:false,error:known.message},known.status);throw e;}
        }
        if(env.CLUB_PIX_PRODUCTION_ENABLED!=="true")return json({ok:false,error:"PIX_PRODUCTION_DISABLED"},503);
        const credentials=await clubPixCredentials(env,order.unit);
        const token=credentials?.token;
        if(!token)return json({ok:false,error:"PIX_PRODUCTION_NOT_CONFIGURED"},503);
        if(!savedChoice){
        if(order.status!=="created")return json({ok:false,error:"PEDIDO_NAO_DISPONIVEL"},409);
        const catalog=await clubContent(env);
        const item=(order.item_type==="product"?catalog.products:catalog.services||[])?.find(x=>String(x.id)===order.item_id&&String(x.unit||"bike")===order.unit);
        if(!item||String(item.status||"Ativo")!=="Ativo")return json({ok:false,error:"ITEM_INDISPONIVEL"},409);
        if(order.item_type==="product"&&Number(item.stock||0)<=0)return json({ok:false,error:"SEM_ESTOQUE"},409);
        if(!["pix","both"].includes(String(item.paymentMethod||"fitcoins")))return json({ok:false,error:"PIX_NAO_HABILITADO"},409);
        if(Math.round(Number(item.price)*100)!==Number(order.amount_cents))return json({ok:false,error:"PRECO_ALTERADO"},409);
        }
        const email=String(member.email||"").trim();
        if(email.includes(" ")||!email.includes("@")||!email.split("@")[1]?.includes("."))return json({ok:false,error:"EMAIL_INVALIDO"},409);
        const claim=await env.DB.prepare(savedChoice?"UPDATE club_pix_orders SET status='creating',choice_expires_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=? AND status='selected' AND reservation_state='held' AND datetime(choice_expires_at)>datetime('now') AND provider_order_id IS NULL":"UPDATE club_pix_orders SET status='creating',updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=? AND status='created' AND provider_order_id IS NULL").bind(id,member.id).run();
        if(Number(claim.meta?.changes||0)!==1)return json({ok:false,error:"COBRANCA_EM_PROCESSAMENTO"},409);
        const amount=(Number(order.amount_cents)/100).toFixed(2);
        const payload={type:"online",external_reference:id,total_amount:amount,processing_mode:"automatic",transactions:{payments:[{amount,payment_method:{id:"pix",type:"bank_transfer"}}]},payer:{email}};
        let response;
        try{response=await fetch("https://api.mercadopago.com/v1/orders",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","X-Idempotency-Key":order.idempotency_key},body:JSON.stringify(payload)});}
        catch{await env.DB.prepare("UPDATE club_pix_orders SET status='review',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'").bind(id).run();return json({ok:false,error:"PROVEDOR_INDISPONIVEL_REVISAO_NECESSARIA"},502)}
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.id){await env.DB.prepare("UPDATE club_pix_orders SET status='review',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'").bind(id).run();return json({ok:false,error:"FALHA_CRIAR_PIX_REVISAO_NECESSARIA",providerStatus:response.status},502)}
        const method=result.transactions?.payments?.[0]?.payment_method||{};
        await env.DB.prepare("UPDATE club_pix_orders SET provider_order_id=?,status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND member_id=? AND provider_order_id IS NULL").bind(String(result.id),id,member.id).run();
        return json({ok:true,orderId:id,providerOrderId:String(result.id),status:"pending",qrCode:method.qr_code||null,qrCodeBase64:method.qr_code_base64||null,ticketUrl:method.ticket_url||null});
      }

      // Reconcile status with the provider; never trust a browser-supplied payment status.
      if (url.pathname === "/checkout/pix/status" && request.method === "GET") {
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const id=String(url.searchParams.get("orderId")||"");
        if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
        const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE id=? AND member_id=? LIMIT 1").bind(id,member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        if(!order.provider_order_id)return json({ok:true,orderId:id,status:order.status,fulfilled:false});
        if(env.CLUB_PIX_PRODUCTION_ENABLED!=="true")return json({ok:false,error:"PIX_PRODUCTION_DISABLED"},503);
        const creds=await clubPixCredentials(env,order.unit);if(!creds?.token)return json({ok:false,error:"PIX_PRODUCTION_NOT_CONFIGURED"},503);
        let response;
        try{response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(order.provider_order_id),{headers:{"Authorization":"Bearer "+creds.token,"Accept":"application/json"}});}
        catch{return json({ok:false,error:"PROVEDOR_INDISPONIVEL"},502)}
        if(!response.ok)return json({ok:false,error:"CONSULTA_PAGAMENTO_FALHOU",providerStatus:response.status},502);
        const result=await response.json().catch(()=>({}));
        try{const outcome=await clubPixReconcile(env,order,result);return json({ok:true,orderId:id,...outcome,providerStatus:String(result.status||"")});}catch{return json({ok:false,error:"PAGAMENTO_REQUER_REVISAO"},409)}
      }

      if(url.pathname==="/checkout/coins/status"&&request.method==="GET"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const id=String(url.searchParams.get("orderId")||"");
        if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
        const order=await env.DB.prepare("SELECT id,status,external_state,payment_mode,amount_cents,currency_quantity,choice_expires_at,provider_order_id FROM club_pix_orders WHERE id=? AND member_id=? LIMIT 1").bind(id,member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        if(order.payment_mode!=="coins"||Number(order.amount_cents)!==0||Number(order.currency_quantity)<1)return json({ok:false,error:"PAGAMENTO_NAO_E_MOEDAS"},409);
        return json({ok:true,orderId:id,status:customerOrderStatus(order),externalState:order.external_state});
      }

      // Webhook signature is required. Notification only reconciles, never fulfills.
      if(url.pathname==="/checkout/pix/webhook"&&request.method==="POST"){
        if(env.CLUB_PIX_PRODUCTION_ENABLED!=="true")return json({ok:false,error:"PIX_PRODUCTION_DISABLED"},503);
        const signature=request.headers.get("x-signature")||"",requestId=request.headers.get("x-request-id")||"";
        const ts=signature.match(/(?:^|,)\s*ts=([^,]+)/)?.[1]?.trim()||"";
        const v1=signature.match(/(?:^|,)\s*v1=([a-f0-9]+)/i)?.[1]?.trim().toLowerCase()||"";
        const providerId=url.searchParams.get("data.id")||"";
        if(!ts||!v1||!requestId||!providerId||!/^[0-9]+$/.test(ts)||Math.abs(Date.now()-(Number(ts)>1e12?Number(ts):Number(ts)*1000))>300000)return json({ok:false,error:"ASSINATURA_INVALIDA"},401);
        const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE provider_order_id=? LIMIT 1").bind(providerId).first();
        if(!order)return json({ok:true,ignored:true});
        const credentials=await clubPixCredentials(env,order.unit);
        if(!credentials?.secret||!credentials.token)return json({ok:false,error:"PIX_PRODUCTION_NOT_CONFIGURED"},503);
        const manifest="id:"+providerId.toLowerCase()+";request-id:"+requestId+";ts:"+ts+";";
        const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(credentials.secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
        const mac=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(manifest));
        const expected=Array.from(new Uint8Array(mac),x=>x.toString(16).padStart(2,"0")).join("");
        if(expected.length!==v1.length||!Array.from(expected).every((ch,i)=>ch===v1[i]))return json({ok:false,error:"ASSINATURA_INVALIDA"},401);
        const response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(providerId),{headers:{Authorization:"Bearer "+credentials.token}});
        if(!response.ok)return json({ok:false,error:"CONSULTA_FALHOU"},502);
        const result=await response.json().catch(()=>({}));
        try{
          const outcome=await clubPixReconcile(env,order,result);
          await env.DB.prepare("INSERT OR IGNORE INTO club_pix_provider_events(event_key,order_id,provider_order_id,provider_status,amount_cents) VALUES(?,?,?,?,?)").bind("orders:"+providerId+":"+String(result.status),order.id,providerId,String(result.status),Number(order.amount_cents)).run();
          return json({ok:true,...outcome});
        }catch{return json({ok:false,error:"PAGAMENTO_REQUER_REVISAO"},409)}
      }

      // Retrieve QR data again after a page refresh, never returning provider credentials.
      if(url.pathname==="/checkout/pix/details"&&request.method==="GET"){
        if(env.CLUB_PIX_PRODUCTION_ENABLED!=="true")return json({ok:false,error:"PIX_PRODUCTION_DISABLED"},503);
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE id=? AND member_id=? LIMIT 1").bind(String(url.searchParams.get("orderId")||""),member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        if(!order.provider_order_id)return json({ok:false,error:"COBRANCA_NAO_CRIADA"},409);
        const creds=await clubPixCredentials(env,order.unit);if(!creds?.token)return json({ok:false,error:"PIX_PRODUCTION_NOT_CONFIGURED"},503);
        const response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(order.provider_order_id),{headers:{Authorization:"Bearer "+creds.token}});
        if(!response.ok)return json({ok:false,error:"CONSULTA_FALHOU"},502);
        const result=await response.json().catch(()=>({}));
        if(String(result.id)!==String(order.provider_order_id)||String(result.external_reference)!==order.id||Math.round(Number(result.total_amount)*100)!==Number(order.amount_cents))return json({ok:false,error:"DADOS_DIVERGENTES"},409);
        const pm=result.transactions?.payments?.[0]?.payment_method||{};
        return json({ok:true,orderId:order.id,status:order.status,qrCode:pm.qr_code||null,qrCodeBase64:pm.qr_code_base64||null,ticketUrl:pm.ticket_url||null,fulfilled:false});
      }

      // Authenticated fulfillment state, no external mutation or premature delivery.
      if(url.pathname==="/checkout/pix/fulfillment"&&request.method==="GET"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const id=String(url.searchParams.get("orderId")||"");
        if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
        const order=await env.DB.prepare("SELECT id,status FROM club_pix_orders WHERE id=? AND member_id=? LIMIT 1").bind(id,member.id).first();
        if(!order)return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
        const step=await env.DB.prepare("SELECT debit_state,delivery_state FROM club_pix_fulfillment WHERE order_id=? AND member_id=? LIMIT 1").bind(id,member.id).first();
        return json({ok:true,orderId:id,paymentStatus:order.status,fitcoinsStatus:step?.debit_state||"not_started",deliveryStatus:step?.delivery_state||"blocked",fulfilled:step?.delivery_state==="completed"});
      }

      
// Pix sandbox: authenticated order history, no charge or balance mutation.
      if (url.pathname === "/checkout/pix/orders" && request.method === "GET") {
        if(env.CLUB_PIX_PRODUCTION_ENABLED!=="true")return json({ok:false,error:"PIX_PRODUCTION_DISABLED"},503);
        const member = await authenticatedMember(request, env);
        if (!member) return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit = String(url.searchParams.get("unit")||"bike");
        if (!["bike","gym"].includes(unit)) return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        const rows = await env.DB.prepare("SELECT o.id,o.unit,o.item_type,o.item_id,o.amount_cents,o.status,o.external_state,o.currency_quantity,o.payment_mode,o.choice_expires_at,o.provider_order_id,o.created_at,o.updated_at,f.delivery_state FROM club_pix_orders o LEFT JOIN club_pix_fulfillment f ON f.order_id=o.id WHERE o.member_id=? AND o.unit=? ORDER BY created_at DESC LIMIT 30").bind(member.id,unit).all();
        return json({ok:true,orders:(rows.results||[]).map(o=>({...o,status:customerOrderStatus(o)}))});
      }

      
      if(url.pathname==="/admin/mercadopago-config")return await mpAdminConfig(request,env,url,json);


      // Próxima reserva do aluno autenticado, exclusivamente a partir do D1.
      if (url.pathname === "/student-next-class" && request.method === "GET") {
        const member = await authenticatedMember(request, env);
        if (!member) return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit = url.searchParams.get("unit") === "gym" ? "gym" : "bike";
        const evoId = String(unit === "gym" ? (member.gym_client_id || "") : (member.evo_member_id || ""));
        if (!evoId) return json({ok:true,reservation:null,source:"d1",evoRequestsMade:0});
        const chatConfig=await env.DB.prepare("SELECT enabled,open_before,close_after,duration_minutes FROM class_chat_settings WHERE unit=?").bind(unit).first();
        const nowLocal=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
        const part=k=>nowLocal.find(x=>x.type===k)?.value||'';
        const localMinute=part('year')+'-'+part('month')+'-'+part('day')+'T'+part('hour')+':'+part('minute');
        const candidates=await env.DB.prepare(
          "SELECT r.unit,r.session_id,r.activity_date,r.start_time,r.activity_name,CASE WHEN r.slot_number>0 THEN r.slot_number ELSE NULL END AS slot_number,r.updated_at,s.instructor_name FROM checkin_reservation_snapshots r LEFT JOIN evo_attendance_sessions s ON s.unit=r.unit AND CAST(s.id_activity_session AS TEXT)=r.session_id WHERE r.unit=? AND r.evo_member_id=? AND r.removed=0 AND (r.status IS NULL OR lower(r.status) NOT IN ('cancelled','canceled','cancelado','cancelada')) AND r.activity_date>=? ORDER BY r.activity_date ASC,r.start_time ASC LIMIT 40"
        ).bind(unit,evoId,part('year')+'-'+part('month')+'-'+part('day')).all();
        const reservation=(candidates.results||[]).find(r=>{
          const start=String(r.activity_date||'')+'T'+String(r.start_time||'').slice(0,5);
          if(start>=localMinute)return true;
          if(!chatConfig?.enabled)return false;
          const startMs=Date.parse(start+':00-03:00');
          const closeMs=startMs+(Number(chatConfig.duration_minutes||50)+Number(chatConfig.close_after||0))*60000;
          return Number.isFinite(startMs)&&Date.now()<closeMs;
        })||null;
        return json({ok:true,reservation:reservation||null,reservations:(candidates.results||[]).filter(r=>{const start=Date.parse(String(r.activity_date)+"T"+String(r.start_time).slice(0,5)+":00-03:00");return Number.isFinite(start)&&Date.now()<=start+(Number(chatConfig?.duration_minutes||50)+Number(chatConfig?.close_after||0))*60000}),chatSettings:{enabled:!!chatConfig?.enabled,openBeforeMinutes:Number(chatConfig?.open_before??30),closeAfterMinutes:Number(chatConfig?.close_after??120),durationMinutes:Number(chatConfig?.duration_minutes??50)},source:"d1",evoRequestsMade:0});
      }

      // Chat da Aula — sem chamadas à EVO. A reserva e a autorização são validadas a cada ação.
      if(url.pathname==="/class-chat"||url.pathname==="/admin/class-chat"){
        const admin=url.pathname.startsWith("/admin/");
        const unit=String(url.searchParams.get("unit")||"bike");
        if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        await env.DB.batch([
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_settings(unit TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 0,test_member_id TEXT,open_before INTEGER NOT NULL DEFAULT 30,close_after INTEGER NOT NULL DEFAULT 120,duration_minutes INTEGER NOT NULL DEFAULT 50,reveal_names INTEGER NOT NULL DEFAULT 0,ban_days INTEGER NOT NULL DEFAULT 3)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_consents(unit TEXT NOT NULL,session_id TEXT NOT NULL,member_id TEXT NOT NULL,accepted_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,session_id,member_id))"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,session_id TEXT NOT NULL,member_id TEXT NOT NULL,slot_number INTEGER NOT NULL,content TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,deleted INTEGER NOT NULL DEFAULT 0)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_reports(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,session_id TEXT NOT NULL,message_id INTEGER NOT NULL,reporter_id TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_bans(unit TEXT NOT NULL,member_id TEXT NOT NULL,expires_at TEXT NOT NULL,reason TEXT,PRIMARY KEY(unit,member_id))"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_name_preferences(unit TEXT NOT NULL,member_id TEXT NOT NULL,show_name INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(unit,member_id))"),
          env.DB.prepare("CREATE TABLE IF NOT EXISTS class_chat_presence(unit TEXT NOT NULL,session_id TEXT NOT NULL,member_id TEXT NOT NULL,last_seen_at INTEGER NOT NULL,PRIMARY KEY(unit,session_id,member_id))")
        ]);
        const config=(await env.DB.prepare("SELECT * FROM class_chat_settings WHERE unit=?").bind(unit).first())||{enabled:0,test_member_id:null,open_before:30,close_after:120,duration_minutes:50,reveal_names:0,ban_days:3};
        const body=request.method==="GET"?{}:await request.json().catch(()=>({}));
        if(admin){
          const cookie=String(request.headers.get("x-clubpop-admin-cookie")||"");
          if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
          const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store"});
          const auth=await ar.json().catch(()=>({}));
          if(!ar.ok||auth.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
          if(request.method==="GET"){
            const reports=await env.DB.prepare("SELECT r.id,r.session_id,r.message_id,r.reason,r.status,r.created_at,m.content,m.slot_number FROM class_chat_reports r LEFT JOIN class_chat_messages m ON m.id=r.message_id WHERE r.unit=? ORDER BY r.id DESC LIMIT 50").bind(unit).all();
            return json({ok:true,config,reports:reports.results||[],evoRequestsMade:0});
          }
          if(request.method!=="POST")return json({ok:false,error:"METODO_INVALIDO"},405);
          if(body.action==="settings"){
            const flag=x=>x===true||x===1?1:0;
            const int=(x,min,max,fallback)=>Number.isInteger(Number(x))&&Number(x)>=min&&Number(x)<=max?Number(x):fallback;
            await env.DB.prepare("INSERT INTO class_chat_settings(unit,enabled,test_member_id,open_before,close_after,duration_minutes,reveal_names,ban_days) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(unit) DO UPDATE SET enabled=excluded.enabled,test_member_id=excluded.test_member_id,open_before=excluded.open_before,close_after=excluded.close_after,duration_minutes=excluded.duration_minutes,reveal_names=excluded.reveal_names,ban_days=excluded.ban_days").bind(unit,flag(body.enabled),String(body.test_member_id||"").trim().slice(0,50),int(body.open_before,0,1440,30),int(body.close_after,0,360,120),int(body.duration_minutes,15,180,50),flag(body.reveal_names),int(body.ban_days,1,30,3)).run();
            return json({ok:true,saved:true});
          }
          if(body.action==="moderate"){
            const report=await env.DB.prepare("SELECT * FROM class_chat_reports WHERE id=? AND unit=?").bind(Number(body.report_id),unit).first();
            if(!report)return json({ok:false,error:"DENUNCIA_NAO_ENCONTRADA"},404);
            if(!["dismiss","delete","ban"].includes(body.decision))return json({ok:false,error:"ACAO_INVALIDA"},400);
            if(body.decision!=="dismiss"){
              const msg=await env.DB.prepare("SELECT member_id FROM class_chat_messages WHERE id=? AND unit=?").bind(report.message_id,unit).first();
              if(!msg)return json({ok:false,error:"MENSAGEM_NAO_ENCONTRADA"},404);
              await env.DB.prepare("UPDATE class_chat_messages SET deleted=1 WHERE id=? AND unit=?").bind(report.message_id,unit).run();
              if(body.decision==="ban"){
                const until=new Date(Date.now()+Number(config.ban_days)*86400000).toISOString();
                await env.DB.prepare("INSERT INTO class_chat_bans(unit,member_id,expires_at,reason) VALUES(?,?,?,?) ON CONFLICT(unit,member_id) DO UPDATE SET expires_at=excluded.expires_at,reason=excluded.reason").bind(unit,msg.member_id,until,"Infração confirmada").run();
              }
            }
            await env.DB.prepare("UPDATE class_chat_reports SET status=? WHERE id=? AND unit=?").bind(body.decision,report.id,unit).run();
            return json({ok:true});
          }
          return json({ok:false,error:"ACAO_INVALIDA"},400);
        }
        if(!["GET","POST"].includes(request.method))return json({ok:false,error:"METODO_INVALIDO"},405);
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const id=String(unit==="gym"?member.gym_client_id||"":member.evo_member_id||"");
        const sid=String(request.method==="GET"?url.searchParams.get("session_id"):body.session_id||"");
        if(!id||!sid||sid.length>100)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const reservation=await env.DB.prepare("SELECT session_id,slot_number,activity_date,start_time,member_name FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? AND evo_member_id=? AND removed=0 AND (status IS NULL OR lower(status) NOT IN ('cancelled','canceled','cancelado','cancelada')) LIMIT 1").bind(unit,sid,id).first();
        if(!reservation)return json({ok:false,error:"RESERVA_NAO_ENCONTRADA"},403);
        const isTester=!!config.test_member_id&&String(config.test_member_id)===id;
        if(!config.enabled&&!isTester)return json({ok:false,error:"CHAT_DESATIVADO"},403);
        const startMs=Date.parse(reservation.activity_date+"T"+reservation.start_time+":00-03:00");
        if(!Number.isFinite(startMs))return json({ok:false,error:"HORARIO_INVALIDO"},400);
        const now=Date.now();
        if(now>startMs+(Number(config.duration_minutes)+Number(config.close_after))*60000)return json({ok:false,error:"CHAT_ENCERRADO"},403);
        if(!isTester&&now<startMs-Number(config.open_before)*60000)return json({ok:false,error:"CHAT_AINDA_NAO_ABERTO"},403);
        const ban=await env.DB.prepare("SELECT expires_at FROM class_chat_bans WHERE unit=? AND member_id=?").bind(unit,id).first();
        if(ban&&Date.parse(ban.expires_at)>now)return json({ok:false,error:"ACESSO_SUSPENSO"},403);
        const consent=await env.DB.prepare("SELECT accepted_at FROM class_chat_consents WHERE unit=? AND session_id=? AND member_id=?").bind(unit,sid,id).first();
        const namePref=await env.DB.prepare("SELECT show_name FROM class_chat_name_preferences WHERE unit=? AND member_id=?").bind(unit,id).first();
        const base={ok:true,unit,session_id:sid,slot_number:reservation.slot_number,show_name:!!namePref?.show_name,accepted:!!consent,expires_at:new Date(startMs+(Number(config.duration_minutes)+Number(config.close_after))*60000).toISOString(),evoRequestsMade:0};
        if(request.method==="GET"){
          if(consent)await env.DB.prepare("INSERT INTO class_chat_presence(unit,session_id,member_id,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(unit,session_id,member_id) DO UPDATE SET last_seen_at=excluded.last_seen_at").bind(unit,sid,id,now).run();
          const presence=await env.DB.prepare("SELECT COUNT(*) total FROM class_chat_presence WHERE unit=? AND session_id=? AND last_seen_at>=?").bind(unit,sid,now-25000).first();
          if(!consent)return json({...base,online_count:Number(presence?.total||0),messages:[]});
          const messages=await env.DB.prepare("SELECT m.id,m.slot_number,m.content,m.created_at,m.member_id,CASE WHEN m.member_id='staff:admin' THEN 'Administrador' WHEN m.member_id LIKE 'staff:%' THEN 'Professor' WHEN p.show_name=1 THEN s.member_name ELSE NULL END AS display_name FROM class_chat_messages m LEFT JOIN checkin_reservation_snapshots s ON s.unit=m.unit AND s.session_id=m.session_id AND s.evo_member_id=m.member_id AND s.removed=0 LEFT JOIN class_chat_name_preferences p ON p.unit=m.unit AND p.member_id=m.member_id WHERE m.unit=? AND m.session_id=? AND m.deleted=0 ORDER BY m.id DESC LIMIT 60").bind(unit,sid).all();
          return json({...base,online_count:Number(presence?.total||0),messages:(messages.results||[]).reverse().map(x=>({id:x.id,slot_number:x.slot_number,content:x.content,created_at:x.created_at,mine:x.member_id===id,display_name:x.display_name}))});
        }
        if(body.action==="leave"){
          await env.DB.prepare("DELETE FROM class_chat_presence WHERE unit=? AND session_id=? AND member_id=?").bind(unit,sid,id).run();
          return json({ok:true,left:true});
        }
        if(body.action==="accept"){
          if(body.accepted!==true)return json({ok:false,error:"ACEITE_OBRIGATORIO"},400);
          await env.DB.prepare("INSERT OR IGNORE INTO class_chat_consents(unit,session_id,member_id) VALUES(?,?,?)").bind(unit,sid,id).run();
          return json({...base,accepted:true});
        }
        if(!consent)return json({ok:false,error:"ACEITE_OBRIGATORIO"},403);
        if(body.action==="name-preference"){
          if(typeof body.show_name!=="boolean")return json({ok:false,error:"PREFERENCIA_INVALIDA"},400);
          await env.DB.prepare("INSERT INTO class_chat_name_preferences(unit,member_id,show_name) VALUES(?,?,?) ON CONFLICT(unit,member_id) DO UPDATE SET show_name=excluded.show_name").bind(unit,id,body.show_name?1:0).run();
          return json({ok:true,show_name:body.show_name});
        }
        if(body.action==="send"){
          const content=String(body.content||"").trim();
          if(!content||content.length>500)return json({ok:false,error:"MENSAGEM_INVALIDA"},400);
          const last=await env.DB.prepare("SELECT created_at FROM class_chat_messages WHERE unit=? AND session_id=? AND member_id=? ORDER BY id DESC LIMIT 1").bind(unit,sid,id).first();
          if(last&&now-Date.parse(String(last.created_at).replace(" ","T")+"Z")<3000)return json({ok:false,error:"AGUARDE_ANTES_DE_ENVIAR"},429);
          await env.DB.prepare("INSERT INTO class_chat_messages(unit,session_id,member_id,slot_number,content) VALUES(?,?,?,?,?)").bind(unit,sid,id,reservation.slot_number,content).run();
          return json({ok:true,sent:true});
        }
        if(body.action==="report"){
          const msg=await env.DB.prepare("SELECT id,member_id FROM class_chat_messages WHERE id=? AND unit=? AND session_id=? AND deleted=0").bind(Number(body.message_id),unit,sid).first();
          if(!msg||msg.member_id===id)return json({ok:false,error:"MENSAGEM_INVALIDA"},400);
          const reason=String(body.reason||"Conduta inadequada").trim().slice(0,250);
          await env.DB.prepare("INSERT INTO class_chat_reports(unit,session_id,message_id,reporter_id,reason) VALUES(?,?,?,?,?)").bind(unit,sid,msg.id,id,reason).run();
          return json({ok:true,reported:true});
        }
        return json({ok:false,error:"ACAO_INVALIDA"},400);
      }

      // Snapshot de reservas já obtidas pela Tela de Check-in. Nunca consulta a EVO.
      if(url.pathname==="/checkin-snapshot"&&["GET","POST"].includes(request.method)){
        const secret=String(env.CLUBPOP_CHECKIN_SYNC_TOKEN||"");
        const provided=String(request.headers.get("Authorization")||"").replace(/^Bearer /i,"");
        let authorized=!!secret&&!!provided&&secret.length===provided.length;
        if(authorized){const enc=new TextEncoder(),aa=enc.encode(secret),bb=enc.encode(provided);let mismatch=0;for(let i=0;i<aa.length;i++)mismatch|=aa[i]^(bb[i]||0);authorized=mismatch===0;}
        if(!authorized){
          const ck=request.headers.get('x-clubpop-admin-cookie')||'';
          if(!ck)return json({ok:false,error:'NAO_AUTORIZADO'},401);
          const vr=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:ck,Accept:'application/json'}}),vd=await vr.json().catch(()=>({}));
          const requested=request.method==='POST'?(await request.clone().json().catch(()=>({}))).unit:url.searchParams.get('unit');
          authorized=vr.ok&&vd.authenticated&&(vd.role==='admin'||(vd.role==='reception'&&vd.units?.includes(requested)&&vd.permissions?.includes('/tela-checkin.html')));
          if(!authorized)return json({ok:false,error:'NAO_AUTORIZADO'},403);
        }
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS checkin_reservation_snapshots (unit TEXT NOT NULL,session_id TEXT NOT NULL,activity_date TEXT NOT NULL,start_time TEXT NOT NULL,activity_name TEXT,slot_number INTEGER NOT NULL,evo_member_id TEXT,member_name TEXT,removed INTEGER NOT NULL DEFAULT 0,status TEXT,checked_in INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,session_id,slot_number))").run();
        if(request.method==="GET"){
          const unit=String(url.searchParams.get("unit")||""),date=String(url.searchParams.get("date")||""),time=String(url.searchParams.get("time")||"");
          const slot=Number(url.searchParams.get("slot"));
          if(!["bike","gym"].includes(unit)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)||!Number.isInteger(slot)||slot<1||slot>200)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
          const result=await env.DB.prepare("SELECT unit,session_id,activity_date,start_time,slot_number,evo_member_id,member_name,removed,status,checked_in,updated_at FROM checkin_reservation_snapshots WHERE unit=? AND activity_date=? AND substr(start_time,1,5)=? AND slot_number=? ORDER BY updated_at DESC LIMIT 1").bind(unit,date,time,slot).first();
          return json({ok:true,source:"d1",evoRequestsMade:0,reservation:result||null});
        }
        const body=await request.json().catch(()=>null),unit=body?.unit,date=body?.date,session=body?.session,rows=body?.enrollments;
        const sid=String(session?.idActivitySession||'');
        let snapshot,time;
        try{
          await ensureReservationSchema(env.DB);
          time=reservationTime(session?.startTime);
          const observedAt=body.observedAt||Date.now();snapshot=await saveReservationSnapshot(env.DB,{unit,sessionId:sid,date,time,name:session?.name,rows,observedAt});if(!snapshot.superseded)await saveProspectReservationSnapshot(env.DB,{unit,sessionId:sid,date,time,name:session?.name,rows,observedAt});
        }catch(error){return json({ok:false,error:String(error.message||error)},422)}
        // O Check-in já consultou a EVO: reaproveitar o professor confirmado,
        // sem nova requisição e sem alterar aulas concluídas.
        const instructor=String(session?.instructor||"").trim().slice(0,160);
        let teacherAgendaUpdated=false;
        if(instructor&&!snapshot.superseded){try{
          const result=await env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,instructor_name,synced_at) VALUES(?,?,?,?,?,'scheduled',0,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,instructor_name=excluded.instructor_name,synced_at=CURRENT_TIMESTAMP WHERE evo_attendance_sessions.status='scheduled'").bind(unit,sid,date,time,String(session.name||"").slice(0,160),instructor).run();
          teacherAgendaUpdated=!!result.meta?.changes;
        }catch(error){console.warn("snapshot_teacher_metadata_failed",String(error.message||error))}}
        return json({ok:true,source:"d1",...snapshot,evoRequestsMade:0,teacherAgendaUpdated,teacherInstructorFound:!!instructor});
      }

      if(url.pathname==="/checkin-birthday-flags"&&request.method==="POST"){
       const b=await request.json().catch(()=>({})),unit=b.unit;
       if(!["bike","gym"].includes(unit)||!Array.isArray(b.ids)||b.ids.length>200)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
       const ids=[...new Set(b.ids.map(x=>String(x)).filter(x=>/^\d+$/.test(x)))],found=[];
       for(const id of ids){const p=await env.DB.prepare("SELECT 1 ok FROM evo_member_master WHERE unit=? AND evo_member_id=? AND strftime('%m-%d',COALESCE(json_extract(personal_json,'$.birthDate'),json_extract(personal_json,'$.dateBirth'),json_extract(raw_json,'$.birthDate')))=strftime('%m-%d',date('now','-3 hours')) LIMIT 1").bind(unit,id).first();if(p)found.push(id)}
       return json({ok:true,ids:found});
      }
      if(url.pathname==="/admin/chatpro-config")return await chatproAdminConfig(request,env,url,json);

            // ADMIN - CONFIGURACAO EVO POR UNIDADE (FASE 0)
      // =====================================================
      if ((request.method === "GET" || request.method === "PUT" || request.method === "POST") && url.pathname === "/admin/evo-config") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40); if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_EVO_NAO_SUPORTADA"},400);
        if(request.method==="GET"){
          const row=await env.DB.prepare("SELECT unit,dns,token,expires_at,enabled,updated_at FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first();
          return json({ok:true,unit,configured:!!(row?.dns&&row?.token),dns:row?.dns||"",expiresAt:row?.expires_at||"",hasToken:!!row?.token,enabled:row?!!row.enabled:false,updatedAt:row?.updated_at||null});
        }
        if(request.method==="PUT"){
          const b=await readJson(request),dns=String(b.dns||"").trim(),expiresAt=String(b.expiresAt||"").trim(),token=String(b.token||"").trim();
          if(!dns||!expiresAt)return json({ok:false,error:"DNS_E_VALIDADE_OBRIGATORIOS"},400);
          if(!validEvoExpiry(expiresAt))return json({ok:false,error:"EVO_VALIDADE_INVALIDA"},400);
          const old=await env.DB.prepare("SELECT token FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first();
          const finalToken=token||String(old?.token||"");
          if(!finalToken)return json({ok:false,error:"TOKEN_OBRIGATORIO"},400);
          await env.DB.prepare("INSERT INTO evo_unit_config(unit,dns,token,expires_at,enabled,updated_at) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET dns=excluded.dns,token=excluded.token,expires_at=excluded.expires_at,enabled=1,updated_at=CURRENT_TIMESTAMP").bind(unit,dns,finalToken,expiresAt).run();
          return json({ok:true,unit,configured:true,dns,expiresAt,hasToken:true,enabled:true});
        }
        if(request.method==="POST"){
          const row=await getEvoConfig(env,unit);
          const auth="Basic "+btoa(String(row.dns)+":"+String(row.token));
          const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); const er=await fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+encodeURIComponent(date)+"&showFullWeek=false&take=1",{headers:{Authorization:auth,Accept:"application/json"}});
          if(!er.ok)return json({ok:false,error:"EVO_CREDENCIAIS_RECUSADAS",status:er.status},er.status);
          const ed=await er.json().catch(()=>[]),items=Array.isArray(ed)?ed:(ed?.items||ed?.data||[]);
          return json({ok:true,status:"connected",unit,count:items.length,message:"Conexao EVO confirmada diretamente pela configuracao da unidade, sem cache."});
        }
      }


      // =====================================================
      // POP FIT - ATIVIDADES E EVOLUCAO (D1 ONLY)
      // =====================================================
      if(url.pathname==="/member/pop-fit"){
        const member=await authenticatedMember(request,env);
        if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const base=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id,first_name,last_name FROM members WHERE id=? LIMIT 1").bind(member.id).first();
        if(!base)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS pop_fit_entries(member_id INTEGER NOT NULL,unit TEXT NOT NULL,attendance_key TEXT NOT NULL,weight REAL,height REAL,calories INTEGER,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(member_id,unit,attendance_key))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS pop_fit_images(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,scope TEXT NOT NULL,image_data TEXT NOT NULL,period_label TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS pop_fit_manual_activities(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,activity_name TEXT NOT NULL,activity_date TEXT NOT NULL,start_time TEXT,calories INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS pop_fit_profile(member_id INTEGER PRIMARY KEY,height REAL,initial_weight REAL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const scopeRaw=String(url.searchParams.get("scope")||"bike").toLowerCase(),scope=["bike","gym","club"].includes(scopeRaw)?scopeRaw:"bike";
        const ids={bike:base.evo_member_id?String(base.evo_member_id):null,gym:base.gym_client_id?String(base.gym_client_id):null};
        if(request.method==="GET"){
          const action=String(url.searchParams.get("action")||"activities");
          if(action==="profile"){const p=await env.DB.prepare("SELECT height,initial_weight FROM pop_fit_profile WHERE member_id=? LIMIT 1").bind(base.id).first();return json({ok:true,source:"d1",evoRequestsMade:0,profile:{height:p?.height??null,initialWeight:p?.initial_weight??null}})}
          if(action==="images"){
            const q=await env.DB.prepare("SELECT id,scope,image_data,period_label,created_at FROM pop_fit_images WHERE member_id=? AND scope=? ORDER BY id DESC LIMIT 3").bind(base.id,scope).all();
            return json({ok:true,source:"d1",evoRequestsMade:0,images:q.results||[]});
          }
          if(action==="manual-activities"){
            const m=String(url.searchParams.get("month")||"2026-10");
            if(m!=="2026-09"&&m!=="2026-10")return json({ok:false,error:"PERIODO_NAO_DISPONIVEL"},400);
            const q=await env.DB.prepare("SELECT id,activity_name,activity_date,start_time,calories FROM pop_fit_manual_activities WHERE member_id=? AND substr(activity_date,1,7)=? ORDER BY activity_date DESC,start_time DESC,id DESC").bind(base.id,m).all();
            return json({ok:true,source:"d1",evoRequestsMade:0,activities:q.results||[]});
          }
          const month=String(url.searchParams.get("month")||"2026-10");
          if(!["2026-09","2026-10"].includes(month))return json({ok:false,error:"PERIODO_NAO_DISPONIVEL"},400);
          const units=scope==="club"?["bike","gym"]:[scope],rows=[];
          for(const u of units){
            if(!ids[u])continue;
            const q=await env.DB.prepare("SELECT a.attendance_key,a.attendance_date,a.start_time,a.activity_name,a.id_activity_session,p.weight,p.height,p.calories,p.updated_at FROM evo_member_attendance a LEFT JOIN pop_fit_entries p ON p.member_id=? AND p.unit=a.unit AND p.attendance_key=a.attendance_key WHERE a.unit=? AND a.evo_member_id=? AND substr(a.attendance_date,1,7)=? ORDER BY a.attendance_date DESC,a.start_time DESC").bind(base.id,u,ids[u],month).all();
            for(const x of q.results||[])rows.push({...x,unit:u});
          }
          rows.sort((a,b)=>String(b.attendance_date+" "+(b.start_time||"")).localeCompare(String(a.attendance_date+" "+(a.start_time||""))));
          return json({ok:true,source:"d1",evoRequestsMade:0,scope,month,student:{firstName:base.first_name||"Aluno",lastName:base.last_name||""},linked:{bike:!!ids.bike,gym:!!ids.gym},activities:rows});
        }
        if(request.method==="PUT"){
          const b=await readJson(request),unit=String(b.unit||"").toLowerCase(),key=String(b.attendanceKey||"");
          if(!["bike","gym"].includes(unit)||!key||!ids[unit])return json({ok:false,error:"ATIVIDADE_INVALIDA"},400);
          const exists=await env.DB.prepare("SELECT 1 ok FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_key=? LIMIT 1").bind(unit,ids[unit],key).first();
          if(!exists)return json({ok:false,error:"ATIVIDADE_NAO_ENCONTRADA"},404);
          const num=(v,min,max)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):NaN);
          const weight=num(b.weight,20,350),calories=num(b.calories,0,5000);const old=await env.DB.prepare("SELECT height FROM pop_fit_entries WHERE member_id=? AND unit=? AND attendance_key=? LIMIT 1").bind(base.id,unit,key).first(),height=old?.height??null;
          if([weight,height,calories].some(Number.isNaN))return json({ok:false,error:"VALOR_INVALIDO"},400);
          await env.DB.prepare("INSERT INTO pop_fit_entries(member_id,unit,attendance_key,weight,height,calories,updated_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(member_id,unit,attendance_key) DO UPDATE SET weight=excluded.weight,height=excluded.height,calories=excluded.calories,updated_at=CURRENT_TIMESTAMP").bind(base.id,unit,key,weight,height,calories).run();
          await audit(env,"MEMBER",String(base.id),"POP_FIT_EDITED","POP_FIT_ENTRY",key,{unit});
          return json({ok:true,saved:true,source:"d1",evoRequestsMade:0});
        }
        if(request.method==="POST"){
          const b=await readJson(request);
          if(b.action==="share-click"){
            if(!["bike","gym","club"].includes(scopeRaw)||(scope!=="club"&&!ids[scope]))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
            const imageId=Number(b.imageId);
            if(!Number.isSafeInteger(imageId)||imageId<1)return json({ok:false,error:"IMAGEM_INVALIDA"},400);
            const owned=await env.DB.prepare("SELECT id FROM pop_fit_images WHERE id=? AND member_id=? AND scope=?").bind(imageId,base.id,scope).first();
            if(!owned)return json({ok:false,error:"IMAGEM_NAO_ENCONTRADA"},404);
            await audit(env,"MEMBER",String(base.id),"POP_FIT_SHARE_CLICKED","POP_FIT_IMAGE",String(imageId),{unit:scope});
            await clubMissionWhatsappEvent(env,base,scope,"share_clicked");
            return json({ok:true,source:"d1",evoRequestsMade:0});
          }
          if(String(b.action||"")==="save-profile"){const num=(v,min,max)=>v===null||v===undefined||v===""?null:(Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):NaN),height=num(b.height,0.8,2.5),initialWeight=num(b.initialWeight,20,350);if([height,initialWeight].some(Number.isNaN))return json({ok:false,error:"VALOR_INVALIDO"},400);await env.DB.prepare("INSERT INTO pop_fit_profile(member_id,height,initial_weight,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(member_id) DO UPDATE SET height=excluded.height,initial_weight=COALESCE(pop_fit_profile.initial_weight,excluded.initial_weight),updated_at=CURRENT_TIMESTAMP").bind(base.id,height,initialWeight).run();const p=await env.DB.prepare("SELECT height,initial_weight FROM pop_fit_profile WHERE member_id=? LIMIT 1").bind(base.id).first();return json({ok:true,saved:true,source:"d1",evoRequestsMade:0,profile:{height:p?.height??null,initialWeight:p?.initial_weight??null}})}
          if(String(b.action||"")==="add-manual-activity"){
            const name=String(b.activityName||"").trim().slice(0,60),date=String(b.activityDate||""),time=String(b.startTime||"").trim(),cal=b.calories===""||b.calories==null?null:Number(b.calories);
            if(!name||date.length!==10||(date.slice(0,7)!=="2026-09"&&date.slice(0,7)!=="2026-10"))return json({ok:false,error:"ATIVIDADE_INVALIDA"},400);
            if(cal!==null&&(!Number.isFinite(cal)||cal<0||cal>5000))return json({ok:false,error:"CALORIAS_INVALIDAS"},400);
            await env.DB.prepare("INSERT INTO pop_fit_manual_activities(member_id,activity_name,activity_date,start_time,calories) VALUES(?,?,?,?,?)").bind(base.id,name,date,time||null,cal).run();
            return json({ok:true,saved:true,source:"d1",evoRequestsMade:0});
          }
          if(String(b.action||"")==="save-image"){
            const image=String(b.imageData||"");
            if(!/^data:image\/jpeg;base64,/.test(image)||image.length>1600000)return json({ok:false,error:"IMAGEM_INVALIDA_OU_GRANDE"},400);
            const inserted=await env.DB.prepare("INSERT INTO pop_fit_images(member_id,scope,image_data,period_label,created_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").bind(base.id,scope,image,String(b.periodLabel||"").slice(0,80)).run();
            await audit(env,"MEMBER",String(base.id),"POP_FIT_IMAGE_GENERATED","POP_FIT_IMAGE",String(inserted.meta.last_row_id),{unit:scope});
            await clubMissionWhatsappEvent(env,base,scope,"image_generated");
            await env.DB.prepare("DELETE FROM pop_fit_images WHERE member_id=? AND scope=? AND id NOT IN (SELECT id FROM pop_fit_images WHERE member_id=? AND scope=? ORDER BY id DESC LIMIT 3)").bind(base.id,scope,base.id,scope).run();
            const q=await env.DB.prepare("SELECT id,scope,image_data,period_label,created_at FROM pop_fit_images WHERE member_id=? AND scope=? ORDER BY id DESC LIMIT 3").bind(base.id,scope).all();
            return json({ok:true,saved:true,imageId:inserted.meta.last_row_id,kept:3,images:q.results||[],source:"d1",evoRequestsMade:0});
          }
          return json({ok:false,error:"ACAO_INVALIDA"},400);
        }
        return json({ok:false,error:"METODO_NAO_PERMITIDO"},405);
      }

      // =====================================================
      // LOGOUT
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/logout"
      ) {
        const token = bearer(request);

        if (token) {
          const tokenHash = await sha256(token);

          await env.DB.prepare(`
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = ?
              AND revoked_at IS NULL
          `).bind(tokenHash).run();
        }

        return json({
          ok: true,
        });
      }


      // =====================================================
      // CLUB POP CONTENT STORE (D1)
      // =====================================================
      if(url.pathname==="/partner-daily-redemption"){
 const member=await authenticatedMember(request,env);
 if(!member)return json({ok:false,error:"SESSAO_INVALIDA"},401);
 const unit=(url.searchParams.get("unit")||"bike").toLowerCase();
 if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_daily_redemptions(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,partner_name TEXT NOT NULL,benefit_title TEXT NOT NULL,local_date TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,local_date))").run();
 const contentRow=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
 const benefits=JSON.parse(contentRow?.content_json||"{}").benefits||[];
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const memberId=String(member.id);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_once_redemptions(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,partner_name TEXT NOT NULL,benefit_title TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id))").run();
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_code_vouchers(benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,used_at TEXT,PRIMARY KEY(benefit_id,unit,member_id))").run();
 if(request.method==="GET"&&url.searchParams.get("eligibility")==="1"){
  const offers=benefits.filter(b=>String(b.unit||"bike").toLowerCase()===unit&&b.status==="Ativo");
  const needsContracts=offers.some(b=>["active","specific"].includes(String(b.partnerVoucher?.eligibility||"everyone")));
  let contracts=[];
  if(needsContracts){
   const evoId=unit==="bike"?member.evo_member_id:(await env.DB.prepare("SELECT COALESCE(m.gym_client_id,g.gym_client_id) AS evo_id FROM members m LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE m.id=? LIMIT 1").bind(member.id).first())?.evo_id;
   if(evoId)contracts=(await env.DB.prepare("SELECT id_membership,id_member_membership FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND lower(COALESCE(membership_status,'')) IN ('active','1') AND (end_date IS NULL OR date(end_date)>=?) AND (cancel_date IS NULL OR date(cancel_date)>?)").bind(unit,String(evoId),date,date).all()).results||[];
  }
  return json({ok:true,eligibility:offers.map(b=>{
   const rule=String(b.partnerVoucher?.eligibility||"everyone");
   const allowed=String(b.partnerVoucher?.eligibleContracts||"").split(",").map(x=>x.trim()).filter(Boolean);
   const reason=rule==="everyone"?null:!contracts.length?"CONTRATO_ATIVO_NAO_ENCONTRADO":rule==="specific"&&(!allowed.length||!contracts.some(c=>allowed.includes(String(c.id_membership))||allowed.includes(String(c.id_member_membership))))?"PLANO_NAO_ELEGIVEL":null;
   return {benefitId:String(b.id),eligible:!reason,reason};
  })});
 }
 if(request.method==="GET"&&url.searchParams.get("codes")==="1"){
  const rows=await env.DB.prepare("SELECT benefit_id,code,created_at,used_at FROM partner_code_vouchers WHERE unit=? AND member_id=?").bind(unit,memberId).all();
  return json({ok:true,codes:rows.results||[]});
 }
 if(request.method==="GET"){
  const rows=await env.DB.prepare("SELECT benefit_id,used_at FROM partner_daily_redemptions WHERE member_id=? AND unit=? AND local_date=?").bind(memberId,unit,date).all();
  const once=await env.DB.prepare("SELECT benefit_id,used_at FROM partner_once_redemptions WHERE member_id=? AND unit=?").bind(memberId,unit).all();
  return json({ok:true,used:rows.results||[],usedOnce:once.results||[]});
 }
 if(request.method!=="POST")return json({ok:false,error:"METODO_NAO_PERMITIDO"},405);
 const body=await readJson(request);
 const benefit=benefits.find(x=>String(x.id)===String(body?.benefitId)&&String(x.unit||"bike").toLowerCase()===unit);
 if(!benefit||benefit.status!=="Ativo"||!["daily","once"].includes(benefit.partnerVoucher?.frequency)||!["onsite","code"].includes(benefit.partnerVoucher?.redemptionMode))return json({ok:false,error:"BENEFICIO_INDISPONIVEL"},400);
 if((benefit.start&&benefit.start>date)||(benefit.end&&benefit.end<date))return json({ok:false,error:"FORA_DA_VALIDADE"},400);
 const eligibility=String(benefit.partnerVoucher?.eligibility||"everyone");
 if(eligibility==="active"||eligibility==="specific"){
  const evoId=unit==="bike"?member.evo_member_id:(await env.DB.prepare("SELECT COALESCE(m.gym_client_id,g.gym_client_id) AS evo_id FROM members m LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE m.id=? LIMIT 1").bind(member.id).first())?.evo_id;
  if(!evoId)return json({ok:false,error:"CONTRATO_ATIVO_NAO_ENCONTRADO"},403);
  const contracts=(await env.DB.prepare("SELECT id_membership,id_member_membership,membership_status,end_date,cancel_date FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND lower(COALESCE(membership_status,'')) IN ('active','1') AND (end_date IS NULL OR date(end_date)>=?) AND (cancel_date IS NULL OR date(cancel_date)>?)").bind(unit,String(evoId),date,date).all()).results||[];
  if(!contracts.length)return json({ok:false,error:"CONTRATO_ATIVO_NAO_ENCONTRADO"},403);
  if(eligibility==="specific"){
   const allowed=String(benefit.partnerVoucher?.eligibleContracts||"").split(",").map(x=>x.trim()).filter(Boolean);
   if(!allowed.length||!contracts.some(c=>allowed.includes(String(c.id_membership))||allowed.includes(String(c.id_member_membership))))return json({ok:false,error:"PLANO_NAO_ELEGIVEL"},403);
  }
 }
 if(benefit.partnerVoucher.redemptionMode==="code"){
  if(benefit.partnerVoucher.frequency!=="once")return json({ok:false,error:"MODALIDADE_NAO_SUPORTADA"},400);
  const previous=await env.DB.prepare("SELECT code,created_at FROM partner_code_vouchers WHERE benefit_id=? AND unit=? AND member_id=?").bind(String(benefit.id),unit,memberId).first();
  if(previous)return json({ok:true,code:previous.code,createdAt:previous.created_at,existing:true});
  const quantity=Math.max(0,Math.floor(Number(benefit.partnerVoucher.quantity||0)));
  if(!quantity)return json({ok:false,error:"VOUCHERS_ESGOTADOS"},409);
  const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  const code=Array.from(bytes,x=>alphabet[x%alphabet.length]).join("");
  const memberName=[member.first_name||member.firstName||member.name||"",member.last_name||member.lastName||""].join(" ").trim()||"Aluno Club Pop";
  const inserted=await env.DB.prepare("INSERT OR IGNORE INTO partner_code_vouchers(benefit_id,unit,member_id,member_name,code) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM partner_code_vouchers WHERE benefit_id=? AND unit=?)<?").bind(String(benefit.id),unit,memberId,memberName,code,String(benefit.id),unit,quantity).run();
  if(!inserted.meta?.changes){
   const existing=await env.DB.prepare("SELECT code,created_at FROM partner_code_vouchers WHERE benefit_id=? AND unit=? AND member_id=?").bind(String(benefit.id),unit,memberId).first();
   if(existing)return json({ok:true,code:existing.code,createdAt:existing.created_at,existing:true});
   return json({ok:false,error:"VOUCHERS_ESGOTADOS"},409);
  }
  return json({ok:true,code,createdAt:new Date().toISOString(),existing:false});
 }
 const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM partner_daily_redemptions WHERE benefit_id=? AND unit=?").bind(String(benefit.id),unit).first();
 const limit=Number(benefit.partnerVoucher?.quantity||0);
 // Daily-use offers are recurring; a one-time total stock cap does not apply to daily confirmations.
 const memberName=[member.first_name||member.firstName||member.name||"",member.last_name||member.lastName||""].join(" ").trim()||"Aluno Club Pop";
 if(benefit.partnerVoucher.frequency==="once"){
  const once=await env.DB.prepare("INSERT OR IGNORE INTO partner_once_redemptions(benefit_id,unit,member_id,member_name,partner_name,benefit_title) VALUES(?,?,?,?,?,?)").bind(String(benefit.id),unit,memberId,memberName,String(benefit.partner||""),String(benefit.title||"")).run();
  if(!once.meta?.changes)return json({ok:false,error:"JA_UTILIZADO"},409);
  return json({ok:true,usedAt:new Date().toISOString(),benefitId:String(benefit.id)});
 }
 const insert=await env.DB.prepare("INSERT OR IGNORE INTO partner_daily_redemptions(benefit_id,unit,member_id,member_name,partner_name,benefit_title,local_date) VALUES(?,?,?,?,?,?,?)").bind(String(benefit.id),unit,memberId,memberName,String(benefit.partner||""),String(benefit.title||""),date).run();
 if(!insert.meta?.changes)return json({ok:false,error:"JA_UTILIZADO_HOJE"},409);
 return json({ok:true,usedAt:new Date().toISOString(),date,benefitId:String(benefit.id)});
}
if(url.pathname==="/partner-daily-redemption/admin"){
 const ck=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
 const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
 if(!auth.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);
 await env.DB.prepare("CREATE TABLE IF NOT EXISTS partner_daily_redemptions(id INTEGER PRIMARY KEY AUTOINCREMENT,benefit_id TEXT NOT NULL,unit TEXT NOT NULL,member_id TEXT NOT NULL,member_name TEXT NOT NULL,partner_name TEXT NOT NULL,benefit_title TEXT NOT NULL,local_date TEXT NOT NULL,used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(benefit_id,unit,member_id,local_date))").run();
 const unit=url.searchParams.get("unit")==="gym"?"gym":"bike";
 const rows=await env.DB.prepare("SELECT benefit_id,member_name,partner_name,benefit_title,local_date,used_at FROM partner_daily_redemptions WHERE unit=? ORDER BY used_at DESC LIMIT 300").bind(unit).all();
 return json({ok:true,rows:rows.results||[]});
}
if(url.pathname==="/content-store"){
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_content(content_key TEXT PRIMARY KEY,content_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        if(request.method==="GET"){
          const row=await env.DB.prepare("SELECT content_json,updated_at FROM app_content WHERE content_key='club-pop' LIMIT 1").first();
          if(!row)return json({ok:true,content:null,source:"d1"});
          try{return json({ok:true,content:JSON.parse(row.content_json),updatedAt:row.updated_at,source:"d1"})}catch{return json({ok:false,error:"CONTEUDO_D1_INVALIDO"},500)}
        }
        if(request.method==="PUT"){
          const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
          const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);
          const body=await readJson(request);if(!body||typeof body!=="object"||Array.isArray(body))return json({ok:false,error:"CONTEUDO_INVALIDO"},400);
          await env.DB.prepare("INSERT INTO app_content(content_key,content_json,updated_at) VALUES('club-pop',?,CURRENT_TIMESTAMP) ON CONFLICT(content_key) DO UPDATE SET content_json=excluded.content_json,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(body)).run();
          return json({ok:true,storage:"d1"});
        }
        return json({ok:false,error:"METODO_NAO_PERMITIDO"},405);
      }

      // =====================================================
      // PROMOTION NUMBERS + MISSION REDEMPTIONS
      // =====================================================
      
if(url.pathname==="/promotion-numbers/admin/sync-batch"&&request.method==="POST"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||""),skip=Math.max(0,Number(body.skip||0)),promo=await clubContentItem(env,"promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);const accepted=new Set((promo.eligibility?.acceptedContracts||[]).map(String));if((promo.eligibility?.mode||"any")!=="active_contract"||!accepted.size)return json({ok:false,error:"PROMOCAO_SEM_CONTRATOS_ELEGIVEIS"},400);const promoUnit=(promo.unit||"bike")==="gym"?"gym":"bike",cfg=await getEvoConfig(env,promoUnit),auth="Basic "+btoa(cfg.dns+":"+cfg.token),take=25,ep="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take="+take+"&skip="+skip+"&statusMemberMembership=1&showAggregators=true&showVips=true",er=await fetch(ep,{headers:{Authorization:auth,Accept:"application/json"}});if(!er.ok)return json({ok:false,error:"EVO_CONTRATOS_HTTP_"+er.status},502);const ed=await er.json(),items=Array.isArray(ed)?ed:(ed.items||ed.data||ed.lista||ed.list||[]),eligible=[...new Map(items.filter(x=>Number(x.statusMemberMembership||1)===1&&accepted.has(String(x.idMembership))).filter(x=>Number(x.idMember)>0).map(x=>[String(x.idMember),x])).values()];let participating=0,generated=0,attendance=0,errors=[];for(const x of eligible){try{const evoId=Number(x.idMember);let member=await env.DB.prepare("SELECT * FROM members WHERE evo_member_id=? LIMIT 1").bind(evoId).first();if(!member){const parts=String(x.name||"Aluno").trim().split(/\s+/),first=parts.shift()||"Aluno",last=parts.join(" ");await env.DB.prepare("INSERT INTO members(evo_member_id,cpf_hash,first_name,last_name,status) VALUES(?,?,?,?,'ACTIVE')").bind(evoId,"evo-placeholder:"+evoId,first,last).run();member=await env.DB.prepare("SELECT * FROM members WHERE evo_member_id=? LIMIT 1").bind(evoId).first()}await evoAttendance(env,evoId,promo.start,promo.end,member.id,promoUnit);const ac=Number((await env.DB.prepare("SELECT COUNT(*) n FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ?").bind(member.id,promo.unit||"bike",promo.start,promo.end).first())?.n||0);attendance+=ac;if(ac<1)continue;participating++;const before=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN promotions pr ON pr.id=l.promotion_id WHERE pr.slug=? AND pp.member_id=? AND l.status='ACTIVE'").bind(key,member.id).first())?.n||0);await syncLuckyMember(env,member,promo);const after=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN promotions pr ON pr.id=l.promotion_id WHERE pr.slug=? AND pp.member_id=? AND l.status='ACTIVE'").bind(key,member.id).first())?.n||0);generated+=Math.max(0,after-before)}catch(e){errors.push({idMember:x.idMember,error:String(e.message||e).slice(0,160)})}}const nextSkip=items.length===take?skip+take:null;if(nextSkip==null){await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_sync_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,unit TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,participating INTEGER NOT NULL DEFAULT 0,attendance INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();const t=body.totals||{};await env.DB.prepare("INSERT INTO promotion_sync_runs(promotion_slug,unit,processed,eligible,participating,attendance,generated,errors) VALUES(?,?,?,?,?,?,?,?)").bind(key,promo.unit||"bike",Number(t.processed||0)+items.length,Number(t.eligible||0)+eligible.length,Number(t.participating||0)+participating,Number(t.attendance||0)+attendance,Number(t.generated||0)+generated,Number(t.errors||0)+errors.length).run()}return json({ok:true,promotion:{id:key,name:promo.name},batch:{skip,processed:items.length,eligible:eligible.length,participating,attendance,generated,errors},nextSkip,done:nextSkip==null})}

if(url.pathname==="/promotion-numbers/admin/generate-batch"&&request.method==="POST")return generatePromotionBatch(request,env,json);

if(url.pathname==="/promotion-review/request"&&request.method==="POST"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||"");const promo=await clubContentItem(env,"promotion",key);if(!promo)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404);await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_review_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,member_id INTEGER NOT NULL,evo_member_id INTEGER,status TEXT NOT NULL DEFAULT 'PENDING',eligibility_snapshot TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();const old=await env.DB.prepare("SELECT id,status,created_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? AND status='PENDING' ORDER BY id DESC LIMIT 1").bind(key,member.id).first();if(old)return json({ok:true,duplicate:true,request:old});const snap=JSON.stringify({memberships:member.memberships||[],requestedAt:new Date().toISOString()});await env.DB.prepare("INSERT INTO promotion_review_requests(promotion_slug,member_id,evo_member_id,status,eligibility_snapshot) VALUES(?,?,?,'PENDING',?)").bind(key,member.id,member.evo_member_id,snap).run();const row=await env.DB.prepare("SELECT id,status,created_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? ORDER BY id DESC LIMIT 1").bind(key,member.id).first();return json({ok:true,duplicate:false,request:row})}
if(url.pathname==="/promotion-review/status"&&request.method==="GET"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||"");const row=await env.DB.prepare("SELECT id,status,created_at,updated_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? ORDER BY id DESC LIMIT 1").bind(key,member.id).first();return json({ok:true,status:row?.status||null,request:row||null})}
if(url.pathname.startsWith("/promotion-review/admin/")){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_review_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,member_id INTEGER NOT NULL,evo_member_id INTEGER,status TEXT NOT NULL DEFAULT 'PENDING',eligibility_snapshot TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();if(url.pathname==="/promotion-review/admin/list"&&request.method==="GET"){const rr=await env.DB.prepare("SELECT r.id,r.promotion_slug,r.evo_member_id,r.status,r.created_at,r.updated_at,m.first_name,m.last_name FROM promotion_review_requests r JOIN members m ON m.id=r.member_id ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.id DESC").all();const requests=[];for(const x of rr.results||[]){const p=await clubContentItem(env,"promotion",x.promotion_slug);requests.push({id:x.id,promotionSlug:x.promotion_slug,promotionName:p?.name||x.promotion_slug,evoMemberId:x.evo_member_id,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at,studentName:[x.first_name,x.last_name].filter(Boolean).join(" ")})}return json({ok:true,requests})}if(url.pathname==="/promotion-review/admin/update"&&request.method==="POST"){const b=await readJson(request),id=Number(b.id),status=String(b.status||"");if(!id||!["APPROVED","REJECTED","REVERTED"].includes(status))return json({ok:false,error:"DADOS_INVALIDOS"},400);await env.DB.prepare("UPDATE promotion_review_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();return json({ok:true,id,status})}return json({ok:false,error:"ROTA_NAO_ENCONTRADA"},404)}

if(url.pathname.startsWith("/promotion-numbers/admin/")&&(request.method==="GET"||(request.method==="POST"&&["/promotion-numbers/admin/review","/promotion-numbers/admin/early-close"].includes(url.pathname)))){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||"");let promo=await clubContentItem(env,"promotion",key);if(!promo){const existing=await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(key).first();if(!existing)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404);let rules={};try{rules=JSON.parse(existing.rules_json||"{}")||{}}catch{}promo={id:key,name:existing.name,status:existing.status==="ACTIVE"?"Ativo":"Inativo",start:existing.start_at,end:existing.end_at,unit:"bike",promotionType:"lucky_number",numbersPerAttendance:+(rules.numbersPerAttendance||1),luckyNumber:{...rules,enabled:true}}}const dbp=await ensurePromotion(env,promo);if(url.pathname==="/promotion-numbers/admin/early-close-status"){const closure=await env.DB.prepare("SELECT closed_at closedAt,reason,original_end originalEnd FROM club_draw_early_closures WHERE promotion_slug=?").bind(key).first();return json({ok:true,closure:closure||null})}if(url.pathname==="/promotion-numbers/admin/early-close"&&request.method==="POST"){let role=null;try{const auth=await vr.clone().json();role=auth.role}catch{}if(role!=="admin")return json({ok:false,error:"SOMENTE_ADMINISTRADOR"},403);const body=await readJson(request);if(body.confirmation!=="ENCERRAR")return json({ok:false,error:"DIGITE_ENCERRAR_EM_MAIUSCULAS"},400);const reason=String(body.reason||"").trim();if(reason.length<10||reason.length>1000)return json({ok:false,error:"MOTIVO_OBRIGATORIO_MINIMO_10_CARACTERES"},400);const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(promo.status!=="Ativo"||String(promo.end||"").slice(0,10)<today)return json({ok:false,error:"PROMOCAO_NAO_ATIVA"},409);const actor="admin";const result=await env.DB.prepare("INSERT OR IGNORE INTO club_draw_early_closures(promotion_slug,reason,closed_by,original_end) VALUES(?,?,?,?)").bind(key,reason,actor,String(promo.end||"")).run();if(!result.meta?.changes)return json({ok:false,error:"PROMOCAO_JA_ENCERRADA"},409);await env.DB.prepare("UPDATE promotions SET status='INACTIVE',updated_at=CURRENT_TIMESTAMP WHERE slug=?").bind(key).run();return json({ok:true,closed:true})}if(url.pathname==="/promotion-numbers/admin/list"){const period=String(url.searchParams.get("period")||""),q=String(url.searchParams.get("q")||"").trim().toLowerCase();let sql="SELECT l.code,l.origin,l.issued_at,l.reference_month,l.status,m.first_name,m.last_name,m.evo_member_id,0 attendance_count,CASE WHEN l.origin='BONUS' THEN 1 ELSE 0 END bonus_count FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id WHERE l.promotion_id=? AND l.status='ACTIVE'",args=[dbp.id];if(period){sql+=" AND l.reference_month=?";args.push(period)}sql+=" ORDER BY l.reference_month,l.id";const rr=await env.DB.prepare(sql).bind(...args).all();let numbers=(rr.results||[]).map(x=>({code:x.code,origin:x.origin,issuedAt:x.issued_at,referenceMonth:x.reference_month,status:x.status,studentName:[x.first_name,x.last_name].filter(Boolean).join(" "),memberId:x.evo_member_id,attendanceCount:+(x.attendance_count||0),bonusCount:+(x.bonus_count||0)}));if(q)numbers=numbers.filter(x=>String(x.code).toLowerCase().includes(q)||String(x.studentName).toLowerCase().includes(q));return json({ok:true,promotion:{id:key,name:promo.name,status:promo.status,start:promo.start,end:promo.end},total:numbers.length,participants:new Set(numbers.map(x=>String(x.memberId))).size,periods:[...new Set(numbers.map(x=>x.referenceMonth).filter(Boolean))].sort(),numbers})}if(url.pathname==="/promotion-numbers/admin/winner"){const lucky=String(url.searchParams.get("code")||"").trim();if(!lucky)return json({ok:false,error:"NUMERO_OBRIGATORIO"},400);const row=await env.DB.prepare("SELECT l.code,l.reference_month,l.status,l.origin,m.first_name,m.last_name,m.evo_member_id,pa.occurred_at,ah.activity_name,ah.raw_json FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id LEFT JOIN attendance_history ah ON ah.attendance_key=pa.source_ref WHERE l.promotion_id=? AND l.code=? AND l.status='ACTIVE' LIMIT 1").bind(dbp.id,lucky).first();if(!row)return json({ok:true,found:false});let raw={};try{raw=JSON.parse(row.raw_json||"{}")}catch{}const luckyDay=row.occurred_at?{date:String(row.occurred_at).slice(0,10).split("-").reverse().join("/"),time:String(raw.startTime||String(row.occurred_at).slice(11,16)||"").slice(0,5)||null,activity:row.activity_name||raw.activitieName||raw.activityName||null}:null;return json({ok:true,found:true,number:{code:row.code,referenceMonth:row.reference_month,status:row.status,origin:row.origin},student:{name:[row.first_name,row.last_name].filter(Boolean).join(" "),memberId:row.evo_member_id},luckyDay})}if(url.pathname==="/promotion-numbers/admin/review-status"){const row=await env.DB.prepare("SELECT reviewed_at reviewedAt,participants,eligible,excluded,number_count numberCount,contract_synced_at contractSyncedAt FROM club_draw_reviews WHERE promotion_id=?").bind(dbp.id).first();return json({ok:true,review:row||null})}
if(url.pathname==="/promotion-numbers/admin/review"&&request.method==="POST"){const ended=promo.status==="Encerrado"||String(promo.end||"").slice(0,10)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(!ended)return json({ok:false,error:"PROMOCAO_AINDA_ATIVA"},409);const unit=promo.unit==="gym"?"gym":"bike";const latest=await env.DB.prepare("SELECT MAX(synced_at) lastSync FROM evo_member_contracts WHERE unit=?").bind(unit).first();if(!latest?.lastSync||Date.now()-Date.parse(String(latest.lastSync).replace(" ","T")+"Z")>48*3600000)return json({ok:false,error:"CONTRATOS_DESATUALIZADOS_SINCRONIZE_ANTES_DA_CONFERENCIA",lastSync:latest?.lastSync||null},409);const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const exists="EXISTS (SELECT 1 FROM evo_member_contracts ec WHERE ec.unit=? AND CAST(ec.evo_member_id AS TEXT)=CAST(m.evo_member_id AS TEXT) AND LOWER(TRIM(ec.membership_status)) IN ('active','1') AND (ec.start_date IS NULL OR SUBSTR(ec.start_date,1,10)<=?) AND (ec.end_date IS NULL OR SUBSTR(ec.end_date,1,10)>=?) AND (ec.cancel_date IS NULL OR TRIM(ec.cancel_date)=''))";const join=" FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id WHERE l.promotion_id=? AND l.status='ACTIVE'";const insert="INSERT INTO club_draw_review_numbers(promotion_id,code) SELECT ?,l.code"+join+" AND "+exists;const stats="INSERT OR REPLACE INTO club_draw_reviews(promotion_id,unit,reviewed_at,participants,eligible,excluded,number_count,contract_synced_at) SELECT ?,?,datetime('now'),(SELECT COUNT(DISTINCT pp.member_id)"+join+"),(SELECT COUNT(DISTINCT pp.member_id)"+join+" AND "+exists+"),(SELECT COUNT(DISTINCT pp.member_id)"+join+")-(SELECT COUNT(DISTINCT pp.member_id)"+join+" AND "+exists+"),(SELECT COUNT(*) FROM club_draw_review_numbers WHERE promotion_id=?),?";await env.DB.batch([env.DB.prepare("DELETE FROM club_draw_review_numbers WHERE promotion_id=?").bind(dbp.id),env.DB.prepare(insert).bind(dbp.id,dbp.id,unit,date,date),env.DB.prepare(stats).bind(dbp.id,unit,dbp.id,dbp.id,unit,date,date,dbp.id,dbp.id,unit,date,date,dbp.id,latest.lastSync)]);const row=await env.DB.prepare("SELECT reviewed_at reviewedAt,participants,eligible,excluded,number_count numberCount,contract_synced_at contractSyncedAt FROM club_draw_reviews WHERE promotion_id=?").bind(dbp.id).first();return json({ok:true,review:row,percent:100})}
if(url.pathname==="/promotion-numbers/admin/export"){const ended=String(promo.end||"").slice(0,10)<new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());if(!ended)return json({ok:false,error:"PROMOCAO_AINDA_ATIVA"},409);const review=await env.DB.prepare("SELECT reviewed_at,number_count FROM club_draw_reviews WHERE promotion_id=?").bind(dbp.id).first();if(!review)return json({ok:false,error:"CONFERENCIA_OBRIGATORIA"},409);const rr=await env.DB.prepare("SELECT code FROM club_draw_review_numbers WHERE promotion_id=?").bind(dbp.id).all();const codes=(rr.results||[]).map(x=>String(x.code));if(codes.length!==Number(review.number_count))return json({ok:false,error:"CONFERENCIA_INCONSISTENTE"},409);for(let i=codes.length-1;i>0;i--){const n=new Uint32Array(1);crypto.getRandomValues(n);const j=n[0]%(i+1);[codes[i],codes[j]]=[codes[j],codes[i]]}const csv="numero\n"+codes.map(x=>'"'+x.replaceAll('"','""')+'"').join("\n");return new Response("\uFEFF"+csv,{status:200,headers:{...cors,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=numeros-da-sorte-anonimos.csv","Cache-Control":"no-store"}})}}
if(url.pathname==="/promotion-numbers/mine"&&request.method==="GET"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||""),promo=await clubContentItem(env,"promotion",key);let dbp;if(promo){dbp=await ensurePromotion(env,promo)}else{dbp=await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(key).first();if(!dbp)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404)}const rules=(()=>{try{return JSON.parse(dbp.rules_json||"{}")||{}}catch{return {}}})(),effectivePromo=promo||{id:key,name:dbp.name,start:dbp.start_at,end:dbp.end_at,unit:"bike",numbersPerAttendance:+(rules.numbersPerAttendance||1),luckyNumber:rules},part=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=? LIMIT 1").bind(dbp.id,member.id).first(),cfg=effectivePromo.luckyNumber||{},per=+(cfg.numbersPerAttendance||effectivePromo.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=[...(cfg.milestones||[])].sort((x,y)=>x.attendance-y.attendance),ar=await env.DB.prepare("SELECT attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date>=? AND attendance_date<=? ORDER BY attendance_date").bind(member.id,effectivePromo.unit||"bike",effectivePromo.start,effectivePromo.end).all(),counts={};for(const x of(ar.results||[])){const m=String(x.attendance_date).slice(0,7);counts[m]=(counts[m]||0)+1}const cr=part?await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dbp.id,part.id).all():{results:[]},codes=cr.results||[],by={};for(const x of codes)(by[x.reference_month]??=[]).push(x);const now=new Date().toISOString().slice(0,7),months=Object.keys(counts).sort().map(month=>{const attendance=counts[month],base=attendance*per,bonuses=goals.filter(g=>attendance>=+g.attendance).map(g=>({attendance:+g.attendance,bonus:+g.bonus}));let entitled=base+bonuses.reduce((z,g)=>z+g.bonus,0);if(max>0)entitled=Math.min(entitled,max);const next=goals.find(g=>attendance<+g.attendance);return{month,status:month===now?"current":"closed",attendance,perAttendance:per,base,bonuses,entitled,nextMilestone:next?{attendance:+next.attendance,bonus:+next.bonus,missing:+next.attendance-attendance}:null,codes:by[month]||[]}});return json({ok:true,promotion:{id:key,name:effectivePromo.name},attendance:(ar.results||[]).length,total:codes.length,codes,months})}
if(['/promotion-numbers/sync','/promotion-numbers/sync-v2'].includes(url.pathname)&&request.method==='POST'){
 const body=await request.clone().json().catch(()=>({})),p=await clubContentItem(env,'promotion',String(body.promotionId||''));
 if(p?.drawAt&&Date.parse(p.drawAt)<=Date.now())return json({ok:false,error:'PROMOCAO_EM_APURACAO'},409);
}
if(url.pathname==="/promotion-numbers/sync-v2"&&request.method==="POST"){return luckyV2(request,env)}
if(url.pathname==="/promotion-numbers/sync"&&request.method==="POST"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||""),promo=await clubContentItem(env,"promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);if(!(await promotionEligible(env,member,promo)))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);await evoAttendance(env,member.evo_member_id,promo.start,promo.end,member.id,(promo.unit||"bike")==="gym"?"gym":"bike");if(promo.luckyNumber?.generationMode==="constancy"){const result=await syncLuckyConstancy(env,member,promo);return json({ok:true,attendance:result.attendance,generated:result.generated})}const dbp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dbp.id,member.id).run();const part=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=? LIMIT 1").bind(dbp.id,member.id).first(),cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||promo.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=[...(cfg.milestones||[])].sort((x,y)=>x.attendance-y.attendance),ar=await env.DB.prepare("SELECT attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date>=? AND attendance_date<=? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all(),counts={};for(const x of(ar.results||[])){const m=String(x.attendance_date).slice(0,7);counts[m]=(counts[m]||0)+1}const desired={};for(const[m,n]of Object.entries(counts)){let d=n*per;for(const g of goals)if(n>=+g.attendance)d+=+g.bonus;if(max>0)d=Math.min(d,max);desired[m]=d}const old=await env.DB.prepare("SELECT id,code,reference_month FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY id").bind(dbp.id,part.id).all(),pool=[...(old.results||[])],used=new Set(),prefix=promo.unit==="gym"?"G":"B";for(const[month,want]of Object.entries(desired).sort()){const same=pool.filter(x=>x.reference_month===month&&!used.has(x.id));same.slice(0,want).forEach(x=>used.add(x.id));let need=Math.max(0,want-same.length);for(const x of pool.filter(x=>!used.has(x.id)).slice(0,need)){const suffix=String(x.code).split("-").pop();await env.DB.prepare("UPDATE lucky_numbers SET reference_month=?,code=? WHERE id=?").bind(month,prefix+"-"+month.replace("-","")+"-"+suffix,x.id).run();used.add(x.id);need--}while(need>0){const code=prefix+"-"+month.replace("-","")+"-"+randomToken(4).toUpperCase();try{await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dbp.id,part.id,code,month,promo.unit||"bike","SYNC").run();need--}catch{}}}for(const x of pool)if(!used.has(x.id))await env.DB.prepare("UPDATE lucky_numbers SET status='INVALIDATED' WHERE id=?").bind(x.id).run();const cr=await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dbp.id,part.id).all(),codes=cr.results||[],by={};for(const x of codes)(by[x.reference_month]??=[]).push(x);const now=new Date().toISOString().slice(0,7),months=Object.keys(counts).sort().map(month=>{const attendance=counts[month],base=attendance*per,bonuses=goals.filter(g=>attendance>=+g.attendance).map(g=>({attendance:+g.attendance,bonus:+g.bonus}));let entitled=base+bonuses.reduce((z,g)=>z+g.bonus,0);if(max>0)entitled=Math.min(entitled,max);const next=goals.find(g=>attendance<+g.attendance);return{month,status:month===now?"current":"closed",attendance,perAttendance:per,base,bonuses,entitled,nextMilestone:next?{attendance:+next.attendance,bonus:+next.bonus,missing:+next.attendance-attendance}:null,codes:by[month]||[]}});return json({ok:true,promotion:{id:key,name:promo.name},attendance:(ar.results||[]).length,total:codes.length,codes,months})}
if(url.pathname==="/admin/pix-refund-check"&&request.method==="GET"){
 const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
 const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"});
 const auth=await ar.json().catch(()=>({}));
 if(!ar.ok||!["admin","reception"].includes(auth.role)||!auth.permissions?.some(p=>p==="*"||p==="/admin-resgates.html")||!Array.isArray(auth.units))return json({ok:false,error:"SEM_PERMISSAO"},403);
 const id=String(url.searchParams.get("orderId")||"");
 if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
 const order=await env.DB.prepare("SELECT id,unit,status,provider_order_id,amount_cents FROM club_pix_orders WHERE id=?").bind(id).first();
 if(!order||!auth.units.includes(order.unit))return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
 if(!order.provider_order_id||Number(order.amount_cents)<=0)return json({ok:false,error:"PIX_INEXISTENTE"},409);
 const creds=await clubPixCredentials(env,order.unit);
 if(!creds?.token)return json({ok:false,error:"MERCADOPAGO_NAO_CONFIGURADO"},503);
 let response;
 try{response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(order.provider_order_id),{headers:{Authorization:"Bearer "+creds.token,Accept:"application/json"},signal:AbortSignal.timeout(12000)})}
 catch{return json({ok:false,error:"CONSULTA_MERCADOPAGO_INDISPONIVEL"},502)}
 const state=await response.json().catch(()=>({}));
 if(!response.ok)return json({ok:false,error:"CONSULTA_MERCADOPAGO_FALHOU",providerStatus:response.status,providerCode:String(state.error||state.code||"").slice(0,80)},502);
 if(String(state.id)!==String(order.provider_order_id)||String(state.external_reference)!==id||Math.round(Number(state.total_amount)*100)!==Number(order.amount_cents))return json({ok:false,error:"PIX_NAO_CORRESPONDE_AO_PEDIDO"},409);
 const refunds=Array.isArray(state.transactions?.refunds)?state.transactions.refunds:[];
 const confirmed=state.status==="refunded"||state.status_detail==="refunded";
 const inProcess=refunds.some(r=>["processing","pending"].includes(String(r.status).toLowerCase()));
 return json({ok:true,readOnly:true,orderId:id,providerOrderId:order.provider_order_id,amountCents:order.amount_cents,localStatus:order.status,providerStatus:state.status,providerDetail:state.status_detail||null,refundConfirmed:confirmed,refundInProcess:inProcess,refunds:refunds.map(r=>({id:String(r.id||""),status:String(r.status||""),amount:r.amount||null})),message:confirmed?"Mercado Pago confirma estorno; conciliação interna pendente.":inProcess?"Estorno em processamento no Mercado Pago.":"Nenhum estorno confirmado nesta consulta. Nenhuma nova solicitação foi enviada."});
}
if(url.pathname==="/admin/pix-refund"&&request.method==="POST"){
 const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
 const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),auth=await ar.json().catch(()=>({}));
 if(!ar.ok||!["admin","reception"].includes(auth.role)||!auth.permissions?.some(p=>p==="*"||p==="/admin-resgates.html")||!Array.isArray(auth.units))return json({ok:false,error:"SEM_PERMISSAO"},403);
 const body=await request.json().catch(()=>({})),id=String(body.orderId||"");
 if(!/^[0-9a-f-]{36}$/.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);
 const order=await env.DB.prepare("SELECT * FROM club_pix_orders WHERE id=?").bind(id).first();
 if(!order||!auth.units.includes(order.unit))return json({ok:false,error:"PEDIDO_NAO_ENCONTRADO"},404);
 if(["refunded","cancelled"].includes(order.status))return json({ok:true,status:order.status,duplicate:true});
 if(!order.provider_order_id||order.amount_cents<=0)return json({ok:false,error:"PIX_INEXISTENTE"},409);
 if(["review","running","refunding"].includes(order.external_state))return json({ok:false,error:"FITCOINS_EM_CONFERENCIA"},409);
 if(order.external_state==="confirmed")return json({ok:false,error:"ESTORNE_FITCOINS_ANTES_DO_PIX"},409);
 const done=await env.DB.prepare("SELECT delivery_state FROM club_pix_fulfillment WHERE order_id=?").bind(id).first();
 if(done?.delivery_state==="completed")return json({ok:false,error:"PEDIDO_JA_ENTREGUE"},409);
 const creds=await clubPixCredentials(env,order.unit);if(!creds?.token)return json({ok:false,error:"MERCADOPAGO_NAO_CONFIGURADO"},503);
 const headers={Authorization:"Bearer "+creds.token,Accept:"application/json"};
 const get=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(order.provider_order_id),{headers});
 if(!get.ok)return json({ok:false,error:"CONSULTA_PIX_FALHOU"},502);
 const state=await get.json().catch(()=>({}));
 if(String(state.external_reference)!==id||Math.round(Number(state.total_amount)*100)!==Number(order.amount_cents))return json({ok:false,error:"PIX_NAO_CORRESPONDE_AO_PEDIDO"},409);
 let refunded=state.status==="refunded"||state.transactions?.refunds?.some(x=>x.status==="processed");
 if(!refunded){
  if(state.transactions?.refunds?.some(x=>["pending","processing"].includes(x.status)))return json({ok:true,status:"refund_pending",message:"Estorno em processamento no Mercado Pago"});
  if(state.status!=="processed")return json({ok:false,error:"PIX_NAO_PROCESSADO",providerStatus:state.status},409);
  if(!["refund_pending","paid_pending_coins","pending","approved"].includes(order.status))return json({ok:false,error:"PEDIDO_INDISPONIVEL"},409);
  if(order.status!=="refund_pending"){
   const claim=await env.DB.prepare("UPDATE club_pix_orders SET status='refund_pending' WHERE id=? AND status IN ('paid_pending_coins','pending','approved') AND external_state IN ('none','failed','refunded')").bind(id).run();
   if(claim.meta.changes!==1)return json({ok:false,error:"ESTORNO_EM_PROCESSAMENTO"},409);
  }
  let response;try{response=await fetch("https://api.mercadopago.com/v1/orders/"+encodeURIComponent(order.provider_order_id)+"/refund",{method:"POST",headers:{...headers,"X-Idempotency-Key":id+"-refund-v2","Content-Type":"application/json"}})}catch{return json({ok:false,error:"ESTORNO_REQUER_CONFERENCIA"},502)}
  const result=await response.json().catch(()=>({}));
  if(!response.ok)return json({ok:false,error:"ESTORNO_REQUER_CONFERENCIA",providerStatus:response.status,providerCode:String(result.error||result.code||result.cause?.[0]?.code||"").slice(0,80),providerMessage:String(result.message||result.cause?.[0]?.description||"").slice(0,160)},409);
  refunded=result.status==="refunded"||result.transactions?.refunds?.some(x=>x.status==="processed");
 }
 if(!refunded)return json({ok:true,status:"refund_pending",message:"Mercado Pago está processando o estorno; aguarde a confirmação."});
 await env.DB.batch([env.DB.prepare("UPDATE club_pix_orders SET status='refunded',reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND external_state IN ('none','failed','refunded')").bind(id),env.DB.prepare("UPDATE club_pix_fulfillment SET delivery_state='blocked',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(id)]);
 // Após confirmação remota do Pix, finalizar a venda sem nova movimentação financeira.
 const coinsDone=Number(order.currency_quantity)===0||order.external_state==="refunded";
 const finalStatus=coinsDone?"cancelled":"refunded";
 await env.DB.prepare("UPDATE club_pix_orders SET status=?,reservation_state='released',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='refunded' AND external_state IN ('none','failed','refunded')").bind(finalStatus,id).run();
 if(coinsDone){
  await env.DB.prepare("UPDATE vouchers SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP WHERE member_id=? AND source_type='SHOP' AND source_id=? AND status NOT IN ('CANCELLED','REDEEMED')").bind(order.member_id,id).run();
  await env.DB.prepare("INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json) VALUES('SYSTEM','checkout','CHECKOUT_CANCELADO_APOS_ESTORNOS','club_pix_orders',?,?)").bind(id,JSON.stringify({pixCents:order.amount_cents,fitcoins:Number(order.currency_quantity)})).run();
 }
 return json({ok:true,status:finalStatus,amountCents:order.amount_cents});
}
      if(url.pathname==="/admin/shop-sales-import") {
        if(!['GET','POST'].includes(request.method))return json({ok:false,error:'METODO_INVALIDO'},405);
        const unit=String(url.searchParams.get('unit')||'');
        if(!['bike','gym'].includes(unit))return json({ok:false,error:'UNIDADE_INVALIDA'},400);
        const actor=await verifyProxyAuth(request,env,unit,'shop-sales-import');
        if(actor?.role!=='admin')return json({ok:false,error:'NAO_AUTORIZADO'},403);
        try {const body=request.method==='POST'?await request.json():{};return json(await shopImport(env.DB,unit,request.method,body,actor));}
        catch(e){return json({ok:false,error:e.status?e.message:'Não foi possível consultar as vendas no D1.'},e.status||500)}
      }
      if(url.pathname==="/admin/pix-orders"&&request.method==="GET") {
        const ck=request.headers.get('x-clubpop-admin-cookie')||'';
        if(!ck)return json({ok:false,error:'NAO_AUTORIZADO'},401);
        const vr=await fetch('https://loja-pop-green.vercel.app/api/admin-auth?route=me',{headers:{Cookie:ck,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(8000)});
        const actor=await vr.json().catch(()=>({}));
        if(!vr.ok||!['admin','reception'].includes(actor.role))return json({ok:false,error:'NAO_AUTORIZADO'},401);
        const unit=String(url.searchParams.get('unit')||'bike');
        if(!['bike','gym','club'].includes(unit))return json({ok:false,error:'UNIDADE_INVALIDA'},400);
        if(unit!=='club'&&!actor.units?.includes(unit))return json({ok:false,error:'NAO_AUTORIZADO'},403);
        let orders=(await loadShopOrders(env.DB,unit)).filter(o=>actor.units?.includes(o.unit));
        // Preserve the reception operation list; the complete audit is opt-in.
        if(url.searchParams.get('all')!=='1')orders=orders.filter(o=>['approved','refunded','refund_pending','paid_pending_coins','cancelled'].includes(o.status)||(['running','review','confirmed','refunding'].includes(o.externalState)&&!['selected','superseded','expired','created'].includes(o.status)));
        return json({ok:true,orders});
      }
      if(url.pathname==="/admin/fiscal-sale"&&request.method==="POST"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck},cache:"no-store"});const auth=await vr.json().catch(()=>({}));if(!vr.ok||!["admin","reception"].includes(auth.role)||!auth.permissions?.some(p=>p==="*"||p==="/admin-resgates.html"))return json({ok:false,error:"SEM_PERMISSAO"},403);const b=await request.json().catch(()=>({})),id=String(b.orderId||"");if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:"PEDIDO_INVALIDO"},400);const o=await env.DB.prepare("SELECT id,unit,status FROM club_pix_orders WHERE id=?").bind(id).first();if(!o||o.status!=="approved"||!auth.units?.includes(o.unit))return json({ok:false,error:"VENDA_NAO_ELEGIVEL"},409);const result=await env.DB.prepare("INSERT OR IGNORE INTO club_fiscal_sale_entries(order_id,unit,registered_by) VALUES(?,?,?)").bind(id,o.unit,String(auth.email||auth.id||auth.role).slice(0,200)).run();const row=await env.DB.prepare("SELECT registered_at registeredAt,registered_by registeredBy FROM club_fiscal_sale_entries WHERE order_id=?").bind(id).first();return json({ok:true,alreadyRegistered:!result.meta.changes,...row});}
      if (url.pathname === "/admin/mission-redemptions" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"},cache:"no-store"});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||!["admin","reception"].includes(vd.role))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const rows=await env.DB.prepare("SELECT r.id,r.member_id memberId,TRIM(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')) memberName,r.title,r.status,r.source_type sourceType,r.source_id sourceId,r.unit,r.requested_at requestedAt,v.code voucherCode,v.status voucherStatus,v.description voucherDescription FROM redemptions r LEFT JOIN vouchers v ON v.redemption_id=r.id LEFT JOIN members m ON m.id=r.member_id WHERE r.source_type='MISSION' ORDER BY r.id DESC LIMIT 200").all();
        return json({ok:true,redemptions:rows.results||[]});
      }
      if (url.pathname === "/student-vouchers" && request.method === "GET") {
        const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const rows=await env.DB.prepare("SELECT v.id,v.code,v.type,v.description,v.status,v.title,v.redemption_id,v.source_type,v.source_id,v.metadata_json,r.requested_at,r.unit,r.status AS redemption_status,v.issued_at,v.expires_at FROM vouchers v LEFT JOIN redemptions r ON r.id=v.redemption_id WHERE v.member_id=? ORDER BY v.id DESC LIMIT 100").bind(member.id).all();
        const pending=await env.DB.prepare("SELECT q.source_id,q.status,q.evo_voucher_id evoVoucherId,m.name title,q.model_id FROM club_voucher_requests q JOIN club_voucher_models m ON m.id=q.model_id WHERE q.member_id=? AND q.source_type='MISSION' AND q.status IN ('pending','creating','code_pending','review_required') ORDER BY q.id DESC LIMIT 100").bind(member.id).all();
        const models={};const entries=[...(rows.results||[]),...(pending.results||[])];for(const item of entries){let id=Number(item.model_id||0);if(!id){try{id=Number(JSON.parse(item.metadata_json||'{}').modelId||0)}catch{}}if(!id||models[id])continue;const m=await env.DB.prepare("SELECT unit,contract_ids_json,validity_days FROM club_voucher_models WHERE id=?").bind(id).first();if(!m)continue;const selection=voucherSelection(m.contract_ids_json),ids=selection.ids;const cat=selection.kind==='service'?await env.DB.prepare("SELECT evo_service_id id,service_name name FROM evo_service_catalog WHERE unit=?").bind(m.unit).all():await env.DB.prepare("SELECT evo_contract_id id,contract_name name FROM evo_contract_catalog WHERE tenant_key='club-pop' AND unit=?").bind(m.unit).all();const names=new Map((cat.results||[]).map(x=>[String(x.id),x.name]));models[id]={plans:ids.map(x=>({id:x,name:names.get(String(x))||null,type:selection.kind})),validityDays:Number(m.validity_days)||0};}const plans=x=>{let id=Number(x.model_id||0);if(!id){try{id=Number(JSON.parse(x.metadata_json||'{}').modelId||0)}catch{}}return models[id]||{plans:[],validityDays:0}};const decorate=x=>{const m=plans(x);const issued=x.issued_at||x.requested_at;const expires=x.expires_at||(issued&&m.validityDays?new Date(new Date(String(issued).replace(' ','T')+'Z').getTime()+m.validityDays*86400000).toISOString():null);return {...x,eligiblePlans:m.plans,expires_at:expires}};return json({ok:true,vouchers:(rows.results||[]).map(decorate),pending:(pending.results||[]).map(decorate)});
      }
      if(url.pathname==="/mission-redemptions/progress"&&request.method==="GET"){
        const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const mission=await clubContentItem(env,"mission",String(url.searchParams.get("mission")||""));
        if(!mission||mission.type!=="challenge")return json({ok:false,error:"DESAFIO_NAO_ENCONTRADO"},404);
        const tasks=await challengeTaskProgress(env,member,mission);
        const goal=(mission.goals||[])[0],unit=String(mission.unit||"bike");
        const key="CHALLENGE-FITCOINS:"+unit+":"+member.id+":"+mission.id+":"+String(goal?.id||"")+":"+mission.start+":"+mission.end;
        const redemption=await env.DB.prepare("SELECT id,status FROM redemptions WHERE dedupe_key=?").bind(key).first();
        return json({ok:true,tasks,completed:tasks.length>0&&tasks.every(x=>x.done),redemption: redemption||null});
      }
      if (url.pathname === "/mission-redemptions/mine" && request.method === "GET") {
        const member=await authenticatedMember(request,env); if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const mission=String(url.searchParams.get("mission")||"");
        const rs=await env.DB.prepare("SELECT id,source_id,title,status,requested_at FROM redemptions WHERE member_id=? AND source_type='MISSION' AND reference_id=? ORDER BY id DESC").bind(member.id,mission).all();
        return json({ok:true,redemptions:rs.results||[]});
      }

      if (url.pathname === "/mission-redemptions/claim" && request.method === "POST") {
        const member=await authenticatedMember(request,env); if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const body=await readJson(request),missionKey=String(body.missionId||""),goalKey=String(body.goalId||"");
        const mission=await clubContentItem(env,"mission",missionKey); if(!mission)return json({ok:false,error:"MISSAO_NAO_ENCONTRADA"},404);
        const goal=(mission.goals||[]).find(x=>String(x.id)===goalKey); if(!goal)return json({ok:false,error:"META_NAO_ENCONTRADA"},404);
        // A mission with tiered rewards grants one final choice per student.
        if(mission.type==="presence" && (mission.goals||[]).length>1){
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_mission_final_choice (member_id INTEGER NOT NULL,mission_id TEXT NOT NULL,period_key TEXT NOT NULL,goal_id TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(member_id,mission_id,period_key))").run();
          const periodKey=mission.period==="month"?String(mission.start||"").slice(0,7):String(mission.start||"")+"_"+String(mission.end||"");
          const prior=await env.DB.prepare("SELECT source_id FROM redemptions WHERE member_id=? AND source_type='MISSION' AND reference_id=? ORDER BY id DESC LIMIT 1").bind(member.id,missionKey).first();
          if(prior && String(prior.source_id)!==goalKey)return json({ok:false,error:"MISSAO_JA_ENCERRADA_OUTRA_META"},409);
          if(prior)return json({ok:true,alreadyClaimed:true,missionClosed:true});
          const progress=await missionProgressValue(env,member,mission);
          if(progress<Number(goal.value||0))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA",progress},409);
          const inserted=await env.DB.prepare("INSERT OR IGNORE INTO club_mission_final_choice(member_id,mission_id,period_key,goal_id) VALUES(?,?,?,?)").bind(member.id,missionKey,periodKey,goalKey).run();
          if(Number(inserted.meta?.changes||0)!==1){
            const chosen=await env.DB.prepare("SELECT goal_id FROM club_mission_final_choice WHERE member_id=? AND mission_id=? AND period_key=?").bind(member.id,missionKey,periodKey).first();
            if(String(chosen?.goal_id)!==goalKey)return json({ok:false,error:"MISSAO_JA_ENCERRADA_OUTRA_META"},409);
          }
        }
        const rewards=Array.isArray(goal.rewards)?goal.rewards.filter(x=>x&&x.type):[];
        if(mission.type==="challenge"&&goal.rewardType==="fitcoins")return await challengeFitcoinClaim(env,member,mission,goal,json);
        if(goal.rewardType==="currency"||rewards.some(x=>x.type==="currency")){
          const unit=String(mission.unit||"bike"),today=localToday();
          if(!["bike","gym","club"].includes(unit)||mission.status!=="Ativo"||!mission.start||!mission.end||today<mission.start||today>mission.end)return json({ok:false,error:"MISSAO_FORA_DO_PERIODO"},409);
          if(unit==="bike"&&!member.evo_member_id||unit==="gym"&&!member.gym_client_id)return json({ok:false,error:"ALUNO_NAO_VINCULADO"},403);
          const localRewards=rewards.length?rewards:[{type:"currency",rewardId:goal.rewardId,amount:goal.rewardValue}];
          if(localRewards.some(x=>x.type!=="currency"))return json({ok:false,error:"SEPARE_MOEDAS_PROPRIAS_EM_OUTRA_META"},409);
          if(mission.eligibility==="selected"||mission.eligibility==="active"){
            const id=unit==="gym"?member.gym_client_id:member.evo_member_id;
            const contracts=await env.DB.prepare("SELECT id_membership FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND (cancel_date IS NULL OR cancel_date='') AND (start_date IS NULL OR start_date='' OR substr(start_date,1,10)<=?) AND (end_date IS NULL OR end_date='' OR substr(end_date,1,10)>=?) AND lower(COALESCE(membership_status,'')) IN ('1','active','ativo')").bind(unit,String(id||''),today,today).all();
            const allowed=new Set((mission.contracts||[]).map(String));if(!(contracts.results||[]).some(x=>mission.eligibility==="active"||allowed.has(unit+':'+x.id_membership)||allowed.has(String(x.id_membership))))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);
          }
          if(!Number.isFinite(Number(goal.value))||Number(goal.value)<=0||await currencyMissionProgress(env.DB,member,mission)<Number(goal.value))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA"},409);
          const dedupe="CURRENCY-MISSION:"+unit+":"+member.id+":"+missionKey+":"+goalKey+":"+mission.start+":"+mission.end;
          const old=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key=?").bind(dedupe).first();if(old)return json({ok:true,alreadyClaimed:true,rewardType:"currency",redemption:old,evoRequestsMade:0});
          const stm=[];
          try{for(let i=0;i<localRewards.length;i++){const rw=localRewards[i],currency=await activeCurrency(env.DB,Number(rw.rewardId),unit,true),amount=Number(rw.amount);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000)throw Error("QUANTIDADE_INVALIDA");stm.push(...ledgerStatements(env.DB,{memberId:member.id,currencyId:currency.id,unit,amount,origin:"mission",reference:missionKey+":"+goalKey,key:dedupe+":"+i}));}}catch(e){return json({ok:false,error:e.message},400);}
          stm.push(env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key,completed_at) SELECT ?,'currency',?,'COMPLETED','MISSION',?,?,?,?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(member.id,missionKey,goalKey,goal.rewardName||"Moedas",mission.name||"",unit,dedupe,dedupe));
          await env.DB.batch(stm);return json({ok:true,claimed:true,rewardType:"currency",evoRequestsMade:0});
        }
        const voucherRewards=rewards.length?rewards:((goal.rewardType==="voucher"||(goal.rewardType==="manual"&&/^(bike|gym):\d+$/.test(String(goal.rewardId||""))))?[{type:"voucher",rewardId:goal.rewardId}]:[]);
        if(voucherRewards.length>1 && voucherRewards.every(x=>x.type==="voucher")){
          const results=[];let evoRequestsMade=0;
          for(let i=0;i<voucherRewards.length;i++){
            const rw=voucherRewards[i],subGoal={...goal,id:String(goal.id)+":voucher:"+i,rewardId:rw.rewardId};
            try{
              const result=await claimEvoMissionVoucher(env,member,mission,subGoal,[rw]);
              evoRequestsMade+=Number(result.evoRequestsMade||0);
              results.push({index:i,unit:String(rw.rewardId||"").split(":")[0],status:result.requiresReview?"review":result.alreadyClaimed?"already_claimed":"delivered",voucher:result.voucher||null});
            }catch(error){results.push({index:i,status:"error",error:String(error.message||error)})}
          }
          const complete=results.every(x=>["delivered","already_claimed"].includes(x.status));
          return json({ok:true,claimed:complete,multiReward:true,rewardType:"voucher",requiresReview:!complete,redemptions:results,evoRequestsMade});
        }
        if(voucherRewards.some(x=>x.type==="voucher")){
          try{return json(await claimEvoMissionVoucher(env,member,mission,goal,voucherRewards));}
          catch(error){if(error.voucherError)return json({ok:false,error:error.message},error.status);throw error;}
        }
        if(rewards.length>1){
          if(rewards.some(r=>r.type==="fitcoins"))return json({ok:false,error:"FITCOINS_MULTIPLOS_EXIGEM_ENTREGA_TRANSACIONAL"},409);
          if(rewards.some(r=>!["voucher","service","product"].includes(r.type)||!r.rewardId))return json({ok:false,error:"RECOMPENSA_MULTIPLA_INVALIDA"},409);
          const progress=await missionProgressValue(env,member,mission);
          if(progress<Number(goal.value||0))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA",progress},409);
          const period=mission.period==="month"?String(mission.start||new Date().toISOString()).slice(0,7):String(mission.start||"")+"_"+String(mission.end||"");
          const prefix="MISSION:"+member.id+":"+missionKey+":"+goalKey+":"+period;
          const existing=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key=? LIMIT 1").bind(prefix).first();
          if(existing)return json({ok:true,alreadyClaimed:true,redemption:existing});
          const pending=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key LIKE ? ORDER BY id").bind(prefix+":reward:%").all();
          if((pending.results||[]).length)return json({ok:true,alreadyClaimed:true,redemptions:pending.results});
          const statements=[];
          for(let i=0;i<rewards.length;i++){
            const rw=rewards[i],key=prefix+":reward:"+i;
            statements.push(env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key) SELECT ?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(member.id,rw.type,missionKey,"PENDING","MISSION",goalKey,rw.rewardName||rw.name||"Recompensa",mission.name||"",mission.unit||"bike",key,key));
            statements.push(env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,redemption_id,source_type,source_id,title,metadata_json) SELECT ?,?,?,?,'ACTIVE',r.id,'MISSION',?,?,? FROM redemptions r WHERE r.dedupe_key=? AND NOT EXISTS (SELECT 1 FROM vouchers v WHERE v.redemption_id=r.id)").bind(member.id,"M"+randomToken(12).toUpperCase(),rw.type,rw.rewardName||rw.name||"Recompensa",goalKey,rw.rewardName||rw.name||"Recompensa",JSON.stringify({missionId:missionKey,goalId:goalKey,rewardIndex:i,rewardId:rw.rewardId}),key));
          }
          await env.DB.batch(statements);
          const rows=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key LIKE ? ORDER BY id").bind(prefix+":reward:%").all();
          return json({ok:true,claimed:true,redemptions:rows.results||[],requiresReview:true,warning:"RECOMPENSAS_REGISTRADAS_AGUARDANDO_ENTREGA"});
        }
        const progress=await missionProgressValue(env,member,mission); if(progress<Number(goal.value||0))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA",progress},409);
        const period=mission.period==="month"?String(mission.start||new Date().toISOString()).slice(0,7):String(mission.start||"")+"_"+String(mission.end||"");
        const dedupe="MISSION:"+member.id+":"+missionKey+":"+goalKey+":"+period;
        const old=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key=? LIMIT 1").bind(dedupe).first();
        if(old)return json({ok:true,alreadyClaimed:true,redemption:old});
        await env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(member.id,goal.rewardType||"mission",missionKey,"PENDING","MISSION",goalKey,goal.rewardName||"Recompensa",mission.name||"",mission.unit||"bike",dedupe).run();
        const red=await env.DB.prepare("SELECT * FROM redemptions WHERE dedupe_key=? LIMIT 1").bind(dedupe).first();
        const voucher="M"+String(red.id).padStart(6,"0")+"-"+randomToken(2).toUpperCase();
        await env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,redemption_id,source_type,source_id,title,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(member.id,voucher,goal.rewardType||"mission",goal.rewardName||"Recompensa","ACTIVE",red.id,"MISSION",goalKey,goal.rewardName||"Recompensa",JSON.stringify({missionId:missionKey,goalId:goalKey})).run();
        return json({ok:true,claimed:true,redemption:{id:red.id,title:red.title,status:red.status},voucher});
      }

      return json({
        ok: false,
        error: "ROTA_NAO_ENCONTRADA",
      }, 404);

    } catch (error) {
      if (error instanceof EvoConfigError) {
        return new Response(JSON.stringify({ok:false,error:error.code,stage:"evo-config",unit:"bike"}), {
          status:503, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","x-evo-config-error":"1",
          "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(request.headers.get("Origin"))?request.headers.get("Origin"):"https://loja-pop-green.vercel.app","Vary":"Origin"}
        });
      }
      console.error("CLUB POP API ERROR", error);

      return new Response(JSON.stringify({
        ok: false,
        error: "ERRO_INTERNO",
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};

// =========================================================
// CLUB POP CAMPAIGNS / MISSIONS
// =========================================================
// WhatsApp mission events: D1-only, opt-in test allowlist, no EVO calls.
async function clubMissionWhatsappEvent(env,member,unit,event){
 try{
  if(!["bike","gym","club"].includes(unit)||!["image_generated","share_clicked"].includes(event))return;
  // Active configured mission rules apply to every authenticated eligible member.
  const content=await clubContent(env);
  const dateParts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const getPart=t=>dateParts.find(p=>p.type===t)?.value||"";
  const now=getPart("year")+"-"+getPart("month")+"-"+getPart("day");
  const missions=(content.missionList||[]).filter(m=>m.type==="challenge"&&m.status==="Ativo"&&(!m.start||m.start<=now)&&(!m.end||m.end>=now)&&(m.unit===unit||m.unit==="club")&&Array.isArray(m.tasks)&&Array.isArray(m.whatsappRules));
  if(!missions.length)return;
  const evoId=unit==="gym"?member.gym_client_id:member.evo_member_id;
  if(!evoId)return;
  const master=await env.DB.prepare("SELECT contacts_json FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(evoId)).first();
  const contacts=JSON.parse(master?.contacts_json||"[]");
  const numbers=[...new Set(contacts.filter(c=>String(c.contactType).toLowerCase()==="cellphone").map(c=>{
   const raw=String(c.description||"").replace(/\D/g,""),ddi=String(c.ddi||"").replace(/\D/g,"");
   let n=raw.startsWith("55")?raw:(ddi==="55"?"55"+raw:"55"+raw);
   return /^55\d{10,11}$/.test(n)?n:null;
  }).filter(Boolean))];
  if(numbers.length!==1)return;
  const config=await env.DB.prepare("SELECT api_key_cipher,base_url,enabled,enabled_units FROM club_chatpro_config WHERE id=1").first();
  let allowedUnits=["bike"];try{allowedUnits=JSON.parse(config?.enabled_units||'["bike"]')}catch{}
  if(!Array.isArray(allowedUnits)||!allowedUnits.includes(unit))return;
  if(!config?.enabled||!config.api_key_cipher||!chatproSafeApiUrl(config.base_url)||!env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY)return;
  const keyBytes=Uint8Array.from(atob(env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY),c=>c.charCodeAt(0));
  if(keyBytes.length!==32)return;
  const cryptoKey=await crypto.subtle.importKey("raw",keyBytes,"AES-GCM",false,["decrypt"]);
  const [iv,body]=config.api_key_cipher.split(".");
  const key=new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode("chatpro:config")},cryptoKey,Uint8Array.from(atob(body),c=>c.charCodeAt(0))));
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_whatsapp_mission_dispatch(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER NOT NULL,mission_id TEXT NOT NULL,rule_key TEXT NOT NULL,flow_id INTEGER NOT NULL,state TEXT NOT NULL DEFAULT 'reserved',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(member_id,mission_id,rule_key))").run();
  for(const m of missions){
   for(let i=0;i<m.tasks.length;i++){
    const task=m.tasks[i];if(task.type!==event)continue;
    const action=event==="image_generated"?"POP_FIT_IMAGE_GENERATED":"POP_FIT_SHARE_CLICKED";
    const count=await env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE actor_type='MEMBER' AND actor_id=? AND action=? AND date(datetime(created_at,'-3 hours')) BETWEEN ? AND ? AND json_valid(metadata_json) AND json_extract(metadata_json,'$.unit')=?").bind(String(member.id),action,m.start,m.end,unit).first();
    for(const [ri,r] of m.whatsappRules.entries()){
     if(r.enabled!==true||r.event!=="task:"+i+":"+event)continue;
     const threshold=Number(r.threshold||task.quantity||1),flow=Number(r.flowId);
     if(!Number.isSafeInteger(threshold)||threshold<1||Number(count?.n||0)<threshold||!Number.isSafeInteger(flow)||flow<1)continue;
     const ruleKey=String(ri)+":"+r.event+":"+threshold;
     const reserved=await env.DB.prepare("INSERT OR IGNORE INTO club_whatsapp_mission_dispatch(member_id,mission_id,rule_key,flow_id) VALUES(?,?,?,?)").bind(member.id,String(m.id),ruleKey,flow).run();
     if(!reserved.meta?.changes)continue;
     let state="uncertain";
     try{
      const base=config.base_url.replace(/\/$/,"");
      const headers={"API-KEY":key,"Accept":"application/json","Content-Type":"application/json"};
      const lookup=await fetch(base+"/subscriber/get_by_phone/"+encodeURIComponent(numbers[0])+"/",{headers,redirect:"manual",signal:AbortSignal.timeout(10000)});
      if(!lookup.ok){state="lookup_failed";continue}
      const sub=await lookup.json();const sid=String(sub.id||"");
      if(!/^[a-zA-Z0-9_-]{1,80}$/.test(sid)){state="contact_missing";continue}
      const send=await fetch(base+"/subscriber/"+encodeURIComponent(sid)+"/send_flow/",{method:"POST",headers,body:JSON.stringify({flow}),redirect:"manual",signal:AbortSignal.timeout(10000)});
      state=send.ok?"sent":"send_uncertain";
     }catch{state="send_uncertain"}
     finally{await env.DB.prepare("UPDATE club_whatsapp_mission_dispatch SET state=?,updated_at=CURRENT_TIMESTAMP WHERE member_id=? AND mission_id=? AND rule_key=?").bind(state,member.id,String(m.id),ruleKey).run()}
    }
   }
  }
 }catch(e){console.error("CLUB_WHATSAPP_EVENT",String(e?.message||e))}
}
async function clubContent(env){
  try{await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_content(content_key TEXT PRIMARY KEY,content_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();const row=await env.DB.prepare("SELECT content_json FROM app_content WHERE content_key=\'club-pop\' LIMIT 1").first();if(row?.content_json){const d=JSON.parse(row.content_json);if(d&&typeof d==="object")return d}}catch{}
  return {promotions:[{id:"promo-1790872798501",unit:"bike",status:"Ativo",name:"Iphone sorteio",start:"2026-09-01",end:"2026-10-31",promotionType:"lucky_number",numbersPerAttendance:1,reset:"monthly",luckyNumber:{enabled:true,numbersPerAttendance:1,reset:"monthly",maxNumbers:27,milestones:[{attendance:8,bonus:5},{attendance:12,bonus:10}]},dashboardText:"",rules:"",bannerUrl:"",requirements:[{unit:"bike",activityId:"*",activity:"Qualquer atividade",quantity:1}],eligibility:{mode:"active_contract",acceptedContracts:["78686","78687","78852"]}}],missionList:[]};
}
async function clubContentItem(env,type,id){
  const c=await clubContent(env); const list=type==="promotion"?(c.promotions||[]):(c.missionList||[]);
  const item=list.find(x=>String(x.id)===String(id))||null;if(type!=="promotion"||!item)return item;const closure=await env.DB.prepare("SELECT closed_at FROM club_draw_early_closures WHERE promotion_slug=?").bind(String(id)).first();return closure?{...item,status:"Encerrado",earlyClosedAt:closure.closed_at}:item;
}
async function ensurePromotion(env,p){
  const slug=String(p.id),rules=JSON.stringify(p.luckyNumber||{});
  await env.DB.prepare("INSERT INTO promotions(slug,name,description,start_at,end_at,status,rules_json,banner_url) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,status=excluded.status,rules_json=excluded.rules_json,banner_url=excluded.banner_url,updated_at=CURRENT_TIMESTAMP").bind(slug,p.name||slug,p.dashboardText||"",p.start||"2000-01-01",p.end||"2099-12-31",p.status==="Ativo"?"ACTIVE":"INACTIVE",rules,p.bannerUrl||null).run();
  return await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(slug).first();
}
async function evoProfile(env,id,unit="bike",options={}){
  unit=unit==="gym"?"gym":"bike";const cfg=await getEvoConfig(env,unit),auth=btoa(cfg.dns+":"+cfg.token);
  const record=options.beforeRequest?await options.beforeRequest():null;
  const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v2/members/"+encodeURIComponent(id)+"?showMemberships=true",{headers:{Authorization:"Basic "+auth,Accept:"application/json"}});
  if(record)await record(r);
  if(!r.ok)throw new Error("EVO_PROFILE_"+r.status);const d=await r.json();return Array.isArray(d)?d[0]:d;
}
async function promotionEligible(env,member,p){
  if((p.eligibility?.mode||"any")==="any")return true;const manual=await env.DB.prepare("SELECT id FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? AND status='APPROVED' ORDER BY id DESC LIMIT 1").bind(String(p.id),member.id).first();if(manual)return true;const unit=(p.unit||"bike")==="gym"?"gym":"bike",profile=await evoProfile(env,member.evo_member_id,unit),today=new Date().toISOString().slice(0,10),accepted=(p.eligibility?.acceptedContracts||[]).map(String);
  return (profile?.memberships||[]).some(x=>accepted.includes(String(x.idMembership))&&!x.cancelDate&&(!x.endDate||String(x.endDate).slice(0,10)>=today));
}
async function evoAttendance(env,id,start,end,memberId=null,unit="bike",options={}){
  unit=unit==="gym"?"gym":"bike";const startDate=String(start||"2026-01-01").slice(0,10),endDate=String(end||new Date().toISOString().slice(0,10)).slice(0,10);
  // EVO is the source of truth: always reconcile this range.
  const cfg=await getEvoConfig(env,unit),auth=btoa(cfg.dns+":"+cfg.token),qs=new URLSearchParams({idMember:String(id),dateStart:startDate+"T00:00:00",dateEnd:endDate+"T23:59:59",skip:"0",take:"200"});
  const collected=[],seen=new Set();
  for(let page=0;;page++){
    const record=options.beforeRequest?await options.beforeRequest():null;
    qs.set("skip",String(page*200));
    const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?"+qs,{headers:{Authorization:"Basic "+auth,Accept:"application/json"},signal:AbortSignal.timeout(25000)});
    if(record)await record(r);
    if(!r.ok)throw new Error("EVO_ATTENDANCE_"+r.status);
    const d=await r.json(),rows=Array.isArray(d)?d:(d.items||d.data);
    if(!Array.isArray(rows)||rows.length>200)throw Error("EVO_ATTENDANCE_RESPOSTA_INVALIDA");
    const fingerprint=JSON.stringify(rows);if(rows.length&&seen.has(fingerprint))throw Error("EVO_ATTENDANCE_PAGINACAO_REPETIDA");seen.add(fingerprint);
    collected.push(...rows);
    if(!options.paginate||rows.length<200)break;
    if(page>=49)throw Error("EVO_ATTENDANCE_PAGINACAO_INCOMPLETA");
  }
  const a=collected.filter(x=>x?.presenca===true&&x?.isFinalized===true);
  if(memberId){
    await env.DB.prepare("DELETE FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date>=? AND attendance_date<=?").bind(memberId,unit,startDate,endDate).run();
    for(const x of a){
      const date=String(x.date||x.dateStart||x.startDate||x.dateTime||"").slice(0,10);if(!date)continue;
      const session=String(x.idMemberSession||x.idSession||x.idActivitySession||x.id||"");
      const activity=String(x.idActivity||x.activityId||"");
      const key=[unit,memberId,date,session||activity||String(x.nameActivity||x.activityName||"attendance")].join(":");
      await env.DB.prepare("INSERT OR IGNORE INTO attendance_history(member_id,evo_member_id,unit,attendance_key,attendance_date,activity_id,activity_name,raw_json) VALUES(?,?,?,?,?,?,?,?)").bind(memberId,id,unit,key,date,activity||null,x.nameActivity||x.activityName||x.name||null,JSON.stringify(x)).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO attendance_sync_ranges(member_id,unit,start_date,end_date,synced_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)").bind(memberId,unit,startDate,endDate).run();
  }
  return a;
}
async function missionProgressValue(env,member,m){
  const a=await evoAttendance(env,member.evo_member_id,m.start,m.end,member.id);if(m.type!=="consistency")return a.length;
  const need=Number(m.requirements?.[0]?.quantity||1),weeks={};for(const x of a){const k=String(x.date||x.dateStart||"").slice(0,10);if(!k)continue;const d=new Date(k+"T12:00:00"),dow=(d.getDay()+6)%7,mo=new Date(d);mo.setDate(d.getDate()-dow);const wk=mo.toISOString().slice(0,10);(weeks[wk]??=new Set()).add(k)}return Object.values(weeks).filter(s=>s.size>=need).length;
}

// =========================================================
// EVO
// =========================================================


const CLUB_RECEPTION_URL="https://wa.me/551130521378?text="+encodeURIComponent("Olá estou tentando acessar o Club Pop mas está dizendo que meu contrato não esta ativo, pode me ajudar?");
const CLUB_DATA_URL="https://wa.me/551130521378?text="+encodeURIComponent("Olá, estou tentando acessar o Club Pop, mas meu cadastro está com dados incompletos. Podem me ajudar a atualizar?");
function clubJson(value,fallback={}){try{return JSON.parse(value||"")||fallback}catch{return fallback}}
function clubDigits(value){return String(value||"").replace(/[^0-9]/g,"")}
function clubCanonicalId(id){const value=String(id??"").trim();return /^\d+\.0+$/.test(value)?value.replace(/\.0+$/,""):value;}
function clubProfile(row){
 const p=clubJson(row.personal_json),c=clubJson(row.contacts_json),raw=clubJson(row.raw_json);
 return {unit:row.unit,id:clubCanonicalId(row.evo_member_id),cpf:clubDigits(p.document||raw.document||raw["CPF (CIN)"]),email:normalizeEmail((Array.isArray(c)?c.find(x=>String(x.contactType||"").toLowerCase().includes("mail"))?.description: c?.email)||p.email||raw.email||raw["E-MAIL"]),birth:normalizeDate(p.birthDate||raw.birthDate||raw["DATA DE NASCIMENTO"]),first:p.firstName||raw.firstName||"",last:p.lastName||raw.lastName||""};
}
async function clubActiveUnits(env,bikeId,gymId){
 const ids=[["bike",bikeId],["gym",gymId]].filter(x=>x[1]!=null&&String(x[1])!=="").map(([unit,id])=>[unit,clubCanonicalId(id)]);
 const active=[];
 for(const [unit,id] of ids){
  const found=await env.DB.prepare(`SELECT 1 FROM evo_member_contracts WHERE unit=? AND CAST(evo_member_id AS TEXT)=? AND lower(trim(membership_status)) IN ('active','1') AND (start_date IS NULL OR start_date='' OR substr(start_date,1,10)<=date('now','-3 hours')) AND (end_date IS NULL OR end_date='' OR substr(end_date,1,10)>=date('now','-3 hours')) AND (cancel_date IS NULL OR cancel_date='' OR substr(cancel_date,1,10)>date('now','-3 hours')) LIMIT 1`).bind(unit,String(id)).first();
  if(found)active.push(unit);
 }
 return active;
}
async function clubFindLocal(env,cpf,email,birth){
 const rows=(await env.DB.prepare("SELECT unit,evo_member_id,personal_json,contacts_json,raw_json FROM evo_member_master WHERE is_current=1 AND unit IN ('bike','gym')").all()).results||[];
 const profiles=rows.map(clubProfile);
 const exact=profiles.filter(p=>p.cpf===cpf);
 if(exact.length){
  const valid=exact.filter(p=>p.email===email&&p.birth===birth);
  if(valid.length)return {profiles:valid,matched:true};
  if(exact.some(p=>!p.email||!p.birth))return {incomplete:true};
  return {mismatch:true};
 }
 // CPF ausente: apenas sinaliza dados incompletos quando os outros dois fatores são únicos.
 const possible=profiles.filter(p=>!p.cpf&&p.email===email&&p.birth===birth);
 if(possible.length===1)return {incomplete:true};
 return {missing:true};
}

async function findEvoMember(env, cpf) {
  const cfg = await getEvoConfig(env, "bike");
  const auth = btoa(`${cfg.dns}:${cfg.token}`);

  const basicUrl =
    `https://evo-integracao.w12app.com.br/api/v1/members/basic?document=${encodeURIComponent(cpf)}`;

  const basicResponse = await fetch(basicUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!basicResponse.ok) {
    throw new Error(`EVO_BASIC_${basicResponse.status}`);
  }

  const basicData = await basicResponse.json();

  const basicMember = Array.isArray(basicData)
    ? basicData[0]
    : basicData;

  if (!basicMember?.idMember) {
    return null;
  }

  const profileUrl =
    `https://evo-integracao.w12app.com.br/api/v2/members/${basicMember.idMember}`;

  const profileResponse = await fetch(profileUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!profileResponse.ok) {
    throw new Error(`EVO_PROFILE_${profileResponse.status}`);
  }

  const profileData = await profileResponse.json();

  const profile = Array.isArray(profileData)
    ? profileData[0]
    : profileData;

  return {
    ...basicMember,
    ...(profile || {}),
  };
}


async function findGymEvoMember(env, cpf) {
  if (!env.GYM_EVO_DNS || !env.GYM_EVO_TOKEN) {
    throw new Error("GYM_EVO_CREDENTIALS_MISSING");
  }

  const auth = btoa(`${env.GYM_EVO_DNS}:${env.GYM_EVO_TOKEN}`);
  const basicUrl =
    `https://evo-integracao.w12app.com.br/api/v1/members/basic?document=${encodeURIComponent(cpf)}`;

  const basicResponse = await fetch(basicUrl, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });

  if (!basicResponse.ok) {
    throw new Error(`GYM_EVO_BASIC_${basicResponse.status}`);
  }

  const basicData = await basicResponse.json();
  const basicMember = Array.isArray(basicData) ? basicData[0] : basicData;
  if (!basicMember?.idMember) return null;

  const profileResponse = await fetch(
    `https://evo-integracao.w12app.com.br/api/v2/members/${basicMember.idMember}`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
  );

  if (!profileResponse.ok) {
    throw new Error(`GYM_EVO_PROFILE_${profileResponse.status}`);
  }

  const profileData = await profileResponse.json();
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  return { ...basicMember, ...(profile || {}) };
}


// =========================================================
// AUTENTICAÇÃO
// =========================================================

async function authenticatedMember(request, env) {
  const token = bearer(request);

  if (!token) return null;

  const tokenHash = await sha256(token);

  return await env.DB.prepare(`
    SELECT m.*
    FROM auth_sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND m.status = 'ACTIVE'
    LIMIT 1
  `).bind(
    tokenHash,
    new Date().toISOString()
  ).first();
}

async function createSession(env, memberId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);

  const expiresAt =
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      member_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?)
  `).bind(
    memberId,
    tokenHash,
    expiresAt
  ).run();

  return {
    token,
    expiresAt,
  };
}


// =========================================================
// PIN
// =========================================================

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 100000,
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(bits));
}


// =========================================================
// UTILITÁRIOS
// =========================================================

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function validCpfShape(cpf) {
  return /^\d{11}$/.test(cpf);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toISOString().slice(0, 10);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);

  return [...array]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearer(request) {
  const value = request.headers.get("Authorization") || "";

  if (!value.startsWith("Bearer ")) {
    return "";
  }

  return value.slice(7).trim();
}

function safeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function publicMember(member) {
  return {
    id: member.id,
    evoMemberId: member.evo_member_id,
    gymMemberId: member.gym_client_id || null,
    firstName: member.first_name || "",
    lastName: member.last_name || "",
    email: member.email || "",
    cpfLast4: member.cpf_last4 || "",
  };
}

async function audit(
  env,
  actorType,
  actorId,
  action,
  entityType = "AUTH",
  entityId = null,
  metadata = null
) {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_log (
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null
    ).run();
  } catch (error) {
    console.error("AUDIT ERROR", error);
  }
}
function luckyConstancyWeek(date){const d=new Date(String(date).slice(0,10)+"T12:00:00Z");if(Number.isNaN(d.getTime()))return null;const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((day+6)%7));return d.toISOString().slice(0,10)}
async function syncLuckyConstancy(env,member,promo,canonical=null){const cfg=promo.luckyNumber||{},goal=Math.max(1,Math.min(7,Number(cfg.weeklyGoal)||3)),qty=Math.max(1,Math.min(100,Number(cfg.weeklyNumbers)||1)),max=Math.max(0,Number(cfg.maxNumbers)||0),distinct=cfg.distinctDays!==false,once=cfg.weeklyOnce!==false,unit=promo.unit==="gym"?"gym":"bike";const dp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dp.id,member.id).run();const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first();const ah=await env.DB.prepare("SELECT attendance_key,attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,attendance_key").bind(member.id,unit,promo.start,promo.end).all();if(canonical)ah.results=canonical;const weeks=new Map();for(const a of ah.results||[]){const week=luckyConstancyWeek(a.attendance_date);if(!week)continue;const bucket=weeks.get(week)||[];bucket.push(a);weeks.set(week,bucket)}const existing=await env.DB.prepare("SELECT code,reference_month FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE'").bind(dp.id,pt.id).all();const perMonth={};for(const n of existing.results||[])perMonth[n.reference_month]=(perMonth[n.reference_month]||0)+1;let added=0;for(const [week,rows] of [...weeks].sort((a,b)=>a[0].localeCompare(b[0]))){const counted=distinct?new Set(rows.map(a=>a.attendance_date)).size:rows.length;const earned=(once?Math.min(1,Math.floor(counted/goal)):Math.floor(counted/goal))*qty;if(!earned)continue;const month=week.slice(0,7),origin="CONSTANCY",tag="C-"+week;const old=await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND origin=? AND reference_month=? AND code LIKE ? AND status='ACTIVE'").bind(dp.id,pt.id,origin,month,"%"+tag+"%").first();let missing=Math.max(0,earned-Number(old?.n||0));if(max)missing=Math.min(missing,Math.max(0,max-(perMonth[month]||0)));for(let i=0;i<missing;i++){const code=(unit==="gym"?"G":"B")+"-"+member.evo_member_id+"-"+tag+"-"+randomToken(5).toUpperCase();await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dp.id,pt.id,code,month,unit,origin).run();perMonth[month]=(perMonth[month]||0)+1;added++}}return{attendance:(ah.results||[]).length,generated:added}}
function uniqueLuckyAttendance(rows){const groups=new Map();for(const a of rows||[]){const key=String(a.attendance_key||""),day=String(a.attendance_date||"").slice(0,10),parts=key.split(":"),session=parts.at(-1)||"";const group=day+"|"+(session==="attendance"?"legacy":session);const current=groups.get(group);if(!current||String(current.attendance_key).endsWith(":attendance"))groups.set(group,a)}const days=new Map();for(const a of groups.values()){const day=String(a.attendance_date).slice(0,10);const bucket=days.get(day)||[];bucket.push(a);days.set(day,bucket)}return [...days.values()].flatMap(bucket=>{const concrete=bucket.filter(a=>!String(a.attendance_key).endsWith(":attendance"));return concrete.length?concrete:bucket})}
async function reconcileLuckyDuplicates(db,promotionId,member,promo,attendance,candidate){
 const pt=await db.prepare('SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?').bind(promotionId,member.id).first();if(!pt)return;
 const ns=(await db.prepare("SELECT l.*,pa.source_ref,pa.occurred_at,? member_id,(SELECT raw_json FROM attendance_history WHERE attendance_key=pa.source_ref LIMIT 1) source_raw FROM lucky_numbers l JOIN promotion_attendance pa ON pa.id=l.attendance_id WHERE l.promotion_id=? AND l.participant_id=? AND l.status='ACTIVE' AND l.origin='ATTENDANCE' ORDER BY l.id").bind(String(member.id),promotionId,pt.id).all()).results||[];
 const groups=new Map();for(const n of ns){const key=ticketSession(n,attendance),a=groups.get(key)||[];a.push(n);groups.set(key,a)}
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_number_reconciliations(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_id INTEGER NOT NULL,number_id INTEGER NOT NULL,code TEXT NOT NULL,member_id INTEGER NOT NULL,unit TEXT NOT NULL,reason TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
 for(const [key,group] of groups){
  const canonical=[promo.unit,member.id,key].join(':'),keep=group.slice(0,Number(promo.luckyNumber.numbersPerAttendance)||1),excess=group.slice(keep.length);
  // Retain the earliest valid codes; cancel only proven copies of that same
  // finalized session. Record every change, never delete a number or presence.
  for(const n of excess)await db.batch([
   db.prepare("INSERT INTO lucky_number_reconciliations(promotion_id,number_id,code,member_id,unit,reason,details_json) SELECT ?,?,?,?,?, 'DUPLICIDADE_MESMA_SESSAO',? WHERE EXISTS(SELECT 1 FROM lucky_numbers WHERE id=? AND status='ACTIVE')").bind(promotionId,n.id,n.code,member.id,promo.unit,JSON.stringify({session:key,kept:keep.map(x=>x.code),source:n.source_ref}),n.id),
   db.prepare("UPDATE lucky_numbers SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP WHERE id=? AND status='ACTIVE'").bind(n.id)]);
  // Keep the issued code and its owner; normalize only the verified attendance link.
  const a=attendance.find(a=>a.attendance_date+':'+a.id_activity_session===key);
  await db.prepare("INSERT OR IGNORE INTO promotion_attendance(promotion_id,participant_id,studio,occurred_at,reference_month,source,source_ref,status) VALUES(?,?,?,?,?,'EVO',?,'VALID')").bind(promotionId,pt.id,promo.unit,a.attendance_date,a.attendance_date.slice(0,7),canonical).run();
  const target=await db.prepare('SELECT id FROM promotion_attendance WHERE promotion_id=? AND participant_id=? AND source_ref=?').bind(promotionId,pt.id,canonical).first();
  for(const n of keep)if(n.attendance_id!==target.id)await db.batch([
   db.prepare("INSERT INTO lucky_number_reconciliations(promotion_id,number_id,code,member_id,unit,reason,details_json) VALUES(?,?,?,?,?,'VINCULO_SESSAO_CONFIRMADO',?)").bind(promotionId,n.id,n.code,member.id,promo.unit,JSON.stringify({from:n.attendance_id,to:target.id,session:key})),
   db.prepare('UPDATE lucky_numbers SET attendance_id=? WHERE id=? AND attendance_id=?').bind(target.id,n.id,n.attendance_id)]);
 }
}
async function syncLuckyMember(env,member,promo,canonical=null,candidate=null){if(promo.luckyNumber?.generationMode==="constancy")return syncLuckyConstancy(env,member,promo,canonical);const dp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dp.id,member.id).run();const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),ah=await env.DB.prepare("SELECT attendance_key,attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all();if(canonical)ah.results=canonical.map(a=>({...a,attendance_key:[promo.unit||'bike',member.id,a.attendance_date,a.id_activity_session].join(':')}));if(canonical)await reconcileLuckyDuplicates(env.DB,dp.id,member,promo,canonical,candidate);for(const a of uniqueLuckyAttendance(ah.results||[]))await env.DB.prepare("INSERT OR IGNORE INTO promotion_attendance(promotion_id,participant_id,studio,occurred_at,reference_month,source,source_ref,status) VALUES(?,?,?,?,?,'EVO',?,'VALID')").bind(dp.id,pt.id,promo.unit||"bike",a.attendance_date,String(a.attendance_date).slice(0,7),a.attendance_key).run();const cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=cfg.milestones||[],initial=String(member.first_name||"X").charAt(0).toUpperCase(),prefix=(promo.unit==="gym"?"G":"B")+"-"+member.evo_member_id+"-"+initial+"-";let seq=1;const all=await env.DB.prepare("SELECT code FROM lucky_numbers WHERE promotion_id=?").bind(dp.id).all(),taken=new Set((all.results||[]).map(x=>x.code));while(taken.has(prefix+String(seq).padStart(3,"0")))seq++;const next=()=>{let x;do{x=prefix+String(seq++).padStart(3,"0")}while(taken.has(x));taken.add(x);return x},pa=await env.DB.prepare("SELECT id,reference_month,source_ref FROM promotion_attendance WHERE promotion_id=? AND participant_id=? AND status='VALID' ORDER BY occurred_at,id").bind(dp.id,pt.id).all(),months={};for(const a of (pa.results||[]).filter(a=>!canonical||ah.results.some(h=>h.attendance_key===a.source_ref)))(months[a.reference_month]??=[]).push(a);for(const[month,rows]of Object.entries(months)){let active=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND reference_month=? AND status='ACTIVE'").bind(dp.id,pt.id,month).first()).n;for(const a of rows){const n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND attendance_id=? AND status='ACTIVE'").bind(dp.id,pt.id,a.id).first()).n;for(let i=n;i<per&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,attendance_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ATTENDANCE','ACTIVE')").bind(dp.id,pt.id,a.id,next(),month,promo.unit||"bike").run()}for(const g of goals){if(rows.length<+g.attendance)continue;await env.DB.prepare("INSERT OR IGNORE INTO promotion_bonus_awards(promotion_id,participant_id,reference_month,studio,milestone,quantity,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance,+g.bonus).run();const aw=await env.DB.prepare("SELECT id,quantity FROM promotion_bonus_awards WHERE promotion_id=? AND participant_id=? AND reference_month=? AND studio=? AND milestone=?").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance).first(),n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE bonus_award_id=? AND status='ACTIVE'").bind(aw.id).first()).n;for(let i=n;i<aw.quantity&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,bonus_award_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'BONUS','ACTIVE')").bind(dp.id,pt.id,aw.id,next(),month,promo.unit||"bike").run()}}return {attendance:(ah.results||[]).length}}
async function luckyV2(request,env){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const b=await readJson(request),key=String(b.promotionId||""),promo=await clubContentItem(env,"promotion",key);if(!promo)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);if(!(await promotionEligible(env,member,promo)))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);await evoAttendance(env,member.evo_member_id,promo.start,promo.end,member.id,(promo.unit||"bike")==="gym"?"gym":"bike");if(promo.luckyNumber?.generationMode==="constancy"){const result=await syncLuckyConstancy(env,member,promo);const dp2=await ensurePromotion(env,promo);const rr2=await env.DB.prepare("SELECT l.code,l.origin,l.issued_at,l.reference_month,l.status FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id WHERE l.promotion_id=? AND pp.member_id=? AND l.status='ACTIVE'").bind(dp2.id,member.id).all();return json({ok:true,total:(rr2.results||[]).length,codes:rr2.results||[],attendance:result.attendance})}const dp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dp.id,member.id).run();const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),ah=await env.DB.prepare("SELECT attendance_key,attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all();for(const a of uniqueLuckyAttendance(ah.results||[]))await env.DB.prepare("INSERT OR IGNORE INTO promotion_attendance(promotion_id,participant_id,studio,occurred_at,reference_month,source,source_ref,status) VALUES(?,?,?,?,?,'EVO',?,'VALID')").bind(dp.id,pt.id,promo.unit||"bike",a.attendance_date,String(a.attendance_date).slice(0,7),a.attendance_key).run();const cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=cfg.milestones||[],initial=String(member.first_name||"X").charAt(0).toUpperCase(),prefix=(promo.unit==="gym"?"G":"B")+"-"+member.evo_member_id+"-"+initial+"-";let seq=1;const all=await env.DB.prepare("SELECT code FROM lucky_numbers WHERE promotion_id=?").bind(dp.id).all();const taken=new Set((all.results||[]).map(x=>x.code));while(taken.has(prefix+String(seq).padStart(3,"0")))seq++;const next=()=>{let x;do{x=prefix+String(seq++).padStart(3,"0")}while(taken.has(x));taken.add(x);return x};const pa=await env.DB.prepare("SELECT id,reference_month FROM promotion_attendance WHERE promotion_id=? AND participant_id=? AND status='VALID' ORDER BY occurred_at,id").bind(dp.id,pt.id).all();const months={};for(const a of pa.results||[])(months[a.reference_month]??=[]).push(a);for(const [month,rows] of Object.entries(months)){let active=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND reference_month=? AND status='ACTIVE'").bind(dp.id,pt.id,month).first()).n;for(const a of rows){const n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND attendance_id=?").bind(dp.id,pt.id,a.id).first()).n;for(let i=n;i<per&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,attendance_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ATTENDANCE','ACTIVE')").bind(dp.id,pt.id,a.id,next(),month,promo.unit||"bike").run()}for(const g of goals){if(rows.length<+g.attendance)continue;await env.DB.prepare("INSERT OR IGNORE INTO promotion_bonus_awards(promotion_id,participant_id,reference_month,studio,milestone,quantity,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance,+g.bonus).run();const aw=await env.DB.prepare("SELECT id,quantity FROM promotion_bonus_awards WHERE promotion_id=? AND participant_id=? AND reference_month=? AND studio=? AND milestone=?").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance).first(),n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE bonus_award_id=?").bind(aw.id).first()).n;for(let i=n;i<aw.quantity&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,bonus_award_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'BONUS','ACTIVE')").bind(dp.id,pt.id,aw.id,next(),month,promo.unit||"bike").run()}}const rr=await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dp.id,pt.id).all();return json({ok:true,total:(rr.results||[]).length,codes:rr.results||[],attendance:(ah.results||[]).length})}



class EvoConfigError extends Error {
  constructor(code) { super(code); this.code=code; }
}
function validEvoExpiry(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
}
async function getEvoConfig(env, unit="bike") {
  unit=String(unit||"bike").toLowerCase();
  if (!["bike","gym"].includes(unit)) throw new EvoConfigError("UNIDADE_EVO_NAO_SUPORTADA");
  let row;
  try { row=await env.DB.prepare("SELECT dns,token,expires_at,enabled FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first(); }
  catch { throw new EvoConfigError("EVO_CONFIG_INDISPONIVEL"); }
  if (!row) throw new EvoConfigError("EVO_NAO_CONFIGURADA");
  if (Number(row.enabled)!==1) throw new EvoConfigError("EVO_CONFIG_DESATIVADA");
  const dns=String(row.dns||"").trim(),token=String(row.token||"").trim();
  if (!dns || !token) throw new EvoConfigError("EVO_CONFIG_INCOMPLETA");
  const expiry=String(row.expires_at||"");
  if (!validEvoExpiry(expiry)) throw new EvoConfigError("EVO_VALIDADE_INVALIDA");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if (expiry<today) throw new EvoConfigError("CREDENCIAL_EVO_EXPIRADA");
  return {unit,dns,token,expires_at:expiry,enabled:true};
}
function allowedEvoTarget(value, method) {
  let url; try { url=new URL(value); } catch { return null; }
  if (url.protocol!=="https:" || url.port || url.username || url.password || url.hash || !["evo-integracao.w12app.com.br","evo-integracao-api.w12app.com.br"].includes(url.hostname)) return null;
  const path=url.pathname;
  if(method==="POST")return (path==="/api/v2/voucher"||path==="/api/v2/sales")&&!url.search?url:null;
  if (method==="PUT") return path==="/api/v1/members/fitcoins" ? url : null;
  if (method!=="GET") return null;
  if(path==="/api/v1/receivables")return /^\?idSale=[1-9]\d*$/.test(url.search)?url:null;
  if(/^\/api\/v2\/sales\/[1-9]\d*$/.test(path)&&!url.search)return url;
  if(path==="/api/v2/sales")return url.searchParams.size===5&&["idMember","startDate","endDate","take","skip"].every(k=>url.searchParams.has(k))&&/^\d+$/.test(url.searchParams.get("idMember")||"")&&/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("startDate")||"")&&url.searchParams.get("startDate")===url.searchParams.get("endDate")&&url.searchParams.get("take")==="100"&&url.searchParams.get("skip")==="0"?url:null;
  if (path==="/api/v1/prospects" || (path==="/api/v2/members" && (url.searchParams.has("registerDateStart") || url.searchParams.has("registerDateEnd")))) {
    const p=url.searchParams,from=p.get("registerDateStart")||"",to=p.get("registerDateEnd")||"",take=p.get("take")||"",skip=p.get("skip")||"";
    if(p.size!==4||!["registerDateStart","registerDateEnd","take","skip"].every(k=>p.has(k))||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to)||!/^(0|[1-9][0-9]*)$/.test(skip)||!["50","100","250","500","600"].includes(take))return null;
    const start=Date.parse(from+"T12:00:00Z"),end=Date.parse(to+"T12:00:00Z");
    if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString().slice(0,10)!==from||new Date(end).toISOString().slice(0,10)!==to||end<start||end-start>30*86400000||Number(skip)>60000)return null;
    return url;
  }
  if (path==="/api/v2/management/activeclients" || path==="/api/v2/members/active-members") return url;
  return /^\/api\/v[123]\/(?:members(?:\/\d+|\/basic|\/fitcoins)?|activities(?:\/schedule(?:\/detail)?|\/member\/sessions)?|membership(?:\/category)?|membermembership)$/.test(path) ? url : null;
}


// Current Bike students: staging is isolated from operational and historical caches.
async function runAutoLinkD1(env,{trigger="manual",actorType="SYSTEM",force=false}={}) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
  const setting=await env.DB.prepare("SELECT value FROM club_settings WHERE key='auto_member_link' LIMIT 1").first(),enabled=setting?.value==="1";
  if(!enabled&&!force)return {ok:true,enabled:false,skippedRun:true,candidates:0,created:0,skipped:0,conflicts:0,evoRequestsMade:0};
  const rows=(await env.DB.prepare("WITH b AS(SELECT json_extract(personal_json,'$.document') cpf,MIN(evo_member_id) bike_id,COUNT(*) n FROM evo_member_master WHERE unit='bike' AND is_current=1 AND length(json_extract(personal_json,'$.document'))=11 GROUP BY cpf),g AS(SELECT json_extract(personal_json,'$.document') cpf,MIN(evo_member_id) gym_id,COUNT(*) n FROM evo_member_master WHERE unit='gym' AND is_current=1 AND length(json_extract(personal_json,'$.document'))=11 GROUP BY cpf) SELECT b.cpf,b.bike_id,g.gym_id FROM b JOIN g USING(cpf) WHERE b.n=1 AND g.n=1").all()).results||[];
  let created=0,skipped=0,conflicts=0;
  for(const x of rows){
    const cpf=String(x.cpf),hash=await sha256(cpf);
    let m=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id FROM members WHERE cpf_hash=? LIMIT 1").bind(hash).first();
    if(!m){
      const bikeExisting=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id,cpf_hash FROM members WHERE CAST(evo_member_id AS TEXT)=? LIMIT 1").bind(String(x.bike_id)).first();
      const gymExisting=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id,cpf_hash FROM members WHERE CAST(gym_client_id AS TEXT)=? LIMIT 1").bind(String(x.gym_id)).first();
      if(gymExisting&&(!bikeExisting||Number(gymExisting.id)!==Number(bikeExisting.id))){conflicts++;continue}
      const src=await env.DB.prepare("SELECT personal_json FROM evo_member_master WHERE unit='bike' AND evo_member_id=? AND is_current=1 LIMIT 1").bind(String(x.bike_id)).first();
      let p={};try{p=JSON.parse(src?.personal_json||"{}")}catch{}
      const first=String(p.firstName||p.name||"Aluno").trim().slice(0,120),last=String(p.lastName||"").trim().slice(0,160),email=normalizeEmail(p.email||p.emailAddress||p.mail||""),birth=normalizeDate(p.birthDate||p.dateBirth||p.birthdate||p.birthday||"");
      if(bikeExisting){
        if(!String(bikeExisting.cpf_hash||"").startsWith("evo-placeholder:")){conflicts++;continue}
        await env.DB.prepare("UPDATE members SET gym_client_id=?,cpf_hash=?,cpf_last4=?,first_name=CASE WHEN first_name IS NULL OR first_name='' OR first_name='Aluno' THEN ? ELSE first_name END,last_name=CASE WHEN last_name IS NULL OR last_name='' THEN ? ELSE last_name END,email=COALESCE(NULLIF(email,''),?),birth_date=COALESCE(NULLIF(birth_date,''),?),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(x.gym_id),hash,cpf.slice(-4),first,last,email||null,birth||null,bikeExisting.id).run();
      }else{
        await env.DB.prepare("INSERT INTO members(evo_member_id,gym_client_id,cpf_hash,cpf_last4,first_name,last_name,email,birth_date,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)").bind(String(x.bike_id),String(x.gym_id),hash,cpf.slice(-4),first,last,email||null,birth||null).run();
      }
      m=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id FROM members WHERE cpf_hash=? LIMIT 1").bind(hash).first();
      if(!m){skipped++;continue}
    }
    if((m.evo_member_id&&String(m.evo_member_id)!==String(x.bike_id))||(m.gym_client_id&&String(m.gym_client_id)!==String(x.gym_id))){conflicts++;continue}
    const collision=await env.DB.prepare("SELECT id FROM members WHERE CAST(gym_client_id AS TEXT)=? AND id<>? LIMIT 1").bind(String(x.gym_id),m.id).first();if(collision){conflicts++;continue}
    const priorLink=await env.DB.prepare("SELECT member_id,status FROM gym_member_links WHERE gym_client_id=? LIMIT 1").bind(String(x.gym_id)).first();
  const isNewLink=!priorLink||priorLink.status!=="ACTIVE"||Number(priorLink.member_id)!==Number(m.id);
  await env.DB.batch([env.DB.prepare("UPDATE members SET evo_member_id=?,gym_client_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(x.bike_id),String(x.gym_id),m.id),env.DB.prepare("INSERT INTO gym_member_links(gym_client_id,member_id,link_source,status,linked_at) VALUES(?,?,'AUTO_D1_CPF','ACTIVE',CURRENT_TIMESTAMP) ON CONFLICT(gym_client_id) DO UPDATE SET member_id=excluded.member_id,link_source='AUTO_D1_CPF',status='ACTIVE',linked_at=CURRENT_TIMESTAMP").bind(String(x.gym_id),m.id)]);
    if(isNewLink)created++;
  }
  await audit(env,actorType,null,"AUTO_LINK_RUN","SYSTEM","d1",{candidates:rows.length,created,skipped,conflicts,evoRequestsMade:0,trigger,automatic:true});

  return {ok:true,enabled,candidates:rows.length,created,skipped,conflicts,evoRequestsMade:0,trigger};
}

async function currentStudentJob(env, body) {
  const unit=String(body.unit||'bike').toLowerCase()==='gym'?'gym':'bike';
  const db=env.DB;
  if(body.action==='begin') {
    await db.prepare("UPDATE evo_current_runs_v2 SET state='failed',error='SINCRONIZACAO_EXPIRADA' WHERE state='running' AND updated_at<datetime('now','-10 minutes')").run();
    const running=await db.prepare("SELECT id FROM evo_current_runs_v2 WHERE unit=? AND state='running'").bind(unit).first();
    if(running)return {status:409,ok:false,error:'SINCRONIZACAO_JA_EM_ANDAMENTO'};
    const id=crypto.randomUUID();
    await db.prepare("INSERT INTO evo_current_runs_v2(id,unit,state) VALUES(?,?,'running')").bind(id,unit).run();
    return {ok:true,runId:id,nextSkip:0,pageSize:600};
  }
  const run=await db.prepare("SELECT * FROM evo_current_runs_v2 WHERE id=? AND unit=?").bind(String(body.runId||''),unit).first();
  if(!run||run.state!=='running')return {status:409,ok:false,error:'SINCRONIZACAO_INATIVA'};
  if(body.action==='fail') {
    await db.prepare("UPDATE evo_current_runs_v2 SET state='failed',error=?,requests=requests+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='running'").bind(String(body.error||'EVO_FALHOU').slice(0,80),Number(body.requests||0),run.id).run();
    return {ok:true};
  }
  if(body.action==='check')return {ok:true,runId:run.id,nextSkip:run.next_skip,pageSize:600};
  const rows=body.students,pageSize=Number(body.pageSize||25);
  if(![25,50,75,100,150,250,500,600].includes(pageSize))return {status:422,ok:false,error:'TAMANHO_LOTE_INVALIDO'};
  if(body.action!=='ingest'||!Array.isArray(rows)||rows.length>pageSize||body.skip!==run.next_skip)return {status:409,ok:false,error:'LOTE_FORA_DE_ORDEM'};
  const ids=new Set();
  for(const s of rows){
    if(!/^\d+$/.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||s.name.length>200||!['Active','Suspended'].includes(s.status)||typeof s.gympass!=='boolean'||typeof s.totalpass!=='boolean'||(s.fitcoins!==null&&!Number.isFinite(s.fitcoins))||typeof s.vip!=='boolean'||!Array.isArray(s.vipMemberships)||!s.raw||typeof s.raw!=='object'||String(s.raw.idMember)!==s.id)return {status:422,ok:false,error:'LOTE_INVALIDO'};
    ids.add(s.id);
  }
  const old=(await db.prepare('SELECT evo_member_id FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id).all()).results||[];
  if(old.some(s=>ids.has(s.evo_member_id)))return {status:409,ok:false,error:'PAGINACAO_DUPLICADA'};
  const report=body.skip===0?body.reportIds:JSON.parse(run.report_ids||'null');
  if(!Array.isArray(report)||report.some(id=>!/^\d+$/.test(String(id))))return {status:422,ok:false,error:'RELATORIO_ATIVOS_INVALIDO'};
  const next=run.next_skip+rows.length,requests=run.requests+Number(body.skip===0?2:1),done=rows.length<pageSize;
  if(pageSize===50&&done&&next<new Set(report.map(String)).size)return {status:422,ok:false,error:'PAGINACAO_INCOMPLETA_RELATORIO_ATIVOS'};
  await db.batch([
    db.prepare("INSERT INTO evo_current_stage_v2(run_id,evo_member_id,payload) SELECT ?,json_extract(value,'$.id'),value FROM json_each(?)").bind(run.id,JSON.stringify(rows)),
    db.prepare("UPDATE evo_current_runs_v2 SET next_skip=?,requests=?,report_ids=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='running'").bind(next,requests,JSON.stringify(report),run.id),
  ]);  // Lossless EVO snapshot + categorized projections. No extra EVO requests.
  const masterStatements=[],contractStatements=[];
  for(const s of rows){
    const m=s.raw||{}, memberships=Array.isArray(m.memberships)?m.memberships:Array.isArray(m.memberMemberships)?m.memberMemberships:Array.isArray(m.membership)?m.membership:[];
    const personal={idMember:m.idMember,firstName:m.firstName,lastName:m.lastName,registerName:m.registerName,registerLastName:m.registerLastName,usePreferredName:m.usePreferredName,registerDate:m.registerDate,document:m.document,documentId:m.documentId,maritalStatus:m.maritalStatus,gender:m.gender,birthDate:m.birthDate};
    const address={address:m.address,state:m.state,city:m.city,zipCode:m.zipCode,complement:m.complement,neighborhood:m.neighborhood,number:m.number};
    const access={membershipStatus:m.membershipStatus,status:m.status,accessBlocked:m.accessBlocked,blockedReason:m.blockedReason,accessCardNumber:m.accessCardNumber,penalized:m.penalized,lastAccessDate:m.lastAccessDate};
    const financial={totalFitCoins:m.totalFitCoins,totalFitcoins:m.totalFitcoins};
    const integrations={gympassId:m.gympassId,codeTotalpass:m.codeTotalpass,idBranch:m.idBranch,branchName:m.branchName};
    const metadata={updateDate:m.updateDate,sourceEndpoint:'/api/v2/members?status=1&showMemberships=true'};
    masterStatements.push(db.prepare("INSERT INTO evo_member_master(unit,evo_member_id,is_current,personal_json,contacts_json,address_json,access_json,financial_json,integrations_json,memberships_json,metadata_json,raw_json,source_run_id,evo_updated_at,synced_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET is_current=1,personal_json=excluded.personal_json,contacts_json=excluded.contacts_json,address_json=excluded.address_json,access_json=excluded.access_json,financial_json=excluded.financial_json,integrations_json=excluded.integrations_json,memberships_json=excluded.memberships_json,metadata_json=excluded.metadata_json,raw_json=excluded.raw_json,source_run_id=excluded.source_run_id,evo_updated_at=excluded.evo_updated_at,synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,JSON.stringify(personal),JSON.stringify(Array.isArray(m.contacts)?m.contacts:[]),JSON.stringify(address),JSON.stringify(access),JSON.stringify(financial),JSON.stringify(integrations),JSON.stringify(memberships),JSON.stringify(metadata),JSON.stringify(m),run.id,m.updateDate||null));
    // O espelho resumido de alunos pode trazer memberships sem datas/sessoes.
    // Nunca substituir contratos detalhados por esse resumo incompleto.
    for(const x of memberships){
      const mm=x?.idMemberMembership??x?.idMembershipMember;
      const start=x?.startDate??x?.startDateMembership;
      const end=x?.endDate??x?.endDateMembership;
      if(!/^\\d+$/.test(String(mm??""))||!start||!end)continue;
      const key=String(mm);
      contractStatements.push(db.prepare("INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,source_run_id,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,contract_key) DO UPDATE SET id_membership=excluded.id_membership,id_member_membership=excluded.id_member_membership,category_id=excluded.category_id,membership_name=excluded.membership_name,membership_status=excluded.membership_status,start_date=excluded.start_date,end_date=excluded.end_date,cancel_date=excluded.cancel_date,sale_date=excluded.sale_date,is_additional=excluded.is_additional,raw_json=excluded.raw_json,source_run_id=excluded.source_run_id,synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,key,x?.idMembership==null?null:String(x.idMembership),key,x?.idCategoryMembership==null?null:String(x.idCategoryMembership),x?.nameMembership??x?.name??null,x?.membershipStatus??x?.statusMemberMembership??x?.status??null,start,end,x?.cancelDate??null,x?.saleDate??null,x?.flAdditionalMembership?1:0,JSON.stringify(x),run.id));
    }
  }
  for(let i=0;i<masterStatements.length;i+=40)await db.batch(masterStatements.slice(i,i+40));
  for(let i=0;i<contractStatements.length;i+=40)await db.batch(contractStatements.slice(i,i+40));
  if(!done)return {ok:true,runId:run.id,nextSkip:next,pageSize:unit==='bike'?600:25,done:false};
  const fresh=(await db.prepare('SELECT payload FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id).all()).results.map(x=>JSON.parse(x.payload));
  if(!fresh.length)return {status:422,ok:false,error:'POPULACAO_VAZIA_NAO_PUBLICADA'};
  const previous=(await db.prepare("SELECT s.*,group_concat(c.category||':'||c.subtype) categories FROM evo_students s LEFT JOIN evo_student_categories c USING(unit,evo_member_id) WHERE s.unit=? AND s.is_current=1 GROUP BY s.evo_member_id").bind(unit).all()).results;
  const before=new Map(previous.map(x=>[x.evo_member_id,x])),after=new Set(fresh.map(x=>x.id));
  let added=0,changed=0;
  for(const s of fresh){const p=before.get(s.id);if(!p)added++;else if(p.display_name!==s.name||p.membership_status!==s.status||p.fitcoins!==s.fitcoins||Boolean((p.categories||'').includes('aggregator:gympass'))!==s.gympass||Boolean((p.categories||'').includes('aggregator:totalpass'))!==s.totalpass||Boolean((p.categories||'').includes('vip:found'))!==s.vip)changed++;}
  const removed=previous.filter(x=>!after.has(x.evo_member_id)).length;
  const statement=db.prepare("INSERT INTO evo_students(unit,evo_member_id,display_name,membership_status,fitcoins,is_current,last_run) SELECT ?,evo_member_id,json_extract(payload,'$.name'),json_extract(payload,'$.status'),json_extract(payload,'$.fitcoins'),1,run_id FROM evo_current_stage_v2 WHERE run_id=? ON CONFLICT(unit,evo_member_id) DO UPDATE SET display_name=excluded.display_name,membership_status=excluded.membership_status,fitcoins=COALESCE(excluded.fitcoins,evo_students.fitcoins),is_current=1,last_run=excluded.last_run,updated_at=CURRENT_TIMESTAMP").bind(unit,run.id);
  await db.batch([
    statement,
    db.prepare("UPDATE evo_students SET is_current=0,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND last_run<>? AND is_current=1").bind(unit,run.id),
    db.prepare("UPDATE evo_member_master SET is_current=0 WHERE unit=? AND source_run_id<>? AND is_current=1").bind(unit,run.id),
    db.prepare("DELETE FROM evo_student_categories WHERE unit=?").bind(unit),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'aggregator','gympass','member_registration' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.gympass')=1").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'aggregator','totalpass','member_registration' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.totalpass')=1").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'suspended','','membershipStatus' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.status')='Suspended'").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'vip','found','members_current_memberships' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.vip')=1").bind(unit,run.id),
    db.prepare("UPDATE evo_current_runs_v2 SET state='done',added=?,changed=?,removed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(added,changed,removed,run.id),
    db.prepare("UPDATE evo_sync_config SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=?,updated_at=CURRENT_TIMESTAMP WHERE unit=?").bind(requests,unit),
    db.prepare('DELETE FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id),
  ]);
  let autoLink=null;try{autoLink=await runAutoLinkD1(env,{trigger:"student_sync:"+unit,actorType:"SYSTEM"});}catch(e){autoLink={ok:false,error:String(e?.message||e),evoRequestsMade:0};}
  return {ok:true,runId:run.id,nextSkip:next,done:true,total:next,added,changed,removed,autoLink};
}
async function currentStudentsView(env, unit='bike') {
  unit=unit==='gym'?'gym':'bike'; const db=env.DB;
  const run=await db.prepare("SELECT * FROM evo_current_runs_v2 WHERE unit=? AND state='done' ORDER BY updated_at DESC,rowid DESC LIMIT 1").bind(unit).first();
  const total=await db.prepare("SELECT COUNT(*) total,SUM(membership_status='Active') statusActive,SUM(membership_status='Suspended') suspended FROM evo_students WHERE unit=? AND is_current=1").bind(unit).first();
  const agg=await db.prepare("WITH a AS (SELECT evo_member_id,subtype FROM evo_student_categories WHERE unit=? AND category='aggregator' UNION SELECT evo_member_id,CASE WHEN membership_name='TOTALPASS' THEN 'totalpass' ELSE 'gympass' END FROM evo_member_contracts WHERE unit=? AND membership_status='1' AND membership_name IN ('TOTALPASS','WELLHUB (GYMPASS)') AND substr(json_extract(raw_json,'$.membershipStart'),1,10)<=date('now','-3 hours') AND substr(json_extract(raw_json,'$.membershipEnd'),1,10)>=date('now','-3 hours')) SELECT COUNT(DISTINCT evo_member_id) aggregators,SUM(subtype='gympass') gympass,SUM(subtype='totalpass') totalpass FROM a").bind(unit,unit).first();
  const inactiveMaster=await db.prepare("SELECT COUNT(*) n FROM evo_member_master WHERE unit=? AND is_current=0").bind(unit).first();
  const vip=await db.prepare("SELECT COUNT(DISTINCT evo_member_id) vip FROM evo_student_categories WHERE unit=? AND category='vip' AND subtype='found'").bind(unit).first();
  const comparison=await db.prepare("WITH e AS(SELECT evo_member_id id FROM evo_students WHERE unit=? AND is_current=1),c AS(SELECT DISTINCT CAST(evo_member_id AS TEXT) id FROM members WHERE evo_member_id IS NOT NULL) SELECT (SELECT COUNT(*) FROM c) linked,(SELECT COUNT(*) FROM e JOIN c USING(id)) both,(SELECT COUNT(*) FROM e WHERE id NOT IN(SELECT id FROM c)) onlyEvo,(SELECT COUNT(*) FROM c WHERE id NOT IN(SELECT id FROM e)) onlyClub").bind(unit).first();
  const logs=(await db.prepare("SELECT added,changed,removed,requests,updated_at createdAt,'População atual filtrada; histórico preservado.' details FROM evo_current_runs_v2 WHERE state='done' AND unit=? ORDER BY updated_at DESC LIMIT 20").bind(unit).all()).results;
  let active=total?.statusActive||0; try{if(run?.report_ids)active=new Set(JSON.parse(run.report_ids)).size}catch{}
  return {ok:true,unit,source:'d1-current',counts:{active,inactive:Number(inactiveMaster?.n||0),total:total?.total||0,statusActive:total?.statusActive||0,suspended:total?.suspended||0,aggregators:agg?.aggregators||0,gympass:agg?.gympass||0,totalpass:agg?.totalpass||0,vip:vip?.vip||0},comparison,lastSyncAt:run?.updated_at||null,lastRequests:run?.requests||0,logs,note:'Ativos: relatório de contratos. Agregadores: identificadores no cadastro atual; podem se sobrepor. VIP: categoria VIP encontrada nos contratos retornados pela população atual; vigência será tratada separadamente. Sem apagar históricos.'};
}

// deploy-trigger: gym-d1-dashboard


// Central de Atividades: consultas exclusivamente D1. Sem transporte EVO.
export const activityTypes = [
  ['reservation','Reservas','unavailable','Não há fonte de reservas no D1.'],
  ['cancellation','Cancelamentos','unavailable','Não há fonte de cancelamentos no D1.'],
  ['workout_created','Treinos criados','partial','Atividades pessoais registradas no Pop Fit; não são aulas reservadas.'],
  ['workout_edited','Treinos editados','partial','Edições do Pop Fit capturadas a partir desta publicação.'],
  ['image_generated','Imagens geradas','partial','Histórico anterior limitado às imagens ainda armazenadas. Novas gerações são auditadas.'],
  ['share_clicked','Cliques em compartilhar','partial','Cliques capturados a partir desta publicação; não comprovam envio.'],
  ['referral','Indicações','unavailable','Não há fonte de indicações no D1.'],
  ['currency_movement','Movimentações de moedas','complete','Créditos e débitos de moedas próprias confirmados no D1.'],
  ['fitcoins_granted','Fitcoins concedidos','partial','Créditos concluídos de missões/promoções no D1; estornos excluídos.'],
  ['reward_requested','Recompensas solicitadas','partial','Resgates do D1 e cópia do conteúdo. Operações legadas salvas apenas no GitHub não estão incluídas em tempo real.'],
  ['reward_completed','Recompensas concluídas','partial','Conclusões com data no D1; operações legadas do GitHub podem estar ausentes.'],
  ['failure','Falhas registradas','partial','Falhas de primeiro acesso auditadas; não representa todas as falhas do sistema.']
];
export function activityParams(p) {
  const unit=p.get('unit'),start=p.get('start'),end=p.get('end');
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10)===d;
  const category=p.get('category')||'',status=p.get('status')||'',origin=p.get('origin')||'',search=(p.get('search')||'').trim(),page=Number(p.get('page')||1);
  if(!['bike','gym','club'].includes(unit)||!valid(start)||!valid(end)||start>end||(Date.parse(end)-Date.parse(start))/86400000>365||search.length>80||!Number.isSafeInteger(page)||page<1||page>10000||category&&!activityTypes.some(x=>x[0]===category)||status&&!['confirmed','failed'].includes(status)||origin&&!['Pop Fit','Auditoria','Resgates D1','Conteúdo D1'].includes(origin))throw new Error('PARAMETROS_INVALIDOS');
  // São Paulo: limites do dia local convertidos em UTC, mantendo o banco em UTC.
  return {unit,start,end,category,status,origin,search,page,from:start+'T03:00:00Z',until:new Date(Date.parse(end+'T03:00:00Z')+86400000).toISOString()};
}
export const activityCTE = `WITH
content_redemptions AS (SELECT j.value v FROM app_content c,json_each(c.content_json,'$.redemptions') j WHERE c.content_key='club-pop'),
content_transactions AS (SELECT j.value v FROM app_content c,json_each(c.content_json,'$.transactions') j WHERE c.content_key='club-pop'),
event_group_0(id,at,member_id,unit,category,origin,status,amount) AS MATERIALIZED (
 SELECT 'manual:'||id,created_at,member_id,'club','workout_created','Pop Fit','confirmed',1 FROM pop_fit_manual_activities
 UNION ALL SELECT 'image:'||id,created_at,member_id,scope,'image_generated','Pop Fit','confirmed',1 FROM pop_fit_images i WHERE NOT EXISTS(SELECT 1 FROM audit_log a WHERE a.action='POP_FIT_IMAGE_GENERATED' AND a.entity_type='POP_FIT_IMAGE' AND a.entity_id=CAST(i.id AS TEXT))
 UNION ALL SELECT 'audit:'||id,created_at,CASE WHEN actor_type='MEMBER' THEN actor_id END,
 CASE WHEN json_valid(metadata_json) THEN COALESCE(json_extract(metadata_json,'$.unit'),'club') ELSE 'club' END,
 CASE action WHEN 'POP_FIT_EDITED' THEN 'workout_edited' WHEN 'POP_FIT_IMAGE_GENERATED' THEN 'image_generated' WHEN 'POP_FIT_SHARE_CLICKED' THEN 'share_clicked' ELSE 'failure' END,
 CASE WHEN action LIKE 'POP_FIT_%' THEN 'Pop Fit' ELSE 'Auditoria' END,
 CASE WHEN action LIKE 'POP_FIT_%' THEN 'confirmed' ELSE 'failed' END,1
 FROM audit_log WHERE action IN ('POP_FIT_EDITED','POP_FIT_IMAGE_GENERATED','POP_FIT_SHARE_CLICKED','FIRST_ACCESS_DATA_MISMATCH','FIRST_ACCESS_MEMBER_NOT_FOUND')),
event_group_1(id,at,member_id,unit,category,origin,status,amount) AS MATERIALIZED (SELECT 'redemption-request:'||id,requested_at,member_id,COALESCE(unit,'club'),'reward_requested','Resgates D1','confirmed',1 FROM redemptions
 UNION ALL SELECT 'redemption-complete:'||id,completed_at,member_id,COALESCE(unit,'club'),'reward_completed','Resgates D1','confirmed',1 FROM redemptions WHERE completed_at IS NOT NULL
 UNION ALL SELECT 'content-request:'||json_extract(v,'$.id'),json_extract(v,'$.createdAt'),(SELECT id FROM members WHERE (json_extract(v,'$.unit')='bike' AND CAST(evo_member_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) OR (json_extract(v,'$.unit')='gym' AND CAST(gym_client_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) LIMIT 1),COALESCE(json_extract(v,'$.unit'),'club'),'reward_requested','Conteúdo D1','confirmed',1 FROM content_redemptions),
event_group_2(id,at,member_id,unit,category,origin,status,amount) AS MATERIALIZED (SELECT 'content-complete:'||json_extract(v,'$.id'),json_extract(v,'$.completedAt'),(SELECT id FROM members WHERE (json_extract(v,'$.unit')='bike' AND CAST(evo_member_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) OR (json_extract(v,'$.unit')='gym' AND CAST(gym_client_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) LIMIT 1),COALESCE(json_extract(v,'$.unit'),'club'),'reward_completed','Conteúdo D1','confirmed',1 FROM content_redemptions WHERE json_extract(v,'$.completedAt') IS NOT NULL
 UNION ALL SELECT 'transaction:'||json_extract(v,'$.id'),json_extract(v,'$.createdAt'),(SELECT id FROM members WHERE (json_extract(v,'$.unit')='bike' AND CAST(evo_member_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) OR (json_extract(v,'$.unit')='gym' AND CAST(gym_client_id AS TEXT)=CAST(json_extract(v,'$.memberId') AS TEXT)) LIMIT 1),COALESCE(json_extract(v,'$.unit'),'club'),'fitcoins_granted','Conteúdo D1','confirmed',CAST(json_extract(v,'$.fitcoins') AS REAL) FROM content_transactions WHERE json_extract(v,'$.status')='COMPLETED' AND json_extract(v,'$.direction')='credit' AND json_extract(v,'$.origin') IN ('mission','promotion') AND CAST(json_extract(v,'$.fitcoins') AS REAL)>0
),
events(id,at,member_id,unit,category,origin,status,amount) AS (SELECT 'currency:'||id,created_at,member_id,unit,'currency_movement','Conteúdo D1','confirmed',amount FROM club_currency_transactions UNION ALL SELECT * FROM event_group_0 UNION ALL SELECT * FROM event_group_1 UNION ALL SELECT * FROM event_group_2), named AS (SELECT e.*,trim(COALESCE(m.first_name,'')||' '||COALESCE(m.last_name,'')) name FROM events e LEFT JOIN members m ON m.id=e.member_id), filtered AS (SELECT * FROM named WHERE datetime(at)>=datetime(?) AND datetime(at)<datetime(?) AND (?='club' OR unit=?) AND (?='' OR category=?) AND (?='' OR status=?) AND (?='' OR origin=?) AND (?='' OR instr(lower(name),lower(?))>0 OR CAST(member_id AS TEXT)=?)) `;
export async function readActivityCenter(env,p) {
 const args=[p.from,p.until,p.unit,p.unit,p.category,p.category,p.status,p.status,p.origin,p.origin,p.search,p.search,p.search];
 const result=await env.DB.batch([
  env.DB.prepare(activityCTE+'SELECT category,COUNT(*) count,SUM(amount) amount FROM filtered GROUP BY category').bind(...args),
  env.DB.prepare(activityCTE+'SELECT id,at,member_id,unit,category,origin,status,amount,name FROM filtered ORDER BY datetime(at) DESC,id DESC LIMIT 50 OFFSET ?').bind(...args,(p.page-1)*50),
  env.DB.prepare("SELECT COUNT(*) count FROM evo_member_attendance WHERE substr(attendance_date,1,10) BETWEEN ? AND ? AND (?='club' OR unit=?)").bind(p.start,p.end,p.unit,p.unit),
  env.DB.prepare("SELECT COUNT(*) count FROM evo_attendance_sessions WHERE status='done' AND substr(activity_date,1,10) BETWEEN ? AND ? AND (?='club' OR unit=?)").bind(p.start,p.end,p.unit,p.unit),
  env.DB.prepare("SELECT unit,activity_date,start_time,activity_name,attendance_count FROM evo_attendance_sessions WHERE status='done' AND substr(activity_date,1,10) BETWEEN ? AND ? AND (?='club' OR unit=?) ORDER BY attendance_count DESC,activity_date DESC,start_time DESC LIMIT 1").bind(p.start,p.end,p.unit,p.unit),
  env.DB.prepare("SELECT start_time,SUM(COALESCE(attendance_count,0)) count FROM evo_attendance_sessions WHERE status='done' AND substr(activity_date,1,10) BETWEEN ? AND ? AND (?='club' OR unit=?) AND start_time IS NOT NULL GROUP BY start_time ORDER BY count DESC,start_time LIMIT 1").bind(p.start,p.end,p.unit,p.unit),
  env.DB.prepare("SELECT activity_name,COUNT(*) count FROM evo_member_attendance WHERE substr(attendance_date,1,10) BETWEEN ? AND ? AND (?='club' OR unit=?) AND activity_name IS NOT NULL GROUP BY activity_name ORDER BY count DESC,activity_name LIMIT 1").bind(p.start,p.end,p.unit,p.unit)
 ]);
 const grouped=result[0].results||[],total=grouped.reduce((n,r)=>n+Number(r.count),0);
 return {ok:true,source:'d1',evoRequestsMade:0,unit:p.unit,start:p.start,end:p.end,page:p.page,pageSize:50,total,events:result[1].results||[],metrics:activityTypes.map(([key,label,coverage,note])=>{const r=grouped.find(x=>x.category===key);return {key,label,coverage,note,count:coverage==='unavailable'?null:Number(r?.count||0),amount:coverage==='unavailable'?null:Number(r?.amount||0)}}),attendance:Number(result[2].results?.[0]?.count||0),classes:Number(result[3].results?.[0]?.count||0),participation:{bestClass:result[4].results?.[0]||null,busiestTime:result[5].results?.[0]||null,topActivity:result[6].results?.[0]||null}};
}

// Mission vouchers: D1 eligibility + one EVO creation, followed by code retrieval.
// A timeout after POST is never retried automatically: the external outcome is unknown.
function voucherError(code,status=409){return Object.assign(new Error(code),{voucherError:true,status});}
function voucherToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}

async function challengeTaskProgress(env,member,mission){
 const out=[];
 for(const task of mission.tasks||[]){
  const need=Number(task.quantity||1);let n=0;
  if(task.type==="image_generated"||task.type==="share_clicked"){
   const action=task.type==="image_generated"?"POP_FIT_IMAGE_GENERATED":"POP_FIT_SHARE_CLICKED";
   const r=await env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE actor_type='MEMBER' AND actor_id=? AND action=? AND date(datetime(created_at,'-3 hours')) BETWEEN ? AND ? AND json_valid(metadata_json) AND (?='club' OR json_extract(metadata_json,'$.unit')=?)").bind(String(member.id),action,mission.start,mission.end,mission.unit,mission.unit).first();n=Number(r?.n||0);
  }else if(task.type==="presence"||task.type==="activity"){
   const units=mission.unit==="club"?["bike","gym"]:[mission.unit||"bike"];
   const rows=[];
   for(const unit of units){
    const evoId=unit==="gym"?member.gym_client_id:member.evo_member_id;
    if(!evoId)continue;
    const result=await env.DB.prepare("SELECT attendance_date,activity_name FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,10) BETWEEN ? AND ?").bind(unit,String(evoId),mission.start,mission.end).all();
    rows.push(...(result.results||[]));
   }
   const eligible=task.type==="activity"?rows.filter(x=>String(x.activity_name||"").trim().toLowerCase()===String(task.activity||"").trim().toLowerCase()):rows;
   n=task.type==="activity"&&(!task.activity||task.activity==="*")?0:task.distinctDays===true?new Set(eligible.map(x=>String(x.attendance_date).slice(0,10))).size:eligible.length;
  }else {const copy={...mission,tasks:[task]};n=(await voucherMissionProgress(env,member,copy))?need:0;}
  out.push({id:String(task.id),current:Math.min(n,need),required:need,done:n>=need});
 }
 return out;
}
async function challengeFitcoinClaim(env,member,mission,goal,json){
 const unit=String(mission.unit||"bike"),today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 if(!["bike","gym"].includes(unit)||mission.type!=="challenge"||mission.status!=="Ativo"||today<mission.start||today>mission.end)return json({ok:false,error:"DESAFIO_FORA_DO_PERIODO"},409);
 const memberEvoId=unit==="gym"?member.gym_client_id:member.evo_member_id;
 if(!memberEvoId)return json({ok:false,error:"ALUNO_NAO_VINCULADO"},403);
 const rewards=Array.isArray(goal.rewards)?goal.rewards:[];
 if(rewards.length!==1||rewards[0].type!=="fitcoins")return json({ok:false,error:"RECOMPENSA_INVALIDA"},409);
 const amount=Number(rewards[0].amount);if(!Number.isSafeInteger(amount)||amount<1||amount>100000)return json({ok:false,error:"VALOR_INVALIDO"},400);
 if(mission.eligibility==="selected"){const allowed=new Set((mission.contracts||[]).map(String));const r=await env.DB.prepare("SELECT id_membership FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND (cancel_date IS NULL OR cancel_date='') AND (end_date IS NULL OR substr(end_date,1,10)>=?)").bind(unit,String(memberEvoId),today).all();if(!(r.results||[]).some(x=>allowed.has(unit+":"+x.id_membership)||allowed.has(String(x.id_membership))))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);}
 const tasks=await challengeTaskProgress(env,member,mission);
 if(!tasks.length||tasks.some(x=>!x.done))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA",tasks},409);
 const key="CHALLENGE-FITCOINS:"+unit+":"+member.id+":"+mission.id+":"+goal.id+":"+mission.start+":"+mission.end;
 const existing=await env.DB.prepare("SELECT id,status FROM redemptions WHERE dedupe_key=?").bind(key).first();
 if(existing)return json({ok:true,alreadyClaimed:true,rewardType:"fitcoins",redemption:existing,fitcoinsApplied:existing.status==="COMPLETED",requiresReview:existing.status!=="COMPLETED"});
 const inserted=await env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,fitcoins,status,source_type,source_id,title,details,unit,dedupe_key) SELECT ?,'fitcoins',?,?,'PROCESSING','MISSION',?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(member.id,String(mission.id),amount,String(goal.id),goal.rewardName||amount+" Fitcoins",mission.name||"",unit,key,key).run();
 if(Number(inserted.meta?.changes||0)!==1)return json({ok:true,alreadyClaimed:true,rewardType:"fitcoins",requiresReview:true});
 const cfg=await getEvoConfig(env,unit),headers={Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"};
 const base="https://evo-integracao-api.w12app.com.br/api/v1/members/";
 const parse=async r=>{try{return await r.json()}catch{return null}};
 const balance=d=>{const x=Array.isArray(d)?d[0]:d;const v=x?.totalFitCoins??x?.totalFitcoins;return Number.isFinite(Number(v))?Number(v):null};
 try{
  const beforeResponse=await fetch(base+encodeURIComponent(memberEvoId),{headers}),before=balance(await parse(beforeResponse));
  if(!beforeResponse.ok||before===null)throw Error("SALDO_EVO_NAO_CONFIRMADO");
  const query=new URLSearchParams({idMember:String(memberEvoId),type:"1",fitcoin:String(amount),reason:("Club Pop - Desafio - "+mission.name+" - "+key).slice(0,120)});
  const response=await fetch(base+"fitcoins?"+query,{method:"PUT",headers});
  const raw=await response.text();let result;try{result=JSON.parse(raw)}catch{result=raw}
  if(response.status!==200||result===false||result?.success===false||result?.ok===false||result?.error)throw Error("CREDITO_EVO_REQUER_CONFERENCIA");
  // A EVO confirma a movimentação pelo HTTP 200 sem erro no corpo.
  // O saldo do perfil pode demorar para atualizar; não condicione o resgate à leitura imediata.
  // Respostas ambíguas ou falhas permanecem em REVIEW e nunca são reenviadas automaticamente.
  const after=null;
  const tx={id:"mission-fitcoins:"+key,reference:key,fitcoinReference:key,unit,memberId:String(memberEvoId),origin:"mission",sourceId:String(mission.id),goalId:String(goal.id),description:mission.name,direction:"credit",fitcoins:amount,balanceBefore:before,balanceAfter:after,status:"COMPLETED",createdAt:new Date().toISOString(),evoVerified:true,evoAcknowledged:true};
  // Atualize o espelho D1 somente após HTTP 200 da EVO. A leitura do dashboard
  // continua sem requisições EVO e usa o saldo consolidado mais recente.
  const nextBalance=before+amount;
  await env.DB.prepare("UPDATE evo_students SET fitcoins=? WHERE unit=? AND evo_member_id=? AND is_current=1 AND (fitcoins IS NULL OR fitcoins<=?)").bind(nextBalance,unit,String(memberEvoId),before).run();
  await env.DB.batch([
   env.DB.prepare("UPDATE redemptions SET status='COMPLETED',completed_at=CURRENT_TIMESTAMP WHERE dedupe_key=? AND status='PROCESSING'").bind(key),
   env.DB.prepare("UPDATE app_content SET content_json=json_insert(json_set(content_json,'$.transactions',json(COALESCE(json_extract(content_json,'$.transactions'),'[]'))),'$.transactions[#]',json(?)),updated_at=CURRENT_TIMESTAMP WHERE content_key='club-pop' AND NOT EXISTS(SELECT 1 FROM json_each(json_extract(content_json,'$.transactions')) WHERE json_extract(value,'$.fitcoinReference')=?)").bind(JSON.stringify(tx),key)
  ]);
  return json({ok:true,claimed:true,rewardType:"fitcoins",fitcoinsApplied:true,amount,balance:after,evoAcknowledged:true});
 }catch(error){
  await env.DB.prepare("UPDATE redemptions SET status='REVIEW',details=? WHERE dedupe_key=? AND status='PROCESSING'").bind("Crédito EVO pendente de conferência: "+String(error.message||error).slice(0,120),key).run();
  return json({ok:true,rewardType:"fitcoins",requiresReview:true,warning:"CREDITO_FITCOINS_REQUER_CONFERENCIA"});
 }
}
async function voucherMissionProgress(env,member,mission){
  const units=mission.unit==='club'?['bike','gym']:[mission.unit||'bike'],rows=[];
  for(const unit of units){const id=unit==='gym'?member.gym_client_id:member.evo_member_id;if(!id)continue;
    const r=await env.DB.prepare('SELECT attendance_date,activity_name FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,10) BETWEEN ? AND ?').bind(unit,String(id),mission.start,mission.end).all();rows.push(...(r.results||[]));}
  const count=(a,distinct)=>distinct?new Set(a.map(x=>String(x.attendance_date).slice(0,10))).size:a.length;
  if(mission.type==='challenge'){
    if(!Array.isArray(mission.tasks)||!mission.tasks.length)throw voucherError('DESAFIO_SEM_TAREFAS');
    for(const task of mission.tasks){let n=0;const need=Number(task.quantity);if(!Number.isSafeInteger(need)||need<1)throw voucherError('TAREFA_INVALIDA');
      if(task.type==='presence')n=count(rows,task.distinctDays===true);
      else if(task.type==='activity'){if(!task.activity||task.activity==='*')throw voucherError('MODALIDADE_NAO_CONFIGURADA');n=count(rows.filter(x=>String(x.activity_name||'').trim().toLowerCase()===String(task.activity).trim().toLowerCase()),task.distinctDays===true);}
      else if(task.type==='image_generated'||task.type==='share_clicked'){
        const action=task.type==='image_generated'?'POP_FIT_IMAGE_GENERATED':'POP_FIT_SHARE_CLICKED';
        const r=await env.DB.prepare("SELECT COUNT(*) n FROM audit_log WHERE actor_type='MEMBER' AND actor_id=? AND action=? AND date(datetime(created_at,'-3 hours')) BETWEEN ? AND ? AND json_valid(metadata_json) AND (?='club' OR json_extract(metadata_json,'$.unit')=?)").bind(String(member.id),action,mission.start,mission.end,mission.unit,mission.unit).first();n=Number(r?.n||0);
      }else if(task.type==='workout_created'&&mission.unit==='club'){
        n=Number((await env.DB.prepare("SELECT COUNT(*) n FROM pop_fit_manual_activities WHERE member_id=? AND date(datetime(created_at,'-3 hours')) BETWEEN ? AND ?").bind(member.id,mission.start,mission.end).first())?.n||0);
      }else throw voucherError('TAREFA_SEM_COMPROVACAO_D1');
      if(n<need)return 0;
    }return 1;
  }
  if(mission.type==='consistency'){const weeks={};for(const x of rows){const day=String(x.attendance_date).slice(0,10),d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);const key=d.toISOString().slice(0,10);(weeks[key]??=new Set()).add(day)}return Object.values(weeks).filter(x=>x.size>=Number(mission.requirements?.[0]?.quantity||1)).length;}
  return count(rows,mission.requireDistinctDays===true);
}
function voucherSelection(raw){
 let parsed;try{parsed=JSON.parse(raw||'[]')}catch{return {kind:'invalid',ids:[]}}
 if(Array.isArray(parsed))return {kind:'contract',ids:parsed};
 if(parsed&&parsed.kind==='service'&&Array.isArray(parsed.ids))return {kind:'service',ids:parsed.ids};
 return {kind:'invalid',ids:[]};
}
function voucherPayloadSelection(selection){
 if(!['contract','service'].includes(selection.kind)||!selection.ids.length||selection.ids.some(x=>!Number.isSafeInteger(x)||x<=0))throw voucherError('MODELO_VOUCHER_INVALIDO');
 return selection.kind==='service'?{flContrato:false,idsServicos:selection.ids}:{flContrato:true,idsContratos:selection.ids};
}
async function voucherEvoCall(env,cfg,path,method,payload){
  const logged=await env.DB.prepare('INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,?,?,0,0)').bind(cfg.unit,method==='POST'?'voucher_create':'voucher_codes',method,path.split('?')[0]).run();
  let response;
  try{response=await fetch('https://evo-integracao-api.w12app.com.br'+path,{method,headers:{Authorization:'Basic '+btoa(cfg.dns+':'+cfg.token),Accept:'application/json',...(payload?{'Content-Type':'application/json-patch+json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(15000)});}
  finally{await env.DB.prepare('UPDATE evo_request_log SET status=?,ok=? WHERE id=?').bind(response?.status||0,response?.ok?1:0,logged.meta.last_row_id).run();}
  if(!response.ok)throw voucherError('EVO_VOUCHER_HTTP_'+response.status,502);
  return response.json();
}
export function evoVoucherCode(data,id){
  if(!data||!Array.isArray(data.list)||data.list.length!==1||Number(data.quantity)!==1)return null;
  const row=data.list[0],code=typeof row.voucherCode==='string'?row.voucherCode.trim():'';
  return Number(row.voucherId)===id&&code&&code.length<=200&&!/[\u0000-\u001f]/.test(code)?code:null;
}
async function deliverMissionVoucher(env,member,mission,goal,request,dedupe){
  const metadata=JSON.stringify({missionId:String(mission.id),goalId:String(goal.id),provider:'EVO',evoVoucherId:request.evo_voucher_id,modelId:request.model_id,unit:request.unit});
  await env.DB.batch([
    env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key,completed_at) SELECT ?,'voucher',?,'COMPLETED','MISSION',?,?,?,?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(member.id,String(mission.id),String(goal.id),request.model_name,mission.name||'',request.unit,dedupe,dedupe),
    env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,redemption_id,source_type,source_id,title,metadata_json) SELECT ?,?,'voucher',?,'ACTIVE',r.id,'MISSION',?,?,? FROM redemptions r WHERE r.dedupe_key=? AND NOT EXISTS(SELECT 1 FROM vouchers v WHERE v.redemption_id=r.id)").bind(member.id,request.assigned_code,request.model_name,String(goal.id),request.model_name,metadata,dedupe),
    env.DB.prepare("UPDATE club_voucher_requests SET status='issued',error=NULL,processed_at=CURRENT_TIMESTAMP WHERE id=? AND assigned_code=?").bind(request.id,request.assigned_code)
  ]);
  const red=await env.DB.prepare('SELECT id,title,status FROM redemptions WHERE dedupe_key=? LIMIT 1').bind(dedupe).first();
  return {ok:true,claimed:true,rewardType:'voucher',voucher:request.assigned_code,evoVoucherId:request.evo_voucher_id,redemption:red};
}

const voucherLocal=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
async function voucherSettings(env,unit,type='contract'){
 if(type==='service')await env.DB.prepare("CREATE TABLE IF NOT EXISTS club_voucher_service_automation (unit TEXT PRIMARY KEY CHECK(unit IN ('bike','gym')),value TEXT NOT NULL)").run();
 const table=type==='service'?'club_voucher_service_automation':'club_voucher_automation';
 const row=await env.DB.prepare("SELECT value FROM "+table+" WHERE unit=?").bind(unit).first();
 try{return {enabled:false,dailyLimit:5,batchTime:'22:00',times:['22:00'],days:[1,2,3,4,5,6],...JSON.parse(row?.value||'{}')}}catch{return {enabled:false,dailyLimit:5,batchTime:'22:00',times:['22:00'],days:[1,2,3,4,5,6]}}
}
function voucherName(unit,name,id){const slug=String(name||'voucher').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase()||'voucher';return (unit==='gym'?'Gp':'Bp')+slug.slice(0,80)+String(id).padStart(2,'0')}
async function voucherDeliverBatch(env,request){
 if(!request.assigned_code||!request.evo_voucher_id||!request.batch_id)return;
 if(request.status==='issued')return;
 const match=/^MISSION:(\d+):(.+):([^:]+):(.+):EVO$/.exec(request.idempotency_key||'');
 if(!match)return;
 const dedupe=request.idempotency_key.slice(0,-4),missionId=match[2],goalId=match[3];
 const metadata=JSON.stringify({missionId,goalId,provider:'EVO',evoVoucherId:request.evo_voucher_id,modelId:request.model_id,unit:request.unit});
 await env.DB.batch([
  env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key,completed_at) SELECT ?,'voucher',?,'COMPLETED','MISSION',?,?,?,?,?,CURRENT_TIMESTAMP WHERE NOT EXISTS(SELECT 1 FROM redemptions WHERE dedupe_key=?)").bind(request.member_id,missionId,goalId,request.model_name,'',request.unit,dedupe,dedupe),
  env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,redemption_id,source_type,source_id,title,metadata_json) SELECT ?,?,'voucher',?,'ACTIVE',r.id,'MISSION',?,?,? FROM redemptions r WHERE r.dedupe_key=? AND NOT EXISTS(SELECT 1 FROM vouchers v WHERE v.redemption_id=r.id)").bind(request.member_id,request.assigned_code,request.model_name,goalId,request.model_name,metadata,dedupe),
  env.DB.prepare("UPDATE club_voucher_requests SET status='issued',error=NULL,processed_at=CURRENT_TIMESTAMP WHERE id=? AND assigned_code=?").bind(request.id,request.assigned_code)
 ]);
}

async function voucherBatchTick(env,options={}){
 const now=voucherLocal(),hh=now.slice(11,16);
 for(const unit of (options.unit?[options.unit]:['bike','gym'])){
  const settings=await voucherSettings(env,unit);
  const serviceSettings=await voucherSettings(env,unit,'service');
  const schedule=Array.isArray(settings.times)?settings.times:[settings.batchTime||'22:00'];const currentMinute=Number(hh.slice(0,2))*60+Number(hh.slice(3));const isScheduled=(options.force&&options.type==="contract")||(!options.force&&settings.enabled&&scheduledDaysAllowed(settings.days||[1,2,3,4,5,6])&&schedule.some(t=>{const minute=Number(t.slice(0,2))*60+Number(t.slice(3));return currentMinute===minute}));
  // New EVO POSTs run only at configured times; existing EVO IDs are polled safely each minute.
  const serviceSchedule=Array.isArray(serviceSettings.times)?serviceSettings.times:[serviceSettings.batchTime||'22:00'];const isServiceScheduled=(options.force&&options.type==="service")||(!options.force&&serviceSettings.enabled&&scheduledDaysAllowed(serviceSettings.days||[1,2,3,4,5,6])&&serviceSchedule.some(t=>currentMinute===Number(t.slice(0,2))*60+Number(t.slice(3))));
  const groups=(isScheduled||isServiceScheduled)?await env.DB.prepare("SELECT r.model_id,COUNT(*) n,m.contract_ids_json FROM club_voucher_requests r JOIN club_voucher_models m ON m.id=r.model_id AND m.unit=r.unit WHERE r.unit=? AND r.delivery_mode='batch' AND r.status='pending' AND r.batch_id IS NULL GROUP BY r.model_id").bind(unit).all():{results:[]};
  let queued=0,created=0,blocked=0;
  for(const group of groups.results||[]){
   const groupType=voucherSelection(group.contract_ids_json).kind;
   if(groupType==='service'?!isServiceScheduled:!isScheduled)continue;
   queued+=Number(group.n);
   const model=await env.DB.prepare("SELECT * FROM club_voucher_models WHERE id=? AND unit=? AND enabled=1").bind(group.model_id,unit).first();
   if(!model)continue;
   const lock=await env.DB.prepare("INSERT INTO club_voucher_batches(unit,model_id,requested_quantity,status) SELECT ?,?,?,'creating' WHERE NOT EXISTS(SELECT 1 FROM club_voucher_batches WHERE unit=? AND model_id=? AND status IN ('creating','awaiting_codes','review_required'))").bind(unit,group.model_id,group.n,unit,group.model_id).run();
   if(!lock.meta.changes){blocked+=Number(group.n);continue;}
   created+=Number(group.n);
   const batchId=lock.meta.last_row_id, nowDate=new Date(),until=new Date(nowDate.getTime()+model.validity_days*86400000);
   const reserved=await env.DB.prepare("UPDATE club_voucher_requests SET batch_id=? WHERE id IN (SELECT id FROM club_voucher_requests WHERE unit=? AND model_id=? AND delivery_mode='batch' AND status='pending' AND batch_id IS NULL ORDER BY id LIMIT ?)").bind(batchId,unit,group.model_id,group.n).run();
   if(Number(reserved.meta.changes)!==Number(group.n)){await env.DB.prepare("UPDATE club_voucher_batches SET status='review_required' WHERE id=?").bind(batchId).run();continue;}

   try{
    const selection=voucherSelection(model.contract_ids_json),cfg=await getEvoConfig(env,unit);
    const payload={nome:voucherName(unit,model.name,batchId)+'L',qtde:group.n,flUtilizarSite:true,flCodigoUnico:false,flIlimitado:false,inicio:nowDate.toISOString(),validade:until.toISOString(),tipoDesconto:model.discount_type,valor:model.discount_value,...voucherPayloadSelection(selection)};
    const result=await voucherEvoCall(env,cfg,'/api/v2/voucher','POST',payload),id=Number(result?.voucherId);
    if(!Number.isSafeInteger(id)||id<1)throw Error('EVO_SEM_ID');
    await env.DB.prepare("UPDATE club_voucher_batches SET evo_voucher_id=?,status='awaiting_codes' WHERE id=?").bind(id,batchId).run();
   }catch(e){await env.DB.prepare("UPDATE club_voucher_batches SET status='review_required' WHERE id=?").bind(batchId).run();}
  }
  const batches=await env.DB.prepare("SELECT b.* FROM club_voucher_batches b WHERE b.unit=? AND b.status='awaiting_codes' AND EXISTS (SELECT 1 FROM club_voucher_requests r WHERE r.batch_id=b.id AND r.unit=b.unit AND r.delivery_mode='batch')").bind(unit).all();
  for(const batch of batches.results||[]){
   try{
    const cfg=await getEvoConfig(env,unit);
    const data=await voucherEvoCall(env,cfg,'/api/v1/voucher/get-codes-by-voucher-id/'+batch.evo_voucher_id+'?take='+batch.requested_quantity+'&skip=0','GET');
    const codes=(data?.list||[]).filter(x=>Number(x.voucherId)===Number(batch.evo_voucher_id)&&typeof x.voucherCode==='string'&&x.voucherCode.trim()).map(x=>x.voucherCode.trim());
    if(codes.length!==batch.requested_quantity||new Set(codes).size!==codes.length)continue;
    const pending=await env.DB.prepare("SELECT id FROM club_voucher_requests WHERE unit=? AND model_id=? AND delivery_mode='batch' AND status IN ('pending','code_pending','issued') AND batch_id=? ORDER BY id LIMIT ?").bind(unit,batch.model_id,batch.id,batch.requested_quantity).all();
    if((pending.results||[]).length!==codes.length)continue;
    for(let i=0;i<codes.length;i++){
     const requestId=pending.results[i].id;
     const inserted=await env.DB.prepare("INSERT OR IGNORE INTO club_voucher_codes(unit,batch_id,evo_voucher_id,code,request_id,status,assigned_at) VALUES(?,?,?,?,?,'assigned',CURRENT_TIMESTAMP)").bind(unit,batch.id,batch.evo_voucher_id,codes[i],requestId).run();if(!inserted.meta.changes){const existing=await env.DB.prepare('SELECT request_id FROM club_voucher_codes WHERE code=? AND batch_id=?').bind(codes[i],batch.id).first();if(Number(existing?.request_id)!==Number(requestId))throw Error('CODIGO_JA_VINCULADO');}
     await env.DB.prepare("UPDATE club_voucher_requests SET assigned_code=?,evo_voucher_id=?,status='code_pending',processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND batch_id=?").bind(codes[i],batch.evo_voucher_id,requestId,batch.id).run();
    }
    const assigned=await env.DB.prepare("SELECT q.*,COALESCE(NULLIF(m.public_name,''),m.name) model_name FROM club_voucher_requests q JOIN club_voucher_models m ON m.id=q.model_id WHERE q.batch_id=? AND q.assigned_code IS NOT NULL").bind(batch.id).all();
    for(const q of assigned.results||[])await voucherDeliverBatch(env,q);
    const outstanding=await env.DB.prepare("SELECT COUNT(*) AS n FROM club_voucher_requests WHERE batch_id=? AND status!='issued'").bind(batch.id).first();
    if(Number(outstanding?.n||0)===0)await env.DB.prepare("UPDATE club_voucher_batches SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(batch.id).run();
   }catch(e){/* keep existing batch for retry; never recreate */}
  }
  if(options.force)return {unit,type:options.type,queued,submitted:created,blocked,pending:queued-created};
 }
} 

export async function claimEvoMissionVoucher(env,member,mission,goal,rewards){
  if(rewards.length!==1||rewards[0].type!=='voucher')throw voucherError('VOUCHER_EVO_EXIGE_UMA_RECOMPENSA_POR_META');
  const match=/^(bike|gym):(\d+)$/.exec(String(rewards[0].rewardId||goal.rewardId||''));
  if(!match)throw voucherError('MODELO_VOUCHER_INVALIDO');
  const unit=match[1],modelId=Number(match[2]);
  if(mission.unit!=='club'&&(mission.unit||'bike')!==unit)throw voucherError('MODELO_DE_OUTRA_UNIDADE');
  if(!(unit==='gym'?member.gym_client_id:member.evo_member_id))throw voucherError('ALUNO_SEM_VINCULO_NA_UNIDADE');
  const period=mission.period==='month'?String(mission.start).slice(0,7):String(mission.start)+'_'+String(mission.end),dedupe='MISSION:'+member.id+':'+mission.id+':'+goal.id+':'+period;
  const key=dedupe+':EVO';
  const old=await env.DB.prepare('SELECT r.id,r.title,r.status,v.code,v.metadata_json FROM redemptions r LEFT JOIN vouchers v ON v.redemption_id=r.id WHERE r.dedupe_key=? LIMIT 1').bind(dedupe).first();
  if(old){let meta={};try{meta=JSON.parse(old.metadata_json||'{}')}catch{}
    if(meta.provider==='EVO'&&old.code)return {ok:true,alreadyClaimed:true,rewardType:'voucher',voucher:old.code,evoVoucherId:meta.evoVoucherId,redemption:{id:old.id,title:old.title,status:old.status},evoRequestsMade:0};
    throw voucherError('RESGATE_ANTERIOR_INTERNO_REQUER_CONFERENCIA');
  }
  const read=()=>env.DB.prepare('SELECT q.*,m.name model_name FROM club_voucher_requests q JOIN club_voucher_models m ON m.id=q.model_id WHERE q.idempotency_key=?').bind(key).first();
  let q=await read(),requests=0;
  if(q&&(q.unit!==unit||Number(q.model_id)!==modelId))throw voucherError('MODELO_ALTERADO_APOS_SOLICITACAO');
  if(q?.assigned_code)return {...await deliverMissionVoucher(env,member,mission,goal,q,dedupe),evoRequestsMade:0};
  if(q&&['creating','review_required','failed'].includes(q.status))return {ok:true,rewardType:'voucher',requiresReview:true,warning:'EMISSAO_EVO_EM_CONFERENCIA',evoRequestsMade:0};
  if(!q){
    const today=voucherToday();if(mission.status!=='Ativo'||!validEvoExpiry(mission.start)||!validEvoExpiry(mission.end)||mission.start>today||mission.end<today)throw voucherError('MISSAO_FORA_DO_PERIODO');
    const model=await env.DB.prepare('SELECT * FROM club_voucher_models WHERE id=? AND unit=? AND enabled=1').bind(modelId,unit).first();
    if(!model)throw voucherError('MODELO_VOUCHER_INDISPONIVEL');
    if(mission.eligibility==='selected'||mission.eligibility==='active'){
      const id=unit==='gym'?member.gym_client_id:member.evo_member_id;
      const contracts=await env.DB.prepare("SELECT id_membership FROM evo_member_contracts WHERE unit=? AND evo_member_id=? AND (cancel_date IS NULL OR cancel_date='') AND (start_date IS NULL OR start_date='' OR substr(start_date,1,10)<=?) AND (end_date IS NULL OR end_date='' OR substr(end_date,1,10)>=?) AND (membership_status IS NULL OR membership_status='' OR lower(membership_status) IN ('1','active','ativo'))").bind(unit,String(id),today,today).all();
      const allowed=new Set((mission.contracts||[]).map(String));if(!(contracts.results||[]).some(x=>mission.eligibility==='active'||allowed.has(unit+':'+x.id_membership)||allowed.has(String(x.id_membership))))throw voucherError('ALUNO_NAO_ELEGIVEL');
    }
    const need=Number(goal.value);if(!Number.isFinite(need)||need<=0)throw voucherError('META_INVALIDA');
    if(await voucherMissionProgress(env,member,mission)<need)throw voucherError('META_AINDA_NAO_ATINGIDA');
    await getEvoConfig(env,unit); // Fail before reserving a request when credentials are unavailable.
    await env.DB.prepare("INSERT INTO club_voucher_requests(unit,model_id,member_id,source_type,source_id,idempotency_key,delivery_mode,status) VALUES(?,?,?,'MISSION',?,?,'immediate','pending') ON CONFLICT(idempotency_key) DO NOTHING").bind(unit,modelId,member.id,String(mission.id)+':'+goal.id,key).run();q=await read();
  }
  if(q?.delivery_mode==='batch'&&!q.assigned_code)return {ok:true,rewardType:'voucher',requiresReview:true,warning:'AGUARDANDO_LOTE',evoRequestsMade:0};
  const cfg=await getEvoConfig(env,unit);
  if(!q.evo_voucher_id){
    const model=await env.DB.prepare('SELECT * FROM club_voucher_models WHERE id=? AND unit=? AND enabled=1').bind(q.model_id,unit).first();
    const selection=voucherSelection(model?.contract_ids_json),ids=selection.ids;
    if(!model||![1,2].includes(model.discount_type)||!Number.isFinite(model.discount_value)||model.discount_value<=0||model.discount_type===1&&model.discount_value>100||!Number.isInteger(model.validity_days)||model.validity_days<1||model.validity_days>365||!Array.isArray(ids)||!ids.length||ids.some(x=>!Number.isSafeInteger(x)||x<=0))throw voucherError('MODELO_VOUCHER_INVALIDO');
    const config=await voucherSettings(env,unit,selection.kind);
    const day=voucherLocal().slice(0,10);
    const claimed=await env.DB.prepare("SELECT COUNT(*) n FROM club_voucher_requests r JOIN club_voucher_models m ON m.id=r.model_id AND m.unit=r.unit WHERE r.unit=? AND r.delivery_mode='immediate' AND r.id<>? AND substr(datetime(r.created_at,'-3 hours'),1,10)=? AND (CASE WHEN substr(m.contract_ids_json,1,1)='{' THEN 'service' ELSE 'contract' END)=?").bind(unit,q.id,day,selection.kind).first();
    if(!config.enabled||Number(claimed?.n||0)>=config.dailyLimit){
      await env.DB.prepare("UPDATE club_voucher_requests SET delivery_mode='batch' WHERE id=? AND status='pending'").bind(q.id).run();
      return {ok:true,rewardType:'voucher',requiresReview:true,warning:'AGUARDANDO_LOTE',evoRequestsMade:0};
    }
    const locked=await env.DB.prepare("UPDATE club_voucher_requests SET status='creating',attempts=attempts+1,processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND attempts=0 AND (SELECT COUNT(*) FROM club_voucher_requests r JOIN club_voucher_models m ON m.id=r.model_id AND m.unit=r.unit WHERE r.unit=? AND r.delivery_mode='immediate' AND r.id<>? AND substr(datetime(r.created_at,'-3 hours'),1,10)=? AND (CASE WHEN substr(m.contract_ids_json,1,1)='{' THEN 'service' ELSE 'contract' END)=?)<?").bind(q.id,unit,q.id,day,selection.kind,config.dailyLimit).run();
    if(!locked.meta.changes){const state=await read();if(state?.status==='pending'){await env.DB.prepare("UPDATE club_voucher_requests SET delivery_mode='batch' WHERE id=? AND status='pending'").bind(q.id).run();return {ok:true,rewardType:'voucher',requiresReview:true,warning:'AGUARDANDO_LOTE',evoRequestsMade:0};}return {ok:true,rewardType:'voucher',requiresReview:true,warning:'EMISSAO_EVO_EM_PROCESSAMENTO',evoRequestsMade:0};}
    const now=new Date(),until=new Date(now.getTime()+model.validity_days*86400000);
    const label=voucherName(unit,model.name,q.id);
    const payload={nome:label,qtde:1,flUtilizarSite:true,flCodigoUnico:true,flIlimitado:false,inicio:now.toISOString(),validade:until.toISOString(),tipoDesconto:model.discount_type,valor:model.discount_value,...voucherPayloadSelection(selection)};
    try{requests++;const result=await voucherEvoCall(env,cfg,'/api/v2/voucher','POST',payload),id=Number(result?.voucherId);if(!Number.isSafeInteger(id)||id<1)throw voucherError('EVO_NAO_RETORNOU_ID');
      await env.DB.prepare("UPDATE club_voucher_requests SET evo_voucher_id=?,status='code_pending',assigned_code=?,error=NULL,processed_at=CURRENT_TIMESTAMP WHERE id=?").bind(id,label,q.id).run();q.evo_voucher_id=id;q.assigned_code=label;
    }catch{await env.DB.prepare("UPDATE club_voucher_requests SET status='review_required',error='EMISSAO_NAO_CONFIRMADA_NAO_REEMITIR',processed_at=CURRENT_TIMESTAMP WHERE id=?").bind(q.id).run();return {ok:true,rewardType:'voucher',requiresReview:true,warning:'EMISSAO_EVO_EM_CONFERENCIA',evoRequestsMade:requests};}
  }
  return {...await deliverMissionVoucher(env,member,mission,goal,q,dedupe),evoRequestsMade:requests};
}

async function checkoutServiceVoucher(env,order,create){
 const db=env.DB,key="SHOP:"+order.id+":EVO";
 const read=()=>db.prepare("SELECT q.*,m.name model_name FROM club_voucher_requests q JOIN club_voucher_models m ON m.id=q.model_id WHERE q.idempotency_key=?").bind(key).first();
 let q=await read();
 if(!q&&create){
  const content=await db.prepare("SELECT content_json FROM app_content WHERE content_key='club-pop'").first();
  const items=JSON.parse(content?.content_json||'{}').services||[];
  const item=items.find(x=>String(x.id)===String(order.item_id)&&String(x.unit||'bike')===order.unit);
  const serviceId=Number(item?.evoServiceId);
  if(!item||item.deliveryMethod!=="voucher")throw new Error("SERVICO_SEM_ENTREGA_VOUCHER");
  const models=(await db.prepare("SELECT * FROM club_voucher_models WHERE unit=? AND enabled=1").bind(order.unit).all()).results||[];
  const model=item.voucherModelId?models.find(m=>String(m.id)===String(item.voucherModelId)&&voucherSelection(m.contract_ids_json).kind==="service"):models.find(m=>{const sel=voucherSelection(m.contract_ids_json);return Number.isSafeInteger(serviceId)&&serviceId>0&&sel.kind==="service"&&sel.ids.includes(serviceId)});
  if(!model)throw new Error("MODELO_VOUCHER_SERVICO_NAO_ENCONTRADO");
  const settings=await voucherSettings(env,order.unit,"service");
  await db.prepare("INSERT INTO club_voucher_requests(unit,model_id,member_id,source_type,source_id,idempotency_key,delivery_mode,status) VALUES(?,?,?,'SHOP',?,? ,?,'pending') ON CONFLICT(idempotency_key) DO NOTHING").bind(order.unit,model.id,order.member_id,order.id,key,settings.enabled?'batch':'immediate').run();
  q=await read();
 }
 if(!q)return {ok:true,status:"not_requested"};
 if(q.status==="issued"&&q.assigned_code)return {ok:true,status:"issued",code:q.assigned_code};
 if(!create)return {ok:true,status:q.status};
 if(q.delivery_mode==="batch")return {ok:true,status:"pending",message:"Voucher aguardando lote"};
 if(q.status!=="pending")return {ok:true,status:q.status,message:"Emissão em processamento ou conferência"};
 const locked=await db.prepare("UPDATE club_voucher_requests SET status='creating',attempts=attempts+1,processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND attempts=0").bind(q.id).run();
 if(locked.meta.changes!==1)return {ok:true,status:"creating"};
 const model=await db.prepare("SELECT * FROM club_voucher_models WHERE id=? AND unit=? AND enabled=1").bind(q.model_id,order.unit).first();
 if(!model)throw new Error("MODELO_INDISPONIVEL");
 const selection=voucherSelection(model.contract_ids_json),now=new Date(),until=new Date(now.getTime()*1+model.validity_days*86400000);
 const code=voucherName(order.unit,model.name,q.id);
 try{
  const cfg=await getEvoConfig(env,order.unit);
  const result=await voucherEvoCall(env,cfg,"/api/v2/voucher","POST",{nome:code,qtde:1,flUtilizarSite:true,flCodigoUnico:true,flIlimitado:false,inicio:now.toISOString(),validade:until.toISOString(),tipoDesconto:model.discount_type,valor:model.discount_value,...voucherPayloadSelection(selection)});
  const evoId=Number(result?.voucherId);
  if(!Number.isSafeInteger(evoId)||evoId<1)throw new Error("EVO_NAO_RETORNOU_ID");
  const meta=JSON.stringify({provider:"EVO",evoVoucherId:evoId,modelId:model.id,unit:order.unit,orderId:order.id});
  await db.batch([
   db.prepare("UPDATE club_voucher_requests SET status='issued',assigned_code=?,evo_voucher_id=?,error=NULL,processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'").bind(code,evoId,q.id),
   db.prepare("INSERT INTO vouchers(member_id,code,type,description,status,source_type,source_id,title,metadata_json) SELECT ?,?,'voucher',?,'ACTIVE','SHOP',?,?,? WHERE NOT EXISTS(SELECT 1 FROM vouchers WHERE source_type='SHOP' AND source_id=? AND member_id=?)").bind(order.member_id,code,model.name,order.id,order.item_name,meta,order.id,order.member_id),
   db.prepare("UPDATE club_pix_fulfillment SET delivery_reference=?,updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND delivery_state='ready'").bind(code,order.id)
  ]);
  return {ok:true,status:"issued",code};
 }catch(e){
  await db.prepare("UPDATE club_voucher_requests SET status='review_required',error='EMISSAO_NAO_CONFIRMADA_NAO_REEMITIR',processed_at=CURRENT_TIMESTAMP WHERE id=? AND status='creating'").bind(q.id).run();
  return {ok:true,status:"review_required",message:"Emissão requer conferência; nenhuma nova tentativa automática"};
 }
}



async function generatePromotionBatch(request,env,json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store"}})){const internal=!!env.AUTO_SYNC_SECRET&&request.headers.get("x-auto-sync-secret")===env.AUTO_SYNC_SECRET;if(!internal){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);}const body=await readJson(request),key=String(body.promotionId||"");await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_state(promotion_slug TEXT PRIMARY KEY,unit TEXT NOT NULL DEFAULT 'bike',next_skip INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'IN_PROGRESS',checked INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,with_attendance INTEGER NOT NULL DEFAULT 0,participants_updated INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_log(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,unit TEXT NOT NULL DEFAULT 'bike',mode TEXT NOT NULL DEFAULT 'FULL',status TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,with_attendance INTEGER NOT NULL DEFAULT 0,participants_updated INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,checkpoint INTEGER NOT NULL DEFAULT 0,evo_member_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_errors(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,evo_member_id TEXT,student_name TEXT,error TEXT NOT NULL,checkpoint INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'").run()}catch{}try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN resolution_note TEXT").run()}catch{}try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN resolved_at TEXT").run()}catch{}const statusPromo=await clubContentItem(env,"promotion",key),statusUnit=(statusPromo?.unit||"bike")==="gym"?"gym":"bike",totalBase=Number((await env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit=? AND is_current=1").bind(statusUnit).first())?.n||0);if(body.action==="status"){const state=await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first(),logs=await env.DB.prepare("SELECT * FROM promotion_number_update_log WHERE promotion_slug=? ORDER BY id DESC LIMIT 5").bind(key).all(),er=await env.DB.prepare("SELECT id,evo_member_id,student_name,error,checkpoint,created_at,status,resolution_note,resolved_at FROM promotion_number_update_errors WHERE promotion_slug=? ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,id DESC LIMIT 50").bind(key).all();return json({ok:true,source:"d1",evoRequestsMade:0,totalBase,state:state||null,logs:logs.results||[],exceptions:er.results||[]})}if(body.action==="ignore-error"){const errorId=Number(body.errorId||0),note=String(body.reason||"Analisado e ignorado pelo administrador").trim().slice(0,240);if(!errorId)return json({ok:false,error:"ERRO_INVALIDO"},400);const row=await env.DB.prepare("SELECT id FROM promotion_number_update_errors WHERE id=? AND promotion_slug=?").bind(errorId,key).first();if(!row)return json({ok:false,error:"ERRO_NAO_ENCONTRADO"},404);await env.DB.prepare("UPDATE promotion_number_update_errors SET status='IGNORED',resolution_note=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND promotion_slug=?").bind(note,errorId,key).run();return json({ok:true,errorId,status:"IGNORED"})}const finished=await env.DB.prepare("SELECT stage FROM lucky_draw_runs WHERE promotion_id=? OR linked_id=?").bind(key,key).first().catch(()=>null);if(finished?.stage==='completed')return json({ok:false,error:'SORTEIO_JA_CONCLUIDO'},409);
const lease=await acquireDrawLease(env.DB,'numbers:'+key);if(!lease)return json({ok:false,error:'GERACAO_EM_ANDAMENTO'},409);try{
const state=await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first(),singleId=String(body.evoMemberId||"").trim(),isSingle=body.action==="single"&&singleId,skip=isSingle?0:Math.max(0,body.skip==null?Number(state?.next_skip||0):Number(body.skip||0)),take=isSingle?1:Math.max(1,Math.min(10,Number(body.take||10))),promo=await clubContentItem(env,"promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);const promoUnit=(promo.unit||"bike")==="gym"?"gym":"bike",accepted=new Set((promo.eligibility?.acceptedContracts||[]).map(String)),mode=promo.eligibility?.mode||"any",today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());const candidateIds=[...accepted];if(mode==="active_contract"&&!candidateIds.length)return json({ok:false,error:"CONTRATOS_ELEGIVEIS_NAO_CONFIGURADOS"},400);
const candidates=(await drawCandidates(env.DB,promo)).filter(c=>c.eligible),candidateTotal=candidates.length;
const rows=isSingle?candidates.filter(c=>c.ids.includes(singleId)):candidates.slice(skip,skip+take);
if(isSingle&&!rows.length)return json({ok:false,error:"ALUNO_NAO_ELEGIVEL_NA_BASE_ATUAL"},404);
let checked=0,eligible=0,withAttendance=0,participantsUpdated=0,existingNumbers=0,generated=0,finalNumbers=0,errors=[];
for(const x of rows){checked++;try{eligible++;
const atts=await drawAttendance(env.DB,promo,x);if(!atts.length)continue;const member=await ensureDrawMember(env.DB,promo,x);withAttendance++;
for(const a of atts){const keyA=[promoUnit,member.id,a.attendance_date,a.id_activity_session||a.activity_name||"attendance"].join(":");await env.DB.prepare("INSERT OR IGNORE INTO attendance_history(member_id,evo_member_id,unit,attendance_key,attendance_date,activity_id,activity_name,raw_json) VALUES(?,?,?,?,?,?,?,?)").bind(member.id,Number(x.evo_member_id),promoUnit,keyA,a.attendance_date,null,a.activity_name||null,JSON.stringify(a)).run()}const dp=await ensurePromotion(env,promo);const oldPt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),before=oldPt?Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE'").bind(dp.id,oldPt.id).first())?.n||0):0;existingNumbers+=before;await syncLuckyMember(env,{...member,evo_member_id:Number(x.evo_member_id)},promo,atts,x);const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),after=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE'").bind(dp.id,pt.id).first())?.n||0),added=Math.max(0,after-before);if(added)participantsUpdated++;generated+=added;finalNumbers+=after}catch(e){errors.push({idMember:x.evo_member_id,error:String(e.message||e).slice(0,160)})}}for(const er of errors){const src=rows.find(r=>String(r.evo_member_id)===String(er.idMember));await env.DB.prepare("INSERT INTO promotion_number_update_errors(promotion_slug,evo_member_id,student_name,error,checkpoint,status) VALUES(?,?,?,?,?,'PENDING')").bind(key,String(er.idMember||""),String(src?.display_name||""),String(er.error||"Erro não identificado"),skip+checked).run()}const nextSkip=isSingle?null:(rows.length===take?skip+take:null);if(isSingle){await env.DB.prepare("INSERT INTO promotion_number_update_log(promotion_slug,unit,mode,status,checked,eligible,with_attendance,participants_updated,generated,errors,checkpoint,evo_member_id) VALUES(?,?,'SINGLE','COMPLETE',?,?,?,?,?,?,0,?)").bind(key,promoUnit,checked,eligible,withAttendance,participantsUpdated,generated,errors.length,singleId).run()}else{const prev=skip>0&&state&&state.status==="IN_PROGRESS"?state:null,tc=Number(prev?.checked||0)+checked,te=Number(prev?.eligible||0)+eligible,tw=Number(prev?.with_attendance||0)+withAttendance,tp=Number(prev?.participants_updated||0)+participantsUpdated,tg=Number(prev?.generated||0)+generated,terr=Number(prev?.errors||0)+errors.length,cp=nextSkip==null?skip+rows.length:nextSkip,st=nextSkip==null?"COMPLETE":"IN_PROGRESS";await env.DB.prepare("INSERT INTO promotion_number_update_state(promotion_slug,unit,next_skip,status,checked,eligible,with_attendance,participants_updated,generated,errors,started_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(promotion_slug) DO UPDATE SET unit=excluded.unit,next_skip=excluded.next_skip,status=excluded.status,checked=excluded.checked,eligible=excluded.eligible,with_attendance=excluded.with_attendance,participants_updated=excluded.participants_updated,generated=excluded.generated,errors=excluded.errors,updated_at=CURRENT_TIMESTAMP").bind(key,promoUnit,st==="COMPLETE"?0:cp,st,tc,te,tw,tp,tg,terr).run();if(st==="COMPLETE"){await env.DB.prepare("INSERT INTO promotion_number_update_log(promotion_slug,unit,mode,status,checked,eligible,with_attendance,participants_updated,generated,errors,checkpoint) VALUES(?,?,'FULL','COMPLETE',?,?,?,?,?,?,0)").bind(key,promoUnit,tc,te,tw,tp,tg,terr).run()}}const progress=isSingle?null:await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first();return json({ok:true,source:"d1",evoRequestsMade:0,totalBase:candidateTotal,fullStudentBase:totalBase,promotion:{id:key,name:promo.name},batch:{skip,checked,eligible,withAttendance,participantsUpdated,existingNumbers,generated,finalNumbers,errors},progress:progress||null,nextSkip,done:nextSkip==null})}finally{await releaseDrawLease(env.DB,'numbers:'+key,lease)}}
