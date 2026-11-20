ALTER TABLE work_order_evidence ADD COLUMN object_key TEXT;
CREATE INDEX IF NOT EXISTS idx_work_order_evidence_object_key ON work_order_evidence(object_key);
INSERT OR IGNORE INTO d1_migrations(name) VALUES('0005_work_order_r2.sql');
