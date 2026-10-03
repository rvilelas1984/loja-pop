const OWNER="rvilelas1984",REPO="loja-pop",PATH="data/club-pop.json",BRANCH="main";
const seed="{\n  \"version\": 1,\n  \"products\": [\n    {\n      \"id\": \"camisa-rosa-neon\",\n      \"name\": \"Camisa Poliamida - Rosa neon\",\n      \"category\": \"Roupas\",\n      \"price\": 69.9,\n      \"fitcoins\": 300,\n      \"discountPrice\": 49.9,\n      \"stock\": 15,\n      \"status\": \"Ativo\",\n      \"featured\": true,\n      \"imageUrl\": \"\",\n      \"description\": \"Camisa Bike Pop em poliamida, cor rosa neon.\"\n    },\n    {\n      \"id\": \"agua\",\n      \"name\": \"Água mineral\",\n      \"category\": \"Hidratação\",\n      \"price\": 5,\n      \"fitcoins\": 120,\n      \"discountPrice\": 3,\n      \"stock\": 50,\n      \"status\": \"Ativo\",\n      \"featured\": false,\n      \"imageUrl\": \"\",\n      \"description\": \"Água mineral.\"\n    }\n  ],\n  \"banners\": [],\n  \"benefits\": [],\n  \"missions\": {\n    \"presence\": {\n      \"active\": true,\n      \"title\": \"Missão Frequência\",\n      \"start\": \"2026-09-01\",\n      \"end\": \"2026-09-30\",\n      \"firstMilestone\": 8,\n      \"maxGoal\": 12,\n      \"rewards8\": [\n        \"Massagem • 10 minutos\",\n        \"Bioimpedância\"\n      ],\n      \"rewards12\": [\n        \"Massagem • 15 minutos\",\n        \"1 Aula Avulsa\"\n      ]\n    },\n    \"consistency\": {\n      \"active\": true,\n      \"title\": \"3 dias por semana\",\n      \"start\": \"2026-09-01\",\n      \"end\": \"2026-09-30\",\n      \"daysPerWeek\": 3,\n      \"weeks\": 4,\n      \"rewards\": [\n        \"Prêmio da Missão Constância\"\n      ]\n    }\n  }\n}";
function adminCookieValid(req){const crypto=require("crypto"),key=process.env.ADMIN_KEY;if(!key)return false;const raw=String(req.headers.cookie||"").split(";").map(x=>x.trim()).find(x=>x.startsWith("clubpop_admin="));if(!raw)return false;const p=raw.slice("clubpop_admin=".length).split(".");let payload,exp,s;if(p.length===2){[exp,s]=p;payload=exp}else if(p.length===3){const role=p[0];[,exp,s]=p;if(!["admin","reception"].includes(role))return false;payload=role+"."+exp}else return false;if(!exp||!s||Number(exp)<Date.now())return false;const expected=crypto.createHmac("sha256",key).update(payload).digest("hex");try{return crypto.timingSafeEqual(Buffer.from(s),Buffer.from(expected))}catch{return false}}
function send(res,status,obj){res.status(status).setHeader("content-type","application/json; charset=utf-8");res.setHeader("cache-control","no-store");res.send(JSON.stringify(obj))}
async function gh(path,opt={}){const token=process.env.GITHUB_TOKEN;const h={"accept":"application/vnd.github+json","user-agent":"club-pop",...(opt.headers||{})};if(token)h.authorization="Bearer "+token;return fetch("https://api.github.com"+path,{...opt,headers:h})}
export default async function handler(req,res){
 if(req.method==="GET"){try{const r=await gh(`/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`);if(!r.ok)throw new Error("read");const j=await r.json();return send(res,200,JSON.parse(Buffer.from(j.content,"base64").toString("utf8")))}catch{return send(res,200,JSON.parse(seed))}}
 if(!["PUT","PATCH"].includes(req.method))return send(res,405,{error:"Método não permitido"});
 if(!adminCookieValid(req)&&(!process.env.ADMIN_KEY||req.headers["x-admin-key"]!==process.env.ADMIN_KEY))return send(res,401,{error:"Sessão administrativa inválida."});
 if(!process.env.GITHUB_TOKEN)return send(res,503,{error:"GITHUB_TOKEN ainda não configurado no Vercel."});
 try{
  const current=await gh(`/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`);const cj=await current.json();
  const body=typeof req.body==="string"?JSON.parse(req.body):req.body;
  let next=body;
  if(req.method==="PATCH"){
   const allowed=new Set(["missionList","promotions"]);
   if(!body||!allowed.has(body.section)||!Array.isArray(body.value))return send(res,400,{error:"Seção inválida para atualização."});
   const currentData=JSON.parse(Buffer.from(cj.content,"base64").toString("utf8"));
   next={...currentData,[body.section]:body.value};
  }
  const payload={message:"Atualiza conteúdo do CLUB POP pelo Admin",content:Buffer.from(JSON.stringify(next,null,2)).toString("base64"),sha:cj.sha,branch:BRANCH};
  const wr=await gh(`/repos/${OWNER}/${REPO}/contents/${PATH}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
  if(!wr.ok){const e=await wr.text();throw new Error(e)}
  return send(res,200,{ok:true});
 }catch(e){return send(res,500,{error:"Não foi possível salvar o conteúdo.",detail:String(e.message||e).slice(0,300)})}
}