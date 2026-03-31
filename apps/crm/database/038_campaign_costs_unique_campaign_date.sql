-- One spend row per CRM campaign per calendar day (Google Ads / manual upserts).

DELETE FROM campaign_costs c1
WHERE EXISTS (
  SELECT 1 FROM campaign_costs c2
  WHERE c2.campaign_id = c1.campaign_id
    AND c2.date = c1.date
    AND c2.id < c1.id
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_costs_campaign_date
  ON campaign_costs (campaign_id, date);

COMMENT ON INDEX uq_campaign_costs_campaign_date IS
  'Enables INSERT ... ON CONFLICT (campaign_id, date) DO UPDATE for daily sync.';
