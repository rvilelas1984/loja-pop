const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"METODO_INVALIDO"});
 const unit=String(req.query.unit||""),month=String(req.query.month||"");
 if(!["bike","gym"].includes(unit)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return res.status(400).json({ok:false,error:"PARAMETROS_INVALIDOS"});
 try{
 const r=await fetch(WORKER+"/admin/daily-attendance?unit="+encodeURIComponent(unit)+"&month="+encodeURIComponent(month),{headers:{"x-clubpop-admin-cookie":String(req.headers.cookie||"")},cache:"no-store"});
 res.status(r.status);res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(await r.text());
 }catch{return res.status(502).json({ok:false,error:"FALHA_D1"})}
}
