import {session} from "./admin-auth.js";
const account=process.env.CLOUDFLARE_ACCOUNT_ID||"e554e35307cd43b9e2c5bd11a5125c6a";
const database=process.env.CLOUDFLARE_D1_DATABASE_ID||"0447f24a-0efb-43bf-a121-a83273ddb46e";
const token=()=>process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN;
function send(res,status,data){res.status(status).setHeader("Cache-Control","no-store").json(data)}
async function query(sql,params=[]){const r=await fetch("https://api.cloudflare.com/client/v4/accounts/"+account+"/d1/database/"+database+"/query",{method:"POST",headers:{Authorization:"Bearer "+token(),"Content-Type":"application/json"},body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(20000)});const data=await r.json();if(!r.ok||!data.success||!data.result?.[0]?.success)throw Error(data.errors?.[0]?.message||"Falha na consulta D1");return data.result[0].results||[]}
export default async function handler(req,res){
 if(session(req)?.role!=="admin")return send(res,403,{error:"Acesso restrito ao administrador"});
 if(!token())return send(res,503,{error:"Configure CLOUDFLARE_API_TOKEN na Vercel para habilitar gravação segura"});
 try{
 if(req.method==="GET"){const rows=await query("SELECT COUNT(*) AS bilhetes,COUNT(DISTINCT unidade || ':' || id_evo) AS alunos,COUNT(DISTINCT CASE WHEN cpf <> '' THEN cpf END) AS cpfs,SUM(CASE WHEN unidade='bike' THEN 1 ELSE 0 END) AS bike,SUM(CASE WHEN unidade='gym' THEN 1 ELSE 0 END) AS gym FROM sorteio_iphone17_bilhetes");return send(res,200,{ok:true,...rows[0]})}
 if(req.method!=="POST")return send(res,405,{error:"Método inválido"});
 const {rows,reset}=req.body||{};if(!Array.isArray(rows)||rows.length<1||rows.length>120) return send(res,400,{error:"Lote inválido (1 a 120 bilhetes)"});
 if(reset===true)return send(res,400,{error:"Exclusão automática não permitida"});
 const seen=new Set();
 for(const x of rows){if(!["bike","gym"].includes(x.unidade)||!/^\d+$/.test(String(x.id_evo))||!new RegExp("^(Bike|Gym)\\d+[BG]\\d{5}$").test(String(x.bilhete))||seen.has(x.bilhete))return send(res,400,{error:"Bilhete inválido ou repetido no lote"});seen.add(x.bilhete)}
 await query("CREATE TABLE IF NOT EXISTS sorteio_iphone17_bilhetes (bilhete TEXT PRIMARY KEY, unidade TEXT NOT NULL, id_evo TEXT NOT NULL, cpf TEXT NOT NULL DEFAULT '', nome TEXT NOT NULL DEFAULT '', aulas_set INTEGER, numeros_set INTEGER, aulas_out INTEGER, numeros_out INTEGER, criado_em TEXT DEFAULT CURRENT_TIMESTAMP)");
 for(const x of rows){const existing=await query("SELECT bilhete,unidade,id_evo,cpf,nome FROM sorteio_iphone17_bilhetes WHERE bilhete=?",[x.bilhete]);if(existing.length&&(existing[0].unidade!==x.unidade||existing[0].id_evo!==String(x.id_evo)))return send(res,409,{error:"Conflito no bilhete "+x.bilhete});await query("INSERT INTO sorteio_iphone17_bilhetes (bilhete,unidade,id_evo,cpf,nome,aulas_set,numeros_set,aulas_out,numeros_out) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(bilhete) DO UPDATE SET cpf=excluded.cpf,nome=excluded.nome,aulas_set=excluded.aulas_set,numeros_set=excluded.numeros_set,aulas_out=excluded.aulas_out,numeros_out=excluded.numeros_out",[x.bilhete,x.unidade,String(x.id_evo),String(x.cpf||""),String(x.nome||""),x.aulas_set??null,x.numeros_set??null,x.aulas_out??null,x.numeros_out??null])}
 return send(res,200,{ok:true,saved:rows.length});
 }catch(e){return send(res,502,{error:e.message||"Falha na gravação"})}
}