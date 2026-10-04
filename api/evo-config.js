import { inflateRawSync } from "node:zlib";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
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
   const bytes=Buffer.from(await rr.arrayBuffer());
   let raw=bytes.toString("utf8"),zipEntries=[];
   if(bytes.length>=4&&bytes[0]===0x50&&bytes[1]===0x4b){
    const end=bytes.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));if(end<0)throw new Error("ZIP_EOCD_NOT_FOUND");
    const count=bytes.readUInt16LE(end+10),central=bytes.readUInt32LE(end+16);let pos=central,files=[];
    for(let n=0;n<count;n++){
     if(bytes.readUInt32LE(pos)!==0x02014b50)throw new Error("ZIP_CENTRAL_INVALID");
     const method=bytes.readUInt16LE(pos+10),csize=bytes.readUInt32LE(pos+20),usize=bytes.readUInt32LE(pos+24),nlen=bytes.readUInt16LE(pos+28),xlen=bytes.readUInt16LE(pos+30),clen=bytes.readUInt16LE(pos+32),local=bytes.readUInt32LE(pos+42);
     const name=bytes.subarray(pos+46,pos+46+nlen).toString("utf8"),lnlen=bytes.readUInt16LE(local+26),lxlen=bytes.readUInt16LE(local+28),start=local+30+lnlen+lxlen,payload=bytes.subarray(start,start+csize);
     if(method!==0&&method!==8)throw new Error("ZIP_METHOD_"+method);
     const data=method===0?payload:inflateRawSync(payload);if(data.length!==usize)throw new Error("ZIP_SIZE_MISMATCH");
     zipEntries.push({name,bytes:data.length,method});files.push({name,data});pos+=46+nlen+xlen+clen;
    }
    const chosen=files.find(x=>/\.(json|xml|csv|txt)$/i.test(x.name)&&!/^(__MACOSX|_rels|docProps)\//i.test(x.name))||files.find(x=>!x.name.endsWith("/"));
    if(!chosen)throw new Error("ZIP_EMPTY");raw=chosen.data.toString("utf8");
   }
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
   return res.json({ok:true,unit,activeMembers:unique.length,records:ids.length,requests:1,branchIds:[...new Set(branches)],source:"active-members",format,contentType,zipEntries,safeTags,bodyBytes:Buffer.byteLength(raw),checkedAt:new Date().toISOString()});
  }catch(e){return res.status(502).json({ok:false,error:String(e?.message||"FALHA_ACTIVE_COUNT"),requests:1})}
 }
 if(req.query.route==="sync-students"){
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase()==="gym"?"gym":"bike";
  if(unit!=="bike")return res.status(423).json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"});
  try{
   const evo=getEvoTransport(unit);if(!evo.configured)return res.status(409).json({ok:false,error:"EVO_NAO_CONFIGURADA"});
   const rr=await evo.fetch("https://evo-integracao-api.w12app.com.br/api/v2/management/activeclients");
   const bytes=Buffer.from(await rr.arrayBuffer());
   if(!rr.ok)return res.status(502).json({ok:false,error:"EVO_HTTP_"+rr.status,requests:1});
   if(bytes.length<4||bytes[0]!==0x50||bytes[1]!==0x4b)return res.status(502).json({ok:false,error:"ACTIVECLIENTS_NAO_XLSX",requests:1});
   let XLSX;try{XLSX=require("xlsx")}catch{return res.status(500).json({ok:false,error:"XLSX_READER_INDISPONIVEL",requests:1})}
   const wb=XLSX.read(bytes,{type:"buffer",cellDates:false,raw:false}),ws=wb.Sheets[wb.SheetNames[0]];
   const rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
   const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
   const keys=rows.length?Object.keys(rows[0]):[],pick=(row,names)=>{for(const n of names){const wanted=norm(n),k=keys.find(x=>norm(x)===wanted);if(k&&row[k]!==""&&row[k]!=null)return row[k]}return""};
   const map=new Map();
   for(const row of rows){
    const id=Number(pick(row,["idMember","IdMember","idCliente","IdCliente","codigoCliente","codigo"]));if(!id)continue;
    const full=String(pick(row,["nome","name","nomeCliente","cliente","memberName"])||"").trim(),parts=full.split(/\s+/);
    map.set(id,{idMember:id,firstName:String(pick(row,["firstName","primeiroNome"])||parts.shift()||""),lastName:String(pick(row,["lastName","sobrenome"])||parts.join(" ")),status:"Active",membershipStatus:"Active",contractName:String(pick(row,["contrato","plano","membership","nameMembership","nomeContrato"])||""),membershipCategoryName:String(pick(row,["categoria","category","membershipCategoryName"])||""),source:"activeclients"});
   }
   const members=[...map.values()];
   if(!members.length)return res.status(502).json({ok:false,error:"ACTIVECLIENTS_SEM_IDS",requests:1,rows:rows.length,columns:keys.slice(0,30)});
   const ing=await fetch(WORKER+"/admin/evo-students-ingest",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:JSON.stringify({unit,members,requests:1,source:"activeclients-xlsx",incremental:false,reset:true,skip:0,nextSkip:members.length,done:true,authoritative:true})});
   const d=await ing.json().catch(()=>({}));if(!ing.ok||!d.ok)return res.status(ing.status||502).json({ok:false,error:d.error||"FALHA_SYNC_ALUNOS",requests:1});
   return res.json({...d,ok:true,unit,activeMembers:members.length,rows:rows.length,requests:1,source:"activeclients-xlsx",done:true});
  }catch(e){return res.status(502).json({ok:false,error:String(e?.message||"FALHA_SYNC_ALUNOS"),requests:1})}
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