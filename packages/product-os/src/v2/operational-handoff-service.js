const crypto=require("node:crypto");const {Prisma}=require("@prisma/client");const {assertCan}=require("./sales-auth-policy");const {normalizeProposalCode}=require("./sales-studio-service");
function clean(value){return String(value||"").trim();}
function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==="object"&&!(value instanceof Date))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalize(value[key])]));return value;}
function stableHash(value){return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");}
function buildDescription(proposal){const snapshot=proposal.projectionSnapshot||{},lines=Array.isArray(snapshot.lines)?snapshot.lines:[];return [`Better Home Proposal ${proposal.proposalCode}`,`Accepted scope fingerprint: ${proposal.selectionFingerprint}`,"",...lines.map(x=>`${Number(x.quantity)||0} × ${clean(x.productName)||clean(x.productCode)}${x.productCode?` (${x.productCode})`:""}`),"",`Accepted total: ${proposal.currencyCode} ${Number(proposal.total).toFixed(2)}`].join("\n");}
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
    const alreadyCreated=Boolean(crm.service_m8_job_id);const description=buildDescription(proposal);const payload={schemaVersion:"1.0.0",operation:handoff.operation,idempotencyKey:handoff.idempotencyKey,proposal:{id:proposal.id,code:proposal.proposalCode,fingerprint:proposal.selectionFingerprint,acceptedAt:proposal.acceptance.acceptedAt,total:Number(proposal.total),currencyCode:proposal.currencyCode},crm:{opportunityId:crm.opportunity_id,accountId:crm.account_id,contactId:crm.contact_id,assetId:crm.asset_id},company:{resolution:crm.servicem8_company_uuid?"EXISTING_LINK":"ENSURE_REQUIRED",serviceM8CompanyUuid:crm.servicem8_company_uuid||null},workOrder:{address:crm.asset_address||null,customerName:crm.contact_name||crm.account_name||null,customerEmail:crm.contact_email||null,customerPhone:crm.contact_phone||null,description,serviceM8Status:"Work Order",statusPolicy:"ACCEPTED_BETTER_HOME_PROPOSAL"},existingJob:{found:alreadyCreated,serviceM8JobUuid:crm.service_m8_job_id||null}};
    const blockers=[!crm.asset_address&&"CRM_PROPERTY_ADDRESS_REQUIRED"].filter(Boolean),actions=[!crm.servicem8_company_uuid&&"ENSURE_SERVICEM8_COMPANY"].filter(Boolean);
    const payloadHash=stableHash(payload);return {dryRun:true,writesPerformed:false,handoffId:handoff.id,handoffStatus:handoff.status,authorizedAt:handoff.authorizedAt||null,authorizationCurrent:Boolean(handoff.authorizedAt&&handoff.authorizedPayloadHash===payloadHash),alreadyCreated,payload,payloadHash,blockers,actions};
  }
  async function authorize(actor,proposalCodeValue,input={}){const a=assertCan(actor,"OPERATIONAL_HANDOFF_AUTHORIZE"),expectedHash=clean(input.payloadHash);if(!expectedHash)throw new Error("Dry-run payload hash required");const current=await preview(a,proposalCodeValue);if(current.blockers.length)throw new Error(`Handoff has blockers: ${current.blockers.join(", ")}`);if(current.payloadHash!==expectedHash)throw new Error("Handoff preview changed; review it again");return prisma.$transaction(async tx=>{const user=await tx.pos2SalesUser.findFirst({where:{OR:[{externalSubject:a.userId},...(/^[0-9a-f-]{36}$/i.test(a.userId)?[{id:a.userId}]:[])]}});if(!user||user.status!=="ACTIVE")throw new Error("Active Sales Studio user required");const handoff=await tx.pos2OperationalHandoff.findUnique({where:{id:current.handoffId}});if(!handoff||!["PENDING","FAILED"].includes(handoff.status))throw new Error("Handoff is not available for authorization");if(handoff.authorizedAt&&handoff.authorizedPayloadHash===expectedHash)return {handoffId:handoff.id,status:handoff.status,authorizedAt:handoff.authorizedAt,unchanged:true};const now=new Date(),updated=await tx.pos2OperationalHandoff.update({where:{id:handoff.id},data:{authorizedByUserId:user.id,authorizedPayloadHash:expectedHash,authorizedPayloadSnapshot:current.payload,authorizedAt:now}});await tx.pos2AuditLog.create({data:{actor:a.userId,action:"SERVICEM8_WORK_ORDER_HANDOFF_AUTHORIZED",entityType:"Pos2OperationalHandoff",entityId:handoff.id,afterJson:{proposalCode:current.payload.proposal.code,payloadHash:expectedHash,authorizedByUserId:user.id,authorizedAt:now.toISOString(),status:updated.status}}});return {handoffId:updated.id,status:updated.status,authorizedAt:updated.authorizedAt,unchanged:false};});}
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
      return {alreadyCompleted:false,envelope:{schemaVersion:"1.0.0",handoffId:handoff.id,idempotencyKey:handoff.idempotencyKey,payloadHash:handoff.authorizedPayloadHash,payload:handoff.authorizedPayloadSnapshot}};
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
  return {preview,authorize,executionEnvelope,beginExecution,finishExecution};
}
module.exports={buildDescription,canonicalize,stableHash,createOperationalHandoffService};
