-- Reuse existing batch/item tables; immutable exported snapshots retain retry history.
CREATE TABLE IF NOT EXISTS club_evo_import_batches (id TEXT PRIMARY KEY,unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),branch_code TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','partial','confirmed','review')),created_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS club_evo_import_items (order_id TEXT PRIMARY KEY,unit TEXT NOT NULL CHECK(unit IN ('bike','gym')),batch_id TEXT NOT NULL REFERENCES club_evo_import_batches(id),item_type TEXT NOT NULL CHECK(item_type IN ('product','service')),item_name TEXT NOT NULL,member_name TEXT NOT NULL,cpf TEXT NOT NULL,value_cents INTEGER NOT NULL CHECK(value_cents>0),sale_date TEXT NOT NULL,receipt_code INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'exported' CHECK(status IN ('exported','confirmed','rejected','review')),return_log TEXT,checked_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
ALTER TABLE club_evo_import_batches ADD COLUMN snapshot_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE club_evo_import_batches ADD COLUMN return_json TEXT NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS club_evo_import_settings(unit TEXT PRIMARY KEY CHECK(unit IN ('bike','gym')),branch_code TEXT NOT NULL,receipts_json TEXT NOT NULL DEFAULT '{"pix":15,"coins":"","mixed":""}',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_evo_import_unit_batch ON club_evo_import_items(unit,batch_id);
-- D1 batch is transactional: racing exports abort as a whole, never leave a partial file.
CREATE TRIGGER IF NOT EXISTS evo_import_retry_guard BEFORE UPDATE ON club_evo_import_items
WHEN NEW.status='exported' AND (OLD.status!='rejected' OR OLD.batch_id=NEW.batch_id)
BEGIN SELECT RAISE(ABORT,'EVO_IMPORT_DUPLICATE'); END;
CREATE TRIGGER IF NOT EXISTS evo_import_order_guard BEFORE INSERT ON club_evo_import_items
WHEN NOT EXISTS(SELECT 1 FROM club_pix_orders o WHERE o.id=NEW.order_id AND o.unit=NEW.unit AND o.item_type=NEW.item_type AND o.status='approved' AND o.amount_cents=NEW.value_cents AND COALESCE(o.original_cents,o.amount_cents)=o.amount_cents+o.discount_cents AND (o.currency_quantity=0 AND o.external_state='none' OR o.currency_quantity>0 AND o.external_state='confirmed'))
 OR EXISTS(SELECT 1 FROM club_fiscal_sale_entries f WHERE f.order_id=NEW.order_id)
 OR EXISTS(SELECT 1 FROM club_evo_product_sales s WHERE s.order_id=NEW.order_id AND (s.state='confirmed' OR s.evo_sale_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'EVO_IMPORT_ORDER_CHANGED'); END;
