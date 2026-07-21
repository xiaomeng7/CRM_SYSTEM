-- CreateEnum
CREATE TYPE "Pos2ProductKind" AS ENUM ('FOUNDATION', 'COLLECTION', 'EXPERIENCE', 'ADDON', 'STANDALONE');

-- CreateEnum
CREATE TYPE "Pos2CommercialRole" AS ENUM ('STANDARD', 'PACK', 'BONUS');

-- CreateEnum
CREATE TYPE "Pos2LifecycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'FROZEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Pos2RelationshipType" AS ENUM ('PREREQUISITE', 'COMPATIBLE_EXPERIENCE', 'RECOMMENDED_NEXT_PRODUCT', 'BONUS_PREREQUISITE', 'BONUS_UNLOCK', 'DEPENDENCY', 'PRESENTATION_CTA');

-- CreateEnum
CREATE TYPE "Pos2RequirementLogic" AS ENUM ('AND', 'OR');

-- CreateEnum
CREATE TYPE "Pos2ContentKind" AS ENUM ('HERO', 'SUBTITLE', 'STORY_TITLE', 'STORY_BODY', 'FRONT_MOMENT_TITLE', 'FRONT_MOMENT_CAPTION', 'PROBLEM', 'BETTER_HOME_RESPONSE', 'CUSTOMER_EXPERIENCE_COPY', 'INSTALLATION_ASSUMPTION_CUSTOMER', 'FOOTER', 'ADDON_EXPERIENCE_PROMISE');

-- CreateEnum
CREATE TYPE "Pos2ContentSide" AS ENUM ('FRONT', 'BACK', 'NA');

-- CreateEnum
CREATE TYPE "Pos2AssumptionLayer" AS ENUM ('CUSTOMER', 'TECHNICAL');

-- CreateEnum
CREATE TYPE "Pos2TaxBasis" AS ENUM ('GST_INCLUSIVE', 'GST_EXCLUSIVE', 'GST_FREE');

-- CreateEnum
CREATE TYPE "Pos2PriceDisplayMode" AS ENUM ('EXACT', 'FROM', 'CONTACT');

-- CreateEnum
CREATE TYPE "Pos2PriceFulfilmentMode" AS ENUM ('INSTALLED', 'SUPPLY_ONLY');

-- CreateEnum
CREATE TYPE "Pos2PublishStatus" AS ENUM ('DRAFT', 'APPROVED', 'NOT_APPROVED_FOR_PUBLISH', 'RETIRED');

-- CreateEnum
CREATE TYPE "Pos2ThemeScope" AS ENUM ('GLOBAL', 'CHANNEL', 'PRODUCT');

