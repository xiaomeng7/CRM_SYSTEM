const { emptyReadModel, applyProtectionBenefit } = require("./product-read-model");

function firstPrice(prices = []) {
  const p = prices[0];
  return p ? { priceCode:p.priceCode, amount:Number(p.amount), currencyCode:p.currencyCode, displayMode:p.displayMode, taxBasis:p.taxBasis, fulfilmentMode:p.fulfilmentMode, installationIncluded:p.installationIncluded } : null;
}

function placed(rows, predicate) {
  return rows.filter(predicate).map((p) => ({
    contentKey: p.contentEntry.contentKey,
    kind: p.contentEntry.contentKind,
    title: p.contentEntry.title,
    body: p.contentEntry.body,
    surface: p.surface,
    side: p.side,
    sortOrder: p.sortOrder
  }));
}

function contentValue(rows, kind, side) {
  const hit = rows.find((p) => p.contentEntry.contentKind === kind && (!side || p.side === side) && (p.contentEntry.body || p.contentEntry.title));
  return hit ? (hit.contentEntry.body || hit.contentEntry.title) : null;
}

function preferredContentPlacements(rows = []) {
  const selected = new Map();
  const score = (row) => (row.contentEntry.status === "FROZEN" ? 2 : 1) + ((row.contentEntry.body || row.contentEntry.title) ? 2 : 0);
  for (const row of rows) {
    const key = [row.side, row.surface, row.sortOrder, row.contentEntry.contentKind].join("|");
    const current = selected.get(key);
    if (!current || score(row) > score(current)) selected.set(key, row);
  }
  return [...selected.values()].sort((a, b) => String(a.side).localeCompare(String(b.side)) || a.sortOrder - b.sortOrder);
}

function frontMoments(rows) {
  const grouped=new Map();
  for(const x of placed(rows,p=>p.side==="FRONT" && String(p.contentEntry.contentKind).startsWith("FRONT_MOMENT"))){
    const item=grouped.get(x.sortOrder)||{sequence:x.sortOrder,title:null,caption:null};
    if(x.kind==="FRONT_MOMENT_TITLE") item.title=x.body||x.title;
    if(x.kind==="FRONT_MOMENT_CAPTION") item.caption=x.body||x.title;
    grouped.set(x.sortOrder,item);
  }
  return [...grouped.values()].sort((a,b)=>a.sequence-b.sequence);
}

function benefitState(benefit, selected) {
  const groups = benefit.unlockRelationship?.requirementGroups || [];
  const selectedSet = new Set(selected.map((x) => String(x).toUpperCase()));
  const required = groups.flatMap((g) => g.requirements.map((r) => r.requiredProduct.productCode));
  const missing = required.filter((code) => !selectedSet.has(code));
  return { benefitCode:benefit.benefitCode, displayName:benefit.displayName, unlocked:missing.length===0, requiredProductCodes:required, missingProductCodes:missing, quoteValue:0 };
}

function addonCard(row) {
  const a=row.addonProduct, promise=a.contentPlacements.find(p=>p.contentEntry.contentKind==="ADDON_EXPERIENCE_PROMISE");
  return { productId:a.id, productCode:a.productCode, canonicalName:a.canonicalName, experiencePromise:promise?.contentEntry.body || promise?.contentEntry.title || null, standardScopeUnit:a.addonProfile?.standardScopeUnit || null, price:firstPrice(a.prices), createsNewRoom:a.addonProfile?.createsNewRoom || false, createsNewExperience:a.addonProfile?.createsNewExperience || false, equipmentBasis:(a.addonProfile?.equipmentBases||[]).map(x=>({skuCode:x.sku.skuCode,name:x.sku.name})) };
}

