export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 const cookie=String(req.headers.cookie||"");if(!cookie)return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 try{const r=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/admin/member-gym-link",{method:"POST",headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:JSON.stringify(req.body||{})});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}
 catch(e){return res.status(502).json({ok:false,error:"Falha ao consultar vínculo Gym Pop"})}
}