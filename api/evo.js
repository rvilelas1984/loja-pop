const digits=v=>String(v||"").replace(/\D/g,"");

const parseJson=raw=>{
  try{return JSON.parse(raw)}
  catch{return {raw:raw.slice(0,500)}}
};

const extractFitcoins=data=>{
  const candidate=Array.isArray(data)?data[0]:data;
  const value=candidate?.totalFitcoins ?? candidate?.totalFitCoins;
  if(value===null||value===undefined||value==="") return null;
  const number=Number(value);
  return Number.isFinite(number)?number:null;
};

export default async function handler(req,res){
 if(req.method!=="GET") return res.status(405).json({ok:false,error:"Método não permitido"});
 const input=String(req.query.member||"").trim(), value=digits(input);
 if(!value) return res.status(400).json({ok:false,error:"Informe CPF ou ID EVO"});
 const dns=process.env.EVO_DNS, token=process.env.EVO_TOKEN;
 if(!dns||!token) return res.status(503).json({ok:false,stage:"configuration",error:"Credenciais EVO ainda não configuradas no servidor"});

 const auth=Buffer.from(dns+":"+token).toString("base64");
 const headers={Authorization:"Basic "+auth,Accept:"application/json"};

 try{
   const lookupUrl=value.length===11
     ?"https://evo-integracao.w12app.com.br/api/v1/members/basic?document="+encodeURIComponent(value)
     :"https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(value);

   const rr=await fetch(lookupUrl,{headers,cache:"no-store"});
   const raw=await rr.text();
   const data=parseJson(raw);
   if(!rr.ok) return res.status(rr.status).json({ok:false,stage:"evo-member",status:rr.status,response:data});

   const lookupMember=Array.isArray(data)?data[0]:data;
   if(!lookupMember?.idMember) return res.status(404).json({ok:false,stage:"evo-member",error:"Cadastro sem idMember"});

   // Consulta o perfil completo independentemente de a entrada ter sido CPF ou ID.
   const profileUrl="https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(lookupMember.idMember);
   const pr=await fetch(profileUrl,{headers,cache:"no-store"});
   const praw=await pr.text();
   const profileData=parseJson(praw);
   const profile=pr.ok?(Array.isArray(profileData)?profileData[0]:profileData):null;

   // Consulta específica de Fitcoins.
   const fitUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?idMember="+encodeURIComponent(lookupMember.idMember);
   const fr=await fetch(fitUrl,{headers,cache:"no-store"});
   const fraw=await fr.text();
   const fd=parseJson(fraw);
   if(!fr.ok) return res.status(fr.status).json({ok:false,stage:"evo-fitcoins",status:fr.status,response:fd});

   const fitcoinsEndpoint=extractFitcoins(fd);
   const fitcoinsProfile=extractFitcoins(profile);
   const fitcoins=fitcoinsEndpoint ?? fitcoinsProfile ?? null;

   return res.status(200).json({
     ok:true,
     stage:"evo-fitcoins-diagnostic",
     member:profile||lookupMember,
     fitcoins,
     diagnostic:{
       idMember:lookupMember.idMember,
       fitcoinsEndpoint,
       fitcoinsProfile,
       fitcoinsRaw:fd,
       profileStatus:pr.status,
       endpointStatus:fr.status
     }
   });
 }catch(e){
   return res.status(502).json({ok:false,stage:"network",error:"Falha de comunicação com a EVO",detail:e.message});
 }
}
