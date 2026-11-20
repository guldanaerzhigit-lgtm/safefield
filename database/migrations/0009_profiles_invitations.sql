-- Employee profiles and secure self-service invitations.
ALTER TABLE invitations ADD COLUMN supervisor_id TEXT REFERENCES users(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  safety_briefing_status TEXT NOT NULL DEFAULT 'NOT_RECORDED'
    CHECK (safety_briefing_status IN ('NOT_RECORDED','PENDING','COMPLETED','EXPIRED')),
  safety_briefing_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(invited_by,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email,accepted_at,revoked_at);
INSERT OR IGNORE INTO d1_migrations(name) VALUES('0009_profiles_invitations.sql');
