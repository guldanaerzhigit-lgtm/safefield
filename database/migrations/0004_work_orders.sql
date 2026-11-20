PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS work_orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  site_address TEXT NOT NULL,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  assigned_to TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_at TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ACCEPTED','IN_PROGRESS','REVIEW','COMPLETED','RETURNED','CANCELLED')),
  accepted_at TEXT,
  started_at TEXT,
  submitted_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS work_order_checkpoints (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  site_address TEXT,
  latitude REAL,
  longitude REAL,
  radius_meters INTEGER NOT NULL DEFAULT 150 CHECK (radius_meters BETWEEN 10 AND 2000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS work_order_checkpoint_scans (
  id TEXT PRIMARY KEY,
  checkpoint_id TEXT NOT NULL REFERENCES work_order_checkpoints(id) ON DELETE RESTRICT,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  scanned_at TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'VERIFIED' CHECK (result IN ('VERIFIED','LOCATION_MISMATCH')),
  UNIQUE(checkpoint_id, work_order_id),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS work_order_evidence (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('BEFORE','AFTER','OTHER')),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  photo_data TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy REAL,
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS idx_work_orders_assignee_status ON work_orders(assigned_to,status,due_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_department_status ON work_orders(department_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_checkpoint_code ON work_order_checkpoints(code);
CREATE INDEX IF NOT EXISTS idx_work_order_evidence_order ON work_order_evidence(work_order_id,created_at);
