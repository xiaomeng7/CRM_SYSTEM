-- Migration 062: add review_inspection_id linkage to CRM inspection tables
-- Purpose: map CRM UUID inspections to essential-report EH inspection id.

ALTER TABLE pre_purchase_inspections
  ADD COLUMN IF NOT EXISTS review_inspection_id TEXT;

ALTER TABLE rental_inspections
  ADD COLUMN IF NOT EXISTS review_inspection_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pp_inspections_review_inspection_id
  ON pre_purchase_inspections(review_inspection_id);

CREATE INDEX IF NOT EXISTS idx_rental_inspections_review_inspection_id
  ON rental_inspections(review_inspection_id);
