-- Live D1 projection: automatically follows the existing session/contract syncs.
-- Does not mutate the original payloads, attendance, stars or official balances.
CREATE VIEW IF NOT EXISTS evo_session_contract_links AS
WITH candidates AS (
 SELECT s.unit,s.evo_member_id,s.id_activity_session,c.contract_key,
 CASE WHEN CAST(json_extract(s.raw_json,'$.idMemberMembership') AS TEXT)=c.id_member_membership
 THEN 1 ELSE 0 END AS direct
 FROM evo_member_attendance_states s JOIN evo_member_contracts c
 ON c.unit=s.unit AND c.evo_member_id=s.evo_member_id
 WHERE CAST(json_extract(s.raw_json,'$.idMemberMembership') AS TEXT)=c.id_member_membership
 OR (json_extract(s.raw_json,'$.idMemberMembership') IS NULL
 AND substr(c.start_date,1,10)<=s.attendance_date AND substr(c.end_date,1,10)>=s.attendance_date
 AND (c.cancel_date IS NULL OR substr(c.cancel_date,1,10)>s.attendance_date)
 AND COALESCE(c.is_additional,0)=0 AND COALESCE(json_extract(c.raw_json,'$.flAdditionalMembership'),0)=0)
), counts AS (
 SELECT unit,evo_member_id,id_activity_session,COUNT(*) candidate_count,SUM(direct) direct_count,
 MIN(contract_key) candidate_contract_key FROM candidates GROUP BY unit,evo_member_id,id_activity_session
)
SELECT s.unit,s.evo_member_id,s.id_activity_session,s.attendance_date,s.start_time,s.activity_name,
 s.evo_status,s.justified_absence,s.raw_json,s.synced_at,
 CASE WHEN n.direct_count=1 AND n.candidate_count=1 THEN n.candidate_contract_key END AS contract_key,
 n.candidate_contract_key,COALESCE(n.candidate_count,0) candidate_count,
 CASE WHEN n.direct_count=1 AND n.candidate_count=1 THEN 'confirmed'
 WHEN n.candidate_count>1 THEN 'ambiguous' WHEN n.candidate_count=1 THEN 'probable_unique' ELSE 'unmatched' END confidence,
 CASE WHEN n.direct_count=1 THEN 'raw.idMemberMembership' ELSE 'date_window_only' END evidence
FROM evo_member_attendance_states s LEFT JOIN counts n
 ON n.unit=s.unit AND n.evo_member_id=s.evo_member_id AND n.id_activity_session=s.id_activity_session;
