function normalizeDraftCode(value) {
  const code=String(value||"").trim().toUpperCase();
  if(!/^DRAFT-[A-Z0-9-]{8,64}$/.test(code)) throw new Error("Invalid draft code");
  return code;
}

function createSalesDraftService(prisma) {
  async function saveProjection({draftCode,projection,actor,actorRole}) {
    const code=normalizeDraftCode(draftCode);
    if(!projection?.selectionFingerprint||!Array.isArray(projection.lines)||!projection.lines.length) throw new Error("Valid proposal projection required");
    return prisma.$transaction(async tx=>{
      const actorLookups=[{externalSubject:actor}];
      if(/^[0-9a-f-]{36}$/i.test(actor||""))actorLookups.push({id:actor});
      const salesUser=await tx.pos2SalesUser.findFirst({where:{OR:actorLookups}});
      if(!salesUser||salesUser.status!=="ACTIVE")throw new Error("Active Sales Studio user required");
      const existing=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{versions:{orderBy:{versionNumber:"desc"},take:1}}});
      if(!actor)throw new Error("Authenticated actor required");
      if(existing&&actorRole==="SALES"&&existing.ownerUserId!==salesUser.id)throw new Error("Draft ownership required");
      const latest=existing?.versions?.[0];
      if(latest?.selectionFingerprint===projection.selectionFingerprint)return {draftCode:code,versionNumber:latest.versionNumber,unchanged:true};
      const products=await tx.pos2Product.findMany({where:{productCode:{in:projection.lines.map(x=>x.productCode)}}});
      const byCode=new Map(products.map(x=>[x.productCode,x]));
      if(products.length!==projection.lines.length)throw new Error("Projection contains unknown product");
      const versionNumber=(existing?.currentVersion||0)+1;
      const draft=existing?await tx.pos2SelectionDraft.update({where:{id:existing.id},data:{customerName:projection.customer.name||null,customerEmail:projection.customer.email||null,customerPhone:projection.customer.phone||null,siteAddress:projection.customer.siteAddress||null,currentVersion:versionNumber}}):await tx.pos2SelectionDraft.create({data:{draftCode:code,customerName:projection.customer.name||null,customerEmail:projection.customer.email||null,customerPhone:projection.customer.phone||null,siteAddress:projection.customer.siteAddress||null,currentVersion:versionNumber,createdBy:actor,ownerUserId:salesUser.id}});
      const version=await tx.pos2SelectionDraftVersion.create({data:{draftId:draft.id,versionNumber,selectionFingerprint:projection.selectionFingerprint,customerSnapshot:projection.customer,currencyCode:projection.currencyCode,taxBasis:projection.taxBasis,total:projection.total,createdBy:actor,actorUserId:salesUser.id,lines:{create:projection.lines.map(line=>({productId:byCode.get(line.productCode).id,productCodeSnapshot:line.productCode,productNameSnapshot:byCode.get(line.productCode).canonicalName,quantity:line.quantity,unitPrice:line.unitPrice,lineTotal:line.lineTotal}))}}});
      await tx.pos2AuditLog.create({data:{actor,action:"SELECTION_DRAFT_VERSION_CREATED",entityType:"Pos2SelectionDraft",entityId:draft.id,afterJson:{draftCode:code,versionNumber,selectionFingerprint:projection.selectionFingerprint}}});
      return {draftCode:code,draftId:draft.id,versionId:version.id,versionNumber,unchanged:false};
    });
  }
  return {saveProjection};
}

module.exports={normalizeDraftCode,createSalesDraftService};
