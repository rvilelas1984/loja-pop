import crypto from "crypto";
import { session } from "../api/admin-auth.js";
const BASE="https://club-pop-api.renato-vilelas-personal.workers.dev";
export default async function handler(req,res){
const route=String(req.query.action||"");
if(!["event","public-config","config","stats"].includes(route))return res.status(404).json({error:"Rota não disponível"});
const admin=["config","stats"].includes(route);
const headers={"content-type":"application/json"};
if(admin){const user=session(req);if(!user||user.role!=="admin")return res.status(403).json({error:"Acesso administrativo necessário"});const secret=process.env.AUTO_SYNC_SECRET;if(!secret)return res.status(503).json({error:"Assinatura indisponível"});const claims=Buffer.from(JSON.stringify({role:"admin",route:"links-uteis",method:req.method,unit:String(req.query.unit||"bike")==="gym"?"gym":"bike",t:Date.now()})).toString("base64url");headers["x-clubpop-proxy-auth"]=claims+"."+crypto.createHmac("sha256",secret).update(claims).digest("hex");}
const u=new URL(BASE+"/links-uteis/"+route);const unit=String(req.query.unit||"bike")==="gym"?"gym":"bike";u.searchParams.set("unit",unit);if(route==="stats")u.searchParams.set("days",String(req.query.days||"30"));
try{const r=await fetch(u,{method:req.method,headers,...(req.method==="GET"?{}:{body:JSON.stringify(req.body||{})}),signal:AbortSignal.timeout(8000)});res.setHeader("Cache-Control","no-store");res.status(r.status).send(await r.text())}catch{return res.status(502).json({error:"Worker indisponível"})}
}
