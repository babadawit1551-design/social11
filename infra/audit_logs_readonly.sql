-- Enforce append-only invariant on audit_logs at the DB level.
-- The application role (smas_app) may INSERT but never UPDATE or DELETE rows.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM smas_app;
