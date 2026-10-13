export default async function handler(req,res){
 const unit=String(req.query.unit||"bike");
 if(!["bike","gym"].includes(unit))return res.status(400).json({ok:false,error:"UNIDADE_INVALIDA"});
 const cookie=String(req.headers.cookie||"");
 if(!cookie)return res.status(401).json({ok:false,error:"NAO_AUTORIZADO"});
 try{
 const url="https://club-pop-api.renato-vilelas-personal.workers.dev/admin/class-chat?unit="+encodeURIComponent(unit);
 const r=await fetch(url,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":cookie},body:req.method==="GET"?undefined:JSON.stringify(req.body||{}),cache:"no-store"});
 res.setHeader("Cache-Control","no-store");return res.status(r.status).send(await r.text());
 }catch(e){return res.status(502).json({ok:false,error:"FALHA_COMUNICACAO"})}
}