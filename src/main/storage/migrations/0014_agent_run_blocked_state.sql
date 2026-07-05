-- Widen the agent_runs.state CHECK to include 'blocked' (run halted because a
-- high-risk action was denied or its approval expired without a decision).
-- Runs after 0013 so the agent_session_facts FK to agent_runs is rebuilt safely
-- (foreign_keys OFF during the table swap, matching the 0010 pattern).
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS agent_runs_new (
  id          TEXT    PRIMARY KEY NOT NULL,
  chat_id     TEXT    REFERENCES chats(id) ON DELETE SET NULL,
  state       TEXT    NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle','planning','awaiting_approval','running','done','error','paused','blocked')),
  model       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO agent_runs_new (id, chat_id, state, model, created_at, updated_at)
SELECT id, chat_id, state, model, created_at, updated_at
FROM agent_runs;

DROP TABLE agent_runs;
ALTER TABLE agent_runs_new RENAME TO agent_runs;

PRAGMA foreign_keys = ON;
