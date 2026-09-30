const digits=v=>String(v||"").replace(/\D/g,"");
const parseJson=raw=>{try{return JSON.parse(raw)}catch{return {raw:raw.slice(0,500)}}};
const extractFitcoins=data=>{const c=Array.isArray(data)?data[0]:data;const v=c?.totalFitcoins??c?.totalFitCoins;if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null};

async function getMonthlyAttendance(idMember,headers){
  // Teste controlado solicitado: setembro/2026 completo.
  const dateStart="2026-09-01T00:00:00";
  const dateEnd="2026-09-30T23:59:59";
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
  const present=all.filter(x=>x?.presenca===true);
  return {
    ok:true,
    period:{dateStart,dateEnd},
    totalSessionsReturned:all.length,
    attendanceCount:present.length,
    // Diagnóstico temporário: preserva o identificador da sessão para confrontar com a lista de chamada EVO.
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
 if(!value)return res.status(400).json({ok:false,error:"Informe CPF ou ID EVO"});
 const dns=process.env.EVO_DNS,token=process.env.EVO_TOKEN;
 if(!dns||!token)return res.status(503).json({ok:false,error:"Credenciais EVO não configuradas"});
 const headers={Authorization:"Basic "+Buffer.from(dns+":"+token).toString("base64"),Accept:"application/json"};
 try{
   const lookupUrl=value.length===11?"https://evo-integracao.w12app.com.br/api/v1/members/basic?document="+encodeURIComponent(value):"https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(value);
   const rr=await fetch(lookupUrl,{headers,cache:"no-store"}),raw=await rr.text(),data=parseJson(raw);
   if(!rr.ok)return res.status(rr.status).json({ok:false,stage:"evo-member"});
   const lookupMember=Array.isArray(data)?data[0]:data;
   if(!lookupMember?.idMember)return res.status(404).json({ok:false,error:"Cadastro sem idMember"});
   const profileUrl="https://evo-integracao.w12app.com.br/api/v2/members/"+encodeURIComponent(lookupMember.idMember);
   const pr=await fetch(profileUrl,{headers,cache:"no-store"}),praw=await pr.text(),pd=parseJson(praw);
   const profile=pr.ok?(Array.isArray(pd)?pd[0]:pd):lookupMember;
   const fitUrl="https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?idMember="+encodeURIComponent(lookupMember.idMember);
   const fr=await fetch(fitUrl,{headers,cache:"no-store"}),fraw=await fr.text(),fd=parseJson(fraw);
   const fitcoins=extractFitcoins(fd)??extractFitcoins(profile);
   const attendance=await getMonthlyAttendance(lookupMember.idMember,headers);
   // Validação pela lista de chamada da própria atividade. Fazemos isso somente no modo diagnóstico
   // e apenas para as sessões já marcadas como presença, evitando consultas desnecessárias.
   if(attendance?.ok){
     let listAttendanceCount=0;
     const checked=[];
     for(const session of attendance.attendance){
       const sid=session.idActivitySession;
       if(!sid){checked.push({...session,listCheck:{ok:false,reason:"missing-session-id"}});continue;}
       const u="https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(sid);
       const lr=await fetch(u,{headers,cache:"no-store"}),lraw=await lr.text(),ld=parseJson(lraw);
       if(!lr.ok){checked.push({...session,listCheck:{ok:false,status:lr.status}});continue;}
       const detail=Array.isArray(ld)?ld[0]:ld;
       const enrollments=Array.isArray(detail?.enrollments)?detail.enrollments:[];
       const enrollment=enrollments.find(e=>Number(e?.idMember)===Number(lookupMember.idMember));
       const isPresent=enrollment?.status===0 && enrollment?.removed!==true;
       if(isPresent)listAttendanceCount++;
       checked.push({...session,listCheck:{ok:true,found:!!enrollment,status:enrollment?.status??null,justifiedAbsence:enrollment?.justifiedAbsence??null,replacement:enrollment?.replacement??null,suspended:enrollment?.suspended??null,removed:enrollment?.removed??null,isPresent}});
     }
     attendance.memberSessionsCount=attendance.attendanceCount;
     attendance.listAttendanceCount=listAttendanceCount;
     attendance.attendance=checked;
   }
   return res.status(200).json({
     ok:true,stage:"club-pop-september-test",
     member:{idMember:lookupMember.idMember,firstName:profile?.firstName||lookupMember.firstName,lastName:profile?.lastName||lookupMember.lastName,branchName:profile?.branchName||lookupMember.branchName},
     fitcoins,
     attendance
   });
 }catch(e){return res.status(502).json({ok:false,stage:"network",error:"Falha de comunicação com a EVO"})}
}