-- Read-only query optimization: date-scoped attendance sync queries.
-- Existing (unit,evo_member_id,attendance_date) index cannot efficiently seek by date across all members.
-- This additive index does not change attendance rows or synchronization rules.
CREATE INDEX IF NOT EXISTS idx_evo_attendance_unit_date ON evo_member_attendance(unit, attendance_date);