-- CreateEnum
CREATE TYPE "Pos2InclusionType" AS ENUM ('STANDARD', 'OPTIONAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "Pos2SupportKind" AS ENUM ('BOM_ITEM', 'RULE', 'NON_HARDWARE');

-- CreateEnum
CREATE TYPE "Pos2ReleaseComponentKind" AS ENUM ('PRODUCT_VERSION', 'BOM_VERSION', 'LABOUR_VERSION', 'PRICE', 'CONTENT_ENTRY', 'AUTOMATION', 'THEME', 'LAYOUT', 'ASSET');

-- CreateEnum
CREATE TYPE "Pos2ImportMode" AS ENUM ('DRY_RUN', 'APPLY');

-- CreateEnum
CREATE TYPE "Pos2IssueStatus" AS ENUM ('OPEN', 'NEEDS_SOURCE', 'NEEDS_PRODUCT_OWNER', 'RESOLVED', 'DEFERRED', 'NOT_A_CONFLICT');

-- CreateEnum
CREATE TYPE "Pos2AliasResolutionKind" AS ENUM ('PRODUCT', 'INCLUDED_BENEFIT', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "pos2_products" (
    "id" UUID NOT NULL,
    "product_code" TEXT NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "product_kind" "Pos2ProductKind" NOT NULL,
    "commercial_role" "Pos2CommercialRole" NOT NULL DEFAULT 'STANDARD',
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "parent_product_id" UUID,
    "coverage" TEXT,
    "requires_foundation" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "pos2_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_aliases" (
    "id" UUID NOT NULL,
    "alias_code" TEXT NOT NULL,
    "alias_system" TEXT NOT NULL,
    "resolution_kind" "Pos2AliasResolutionKind" NOT NULL,
    "canonical_product_id" UUID,
    "included_benefit_code" TEXT,
    "source_label" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_included_benefits" (
    "id" UUID NOT NULL,
    "benefit_code" TEXT NOT NULL,
    "host_product_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "quote_shows_zero_value" BOOLEAN NOT NULL DEFAULT true,
    "show_on_configurator" BOOLEAN NOT NULL DEFAULT true,
    "show_on_a4" BOOLEAN NOT NULL DEFAULT true,
    "unlock_relationship_id" UUID,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_included_benefits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_versions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "supersedes_version_id" UUID,
    "change_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_releases" (
    "id" UUID NOT NULL,
    "release_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "released_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_release_components" (
    "id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "component_kind" "Pos2ReleaseComponentKind" NOT NULL,
    "component_id" UUID NOT NULL,
    "product_id" UUID,
    "product_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_release_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_addon_profiles" (
    "product_id" UUID NOT NULL,
    "extends_capability_id" UUID NOT NULL,
    "expands_sku_id" UUID,
    "standard_scope_unit" TEXT,
    "experience_promise_key" TEXT,
    "creates_new_room" BOOLEAN NOT NULL DEFAULT false,
    "creates_new_experience" BOOLEAN NOT NULL DEFAULT false,
    "max_quantity" DECIMAL(12,3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_addon_profiles_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "pos2_addon_parent_eligibility" (
    "id" UUID NOT NULL,
    "addon_product_id" UUID NOT NULL,
    "parent_product_id" UUID NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_addon_parent_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_featured_addons" (
    "id" UUID NOT NULL,
    "parent_product_id" UUID NOT NULL,
    "addon_product_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_featured_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_installation_assumptions" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "assumption_code" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "assumption_text" TEXT NOT NULL,
    "layer" "Pos2AssumptionLayer" NOT NULL DEFAULT 'CUSTOMER',
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version_label" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_installation_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_capabilities" (
    "id" UUID NOT NULL,
    "capability_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_capabilities" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "included_qty" DECIMAL(12,3),
    "unit_code" TEXT,
    "customer_layer" TEXT,
    "notes" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_capability_support_links" (
    "id" UUID NOT NULL,
    "product_capability_inclusion_id" UUID NOT NULL,
    "support_kind" "Pos2SupportKind" NOT NULL,
    "bom_item_id" UUID,
    "rule_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_capability_support_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_relationships" (
    "id" UUID NOT NULL,
    "relationship_code" TEXT NOT NULL,
    "from_product_id" UUID NOT NULL,
    "to_product_id" UUID,
    "relationship_type" "Pos2RelationshipType" NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_relationship_requirement_groups" (
    "id" UUID NOT NULL,
    "relationship_id" UUID NOT NULL,
    "group_code" TEXT NOT NULL,
    "logic" "Pos2RequirementLogic" NOT NULL DEFAULT 'AND',
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_relationship_requirement_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_relationship_requirements" (
    "id" UUID NOT NULL,
    "requirement_group_id" UUID NOT NULL,
    "required_product_id" UUID NOT NULL,
    "min_qty" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_relationship_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_experiences" (
    "id" UUID NOT NULL,
    "experience_code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "canonical_title" TEXT NOT NULL,
    "canonical_description" TEXT,
    "sequence" INTEGER NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "linked_capability_id" UUID,
    "linked_automation_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_experience_presentation_mappings" (
    "id" UUID NOT NULL,
    "mapping_code" TEXT NOT NULL,
    "experience_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "side" "Pos2ContentSide" NOT NULL DEFAULT 'BACK',
    "locale" TEXT NOT NULL DEFAULT 'en-AU',
    "display_title" TEXT NOT NULL,
    "customer_description" TEXT,
    "sort_order" INTEGER NOT NULL,
    "grouping" TEXT,
    "visibility" BOOLEAN NOT NULL DEFAULT true,
    "linked_automation_id" UUID,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "version_label" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_experience_presentation_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_scope_groups" (
    "id" UUID NOT NULL,
    "group_code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_scope_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_scope_items" (
    "id" UUID NOT NULL,
    "item_code" TEXT NOT NULL,
    "scope_group_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "standard_scope_unit" TEXT,
    "qty" DECIMAL(12,3),
    "label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_scope_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_equipment_skus" (
    "id" UUID NOT NULL,
    "sku_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "supplier" TEXT,
    "unit_cost_ex_gst" DECIMAL(12,2),
    "currency_code" TEXT NOT NULL DEFAULT 'AUD',
    "protocol" TEXT,
    "technical_notes" TEXT,
    "technician_instructions" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_equipment_skus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_bom_versions" (
    "id" UUID NOT NULL,
    "bom_version_code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_bom_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_bom_items" (
    "id" UUID NOT NULL,
    "bom_version_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unit_code" TEXT,
    "included_type" "Pos2InclusionType" NOT NULL DEFAULT 'STANDARD',
    "installation_notes" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_labour_library" (
    "id" UUID NOT NULL,
    "labour_code" TEXT NOT NULL,
    "labour_item" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "category" TEXT,
    "notes" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_labour_library_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_labour_versions" (
    "id" UUID NOT NULL,
    "labour_version_code" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "version_label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_labour_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_labour_items" (
    "id" UUID NOT NULL,
    "labour_version_id" UUID NOT NULL,
    "labour_library_id" UUID NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_labour_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_rule_definitions" (
    "id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "product_id" UUID,
    "rule_key" TEXT NOT NULL,
    "rule_value" TEXT NOT NULL,
    "severity" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "version_label" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_rule_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_automation_definitions" (
    "id" UUID NOT NULL,
    "automation_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger_type" TEXT,
    "boundary_notes" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "version_label" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_automation_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_automations" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_product_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_automation_triggers" (
    "id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "trigger_type" TEXT NOT NULL,
    "expression" TEXT,
    "params" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_automation_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_automation_conditions" (
    "id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "condition_type" TEXT NOT NULL,
    "expression" TEXT,
    "params" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_automation_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_automation_actions" (
    "id" UUID NOT NULL,
    "automation_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "action_type" TEXT NOT NULL,
    "expression" TEXT,
    "params" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_automation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_price_books" (
    "id" UUID NOT NULL,
    "price_book_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL DEFAULT 'AUD',
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_price_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_prices" (
    "id" UUID NOT NULL,
    "price_code" TEXT NOT NULL,
    "price_book_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "amount" DECIMAL(12,2),
    "currency_code" TEXT NOT NULL DEFAULT 'AUD',
    "tax_basis" "Pos2TaxBasis" NOT NULL,
    "display_mode" "Pos2PriceDisplayMode" NOT NULL,
    "fulfilment_mode" "Pos2PriceFulfilmentMode" NOT NULL,
    "scope_basis" TEXT,
    "subject_to_installation_assumptions" BOOLEAN NOT NULL DEFAULT true,
    "installation_included" BOOLEAN NOT NULL DEFAULT true,
    "customer_visible" BOOLEAN NOT NULL DEFAULT true,
    "commercial_notes" TEXT,
    "exception_meta" JSONB,
    "version_label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "effective_from" TIMESTAMPTZ(6),
    "effective_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_content_entries" (
    "id" UUID NOT NULL,
    "content_key" TEXT NOT NULL,
    "content_kind" "Pos2ContentKind" NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-AU',
    "title" TEXT,
    "value" TEXT,
    "language_layer" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "version_label" TEXT NOT NULL,
    "fact_reference_kind" TEXT,
    "fact_reference_id" UUID,
    "source_provenance_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_content_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_content_placements" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "content_entry_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "side" "Pos2ContentSide" NOT NULL DEFAULT 'NA',
    "sort_order" INTEGER NOT NULL DEFAULT 1,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_product_content_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_image_assets" (
    "id" UUID NOT NULL,
    "asset_code" TEXT NOT NULL,
    "storage_uri" TEXT NOT NULL,
    "media_type" TEXT,
    "alt_text_default" TEXT,
    "rights_notes" TEXT,
    "source_meta" JSONB,
    "publish_status" "Pos2PublishStatus" NOT NULL DEFAULT 'NOT_APPROVED_FOR_PUBLISH',
    "approval_status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "version_label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_image_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_image_crops" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "surface" TEXT NOT NULL,
    "focal_x" DECIMAL(8,4),
    "focal_y" DECIMAL(8,4),
    "crop_box" JSONB,
    "version_label" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_image_crops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_product_image_links" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "crop_id" UUID,
    "channel" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_product_image_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_themes" (
    "id" UUID NOT NULL,
    "theme_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme_scope" "Pos2ThemeScope" NOT NULL,
    "channel_code" TEXT,
    "product_id" UUID,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_theme_tokens" (
    "id" UUID NOT NULL,
    "theme_id" UUID NOT NULL,
    "token_key" TEXT NOT NULL,
    "token_value" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_theme_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_layout_templates" (
    "id" UUID NOT NULL,
    "template_code" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_layout_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_layout_configs" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "product_id" UUID,
    "surface" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "version_label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_layout_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_document_template_versions" (
    "id" UUID NOT NULL,
    "template_code" TEXT NOT NULL,
    "version_label" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "notes" TEXT,
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_footer_configs" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "content_entry_id" UUID,
    "product_os_release_code" TEXT NOT NULL,
    "document_template_version_id" UUID,
    "channel" TEXT NOT NULL DEFAULT 'a4',
    "status" "Pos2LifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_footer_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_source_snapshots" (
    "id" UUID NOT NULL,
    "snapshot_code" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "source_kind" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "pos2_source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_import_batches" (
    "id" UUID NOT NULL,
    "batch_code" TEXT NOT NULL,
    "source_snapshot_id" UUID,
    "mode" "Pos2ImportMode" NOT NULL DEFAULT 'DRY_RUN',
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "stats" JSONB,
    "notes" TEXT,

    CONSTRAINT "pos2_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_source_provenance" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "source_sheet" TEXT,
    "source_row_ref" TEXT,
    "source_stable_id" TEXT,
    "transformation" TEXT,
    "entity_type" TEXT,
    "entity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_source_provenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_validation_runs" (
    "id" UUID NOT NULL,
    "run_code" TEXT NOT NULL,
    "release_id" UUID,
    "import_batch_id" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL,
    "summary" JSONB,

    CONSTRAINT "pos2_validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_validation_results" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "rule_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "message" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "provenance" JSONB,
    "payload" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_validation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_migration_issues" (
    "id" UUID NOT NULL,
    "issue_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "product_code" TEXT,
    "category" TEXT NOT NULL,
    "source_a" TEXT,
    "exact_value_a" TEXT,
    "source_b" TEXT,
    "exact_value_b" TEXT,
    "product_fact_affected" TEXT,
    "downstream_systems" TEXT,
    "recommended_resolution" TEXT,
    "status" "Pos2IssueStatus" NOT NULL DEFAULT 'OPEN',
    "decision" TEXT,
    "decision_date" DATE,
    "decision_reference" TEXT,
    "migration_impact" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pos2_migration_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos2_audit_log" (
    "id" UUID NOT NULL,
    "actor" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before_json" JSONB,
    "after_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos2_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos2_products_product_code_key" ON "pos2_products"("product_code");

-- CreateIndex
CREATE INDEX "pos2_products_product_kind_commercial_role_status_idx" ON "pos2_products"("product_kind", "commercial_role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_products_canonical_name_product_kind_key" ON "pos2_products"("canonical_name", "product_kind");

-- CreateIndex
CREATE INDEX "pos2_product_aliases_resolution_kind_idx" ON "pos2_product_aliases"("resolution_kind");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_aliases_alias_code_alias_system_key" ON "pos2_product_aliases"("alias_code", "alias_system");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_included_benefits_benefit_code_key" ON "pos2_included_benefits"("benefit_code");

-- CreateIndex
CREATE INDEX "pos2_included_benefits_host_product_id_status_idx" ON "pos2_included_benefits"("host_product_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_versions_product_id_version_label_key" ON "pos2_product_versions"("product_id", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_releases_release_code_key" ON "pos2_releases"("release_code");

-- CreateIndex
CREATE INDEX "pos2_release_components_release_id_idx" ON "pos2_release_components"("release_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_release_components_release_id_component_kind_component_key" ON "pos2_release_components"("release_id", "component_kind", "component_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_addon_parent_eligibility_addon_product_id_parent_produ_key" ON "pos2_addon_parent_eligibility"("addon_product_id", "parent_product_id");

-- CreateIndex
CREATE INDEX "pos2_product_featured_addons_parent_product_id_channel_surf_idx" ON "pos2_product_featured_addons"("parent_product_id", "channel", "surface", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_featured_addons_parent_product_id_addon_produc_key" ON "pos2_product_featured_addons"("parent_product_id", "addon_product_id", "channel", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_installation_assumptions_product_id_assumption_code_key" ON "pos2_installation_assumptions"("product_id", "assumption_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_installation_assumptions_product_id_sequence_key" ON "pos2_installation_assumptions"("product_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_capabilities_capability_code_key" ON "pos2_capabilities"("capability_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_capabilities_product_id_capability_id_key" ON "pos2_product_capabilities"("product_id", "capability_id");

-- CreateIndex
CREATE INDEX "pos2_capability_support_links_product_capability_inclusion__idx" ON "pos2_capability_support_links"("product_capability_inclusion_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_relationships_relationship_code_key" ON "pos2_product_relationships"("relationship_code");

-- CreateIndex
CREATE INDEX "pos2_product_relationships_from_product_id_relationship_typ_idx" ON "pos2_product_relationships"("from_product_id", "relationship_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_relationships_from_product_id_to_product_id_re_key" ON "pos2_product_relationships"("from_product_id", "to_product_id", "relationship_type");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_relationship_requirement_groups_relationship_id_group__key" ON "pos2_relationship_requirement_groups"("relationship_id", "group_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_relationship_requirements_requirement_group_id_require_key" ON "pos2_relationship_requirements"("requirement_group_id", "required_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_experiences_experience_code_key" ON "pos2_experiences"("experience_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_experiences_product_id_sequence_key" ON "pos2_experiences"("product_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_experience_presentation_mappings_mapping_code_key" ON "pos2_experience_presentation_mappings"("mapping_code");

-- CreateIndex
CREATE INDEX "pos2_experience_presentation_mappings_channel_surface_statu_idx" ON "pos2_experience_presentation_mappings"("channel", "surface", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_experience_presentation_mappings_experience_id_channel_key" ON "pos2_experience_presentation_mappings"("experience_id", "channel", "surface", "side", "locale", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_scope_groups_product_id_group_code_key" ON "pos2_scope_groups"("product_id", "group_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_scope_groups_product_id_sequence_key" ON "pos2_scope_groups"("product_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_scope_items_scope_group_id_item_code_key" ON "pos2_scope_items"("scope_group_id", "item_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_scope_items_scope_group_id_sequence_key" ON "pos2_scope_items"("scope_group_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_equipment_skus_sku_code_key" ON "pos2_equipment_skus"("sku_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_bom_versions_bom_version_code_key" ON "pos2_bom_versions"("bom_version_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_bom_versions_product_id_version_label_key" ON "pos2_bom_versions"("product_id", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_bom_items_bom_version_id_sku_id_key" ON "pos2_bom_items"("bom_version_id", "sku_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_labour_library_labour_code_key" ON "pos2_labour_library"("labour_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_labour_versions_labour_version_code_key" ON "pos2_labour_versions"("labour_version_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_labour_versions_product_id_version_label_key" ON "pos2_labour_versions"("product_id", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_labour_items_labour_version_id_labour_library_id_key" ON "pos2_labour_items"("labour_version_id", "labour_library_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_rule_definitions_rule_code_key" ON "pos2_rule_definitions"("rule_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_rule_definitions_product_id_rule_key_key" ON "pos2_rule_definitions"("product_id", "rule_key");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_automation_definitions_automation_code_key" ON "pos2_automation_definitions"("automation_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_automations_product_id_automation_id_key" ON "pos2_product_automations"("product_id", "automation_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_automation_triggers_automation_id_sequence_key" ON "pos2_automation_triggers"("automation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_automation_conditions_automation_id_sequence_key" ON "pos2_automation_conditions"("automation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_automation_actions_automation_id_sequence_key" ON "pos2_automation_actions"("automation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_price_books_price_book_code_key" ON "pos2_price_books"("price_book_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_prices_price_code_key" ON "pos2_product_prices"("price_code");

-- CreateIndex
CREATE INDEX "pos2_product_prices_product_id_status_customer_visible_idx" ON "pos2_product_prices"("product_id", "status", "customer_visible");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_prices_price_book_id_product_id_currency_code__key" ON "pos2_product_prices"("price_book_id", "product_id", "currency_code", "fulfilment_mode", "tax_basis", "version_label");

-- CreateIndex
CREATE INDEX "pos2_content_entries_content_kind_status_idx" ON "pos2_content_entries"("content_kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_content_entries_content_key_locale_version_label_key" ON "pos2_content_entries"("content_key", "locale", "version_label");

-- CreateIndex
CREATE INDEX "pos2_product_content_placements_product_id_channel_surface_idx" ON "pos2_product_content_placements"("product_id", "channel", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_content_placements_product_id_content_entry_id_key" ON "pos2_product_content_placements"("product_id", "content_entry_id", "channel", "surface", "side", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_image_assets_asset_code_key" ON "pos2_image_assets"("asset_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_image_crops_asset_id_surface_version_label_key" ON "pos2_image_crops"("asset_id", "surface", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_product_image_links_product_id_asset_id_channel_surfac_key" ON "pos2_product_image_links"("product_id", "asset_id", "channel", "surface", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_themes_theme_code_key" ON "pos2_themes"("theme_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_theme_tokens_theme_id_token_key_key" ON "pos2_theme_tokens"("theme_id", "token_key");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_layout_templates_template_code_key" ON "pos2_layout_templates"("template_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_layout_configs_template_id_product_id_surface_version__key" ON "pos2_layout_configs"("template_id", "product_id", "surface", "version_label");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_document_template_versions_template_code_version_label_key" ON "pos2_document_template_versions"("template_code", "version_label", "surface");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_footer_configs_product_id_channel_product_os_release_c_key" ON "pos2_footer_configs"("product_id", "channel", "product_os_release_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_source_snapshots_snapshot_code_key" ON "pos2_source_snapshots"("snapshot_code");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_import_batches_batch_code_key" ON "pos2_import_batches"("batch_code");

-- CreateIndex
CREATE INDEX "pos2_source_provenance_import_batch_id_entity_type_idx" ON "pos2_source_provenance"("import_batch_id", "entity_type");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_validation_runs_run_code_key" ON "pos2_validation_runs"("run_code");

-- CreateIndex
CREATE INDEX "pos2_validation_results_run_id_rule_code_severity_idx" ON "pos2_validation_results"("run_id", "rule_code", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "pos2_migration_issues_issue_code_key" ON "pos2_migration_issues"("issue_code");

-- CreateIndex
CREATE INDEX "pos2_migration_issues_status_severity_idx" ON "pos2_migration_issues"("status", "severity");

-- CreateIndex
CREATE INDEX "pos2_audit_log_entity_type_entity_id_created_at_idx" ON "pos2_audit_log"("entity_type", "entity_id", "created_at");

-- AddForeignKey
ALTER TABLE "pos2_products" ADD CONSTRAINT "pos2_products_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "pos2_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_aliases" ADD CONSTRAINT "pos2_product_aliases_canonical_product_id_fkey" FOREIGN KEY ("canonical_product_id") REFERENCES "pos2_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_aliases" ADD CONSTRAINT "pos2_product_aliases_included_benefit_code_fkey" FOREIGN KEY ("included_benefit_code") REFERENCES "pos2_included_benefits"("benefit_code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_included_benefits" ADD CONSTRAINT "pos2_included_benefits_host_product_id_fkey" FOREIGN KEY ("host_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_included_benefits" ADD CONSTRAINT "pos2_included_benefits_unlock_relationship_id_fkey" FOREIGN KEY ("unlock_relationship_id") REFERENCES "pos2_product_relationships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_versions" ADD CONSTRAINT "pos2_product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_versions" ADD CONSTRAINT "pos2_product_versions_supersedes_version_id_fkey" FOREIGN KEY ("supersedes_version_id") REFERENCES "pos2_product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_release_components" ADD CONSTRAINT "pos2_release_components_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "pos2_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_release_components" ADD CONSTRAINT "pos2_release_components_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "pos2_product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_addon_profiles" ADD CONSTRAINT "pos2_addon_profiles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_addon_profiles" ADD CONSTRAINT "pos2_addon_profiles_extends_capability_id_fkey" FOREIGN KEY ("extends_capability_id") REFERENCES "pos2_capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_addon_profiles" ADD CONSTRAINT "pos2_addon_profiles_expands_sku_id_fkey" FOREIGN KEY ("expands_sku_id") REFERENCES "pos2_equipment_skus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_addon_parent_eligibility" ADD CONSTRAINT "pos2_addon_parent_eligibility_addon_product_id_fkey" FOREIGN KEY ("addon_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_addon_parent_eligibility" ADD CONSTRAINT "pos2_addon_parent_eligibility_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_featured_addons" ADD CONSTRAINT "pos2_product_featured_addons_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_featured_addons" ADD CONSTRAINT "pos2_product_featured_addons_addon_product_id_fkey" FOREIGN KEY ("addon_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_installation_assumptions" ADD CONSTRAINT "pos2_installation_assumptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_capabilities" ADD CONSTRAINT "pos2_product_capabilities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_capabilities" ADD CONSTRAINT "pos2_product_capabilities_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "pos2_capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_capability_support_links" ADD CONSTRAINT "pos2_capability_support_links_product_capability_inclusion_fkey" FOREIGN KEY ("product_capability_inclusion_id") REFERENCES "pos2_product_capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_capability_support_links" ADD CONSTRAINT "pos2_capability_support_links_bom_item_id_fkey" FOREIGN KEY ("bom_item_id") REFERENCES "pos2_bom_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_capability_support_links" ADD CONSTRAINT "pos2_capability_support_links_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "pos2_rule_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_relationships" ADD CONSTRAINT "pos2_product_relationships_from_product_id_fkey" FOREIGN KEY ("from_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_relationships" ADD CONSTRAINT "pos2_product_relationships_to_product_id_fkey" FOREIGN KEY ("to_product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_relationship_requirement_groups" ADD CONSTRAINT "pos2_relationship_requirement_groups_relationship_id_fkey" FOREIGN KEY ("relationship_id") REFERENCES "pos2_product_relationships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_relationship_requirements" ADD CONSTRAINT "pos2_relationship_requirements_requirement_group_id_fkey" FOREIGN KEY ("requirement_group_id") REFERENCES "pos2_relationship_requirement_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_relationship_requirements" ADD CONSTRAINT "pos2_relationship_requirements_required_product_id_fkey" FOREIGN KEY ("required_product_id") REFERENCES "pos2_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_experiences" ADD CONSTRAINT "pos2_experiences_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_experiences" ADD CONSTRAINT "pos2_experiences_linked_capability_id_fkey" FOREIGN KEY ("linked_capability_id") REFERENCES "pos2_capabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_experiences" ADD CONSTRAINT "pos2_experiences_linked_automation_id_fkey" FOREIGN KEY ("linked_automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_experience_presentation_mappings" ADD CONSTRAINT "pos2_experience_presentation_mappings_experience_id_fkey" FOREIGN KEY ("experience_id") REFERENCES "pos2_experiences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_experience_presentation_mappings" ADD CONSTRAINT "pos2_experience_presentation_mappings_linked_automation_id_fkey" FOREIGN KEY ("linked_automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_scope_groups" ADD CONSTRAINT "pos2_scope_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_scope_items" ADD CONSTRAINT "pos2_scope_items_scope_group_id_fkey" FOREIGN KEY ("scope_group_id") REFERENCES "pos2_scope_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_scope_items" ADD CONSTRAINT "pos2_scope_items_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "pos2_capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_bom_versions" ADD CONSTRAINT "pos2_bom_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_bom_items" ADD CONSTRAINT "pos2_bom_items_bom_version_id_fkey" FOREIGN KEY ("bom_version_id") REFERENCES "pos2_bom_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_bom_items" ADD CONSTRAINT "pos2_bom_items_sku_id_fkey" FOREIGN KEY ("sku_id") REFERENCES "pos2_equipment_skus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_labour_versions" ADD CONSTRAINT "pos2_labour_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_labour_items" ADD CONSTRAINT "pos2_labour_items_labour_version_id_fkey" FOREIGN KEY ("labour_version_id") REFERENCES "pos2_labour_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_labour_items" ADD CONSTRAINT "pos2_labour_items_labour_library_id_fkey" FOREIGN KEY ("labour_library_id") REFERENCES "pos2_labour_library"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_rule_definitions" ADD CONSTRAINT "pos2_rule_definitions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_automations" ADD CONSTRAINT "pos2_product_automations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_automations" ADD CONSTRAINT "pos2_product_automations_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_automation_triggers" ADD CONSTRAINT "pos2_automation_triggers_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_automation_conditions" ADD CONSTRAINT "pos2_automation_conditions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_automation_actions" ADD CONSTRAINT "pos2_automation_actions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "pos2_automation_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_prices" ADD CONSTRAINT "pos2_product_prices_price_book_id_fkey" FOREIGN KEY ("price_book_id") REFERENCES "pos2_price_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_prices" ADD CONSTRAINT "pos2_product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_content_entries" ADD CONSTRAINT "pos2_content_entries_source_provenance_id_fkey" FOREIGN KEY ("source_provenance_id") REFERENCES "pos2_source_provenance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_content_placements" ADD CONSTRAINT "pos2_product_content_placements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_content_placements" ADD CONSTRAINT "pos2_product_content_placements_content_entry_id_fkey" FOREIGN KEY ("content_entry_id") REFERENCES "pos2_content_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_image_crops" ADD CONSTRAINT "pos2_image_crops_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "pos2_image_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_image_links" ADD CONSTRAINT "pos2_product_image_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_image_links" ADD CONSTRAINT "pos2_product_image_links_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "pos2_image_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_product_image_links" ADD CONSTRAINT "pos2_product_image_links_crop_id_fkey" FOREIGN KEY ("crop_id") REFERENCES "pos2_image_crops"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_themes" ADD CONSTRAINT "pos2_themes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_theme_tokens" ADD CONSTRAINT "pos2_theme_tokens_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "pos2_themes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_layout_configs" ADD CONSTRAINT "pos2_layout_configs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "pos2_layout_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_layout_configs" ADD CONSTRAINT "pos2_layout_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_footer_configs" ADD CONSTRAINT "pos2_footer_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pos2_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_footer_configs" ADD CONSTRAINT "pos2_footer_configs_content_entry_id_fkey" FOREIGN KEY ("content_entry_id") REFERENCES "pos2_content_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_footer_configs" ADD CONSTRAINT "pos2_footer_configs_document_template_version_id_fkey" FOREIGN KEY ("document_template_version_id") REFERENCES "pos2_document_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_import_batches" ADD CONSTRAINT "pos2_import_batches_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "pos2_source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_source_provenance" ADD CONSTRAINT "pos2_source_provenance_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "pos2_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_validation_runs" ADD CONSTRAINT "pos2_validation_runs_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "pos2_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_validation_runs" ADD CONSTRAINT "pos2_validation_runs_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "pos2_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos2_validation_results" ADD CONSTRAINT "pos2_validation_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "pos2_validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Phase 3A.1 / DEC-013 supplemental constraints (unapplied; refreshed in-place)
-- Protection Bonus is NOT a product row. EXPERIENCE+BONUS removed from product CHECK.
-- Approach A: PostgreSQL exclusion + CHECKs for price integrity (requires btree_gist)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "pos2_addon_profiles"
  ADD CONSTRAINT "pos2_addon_profiles_no_new_room_chk"
  CHECK ("creates_new_room" = false);

ALTER TABLE "pos2_addon_profiles"
  ADD CONSTRAINT "pos2_addon_profiles_no_new_experience_chk"
  CHECK ("creates_new_experience" = false);

ALTER TABLE "pos2_bom_items"
  ADD CONSTRAINT "pos2_bom_items_qty_positive_chk"
  CHECK ("qty" > 0);

ALTER TABLE "pos2_labour_items"
  ADD CONSTRAINT "pos2_labour_items_qty_positive_chk"
  CHECK ("qty" > 0);

ALTER TABLE "pos2_product_relationships"
  ADD CONSTRAINT "pos2_product_relationships_no_self_chk"
  CHECK ("to_product_id" IS NULL OR "from_product_id" <> "to_product_id");

ALTER TABLE "pos2_products"
  ADD CONSTRAINT "pos2_products_kind_role_chk"
  CHECK (
    ("product_kind" = 'FOUNDATION' AND "commercial_role" = 'STANDARD')
    OR ("product_kind" = 'COLLECTION' AND "commercial_role" = 'STANDARD')
    OR ("product_kind" = 'EXPERIENCE' AND "commercial_role" IN ('STANDARD', 'PACK'))
    OR ("product_kind" = 'ADDON' AND "commercial_role" = 'STANDARD')
    OR ("product_kind" = 'STANDALONE' AND "commercial_role" = 'STANDARD')
  );

ALTER TABLE "pos2_product_aliases"
  ADD CONSTRAINT "pos2_product_aliases_resolution_chk"
  CHECK (
    ("resolution_kind" = 'PRODUCT' AND "canonical_product_id" IS NOT NULL AND "included_benefit_code" IS NULL)
    OR ("resolution_kind" = 'INCLUDED_BENEFIT' AND "included_benefit_code" IS NOT NULL)
    OR ("resolution_kind" = 'WITHDRAWN' AND "canonical_product_id" IS NULL AND "included_benefit_code" IS NULL)
  );

ALTER TABLE "pos2_product_prices"
  ADD CONSTRAINT "pos2_product_prices_contact_amount_chk"
  CHECK (
    ("display_mode" = 'CONTACT' AND "amount" IS NULL)
    OR ("display_mode" <> 'CONTACT')
  );

ALTER TABLE "pos2_product_prices"
  ADD CONSTRAINT "pos2_product_prices_exact_from_amount_chk"
  CHECK (
    ("display_mode" IN ('EXACT', 'FROM') AND "amount" IS NOT NULL AND "amount" >= 0)
    OR ("display_mode" = 'CONTACT')
  );

ALTER TABLE "pos2_product_prices"
  ADD CONSTRAINT "pos2_product_prices_supply_install_chk"
  CHECK (
    ("fulfilment_mode" = 'SUPPLY_ONLY' AND "installation_included" = false)
    OR ("fulfilment_mode" = 'INSTALLED')
  );

ALTER TABLE "pos2_product_prices"
  ADD CONSTRAINT "pos2_product_prices_effective_order_chk"
  CHECK (
    "effective_from" IS NULL
    OR "effective_to" IS NULL
    OR "effective_to" > "effective_from"
  );

ALTER TABLE "pos2_product_prices"
  ADD CONSTRAINT "pos2_product_prices_no_overlap_active_excl"
  EXCLUDE USING gist (
    "price_book_id" WITH =,
    "product_id" WITH =,
    "currency_code" WITH =,
    "fulfilment_mode" WITH =,
    "tax_basis" WITH =,
    tstzrange(
      COALESCE("effective_from", '-infinity'::timestamptz),
      COALESCE("effective_to", 'infinity'::timestamptz),
      '[)'
    ) WITH &&
  )
  WHERE ("status" = 'ACTIVE' AND "customer_visible" = true);

CREATE UNIQUE INDEX "pos2_product_relationships_bonus_unlock_target_uidx"
  ON "pos2_product_relationships" ("to_product_id")
  WHERE "relationship_type" = 'BONUS_UNLOCK' AND "status" = 'ACTIVE' AND "to_product_id" IS NOT NULL;

CREATE UNIQUE INDEX "pos2_product_relationships_active_cta_uidx"
  ON "pos2_product_relationships" ("from_product_id", "relationship_type")
  WHERE "relationship_type" = 'PRESENTATION_CTA' AND "status" = 'ACTIVE' AND "to_product_id" IS NULL;
