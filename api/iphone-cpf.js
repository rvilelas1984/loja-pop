import { session } from "./admin-auth.js";
const ACCOUNT="e554e35307cd43b9e2c5bd11a5125c6a",DB="0447f24a-0efb-43bf-a121-a83273ddb46e";
const digits=x=>String(x??"").replace(/\D/g,"");
export default async function handler(req,res){
res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
if(req.method!=="POST")return res.status(405).json({error:"Método inválido"});
const actor=session(req);if(!actor||actor.role!=="admin")return res.status(403).json({error:"Acesso restrito ao administrador"});
const {unit,ids}=req.body||{};if(!["bike","gym"].includes(unit)||!Array.isArray(ids)||ids.length>3000||ids.some(x=>!/^\d{1,15}$/.test(String(x))))return res.status(400).json({error:"Unidade ou IDs inválidos"});
const token=process.env.CLOUDFLARE_D1_READ_TOKEN;if(!token)return res.status(503).json({error:"Configure CLOUDFLARE_D1_READ_TOKEN na Vercel para leitura do D1"});
const unique=[...new Set(ids.map(String))],matches={};
try{for(let i=0;i<unique.length;i+=100){const chunk=unique.slice(i,i+100),params=[unit,...chunk];const sql="SELECT evo_member_id AS id, json_extract(personal_json,'$.document') AS cpf FROM evo_member_master WHERE unit=? AND evo_member_id IN ("+chunk.map(()=>"?").join(",")+")";
const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+ACCOUNT+"/d1/database/"+DB+"/query",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});const d=await r.json();if(!r.ok||!d.success)throw Error("Falha de leitura D1");for(const row of d.result?.[0]?.results||[]){const cpf=digits(row.cpf);if(cpf)matches[String(row.id)]=cpf}}
return res.status(200).json({ok:true,matches})}catch{return res.status(502).json({error:"Não foi possível consultar o D1. Nenhuma planilha foi alterada."})}
}