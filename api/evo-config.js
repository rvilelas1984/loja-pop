import { parseActiveReport } from "../lib/evo-active-report.js";
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
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase();
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  const cookie=String(req.headers.cookie||"");
  if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"});
   const session=await auth.json().catch(()=>({}));
   if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const evo=getEvoTransport(unit);
   const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/management/activeclients");
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1});
   const {ids,...report}=parseActiveReport(Buffer.from(await rr.arrayBuffer()));
   return res.json({ok:true,unit,...report,requests:1,source:"activeclients",scope:"clientes com contratos ativos; não representa toda a população de agregadores, suspensos e VIPs",checkedAt:new Date().toISOString()});
  }catch(e){return res.status(502).json({ok:false,error:e.code||"EVO_RELATORIO_INVALIDO",message:"Não foi possível validar o relatório de alunos ativos. Nenhum total foi estimado."})}
 }
 if(req.query.route==="vip-category-diagnostic"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  if(String(req.query.unit||"bike").toLowerCase()!=="bike")return res.status(423).json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"});
  const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));
   if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const evo=getEvoTransport("bike");
   const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v1/membership/category");
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1});
   const raw=await rr.json(),rows=Array.isArray(raw)?raw:(Array.isArray(raw?.data)?raw.data:[]);
   const safe=rows.map(x=>({id:x.idMembershipCategory??x.id??null,name:x.name??x.description??x.nameMembershipCategory??null})); 
   const vip=safe.filter(x=>/vip/i.test(String(x.name||""))).map(v=>{const source=rows.find(x=>(x.name??x.description??x.nameMembershipCategory)===v.name)||{};return {...v,categoryCode:source.idCategoryMembership??source.idCategory??source.idMembershipCategory??source.id??source.code??source.categoryId??null,fields:Object.keys(source).sort()}});
   return res.json({ok:true,unit:"bike",requests:1,totalCategories:safe.length,vip,categories:safe});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_CATEGORIA_VIP"});}
 }
 if(req.query.route==="vip-checkpoint"){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  try{const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};const r=await fetch(WORKER+"/admin/evo-vip-checkpoint",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",...body})}),d=await r.json().catch(()=>({}));return res.status(r.status).json(d)}catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_CHECKPOINT_VIP"})}
 }
 if(req.query.route==="vip-count-diagnostic"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  if(String(req.query.unit||"bike").toLowerCase()!=="bike")return res.status(423).json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"});
  const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));
   if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const skip=Math.max(0,Number(req.query.skip)||0),evo=getEvoTransport("bike");
   const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v3/membermembership?statusMemberMembership=1&showVips=true&showAggregators=true&take=25&skip="+skip);
   if(rr.status===429)return res.status(200).json({ok:true,paused:true,nextSkip:skip,requests:1});
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1,nextSkip:skip});
   const rows=await rr.json();if(!Array.isArray(rows)||rows.length>25)return res.status(502).json({ok:false,error:"EVO_RESPOSTA_INVALIDA",requests:1,nextSkip:skip});
   const vipRows=rows.filter(x=>Number(x.idCategoryMembership??x.idMembershipCategory)===1);
   const vipMembers=[...new Set(vipRows.map(x=>Number(x.idMember)).filter(Number.isInteger))];
   const status={};for(const x of vipRows){const k=String(x.statusMemberMembership??"null");status[k]=(status[k]||0)+1}
   const vipDetails=vipRows.map(x=>({idMember:x.idMember,status:x.statusMemberMembership??null,start:x.startDate??x.startDateMembership??x.dateStart??null,end:x.endDate??x.endDateMembership??x.dateEnd??null,cancel:x.cancelDate??x.cancellationDate??null,fields:Object.keys(x).sort()}));
   return res.json({ok:true,paused:false,done:rows.length<25,nextSkip:skip+rows.length,requests:1,batchContracts:rows.length,vipContracts:vipRows.length,vipMemberIds:vipMembers,status,vipDetails});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_CONTAGEM_VIP"});}
 }
 if(req.query.route==="vip-diagnostic"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase();
  if(unit!=="bike")return res.status(423).json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"});
  const cookie=String(req.headers.cookie||"");
  if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"});
   const session=await auth.json().catch(()=>({}));
   if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const evo=getEvoTransport("bike"), rows=[]; let skip=0,requests=0;
   while(requests<20){
    const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v3/membermembership?statusMemberMembership=1&showVips=true&showAggregators=false&take=25&skip="+skip);
    requests++;
    if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests});
    const batch=await rr.json();
    if(!Array.isArray(batch)||batch.length>25)return res.status(502).json({ok:false,error:"EVO_VIP_RESPOSTA_INVALIDA",requests});
    rows.push(...batch);
    if(batch.length<25)break;
    skip+=25;
   }
   const uniqueMembers=[...new Set(rows.map(x=>Number(x.idMember)).filter(Number.isInteger))];
   const categories={}; for(const x of rows){const k=String(x.idMembershipCategory??"null");categories[k]=(categories[k]||0)+1}
   return res.json({ok:true,unit:"bike",contracts:rows.length,uniqueMembers:uniqueMembers.length,requests,categories,sample:rows.slice(0,3).map(x=>({idMember:x.idMember,idMembership:x.idMembership,nameMembership:x.nameMembership,idMembershipCategory:x.idMembershipCategory,statusMemberMembership:x.statusMemberMembership}))});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_DIAGNOSTICO_VIP"});}
 }
 if(req.query.route==="sync-students"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  const unit=String(req.query.unit||body.unit||"bike").toLowerCase();
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
  const job=async data=>{const r=await fetch(WORKER+"/admin/evo-current-job",{method:'POST',headers:{'Content-Type':'application/json','x-clubpop-admin-cookie':cookie},body:JSON.stringify({unit,...data})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){const e=new Error(d.error||'FALHA_ESPELHO');e.httpStatus=r.status;throw e}return d};
  let runId=String(body.runId||""),requests=0;
  try{
   const state=await job({action:runId?'check':'begin',runId});runId=state.runId;
   const skip=Number(state.nextSkip),evo=getEvoTransport(unit);let reportIds;
   if(skip===0){requests++;const rr=await evo.fetch('https://evo-integracao-api.w12app.com.br/api/v2/management/activeclients');if(!rr.ok)throw new Error('EVO_HTTP_'+rr.status);reportIds=parseActiveReport(Buffer.from(await rr.arrayBuffer())).ids;}
   requests++;
   const rr=await evo.fetch('https://evo-integracao-api.w12app.com.br/api/v2/members?status=1&showMemberships=true&take=25&skip='+skip);
   if(!rr.ok)throw new Error('EVO_HTTP_'+rr.status);
   const rows=await rr.json();
   if(!Array.isArray(rows)||rows.length>25||rows.some(m=>m.status!=='Active'||!Number.isInteger(m.idMember)||m.idMember<=0||!['Active','Suspended'].includes(m.membershipStatus)))throw new Error('EVO_POPULACAO_INVALIDA');
   const students=rows.map(m=>({id:String(m.idMember),name:[m.firstName,m.lastName].filter(Boolean).join(' ').slice(0,200),status:m.membershipStatus,gympass:Boolean(m.gympassId),totalpass:Boolean(m.codeTotalpass),fitcoins:typeof m.totalFitCoins==='number'?m.totalFitCoins:null}));
   const d=await job({action:'ingest',runId,skip,reportIds,students});
   return res.json({...d,requests,batchMembers:students.length,batchLinks:students.length,source:'members-current-filtered'});
  }catch(e){if(runId){try{await job({action:'fail',runId,requests,error:e.message})}catch{}}return res.status(e.httpStatus||502).json({ok:false,error:e.message||'FALHA_SYNC_ALUNOS',requests});}
 }
 if(req.query.route==="sync-now"){
  return res.status(409).json({ok:false,error:"Use Alunos EVO → Sincronizar alunos. A varredura histórica foi desativada."});
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
