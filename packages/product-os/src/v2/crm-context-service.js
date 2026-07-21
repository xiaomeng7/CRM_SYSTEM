const {Prisma}=require("@prisma/client");const {assertCan,canAccessDraft}=require("./sales-auth-policy");const {normalizeDraftCode}=require("./sales-draft-service");
function clean(value){return String(value||"").trim();}
function createCrmContextService(prisma){
  async function accessibleDraft(actor,draftCode,action="READ"){
    const a=assertCan(actor,action==="WRITE"?"DRAFT_WRITE_OWN":"CATALOG_READ"),code=normalizeDraftCode(draftCode);const draft=await prisma.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:true}});if(!draft)throw new Error("Draft not found");if(!canAccessDraft(a,draft.ownerUser?.externalSubject,action))throw new Error("Draft access denied");return {a,draft};
  }
  async function search(actor,{draftCode,query=""}){
    const {draft}=await accessibleDraft(actor,draftCode);const term=clean(query)||clean(draft.customerEmail)||clean(draft.customerPhone)||clean(draft.customerName);const like=`%${term}%`;
    const rows=await prisma.$queryRaw(Prisma.sql`
      SELECT o.id::text AS opportunity_id,o.stage,o.status,o.commercial_channel,
        a.id::text AS account_id,a.name AS account_name,
        c.id::text AS contact_id,c.name AS contact_name,c.email,c.phone,
        s.id::text AS asset_id,s.name AS asset_name,s.address AS asset_address
      FROM opportunities o
      LEFT JOIN accounts a ON a.id=o.account_id
      LEFT JOIN contacts c ON c.id=o.contact_id
      LEFT JOIN assets s ON s.id=o.asset_id
      WHERE o.commercial_channel='BETTER_HOME_PROPOSAL'
        AND (${term===""} OR COALESCE(c.name,'') ILIKE ${like} OR COALESCE(c.email,'') ILIKE ${like} OR COALESCE(c.phone,'') ILIKE ${like} OR COALESCE(a.name,'') ILIKE ${like} OR COALESCE(s.address,'') ILIKE ${like})
      ORDER BY o.updated_at DESC LIMIT 25`);
    return rows.map(x=>({...x,eligible:Boolean(x.contact_id&&x.account_id&&x.asset_id),missing:[!x.contact_id&&"Contact",!x.account_id&&"Account",!x.asset_id&&"Property"].filter(Boolean)}));
  }
  async function confirm(actor,{draftCode,opportunityId}){
    const a=assertCan(actor,"DRAFT_WRITE_OWN"),code=normalizeDraftCode(draftCode),opportunity=clean(opportunityId);
    if(!opportunity)throw new Error("CRM Opportunity is required");
    return prisma.$transaction(async tx=>{
      const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:a.userId},...(/^[0-9a-f-]{36}$/i.test(a.userId)?[{id:a.userId}]:[])]}});
      if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");
      const draft=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:true,customerLink:true}});
      if(!draft)throw new Error("Draft not found");
      if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"WRITE"))throw new Error("Draft access denied");
      const rows=await tx.$queryRaw(Prisma.sql`
        SELECT o.id::text AS opportunity_id,o.stage,o.status,o.commercial_channel,
          a.id::text AS account_id,a.name AS account_name,
          c.id::text AS contact_id,c.name AS contact_name,c.email,c.phone,
          s.id::text AS asset_id,s.name AS asset_name,s.address AS asset_address
        FROM opportunities o
        JOIN accounts a ON a.id=o.account_id
        JOIN contacts c ON c.id=o.contact_id AND c.account_id=o.account_id
        JOIN assets s ON s.id=o.asset_id AND s.account_id=o.account_id
        WHERE o.id::text=${opportunity} AND o.commercial_channel='BETTER_HOME_PROPOSAL'
        LIMIT 1`);
      const context=rows[0];
      if(!context)throw new Error("CRM context is no longer complete or eligible");
      const existing=draft.customerLink;
      if(existing?.status==="CONFIRMED"&&existing.crmOpportunityId===context.opportunity_id)return {draftCode:code,status:"CONFIRMED",unchanged:true,context};
      if(existing?.status==="CONFIRMED")throw new Error("Draft already has a confirmed CRM customer link");
      const now=new Date(),snapshot={opportunityId:context.opportunity_id,stage:context.stage,status:context.status,commercialChannel:context.commercial_channel,account:{id:context.account_id,name:context.account_name},contact:{id:context.contact_id,name:context.contact_name,email:context.email,phone:context.phone},asset:{id:context.asset_id,name:context.asset_name,address:context.asset_address},capturedAt:now.toISOString()};
      const link=await tx.pos2DraftCustomerLink.upsert({where:{draftId:draft.id},create:{draftId:draft.id,crmContactId:context.contact_id,crmAccountId:context.account_id,crmAssetId:context.asset_id,crmOpportunityId:context.opportunity_id,status:"CONFIRMED",matchMethod:"MANUAL",candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now},update:{crmContactId:context.contact_id,crmAccountId:context.account_id,crmAssetId:context.asset_id,crmOpportunityId:context.opportunity_id,status:"CONFIRMED",matchMethod:"MANUAL",candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"DRAFT_CRM_CONTEXT_CONFIRMED",entityType:"Pos2DraftCustomerLink",entityId:link.id,beforeJson:existing?{status:existing.status,crmOpportunityId:existing.crmOpportunityId}:null,afterJson:{status:link.status,crmContactId:link.crmContactId,crmAccountId:link.crmAccountId,crmAssetId:link.crmAssetId,crmOpportunityId:link.crmOpportunityId,confirmedByUserId:user.id}}});
      return {draftCode:code,status:link.status,unchanged:false,context};
    });
  }
  return {search,confirm};
}
module.exports={createCrmContextService};
