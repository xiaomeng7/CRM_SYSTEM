-- Log of campaign action plan executions (manual or future UI) for cooldown rules.
-- GET /api/dashboard/campaign-action-plans skips campaigns with a row in the last 3 days.

CREATE TABLE IF NOT EXISTS campaign_action_plan_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_key TEXT NOT NULL,
  action VARCHAR(100) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_cap_exec_campaign_recorded
  ON campaign_action_plan_executions (campaign_key, recorded_at DESC);

COMMENT ON TABLE campaign_action_plan_executions IS
  'When an operator (or future workflow) applies a plan, insert a row; engine skips same campaign_key for 3 days.';

-- Example (manual):
-- INSERT INTO campaign_action_plan_executions (campaign_key, action, notes, created_by)
-- VALUES ('id:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'increase_budget', 'Applied in Ads UI', 'owner');
