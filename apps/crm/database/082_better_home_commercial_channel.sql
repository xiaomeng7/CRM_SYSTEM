-- Better Home commercial channel and installation-property context.
-- Additive, nullable for legacy Opportunities, and safe to run repeatedly.

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS asset_id UUID,
  ADD COLUMN IF NOT EXISTS commercial_channel VARCHAR(40);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_opportunities_asset_id') THEN
    ALTER TABLE opportunities
      ADD CONSTRAINT fk_opportunities_asset_id
      FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_opportunities_commercial_channel') THEN
    ALTER TABLE opportunities
      ADD CONSTRAINT chk_opportunities_commercial_channel
      CHECK (commercial_channel IS NULL OR commercial_channel IN ('SERVICEM8_QUOTE', 'BETTER_HOME_PROPOSAL'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_asset_id
  ON opportunities(asset_id) WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_commercial_channel
  ON opportunities(commercial_channel) WHERE commercial_channel IS NOT NULL;

COMMENT ON COLUMN opportunities.asset_id IS
  'CRM installation property/site for this Opportunity.';
COMMENT ON COLUMN opportunities.commercial_channel IS
  'Single commercial master: SERVICEM8_QUOTE or BETTER_HOME_PROPOSAL. NULL is permitted for legacy records until the next quoting action.';
