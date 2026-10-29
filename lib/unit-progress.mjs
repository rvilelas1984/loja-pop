import {canonicalEvoId} from './member-identity.mjs';

const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
const cpfOf=p=>String(p.document||p.cpf||'').replace(/\D/g,'');
const nameOf=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLowerCase();
async function hash(v){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),b=>b.toString(16).padStart(2,'0')).join('');}

// Return read identities only. Never copy a Bike ID into gym_client_id, create a
// contract, or change the student's financial identity as a side effect of access.
export async function memberAttendanceIds(db,member,unit){
 if(!['bike','gym'].includes(unit))throw Error('UNIDADE_INVALIDA');
 const own=canonicalEvoId(unit==='gym'?member.gym_client_id:member.evo_member_id);
 const sourceUnit=unit==='gym'?'bike':'gym';
 const source=canonicalEvoId(unit==='gym'?member.evo_member_id:member.gym_client_id);
 const ids=new Set(/^[1-9]\d*$/.test(own)?[own]:[]),pending=[];
 if(member.id&&unit==='gym'){
  const links=(await db.prepare("SELECT gym_client_id FROM gym_member_links WHERE member_id=? AND status='ACTIVE'").bind(member.id).all()).results||[];
  for(const l of links){const id=canonicalEvoId(l.gym_client_id);if(/^[1-9]\d*$/.test(id))ids.add(id);}
 }
 if(/^[1-9]\d*$/.test(source)&&!ids.has(source)){
  const [profile,target,owners,evidence]=await Promise.all([
   db.prepare('SELECT personal_json FROM evo_member_master WHERE unit=? AND evo_member_id=?').bind(sourceUnit,source).first(),
   db.prepare('SELECT personal_json FROM evo_member_master WHERE unit=? AND evo_member_id=?').bind(unit,source).first(),
   db.prepare(unit==='gym'?`SELECT id FROM members WHERE CAST(gym_client_id AS TEXT)=? AND id<>?
    UNION SELECT member_id id FROM gym_member_links WHERE gym_client_id=? AND status='ACTIVE' AND member_id<>?`:
    'SELECT id FROM members WHERE CAST(evo_member_id AS TEXT)=? AND id<>?')
    .bind(...(unit==='gym'?[source,member.id||0,source,member.id||0]:[source,member.id||0])).all(),
   db.prepare(`SELECT DISTINCT json_extract(raw_json,'$.raw.name') name FROM evo_member_attendance
    WHERE unit=? AND evo_member_id=?`).bind(unit,source).all()
  ]);
  const p=parse(profile?.personal_json),t=parse(target?.personal_json),cpf=cpfOf(p),targetCpf=cpfOf(t);
  const ownerVerified=/^\d{11}$/.test(cpf)&&await hash(cpf)===member.cpf_hash;
  const targetVerified=targetCpf&&targetCpf===cpf;
  const fullName=nameOf([p.firstName,p.lastName].filter(Boolean).join(' '));
  const names=(evidence.results||[]).map(x=>nameOf(x.name)).filter(Boolean);
  // CPF proves the source profile belongs to this account. A target CPF match,
  // or named attendance with the same ID and full name and no target profile,
  // proves its use in the other unit. Numeric coincidence alone is never enough.
  const attendanceVerified=!target&&fullName.includes(' ')&&names.length>0&&names.every(n=>n===fullName);
  if(ownerVerified&&!(owners.results||[]).length&&(targetVerified||attendanceVerified))ids.add(source);
  else if((evidence.results||[]).length)pending.push({unit,reason:owners.results?.length?'IDENTIDADE_CONFLITANTE':'IDENTIDADE_NAO_CONFIRMADA'});
 }
 // Explicit, unit-scoped aliases are already audited by the existing identity flow.
 if(ids.size){
  const values=[...ids],marks=values.map(()=>'?').join(',');
  const aliases=(await db.prepare(`SELECT legacy_evo_member_id FROM evo_member_identity_aliases
   WHERE unit=? AND principal_evo_member_id IN (${marks})`).bind(unit,...values).all()).results||[];
  for(const a of aliases){const id=canonicalEvoId(a.legacy_evo_member_id);if(/^[1-9]\d*$/.test(id))ids.add(id);}
 }
 return {ids:[...ids],pending};
}

