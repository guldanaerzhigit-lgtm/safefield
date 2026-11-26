PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS safety_incidents (
  id TEXT PRIMARY KEY,
  reported_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('UNSAFE_CONDITION','NEAR_MISS','INJURY','EQUIPMENT','ENVIRONMENT','OTHER')),
  severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','REJECTED')),
  latitude REAL,
  longitude REAL,
  location_accuracy REAL,
  evidence_key TEXT,
  evidence_name TEXT,
  evidence_type TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS safety_incident_history (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES safety_incidents(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  note TEXT,
  from_status TEXT,
  to_status TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_department_status ON safety_incidents(department_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON safety_incidents(reported_by,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_history ON safety_incident_history(incident_id,created_at);
