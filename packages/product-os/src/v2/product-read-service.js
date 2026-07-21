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
  const hit = rows.find((p) => p.contentEntry.contentKind === kind && (!side || p.side === side));
  return hit ? (hit.contentEntry.body || hit.contentEntry.title) : null;
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
  const content=product.contentPlacements || [], price=firstPrice(product.prices);
  const hero=contentValue(content,"HERO","FRONT") || contentValue(content,"HERO");
  const approvedLink=(product.imageLinks||[]).find(x=>x.asset.publishStatus==="APPROVED");
  const customerExperiences=placed(content,p=>p.side==="BACK" && /^back\.experience\./.test(p.surface)).map(x=>({title:x.title,description:x.body,sequence:x.sortOrder}));
  const standardScope=placed(content,p=>p.side==="BACK" && /^back\.scope\./.test(p.surface)).map(x=>({heading:x.title,lines:String(x.body||"").split("\n").filter(Boolean),sequence:x.sortOrder}));
  const assumptions=placed(content,p=>p.contentEntry.contentKind==="INSTALLATION_ASSUMPTION_CUSTOMER").map(x=>x.body).filter(Boolean);
  const permittedAddonCards=addonRows.map(addonCard);
  const permittedByCode=new Map(permittedAddonCards.map(x=>[x.productCode,x]));
  const featuredAddonCards=(product.featuredAsParent||[]).map(x=>permittedByCode.get(x.addonProduct.productCode)).filter(Boolean);
  const model=emptyReadModel({
    productId:product.id, productCode:product.productCode, canonicalName:product.canonicalName, productKind:product.productKind, commercialRole:product.commercialRole,
    hierarchy:{requiresFoundation:product.requiresFoundation,parentProductCode:product.parent?.productCode||null}, standalone:product.productKind==="STANDALONE", hero,
    customerContent:{subtitle:contentValue(content,"SUBTITLE","FRONT"),storyTitle:contentValue(content,"STORY_TITLE","FRONT"),storyBody:contentValue(content,"STORY_BODY","FRONT"),problem:contentValue(content,"PROBLEM","BACK"),response:contentValue(content,"BETTER_HOME_RESPONSE","BACK"),frontMoments:frontMoments(content)},
    customerExperiences, standardScope,
    includedCapabilities:(product.capabilityInclusions||[]).map(x=>({capabilityCode:x.capability.capabilityCode,name:x.capability.name,includedQty:x.includedQty==null?null:Number(x.includedQty),unitCode:x.unitCode,customerLayer:x.customerLayer})),
    compatibleExperiences:(product.relationshipsFrom||[]).filter(x=>["COMPATIBLE_EXPERIENCE","RECOMMENDED_NEXT_PRODUCT"].includes(x.relationshipType)).map(x=>({relationshipCode:x.relationshipCode,relationshipType:x.relationshipType,productCode:x.toProduct?.productCode,canonicalName:x.toProduct?.canonicalName,customerCopy:x.notes,sortOrder:x.priority})),
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
