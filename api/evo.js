const digits=v=>String(v||"").replace(/\D/g,"");
export default async function handler(req,res){
 if(req.method!=="GET") return res.status(405).json({ok:false,error:"Método não permitido"});
 const input=String(req.query.member||"").trim(), value=digits(input);
 if(!value) return res.status(400).json({ok:false,error:"Informe CPF ou ID EVO"});
 const dns=process.env.EVO_DNS, token=process.env.EVO_TOKEN;
 if(!dns||!token) return res.status(503).json({ok:false,stage:"configuration",error:"Credenciais EVO ainda não configuradas no servidor"});
 
 const auth=Buffer.from(dns+":"+token).toString("base64");
 try{
   const url=value.length===11?"https://evo-integracao.w12app.com.br/api/v1/members/basic?document="+encodeURIComponent(value):"https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(value);
   const rr=await fetch(url,{headers:{Authorization:"Basic "+auth,Accept:"application/json"}});
   const raw=await rr.text(); let data; try{data=JSON.parse(raw)}catch{data={raw:raw.slice(0,500)}}
   if(!rr.ok) return res.status(rr.status).json({ok:false,stage:"evo-member",status:rr.status,response:data});
   return res.status(200).json({ok:true,stage:"evo-member",member:data});
 }catch(e){return res.status(502).json({ok:false,stage:"network",error:"Falha de comunicação com a EVO",detail:e.message})}
}