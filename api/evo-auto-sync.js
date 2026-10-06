import { parseActiveReport } from "../lib/evo-active-report.js";
import { getEvoTransport } from "../lib/evo-transport.js";
const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export const config={maxDuration:60};
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
 const secret=String(req.headers["x-auto-sync-secret"]||"");if(!secret||secret!==String(process.env.AUTO_SYNC_SECRET||""))return res.status(401).json({ok:false,error:"NAO_AUTORIZADO"});
 const unit=String(req.query.unit||"bike").toLowerCase();if(!["bike","gym"].includes(unit))return res.status(400).json({ok:false,error:"UNIDADE_INVALIDA"});
 const job=async data=>{const r=await fetch(WORKER+"/internal/evo-current-job",{method:"POST",headers:{"Content-Type":"application/json","x-auto-sync-secret":secret},body:JSON.stringify({unit,...data})}),d=await r.json().catch(()=>({}));if(!r.ok||!d.ok){const e=new Error(d.error||"FALHA_ESPELHO");e.httpStatus=r.status;throw e}return d};
 let runId="",requests=0;
 try{
  let state=await job({action:"begin"});runId=state.runId;const evo=getEvoTransport(unit);let reportIds;
  for(let cycle=0;cycle<260;cycle++){
   const skip=Number(state.nextSkip||0);
   if(skip===0){requests++;const ar=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/management/activeclients");if(!ar.ok)throw new Error("EVO_HTTP_"+ar.status);reportIds=parseActiveReport(Buffer.from(await ar.arrayBuffer())).ids;}
   requests++;const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/members?status=1&showMemberships=true&take=25&skip="+skip);if(!rr.ok)throw new Error("EVO_HTTP_"+rr.status);
   const rows=await rr.json();if(!Array.isArray(rows)||rows.length>25||rows.some(m=>m.status!=="Active"||!Number.isInteger(m.idMember)||m.idMember<=0||!["Active","Suspended"].includes(m.membershipStatus)))throw new Error("EVO_POPULACAO_INVALIDA");
   const todayBR=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),membershipRows=m=>Array.isArray(m.memberships)?m.memberships:Array.isArray(m.memberMemberships)?m.memberMemberships:Array.isArray(m.membership)?m.membership:[];
   const students=rows.map(m=>{const memberships=membershipRows(m),vipMemberships=memberships.filter(x=>{if(Number(x?.idCategoryMembership??x?.idMembershipCategory??x?.membershipCategory?.idCategoryMembership??x?.membershipCategory?.id)!==1)return false;const end=String(x?.endDate??x?.endDateMembership??x?.dateEnd??x?.end??"").slice(0,10),cancel=String(x?.cancelDate??x?.cancellationDate??x?.dateCancel??"").slice(0,10);return(!end||end>=todayBR)&&(!cancel||cancel>=todayBR)});return{id:String(m.idMember),name:[m.firstName,m.lastName].filter(Boolean).join(" ").slice(0,200),status:m.membershipStatus,gympass:Boolean(m.gympassId),totalpass:Boolean(m.codeTotalpass),fitcoins:typeof m.totalFitCoins==="number"?m.totalFitCoins:null,vip:vipMemberships.length>0,vipMemberships:vipMemberships.map(x=>({idMembership:x.idMembership??x.idMemberMembership??null,idCategoryMembership:x.idCategoryMembership??x.idMembershipCategory??x.membershipCategory?.idCategoryMembership??x.membershipCategory?.id??null,status:x.statusMemberMembership??x.status??null,start:x.startDate??x.startDateMembership??x.dateStart??x.start??null,end:x.endDate??x.endDateMembership??x.dateEnd??x.end??null,cancel:x.cancelDate??x.cancellationDate??x.dateCancel??null})),raw:m}});
   state=await job({action:"ingest",runId,skip,reportIds,students});if(state.done)return res.json({...state,ok:true,unit,requests,automatic:true});
  }
  throw new Error("LIMITE_DE_LOTES_EXCEDIDO");
 }catch(e){if(runId){try{await job({action:"fail",runId,requests,error:e.message})}catch{}}return res.status(e.httpStatus||502).json({ok:false,unit,error:e.message||"FALHA_SYNC_AUTOMATICA",requests,automatic:true})}
}