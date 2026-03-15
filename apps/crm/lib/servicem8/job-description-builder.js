/**
 * Default job description for CRM -> ServiceM8 job creation.
 */

function buildDefaultJobDescription(ctx, overrideDescription) {
  if (overrideDescription && String(overrideDescription).trim()) {
    return String(overrideDescription).trim().slice(0, 2000);
  }
  const parts = [];
  const opp = ctx.opportunity || {};
  const acc = ctx.account || {};
  const contact = ctx.contact || {};
  const notes = ctx.notes || '';
  if (acc.name) parts.push('Client: ' + acc.name);
  if (contact.name) parts.push('Contact: ' + contact.name);
  if (acc.suburb) parts.push('Suburb: ' + acc.suburb);
  if (acc.address_line) parts.push('Address: ' + acc.address_line);
  if (opp.value_estimate != null && opp.value_estimate !== '') parts.push('Estimate: ' + opp.value_estimate);
  if (notes) parts.push('Notes: ' + notes);
  const base = parts.length ? parts.join(' | ') : 'Job created from CRM';
  return base.slice(0, 2000);
}

module.exports = { buildDefaultJobDescription };
