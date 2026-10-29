-- Preserve the exact affected rows before restoring the dates from the session catalog.
CREATE TABLE IF NOT EXISTS checkin_tv_date_backup_20261029 AS
SELECT r.* FROM checkin_reservation_snapshots r JOIN evo_attendance_sessions s ON s.unit=r.unit AND s.id_activity_session=r.session_id
WHERE r.unit='bike' AND r.activity_date='2026-10-29' AND r.session_id IN ('19457238','19457260','19457262') AND r.activity_date<>s.activity_date;
UPDATE checkin_reservation_snapshots SET activity_date=(SELECT s.activity_date FROM evo_attendance_sessions s WHERE s.unit=checkin_reservation_snapshots.unit AND s.id_activity_session=checkin_reservation_snapshots.session_id)
WHERE unit='bike' AND activity_date='2026-10-29' AND session_id IN ('19457238','19457260','19457262') AND EXISTS(SELECT 1 FROM checkin_tv_date_backup_20261029 b WHERE b.unit=checkin_reservation_snapshots.unit AND b.session_id=checkin_reservation_snapshots.session_id AND b.slot_number=checkin_reservation_snapshots.slot_number);
