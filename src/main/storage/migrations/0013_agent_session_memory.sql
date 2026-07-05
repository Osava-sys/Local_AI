CREATE TABLE IF NOT EXISTS agent_session_facts (
  id          TEXT    PRIMARY KEY NOT NULL,
  run_id      TEXT    NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('target','port','user','vulnerability','process','url','note')),
  key         TEXT    NOT NULL,
  value       TEXT    NOT NULL,
  target      TEXT,
  port        INTEGER,
  protocol    TEXT,
  source      TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_session_facts_run ON agent_session_facts(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_session_facts_kind ON agent_session_facts(run_id, kind);
CREATE INDEX IF NOT EXISTS idx_agent_session_facts_search ON agent_session_facts(run_id, key, value);
