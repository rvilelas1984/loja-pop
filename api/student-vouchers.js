export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 const bearer=req.headers.authorization;
 if(!bearer)return res.status(401).json({ok:false,error:"NAO_AUTORIZADO"});
 try{
  const upstream=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/student-vouchers",{headers:{Authorization:bearer,Accept:"application/json"}});
  const body=await upstream.text();
  res.status(upstream.status);res.setHeader("Cache-Control","private, no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(body);
 }catch(e){return res.status(502).json({ok:false,error:"FALHA_CONSULTA_VOUCHERS"})}
}
