const test=require("node:test");const assert=require("node:assert/strict");
const {evaluateCustomerMatch}=require("../../src/v2/customer-match-policy");

test("explicit CRM contact ID is the only automatic link",()=>assert.deepEqual(evaluateCustomerMatch({input:{crmContactId:"crm-42"}}),{decision:"LINK_EXPLICIT_ID",requiresHumanReview:false,crmContactId:"crm-42",candidateIds:[]}));
test("one exact email match is only suggested",()=>{const x=evaluateCustomerMatch({input:{email:"HOME@example.com"},candidates:[{id:7,email:"home@example.com"}]});assert.equal(x.decision,"SUGGEST_EXISTING_REVIEW");assert.equal(x.requiresHumanReview,true);});
test("multiple phone matches require manual review",()=>{const x=evaluateCustomerMatch({input:{phone:"0412 345 678"},candidates:[{id:1,phone:"+61 412 345 678"},{id:2,phone:"0412345678"}]});assert.equal(x.decision,"AMBIGUOUS_MANUAL_REVIEW");});
