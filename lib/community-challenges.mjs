// Student community challenges. D1 only; no EVO calls.
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const safeUnit=v=>v==="gym"?"gym":"bike";
async function memberFromToken(request,db){
 const a=request.headers.get("Authorization")||"";
 if(!a.startsWith("Bearer "))return null;
 const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(a.slice(7)));
 const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT m.id,m.first_name,m.last_name,m.evo_member_id,COALESCE(NULLIF(m.gym_client_id,''),g.gym_client_id) gym_client_id FROM auth_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(hash).first();
}
export async function communityChallenges(request,env,url){
 const db=env.DB,member=await memberFromToken(request,db);
 if(!member)return reply({ok:false,error:"SESSAO_INVALIDA"},401);
 const unit=safeUnit(url.searchParams.get("unit"));
 if(unit==="gym"?!member.gym_client_id:!member.evo_member_id)return reply({ok:false,error:"UNIDADE_NAO_VINCULADA"},403);
 const action=url.searchParams.get("action")||"list";
 try{
 if(request.method==="GET"&&action==="list"){
  const rows=(await db.prepare("SELECT c.*,CASE WHEN c.creator_member_id=? THEN 1 ELSE 0 END is_creator,m.first_name creator_name,(SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='accepted') participants, (SELECT status FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.member_id=?) my_status FROM community_challenges c JOIN members m ON m.id=c.creator_member_id WHERE c.unit=? AND (c.creator_member_id=? OR EXISTS(SELECT 1 FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.member_id=?) OR (c.visibility='public' AND c.status='active' AND c.end_at>=CURRENT_TIMESTAMP)) ORDER BY c.created_at DESC LIMIT 100").bind(member.id,member.id,unit,member.id,member.id).all()).results||[];
  const owned=await db.prepare("SELECT id,title,unit,end_at FROM community_challenges WHERE creator_member_id=? AND status='active' AND end_at>CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1").bind(member.id).first();
  return reply({ok:true,challenges:rows,activeCreatedMission:owned||null});
 }
 if(request.method==="GET"&&action==="detail"){
  const id=String(url.searchParams.get("id")||"");
  const c=await db.prepare("SELECT c.*,m.first_name creator_name FROM community_challenges c JOIN members m ON m.id=c.creator_member_id WHERE c.id=? AND c.unit=?").bind(id,unit).first();
  if(!c)return reply({ok:false,error:"MISSAO_NAO_ENCONTRADA"},404);
  const participant=await db.prepare("SELECT status FROM community_challenge_participants WHERE challenge_id=? AND member_id=?").bind(id,member.id).first();
  if(!participant&&c.visibility!=="public"&&c.creator_member_id!==member.id)return reply({ok:false,error:"ACESSO_NEGADO"},403);
  const people=(await db.prepare("SELECT p.member_id,p.joined_at,m.first_name,m.evo_member_id,COALESCE(NULLIF(m.gym_client_id,''),g.gym_client_id) gym_client_id FROM community_challenge_participants p JOIN members m ON m.id=p.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE p.challenge_id=? AND p.status='accepted' ORDER BY p.joined_at LIMIT 100").bind(id).all()).results||[];
  const ranking=[];
  for(const p of people){
   const evo=unit==="gym"?p.gym_client_id:p.evo_member_id;
   let progress=0;
   if(evo){
    const start=p.joined_at>c.start_at?p.joined_at:c.start_at;
    const rows=(await db.prepare("SELECT attendance_date,activity_name,attendance_key FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date>=substr(?,1,10) AND attendance_date<=substr(?,1,10) ORDER BY attendance_date LIMIT 5000").bind(unit,String(evo),start,c.end_at).all()).results||[];
    const dates=new Set(),weeks=new Set();let classes=0;
    for(const a of rows){
     const day=String(a.attendance_date||"").slice(0,10);
     if(!day||day<start.slice(0,10)||day>c.end_at.slice(0,10))continue;
     if(c.metric==="modality_classes"&&String(a.activity_name||"").toLocaleLowerCase("pt-BR")!==String(c.modality||"").toLocaleLowerCase("pt-BR"))continue;
     classes++;dates.add(day);
     const d=new Date(day+"T12:00:00Z");if(Number.isFinite(d.getTime())){const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);weeks.add(monday.toISOString().slice(0,10))}
    }
    progress=c.metric==="distinct_days"?dates.size:c.metric==="weekly_consistency"?weeks.size:classes;
   }
   ranking.push({memberId:p.member_id,name:p.first_name||"Aluno",progress,joinedAt:p.joined_at});
  }
  ranking.sort((a,b)=>b.progress-a.progress||a.name.localeCompare(b.name,"pt-BR"));
  return reply({ok:true,challenge:c,ranking:participant||c.creator_member_id===member.id?ranking:ranking.map(x=>({name:x.name,progress:x.progress})),myProgress:ranking.find(x=>x.memberId===member.id)?.progress||0});
 }
 if(request.method==="GET"&&action==="friends"){
  const q=String(url.searchParams.get("q")||"").trim();
  if(q.length<3||q.length>60)return reply({ok:true,friends:[]});
  const results=(await db.prepare("SELECT id,first_name,last_name FROM members WHERE id<>? AND status='ACTIVE' AND (first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ?) AND "+(unit==="gym"?"gym_client_id IS NOT NULL AND gym_client_id<>''":"evo_member_id IS NOT NULL AND evo_member_id<>''")+" ORDER BY first_name,last_name LIMIT 12").bind(member.id,"%"+q+"%","%"+q+"%","%"+q+"%").all()).results||[];
  return reply({ok:true,friends:results.map(x=>({id:x.id,name:[x.first_name,x.last_name].filter(Boolean).join(" ")}))});
 }
 if(request.method!=="POST")return reply({ok:false,error:"METODO_INVALIDO"},405);
 const body=await request.json().catch(()=>({}));
 if(action==="create"){
  const title=String(body.title||"").trim(),description=String(body.description||"").trim();
  const visibility=String(body.visibility||""),metric=String(body.metric||"");
  const target=Number(body.target),modality=String(body.modality||"").trim();
  const theme=String(body.theme||"violet"),prize=String(body.prize_description||"").trim(),terms=String(body.prize_terms||"").trim();
  const modalities=unit==="bike"?["Ciclismo Indoor"]:["Mat Pilates","Step","RitBox","Funcional","Jump Pop","FitDance","GAP","Yoga","Alongamento & Mobilidade","Zumba","Burn Pop"];
  const end=String(body.end_at||"");
  const endDate=new Date(end);
  if(title.length<3||title.length>90||description.length>500||!["private","friends","public"].includes(visibility)||!["total_classes","distinct_days","weekly_consistency","modality_classes"].includes(metric)||!Number.isInteger(target)||target<1||target>365||!Number.isFinite(endDate.getTime())||endDate.getTime()<=Date.now()||endDate.getTime()>Date.now()+366*86400000||(metric==="modality_classes"&&!modalities.includes(modality))||!["violet","ocean","sunset","forest","midnight"].includes(theme)||prize.length>120||terms.length>300)return reply({ok:false,error:"PARAMETROS_INVALIDOS"},400);
  const id=crypto.randomUUID();
  const created=await db.prepare("INSERT INTO community_challenges(id,unit,creator_member_id,title,description,visibility,metric,target,modality,start_at,end_at,theme,prize_description,prize_terms) SELECT ?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM community_challenges WHERE creator_member_id=? AND status=\'active\' AND end_at>CURRENT_TIMESTAMP)").bind(id,unit,member.id,title,description,visibility,metric,target,modality||null,endDate.toISOString(),theme,prize||null,terms||null,member.id).run();
  if(!created.meta?.changes)return reply({ok:false,error:"LIMITE_MISSAO_ATIVA",message:"Você já criou uma missão ativa. Encerre ou exclua a atual antes de criar outra."},409);
  await db.prepare("INSERT INTO community_challenge_participants(challenge_id,member_id,status,joined_at) VALUES(?,?,'accepted',CURRENT_TIMESTAMP)").bind(id,member.id).run();
  return reply({ok:true,id},201);
 }
 if(action==="delete"){
  const id=String(body.id||"");
  if(!/^[0-9a-f-]{36}$/i.test(id))return reply({ok:false,error:"MISSAO_INVALIDA"},400);
  const c=await db.prepare("SELECT id,creator_member_id FROM community_challenges WHERE id=? AND unit=?").bind(id,unit).first();
  if(!c)return reply({ok:false,error:"MISSAO_NAO_ENCONTRADA"},404);
  if(c.creator_member_id!==member.id)return reply({ok:false,error:"SOMENTE_CRIADOR_PODE_EXCLUIR"},403);
  await db.batch([
    db.prepare("DELETE FROM community_challenge_participants WHERE challenge_id=? AND EXISTS(SELECT 1 FROM community_challenges WHERE id=? AND creator_member_id=?)").bind(id,id,member.id),
    db.prepare("DELETE FROM community_challenges WHERE id=? AND creator_member_id=?").bind(id,member.id)
  ]);
  return reply({ok:true,deleted:true});
 }
 if(action==="invite"){
  const id=String(body.id||""),friendId=Number(body.memberId);
  if(!Number.isSafeInteger(friendId)||friendId<=0||friendId===member.id)return reply({ok:false,error:"AMIGO_INVALIDO"},400);
  const c=await db.prepare("SELECT id,creator_member_id,visibility,status,end_at FROM community_challenges WHERE id=? AND unit=?").bind(id,unit).first();
  if(!c||c.creator_member_id!==member.id||c.visibility!=="friends"||c.status!=="active"||new Date(c.end_at).getTime()<=Date.now())return reply({ok:false,error:"CONVITE_NAO_PERMITIDO"},403);
  const friend=await db.prepare("SELECT id FROM members WHERE id=? AND status='ACTIVE' AND "+(unit==="gym"?"gym_client_id IS NOT NULL AND gym_client_id<>''":"evo_member_id IS NOT NULL AND evo_member_id<>''")).bind(friendId).first();
  if(!friend)return reply({ok:false,error:"ALUNO_NAO_ENCONTRADO"},404);
  await db.prepare("INSERT INTO community_challenge_participants(challenge_id,member_id,status) VALUES(?,?,'invited') ON CONFLICT(challenge_id,member_id) DO NOTHING").bind(id,friendId).run();
  return reply({ok:true});
 }
 if(action==="respond"){
  const id=String(body.id||""),accept=body.accept===true;
  const c=await db.prepare("SELECT id,status,end_at FROM community_challenges WHERE id=? AND unit=? AND visibility='friends'").bind(id,unit).first();
  if(!c||c.status!=="active"||new Date(c.end_at).getTime()<=Date.now())return reply({ok:false,error:"CONVITE_EXPIRADO"},404);
  const p=await db.prepare("UPDATE community_challenge_participants SET status=?,joined_at=CASE WHEN ?='accepted' THEN CURRENT_TIMESTAMP ELSE joined_at END WHERE challenge_id=? AND member_id=? AND status='invited'").bind(accept?"accepted":"declined",accept?"accepted":"declined",id,member.id).run();
  if(!p.meta?.changes)return reply({ok:false,error:"CONVITE_NAO_ENCONTRADO"},404);
  return reply({ok:true});
 }
 if(action==="join"){
  const id=String(body.id||"");
  const c=await db.prepare("SELECT id,visibility,status,end_at FROM community_challenges WHERE id=? AND unit=?").bind(id,unit).first();
  if(!c||c.visibility!=="public"||c.status!=="active"||new Date(c.end_at).getTime()<=Date.now())return reply({ok:false,error:"MISSAO_INDISPONIVEL"},404);
  await db.prepare("INSERT INTO community_challenge_participants(challenge_id,member_id,status,joined_at) VALUES(?,?,'accepted',CURRENT_TIMESTAMP) ON CONFLICT(challenge_id,member_id) DO UPDATE SET status='accepted',joined_at=COALESCE(community_challenge_participants.joined_at,CURRENT_TIMESTAMP)").bind(id,member.id).run();
  return reply({ok:true,id});
 }
 return reply({ok:false,error:"ACAO_INVALIDA"},400);
 }catch(e){return reply({ok:false,error:"FALHA_MISSOES_COMUNIDADE",detail:String(e?.message||e).slice(0,180)},500)}
}
