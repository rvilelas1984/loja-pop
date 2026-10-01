export default async function handler(req,res){
 const route=String(req.query.route||"").trim();
 const allowed=new Set(["sync","mine"]);
 if(!allowed.has(route))return res.status(404).json({ok:false,error:"ROTA_NAO_ENCONTRADA"});
 if(route==="sync"&&req.method!=="POST")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 if(route==="mine"&&req.method!=="GET")return res.status(405).json({ok:false,error:"METODO_NAO_PERMITIDO"});
 const headers={"Content-Type":"application/json"};if(req.headers.authorization)headers.Authorization=req.headers.authorization;
 const qs=new URLSearchParams();if(req.query.promotion)qs.set("promotion",String(req.query.promotion));
 const url="https://club-pop-api.renato-vilelas-personal.workers.dev/promotion-numbers/"+route+(qs.size?"?"+qs:"");
 try{const r=await fetch(url,{method:req.method,headers,body:req.method==="POST"?JSON.stringify(req.body||{}):undefined});const text=await r.text();res.status(r.status);res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");return res.send(text)}
 catch(e){return res.status(502).json({ok:false,error:"Falha de comunicação com o gerador de números"})}
}