-- Lite paid unlock: payment columns + allow Lite-only rows (nullable Pro fields)
-- Run: psql "$NEON_DATABASE_URL" -f migrations/004_advisory_lite_payment.sql

-- Allow Lite rows without Pro-specific fields
ALTER TABLE advisory_applications
  ALTER COLUMN suburb DROP NOT NULL,
  ALTER COLUMN property_type DROP NOT NULL,
  ALTER COLUMN solar_battery_status DROP NOT NULL,
  ALTER COLUMN bill_range DROP NOT NULL,
  ALTER COLUMN contact_time DROP NOT NULL;

-- Payment and Stripe columns
ALTER TABLE advisory_applications
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amount_paid INTEGER,
  ADD COLUMN IF NOT EXISTS currency TEXT,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_amount INTEGER DEFAULT 0;

-- source already exists (003); ensure we can store 'lite_paid' (TEXT, no check)
COMMENT ON COLUMN advisory_applications.payment_status IS 'unpaid | pending | paid';
COMMENT ON COLUMN advisory_applications.credit_amount IS 'Cents; future Pro credit (e.g. 19900)';

CREATE INDEX IF NOT EXISTS idx_advisory_stripe_session ON advisory_applications (stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
