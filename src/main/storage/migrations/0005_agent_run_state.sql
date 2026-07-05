-- Persists the last known state snapshot for an agent run (one row per run).
CREATE TABLE IF NOT EXISTS agent_run_state (
  run_id      TEXT    PRIMARY KEY NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  snapshot    TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
