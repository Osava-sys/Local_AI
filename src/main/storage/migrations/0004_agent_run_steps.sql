CREATE TABLE IF NOT EXISTS agent_run_steps (
  id          TEXT    PRIMARY KEY NOT NULL,
  run_id      TEXT    NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('thought','action','observation')),
  content     TEXT    NOT NULL,
  tool_call   TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_steps_run_id ON agent_run_steps(run_id);
