CREATE TABLE telegram_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_telegram_groups_enabled ON telegram_groups(enabled);

-- Seed known production group (editable from admin panel)
INSERT INTO telegram_groups (id, name, chat_id, enabled, created_at, updated_at)
VALUES (
  'tg-group-two-digital-money',
  'TWO DIGITAL - MONEY',
  '-5581029985',
  1,
  datetime('now'),
  datetime('now')
);
