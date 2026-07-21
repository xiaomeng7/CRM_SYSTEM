const test=require("node:test");const assert=require("node:assert/strict");
const {normalizeDraftCode}=require("../../src/v2/sales-draft-service");

test("sales draft codes are stable and normalized",()=>assert.equal(normalizeDraftCode("draft-abc12345"),"DRAFT-ABC12345"));
test("sales draft codes reject unsafe identifiers",()=>assert.throws(()=>normalizeDraftCode("../../customer"),/Invalid draft code/));
