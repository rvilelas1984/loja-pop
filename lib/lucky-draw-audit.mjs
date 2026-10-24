import {drawCandidates,drawAttendance,attendanceSession,ticketSession,rows} from './lucky-draw-data.mjs';
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
const sessionOf=a=>attendanceSession(a);
const dayOf=a=>String(a.attendance_date||a.date||a.dateStart||a.startDate||a.dateTime||'').slice(0,10);
const week=day=>{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10)};
export function validateTickets(p,tickets,attendance){
 const unique=new Map();for(const a of attendance){const session=sessionOf(a);if(!session)throw Error('IDENTIDADE_PRESENCA_NAO_CONFIRMADA');unique.set(dayOf(a)+':'+session,a)}
 attendance=[...unique.values()];
 const cfg=p.luckyNumber||{},dates=attendance.map(dayOf);
 if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d)))throw Error('DATA_PRESENCA_INVALIDA');

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
   key='attendance:'+ticketSession(n,attendance);allowed=Number(cfg.numbersPerAttendance)||1;
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
 for(const m of counted.keys())if(!expected.has(m))expected.set(m,0);
 for(const [m,n] of expected){const target=Number(cfg.maxNumbers)>0?Math.min(n,Number(cfg.maxNumbers)):n;if((counted.get(m)||0)!==target)throw Error('NUMEROS_INCOMPLETOS_OU_DIVERGENTES_'+m)}
 return tickets.length;
}
export async function auditParticipants(db,units,adapters,report,previousRequests=0){
 await db.prepare("CREATE TABLE IF NOT EXISTS lucky_draw_audit_results(promotion_id TEXT NOT NULL,unit TEXT NOT NULL,evo_id TEXT NOT NULL,member_ids TEXT NOT NULL,eligible INTEGER NOT NULL,expected INTEGER NOT NULL,existing INTEGER NOT NULL,details_json TEXT NOT NULL,checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(promotion_id,unit,evo_id))").run();
 const state={total:0,checked:0,checkedNumbers:0,evoRequests:0,percent:0,summary:{}},pool=[],jobs=[];
 for(const p of units){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(p.end||'')||p.end<p.start||Date.parse(p.end+'T23:59:59-03:00')>Date.now())throw Error('PERIODO_PROMOCAO_NAO_ENCERRADO_OU_INVALIDO');
  const promotion=await db.prepare('SELECT id FROM promotions WHERE slug=?').bind(String(p.id)).first();if(!promotion)throw Error('PROMOCAO_SEM_REGISTRO_D1_'+p.unit);
  const tickets=await rows(db,`SELECT l.*,CAST(pp.member_id AS TEXT) member_id,pa.status attendance_status,pa.source_ref,pa.occurred_at,b.status bonus_status,b.milestone,(SELECT ah.raw_json FROM attendance_history ah WHERE ah.attendance_key=pa.source_ref LIMIT 1) source_raw FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id AND pa.participant_id=pp.id AND pa.promotion_id=l.promotion_id LEFT JOIN promotion_bonus_awards b ON b.id=l.bonus_award_id AND b.participant_id=pp.id AND b.promotion_id=l.promotion_id WHERE l.promotion_id=? AND l.status='ACTIVE' ORDER BY l.id`,promotion.id);
  const count=await db.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND status='ACTIVE'").bind(promotion.id).first();if(Number(count.n)!==tickets.length)throw Error('NUMEROS_SEM_PARTICIPANTE_CONFIRMADO');
  const candidates=await drawCandidates(db,p),seen=new Set();
  state.summary[p.unit]={registered:tickets.length,eligible:0,excluded:0,participants:0,expected:0,existing:0};
  for(const c of candidates){const ids=new Set(c.members.map(m=>String(m.id))),ns=tickets.filter(n=>ids.has(n.member_id));for(const n of ns){if(seen.has(n.id))throw Error('NUMERO_ASSOCIADO_A_DUAS_IDENTIDADES');seen.add(n.id)}jobs.push({p,c,ns})}
  // Tickets whose owner has no current eligible identity are explicitly excluded,
  // not silently counted as participants. No issued code is rewritten here.
  state.summary[p.unit].excluded+=tickets.filter(n=>!seen.has(n.id)).length;
 }
 state.total=jobs.length;
 for(const {p,c,ns} of jobs){
  const attendance=c.eligible?await drawAttendance(db,p,c):[],expected=expectedNumbers(p,attendance),summary=state.summary[p.unit];
  const detail={contracts:c.acceptedContracts,attendance:attendance.map(a=>({date:a.attendance_date,session:a.id_activity_session})),months:expected.months,bonus:expected.bonus,reason:c.eligible?null:'CONTRATO_INELEGIVEL'};
  try{if(c.eligible)validateTickets(p,ns,attendance)}catch(e){detail.reason=String(e.message||e)}
  await db.prepare("INSERT INTO lucky_draw_audit_results(promotion_id,unit,evo_id,member_ids,eligible,expected,existing,details_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(promotion_id,unit,evo_id) DO UPDATE SET member_ids=excluded.member_ids,eligible=excluded.eligible,expected=excluded.expected,existing=excluded.existing,details_json=excluded.details_json,checked_at=CURRENT_TIMESTAMP").bind(String(p.id),p.unit,c.evo_member_id,JSON.stringify(c.members.map(m=>m.id)),c.eligible?1:0,expected.total,ns.length,JSON.stringify(detail)).run();
  if(c.eligible&&detail.reason)throw Error(detail.reason+'_'+p.unit+'_'+c.evo_member_id+'_esperados_'+expected.total+'_existentes_'+ns.length);
  if(c.eligible){summary.eligible+=ns.length;summary.expected+=expected.total;summary.existing+=ns.length;if(ns.length)summary.participants++;for(const n of ns)pool.push({promotionId:String(p.id),unit:p.unit,code:n.code,memberId:n.member_id,evoId:c.evo_member_id})}else summary.excluded+=ns.length;
  state.checked++;state.checkedNumbers+=ns.length;state.percent=state.total?Math.floor(state.checked/state.total*100):100;
  if(state.checked%10===0||state.checked===state.total)await report('auditing_numbers',{...state,current:{unit:p.unit,evoId:c.evo_member_id}});
 }
 await report('audit_completed',{...state,auditCompleted:true});return {pool,...state};
}
export function expectedNumbers(p,attendance){
 const cfg=p.luckyNumber||{},months={},weeks=new Map();let bonus=0;
 for(const a of attendance){const day=dayOf(a);if(day<p.start||day>p.end)continue;const month=day.slice(0,7);months[month]=(months[month]||0)+1;const w=week(day),ds=weeks.get(w)||[];ds.push(day);weeks.set(w,ds)}
 const expected={};
 if(cfg.generationMode==='constancy'){for(const [w,ds] of weeks){const n=cfg.distinctDays!==false?new Set(ds).size:ds.length,earned=Math.floor(n/Math.max(1,Math.min(7,Number(cfg.weeklyGoal)||3)));expected[w.slice(0,7)]=(expected[w.slice(0,7)]||0)+(cfg.weeklyOnce!==false?Math.min(1,earned):earned)*Math.max(1,Math.min(100,Number(cfg.weeklyNumbers)||1))}}
 else for(const [m,n] of Object.entries(months)){const b=(cfg.milestones||[]).filter(g=>n>=Number(g.attendance)).reduce((a,g)=>a+Number(g.bonus),0);bonus+=b;expected[m]=n*(Number(cfg.numbersPerAttendance)||1)+b}
 for(const m of Object.keys(expected))if(Number(cfg.maxNumbers)>0)expected[m]=Math.min(expected[m],Number(cfg.maxNumbers));
 return {total:Object.values(expected).reduce((a,b)=>a+b,0),months:expected,bonus};
}
