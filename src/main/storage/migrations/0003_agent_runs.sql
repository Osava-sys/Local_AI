CREATE TABLE IF NOT EXISTS agent_runs (
  id          TEXT    PRIMARY KEY NOT NULL,
  chat_id     TEXT    REFERENCES chats(id) ON DELETE SET NULL,
  state       TEXT    NOT NULL DEFAULT 'idle'
    CHECK (state IN ('idle','planning','awaiting_approval','running','done','error','paused')),
  model       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
