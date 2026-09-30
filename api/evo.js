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
   const member=Array.isArray(data)?data[0]:data;
   if(!member?.idMember) return res.status(404).json({ok:false,stage:"evo-member",error:"Cadastro sem idMember"});
   const fitUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?idMember="+encodeURIComponent(member.idMember);
   const fr=await fetch(fitUrl,{headers:{Authorization:"Basic "+auth,Accept:"application/json"},cache:"no-store"});
   const fraw=await fr.text(); let fd; try{fd=JSON.parse(fraw)}catch{fd={raw:fraw.slice(0,500)}}
   if(!fr.ok) return res.status(fr.status).json({ok:false,stage:"evo-fitcoins",status:fr.status,response:fd});
   const fitcoins=Number(fd?.totalFitcoins ?? fd?.totalFitCoins ?? 0);
   return res.status(200).json({ok:true,stage:"evo-fitcoins",member,fitcoins});
 }catch(e){return res.status(502).json({ok:false,stage:"network",error:"Falha de comunicação com a EVO",detail:e.message})}
}