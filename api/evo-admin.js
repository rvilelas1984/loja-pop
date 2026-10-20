import { getEvoTransport as evoConfig } from "../lib/evo-transport.js";
import crypto from "crypto";
const COOKIE="clubpop_admin";
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,500)}}};
function valid(req){const key=process.env.ADMIN_KEY;if(!key)return false;const c=Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim().split("=")).filter(x=>x.length===2))[COOKIE];if(!c)return false;const p=c.split(".");let payload,s;if(p.length===2){payload=p[0];s=p[1]}else if(p.length===3){payload=p[0]+"."+p[1];s=p[2]}else return false;const exp=Number(p.length===2?p[0]:p[1]);if(!exp||exp<Date.now())return false;try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(crypto.createHmac("sha256",key).update(payload).digest("hex")))}catch{return false}}
const unitKey=v=>String(v||"bike").trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
function rows(d){if(Array.isArray(d))return d;for(const k of ["items","data","lista","list"])if(Array.isArray(d?.[k])&&d[k].length)return d[k];for(const k of ["items","data","lista","list"])if(Array.isArray(d?.[k]))return d[k];return []}
async function evoRequest(evoFetch,url,headers){const r=await evoFetch(url,{headers,cache:"no-store"}),d=await parse(r);return {ok:r.ok,status:r.status,data:d,items:rows(d),url}}
async function handler(req,res){
 res.setHeader("cache-control","no-store");
 if(!["GET","POST"].includes(req.method))return res.status(405).json({ok:false,error:"Método não permitido"});
 if(!valid(req))return res.status(401).json({ok:false,error:"Sessão administrativa inválida"});
 const cfg=evoConfig(req.query.unit||"bike"),unit=cfg.key,kind=String(req.query.kind||"activities"),gym=unit==="gym";
 if(gym&&!["gym_schedule","gym_session","fitcoins","product_sale_lab","sale_receivables_lab","sale_history_lab"].includes(kind))return res.status(400).json({ok:false,error:"Operação não habilitada para Gym Pop."});
 const evoFetch=cfg.fetch,evo=(url,headers)=>evoRequest(evoFetch,url,headers);
 if(!cfg.configured)return res.status(503).json({ok:false,error:"Credenciais EVO da unidade não configuradas",unit,expected:{dns:cfg.prefix+"_DNS",token:cfg.prefix+"_TOKEN"}});
 const headers=cfg.headers;
 if(kind==="booking_lab"){
   if(unit!=="bike")return res.status(400).json({ok:false,error:"Laboratório liberado apenas para Bike Pop."});
   const action=String(req.method==="POST"?req.body?.action:req.query.action||"schedule");
   const idMember=Number(req.method==="POST"?req.body?.idMember:req.query.idMember);
   const base="https://evo-integracao-api.w12app.com.br";
   if(action==="schedule"&&req.method==="GET"){
     const date=String(req.query.date||"");
     if(!/^20\\d{2}-\\d{2}-\\d{2}$/.test(date))return res.status(400).json({ok:false,error:"Data inválida"});
     const q=new URLSearchParams({date,showFullWeek:"false",take:"100"});
     const x=await evo(base+"/api/v1/activities/schedule?"+q,headers);
     return res.status(x.ok?200:x.status||502).json({ok:x.ok,action,status:x.status,requestCount:1,items:x.items.map(a=>({idConfiguration:a.idConfiguration,idActivitySession:a.idActivitySession??a.idAtividadeSessao,activityDate:a.activityDate,name:a.name,startTime:a.startTime,instructor:a.instructor,capacity:a.capacity,ocupation:a.ocupation,spots:a.spots||[]}))});
   }
   if(action==="detail"&&req.method==="GET"){
     const id=Number(req.query.idActivitySession);
     if(!Number.isInteger(id)||id<1)return res.status(400).json({ok:false,error:"Sessão inválida"});
     const x=await evo(base+"/api/v1/activities/schedule/detail?idActivitySession="+id,headers);
     const d=Array.isArray(x.data)?x.data[0]:x.data;
     return res.status(x.ok?200:x.status||502).json({ok:x.ok,action,status:x.status,requestCount:1,session:x.ok?{idActivitySession:d?.idActivitySession,idConfiguration:d?.idConfiguration,date:d?.date,name:d?.name,startTime:d?.startTime,capacity:d?.capacity,ocupation:d?.ocupation,spots:d?.spots||[],enrollments:(d?.enrollments||[]).filter(e=>!e.removed).map(e=>({slotNumber:e.slotNumber}))}:null});
   }
   if(action==="member"&&req.method==="GET"){
     if(!Number.isInteger(idMember)||idMember<1)return res.status(400).json({ok:false,error:"Informe ID EVO do aluno"});
     const x=await evo(base+"/api/v2/members/"+idMember,headers);
     const d=Array.isArray(x.data)?x.data[0]:x.data;
     return res.status(x.ok?200:x.status||502).json({ok:x.ok,action,status:x.status,requestCount:1,member:x.ok?{idMember,name:d?.name||[d?.firstName,d?.lastName].filter(Boolean).join(" "),membershipCount:Array.isArray(d?.memberships)?d.memberships.length:null}:null});
   }
   if(action==="enroll"&&req.method==="POST"){
     const idConfiguration=Number(req.body?.idConfiguration),slotNumber=Number(req.body?.slotNumber),activityDate=String(req.body?.activityDate||"");
     if(req.body?.confirm!==true||!Number.isInteger(idMember)||idMember<1||!Number.isInteger(idConfiguration)||idConfiguration<1||!Number.isInteger(slotNumber)||slotNumber<1||slotNumber>34||!/^20\\d{2}-\\d{2}-\\d{2}$/.test(activityDate))return res.status(400).json({ok:false,error:"Confirmação, aluno, configuração, data ou bike inválidos"});
     const q=new URLSearchParams({idConfiguration:String(idConfiguration),activityDate,slotNumber:String(slotNumber),idMember:String(idMember)});
     const x=await evoFetch(base+"/api/v1/activities/schedule/enroll?"+q,{method:"POST",headers,cache:"no-store"});
     const data=await parse(x);
     return res.status(x.ok?200:x.status||502).json({ok:x.ok,action,status:x.status,requestCount:1,response:data});
   }
   return res.status(400).json({ok:false,error:"Ação não autorizada"});
 }
 if(kind==="gym_schedule"){
   if(!gym)return res.status(400).json({ok:false,error:"Este diagnóstico é exclusivo do Gym Pop."});
   const date=String(req.query.date||new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
   const q=new URLSearchParams({date,showFullWeek:"false",take:"100"});
   const x=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?"+q,headers);
   const items=x.items.map(a=>({idActivitySession:a.idActivitySession??a.idAtividadeSessao??a.idActivitieSession??null,name:a.name??a.activityName??a.title??"",startTime:a.startTime??null,endTime:a.endTime??null,instructor:a.instructor??"",area:a.area??""}));
   return res.status(x.ok?200:(x.status||502)).json({ok:x.ok,unit,kind,date,requestCount:1,count:items.length,items,status:x.status});
 }
 if(kind==="gym_session"){
   if(!gym)return res.status(400).json({ok:false,error:"Este diagnóstico é exclusivo do Gym Pop."});
   const id=String(req.query.idActivitySession||"").trim();if(!id)return res.status(400).json({ok:false,error:"Informe idActivitySession"});
   const x=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(id),headers);
   const d=Array.isArray(x.data)?x.data[0]:x.data,enrollments=rows(d?.enrollments||[]).map(e=>({idMember:e.idMember??null,name:e.name??"",slotNumber:Number(e.slotNumber||0),removed:Boolean(e.removed),status:e.status??null}));
   return res.status(x.ok?200:(x.status||502)).json({ok:x.ok,unit,kind,requestCount:1,status:x.status,session:{idActivitySession:id,name:d?.name??"",startTime:d?.startTime??null,endTime:d?.endTime??null,instructor:d?.instructor??"",enrollments}});
 }
 if(kind==="contract_lab"){const test=String(req.query.test||"membership"),urls={membership:"https://evo-integracao-api.w12app.com.br/api/v3/membership?take=200&skip=0",categories:"https://evo-integracao-api.w12app.com.br/api/v1/membership/category",membermembership:"https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take=25&skip=0&showAggregators=true&showVips=true"};if(!urls[test])return res.status(400).json({ok:false,error:"Teste inválido"});const q=await evo(urls[test],headers),sample=q.items.slice(0,10);return res.status(q.ok?200:(q.status||502)).json({ok:q.ok,test,status:q.status,count:q.items.length,endpoint:urls[test],topLevelKeys:q.data&&typeof q.data==="object"?Object.keys(q.data):[],itemKeys:sample[0]?Object.keys(sample[0]):[],sample});}
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
   const wr=await evoFetch(writeUrl,{method:"PUT",headers,cache:"no-store"}),wd=await parse(wr);
   if(!wr.ok)return res.status(wr.status||502).json({ok:false,error:"A EVO recusou a alteração de Fitcoins.",before:balance,diagnostic:{method:"PUT",endpoint:"/api/v1/members/fitcoins",status:wr.status,response:wd}});
   const check=await evo(profileUrl,headers),afterProfile=Array.isArray(check.data)?check.data[0]:check.data,after=Number(afterProfile?.totalFitCoins??afterProfile?.totalFitcoins);
   return res.status(200).json({ok:true,unit,kind,idMember:id,type,fitcoin:amount,before,after:Number.isFinite(after)?after:null,diagnostic:{method:"PUT",endpoint:"/api/v1/members/fitcoins",status:wr.status,verified:check.ok}});

 }
 if(kind==="sale_history_lab"){
   if(req.method!=="GET")return res.status(405).json({ok:false,error:"SOMENTE_LEITURA"});
   const idMember=Number(req.query.idMember),date=String(req.query.date||"");
   if(!Number.isSafeInteger(idMember)||idMember<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date)))
     return res.status(400).json({ok:false,error:"PARAMETROS_INVALIDOS"});
   const query=new URLSearchParams({idMember:String(idMember),startDate:date,endDate:date,take:"100",skip:"0"});
   const q=await evo("https://evo-integracao-api.w12app.com.br/api/v2/sales?"+query,headers);
   return res.status(q.ok?200:(q.status||502)).json({ok:q.ok,unit,kind,readOnly:true,idMember,date,evoStatus:q.status,count:q.items.length,evoResponse:q.data});
 }
 if(kind==="sale_receivables_lab"){const idSale=Number(req.query.idSale);if(req.method!=="GET"||!Number.isSafeInteger(idSale)||idSale<=0)return res.status(400).json({ok:false,error:"ID_VENDA_INVALIDO"});const q=await evo("https://evo-integracao-api.w12app.com.br/api/v1/receivables?idSale="+idSale,headers);if(q.ok)return res.json({ok:true,unit,kind,idSale,readOnly:true,source:"receivables",evoStatus:q.status,evoResponse:q.data});const sale=await evo("https://evo-integracao-api.w12app.com.br/api/v2/sales/"+idSale,headers);return res.status(sale.ok?200:(sale.status||502)).json({ok:sale.ok,unit,kind,idSale,readOnly:true,source:"sale_by_id",receivablesStatus:q.status,evoStatus:sale.status,evoResponse:sale.data});}
 if(kind==="product_sale_lab"){
   // Isolated EVO diagnostic. No Mercado Pago, Fitcoins debit or Club Pop order.
   const b=req.method==="POST"?req.body||{}:req.query;
   const idProduct=Number(b.idProduct),idMember=Number(b.idMember);
   const original=Number(b.originalCents),discount=Number(b.discountCents);
   const variant=String(b.variant||"discount");
   if(![idProduct,idMember,original,discount].every(Number.isSafeInteger)||idProduct<1||idMember<1||original<1||discount<0||discount>=original||!["discount","discountValue","productDiscount","net","catalogPrice"].includes(variant))
    return res.status(400).json({ok:false,error:"PARAMETROS_INVALIDOS"});
   const net=original-discount;
   const sessionId="clubpop-lab-"+crypto.randomUUID();
   const payload={idProduct,productValue:variant==="net"?net/100:original/100,productAmount:1,memberData:{idMember},payment:15,totalInstallments:1,sessionId};
   if(variant==="catalogPrice")delete payload.productValue;
   if(variant==="catalogPrice")payload.discount=discount/100;
   if(variant==="discount")payload.discount=discount/100;
   if(variant==="discountValue")payload.discountValue=discount/100;
   if(variant==="productDiscount")payload.productDiscount=discount/100;
   if(req.method==="GET")return res.json({ok:true,mode:"preview",variant,originalCents:original,discountCents:discount,netCents:net,payload,warning:"Campos de desconto experimentais; nenhuma venda foi criada."});
   if(String(b.confirm)!=="CRIAR_VENDA_REAL")return res.status(400).json({ok:false,error:"CONFIRMACAO_OBRIGATORIA",payload});
   const url="https://evo-integracao-api.w12app.com.br/api/v2/sales";
   const wr=await evoFetch(url,{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
   const result=await parse(wr);
   return res.status(wr.ok?200:(wr.status||502)).json({ok:wr.ok,mode:"real",unit,variant,sessionId,originalCents:original,discountCents:discount,netCents:net,payload,evoStatus:wr.status,evoResponse:result,warning:"Venda real: confira no painel EVO antes de repetir. Não há reenvio automático."});
 }
 if(kind==="attendance")return res.status(400).json({ok:false,error:"Presenças são consultadas por aluno/período e armazenadas no histórico D1."});
 if(kind==="contract_categories"){
   const q=await evo("https://evo-integracao-api.w12app.com.br/api/v1/membership/category",headers);
   if(!q.ok)return res.status(q.status||502).json({ok:false,error:"Não foi possível consultar as categorias de contratos na EVO.",diagnostic:[{source:"membership-category",status:q.status,count:q.items.length}]});
   const items=q.items.map(c=>({id:c.idCategoryMembership??c.idMembershipCategory??c.idCategory??c.id??null,name:c.name??c.description??c.categoryName??""})).filter(c=>c.id!=null&&c.name);
   return res.status(200).json({ok:true,unit,kind,count:items.length,items,source:"membership-category",diagnostic:[{source:"membership-category",status:q.status,count:items.length}]});
 }
 if(kind==="contracts"){
   const mq=await evo("https://evo-integracao-api.w12app.com.br/api/v3/membership?take=200&skip=0",headers);
   if(!mq.ok)return res.status(mq.status||502).json({ok:false,error:"Não foi possível consultar os contratos na EVO.",diagnostic:[{source:"membership",status:mq.status,count:mq.items.length}]});
   const cq=await evo("https://evo-integracao-api.w12app.com.br/api/v1/membership/category",headers);
   const catMap=new Map(cq.items.map(c=>[String(c.idCategoryMembership??c.idMembershipCategory??c.idCategory??c.id),c.name??c.description??c.categoryName??""]));
   const membershipCat=new Map(),linkDiagnostics=[];
   for(let skip=0;skip<500;skip+=25){const vq=await evo("https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take=25&skip="+skip+"&showAggregators=true&showVips=true",headers);linkDiagnostics.push({skip,status:vq.status,count:vq.items.length});if(!vq.ok)break;vq.items.forEach(v=>{const mid=v.idMembership??v.idMembershipPlan;if(mid!=null&&v.idMembershipCategory!=null&&!membershipCat.has(String(mid)))membershipCat.set(String(mid),v.idMembershipCategory)});if(vq.items.length<25)break;}
   const items=mq.items.map(x=>{const id=x.idMembership??x.idMembershipPlan??x.id;const categoryId=x.idCategoryMembership??x.idMembershipCategory??x.idCategory??membershipCat.get(String(id))??null;return {...x,idMembership:id,nameMembership:x.nameMembership||x.displayName||x.membershipName||x.name||("Contrato "+id),categoryId,category:categoryId!=null?(catMap.get(String(categoryId))||""):"",inactive:x.inactive===true||x.active===false||x.isActive===false}}).filter(x=>x.idMembership!=null);
   return res.status(200).json({ok:true,unit,kind,count:items.length,activeCount:items.filter(x=>!x.inactive).length,inactiveCount:items.filter(x=>x.inactive).length,items,source:"membership",diagnostic:[{source:"membership",status:mq.status,count:mq.items.length},{source:"membership-category",status:cq.status,count:cq.items.length},{source:"membermembership-v3",pages:linkDiagnostics,mappedCategories:membershipCat.size}]});
 }
 const candidates={activities:["https://evo-integracao.w12app.com.br/api/v1/activities","https://evo-integracao-api.w12app.com.br/api/v1/activities"],members:["https://evo-integracao.w12app.com.br/api/v2/members?take=100&skip=0","https://evo-integracao-api.w12app.com.br/api/v2/members?take=100&skip=0"]};
 if(!candidates[kind])return res.status(400).json({ok:false,error:"Tipo de requisição inválido"});
 let last=null;for(const url of candidates[kind]){try{const q=await evo(url,headers);last=q;if(q.ok)return res.status(200).json({ok:true,unit,kind,count:q.items.length,items:q.items,source:url.includes("integracao-api")?"api":"integracao"})}catch(e){if(e.code)throw e;last={error:e.message}}}
 return res.status(last?.status||502).json({ok:false,error:"EVO recusou a consulta "+kind,detail:last?.data?.message||last?.data?.error||last?.data?.raw||last?.error||""});
}

export default async function guardedHandler(req,res){try{return await handler(req,res)}catch(e){return res.status(e.status||502).json({ok:false,error:e.code||"Falha de comunicação com a EVO",stage:e.code?"evo-config":"network"})}}
