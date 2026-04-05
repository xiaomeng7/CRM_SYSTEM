-- Inspector referral fee payouts (V1: fixed AUD per paid invoice by product_line).

CREATE TABLE IF NOT EXISTS inspector_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspector_id UUID NOT NULL REFERENCES inspectors(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  product_line VARCHAR(32) NOT NULL CHECK (product_line IN ('pre_purchase', 'rental', 'energy')),
  paid_orders_count INTEGER NOT NULL DEFAULT 0 CHECK (paid_orders_count >= 0),
  payout_amount_aud NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (payout_amount_aud >= 0),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes TEXT,
  source_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inspector_payouts_inspector ON inspector_payouts (inspector_id);
CREATE INDEX IF NOT EXISTS idx_inspector_payouts_period ON inspector_payouts (period_start DESC, period_end DESC);

COMMENT ON TABLE inspector_payouts IS 'Per-inspector settlement slice: one row per product_line per generation batch; invoice-level dedup via inspector_payout_invoice_lines.';

-- One invoice can only be allocated to one payout line ever (no double referral fee).
CREATE TABLE IF NOT EXISTS inspector_payout_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES inspector_payouts(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_line VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inspector_payout_invoice_lines_invoice_key UNIQUE (invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_inspector_payout_lines_payout ON inspector_payout_invoice_lines (payout_id);