export function attendanceQuery(ids){
 const values=ids.length?ids:['__no_identity__'];
 return {values,base:`WITH unique_attendance AS (
 SELECT attendance_date,start_time,activity_name,id_activity_session,
 CASE WHEN NULLIF(TRIM(id_activity_session),'') IS NOT NULL THEN 'session:'||TRIM(id_activity_session) ELSE 'key:'||attendance_key END session_id,
 MAX(json_extract(raw_json,'$.raw.slotNumber')) slotNumber
 FROM evo_member_attendance WHERE unit=? AND evo_member_id IN (${values.map(()=>'?').join(',')})
 GROUP BY CASE WHEN NULLIF(TRIM(id_activity_session),'') IS NOT NULL THEN 'session:'||TRIM(id_activity_session) ELSE 'key:'||attendance_key END) `};
}

export async function unitAttendanceRows(db,unit,ids,month=null){
 const {base,values}=attendanceQuery(ids);
 const where=month?' WHERE substr(attendance_date,1,7)=?':'';
 return (await db.prepare(base+'SELECT * FROM unique_attendance'+where+' ORDER BY attendance_date,start_time,session_id')
  .bind(unit,...values,...(month?[month]:[])).all()).results||[];
}

export async function unitAttendanceHistory(db,member,unit,offset=0){
 const identity=await memberAttendanceIds(db,member,unit),{base,values}=attendanceQuery(identity.ids);
 const start=Math.max(0,Math.floor(Number(offset)||0));
 const total=await db.prepare(base+'SELECT COUNT(*) total FROM unique_attendance').bind(unit,...values).first();
 const rows=await db.prepare(base+'SELECT * FROM unique_attendance ORDER BY attendance_date DESC,start_time DESC,session_id DESC LIMIT 10 OFFSET ?').bind(unit,...values,start).all();
 return {ok:true,unit,total:Number(total?.total||0),offset:start,items:rows.results||[],hasMore:start+(rows.results||[]).length<Number(total?.total||0),identityPending:identity.pending.length>0,source:'d1',evoRequestsMade:0};
}

export async function unitStars(db,member,unit,ids){
 const own=canonicalEvoId(unit==='gym'?member.gym_client_id:member.evo_member_id);
 const {base,values}=attendanceQuery(ids);
 const count=await db.prepare(base+'SELECT COUNT(*) actual,SUM(attendance_date>\'2026-10-18\') after_baseline FROM unique_attendance').bind(unit,...values).first();
 const stored=await db.prepare('SELECT presencas_legadas_bike,presencas_legadas_gym FROM members WHERE id=?').bind(member.id).first();
 let legacy=Number(unit==='gym'?stored?.presencas_legadas_gym:stored?.presencas_legadas_bike)||0;
 let actual=Number(count?.actual||0);
 if(unit==='gym'){
  // Preserve imported totals across verified linked accounts, without adding
  // duplicate legacy imports or including a numeric ID owned by someone else.
  const marks=values.map(()=>'?').join(',');
  const row=await db.prepare(`SELECT MAX(CASE WHEN EXISTS(SELECT 1 FROM club_settings r
   WHERE r.key='attendance_legacy_review:gym:'||m.id AND json_extract(r.value,'$.status')='pending')
   THEN 0 ELSE COALESCE(m.presencas_legadas_gym,0) END) legacy FROM members m
   WHERE m.id=? OR CAST(m.gym_client_id AS TEXT) IN (${marks})
   OR (m.cpf_hash=? AND CAST(m.evo_member_id AS TEXT) IN (${marks}))`)
   .bind(member.id,...values,member.cpf_hash||'__unverified__',...values).first();
  legacy=Number(row?.legacy||0);
 }else if(own){
  const baseline=await db.prepare(`SELECT baseline_count FROM bike_evo_historical_baseline b WHERE evo_member_id=?
   AND NOT EXISTS(SELECT 1 FROM club_settings r WHERE r.key='attendance_baseline_review:bike:'||b.evo_member_id
   AND json_extract(r.value,'$.status')='pending')`).bind(own).first();
  actual=Math.max(actual,Number(baseline?.baseline_count||0)+Number(count?.after_baseline||0));
 }
 const manual=own?await db.prepare('SELECT value FROM club_settings WHERE key=?').bind('manual_stars:'+unit+':'+own).first():null;
 const override=parse(manual?.value).stars;
 return {legacy,actual,total:Number.isFinite(override)&&override>=0?override:legacy+actual};
}
