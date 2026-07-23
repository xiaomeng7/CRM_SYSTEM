const test=require("node:test");
const assert=require("node:assert/strict");
const {createCrmCustomerOnboardingService}=require("../../src/v2/crm-customer-onboarding-service");

test("confirmed CRM customer context is idempotent",async()=>{
  const tx={
    pos2SalesUser:{findFirst:async()=>({id:"u1",status:"ACTIVE"})},
    pos2SelectionDraft:{findUnique:async()=>({id:"d1",draftCode:"DRAFT-12345678",ownerUser:{externalSubject:"sales-1"},customerLink:{status:"CONFIRMED",crmContactId:"c1"}})}
  };
  const result=await createCrmCustomerOnboardingService({$transaction:fn=>fn(tx)}).ensure({userId:"sales-1",role:"SALES"},"DRAFT-12345678");
  assert.deepEqual(result,{draftCode:"DRAFT-12345678",status:"CONFIRMED",unchanged:true,crmContactId:"c1"});
});

test("sales cannot onboard a customer for another owner's Draft",async()=>{
  const tx={
    pos2SalesUser:{findFirst:async()=>({id:"u1",status:"ACTIVE"})},
    pos2SelectionDraft:{findUnique:async()=>({id:"d1",draftCode:"DRAFT-12345678",ownerUser:{externalSubject:"other-sales"},customerLink:null})}
  };
  await assert.rejects(()=>createCrmCustomerOnboardingService({$transaction:fn=>fn(tx)}).ensure({userId:"sales-1",role:"SALES"},"DRAFT-12345678"),/access denied/);
});
