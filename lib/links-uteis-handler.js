import crypto from "crypto";
import { session } from "../api/admin-auth.js";
const BASE="https://club-pop-api.renato-vilelas-personal.workers.dev";
const PUBLIC_SITE="https://clubpopfit.com.br";
const SLUG_RE=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ADMIN_ROUTES=["config","stats","check-slug","links"];
const notFoundPage='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link não encontrado | Club Pop</title></head><body style="font:16px system-ui;background:#231038;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:20px"><main><h1>Link não encontrado</h1><p>Este endereço não existe ou foi desativado.</p><p><a style="color:#c17eff" href="/">Ir para o Club Pop</a></p></main></body></html>';
function signed(req,unit){const secret=process.env.AUTO_SYNC_SECRET;if(!secret)return null;const claims=Buffer.from(JSON.stringify({role:"admin",route:"links-uteis",method:req.method,unit,t:Date.now()})).toString("base64url");return claims+"."+crypto.createHmac("sha256",secret).update(claims).digest("hex")}
// Visitante anônimo: hash diário de IP + navegador, sem guardar dados pessoais.
function visitorKey(req){const ip=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();const ua=String(req.headers["user-agent"]||"");const day=new Date().toISOString().slice(0,10);return crypto.createHash("sha256").update(ip+"|"+ua+"|"+day+"|"+(process.env.AUTO_SYNC_SECRET||"")).digest("hex").slice(0,32)}
function referrerHost(req){try{return new URL(String(req.headers.referer||"")).hostname.slice(0,40)}catch{return""}}
async function redirect(req,res){
 const slug=String(req.query.slug||"").toLowerCase();
 res.setHeader("Cache-Control","no-store");
 const miss=()=>{res.setHeader("x-clubpop-shortlink","miss");res.setHeader("content-type","text/html; charset=utf-8");return res.status(404).send(notFoundPage)};
 if(!SLUG_RE.test(slug))return miss();
 try{const r=await fetch(BASE+"/links-uteis/redirect",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slug,source:String(req.query.s||"")==="qr"?"qr":"direct",visitor:visitorKey(req),referrer:referrerHost(req)}),signal:AbortSignal.timeout(6000)});if(r.status===404)return miss();if(!r.ok)throw Error();const d=await r.json();if(!/^https:\/\//i.test(String(d.target||"")))return miss();res.setHeader("x-clubpop-shortlink","hit");res.setHeader("Location",d.target);return res.status(302).end()}
 catch{res.setHeader("content-type","text/html; charset=utf-8");return res.status(502).send(notFoundPage.replace("Link não encontrado</h1>","Link temporariamente indisponível</h1>").replace("Este endereço não existe ou foi desativado.","Tente novamente em instantes."))}
}
// Confirma que o caminho não é usado por nenhuma página ou rota do site: se o próprio site responder
// sem o marcador "miss" do redirecionador, o caminho já pertence a algo.
async function siteHasPath(slug){try{const r=await fetch(PUBLIC_SITE+"/"+slug,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(5000)});return r.headers.get("x-clubpop-shortlink")!=="miss"}catch{return true}}
export default async function handler(req,res){
const route=String(req.query.action||"");
if(route==="redirect")return redirect(req,res);
if(!["event","public-config",...ADMIN_ROUTES].includes(route))return res.status(404).json({error:"Rota não disponível"});
const admin=ADMIN_ROUTES.includes(route);
const unit=String(req.query.unit||"bike")==="gym"?"gym":"bike";
const headers={"content-type":"application/json"};
if(admin){const user=session(req);if(!user||user.role!=="admin")return res.status(403).json({error:"Acesso administrativo necessário"});const sig=signed(req,unit);if(!sig)return res.status(503).json({error:"Assinatura indisponível"});headers["x-clubpop-proxy-auth"]=sig;}
const u=new URL(BASE+"/links-uteis/"+route);u.searchParams.set("unit",unit);if(route==="stats")u.searchParams.set("days",String(req.query.days||"30"));if(["check-slug","links"].includes(route)&&req.query.slug)u.searchParams.set("slug",String(req.query.slug));
try{
 if(route==="links"&&req.method==="POST"){const s=String(req.body?.slug||"").trim().toLowerCase();if(!SLUG_RE.test(s))return res.status(400).json({error:"Caminho inválido ou reservado."});if(await siteHasPath(s))return res.status(409).json({error:"Este caminho já é usado por uma página do site."})}
 const r=await fetch(u,{method:req.method,headers,...(req.method==="GET"?{}:{body:JSON.stringify(req.body||{})}),signal:AbortSignal.timeout(8000)});
 res.setHeader("Cache-Control","no-store");
 if(route==="check-slug"&&r.ok){const d=await r.json();if(d.available===true&&await siteHasPath(String(req.query.slug)))return res.status(200).json({available:false,reason:"site"});return res.status(200).json(d)}
 res.status(r.status).send(await r.text())
}catch{return res.status(502).json({error:"Worker indisponível"})}
}
