-- Customer Scoring Engine 2.0: multidimensional scores and segment per contact.
-- Requires: contacts, accounts, jobs, invoices, quotes, activities.

CREATE TABLE IF NOT EXISTS customer_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  value_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  conversion_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  urgency_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  relationship_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  total_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  segment VARCHAR(30) NOT NULL DEFAULT 'Cold',
  last_contact_days INT,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (contact_id)
);

COMMENT ON TABLE customer_scores IS 'Customer Scoring Engine 2.0: value, conversion, urgency, relationship, total_score, segment (Hot/Warm/Cold/Dormant/HighValueDormant).';
COMMENT ON COLUMN customer_scores.value_score IS '0-100: lifetime_spend, number_of_jobs, average_job_value.';
COMMENT ON COLUMN customer_scores.conversion_score IS '0-100: replied_sms_count, quote_accept_rate, last_interaction_days.';
COMMENT ON COLUMN customer_scores.urgency_score IS '0-100: open_quotes, recent_jobs, last_contact_days.';
COMMENT ON COLUMN customer_scores.relationship_score IS '0-100: years_as_customer, complaint_count, review_score.';
COMMENT ON COLUMN customer_scores.segment IS 'Hot | Warm | Cold | Dormant | HighValueDormant.';
COMMENT ON COLUMN customer_scores.last_contact_days IS 'Days since last activity (for segment logic).';

CREATE INDEX IF NOT EXISTS idx_customer_scores_contact_id ON customer_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_customer_scores_segment ON customer_scores(segment);
CREATE INDEX IF NOT EXISTS idx_customer_scores_total_score ON customer_scores(total_score DESC);
CREATE INDEX IF NOT EXISTS idx_customer_scores_calculated_at ON customer_scores(calculated_at);

DROP TRIGGER IF EXISTS update_customer_scores_updated_at ON customer_scores;
CREATE TRIGGER update_customer_scores_updated_at
  BEFORE UPDATE ON customer_scores
  FOR EACH ROW EXECUTE PROCEDURE update_domain_updated_at();
