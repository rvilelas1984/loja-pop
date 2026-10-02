import {executeFitcoinReward} from "../lib/fitcoin-reward.js";
import crypto from "crypto";
const WORKER="https://club-pop-api.renato-vilelas-personal.workers.dev";
function adminValid(req){const key=process.env.ADMIN_KEY;if(!key)return false;const raw=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("clubpop_admin="));if(!raw)return false;const [exp,s]=raw.slice(14).split(".");if(!exp||!s||Number(exp)<Date.now())return false;const e=crypto.createHmac("sha256",key).update(exp).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(e))}catch{return false}}
export default async function handler(req,res){
 const route=String(req.query.route||"").trim(),isAdmin=route.startsWith("admin-")||route==="whatsapp";
 const allowed=new Set(["sync","mine","fitcoins","whatsapp","admin-list","admin-winner","admin-export"]);
 if(!allowed.has(route))return res.status(404).json({ok:false,error:"ROTA_NAO_ENCONTRADA"});
 if(isAdmin&&!adminValid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 if(route==="whatsapp")return whatsappHandler(req,res);
 if(route==="fitcoins"){if(req.method!=="POST")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});try{const r=await executeFitcoinReward({bearer:req.headers.authorization,source:"promotion",sourceId:req.body?.promotionId});return res.status(200).json(r)}catch(e){return res.status(e.status||500).json({ok:false,error:e.message,detail:e.detail||null})}}
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
const BASE="https://conectawebhook.com.br";
function digits(v){return String(v||"").replace(/\\D/g,"")}
async function parse(r){const t=await r.text();try{return t?JSON.parse(t):{}}catch{return {raw:t}}}
async function cw(path,opts={}){const key=process.env.CONECTAWEBHOOK_API_KEY;if(!key)throw Object.assign(new Error("CONECTAWEBHOOK_API_KEY não configurada no ambiente."),{status:503});const headers={"content-type":"application/json","API-KEY":key,...(opts.headers||{})};const r=await fetch(BASE+path,{...opts,headers});const data=await parse(r);if(!r.ok){const e=new Error(data.error_message||data.detail||("ConectaWebhook HTTP "+r.status));e.status=r.status;e.remote=data;throw e}return data}
async function whatsappHandler(req,res){if(!adminValid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});try{const b=req.body||{};if(b.action==="find"){const phone=digits(b.phone);if(phone.length<10)return res.status(400).json({ok:false,error:"Informe o telefone com DDD/DDI."});const subscriber=await cw("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/");return res.status(200).json({ok:true,subscriber})}if(b.action==="send"){let sid=String(b.subscriber_id||"").trim();const flow=Number(b.flow);if(!Number.isInteger(flow)||flow<=0)return res.status(400).json({ok:false,error:"Informe um ID de fluxo válido."});if(!sid){const phone=digits(b.phone);if(phone.length<10)return res.status(400).json({ok:false,error:"Informe o telefone ou Subscriber ID."});const sub=await cw("/subscriber/get_by_phone/"+encodeURIComponent(phone)+"/");sid=String(sub.id||"");}if(!sid)return res.status(404).json({ok:false,error:"Subscriber não encontrado."});const result=await cw("/subscriber/"+encodeURIComponent(sid)+"/send_flow/",{method:"POST",body:JSON.stringify({flow})});return res.status(200).json({ok:true,subscriber_id:sid,flow,result})}return res.status(400).json({ok:false,error:"Ação inválida."})}catch(e){return res.status(e.status||500).json({ok:false,error:e.message,remote:e.remote||undefined})}}
