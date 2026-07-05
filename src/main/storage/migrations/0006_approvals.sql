CREATE TABLE IF NOT EXISTS approvals (
  id          TEXT    PRIMARY KEY NOT NULL,
  run_id      TEXT    NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_call   TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  decided_at  TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_approvals_run_id ON approvals(run_id);
