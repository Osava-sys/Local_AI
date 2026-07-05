-- Append-only sandbox audit trail. One row per intent that reaches the executor.
CREATE TABLE IF NOT EXISTS sandbox_audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          TEXT,
  tool_call_id    TEXT,
  intent_kind     TEXT    NOT NULL,
  summary         TEXT    NOT NULL,
  policy_decision TEXT    NOT NULL,
  status          TEXT    NOT NULL,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_sandbox_audit_created ON sandbox_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sandbox_audit_run ON sandbox_audit_log(run_id);
