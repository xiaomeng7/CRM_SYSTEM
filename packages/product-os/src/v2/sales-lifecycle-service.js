const crypto=require("node:crypto");
const {assertCan,canAccessDraft}=require("./sales-auth-policy");
const {normalizeDraftCode}=require("./sales-draft-service");
const {normalizeProposalCode}=require("./sales-studio-service");

function proposalCode(draftCode,versionNumber){
  const digest=crypto.createHash("sha256").update(`${draftCode}:v${versionNumber}`).digest("hex").slice(0,10).toUpperCase();
  return `PROP-${digest}`;
}

function createSalesLifecycleService(prisma){
  async function activeUser(tx,actor){
    const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:actor.userId},...(/^[0-9a-f-]{36}$/i.test(actor.userId)?[{id:actor.userId}]:[])]}});
    if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");
    return user;
  }
  async function markReady(actor,draftCode){
    const a=assertCan(actor,"DRAFT_WRITE_OWN"),code=normalizeDraftCode(draftCode);
    return prisma.$transaction(async tx=>{
      const user=await activeUser(tx,a);const draft=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:true}});
      if(!draft)throw new Error("Draft not found");if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"WRITE"))throw new Error("Draft access denied");
      if(draft.currentVersion<1)throw new Error("Draft has no version");
      if(draft.status==="READY_FOR_REVIEW")return {draftCode:code,status:draft.status,unchanged:true};
      if(draft.status!=="DRAFT")throw new Error(`Cannot mark ${draft.status} ready`);
      const updated=await tx.pos2SelectionDraft.update({where:{id:draft.id},data:{status:"READY_FOR_REVIEW"}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SELECTION_DRAFT_READY_FOR_REVIEW",entityType:"Pos2SelectionDraft",entityId:draft.id,beforeJson:{status:draft.status},afterJson:{status:updated.status,actorUserId:user.id}}});
      return {draftCode:code,status:updated.status,unchanged:false};
    });
  }
  async function createProposal(actor,draftCode){
    const a=assertCan(actor,"PROPOSAL_CREATE_OWN"),code=normalizeDraftCode(draftCode);
    return prisma.$transaction(async tx=>{
      await activeUser(tx,a);const draft=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:true}});
      if(!draft)throw new Error("Draft not found");if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"WRITE"))throw new Error("Draft access denied");if(draft.status!=="READY_FOR_REVIEW")throw new Error("Draft must be ready for review");
      const version=await tx.pos2SelectionDraftVersion.findUnique({where:{draftId_versionNumber:{draftId:draft.id,versionNumber:draft.currentVersion}},include:{lines:{orderBy:{productCodeSnapshot:"asc"}}}});
      if(!version)throw new Error("Current Draft version not found");const codeOut=proposalCode(code,version.versionNumber);
      const existing=await tx.pos2Proposal.findUnique({where:{proposalCode:codeOut}});if(existing)return {proposalCode:existing.proposalCode,status:existing.status,unchanged:true};
      const snapshot={schemaVersion:"1.0.0",draftCode:code,draftVersion:version.versionNumber,customer:version.customerSnapshot,currencyCode:version.currencyCode,taxBasis:version.taxBasis,total:Number(version.total),lines:version.lines.map(x=>({productCode:x.productCodeSnapshot,productName:x.productNameSnapshot,quantity:x.quantity,unitPrice:Number(x.unitPrice),lineTotal:Number(x.lineTotal)}))};
      const proposal=await tx.pos2Proposal.create({data:{proposalCode:codeOut,draftVersionId:version.id,status:"DRAFT",selectionFingerprint:version.selectionFingerprint,projectionSnapshot:snapshot,total:version.total,currencyCode:version.currencyCode,taxBasis:version.taxBasis}});
      await tx.pos2SelectionDraft.update({where:{id:draft.id},data:{status:"CONVERTED"}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"PROPOSAL_CREATED_FROM_DRAFT_VERSION",entityType:"Pos2Proposal",entityId:proposal.id,afterJson:{proposalCode:proposal.proposalCode,draftCode:code,draftVersion:version.versionNumber}}});
      return {proposalCode:proposal.proposalCode,status:proposal.status,draftVersion:version.versionNumber,unchanged:false};
    });
  }
  async function reviewProposal(actor,proposalCodeValue){
    const a=assertCan(actor,"PROPOSAL_REVIEW"),code=normalizeProposalCode(proposalCodeValue);
    return prisma.$transaction(async tx=>{await activeUser(tx,a);const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code}});if(!proposal)throw new Error("Proposal not found");if(proposal.status==="INTERNAL_REVIEW")return {proposalCode:code,status:proposal.status,unchanged:true};if(proposal.status!=="DRAFT")throw new Error(`Cannot review ${proposal.status} Proposal`);const updated=await tx.pos2Proposal.update({where:{id:proposal.id},data:{status:"INTERNAL_REVIEW"}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"PROPOSAL_INTERNAL_REVIEW_STARTED",entityType:"Pos2Proposal",entityId:proposal.id,beforeJson:{status:proposal.status},afterJson:{status:updated.status}}});return {proposalCode:code,status:updated.status,unchanged:false};});
  }
  async function approveProposal(actor,proposalCodeValue){
    const a=assertCan(actor,"PROPOSAL_APPROVE"),code=normalizeProposalCode(proposalCodeValue);
    return prisma.$transaction(async tx=>{const user=await activeUser(tx,a);const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code},include:{draftVersion:{include:{draft:{include:{customerLink:true}}}}}});if(!proposal)throw new Error("Proposal not found");if(proposal.status==="APPROVED")return {proposalCode:code,status:proposal.status,unchanged:true};if(proposal.status!=="INTERNAL_REVIEW")throw new Error("Proposal must be in internal review");if(proposal.draftVersion.draft.customerLink?.status!=="CONFIRMED")throw new Error("Customer link must be confirmed before approval");const now=new Date();const updated=await tx.pos2Proposal.update({where:{id:proposal.id},data:{status:"APPROVED",approvedBy:a.userId,approvedByUserId:user.id,approvedAt:now}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"PROPOSAL_APPROVED",entityType:"Pos2Proposal",entityId:proposal.id,beforeJson:{status:proposal.status},afterJson:{status:updated.status,approvedByUserId:user.id,approvedAt:now.toISOString()}}});return {proposalCode:code,status:updated.status,approvedAt:now,unchanged:false};});
  }
  async function recordProposalDelivery(actor,proposalCodeValue,input={}){
    const a=assertCan(actor,"PROPOSAL_SEND"),code=normalizeProposalCode(proposalCodeValue),channel=String(input.channel||"").trim().toUpperCase(),recipient=String(input.recipient||"").trim(),evidenceReference=String(input.evidenceReference||"").trim();
    if(!["EMAIL","MANUAL_HANDOFF","OTHER"].includes(channel))throw new Error("Valid delivery channel required");
    if(!evidenceReference)throw new Error("Delivery evidence reference required");
    return prisma.$transaction(async tx=>{const user=await activeUser(tx,a);const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code},include:{deliveries:{orderBy:{deliveredAt:"desc"},take:1}}});if(!proposal)throw new Error("Proposal not found");if(["SENT","ACCEPTED"].includes(proposal.status))return {proposalCode:code,status:proposal.status,unchanged:true};if(proposal.status!=="APPROVED")throw new Error("Proposal must be approved before delivery");const deliveredAt=input.deliveredAt?new Date(input.deliveredAt):new Date();if(Number.isNaN(deliveredAt.getTime())||deliveredAt.getTime()>Date.now()+300000)throw new Error("Valid delivery time required");const delivery=await tx.pos2ProposalDelivery.create({data:{proposalId:proposal.id,channel,recipient:recipient||null,evidenceReference,recordedByUserId:user.id,deliveredAt}});const updated=await tx.pos2Proposal.update({where:{id:proposal.id},data:{status:"SENT",sentAt:deliveredAt}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"PROPOSAL_DELIVERY_RECORDED",entityType:"Pos2ProposalDelivery",entityId:delivery.id,afterJson:{proposalCode:code,status:updated.status,channel,recipient:recipient||null,evidenceReference,recordedByUserId:user.id,deliveredAt:deliveredAt.toISOString()}}});return {proposalCode:code,status:updated.status,deliveredAt,unchanged:false};});
  }
  async function recordProposalAcceptance(actor,proposalCodeValue,input={}){
    const a=assertCan(actor,"PROPOSAL_ACCEPT_RECORD"),code=normalizeProposalCode(proposalCodeValue),method=String(input.method||"").trim().toUpperCase(),evidenceReference=String(input.evidenceReference||"").trim(),acceptedByName=String(input.acceptedByName||"").trim(),acceptedByContact=String(input.acceptedByContact||"").trim(),notes=String(input.notes||"").trim();
    if(!["SIGNED_DOCUMENT","EMAIL_CONFIRMATION","PORTAL","IN_PERSON","OTHER"].includes(method))throw new Error("Valid acceptance method required");if(!evidenceReference||!acceptedByName)throw new Error("Acceptance evidence and customer name are required");
    return prisma.$transaction(async tx=>{const user=await activeUser(tx,a);const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code},include:{acceptance:true,draftVersion:{include:{draft:{include:{customerLink:true}}}}}});if(!proposal)throw new Error("Proposal not found");if(proposal.status==="ACCEPTED"&&proposal.acceptance)return {proposalCode:code,status:proposal.status,unchanged:true};if(proposal.status!=="SENT")throw new Error("Proposal must be sent before acceptance");const link=proposal.draftVersion.draft.customerLink;if(link?.status!=="CONFIRMED"||!link.crmOpportunityId||!link.crmAccountId||!link.crmContactId||!link.crmAssetId)throw new Error("Complete confirmed CRM context required");const acceptedAt=input.acceptedAt?new Date(input.acceptedAt):new Date();if(Number.isNaN(acceptedAt.getTime())||acceptedAt.getTime()>Date.now()+300000)throw new Error("Valid acceptance time required");const acceptance=await tx.pos2ProposalAcceptance.create({data:{proposalId:proposal.id,method,evidenceReference,acceptedFingerprint:proposal.selectionFingerprint,acceptedTotal:proposal.total,currencyCode:proposal.currencyCode,acceptedByName,acceptedByContact:acceptedByContact||null,notes:notes||null,recordedByUserId:user.id,acceptedAt}});const key=`servicem8-work-order:${code}:${proposal.selectionFingerprint}`;const handoff=await tx.pos2OperationalHandoff.create({data:{proposalId:proposal.id,idempotencyKey:key,crmOpportunityId:link.crmOpportunityId,crmAccountId:link.crmAccountId,crmContactId:link.crmContactId,crmAssetId:link.crmAssetId}});const updated=await tx.pos2Proposal.update({where:{id:proposal.id},data:{status:"ACCEPTED"}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"PROPOSAL_ACCEPTANCE_RECORDED",entityType:"Pos2ProposalAcceptance",entityId:acceptance.id,afterJson:{proposalCode:code,status:updated.status,method,evidenceReference,acceptedFingerprint:proposal.selectionFingerprint,acceptedTotal:String(proposal.total),acceptedByName,acceptedAt:acceptedAt.toISOString(),handoffId:handoff.id,handoffStatus:handoff.status}}});return {proposalCode:code,status:updated.status,acceptedAt,handoffStatus:handoff.status,unchanged:false};});
  }
  return {markReady,createProposal,reviewProposal,approveProposal,recordProposalDelivery,recordProposalAcceptance};
}
module.exports={proposalCode,createSalesLifecycleService};
