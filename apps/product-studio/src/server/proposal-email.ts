type ProposalEmailInput={
  proposalCode:string;total:number;currencyCode:string;
  draft:{customerName:string|null;siteAddress:string|null};
  lines:{productCode:string;productName:string;quantity:number;lineTotal:number}[];
};

const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]!));
const money=(value:number,currency:string)=>new Intl.NumberFormat("en-AU",{style:"currency",currency,maximumFractionDigits:0}).format(value);

export function buildProposalEmail(proposal:ProposalEmailInput){
  const customer=proposal.draft.customerName||"there";
  const rows=proposal.lines.map(line=>`<tr><td><strong>${escapeHtml(line.productName)}</strong><br><small>${escapeHtml(line.productCode)}</small></td><td>${line.quantity}</td><td>${escapeHtml(money(line.lineTotal,proposal.currencyCode))}</td></tr>`).join("");
  return {
    subject:`Your Better Home Proposal — ${proposal.proposalCode}`,
    html:`<!doctype html><html><body style="margin:0;background:#f3f0e9;color:#272a25;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff"><tr><td style="padding:38px 42px 22px;border-top:10px solid #65755d"><div style="font-size:12px;letter-spacing:2px;color:#65755d">BETTER HOME</div><h1 style="font-family:Georgia,serif;font-weight:400;font-size:38px;margin:22px 0 10px">A quieter way to live.</h1><p style="line-height:1.6;color:#626860">Hello ${escapeHtml(customer)},</p><p style="line-height:1.6;color:#626860">Thank you for exploring Better Home. Your proposed residential living experience is summarised below.</p></td></tr><tr><td style="padding:0 42px 28px"><table width="100%" cellspacing="0" cellpadding="10" style="border-collapse:collapse;border-top:1px solid #ddd8cf">${rows}</table><div style="margin-top:24px;padding:20px;background:#f1f3ed"><span style="color:#687064">Proposal total</span><strong style="float:right;font-family:Georgia,serif;font-size:26px;color:#65755d">${escapeHtml(money(proposal.total,proposal.currencyCode))}</strong></div><p style="font-size:12px;line-height:1.6;color:#787d75;margin-top:24px">Installation address: ${escapeHtml(proposal.draft.siteAddress||"To be confirmed")}</p><p style="font-size:12px;line-height:1.6;color:#787d75">Final scope remains subject to site confirmation and the terms recorded in the formal Proposal.</p></td></tr><tr><td style="padding:24px 42px;background:#242722;color:#d8ddd4;font-family:Georgia,serif;font-style:italic">Technology should quietly support everyday life.</td></tr></table></td></tr></table></body></html>`
  };
}
