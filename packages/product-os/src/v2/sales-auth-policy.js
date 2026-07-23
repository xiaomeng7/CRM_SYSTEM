const ROLES=Object.freeze(["SALES","MANAGER","ADMIN"]);
const PERMISSIONS=Object.freeze({
  SALES:new Set(["CATALOG_READ","DRAFT_CREATE","DRAFT_READ_OWN","DRAFT_WRITE_OWN","PROPOSAL_PREVIEW","PROPOSAL_CREATE_OWN"]),
  MANAGER:new Set(["CATALOG_READ","DRAFT_CREATE","DRAFT_READ_OWN","DRAFT_WRITE_OWN","DRAFT_READ_ALL","DRAFT_WRITE_ALL","PROPOSAL_PREVIEW","PROPOSAL_CREATE_OWN","PROPOSAL_REVIEW","PROPOSAL_APPROVE","PROPOSAL_ACCEPT_RECORD","OPERATIONAL_HANDOFF_PREVIEW"]),
  ADMIN:new Set(["CATALOG_READ","DRAFT_CREATE","DRAFT_READ_OWN","DRAFT_WRITE_OWN","DRAFT_READ_ALL","DRAFT_WRITE_ALL","PROPOSAL_PREVIEW","PROPOSAL_CREATE_OWN","PROPOSAL_REVIEW","PROPOSAL_APPROVE","PROPOSAL_SEND","PROPOSAL_ACCEPT_RECORD","OPERATIONAL_HANDOFF_PREVIEW","OPERATIONAL_HANDOFF_AUTHORIZE","USER_ADMIN","PRODUCT_OS_ADMIN"])
});

function normalizeActor(input={}){
  const userId=String(input.userId||"").trim(),email=String(input.email||"").trim().toLowerCase(),role=String(input.role||"").trim().toUpperCase();
  if(!userId||!ROLES.includes(role))throw new Error("Authenticated Sales Studio actor required");
  return {userId,email:email||null,role};
}
function can(actor,permission){const a=normalizeActor(actor);return PERMISSIONS[a.role].has(permission);}
function assertCan(actor,permission){const a=normalizeActor(actor);if(!can(a,permission)){const error=new Error(`Permission denied: ${permission}`);error.code="SALES_STUDIO_FORBIDDEN";throw error;}return a;}
function canAccessDraft(actor,draftOwnerId,action="READ"){
  const a=normalizeActor(actor),own=String(draftOwnerId||"")===a.userId;
  return own?can(a,`DRAFT_${action}_OWN`):can(a,`DRAFT_${action}_ALL`);
}

module.exports={ROLES,PERMISSIONS,normalizeActor,can,assertCan,canAccessDraft};
