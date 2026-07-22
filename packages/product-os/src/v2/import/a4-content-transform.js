/**
 * DEC-012 / DEC-009 — approved A4 verbatim content + experience presentation mappings.
 * Does not create duplicate Experience library facts from A4 labels.
 */

const crypto = require("crypto");
const {
  A4_CONTENT_SOURCE,
  APPROVED_FOUNDATION_A4,
  APPROVED_EXPERIENCE_A4,
  APPROVED_COLLECTION_A4
} = require("./approved-a4-content");
const { slugPart } = require("./extended-transforms");

function contentHash(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function entry({
  productCode,
  contentKind,
  surface,
  sequence,
  title,
  body,
  templateKey,
  approvalStatus = "APPROVED_A4_VERBATIM"
}) {
  const contentCode = `cnt.a4.${slugPart(productCode)}.${slugPart(contentKind)}.${sequence || 0}.${slugPart(templateKey || contentKind)}`;
  const exactText = body != null ? body : title;
  return {
    action: "UPSERT_CONTENT_ENTRY",
    contentCode,
    productCode,
    locale: A4_CONTENT_SOURCE.locale,
    languageLayer: A4_CONTENT_SOURCE.languageLayer,
    surface,
    contentKind,
    sequence: sequence || 0,
    title: title || null,
    body: body || null,
    exactText,
    approvalStatus,
    publishEligible: approvalStatus === "APPROVED_A4_VERBATIM",
    sourceHash: contentHash(exactText || ""),
    contentVersion: "a4-review-set-v1",
    a4TemplateMappingKey: templateKey || contentKind,
    source: {
      system: "A4_REVIEW_SET_V1",
      decision: A4_CONTENT_SOURCE.decision,
      a4PdfSha256: A4_CONTENT_SOURCE.a4PdfSha256,
      mappingReviewSha256: A4_CONTENT_SOURCE.mappingReviewSha256
    }
  };
}

function matchLibraryExperience(experiences, productCode, hint) {
  if (!hint) return null;
  const pool = (experiences || []).filter((e) => e.productCode === productCode);
  const h = hint.toLowerCase();
  return (
    pool.find((e) => (e.title || "").toLowerCase() === h) ||
    pool.find((e) => (e.title || "").toLowerCase().includes(h)) ||
    pool.find((e) => h.includes((e.title || "").toLowerCase())) ||
    null
  );
}

function buildApprovedA4ContentPlan(libraryExperiences = []) {
  const contentEntries = [];
  const presentationMappings = [];
  const scopePresentation = [];
  const verbatimChecks = [];
  const coverage = {};

  const approvedProductA4 = { ...APPROVED_FOUNDATION_A4, ...APPROVED_COLLECTION_A4, ...APPROVED_EXPERIENCE_A4 };
  for (const [productCode, block] of Object.entries(approvedProductA4)) {
    const contentSource = block.source || A4_CONTENT_SOURCE;
    const planned = [];

    const withSource = (e) => {
      e.locale = contentSource.locale || e.locale;
      e.languageLayer = contentSource.languageLayer || e.languageLayer;
      e.contentVersion = contentSource.contentVersion || e.contentVersion;
      e.source = {
        system: contentSource.decision || "A4_REVIEW_SET_V1",
        decision: contentSource.decision,
        a4Pdf: contentSource.a4Pdf,
        a4PdfSha256: contentSource.a4PdfSha256,
        mappingReviewSha256: contentSource.mappingReviewSha256 || null
      };
      return e;
    };
    const push = (e) => {
      withSource(e);
      contentEntries.push(e);
      planned.push(e.contentKind);
    };

    push(
      entry({
        productCode,
        contentKind: "HERO",
        surface: "FRONT",
        sequence: 1,
        body: block.hero,
        templateKey: "front.hero"
      })
    );
    if (block.backSubtitle) {
      push(
        entry({
          productCode,
          contentKind: "SUBTITLE",
          surface: "BACK",
          sequence: 3,
          body: block.backSubtitle,
          templateKey: "back.decision_subtitle"
        })
      );
    }
    push(
      entry({
        productCode,
        contentKind: "SUBTITLE",
        surface: "FRONT",
        sequence: 2,
        body: block.subtitle,
        templateKey: "front.subtitle"
      })
    );
    push(
      entry({
        productCode,
        contentKind: "STORY_TITLE",
        surface: "FRONT",
        sequence: 3,
        title: block.storyTitle,
        body: block.storyTitle,
        templateKey: "front.story_title"
      })
    );
    push(
      entry({
        productCode,
        contentKind: "STORY_BODY",
        surface: "FRONT",
        sequence: 4,
        body: block.storyBody,
        templateKey: "front.story_body"
      })
    );

    for (const m of block.moments) {
      push(
        entry({
          productCode,
          contentKind: "FRONT_MOMENT_TITLE",
          surface: "FRONT",
          sequence: m.sequence,
          title: m.title,
          body: m.title,
          templateKey: `front.moment.${m.sequence}.title`
        })
      );
      push(
        entry({
          productCode,
          contentKind: "FRONT_MOMENT_CAPTION",
          surface: "FRONT",
          sequence: m.sequence,
          title: m.caption,
          body: m.caption,
          templateKey: `front.moment.${m.sequence}.caption`
        })
      );
    }

    push(
      entry({
        productCode,
        contentKind: "FOOTER",
        surface: "FRONT",
        sequence: 90,
        body: block.valueFooter,
        templateKey: "front.value_footer"
      })
    );

    push(
      entry({
        productCode,
        contentKind: "PROBLEM",
        surface: "BACK",
        sequence: 1,
        body: block.problem,
        templateKey: "back.problem"
      })
    );
    push(
      entry({
        productCode,
        contentKind: "BETTER_HOME_RESPONSE",
        surface: "BACK",
        sequence: 2,
        body: block.betterHomeResponse,
        templateKey: "back.response"
      })
    );

    for (const exp of block.experiences) {
      push(
        entry({
          productCode,
          contentKind: "CUSTOMER_EXPERIENCE_COPY",
          surface: "BACK",
          sequence: exp.sequence,
          title: exp.title,
          body: exp.body,
          templateKey: `back.experience.${exp.sequence}`
        })
      );

      const matched = matchLibraryExperience(libraryExperiences, productCode, exp.libraryMatchHint);
      presentationMappings.push({
        action: "UPSERT_EXPERIENCE_PRESENTATION_MAPPING",
        mappingCode: `map.a4.exp.${slugPart(productCode)}.${exp.sequence}`,
        productCode,
        channel: "A4",
        surface: "BACK",
        sequence: exp.sequence,
        presentationTitle: exp.title,
        presentationBody: exp.body,
        // DEC-009: reference library experience when matchable; never invent new experience IDs from A4
        experienceCode: matched ? matched.experienceCode : null,
        libraryMatchHint: exp.libraryMatchHint || null,
        plannedFactRef: exp.plannedFactRef || null,
        capabilityHint: exp.capabilityHint || null,
        createsExperienceFact: false,
        decision: "DEC-009",
        source: {
          system: "A4_REVIEW_SET_V1",
          a4PdfSha256: contentSource.a4PdfSha256
        }
      });
    }

    for (let gi = 0; gi < block.scopeGroups.length; gi += 1) {
      const g = block.scopeGroups[gi];
      const headingEntry = entry({
        productCode,
        // Pos2ContentKind intentionally has no separate scope enum. Scope wording is
        // customer copy, while the placement key and fact links preserve its role.
        contentKind: "CUSTOMER_EXPERIENCE_COPY",
        surface: "BACK",
        sequence: 50 + gi,
        title: g.heading,
        body: g.lines.join("\n"),
        templateKey: `back.scope.${gi + 1}`
      });
      headingEntry.approvalStatus = "APPROVED_A4_VERBATIM";
      headingEntry.factLinked = true;
      headingEntry.doesNotOverrideBom = true;
      headingEntry.presentationRole = "STANDARD_SCOPE";
      headingEntry.note = g.note || null;
      withSource(headingEntry);
      contentEntries.push(headingEntry);
      planned.push("SCOPE_HEADING");

      scopePresentation.push({
        productCode,
        heading: g.heading,
        lines: [...g.lines],
        sequence: gi + 1,
        note: g.note || null,
        factAuthority: "capabilities_and_bom",
        decision: "DEC-012"
      });
    }

    for (const item of block.expandFurther || []) {
      push(
        entry({
          productCode,
          contentKind: "CUSTOMER_EXPERIENCE_COPY",
          surface: "BACK",
          sequence: item.sequence,
          title: item.title,
          body: item.body,
          templateKey: `back.expand.${item.sequence}`
        })
      );
    }

    const assumptionText =
      productCode === "C-06" && block.installationAssumptionsCustomer
        ? block.installationAssumptionsCustomer
        : block.installationAssumptions;
    push(
      entry({
        productCode,
        contentKind: "INSTALLATION_ASSUMPTION_CUSTOMER",
        surface: "BACK",
        sequence: 80,
        body: assumptionText,
        templateKey: "back.installation_assumptions"
      })
    );

    if (block.investmentSupportingCopy) {
      push(
        entry({
          productCode,
          contentKind: "FOOTER",
          surface: "BACK",
          sequence: 85,
          body: block.investmentSupportingCopy,
          templateKey: "back.investment_qualifiers"
        })
      );
    }

    // Verbatim anchors (must survive round-trip)
    verbatimChecks.push(
      { productCode, field: "hero", text: block.hero },
      { productCode, field: "subtitle", text: block.subtitle },
      { productCode, field: "storyTitle", text: block.storyTitle },
      { productCode, field: "storyBody", text: block.storyBody },
      { productCode, field: "problem", text: block.problem },
      { productCode, field: "betterHomeResponse", text: block.betterHomeResponse }
    );

    const requiredFront = [
      "HERO",
      "SUBTITLE",
      "STORY_TITLE",
      "STORY_BODY",
      "FRONT_MOMENT_TITLE",
      "FRONT_MOMENT_CAPTION",
      "FOOTER"
    ];
    const requiredBack = [
      "PROBLEM",
      "BETTER_HOME_RESPONSE",
      "CUSTOMER_EXPERIENCE_COPY",
      "CUSTOMER_EXPERIENCE_COPY",
      "INSTALLATION_ASSUMPTION_CUSTOMER"
    ];
    coverage[productCode] = {
      frontRequired: requiredFront.length,
      frontPlanned: requiredFront.filter((k) => planned.includes(k)).length,
      backRequired: requiredBack.length,
      backPlanned: requiredBack.filter((k) => planned.includes(k)).length,
      moments: block.moments.length,
      experiences: block.experiences.length,
      scopeGroups: block.scopeGroups.length
    };
  }

  // Deduplicate content codes
  const codes = new Set();
  const duplicateContentIds = [];
  for (const c of contentEntries) {
    if (codes.has(c.contentCode)) duplicateContentIds.push(c.contentCode);
    codes.add(c.contentCode);
  }

  return {
    contentEntries,
    presentationMappings,
    scopePresentation,
    verbatimChecks,
    coverage,
    duplicateContentIds,
    source: A4_CONTENT_SOURCE,
    stats: {
      a4ContentEntries: contentEntries.length,
      presentationMappings: presentationMappings.length,
      scopeGroups: scopePresentation.length,
      products: Object.keys(approvedProductA4).length,
      collections: Object.keys(APPROVED_COLLECTION_A4).length
    }
  };
}

/** Assert planned content still matches approved master strings. */
function assertVerbatim(planContentEntries, checks) {
  const failures = [];
  for (const check of checks) {
    const found = planContentEntries.find((c) => {
      if (c.productCode !== check.productCode) return false;
      if (check.field === "hero") return c.contentKind === "HERO" && c.exactText === check.text;
      if (check.field === "subtitle") return c.contentKind === "SUBTITLE" && c.exactText === check.text;
      if (check.field === "storyTitle") return c.contentKind === "STORY_TITLE" && c.exactText === check.text;
      if (check.field === "storyBody") return c.contentKind === "STORY_BODY" && c.exactText === check.text;
      if (check.field === "problem") return c.contentKind === "PROBLEM" && c.exactText === check.text;
      if (check.field === "betterHomeResponse") {
        return c.contentKind === "BETTER_HOME_RESPONSE" && c.exactText === check.text;
      }
      return false;
    });
    if (!found) failures.push(check);
  }
  return { ok: failures.length === 0, failures };
}

module.exports = {
  buildApprovedA4ContentPlan,
  assertVerbatim,
  contentHash,
  matchLibraryExperience
};
