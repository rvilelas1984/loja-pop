import crypto from "crypto";
const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
function adminValid(req){const key=process.env.ADMIN_KEY;if(!key)return false;const raw=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("clubpop_admin="));if(!raw)return false;const [exp,s]=raw.slice(14).split(".");if(!exp||!s||Number(exp)<Date.now())return false;const e=crypto.createHmac("sha256",key).update(exp).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))}catch{return false}}
export default async function handler(req,res){
 const route=String(req.query.route||"").trim(),isAdmin=route.startsWith("admin-");
 const allowed=new Set(["sync","mine","admin-list","admin-winner","admin-export"]);
 if(!allowed.has(route))return res.status(404).json({ok:false,error:"ROTA_NAO_ENCONTRADA"});
 if(isAdmin&&!adminValid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 if(route==="sync"&&req.method!=="POST")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 if((route==="mine"||isAdmin)&&req.method!=="GET")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 const headers={"Content-Type":"application/json"};
 if(isAdmin)headers["x-admin-key"]=process.env.ADMIN_KEY||"";else if(req.headers.authorization)headers.Authorization=req.headers.authorization;
 const qs=new URLSearchParams();
 const promotion=String(req.query.promotion||req.body?.promotionId||"");
 if(promotion)qs.set("promotion",promotion);
 if(req.query.period)qs.set("period",String(req.query.period));
 if(req.query.number)qs.set("number",String(req.query.number));
 if(isAdmin&&!promotion)return res.status(400).json({ok:false,error:"Informe a promoção"});
 const workerRoute=isAdmin?"/promotion-numbers/admin/"+route.slice(6):"/promotion-numbers/"+route;
 try{const r=await fetch(WORKER+workerRoute+(qs.size?"?"+qs:""),{method:req.method,headers,body:req.method==="POST"?JSON.stringify(req.body||{}):undefined});const text=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type",r.headers.get("content-type")||"application/json; charset=utf-8");return res.send(text)}
 catch(e){return res.status(502).json({ok:false,error:"Falha de comunicação com números da sorte",detail:String(e.message||e)})}
}