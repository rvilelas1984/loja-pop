import {session} from "./admin-auth.js";
export default async function handler(req,res){
 if(req.method==="GET"&&req.query?.route==="community-missions"){
  const actor=session(req);if(actor?.role!=="admin")return res.status(403).json({ok:false,error:"NAO_AUTORIZADO"});
  const unit=["club","bike","gym"].includes(req.query.unit)?req.query.unit:"club";
  const qs=new URLSearchParams({unit});if(req.query.id)qs.set("id",String(req.query.id).slice(0,100));
  try{const r=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/admin/community-missions?"+qs,{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")}});res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(await r.text())}catch{return res.status(502).json({ok:false,error:"RELATORIO_INDISPONIVEL"})}
 }
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 try{const r=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/admin/member-gym-link",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify(req.body||{})});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}
 catch(e){return res.status(502).json({ok:false,error:"Falha ao consultar vínculo Gym Pop"})}
}