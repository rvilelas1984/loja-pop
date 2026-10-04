import { verifyServiceRequest, getEvoTransport } from "../lib/evo-transport.js";
const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 if(req.query.route==="verify-service"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({ok:false});
  const body=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
  const valid=body.length<=8192&&verifyServiceRequest(body,String(req.headers["x-evo-timestamp"]||""),String(req.headers["x-evo-signature"]||""),process.env.ADMIN_KEY);
  return res.status(valid?200:401).json({ok:valid,serviceVerified:valid});
 }
 if(req.query.route==="students"){if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike";try{const r=await fetch(WORKER+"/admin/evo-students?unit="+unit,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao consultar alunos EVO"})}}
 if(req.query.route==="sync-students"){
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  try{
   const evo=getEvoTransport(unit);if(!evo.configured)return res.status(409).json({ok:false,error:"EVO_NAO_CONFIGURADA"});
   let all=[],requests=0;
   for(let skip=0;skip<2000;skip+=25){
    const url="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take=25&skip="+skip+"&statusMemberMembership=1&showAggregators=true&showVips=true";
    const rr=await evo.fetch(url);requests++;const j=await rr.json().catch(()=>null);
    if(!rr.ok)throw new Error("EVO_HTTP_"+rr.status);
    const rows=Array.isArray(j)?j:Array.isArray(j?.data)?j.data:Array.isArray(j?.items)?j.items:Array.isArray(j?.list)?j.list:[];
    all.push(...rows);if(rows.length<25)break;
   }
   if(!all.length)return res.status(502).json({ok:false,error:"EVO_MEMBERMEMBERSHIP_SEM_REGISTROS",requests});
   const members=new Map();
   for(const x of all){
    const id=Number(x.idMember??x.memberId??x.idClient);if(!id)continue;
    const contractName=String(x.nameMembership??x.membershipName??x.contractDescription??x.name??"");
    const categoryId=x.idMembershipCategory??x.idCategoryMembership??x.categoryId??null;
    const categoryName=String(x.membershipCategoryName??x.categoryName??x.nameMembershipCategory??"");
    const row={...x,idMember:id,firstName:String(x.memberName??x.nameMember??x.firstName??x.name??""),lastName:String(x.lastName??""),status:"Active",membershipStatus:x.statusMemberMembership??x.status??"Active",contractName,contractType:String(x.contractType??""),idContractType:x.idContractType??null,idMembership:x.idMembership??x.idMembershipPlan??null,idMembershipCategory:categoryId,membershipCategoryName:categoryName,contractStart:x.startDate??x.contractStart??x.dtStart??"",contractEnd:x.endDate??x.contractEnd??x.dtEnd??""};
    const prev=members.get(id);if(!prev||(!prev.idMembershipCategory&&row.idMembershipCategory))members.set(id,row);
   }
   const rows=[...members.values()];
   if(!rows.length)return res.status(502).json({ok:false,error:"EVO_MEMBERMEMBERSHIP_SEM_ALUNOS",requests});
   const ing=await fetch(WORKER+"/admin/evo-students-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:JSON.stringify({unit,members:rows,requests,source:"membermembership-active"})});
   const d=await ing.json().catch(()=>({}));if(!ing.ok||!d.ok)return res.status(ing.status||502).json({ok:false,error:d.error||"FALHA_SYNC_ALUNOS",requests});
   return res.json({...d,requests,members:rows.length,links:all.length,source:"membermembership-active"});
  }catch(e){return res.status(502).json({ok:false,error:String(e?.message||"FALHA_SYNC_ALUNOS")})}
 }
 if(req.query.route==="sync-now"){
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  try{
   const evo=getEvoTransport(unit); if(!evo.configured)return res.status(409).json({ok:false,error:"EVO_NAO_CONFIGURADA"});
   let all=[],skip=0,requests=0;
   for(let page=0;page<20;page++){const u="https://evo-integracao-api.w12app.com.br/api/v2/members?take=50&skip="+skip;const rr=await evo.fetch(u);requests++;const j=await rr.json().catch(()=>null);if(!rr.ok)throw new Error("EVO_HTTP_"+rr.status);const rows=Array.isArray(j)?j:Array.isArray(j?.data)?j.data:Array.isArray(j?.items)?j.items:[];all.push(...rows);if(rows.length<50)break;skip+=50}
   if(!all.length)return res.status(502).json({ok:false,error:"EVO_SEM_MEMBROS",requests});
   const ing=await fetch(WORKER+"/admin/evo-sync-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:JSON.stringify({unit,members:all,requests})});const d=await ing.json().catch(()=>({}));if(!ing.ok||!d.ok)return res.status(ing.status||502).json({ok:false,error:d.error||"FALHA_CACHE",requests});
   return res.json({ok:true,unit,requests,members:all.length,saved:d.saved});
  }catch(e){return res.status(502).json({ok:false,error:String(e?.message||"FALHA_SYNC")})}
 }
 if(req.query.route==="sync-config"){if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";try{const r=await fetch(WORKER+"/admin/evo-sync-config?unit="+unit,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify(req.body||{}):undefined,cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar configuração de sincronização"})}}
 if(req.query.route==="evo-requests"){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike",days=Math.max(1,Math.min(60,Number(req.query.days||14)));
  try{const r=await fetch(WORKER+"/admin/evo-requests?unit="+unit+"&days="+days,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao consultar requisições EVO"})}
 }
 if(req.query.route==="checkin-layouts"){
  if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
  const qs=new URLSearchParams({unit});
  try{const r=await fetch(WORKER+"/admin/checkin-layouts?"+qs,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify({...req.body,unit}):undefined});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar layouts de check-in"})}
 }
 if(!["GET","PUT","POST"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
 const headers={"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")};
 const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
 try{const r=await fetch(WORKER+"/admin/evo-config?unit="+encodeURIComponent(unit),{method:req.method,headers,body:req.method==="GET"?undefined:JSON.stringify({...req.body,unit})});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch(e){return res.status(502).json({ok:false,error:"Falha de comunicação com configuração EVO"})}
}