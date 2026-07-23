const test=require("node:test");
const assert=require("node:assert/strict");
const {createSalesDraftService}=require("../../src/v2/sales-draft-service");

test("deleting an active cart archives the Draft and leaves an audit record",async()=>{
  let update,audit;
  const tx={
    pos2SelectionDraft:{
      findUnique:async()=>({id:"d1",draftCode:"DRAFT-12345678",status:"DRAFT",ownerUser:{externalSubject:"sales-1"}}),
      update:async input=>(update=input,{...input.data,id:"d1"})
    },
    pos2AuditLog:{create:async input=>(audit=input)}
  };
  const result=await createSalesDraftService({$transaction:fn=>fn(tx)}).archiveDraft({
    draftCode:"DRAFT-12345678",
    actor:{userId:"sales-1",role:"SALES"}
  });
  assert.equal(result.status,"ARCHIVED");
  assert.deepEqual(update.data,{status:"ARCHIVED"});
  assert.equal(audit.data.action,"SELECTION_DRAFT_ARCHIVED");
});

test("a Proposal source cannot be deleted as a Draft",async()=>{
  const tx={
    pos2SelectionDraft:{findUnique:async()=>({id:"d1",status:"CONVERTED",ownerUser:{externalSubject:"sales-1"}})}
  };
  await assert.rejects(
    ()=>createSalesDraftService({$transaction:fn=>fn(tx)}).archiveDraft({
      draftCode:"DRAFT-12345678",
      actor:{userId:"sales-1",role:"SALES"}
    }),
    /Only an active Draft/
  );
});
