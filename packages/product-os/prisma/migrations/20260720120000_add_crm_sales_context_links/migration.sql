-- Additive CRM sales-context references for Better Home Drafts.
-- IDs remain boundary references; CRM owns these entities and validates them.
ALTER TABLE "pos2_draft_customer_links"
  ADD COLUMN "crm_account_id" TEXT,
  ADD COLUMN "crm_asset_id" TEXT,
  ADD COLUMN "crm_opportunity_id" TEXT;

CREATE INDEX "pos2_draft_customer_links_crm_opportunity_id_status_idx"
  ON "pos2_draft_customer_links"("crm_opportunity_id", "status");
