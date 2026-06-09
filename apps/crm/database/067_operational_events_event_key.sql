-- PR7A.2: Event identity — one open row per event_key (detector dedup).

ALTER TABLE operational_events
  ADD COLUMN IF NOT EXISTS event_key VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_events_open_event_key
  ON operational_events (event_key)
  WHERE status = 'open' AND event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_operational_events_event_key
  ON operational_events (event_key)
  WHERE event_key IS NOT NULL;

COMMENT ON COLUMN operational_events.event_key IS 'Stable detector identity, e.g. collections_risk:invoice:<uuid>. Unique while status=open.';
