// Contract metrics remain the EVO snapshot. Session lists require an explicit link.
const parse=v=>{try{return JSON.parse(v||'{}')}catch{return {}}};
export function isFutureReservation(row, now=new Date()) {
 const raw=parse(row.raw_json);
 if(raw.isFinalized!==false||raw.removed===true||raw.suspended===true||raw.cancelDate||raw.cancelled===true||raw.canceled===true||raw.falta===true||raw.faltaJustificada===true)return false;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(row.attendance_date)||!/^\d{2}:\d{2}/.test(row.start_time||''))return false;
 return Date.parse(row.attendance_date+'T'+row.start_time.slice(0,5)+':00-03:00')>now.getTime();
}
export function projectContractSessions(contracts,links,now=new Date()) {
 return contracts.map(m=>{
  const id=String(m.idMemberMembership??'');
  const rows=links.filter(r=>id&&r.confidence==='confirmed'&&String(r.contract_key)===id&&isFutureReservation(r,now));
  const unique=[...new Map(rows.map(r=>[String(r.id_activity_session),r])).values()];
  return {...m,contractReservations:unique.map(r=>({id:String(r.id_activity_session),date:r.attendance_date,time:r.start_time,activity:r.activity_name,instructor:parse(r.raw_json).instructor||r.instructor_name||null,evidence:r.evidence})),sessionLinkStatus:'available',sessionLinkPartial:true};
 });
}
export async function attachContractSessions(db,unit,id,data) {
 const result=await db.prepare('SELECT raw_json FROM evo_member_contracts WHERE unit=? AND evo_member_id=? ORDER BY start_date DESC,contract_key DESC').bind(unit,String(id)).all();
 const contracts=(result.results||[]).map(r=>parse(r.raw_json));
 // Prefer the same canonical contract snapshot for Bike and Gym.
 if(!data.member||typeof data.member!=='object'||Array.isArray(data.member))data.member={};
 if(contracts.length)data.member.memberships=contracts;
 try {
  const links=await db.prepare('SELECT l.*,a.instructor_name FROM evo_session_contract_links l LEFT JOIN evo_attendance_sessions a ON a.unit=l.unit AND a.id_activity_session=l.id_activity_session WHERE l.unit=? AND l.evo_member_id=?').bind(unit,String(id)).all();
  data.member.memberships=projectContractSessions(data.member.memberships||[],links.results||[]);
  data.contractSessionDiagnostics={source:'d1',confirmed:(links.results||[]).filter(x=>x.confidence==='confirmed').length,ambiguous:(links.results||[]).filter(x=>x.confidence==='ambiguous').length,probable:(links.results||[]).filter(x=>x.confidence==='probable_unique').length};
 }catch(error){
  // A pending migration cannot take down the student dashboard or imply zero reservations.
  data.member.memberships=(data.member.memberships||[]).map(m=>({...m,contractReservations:[],sessionLinkStatus:'unavailable'}));
  console.warn('SESSION_CONTRACT_LINKS_UNAVAILABLE');
 }
 delete data.futureReservations;
}
