/**
 * Product OS V2 Phase 3A structural unit tests (no database).
 * Synthetic fixtures only — not Better Home product facts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  envGuard,
  stableIds,
  structuralValidators,
  PRODUCT_OS_V2_BOUNDARY
} = require("../../src/v2");

const MIGRATION_SQL = path.join(
  __dirname,
  "../../prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql"
);

describe("Product OS V2 boundary", () => {
  it("exposes V2 boundary marker distinct from V1", () => {
    assert.equal(PRODUCT_OS_V2_BOUNDARY, "pos2");
  });
});

describe("env guard", () => {
  it("requires explicit env name", () => {
    assert.throws(
      () => envGuard.assertProductOsDatabaseTarget({}),
      /Explicit --env target required/
    );
  });

  it("refuses production without confirmation", () => {
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "production",
          productionConfirmed: false,
          requireFingerprint: false
        }),
      /Production target refused/
    );
  });

  it("allows local preflight without fingerprint", () => {
    const r = envGuard.assertProductOsDatabaseTarget({
      envName: "local",
      requireUrl: false,
      requireFingerprint: false
    });
    assert.equal(r.ok, true);
    assert.equal(r.envName, "local");
  });

  it("does not print secrets when fingerprinting", () => {
    const fp = envGuard.fingerprintHost(
      "postgresql://user:super-secret@db.example.com:5432/pos"
    );
    assert.match(fp, /^sha256:[a-f0-9]{64}$/);
    assert.equal(fp.includes("super-secret"), false);
    assert.equal(fp.includes("user"), false);
  });
});

describe("stable IDs", () => {
  it("accepts product and namespaced codes", () => {
    assert.equal(stableIds.isValidStableCode("product", "C-01"), true);
    assert.equal(stableIds.isValidStableCode("experience", "exp.c01.door_awareness"), true);
    assert.equal(stableIds.isValidStableCode("capability", "cap.door_contact"), true);
    assert.equal(stableIds.isValidStableCode("release", "pos-2.07"), true);
  });

  it("rejects excel row identities", () => {
    assert.equal(stableIds.assertNoExcelRowIdentity("row-12"), false);
    assert.equal(stableIds.assertNoExcelRowIdentity("42"), false);
    assert.equal(stableIds.isValidStableCode("experience", "Door Awareness"), false);
  });
});

describe("structural validators", () => {
  it("validates kind/role combinations", () => {
    const ok = structuralValidators.validateProductKindRole({
      productCode: "TEST-E06",
      productKind: "EXPERIENCE",
      commercialRole: "PACK"
    });
    assert.equal(ok.passed, true);

    const bad = structuralValidators.validateProductKindRole({
      productCode: "TEST-X",
      productKind: "FOUNDATION",
      commercialRole: "BONUS"
    });
    assert.equal(bad.passed, false);
  });

  it("blocks self relationships and duplicate actives", () => {
    assert.equal(
      structuralValidators.validateNoSelfRelationship({
        fromProductId: "a",
        toProductId: "a"
      }).passed,
      false
    );
    const dups = structuralValidators.validateDuplicateActiveRelationships([
      {
        id: "1",
        fromProductId: "a",
        toProductId: "b",
        relationshipType: "COMPATIBLE_EXPERIENCE",
        status: "ACTIVE"
      },
      {
        id: "2",
        fromProductId: "a",
        toProductId: "b",
        relationshipType: "COMPATIBLE_EXPERIENCE",
        status: "ACTIVE"
      }
    ]);
    assert.equal(dups.some((r) => !r.passed), true);
  });

  it("validates Protection-style AND prerequisite group with synthetic codes", () => {
    const r = structuralValidators.validateBonusUnlockAndGroup({
      relationship: {
        relationshipCode: "rel.test.bonus",
        relationshipType: "BONUS_UNLOCK"
      },
      requirementGroups: [
        {
          logic: "AND",
          requirements: [
            { requiredProductCode: "T-01" },
            { requiredProductCode: "T-02" },
            { requiredProductCode: "T-03" }
          ]
        }
      ],
      requiredProductCodes: ["T-01", "T-02", "T-03"]
    });
    assert.equal(r.passed, true);
  });

  it("validates Add-on semantic rules", () => {
    const parentCap = structuralValidators.validateAddonParentCapability({
      addonProfile: { productId: "addon-1", extendsCapabilityId: "cap-1" },
      parentProductId: "parent-1",
      parentCapabilities: [{ productId: "parent-1", capabilityId: "cap-1" }]
    });
    assert.equal(parentCap.passed, true);

    const flags = structuralValidators.validateAddonDoesNotCreateRoomOrExperience({
      productId: "addon-1",
      createsNewRoom: false,
      createsNewExperience: false
    });
    assert.equal(flags.passed, true);

    const badFlags = structuralValidators.validateAddonDoesNotCreateRoomOrExperience({
      productId: "addon-1",
      createsNewRoom: true,
      createsNewExperience: false
    });
    assert.equal(badFlags.passed, false);
  });

  it("validates price display and supply-only consistency", () => {
    assert.equal(
      structuralValidators.validatePriceAmountDisplayMode({
        displayMode: "CONTACT",
        amount: 10
      }).passed,
      false
    );
    assert.equal(
      structuralValidators.validatePriceFulfilmentInstallConsistency({
        fulfilmentMode: "SUPPLY_ONLY",
        installationIncluded: true
      }).passed,
      false
    );
    assert.equal(
      structuralValidators.validatePriceFulfilmentInstallConsistency({
        fulfilmentMode: "SUPPLY_ONLY",
        installationIncluded: false
      }).passed,
      true
    );
  });

  it("blocks unapproved assets for publish", () => {
    const findings = structuralValidators.validatePublishedPageAssets({
      imageLinks: [{ id: "l1", assetId: "a1" }],
      assetsById: {
        a1: {
          assetCode: "asset.test.placeholder",
          publishStatus: "NOT_APPROVED_FOR_PUBLISH"
        }
      }
    });
    assert.equal(findings[0].passed, false);
  });

  it("detects orphan presentation mappings", () => {
    const r = structuralValidators.validatePresentationMappingHasExperience({
      mapping: { mappingCode: "map.test", experienceId: "missing" },
      knownExperienceIds: ["exp-1"]
    });
    assert.equal(r.passed, false);
  });

  it("rejects Legacy as canonical", () => {
    const r = structuralValidators.validateLegacyNotCanonical({
      sourceKind: "12_PRODUCT_CARD_CONTENT",
      treatedAsCanonical: true
    });
    assert.equal(r.passed, false);
  });

  it("enforces content ownership and featured sort uniqueness", () => {
    assert.equal(
      structuralValidators.validateMasterMarketingNotContentAuthority({
        fieldOwner: "product_master"
      }).passed,
      false
    );
    const sorts = structuralValidators.validateFeaturedAddonSort({
      featuredRows: [
        { parentProductId: "p1", channel: "a4", surface: "back", sortOrder: 1 },
        { parentProductId: "p1", channel: "a4", surface: "back", sortOrder: 1 }
      ]
    });
    assert.equal(sorts[0].passed, false);
  });

  it("keeps release and template versions separate", () => {
    const r = structuralValidators.validateReleaseTemplateSeparation({
      footerConfig: {
        productOsReleaseCode: "pos-2.07",
        documentTemplateVersionLabel: "a4-review-set-v1"
      }
    });
    assert.equal(r.passed, true);
  });
});

describe("migration SQL safety", () => {
  it("exists and contains only additive pos2_ / Pos2 structures", () => {
    assert.equal(fs.existsSync(MIGRATION_SQL), true);
    const sql = fs.readFileSync(MIGRATION_SQL, "utf8");
    assert.match(sql, /CREATE TABLE "pos2_products"/);
    assert.match(sql, /Pos2ProductKind/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /ALTER TABLE "product_catalog"/i);
    assert.doesNotMatch(sql, /ALTER TABLE "settings"/i);
    assert.doesNotMatch(sql, /DROP TYPE "ProductType"/i);
    assert.match(sql, /pos2_addon_profiles_no_new_room_chk/);
    assert.match(sql, /pos2_bom_items_qty_positive_chk/);
  });
});

describe("Prisma schema generation smoke", () => {
  it("loads Pos2 enums from generated client without connecting", () => {
    const client = require("@prisma/client");
    assert.equal(client.Pos2ProductKind.FOUNDATION, "FOUNDATION");
    assert.equal(client.Pos2CommercialRole.BONUS, "BONUS");
    assert.equal(
      client.Pos2PublishStatus.NOT_APPROVED_FOR_PUBLISH,
      "NOT_APPROVED_FOR_PUBLISH"
    );
    assert.equal(typeof client.PrismaClient, "function");
  });
});
