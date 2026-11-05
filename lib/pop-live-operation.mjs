// Teacher APK API. Uses existing official agenda, check-ins and Pop Live tables.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const parse=x=>{try{return JSON.parse(x||'{}')}catch{return {}}};
const rows=async q=>(await q.all()).results||[];
const validUnit=u=>['bike','gym'].includes(u);
export function validateRules(r){
 if(!r||!['none','calories','zone'].includes(r.type)||!['kcal','z3','z4','z5'].includes(r.podium)||typeof r.showTV!=='boolean')fail('REGRAS_INVALIDAS');
 if(r.type!=='none'&&(!Number.isFinite(r.target)||r.target<=0||r.target>1000000))fail('META_INVALIDA');
 if(r.type==='zone'&&(!Number.isInteger(r.zone)||r.zone<1||r.zone>5))fail('ZONA_INVALIDA');
 return {type:r.type,target:r.type==='none'?0:r.target,zone:r.type==='zone'?r.zone:0,podium:r.podium,showTV:r.showTV};
}
export function consolidate(input,duration,rules){
 if(!Array.isArray(input)||input.length>200)fail('RESULTADOS_INVALIDOS');
 const seen=new Set();
 const people=input.map(p=>{
  const member_id=String(p.member_id||''),watch=String(p.watch||'');
  if(!/^\d+$/.test(member_id)||seen.has(member_id)||!/^\d{1,6}$/.test(watch))fail('PARTICIPANTE_INVALIDO');
  seen.add(member_id);
  if(p.kcal!=null&&(!Number.isFinite(p.kcal)||p.kcal<0||p.kcal>duration/60*50+1))fail('CALORIAS_INVALIDAS');
  if(p.zones!=null&&(!Array.isArray(p.zones)||p.zones.length!==5||p.zones.some(n=>!Number.isFinite(n)||n<0)||p.zones.reduce((a,b)=>a+b,0)>duration+2))fail('TEMPO_INVALIDO');
  const extra={};
  for(const [key,max] of Object.entries({hr_avg:240,hr_max:260,rpm_avg:250,rpm_max:300,speed_avg_kmh:120,speed_max_kmh:150,distance_km:300})){
   if(p[key]==null)continue;
   if(typeof p[key]!=='number'||!Number.isFinite(p[key])||p[key]<0||p[key]>max)fail('METRICA_INVALIDA');
   extra[key]=p[key];
  }
  const sensor_types=Array.isArray(p.sensor_types)?[...new Set(p.sensor_types)]:['heart_rate'];
  if(sensor_types.length>3||sensor_types.some(t=>!['heart_rate','cadence','speed'].includes(t)))fail('SENSOR_INVALIDO');
  if((extra.hr_avg!=null||extra.hr_max!=null)&&!sensor_types.includes('heart_rate'))fail('SENSOR_INCOMPATIVEL');
  if((extra.rpm_avg!=null||extra.rpm_max!=null)&&!sensor_types.includes('cadence'))fail('SENSOR_INCOMPATIVEL');
  if((extra.speed_avg_kmh!=null||extra.speed_max_kmh!=null||extra.distance_km!=null)&&!sensor_types.includes('speed'))fail('SENSOR_INCOMPATIVEL');
  if(!sensor_types.includes('heart_rate') && (p.kcal>0 || p.zones?.some(Boolean)))fail('SENSOR_INCOMPATIVEL');
  const measured=p.measured_seconds;
  if(measured!=null && (!Number.isFinite(measured)||measured<0||measured>duration+2))fail('TEMPO_INVALIDO');
  const weight=p.weight_kg;
  if(weight!=null && (!Number.isFinite(weight)||weight<20||weight>300))fail('PESO_INVALIDO');
  return {member_id,watch,kcal:p.kcal??null,zones:p.zones??null,sensor_types,measured_seconds:measured??null,weight_kg:weight??null,...extra};
 });
 const rankings=Object.fromEntries(['kcal','z3','z4','z5'].map(key=>[key,people.map(p=>({member_id:p.member_id,watch:p.watch,value:key==='kcal'?p.kcal:p.zones?.[Number(key[1])-1]})).filter(p=>p.value!=null).sort((a,b)=>b.value-a.value||a.member_id.localeCompare(b.member_id))]));
 const total=people.reduce((s,p)=>s+p.kcal,0),progress=rules.type==='calories'?total:rules.type==='zone'?people.reduce((s,p)=>s+(p.zones?.[rules.zone-1]||0),0):0;
 return {people,rankings,podium:rankings[rules.podium].slice(0,3),total,progress,target:rules.target,achieved:rules.type!=='none'&&progress>=rules.target,duration};
}
// A manual monitor represents a device in this session only, never an EVO member.
async function manualMonitors(db,session){
 const frozen=parse(session.rules_json)?.manualMonitors;
 if(Array.isArray(frozen))return frozen;
 const devices=await rows(db.prepare(`SELECT id,reference_number FROM pop_live_devices
   WHERE active=1 AND device_type='heart_rate'
   AND ((?='bike' AND unit_bike=1) OR (?='gym' AND unit_gym=1))
   ORDER BY reference_number`).bind(session.unit,session.unit));
 return devices.map(d=>({member_id:String(d.id),watch:String(d.reference_number),
   name:'Relógio '+d.reference_number,profileComplete:false}));
}
async function participants(db,s){
 if(s.source==='manual')return manualMonitors(db,s);
 const result=await rows(db.prepare(`SELECT c.evo_member_id member_id,c.member_name name,d.reference_number watch,d.ble_identifier,
 m.birth_date,mm.personal_json,p.height,
 COALESCE((SELECT h.weight_kg FROM pop_fit_weight_history h WHERE h.member_id=m.id ORDER BY h.recorded_at DESC,h.id DESC LIMIT 1),(SELECT e.weight FROM pop_fit_entries e WHERE e.member_id=m.id AND e.weight>0 ORDER BY e.updated_at DESC,e.rowid DESC LIMIT 1),p.initial_weight) weight
 FROM checkin_reservation_snapshots c
 LEFT JOIN pop_live_session_devices a ON a.session_id=? AND a.member_id=c.evo_member_id
 LEFT JOIN pop_live_devices d ON d.id=a.device_id AND d.active=1 AND d.device_type='heart_rate'
 LEFT JOIN members m ON (CASE WHEN c.unit='gym' THEN CAST(m.gym_client_id AS TEXT) ELSE CAST(m.evo_member_id AS TEXT) END)=c.evo_member_id
 LEFT JOIN pop_fit_profile p ON p.member_id=m.id
 LEFT JOIN evo_member_master mm ON mm.unit=c.unit AND mm.evo_member_id=c.evo_member_id
 WHERE c.unit=? AND c.session_id=? AND c.activity_date=substr(?,1,10) AND c.checked_in=1 AND c.removed=0
 AND lower(COALESCE(c.status,'')) NOT IN ('cancelled','canceled','cancelado','cancelada')
 ORDER BY c.slot_number LIMIT 200`).bind(s.id,s.unit,s.source_class_id,s.starts_at));
 const unique=new Map();
 for(const p of result){
  const personal=parse(p.personal_json),birth=String(p.birth_date||personal.birthDate||'').slice(0,10);
  const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const age=/^\d{4}-\d{2}-\d{2}$/.test(birth)?Number(today.slice(0,4))-Number(birth.slice(0,4))-(today.slice(5)<birth.slice(5)?1:0):null;
  const gender=String(personal.gender||'').toLowerCase(),sex=['m','male','masculino'].includes(gender)?'m':['f','female','feminino'].includes(gender)?'f':null;
  unique.set(p.member_id,{member_id:p.member_id,name:p.name,watch:p.watch||null,age,weight:p.weight,height:p.height,sex,max:age?208-.7*age:null,profileComplete:!!(age>=12&&age<=110&&p.weight>=20&&p.weight<=300&&sex)});
 }
 // Alunos que fizeram check-in exclusivo pelo Club Pop (sem gerar presença EVO).
 let linked=[];try{linked=await rows(db.prepare(`SELECT a.member_id,d.reference_number watch,m.first_name,m.last_name,m.birth_date,
   p.height,COALESCE((SELECT h.weight_kg FROM pop_fit_weight_history h WHERE h.member_id=m.id ORDER BY h.recorded_at DESC,h.id DESC LIMIT 1),(SELECT e.weight FROM pop_fit_entries e WHERE e.member_id=m.id AND e.weight>0 ORDER BY e.updated_at DESC,e.rowid DESC LIMIT 1),p.initial_weight) weight,
   mm.personal_json
   FROM pop_live_session_devices a JOIN pop_live_devices d ON d.id=a.device_id AND d.device_type='heart_rate'
   LEFT JOIN members m ON (CASE WHEN ?='gym' THEN CAST(m.gym_client_id AS TEXT) ELSE CAST(m.evo_member_id AS TEXT) END)=a.member_id
   LEFT JOIN pop_fit_profile p ON p.member_id=m.id
   LEFT JOIN evo_member_master mm ON mm.unit=? AND mm.evo_member_id=a.member_id
   WHERE a.session_id=?`).bind(s.unit,s.unit,s.id));}catch(e){if(!/no such (column|table)/i.test(String(e.message)))throw e;}
 for(const p of linked){
   if(unique.has(String(p.member_id)))continue;
   const personal=parse(p.personal_json),birth=String(p.birth_date||personal.birthDate||'').slice(0,10);
   const today=new Date().toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
   const age=/^\d{4}-\d{2}-\d{2}$/.test(birth)?Number(today.slice(0,4))-Number(birth.slice(0,4))-(today.slice(5)<birth.slice(5)?1:0):null;
   const gender=String(personal.gender||'').toLowerCase(),sex=['m','male','masculino'].includes(gender)?'m':['f','female','feminino'].includes(gender)?'f':null;
   unique.set(String(p.member_id),{member_id:String(p.member_id),name:[p.first_name,p.last_name].filter(Boolean).join(' ')||'Aluno Pop',watch:p.watch,age,weight:p.weight,height:p.height,sex,max:age?208-.7*age:null,profileComplete:!!(age>=12&&age<=110&&p.weight>=20&&p.weight<=300&&sex)});
 }
 return [...unique.values()];
}
async function body(request){
 const reader=request.body?.getReader();if(!reader)return {};
 let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>150000){await reader.cancel();fail('CORPO_MUITO_GRANDE',413)}parts.push(value)}
 const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{fail('JSON_INVALIDO')}
}
export async function popLiveOperation(request,env,url,json){
 try{
  const db=env.DB,token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'').trim();
  if(!/^[0-9a-f-]{36}$/i.test(token))fail('APP_NAO_AUTORIZADO',401);
  if(!(await db.prepare('SELECT active FROM pop_live_app_tokens WHERE token=?').bind(token).first())?.active)fail('APP_NAO_AUTORIZADO',403);
  const path=url.pathname;
  if(path==='/pop-live/classes'&&request.method==='GET'){
   const unit=url.searchParams.get('unit');if(!validUnit(unit))fail('UNIDADE_INVALIDA');
   const classes=await rows(db.prepare(`SELECT a.id_activity_session id,a.unit,a.activity_date,a.start_time,a.activity_name name,a.instructor_name teacher,
 p.id monitored_id,p.status monitored_status FROM evo_attendance_sessions a
 LEFT JOIN pop_live_sessions p ON p.unit=a.unit AND p.source='d1' AND p.source_class_id=a.id_activity_session AND substr(p.starts_at,1,10)=a.activity_date
 WHERE a.unit=? AND a.activity_date BETWEEN date('now','-3 hours') AND date('now','-3 hours','+7 days')
 AND lower(a.status) NOT IN ('cancelled','canceled','cancelado','cancelada')
 AND datetime(a.activity_date||'T'||substr(a.start_time,1,5)||':00')>=datetime('now','-3 hours','-2 hours')
 UNION ALL
 SELECT 'manual-'||id,unit,substr(starts_at,1,10),substr(starts_at,12,5),class_name,teacher_name,id,status
 FROM pop_live_sessions WHERE unit=? AND source='manual'
 AND ((status='running') OR (status='planned' AND date(starts_at) BETWEEN date('now','-3 hours') AND date('now','-3 hours','+7 days')
 AND datetime(starts_at,'+'||duration_minutes||' minutes')>=datetime('now','-3 hours')))
 ORDER BY activity_date,start_time LIMIT 200`).bind(unit,unit));
   return json({ok:true,timezone:'America/Sao_Paulo',classes});
  }
  const b=request.method==='GET'?{}:await body(request);
  if(path==='/pop-live/sessions'&&request.method==='POST'){
   const manual=String(b.class_id).match(/^manual-([1-9]\d*)$/);
   if(manual&&validUnit(b.unit)){
    const session=await db.prepare("SELECT * FROM pop_live_sessions WHERE id=? AND unit=? AND source='manual'").bind(Number(manual[1]),b.unit).first();
    if(!session)fail('AULA_NAO_ENCONTRADA',404);
    return json({ok:true,session});
   }
   if(!validUnit(b.unit)||!/^\d+$/.test(String(b.class_id)))fail('AULA_INVALIDA');
   const c=await db.prepare('SELECT * FROM evo_attendance_sessions WHERE unit=? AND id_activity_session=?').bind(b.unit,String(b.class_id)).first();
   if(!c||['cancelled','canceled','cancelado','cancelada'].includes(c.status))fail('AULA_NAO_ENCONTRADA',404);
   const starts=c.activity_date+'T'+String(c.start_time).slice(0,5)+':00';
   await db.prepare("INSERT INTO pop_live_sessions(source,source_class_id,unit,class_name,starts_at,teacher_name) VALUES('d1',?,?,?,?,?) ON CONFLICT DO NOTHING").bind(String(b.class_id),b.unit,c.activity_name,starts,c.instructor_name).run();
   const session=await db.prepare("SELECT * FROM pop_live_sessions WHERE source='d1' AND unit=? AND source_class_id=? AND starts_at=?").bind(b.unit,String(b.class_id),starts).first();
   return json({ok:true,session});
  }
  // Test-only isolated manual draft; never creates an EVO identity, check-in or active member.
  const draftRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/manual-drafts$/);
  if(draftRoute){
   if(request.method!=='POST')fail('METODO_INVALIDO',405);
   const session=await db.prepare('SELECT id,unit,status FROM pop_live_sessions WHERE id=?').bind(Number(draftRoute[1])).first();
   if(!session||session.status!=='planned'||!validUnit(session.unit))fail('AULA_NAO_ELEGIVEL',409);
   const name=String(b.name||'').trim().replace(/\s+/g,' ');
   const birth=String(b.birth_date||''),weight=Number(b.weight_kg),height=Number(b.height_cm);
   const key=String(b.idempotency_key||'');
   if(name.length<5||name.length>120||!name.includes(' ')||!/^\d{4}-\d{2}-\d{2}$/.test(birth)||!Number.isFinite(Date.parse(birth))||weight<20||weight>350||height<100||height>230||!/^[0-9a-f-]{36}$/i.test(key))fail('DADOS_INVALIDOS');
   const existing=await db.prepare('SELECT id,unit,session_id FROM pop_live_manual_drafts WHERE idempotency_key=?').bind(key).first();
   if(existing){if(existing.unit!==session.unit||existing.session_id!==session.id)fail('CHAVE_JA_UTILIZADA',409);return json({ok:true,draft_id:existing.id,status:'pending_review',duplicate:true});}
   const similar=await rows(db.prepare(`SELECT id,first_name,last_name FROM members
     WHERE birth_date=? AND lower(trim(first_name||' '||last_name))=lower(?) AND (CASE WHEN ?='gym' THEN gym_client_id ELSE evo_member_id END) IS NOT NULL LIMIT 5`).bind(birth,name,session.unit));
   await db.prepare(`INSERT INTO pop_live_manual_drafts(unit,session_id,full_name,birth_date,weight_kg,height_cm,status,idempotency_key)
     VALUES(?,?,?,?,?,?,'pending_review',?)`).bind(session.unit,session.id,name,birth,weight,height,key).run();
   const draft=await db.prepare('SELECT id FROM pop_live_manual_drafts WHERE idempotency_key=?').bind(key).first();
   return json({ok:true,draft_id:draft.id,status:'pending_review',possible_matches:similar.map(x=>({member_id:x.id,name:[x.first_name,x.last_name].join(' ')})),requires_manual_review:true});
  }
  // Unit-scoped lookup, only within the selected class unit.
  const lookupRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/lookup$/);
  if(lookupRoute){
   if(request.method!=='POST')fail('METODO_INVALIDO',405);
   const session=await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(Number(lookupRoute[1])).first();
   if(!session||session.status!=='planned'||!validUnit(session.unit))fail('AULA_NAO_ELEGIVEL',409);
   const cpf=String(b.cpf||'').replace(/\D/g,'');
   const value=String(b.member_id||'');
   if(cpf&&!/^\d{11}$/.test(cpf))fail('CPF_INVALIDO');
   if(!cpf&&!/^[0-9]{1,12}$/.test(value))fail('ID_EVO_INVALIDO');
   let matches;
   if(cpf){
    if(/^([0-9])\1{10}$/.test(cpf))fail('CPF_INVALIDO');
    const digits=cpf.split('').map(Number),check=n=>(digits.slice(0,n).reduce((sum,d,i)=>sum+d*(n+1-i),0)*10)%11%10;
    if(check(9)!==digits[9]||check(10)!==digits[10])fail('CPF_INVALIDO');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cpf));
    const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
    matches=await rows(db.prepare(`SELECT id,first_name,last_name,birth_date,
      (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END) unit_evo_id
      FROM members WHERE cpf_hash=? AND (CASE WHEN ?='gym' THEN gym_client_id ELSE evo_member_id END) IS NOT NULL LIMIT 2`).bind(session.unit,hash,session.unit));
   }else{
    matches=await rows(db.prepare(`SELECT id,first_name,last_name,birth_date,
      (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END) unit_evo_id
      FROM members WHERE (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END)=? LIMIT 2`).bind(session.unit,value));
   }
   if(!matches.length)return json({ok:true,found:false,unit:session.unit,reason:'ALUNO_NAO_ENCONTRADO',manualDraftAllowed:true});
   if(matches.length!==1)fail('CADASTRO_DUPLICADO_REQUER_AUDITORIA',409);
   const m=matches[0],p=await db.prepare('SELECT initial_weight,height FROM pop_fit_profile WHERE member_id=?').bind(m.id).first();
   const w=await db.prepare('SELECT weight_kg FROM pop_fit_weight_history WHERE member_id=? ORDER BY recorded_at DESC,id DESC LIMIT 1').bind(m.id).first();
   const checked=session.source==='d1'?await db.prepare(`SELECT 1 ok FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? AND evo_member_id=? AND activity_date=substr(?,1,10) AND checked_in=1 AND removed=0 LIMIT 1`).bind(session.unit,session.source_class_id,m.unit_evo_id,session.starts_at).first():null;
   return json({ok:true,found:true,unit:session.unit,member:{member_id:m.unit_evo_id,name:[m.first_name,m.last_name].filter(Boolean).join(' '),birth_date:m.birth_date,weight:w?.weight_kg??p?.initial_weight??null,height:p?.height??null,checked_in:!!checked},canEditWeight:!!checked});
  }
  // Explicit teacher selection: only links to the monitoring session, never records attendance.
  const selectRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/select-member$/);
  if(selectRoute){
   if(request.method!=='POST')fail('METODO_INVALIDO',405);
   const session=await db.prepare('SELECT id,unit,status FROM pop_live_sessions WHERE id=?').bind(Number(selectRoute[1])).first();
   if(!session||session.status!=='planned'||!validUnit(session.unit))fail('AULA_NAO_ELEGIVEL',409);
   const id=String(b.member_id||'');
   if(!/^[0-9]{1,12}$/.test(id))fail('ID_EVO_INVALIDO');
   const member=await db.prepare(`SELECT id,first_name,last_name FROM members
    WHERE (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END)=? LIMIT 1`).bind(session.unit,id).first();
   if(!member)fail('ALUNO_NAO_ENCONTRADO',404);
   await db.prepare(`INSERT OR IGNORE INTO pop_live_selected_members(session_id,member_id,unit,evo_member_id)
    VALUES(?,?,?,?)`).bind(session.id,member.id,session.unit,id).run();
   return json({ok:true,selected:true,member_id:id,name:[member.first_name,member.last_name].filter(Boolean).join(' '),attendance_created:false,checkin_confirmed:false});
  }
  // Device catalog and explicit assignment, independent from official EVO attendance.
  const deviceRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/devices$/);
  const assignRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/assign-device$/);
  if(deviceRoute||assignRoute){
   const sid=Number((deviceRoute||assignRoute)[1]);
   const session=await db.prepare('SELECT id,unit,status FROM pop_live_sessions WHERE id=?').bind(sid).first();
   if(!session||session.status!=='planned'||!validUnit(session.unit))fail('AULA_NAO_ELEGIVEL',409);
   if(deviceRoute){
    if(request.method!=='GET')fail('METODO_INVALIDO',405);
    const devices=await rows(db.prepare(`SELECT d.id,d.reference_number,d.display_name,d.device_type,
      CASE WHEN l.device_id IS NULL THEN 0 ELSE 1 END occupied
      FROM pop_live_devices d LEFT JOIN pop_live_session_devices l ON l.device_id=d.id AND l.session_id=?
      WHERE d.active=1 AND (CASE WHEN ?='gym' THEN d.unit_gym ELSE d.unit_bike END)=1
      ORDER BY d.device_type,d.reference_number,d.id LIMIT 100`).bind(sid,session.unit));
    return json({ok:true,unit:session.unit,devices});
   }
   if(request.method!=='POST')fail('METODO_INVALIDO',405);
   const id=String(b.member_id||''),deviceId=Number(b.device_id);
   if(!/^[0-9]{1,12}$/.test(id)||!Number.isSafeInteger(deviceId)||deviceId<=0)fail('DADOS_INVALIDOS');
   const selected=await db.prepare('SELECT member_id FROM pop_live_selected_members WHERE session_id=? AND unit=? AND evo_member_id=?').bind(sid,session.unit,id).first();
   if(!selected)fail('SELECIONE_ALUNO_ANTES',409);
   const device=await db.prepare(`SELECT id,reference_number,device_type FROM pop_live_devices WHERE id=? AND active=1 AND (CASE WHEN ?='gym' THEN unit_gym ELSE unit_bike END)=1`).bind(deviceId,session.unit).first();
   if(!device)fail('DISPOSITIVO_INDISPONIVEL',404);
   const busy=await db.prepare('SELECT member_id FROM pop_live_session_devices WHERE session_id=? AND device_id=?').bind(sid,deviceId).first();
   if(busy&&String(busy.member_id)!==id)fail('DISPOSITIVO_EM_USO',409);
   await db.prepare('DELETE FROM pop_live_session_devices WHERE session_id=? AND member_id=? AND device_id<>?').bind(sid,id,deviceId).run();
   await db.prepare('INSERT OR IGNORE INTO pop_live_session_devices(session_id,device_id,member_id) VALUES(?,?,?)').bind(sid,deviceId,id).run();
   return json({ok:true,assigned:true,member_id:id,device_id:device.id,reference_number:device.reference_number,device_type:device.device_type,attendance_created:false});
  }
  // Read-only profile lookup limited to confirmed participants in an official class.
  const profileRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/members\/(\d+)\/profile$/);
  if(profileRoute){
   if(request.method!=='GET')fail('METODO_INVALIDO',405);
   const session=await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(Number(profileRoute[1])).first();
   if(!session||session.source!=='d1'||session.status!=='planned')fail('AULA_NAO_ELEGIVEL',409);
   const participant=(await participants(db,session)).find(p=>p.member_id===profileRoute[2]);
   if(!participant)fail('CHECKIN_REAL_OBRIGATORIO',409);
   const ids=await rows(db.prepare(`SELECT id FROM members WHERE (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END)=? LIMIT 2`).bind(session.unit,profileRoute[2]));
   if(ids.length!==1)fail('CADASTRO_NAO_IDENTIFICADO_UNICAMENTE',409);
   const history=await rows(db.prepare('SELECT weight_kg,recorded_at,source FROM pop_fit_weight_history WHERE member_id=? ORDER BY recorded_at DESC,id DESC LIMIT 12').bind(ids[0].id));
   return json({ok:true,member:{member_id:participant.member_id,name:participant.name,age:participant.age,weight:participant.weight,height:participant.height,sex:participant.sex,watch:participant.watch,profileComplete:participant.profileComplete},weight_history:history});
  }
  // Authenticated teacher-device weight update. Never modifies EVO attendance.
  const weightRoute=path.match(/^\/pop-live\/sessions\/(\d+)\/members\/(\d+)\/weight$/);
  if(weightRoute){
   if(request.method!=='POST')fail('METODO_INVALIDO',405);
   const session=await db.prepare('SELECT id,unit,source,status FROM pop_live_sessions WHERE id=?').bind(Number(weightRoute[1])).first();
   if(!session||!['d1','manual'].includes(session.source)||session.status!=='planned')fail('AULA_NAO_ELEGIVEL',409);
   const memberId=weightRoute[2],weight=Number(b.weight),key=String(b.idempotency_key||'');
   if(!Number.isFinite(weight)||weight<20||weight>350||!/^[0-9a-f-]{36}$/i.test(key))fail('PESO_OU_CHAVE_INVALIDA');
   const checked=session.source==='d1' && await db.prepare(`SELECT 1 ok FROM checkin_reservation_snapshots
     WHERE unit=? AND evo_member_id=? AND session_id=(SELECT source_class_id FROM pop_live_sessions WHERE id=?)
     AND activity_date=(SELECT substr(starts_at,1,10) FROM pop_live_sessions WHERE id=?)
     AND checked_in=1 AND removed=0 AND lower(COALESCE(status,'')) NOT IN ('cancelled','canceled','cancelado','cancelada') LIMIT 1`).bind(session.unit,memberId,session.id,session.id).first();

   const members=await rows(db.prepare(`SELECT id FROM members WHERE (CASE WHEN ?='gym' THEN CAST(gym_client_id AS TEXT) ELSE CAST(evo_member_id AS TEXT) END)=? LIMIT 2`).bind(session.unit,memberId));
   if(members.length!==1)fail('CADASTRO_NAO_IDENTIFICADO_UNICAMENTE',409);
   if(!checked){
    const selected=await db.prepare('SELECT 1 FROM pop_live_selected_members WHERE session_id=? AND unit=? AND evo_member_id=? AND member_id=?').bind(session.id,session.unit,memberId,members[0].id).first();
    if(!selected)fail('SELECIONE_ALUNO_ANTES',409);
   }
   const existing=await db.prepare('SELECT member_id,weight_kg,session_id FROM pop_fit_weight_history WHERE idempotency_key=?').bind(key).first();
   if(existing){
    if(existing.member_id!==members[0].id||existing.weight_kg!==weight||existing.session_id!==session.id)fail('CHAVE_JA_UTILIZADA',409);
    return json({ok:true,saved:true,duplicate:true,weight});
   }
   const insert=await db.prepare(`INSERT INTO pop_fit_weight_history(member_id,weight_kg,source,session_id,actor_id,idempotency_key)
     SELECT ?,?,'pop_live_teacher',?,NULL,? WHERE EXISTS (SELECT 1 FROM pop_live_sessions WHERE id=? AND status='planned')
     ON CONFLICT(idempotency_key) DO NOTHING`).bind(members[0].id,weight,session.id,key,session.id).run();
   if(!insert.meta.changes){
    const saved=await db.prepare('SELECT member_id,weight_kg,session_id FROM pop_fit_weight_history WHERE idempotency_key=?').bind(key).first();
    if(!saved)fail('AULA_NAO_ELEGIVEL',409);
    if(saved.member_id!==members[0].id||saved.weight_kg!==weight||saved.session_id!==session.id)fail('CHAVE_JA_UTILIZADA',409);
   }
   return json({ok:true,saved:true,weight});
  }
  const match=path.match(/^\/pop-live\/sessions\/(\d+)(?:\/(participants|start|finish|close|results))?$/);
  if(!match)fail('ROTA_INVALIDA',404);
  const s=await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(Number(match[1])).first();
  if(!s||!['manual','d1'].includes(s.source))fail('SESSAO_NAO_ENCONTRADA',404);
  const action=match[2];
  if(request.method==='GET'){
   if(action==='participants')return json({ok:true,participants:await participants(db,s)});
   if(action==='results')return json({ok:true,status:s.status,results:parse(s.results_json)});
   if(!action)return json({ok:true,session:s});fail('METODO_INVALIDO',405);
  }
  if(request.method!=='POST')fail('METODO_INVALIDO',405);
  // This assignment contract is ready for the authenticated Club Pop check-in adapter.
  // It never creates a check-in or infers a watch from a bike/slot number.
  if(action==='participants'){
   if(s.source==='manual')fail('TESTE_USA_DISPOSITIVOS_DA_UNIDADE',409);
   if(s.status!=='planned')fail('ASSOCIACAO_BLOQUEADA',409);
   const eligible=(await participants(db,s)).find(p=>p.member_id===String(b.member_id));
   if(!eligible)fail('CHECKIN_REAL_OBRIGATORIO',409);
   const d=await db.prepare("SELECT id FROM pop_live_devices WHERE reference_number=? AND active=1 AND device_type='heart_rate' AND ((?='bike' AND unit_bike=1) OR (?='gym' AND unit_gym=1))").bind(String(b.watch),s.unit,s.unit).first();
   if(!d)fail('RELOGIO_NAO_CADASTRADO',404);
   const existing=await db.prepare('SELECT member_id,device_id FROM pop_live_session_devices WHERE session_id=? AND (device_id=? OR member_id=?)').bind(s.id,d.id,String(b.member_id)).first();
   if(existing&&(existing.member_id!==String(b.member_id)||existing.device_id!==d.id))fail('RELOGIO_OU_ALUNO_JA_ASSOCIADO',409);
   await db.prepare('INSERT INTO pop_live_session_devices(session_id,device_id,member_id) VALUES(?,?,?) ON CONFLICT DO NOTHING').bind(s.id,d.id,String(b.member_id)).run();
   return json({ok:true});
  }
  if(!/^[0-9a-f-]{36}$/i.test(b.operation_key||''))fail('CHAVE_INVALIDA');
  if(action==='start'){
   const rules=validateRules(b.rules);
   const storedRules=s.source==='manual'?{...rules,manualMonitors:await manualMonitors(db,s)}:rules;
   const now=Date.now();
   await db.prepare("UPDATE pop_live_sessions SET status='running',rules_json=?,operation_key=?,started_at=?,goal_type=?,goal_value=?,goal_zone=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='planned'").bind(JSON.stringify(storedRules),b.operation_key,now,rules.type==='none'?'ranking':rules.type==='calories'?'collective':'zone',rules.target,rules.zone,s.id).run();
   const current=await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(s.id).first();
   if(current.operation_key!==b.operation_key||JSON.stringify(validateRules(parse(current.rules_json)))!==JSON.stringify(rules))fail('SESSAO_JA_INICIADA',409);
   return json({ok:true,session:current});
  }
  if(s.operation_key!==b.operation_key)fail('SESSAO_EM_OUTRO_APARELHO',409);
  if(action==='finish'){
   if(s.status==='finished'||s.status==='closed')return json({ok:true,session:s});
   if(s.status!=='running')fail('ESTADO_INVALIDO',409);
   const at=Number(b.finished_at);if(!Number.isSafeInteger(at)||at<s.started_at||at>Date.now()+60000||at-s.started_at>14400000)fail('HORARIO_INVALIDO');
   const results=consolidate(b.people,(at-s.started_at)/1000,parse(s.rules_json));
   const assigned=s.source==='manual'?await manualMonitors(db,s):await rows(db.prepare('SELECT a.member_id,d.reference_number watch,d.device_type FROM pop_live_session_devices a JOIN pop_live_devices d ON d.id=a.device_id WHERE session_id=?').bind(s.id));
   for(const p of results.people){
    const device=assigned.find(a=>String(a.member_id)===p.member_id&&String(a.watch)===p.watch);
    if(!device)fail('PARTICIPANTE_NAO_ASSOCIADO',409);
    const type=device.device_type||'heart_rate';
    if(p.sensor_types.some(t=>t!==type&&!(t==='speed'&&type==='cadence')))fail('SENSOR_INCOMPATIVEL',409);
   }
   await db.prepare("UPDATE pop_live_sessions SET status='finished',finished_at=?,results_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running' AND operation_key=?").bind(at,JSON.stringify(results),s.id,b.operation_key).run();
   return json({ok:true,session:await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(s.id).first()});
  }
  if(action==='close'){
   if(s.status==='closed')return json({ok:true,saved:true,session:s});
   if(s.status!=='finished')fail('FINALIZE_ANTES_DE_ENCERRAR',409);
   const results=parse(s.results_json);
   // Apenas alunos reais de sessoes oficiais: testes manuais nao criam presencas.
   const performance=[];
   if(s.source!=='manual')for(const p of results.people||[]){
    const matches=await rows(db.prepare("SELECT id FROM members WHERE (?='gym' AND gym_client_id=?) OR (?='bike' AND evo_member_id=?) LIMIT 2").bind(s.unit,p.member_id,s.unit,p.member_id));
    if(matches.length!==1)fail('CADASTRO_NAO_IDENTIFICADO',409);
    const m=matches[0];
    const t=p.sensor_types||['heart_rate'],hr=t.includes('heart_rate'),cad=t.includes('cadence'),speed=t.includes('speed');
    performance.push(db.prepare(`INSERT INTO pop_live_member_performance
    (session_id,member_id,unit,sensor_types_json,duration_seconds,hr_avg,hr_max,calories_estimated,zones_seconds_json,rpm_avg,rpm_max,speed_avg_kmh,speed_max_kmh,distance_km,metric_quality_json,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id,member_id) DO NOTHING`).bind(s.id,m.id,s.unit,JSON.stringify(t),Math.round(results.duration||0),hr?p.hr_avg??null:null,hr?p.hr_max??null:null,hr?p.kcal:null,hr&&p.zones?JSON.stringify(p.zones):null,cad?p.rpm_avg??null:null,cad?p.rpm_max??null:null,speed?p.speed_avg_kmh??null:null,speed?p.speed_max_kmh??null:null,speed?p.distance_km??null:null,
      JSON.stringify({source:'pop_live',watch:p.watch,weight_kg:p.weight_kg??null,measured_seconds:p.measured_seconds??null}),
      p.measured_seconds!=null&&p.measured_seconds+1<results.duration?'partial':'final'));
   }
   // D1 batch is transactional: every individual result and close marker commit together.
   await db.batch([
    ...performance,
    ...(s.source==='manual'?[]:results.people).map(p=>db.prepare('UPDATE pop_live_session_devices SET result_json=? WHERE session_id=? AND member_id=?').bind(JSON.stringify(p),s.id,p.member_id)),
    db.prepare("UPDATE pop_live_sessions SET status='closed',closed_at=?,close_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='finished' AND operation_key=?").bind(Date.now(),b.operation_key,s.id,b.operation_key)
   ]);
   return json({ok:true,saved:true,session:await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(s.id).first()});
  }
  fail('ROTA_INVALIDA',404);
 }catch(e){if(!e.status)console.error('pop_live_operation_failed',e.message);return json({ok:false,error:e.status?e.message:'POP_LIVE_INDISPONIVEL'},e.status||503)}
}
