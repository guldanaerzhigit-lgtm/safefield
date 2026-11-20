-- Smart Geofence: durable event history and per-employee zone state.
CREATE TABLE IF NOT EXISTS geofence_zone_states (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  zone_id TEXT NOT NULL REFERENCES safety_zones(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK(stage IN ('OUTSIDE','APPROACH_500','APPROACH_200','APPROACH_50','INSIDE')),
  distance_meters INTEGER NOT NULL,
  last_lat REAL NOT NULL,
  last_lng REAL NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(employee_id, zone_id)
);
CREATE TABLE IF NOT EXISTS geofence_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  zone_id TEXT NOT NULL REFERENCES safety_zones(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('APPROACH_500','APPROACH_200','APPROACH_50','ENTERED','EXITED')),
  distance_meters INTEGER NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  accuracy REAL,
  alert_id TEXT REFERENCES safety_alerts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_geofence_events_employee ON geofence_events(employee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_events_zone ON geofence_events(zone_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_geofence_states_employee ON geofence_zone_states(employee_id,stage);
INSERT OR IGNORE INTO d1_migrations(name) VALUES('0008_smart_geofence.sql');
