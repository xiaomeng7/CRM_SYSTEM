CREATE TYPE "Pos2SelectionDraftStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'CONVERTED', 'ARCHIVED');
CREATE TYPE "Pos2ProposalStatus" AS ENUM ('DRAFT', 'INTERNAL_REVIEW', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

CREATE TABLE "pos2_selection_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_code" TEXT NOT NULL,
  "status" "Pos2SelectionDraftStatus" NOT NULL DEFAULT 'DRAFT',
  "customer_name" TEXT, "customer_email" TEXT, "customer_phone" TEXT, "site_address" TEXT,
  "current_version" INTEGER NOT NULL DEFAULT 0, "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_selection_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos2_selection_draft_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL, "selection_fingerprint" TEXT NOT NULL,
  "customer_snapshot" JSONB NOT NULL, "currency_code" VARCHAR(3) NOT NULL,
  "tax_basis" TEXT NOT NULL, "total" DECIMAL(12,2) NOT NULL, "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos2_selection_draft_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_selection_draft_versions_version_chk" CHECK ("version_number" > 0),
  CONSTRAINT "pos2_selection_draft_versions_total_chk" CHECK ("total" >= 0)
);

CREATE TABLE "pos2_selection_draft_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_version_id" UUID NOT NULL,
  "product_id" UUID NOT NULL, "product_code_snapshot" TEXT NOT NULL,
  "product_name_snapshot" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
  "unit_price" DECIMAL(12,2) NOT NULL, "line_total" DECIMAL(12,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos2_selection_draft_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_selection_draft_lines_quantity_chk" CHECK ("quantity" > 0),
  CONSTRAINT "pos2_selection_draft_lines_prices_chk" CHECK ("unit_price" >= 0 AND "line_total" = "unit_price" * "quantity")
);

CREATE TABLE "pos2_proposals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "proposal_code" TEXT NOT NULL,
  "draft_version_id" UUID NOT NULL, "status" "Pos2ProposalStatus" NOT NULL DEFAULT 'DRAFT',
  "selection_fingerprint" TEXT NOT NULL, "projection_snapshot" JSONB NOT NULL,
  "total" DECIMAL(12,2) NOT NULL, "currency_code" VARCHAR(3) NOT NULL,
  "tax_basis" TEXT NOT NULL, "approved_by" TEXT, "approved_at" TIMESTAMPTZ(6),
  "sent_at" TIMESTAMPTZ(6), "expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_proposals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_proposals_total_chk" CHECK ("total" >= 0),
  CONSTRAINT "pos2_proposals_approval_chk" CHECK (("status" NOT IN ('APPROVED','SENT','ACCEPTED')) OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL)),
  CONSTRAINT "pos2_proposals_sent_chk" CHECK (("status" NOT IN ('SENT','ACCEPTED')) OR "sent_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "pos2_selection_drafts_draft_code_key" ON "pos2_selection_drafts"("draft_code");
CREATE INDEX "pos2_selection_drafts_status_updated_at_idx" ON "pos2_selection_drafts"("status", "updated_at");
CREATE UNIQUE INDEX "pos2_selection_draft_versions_draft_id_version_number_key" ON "pos2_selection_draft_versions"("draft_id", "version_number");
CREATE INDEX "pos2_selection_draft_versions_selection_fingerprint_idx" ON "pos2_selection_draft_versions"("selection_fingerprint");
CREATE UNIQUE INDEX "pos2_selection_draft_lines_draft_version_id_product_id_key" ON "pos2_selection_draft_lines"("draft_version_id", "product_id");
CREATE UNIQUE INDEX "pos2_proposals_proposal_code_key" ON "pos2_proposals"("proposal_code");
CREATE INDEX "pos2_proposals_status_updated_at_idx" ON "pos2_proposals"("status", "updated_at");
CREATE INDEX "pos2_proposals_draft_version_id_idx" ON "pos2_proposals"("draft_version_id");

ALTER TABLE "pos2_selection_draft_versions" ADD CONSTRAINT "pos2_selection_draft_versions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "pos2_selection_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos2_selection_draft_lines" ADD CONSTRAINT "pos2_selection_draft_lines_draft_version_id_fkey" FOREIGN KEY ("draft_version_id") REFERENCES "pos2_selection_draft_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos2_selection_draft_lines" ADD CONSTRAINT "pos2_selection_draft_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos2_proposals" ADD CONSTRAINT "pos2_proposals_draft_version_id_fkey" FOREIGN KEY ("draft_version_id") REFERENCES "pos2_selection_draft_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
