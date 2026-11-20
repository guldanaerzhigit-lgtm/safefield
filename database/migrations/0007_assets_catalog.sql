CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('BASE_STATION','COMMUNICATION_CABINET','TOWER','OTHER')),
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  department_id TEXT REFERENCES departments(id),
  latitude REAL,
  longitude REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','MAINTENANCE','OUT_OF_SERVICE','RETIRED')),
  qr_token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_assets_department ON assets(department_id,status);
CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(asset_type);
ALTER TABLE work_orders ADD COLUMN asset_id TEXT REFERENCES assets(id);
CREATE INDEX IF NOT EXISTS idx_work_orders_asset ON work_orders(asset_id);
INSERT OR IGNORE INTO d1_migrations(name) VALUES('0007_assets_catalog.sql');
