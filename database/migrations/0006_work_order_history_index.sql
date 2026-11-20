CREATE INDEX IF NOT EXISTS idx_audit_resource_history ON audit_logs(resource_type,resource_id,created_at DESC);
