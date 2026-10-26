-- Guard against a changed identity or concurrent repair; abort the batch on mismatch.
SELECT CASE WHEN
 (SELECT COUNT(*) FROM members WHERE id=489 AND evo_member_id=1558222 AND gym_client_id='1498344.0')=1
 AND (SELECT COUNT(*) FROM members WHERE id=778 AND evo_member_id=1498344 AND cpf_hash='evo-placeholder:1498344' AND pin_hash IS NULL)=1
 AND (SELECT COUNT(*) FROM gym_member_links WHERE gym_client_id='1498344' AND member_id=489 AND status='ACTIVE')=1
 AND (SELECT COUNT(DISTINCT json_extract(personal_json,'$.document')) FROM evo_member_master WHERE (unit='bike' AND evo_member_id='1558222') OR (unit='gym' AND evo_member_id='1498344'))=1
 THEN 1 ELSE json('IDENTITY_GUARD_FAILED') END;
UPDATE members SET gym_client_id='1498344',updated_at=CURRENT_TIMESTAMP WHERE id=489;
INSERT INTO evo_member_identity_aliases(unit,legacy_evo_member_id,principal_evo_member_id,merged_by) VALUES('gym','1498344.0','1498344','work-audit-20261026');
INSERT INTO club_settings(key,value) VALUES
 ('attendance_legacy_review:gym:778','{"status":"pending","preserved":78,"source":"file_export_1792287255543.xlsx row 475: 93 aggregate presences","reason":"No dated attendance list or explicit reporting period; overlap not proven"}'),
 ('attendance_baseline_review:bike:1558222','{"status":"pending","preserved":48,"source":"base_unificada_historico_bike_pop_ordenada.xlsx","reason":"Source explicitly provisional; multiple rows for same EVO ID; reporting periods not validated"}');
UPDATE attendance_history SET member_id=489,attendance_key=replace(attendance_key,'gym:778:','gym:489:')
 WHERE member_id=778 AND unit='gym' AND evo_member_id=1498344;
INSERT INTO attendance_history(member_id,evo_member_id,unit,attendance_key,attendance_date,activity_id,activity_name,raw_json)
SELECT 489,CAST(a.evo_member_id AS INTEGER),a.unit,a.unit||':489:'||a.attendance_date||':'||a.id_activity_session,
 a.attendance_date,a.id_activity_session,a.activity_name,
 json_object('attendance_date',a.attendance_date,'start_time',a.start_time,'activity_name',a.activity_name,'id_activity_session',a.id_activity_session,'source','evo_member_attendance')
FROM evo_member_attendance a
WHERE ((a.unit='bike' AND a.evo_member_id='1558222') OR(a.unit='gym' AND a.evo_member_id='1498344'))
 AND NOT EXISTS(SELECT 1 FROM attendance_history h WHERE h.member_id=489 AND h.unit=a.unit AND h.attendance_date=a.attendance_date
 AND (h.attendance_key=a.unit||':489:'||a.attendance_date||':'||a.id_activity_session OR json_extract(h.raw_json,'$.id_activity_session')=a.id_activity_session));
INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json)
VALUES('ADMIN','work-authorized','ELAINE_IDENTITY_REPAIR','members','489','{"duplicatePreserved":778,"backupIds":[596,597,598,599,600],"bikeId":"1558222","gymId":"1498344","legacyPending":78,"bikeBaselinePending":48,"noAttendanceDeleted":true}');
