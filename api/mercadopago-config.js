const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(!["GET","PUT","POST"].includes(req.method))return res.status(405).json({ok:false,error:"METODO_INVALIDO"});
 const unit=String(req.query.unit||""),environment=String(req.query.environment||"test"),action=String(req.query.action||"status");
 if(!["bike","gym","club"].includes(unit)||!["test","production"].includes(environment)||!["status","save","test"].includes(action))return res.status(400).json({ok:false,error:"PARAMETROS_INVALIDOS"});
 const qs=new URLSearchParams({unit,environment,action});
 try{const r=await fetch(WORKER+"/admin/mercadopago-config?"+qs,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="GET"?undefined:JSON.stringify(req.body||{}),cache:"no-store"});return res.status(r.status).send(await r.text())}
 catch{return res.status(502).json({ok:false,error:"FALHA_CONEXAO_WORKER"})}
}
