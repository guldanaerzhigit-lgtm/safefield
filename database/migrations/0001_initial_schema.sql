PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  parent_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE CHECK (code IN ('EMPLOYEE','SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN')),
  name TEXT NOT NULL, permissions_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(permissions_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, password_hash TEXT, full_name TEXT NOT NULL, phone TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT, department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT,
  supervisor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','DISABLED')),
  locale TEXT NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru','kk','en')), last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE, role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  department_id TEXT REFERENCES departments(id) ON DELETE RESTRICT, invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, accepted_at TEXT, revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS safety_activity_types (
  id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  risk_level TEXT NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  requires_permit INTEGER NOT NULL DEFAULT 0 CHECK (requires_permit IN (0,1)), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);
CREATE TABLE IF NOT EXISTS safety_sessions (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  supervisor_id TEXT REFERENCES users(id) ON DELETE RESTRICT, activity_type_id TEXT NOT NULL REFERENCES safety_activity_types(id) ON DELETE RESTRICT,
  title TEXT NOT NULL, site_address TEXT NOT NULL, site_lat REAL, site_lng REAL, planned_start_at TEXT NOT NULL, planned_end_at TEXT NOT NULL,
  checkin_interval_minutes INTEGER NOT NULL DEFAULT 30 CHECK (checkin_interval_minutes BETWEEN 5 AND 240),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','PAUSED','COMPLETED','CANCELLED','OVERDUE')),
  started_at TEXT, ended_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (site_lat IS NULL OR site_lat BETWEEN -90 AND 90), CHECK (site_lng IS NULL OR site_lng BETWEEN -180 AND 180), CHECK (planned_end_at > planned_start_at)
);
CREATE TABLE IF NOT EXISTS safety_checkins (
  id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES safety_sessions(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, due_at TEXT NOT NULL, responded_at TEXT,
  response TEXT CHECK (response IN ('SAFE','NEED_HELP','NO_RESPONSE')), latitude REAL, longitude REAL,
  source TEXT NOT NULL DEFAULT 'APP' CHECK (source IN ('APP','PUSH','SYSTEM')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS safety_alerts (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES safety_sessions(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('SOS','HIDDEN_SOS','MISSED_CHECKIN','RISK_ZONE','MANUAL','SYSTEM')),
  priority TEXT NOT NULL DEFAULT 'HIGH' CHECK (priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','FALSE_ALARM')),
  message TEXT, latitude REAL, longitude REAL, location_accuracy REAL, assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TEXT, resolved_at TEXT, resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS safety_locations (
  id TEXT PRIMARY KEY, employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  session_id TEXT REFERENCES safety_sessions(id) ON DELETE SET NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90), longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy REAL, recorded_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'GPS' CHECK (source IN ('GPS','NETWORK','MANUAL')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS safety_escalations (
  id TEXT PRIMARY KEY, alert_id TEXT NOT NULL REFERENCES safety_alerts(id) ON DELETE RESTRICT,
  level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
  target_role TEXT NOT NULL CHECK (target_role IN ('SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN')),
  target_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','ACKNOWLEDGED','FAILED','CANCELLED')),
  due_at TEXT NOT NULL, sent_at TEXT, acknowledged_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(alert_id, level)
);
CREATE TABLE IF NOT EXISTS safety_zones (
  id TEXT PRIMARY KEY, department_id TEXT REFERENCES departments(id) ON DELETE CASCADE, name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK (zone_type IN ('SAFE','WARNING','DANGER')),
  center_lat REAL NOT NULL CHECK (center_lat BETWEEN -90 AND 90), center_lng REAL NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
  radius_meters INTEGER NOT NULL CHECK (radius_meters BETWEEN 10 AND 100000), is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS safety_risk_assessments (
  id TEXT PRIMARY KEY, session_id TEXT REFERENCES safety_sessions(id) ON DELETE SET NULL,
  department_id TEXT REFERENCES departments(id) ON DELETE SET NULL, assessed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  factors_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(factors_json)),
  recommendations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(recommendations_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL, alert_id TEXT REFERENCES safety_alerts(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('PUSH','EMAIL','SMS','IN_APP')), template_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED')),
  provider_message_id TEXT, error_message TEXT, sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL,
  resource_type TEXT NOT NULL, resource_id TEXT, department_id TEXT REFERENCES departments(id) ON DELETE SET NULL,
  ip_address TEXT, user_agent TEXT, metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_department_role ON users(department_id, role_id, status);
CREATE INDEX IF NOT EXISTS idx_users_supervisor ON users(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_employee_status ON safety_sessions(employee_id, status, planned_start_at);
CREATE INDEX IF NOT EXISTS idx_sessions_supervisor_status ON safety_sessions(supervisor_id, status);
CREATE INDEX IF NOT EXISTS idx_checkins_due_response ON safety_checkins(responded_at, due_at);
CREATE INDEX IF NOT EXISTS idx_checkins_session_due ON safety_checkins(session_id, due_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_status_priority ON safety_alerts(status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_department_employee ON safety_alerts(employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_employee_time ON safety_locations(employee_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_session_time ON safety_locations(session_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalations_status_due ON safety_escalations(status, due_at);
CREATE INDEX IF NOT EXISTS idx_zones_department_active ON safety_zones(department_id, is_active);
CREATE INDEX IF NOT EXISTS idx_risk_department_created ON safety_risk_assessments(department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notification_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor_created ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource_type, resource_id, created_at DESC);
INSERT OR IGNORE INTO roles (id, code, name, permissions_json) VALUES
('role_employee','EMPLOYEE','Field Employee','["session:read:self","session:create:self","session:update:self","checkin:create:self","sos:create:self","location:create:self"]'),
('role_supervisor','SUPERVISOR','Supervisor','["department:read","users:read:department","sessions:read:department","alerts:read:department","alerts:acknowledge:department"]'),
('role_dispatcher','DISPATCHER','Dispatcher','["alerts:read:all","alerts:acknowledge:all","alerts:assign:all","locations:read:all"]'),
('role_safety_manager','SAFETY_MANAGER','Safety Manager','["safety:read:all","alerts:manage:all","zones:manage:all","analytics:read:all"]'),
('role_admin','ADMIN','Administrator','["*"]');
INSERT OR IGNORE INTO safety_activity_types (id, code, name, risk_level, requires_permit) VALUES
('activity_installation','INSTALLATION','Монтаж / Installation','MEDIUM',0),
('activity_maintenance','MAINTENANCE','Техническое обслуживание','MEDIUM',0),
('activity_height','WORK_AT_HEIGHT','Работа на высоте','HIGH',1),
('activity_electrical','ELECTRICAL','Электротехнические работы','HIGH',1),
('activity_emergency','EMERGENCY_REPAIR','Аварийно-восстановительные работы','HIGH',0),
('activity_other','OTHER','Другое','LOW',0);
