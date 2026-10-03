const OWNER="rvilelas1984",REPO="loja-pop",PATH="data/club-pop.json",BRANCH="main";
const parse=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,300)}}};
const authHeader=(dns,token)=>({Authorization:"Basic "+Buffer.from(dns+":"+token).toString("base64"),Accept:"application/json"});
const fitValue=d=>{const x=Array.isArray(d)?d[0]:d,v=x?.totalFitCoins??x?.totalFitcoins;return Number.isFinite(Number(v))?Number(v):null};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const unitKey=v=>String(v||"bike").trim().toLowerCase()==="gym"?"gym":"bike";
const evoConfig=unit=>{const key=unitKey(unit),prefix=key==="gym"?"GYM_EVO":"EVO";return {key,dns:process.env[prefix+"_DNS"],token:process.env[prefix+"_TOKEN"]}};
async function gh(path,opt={}){const h={accept:"application/vnd.github+json","user-agent":"club-pop",...(opt.headers||{})};if(process.env.GITHUB_TOKEN)h.authorization="Bearer "+process.env.GITHUB_TOKEN;return fetch("https://api.github.com"+path,{...opt,headers:h})}
async function content(){const r=await gh("/repos/"+OWNER+"/"+REPO+"/contents/"+PATH+"?ref="+BRANCH),j=await r.json();if(!r.ok)throw Error("Não foi possível carregar as regras do Club Pop");return {data:JSON.parse(Buffer.from(j.content,"base64").toString()),sha:j.sha}}
async function save(data,sha){const r=await gh("/repos/"+OWNER+"/"+REPO+"/contents/"+PATH,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({message:"Registra recompensa Fitcoins Club Pop",content:Buffer.from(JSON.stringify(data,null,2)).toString("base64"),sha,branch:BRANCH})});if(!r.ok)throw Error("Falha ao registrar a transação Fitcoins")}
async function me(bearer){const r=await fetch("https://club-pop-api.renato-vilelas-personal.workers.dev/auth/me",{headers:{Authorization:bearer,Accept:"application/json"}}),d=await parse(r);if(!r.ok||!d?.ok)throw Error("Sessão inválida");return d}
export async function executeFitcoinReward({bearer,source,sourceId,goalId=null,validated=false,unit=null}){
 if(!bearer)throw Object.assign(Error("Sessão do aluno ausente"),{status:401});
 const user=await me(bearer);const {data,sha}=await content();data.transactions??=[];let action,title,periodKey,reference,rewardUnit=unitKey(unit);
 if(source==="mission"){
  const m=(data.missionList||[]).find(x=>String(x.id)===String(sourceId)),g=m?.goals?.find(x=>String(x.id)===String(goalId));
  if(!m||!g)throw Object.assign(Error("Meta da missão não encontrada"),{status:404});rewardUnit=unitKey(m.unit||rewardUnit);
  if(g.rewardType!=="fitcoins"||!g.fitcoinAction?.enabled)return {ok:true,fitcoinsApplied:false};
  if(!validated)throw Object.assign(Error("Resgate da missão ainda não foi validado"),{status:409});
  action=g.fitcoinAction;title=m.name+" - "+(g.rewardName||"Fitcoins");periodKey=m.period==="month"?new Date().toISOString().slice(0,7):m.period==="week"?new Date().toISOString().slice(0,10):String(m.start||"campaign")+"_"+String(m.end||"");
  reference="mission:"+m.id+":"+g.id+":"+idMember+":"+periodKey;
 }else if(source==="promotion"){
  const p=(data.promotions||[]).find(x=>String(x.id)===String(sourceId));if(!p)throw Object.assign(Error("Promoção não encontrada"),{status:404});rewardUnit=unitKey(p.unit||rewardUnit);
  action=p.fitcoinAction;if(!action?.enabled)return {ok:true,fitcoinsApplied:false};
  const today=new Date().toISOString().slice(0,10);if(p.status!=="Ativo"||(p.start&&today<p.start)||(p.end&&today>p.end))throw Object.assign(Error("Promoção fora do período ativo"),{status:409});
  const count=Number(user.member?.attendanceCount??user.attendanceCount??user.member?.attendance_count??0),need=Number(action.attendance||0);if(count<need)throw Object.assign(Error("Meta ainda não atingida: "+count+" de "+need+" check-ins"),{status:409});
  title=p.name;periodKey=(p.reset==="monthly"||p.luckyNumber?.reset==="monthly")?new Date().toISOString().slice(0,7):String(p.start||"campaign")+"_"+String(p.end||"");
  reference="promotion:"+p.id+":"+idMember+":"+periodKey;
 }else throw Object.assign(Error("Origem de Fitcoins inválida"),{status:400});
 const idMember=rewardUnit==="gym"?(user.member?.gymMemberId||user.member?.gym_member_id):(user.member?.evoMemberId||user.member?.evo_member_id);if(!idMember)throw Object.assign(Error("Cadastro "+(rewardUnit==="gym"?"Gym":"Bike")+" Pop não vinculado"),{status:400});
 reference=reference.replace(/:undefined:/,":"+idMember+":");
 const amount=Math.floor(Number(action.amount||0)),direction=action.direction==="debit"?"debit":"credit";if(amount<1)throw Object.assign(Error("Quantidade de Fitcoins inválida"),{status:400});
 const prior=data.transactions.find(x=>x.fitcoinReference===reference&&x.status==="COMPLETED");if(prior)return {ok:true,duplicate:true,fitcoinsApplied:true,balance:prior.balanceAfter,transaction:prior};
 const cfg=evoConfig(rewardUnit),dns=cfg.dns,token=cfg.token;if(!dns||!token)throw Object.assign(Error("Credenciais EVO "+(rewardUnit==="gym"?"Gym":"Bike")+" Pop não configuradas"),{status:503});
 const headers=authHeader(dns,token),url="https://evo-integracao-api.w12app.com.br/api/v1/members/"+encodeURIComponent(idMember),br=await fetch(url,{headers,cache:"no-store"}),bd=await parse(br),before=fitValue(bd);if(!br.ok||before==null)throw Object.assign(Error("Não foi possível confirmar o saldo de Fitcoins"),{status:502});
 if(direction==="debit"&&before<amount)throw Object.assign(Error("Saldo de Fitcoins insuficiente para esta recompensa"),{status:409});
 const label=source==="mission"?"Missão":"Promoção",reason=("Club Pop - "+label+" - "+title).slice(0,120),q=new URLSearchParams({idMember:String(idMember),type:direction==="credit"?"1":"2",fitcoin:String(amount),reason}),wr=await fetch("https://evo-integracao-api.w12app.com.br/api/v1/members/fitcoins?"+q,{method:"PUT",headers}),wd=await parse(wr);if(!wr.ok)throw Object.assign(Error("EVO não autorizou a movimentação de Fitcoins"),{status:wr.status||502,detail:wd});
 const expected=direction==="credit"?before+amount:before-amount;let after=null,verified=false;for(let i=0;i<4;i++){if(i)await wait(650*i);const ar=await fetch(url,{headers,cache:"no-store"}),ad=await parse(ar);after=fitValue(ad);if(ar.ok&&after===expected){verified=true;break}}if(!verified)after=expected;
 const now=new Date().toISOString(),tx={id:"tx-fit-"+Date.now(),reference:"CP-FC-"+Date.now().toString(36).toUpperCase(),fitcoinReference:reference,unit:rewardUnit,memberId:String(idMember),memberName:[user.member?.first_name||user.member?.firstName,user.member?.last_name||user.member?.lastName].filter(Boolean).join(" "),origin:source,sourceId:String(sourceId),goalId:goalId?String(goalId):null,description:title,paymentMethod:"FITCOINS",direction,fitcoins:amount,balanceBefore:before,balanceAfter:after,status:"COMPLETED",createdAt:now,evoVerified:verified};
 data.transactions.push(tx);await save(data,sha);return {ok:true,fitcoinsApplied:true,direction,amount,balance:after,transaction:tx};
}