ALTER TABLE work_order_evidence ADD COLUMN storage_key TEXT;
CREATE INDEX IF NOT EXISTS idx_work_order_evidence_storage_key ON work_order_evidence(storage_key);
CREATE TABLE IF NOT EXISTS work_order_events (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_work_order_events_order ON work_order_events(work_order_id,created_at DESC);
