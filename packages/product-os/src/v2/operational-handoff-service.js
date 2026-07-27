const crypto=require("node:crypto");const {Prisma}=require("@prisma/client");const {assertCan}=require("./sales-auth-policy");const {normalizeProposalCode}=require("./sales-studio-service");
function clean(value){return String(value||"").trim();}
function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==="object"&&!(value instanceof Date))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));return value;}
function stableHash(value){return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");}
function waterLeakDeploymentNotes(lines){const codes=new Set(lines.map(x=>clean(x.productCode).toUpperCase()));const notes=[];if(codes.has("C-03"))notes.push("Kitchen Collection: install 1 × TIS-BEE-WTR-LEK-1 below the kitchen sink cabinet. Test local buzzer, screen alert, app push and displayed location.");if(codes.has("C-05"))notes.push("Bathroom Collection: install 1 × TIS-BEE-WTR-LEK-1 in the vanity cabinet or another splash-safe low point. Test local buzzer, screen alert, app push and displayed location.");if(codes.has("C-06"))notes.push("Away Collection: install 1 × TIS-BEE-WTR-LEK-1 at one customer-selected external water-risk location. Confirm the exact location at site walk; whole-home extension points require Away. Water leak detection stays active 24/7.");return notes;}
function waterLeakDeploymentNotes(lines){const codes=new Set(lines.map(x=>clean(x.productCode).toUpperCase()));const notes=[];if(codes.has("C-03"))notes.push("Kitchen Collection: install 1 × TIS-BEE-WTR-LEK-1 below the kitchen sink cabinet. Test local buzzer, screen alert, app push and displayed location.");if(codes.has("C-05"))notes.push("Bathroom Collection: install 1 × TIS-BEE-WTR-LEK-1 in the vanity cabinet or another splash-safe low point. Test local buzzer, screen alert, app push and displayed location.");if(codes.has("C-06"))notes.push("Away Collection: install 1 × TIS-BEE-WTR-LEK-1 at one customer-selected external water-risk location. Confirm the exact location at site walk; whole-home extension points require Away. Water leak detection stays active 24/7.");return notes;}
function buildDescription(proposal){const snapshot=proposal.projectionSnapshot||{},lines=Array.isArray(snapshot.lines)?snapshot.lines:[],proposalUrl=`https://sales.bhtechnology.com.au/sales/proposals/${proposal.proposalCode}`,waterLeakNotes=waterLeakDeploymentNotes(lines);return ["Better Home Installation",`Proposal: ${proposal.proposalCode}`,`Proposal details: ${proposalUrl}`,"","Accepted scope",...lines.map(x=>`${Number(x.quantity)||0} × ${clean(x.productName)||clean(x.productCode)}${x.productCode?` (${x.productCode})`:""}`),...(waterLeakNotes.length?["","WATER LEAK PROTECTION — INSTALLATION + TEST",...waterLeakNotes,"Do not configure automatic water-valve reopening. Any future shutoff option requires separate site assessment, inspection and manual reset."]:[]),"",`Accepted total: ${proposal.currencyCode} ${Number(proposal.total).toFixed(2)}`].join("\n");}
function createOperationalHandoffService(prisma){
  async function preview(actor,proposalCodeValue){
    assertCan(actor,"OPERATIONAL_HANDOFF_PREVIEW");const code=normalizeProposalCode(proposalCodeValue);
    const proposal=await prisma.pos2Proposal.findUnique({where:{proposalCode:code},include:{acceptance:true,operationalHandoff:true}});
    if(!proposal)throw new Error("Proposal not found");if(proposal.status!=="ACCEPTED"||!proposal.acceptance)throw new Error("Accepted Proposal required");const handoff=proposal.operationalHandoff;if(!handoff)throw new Error("Operational handoff not found");if(!["PENDING","FAILED"].includes(handoff.status))throw new Error(`Handoff preview unavailable while ${handoff.status}`);
    const rows=await prisma.$queryRaw(Prisma.sql`
      SELECT o.id::text AS opportunity_id,o.commercial_channel,o.service_m8_job_id,
        a.id::text AS account_id,a.name AS account_name,
        c.id::text AS contact_id,c.name AS contact_name,c.email AS contact_email,c.phone AS contact_phone,
        s.id::text AS asset_id,s.name AS asset_name,s.address AS asset_address,
        el.external_id AS servicem8_company_uuid
      FROM opportunities o
      JOIN accounts a ON a.id=o.account_id AND a.id::text=${handoff.crmAccountId}
      JOIN contacts c ON c.id=o.contact_id AND c.account_id=a.id AND c.id::text=${handoff.crmContactId}
      JOIN assets s ON s.id=o.asset_id AND s.account_id=a.id AND s.id::text=${handoff.crmAssetId}
      LEFT JOIN external_links el ON el.system='servicem8' AND el.external_entity_type='company' AND el.entity_type='account' AND el.entity_id=a.id
      WHERE o.id::text=${handoff.crmOpportunityId} AND o.commercial_channel='BETTER_HOME_PROPOSAL'
      LIMIT 1`);
    const crm=rows[0];if(!crm)throw new Error("CRM context no longer agrees with the accepted Proposal");
    const alreadyCreated=Boolean(crm.service_m8_job_id);const description=buildDescription(proposal),snapshot=proposal.projectionSnapshot||{},lineItems=(Array.isArray(snapshot.lines)?snapshot.lines:[]).map(x=>({productCode:clean(x.productCode),productName:clean(x.productName),quantity:Number(x.quantity),unitPrice:Number(x.unitPrice),lineTotal:Number(x.lineTotal)}));const payload={schemaVersion:"1.0.0",operation:handoff.operation,idempotencyKey:handoff.idempotencyKey,proposal:{id:proposal.id,code:proposal.proposalCode,fingerprint:proposal.selectionFingerprint,acceptedAt:proposal.acceptance.acceptedAt,total:Number(proposal.total),currencyCode:proposal.currencyCode},crm:{opportunityId:crm.opportunity_id,accountId:crm.account_id,contactId:crm.contact_id,assetId:crm.asset_id},company:{resolution:crm.servicem8_company_uuid?"EXISTING_LINK":"ENSURE_REQUIRED",serviceM8CompanyUuid:crm.servicem8_company_uuid||null},workOrder:{address:crm.asset_address||null,customerName:crm.contact_name||crm.account_name||null,customerEmail:crm.contact_email||null,customerPhone:crm.contact_phone||null,description,lineItems,taxBasis:proposal.taxBasis,serviceM8Status:"Work Order",statusPolicy:"ACCEPTED_BETTER_HOME_PROPOSAL"},existingJob:{found:alreadyCreated,serviceM8JobUuid:crm.service_m8_job_id||null}};
    const blockers=[!crm.asset_address&&"CRM_PROPERTY_ADDRESS_REQUIRED"].filter(Boolean),actions=[!crm.servicem8_company_uuid&&"ENSURE_SERVICEM8_COMPANY"].filter(Boolean);
    const payloadHash=stableHash(payload);return {dryRun:true,writesPerformed:false,handoffId:handoff.id,handoffStatus:handoff.status,authorizedAt:handoff.authorizedAt||null,authorizationCurrent:Boolean(handoff.authorizedAt&&handoff.authorizedPayloadHash===payloadHash),alreadyCreated,payload,payloadHash,blockers,actions};
  }
  async function authorize(actor,proposalCodeValue,input={}){const a=assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE"),expectedHash=clean(input.payloadHash);if(!expectedHash)throw new Error("Dry-run payload hash required");const current=await preview(a,proposalCodeValue);if(current.blockers.length)throw new Error(`Handoff has blockers: ${current.blockers.join(", ")}`);if(current.payloadHash!==expectedHash)throw new Error("Handoff preview changed; review it again");return prisma.$transaction(async tx=>{const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:a.userId},...(/^[0-9a-f-]{36}$/i.test(a.userId)?[{id:a.userId}]:[])]}});if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");const handoff=await tx.pos2OperationalHandoff.findUnique({where:{id:current.handoffId}});if(!handoff||!["PENDING","FAILED"].includes(handoff.status))throw new Error("Handoff is not available for authorization");if(handoff.authorizedAt&&handoff.authorizedPayloadHash===expectedHash)return {handoffId:handoff.id,status:handoff.status,authorizedAt:handoff.authorizedAt,unchanged:true};const now=new Date(),updated=await tx.pos2OperationalHandoff.update({where:{id:handoff.id},data:{authorizedByUserId:user.id,authorizedPayloadHash:expectedHash,authorizedPayloadSnapshot:current.payload,authorizedAt:now}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SERVICEM8_WORK_ORDER_HANDOFF_AUTHORIZED",entityType:"Pos2OperationalHandoff",entityId:handoff.id,afterJson:{proposalCode:current.payload.proposal.code,payloadHash:expectedHash,authorizedByUserId:user.id,authorizedAt:now.toISOString(),status:updated.status}}});return {handoffId:updated.id,status:updated.status,authorizedAt:updated.authorizedAt,unchanged:false};});}
  async function repairCrmContext(actor,proposalCodeValue,input={}){
    const a=assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE"),code=normalizeProposalCode(proposalCodeValue);
    const context={opportunityId:clean(input.opportunityId),accountId:clean(input.accountId),contactId:clean(input.contactId),assetId:clean(input.assetId),accountName:clean(input.accountName),contactName:clean(input.contactName),assetName:clean(input.assetName),assetAddress:clean(input.assetAddress),email:clean(input.email),phone:clean(input.phone)};
    if(![context.opportunityId,context.accountId,context.contactId,context.assetId].every(x=>/^[0-9a-f-]{36}$/i.test(x)))throw new Error("Complete live CRM context required");
    return prisma.$transaction(async tx=>{
      const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:a.userId},...(/^[0-9a-f-]{36}$/i.test(a.userId)?[{id:a.userId}]:[])]}});
      if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");
      const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code},include:{acceptance:true,operationalHandoff:true,draftVersion:{include:{draft:{include:{customerLink:true}}}}}});
      if(!proposal||proposal.status!=="ACCEPTED"||!proposal.acceptance)throw new Error("Accepted Proposal required");
      const handoff=proposal.operationalHandoff;if(!handoff||!["PENDING","FAILED"].includes(handoff.status))throw new Error("CRM repair is unavailable for this handoff");
      const before={crmOpportunityId:handoff.crmOpportunityId,crmAccountId:handoff.crmAccountId,crmContactId:handoff.crmContactId,crmAssetId:handoff.crmAssetId,authorizedAt:handoff.authorizedAt};
      const synchronized=await tx.$executeRaw`UPDATE opportunities SET asset_id=${context.assetId}::uuid,commercial_channel='BETTER_HOME_PROPOSAL',updated_at=NOW() WHERE id=${context.opportunityId}::uuid AND account_id=${context.accountId}::uuid AND contact_id=${context.contactId}::uuid`;
      if(synchronized!==1)throw new Error("Selected live CRM record is not available in the Product OS branch");
      const updated=await tx.pos2OperationalHandoff.update({where:{id:handoff.id},data:{crmOpportunityId:context.opportunityId,crmAccountId:context.accountId,crmContactId:context.contactId,crmAssetId:context.assetId,authorizedByUserId:null,authorizedPayloadHash:null,authorizedPayloadSnapshot:Prisma.DbNull,authorizedAt:null,lastError:null,status:"PENDING"}});
      const draft=proposal.draftVersion.draft,now=new Date(),snapshot={opportunityId:context.opportunityId,account:{id:context.accountId,name:context.accountName},contact:{id:context.contactId,name:context.contactName,email:context.email,phone:context.phone},asset:{id:context.assetId,name:context.assetName,address:context.assetAddress},source:"LIVE_CRM_REPAIR",capturedAt:now.toISOString()};
      await tx.pos2DraftCustomerLink.upsert({where:{draftId:draft.id},create:{draftId:draft.id,crmContactId:context.contactId,crmAccountId:context.accountId,crmAssetId:context.assetId,crmOpportunityId:context.opportunityId,status:"CONFIRMED",matchMethod:"MANUAL",candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now},update:{crmContactId:context.contactId,crmAccountId:context.accountId,crmAssetId:context.assetId,crmOpportunityId:context.opportunityId,status:"CONFIRMED",matchMethod:"MANUAL",candidateSnapshot:snapshot,confirmedByUserId:user.id,confirmedAt:now}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SERVICEM8_HANDOFF_CRM_CONTEXT_REPAIRED",entityType:"Pos2OperationalHandoff",entityId:handoff.id,beforeJson:before,afterJson:{crmOpportunityId:updated.crmOpportunityId,crmAccountId:updated.crmAccountId,crmContactId:updated.crmContactId,crmAssetId:updated.crmAssetId,authorizationCleared:true,repairedByUserId:user.id}}});
      return {proposalCode:code,handoffId:handoff.id,status:updated.status,authorizationCleared:true,context};
    });
  }
  async function beginExecution(actor,proposalCodeValue,input={}){
    const a=assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE"),code=normalizeProposalCode(proposalCodeValue),handoffId=clean(input.handoffId);
    if(!/^[0-9a-f-]{36}$/i.test(handoffId))throw new Error("Valid handoff ID required");
    return prisma.$transaction(async tx=>{
      const proposal=await tx.pos2Proposal.findUnique({where:{proposalCode:code},include:{acceptance:true,operationalHandoff:true}});
      if(!proposal||proposal.status!=="ACCEPTED"||!proposal.acceptance)throw new Error("Accepted Proposal required");
      const handoff=proposal.operationalHandoff;
      if(!handoff||handoff.id!==handoffId)throw new Error("Operational handoff does not match Proposal");
      if(handoff.status==="COMPLETED")return {alreadyCompleted:true,handoffId:handoff.id,jobUuid:handoff.serviceM8JobUuid};
      if(handoff.status==="PROCESSING")throw new Error("Operational handoff is already processing");
      if(!handoff.authorizedAt||!handoff.authorizedByUserId||!handoff.authorizedPayloadHash||!handoff.authorizedPayloadSnapshot)throw new Error("Administrator authorization required");
      if(stableHash(handoff.authorizedPayloadSnapshot)!==handoff.authorizedPayloadHash)throw new Error("Authorized handoff snapshot failed integrity check");
      const now=new Date();
      await tx.pos2OperationalHandoff.update({where:{id:handoff.id},data:{status:"PROCESSING",processingAt:now,attemptCount:{increment:1},lastError:null}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SERVICEM8_WORK_ORDER_HANDOFF_PROCESSING",entityType:"Pos2OperationalHandoff",entityId:handoff.id,afterJson:{proposalCode:code,payloadHash:handoff.authorizedPayloadHash,processingAt:now.toISOString()}}});
      return {alreadyCompleted:false,recoveryJobUuid:handoff.status==="FAILED"&&handoff.serviceM8JobUuid?handoff.serviceM8JobUuid:null,envelope:{schemaVersion:"1.0.0",handoffId:handoff.id,idempotencyKey:handoff.idempotencyKey,payloadHash:handoff.authorizedPayloadHash,payload:handoff.authorizedPayloadSnapshot}};
    });
  }
  async function executionEnvelope(actor,proposalCodeValue,input={}){
    assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE");const code=normalizeProposalCode(proposalCodeValue),handoffId=clean(input.handoffId);
    if(!/^[0-9a-f-]{36}$/i.test(handoffId))throw new Error("Valid handoff ID required");
    const proposal=await prisma.pos2Proposal.findUnique({where:{proposalCode:code},include:{acceptance:true,operationalHandoff:true}});
    if(!proposal||proposal.status!=="ACCEPTED"||!proposal.acceptance)throw new Error("Accepted Proposal required");
    const handoff=proposal.operationalHandoff;
    if(!handoff||handoff.id!==handoffId)throw new Error("Operational handoff does not match Proposal");
    if(!handoff.authorizedAt||!handoff.authorizedByUserId||!handoff.authorizedPayloadHash||!handoff.authorizedPayloadSnapshot)throw new Error("Administrator authorization required");
    if(stableHash(handoff.authorizedPayloadSnapshot)!==handoff.authorizedPayloadHash)throw new Error("Authorized handoff snapshot failed integrity check");
    return {schemaVersion:"1.0.0",handoffId:handoff.id,idempotencyKey:handoff.idempotencyKey,payloadHash:handoff.authorizedPayloadHash,payload:handoff.authorizedPayloadSnapshot};
  }
  async function finishExecution(actor,handoffIdValue,result={}){
    const a=assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE"),handoffId=clean(handoffIdValue),ok=result.ok===true,jobUuid=clean(result.job_uuid),error=clean(result.error).slice(0,1000);
    if(!/^[0-9a-f-]{36}$/i.test(handoffId))throw new Error("Valid handoff ID required");
    if(ok&&!jobUuid)throw new Error("Completed handoff requires ServiceM8 Job UUID");
    return prisma.$transaction(async tx=>{
      const handoff=await tx.pos2OperationalHandoff.findUnique({where:{id:handoffId}});
      if(!handoff)throw new Error("Operational handoff not found");
      if(handoff.status==="COMPLETED")return {status:"COMPLETED",jobUuid:handoff.serviceM8JobUuid,unchanged:true};
      if(handoff.status!=="PROCESSING")throw new Error("Operational handoff is not processing");
      const now=new Date(),status=ok?"COMPLETED":"FAILED";
      const updated=await tx.pos2OperationalHandoff.update({where:{id:handoff.id},data:{status,serviceM8JobUuid:jobUuid||null,lastError:ok?null:(error||"CRM handoff failed"),completedAt:ok?now:null}});
      await tx.pos2AuditLog.create({data:{actor:a.userId,action:ok?"SERVICEM8_WORK_ORDER_HANDOFF_COMPLETED":"SERVICEM8_WORK_ORDER_HANDOFF_FAILED",entityType:"Pos2OperationalHandoff",entityId:handoff.id,afterJson:{status,serviceM8JobUuid:jobUuid||null,error:ok?null:(error||"CRM handoff failed"),finishedAt:now.toISOString()}}});
      return {status:updated.status,jobUuid:updated.serviceM8JobUuid,unchanged:false};
    });
  }
  return {preview,authorize,repairCrmContext,executionEnvelope,beginExecution,finishExecution};
}
module.exports={buildDescription,waterLeakDeploymentNotes,canonicalize,stableHash,createOperationalHandoffService};
