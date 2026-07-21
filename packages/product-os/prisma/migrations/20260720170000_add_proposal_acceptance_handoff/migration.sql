CREATE TYPE "Pos2ProposalDeliveryChannel" AS ENUM ('EMAIL','MANUAL_HANDOFF','OTHER');
CREATE TYPE "Pos2ProposalAcceptanceMethod" AS ENUM ('SIGNED_DOCUMENT','EMAIL_CONFIRMATION','PORTAL','IN_PERSON','OTHER');
CREATE TYPE "Pos2OperationalHandoffStatus" AS ENUM ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED');
CREATE TYPE "Pos2OperationalHandoffOperation" AS ENUM ('CREATE_SERVICEM8_WORK_ORDER');

CREATE TABLE "pos2_proposal_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "proposal_id" UUID NOT NULL,
  "channel" "Pos2ProposalDeliveryChannel" NOT NULL, "recipient" TEXT,
  "evidence_reference" TEXT, "recorded_by_user_id" UUID NOT NULL,
  "delivered_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos2_proposal_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_proposal_deliveries_proposal_fkey" FOREIGN KEY ("proposal_id") REFERENCES "pos2_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos2_proposal_deliveries_recorder_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pos2_proposal_deliveries_proposal_delivered_idx" ON "pos2_proposal_deliveries"("proposal_id","delivered_at");

CREATE TABLE "pos2_proposal_acceptances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "proposal_id" UUID NOT NULL,
  "method" "Pos2ProposalAcceptanceMethod" NOT NULL, "evidence_reference" TEXT NOT NULL,
  "accepted_fingerprint" TEXT NOT NULL, "accepted_total" DECIMAL(12,2) NOT NULL,
  "currency_code" VARCHAR(3) NOT NULL, "accepted_by_name" TEXT NOT NULL,
  "accepted_by_contact" TEXT, "notes" TEXT, "recorded_by_user_id" UUID NOT NULL,
  "accepted_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos2_proposal_acceptances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_proposal_acceptances_proposal_key" UNIQUE ("proposal_id"),
  CONSTRAINT "pos2_proposal_acceptances_total_chk" CHECK ("accepted_total" >= 0),
  CONSTRAINT "pos2_proposal_acceptances_evidence_chk" CHECK (length(trim("evidence_reference")) > 0 AND length(trim("accepted_by_name")) > 0),
  CONSTRAINT "pos2_proposal_acceptances_proposal_fkey" FOREIGN KEY ("proposal_id") REFERENCES "pos2_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos2_proposal_acceptances_recorder_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "pos2_sales_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pos2_proposal_acceptances_accepted_at_idx" ON "pos2_proposal_acceptances"("accepted_at");

CREATE TABLE "pos2_operational_handoffs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "proposal_id" UUID NOT NULL,
  "operation" "Pos2OperationalHandoffOperation" NOT NULL DEFAULT 'CREATE_SERVICEM8_WORK_ORDER',
  "status" "Pos2OperationalHandoffStatus" NOT NULL DEFAULT 'PENDING', "idempotency_key" TEXT NOT NULL,
  "crm_opportunity_id" TEXT NOT NULL, "crm_account_id" TEXT NOT NULL, "crm_contact_id" TEXT NOT NULL, "crm_asset_id" TEXT NOT NULL,
  "servicem8_job_uuid" TEXT, "attempt_count" INTEGER NOT NULL DEFAULT 0, "last_error" TEXT,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processing_at" TIMESTAMPTZ(6), "completed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "pos2_operational_handoffs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos2_operational_handoffs_proposal_key" UNIQUE ("proposal_id"),
  CONSTRAINT "pos2_operational_handoffs_idempotency_key" UNIQUE ("idempotency_key"),
  CONSTRAINT "pos2_operational_handoffs_attempt_chk" CHECK ("attempt_count" >= 0),
  CONSTRAINT "pos2_operational_handoffs_completion_chk" CHECK (("status" <> 'COMPLETED') OR ("servicem8_job_uuid" IS NOT NULL AND "completed_at" IS NOT NULL)),
  CONSTRAINT "pos2_operational_handoffs_proposal_fkey" FOREIGN KEY ("proposal_id") REFERENCES "pos2_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pos2_operational_handoffs_status_requested_idx" ON "pos2_operational_handoffs"("status","requested_at");
