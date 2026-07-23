const {assertCan,canAccessDraft}=require("./sales-auth-policy");
const {normalizeDraftCode}=require("./sales-draft-service");

const clean=value=>String(value||"").trim();

function createCrmCustomerOnboardingService(prisma){
  async function ensure(actor,draftCode){
    const a=assertCan(actor,"DRAFT_WRITE_OWN"),code=normalizeDraftCode(draftCode);
    return prisma.$transaction(async tx=>{
      const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:a.userId},...(/^[0-9a-f-]{36}$/i.test(a.userId)?[{id:a.userId}]:[])]}});
      if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");
      const draft=await tx.pos2SelectionDraft.findUnique({where:{draftCode:code},include:{ownerUser:true,customerLink:true}});
      if(!draft)throw new Error("Draft not found");
      if(!canAccessDraft(a,draft.ownerUser?.externalSubject,"WRITE"))throw new Error("Draft access denied");
      if(draft.customerLink?.status==="CONFIRMED")return {draftCode:code,status:"CONFIRMED",unchanged:true,crmContactId:draft.customerLink.crmContactId};
      const name=clean(draft.customerName),email=clean(draft.customerEmail).toLowerCase(),phone=clean(draft.customerPhone),address=clean(draft.siteAddress);
      if(!name||!address)throw new Error("Customer name and installation address are required");

      const matches=email
        ? await tx.$queryRaw`SELECT id::text,account_id::text FROM contacts WHERE lower(email)=lower(${email}) ORDER BY updated_at DESC LIMIT 2`
        : phone
          ? await tx.$queryRaw`SELECT id::text,account_id::text FROM contacts WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(${phone},'[^0-9]','','g') ORDER BY updated_at DESC LIMIT 2`
          : [];
      let accountId,contactId,matchMethod;
      if(matches.length===1&&matches[0].account_id){
        accountId=matches[0].account_id;contactId=matches[0].id;matchMethod=email?"EMAIL_EXACT":"PHONE_EXACT";
      }else{
        const accounts=await tx.$queryRaw`INSERT INTO accounts (name,address_line,status,created_by) VALUES (${name},${address},'active',${a.userId}) RETURNING id::text`;
        accountId=accounts[0].id;
        const contacts=await tx.$queryRaw`INSERT INTO contacts (account_id,name,email,phone,role,status,created_by) VALUES (${accountId}::uuid,${name},${email||null},${phone||null},'Customer','active',${a.userId}) RETURNING id::text`;
        contactId=contacts[0].id;matchMethod="NEW_CUSTOMER";
      }
      const existingAssets=await tx.$queryRaw`SELECT id::text FROM assets WHERE account_id=${accountId}::uuid AND lower(coalesce(address,''))=lower(${address}) LIMIT 1`;
      const assetId=existingAssets[0]?.id||(await tx.$queryRaw`INSERT INTO assets (account_id,name,asset_type,address,status,created_by) VALUES (${accountId}::uuid,${address},'residential_property',${address},'active',${a.userId}) RETURNING id::text`)[0].id;
      const existingOpportunities=await tx.$queryRaw`SELECT id::text FROM opportunities WHERE contact_id=${contactId}::uuid AND asset_id=${assetId}::uuid AND commercial_channel='BETTER_HOME_PROPOSAL' AND status='open' ORDER BY updated_at DESC LIMIT 1`;
      const latest=await tx.pos2SelectionDraftVersion.findFirst({where:{draftId:draft.id},orderBy:{versionNumber:"desc"},select:{total:true}});
      const opportunityId=existingOpportunities[0]?.id||(await tx.$queryRaw`INSERT INTO opportunities (account_id,contact_id,asset_id,commercial_channel,stage,status,value_estimate,created_by) VALUES (${accountId}::uuid,${contactId}::uuid,${assetId}::uuid,'BETTER_HOME_PROPOSAL','proposal','open',${latest?.total||null},${a.userId}) RETURNING id::text`)[0].id;
      const now=new Date(),snapshot={opportunityId,commercialChannel:"BETTER_HOME_PROPOSAL",account:{id:accountId,name},contact:{id:contactId,name,email:email||null,phone:phone||null},asset:{id:assetId,address},capturedAt:now.toISOString()};
      const link=await tx.pos2DraftCustomerLink.upsert({where:{draftId:draft.id},create:{draftId:draft.id,crmContactId:contactId,crmAccountId:accountId,crmAssetId:assetId,crmOpportunityId:opportunityId,status:"CONFIRMED",matchMethod,candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now},update:{crmContactId:contactId,crmAccountId:accountId,crmAssetId:assetId,crmOpportunityId:opportunityId,status:"CONFIRMED",matchMethod,candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"DRAFT_CRM_CUSTOMER_ENSURED",entityType:"Pos2DraftCustomerLink",entityId:link.id,afterJson:{draftCode:code,crmContactId:contactId,crmAccountId:accountId,crmAssetId:assetId,crmOpportunityId:opportunityId}}});
      return {draftCode:code,status:"CONFIRMED",unchanged:false,crmContactId:contactId,crmOpportunityId:opportunityId};
    });
  }
  return {ensure};
}

module.exports={createCrmCustomerOnboardingService};
