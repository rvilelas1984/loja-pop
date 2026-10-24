// Shared D1 facts for the existing batch generator and its independent audit.
export const rows = async (db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const parse=s=>{try{return JSON.parse(s||'{}')}catch{return {}}};
export const drawDay=p=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(p.drawAt||Date.now()));
export function activeContract(c,accepted,day){return accepted.has(String(c.id_membership))&&['1','active'].includes(String(c.membership_status).toLowerCase())&&(!c.start_date||c.start_date.slice(0,10)<=day)&&(!c.end_date||c.end_date.slice(0,10)>=day)&&(!c.cancel_date||c.cancel_date.slice(0,10)>day)}
export async function drawCandidates(db,p){
 const unit=p.unit||'bike',accepted=new Set((p.eligibility?.acceptedContracts||[]).map(String)),mode=p.eligibility?.mode||'any';
 if(!['any','active_contract'].includes(mode))throw Error('REGRA_ELEGIBILIDADE_NAO_SUPORTADA');
 if(mode==='active_contract'&&!accepted.size)throw Error('CONTRATOS_ELEGIVEIS_NAO_CONFIGURADOS');
 const [students,masters,members,links,aliases,contracts,reviews]=await Promise.all([
 rows(db,'SELECT * FROM evo_students WHERE unit=? AND is_current=1',unit),
 rows(db,'SELECT evo_member_id,personal_json FROM evo_member_master WHERE unit=?',unit),
 rows(db,'SELECT id,evo_member_id,gym_client_id,cpf_hash,first_name,last_name,email FROM members'),
 rows(db,"SELECT member_id,gym_client_id FROM gym_member_links WHERE status='ACTIVE'"),
 rows(db,'SELECT legacy_evo_member_id,principal_evo_member_id FROM evo_member_identity_aliases WHERE unit=?',unit),
 rows(db,'SELECT evo_member_id,id_membership,membership_status,start_date,end_date,cancel_date,raw_json FROM evo_member_contracts WHERE unit=?',unit),
 rows(db,"SELECT member_id FROM promotion_review_requests WHERE promotion_slug=? AND status='APPROVED'",String(p.id))]);
 // A confirmed eligible contract is not discarded just because the current
 // students report omitted its ID. The synchronized master supplies identity.
 if(mode==='active_contract')for(const c of contracts.filter(c=>activeContract(c,accepted,drawDay(p)))){
  if(students.some(s=>String(s.evo_member_id)===String(c.evo_member_id)))continue;
  let m=masters.find(m=>String(m.evo_member_id)===String(c.evo_member_id));
  if(!m){const raw=parse(c.raw_json);if(String(raw.idMember)!==String(c.evo_member_id)||!raw.name)throw Error('CADASTRO_ELEGIVEL_AUSENTE_'+unit+'_'+c.evo_member_id);m={evo_member_id:String(c.evo_member_id),personal_json:JSON.stringify({firstName:raw.name,document:raw.memberDocument})};masters.push(m)}
  const profile=parse(m.personal_json);students.push({evo_member_id:String(c.evo_member_id),display_name:[profile.firstName,profile.lastName].filter(Boolean).join(' ')||'Aluno',is_current:1});
 }
 const parent=new Map(),add=id=>{id=String(id);if(!parent.has(id))parent.set(id,id);return id},root=id=>{id=add(id);let n=id;while(parent.get(n)!==n)n=parent.get(n);return n},join=(a,b)=>parent.set(root(b),root(a));
 for(const s of students)add(s.evo_member_id);for(const m of masters)add(m.evo_member_id);
 for(const a of aliases)join(a.principal_evo_member_id,a.legacy_evo_member_id);
 const documents=new Map(),emails=new Map(),docById=new Map();
 for(const m of masters){const x=parse(m.personal_json),id=String(m.evo_member_id),cpf=String(x.document||x.cpf||'').replace(/\D/g,''),email=String(x.email||'').trim().toLowerCase();if(/^\d{11}$/.test(cpf)&&! /^(\d)\1{10}$/.test(cpf)){docById.set(id,cpf);const a=documents.get(cpf)||[];a.push(id);documents.set(cpf,a)}if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){const a=emails.get(email)||[];a.push(id);emails.set(email,a)}}
 for(const a of documents.values())for(const id of a.slice(1))join(a[0],id);
 for(const a of emails.values()){if(new Set(a.map(id=>docById.get(id)).filter(Boolean)).size>1)continue;for(const id of a.slice(1))join(a[0],id)}
 const groups=new Map();for(const id of parent.keys()){const key=root(id);if(!groups.has(key))groups.set(key,{ids:[],students:[],members:[],contracts:[]});groups.get(key).ids.push(id)}
 for(const s of students)groups.get(root(s.evo_member_id)).students.push(s);
 for(const c of contracts){const g=groups.get(root(c.evo_member_id));if(g)g.contracts.push(c)}
 const hashedDocuments=new Map();
 for(const [doc,ids] of documents){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(doc))),n=>n.toString(16).padStart(2,'0')).join('');hashedDocuments.set(hash,ids)}
 for(const m of members){
  let ids=unit==='bike'?[m.evo_member_id]:[m.gym_client_id,...links.filter(l=>l.member_id===m.id).map(l=>l.gym_client_id)];
  // Legacy generator stored Gym-only placeholders in the Bike field. Accept
  // only its explicit placeholder plus an actual Gym master, never a bare ID collision.
  if(unit==='gym'&&!ids.some(Boolean)&&m.cpf_hash==='evo-placeholder:'+m.evo_member_id&&masters.some(x=>String(x.evo_member_id)===String(m.evo_member_id)))ids.push(m.evo_member_id);
  ids.push(...(hashedDocuments.get(m.cpf_hash)||[]));
  for(const key of new Set(ids.filter(Boolean).map(id=>root(id)))){const g=groups.get(key);if(g)g.members.push(m)}
 }
 const approved=new Set(reviews.map(r=>Number(r.member_id))),day=drawDay(p),result=[];
 for(const g of groups.values()){
  if(!g.students.length)continue;
  g.students.sort((a,b)=>Number(b.evo_member_id)-Number(a.evo_member_id));
  const id=String(g.students[0].evo_member_id),acceptedContracts=g.contracts.filter(c=>activeContract(c,accepted,day));
  const eligible=mode==='any'||acceptedContracts.length>0||g.members.some(m=>approved.has(Number(m.id)));
  g.members.sort((a,b)=>Number(String(a.cpf_hash).startsWith('evo-placeholder:'))-Number(String(b.cpf_hash).startsWith('evo-placeholder:'))||a.id-b.id);
  result.push({...g,evo_member_id:id,display_name:g.students[0].display_name,member_id:g.members[0]?.id||null,eligible,acceptedContracts});
 }
 return result.sort((a,b)=>Number(a.evo_member_id)-Number(b.evo_member_id));
}
export async function ensureDrawMember(db,p,c){
 if(c.members.length){
  const owners=await rows(db,"SELECT DISTINCT pp.member_id FROM promotion_participants pp JOIN promotions p ON p.id=pp.promotion_id JOIN lucky_numbers l ON l.participant_id=pp.id AND l.status='ACTIVE' WHERE p.slug=?",String(p.id));
  const existing=c.members.filter(m=>owners.some(o=>o.member_id===m.id));
  if(existing.length>1)throw Error('PARTICIPANTES_DUPLICADOS_EXIGEM_REVISAO_'+p.unit+'_'+c.evo_member_id);
  const m=existing[0]||c.members[0];c.member_id=m.id;return m;
 }
 const names=String(c.display_name||'Aluno').trim().split(/\s+/),first=names.shift(),last=names.join(' '),id=c.evo_member_id,unit=p.unit||'bike';
 await db.prepare("INSERT OR IGNORE INTO members(evo_member_id,gym_client_id,cpf_hash,first_name,last_name,status) VALUES(?,?,?,?,?,'ACTIVE')").bind(unit==='bike'?Number(id):null,unit==='gym'?id:null,'draw-placeholder:'+unit+':'+id,first,last).run();
 const m=await db.prepare('SELECT * FROM members WHERE '+(unit==='gym'?'gym_client_id':'evo_member_id')+'=?').bind(id).first();if(!m)throw Error('IDENTIDADE_NAO_RESOLVIDA_'+unit+'_'+id);c.members=[m];c.member_id=m.id;return m;
}
export const attendanceDay=a=>String(a.attendance_date||a.date||a.dateStart||'').slice(0,10);
export function attendanceSession(a){const raw=parse(a.raw_json),suffix=String(a.attendance_key||'').split(':').at(-1);return String(a.id_activity_session||a.idActivitySession||a.idActivitieSession||(/^\d+$/.test(suffix)?suffix:'')||raw.id_activity_session||raw.idActivitySession||raw.idActivitieSession||'')}
export async function drawAttendance(db,p,c){
 const values=[];
 for(const id of c.ids)values.push(...await rows(db,'SELECT * FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ?',p.unit,id,p.start,p.end));
 for(const m of c.members)values.push(...await rows(db,'SELECT * FROM attendance_history WHERE unit=? AND member_id=? AND attendance_date BETWEEN ? AND ?',p.unit,m.id,p.start,p.end));
 const unique=new Map();for(const a of values){const day=attendanceDay(a),sid=attendanceSession(a);if(sid){const key=day+':'+sid;if(!unique.has(key))unique.set(key,{...a,attendance_date:day,id_activity_session:sid})}}
 // Legacy day placeholders are aliases only when there is a real session.
 // An unidentifiable historical presence must not become a fabricated class.
 for(const a of values)if(!attendanceSession(a)&&![...unique.values()].some(b=>b.attendance_date===attendanceDay(a)))throw Error('PRESENCA_SEM_SESSAO_'+p.unit+'_'+c.evo_member_id+'_'+attendanceDay(a));
 const requirements=(p.requirements||[]).filter(r=>r.activityId&&r.activityId!=='*');
 const result=[...unique.values()].sort((a,b)=>a.attendance_date.localeCompare(b.attendance_date)||a.id_activity_session.localeCompare(b.id_activity_session));
 if(!requirements.length)return result;
 return result.filter(a=>{const raw=parse(a.raw_json),id=a.activity_id||raw.idActivity||raw.idActivitie||raw.raw?.idActivity;if(!id)throw Error('MODALIDADE_PRESENCA_NAO_CONFIRMADA');return requirements.some(r=>String(r.activityId)===String(id))});
}
export function ticketSession(n,attendance){
 const day=String(n.occurred_at||'').slice(0,10),daily=attendance.filter(a=>attendanceDay(a)===day),suffix=String(n.source_ref||'').split(':').at(-1);
 const exact=daily.filter(a=>a.attendance_key===n.source_ref);if(exact.length===1)return day+':'+attendanceSession(exact[0]);
 const sid=/^\d+$/.test(suffix)?suffix:attendanceSession({raw_json:n.source_raw});
 const matching=sid?daily.filter(a=>attendanceSession(a)===sid):daily;
 if(matching.length!==1)throw Error('PRESENCA_SESSAO_AMBIGUA_'+n.studio+'_'+n.member_id+'_'+day);
 return day+':'+attendanceSession(matching[0]);
}
export async function acquireDrawLease(db,key,seconds=180){
 await db.prepare('CREATE TABLE IF NOT EXISTS lucky_draw_leases(lease_key TEXT PRIMARY KEY,token TEXT NOT NULL,expires_at TEXT NOT NULL)').run();
 const token=crypto.randomUUID();
 const r=await db.prepare("INSERT INTO lucky_draw_leases(lease_key,token,expires_at) VALUES(?,?,datetime('now',?)) ON CONFLICT(lease_key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE expires_at<datetime('now')").bind(key,token,'+'+seconds+' seconds').run();
 return r.meta?.changes?token:null;
}
export async function releaseDrawLease(db,key,token){await db.prepare('DELETE FROM lucky_draw_leases WHERE lease_key=? AND token=?').bind(key,token).run()}
