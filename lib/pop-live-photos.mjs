// Read-only enrichment: photos remain owned by the existing Club Pop profile.
export async function participantPhotos(db,unit,people,origin){
 const output=people.map(p=>({...p,photoUrl:null}));
 if(!['bike','gym'].includes(unit)||!output.length)return output;
 const eligible=output.filter(p=>!p.temporary&&/^\d+$/.test(String(p.member_id))&&Number(p.member_id)<900000000000);
 for(let start=0;start<eligible.length;start+=40){
  const chunk=eligible.slice(start,start+40);
  const values=chunk.map(()=>'(?)').join(',');
  // Reserved cross-unit participant IDs encode members.id. Ordinary IDs are EVO IDs in the session unit.
  const query=`WITH requested(participant_id) AS (VALUES ${values}), matched AS (
   SELECT r.participant_id,m.id,m.evo_member_id,m.gym_client_id,m.first_name,m.last_name,m.birth_date
   FROM requested r JOIN members m ON m.id=CAST(r.participant_id AS INTEGER)-800000000000
   WHERE CAST(r.participant_id AS INTEGER)>=800000000000
   UNION ALL
   SELECT r.participant_id,m.id,m.evo_member_id,m.gym_client_id,m.first_name,m.last_name,m.birth_date
   FROM requested r JOIN members m ON ${unit==='gym'?'m.gym_client_id':'m.evo_member_id'}=r.participant_id
   WHERE CAST(r.participant_id AS INTEGER)<800000000000
  ), owners AS (
   SELECT m.participant_id,COALESCE(principal.id,m.id) owner_id FROM matched m
   LEFT JOIN members principal ON m.gym_client_id IS NULL AND principal.id<>m.id
    AND principal.gym_client_id=CAST(m.evo_member_id AS TEXT)
    AND (m.birth_date IS NULL OR principal.birth_date IS NULL OR principal.birth_date=m.birth_date)
    AND lower(trim(principal.first_name||' '||principal.last_name))=lower(trim(m.first_name||' '||m.last_name))
  ) SELECT o.participant_id,p.photo_token FROM owners o
   LEFT JOIN club_profile_photos p ON p.member_id=o.owner_id`;
  let records;
  try{records=(await db.prepare(query).bind(...chunk.map(p=>String(p.member_id))).all()).results||[]}
  catch(e){if(/no such table: club_profile_photos/i.test(String(e.message||e)))continue;throw e}
  for(const p of chunk){
   const matches=records.filter(r=>String(r.participant_id)===String(p.member_id));
   // Ambiguous account links never expose another member's photograph.
   if(matches.length!==1||! /^[0-9a-f-]{36}$/i.test(matches[0].photo_token||''))continue;
   p.photoUrl=new URL('/member/profile-photo/image/'+matches[0].photo_token,origin).href;
  }
 }
 return output;
}
