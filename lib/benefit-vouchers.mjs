// Beneficios: distribuicao de codigos de lotes manuais ja confirmados na EVO.
const bad=(error,status=400)=>({ok:false,error,status});
const dateBR=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
async function schema(db){
 await db.prepare("CREATE TABLE IF NOT EXISTS benefit_voucher_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,batch_id INTEGER NOT NULL,model_id INTEGER NOT NULL,title TEXT NOT NULL,description TEXT,quantity INTEGER NOT NULL,per_member INTEGER NOT NULL DEFAULT 1,start_date TEXT,end_date TEXT,status TEXT NOT NULL DEFAULT 'draft',colors_json TEXT NOT NULL DEFAULT '{}',created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
 await db.prepare("CREATE TABLE IF NOT EXISTS benefit_voucher_claims(id INTEGER PRIMARY KEY AUTOINCREMENT,offer_id INTEGER NOT NULL,member_id INTEGER NOT NULL,batch_id INTEGER NOT NULL,code TEXT NOT NULL UNIQUE,created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
 await db.prepare("CREATE INDEX IF NOT EXISTS idx_benefit_claims_offer ON benefit_voucher_claims(offer_id,member_id)").run();
}
const listSql="SELECT o.*,m.name model_name,m.discount_type,m.discount_value,m.contract_ids_json,b.evo_voucher_id,(SELECT COUNT(*) FROM benefit_voucher_claims c WHERE c.offer_id=o.id) claimed,(SELECT COUNT(*) FROM club_voucher_manual_codes mc WHERE mc.batch_id=o.batch_id AND mc.unit=o.unit AND NOT EXISTS(SELECT 1 FROM benefit_voucher_claims cc WHERE cc.code=mc.code) AND NOT EXISTS(SELECT 1 FROM vouchers v WHERE v.code=mc.code)) free_codes FROM benefit_voucher_offers o JOIN club_voucher_models m ON m.id=o.model_id AND m.unit=o.unit JOIN club_voucher_batches b ON b.id=o.batch_id AND b.unit=o.unit";
function publicOffer(o){let colors={};try{colors=JSON.parse(o.colors_json||"{}")}catch{}return {id:o.id,unit:o.unit,batchId:o.batch_id,modelId:o.model_id,title:o.title,description:o.description,quantity:o.quantity,remaining:Math.max(0,Math.min(o.quantity-o.claimed,o.free_codes)),claimed:o.claimed,perMember:o.per_member,start:o.start_date,end:o.end_date,status:o.status,colors,displayText:typeof colors.displayText==="string"?colors.displayText:"",modelName:o.model_name,discountType:o.discount_type,discountValue:o.discount_value,selection:o.contract_ids_json};}
export async function benefitVouchers(request,env,member,json){
 const u=new URL(request.url),admin=u.pathname.startsWith("/admin/");
 if(admin){
  const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
  if(!cookie)return json(bad("NAO_AUTORIZADO",401),401);
  const ar=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},cache:"no-store"});
  const auth=await ar.json().catch(()=>({}));
  if(!ar.ok||auth.role!=="admin")return json(bad("NAO_AUTORIZADO",401),401);
 }else if(!member)return json(bad("NAO_AUTORIZADO",401),401);
 await schema(env.DB);
 const unit=String(u.searchParams.get("unit")||"bike").toLowerCase();
 if(!["bike","gym"].includes(unit))return json(bad("UNIDADE_INVALIDA"),400);
 if(admin&&request.method==="GET"){
  const [batches,offers]=await Promise.all([
   env.DB.prepare("SELECT b.id,b.unit,b.model_id,m.name model_name,b.requested_quantity,b.status,b.created_at,b.completed_at,COUNT(mc.code) total,(SELECT COUNT(*) FROM benefit_voucher_claims c WHERE c.batch_id=b.id) claimed,(SELECT COUNT(*) FROM club_voucher_manual_codes mm WHERE mm.batch_id=b.id AND NOT EXISTS(SELECT 1 FROM benefit_voucher_claims cc WHERE cc.code=mm.code) AND NOT EXISTS(SELECT 1 FROM vouchers v WHERE v.code=mm.code)) free FROM club_voucher_batches b JOIN club_voucher_models m ON m.id=b.model_id AND m.unit=b.unit LEFT JOIN club_voucher_manual_codes mc ON mc.batch_id=b.id AND mc.unit=b.unit WHERE b.unit=? GROUP BY b.id ORDER BY b.id DESC").bind(unit).all(),
   env.DB.prepare(listSql+" WHERE o.unit=? ORDER BY o.id DESC").bind(unit).all()
  ]);
  return json({ok:true,batches:batches.results||[],offers:(offers.results||[]).map(publicOffer)});
 }
 if(admin&&request.method==="POST"){
  const b=await request.json().catch(()=>({})),id=Number(b.id||0),batchId=Number(b.batchId),quantity=Number(b.quantity),perMember=Number(b.perMember||1),title=String(b.title||"").trim().slice(0,120),description=String(b.description||"").trim().slice(0,500),status=String(b.status||"draft"),start=String(b.start||""),end=String(b.end||"");
  if(!title||!Number.isSafeInteger(batchId)||batchId<1||!Number.isInteger(quantity)||quantity<1||!Number.isInteger(perMember)||perMember<1||perMember>10||!["draft","active","paused"].includes(status)||start&&!/^\d{4}-\d{2}-\d{2}$/.test(start)||end&&!/^\d{4}-\d{2}-\d{2}$/.test(end)||start&&end&&end<start)return json(bad("DADOS_INVALIDOS"),400);
  const batch=await env.DB.prepare("SELECT b.*,m.id valid_model FROM club_voucher_batches b JOIN club_voucher_models m ON m.id=b.model_id AND m.unit=b.unit WHERE b.id=? AND b.unit=? AND b.status='completed'").bind(batchId,unit).first();
  if(!batch)return json(bad("LOTE_MANUAL_NAO_CONFIRMADO"),409);
  const n=await env.DB.prepare("SELECT COUNT(*) n FROM club_voucher_manual_codes WHERE batch_id=? AND unit=?").bind(batchId,unit).first();
  if(quantity>Number(n?.n||0))return json(bad("QUANTIDADE_SUPERIOR_AO_LOTE"),409);
  const reserved=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) n FROM benefit_voucher_offers WHERE batch_id=? AND id<>? AND status IN ('draft','active','paused')").bind(batchId,id).first();
  if(quantity+Number(reserved?.n||0)>Number(n.n))return json(bad("ESTOQUE_JA_RESERVADO_EM_OUTRAS_OFERTAS"),409);
  let colors={};if(typeof b.displayText==="string"){const displayText=b.displayText.trim().slice(0,48);if(displayText)colors.displayText=displayText;}if(b.colors&&typeof b.colors==="object"&&!Array.isArray(b.colors))for(const [key,value] of Object.entries(b.colors)){if(["background","text","border","badge","button"].includes(key)&&/^#[0-9a-fA-F]{6}$/.test(String(value)))colors[key]=value;}
  if(id){
   const existing=await env.DB.prepare("SELECT * FROM benefit_voucher_offers WHERE id=? AND unit=?").bind(id,unit).first();
   if(!existing)return json(bad("OFERTA_NAO_ENCONTRADA",404),404);
   if(existing.batch_id!==batchId)return json(bad("LOTE_NAO_PODE_SER_ALTERADO"),409);
   const claimed=await env.DB.prepare("SELECT COUNT(*) n FROM benefit_voucher_claims WHERE offer_id=?").bind(id).first();
   if(quantity<Number(claimed.n))return json(bad("QUANTIDADE_INFERIOR_AOS_RESGATES"),409);
   await env.DB.prepare("UPDATE benefit_voucher_offers SET title=?,description=?,quantity=?,per_member=?,start_date=?,end_date=?,status=?,colors_json=? WHERE id=? AND unit=?").bind(title,description,quantity,perMember,start||null,end||null,status,JSON.stringify(colors),id,unit).run();
  }else await env.DB.prepare("INSERT INTO benefit_voucher_offers(unit,batch_id,model_id,title,description,quantity,per_member,start_date,end_date,status,colors_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(unit,batchId,batch.model_id,title,description,quantity,perMember,start||null,end||null,status,JSON.stringify(colors)).run();
  return json({ok:true});
 }
 if(!admin&&request.method==="GET"){
  const today=dateBR(),offers=await env.DB.prepare(listSql+" WHERE o.unit=? AND o.status='active' AND (o.start_date IS NULL OR o.start_date<=?) AND (o.end_date IS NULL OR o.end_date>=?) ORDER BY o.id DESC").bind(unit,today,today).all();
  const my=await env.DB.prepare("SELECT offer_id,COUNT(*) n FROM benefit_voucher_claims WHERE member_id=? GROUP BY offer_id").bind(member.id).all();
  const counts=new Map((my.results||[]).map(x=>[x.offer_id,x.n]));
  return json({ok:true,offers:(offers.results||[]).map(x=>({...publicOffer(x),myClaims:counts.get(x.id)||0}))});
 }
 if(!admin&&request.method==="POST"){
  const body=await request.json().catch(()=>({})),id=Number(body.offerId),today=dateBR();
  if(!Number.isSafeInteger(id)||id<1)return json(bad("OFERTA_INVALIDA"),400);
  const offer=await env.DB.prepare(listSql+" WHERE o.id=? AND o.unit=?").bind(id,unit).first();
  if(!offer||offer.status!=="active"||offer.start_date&&offer.start_date>today||offer.end_date&&offer.end_date<today)return json(bad("OFERTA_INDISPONIVEL"),409);
  const result=await env.DB.prepare("INSERT INTO benefit_voucher_claims(offer_id,member_id,batch_id,code) SELECT ?,?,?,mc.code FROM club_voucher_manual_codes mc WHERE mc.batch_id=? AND mc.unit=? AND (SELECT COUNT(*) FROM benefit_voucher_claims WHERE offer_id=?)<? AND (SELECT COUNT(*) FROM benefit_voucher_claims WHERE offer_id=? AND member_id=?)<? AND NOT EXISTS(SELECT 1 FROM benefit_voucher_claims c WHERE c.code=mc.code) AND NOT EXISTS(SELECT 1 FROM vouchers v WHERE v.code=mc.code) ORDER BY mc.code LIMIT 1").bind(id,member.id,offer.batch_id,offer.batch_id,unit,id,offer.quantity,id,member.id,offer.per_member).run();
  if(!result.meta.changes)return json(bad("ESTOQUE_ESGOTADO_OU_LIMITE_ATINGIDO"),409);
  const claim=await env.DB.prepare("SELECT id,code FROM benefit_voucher_claims WHERE id=?").bind(result.meta.last_row_id).first();
  const model=await env.DB.prepare("SELECT validity_days,contract_ids_json FROM club_voucher_models WHERE id=?").bind(offer.model_id).first();
  // Codigos ja existem na EVO. Nunca chamar emissao novamente durante o resgate.
  const metadata=JSON.stringify({modelId:offer.model_id,batchId:offer.batch_id,benefitOfferId:id,selection:model?.contract_ids_json||null});
  await env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,source_type,source_id,title,metadata_json) VALUES(?,?,? ,?,'ACTIVE','BENEFIT',?,?,?)").bind(member.id,claim.code,"DISCOUNT",offer.description||offer.title,String(id),offer.title,metadata).run();
  return json({ok:true,code:claim.code,title:offer.title,offerId:id});
 }
 return json(bad("METODO_INVALIDO",405),405);
}
