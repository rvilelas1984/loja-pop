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
  if(!Number.isFinite(p.kcal)||p.kcal<0||p.kcal>duration/60*50+1)fail('CALORIAS_INVALIDAS');
  if(!Array.isArray(p.zones)||p.zones.length!==5||p.zones.some(n=>!Number.isFinite(n)||n<0)||p.zones.reduce((a,b)=>a+b,0)>duration+2)fail('TEMPO_INVALIDO');
  return {member_id,watch,kcal:p.kcal,zones:p.zones};
 });
 const rankings=Object.fromEntries(['kcal','z3','z4','z5'].map(key=>[key,people.map(p=>({member_id:p.member_id,watch:p.watch,value:key==='kcal'?p.kcal:p.zones[Number(key[1])-1]})).sort((a,b)=>b.value-a.value||a.member_id.localeCompare(b.member_id))]));
 const total=people.reduce((s,p)=>s+p.kcal,0),progress=rules.type==='calories'?total:rules.type==='zone'?people.reduce((s,p)=>s+p.zones[rules.zone-1],0):0;
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
 COALESCE((SELECT e.weight FROM pop_fit_entries e WHERE e.member_id=m.id AND e.weight>0 ORDER BY e.updated_at DESC,e.rowid DESC LIMIT 1),p.initial_weight) weight
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
   p.height,COALESCE((SELECT e.weight FROM pop_fit_entries e WHERE e.member_id=m.id AND e.weight>0 ORDER BY e.updated_at DESC,e.rowid DESC LIMIT 1),p.initial_weight) weight,
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
   const assigned=s.source==='manual'?await manualMonitors(db,s):await rows(db.prepare('SELECT a.member_id,d.reference_number watch FROM pop_live_session_devices a JOIN pop_live_devices d ON d.id=a.device_id WHERE session_id=?').bind(s.id));
   for(const p of results.people)if(!assigned.some(a=>a.member_id===p.member_id&&a.watch===p.watch))fail('PARTICIPANTE_NAO_ASSOCIADO',409);
   await db.prepare("UPDATE pop_live_sessions SET status='finished',finished_at=?,results_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='running' AND operation_key=?").bind(at,JSON.stringify(results),s.id,b.operation_key).run();
   return json({ok:true,session:await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(s.id).first()});
  }
  if(action==='close'){
   if(s.status==='closed')return json({ok:true,saved:true,session:s});
   if(s.status!=='finished')fail('FINALIZE_ANTES_DE_ENCERRAR',409);
   const results=parse(s.results_json);
   // D1 batch is transactional: every individual result and close marker commit together.
   await db.batch([
    ...(s.source==='manual'?[]:results.people).map(p=>db.prepare('UPDATE pop_live_session_devices SET result_json=? WHERE session_id=? AND member_id=?').bind(JSON.stringify(p),s.id,p.member_id)),
    db.prepare("UPDATE pop_live_sessions SET status='closed',closed_at=?,close_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='finished' AND operation_key=?").bind(Date.now(),b.operation_key,s.id,b.operation_key)
   ]);
   return json({ok:true,saved:true,session:await db.prepare('SELECT * FROM pop_live_sessions WHERE id=?').bind(s.id).first()});
  }
  fail('ROTA_INVALIDA',404);
 }catch(e){if(!e.status)console.error('pop_live_operation_failed',e.message);return json({ok:false,error:e.status?e.message:'POP_LIVE_INDISPONIVEL'},e.status||503)}
}
