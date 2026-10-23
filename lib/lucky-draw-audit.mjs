// Read-only promotion audit: snapshots never issue/revoke tickets or rewrite history.
export const timestamp=value=>{const s=String(value||'').trim().replace(' ','T');return Date.parse(s&& !/(Z|[+-]\d\d:\d\d)$/i.test(s)?s+'Z':s)};
export const recent=(value,now=Date.now())=>Number.isFinite(timestamp(value))&&timestamp(value)<=now+60000&&now-timestamp(value)<=86400000;
export function contractState(contracts,accepted,day){
 const selected=contracts.filter(c=>accepted.has(String(c.id_membership)));
 if(selected.some(c=>['active','1'].includes(String(c.membership_status||'').toLowerCase())&&(!c.start_date||c.start_date.slice(0,10)<=day)&&(!c.end_date||c.end_date.slice(0,10)>=day)&&(!c.cancel_date||c.cancel_date.slice(0,10)>day)))return true;
 if(selected.some(c=>!['active','1','2','3','expired','canceled','cancelled','inactive','suspended'].includes(String(c.membership_status||'').toLowerCase())))throw Error('STATUS_CONTRATO_NAO_CONFIRMADO');
 return false;
}
const rawOf=a=>{try{return {...JSON.parse(a.raw_json||'{}'),...a}}catch{return a}};
const sessionOf=a=>{a=rawOf(a);return String(a.idMemberSession||a.idSession||a.idActivitySession||a.idActivitieSession||a.id_activity_session||'')};
const dayOf=a=>String(a.attendance_date||a.date||a.dateStart||a.startDate||a.dateTime||'').slice(0,10);
const week=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
export function validateTickets(p,tickets,attendance){
 const unique=new Map();for(const a of attendance){const session=sessionOf(a);if(!session)throw Error('IDENTIDADE_PRESENCA_NAO_CONFIRMADA');unique.set(dayOf(a)+':'+session,a)}
 attendance=[...unique.values()];
 const cfg=p.luckyNumber||{},dates=attendance.map(dayOf);
 if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw Error('DATA_PRESENCA_INVALIDA');
 if((p.requirements||[]).some(r=>r.activityId&&r.activityId!=='*'))throw Error('REGRA_MODALIDADE_EXIGE_CONFERENCIA');
 const validDates=dates.filter(d=>d>=p.start&&d<=p.end),months=new Map(),weeks=new Map();
 for(const d of validDates){months.set(d.slice(0,7),(months.get(d.slice(0,7))||0)+1);const w=week(d),a=weeks.get(w)||[];a.push(d);weeks.set(w,a)}
 const attendanceByDay=new Map();
 for(const a of attendance){const d=dayOf(a);if(!attendanceByDay.has(d))attendanceByDay.set(d,[]);attendanceByDay.get(d).push(a)}
 const counted=new Map(),bySource=new Map();
 const attendanceByDaySession=new Map();
 for(const [day,rows] of attendanceByDay){const bySession=new Map();for(const row of rows)bySession.set(sessionOf(row),row);attendanceByDaySession.set(day,bySession)}
 for(const n of tickets){
  if(n.studio!==p.unit)throw Error('NUMERO_UNIDADE_DIVERGENTE');
  const month=n.reference_month;counted.set(month,(counted.get(month)||0)+1);
  if(Number(cfg.maxNumbers)>0&&counted.get(month)>Number(cfg.maxNumbers))throw Error('NUMEROS_ACIMA_LIMITE');
  let key,allowed;
  if(cfg.generationMode==='constancy'){
   const w=String(n.code).match(/-C-(\d{4}-\d{2}-\d{2})-/)?.[1];
   if(n.origin!=='CONSTANCY'||!w||month!==w.slice(0,7))throw Error('CONSTANCIA_ORIGEM_INVALIDA');
   const ds=weeks.get(w)||[],count=cfg.distinctDays!==false?new Set(ds).size:ds.length;
   const earned=Math.floor(count/Math.max(1,Math.min(7,Number(cfg.weeklyGoal)||3)));
   allowed=(cfg.weeklyOnce!==false?Math.min(1,earned):earned)*Math.max(1,Math.min(100,Number(cfg.weeklyNumbers)||1));key='week:'+w;
  }else if(n.origin==='ATTENDANCE'){
   if(n.attendance_status!=='VALID'||!n.source_ref||!n.occurred_at||n.occurred_at.slice(0,7)!==month)throw Error('PRESENCA_NUMERO_NAO_CONFIRMADA');
   const day=n.occurred_at.slice(0,10);
   const sourceSession=sessionOf({raw_json:n.source_raw});
   const daily=attendanceByDay.get(day)||[];
   const suffix=String(n.source_ref).split(':').at(-1);
   const knownSession=sourceSession||(suffix&&/^\\d+$/.test(suffix)?suffix:'');
   const matches=knownSession?([attendanceByDaySession.get(day)?.get(knownSession)].filter(Boolean)):daily.filter(a=>a.attendance_key===n.source_ref||[p.unit,n.member_id,day,sessionOf(a)].join(':')===n.source_ref);
   // Legacy ':attendance' references do not identify a session. Never guess
   // which class earned a number if several sessions occurred that day.
   const candidates=matches.length?matches:(!knownSession&&suffix==='attendance'?daily:[]);
   if(candidates.length!==1)throw Error('PRESENCA_SESSAO_AMBIGUA_'+p.unit+'_'+n.member_id+'_'+day);
   const matched=candidates[0];
   if(day<p.start||day>p.end||!matched)throw Error('PRESENCA_NUMERO_NAO_CONFIRMADA');
   key='attendance:'+day+':'+sessionOf(matched);allowed=Number(cfg.numbersPerAttendance)||1;
  }else if(n.origin==='BONUS'){
   const goal=(cfg.milestones||[]).find(g=>Number(g.attendance)===Number(n.milestone));
   if(n.bonus_status!=='ACTIVE'||!goal||(months.get(month)||0)<Number(goal.attendance))throw Error('BONUS_NAO_CONFIRMADO');
   key='bonus:'+month+':'+n.milestone;allowed=Number(goal.bonus);
  }else throw Error('ORIGEM_NUMERO_NAO_SUPORTADA');
  bySource.set(key,(bySource.get(key)||0)+1);if(bySource.get(key)>allowed)throw Error('QUANTIDADE_NUMEROS_DIVERGENTE_'+p.unit+'_'+n.member_id+'_'+key);
 }
 const expected=new Map();
 if(cfg.generationMode==='constancy'){
  for(const [w,ds] of weeks){const count=cfg.distinctDays!==false?new Set(ds).size:ds.length,earned=Math.floor(count/Math.max(1,Math.min(7,Number(cfg.weeklyGoal)||3))),n=(cfg.weeklyOnce!==false?Math.min(1,earned):earned)*Math.max(1,Math.min(100,Number(cfg.weeklyNumbers)||1));expected.set(w.slice(0,7),(expected.get(w.slice(0,7))||0)+n)}
 }else for(const [m,n] of months)expected.set(m,n*(Number(cfg.numbersPerAttendance)||1)+(cfg.milestones||[]).filter(g=>n>=Number(g.attendance)).reduce((a,g)=>a+Number(g.bonus),0));
 for(const [m,n] of expected){const target=Number(cfg.maxNumbers)>0?Math.min(n,Number(cfg.maxNumbers)):n;if((counted.get(m)||0)!==target)throw Error('NUMEROS_INCOMPLETOS_OU_DIVERGENTES_'+m)}
 return tickets.length;
}
export async function auditParticipants(db,units,adapters,report,previousRequests=0){
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_audit_snapshots(unit TEXT NOT NULL,evo_id TEXT NOT NULL,kind TEXT NOT NULL,scope TEXT NOT NULL,payload TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,evo_id,kind,scope))").run();
 const jobs=[];
 for(const p of units){
  const row=await db.prepare('SELECT id FROM promotions WHERE slug=?').bind(String(p.id)).first();if(!row)throw Error('PROMOCAO_SEM_REGISTRO_D1_'+p.unit);
  const tickets=(await db.prepare(`SELECT l.*,CAST(m.id AS TEXT) member_id,CAST(CASE WHEN ?='gym' THEN COALESCE(NULLIF(m.gym_client_id,''),(SELECT g.gym_client_id FROM gym_member_links g WHERE g.member_id=m.id AND g.status='ACTIVE' LIMIT 1)) ELSE m.evo_member_id END AS TEXT) evo_id,pa.status attendance_status,pa.source_ref,pa.occurred_at,b.status bonus_status,b.milestone,(SELECT ah.raw_json FROM attendance_history ah WHERE ah.member_id=m.id AND ah.unit=? AND ah.attendance_key=pa.source_ref LIMIT 1) source_raw FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id AND pa.participant_id=pp.id AND pa.promotion_id=l.promotion_id LEFT JOIN promotion_bonus_awards b ON b.id=l.bonus_award_id AND b.participant_id=pp.id AND b.promotion_id=l.promotion_id WHERE l.promotion_id=? AND l.status='ACTIVE' ORDER BY l.id`).bind(p.unit,p.unit,row.id).all()).results||[];
  const count=await db.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND status='ACTIVE'").bind(row.id).first();if(Number(count.n)!==tickets.length)throw Error('NUMEROS_SEM_PARTICIPANTE_CONFIRMADO');
  const groups=new Map();for(const n of tickets){const a=groups.get(n.member_id)||[];a.push(n);groups.set(n.member_id,a)}
  for(const ns of groups.values())jobs.push({p,ns,id:ns[0].evo_id});
 }
 const state={total:jobs.length,checked:0,checkedNumbers:0,evoRequests:previousRequests,percent:0,summary:{}};const pool=[];
 const emit=async(stage,extra={})=>report(stage,{...state,...extra,percent:state.total?Math.floor(state.checked/state.total*100):0});
 const fetchSnapshot=async(p,id,kind,scope,callback)=>{
  const cached=await db.prepare('SELECT payload,checked_at FROM lucky_audit_snapshots WHERE unit=? AND evo_id=? AND kind=? AND scope=?').bind(p.unit,id,kind,scope).first();
  if(cached&&recent(cached.checked_at))return JSON.parse(cached.payload);
  const payload=await callback();
  await db.prepare("INSERT INTO lucky_audit_snapshots(unit,evo_id,kind,scope,payload) VALUES(?,?,?,?,?) ON CONFLICT(unit,evo_id,kind,scope) DO UPDATE SET payload=excluded.payload,checked_at=CURRENT_TIMESTAMP").bind(p.unit,id,kind,scope,JSON.stringify(payload)).run();return payload;
 };
 let cycleRequests=0;
 const request=async(unit,endpoint)=>{
  if(cycleRequests>=10)throw Error('AUDITORIA_CONTINUA_PROXIMO_CICLO');
  const used=await db.prepare("SELECT COUNT(*) n FROM evo_request_log WHERE unit=? AND date(datetime(created_at,'-3 hours'))=date('now','-3 hours')").bind(unit).first();
  if(Number(used?.n)>=100)throw Error('LIMITE_DIARIO_EVO');
  const logged=await db.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) SELECT ?,'draw_audit','GET',?,0,0 WHERE (SELECT COUNT(*) FROM evo_request_log WHERE unit=? AND date(datetime(created_at,'-3 hours'))=date('now','-3 hours'))<100").bind(unit,endpoint,unit).run();
  if(!logged.meta?.changes)throw Error('LIMITE_DIARIO_EVO');
  cycleRequests++;state.evoRequests++;await emit('updating_data',{unit,endpoint});
  return async response=>db.prepare('UPDATE evo_request_log SET status=?,ok=? WHERE id=?').bind(response.status,response.ok?1:0,logged.meta.last_row_id).run();
 };
 await emit('validating_contracts');
 try{for(const {p,ns,id} of jobs){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(p.end||'')||p.end<p.start||Date.parse(p.end+'T23:59:59-03:00')>Date.now())throw Error('PERIODO_PROMOCAO_NAO_ENCERRADO_OU_INVALIDO');
  if(!/^\d+$/.test(String(id||'')))throw Error('IDENTIDADE_UNIDADE_NAO_CONFIRMADA_'+p.unit);
  const mode=p.eligibility?.mode||'any';if(!['any','active_contract'].includes(mode))throw Error('REGRA_ELEGIBILIDADE_NAO_SUPORTADA');
  const master=await db.prepare('SELECT synced_at,raw_json FROM evo_member_master WHERE unit=? AND evo_member_id=?').bind(p.unit,id).first();
  let cs=(await db.prepare('SELECT * FROM evo_member_contracts WHERE unit=? AND evo_member_id=?').bind(p.unit,id).all()).results||[];
  if(!master||!recent(master.synced_at)||(mode==='active_contract'&&(!cs.length||cs.some(c=>!recent(c.synced_at))))){
   const profile=await fetchSnapshot(p,id,'profile','',async()=>{const v=await adapters.profile(id,p.unit,()=>request(p.unit,'/api/v2/members/'+id));if(String(v?.idMember)!==String(id)||!Array.isArray(v.memberships))throw Error('CADASTRO_CONTRATOS_EVO_INCOMPLETOS');return v});
   cs=profile.memberships.map(c=>({id_membership:c.idMembership,membership_status:c.membershipStatus??c.statusMemberMembership??c.status,start_date:c.startDate??c.membershipStart??c.startDateMembership,end_date:c.endDate??c.membershipEnd??c.endDateMembership,cancel_date:c.cancelDate??c.cancellationDate}));
  }
  const accepted=new Set((p.eligibility?.acceptedContracts||[]).map(String));if(mode==='active_contract'&&!accepted.size)throw Error('CONTRATOS_ELEGIVEIS_NAO_CONFIGURADOS');
  const day=new Date(Date.now()-10800000).toISOString().slice(0,10);
  const eligible=mode==='any'||contractState(cs,accepted,day);
  // Audit attendance even for confirmed ineligible contracts: no sync failure becomes exclusion.
  const range=await db.prepare('SELECT synced_at FROM attendance_sync_ranges WHERE member_id=? AND unit=? AND start_date<=? AND end_date>=? ORDER BY synced_at DESC LIMIT 1').bind(ns[0].member_id,p.unit,p.start,p.end).first();
  let attendance;
  if(range&&recent(range.synced_at)&&timestamp(range.synced_at)>=Date.parse(p.end+'T23:59:59-03:00')){attendance=(await db.prepare('SELECT * FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ?').bind(ns[0].member_id,p.unit,p.start,p.end).all()).results||[]}
  else attendance=await fetchSnapshot(p,id,'attendance',p.start+':'+p.end,()=>adapters.attendance(id,p.start,p.end,p.unit,()=>request(p.unit,'/api/v2/activities/member/sessions')));
  validateTickets(p,ns,attendance);
  const summary=state.summary[p.unit]||{registered:0,eligible:0,excluded:0};summary.registered+=ns.length;summary[eligible?'eligible':'excluded']+=ns.length;state.summary[p.unit]=summary;
  if(eligible)for(const n of ns)pool.push({promotionId:String(p.id),unit:p.unit,code:n.code,memberId:n.member_id,evoId:id});
  state.checked++;state.checkedNumbers+=ns.length;await emit('auditing_numbers');
 }}catch(e){await emit('blocked',{error:String(e.message||e)});throw e}
 await emit('audit_completed',{auditCompleted:true});return {pool,summary:state.summary,...state};
}
