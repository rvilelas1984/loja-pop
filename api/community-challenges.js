// Thin student-authenticated proxy to Cloudflare Worker. No EVO calls.
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"METODO_INVALIDO"});
 const action=String(req.query.action||"list");
 if(!["list","create","join"].includes(action))return res.status(400).json({ok:false,error:"ACAO_INVALIDA"});
 const unit=req.query.unit==="gym"?"gym":"bike";
 const authorization=req.headers.authorization||"";
 if(!authorization.startsWith("Bearer "))return res.status(401).json({ok:false,error:"NAO_AUTORIZADO"});
 const target="https://club-pop-api.renato-vilelas-personal.workers.dev/member/community-challenges?"+new URLSearchParams({action,unit});
 try{const r=await fetch(target,{method:req.method,headers:{"Authorization":authorization,"Content-Type":"application/json"},body:req.method==="POST"?JSON.stringify(req.body||{}):undefined});const data=await r.text();res.status(r.status);res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(data)}
 catch{return res.status(502).json({ok:false,error:"COMUNICACAO_INDISPONIVEL"})}
}
