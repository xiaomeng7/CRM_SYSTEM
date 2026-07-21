const crypto = require("node:crypto");

function cleanText(value) { return String(value || "").trim(); }

function canonicalPayload({ customer = {}, quote, selectedAt = null }) {
  if (!quote || !quote.valid) throw new Error("A valid selection quote is required");
  const lines = [...quote.lines].map((line) => ({
    productCode: String(line.productCode).toUpperCase(),
    quantity: Number(line.quantity),
    unitPrice: line.unitPrice == null ? null : Number(line.unitPrice),
    lineTotal: line.lineTotal == null ? null : Number(line.lineTotal)
  })).sort((a,b)=>a.productCode.localeCompare(b.productCode));
  return {
    schemaVersion: "1.0.0",
    customer: { name:cleanText(customer.name), email:cleanText(customer.email), phone:cleanText(customer.phone), siteAddress:cleanText(customer.siteAddress) },
    selectedAt,
    currencyCode:quote.currencyCode,
    taxBasis:quote.taxBasis,
    lines,
    total:Number(quote.total)
  };
}

function buildProposalProjection(input) {
  const payload=canonicalPayload(input);
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify({...payload,selectedAt:null})).digest("hex");
  return {
    proposalId:`DRAFT-${fingerprint.slice(0,12).toUpperCase()}`,
    status:"DRAFT",
    generatedAt:new Date().toISOString(),
    selectionFingerprint:`sha256:${fingerprint}`,
    ...payload,
    commercialNotice:"Indicative selection only. Final scope, site conditions and pricing are confirmed before contract.",
    downstream:{crm:"NOT_SENT",contract:"NOT_CREATED",serviceM8:"NOT_CREATED"}
  };
}

module.exports={canonicalPayload,buildProposalProjection};
