#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { assertProductOsDatabaseTarget, resolveDatabaseUrlForEnv, fingerprintHost } = require("../src/v2/env-guard");
const { buildPhase4BCompatibility } = require("../src/v2/import/phase4b-compatibility");

const argv = new Set(process.argv.slice(2));
const apply = argv.has("--apply-approved-import");
if (!argv.has("--env=neon_dev")) throw new Error("Only explicit --env=neon_dev is allowed");
assertProductOsDatabaseTarget({ envName: "neon_dev", requireUrl: true, requireFingerprint: true });
const url = resolveDatabaseUrlForEnv("neon_dev");
const planPath = path.join(__dirname, "../generated/import-plan-v2.07.json");
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const compatibility = buildPhase4BCompatibility(plan);
if (!compatibility.ok) throw new Error(`Phase 4B compatibility blocked: ${JSON.stringify(compatibility.blockers)}`);
const prisma = new PrismaClient({ datasourceUrl: url });
const status = (v) => String(v || "").toUpperCase() === "FROZEN" ? "FROZEN" : "ACTIVE";
const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const version = plan.product_os_release || "V2.07";
const hash = crypto.createHash("sha256").update(fs.readFileSync(planPath)).digest("hex");
class DryRunRollback extends Error {
  constructor(counts) { super("DRY_RUN_ROLLBACK"); this.counts = counts; }
}

