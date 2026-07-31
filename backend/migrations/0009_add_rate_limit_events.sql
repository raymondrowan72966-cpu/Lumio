-- Rate limiting events for password reset requests.
-- Keyed by an opaque string (e.g. 'ip:<addr>').
-- Records are append-only; old rows are left in place and filtered
-- by created_at window at query time.  Purging stale rows is a
-- future operational concern (out of scope for this sprint).
CREATE TABLE rate_limit_events (
  id         TEXT    PRIMARY KEY,
  key        TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rate_limit_events_key_time ON rate_limit_events (key, created_at);
