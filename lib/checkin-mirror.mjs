// TV reads the official snapshot; it never refreshes EVO or writes reservations.
export async function assertCheckinSessionDate(db,unit,sessionId,date){
 const session=await db.prepare('SELECT activity_date FROM evo_attendance_sessions WHERE unit=? AND id_activity_session=?').bind(unit,String(sessionId)).first();
 if(session&&session.activity_date!==date)throw Error('DATA_DIVERGENTE_DA_SESSAO');
}
export async function readCheckinMirror(db,unit,date,sessionId){
 if(!['bike','gym'].includes(unit)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d+$/.test(sessionId))throw Error('PARAMETROS_INVALIDOS');
 const session=await db.prepare('SELECT activity_date,start_time,activity_name,instructor_name FROM evo_attendance_sessions WHERE unit=? AND id_activity_session=?').bind(unit,sessionId).first();
 if(!session||session.activity_date!==date)throw Error('SESSAO_NAO_CORRESPONDE_A_DATA');
 const version=await db.prepare('SELECT observed_at FROM checkin_snapshot_versions WHERE unit=? AND session_id=?').bind(unit,sessionId).first();
 if(!version)throw Error('AGUARDANDO_CHECKIN_OFICIAL');
 const rows=(await db.prepare('SELECT slot_number,evo_member_id,member_name,removed,status,checked_in,activity_date FROM checkin_reservation_snapshots WHERE unit=? AND session_id=? ORDER BY slot_number').bind(unit,sessionId).all()).results||[];
 if(rows.some(r=>r.activity_date!==date))throw Error('SNAPSHOT_COM_DATA_DIVERGENTE');
 const layout=await db.prepare('SELECT capacity,rows_json FROM checkin_layouts WHERE unit=? AND lower(activity_name)=lower(?) LIMIT 1').bind(unit,session.activity_name).first();
 return {ok:true,source:'checkin-oficial-d1',unit,requestsUsed:0,observedAt:version.observed_at,layout:layout?{capacity:layout.capacity,rows:JSON.parse(layout.rows_json||'[]')}:undefined,current:{idActivitySession:sessionId,date,dateLabel:date.split('-').reverse().join('/'),startTime:session.start_time,name:session.activity_name,instructor:session.instructor_name,enrollments:rows.map(r=>({idMember:r.evo_member_id,slotNumber:r.slot_number,name:r.member_name,displayName:r.member_name,removed:!!r.removed,status:r.status,checkedIn:!!r.checked_in}))},next:null};
}
