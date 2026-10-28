// Cloudflare Worker route module. Mount in the existing authenticated Worker router.
// This module does not alter student access until its separate entitlement integration is enabled.
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export async function handleSharedContractAccess(request,env){
 if(!["GET","PUT","DELETE"].includes(request.method))return json({ok:false,error:"METODO_INVALIDO"},405);
 const cookie=request.headers.get("x-clubpop-admin-cookie")||"";
 if(!cookie)return json({ok:false,error:"NAO_AUTORIZADO"},401);
 let verification;
 try{
  const response=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie,Accept:"application/json"},redirect:"error"});
  if(!response.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);
  verification=await response.json();
 }catch{return json({ok:false,error:"FALHA_AUTENTICACAO"},503)}
 if(verification.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},403);
 if(request.method==="GET"){
  const [rules,catalog]=await Promise.all([
   env.DB.prepare("SELECT r.unit,r.contract_id AS contractId,c.contract_name AS name, r.enabled FROM shared_unit_contract_rules r LEFT JOIN evo_contract_catalog c ON c.unit=r.unit AND c.evo_contract_id=r.contract_id AND c.is_active=1 WHERE r.enabled=1 ORDER BY r.unit,c.contract_name").all(),
   env.DB.prepare("SELECT unit,evo_contract_id AS contractId,contract_name AS name FROM evo_contract_catalog WHERE is_active=1 ORDER BY unit,contract_name").all()
  ]);
  return json({ok:true,rules:rules.results||[],catalog:catalog.results||[]});
 }
 let body;
 try{body=await request.json()}catch{return json({ok:false,error:"JSON_INVALIDO"},400)}
 const unit=String(body?.unit||""),contractId=String(body?.contractId||"");
 if(!["bike","gym"].includes(unit)||!/^[0-9]{1,30}$/.test(contractId))return json({ok:false,error:"CONTRATO_INVALIDO"},400);
 if(request.method==="PUT"){
  const found=await env.DB.prepare("SELECT 1 AS ok FROM evo_contract_catalog WHERE unit=? AND evo_contract_id=? AND is_active=1 LIMIT 1").bind(unit,contractId).first();
  if(!found)return json({ok:false,error:"CONTRATO_NAO_ENCONTRADO"},404);
  await env.DB.prepare("INSERT INTO shared_unit_contract_rules(unit,contract_id,enabled,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(unit,contract_id) DO UPDATE SET enabled=1,updated_at=CURRENT_TIMESTAMP").bind(unit,contractId).run();
 }else{
  await env.DB.prepare("UPDATE shared_unit_contract_rules SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND contract_id=?").bind(unit,contractId).run();
 }
 return json({ok:true});
}
