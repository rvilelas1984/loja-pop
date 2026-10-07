export default async function handler(req,res){
 const worker="https://club-pop-api.renato-vilelas-personal.workers.dev/member/pop-fit";
 const qs=new URLSearchParams();
 for(const k of ["scope","month","action","id"])if(req.query[k]!=null)qs.set(k,String(req.query[k]));
 const headers={"Content-Type":"application/json"};if(req.headers.authorization)headers.Authorization=req.headers.authorization;
 try{const r=await fetch(worker+(qs.toString()?"?"+qs:""),{method:req.method,headers,body:["GET","HEAD"].includes(req.method)?undefined:JSON.stringify(req.body||{}),cache:"no-store"});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}
 catch{return res.status(502).json({ok:false,error:"Falha de comunicação com Pop Fit"})}
}