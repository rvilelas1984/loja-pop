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
  const rows=(await db.prepare("SELECT c.*,m.first_name creator_name,(SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='accepted') participants, (SELECT status FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.member_id=?) my_status FROM community_challenges c JOIN members m ON m.id=c.creator_member_id WHERE c.unit=? AND (c.creator_member_id=? OR EXISTS(SELECT 1 FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.member_id=?) OR (c.visibility='public' AND c.status='active' AND c.end_at>=CURRENT_TIMESTAMP)) ORDER BY c.created_at DESC LIMIT 100").bind(member.id,unit,member.id,member.id).all()).results||[];
  return reply({ok:true,challenges:rows});
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
 if(request.method!=="POST")return reply({ok:false,error:"METODO_INVALIDO"},405);
 const body=await request.json().catch(()=>({}));
 if(action==="create"){
  const title=String(body.title||"").trim(),description=String(body.description||"").trim();
  const visibility=String(body.visibility||""),metric=String(body.metric||"");
  const target=Number(body.target),modality=String(body.modality||"").trim();
  const end=String(body.end_at||"");
  const endDate=new Date(end);
  if(title.length<3||title.length>90||description.length>500||!["private","friends","public"].includes(visibility)||!["total_classes","distinct_days","weekly_consistency","modality_classes"].includes(metric)||!Number.isInteger(target)||target<1||target>365||!Number.isFinite(endDate.getTime())||endDate.getTime()<=Date.now()||endDate.getTime()>Date.now()+366*86400000||(metric==="modality_classes"&&!modality))return reply({ok:false,error:"PARAMETROS_INVALIDOS"},400);
  const id=crypto.randomUUID();
  await db.batch([
   db.prepare("INSERT INTO community_challenges(id,unit,creator_member_id,title,description,visibility,metric,target,modality,start_at,end_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)").bind(id,unit,member.id,title,description,visibility,metric,target,modality||null,endDate.toISOString()),
   db.prepare("INSERT INTO community_challenge_participants(challenge_id,member_id,status,joined_at) VALUES(?,?,'accepted',CURRENT_TIMESTAMP)").bind(id,member.id)
  ]);
  return reply({ok:true,id},201);
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