async function upsertAll(tx) {
  const productByCode = new Map();
  for (const p of [...plan.products, ...plan.addons]) {
    const row = await tx.pos2Product.upsert({
      where: { productCode: p.productCode },
      create: { productCode:p.productCode, canonicalName:p.canonicalName, productKind:p.productKind, commercialRole:p.commercialRole, status:status(p.statusLabel), coverage:p.coverage || null, requiresFoundation:p.productKind !== "FOUNDATION" && p.productKind !== "STANDALONE", notes:p.coreValue || null },
      update: { canonicalName:p.canonicalName, productKind:p.productKind, commercialRole:p.commercialRole, status:status(p.statusLabel), coverage:p.coverage || null, requiresFoundation:p.productKind !== "FOUNDATION" && p.productKind !== "STANDALONE", notes:p.coreValue || null }
    });
    productByCode.set(p.productCode, row);
    await tx.pos2ProductVersion.upsert({ where:{ productId_versionLabel:{productId:row.id,versionLabel:version} }, create:{productId:row.id,versionLabel:version,status:"FROZEN"}, update:{status:"FROZEN"} });
  }

  const skuByCode = new Map();
  for (const s of plan.skus) {
    const row = await tx.pos2EquipmentSku.upsert({ where:{skuCode:s.skuCode}, create:{skuCode:s.skuCode,name:s.canonicalName,category:s.capabilityCategory,supplier:s.supplier,technicalNotes:s.notes,status:status(s.statusLabel)}, update:{name:s.canonicalName,category:s.capabilityCategory,supplier:s.supplier,technicalNotes:s.notes,status:status(s.statusLabel)} });
    skuByCode.set(s.skuCode,row);
  }

  const capabilityByCode = new Map();
  for (const c of plan.capabilities) {
    const cap = await tx.pos2Capability.upsert({ where:{capabilityCode:c.capabilityCode}, create:{capabilityCode:c.capabilityCode,name:c.capabilityName,description:c.notes,status:"ACTIVE"}, update:{name:c.capabilityName,description:c.notes,status:"ACTIVE"} });
    capabilityByCode.set(c.capabilityCode,cap);
    await tx.pos2ProductCapability.upsert({ where:{productId_capabilityId:{productId:productByCode.get(c.productCode).id,capabilityId:cap.id}}, create:{productId:productByCode.get(c.productCode).id,capabilityId:cap.id,includedQty:c.includedQty,customerLayer:c.customerLayer,notes:c.notes,status:"ACTIVE"}, update:{includedQty:c.includedQty,customerLayer:c.customerLayer,notes:c.notes,status:"ACTIVE"} });
  }

  const bomVersionByProduct = new Map();
  for (const b of plan.bomItems) {
    let bv = bomVersionByProduct.get(b.productCode);
    if (!bv) {
      bv = await tx.pos2BomVersion.upsert({where:{bomVersionCode:`bom.${slug(b.productCode)}.${slug(version)}`},create:{bomVersionCode:`bom.${slug(b.productCode)}.${slug(version)}`,productId:productByCode.get(b.productCode).id,versionLabel:version,status:"FROZEN"},update:{status:"FROZEN"}});
      bomVersionByProduct.set(b.productCode,bv);
    }
    await tx.pos2BomItem.upsert({where:{bomVersionId_skuId:{bomVersionId:bv.id,skuId:skuByCode.get(b.skuCode).id}},create:{bomVersionId:bv.id,skuId:skuByCode.get(b.skuCode).id,qty:b.qty,includedType:"STANDARD",installationNotes:b.notes,sequence:1},update:{qty:b.qty,includedType:"STANDARD",installationNotes:b.notes}});
  }

  const experienceByCode = new Map();
  for (const e of plan.experiences) {
    const row=await tx.pos2Experience.upsert({where:{experienceCode:e.experienceCode},create:{experienceCode:e.experienceCode,productId:productByCode.get(e.productCode).id,canonicalTitle:e.title,canonicalDescription:e.description,sequence:e.sequence,status:status(e.statusLabel)},update:{canonicalTitle:e.title,canonicalDescription:e.description,sequence:e.sequence,status:status(e.statusLabel)}});
    experienceByCode.set(e.experienceCode,row);
  }

  for (const base of compatibility.addonBases) {
    const a=plan.addons.find(x=>x.productCode===base.productCode), product=productByCode.get(base.productCode);
    const capabilityId=base.capabilityCodes[0] ? capabilityByCode.get(base.capabilityCodes[0]).id : null;
    const skuId=base.skuCodes[0] ? skuByCode.get(base.skuCodes[0]).id : null;
    await tx.pos2AddonProfile.upsert({where:{productId:product.id},create:{productId:product.id,extendsCapabilityId:capabilityId,expandsSkuId:skuId,standardScopeUnit:a.standardScopeUnit,experiencePromiseKey:`addon.${slug(a.productCode)}.promise`,createsNewRoom:false,createsNewExperience:false,notes:a.installationAssumptions},update:{extendsCapabilityId:capabilityId,expandsSkuId:skuId,standardScopeUnit:a.standardScopeUnit,experiencePromiseKey:`addon.${slug(a.productCode)}.promise`,notes:a.installationAssumptions}});
    for (let i=0;i<base.skuCodes.length;i++) await tx.pos2AddonEquipmentBasis.upsert({where:{addonProductId_skuId:{addonProductId:product.id,skuId:skuByCode.get(base.skuCodes[i]).id}},create:{addonProductId:product.id,skuId:skuByCode.get(base.skuCodes[i]).id,sequence:i+1},update:{sequence:i+1}});
    for (const parentCode of a.parentProductCodes) await tx.pos2AddonParentEligibility.upsert({where:{addonProductId_parentProductId:{addonProductId:product.id,parentProductId:productByCode.get(parentCode).id}},create:{addonProductId:product.id,parentProductId:productByCode.get(parentCode).id,status:"ACTIVE"},update:{status:"ACTIVE"}});
  }

  const addonByHint=(parent,hint)=>plan.addons.find(a=>a.parentProductCodes.includes(parent) && a.canonicalName.toLowerCase().includes(String(hint).toLowerCase()));
  for (const f of plan.featuredAddons) {
    const addon=addonByHint(f.parentProductCode,f.matchHint);
    if (!addon) throw new Error(`Featured Add-on unresolved: ${f.mappingCode}`);
    await tx.pos2ProductFeaturedAddon.upsert({where:{parentProductId_addonProductId_channel_surface:{parentProductId:productByCode.get(f.parentProductCode).id,addonProductId:productByCode.get(addon.productCode).id,channel:"A4",surface:"BACK"}},create:{parentProductId:productByCode.get(f.parentProductCode).id,addonProductId:productByCode.get(addon.productCode).id,channel:"A4",surface:"BACK",sortOrder:f.sortOrder,status:"ACTIVE"},update:{sortOrder:f.sortOrder,status:"ACTIVE"}});
  }

  for (const r of [...plan.expandFurtherRelationships,...plan.presentationCtas]) await tx.pos2ProductRelationship.upsert({where:{relationshipCode:r.relationshipCode},create:{relationshipCode:r.relationshipCode,fromProductId:productByCode.get(r.fromProductCode).id,toProductId:r.toProductCode?productByCode.get(r.toProductCode).id:null,relationshipType:r.relationshipType,status:"ACTIVE",priority:r.sortOrder,notes:r.customerCopy},update:{toProductId:r.toProductCode?productByCode.get(r.toProductCode).id:null,relationshipType:r.relationshipType,status:"ACTIVE",priority:r.sortOrder,notes:r.customerCopy}});

  const unlock=await tx.pos2ProductRelationship.upsert({where:{relationshipCode:"rel.bonus.protection.unlock"},create:{relationshipCode:"rel.bonus.protection.unlock",fromProductId:productByCode.get("E-05").id,relationshipType:"BONUS_UNLOCK",status:"ACTIVE",notes:"Protection Bonus unlock: Entry AND Away AND CCTV"},update:{status:"ACTIVE"}});
  const group=await tx.pos2RelationshipRequirementGroup.upsert({where:{relationshipId_groupCode:{relationshipId:unlock.id,groupCode:"all_required"}},create:{relationshipId:unlock.id,groupCode:"all_required",logic:"AND",sequence:1},update:{logic:"AND"}});
  for(const code of ["C-01","C-06","E-05"]) await tx.pos2RelationshipRequirement.upsert({where:{requirementGroupId_requiredProductId:{requirementGroupId:group.id,requiredProductId:productByCode.get(code).id}},create:{requirementGroupId:group.id,requiredProductId:productByCode.get(code).id,minQty:1},update:{minQty:1}});
  await tx.pos2IncludedBenefit.upsert({where:{benefitCode:"benefit.protection_bonus"},create:{benefitCode:"benefit.protection_bonus",hostProductId:productByCode.get("E-05").id,displayName:"Protection Bonus",unlockRelationshipId:unlock.id,status:"ACTIVE",notes:"Shown as a CCTV note; no independent A4 or price"},update:{hostProductId:productByCode.get("E-05").id,unlockRelationshipId:unlock.id,status:"ACTIVE",notes:"Shown as a CCTV note; no independent A4 or price"}});

  const book=await tx.pos2PriceBook.upsert({where:{priceBookCode:"aud.customer.v2_07"},create:{priceBookCode:"aud.customer.v2_07",name:"Better Home Customer Price Book V2.07",currencyCode:"AUD",status:"FROZEN"},update:{status:"FROZEN"}});
  for(const p of plan.prices) await tx.pos2ProductPrice.upsert({where:{priceCode:`price.${slug(p.productCode)}.v2_07`},create:{priceCode:`price.${slug(p.productCode)}.v2_07`,priceBookId:book.id,productId:productByCode.get(p.productCode).id,amount:p.customerPriceInclGst,currencyCode:"AUD",taxBasis:p.taxBasis,displayMode:p.displayMode,fulfilmentMode:p.fulfillmentMode,installationIncluded:p.installationIncluded,customerVisible:p.customerVisible,versionLabel:version,status:"FROZEN"},update:{amount:p.customerPriceInclGst,taxBasis:p.taxBasis,displayMode:p.displayMode,fulfilmentMode:p.fulfillmentMode,installationIncluded:p.installationIncluded,customerVisible:p.customerVisible,status:"FROZEN"}});
  for(const a of plan.addons) await tx.pos2ProductPrice.upsert({where:{priceCode:`price.${slug(a.productCode)}.v2_07`},create:{priceCode:`price.${slug(a.productCode)}.v2_07`,priceBookId:book.id,productId:productByCode.get(a.productCode).id,amount:a.customerPriceInclGst,currencyCode:"AUD",taxBasis:"GST_INCLUSIVE",displayMode:"EXACT",fulfilmentMode:"INSTALLED",installationIncluded:true,customerVisible:true,scopeBasis:a.standardScopeUnit,subjectToInstallationAssumptions:true,commercialNotes:a.installationAssumptions,versionLabel:version,status:"FROZEN"},update:{amount:a.customerPriceInclGst,scopeBasis:a.standardScopeUnit,commercialNotes:a.installationAssumptions,status:"FROZEN"}});

  for(const c of plan.contentEntries) {
    const entry=await tx.pos2ContentEntry.upsert({where:{contentKey_locale_versionLabel:{contentKey:c.contentCode,locale:c.locale||"en-AU",versionLabel:c.contentVersion||version}},create:{contentKey:c.contentCode,contentKind:c.contentKind,locale:c.locale||"en-AU",title:c.title,body:c.body,languageLayer:c.languageLayer||"CUSTOMER",status:c.publishEligible?"FROZEN":"DRAFT",versionLabel:c.contentVersion||version},update:{contentKind:c.contentKind,title:c.title,body:c.body,languageLayer:c.languageLayer||"CUSTOMER",status:c.publishEligible?"FROZEN":"DRAFT"}});
    if(c.productCode && productByCode.has(c.productCode)) await tx.pos2ProductContentPlacement.upsert({where:{productId_contentEntryId_channel_surface_side_sortOrder:{productId:productByCode.get(c.productCode).id,contentEntryId:entry.id,channel:c.surface?"A4":"PRODUCT_OS",surface:c.a4TemplateMappingKey||c.contentKey||"content",side:c.surface||"NA",sortOrder:c.sequence||1}},create:{productId:productByCode.get(c.productCode).id,contentEntryId:entry.id,channel:c.surface?"A4":"PRODUCT_OS",surface:c.a4TemplateMappingKey||c.contentKey||"content",side:c.surface||"NA",sortOrder:c.sequence||1,status:"ACTIVE"},update:{status:"ACTIVE"}});
  }

  for(const m of compatibility.experienceMappings) await tx.pos2ExperiencePresentationMapping.upsert({where:{mappingCode:m.mappingCode},create:{mappingCode:m.mappingCode,experienceId:experienceByCode.get(m.experienceCode).id,channel:"A4",surface:"PRODUCT_SHEET",side:"BACK",displayTitle:m.presentationTitle,customerDescription:m.presentationBody,sortOrder:m.sequence,status:"FROZEN",versionLabel:"a4-review-set-v1"},update:{displayTitle:m.presentationTitle,customerDescription:m.presentationBody,sortOrder:m.sequence,status:"FROZEN"}});

  for(const t of plan.themes) {
    const theme=await tx.pos2Theme.upsert({where:{themeCode:t.themeCode},create:{themeCode:t.themeCode,name:t.themeName,themeScope:"PRODUCT",productId:productByCode.get(t.productCode).id,status:"FROZEN"},update:{name:t.themeName,status:"FROZEN"}});
    for(const [key,value] of Object.entries({accent:t.accentColour,background:t.backgroundColour,text:t.textColour})) await tx.pos2ThemeToken.upsert({where:{themeId_tokenKey:{themeId:theme.id,tokenKey:key}},create:{themeId:theme.id,tokenKey:key,tokenValue:value,status:"ACTIVE"},update:{tokenValue:value,status:"ACTIVE"}});
  }
  for(const a of plan.assets) {
    const asset=await tx.pos2ImageAsset.upsert({where:{assetCode:a.assetCode},create:{assetCode:a.assetCode,storageUri:a.filePath,altTextDefault:a.altText,publishStatus:a.publishStatus,approvalStatus:"DRAFT",versionLabel:version,sourceMeta:a.source},update:{storageUri:a.filePath,altTextDefault:a.altText,publishStatus:a.publishStatus,approvalStatus:"DRAFT"}});
    await tx.pos2ProductImageLink.upsert({where:{productId_assetId_channel_surface_sequence:{productId:productByCode.get(a.productCode).id,assetId:asset.id,channel:"A4",surface:"HERO",sequence:1}},create:{productId:productByCode.get(a.productCode).id,assetId:asset.id,channel:"A4",surface:"HERO",sequence:1},update:{}});
  }
  const template=await tx.pos2LayoutTemplate.upsert({where:{templateCode:"a4.product_sheet.v1"},create:{templateCode:"a4.product_sheet.v1",surface:"A4_PRODUCT_SHEET",name:"A4 Product Sheet V1",status:"FROZEN"},update:{status:"FROZEN"}});
  for(const l of plan.layouts) await tx.pos2LayoutConfig.upsert({where:{templateId_productId_surface_versionLabel:{templateId:template.id,productId:productByCode.get(l.productCode).id,surface:"A4_PRODUCT_SHEET",versionLabel:"a4-review-set-v1"}},create:{templateId:template.id,productId:productByCode.get(l.productCode).id,surface:"A4_PRODUCT_SHEET",definition:l,status:"FROZEN",versionLabel:"a4-review-set-v1"},update:{definition:l,status:"FROZEN"}});

  return { products:await tx.pos2Product.count(), addons:await tx.pos2AddonProfile.count(), prices:await tx.pos2ProductPrice.count(), content:await tx.pos2ContentEntry.count(), relationships:await tx.pos2ProductRelationship.count(), assets:await tx.pos2ImageAsset.count() };
}

process.stdout.write(`${JSON.stringify({phase:"4B",mode:apply?"APPLY_START":"DRY_RUN_START",target:"neon_dev",fingerprint:fingerprintHost(url),planHash:hash})}\n`);

(async()=>{
  try {
    const counts=await prisma.$transaction(async tx=>{ const out=await upsertAll(tx); if(!apply) throw new DryRunRollback(out); return out; },{maxWait:10000,timeout:300000});
    console.log(JSON.stringify({phase:"4B",mode:"APPLY",target:"neon_dev",fingerprint:fingerprintHost(url),planHash:hash,counts}));
  } catch(e) {
    if(e instanceof DryRunRollback) console.log(JSON.stringify({phase:"4B",mode:"DRY_RUN_ROLLBACK",target:"neon_dev",fingerprint:fingerprintHost(url),planHash:hash,counts:e.counts})); else throw e;
  } finally { await prisma.$disconnect(); }
})().catch(e=>{
  const safeMeta = e?.meta?.target ? ` target=${JSON.stringify(e.meta.target)}` : "";
  console.error(`Phase 4B failed: ${e?.code || e?.message || String(e)}${safeMeta}`);
  process.exitCode=1;
});
