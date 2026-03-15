/**
 * Quote description template for CRM -> ServiceM8 quote creation.
 * Template: Quote for: {{account_name}} | Requested work: {{opportunity_summary}} | Site address: {{site_address}}
 */

function buildQuoteDescription(ctx) {
  const accountName = (ctx.account_name || '').trim() || 'Client';
  const summary = (ctx.opportunity_summary || ctx.description || '').trim() || 'As discussed';
  const siteAddress = (ctx.site_address || '').trim() || 'See job address';
  const parts = [
    'Quote for: ' + accountName,
    'Requested work: ' + summary,
    'Site address: ' + siteAddress,
  ];
  return parts.join('\n\n').slice(0, 2000);
}

module.exports = { buildQuoteDescription };
