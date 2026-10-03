const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
 if(!["GET","PUT"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
 const unit=String(req.query.unit||req.body?.unit||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
 const qs=new URLSearchParams({unit}); if(req.query.activityId)qs.set("activityId",String(req.query.activityId)); if(req.query.activityName)qs.set("activityName",String(req.query.activityName));
 try{const r=await fetch(WORKER+"/admin/checkin-layouts?"+qs,{method:req.method,headers:{"Content-Type":"application/json","x-clubpop-admin-cookie":String(req.headers.cookie||"")},body:req.method==="PUT"?JSON.stringify({...req.body,unit}):undefined});const t=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(t)}catch{return res.status(502).json({ok:false,error:"Falha ao acessar layouts de check-in"})}
}