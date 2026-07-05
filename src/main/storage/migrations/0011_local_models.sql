CREATE TABLE IF NOT EXISTS local_models (
  id            TEXT    PRIMARY KEY NOT NULL,
  name          TEXT    NOT NULL,
  path          TEXT    NOT NULL UNIQUE,
  filename      TEXT    NOT NULL,
  quantization  TEXT    NOT NULL DEFAULT 'unknown',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  source_url    TEXT,
  is_active     INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_local_models_active ON local_models(is_active);
