import { verifyServiceRequest } from "../lib/evo-transport.js";
const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 if(req.query.route==="verify-service"){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({ok:false});
  const body=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
  const valid=body.length<=8192&&verifyServiceRequest(body,String(req.headers["x-evo-timestamp"]||""),String(req.headers["x-evo-signature"]||""),process.env.ADMIN_KEY);
  return res.status(valid?200:401).json({ok:valid,serviceVerified:valid});
 }
if(req.query.route==="checkin-layouts"){
  if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
  const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
  const qs=new URLSearchParams({unit});
  try{const r=await fetch(WORKER+"/admin/checkin-layouts?"+qs,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify({...req.body,unit}):undefined});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar layouts de check-in"})}
 }
if(!["GET","PUT","POST"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});const headers={"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")};try{const r=await fetch(WORKER+"/admin/evo-config",{method:req.method,headers,body:req.method==="GET"?undefined:JSON.stringify(req.body||{})});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch(e){return res.status(502).json({ok:false,error:"Falha de comunicação com configuração EVO"})}}
