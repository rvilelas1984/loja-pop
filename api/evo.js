const digits=v=>String(v||"").replace(/\D/g,"");
const parseJson=raw=>{try{return JSON.parse(raw)}catch{return {raw:raw.slice(0,500)}}};
const extractFitcoins=data=>{const c=Array.isArray(data)?data[0]:data;const v=c?.totalFitcoins??c?.totalFitCoins;if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};

async function getMonthlyAttendance(idMember,headers){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).formatToParts(new Date());
  const year=Number(parts.find(p=>p.type==="year").value),month=Number(parts.find(p=>p.type==="month").value);
  const lastDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const mm=String(month).padStart(2,"0");
  const dateStart=year+"-"+mm+"-01T00:00:00";
  const dateEnd=year+"-"+mm+"-"+String(lastDay).padStart(2,"0")+"T23:59:59";
  const take=100;
  let skip=0,all=[];
  for(let page=0;page<20;page++){
    const qs=new URLSearchParams({idMember:String(idMember),dateStart,dateEnd,skip:String(skip),take:String(take)});
    const url="https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?"+qs.toString();
    const r=await fetch(url,{headers,cache:"no-store"});
    const raw=await r.text(),data=parseJson(raw);
    if(!r.ok)return {ok:false,status:r.status,response:data};
    const rows=Array.isArray(data)?data:(Array.isArray(data?.items)?data.items:Array.isArray(data?.data)?data.data:[]);
    all.push(...rows);
    if(rows.length<take)break;
    skip+=take;
  }
  const present=all.filter(x=>x?.presenca===true && x?.isFinalized===true);
  const normalized=present.map(x=>({
    date:x.date??x.dateStart??null,
    startTime:x.startTime??null,
    activity:x.activitieName??x.activityName??null
  }));
  const timeCounts={},activityCounts={},daySet=new Set(),weekdayCounts={};
  for(const x of normalized){
    if(x.startTime)timeCounts[x.startTime]=(timeCounts[x.startTime]||0)+1;
    if(x.activity)activityCounts[x.activity]=(activityCounts[x.activity]||0)+1;
    if(x.date){
      const key=String(x.date).slice(0,10);
      daySet.add(key);
      const d=new Date(key+"T12:00:00");
      const wd=d.toLocaleDateString("pt-BR",{weekday:"long",timeZone:"America/Sao_Paulo"});
      weekdayCounts[wd]=(weekdayCounts[wd]||0)+1;
    }
  }
  const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0])))[0]?.[0]||null;
  const now=new Date();
  const dow=(now.getDay()+6)%7;
  const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-dow);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
  const weekRows=normalized.filter(x=>{
    if(!x.date)return false;
    const d=new Date(String(x.date).slice(0,10)+"T12:00:00");
    return d>=monday&&d<=sunday;
  });
  const weekDays=new Set(weekRows.map(x=>String(x.date).slice(0,10)));
  return {
    ok:true,
    period:{dateStart,dateEnd},
    totalSessionsReturned:all.length,
    attendanceCount:present.length,
    favoriteTime:top(timeCounts),
    favoriteActivity:top(activityCounts),
    distinctDays:daySet.size,
    weekdayCounts,
    currentWeek:{attendanceCount:weekRows.length,distinctDays:weekDays.size},
    // Presença válida segue a mesma lógica observada no relatório EVO: presença marcada e sessão finalizada.
    attendance:present.map(x=>({
      idActivitySession:x.idActivitySession??x.idActivitieSession??x.idAtividadeSessao??null,
      date:x.date??x.dateStart??null,
      startTime:x.startTime??null,
      activity:x.activitieName??x.activityName??null,
      presenca:x.presenca,
      falta:x.falta??null,
      faltaJustificada:x.faltaJustificada??null,
      isFinalized:x.isFinalized??null,
      status:x.status??null,
      statusName:x.statusName??null
    }))
  };
}

export default async function handler(req,res){
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
 const value=digits(String(req.query.member||"").trim());
 if(!value)return res.status(400).json({ok:false,error:"Informe o ID EVO"});
 const unit=String(req.query.unit||"bike").toLowerCase();
 const gym=unit==="gym";
 const dns=gym?process.env.GYM_EVO_DNS:process.env.EVO_DNS,token=gym?process.env.GYM_EVO_TOKEN:process.env.EVO_TOKEN;
 if(!dns||!token)return res.status(503).json({ok:false,error:"Credenciais EVO não configuradas"});
 const headers={Authorization:"Basic "+Buffer.from(dns+":"+token).toString("base64"),Accept:"application/json"};
 try{
   const lookupUrl="https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(value);
   const rr=await fetch(lookupUrl,{headers,cache:"no-store"}),raw=await rr.text(),data=parseJson(raw);
   if(!rr.ok)return res.status(rr.status).json({ok:false,stage:"evo-member"});
   const lookupMember=Array.isArray(data)?data[0]:data;
   if(!lookupMember?.idMember)return res.status(404).json({ok:false,error:"Cadastro sem idMember"});
   // Loja e Gym podem solicitar somente o saldo, evitando consultas extras.
   const fitcoinsOnly=String(req.query.fitcoinsOnly||"")==="1";
   if(gym||fitcoinsOnly){
     const fitUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?idMember="+encodeURIComponent(lookupMember.idMember);
     const fr=await fetch(fitUrl,{headers,cache:"no-store"}),fraw=await fr.text(),fd=parseJson(fraw);
     const endpointCoins=fr.ok?extractFitcoins(fd):null;
     const profileCoins=extractFitcoins(lookupMember);
     const fitcoins=endpointCoins??profileCoins;
     if(fitcoins==null)return res.status(fr.ok?502:fr.status).json({ok:false,stage:"evo-fitcoins",error:"Não foi possível obter o saldo de Fitcoins",detail:fd?.message||fd?.error||fd?.raw||("HTTP "+fr.status)});
     return res.status(200).json({ok:true,stage:gym?"gym-fitcoins-only":"bike-fitcoins-only",unit,member:{idMember:lookupMember.idMember,firstName:lookupMember.firstName,lastName:lookupMember.lastName,branchName:lookupMember.branchName},fitcoins,fitcoinsSource:endpointCoins!=null?"fitcoins-endpoint":"member-profile",attendance:{ok:false,skipped:true,reason:gym?"gym-request-budget":"fitcoins-only"}});
   }
   const profileUrl="https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(lookupMember.idMember);
   const pr=await fetch(profileUrl,{headers,cache:"no-store"}),praw=await pr.text(),pd=parseJson(praw);
   const profile=pr.ok?(Array.isArray(pd)?pd[0]:pd):lookupMember;
   const fitUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?idMember="+encodeURIComponent(lookupMember.idMember);
   const fr=await fetch(fitUrl,{headers,cache:"no-store"}),fraw=await fr.text(),fd=parseJson(fraw);
   const fitcoins=extractFitcoins(fd)??extractFitcoins(profile);
   const attendance=await getMonthlyAttendance(lookupMember.idMember,headers);
   return res.status(200).json({
     ok:true,stage:"club-pop-current-month",unit,
     member:{idMember:lookupMember.idMember,firstName:profile?.firstName||lookupMember.firstName,lastName:profile?.lastName||lookupMember.lastName,branchName:profile?.branchName||lookupMember.branchName},
     fitcoins,
     attendance
   });
 }catch(e){return res.status(502).json({ok:false,stage:"network",error:"Falha de comunicação com a EVO"})}
}