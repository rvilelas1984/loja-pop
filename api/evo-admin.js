import crypto from "crypto";
const COOKIE="clubpop_admin";
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,500)}}};
function valid(req){const key=process.env.ADMIN_KEY;if(!key)return false;const c=Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim().split("=")).filter(x=>x.length===2))[COOKIE];if(!c)return false;const [exp,s]=c.split(".");if(!exp||!s||Number(exp)<Date.now())return false;try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(crypto.createHmac("sha256",key).update(exp).digest("hex")))}catch{return false}}
function rows(d){if(Array.isArray(d))return d;if(Array.isArray(d?.items))return d.items;if(Array.isArray(d?.data))return d.data;return []}
async function evo(url,headers){const r=await fetch(url,{headers,cache:"no-store"}),d=await parse(r);return {ok:r.ok,status:r.status,data:d,items:rows(d),url}}
export default async function handler(req,res){
 res.setHeader("cache-control","no-store");
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
 if(!valid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 const unit=String(req.query.unit||"bike"),kind=String(req.query.kind||"activities");
 if(unit!=="bike")return res.status(400).json({ok:false,error:"Durante os testes, as requisições EVO estão liberadas somente para Bike Pop."});
 const dns=process.env.EVO_DNS,token=process.env.EVO_TOKEN;if(!dns||!token)return res.status(503).json({ok:false,error:"Credenciais EVO Bike Pop não configuradas"});
 const headers={Authorization:"Basic "+Buffer.from(dns+":"+token).toString("base64"),Accept:"application/json"};
 if(kind==="attendance")return res.status(400).json({ok:false,error:"Presenças são consultadas por aluno/período e armazenadas no histórico D1."});
 if(kind==="contracts"){
   const diag=[];
   for(const url of ["https://evo-integracao-api.w12app.com.br/api/v3/membership?take=200&skip=0","https://evo-integracao-api.w12app.com.br/api/v3/membership?active=true&take=200&skip=0"]){
     try{const q=await evo(url,headers);diag.push({source:"membership",status:q.status,count:q.items.length,url});if(q.ok&&q.items.length)return res.status(200).json({ok:true,unit,kind,count:q.items.length,items:q.items,source:"membership",diagnostic:diag})}catch(e){diag.push({source:"membership",error:e.message,url})}
   }
   const found=new Map();
   for(let skip=0;skip<500;skip+=25){
     const url="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?statusMemberMembership=1&showAggregators=true&take=25&skip="+skip;
     try{const q=await evo(url,headers);diag.push({source:"membermembership",status:q.status,count:q.items.length,skip,showAggregators:true});if(!q.ok)break;for(const x of q.items){const id=x.idMembership;if(id!=null&&!found.has(String(id)))found.set(String(id),{idMembership:id,nameMembership:x.nameMembership||x.membershipName||x.name||("Contrato "+id),inactive:false})}if(q.items.length<25)break}catch(e){diag.push({source:"membermembership",error:e.message,skip});break}
   }
   const items=[...found.values()];
   if(items.length)return res.status(200).json({ok:true,unit,kind,count:items.length,items,source:"membermembership-fallback",diagnostic:diag});
   return res.status(502).json({ok:false,error:"A EVO respondeu, mas nenhum contrato foi encontrado.",detail:"O cache não foi alterado. Consulte o diagnóstico para identificar a fonte que retornou zero.",diagnostic:diag});
 }
 const candidates={activities:["https://evo-integracao.w12app.com.br/api/v1/activities","https://evo-integracao-api.w12app.com.br/api/v1/activities"],members:["https://evo-integracao.w12app.com.br/api/v2/members?take=100&skip=0","https://evo-integracao-api.w12app.com.br/api/v2/members?take=100&skip=0"]};
 if(!candidates[kind])return res.status(400).json({ok:false,error:"Tipo de requisição inválido"});
 let last=null;for(const url of candidates[kind]){try{const q=await evo(url,headers);last=q;if(q.ok)return res.status(200).json({ok:true,unit,kind,count:q.items.length,items:q.items,source:url.includes("integracao-api")?"api":"integracao"})}catch(e){last={error:e.message}}}
 return res.status(last?.status||502).json({ok:false,error:"EVO recusou a consulta "+kind,detail:last?.data?.message||last?.data?.error||last?.data?.raw||last?.error||""});
}