CREATE TABLE IF NOT EXISTS legacy_member_snapshots (
  room TEXT NOT NULL,
  uid TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Người học',
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak INTEGER NOT NULL DEFAULT 0,
  week TEXT NOT NULL DEFAULT '',
  xp_week INTEGER NOT NULL DEFAULT 0,
  days_week INTEGER NOT NULL DEFAULT 0,
  min_week INTEGER NOT NULL DEFAULT 0,
  prev_week TEXT NOT NULL DEFAULT '',
  xp_prev_week INTEGER NOT NULL DEFAULT 0,
  days_prev_week INTEGER NOT NULL DEFAULT 0,
  min_prev_week INTEGER NOT NULL DEFAULT 0,
  prev_week_has_data INTEGER NOT NULL DEFAULT 0,
  source_t INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT NOT NULL DEFAULT '{}',
  imported_at_ms INTEGER NOT NULL,
  imported_by_uid TEXT NOT NULL,
  PRIMARY KEY (room, uid)
);
CREATE INDEX IF NOT EXISTS idx_legacy_member_snapshots_room_xp ON legacy_member_snapshots(room, xp_week DESC, xp DESC);
