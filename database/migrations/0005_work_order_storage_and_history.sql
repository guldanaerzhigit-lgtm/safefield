CREATE INDEX IF NOT EXISTS idx_work_order_evidence_object_key ON work_order_evidence(object_key);
CREATE INDEX IF NOT EXISTS idx_audit_resource_history ON audit_logs(resource_type,resource_id,created_at DESC);
