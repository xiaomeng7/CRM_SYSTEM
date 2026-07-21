CREATE TYPE "Pos2SalesRole" AS ENUM ('SALES','MANAGER','ADMIN');
CREATE TYPE "Pos2SalesUserStatus" AS ENUM ('INVITED','ACTIVE','SUSPENDED','ARCHIVED');
CREATE TYPE "Pos2CustomerLinkStatus" AS ENUM ('PENDING_REVIEW','CONFIRMED','REJECTED');
CREATE TYPE "Pos2CustomerMatchMethod" AS ENUM ('EXPLICIT_ID','EMAIL_EXACT','PHONE_EXACT','MANUAL','NEW_CUSTOMER');

CREATE TABLE "pos2_sales_users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "email" TEXT NOT NULL,
  "display_name" TEXT NOT NULL, "role" "Pos2SalesRole" NOT NULL DEFAULT 'SALES',
  "status" "Pos2SalesUserStatus" NOT NULL DEFAULT 'INVITED', "auth_provider" TEXT,
  "external_subject" TEXT, "last_login_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_sales_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_sales_users_email_lower_chk" CHECK ("email" = lower("email"))
);

CREATE TABLE "pos2_draft_customer_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_id" UUID NOT NULL,
  "crm_contact_id" TEXT, "status" "Pos2CustomerLinkStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "match_method" "Pos2CustomerMatchMethod", "candidate_snapshot" JSONB,
  "confirmed_by_user_id" UUID, "confirmed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_draft_customer_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_draft_customer_links_confirmation_chk" CHECK (("status" <> 'CONFIRMED') OR ("crm_contact_id" IS NOT NULL AND "confirmed_by_user_id" IS NOT NULL AND "confirmed_at" IS NOT NULL))
);

ALTER TABLE "pos2_selection_drafts" ADD COLUMN "owner_user_id" UUID;
ALTER TABLE "pos2_selection_draft_versions" ADD COLUMN "actor_user_id" UUID;
ALTER TABLE "pos2_proposals" ADD COLUMN "approved_by_user_id" UUID;

CREATE UNIQUE INDEX "pos2_sales_users_email_key" ON "pos2_sales_users"("email");
CREATE UNIQUE INDEX "pos2_sales_users_external_subject_key" ON "pos2_sales_users"("external_subject");
CREATE INDEX "pos2_sales_users_status_role_idx" ON "pos2_sales_users"("status","role");
CREATE UNIQUE INDEX "pos2_draft_customer_links_draft_id_key" ON "pos2_draft_customer_links"("draft_id");
CREATE INDEX "pos2_draft_customer_links_crm_contact_id_status_idx" ON "pos2_draft_customer_links"("crm_contact_id","status");
CREATE INDEX "pos2_selection_drafts_owner_user_id_idx" ON "pos2_selection_drafts"("owner_user_id");

ALTER TABLE "pos2_selection_drafts" ADD CONSTRAINT "pos2_selection_drafts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos2_selection_draft_versions" ADD CONSTRAINT "pos2_selection_draft_versions_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos2_proposals" ADD CONSTRAINT "pos2_proposals_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos2_draft_customer_links" ADD CONSTRAINT "pos2_draft_customer_links_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "pos2_selection_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos2_draft_customer_links" ADD CONSTRAINT "pos2_draft_customer_links_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
