/**
 * Product OS V2 boundary exports.
 * V1 consumers must continue using createProductOsContext / ProductService.
 */

const envGuard = require("./env-guard");
const stableIds = require("./stable-ids");
const structuralValidators = require("./structural-validators");
const legacyCrosswalk = require("./legacy-crosswalk");
const productReadModel = require("./product-read-model");
const importTransforms = require("./import");
const productReadRepository = require("./product-read-repository");
const productReadService = require("./product-read-service");
const selectionQuote = require("./selection-quote");
const proposalProjection = require("./proposal-projection");
const salesDraftService = require("./sales-draft-service");
const customerMatchPolicy = require("./customer-match-policy");
const salesAuthPolicy = require("./sales-auth-policy");
const salesStudioService = require("./sales-studio-service");
const salesLifecycleService = require("./sales-lifecycle-service");
const crmContextService = require("./crm-context-service");
const crmCustomerOnboardingService = require("./crm-customer-onboarding-service");
const operationalHandoffService = require("./operational-handoff-service");
const readContext = require("./read-context");

module.exports = {
  envGuard,
  stableIds,
  structuralValidators,
  legacyCrosswalk,
  productReadModel,
  importTransforms,
  productReadRepository,
  productReadService,
  selectionQuote,
  proposalProjection,
  salesDraftService,
  customerMatchPolicy,
  salesAuthPolicy,
  salesStudioService,
  salesLifecycleService,
  crmContextService,
  crmCustomerOnboardingService,
  operationalHandoffService,
  readContext,
  PRODUCT_OS_V2_BOUNDARY: "pos2",
  PHASE: "5A"
};
