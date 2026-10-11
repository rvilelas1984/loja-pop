const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"METODO_INVALIDO"});
 const admin=req.query.admin==="1",unit=String(req.query.unit||"bike");
 if(!["bike","gym"].includes(unit))return res.status(400).json({ok:false,error:"UNIDADE_INVALIDA"});
 try{const r=await fetch(WORKER+(admin?"/admin/benefit-vouchers":"/benefit-vouchers")+"?unit="+unit,{method:req.method,headers:{"Content-Type":"application/json",...(admin?{"x-clubpop-admin-cookie":String(req.headers.cookie||"")}:{Authorization:String(req.headers.authorization||"")})},body:req.method==="POST"?JSON.stringify(req.body||{}):undefined,cache:"no-store"});res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json");return res.send(await r.text())}catch{return res.status(502).json({ok:false,error:"WORKER_INDISPONIVEL"})}
}