-- MinerU 门户 D1 数据库结构
-- 本地：wrangler d1 execute mineru-portal --local --file=./schema.sql -c workers/mineru-portal/wrangler.toml
-- 线上：wrangler d1 execute mineru-portal --remote --file=./schema.sql -c workers/mineru-portal/wrangler.toml

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  disabled      INTEGER NOT NULL DEFAULT 0,
  daily_limit   INTEGER NOT NULL DEFAULT 20,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  created_by TEXT,
  max_uses   INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER,
  note       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  filename        TEXT NOT NULL,
  size            INTEGER NOT NULL,
  status          TEXT NOT NULL,
  batch_id        TEXT,
  upload_url      TEXT,
  upload_expires_at INTEGER,
  mineru_state    TEXT,
  zip_url         TEXT,
  zip_key         TEXT,
  md_key          TEXT,
  docx_key        TEXT,
  html_key        TEXT,
  error           TEXT,
  progress_json   TEXT,
  ingest_started_at INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_checked    INTEGER NOT NULL DEFAULT 0,
  finished_at     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_created ON tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_invites_created ON invites(created_at DESC);
