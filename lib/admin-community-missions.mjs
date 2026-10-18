// Read-only administrator overview of student-created missions.
export async function adminCommunityMissions(db,unit,id){
 const where=unit==="club"?"":" AND c.unit=?";
 const params=unit==="club"?[]:[unit];
 const summarySql=`SELECT c.*,m.first_name||' '||COALESCE(m.last_name,'') creator_name,
 (SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='accepted') participants,
 (SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='invited') invited,
 (SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='declined') declined,
 (SELECT COUNT(*) FROM community_challenge_participants p WHERE p.challenge_id=c.id AND p.status='left') left_count,
 (SELECT COUNT(*) FROM community_challenge_participants p JOIN members pm ON pm.id=p.member_id
 WHERE p.challenge_id=c.id AND p.status='accepted' AND EXISTS(
 SELECT 1 FROM evo_member_attendance a WHERE a.unit=c.unit
 AND a.evo_member_id=CAST(CASE WHEN c.unit='gym' THEN pm.gym_client_id ELSE pm.evo_member_id END AS TEXT)
 AND a.attendance_date>=substr(CASE WHEN p.joined_at>c.start_at THEN p.joined_at ELSE c.start_at END,1,10)
 AND a.attendance_date<=substr(c.end_at,1,10))) engaged
 FROM community_challenges c JOIN members m ON m.id=c.creator_member_id WHERE 1=1${where}`;
 if(id){
  const mission=await db.prepare(summarySql+" AND c.id=?").bind(...params,id).first();
  if(!mission)return {ok:false,error:"MISSAO_NAO_ENCONTRADA"};
  const people=(await db.prepare(`SELECT p.status,p.joined_at,m.first_name||' '||COALESCE(m.last_name,'') name,
  CASE WHEN p.status='accepted' AND EXISTS(SELECT 1 FROM evo_member_attendance a
   WHERE a.unit=? AND a.evo_member_id=CAST(CASE WHEN ?='gym' THEN m.gym_client_id ELSE m.evo_member_id END AS TEXT)
   AND a.attendance_date>=substr(CASE WHEN p.joined_at>? THEN p.joined_at ELSE ? END,1,10)
   AND a.attendance_date<=substr(?,1,10)) THEN 1 ELSE 0 END has_attendance
   FROM community_challenge_participants p JOIN members m ON m.id=p.member_id WHERE p.challenge_id=? ORDER BY p.status,m.first_name LIMIT 250`).bind(mission.unit,mission.unit,mission.start_at,mission.start_at,mission.end_at,id).all()).results||[];
  return {ok:true,mission,participants:people};
 }
 const rows=(await db.prepare(summarySql+" ORDER BY c.created_at DESC LIMIT 300").bind(...params).all()).results||[];
 return {ok:true,missions:rows};
}