function assembleProductReadModel(product, addonRows = [], selectedProductCodes = []) {
  if (!product) return null;
  const content=preferredContentPlacements(product.contentPlacements || []), price=firstPrice(product.prices);
  const hero=contentValue(content,"HERO","FRONT") || contentValue(content,"HERO");
  const approvedLink=(product.imageLinks||[]).find(x=>x.asset.publishStatus==="APPROVED");
  const customerExperiences=placed(content,p=>p.side==="BACK" && /^back\.experience\./.test(p.surface)).map(x=>({title:x.title,description:x.body,sequence:x.sortOrder}));
  const standardScope=placed(content,p=>p.side==="BACK" && /^back\.scope\./.test(p.surface)).map(x=>({heading:x.title,lines:String(x.body||"").split("\n").filter(Boolean),sequence:x.sortOrder}));
  const expandFurtherPresentation=placed(content,p=>p.side==="BACK" && /^back\.expand\./.test(p.surface)).map(x=>({relationshipCode:x.contentKey,relationshipType:"PRESENTATION_CTA",productCode:x.contentKey,canonicalName:x.title,customerCopy:x.body,sortOrder:x.sortOrder}));
  const assumptions=placed(content,p=>p.contentEntry.contentKind==="INSTALLATION_ASSUMPTION_CUSTOMER").map(x=>x.body).filter(Boolean);
  const permittedAddonCards=addonRows.map(addonCard);
  const permittedByCode=new Map(permittedAddonCards.map(x=>[x.productCode,x]));
  const featuredAddonCards=(product.featuredAsParent||[]).map(x=>permittedByCode.get(x.addonProduct.productCode)).filter(Boolean);
  const model=emptyReadModel({
    productId:product.id, productCode:product.productCode, canonicalName:product.canonicalName, productKind:product.productKind, commercialRole:product.commercialRole,
    hierarchy:{requiresFoundation:product.requiresFoundation,parentProductCode:product.parent?.productCode||null}, standalone:product.productKind==="STANDALONE", hero,
    customerContent:{subtitle:contentValue(content,"SUBTITLE","FRONT"),decisionSubtitle:contentValue(content,"SUBTITLE","BACK"),storyTitle:contentValue(content,"STORY_TITLE","FRONT"),storyBody:contentValue(content,"STORY_BODY","FRONT"),problem:contentValue(content,"PROBLEM","BACK"),response:contentValue(content,"BETTER_HOME_RESPONSE","BACK"),frontMoments:frontMoments(content)},
    customerExperiences, standardScope,
    includedCapabilities:(product.capabilityInclusions||[]).map(x=>({capabilityCode:x.capability.capabilityCode,name:x.capability.name,includedQty:x.includedQty==null?null:Number(x.includedQty),unitCode:x.unitCode,customerLayer:x.customerLayer})),
    compatibleExperiences:[...(product.relationshipsFrom||[]).filter(x=>["COMPATIBLE_EXPERIENCE","RECOMMENDED_NEXT_PRODUCT","PRESENTATION_CTA"].includes(x.relationshipType)).map(x=>({relationshipCode:x.relationshipCode,relationshipType:x.relationshipType,productCode:x.toProduct?.productCode||x.relationshipCode,canonicalName:x.toProduct?.canonicalName||"Add-ons",customerCopy:x.notes,sortOrder:x.priority})),...expandFurtherPresentation],
    permittedAddons:permittedAddonCards, featuredAddons:featuredAddonCards, dependencyState:{satisfied:true,missing:[]}, installationAssumptions:[...(product.installationAssumptions||[]).map(x=>x.assumptionText),...assumptions],
    activePrice:price, taxBasis:price?.taxBasis||null, fulfilmentMode:price?.fulfilmentMode||null,
    approvedImage:approvedLink?{assetCode:approvedLink.asset.assetCode,storageUri:approvedLink.asset.storageUri,altText:approvedLink.asset.altTextDefault}:null,
    themeLayout:{themes:(product.themes||[]).map(t=>({themeCode:t.themeCode,tokens:Object.fromEntries(t.tokens.map(x=>[x.tokenKey,x.tokenValue]))})),layouts:(product.layoutConfigs||[]).map(l=>({templateCode:l.template.templateCode,surface:l.surface,definition:l.definition}))},
    printEligible:Boolean(price && hero && approvedLink), releaseVersion:product.versions?.[0]?.versionLabel || "V2.07",
    includedBenefits:(product.includedBenefits||[]).map(b=>benefitState(b,selectedProductCodes))
  });
  return applyProtectionBenefit(model,selectedProductCodes);
}

function createProductReadService(repository) {
  async function getProduct(productCode,{selectedProductCodes=[]}={}) { const product=await repository.findProduct(productCode); if(!product)return null; const addons=await repository.findPermittedAddons(product.id); return assembleProductReadModel(product,addons,selectedProductCodes); }
  async function listProductModels(){const {products,addonsByParent}=await repository.findAllProductsWithAddons();return products.map(product=>assembleProductReadModel(product,addonsByParent.get(product.id)||[]));}
  return { getProduct, listProducts:repository.listProducts, listProductModels };
}

module.exports={assembleProductReadModel,createProductReadService};
