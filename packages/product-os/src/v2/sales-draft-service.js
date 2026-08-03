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
      if(existing?.status==="ARCHIVED")throw new Error("Archived Draft cannot be changed. Start a new selection.");
      const convertedProposal=existing?.status==="CONVERTED"?await tx.pos2Proposal.findFirst({where:{draftVersion:{draftId:existing.id}},orderBy:{createdAt:"desc"}}):null;
      if(existing?.status==="CONVERTED"&&!convertedProposal)throw new Error("Converted selection has no Proposal");
      if(convertedProposal?.status==="ACCEPTED")throw new Error("Accepted Proposal is locked and cannot be changed");
      const latest=existing?.versions?.[0];
      const sameCustomer=latest&&JSON.stringify(latest.customerSnapshot||{})===JSON.stringify(projection.customer||{});
      if(latest?.selectionFingerprint===projection.selectionFingerprint&&sameCustomer)return {draftCode:code,versionNumber:latest.versionNumber,proposalCode:convertedProposal?.proposalCode||null,unchanged:true};
      const products=await tx.pos2Product.findMany({where:{productCode:{in:projection.lines.map(x=>x.productCode)}}});
      const byCode=new Map(products.map(x=>[x.productCode,x]));
      if(products.length!==projection.lines.length)throw new Error("Projection contains unknown product");
      const versionNumber=(existing?.currentVersion||0)+1;
      const draft=existing?await tx.pos2SelectionDraft.update({where:{id:existing.id},data:{customerName:projection.customer.name||null,customerEmail:projection.customer.email||null,customerPhone:projection.customer.phone||null,siteAddress:projection.customer.siteAddress||null,currentVersion:versionNumber}}):await tx.pos2SelectionDraft.create({data:{draftCode:code,customerName:projection.customer.name||null,customerEmail:projection.customer.email||null,customerPhone:projection.customer.phone||null,siteAddress:projection.customer.siteAddress||null,currentVersion:versionNumber,createdBy:actor,ownerUserId:salesUser.id}});
      const version=await tx.pos2SelectionDraftVersion.create({data:{draftId:draft.id,versionNumber,selectionFingerprint:projection.selectionFingerprint,customerSnapshot:projection.customer,currencyCode:projection.currencyCode,taxBasis:projection.taxBasis,total:projection.total,createdBy:actor,actorUserId:salesUser.id,lines:{create:projection.lines.map(line=>({productId:byCode.get(line.productCode).id,productCodeSnapshot:line.productCode,productNameSnapshot:byCode.get(line.productCode).canonicalName,quantity:line.quantity,unitPrice:line.unitPrice,lineTotal:line.lineTotal}))}}});
      if(convertedProposal){
        const snapshot={schemaVersion:"1.0.0",draftCode:code,draftVersion:versionNumber,customer:projection.customer,currencyCode:projection.currencyCode,taxBasis:projection.taxBasis,total:projection.total,lines:projection.lines};
        await tx.pos2Proposal.update({where:{id:convertedProposal.id},data:{draftVersionId:version.id,selectionFingerprint:projection.selectionFingerprint,projectionSnapshot:snapshot,total:projection.total,currencyCode:projection.currencyCode,taxBasis:projection.taxBasis}});
        await tx.pos2AuditLog.create({data:{actor,action:"PROPOSAL_UPDATED_BEFORE_ACCEPTANCE",entityType:"Pos2Proposal",entityId:convertedProposal.id,beforeJson:{draftVersionId:convertedProposal.draftVersionId,selectionFingerprint:convertedProposal.selectionFingerprint,total:String(convertedProposal.total)},afterJson:{draftVersionId:version.id,selectionFingerprint:projection.selectionFingerprint,total:String(projection.total),draftVersion:versionNumber}}});
      }
      await tx.pos2AuditLog.create({data:{actor,action:"SELECTION_DRAFT_VERSION_CREATED",entityType:"Pos2SelectionDraft",entityId:draft.id,afterJson:{draftCode:code,versionNumber,selectionFingerprint:projection.selectionFingerprint}}});
      return {draftCode:code,draftId:draft.id,versionId:version.id,versionNumber,proposalCode:convertedProposal?.proposalCode||null,unchanged:false};
    });
  }
  async function archiveDraft({draftCode,actor}) {
    const {assertCan,canAccessDraft}=require("./sales-auth-policy");
    const a=assertCan(actor,"DRAFT_WRITE_OWN"),code=normalizeDraftCode(draftCode);
    return prisma.$transaction(async tx=>{
      const draft=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:{select:{externalSubject:true}}}});
      if(!draft)throw new Error("Draft not found");
      if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"WRITE"))throw new Error("Draft access denied");
      if(draft.status==="ARCHIVED")return {draftCode:code,status:"ARCHIVED",unchanged:true};
      if(!["DRAFT","READY_FOR_REVIEW"].includes(draft.status))throw new Error("Only an active Draft can be deleted");
      const updated=await tx.pos2SelectionDraft.update({where:{id:draft.id},data:{status:"ARCHIVED"}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SELECTION_DRAFT_ARCHIVED",entityType:"Pos2SelectionDraft",entityId:draft.id,beforeJson:{status:draft.status},afterJson:{status:updated.status}}});
      return {draftCode:code,status:updated.status,unchanged:false};
    });
  }
  return {saveProjection,archiveDraft};
}

module.exports={normalizeDraftCode,createSalesDraftService};
