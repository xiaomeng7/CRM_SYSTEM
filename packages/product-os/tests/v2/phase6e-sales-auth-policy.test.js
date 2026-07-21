const test=require("node:test");const assert=require("node:assert/strict");
const {normalizeActor,can,assertCan,canAccessDraft}=require("../../src/v2/sales-auth-policy");

test("anonymous and unknown roles fail closed",()=>{assert.throws(()=>normalizeActor({}),/actor required/);assert.throws(()=>normalizeActor({userId:"u1",role:"OWNER"}),/actor required/);});
test("sales can write own draft but cannot approve",()=>{const a={userId:"u1",role:"SALES"};assert.equal(canAccessDraft(a,"u1","WRITE"),true);assert.equal(canAccessDraft(a,"u2","WRITE"),false);assert.equal(can(a,"PROPOSAL_APPROVE"),false);});
test("manager can approve but cannot send",()=>{const a={userId:"u2",role:"MANAGER"};assert.equal(can(a,"PROPOSAL_APPROVE"),true);assert.equal(can(a,"PROPOSAL_SEND"),false);});
test("admin can send and administer users",()=>{const a={userId:"u3",role:"ADMIN"};assert.doesNotThrow(()=>assertCan(a,"PROPOSAL_SEND"));assert.equal(can(a,"USER_ADMIN"),true);});
