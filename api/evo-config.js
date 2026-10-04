import { unzipSync } from "node:zlib";
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
 if(req.query.route==="active-count"){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  try{
   const evo=getEvoTransport(unit);if(!evo.configured)return res.status(409).json({ok:false,error:"EVO_NAO_CONFIGURADA"});
   const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/members/active-members");
   const bytes=Buffer.from(await rr.arrayBuffer());\n   let raw=bytes.toString("utf8");\n   let compressed=false;\n   if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b){compressed=true;throw new Error("ZIP_CONTAINER_DETECTED")};
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1});
   const contentType=String(rr.headers.get("content-type")||"").toLowerCase();
   let ids=[],branches=[],format="unknown";
   if(contentType.includes("json")||/^\s*[\[{]/.test(raw)){
    const parsed=JSON.parse(raw);const rows=Array.isArray(parsed)?parsed:Array.isArray(parsed?.data)?parsed.data:Array.isArray(parsed?.items)?parsed.items:[];
    ids=rows.map(x=>Number(x.idMember??x.IdMember??x.idCliente??x.IdCliente)).filter(Boolean);
    branches=rows.map(x=>Number(x.idBranch??x.IdBranch??x.idFilial??x.IdFilial)).filter(Boolean);format="json";
   }else{
    const values=(names)=>{for(const n of names){const re=new RegExp("<(?:\\w+:)?"+n+"(?:\\s[^>]*)?>\\s*(\\d+)\\s*<\\/(?:\\w+:)?"+n+">","gi"),v=[...raw.matchAll(re)].map(m=>Number(m[1])).filter(Boolean);if(v.length)return v}return[]};
    ids=values(["idMember","IdMember","idCliente","IdCliente"]);
    branches=values(["idBranch","IdBranch","idFilial","IdFilial"]);format="xml";
   }
   const unique=[...new Set(ids)];
   const safeTags=[...new Set([...raw.matchAll(/<(?:\\w+:)?([A-Za-z][A-Za-z0-9_]*)/g)].map(m=>m[1]))].filter(x=>/^(idMember|IdMember|idCliente|IdCliente|idBranch|IdBranch|idFilial|IdFilial|ActiveMembersReturnViewModel|ClientesAtivosRetornoViewModel|ClientesAtivosViewModel|ArrayOf)/i.test(x)).slice(0,20);
   return res.json({ok:true,unit,activeMembers:unique.length,records:ids.length,requests:1,branchIds:[...new Set(branches)],source:"active-members",format,contentType,safeTags,bodyBytes:Buffer.byteLength(raw),checkedAt:new Date().toISOString()});
  }catch(e){return res.status(502).json({ok:false,error:String(e?.message||"FALHA_ACTIVE_COUNT"),requests:1})}
 }
 if(req.query.route==="sync-students"){
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  try{
   const evo=getEvoTransport(unit);if(!evo.configured)return res.status(409).json({ok:false,error:"EVO_NAO_CONFIGURADA"});
   const skip=Math.max(0,Number(req.body?.skip||0)),take=25;
   const url="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take="+take+"&skip="+skip+"&statusMemberMembership=1&showAggregators=true&showVips=true";
   const rr=await evo.fetch(url);const j=await rr.json().catch(()=>null);
   if(rr.status===429)return res.status(200).json({ok:true,paused:true,skip,requests:1,message:"EVO solicitou uma pausa. O progresso foi preservado."});
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,skip,requests:1});
   const links=Array.isArray(j)?j:Array.isArray(j?.data)?j.data:Array.isArray(j?.items)?j.items:Array.isArray(j?.list)?j.list:[];
   const map=new Map();
   for(const x of links){const id=Number(x.idMember??x.memberId??x.idClient);if(!id)continue;const categoryId=x.idMembershipCategory??x.idCategoryMembership??x.categoryId??null;map.set(id,{...x,idMember:id,firstName:String(x.memberName??x.nameMember??x.firstName??x.name??""),lastName:String(x.lastName??""),status:"Active",membershipStatus:x.statusMemberMembership??x.status??"Active",contractName:String(x.nameMembership??x.membershipName??x.contractDescription??x.name??""),contractType:String(x.contractType??""),idContractType:x.idContractType??null,idMembership:x.idMembership??x.idMembershipPlan??null,idMembershipCategory:categoryId,membershipCategoryName:String(x.membershipCategoryName??x.categoryName??x.nameMembershipCategory??""),contractStart:x.startDate??x.contractStart??x.dtStart??"",contractEnd:x.endDate??x.contractEnd??x.dtEnd??""})}
   const members=[...map.values()],done=links.length<take,nextSkip=skip+links.length;
   const ing=await fetch(WORKER+"/admin/evo-students-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:JSON.stringify({unit,members,requests:1,source:"membermembership-active-batch",incremental:true,reset:skip===0,skip,nextSkip,done})});
   const d=await ing.json().catch(()=>({}));if(!ing.ok||!d.ok)return res.status(ing.status||502).json({ok:false,error:d.error||"FALHA_SYNC_ALUNOS",skip,requests:1});
   return res.json({...d,requests:1,batchMembers:members.length,batchLinks:links.length,skip,nextSkip,done,source:"membermembership-active-batch"});
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