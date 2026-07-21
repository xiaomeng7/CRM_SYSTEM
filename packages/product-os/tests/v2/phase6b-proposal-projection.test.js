const test=require("node:test");const assert=require("node:assert/strict");
const {buildProposalProjection}=require("../../src/v2/proposal-projection");

test("proposal projection is deterministic apart from generatedAt",()=>{
  const input={customer:{name:"  Jane Homeowner "},quote:{valid:true,currencyCode:"AUD",taxBasis:"GST_INCLUSIVE",total:3998,lines:[{productCode:"C-02",quantity:1,unitPrice:2999,lineTotal:2999},{productCode:"F-01",quantity:1,unitPrice:999,lineTotal:999}]}};
  const a=buildProposalProjection(input),b=buildProposalProjection(input);
  assert.equal(a.proposalId,b.proposalId);assert.equal(a.selectionFingerprint,b.selectionFingerprint);assert.equal(a.customer.name,"Jane Homeowner");assert.equal(a.downstream.serviceM8,"NOT_CREATED");
});

test("proposal projection refuses an invalid quote",()=>assert.throws(()=>buildProposalProjection({quote:{valid:false}}),/valid selection quote/));
