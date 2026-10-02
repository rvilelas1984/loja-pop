import crypto from "crypto";
const COOKIE="clubpop_admin";
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,500)}}};
function valid(req){const key=process.env.ADMIN_KEY;if(!key)return false;const c=Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim().split("=")).filter(x=>x.length===2))[COOKIE];if(!c)return false;const [exp,s]=c.split(".");if(!exp||!s||Number(exp)<Date.now())return false;try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(crypto.createHmac("sha256",key).update(exp).digest("hex")))}catch{return false}}
function rows(d){if(Array.isArray(d))return d;if(Array.isArray(d?.items))return d.items;if(Array.isArray(d?.data))return d.data;return []}
async function evo(url,headers){const r=await fetch(url,{headers,cache:"no-store"}),d=await parse(r);return {ok:r.ok,status:r.status,data:d,items:rows(d),url}}
export default async function handler(req,res){
 res.setHeader("cache-control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
 if(!valid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 const unit=String(req.query.unit||"bike"),kind=String(req.query.kind||"activities");
 if(unit!=="bike")return res.status(400).json({ok:false,error:"Durante os testes, as requisições EVO estão liberadas somente para Bike Pop."});
 const dns=process.env.EVO_DNS,token=process.env.EVO_TOKEN;if(!dns||!token)return res.status(503).json({ok:false,error:"Credenciais EVO Bike Pop não configuradas"});
 const headers={Authorization:"Basic "+Buffer.from(dns+":"+token).toString("base64"),Accept:"application/json"};
 if(kind==="fitcoins"){
   const id=Number(req.method==="POST"?(req.body?.idMember||0):(req.query.idMember||0));if(!id)return res.status(400).json({ok:false,error:"Informe o ID EVO do aluno."});
   const profileUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/"+id;
   const before=await evo(profileUrl,headers);if(!before.ok)return res.status(before.status||502).json({ok:false,error:"Não foi possível consultar o aluno na EVO.",diagnostic:{method:"GET",endpoint:profileUrl,status:before.status,response:before.data}});
   const profile=Array.isArray(before.data)?before.data[0]:before.data;const balance=Number(profile?.totalFitCoins??profile?.totalFitcoins??0);
   if(req.method==="GET")return res.status(200).json({ok:true,unit,kind,idMember:id,balance,member:{id:profile?.idMember||profile?.id,name:profile?.name||profile?.firstName||profile?.registerName||""},diagnostic:{method:"GET",endpoint:profileUrl,status:before.status}});
   const type=Number(req.body?.type),amount=Number(req.body?.fitcoin),reason=String(req.body?.reason||"Teste controlado Club Pop").slice(0,150);
   if(![1,2].includes(type)||!Number.isInteger(amount)||amount<1||amount>10)return res.status(400).json({ok:false,error:"Use adicionar/remover e quantidade entre 1 e 10."});
   const params=new URLSearchParams({idMember:String(id),type:String(type),fitcoin:String(amount),reason});
   const writeUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?"+params.toString();
   const wr=await fetch(writeUrl,{method:"PUT",headers,cache:"no-store"}),wd=await parse(wr);
   if(!wr.ok)return res.status(wr.status||502).json({ok:false,error:"A EVO recusou a alteração de Fitcoins.",before:balance,diagnostic:{method:"PUT",endpoint:"/api/v1/members/fitcoins",status:wr.status,response:wd}});
   const check=await evo(profileUrl,headers),afterProfile=Array.isArray(check.data)?check.data[0]:check.data,after=Number(afterProfile?.totalFitCoins??afterProfile?.totalFitcoins);
   return res.status(200).json({ok:true,unit,kind,idMember:id,type,fitcoin:amount,before,after:Number.isFinite(after)?after:null,diagnostic:{method:"PUT",endpoint:"/api/v1/members/fitcoins",status:wr.status,verified:check.ok}});

 }
 if(kind==="attendance")return res.status(400).json({ok:false,error:"Presenças são consultadas por aluno/período e armazenadas no histórico D1."});
 if(kind==="contracts"){
   const diag=[],categoryById=new Map();
   try{const q=await evo("https://evo-integracao-api.w12app.com.br/api/v1/membership/category",headers);diag.push({source:"membership-category",status:q.status,count:q.items.length});if(q.ok)for(const c of q.items){const id=c.idCategoryMembership??c.idMembershipCategory??c.idCategory??c.id;if(id!=null&&c.name)categoryById.set(String(id),String(c.name))}}catch(e){diag.push({source:"membership-category",error:e.message})}
   const found=new Map(),put=x=>{const id=x.idMembership??x.idMembershipPlan??x.id;if(id==null)return;const cid=x.idCategoryMembership??x.idMembershipCategory??x.idCategory??x.categoryId??x.membershipCategoryId;const raw=x.categoryName??x.nameCategory??x.membershipCategoryName??x.category?.name??x.membershipCategory?.name??"";const categoryName=(cid!=null&&categoryById.get(String(cid)))||String(raw||"");found.set(String(id),{...x,idMembership:id,nameMembership:x.nameMembership||x.displayName||x.membershipName||x.name||("Contrato "+id),idCategoryMembership:cid??null,categoryName,inactive:x.inactive===true||x.active===false||x.isActive===false})};
   for(let skip=0;skip<5000;skip+=200){const url="https://evo-integracao-api.w12app.com.br/api/v3/membership?active=true&take=200&skip="+skip;try{const q=await evo(url,headers);diag.push({source:"membership-active",status:q.status,count:q.items.length,skip});if(!q.ok)break;q.items.forEach(put);if(q.items.length<200)break}catch(e){diag.push({source:"membership-active",error:e.message,skip});break}}
   const activeIds=new Map();
   for(const extras of ["showAggregators=true","showVips=true","showAggregators=true&showVips=true"]){for(let skip=0;skip<5000;skip+=25){const url="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?statusMemberMembership=1&"+extras+"&take=25&skip="+skip;try{const q=await evo(url,headers);diag.push({source:"membermembership-active",status:q.status,count:q.items.length,skip,extras});if(!q.ok)break;for(const x of q.items){const id=x.idMembership;if(id!=null){activeIds.set(String(id),x);const cid=x.idMembershipCategory??x.idCategoryMembership;if(found.has(String(id))&&cid!=null){const z=found.get(String(id));z.idCategoryMembership=cid;z.categoryName=categoryById.get(String(cid))||z.categoryName}}}if(q.items.length<25)break}catch(e){diag.push({source:"membermembership-active",error:e.message,skip,extras});break}}}
   const items=[...found.values()].filter(x=>x.inactive!==true).sort((x,y)=>String(x.categoryName||"").localeCompare(String(y.categoryName||""),"pt-BR")||String(x.nameMembership||"").localeCompare(String(y.nameMembership||""),"pt-BR"));
   if(items.length)return res.status(200).json({ok:true,unit,kind,count:items.length,items,source:"membership-active",categories:[...new Set(items.map(x=>x.categoryName).filter(Boolean))].sort(),diagnostic:diag});
   return res.status(502).json({ok:false,error:"Nenhum contrato ativo foi encontrado na EVO.",detail:"O cache não foi alterado.",diagnostic:diag});
 }
 const candidates={activities:["https://evo-integracao.w12app.com.br/api/v1/activities","https://evo-integracao-api.w12app.com.br/api/v1/activities"],members:["https://evo-integracao.w12app.com.br/api/v2/members?take=100&skip=0","https://evo-integracao-api.w12app.com.br/api/v2/members?take=100&skip=0"]};
 if(!candidates[kind])return res.status(400).json({ok:false,error:"Tipo de requisição inválido"});
 let last=null;for(const url of candidates[kind]){try{const q=await evo(url,headers);last=q;if(q.ok)return res.status(200).json({ok:true,unit,kind,count:q.items.length,items:q.items,source:url.includes("integracao-api")?"api":"integracao"})}catch(e){last={error:e.message}}}
 return res.status(last?.status||502).json({ok:false,error:"EVO recusou a consulta "+kind,detail:last?.data?.message||last?.data?.error||last?.data?.raw||last?.error||""});
}