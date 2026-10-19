import { session } from "../api/admin-auth.js";
const BASE=process.env.LINKS_UTEIS_WORKER_URL;
export default async function handler(req,res){
const route=String(req.query.action||"");
const adminRoute=["config","stats","links","check-slug"].includes(route);
if(!["event","public-config","redirect","config","stats","links","check-slug"].includes(route))return res.status(404).json({error:"Rota inexistente"});
if(adminRoute){const user=session(req);if(!user||user.role!=="admin")return res.status(403).json({error:"Acesso restrito ao administrador"});}
if(!BASE||!/^https:\/\//.test(BASE))return res.status(503).json({error:"Worker de Links Úteis ainda não configurado"});
const url=new URL(route,BASE.endsWith("/")?BASE:BASE+"/");
for(const [k,v] of Object.entries(req.query)){if(k!=="action"&&typeof v==="string")url.searchParams.set(k,v)}
const headers={"content-type":"application/json"};
if(adminRoute){const secret=process.env.LINKS_UTEIS_BRIDGE_SECRET;if(!secret)return res.status(503).json({error:"Segredo administrativo não configurado"});headers["x-admin-bridge-secret"]=secret;}
try{const r=await fetch(url,{method:req.method,headers,redirect:"manual",...(req.method==="GET"?{}:{body:JSON.stringify(req.body||{})}),signal:AbortSignal.timeout(8000)});res.setHeader("Cache-Control","no-store");if(route==="redirect"&&r.status>=300&&r.status<400){const dest=r.headers.get("location");if(dest&&/^https:\/\//.test(dest)){res.setHeader("Location",dest);return res.status(302).end()}}res.status(r.status).send(await r.text())}catch{return res.status(502).json({error:"Worker indisponível"})}
}
