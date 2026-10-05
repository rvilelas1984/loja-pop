import { attendanceWeekStarts } from "../lib/evo-attendance-weeks.js";
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
  if(!["bike","gym"].includes(unit))return res.status(400).json({ok:false,error:"UNIDADE_INVALIDA"});
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
   const vipCategoryId=1,todayBR=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
   const membershipRows=m=>Array.isArray(m.memberships)?m.memberships:Array.isArray(m.memberMemberships)?m.memberMemberships:Array.isArray(m.membership)?m.membership:[];
   const students=rows.map(m=>{const memberships=membershipRows(m),vipMemberships=memberships.filter(x=>{if(Number(x?.idCategoryMembership??x?.idMembershipCategory??x?.membershipCategory?.idCategoryMembership??x?.membershipCategory?.id)!==vipCategoryId)return false;const end=String(x?.endDate??x?.endDateMembership??x?.dateEnd??x?.end??"").slice(0,10),cancel=String(x?.cancelDate??x?.cancellationDate??x?.dateCancel??"").slice(0,10);return (!end||end>=todayBR)&&(!cancel||cancel>=todayBR)});return {id:String(m.idMember),name:[m.firstName,m.lastName].filter(Boolean).join(' ').slice(0,200),status:m.membershipStatus,gympass:Boolean(m.gympassId),totalpass:Boolean(m.codeTotalpass),fitcoins:typeof m.totalFitCoins==='number'?m.totalFitCoins:null,vip:vipMemberships.length>0,vipMemberships:vipMemberships.map(x=>({idMembership:x.idMembership??x.idMemberMembership??null,idCategoryMembership:x.idCategoryMembership??x.idMembershipCategory??x.membershipCategory?.idCategoryMembership??x.membershipCategory?.id??null,status:x.statusMemberMembership??x.status??null,start:x.startDate??x.startDateMembership??x.dateStart??x.start??null,end:x.endDate??x.endDateMembership??x.dateEnd??x.end??null,cancel:x.cancelDate??x.cancellationDate??x.dateCancel??null})),raw:m}});
   const d=await job({action:'ingest',runId,skip,reportIds,students});
   return res.json({...d,requests,batchMembers:students.length,batchLinks:students.length,source:'members-current-filtered'});
  }catch(e){if(runId){try{await job({action:'fail',runId,requests,error:e.message})}catch{}}return res.status(e.httpStatus||502).json({ok:false,error:e.message||'FALHA_SYNC_ALUNOS',requests});}
 }
 if(req.query.route==="attendance-control-d1"){res.setHeader("Cache-Control","no-store");if(req.method!=="GET")return res.status(405).json({ok:false});try{const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:String(req.headers.cookie||"")},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});const id=String(req.query.idMember||"").replace(/\D/g,""),start=String(req.query.start||""),end=String(req.query.end||""),month=start.slice(0,7);if(!id||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(end)||start>end||month!==end.slice(0,7))return res.status(400).json({ok:false,error:"Período inválido"});const base=process.env.WORKER_BASE_URL||"https://club-pop-api.renato-vilelas-personal.workers.dev";const rr=await fetch(base+"/admin/evo-test-client?unit=bike&id="+encodeURIComponent(id)+"&month="+encodeURIComponent(month),{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const d=await rr.json().catch(()=>({}));if(!rr.ok)return res.status(rr.status).json({ok:false,error:d.error||"Falha na leitura D1"});const rows=(d.attendanceRows||[]).filter(x=>String(x.attendance_date||"")>=start&&String(x.attendance_date||"")<=end).map(x=>({idActivitySession:x.idActivitySession,date:x.attendance_date,startTime:x.start_time,activity:x.activity_name}));return res.json({ok:true,total:rows.length,rows});}catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_D1"});}}
 if(req.query.route==="attendance-control-check"){res.setHeader("Cache-Control","no-store");if(req.method!=="GET")return res.status(405).json({ok:false});const cookie=String(req.headers.cookie||"");try{const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});const id=String(req.query.idMember||"").replace(/\D/g,""),start=String(req.query.start||""),end=String(req.query.end||"");if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end))return res.status(400).json({ok:false,error:"PARAMETROS_INVALIDOS"});const evo=getEvoTransport("bike"),rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?idMember="+id+"&dateStart="+start+"&dateEnd="+end+"&skip=0&take=100");if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status});const raw=await rr.json(),rows=(Array.isArray(raw)?raw:(raw?.items||raw?.data||[])).filter(x=>x?.presenca===true&&x?.isFinalized===true);return res.json({ok:true,idMember:id,start,end,total:rows.length,rows:rows.map(x=>({date:x.date||x.activityDate||x.startDate||null,startTime:x.startTime||x.time||null,idActivitySession:x.idActivitySession??x.idAtividadeSessao??x.idActivitieSession??null,activity:x.activityName||x.name||null,presenca:x.presenca,isFinalized:x.isFinalized}))});}catch(e){return res.status(502).json({ok:false,error:e.code||e.message||"FALHA_CONTROLE"});}}
 if(req.query.route==="attendance-history-import"){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cookie=String(req.headers.cookie||""),start=String(req.query.start||""),end=String(req.query.end||"");if(!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return res.status(400).json({ok:false,error:"PERIODO_INVALIDO"});
  try{const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const evo=getEvoTransport("bike");let requests=0;
   const qr=await fetch(WORKER+"/admin/evo-attendance-import-queue?unit=bike&start="+encodeURIComponent(start)+"&end="+encodeURIComponent(end),{headers:{"x-clubpop-admin-cookie":cookie},cache:"no-store"}),qd=await qr.json().catch(()=>({}));if(!qr.ok||!qd.ok)return res.status(qr.status||502).json({ok:false,error:qd.error||"ANALISE_NAO_PERSISTIDA"});const ids=(qd.sessions||[]).map(x=>String(x.id)),all=new Map((qd.sessions||[]).map(x=>[String(x.id),{id:String(x.id),date:x.date}]));
   const processed=[];for(let i=0;i<ids.length;i+=100){const r=await fetch(WORKER+"/admin/evo-attendance-sessions",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessionIds:ids.slice(i,i+100)})}),d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||"FALHA_CONTROLE_SESSOES");processed.push(...(d.processed||[]))}
   const done=new Set(processed.map(String)),pending=[...all.values()].filter(x=>!done.has(x.id)).slice(0,25);let saved=0,classesDone=0;
   for(const s of pending){requests++;const dr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+s.id);if(dr.status===429)return res.status(200).json({ok:true,paused:true,reason:"EVO_HTTP_429",period:start+" a "+end,requests,classesFound:ids.length,alreadyProcessed:done.size,batchClasses:classesDone,presencesSaved:saved,remaining:Math.max(0,ids.length-done.size-classesDone),complete:false});if(!dr.ok)return res.status(502).json({ok:false,error:"EVO_DETALHE_HTTP_"+dr.status,requests,classesDone,saved});const p=await dr.json(),d=Array.isArray(p)&&p.length===1?p[0]:p;if(!d||String(d.idActivitySession)!==s.id||Number(d.status)!==6||!Array.isArray(d.enrollments))throw Error("DETALHE_INVALIDO");const mt=String(d.startTime||"").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);if(!mt)throw Error("HORARIO_INVALIDO");let h=Number(mt[1]);if(mt[3])h=h%12+(mt[3].toUpperCase()==="PM"?12:0);const st=String(h).padStart(2,"0")+":"+mt[2],rows=[],seen=new Set();for(const e of d.enrollments){if(![0,1,2].includes(e.status))throw Error("STATUS_INVALIDO");if(e.removed===true||!Number.isSafeInteger(e.idMember)||e.idMember<=0)continue;const mid=String(e.idMember);if(seen.has(mid))throw Error("PARTICIPANTE_DUPLICADO");seen.add(mid);if(e.status===0)rows.push({id:mid,date:s.date,startTime:st,activity:String(d.name||"").slice(0,200),idActivitySession:s.id,presenca:true,isFinalized:true,raw:e})}
    const ir=await fetch(WORKER+"/admin/evo-attendance-ingest-class",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessionId:s.id,date:s.date,startTime:st,activity:String(d.name||"").slice(0,200),rows})}),id=await ir.json().catch(()=>({}));if(!ir.ok||!id.ok)throw Error(id.error||"FALHA_GRAVACAO_AULA");saved+=Number(id.saved||0);classesDone++}
   return res.json({ok:true,period:start+" a "+end,weeks:0,requests,classesFound:ids.length,alreadyProcessed:done.size,batchClasses:classesDone,presencesSaved:saved,remaining:Math.max(0,ids.length-done.size-classesDone),complete:ids.length<=done.size+classesDone});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_IMPORTACAO_HISTORICA"});}
 }
 if(req.query.route==="attendance-history-estimate"){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cookie=String(req.headers.cookie||""),start=String(req.query.start||""),end=String(req.query.end||"");
  if(!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return res.status(400).json({ok:false,error:"PERIODO_INVALIDO"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const [sy,sm]=start.split("-").map(Number),[ey,em]=end.split("-").map(Number),from=new Date(Date.UTC(sy,sm-1,1)),to=new Date(Date.UTC(ey,em,0)),evo=getEvoTransport("bike"),all=new Map();let requests=0,weeks=0;
   for(const date of attendanceWeekStarts(start,end)){requests++;weeks++;const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+date+"&showFullWeek=true&onlyAvailables=false&take=100");if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_GRADE_HTTP_"+rr.status,requests,weeks});
    const raw=await rr.json(),list=Array.isArray(raw)?raw:(Array.isArray(raw?.data)?raw.data:[]);for(const s of list){const day=String(s?.activityDate||s?.date||"").slice(0,10),id=s?.idAtividadeSessao??s?.idActivitySession??s?.idActivitieSession;if(day<from.toISOString().slice(0,10)||day>to.toISOString().slice(0,10)||Number(s?.status)!==6||!Number.isSafeInteger(Number(id))||Number(id)<=0)continue;all.set(String(id),{id:String(id),date:day});}}
   const discovered=[...all.values()];
   for(let i=0;i<discovered.length;i+=100){const qr=await fetch(WORKER+"/admin/evo-attendance-import-queue",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessions:discovered.slice(i,i+100)})}),qd=await qr.json().catch(()=>({}));if(!qr.ok||!qd.ok)throw Error(qd.error||"FALHA_PERSISTIR_FILA");}
   const ids=[...all.keys()];let processed=[];
   for(let i=0;i<ids.length;i+=100){const pr=await fetch(WORKER+"/admin/evo-attendance-sessions",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessionIds:ids.slice(i,i+100)}),cache:"no-store"}),pd=await pr.json().catch(()=>({}));if(!pr.ok||!pd.ok)return res.status(pr.status||502).json({ok:false,error:pd.error||"FALHA_CONTROLE_SESSOES",requests,weeks});processed.push(...(pd.processed||[]));}
   const done=new Set(processed.map(String)),pending=ids.filter(id=>!done.has(id));
   return res.json({ok:true,period:start+" a "+end,weeks,requests,classesFound:ids.length,alreadyProcessed:ids.length-pending.length,pendingClasses:pending.length,estimatedTotalRequests:requests+pending.length});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_ESTIMATIVA_HISTORICA"});}
 }
 if(req.query.route==="attendance-day-test"){
  res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cookie=String(req.headers.cookie||""),date=String(req.query.date||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({ok:false,error:"DATA_INVALIDA"});
  try{
   const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
   const evo=getEvoTransport("bike");let requests=1;
   const sr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+encodeURIComponent(date)+"&showFullWeek=false&onlyAvailables=false&take=100");if(!sr.ok)return res.status(502).json({ok:false,error:"EVO_GRADE_HTTP_"+sr.status,requests});
   const raw=await sr.json(),list=Array.isArray(raw)?raw:(Array.isArray(raw?.data)?raw.data:[]),sessions=[];
   for(const s of list){const d=String(s?.activityDate||s?.date||"").slice(0,10);if(d!==date||Number(s?.status)!==6)continue;const id=s?.idAtividadeSessao??s?.idActivitySession??s?.idActivitieSession;if(!Number.isSafeInteger(Number(id))||Number(id)<=0)continue;sessions.push({id:String(id),date:d});}
   const unique=[...new Map(sessions.map(x=>[x.id,x])).values()];
   const pr=await fetch(WORKER+"/admin/evo-attendance-sessions",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessionIds:unique.map(x=>x.id)}),cache:"no-store"}),pd=await pr.json().catch(()=>({}));if(!pr.ok||!pd.ok)return res.status(pr.status||502).json({ok:false,error:pd.error||"FALHA_CONTROLE_SESSOES",requests});
   const done=new Set((pd.processed||[]).map(String)),pending=unique.filter(x=>!done.has(x.id));let saved=0,participants=0;
   for(const s of pending){requests++;const dr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(s.id));if(!dr.ok)return res.status(502).json({ok:false,error:"EVO_DETALHE_HTTP_"+dr.status,requests,sessionId:s.id});
    const payload=await dr.json(),d=Array.isArray(payload)&&payload.length===1?payload[0]:payload;if(!d||String(d.idActivitySession)!==s.id||Number(d.status)!==6||!Array.isArray(d.enrollments))return res.status(502).json({ok:false,error:"DETALHE_AULA_INVALIDO",requests,sessionId:s.id});
    const tm=String(d.startTime||"").trim(),m=tm.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);if(!m)return res.status(502).json({ok:false,error:"HORARIO_AULA_INVALIDO",requests,sessionId:s.id});let h=Number(m[1]);if(m[3])h=h%12+(m[3].toUpperCase()==="PM"?12:0);const startTime=String(h).padStart(2,"0")+":"+m[2],rows=[],seen=new Set();
    for(const e of d.enrollments){if(![0,1,2].includes(e.status))return res.status(502).json({ok:false,error:"STATUS_PRESENCA_DESCONHECIDO",requests,sessionId:s.id});if(e.removed===true||!Number.isSafeInteger(e.idMember)||e.idMember<=0)continue;const id=String(e.idMember);if(seen.has(id))return res.status(502).json({ok:false,error:"PARTICIPANTE_DUPLICADO",requests,sessionId:s.id});seen.add(id);if(e.status===0)rows.push({id,date,startTime,activity:String(d.name||"").slice(0,200),idActivitySession:s.id,presenca:true,isFinalized:true});}
    participants+=seen.size;const ir=await fetch(WORKER+"/admin/evo-attendance-ingest-class",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",sessionId:s.id,date,startTime,activity:String(d.name||"").slice(0,200),rows}),cache:"no-store"}),id=await ir.json().catch(()=>({}));if(!ir.ok||!id.ok)return res.status(ir.status||502).json({ok:false,error:id.error||"FALHA_GRAVACAO_AULA",requests,sessionId:s.id});saved+=Number(id.saved||0);
   }
   return res.json({ok:true,date,requests,classesFound:unique.length,alreadyProcessed:unique.length-pending.length,newClasses:pending.length,participants,saved});
  }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_SYNC_PRESENCAS_DIA"});}
 }
 if(req.query.route==="test-presence"){
 res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
 const id=String(req.query.id||"").trim(),cookie=String(req.headers.cookie||"");if(!/^[0-9]+$/.test(id))return res.status(400).json({ok:false,error:"ID_CLIENTE_INVALIDO"});
 try{const auth=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:cookie},cache:"no-store"}),session=await auth.json().catch(()=>({}));if(!auth.ok||session.role!=="admin")return res.status(401).json({ok:false,error:"Sessão administrativa necessária"});
 const now=new Date(),parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(now),ym=parts.slice(0,7),dateStart=ym+"-01T00:00:00",dateEnd=parts+"T23:59:59";
 const qs=new URLSearchParams({idMember:id,dateStart,dateEnd,skip:"0",take:"100"}),evo=getEvoTransport("bike"),rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?"+qs.toString());if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1});
 const raw=await rr.json(),rows=Array.isArray(raw)?raw:(Array.isArray(raw?.items)?raw.items:(Array.isArray(raw?.data)?raw.data:[])),present=rows.filter(x=>x?.presenca===true&&x?.isFinalized===true);
 const attendance=present.map(x=>({idActivitySession:x.idActivitySession??x.idActivitieSession??null,date:x.date??x.dateStart??null,startTime:x.startTime??null,activity:x.activitieName??x.activityName??null,presenca:x.presenca,isFinalized:x.isFinalized}));
 const save=await fetch(WORKER+"/admin/evo-test-presence",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify({unit:"bike",id,period:{dateStart,dateEnd},rows:attendance}),cache:"no-store"}),saved=await save.json().catch(()=>({}));if(!save.ok||!saved.ok)return res.status(save.status||502).json({ok:false,error:saved.error||"FALHA_AO_SALVAR_PRESENCAS",requests:1});
 return res.json({ok:true,id,requests:1,count:present.length,totalSessionsReturned:rows.length,period:{dateStart,dateEnd},rows:attendance,summary:saved.summary,saved:saved.saved});
 }catch(e){return res.status(502).json({ok:false,error:e.message||"FALHA_TESTE_PRESENCAS"});}
 }
 if(req.query.route==="test-client"){
  res.setHeader("Cache-Control","no-store");if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike",id=String(req.query.id||"").trim();
  try{const r=await fetch(WORKER+"/admin/evo-test-client?unit="+encodeURIComponent(unit)+"&id="+encodeURIComponent(id),{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao consultar cliente de teste"})}
 }
 if(req.query.route==="dashboard-diagnostic"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  try{const r=await fetch(WORKER+"/admin/evo-dashboard-diagnostic?unit="+unit,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao calcular cobertura do Dashboard"})}
 }
 if(req.query.route==="sync-now"){
  return res.status(409).json({ok:false,error:"Use Alunos EVO → Sincronizar alunos. A varredura histórica foi desativada."});
 }
 if(req.query.route==="sync-schedules"){if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false});let body={};if(req.method==="PUT"){try{body=typeof req.body==="string"?JSON.parse(req.body):req.body||{}}catch{return res.status(400).json({ok:false,error:"JSON_INVALIDO"})}}const unit=String(req.query.unit||body.unit||"bike").toLowerCase()==="gym"?"gym":"bike";try{const r=await fetch(WORKER+"/admin/evo-sync-schedules?unit="+unit,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify(body):undefined,cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar horários"})}}
 if(req.query.route==="sync-summary"){if(req.method!=="GET")return res.status(405).json({ok:false});const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike";try{const r=await fetch(WORKER+"/admin/evo-sync-summary?unit="+unit,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao consultar resumo"})}}
 if(req.query.route==="sync-config"){if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";try{const r=await fetch(WORKER+"/admin/evo-sync-config?unit="+unit,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify(req.body||{}):undefined,cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar configuração de sincronização"})}}
 if(req.query.route==="evo-requests"){
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||"bike").toLowerCase()==="gym"?"gym":"bike",days=Math.max(1,Math.min(60,Number(req.query.days||14)));
  try{const r=await fetch(WORKER+"/admin/evo-requests?unit="+unit+"&days="+days,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao consultar requisições EVO"})}
 }
 if(req.query.route==="staff-users"){if(!["GET","POST","PUT"].includes(req.method))return res.status(405).json({ok:false});try{const r=await fetch(WORKER+"/admin/staff-users",{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="GET"?undefined:JSON.stringify(req.body||{}),cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");if(req.method==="GET"&&r.ok&&process.env.RECEPTION_PIN){try{const d=JSON.parse(t);d.users=Array.isArray(d.users)?d.users:[];if(!d.users.some(u=>u.legacyReception||String(u.name||"").toLowerCase()==="recepção"))d.users.unshift({id:"legacy-reception",name:"Recepção",email:"Acesso por PIN",enabled:true,units:["bike"],permissions:["/tela-checkin.html","/admin-resgates.html","/admin-transacoes.html","/admin-numeros-sorte.html","/admin-configuracoes.html"],legacyReception:true});return res.status(r.status).send(JSON.stringify(d))}catch{}}return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar usuários"})}}
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
